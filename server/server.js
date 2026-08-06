// Crownhold server — authoritative state, accounts, leaderboard.
//
// It imports the SAME rules the browser runs (src/logic.js, src/world.js,
// src/actions.js), so the server can never disagree with the client about what
// an action does. State is stored per account and fast-forwarded on demand:
// this genre ticks slowly, so there is no game loop here — a request arrives,
// the hold catches up to the present, the action applies, the state is saved.
//
//   npm run server              → http://localhost:8787 (serves dist/ too)
//   PORT=9000 npm run server
//
// Storage is a JSON file (server/data/accounts.json). Swap for Postgres when
// player counts justify it; the shape is already row-per-account.

import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { join, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

import { tick, armyPower, armyBreakdown, tierPower, gainRes, masteryLvl, upkeepPerSec, gainValor, gainMastery, pushLog,
         takeCasualties, capFor } from '../src/logic.js';
import { SEASON_MS as DEFAULT_SEASON_MS, SEASON_EPOCH, SEASON_ARCS,
         seasonNo as defSeasonNo, seasonEndsIn as defSeasonEndsIn } from '../src/defs.js';
import { tickWorld, fitColumn, marchPower, marchSpeed, bestLeaders } from '../src/world.js';
import { freshState, applyOffline, migrate } from '../src/state.js';
import { applyAction, isGameAction } from '../src/actions.js';
import { resolveRaid, inBracket, raidShielded, defenceOf, unlootable,
         RAID_TRAVEL_MS, RAID_COOLDOWN_MS, RAID_GRACE_MS, LOOTABLE } from '../src/raid.js';
import { TASKS as MUSTER_TASKS, WEIGHTS as MUSTER_WEIGHTS, weightOf, taskNeed, rollTask,
         taskProgress, musterPeriod, musterEndsIn, musterReward, divisionOf,
         MUSTER_MIN_MEMBERS, REROLL_MS } from '../src/muster.js';
import {
  resolveArena, pickOpponents, defensePower, dominantClass,
  ARENA_CD, START_LAURELS,
} from '../src/arena.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const DIST = join(ROOT, 'dist');
/* Overridable so a test can run against a throwaway directory instead of trampling
   real accounts — and so a deployment can put the file on a mounted volume. */
const DATA_DIR = process.env.DATA_DIR || join(HERE, 'data');
const DATA_FILE = join(DATA_DIR, 'accounts.json');
const PORT = Number(process.env.PORT) || 8787;
/* Test-only endpoints. Never on by default; the verification suite sets it. */
const ALLOW_DEBUG = process.env.ALLOW_DEBUG === '1';
const MAX_BODY = 64 * 1024;

/* ── storage ── */

let db = { users: {}, alliances: {} };
if(existsSync(DATA_FILE)){
  try{ db = JSON.parse(readFileSync(DATA_FILE, 'utf8')); }
  catch(e){ console.error('could not read save file, starting empty:', e.message); }
}
if(!db.alliances) db.alliances = {};
if(!db.chat) db.chat = { state: [], alliance: {}, dm: {}, group: {} };
let dirty = false;
const markDirty = () => { dirty = true; };
function flush(){
  if(!dirty) return;
  dirty = false;
  mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  writeFileSync(tmp, JSON.stringify(db));
  renameSync(tmp, DATA_FILE);           // atomic: a crash never leaves half a file
}
setInterval(flush, 2000).unref();
for(const sig of ['SIGINT','SIGTERM']) process.on(sig, () => { flush(); process.exit(0); });

/* ── accounts ── */

const hash = (pw, salt) => scryptSync(pw, salt, 64).toString('hex');
function newToken(){ return randomBytes(24).toString('hex'); }
function userByToken(token){
  if(!token) return null;
  for(const u of Object.values(db.users)) if(u.token === token) return u;
  return null;
}
function publicState(u){ return { name: u.name, state: u.state, alliance: u.alliance || null }; }

/* ── alliances ── */

// Help is proportional on purpose: 1.5% of a day-long keep is ~20 minutes and
// feels like a gift; 1.5% of a two-minute hut is nothing, and needs to be —
// a flat minimum let two friends erase a short build entirely.
const HELP_CAP = 20;                 // so a full alliance can cut ~30% off a build
const HELP_FRACTION = 0.015;
const HELP_MIN_MS = 5000;

/* ── alliance research ──
   This is what makes Help feel like it matters. An unresearched alliance shaves
   1.5% a help; a fully-researched one shaves 3% and allows half again as many —
   so the same friends are worth twice as much, and funding the tree together is
   visibly worth doing. Members pay resources, so it costs the group, not a card. */
const ALLY_TECH = {
  fellowship: { name:'Fellowship',   max:10, fx:'+10% help value per level',       base:200000 },
  wideRoads:  { name:'Wide Roads',   max:5,  fx:'+2 helps allowed per build',      base:400000 },
  commonCause:{ name:'Common Cause', max:10, fx:'+1.5% production for every hold', base:300000 },
  warBanners: { name:'War Banners',  max:10, fx:'+1.5% troop power for every hold',base:350000 },
};
const CONTRIB = { food:1, wood:1, stone:2, iron:4, steel:30, runestone:120 };  // effort per unit
// Each gift takes a slice of your stores, so contributing is self-limiting —
// no cooldown needed, the cost is the cooldown.
const CONTRIB_SHARE = 0.08;

function allyTechLvl(a, k){ return (a.tech && a.tech[k]) || 0; }
function allyTechNeed(a, k){
  return Math.round(ALLY_TECH[k].base * Math.pow(allyTechLvl(a,k) + 1, 1.8));
}
function allyHelpFraction(a){ return HELP_FRACTION * (1 + 0.10 * allyTechLvl(a,'fellowship')); }
function allyHelpCap(a, m){
  // the alliance's Wide Roads research lifts everyone; the receiving hold's own
  // Embassy lifts only theirs — which is what an embassy is for
  return HELP_CAP + 2 * allyTechLvl(a,'wideRoads') + 2 * ((m && m.state.b.embassy) || 0);
}
function allyMemberBonus(a){
  if(!a) return null;
  return {
    production: 0.015 * allyTechLvl(a,'commonCause'),
    troopPower: 0.015 * allyTechLvl(a,'warBanners'),
  };
}
function allyTechView(a){
  return Object.entries(ALLY_TECH).map(([k,d]) => ({
    key:k, name:d.name, fx:d.fx, lvl:allyTechLvl(a,k), max:d.max,
    points:(a.points && a.points[k]) || 0, need:allyTechNeed(a,k),
    done: allyTechLvl(a,k) >= d.max,
  }));
}

/* ── the Muster Roll ──
   Lives on the alliance, not on the member, because the whole point is a shared
   board. Period is DERIVED from the clock every time it is read and never stored:
   a stored period goes stale the moment the schedule changes, which is precisely
   the bug the Rift's `open` flag had.

   Turnover is lazy, like everything else here — there is no game loop, so the Roll
   settles the moment anyone looks at it after the fortnight ends. */
function musterOf(a, now){
  const period = musterPeriod(now);
  a.muster = a.muster || { period, total: 0, board: {}, last: null };
  if(a.muster.period !== period) closeMuster(a, now, period);
  return a.muster;
}

function closeMuster(a, now, period){
  const m = a.muster;
  const scored = Object.entries(m.board).filter(([, v]) => (v.points || 0) > 0);
  const paid = [];
  for(const [name, v] of scored){
    const u = db.users[name.toLowerCase()];
    const r = musterReward(v.points, m.total, Math.max(1, a.members.length));
    if(!u || !r) continue;
    advance(u, now);
    gainValor(u.state, r.valor);
    gainMastery(u.state, r.mastery, now);
    u.state.res.steel = (u.state.res.steel || 0) + r.steel;
    pushLog(u.state, '📜 The Muster Roll closed — ' + v.points + ' points earned you '
      + r.valor + ' Valor, ' + r.mastery + ' Mastery and ' + r.steel + ' steel.', 'gold');
    paid.push({ name, points: v.points, ...r });
  }
  m.last = { period: m.period, total: m.total, division: divisionOf(m.total).name, paid: paid.length };
  a.muster = { period, total: 0, board: {}, last: m.last };
  if(paid.length) markDirty();
}

/* One offer at a time. Drawn on demand rather than pushed, so a member who has not
   logged in for a week is not sitting on a stale task from a Roll that has closed. */
function musterSeat(a, u, now){
  const m = musterOf(a, now);
  m.board[u.name] = m.board[u.name] || { points: 0, done: 0, task: null, rerollAt: 0 };
  const seat = m.board[u.name];
  if(!seat.task) seat.task = rollTask(u.state, Math.random, null);
  return seat;
}

function musterView(a, u, now){
  const m = musterOf(a, now);
  const seat = musterSeat(a, u, now);
  const p = taskProgress(u.state, seat.task);
  const d = MUSTER_TASKS[seat.task.kind] || {};
  const w = weightOf(seat.task.weight);
  const rows = Object.entries(m.board)
    .map(([name, v]) => ({ name, points: v.points || 0, done: v.done || 0 }))
    .sort((x, y) => y.points - x.points);
  return {
    open: a.members.length >= MUSTER_MIN_MEMBERS,
    needMembers: MUSTER_MIN_MEMBERS,
    period: m.period, endsIn: musterEndsIn(now),
    total: m.total, division: divisionOf(m.total),
    task: { ...seat.task, name: d.name, icon: d.icon, unit: d.unit,
            weightName: w.name, points: w.points, ...p },
    canReroll: now >= (seat.rerollAt || 0),
    rerollIn: Math.max(0, (seat.rerollAt || 0) - now),
    mine: { points: seat.points || 0, done: seat.done || 0 },
    board: rows,
    projected: musterReward(seat.points || 0, m.total, Math.max(1, a.members.length)),
    last: m.last || null,
  };
}

function allianceView(tag, now){
  const a = db.alliances[tag];
  if(!a) return null;
  const members = a.members.map(n => {
    const m = db.users[n.toLowerCase()];
    if(!m) return null;
    const builds = ['bq','bq2'].map(q => m.state[q]).filter(b => b && b.end > now).map(b => ({
      key: b.key, endsIn: b.end - now,
      helps: b.helps || 0, cap: allyHelpCap(a, m),
      helped: (b.helpers || []).length,
    }));
    return {
      name: m.name,
      townhall: m.state.b.townhall,
      power: armyPower(m.state),
      waves: m.state.wavesWon || 0,
      leader: a.leader === m.name,
      builds,
    };
  }).filter(Boolean).sort((x,y) => y.power - x.power);
  return {
    tag: a.tag, name: a.name, leader: a.leader,
    members,
    power: members.reduce((t,m) => t + m.power, 0),
    helpAvailable: members.reduce((t,m) => t + m.builds.length, 0),
    tech: allyTechView(a),
    helpPct: +(allyHelpFraction(a) * 100).toFixed(2),
    helpCap: allyHelpCap(a),
  };
}

/* ── realms ──
   Until now there was one world and everything hung off it globally. A realm is
   now a container: holds, alliances, landmarks, the state chat and the ladder all
   belong to one. New accounts join the youngest realm still taking people; when
   it fills or ages out, the next one opens. That is the mechanic Kingshot uses
   too, and it matters for fairness — a hold founded in month six should never be
   dropped into a world that has been compounding for six months.

   Realm 1 is the world that already existed, so every account predating this
   change belongs to it. */
const REALM_CAP = Number(process.env.REALM_CAP) || 60;
const REALM_MAX_AGE = Number(process.env.REALM_MAX_AGE) || 30 * 24 * 3600 * 1000;
const REALM_NAMES = ['Ashmark', 'Coldwater', 'Hallowmere', 'Duncairn', 'Saltmere',
                     'Greyfell', 'Thornhold', 'Windward', 'Blackmoor', 'Farlight'];

function realmName(n){
  const i = n - 1;
  return i < REALM_NAMES.length ? REALM_NAMES[i] : 'Reach ' + n;
}
function allRealms(){
  db.realms ||= {};
  if(!Object.keys(db.realms).length) db.realms.r1 = { id:'r1', no:1, opened: REALM_EPOCH };
  return db.realms;
}
function realmPop(id){
  return Object.values(db.users).filter(u => (u.realm || 'r1') === id).length;
}
/* Where a brand-new hold is founded. */
function assignRealm(now){
  const realms = allRealms();
  const sorted = Object.values(realms).sort((a,b) => b.no - a.no);
  const youngest = sorted[0];
  const full = realmPop(youngest.id) >= REALM_CAP;
  const aged = now - youngest.opened >= REALM_MAX_AGE;
  if(!full && !aged) return youngest.id;
  const no = youngest.no + 1, id = 'r' + no;
  realms[id] = { id, no, opened: now };
  pushMsg(db.chat.state[youngest.id] ||= [], '—',
    '🌍 A new reach opens: ' + realmName(no) + '. The frontier is wider than it was.');
  markDirty();
  return id;
}
const realmOf = u => u.realm || 'r1';
/* Every hold in a realm, and every alliance whose members live there. */
function realmUsers(id){ return Object.values(db.users).filter(u => realmOf(u) === id); }
function realmOfAlliance(tag){
  const a = db.alliances[tag];
  if(!a || !a.members.length) return 'r1';
  const m = db.users[a.members[0].toLowerCase()];
  return m ? realmOf(m) : 'r1';
}
function stateChat(id){
  db.chat.state ||= {};
  // the state channel used to be one global array — carry it into realm 1
  if(Array.isArray(db.chat.state)) db.chat.state = { r1: db.chat.state };
  return (db.chat.state[id] ||= []);
}

/* ── the realm: landmarks, banners, seasons ──
   The state-wide layer. Five landmarks sit on the map; whichever alliance holds
   one gives EVERY member a standing bonus. Taking one has two beats:
     1. Assault — members throw their army power at the garrison until it breaks.
     2. Raise the Banner — a long build on the spot, which alliance help speeds.
   That second beat is what alliance banners actually are: a claim you build
   together, which is exactly why help matters so much for them. */
/* Twelve sites, but the realm does not open them all at once: each has a wake
   day counted from the realm's own founding, so there is always something new
   coming. (Kingshot gates content the same way — by server age, not calendar.) */
const LANDMARKS = [
  { id:'sunspire',  name:'The Sunspire',    icon:'🗼', fx:'+8% production for every member',  bonus:{production:0.08}, base:2500, wake:0 },
  { id:'ironbridge',name:'Ironhold Bridge', icon:'🌉', fx:'+8% troop power for every member', bonus:{troopPower:0.08}, base:3000, wake:0 },
  { id:'watchfires',name:'The Watchfires',  icon:'🔥', fx:'+12% raid loot for every member',  bonus:{loot:0.12},       base:2000, wake:0 },
  { id:'oldmint',   name:'The Old Mint',    icon:'🪙', fx:'+15% Valor for every member',      bonus:{valor:0.15},      base:2200, wake:2 },
  { id:'quarryhead',name:'Quarryhead',      icon:'⛏️', fx:'−10% build time for every member', bonus:{buildSpeed:0.10}, base:2800, wake:4 },
  { id:'greenmarch',name:'The Green March', icon:'🌾', fx:'+10% production for every member', bonus:{production:0.10}, base:3400, wake:7 },
  { id:'blackforge',name:'The Black Forge', icon:'🔨', fx:'+10% troop power for every member',bonus:{troopPower:0.10}, base:3800, wake:10 },
  { id:'saltroad',  name:'The Salt Road',   icon:'🧂', fx:'+18% raid loot for every member',  bonus:{loot:0.18},       base:3200, wake:14 },
  { id:'highkeep',  name:'The High Keep',   icon:'🏯', fx:'−14% build time for every member', bonus:{buildSpeed:0.14}, base:4200, wake:21 },
  { id:'godsteeth', name:"The God's Teeth", icon:'⛰️', fx:'+20% Valor for every member',      bonus:{valor:0.20},      base:4600, wake:28 },
  { id:'palewater', name:'Palewater',       icon:'🌊', fx:'+12% production, +6% troop power', bonus:{production:0.12, troopPower:0.06}, base:5200, wake:35 },
  { id:'crownhall', name:'The Crown Hall',  icon:'👑', fx:'+12% troop power, +12% Valor',     bonus:{troopPower:0.12, valor:0.12},      base:6000, wake:45 },
];
const REALM_EPOCH = Date.UTC(2026, 7, 1);
const realmDay = now => Math.max(0, Math.floor((now - REALM_EPOCH) / 86400000));
const isAwake = (d, now) => realmDay(now) >= d.wake;
const wakesIn = (d, now) => Math.max(0, REALM_EPOCH + d.wake*86400000 - now);
// tunables are env-overridable so the capture flow can be tested end to end
const BANNER_MS = Number(process.env.BANNER_MS) || 30 * 60 * 1000;
const BANNER_HELP = 0.03;
const ASSAULT_CD = Number(process.env.ASSAULT_CD) || 5 * 60 * 1000;
const GARRISON_SCALE = Number(process.env.GARRISON_SCALE) || 1;
const GARRISON_REGEN = 0.02;           // share of full per minute

/* Landmark state is per realm now. The old shape was db.realm[landmarkId];
   it is carried into realm 1 so an existing world keeps its banners. */
function landmarkStore(realm){
  db.landmarks ||= {};
  if(db.realm && !db.landmarks.r1){          // migrate the single-world layout
    db.landmarks.r1 = db.realm;
    delete db.realm;
    markDirty();
  }
  return (db.landmarks[realm] ||= {});
}
function landmarkState(id, realm){
  const d = LANDMARKS.find(l => l.id === id) || RIFT_HOLDS.find(l => l.id === id);
  if(!d) return null;
  const store = landmarkStore(realm);
  return (store[id] ||= {
    id, holder:null, heldSince:0, garrison:d.base * GARRISON_SCALE, banner:null, lastTick:Date.now(),
  });
}
function maxGarrison(d, st){
  const a = st.holder && db.alliances[st.holder];
  const held = a ? a.members.reduce((t,n) => {
    const m = db.users[n.toLowerCase()];
    return t + (m ? armyPower(m.state) : 0);
  }, 0) : 0;
  return Math.round((d.base + held * 0.25) * GARRISON_SCALE);   // a strong holder is harder to dislodge
}
function tickRealm(now, realm){
  checkSeasonRollover(now);
  for(const d of LANDMARKS){
    if(!isAwake(d, now)) continue;
    const st = landmarkState(d.id, realm);
    const mins = (now - (st.lastTick || now)) / 60000;
    st.lastTick = now;
    const cap = maxGarrison(d, st);
    if(st.garrison < cap) st.garrison = Math.min(cap, st.garrison + cap * GARRISON_REGEN * mins);
    if(st.banner && now >= st.banner.end){
      st.holder = st.banner.tag;
      st.heldSince = now;
      st.garrison = maxGarrison(d, st);
      const a = db.alliances[st.banner.tag];
      if(a) pushMsg(stateChat(realm), '—', '🚩 ' + a.name + ' raises its banner over ' + d.name + '.');
      st.banner = null;
      markDirty();
    }
  }
}
function realmBonusFor(tag, now = Date.now()){
  const b = {};
  if(!tag) return b;
  const realm = realmOfAlliance(tag);
  for(const d of LANDMARKS){
    if(!isAwake(d, now)) continue;
    const st = landmarkState(d.id, realm);
    if(st.holder !== tag) continue;
    for(const [k,v] of Object.entries(d.bonus)) b[k] = (b[k] || 0) + v;
  }
  return b;
}
/* The map a realm actually sees: its own landmarks, plus the contested Rift
   Holds while a Rift is open. */
function realmView(now, realm, withRift){
  tickRealm(now, realm);
  const sites = withRift ? LANDMARKS.concat(RIFT_HOLDS) : LANDMARKS;
  return sites.map(d => {
    const st = landmarkState(d.id, realm);
    const a = st.holder && db.alliances[st.holder];
    return {
      id:d.id, name:d.name, icon:d.icon, fx:d.fx,
      awake: isAwake(d, now), wake: d.wake, wakesIn: wakesIn(d, now),
      holder: a ? { tag:a.tag, name:a.name } : null,
      garrison: Math.round(st.garrison), max: maxGarrison(d, st),
      banner: st.banner ? { tag: st.banner.tag, endsIn: Math.max(0, st.banner.end - now), helps: st.banner.helps || 0 } : null,
      rift: !!d.rift,
    };
  });
}

/* ── the Hollow King: the alliance boss ──
   The event type these games are actually loved for. A great beast walks out of
   the fog on a schedule; the whole alliance piles onto it; damage is ranked but
   EVERY member who lands a blow shares the kill. It is cooperative by
   construction — you cannot buy a bigger hit, and one whale cannot solo it away
   from the group, because its health scales with the alliance that faces it. */
const BOSS_EVERY = Number(process.env.BOSS_EVERY) || 4 * 3600 * 1000;
const BOSS_WINDOW = Number(process.env.BOSS_WINDOW) || 45 * 60 * 1000;
const BOSS_CD = Number(process.env.BOSS_CD) || 3 * 60 * 1000;
const BOSS_NAMES = [
  { name:'The Hollow King', icon:'💀' },
  { name:'Gravemaw',        icon:'🐗' },
  { name:'The Ashen Stag',  icon:'🦌' },
  { name:'Old Winter',      icon:'🐻' },
];

function bossFor(tag, now){
  if(!tag) return null;
  const a = db.alliances[tag];
  if(!a) return null;
  db.boss ||= {};
  const cycle = Math.floor(now / BOSS_EVERY);
  const open = (now % BOSS_EVERY) < BOSS_WINDOW;
  let b = db.boss[tag];
  if(!b || b.cycle !== cycle){
    const power = a.members.reduce((t,n) => {
      const m = db.users[n.toLowerCase()];
      return t + (m ? armyPower(m.state) : 0);
    }, 0);
    const pick = BOSS_NAMES[cycle % BOSS_NAMES.length];
    b = db.boss[tag] = {
      cycle, ...pick,
      // scales BOTH ways: a great alliance faces a great beast, two friends
      // face something they can actually bring down
      hp: Math.max(300, Math.round(power * 3.5)),
      maxHp: Math.max(300, Math.round(power * 3.5)),
      damage: {}, slain: false, slainAt: 0,
    };
    markDirty();
  }
  return { ...b, open, opensIn: open ? 0 : BOSS_EVERY - (now % BOSS_EVERY),
           closesIn: open ? BOSS_WINDOW - (now % BOSS_EVERY) : 0 };
}

/* ── the Rift: realm against realm ──
   Kingshot's Kingdom-vs-Kingdom, with the farming removed. Every other season a
   pair of realms is opened to each other for a week. During a Rift:

     · the Arena pool includes the paired realm, and beating one of their holds
       scores a point for yours;
     · three neutral Rift Holds appear that alliances from EITHER realm can take
       and hold, scoring continuously;
     · breaking a Great Host scores.

   What is deliberately absent: nothing is ever taken. No resources, no buildings,
   no troops, no occupation. A Rift is a scoreboard, not a conquest — because the
   moment a realm can be farmed, the biggest wallet in it decides who plays.
   The winning realm gets a standing bonus for the following season and a title;
   the losing realm keeps everything it built. */
const RIFT_EVERY = Number(process.env.RIFT_EVERY) || 2;      // seasons between Rifts
const RIFT_DAYS = Number(process.env.RIFT_DAYS) || 7;
const RIFT_HOLD_TICK = 60000;                                // score per minute held
const RIFT_HOLDS = [
  { id:'rift-bridge', name:'The Sundered Bridge', icon:'🌉', fx:'contested ground', base:6000, wake:0, rift:true },
  { id:'rift-cairn',  name:'The Broken Cairn',    icon:'🪨', fx:'contested ground', base:6000, wake:0, rift:true },
  { id:'rift-gate',   name:'The Hollow Gate',     icon:'🚪', fx:'contested ground', base:9000, wake:0, rift:true },
];
const RIFT_POINTS = { arena: 30, host: 120, hold: 4 };

function riftSeason(now){ return defSeasonNo(now) % RIFT_EVERY === 0; }
/* Realms pair up two at a time by age: 1↔2, 3↔4, and so on. */
function riftPartner(id){
  const realms = Object.values(allRealms()).sort((a,b) => a.no - b.no);
  const me = realms.find(r => r.id === id);
  if(!me) return null;
  const idx = realms.indexOf(me);
  const partner = idx % 2 === 0 ? realms[idx+1] : realms[idx-1];
  return partner ? partner.id : null;
}
function riftState(now){
  const no = defSeasonNo(now);
  db.rift ||= {};
  if(db.rift.season !== no){
    db.rift = { season: no, score: {}, opened: now, history: db.rift.history || [] };
    markDirty();
  }
  /* `open` is DERIVED, never stored. Snapshotting it at creation meant a season
     that should be sealed still read as open if the schedule ever changed under
     it — which is exactly what happened the first time RIFT_EVERY was retuned. */
  const open = riftSeason(now);
  const endsAt = db.rift.opened + RIFT_DAYS * 86400000;
  const live = open && now < endsAt && Object.keys(allRealms()).length > 1;
  return { ...db.rift, open, live, endsAt, endsIn: Math.max(0, endsAt - now) };
}
function riftScore(realm, kind, mult = 1, now = Date.now()){
  const r = riftState(now);
  if(!r.live) return 0;
  const pts = Math.round((RIFT_POINTS[kind] || 0) * mult);
  db.rift.score[realm] = (db.rift.score[realm] || 0) + pts;
  markDirty();
  return pts;
}
/* Held Rift Holds pay out over time rather than on capture, so holding ground
   matters more than sniping it once. Lazy, like everything else here. */
function tickRift(now){
  const r = riftState(now);
  if(!r.live) return;
  db.rift.lastTick ||= now;
  const mins = Math.floor((now - db.rift.lastTick) / RIFT_HOLD_TICK);
  if(mins <= 0) return;
  db.rift.lastTick += mins * RIFT_HOLD_TICK;
  for(const realm of Object.keys(allRealms())){
    const store = landmarkStore(realm);
    for(const d of RIFT_HOLDS){
      const st = store[d.id];
      if(st && st.holder) riftScore(realmOfAlliance(st.holder), 'hold', mins, now);
    }
  }
}
function riftView(u, now){
  const r = riftState(now);
  const mine = realmOf(u), theirs = riftPartner(mine);
  const realms = allRealms();
  return {
    live: r.live, endsIn: r.endsIn,
    season: r.season, every: RIFT_EVERY,
    nextIn: r.live ? 0 : (RIFT_EVERY - (defSeasonNo(now) % RIFT_EVERY)) % RIFT_EVERY,
    mine: { id: mine, no: realms[mine] ? realms[mine].no : 1,
            name: realmName(realms[mine] ? realms[mine].no : 1),
            score: r.score[mine] || 0, holds: realmPop(mine) },
    theirs: theirs ? { id: theirs, no: realms[theirs].no, name: realmName(realms[theirs].no),
                       score: r.score[theirs] || 0, holds: realmPop(theirs) } : null,
    points: RIFT_POINTS,
    history: (r.history || []).slice(-3).reverse(),
  };
}
/* At the close of a Rift the winner is recorded and everyone who scored is paid.
   The loser loses nothing — that is the whole point. */
function closeRift(now){
  const r = riftState(now);
  if(!r.open || now < r.endsAt || db.rift.closed) return;
  db.rift.closed = true;
  const scores = Object.entries(db.rift.score).sort((a,b) => b[1] - a[1]);
  const winner = scores[0] && scores[0][1] > 0 ? scores[0][0] : null;
  for(const realm of Object.keys(allRealms())){
    const won = realm === winner;
    for(const u of realmUsers(realm)){
      if(!won && !(db.rift.score[realm] > 0)) continue;
      gainValor(u.state, won ? 400 : 150);
      gainMastery(u.state, won ? 900 : 350, now);
      u.state.shields = Math.min((u.state.shields || 0) + (won ? 2 : 1), 9);
      if(won) u.titles = (u.titles || []).concat({ season: r.season, title:'Rift-Warden' });
      pushLog(u.state, won
        ? '🌌 The Rift closes and ' + realmName(allRealms()[realm].no) + ' stands ahead. You are named Rift-Warden.'
        : '🌌 The Rift closes. Your reach did not take it — and lost nothing it built.', 'gold');
    }
    pushMsg(stateChat(realm), '—', winner
      ? '🌌 The Rift closes. ' + realmName(allRealms()[winner].no) + ' took it.'
      : '🌌 The Rift closes with nothing decided.');
  }
  db.rift.history = (db.rift.history || []).concat({
    season: r.season, winner, scores: Object.fromEntries(scores),
  }).slice(-12);
  markDirty();
}

/* ── rallies: the Great Hosts ──
   The alliance boss is an ASYNCHRONOUS pile-on — everyone strikes when they can
   and damage accumulates. A rally is the other thing entirely, and the thing
   this genre is actually social for: one member calls it, a muster window opens,
   others commit real columns, and it launches as a single combined attack.
   "Rally in five minutes" is the sentence that makes an alliance a team rather
   than a help button.

   The target is a Great Host — the Unpaid mustering in force, far past what one
   hold can meet. It is deliberately PvE: rallying players would make farming
   organised, and nothing in Crownhold is allowed to do that. Troops committed to
   a rally leave home and cannot defend, which is the whole cost; they come back
   wounded rather than dead, as everywhere else in the PvE game. */
const MUSTER_MS = Number(process.env.MUSTER_MS) || 5 * 60 * 1000;
const RALLY_CD = Number(process.env.RALLY_CD) || 20 * 60 * 1000;
const HOSTS = [
  { id:'column',  name:'The Unpaid Column',   icon:'🏴', mult:1.8, blurb:'A wage-column three hundred strong, come to collect.' },
  { id:'outriders',name:'The Ashen Outriders', icon:'🐎', mult:2.4, blurb:'Horse off the burned country. They do not stop to parley.' },
  { id:'engines', name:'The Siege Train',     icon:'⚙️', mult:3.0, blurb:'They brought engines. Someone told them about your wall.' },
  { id:'warhost', name:'The Hallowmere Host', icon:'💀', mult:4.0, blurb:'The whole grievance, in one place, at last.' },
];
const hostById = id => HOSTS.find(h => h.id === id);

/* What a member can actually bring to a rally: one full column under their best
   three captains. NOT their whole army — a rally is fought with columns, and
   columns are capped by their leaders. Scaling the host on total army power made
   every host unreachable no matter how many people committed, which is a quiet
   way to make a whole system pointless. */
function memberColumn(m){
  const party = bestLeaders(m.state, 3);
  const want = {};
  for(const k of Object.keys(m.state.t)) want[k] = m.state.t[k];
  const fit = fitColumn(m.state, want, party);
  return marchPower(m.state, fit.troops, party);
}

/* A Great Host is priced in columns: at 1.8x to 4.0x the average member's
   column, the four tiers need roughly two to four people to answer the horn.
   The floor is applied BEFORE the multiplier so the tiers stay distinguishable
   for a young alliance instead of collapsing onto one number. */
function hostPower(tag, mult){
  const a = db.alliances[tag];
  if(!a || !a.members.length) return 0;
  const total = a.members.reduce((t,n) => {
    const m = db.users[n.toLowerCase()];
    return t + (m ? memberColumn(m) : 0);
  }, 0);
  return Math.round(Math.max(60, total / a.members.length) * mult);
}

function rallyView(tag, now){
  const r = tag && db.rallies && db.rallies[tag];
  if(!r) return null;
  const h = hostById(r.host) || HOSTS[0];
  const committed = Object.values(r.joins).reduce((t,j) => t + j.power, 0);
  return {
    host: h.id, name: h.name, icon: h.icon, blurb: h.blurb,
    caller: r.caller, power: r.power, committed,
    joins: Object.entries(r.joins).map(([name,j]) => ({ name, power: j.power, troops: j.troops })),
    launchesIn: Math.max(0, r.launchAt - now),
    resolved: !!r.resolved,
  };
}

/* Resolution is lazy, like everything else here — but it must be checked on
   EVERY request, not just rally endpoints, or a rally nobody happens to poll
   would leave its joiners' troops in limbo indefinitely. */
/* ── raids in flight ──
   Held in a single global register and settled at the top of every request, exactly as
   the rallies are. Resolving them from the attacker's advance() instead would strand a
   column whenever the attacker closed the tab — which is the bug rallies had before
   v1.25, and the reason the Watch returns from the sender's side.

   A raid resolves at its arrival time whether or not either player is looking. That is
   the whole point of an asynchronous war: your wall has to hold while you sleep, which
   is also why the Watch exists. */
function resolveRaids(now){
  db.raids = db.raids || [];
  let touched = false;
  for(const r of db.raids){
    if(r.resolved || now < r.arriveAt) continue;
    const att = db.users[String(r.from).toLowerCase()];
    const def = db.users[String(r.to).toLowerCase()];
    r.resolved = true; touched = true;
    if(!att || !def){ r.homeAt = now; continue; }     // someone deleted their account mid-flight
    advance(att, now); advance(def, now);
    att.state.name = att.name; def.state.name = def.name;
    /* Shielded between despatch and arrival: the column turns around rather than
       punching through a Writ. Checked HERE and not only at send time, because the
       defender may have raised one in the four minutes the ride took. */
    if(raidShielded(def.state, now)){
      pushLog(att.state, '🛡️ ' + def.name + ' raised a Writ of Peace before you arrived. '
        + 'Your column turns for home with nothing.', 'loss');
      r.outcome = { won:false, refused:true, mine:0, theirs:0, loot:{}, attHurt:0 };
      continue;
    }
    const out = resolveRaid(att.state, def.state, r, now, Math.random);
    r.outcome = { won: out.won, mine: out.mine, theirs: out.theirs, loot: out.loot,
                  attHurt: out.attHurt, attDead: out.attDead, edge: out.edge,
                  defHurt: out.defHurt, watchHurt: out.watchHurt,
                  lifted: out.lifted, watchers: out.watchers };
    /* Kept on both holds, not only on the in-flight record — the register is emptied
       when the column gets home, and a battle you cannot look at afterwards may as well
       not have had a result. Each side sees it from their own side. */
    att.state.lastRaid = { at: now, against: def.name, won: out.won,
                           mine: out.mine, theirs: out.theirs, loot: out.loot,
                           hurt: out.attHurt, dead: out.attDead, edge: out.edge,
                           theirHurt: out.defHurt + out.watchHurt,
                           theirWatchers: out.watchers };
    def.state.lastDefence = { at: now, from: att.name, held: !out.won,
                              mine: out.theirs, theirs: out.mine, lost: out.loot,
                              hurt: out.defHurt + out.watchHurt,
                              theirHurt: out.attHurt, theirDead: out.attDead, edge: -out.edge,
                              lifted: out.lifted, watchers: out.watchers };
    r.troops = out.survivors;
    r.hurt = out.attHurt;
  }
  /* Homecoming: the survivors, the wounded into the attacker's own infirmary, and the
     loot — which arrives WITH the column rather than at the moment of victory, because
     it has to be carried. */
  db.raids = (db.raids || []).filter(r => {
    if(!r.resolved || now < r.homeAt) return true;
    const att = db.users[String(r.from).toLowerCase()];
    if(att){
      advance(att, now);
      const st = att.state;
      for(const [k, n] of Object.entries(r.troops || {})) if(n > 0) st.t[k] = (st.t[k] || 0) + n;
      if(r.hurt){
        st.wounded = st.wounded || {};
        const kinds = Object.keys(r.troops || {}).filter(k => (r.troops[k] || 0) > 0);
        const per = kinds.length ? Math.floor(r.hurt / kinds.length) : 0;
        for(const k of kinds) st.wounded[k] = (st.wounded[k] || 0) + per;
      }
      const loot = (r.outcome && r.outcome.loot) || {};
      for(const [res, v] of Object.entries(loot)) gainRes(st, res, v);
      pushLog(st, '🚩 Your column is home from ' + r.to
        + (Object.keys(loot).length ? ' with ' + Object.entries(loot).map(([x, v]) => v + ' ' + x).join(', ') : '')
        + '.', Object.keys(loot).length ? 'win' : '');
    }
    touched = true;
    return false;
  });
  if(touched) markDirty();
}

function resolveRallies(now){
  if(!db.rallies) return;
  for(const [tag, r] of Object.entries(db.rallies)){
    if(r.resolved || now < r.launchAt) continue;
    const h = hostById(r.host) || HOSTS[0];
    const joins = Object.entries(r.joins);
    const committed = joins.reduce((t,[,j]) => t + j.power, 0);
    const won = committed >= r.power;
    const total = committed || 1;
    for(const [name, j] of joins){
      const m = db.users[name.toLowerCase()];
      if(!m) continue;
      // the column comes home; a host wounds, it does not kill
      const lossFrac = won ? 0.10 : 0.28;
      let hurt = 0;
      for(const [k,n] of Object.entries(j.troops)){
        const l = Math.round(n * lossFrac);
        m.state.t[k] = (m.state.t[k] || 0) + n;
        const res = takeCasualties(m.state, k, l, true);
        hurt += res.hurt + res.dead;
      }
      const share = j.power / total;
      if(won){
        gainValor(m.state, Math.round(60 + 240 * share));
        gainMastery(m.state, Math.round(180 + 450 * share), now);
        m.state.shields = Math.min((m.state.shields || 0) + 1, 9);
        for(const [res, amt] of Object.entries({ food:1400, wood:1400, stone:600, iron:300 }))
          m.state.res[res] = Math.min((m.state.res[res] || 0) + Math.round(amt * (0.4 + share)), capFor(m.state, res));
        pushLog(m.state, h.icon+' '+h.name+' is broken by the rally — '+Math.round(share*100)
          +'% of the muster was yours.'+(hurt?' '+hurt+' came back wounded.':''), 'gold');
      }else{
        gainValor(m.state, 12);
        gainMastery(m.state, 40, now);
        pushLog(m.state, h.icon+' The rally on '+h.name+' fell short ('+fmtNum(committed)+' against '
          +fmtNum(r.power)+'). Your column is home.'+(hurt?' '+hurt+' wounded.':''), 'loss');
      }
      m.state.rallyReady = now + RALLY_CD;
    }
    const a = db.alliances[tag];
    pushMsg(db.chat.alliance[tag] ||= [], '—', won
      ? h.icon+' '+h.name+' is down. '+joins.length+' answered the horn.'
      : h.icon+' The rally on '+h.name+' fell short — '+fmtNum(committed)+' of '+fmtNum(r.power)+' needed.');
    if(won){
      const realm = realmOfAlliance(tag);
      pushMsg(stateChat(realm), '—', h.icon+' '+(a?a.name:tag)+' broke '+h.name+'.');
      const pts = riftScore(realm, 'host', h.mult / 1.8, now);
      if(pts) pushMsg(stateChat(realm), '—', '🌌 +'+pts+' to the Rift.');
    }
    delete db.rallies[tag];
    markDirty();
  }
}
const fmtNum = n => n >= 10000 ? (n/1000).toFixed(1)+'k' : String(Math.round(n));
const humanMs = ms => ms >= 60000 ? Math.round(ms/60000)+'m' : Math.round(ms/1000)+'s';

/* ── seasons ──
   A fortnight. At rollover the standings are frozen, titles are handed out, and
   Laurels drift halfway back to 1000 — a soft reset, so a season's champion
   starts the next one ahead but not untouchable, and nobody is ever locked out
   of climbing. Nothing here is purchasable.

   The clock itself lives in src/defs.js, because the hero pool reads it too:
   each season opens four more heroes to the draft, and client and server must
   never disagree about which ones have arrived. */
const SEASON_MS = Number(process.env.SEASON_MS) || DEFAULT_SEASON_MS;
const seasonNo = now => SEASON_MS === DEFAULT_SEASON_MS ? defSeasonNo(now)
  : Math.max(1, Math.floor((now - SEASON_EPOCH) / SEASON_MS) + 1);
const seasonEndsIn = now => SEASON_MS === DEFAULT_SEASON_MS ? defSeasonEndsIn(now)
  : SEASON_MS - ((now - SEASON_EPOCH) % SEASON_MS);

const SEASON_TITLES = ['Sovereign of the Realm', 'Warden of the Realm', 'Bannerlord'];

function checkSeasonRollover(now){
  const no = seasonNo(now);
  db.season ||= { no, history: [] };
  if(db.season.no === no) return;

  // freeze the standings the season ended on
  const holds = Object.values(db.users)
    .map(u => ({ name:u.name, laurels:u.state.laurels ?? START_LAURELS, waves:u.state.wavesWon||0 }))
    .sort((a,b) => b.laurels - a.laurels);
  const allies = Object.values(db.alliances).map(a => ({
    tag:a.tag, name:a.name,
    holds: LANDMARKS.filter(d => (db.realm?.[d.id]||{}).holder === a.tag).length,
  })).sort((x,y) => y.holds - x.holds);

  holds.slice(0, 3).forEach((r, i) => {
    const u = db.users[r.name.toLowerCase()];
    if(!u) return;
    u.titles = (u.titles || []).concat({ season: db.season.no, title: SEASON_TITLES[i] });
    gainValor(u.state, 300 - i*80);
    gainMastery(u.state, 500 - i*120, now);
    u.state.shields = Math.min(u.state.shields + 2, 9);
    pushLog(u.state, '👑 Season ' + db.season.no + ' closes — you are named ' + SEASON_TITLES[i] + '.', 'gold');
  });
  // everyone who fought gets something; the season is not winner-take-all
  for(const u of Object.values(db.users)){
    if((u.state.arenaWins || 0) + (u.state.wavesWon || 0) < 5) continue;
    gainValor(u.state, 60);
    u.state.laurels = Math.round(1000 + ((u.state.laurels ?? START_LAURELS) - 1000) * 0.5);
    u.state.ev = null;                       // event scores start clean
  }

  db.season.history.push({
    no: db.season.no,
    champions: holds.slice(0, 3).map(r => r.name),
    banners: allies.slice(0, 3),
  });
  if(db.season.history.length > 12) db.season.history.shift();
  db.season.no = no;
  for(const rid of Object.keys(allRealms())) pushMsg(stateChat(rid), '—', '👑 Season ' + (no - 1) + ' has closed. '
    + (holds[0] ? holds[0].name + ' is named ' + SEASON_TITLES[0] + '.' : '')
    + ' Laurels drift back toward the middle; the realm begins again.');
  markDirty(); flush();
}

/* ── chat ──
   Four kinds of room: the whole state, your alliance, a direct line to one
   person, and any private group people make for themselves. Kept in memory with
   a hard cap per room; text is escaped on the way in so nothing a player types
   can ever become markup. */
const CHAT_KEEP = 120, CHAT_MAX = 300;
let chatSeq = 1;

const esc = t => String(t).replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
const dmKey = (a, b) => [a.toLowerCase(), b.toLowerCase()].sort().join('|');

function pushMsg(room, from, text){
  room.push({ id: chatSeq++, from, text: esc(text).slice(0, CHAT_MAX), at: Date.now() });
  if(room.length > CHAT_KEEP) room.splice(0, room.length - CHAT_KEEP);
  markDirty();
}
function roomFor(u, channel, target){
  if(channel === 'state') return stateChat(realmOf(u));
  if(channel === 'alliance'){
    if(!u.alliance) return null;
    return (db.chat.alliance[u.alliance] ||= []);
  }
  if(channel === 'dm'){
    const other = db.users[String(target||'').toLowerCase()];
    if(!other || other === u) return null;
    return (db.chat.dm[dmKey(u.name, other.name)] ||= []);
  }
  if(channel === 'group'){
    const g = db.chat.group[target];
    if(!g || !g.members.includes(u.name)) return null;
    return g.msgs;
  }
  return null;
}

/* ── the fast-forward: bring a hold from its last save to now ── */

/* ── the Watch ──
   A column stationed at an ally's wall. Whiteout Survival's garrison, with the rule
   that makes it worth doing: everything at the wall fights under the best captain
   present, so a strong hold standing over a weak one lifts that hold's own soldiers
   too. In WoS that is a reason to BUY power — you pay to be the umbrella. Here it can
   only ever be given.

   It returns lazily, like everything else on this server: no game loop, so the troops
   come home the first time either side is advanced after the watch ends. */
const WATCH_MS = 4 * 3600 * 1000;
const WATCH_MAX = 3;                    // how many columns one hold may host

/* Bring home anything of this hold's that is standing elsewhere and whose time is up.
   Driven from the SENDER's side because the sender is who the troops belong to — the
   host may not log in for a week, and a column should not be stranded by someone
   else's absence. That is the same mistake the rallies had before v1.25, where an
   alliance logging off mid-muster stranded everyone's troops. */
function watchReturn(u, now){
  const s = u.state;
  if(!Array.isArray(s.watching) || !s.watching.length) return 0;
  let back = 0;
  s.watching = s.watching.filter(w => {
    if(now < (w.until || 0)) return true;
    const host = db.users[String(w.to || '').toLowerCase()];
    let troops = w.troops || {}, hurt = 0;
    if(host && Array.isArray(host.state.watch)){
      const at = host.state.watch.findIndex(g => g && g.id === w.id);
      if(at >= 0){
        const g = host.state.watch[at];
        troops = g.troops || troops;
        hurt = g.hurt || 0;
        host.state.watch.splice(at, 1);
      }
    }
    for(const [k, n] of Object.entries(troops)) if(n > 0) s.t[k] = (s.t[k] || 0) + n;
    if(hurt){
      s.wounded = s.wounded || {};
      // wounds land in the OWNER's infirmary: the cost of standing over a neighbour
      // falls on whoever chose to stand there
      const share = Object.keys(troops).filter(k => troops[k] > 0);
      const per = share.length ? Math.floor(hurt / share.length) : 0;
      for(const k of share) s.wounded[k] = (s.wounded[k] || 0) + per;
    }
    pushLog(s, '🕯️ The Watch is home from ' + (w.to || 'an ally') + '.'
      + (hurt ? ' ' + hurt + ' came back wounded.' : ''), 'gold');
    back++;
    return false;
  });
  if(back) markDirty();
  return back;
}

function watchView(u, now){
  const s = u.state;
  const a = db.alliances[u.alliance];
  const here = (s.watch || []).map(g => ({
    from: g.from, troops: g.troops, count: Object.values(g.troops||{}).reduce((x,y)=>x+y,0),
    base: g.base, mult: g.mult, endsIn: Math.max(0, (g.until||0) - now),
  }));
  const bd = armyBreakdown(s);
  return {
    here, hosting: here.length, cap: WATCH_MAX,
    lifted: bd.lifted, mult: bd.mult, ownMult: bd.ownMult,
    watching: (s.watching || []).map(w => ({
      to: w.to, count: Object.values(w.troops||{}).reduce((x,y)=>x+y,0),
      endsIn: Math.max(0, (w.until||0) - now),
    })),
    windowMs: WATCH_MS,
    allies: a ? a.members.filter(n => n !== u.name).map(n => {
      const m = db.users[String(n).toLowerCase()];
      if(!m) return null;
      const mb = armyBreakdown(m.state);
      return { name: m.name, townhall: m.state.b.townhall, power: mb.total,
               hosting: (m.state.watch||[]).length, cap: WATCH_MAX,
               lifted: mb.lifted, weaker: mb.ownMult < bd.ownMult };
    }).filter(Boolean).sort((x,y) => x.power - y.power) : [],
  };
}

function advance(u, now){
  // stored holds predate every field added since they were created — run the
  // same migration the browser runs before touching anything
  const s = migrate(u.state, now);
  // alliance techs AND held landmarks reach the member through the state itself
  const techB = allyMemberBonus(db.alliances[u.alliance]) || {};
  const realmB = realmBonusFor(u.alliance);
  s.allyBonus = {};
  for(const k of new Set([...Object.keys(techB), ...Object.keys(realmB)]))
    s.allyBonus[k] = (techB[k] || 0) + (realmB[k] || 0);
  watchReturn(u, now);
  const away = Math.min(Math.max(now - (s.lastSeen || now), 0), 7200000);
  if(away > 60000){
    applyOffline(s, away);
    if(s.nextWave < now + 5000) s.nextWave = now + 30000;  // no unattended battles
  }else if(away > 250){
    tick(s, now, away/1000);
  }
  // zero-length ticks let queues, quests, drafts and hero levels cascade
  for(let i = 0; i < 8; i++) tick(s, now, 0);
  tickWorld(s, now);
  s.lastSeen = now;
  markDirty();
}

/* ── http plumbing ── */

const hits = new Map();                                     // crude per-IP rate limit
function rateLimited(ip){
  const now = Date.now(), w = hits.get(ip);
  if(!w || now - w.start > 10000){ hits.set(ip, { start: now, n: 1 }); return false; }
  w.n++;
  return w.n > 150;
}

function send(res, code, obj){
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'cache-control': 'no-store',
  });
  res.end(body);
}

