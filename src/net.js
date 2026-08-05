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
if(!server && typeof location !== 'undefined' && /^https?:$/.test(location.protocol)
   && !/(github\.io|claude\.ai)$/.test(location.hostname)){
  server = location.origin;
}
if(!server) server = DEFAULT_SERVER;

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

let arena = null;
export function arenaData(){ return arena; }

let ally = null;
export function allianceData(){ return ally; }

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
    const res = await fetch(server.replace(/\/$/,'') + '/api/leaderboard');
    if(!res.ok) return null;
    board = (await res.json()).rows;
    return board;
  }catch(e){ return null; }
}
