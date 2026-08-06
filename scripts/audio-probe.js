// Measure every synthesised cue: `npm run verify:audio`
//
// Serves the repo, renders each cue through an OfflineAudioContext in headless Chrome,
// and checks the waveform. This is the only test in the suite that can tell a working
// cue from a silent one — verify-ui.mjs runs in Node, which has no audio at all, so
// everything it asserts is about not throwing.
//
// Skips cleanly without Chrome, like the screenshot script: a machine that cannot run
// this should not fail the build over it.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, cpSync, appendFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 8903;

/* Thresholds. Deliberately loose: this is a smoke test for "does sound come out",
   not a mix. A cue below FLOOR is inaudible; one above CEIL clips at the destination
   and sounds like a fault rather than a game. */
const FLOOR = 0.01;    // peak amplitude
const CEIL = 0.95;
const RMS_FLOOR = 0.0002;
/* The bed is ambience: it must be audible but must never compete with a cue, so it has
   its own floor and is additionally checked as a RATIO against the loudest cue below. */
const BED_FLOOR = 0.008;   // about 25 dB under the loudest cue: quiet, but there
const LATE_MS = 60;    // a tap that starts later than this reads as lag

if(!existsSync(CHROME)){
  console.log('Chrome not found at ' + CHROME + ' — skipping the audio probe.');
  console.log('The audio layer is covered for inertness by verify:ui; this step is what');
  console.log('proves the cues actually make a sound, and it needs a real browser.');
  process.exit(0);
}

/* A temp copy of the tree with ONE export appended to audio.js — the reset the probe
   needs to hand the module a fresh context per measurement. Shipped code stays clean;
   this is the arrangement verify-ui.mjs uses to reach the column composer.

   It reaches into module-scope bindings by name, so it breaks loudly if any of them is
   renamed, which is the correct failure: a reset that silently misses `last` would leave
   the debounce armed and every cue after the first would measure as silent. */
const dir = mkdtempSync(join(tmpdir(), 'crownhold-audio-'));
cpSync(new URL('../src', import.meta.url), join(dir, 'src'), { recursive:true });
cpSync(new URL('../tools', import.meta.url), join(dir, 'tools'), { recursive:true });
appendFileSync(join(dir, 'src', 'audio.js'),
  '\nexport function _reset(){' +
  '\n  stopBed(); ctx = null; master = null; bed = null; buf = null;' +
  '\n  for(const k of Object.keys(last)) delete last[k];' +
  '\n  seen = null; warned = 0;' +
  '\n}\n');

const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', dir],
                  { stdio:'ignore' });
const stop = () => { try { srv.kill(); } catch {} rmSync(dir, { recursive:true, force:true }); };
process.on('exit', stop);
await new Promise(r => setTimeout(r, 900));

/* The cue list comes from the module itself, in Node — audio.js touches no browser API
   at import, which is the property verify:ui asserts. So the names measured here cannot
   drift from the names that exist. */
const { CUES } = await import('../src/audio.js');
const names = [...Object.keys(CUES), '__wind'];

/* Scoped to the elements, NOT searched across the whole dump. --dump-dom emits the inline
   <script> source too, so a bare search for either marker finds the page's own code first
   and reports the source of the error handler as the error. That cost two rounds of
   debugging: once blaming the JSON parser, once quoting my own template literal back as a
   stack trace. */
const inside = (dom, id) => {
  const m = dom.match(new RegExp('<pre id="' + id + '">([\\s\\S]*?)</pre>'));
  return m ? m[1] : '';
};

/* One Chrome per cue. A page that renders exactly once always finishes before the dump;
   a page that renders fourteen times in sequence loses a race against the load event,
   and raising --virtual-time-budget only moved the loss from cue 2 to cue 12. */
