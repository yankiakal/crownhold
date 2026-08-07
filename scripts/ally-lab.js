// Two holds, one alliance, a long build already running: `npm run ally`
//
// Asked directly: "I need to test alliance help too — how can we do it?"
//
// Help needs two accounts in one alliance, both with an Embassy, and something long enough building
// that 1.5% is visible. Reaching that by playing means grinding two holds to Town Hall 5, twice, in
// two browser profiles. This sets it up in one command and then hands you a running server.
//
// It uses its OWN data directory (server/data-lab), so nothing here can touch real accounts. Delete
// that folder to start over. ALLOW_DEBUG is on, which is what lets the seeding raise an Embassy
// without playing to it — never run this as a public server.
//
// Nothing here is scheduled or automatic: it runs while you watch it and stops when you press ^C.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const PORT = Number(process.env.PORT) || 8790;
const BASE = 'http://127.0.0.1:' + PORT;
const DATA = join(process.cwd(), 'server', 'data-lab');
const PASS = 'longenoughpassword';
const HOLDS = [
  { name: 'Builder', role: 'has the long build — ask for help here' },
  { name: 'Helper',  role: 'taps Help — watch Builder\'s timer jump' },
];

mkdirSync(DATA, { recursive: true });
const srv = spawn(process.execPath, ['server/server.js'], {
  env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA, ALLOW_DEBUG: '1' },
  stdio: ['ignore', 'inherit', 'inherit'],
});
process.on('SIGINT', () => { srv.kill(); process.exit(0); });
process.on('exit', () => { try { srv.kill(); } catch {} });

const post = async (path, body) => {
  const r = await fetch(BASE + path, { method:'POST',
    headers:{ 'content-type':'application/json' }, body: JSON.stringify(body || {}) });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: r.status, body: json };
};

for(let i = 0; i < 100; i++){
  try { if((await post('/api/health', {})).status === 200) break; } catch {}
  await new Promise(r => setTimeout(r, 100));
}

/* Register, or log back in if this lab has been run before — re-running must not fail on
   "name taken", or the second run of a dev tool is more annoying than the first. */
const tokens = {};
for(const h of HOLDS){
  let r = await post('/api/register', { name: h.name, password: PASS });
  if(r.status !== 200) r = await post('/api/login', { name: h.name, password: PASS });
  if(r.status !== 200 || !r.body?.token){
    console.error('ally: could not sign in as ' + h.name + ' — ' + (r.body?.error || r.status));
    process.exit(1);
  }
  tokens[h.name] = r.body.token;
  await post('/api/debug/embassy', { token: r.body.token, level: 3 });
  await post('/api/debug/kit', { token: r.body.token, strong: true });
}

// one alliance, both in it
await post('/api/alliance/create', { token: tokens.Builder, name:'The Long Watch', tag:'LWCH' });
await post('/api/alliance/join',   { token: tokens.Helper,  tag:'LWCH' });

/* Something worth helping. The WALL, not the Town Hall: the kit leaves a Town Hall of 20 with low
   farms behind it, so "the Town Hall must lead the rest of the hold" refuses that upgrade — which
   cost the server test an afternoon before it was written down. */
const built = await post('/api/action', { token: tokens.Builder, action:'upgrade', params:{ key:'wall' } });
const bq = built.body?.state?.bq;
const info = await post('/api/alliance/info', { token: tokens.Builder });
const view = info.body?.alliance;

const mins = bq ? Math.round((bq.end - bq.start) / 60000) : 0;
console.log(`
  ── the alliance lab is up ──

  Open ${BASE}  in two windows. One must be a separate browser profile or a private
  window: the sign-in is kept in localStorage, so two normal tabs share one account.

     ${HOLDS.map(h => h.name.padEnd(8) + ' password ' + PASS + '   — ' + h.role).join('\n     ')}

  Both hold an Embassy 3 and sit in [LWCH] The Long Watch.
  Builder has a Wall upgrade running: ${mins} minutes.
  ${view ? `A help is worth ${view.helpPct}% each, up to ${view.helpCap} per build.` : ''}

  To test it:
    1. Sign in as Helper, open the Alliance tab, press "🤝 Help all".
    2. Sign in as Builder and watch the Wall timer drop by about ${Math.round(mins * 0.015 * 60)}s.
    3. Press Help again as Helper — nothing happens. One help per hold per build.
       Sign in as a third account to shave more off.

  What to look for beyond the timer moving:
    · A hold with no Embassy is refused with a reason, not a dead button.
    · A short build cannot be erased — one help never takes more than a tenth of anything.
    · The panel says what a help is worth BEFORE you spend the tap.

  ^C stops the server. Data lives in server/data-lab — delete it to start fresh.
`);
