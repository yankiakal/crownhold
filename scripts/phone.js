// Render the game at true phone widths: `npm run phone`
//
// Copies dist/ and tools/phone.html into one temp directory so the iframe is same-origin
// (a cross-origin frame cannot be measured), serves it, and screenshots the rack.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, cpSync, copyFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 8918;
if(!existsSync(CHROME)){ console.log('Chrome not found — skipping the phone rack.'); process.exit(0); }
if(!existsSync('dist/index.html')){ console.log('run `npm run build` first'); process.exit(1); }

const dir = mkdtempSync(join(tmpdir(), 'crownhold-phone-'));
cpSync('dist', dir, { recursive: true });
mkdirSync(join(dir, 'tools'), { recursive: true });
copyFileSync('tools/phone.html', join(dir, 'tools', 'phone.html'));

const srv = spawn('python3', ['-m','http.server', String(PORT), '--directory', dir], { stdio:'ignore' });
const stop = () => { try { srv.kill(); } catch {} rmSync(dir, { recursive:true, force:true }); };
process.on('exit', stop);
await new Promise(r => setTimeout(r, 900));

mkdirSync('shots', { recursive: true });
const res = spawnSync(CHROME, [
  '--headless=new','--disable-gpu','--hide-scrollbars',
  '--window-size=1450,1000','--virtual-time-budget=20000',
  '--screenshot=shots/phone.png',
  'http://localhost:' + PORT + '/tools/phone.html',
], { encoding:'utf8' });

const dom = spawnSync(CHROME, [
  '--headless=new','--disable-gpu','--hide-scrollbars',
  '--window-size=1450,1000','--virtual-time-budget=20000','--dump-dom',
  'http://localhost:' + PORT + '/tools/phone.html',
], { encoding:'utf8', maxBuffer: 64*1024*1024 });
stop();

const m = (dom.stdout||'').match(/<pre id="out"[^>]*>([\s\S]*?)<\/pre>/);
const body = m ? m[1].replace(/@@PHONE@@|@@END@@/g,'').replace(/&quot;/g,'"').replace(/&amp;/g,'&').trim() : '';
console.log('\n── the game at real phone widths ──');
console.log(body || '(no report — the frames may not have booted)');
console.log('\n  shots/phone.png');
if(/OVERFLOWS/.test(body)) process.exit(1);
