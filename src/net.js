// Client sync layer. Offline is the default: with no server configured the game
// runs exactly as it always has, saving to localStorage. Point it at a server
// and the server becomes the authority — actions round-trip and state comes back.

const SERVER_KEY = 'crownhold-server', SESS_KEY = 'crownhold-session';

let server = '';
let session = null;
let online = false;
let board = null;

try{ server = localStorage.getItem(SERVER_KEY) || ''; }catch(e){}
try{ session = JSON.parse(localStorage.getItem(SESS_KEY) || 'null'); }catch(e){}

// Served by the server itself? then it is the obvious default. Otherwise fall
// back to a local server, which is where a solo developer's is going to be.
export const DEFAULT_SERVER = 'http://localhost:8787';

/* ── a packaged app has no origin worth inferring from ──
   Under Capacitor the native shell serves the page from https://localhost, so location.origin is
   the APP, not the server: inferring from it would have every installed copy politely asking itself
   about alliances and getting a 404. The store build therefore compiles the API host in:
       API_HOST=https://api.example.com npm run build
   isNative is deliberately a capability check rather than a user-agent sniff — the shell defines
   window.Capacitor, and nothing else does. */
export const isNative = typeof window !== 'undefined'
  && !!(window.Capacitor && (window.Capacitor.isNativePlatform
        ? window.Capacitor.isNativePlatform() : window.Capacitor.isNative));
const BUILT_IN_HOST = typeof __API_HOST__ === 'string' ? __API_HOST__ : '';

if(!server && BUILT_IN_HOST) server = BUILT_IN_HOST;
if(!server && !isNative && typeof location !== 'undefined' && /^https?:$/.test(location.protocol)
   && !/(github\.io|claude\.ai)$/.test(location.hostname)){
  server = location.origin;
}
/* A native build with no host compiled in must NOT fall back to localhost:8787 — on a phone that is
   the phone, so every request fails with a confusing network error instead of an honest "this build
   has no server". Left null, isOnline() stays false and the game is simply solo, which is the truth. */
if(!server && !isNative) server = DEFAULT_SERVER;

export function isOnline(){ return online && !!session; }
export function accountName(){ return session ? session.name : null; }
export function serverUrl(){ return server; }
export function leaderboardRows(){ return board; }

function persist(){
  try{
    if(server) localStorage.setItem(SERVER_KEY, server); else localStorage.removeItem(SERVER_KEY);
    if(session) localStorage.setItem(SESS_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESS_KEY);
  }catch(e){}
}