function readBody(req){
  return new Promise((resolve, reject) => {
    let n = 0; const chunks = [];
    req.on('data', c => {
      n += c.length;
      if(n > MAX_BODY){ reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if(!chunks.length) return resolve({});
      try{ resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch(e){ reject(new Error('bad json')); }
    });
    req.on('error', reject);
  });
}

const MIME = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml',
  '.json':'application/json', '.webmanifest':'application/manifest+json',
  '.png':'image/png', '.ico':'image/x-icon',
};
function serveStatic(req, res, urlPath){
  let rel = normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, '');
  if(rel === '/' || rel === '\\' || rel === '') rel = '/index.html';
  const file = join(DIST, rel);
  if(!file.startsWith(DIST) || !existsSync(file) || !statSync(file).isFile()){
    res.writeHead(404, {'content-type':'text/plain'});
    res.end(existsSync(DIST) ? 'not found' : 'run `npm run build` first');
    return;
  }
  /* No-cache on the document. The server sent no freshness headers at all, so browsers
     applied their own heuristic and happily served a stale index.html — which meant
     testing a fresh build against localhost showed the previous one, with no way to tell.
     Assets keep a short cache; the HTML carries the whole game, so it must revalidate. */
  const ext = extname(file);
  res.writeHead(200, {
    'content-type': MIME[ext] || 'application/octet-stream',
    'cache-control': ext === '.html' ? 'no-cache, must-revalidate' : 'max-age=60',
  });
  res.end(readFileSync(file));
}

