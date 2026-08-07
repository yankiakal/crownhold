// Crownhold state: fresh-state shape, persistence, save migration.

import { RES_META, BUILDINGS, FIRST_WAVE_MS, EXPEDITIONS, SUPPLY_RES } from './defs.js';
import { prodPerSec, upkeepPerSec, supplyPerSec, storageCap, capFor, refineStep, bankRest, pushLog, fmt,
         courtSeats, expedCdMs, caravanYields, CARAVAN_GRACE } from './logic.js';
import { genWorld } from './world.js';
import { genIsle } from './isle.js';
import { seasonNo } from './defs.js';

export const SAVE_KEY = 'crownhold-save-v1';

// single mutable slot so every module sees the same state object (reset swaps it)
export const store = { s: null };

export function freshState(now, seed){
  return {
    world: genWorld(seed != null ? seed : Math.floor(Math.random()*2**31)),
    isle: genIsle(seed != null ? seed : Math.floor(Math.random()*2**31), seasonNo(now)),
    marches: [], watch: [], watching: [],
    /* A hold opens with enough to BUILD with. 120 wood bought exactly two buildings and then the
       first session was 111 seconds of watching wood accrue at 1.6/s — measured, 2 levels in the
       first two minutes and 93% of it idle. At 500 it is 11 levels and 43%, which is where the
       build times themselves become the limit rather than the purse.
       Under the Town Hall 1 storage cap of 800 on purpose: seeded above it, the first tick would
       clamp the surplus away and the generosity would be invisible. */
    res:{food:500,wood:500,stone:250,iron:0,steel:0,runestone:0,rations:0,isleore:0,electrum:0},
    achieved:{}, campsBurned:0, ruinsRaided:0, winStreak:0, bestStreakWon:0,
    valorDay:0, valorToday:0, rest:0,
    research:{}, rq:null, allyBonus:null, ev:null, daily:null,
    valor:0,
    b:{townhall:1,farm:1,lumberyard:1,quarry:0,ironmine:0,barracks:0,wall:0,watchtower:0,
       tavern:0,granary:0,academy:0,hospital:0,warehouse:0,library:0,forge:0,runeworks:0,
       range:0,stable:0,siegeyard:0,embassy:0,command:0,kitchen:0,crucible:0},
    t:{spearman:8,archer:0,knight:0,ballista:0},
    tier:{spearman:1,archer:1,knight:1,ballista:1},
    heroes:{}, spoils:{}, court:[], arenaTeam:[], marchBoost:false, formations:[],
    regalia:{}, gq:null,
    cos:{owned:{}, hold:'default', sigil:'none', title:'none'},
    pets:{}, petOut:null, bond:0, beastsSlain:0,
    choice:null, choiceQueue:[], offersDone:0,
    stance:'balanced', captain:null, orderCd:{}, mods:null,
    laurels:1000, defStance:'shieldwall', arenaWins:0, arenaLosses:0,
    arenaReady:0, arenaLast:null,
    waveType:'rabble', upkeepPauseUntil:0, trainFastNext:false, expedBoost:false,
    bq:null, bq2:null, tq:{}, hq:null, pq:null, wounded:{},
    wave:1, nextWave:now+FIRST_WAVE_MS, wavesWon:0, wavesLost:0,
    trained:0, trainedBy:{},
    mxp:0, shields:0, shieldUntil:0, warbandsWon:0, streak:0, famineAcc:0,
    questIdx:0,
    patrolReady:0, caravan:null,
    short:{wood:0, iron:0}, wallWear:0,
    log:[], banner:null,
    seenIntro:false, taught:{}, lesson:null,
    now, lastSeen:now,
  };
}

/* Progress earned while nobody was watching: production net of upkeep, plus the
   standing caravan's runs. No battles and no desertion happen unattended.
   Shared by the browser's save-load and the server's fast-forward. */