const rows = [];
for(const name of names){
  const res = spawnSync(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    /* One render per page still LOSES the race sometimes — it got as far as "loss"
       before dumping mid-render. So both halves are needed: one rendering, so the work
       is short, and a virtual clock, so the dump waits for it. Either alone is flaky. */
    '--autoplay-policy=no-user-gesture-required',
    '--virtual-time-budget=20000', '--dump-dom',
    'http://localhost:' + PORT + '/tools/audio-probe.html?cue=' + encodeURIComponent(name),
  ], { encoding:'utf8', maxBuffer: 32 * 1024 * 1024 });
  const dom = res.stdout || '';
  const status = inside(dom, 'status');
  if(/PROBE FAILED/.test(status)){ console.error('audio-probe: ' + status.trim()); process.exit(1); }
  const m = inside(dom, 'out').match(/@@AUDIO@@([\s\S]*?)@@END@@/);
  if(!m){
    console.error('audio-probe: no payload for "' + name + '". #status said: '
      + (status.trim() || '(nothing)'));
    process.exit(1);
  }
  try { rows.push(JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'))); }
  catch(e){ console.error('audio-probe: bad JSON for "' + name + '" — ' + e.message); process.exit(1); }
}
stop();

const isBed = r => r.name[0] === '(';
const cues = rows.filter(r => !isBed(r));
const bed = rows.find(isBed);

console.log('\n── every cue makes a sound, and none of them clips ──');
console.log('  cue                  peak      rms   starts    verdict');
let bad = 0;
for(const r of rows){
  const problems = [];
  if(r.played === false) problems.push('cue() refused it');
  if(r.peak > CEIL) problems.push('CLIPS');
  if(isBed(r)){
    /* The bed is held to a different standard on purpose. A one-shot has to be clearly
       audible; ambience has to be PRESENT and SUBORDINATE, which is a relative property,
       so it is checked against the cues rather than against a constant. */
    if(r.peak < BED_FLOOR) problems.push('SILENT');
  }else{
    if(r.peak < FLOOR) problems.push('SILENT');
    if(r.rms < RMS_FLOOR) problems.push('empty');
    if(r.startMs < 0 || r.startMs > LATE_MS) problems.push('late');
  }
  if(problems.length) bad++;
  console.log('  ' + r.name.padEnd(20)
    + r.peak.toFixed(3).padStart(6)
    + r.rms.toFixed(4).padStart(9)
    + (r.startMs < 0 ? '    —' : (r.startMs.toFixed(1) + 'ms').padStart(9))
    + '    ' + (problems.length ? '✗ ' + problems.join(', ') : '✓'));
}

const loudest = cues.reduce((a, r) => r.peak > a.peak ? r : a);
const quietest = cues.reduce((a, r) => r.peak < a.peak ? r : a);
console.log('\n  loudest cue is "' + loudest.name + '" at ' + loudest.peak.toFixed(3)
  + ' — headroom to clipping ×' + (1 / loudest.peak).toFixed(2));
console.log('  quietest cue is "' + quietest.name + '" at ' + quietest.peak.toFixed(3));

/* Subordination, the property that actually matters for ambience. The resting bed is
   measured; how far above it full threat goes is exact (bedLevel), so the full-threat peak
   is a measured number times an exact ratio rather than a render of an exponential ramp
   that never settles. */
if(bed){
  const atThreat = bed.peak * (bed.loudRatio || 1);
  const ratio = atThreat / loudest.peak;
  const ok = ratio < 0.6;
  if(!ok) bad++;
  console.log('  the wind rests at ' + bed.peak.toFixed(3) + ' and reaches '
    + atThreat.toFixed(3) + ' at full threat — ×' + ratio.toFixed(2) + ' of the loudest cue'
    + (ok ? ' ✓ subordinate' : ' ✗ TOO LOUD — ambience must stay under the foreground'));
}

if(bad){
  console.error('\naudio-probe: ' + bad + ' cue(s) failed.');
  process.exit(1);
}
console.log('  all ' + rows.length + ' pass\n');
