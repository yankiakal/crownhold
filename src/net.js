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

// served by the server itself? then it is the obvious default
if(!server && typeof location !== 'undefined' && /^https?:$/.test(location.protocol)
   && !/(github\.io|claude\.ai)$/.test(location.hostname)){
  server = location.origin;
}

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
  server = (url || '').trim().replace(/\/$/,'');
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
  session = null; online = false; board = null; persist();
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

export async function refreshLeaderboard(){
  if(!server) return null;
  try{
    const res = await fetch(server.replace(/\/$/,'') + '/api/leaderboard');
    if(!res.ok) return null;
    board = (await res.json()).rows;
    return board;
  }catch(e){ return null; }
}