/* ── api ── */

async function api(req, res, url){
  const path = url.pathname;
  const now = Date.now();

  /* Rallies resolve here, on EVERY request, rather than in the rally endpoints.
     A rally holds real troops out of their owners' holds, so if resolution only
     ran when someone happened to poll the rally, an alliance that all logged off
     mid-muster would leave those columns stranded indefinitely. The Rift's
     hold-scoring and its closing are lazy for the same reason. */
  resolveRaids(now);
  resolveRallies(now);
  tickRift(now);
  closeRift(now);

  if(path === '/api/health') return send(res, 200, { ok:true, players:Object.keys(db.users).length });

  if(path === '/api/leaderboard'){
    /* A ladder belongs to its realm; comparing worlds of different ages is noise.
       This handler runs before the POST body is read (it answers GETs too), so
       the token comes off the query string — reading `body` here would have
       thrown on every leaderboard request. */
    const who = userByToken(url.searchParams.get('token'));
    const scope = who ? realmOf(who) : null;
    const rows = Object.values(db.users).filter(x => !scope || realmOf(x) === scope).map(u => ({
      name: u.name,
      wavesWon: u.state.wavesWon || 0,
      power: armyPower(u.state),
      townhall: u.state.b.townhall,
      mastery: masteryLvl(u.state),
      warbands: u.state.warbandsWon || 0,
      laurels: u.state.laurels ?? START_LAURELS,
      arena: (u.state.arenaWins||0) + '–' + (u.state.arenaLosses||0),
    })).sort((a,b) => b.laurels - a.laurels || b.wavesWon - a.wavesWon).slice(0, 25);
    return send(res, 200, { rows });
  }

  if(req.method !== 'POST') return send(res, 405, { error:'use POST' });
  const body = await readBody(req);

  if(path === '/api/register' || path === '/api/login'){
    const name = String(body.name || '').trim().slice(0, 20);
    const pw = String(body.password || '');
    if(!/^[\w '-]{3,20}$/.test(name)) return send(res, 400, { error:'Name must be 3–20 letters, numbers, spaces or dashes.' });
    if(pw.length < 6) return send(res, 400, { error:'Password must be at least 6 characters.' });
    const key = name.toLowerCase();

    if(path === '/api/register'){
      if(db.users[key]) return send(res, 409, { error:'That name is taken.' });
      const salt = randomBytes(16).toString('hex');
      const u = {
        name, salt, hash: hash(pw, salt), token: newToken(),
        state: freshState(now), created: now, alliance: null,
        realm: assignRealm(now),
      };
      u.state.seenIntro = true;
      db.users[key] = u; markDirty(); flush();
      return send(res, 200, { token: u.token, ...publicState(u) });
    }

    const u = db.users[key];
    if(!u) return send(res, 401, { error:'No such hold.' });
    const a = Buffer.from(hash(pw, u.salt), 'hex'), b = Buffer.from(u.hash, 'hex');
    if(a.length !== b.length || !timingSafeEqual(a, b)) return send(res, 401, { error:'Wrong password.' });
    u.token = newToken(); markDirty();
    advance(u, now);
    return send(res, 200, { token: u.token, ...publicState(u) });
  }

  // everything below needs a session
  const u = userByToken(body.token);
  if(!u) return send(res, 401, { error:'Session expired — sign in again.' });

  if(path === '/api/state'){ advance(u, now); return send(res, 200, publicState(u)); }

  if(path === '/api/action'){
    const name = String(body.action || '');
    if(!isGameAction(name)) return send(res, 400, { error:'Unknown action.' });
    advance(u, now);
    const ok = applyAction(u.state, name, body.params || {}, now);
    markDirty();
    return send(res, 200, { ok, ...publicState(u) });
  }

  /* ── the arena ── */

  if(path === '/api/arena/list'){
    advance(u, now);
    const key = u.name.toLowerCase();
    /* The ladder is your realm's. During a Rift the paired realm joins the pool
       — that is what makes a Rift felt rather than announced. */
    const mineRealm = realmOf(u);
    const rift = riftView(u, now);
    const across = rift.live && rift.theirs ? rift.theirs.id : null;
    const pool = Object.entries(db.users)
      .filter(([k,o]) => k !== key && (realmOf(o) === mineRealm || realmOf(o) === across))
      .map(([k,o]) => ({
        key: k, name: o.name,
        power: defensePower(o.state),
        laurels: o.state.laurels ?? START_LAURELS,
        townhall: o.state.b.townhall,
        dominant: dominantClass(o.state),
        defStance: o.state.defStance || 'shieldwall',
        across: realmOf(o) === across,
      }));
    return send(res, 200, {
      opponents: pickOpponents(u.state, pool),
      me: {
        laurels: u.state.laurels ?? START_LAURELS,
        power: defensePower(u.state),
        wins: u.state.arenaWins || 0,
        losses: u.state.arenaLosses || 0,
        readyIn: Math.max(0, (u.state.arenaReady || 0) - now),
      },
    });
  }

  if(path === '/api/arena/attack'){
    advance(u, now);
    if((u.state.arenaReady || 0) > now)
      return send(res, 429, { error: 'Your marshals are still regrouping.' });
    const target = db.users[String(body.target || '').toLowerCase()];
    if(!target || target === u) return send(res, 404, { error: 'No such hold.' });
    // you may only reach across realms while the Rift is open
    const rift = riftView(u, now);
    const sameRealm = realmOf(target) === realmOf(u);
    const across = rift.live && rift.theirs && realmOf(target) === rift.theirs.id;
    if(!sameRealm && !across)
      return send(res, 400, { error:'That hold is in another reach. Only an open Rift bridges them.' });
    advance(target, now);
    // the bracket is enforced here, not just offered in the list
    const mine = defensePower(u.state), theirs = defensePower(target.state);
    if(theirs > mine * 2.2 || theirs < mine * 0.3)
      return send(res, 400, { error: 'That hold is outside your bracket.' });

    u.state.name = u.name; target.state.name = target.name;   // for battle reports
    const report = resolveArena(u.state, target.state, { stance: body.stance, frac: body.frac }, now);
    if(report.error) return send(res, 400, { error: report.error });
    // a win across the Rift scores for your reach; nothing is ever taken
    if(across && report.won){
      report.riftPoints = riftScore(realmOf(u), 'arena', 1, now);
      pushMsg(stateChat(realmOf(u)), '—',
        '🌌 '+u.name+' broke '+target.name+' across the Rift (+'+report.riftPoints+').');
    }
    markDirty(); flush();
    return send(res, 200, { report, ...publicState(u) });
  }

  /* ── alliances ──
     The Help mechanic is the point: in Kingshot you buy speedups, here your
     alliance is your speedup. Every help is free, comes from a person, and is
     capped per build so a big alliance is an advantage, not an exploit. */

  if(path === '/api/alliance/create'){
    const name = String(body.name || '').trim().slice(0, 24);
    const tag = String(body.tag || '').trim().toUpperCase().slice(0, 4);
    if(!/^[\w '-]{3,24}$/.test(name)) return send(res, 400, { error:'Name must be 3–24 characters.' });
    if(!/^[A-Z0-9]{2,4}$/.test(tag)) return send(res, 400, { error:'Tag must be 2–4 letters or digits.' });
    if(u.alliance) return send(res, 400, { error:'Leave your current alliance first.' });
    if(db.alliances[tag]) return send(res, 409, { error:'That tag is taken.' });
    db.alliances[tag] = { name, tag, leader: u.name, members: [u.name], created: now };
    u.alliance = tag; markDirty(); flush();
    return send(res, 200, { alliance: allianceView(tag, now) });
  }

  if(path === '/api/alliance/join'){
    const tag = String(body.tag || '').trim().toUpperCase();
    const a = db.alliances[tag];
    if(!a) return send(res, 404, { error:'No alliance with that tag.' });
    if(u.alliance === tag) return send(res, 200, { alliance: allianceView(tag, now) });
    if(u.alliance) return send(res, 400, { error:'Leave your current alliance first.' });
    if(a.members.length >= 30) return send(res, 400, { error:'That alliance is full (30).' });
    a.members.push(u.name); u.alliance = tag; markDirty(); flush();
    return send(res, 200, { alliance: allianceView(tag, now) });
  }

  if(path === '/api/alliance/leave'){
    const a = db.alliances[u.alliance];
    if(a){
      a.members = a.members.filter(n => n !== u.name);
      if(!a.members.length) delete db.alliances[u.alliance];
      else if(a.leader === u.name) a.leader = a.members[0];
    }
    u.alliance = null; markDirty(); flush();
    return send(res, 200, { alliance: null });
  }

  if(path === '/api/alliance/info'){
    advance(u, now);
    return send(res, 200, {
      alliance: u.alliance ? allianceView(u.alliance, now) : null,
      directory: Object.values(db.alliances)
        .map(a => ({ tag:a.tag, name:a.name, members:a.members.length }))
        .sort((x,y) => y.members - x.members).slice(0, 20),
    });
  }

  if(path === '/api/alliance/contribute'){
    const a = db.alliances[u.alliance];
    if(!a) return send(res, 400, { error:'You are in no alliance.' });
    const k = String(body.tech || '');
    if(!ALLY_TECH[k]) return send(res, 400, { error:'No such research.' });
    if(allyTechLvl(a,k) >= ALLY_TECH[k].max) return send(res, 400, { error:'Already fully researched.' });
    advance(u, now);
    // a contribution is a slice of whatever the member can spare, as effort
    let effort = 0;
    for(const [r, per] of Object.entries(CONTRIB)){
      const give = Math.floor((u.state.res[r] || 0) * CONTRIB_SHARE);
      if(give <= 0) continue;
      u.state.res[r] -= give;
      effort += give * per;
    }
    if(effort <= 0) return send(res, 400, { error:'Your stores are empty — nothing to give.' });
    a.points = a.points || {}; a.tech = a.tech || {};
    a.points[k] = (a.points[k] || 0) + effort;
    let levelled = 0;
    while(allyTechLvl(a,k) < ALLY_TECH[k].max && a.points[k] >= allyTechNeed(a,k)){
      a.points[k] -= allyTechNeed(a,k);
      a.tech[k] = allyTechLvl(a,k) + 1;
      levelled++;
    }
    // the giver is repaid in the currencies that cannot be bought
    gainValor(u.state, Math.min(40, Math.round(effort / 200)));
    gainMastery(u.state, Math.min(120, Math.round(effort / 80)), now);
    markDirty(); flush();
    return send(res, 200, { effort, levelled, alliance: allianceView(u.alliance, now) });
  }

  if(path === '/api/alliance/help'){
    const a = db.alliances[u.alliance];
    if(!a) return send(res, 400, { error:'You are in no alliance.' });
    const targets = body.target ? [String(body.target)] : a.members;
    let helped = 0;
    for(const nameRaw of targets){
      const key = String(nameRaw).toLowerCase();
      const m = db.users[key];
      if(!m || m === u || m.alliance !== u.alliance) continue;
      advance(m, now);
      for(const q of ['bq','bq2']){
        const b = m.state[q];
        if(!b || b.end <= now) continue;
        b.helps = b.helps || 0;
        if(b.helps >= allyHelpCap(a, m)) continue;
        if((b.helpers||[]).includes(u.name)) continue;   // one help per hold per build
        const total = Math.max(1, b.end - b.start);
        b.end = Math.max(now, b.end - Math.max(HELP_MIN_MS, total * allyHelpFraction(a)));
        b.helps++;
        b.helpers = (b.helpers || []).concat(u.name);
        helped++;
      }
    }
    if(helped) markDirty();
    return send(res, 200, { helped, alliance: allianceView(u.alliance, now) });
  }

  /* ── raids: hold against hold ── */

  if(path === '/api/raid'){
    advance(u, now);
    const mine = defenceOf(u.state).total;
    const key = u.name.toLowerCase();
    const mineRealm = realmOf(u);
    /* Bracketed by defensive power on the SAME rule the arena uses, and only inside
       your own reach — a maxed hold cannot farm a beginner, and cannot reach across
       realms for one either. */
    const targets = Object.entries(db.users)
      .filter(([k, o]) => k !== key && realmOf(o) === mineRealm)
      .map(([, o]) => {
        const d = defenceOf(o.state);
        return {
          name: o.name, townhall: o.state.b.townhall, power: d.total,
          watchers: d.watchers, lifted: d.lifted,
          shielded: raidShielded(o.state, now),
          ally: !!(u.alliance && o.alliance === u.alliance),
          inBracket: inBracket(mine, d.total),
        };
      })
      .filter(t => t.inBracket && !t.ally)
      .sort((a, b) => b.power - a.power)
      .slice(0, 20);
    return send(res, 200, { raid: {
      me: { power: mine, cooldownIn: Math.max(0, (u.state.raidReady || 0) - now),
            graceIn: Math.max(0, (u.state.graceUntil || 0) - now),
            shieldIn: Math.max(0, (u.state.shieldUntil || 0) - now) },
      targets,
      outgoing: (db.raids || []).filter(r => r.from === u.name).map(r => ({
        to: r.to, resolved: !!r.resolved,
        arriveIn: Math.max(0, r.arriveAt - now), homeIn: Math.max(0, r.homeAt - now),
        outcome: r.outcome || null,
      })),
      incoming: (db.raids || []).filter(r => r.to === u.name && !r.resolved).map(r => ({
        from: r.from, arriveIn: Math.max(0, r.arriveAt - now),
      })),
      lastRaid: u.state.lastRaid || null,
      lastDefence: u.state.lastDefence || null,
      travelMs: RAID_TRAVEL_MS, graceMs: RAID_GRACE_MS,
      unlootable: unlootable(), lootable: LOOTABLE,
    } });
  }

  if(path === '/api/raid/send'){
    advance(u, now);
    if((u.state.raidReady || 0) > now)
      return send(res, 429, { error:'Your marshals are still regrouping.' });
    const target = db.users[String(body.to || '').toLowerCase()];
    if(!target || target === u) return send(res, 404, { error:'No such hold.' });
    if(u.alliance && target.alliance === u.alliance)
      return send(res, 400, { error:'They are your own alliance.' });
    if(realmOf(target) !== realmOf(u))
      return send(res, 400, { error:'That hold is in another reach.' });
    advance(target, now);
    if(raidShielded(target.state, now))
      return send(res, 400, { error:'A Writ of Peace covers that hold.' });
    const mine = defenceOf(u.state).total, theirs = defenceOf(target.state).total;
    if(!inBracket(mine, theirs)) return send(res, 400, { error:'That hold is outside your bracket.' });
    if((db.raids || []).some(r => r.from === u.name && !r.resolved))
      return send(res, 400, { error:'You already have a column in the field.' });

    const party = Array.isArray(body.heroes) ? body.heroes.filter(Boolean).slice(0, 3) : [];
    const fit = fitColumn(u.state, body.troops || {}, party);
    if(!fit.total) return send(res, 400, { error:'Choose troops to send.' });
    for(const [k, n] of Object.entries(fit.troops)) u.state.t[k] -= n;

    /* Base and multiplier are fixed at despatch, as the Watch's are, and for the same
       reason: the column must not weaken in transit because its owner sent their heroes
       somewhere else afterwards. */
    const bd = armyBreakdown(u.state);
    let base = 0;
    for(const [k, n] of Object.entries(fit.troops)) base += tierPower(u.state, k) * n;
    const travel = Math.round(RAID_TRAVEL_MS * marchSpeed(u.state));
    db.raids = db.raids || [];
    db.raids.push({
      id: randomBytes(6).toString('hex'), from: u.name, to: target.name,
      troops: { ...fit.troops }, base: Math.round(base), mult: bd.ownMult,
      arriveAt: now + travel, homeAt: now + travel * 2, resolved: false, outcome: null,
    });
    u.state.raidReady = now + RAID_COOLDOWN_MS;
    pushLog(u.state, '⚔️ ' + fit.total + ' ride against ' + target.name + '.', 'gold');
    pushLog(target.state, '🔭 Scouts: a column of ' + fit.total 
      + ' has been seen on the road, under ' + u.name + '\'s banner.', 'loss');
    markDirty(); flush();
    return send(res, 200, { ...publicState(u) });
  }

  /* ── test hooks ──
     OFF unless ALLOW_DEBUG=1 is set in the environment, so a deployed server never
     exposes them. The verification suite needs to move a counter and kit a hold;
     doing either through normal play would take hours of simulated time, and a
     multiplayer feature that is only tested by hand is a multiplayer feature that is
     not tested. */
  if(ALLOW_DEBUG && path === '/api/debug/bump'){
    const field = String(body.field || '');
    if(!Object.prototype.hasOwnProperty.call(u.state, field))
      return send(res, 400, { error:'No such field: ' + field });
    if(typeof u.state[field] !== 'number')
      return send(res, 400, { error:'Not a counter: ' + field });
    advance(u, now);
    u.state[field] += Number(body.by) || 0;
    markDirty();
    return send(res, 200, { field, value: u.state[field] });
  }
  if(ALLOW_DEBUG && path === '/api/debug/warp'){
    /* Rewinds every timestamp the raid layer reads, which is the same thing as moving
       the clock forward without actually waiting four minutes per assertion. */
    const ms = Math.max(0, Number(body.ms) || 0);
    for(const r of (db.raids || [])){ r.arriveAt -= ms; r.homeAt -= ms; }
    for(const o of Object.values(db.users)){
      o.state.lastSeen = (o.state.lastSeen || now) - ms;
      if(o.state.raidReady) o.state.raidReady -= ms;
    }
    resolveRaids(now);
    markDirty();
    return send(res, 200, { warped: ms });
  }
  if(ALLOW_DEBUG && path === '/api/debug/kit'){
    advance(u, now);
    const st = u.state;
    st.b.townhall = body.strong ? 20 : 8;
    st.b.barracks = body.strong ? 12 : 5;
    st.b.wall = body.strong ? 12 : 4;
    st.b.academy = body.strong ? 9 : 2;
    st.t = { spearman: Number(body.spearmen) || (body.strong ? 400 : 60), archer: 0, knight: 0, ballista: 0 };
    st.tier = body.strong ? { spearman:5, archer:1, knight:1, ballista:1 }
                          : { spearman:1, archer:1, knight:1, ballista:1 };
    st.res = { food:9e5, wood:9e5, stone:9e5, iron:9e5, steel:9e5, runestone:9e5,
               rations:0, trueore:0, truegold:0 };
    // a hero or two, so the strong hold really does carry a better multiplier
    if(body.strong){
      st.heroes.marshal = { lvl:20, xp:0, stars:3, deeds:0, gear:{}, skills:[null,null,null] };
      st.heroes.exile   = { lvl:20, xp:0, stars:3, deeds:0, gear:{}, skills:[null,null,null] };
      st.heroes.drillmaster = { lvl:20, xp:0, stars:3, deeds:0, gear:{}, skills:[null,null,null] };
      st.court = ['marshal','exile','drillmaster'];
    }
    st.b.command = body.strong ? 20 : 5;
    markDirty();
    return send(res, 200, { ok:true, power: armyPower(st) });
  }

  /* ── the Watch ── */

  if(path === '/api/watch'){
    advance(u, now);
    return send(res, 200, { watch: watchView(u, now) });
  }

  if(path === '/api/watch/send'){
    const a = db.alliances[u.alliance];
    if(!a) return send(res, 400, { error:'The Watch is alliance work — join one first.' });
    const to = String(body.to || '');
    const host = db.users[to.toLowerCase()];
    if(!host || host === u) return send(res, 400, { error:'No such ally.' });
    if(host.alliance !== u.alliance) return send(res, 400, { error:'They are not in your alliance.' });
    advance(u, now); advance(host, now);
    host.state.watch = host.state.watch || [];
    if(host.state.watch.length >= WATCH_MAX)
      return send(res, 400, { error:'Their wall already holds '+WATCH_MAX+' columns.' });
    if(host.state.watch.some(g => g && g.from === u.name))
      return send(res, 400, { error:'Your Watch already stands there.' });

    /* Fitted through the same column rules a march uses, so the Watch cannot be a way
       to move more troops than your captains can command. */
    const party = Array.isArray(body.heroes) ? body.heroes.filter(Boolean).slice(0, 3) : [];
    const fit = fitColumn(u.state, body.troops || {}, party);
    if(!fit.total) return send(res, 400, { error:'Choose troops to send.' });
    for(const [k, n] of Object.entries(fit.troops)) u.state.t[k] -= n;

    /* Base and multiplier are computed by the SENDER, now. The host does not know our
       tier levels, and a garrison must not weaken later because we took our heroes out
       on a march after posting it. */
    const bd = armyBreakdown(u.state);
    let base = 0;
    for(const [k, n] of Object.entries(fit.troops)) base += tierPower(u.state, k) * n;
    const id = randomBytes(6).toString('hex');
    const entry = { id, from: u.name, troops: { ...fit.troops }, count: fit.total,
                    base: Math.round(base), mult: bd.ownMult, hurt: 0, until: now + WATCH_MS };
    host.state.watch.push(entry);
    u.state.watching = u.state.watching || [];
    u.state.watching.push({ id, to: host.name, troops: { ...fit.troops }, until: now + WATCH_MS });
    pushLog(u.state, '🕯️ ' + fit.total + ' march to stand watch over ' + host.name + '.', 'gold');
    pushLog(host.state, '🕯️ ' + u.name + ' has sent ' + fit.total + ' to stand your watch.', 'gold');
    markDirty(); flush();
    return send(res, 200, { watch: watchView(u, now), ...publicState(u) });
  }

  if(path === '/api/watch/recall'){
    advance(u, now);
    const which = String(body.to || '');
    const w = (u.state.watching || []).find(x => !which || x.to === which);
    if(!w) return send(res, 400, { error:'You have no Watch standing there.' });
    w.until = 0;                       // watchReturn does the rest, once, in one place
    watchReturn(u, now);
    markDirty(); flush();
    return send(res, 200, { watch: watchView(u, now), ...publicState(u) });
  }

  /* ── the Muster Roll ── */

  if(path === '/api/muster'){
    const a = db.alliances[u.alliance];
    if(!a) return send(res, 400, { error:'The Roll is alliance work — join one first.' });
    advance(u, now);
    const view = musterView(a, u, now);
    markDirty();
    return send(res, 200, { muster: view });
  }

  if(path === '/api/muster/reroll'){
    const a = db.alliances[u.alliance];
    if(!a) return send(res, 400, { error:'You are in no alliance.' });
    advance(u, now);
    const seat = musterSeat(a, u, now);
    if(now < (seat.rerollAt || 0))
      return send(res, 400, { error:'The clerks are still redrawing — wait a little.' });
    /* Rerolling never offers the same work back: a button that can do nothing is a
       button that lies, and this one costs a 20-minute cooldown to press. */
    seat.task = rollTask(u.state, Math.random, seat.task && seat.task.kind);
    seat.rerollAt = now + REROLL_MS;
    markDirty(); flush();
    return send(res, 200, { muster: musterView(a, u, now) });
  }

  if(path === '/api/muster/claim'){
    const a = db.alliances[u.alliance];
    if(!a) return send(res, 400, { error:'You are in no alliance.' });
    if(a.members.length < MUSTER_MIN_MEMBERS)
      return send(res, 400, { error:'The Roll needs at least '+MUSTER_MIN_MEMBERS+' in the alliance.' });
    advance(u, now);
    const m = musterOf(a, now);
    const seat = musterSeat(a, u, now);
    const p = taskProgress(u.state, seat.task);
    if(!p.done) return send(res, 400, { error:'That work is not finished — '+p.have+' of '+p.need+'.' });
    const w = weightOf(seat.task.weight);
    seat.points = (seat.points || 0) + w.points;
    seat.done = (seat.done || 0) + 1;
    m.total = (m.total || 0) + w.points;
    /* Both counters, as in WoS: the personal one is what pays you, the alliance one
       is what lifts everybody's share. Your neighbour's work being worth something to
       you is the entire reason a shared board beats a private quest list. */
    const d = MUSTER_TASKS[seat.task.kind] || {};
    pushLog(u.state, '📜 Muster Roll — '+(d.name||'work')+' done, +'+w.points+' points.', 'gold');
    for(const nameRaw of a.members){
      const mem = db.users[String(nameRaw).toLowerCase()];
      if(mem && mem !== u) pushLog(mem.state, '📜 '+u.name+' answered the Roll (+'+w.points+').');
    }
    seat.task = rollTask(u.state, Math.random, seat.task.kind);
    markDirty(); flush();
    return send(res, 200, { muster: musterView(a, u, now), earned: w.points });
  }

  /* ── chat ── */

  if(path === '/api/chat/send'){
    const text = String(body.text || '').trim();
    if(!text) return send(res, 400, { error:'Say something.' });
    const room = roomFor(u, String(body.channel||'state'), body.target);
    if(!room) return send(res, 400, { error:'You cannot speak in that room.' });
    pushMsg(room, u.name, text);
    return send(res, 200, { ok:true });
  }

  if(path === '/api/chat/fetch'){
    const groups = Object.entries(db.chat.group)
      .filter(([,g]) => g.members.includes(u.name))
      .map(([id,g]) => ({ id, name:g.name, members:g.members, msgs:g.msgs.slice(-40) }));
    const dms = {};
    for(const [key, msgs] of Object.entries(db.chat.dm)){
      if(!key.split('|').includes(u.name.toLowerCase())) continue;
      const otherKey = key.split('|').find(n => n !== u.name.toLowerCase());
      const other = db.users[otherKey];
      if(other) dms[other.name] = msgs.slice(-40);
    }
    return send(res, 200, {
      state: stateChat(realmOf(u)).slice(-40),
      alliance: u.alliance ? (db.chat.alliance[u.alliance] || []).slice(-40) : [],
      dms, groups,
      online: Object.values(db.users)
        .filter(x => now - (x.state.lastSeen || 0) < 300000)
        .map(x => x.name).slice(0, 50),
    });
  }

  if(path === '/api/chat/group'){
    const name = String(body.name || '').trim().slice(0, 24);
    if(!name) return send(res, 400, { error:'Name the group.' });
    const id = 'g' + (chatSeq++) + Math.random().toString(36).slice(2, 6);
    db.chat.group[id] = { name, members:[u.name], msgs:[], owner:u.name };
    markDirty();
    return send(res, 200, { id, name });
  }

  if(path === '/api/chat/invite'){
    const g = db.chat.group[String(body.id||'')];
    if(!g || !g.members.includes(u.name)) return send(res, 404, { error:'No such group.' });
    const other = db.users[String(body.who||'').toLowerCase()];
    if(!other) return send(res, 404, { error:'No hold by that name.' });
    if(!g.members.includes(other.name)){
      if(g.members.length >= 20) return send(res, 400, { error:'That group is full.' });
      g.members.push(other.name);
      pushMsg(g.msgs, '—', other.name + ' joins the circle.');
      markDirty();
    }
    return send(res, 200, { ok:true, members:g.members });
  }

  /* ── the realm ── */

  if(path === '/api/realm'){
    advance(u, now);
    const board = Object.values(db.users).map(m => ({
      name: m.name,
      score: (m.state.ev && m.state.ev.score) || 0,
      townhall: m.state.b.townhall,
      alliance: m.alliance || null,
    })).filter(r => r.score > 0);
    // ranked inside a Town Hall band, so nobody competes with the server's oldest hold
    const band = t => t <= 8 ? 'Reach' : t <= 16 ? 'March' : t <= 24 ? 'Dominion' : 'Crown';
    const mine = band(u.state.b.townhall);
    return send(res, 200, {
      landmarks: realmView(now, realmOf(u), riftView(u, now).live),
      boss: bossFor(u.alliance, now),
      rally: rallyView(u.alliance, now),
      rift: riftView(u, now),
      musterMs: MUSTER_MS,
      hosts: HOSTS.map(h => ({ ...h, power: hostPower(u.alliance, h.mult) })),
      season: {
        no: seasonNo(now), endsIn: seasonEndsIn(now),
        arc: SEASON_ARCS[seasonNo(now)] || null,
        next: SEASON_ARCS[seasonNo(now) + 1] || null,
        realmDay: realmDay(now),
        titles: u.titles || [],
        history: (db.season && db.season.history || []).slice(-3).reverse(),
      },
      eventBoard: {
        band: mine,
        rows: board.filter(r => band(r.townhall) === mine)
          .sort((a,b) => b.score - a.score).slice(0, 20),
      },
      alliances: Object.values(db.alliances).map(a => ({
        tag:a.tag, name:a.name, members:a.members.length,
        power: a.members.reduce((t,n) => {
          const m = db.users[n.toLowerCase()];
          return t + (m ? armyPower(m.state) : 0);
        }, 0),
        holds: LANDMARKS.filter(d => landmarkState(d.id, realmOfAlliance(a.tag)).holder === a.tag).length,
      })).sort((x,y) => y.power - x.power).slice(0, 20),
    });
  }

  if(path === '/api/landmark/assault'){
    if(!u.alliance) return send(res, 400, { error:'Only an alliance can take a landmark.' });
    const rift = riftView(u, now);
    const d = LANDMARKS.find(l => l.id === String(body.id||''))
           || (rift.live ? RIFT_HOLDS.find(l => l.id === String(body.id||'')) : null);
    if(!d) return send(res, 404, { error:'No such landmark.' });
    if(!isAwake(d, now)) return send(res, 400, { error:'That site still sleeps.' });
    const realm = realmOf(u);
    tickRealm(now, realm);
    const st = landmarkState(d.id, realm);
    if(st.holder === u.alliance) return send(res, 400, { error:'Your banner already flies there.' });
    if(st.banner) return send(res, 400, { error:'A banner is already going up there.' });
    if((u.state.assaultReady || 0) > now)
      return send(res, 429, { error:'Your column is still reforming.' });
    advance(u, now);
    const power = armyPower(u.state);
    if(power <= 0) return send(res, 400, { error:'You have no army to send.' });
    u.state.assaultReady = now + ASSAULT_CD;
    st.garrison = Math.max(0, st.garrison - power);
    // the assault costs the attacker some of the muster, as any siege would
    let fallen = 0;
    for(const k of Object.keys(u.state.t)){
      const l = Math.ceil(u.state.t[k] * 0.05);
      u.state.t[k] = Math.max(0, u.state.t[k] - l); fallen += l;
    }
    gainValor(u.state, 8);
    gainMastery(u.state, 30, now);
    let claimed = false;
    if(st.garrison <= 0){
      st.holder = null;
      st.banner = { tag: u.alliance, end: now + BANNER_MS, helps: 0, helpers: [] };
      claimed = true;
      const a = db.alliances[u.alliance];
      pushMsg(stateChat(realm), '—',
        '⚔️ ' + (a ? a.name : u.alliance) + ' breaks the garrison at ' + d.name + ' and begins raising a banner.');
    }
    markDirty();
    return send(res, 200, {
      dealt: power, fallen, claimed,
      landmarks: realmView(now, realmOf(u), riftView(u, now).live),
      boss: bossFor(u.alliance, now), ...publicState(u),
    });
  }

  if(path === '/api/landmark/help'){
    if(!u.alliance) return send(res, 400, { error:'You are in no alliance.' });
    const realm = realmOf(u);
    tickRealm(now, realm);
    let helped = 0;
    for(const d of LANDMARKS.concat(RIFT_HOLDS)){
      const st = landmarkState(d.id, realm);
      const b = st.banner;
      if(!b || b.tag !== u.alliance) continue;
      if(body.id && d.id !== body.id) continue;
      if((b.helpers || []).includes(u.name)) continue;
      const total = BANNER_MS;
      b.end = Math.max(now, b.end - total * BANNER_HELP);
      b.helps = (b.helps || 0) + 1;
      b.helpers = (b.helpers || []).concat(u.name);
      helped++;
    }
    if(helped) markDirty();
    return send(res, 200, { helped, landmarks: realmView(now, realm, riftView(u, now).live) });
  }

  if(path === '/api/rally/call'){
    if(!u.alliance) return send(res, 400, { error:'Only an alliance can raise a rally.' });
    db.rallies ||= {};
    if(db.rallies[u.alliance]) return send(res, 400, { error:'Your alliance is already mustering.' });
    if((u.state.rallyReady || 0) > now)
      return send(res, 429, { error:'Your hold is still recovering from the last rally.' });
    const h = hostById(String(body.host || '')) || HOSTS[0];
    const power = hostPower(u.alliance, h.mult);
    db.rallies[u.alliance] = {
      host: h.id, caller: u.name, power,
      joins: {}, launchAt: now + MUSTER_MS, resolved: false,
    };
    const a = db.alliances[u.alliance];
    pushMsg(db.chat.alliance[u.alliance] ||= [], '—',
      h.icon+' '+u.name+' calls a rally on '+h.name+' — '+fmtNum(power)
      +' needed, muster closes in '+humanMs(MUSTER_MS)+'. Commit a column.');
    markDirty();
    return send(res, 200, { rally: rallyView(u.alliance, now), ...publicState(u) });
  }

  if(path === '/api/rally/join'){
    if(!u.alliance) return send(res, 400, { error:'Only an alliance can join a rally.' });
    const r = db.rallies && db.rallies[u.alliance];
    if(!r) return send(res, 400, { error:'No rally is mustering.' });
    if(now >= r.launchAt) return send(res, 400, { error:'The muster has closed.' });
    if(r.joins[u.name]) return send(res, 400, { error:'Your column has already ridden out.' });
    advance(u, now);
    // the same column rules as a march: three captains, and they cap the size
    const party = String(body.heroes || '').split(',').filter(Boolean).slice(0, 3)
      .filter(id => u.state.heroes[id]);
    const want = {};
    for(const k of Object.keys(u.state.t)) want[k] = Number(body['t_'+k]) || 0;
    const fit = fitColumn(u.state, want, party);
    if(!fit.total) return send(res, 400, { error:'You sent nobody.' });
    for(const [k,n] of Object.entries(fit.troops)) u.state.t[k] -= n;
    r.joins[u.name] = {
      troops: fit.troops,
      // 'host' so Host-Breaker counts here, as it does in the Arena
      power: marchPower(u.state, fit.troops, party, 'host'),
    };
    const h = hostById(r.host) || HOSTS[0];
    const committed = Object.values(r.joins).reduce((t,j) => t + j.power, 0);
    pushMsg(db.chat.alliance[u.alliance] ||= [], '—',
      u.name+' commits '+fit.total+' troops ('+fmtNum(committed)+'/'+fmtNum(r.power)+').');
    pushLog(u.state, h.icon+' Your column rides to the rally on '+h.name+'. They cannot defend the wall until it resolves.');
    markDirty();
    return send(res, 200, { rally: rallyView(u.alliance, now), ...publicState(u) });
  }

  if(path === '/api/rally/launch'){
    const r = u.alliance && db.rallies && db.rallies[u.alliance];
    if(!r) return send(res, 400, { error:'No rally is mustering.' });
    if(r.caller !== u.name) return send(res, 403, { error:'Only the caller may send it early.' });
    if(!Object.keys(r.joins).length) return send(res, 400, { error:'Nobody has committed a column yet.' });
    r.launchAt = now;
    resolveRallies(now);
    advance(u, now);
    return send(res, 200, { rally: rallyView(u.alliance, now), ...publicState(u) });
  }

  if(path === '/api/boss/strike'){
    if(!u.alliance) return send(res, 400, { error:'Only an alliance faces the beast.' });
    const view = bossFor(u.alliance, now);
    if(!view) return send(res, 400, { error:'No beast stirs.' });
    if(!view.open) return send(res, 400, { error:'The beast has not come out of the fog yet.' });
    const b = db.boss[u.alliance];
    if(b.slain) return send(res, 400, { error:'It is already down. Its kin will come again.' });
    if((u.state.bossReady || 0) > now) return send(res, 429, { error:'Your warband is still catching its breath.' });
    advance(u, now);
    const hit = armyPower(u.state);
    if(hit <= 0) return send(res, 400, { error:'You have no army to send.' });
    u.state.bossReady = now + BOSS_CD;
    b.hp = Math.max(0, b.hp - hit);
    b.damage[u.name] = (b.damage[u.name] || 0) + hit;
    // striking a beast costs less than a siege, but it is not free. Rounding
    // (not ceiling) so a small muster is not eaten a unit at a time.
    let fallen = 0;
    for(const k of Object.keys(u.state.t)){
      const l = Math.round(u.state.t[k] * 0.03);
      u.state.t[k] = Math.max(0, u.state.t[k] - l); fallen += l;
    }
    gainValor(u.state, 6);
    gainMastery(u.state, 20, now);

    if(b.hp <= 0 && !b.slain){
      b.slain = true; b.slainAt = now;
      const total = Object.values(b.damage).reduce((t,v) => t+v, 0) || 1;
      const ranked = Object.entries(b.damage).sort((x,y) => y[1] - x[1]);
      ranked.forEach(([name, dmg], i) => {
        const m = db.users[name.toLowerCase()];
        if(!m) return;
        // everyone who landed a blow shares it; rank only tilts the share
        const share = dmg / total;
        gainValor(m.state, Math.round(80 + 220 * share + (i === 0 ? 60 : 0)));
        gainMastery(m.state, Math.round(200 + 500 * share), now);
        m.state.shields = Math.min((m.state.shields || 0) + 1, 9);
        pushLog(m.state, b.icon+' '+b.name+' falls. Your share of the kill: '
          + Math.round(share*100)+'% of the damage.' + (i === 0 ? ' You struck hardest.' : ''), 'gold');
      });
      const a = db.alliances[u.alliance];
      pushMsg(stateChat(realmOf(u)), '—', b.icon+' '+b.name+' is brought down by '+(a?a.name:u.alliance)+'.');
      pushMsg(db.chat.alliance[u.alliance] ||= [], '—',
        b.icon+' '+b.name+' is down — every hand that struck it shares the kill.');
    }
    markDirty();
    return send(res, 200, { hit, fallen, boss: bossFor(u.alliance, now), ...publicState(u) });
  }

  if(path === '/api/reset'){
    u.state = freshState(now);
    u.state.seenIntro = true;
    markDirty();
    return send(res, 200, publicState(u));
  }

  return send(res, 404, { error:'no such endpoint' });
}

/* ── server ── */

createServer(async (req, res) => {
  const ip = req.socket.remoteAddress || 'unknown';
  const url = new URL(req.url, 'http://localhost');

  if(req.method === 'OPTIONS'){
    res.writeHead(204, {
      'access-control-allow-origin':'*',
      'access-control-allow-methods':'GET,POST,OPTIONS',
      'access-control-allow-headers':'content-type',
      'access-control-max-age':'86400',
    });
    return res.end();
  }

  if(url.pathname.startsWith('/api/')){
    if(rateLimited(ip)) return send(res, 429, { error:'Slow down.' });
    try{ await api(req, res, url); }
    catch(e){ send(res, 400, { error: e.message || 'bad request' }); }
    return;
  }

  serveStatic(req, res, url.pathname);
}).listen(PORT, () => {
  console.log('Crownhold server on http://localhost:' + PORT);
  console.log(Object.keys(db.users).length + ' holds on record'
    + (existsSync(DIST) ? '' : ' · run `npm run build` to serve the game too'));
});