async function post(path, body){
  if(!server) throw new Error('No server configured.');
  const res = await fetch(server.replace(/\/$/,'') + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if(!res.ok) throw new Error(data.error || ('Server said ' + res.status));
  return data;
}

export function setServer(url){
  const v = (url || '').trim().replace(/\/$/,'');
  server = v || DEFAULT_SERVER;      // an empty box means "the usual place"
  persist();
}

export async function probe(){
  if(!server) return false;
  try{
    const res = await fetch(server.replace(/\/$/,'') + '/api/health');
    return res.ok;
  }catch(e){ return false; }
}

export async function register(name, password){
  const d = await post('/api/register', { name, password });
  session = { name: d.name, token: d.token };
  online = true; persist();
  return d.state;
}

export async function login(name, password){
  const d = await post('/api/login', { name, password });
  session = { name: d.name, token: d.token };
  online = true; persist();
  return d.state;
}

export function logout(){
  session = null; online = false; board = null; arena = null; ally = null; persist();
}

/* Resume a stored session on boot. Returns the authoritative state, or null to
   stay offline (no server, expired token, whatever — the local game still runs). */
export async function resume(){
  if(!session || !server) return null;
  try{
    const d = await post('/api/state', { token: session.token });
    online = true;
    return d.state;
  }catch(e){
    if(/Session expired/i.test(e.message)) session = null, persist();
    online = false;
    return null;
  }
}

export async function sendAction(action, params){
  const d = await post('/api/action', { token: session.token, action, params });
  return d.state;
}

export async function pullState(){
  const d = await post('/api/state', { token: session.token });
  return d.state;
}

export async function resetHold(){
  const d = await post('/api/reset', { token: session.token });
  return d.state;
}

/* Delete the account outright, which is a different thing from razing the hold: reset keeps the
   account and wipes its progress, this removes the account. The App Store requires the second to be
   reachable in-app for any app that offers the first (Guideline 5.1.1(v)), and it is the right thing
   to offer regardless — an account someone cannot leave is not really theirs.
   The password is asked for again server-side, so it is passed through here. */
export async function deleteAccount(password){
  await post('/api/account/delete', { token: session.token, password });
  logout();
  return true;
}
export function accountKnown(){ return !!session; }

/* ── moderation, from the player's side ──
   Blocking and reporting are the two the App Store requires a PLAYER to be able to do (Guideline
   1.2); muting and banning belong to whoever runs the server and are not reachable from here. */
export async function blockPlayer(name){
  const d = await post('/api/chat/block', { token: session.token, name });
  if(chat) chat.blocked = d.blocked;
  return d.blocked;
}
export async function reportMessage(name, text){
  await post('/api/chat/report', { token: session.token, name, text });
  return true;
}
export function blockedNames(){ return (chat && chat.blocked) || []; }
export function supportEmail(){ return (chat && chat.support) || ''; }
export function mutedFor(){ return (chat && chat.muted) || 0; }

let arena = null;
export function arenaData(){ return arena; }

let ally = null;
export function allianceData(){ return ally; }
/* The Levy's shared total, holds and rungs. Carried on the alliance payload rather than fetched on its
   own: the events panel already renders every 250ms and a second poll for one number would be a
   request four times a second. Null until the first alliance refresh comes back, which the panel reads
   as "asking the server" rather than as zero — the difference between a blank ladder and a wrong one. */
export function levyData(){ return (ally && ally.levy) || null; }
export async function levyClaim(){
  if(!isOnline()) return null;
  const d = await post('/api/levy/claim', { token: session.token });
  await refreshAlliance();
  return d;
}

/* ── raids: hold against hold ── */
let raid = null;
export function raidData(){ return raid; }
export async function refreshRaid(){
  if(!isOnline()) return null;
  try{
    const d = await post('/api/raid', { token: session.token });
    raid = d && d.raid ? d.raid : null;
    return raid;
  }catch(e){ raid = null; return null; }
}
export async function raidSend(to, troops, heroes){
  const d = await post('/api/raid/send', { token: session.token, to, troops, heroes });
  await refreshRaid();
  return d;
}

/* ── the Watch ── */
let watch = null;
export function watchData(){ return watch; }
export async function refreshWatch(){
  if(!isOnline()) return null;
  try{
    const d = await post('/api/watch', { token: session.token });
    watch = d && d.watch ? d.watch : null;
    return watch;
  }catch(e){ watch = null; return null; }
}
export async function watchSend(to, troops, heroes){
  const d = await post('/api/watch/send', { token: session.token, to, troops, heroes });
  if(d && d.watch) watch = d.watch;
  return d;
}
export async function watchRecall(to){
  const d = await post('/api/watch/recall', { token: session.token, to });
  if(d && d.watch) watch = d.watch;
  return d;
}

/* ── the Muster Roll ──
   Kept beside the alliance because it IS alliance state, but fetched separately: the
   Roll settles lazily on the server the first time anyone looks after a fortnight
   ends, so asking for it is also what closes the previous one. */
let muster = null;
export function musterData(){ return muster; }
export async function refreshMuster(){
  if(!isOnline()) return null;
  try{
    const d = await post('/api/muster', { token: session.token });
    muster = d && d.muster ? d.muster : null;
    return muster;
  }catch(e){ muster = null; return null; }
}
export async function musterReroll(){
  const d = await post('/api/muster/reroll', { token: session.token });
  if(d && d.muster) muster = d.muster;
  return d;
}
export async function musterClaim(){
  const d = await post('/api/muster/claim', { token: session.token });
  if(d && d.muster) muster = d.muster;
  return d;
}

export async function refreshAlliance(){
  if(!isOnline()) return null;
  try{
    ally = await post('/api/alliance/info', { token: session.token });
    return ally;
  }catch(e){ return null; }
}
export async function allianceCreate(name, tag){
  const d = await post('/api/alliance/create', { token: session.token, name, tag });
  await refreshAlliance();
  return d;
}
export async function allianceJoin(tag){
  const d = await post('/api/alliance/join', { token: session.token, tag });
  await refreshAlliance();
  return d;
}
export async function allianceLeave(){
  const d = await post('/api/alliance/leave', { token: session.token });
  await refreshAlliance();
  return d;
}
export async function allianceContribute(tech){
  const d = await post('/api/alliance/contribute', { token: session.token, tech });
  await refreshAlliance();
  return d;
}
export async function allianceHelp(target){
  const d = await post('/api/alliance/help', { token: session.token, target });
  ally = ally ? { ...ally, alliance: d.alliance } : ally;
  return d;
}

export async function refreshArena(){
  if(!isOnline()) return null;
  try{
    arena = await post('/api/arena/list', { token: session.token });
    return arena;
  }catch(e){ return null; }
}

export async function arenaAttack(target, stance, frac){
  const d = await post('/api/arena/attack', { token: session.token, target, stance, frac });
  return d;   // { report, name, state }
}

let chat = null;
export function chatData(){ return chat; }
export async function refreshChat(){
  if(!isOnline()) return null;
  try{ chat = await post('/api/chat/fetch', { token: session.token }); return chat; }
  catch(e){ return null; }
}
export async function chatSend(channel, target, text){
  await post('/api/chat/send', { token: session.token, channel, target, text });
  return refreshChat();
}
export async function chatGroup(name){
  const d = await post('/api/chat/group', { token: session.token, name });
  await refreshChat();
  return d;
}
export async function chatInvite(id, who){
  const d = await post('/api/chat/invite', { token: session.token, id, who });
  await refreshChat();
  return d;
}

let realm = null;
export function realmData(){ return realm; }
export async function refreshRealm(){
  if(!isOnline()) return null;
  try{ realm = await post('/api/realm', { token: session.token }); return realm; }
  catch(e){ return null; }
}
export async function landmarkAssault(id){
  const d = await post('/api/landmark/assault', { token: session.token, id });
  await refreshRealm();
  return d;
}
export async function bossStrike(){
  const d = await post('/api/boss/strike', { token: session.token });
  await refreshRealm();
  return d;
}
export async function rallyCall(host){
  const d = await post('/api/rally/call', { token: session.token, host });
  await refreshRealm();
  return d;
}
export async function rallyJoin(params){
  const d = await post('/api/rally/join', { token: session.token, ...params });
  await refreshRealm();
  return d;
}
export async function rallyLaunch(){
  const d = await post('/api/rally/launch', { token: session.token });
  await refreshRealm();
  return d;
}
export async function landmarkHelp(id){
  const d = await post('/api/landmark/help', { token: session.token, id });
  await refreshRealm();
  return d;
}

export async function refreshLeaderboard(){
  if(!server) return null;
  try{
    // pass the token so the server can scope the ladder to your realm
    const q = session && session.token ? '?token=' + encodeURIComponent(session.token) : '';
    const res = await fetch(server.replace(/\/$/,'') + '/api/leaderboard' + q);
    if(!res.ok) return null;
    board = (await res.json()).rows;
    return board;
  }catch(e){ return null; }
}
