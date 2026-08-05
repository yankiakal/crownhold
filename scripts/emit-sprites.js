// Generate the building sprite strips: `npm run sprites`
//
// Serves the repo, loads tools/emit-sprites.html in headless Chrome, and reads the
// PNGs back out of the dumped DOM. No image library, no packer, no dependency — the
// browser already has a PNG encoder and a canvas, so the only thing missing was a
// way to get bytes out of it, and --dump-dom is that way.
//
// The art it writes is the CURRENT procedural rendering, exported. That is
// deliberate: it makes the sprite path shippable and testable before any real art
// exists, and it prints the spec (cell size and anchor per building) that real art
// has to hit.

import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 8901;
const OUT = 'public/art';

if(!existsSync(CHROME)){
  console.log('Chrome not found at ' + CHROME + ' — cannot generate sprites here.');
  console.log('The game runs fine without art: every building falls back to the');
  console.log('procedural renderer, which is what ships today.');
  process.exit(0);
}

const srv = spawn('python3', ['-m', 'http.server', String(PORT)], { stdio:'ignore' });
const stop = () => { try { srv.kill(); } catch {} };
process.on('exit', stop);

await new Promise(r => setTimeout(r, 900));

const res = spawnSync(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars',
  '--virtual-time-budget=30000', '--dump-dom',
  'http://localhost:' + PORT + '/tools/emit-sprites.html',
], { encoding:'utf8', maxBuffer: 512 * 1024 * 1024 });
stop();

const dom = res.stdout || '';
const m = dom.match(/@@SPRITES@@([\s\S]*?)@@END@@/);
if(!m){
  console.error('emit-sprites: the page produced no payload.');
  console.error('First 400 chars of the dump:\n' + dom.slice(0, 400));
  process.exit(1);
}

/* The DOM dump is HTML-escaped, so the JSON has to be un-escaped before parsing.
   Only these four matter — a data: URI contains no other markup-significant
   characters, and quietly mangling one would produce a corrupt PNG rather than an
   error. */
const json = m[1]
  .replace(/&quot;/g, '"').replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>');

let payload;
try { payload = JSON.parse(json); }
catch(e){ console.error('emit-sprites: payload was not valid JSON — ' + e.message); process.exit(1); }

const { manifest, files } = payload;
const keys = Object.keys(files || {});
if(!keys.length){ console.error('emit-sprites: no sprites in the payload.'); process.exit(1); }

rmSync(OUT, { recursive:true, force:true });
mkdirSync(OUT, { recursive:true });

let bytes = 0;
for(const key of keys){
  const b64 = files[key].replace(/^data:image\/png;base64,/, '');
  const buf = Buffer.from(b64, 'base64');
  if(buf.length < 100){ console.error('emit-sprites: ' + key + ' decoded to nothing'); process.exit(1); }
  writeFileSync(join(OUT, key + '.png'), buf);
  bytes += buf.length;
}
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');

console.log(keys.length + ' sprite strips → ' + OUT + '/');
console.log('total ' + (bytes/1024).toFixed(0) + ' KB (' + (bytes/1024/keys.length).toFixed(1) + ' KB each)');
console.log('\nthe spec real art has to hit — cell size and anchor, in CSS pixels:');
for(const key of keys.sort()){
  const e = manifest[key];
  console.log('  ' + key.padEnd(11) + 'cell ' + e.cell[0] + '×' + e.cell[1] +
              '   anchor ' + e.anchor[0] + ',' + e.anchor[1] +
              '   strip ' + (e.cell[0]*e.tiers*e.scale) + '×' + (e.cell[1]*e.scale) + 'px at ' + e.scale + '×');
}
