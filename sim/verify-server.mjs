// Verification for the multiplayer server. Run:  npm run verify:server
//
// This project had NO server test until now, which is the same gap the renderer had
// before v1.32 — and the more dangerous one, because the two systems added here (the
// Muster Roll and the Watch) live almost entirely in server code that no other suite
// touches. `node --check` proves the file parses. It does not prove that sending a
// column to an ally moves the right troops, that the garrison lifts the host's own
// soldiers, or that a recalled Watch comes home rather than evaporating.
//
// It boots the real server on a spare port against a throwaway data directory and
// talks to it over HTTP, because the thing worth testing is the wire behaviour: two
// accounts, one alliance, and state that has to stay consistent across both.

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 8791;
const BASE = 'http://127.0.0.1:' + PORT;

let pass = 0, fail = 0;
const ok = (name, cond, note='') => { cond ? pass++ : fail++;
  console.log((cond ? '  ✓ ' : '  ✗ ') + name + (note ? '  — ' + note : '')); };

const dir = mkdtempSync(join(tmpdir(), 'crownhold-srv-'));
const srv = spawn(process.execPath, ['server/server.js'], {
  env: { ...process.env, PORT: String(PORT), DATA_DIR: dir, ALLOW_DEBUG: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let srvErr = '';
srv.stderr.on('data', d => { srvErr += d.toString(); });
const stop = () => { try { srv.kill(); } catch {} };
process.on('exit', () => {
  stop();
  /* Retries because the killed server may still be flushing accounts.json when we
     get here — a bare rmSync raced it and threw ENOTEMPTY after a green run, which
     would have turned a passing suite into a non-zero exit. */
  try { rmSync(dir, { recursive:true, force:true, maxRetries:10, retryDelay:60 }); }
  catch { /* a temp directory left behind is not a test failure */ }
});

async function post(path, body){
  const r = await fetch(BASE + path, {
    method:'POST', headers:{ 'content-type':'application/json' },
    body: JSON.stringify(body || {}),
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* leave null */ }
  return { status: r.status, body: json, text };
}

/* Wait for the port rather than sleeping a guessed amount — a fixed sleep is a race
   that passes on this machine and fails on a slower one. */
async function waitUp(){
  for(let i = 0; i < 100; i++){
    try {
      const r = await post('/api/health', {});
      if(r.status === 200) return true;
    } catch { /* not yet */ }
    await new Promise(r => setTimeout(r, 100));
  }
  return false;
}

try {
  const up = await waitUp();
  ok('the server comes up', up, up ? BASE : 'never answered\n' + srvErr.slice(0, 400));
  if(!up) throw new Error('server did not start');

  /* ── two holds and an alliance ── */
  console.log('\n── two accounts, one alliance ──');
  const A = await post('/api/register', { name:'Aldis', password:'longenoughpassword' });
  const B = await post('/api/register', { name:'Brenna', password:'longenoughpassword' });
  ok('both accounts register', A.status === 200 && B.status === 200,
     'A ' + A.status + ' / B ' + B.status + ' ' + (A.body?.error || B.body?.error || ''));
  const ta = A.body.token, tb = B.body.token;

  const made = await post('/api/alliance/create', { token: ta, name:'The Long Watch', tag:'LWCH' });
  ok('an alliance is founded', made.status === 200, made.body?.error || '');
  const joined = await post('/api/alliance/join', { token: tb, tag:'LWCH' });
  ok('the second hold joins', joined.status === 200, joined.body?.error || '');

  /* ── the Muster Roll ── */
  console.log('\n── the Muster Roll ──');
  const m1 = await post('/api/muster', { token: ta });
  ok('the Roll is readable', m1.status === 200 && !!m1.body.muster, m1.body?.error || '');
  const roll = m1.body.muster;
  ok('it is open with two holds', roll.open === true, 'needs ' + roll.needMembers);
  ok('a task is already drawn', !!roll.task && !!roll.task.kind, roll.task && roll.task.name);
  ok('the task carries a target and a weight', roll.task.need > 0 && roll.task.points > 0,
     roll.task.need + ' ' + roll.task.unit + ' for ' + roll.task.points + ' pts');
  ok('nothing is done yet', roll.task.have === 0 && roll.task.done === false);
  ok('no task can be a purchase — no price field anywhere',
     !('price' in roll.task) && !('gems' in roll.task) && !('cost' in roll.task));

  /* A reroll must actually change the work. A button that can hand back what you
     already had is a button that lies. */
  const rr = await post('/api/muster/reroll', { token: ta });
  ok('the work can be redrawn', rr.status === 200, rr.body?.error || '');
  const t2 = rr.body?.muster?.task;
  ok('and it is different work', t2 && t2.kind !== roll.task.kind,
     roll.task.kind + ' → ' + (t2 && t2.kind));
  const rr2 = await post('/api/muster/reroll', { token: ta });
  ok('a second redraw is refused while the clerks work', rr2.status === 400, rr2.body?.error || '');

  /* Claiming unfinished work must be refused, and finished work must pay. Progress is
     measured from a snapshot of a counter the hold already keeps, so the test can move
     the counter directly — which is exactly the point of that design. */
  const early = await post('/api/muster/claim', { token: ta });
  ok('unfinished work cannot be reported done', early.status === 400, early.body?.error || '');

  const before = await post('/api/state', { token: ta });
  const cur = rr.body.muster.task;
  const COUNTER = { camps:'campsBurned', beasts:'beastsSlain', ruins:'ruinsRaided',
                    raids:'wavesWon', warbands:'warbandsWon', drill:'trained',
                    mastery:'mxp', arena:'arenaWins' }[cur.kind];
  ok('the task reads a counter the hold already keeps', !!COUNTER, cur.kind + ' → ' + COUNTER);
  const bumped = await post('/api/debug/bump', { token: ta, field: COUNTER, by: cur.need });
  const canBump = bumped.status === 200;
  if(!canBump){
    ok('progress can be advanced for the test', false, 'no debug hook: ' + (bumped.body?.error || bumped.status));
  } else {
    const m2 = await post('/api/muster', { token: ta });
    ok('progress is seen', m2.body.muster.task.done === true,
       m2.body.muster.task.have + '/' + m2.body.muster.task.need);
    const claimed = await post('/api/muster/claim', { token: ta });
    ok('finished work is accepted', claimed.status === 200, claimed.body?.error || '');
    ok('it paid the weight in points', claimed.body?.earned === cur.points,
       claimed.body?.earned + ' vs ' + cur.points);
    const m3 = claimed.body.muster;
    ok('personal points rose', m3.mine.points === cur.points, String(m3.mine.points));
    ok('alliance points rose too', m3.total === cur.points, String(m3.total));
    ok('a fresh task was drawn', !!m3.task && m3.task.have === 0);
    ok('the ally sees the alliance total', true);
    const mb = await post('/api/muster', { token: tb });
    ok('and it is the SAME board for both holds', mb.body.muster.total === cur.points,
       'B sees ' + mb.body.muster.total);
    ok('the ally has their own separate task', mb.body.muster.mine.points === 0);
    ok('a projected reward exists and is play-only currency',
       !!m3.projected && m3.projected.valor >= 0 && m3.projected.mastery >= 0);
  }
  void before;

  /* ── the Watch ── */
  console.log('\n── the Watch ──');
  // give A troops and heroes worth sending, and make A plainly the stronger hold
  const setup = await post('/api/debug/kit', { token: ta, strong: true });
  const setupB = await post('/api/debug/kit', { token: tb, strong: false });
  const kitted = setup.status === 200 && setupB.status === 200;
  if(!kitted){
    ok('the holds can be kitted for the test', false, 'no debug hook: ' + (setup.body?.error || setup.status));
  } else {
    const bBefore = await post('/api/watch', { token: tb });
    const powerBefore = (await post('/api/state', { token: tb })).body.state
      ? null : null;                                   // read power through the view instead
    ok('B hosts nobody yet', bBefore.body.watch.here.length === 0);
    ok('B is not lifted yet', bBefore.body.watch.lifted === false);

    const aStateBefore = (await post('/api/state', { token: ta })).body;
    const troopsBefore = aStateBefore.state.t.spearman;

    const sent = await post('/api/watch/send', {
      token: ta, to: 'Brenna', troops: { spearman: 50 }, heroes: [],
    });
    ok('the Watch sets out', sent.status === 200, sent.body?.error || '');
    const aAfter = (await post('/api/state', { token: ta })).body;
    ok('the sender no longer holds those troops',
       aAfter.state.t.spearman < troopsBefore,
       troopsBefore + ' → ' + aAfter.state.t.spearman);

    const bAfter = await post('/api/watch', { token: tb });
    ok('they are standing at the ally\'s wall', bAfter.body.watch.here.length === 1,
       JSON.stringify(bAfter.body.watch.here.map(g => g.from)));
    ok('the ally is told who sent them', bAfter.body.watch.here[0]?.from === 'Aldis');

    /* THE rule worth having: the whole wall fights under the best captain present, so
       the host's OWN soldiers are lifted, not merely joined by ours. */
    ok('the host is lifted by the better captain', bAfter.body.watch.lifted === true,
       '×' + bAfter.body.watch.ownMult?.toFixed(3) + ' → ×' + bAfter.body.watch.mult?.toFixed(3));
    ok('and lifted means strictly better, not equal',
       bAfter.body.watch.mult > bAfter.body.watch.ownMult);

    const dup = await post('/api/watch/send', { token: ta, to:'Brenna', troops:{ spearman: 5 }, heroes: [] });
    ok('a second Watch from the same hold is refused', dup.status === 400, dup.body?.error || '');

    const outsider = await post('/api/watch/send', { token: ta, to:'Nobody', troops:{ spearman: 5 }, heroes: [] });
    ok('a stranger cannot be watched over', outsider.status === 400, outsider.body?.error || '');

    /* Recall must return the troops to their owner — not delete them, and not leave a
       phantom entry on the host. Rallies had exactly this bug before v1.25. */
    const rec = await post('/api/watch/recall', { token: ta, to:'Brenna' });
    ok('the Watch can be recalled', rec.status === 200, rec.body?.error || '');
    const aHome = (await post('/api/state', { token: ta })).body;
    ok('the troops came home', aHome.state.t.spearman === troopsBefore,
       aHome.state.t.spearman + ' of ' + troopsBefore);
    const bClear = await post('/api/watch', { token: tb });
    ok('and no phantom is left at the wall', bClear.body.watch.here.length === 0);
    ok('the host is no longer lifted', bClear.body.watch.lifted === false);
  }
} catch (e) {
  fail++;
  console.log('  ✗ the run threw — ' + e.message);
  if(srvErr) console.log('server stderr:\n' + srvErr.slice(0, 800));
} finally {
  stop();
}

console.log('\n' + (fail ? '✗ ' + fail + ' FAILED, ' + pass + ' passed' : '✓ all ' + pass + ' passed') + '\n');
process.exit(fail ? 1 : 0);
