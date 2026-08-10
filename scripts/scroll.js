// Does a sheet stay where you scrolled it? `npm run scroll`
//
// Reported from play: "I can't scroll down on anything, for example the Codex, when I'm trying to
// gather the popup windows." verify-ui cannot see this — it renders against a stub DOM with no
// layout, so nothing there has a scrollHeight and nothing can scroll. This drives a real Chrome,
// scrolls a real overflowing sheet, waits past two ticks of the 250ms render loop, and reads the
// scroll position back.
//
// HOW THE RESULT GETS OUT, and why not the obvious way. The first version of this used
// `--virtual-time-budget` with `--dump-dom`, the same pair screens.js uses. It hung twice and
// passed once, which is worse than failing: the page runs a 250ms interval and the probe is a
// chain of awaits, and under virtual time that combination never reliably reached the dump. So the
// page POSTs its report to this server instead and the script waits for the POST, on real time,
// with a hard ceiling. Nothing here can stall a `npm run check`.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, cpSync, copyFileSync, rmSync, mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, normalize } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 8923;
const DEADLINE_MS = 60000;
if(!existsSync(CHROME)){ console.log('Chrome not found — skipping.'); process.exit(0); }
if(!existsSync('dist/index.html')){ console.log('run `npm run build` first'); process.exit(1); }

const dir = mkdtempSync(join(tmpdir(), 'crownhold-scroll-'));
cpSync('dist', dir, { recursive: true });
cpSync('src', join(dir, 'src'), { recursive: true });
mkdirSync(join(dir, 'tools'), { recursive: true });
copyFileSync('tools/scroll.html', join(dir, 'tools', 'scroll.html'));
/* No service worker in the probe. main.js reloads the page on `controllerchange`, which is right in
   a browser — it is how a player gets a new build without clearing their cache — and wrong here:
   the worker installs, takes control, the iframe reloads, and the probe restarts underneath
   itself. Deleting sw.js makes registration 404 and fall into its own .catch(). */
rmSync(join(dir, 'sw.js'), { force: true });

const TYPES = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
                '.json':'application/json', '.png':'image/png', '.svg':'image/svg+xml' };
let resolveReport;
const reported = new Promise(r => { resolveReport = r; });

const srv = createServer((req, res) => {
  if(req.method === 'POST' && req.url === '/report'){
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => { res.writeHead(204).end(); resolveReport(body); });
    return;
  }
  // static, confined to the temp dir
  const rel = normalize(decodeURIComponent((req.url || '/').split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  const path = join(dir, rel === '/' ? 'index.html' : rel);
  if(!path.startsWith(dir) || !existsSync(path) || !readFileSync) return res.writeHead(404).end();
  try {
    const ext = (path.match(/\.[a-z]+$/) || [''])[0];
    res.writeHead(200, { 'content-type': TYPES[ext] || 'application/octet-stream' });
    res.end(readFileSync(path));
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => srv.listen(PORT, r));

const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--hide-scrollbars',
  '--no-first-run','--no-default-browser-check','--user-data-dir=' + join(dir, 'profile'),
  '--window-size=1200,1000',
  'http://localhost:' + PORT + '/tools/scroll.html'], { stdio:'ignore' });

const clean = () => {
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv.close(); } catch {}
  /* Retries, and swallowed. A just-killed Chrome is still writing its profile directory, so a bare
     rmSync throws ENOTEMPTY and turns a green probe into a non-zero exit — which is exactly the trap
     verify-server.mjs already documents for the same reason. A leftover temp directory is not a
     failure of the thing being measured. */
  try { rmSync(dir, { recursive:true, force:true, maxRetries:10, retryDelay:80 }); }
  catch { /* the OS will get it */ }
};

const report = await Promise.race([
  reported,
  new Promise(r => setTimeout(() => r(null), DEADLINE_MS)),
]);
clean();

console.log('\n── does a sheet stay where you put it? ──');
if(report == null){
  console.log('  ✗ the probe never reported within ' + (DEADLINE_MS/1000) + 's — nothing measured, which is not a pass');
  process.exit(1);
}
console.log(report.trim().split('\n').map(l => '  ' + l).join('\n'));

/* The badge findings are assertions too, not decoration. Printing "OFF THE WALLS" and exiting 0
   would make this a log rather than a check — which is the failure mode every harness in this repo
   has had at least once. */
const badgeFaults = ['MISSING', 'OFF THE WALLS', 'NO TIME SHOWN', 'NO SHEET',
                     'NO BUILDABLE BUILDING', 'SCROLLED AWAY'].filter(t => report.includes(t));

/* The frontier's own faults, kept separate so the message names the right camera. CLIPPED is the
   one that hid the map: a canvas never given width/height is 300×150, and drawMap paints an 840×504
   world into it. */
const mapFaults = ['NO MAP CANVAS', 'CLIPPED', 'BLURRY', 'TOO SMALL TO TAP',
                   'CANNOT ZOOM OUT', 'VOID', 'BURIES THE MAP',
                   'NOWHERE TO GO', 'STUCK', 'UNDER THE CARD'].filter(t => report.includes(t));

const lost = (report.match(/LOST/g) || []).length;
const kept = (report.match(/KEPT/g) || []).length;
const blind = /COULD NOT OPEN|NO SCROLLER FOUND|nothing to scroll/.test(report);
console.log('');
if(!lost && !kept){
  console.log('  ✗ nothing scrollable was measured — not a pass');
  process.exit(1);
}
if(lost){
  console.log('  ✗ ' + lost + ' surface(s) lose the scroll position across a render tick');
  process.exit(1);
}
if(blind){
  console.log('  ✗ ' + kept + ' held, but a surface could not be measured — see above');
  process.exit(1);
}
if(badgeFaults.length){
  console.log('  ✗ the scene badges: ' + badgeFaults.join(', '));
  process.exit(1);
}
if(mapFaults.length){
  console.log('  ✗ the frontier camera: ' + mapFaults.join(', '));
  process.exit(1);
}
if(!report.includes('WHOLE MAP')){
  console.log('  ✗ the frontier camera was never measured — not a pass');
  process.exit(1);
}
console.log('  ✓ ' + kept + ' surface(s) hold their scroll position across a render tick'
  + (report.includes('ON THE WALLS') ? ', and a build timer sits on its building' : ''));
