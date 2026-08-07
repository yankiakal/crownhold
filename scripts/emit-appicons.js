// App icon and splash sources for the stores: `npm run appicons`
//
// Both stores want one large square each and generate the rest. @capacitor/assets does the
// generating; this makes the two sources it needs, from the game's own palette rather than from an
// image nobody can regenerate.
//
// Rasterised with headless Chrome. There is no SVG converter on this machine — no ImageMagick, no
// rsvg — and adding one to build two PNGs is a poor trade when the toolchain already includes a
// browser that renders better than either. Same reason the sound and sprite pipelines emit specs
// rather than binaries: the recipe is the artefact, and it stays in the repo.
//
// NO EMOJI IN THESE FILES, and that is a legal line rather than a taste one. The game draws 🏰 and
// 🌾 at RUNTIME, which is the operating system rendering its own font — fine, and why the game has
// looked like this from the start. Rasterising the same glyph into a PNG is different: it bakes
// Apple's Color Emoji artwork into a file you then ship inside an iOS binary AND an Android one.
// The first version of this script did exactly that and produced a handsome icon nobody is allowed
// to publish. The keep below is drawn from primitives instead.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if(!existsSync(CHROME)){ console.log('Chrome not found — skipping.'); process.exit(0); }

const OUT = 'assets';
mkdirSync(OUT, { recursive: true });
const work = join(tmpdir(), 'crownhold-icons');
mkdirSync(work, { recursive: true });

/* The palette, copied deliberately rather than imported: styles.css is a stylesheet, not a module,
   and a build step that parses CSS to draw an icon is a step that breaks when someone reformats it. */
const GROUND = '#171310', GOLD = '#d9a441', DEEP = '#a87a26', INK = '#e8dcc8';

/* No rounded corners and no transparency on the icon source. Both stores mask it themselves — iOS
   applies the squircle, Android the adaptive shape — and a source that has already been rounded
   gets rounded twice, which reads as a mistake at small sizes. */
/* A crenellated keep, drawn. Three towers and a gate, because at 40px — where an icon actually
   lives — anything finer is mud. Gold on the game's own ground, no rounded corners and no
   transparency: both stores mask the source themselves, and one that arrives pre-rounded gets
   rounded twice. */
const KEEP = (w) => `<svg viewBox="0 0 128 128" width="${w}" height="${w}">
  <defs>
    <linearGradient id="stone" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${GOLD}"/><stop offset="1" stop-color="${DEEP}"/>
    </linearGradient>
  </defs>
  <!-- side towers -->
  <path fill="url(#stone)" d="M22 58h7v-7h5v7h7v46H22z"/>
  <path fill="url(#stone)" d="M87 58h7v-7h5v7h7v46H87z"/>
  <!-- the keep itself, crenellated along the top -->
  <path fill="url(#stone)" d="M41 70h6v-7h6v7h6v-7h6v7h6v-7h6v7h6v34H41z"/>
  <!-- central tower, taller, with its own crenellations -->
  <path fill="url(#stone)" d="M55 44h5v-8h4v8h5v8h-4v-4h-6v4h-4z"/>
  <rect x="57" y="52" width="14" height="20" fill="url(#stone)"/>
  <!-- the gate: the one dark shape, so the silhouette reads as a building and not a comb -->
  <path fill="${GROUND}" d="M58 104V86a6 6 0 0 1 12 0v18z"/>
  <!-- arrow slits, kept few -->
  <rect x="29" y="70" width="4" height="9" rx="2" fill="${GROUND}" opacity=".55"/>
  <rect x="95" y="70" width="4" height="9" rx="2" fill="${GROUND}" opacity=".55"/>
  <rect x="62" y="58" width="4" height="9" rx="2" fill="${GROUND}" opacity=".55"/>
</svg>`;

const icon = (px) => `<!doctype html><meta charset="utf-8"><style>
  html,body{margin:0;width:${px}px;height:${px}px;overflow:hidden}
  body{background:${GROUND};display:grid;place-items:center;position:relative}
  .glow{position:absolute;inset:0;background:
    radial-gradient(58% 44% at 50% 42%, rgba(217,164,65,.20), transparent 70%)}
  .art{position:relative;display:grid;place-items:center}
  .wall{position:absolute;left:10%;right:10%;bottom:16%;height:${Math.max(2, Math.round(px*0.010))}px;
        background:linear-gradient(90deg,transparent,${DEEP},${GOLD},${DEEP},transparent)}
</style><div class="glow"></div><div class="art">${KEEP(Math.round(px * 0.62))}</div><div class="wall"></div>`;

/* The splash is mostly ground. Capacitor scales one square to every device, so anything near an
   edge is cropped on some phone — the wordmark stays well inside the middle third. */
const splash = (px) => `<!doctype html><meta charset="utf-8"><style>
  html,body{margin:0;width:${px}px;height:${px}px;overflow:hidden}
  body{background:${GROUND};display:grid;place-items:center;
       font-family:"Iowan Old Style",Palatino,Georgia,serif}
  .glow{position:absolute;inset:0;background:
    radial-gradient(45% 30% at 50% 44%, rgba(217,164,65,.14), transparent 70%)}
  .mid{position:relative;text-align:center}
  .keep{line-height:0}
  h1{margin:${Math.round(px*0.018)}px 0 0;font-size:${Math.round(px * 0.045)}px;font-weight:600;
     letter-spacing:.14em;color:${GOLD}}
  p{margin:${Math.round(px*0.008)}px 0 0;font-family:ui-sans-serif,-apple-system,sans-serif;
    font-size:${Math.round(px * 0.014)}px;letter-spacing:.3em;text-transform:uppercase;color:${INK};opacity:.5}
</style><div class="glow"></div><div class="mid">
  <div class="keep">${KEEP(Math.round(px * 0.14))}</div>
  <h1>CROWNHOLD</h1><p>hold the frontier</p></div>`;

function shoot(name, html, px){
  const page = join(work, name + '.html');
  writeFileSync(page, html);
  const r = spawnSync(CHROME, ['--headless=new','--disable-gpu','--hide-scrollbars',
    '--default-background-color=00000000',
    '--window-size=' + px + ',' + px,
    '--screenshot=' + join(OUT, name + '.png'),
    'file://' + page], { encoding:'utf8', timeout: 60000 });
  if(r.status !== 0 && !existsSync(join(OUT, name + '.png')))
    throw new Error('chrome failed for ' + name + ': ' + (r.stderr || '').slice(0, 200));
  console.log('  ' + join(OUT, name + '.png') + '  ' + px + '×' + px);
}

console.log('\n── app icon and splash sources ──');
shoot('icon', icon(1024), 1024);        // both stores generate every size from this
shoot('splash', splash(2732), 2732);    // square, so it covers every aspect after cropping
rmSync(work, { recursive: true, force: true });

console.log(`
  Next:
    npx @capacitor/assets generate            # fills ios/ and android/ with every size
    npx cap sync

  The sources live in assets/ and are regenerated by this script, so a palette change is one
  command rather than a hunt through an image editor.
`);
