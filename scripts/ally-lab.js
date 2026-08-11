// Four holds ready to test the multiplayer with: `npm run ally`
//
// Asked directly: "I need to test alliance help too — how can we do it?" and then "if I open the
// game in different browsers, will I be able to attack each other?"
//
// The live site cannot do either: GitHub Pages serves static files, so there is no server, and
// net.js deliberately refuses to treat github.io as its own API. Multiplayer needs this.
//
// Two PAIRS, because the two things you want to test need opposite setups:
//   · Builder + Helper share an alliance, so they can help each other's builds.
//   · Raider + Target share NO alliance, because the server refuses a raid on your own alliance —
//     which is exactly what the first version of this lab got wrong. Both are past the Founder's
//     Peace (the strong kit puts them at Town Hall 20, over the Town Hall 10 clause) and matched in
//     power so they fall inside each other's raid bracket.
//
// It CHECKS its own premise at the end rather than asserting it: it asks the server whether Target
// really is attackable by Raider and prints the reason if not. A lab that claims to be ready and
// is not costs more time than no lab.
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
  { name: 'Builder', role: 'has a long build — the one to help',        pair: 'ally' },
  { name: 'Helper',  role: 'taps Help — watch Builder\'s timer drop',   pair: 'ally' },
  { name: 'Warden',  role: 'a third in the alliance — for the Levy board', pair: 'ally' },
  { name: 'Raider',  role: 'send a column at Target from here',         pair: 'war' },
  { name: 'Target',  role: 'the hold being raided — watch it defend',   pair: 'war' },
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
  /* strong:true puts the hold at Town Hall 20, which is past the Founder's Peace's Town Hall 10
     clause — so all four are attackable. A fresh hold would be protected for 72 hours and the raid
     pair would silently refuse, which is correct behaviour and useless for testing. */
  await post('/api/debug/kit', { token: tokens[h.name], strong: true,
                                spearmen: h.name === 'Target' ? 380 : 400 });
}

// the alliance pair share one; the war pair are deliberately in none
await post('/api/alliance/create', { token: tokens.Builder, name:'The Long Watch', tag:'LWCH' });
await post('/api/alliance/join',   { token: tokens.Helper,  tag:'LWCH' });
await post('/api/alliance/join',   { token: tokens.Warden,  tag:'LWCH' });

/* ── the Levy, part-way up ──
   Seeded rather than left at zero, because the interesting state is the one in the middle: a shared
   total between two rungs, with names against numbers, and a per-hold target that a session could
   actually close. At zero the card is honest and says nothing. */
const levy0 = (await post('/api/alliance/info', { token: tokens.Builder })).body?.levy;
if(levy0 && levy0.rungs){
  const rung2 = levy0.rungs[1].at;
  const share = [[tokens.Builder, 0.30], [tokens.Helper, 0.22], [tokens.Warden, 0.11]];
  for(const [tok, f] of share)
    await post('/api/debug/score', { token: tok, lane:'levy', score: Math.round(rung2 * f) });
}
const levy = (await post('/api/alliance/info', { token: tokens.Builder })).body?.levy;

/* Something worth helping. The WALL, not the Town Hall: the kit leaves a Town Hall of 20 with low
   farms behind it, so "the Town Hall must lead the rest of the hold" refuses that upgrade — which
   cost the server test an afternoon before it was written down. */
const built = await post('/api/action', { token: tokens.Builder, action:'upgrade', params:{ key:'wall' } });
const bq = built.body?.state?.bq;
const info = await post('/api/alliance/info', { token: tokens.Builder });
const view = info.body?.alliance;

/* Does the raid pair actually work? Ask, rather than trust the setup. */
const rlist = await post('/api/raid', { token: tokens.Raider });
const seen = (rlist.body?.raid?.targets || []).find(t => t.name === 'Target');
const raidReady = !!seen && !seen.shielded && seen.inBracket;
const whyNot = !seen ? 'Target is not in Raider\'s target list (out of bracket, or another reach)'
  : seen.shielded ? 'Target is shielded' : !seen.inBracket ? 'Target is out of bracket' : '';

const mins = bq ? Math.round((bq.end - bq.start) / 60000) : 0;
console.log(`
  ── the alliance lab is up ──

  Open ${BASE}  in two windows. One must be a separate browser profile or a private
  window: the sign-in is kept in localStorage, so two normal tabs share one account.

     ${HOLDS.map(h => h.name.padEnd(8) + ' password ' + PASS + '   — ' + h.role).join('\n     ')}

  All five hold an Embassy 3. Builder and Helper share [LWCH] The Long Watch; Raider and Target
  are in no alliance, because the server refuses a raid on your own alliance.
  Builder has a Wall upgrade running: ${mins} minutes.
  ${view ? `A help is worth ${view.helpPct}% each, up to ${view.helpCap} per build.` : ''}

  ── to test alliance help ──
    1. Sign in as Helper, open the Alliance tab, press "🤝 Help all".
    2. Sign in as Builder and watch the Wall timer drop by about ${Math.round(mins * 0.015 * 60)}s.
    3. Press Help again as Helper — nothing happens. One help per hold per build.
       Sign in as a third account to shave more off.
    Look for: a hold with no Embassy refused WITH A REASON, not a dead button; a short build that
    cannot be erased; and the panel stating what a help is worth before you spend the tap.

  ── to test the Levy: the one event nobody can finish alone ──
    ${levy && levy.rungs ? `Running now: ${levy.icon} ${levy.name}, ${Math.round(levy.endsIn/3600000)}h left.
    The alliance is on ${levy.total} of ${levy.rungs[3].at} — ${levy.holds} holds × ${levy.rungs[3].per} each.
    Rung 1 at ${levy.rungs[0].at} is ${levy.rungs[0].done ? 'already cleared' : 'not cleared yet'}.`
    : 'NOT READY — no Levy view came back from the server.'}
    1. Sign in as Builder, open the Events tab, scroll to the 🤝 Levy card.
    2. Play a little — any wave held or job finished adds to the SHARED total, not just your own.
    3. Sign in as Helper and look at the same card: the same total, your own part different, and
       Builder named above or below you in the column.
    4. Press Help on Builder's build as Helper — helping is worth ${levy && levy.rungs ? '150' : '—'} to the Levy,
       which is the only deed in the game that needs an alliance to happen at all.
    Look for: one total for everybody; your own contribution shown separately; a per-hold target
    rather than a bare number; and clearing rung 3 promising the Banner for tomorrow rather than now.
    Sign in as Raider — no alliance — and the same card should explain what the Levy is and offer a
    way to join one, not sit blank.

  ── to test attacking each other ──
    ${raidReady ? 'Raider can reach Target right now.' : 'NOT READY — ' + whyNot}
    1. Sign in as Raider, open the War tab, find Target under Raids, send a column.
    2. Sign in as Target and watch the incoming column, then the defence report.
    Look for: your own troops only WOUNDED defending, some of the attacker's column DEAD;
    only raw goods looted, never steel or Electrum; and a Writ of Peace handed to the loser.

  Note the four holds are all at Town Hall 20, which is past the Founder's Peace. Two brand-new
  holds could NOT attack each other for 72 hours — that is the shield working, not a bug.

  ^C stops the server. Data lives in server/data-lab — delete it to start fresh.
`);