export function applyOffline(s, awayMs){
  const gained = [];
  for(const r of Object.keys(RES_META)){
    if(RES_META[r].refined || RES_META[r].carried) continue;   // made or carried, not gathered
    let g = prodPerSec(s, r) * awayMs/1000;
    if(r==='food') g -= upkeepPerSec(s) * awayMs/1000;   // the muster ate while you were gone
    // and it drew arrows and shoes from the stores while you were gone, same as at the wall
    if(SUPPLY_RES.includes(r)) g -= supplyPerSec(s, r) * awayMs/1000;
    if(g >= 1){ s.res[r] = Math.min(s.res[r]+g, capFor(s, r)); gained.push('+'+fmt(g)+' '+RES_META[r].lbl.toLowerCase()); }
    else if(g < 0) s.res[r] = Math.max(0, s.res[r]+g); // drain, but no desertion offline
  }
  /* The refineries never sleep either — run them in chunks so their inputs
     deplete honestly. The list of what they make is DERIVED from RES_META: it was
     hardcoded as ['steel','runestone'], which would have silently left Rations
     and Electrum out of every offline report the moment they were added. */
  const madeHere = Object.keys(RES_META).filter(r => RES_META[r].refined);
  const before = {};
  for(const r of madeHere) before[r] = s.res[r] || 0;
  const steps = Math.min(240, Math.ceil(awayMs/30000));
  for(let i=0;i<steps;i++) refineStep(s, (awayMs/1000)/steps);
  for(const r of madeHere){
    const made = (s.res[r]||0) - before[r];
    if(made >= 1) gained.push('+'+fmt(made)+' '+RES_META[r].lbl.toLowerCase());
  }
  if(gained.length) pushLog(s, 'While you were away, the hold produced '+gained.join(', ')+' (after feeding the muster).', 'gold');
  if(s.caravan){
    const cycles = Math.floor(awayMs / (expedCdMs(s) + CARAVAN_GRACE));
    const y = caravanYields(s);
    if(cycles > 0 && y){
      for(const [r,v] of Object.entries(y)) s.res[r] = Math.min(s.res[r] + v*cycles, storageCap(s));
      pushLog(s, '⛺ Your standing caravan ran '+EXPEDITIONS[s.caravan].name+' '+cycles+'× while you were away: '
        + Object.entries(y).map(([r,v])=>'+'+fmt(v*cycles)+' '+r).join(', ')+'.', 'gold');
    }
  }
}

/* ── save migration ──
   Backfill every field an older save lacks. This MUST be shared: the browser
   runs it on load, and the server runs it before advancing a stored hold. It
   used to live inside load(), which is browser-only — so online accounts silently
   missed every field added since they were created, and new systems read
   undefined on the server while working perfectly in local play. */
