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

import { tick, armyPower, masteryLvl, upkeepPerSec } from '../src/logic.js';
import { tickWorld } from '../src/world.js';
import { freshState, applyOffline } from '../src/state.js';
import { applyAction, isGameAction } from '../src/actions.js';
import {
  resolveArena, pickOpponents, defensePower, dominantClass,
  ARENA_CD, START_LAURELS,
} from '../src/arena.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const DIST = join(ROOT, 'dist');
const DATA_DIR = join(HERE, 'data');
const DATA_FILE = join(DATA_DIR, 'accounts.json');
const PORT = Number(process.env.PORT) || 8787;
const MAX_BODY = 64 * 1024;

/* ── storage ── */

let db = { users: {}, alliances: {} };
if(existsSync(DATA_FILE)){
  try{ db = JSON.parse(readFileSync(DATA_FILE, 'utf8')); }
  catch(e){ console.error('could not read save file, starting empty:', e.message); }
}
if(!db.alliances) db.alliances = {};
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

function allianceView(tag, now){
  const a = db.alliances[tag];
  if(!a) return null;
  const members = a.members.map(n => {
    const m = db.users[n.toLowerCase()];
    if(!m) return null;
    const builds = ['bq','bq2'].map(q => m.state[q]).filter(b => b && b.end > now).map(b => ({
      key: b.key, endsIn: b.end - now,
      helps: b.helps || 0, cap: HELP_CAP,
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
  };
}

/* ── the fast-forward: bring a hold from its last save to now ── */

function advance(u, now){
  const s = u.state;
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
  res.writeHead(200, {'content-type': MIME[extname(file)] || 'application/octet-stream'});
  res.end(readFileSync(file));
}

/* ── api ── */

async function api(req, res, url){
  const path = url.pathname;
  const now = Date.now();

  if(path === '/api/health') return send(res, 200, { ok:true, players:Object.keys(db.users).length });

  if(path === '/api/leaderboard'){
    const rows = Object.values(db.users).map(u => ({
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
    const pool = Object.entries(db.users)
      .filter(([k]) => k !== key)
      .map(([k,o]) => ({
        key: k, name: o.name,
        power: defensePower(o.state),
        laurels: o.state.laurels ?? START_LAURELS,
        townhall: o.state.b.townhall,
        dominant: dominantClass(o.state),
        defStance: o.state.defStance || 'shieldwall',
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
    advance(target, now);
    // the bracket is enforced here, not just offered in the list
    const mine = defensePower(u.state), theirs = defensePower(target.state);
    if(theirs > mine * 2.2 || theirs < mine * 0.3)
      return send(res, 400, { error: 'That hold is outside your bracket.' });

    u.state.name = u.name; target.state.name = target.name;   // for battle reports
    const report = resolveArena(u.state, target.state, { stance: body.stance, frac: body.frac }, now);
    if(report.error) return send(res, 400, { error: report.error });
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
        if(b.helps >= HELP_CAP) continue;
        if((b.helpers||[]).includes(u.name)) continue;   // one help per hold per build
        const total = Math.max(1, b.end - b.start);
        b.end = Math.max(now, b.end - Math.max(HELP_MIN_MS, total * HELP_FRACTION));
        b.helps++;
        b.helpers = (b.helpers || []).concat(u.name);
        helped++;
      }
    }
    if(helped) markDirty();
    return send(res, 200, { helped, alliance: allianceView(u.alliance, now) });
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
