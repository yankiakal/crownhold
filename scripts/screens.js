// Every tab of the game at phone width, with a played-in hold: `npm run screens`
//
// Serves dist/ plus src/ plus the harness from one temp dir so the iframes are same-origin and
// the harness can import freshState to build the save it seeds.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, cpSync, copyFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 8921;
if(!existsSync(CHROME)){ console.log('Chrome not found — skipping.'); process.exit(0); }
if(!existsSync('dist/index.html')){ console.log('run `npm run build` first'); process.exit(1); }

const dir = mkdtempSync(join(tmpdir(), 'crownhold-screens-'));
cpSync('dist', dir, { recursive: true });
cpSync('src', join(dir, 'src'), { recursive: true });
mkdirSync(join(dir, 'tools'), { recursive: true });
copyFileSync('tools/screens.html', join(dir, 'tools', 'screens.html'));

const srv = spawn('python3', ['-m','http.server', String(PORT), '--directory', dir], { stdio:'ignore' });
const stop = () => { try { srv.kill(); } catch {} rmSync(dir, { recursive:true, force:true }); };
process.on('exit', stop);
await new Promise(r => setTimeout(r, 900));

mkdirSync('shots', { recursive: true });
const args = ['--headless=new','--disable-gpu','--hide-scrollbars',
  '--window-size=2450,960','--virtual-time-budget=25000'];
spawnSync(CHROME, [...args, '--screenshot=shots/screens.png',
  'http://localhost:' + PORT + '/tools/screens.html'], { encoding:'utf8' });

/* Two readable halves at 2×, alongside the contact sheet. Six frames across at 1× proves the
   layout fits and says nothing about how it READS, which is the only reason to look at it. */
for(const [name, tabs] of [['phone-a','hold,war,world'], ['phone-b','court,ledger']]){
  spawnSync(CHROME, ['--headless=new','--disable-gpu','--hide-scrollbars',
    '--window-size=1290,960','--force-device-scale-factor=2','--virtual-time-budget=25000',
    '--screenshot=shots/' + name + '.png',
    'http://localhost:' + PORT + '/tools/screens.html?tabs=' + tabs], { encoding:'utf8' });
  console.log('  shots/' + name + '.png  (' + tabs + ')');
}
const dom = spawnSync(CHROME, [...args, '--dump-dom',
  'http://localhost:' + PORT + '/tools/screens.html'], { encoding:'utf8', maxBuffer: 64*1024*1024 });
stop();

const m = (dom.stdout||'').match(/<pre id="out"[^>]*>([\s\S]*?)<\/pre>/);
const body = m ? m[1].replace(/@@SCREENS@@|@@END@@/g,'').replace(/&quot;/g,'"').replace(/&amp;/g,'&').trim() : '';
console.log('\n── every tab, 393px wide, mid-game hold ──');
console.log(body || '(no report — the frames may not have booted)');
console.log('\n  shots/screens.png');
/* The chrome budget is a ceiling, not a report. The header and threat bar sit outside the tab
   panes, so whatever they cost is paid on all six screens — it was 51% of a phone's first screen
   before anyone measured it, and nothing would have complained. 45% is loose enough for real
   design and tight enough that a new always-visible row cannot quietly eat the game. */
const chrome = body.match(/\((\d+)% of the first screen\)/);
if(chrome && Number(chrome[1]) > 45){
  console.error('\n  ✗ chrome is ' + chrome[1] + '% of a phone screen — budget is 45%.');
  console.error('    The header and threat bar are outside the tabs, so this is paid six times.');
  process.exit(1);
}
/* Tap targets. The frontier was 26px per cell on a phone — you could not reliably hit a tile,
   and you certainly could not read what garrison it held, which is the entire point of scouting
   one. 44px is the floor every mobile guideline agrees on. */
if(/under the 44px/.test(body)){
  console.error('\n  ✗ the frontier map is below thumb size — see the cell measurement above.');
  process.exit(1);
}
/* Every tap target, not just the dock's. 44px is the floor every mobile guideline agrees on, and
   between 24 and 44 elements per screen were under it before anyone counted. */
const tiny = body.match(/under 44px: (\d+) of/);
if(tiny && Number(tiny[1]) > 0){
  console.error('\n  ✗ ' + tiny[1] + ' tap targets are under 44px — see the tally above.');
  process.exit(1);
}
if(/NO VERSION VISIBLE|footer still taking space|BUTTONS BURIED/.test(body)){
  console.error('\n  ✗ the dock is wrong — see the measurement above.');
  process.exit(1);
}
if(/OWNS THE SCREEN/.test(body)){
  console.error('\n  ✗ the lesson card is taking too much of the screen — it is a notification.');
  process.exit(1);
}
if(/CLIPPED/.test(body)){
  console.error('\n  ✗ something is wider than the screen with no way to pan to the rest of it.');
  process.exit(1);
}
if(/COVERED by the sheet/.test(body)){
  console.error('\n  ✗ an open sheet is covering the resource row.');
  process.exit(1);
}
if(/OVERFLOWS|undefined|unreadable/.test(body)) process.exit(1);