export function migrate(s, now){
    s.now = now;
    // the Watch: troops others have stationed here, and troops of ours standing elsewhere
    // camps predate their garrisons: give any old tile one so the triangle applies there
    if(s.world && Array.isArray(s.world.tiles))
      for(const t of s.world.tiles)
        if(t.type === 'camp' && !t.def)
          t.def = ['spearman','archer','knight'][(t.x*7 + t.y*13) % 3];
    if(!Array.isArray(s.watch)) s.watch = [];
    if(!Array.isArray(s.watching)) s.watching = [];
    if(s.mxp==null) s.mxp = 0;
    if(s.shields==null) s.shields = 0;
    if(s.shieldUntil==null) s.shieldUntil = 0;
    if(s.warbandsWon==null) s.warbandsWon = 0;
    if(s.streak==null) s.streak = 0;
    if(s.wavesLost==null) s.wavesLost = 0;
    if(s.famineAcc==null) s.famineAcc = 0;
    if(s.t.ballista==null) s.t.ballista = 0;
    /* v1.69: Truegold became Electrum, and Isle Ore's key stopped deriving from it.
       Truegold is Kingshot's own resource name and we were shipping it verbatim, so the metal was
       renamed to a real one — electrum, the pale gold-silver alloy known since antiquity, which sits
       in the same grounded register as Steel. Keys moved with the label rather than leaving the code
       littered with the old one, so any save written before this carries them over. */
    if(s.res){
      if(s.res.electrum == null) s.res.electrum = s.res.truegold || 0;
      if(s.res.isleore == null)  s.res.isleore  = s.res.trueore  || 0;
      delete s.res.truegold; delete s.res.trueore;
    }
    if(s.research){
      for(const [from, to] of [['tg_might','el_might'], ['tg_bulwark','el_bulwark'],
                               ['tg_harvest','el_harvest'], ['tg_hoard','el_hoard']]){
        if(s.research[from] != null && s.research[to] == null) s.research[to] = s.research[from];
        delete s.research[from];
      }
    }
    // a study in flight under the old key would otherwise finish into nothing
    if(s.rq && s.rq.key && s.rq.key.startsWith('tg_')) s.rq.key = 'el_' + s.rq.key.slice(3);
    // v0.5: heroes moved from fixed {on,lvl,xp} slots to a drafted roster
    if(s.heroes && Object.values(s.heroes).some(h => h && typeof h.on === 'boolean')){
      const owned = {};
      for(const [k,h] of Object.entries(s.heroes)) if(h.on) owned[k] = {lvl:h.lvl||1, xp:h.xp||0};
      s.heroes = owned;
    }
    if(s.heroes==null) s.heroes = {};
    if(s.spoils==null) s.spoils = {};
    if(s.choiceQueue==null) s.choiceQueue = [];
    if(s.choice===undefined) s.choice = null;
    if(s.offersDone==null) s.offersDone = Object.keys(s.heroes).length;
    // v0.8 long road
    if(s.tier==null) s.tier = {spearman:1,archer:1,knight:1,ballista:1};
    for(const k of ['tavern','granary','academy','hospital','warehouse']) if(s.b[k]==null) s.b[k] = 0;
    // v0.7 command layer
    if(s.stance==null) s.stance = 'balanced';
    if(s.captain===undefined) s.captain = null;
    if(s.orderCd==null) s.orderCd = {};
    if(s.mods===undefined) s.mods = null;
    if(s.waveType==null) s.waveType = 'rabble';
    if(s.upkeepPauseUntil==null) s.upkeepPauseUntil = 0;
    if(s.trainFastNext==null) s.trainFastNext = false;
    if(s.expedBoost==null) s.expedBoost = false;
    if(s.caravan===undefined) s.caravan = null;
    // v1.0 the Frontier
    if(!s.world) s.world = genWorld(Math.floor(Math.random()*2**31));
    if(!s.marches) s.marches = [];
    // v1.4 the deep economy
    for(const r of Object.keys(RES_META)) if(s.res[r]==null) s.res[r] = 0;
    for(const k of Object.keys(BUILDINGS)) if(s.b[k]==null) s.b[k] = 0;
    if(s.wounded==null) s.wounded = {};   // v1.16 the wounded
    if(s.hq===undefined) s.hq = null;
    // v1.18: heroes split into a seated court and march leaders. An old save's
    // whole roster was passive, so seat as many as there are chairs — the
    // Captain first, since that was the hero the player already chose.
    if(!Array.isArray(s.court)){
      const own = Object.keys(s.heroes);
      if(s.captain && own.includes(s.captain)) own.unshift(own.splice(own.indexOf(s.captain),1)[0]);
      s.court = own.slice(0, courtSeats(s));
      if(s.captain && !s.court.includes(s.captain)) s.captain = null;
    }
    if(s.marchBoost==null) s.marchBoost = false;
    // v1.19: one leader per column became a party of three
    if(!Array.isArray(s.formations)) s.formations = [];
    for(const m of s.marches) if(!Array.isArray(m.heroes)) m.heroes = m.hero ? [m.hero] : [];
    // v1.20: heroes ascend in stars, and five of them ride with an arena sortie
    for(const h of Object.values(s.heroes)){
      if(h.stars == null) h.stars = 0;
      if(h.deeds == null) h.deeds = 0;
    }
    if(!Array.isArray(s.arenaTeam)) s.arenaTeam = Object.keys(s.heroes).slice(0, 5);
    // v1.23: the Lord's Regalia and a hero's wargear
    if(s.regalia==null) s.regalia = {};
    if(s.gq===undefined) s.gq = null;
    for(const h of Object.values(s.heroes)) if(h.gear==null) h.gear = {};
    // v1.24: beasts roam the frontier, and companions come off the hunt
    if(s.pets==null) s.pets = {};
    if(s.petOut===undefined) s.petOut = null;
    if(s.bond==null) s.bond = 0;
    if(s.beastsSlain==null) s.beastsSlain = 0;
    if(!Array.isArray(s.world.beasts)) s.world.beasts = [];
    if(s.world.roamAt==null) s.world.roamAt = 0;
    if(s.world.spawnAt==null) s.world.spawnAt = 0;
    // v1.27: hero skills — three slots, chosen not levelled
    for(const h of Object.values(s.heroes)) if(!Array.isArray(h.skills)) h.skills = [null,null,null];
    // v1.29: the Salt Isle
    if(!s.isle || !Array.isArray(s.isle.cells))
      s.isle = genIsle(Math.floor(Math.random()*2**31), seasonNo(now));
    // v1.30: cosmetics
    if(!s.cos) s.cos = {owned:{}, hold:'default', sigil:'none', title:'none'};
    if(!s.cos.owned) s.cos.owned = {};
    // v1.15: one training queue became one per yard
    if(!s.tq || typeof s.tq !== 'object' || s.tq.key){
      const old = s.tq && s.tq.key ? s.tq : null;
      s.tq = {};
      if(old) s.tq[old.key] = old;
    }
    // a hold that already trained archers/knights keeps its yards
    if(s.b.range === 0 && (s.trainedBy?.archer || s.t.archer)) s.b.range = 1;
    if(s.b.stable === 0 && (s.trainedBy?.knight || s.t.knight)) s.b.stable = 1;
    if(s.b.siegeyard === 0 && (s.trainedBy?.ballista || s.t.ballista)) s.b.siegeyard = 1;
    if(s.achieved==null) s.achieved = {};
    if(s.campsBurned==null) s.campsBurned = 0;
    if(s.ruinsRaided==null) s.ruinsRaided = 0;
    if(s.winStreak==null) s.winStreak = 0;
    if(s.bestStreakWon==null) s.bestStreakWon = 0;
    // v1.5 pacing
    if(s.valorDay==null) s.valorDay = 0;
    if(s.valorToday==null) s.valorToday = 0;
    if(s.rest==null) s.rest = 0;
    // v1.8 research
    if(s.research==null) s.research = {};
    if(s.rq===undefined) s.rq = null;
    if(s.allyBonus===undefined) s.allyBonus = null;
    if(s.ev===undefined) s.ev = null;   // v1.10 events
    if(s.daily===undefined) s.daily = null;  // v1.13 daily tasks
    // v1.2 the Arena
    if(s.laurels==null) s.laurels = 1000;
    if(s.defStance==null) s.defStance = 'shieldwall';
    if(s.arenaWins==null) s.arenaWins = 0;
    if(s.arenaLosses==null) s.arenaLosses = 0;
    if(s.arenaReady==null) s.arenaReady = 0;
    if(s.arenaLast===undefined) s.arenaLast = null;
    return s;
}

export function load(now){
  try{
    const raw = localStorage.getItem(SAVE_KEY);
    if(!raw) return freshState(now);
    const s = migrate(JSON.parse(raw), now);
    // time away banks Rest — the catch-up for anyone who has been gone
    const trueAway = Math.max(now - (s.lastSeen||now), 0);
    if(trueAway > 7200000){
      bankRest(s, trueAway - 7200000);
      pushLog(s, '🌙 You were away a while. The hold is Rested: production runs +50% hot and your daily Valor quota is doubled until it fades.', 'gold');
    }
    // offline production (capped at 2 hours), net of army upkeep
    const away = Math.min(trueAway, 7200000);
    if(away > 60000) applyOffline(s, away);
    if(s.nextWave < now) s.nextWave = now + 60000;
    if(s.banner) s.banner = null;
    return s;
  }catch(e){ return freshState(now); }
}

export function save(s, now){
  s.lastSeen = now;
  try{ localStorage.setItem(SAVE_KEY, JSON.stringify(s)); }catch(e){}
}
