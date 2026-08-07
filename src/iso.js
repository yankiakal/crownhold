// The Hold, drawn. An isometric 2.5D village on a canvas: every building is a
// real structure that grows with its level, villagers walk the roads, smoke
// rises, scaffolding goes up while you build, and raiders appear on the road
// before a wave lands.
//
// The art is procedural — drawn from shapes at runtime, no image files. That
// keeps the whole game one self-contained page: 235KB, no asset fetch, no
// loading screen. Sprite art would mean 2–6MB of inlined base64, so this layer
// is not a placeholder to be replaced but the actual renderer, and it is worth
// building properly.
//
// ── how it is structured (v1.32) ──
// The scene splits in two:
//
//   STATIC   ground, paths, trees, the wall, every building — anything that only
//            changes when a level, the threat state or the hold skin changes.
//            Rendered once into an offscreen canvas and blitted thereafter.
//   DYNAMIC  smoke, flags, forge-light, the watchtower's sweep, scaffolding
//            cranes, villagers, raiders, attention badges. Redrawn each frame.
//
// Before this the whole scene redrew at 60fps, which is what limited the detail:
// 81 textured ground tiles and 22 materially-shaded buildings per frame is not
// affordable, so everything had to stay cheap, and cheap looks like boxes. Cached,
// the static layer is drawn perhaps once every few minutes and can carry as much
// detail as it likes. That is where the visual budget went.

import { BUILDINGS } from './defs.js';
import { buildCost, canAfford, freeSlot, QUEUE_KEYS } from './logic.js';
import { spriteFor, loadArt, artLoaded } from './sprites.js';

const TW = 64, TH = 32;            // tile width/height (2:1 isometric)
const GRID = 9;

/* One light, from the upper left, obeyed by every surface in the scene. Consistent
   lighting is most of what separates a drawn building from a coloured box — the
   eye reads a single light source long before it reads detail. */
const LIT = { top:1.38, left:0.92, right:0.62 };
const SHADOW_X = 0.62, SHADOW_Y = 0.30;   // ground-shadow offset per unit of height

// where each building stands. Town Hall holds the centre; the wall rings the edge.
const PLOTS = {
  townhall:   [4, 4],
  barracks:   [2, 3],
  academy:    [2, 5],
  wall:       null,                 // drawn as the perimeter
  watchtower: [6, 2],
  farm:       [6, 5],
  granary:    [7, 4],
  lumberyard: [3, 1],
  quarry:     [1, 4],
  ironmine:   [1, 6],
  tavern:     [4, 2],
  hospital:   [5, 6],
  warehouse:  [3, 6],
  library:    [6, 1],
  range:      [2, 1],
  stable:     [7, 3],
  siegeyard:  [5, 7],
  embassy:    [3, 4],
  command:    [5, 3],
  forge:      [1, 3],
  runeworks:  [7, 1],
  // v1.28's two buildings had no plot and no look, so drawBuilding() returned
  // early and they were INVISIBLE in the hold — buildable, productive, and not
  // there. Exactly the failure this project keeps hitting: no error, no log line,
  // just an absence. verify-ui.mjs now fails if any building lacks a plot.
  kitchen:    [7, 5],               // beside the farm and granary — the food quarter
  crucible:   [1, 2],               // beside the forge, in the ore quarter
};

/* Per-building look. `mat` and `rmat` pick the wall and roof material, which is
   what makes a stable read as a stable and not as the same box in a new colour. */
const LOOK = {
  townhall:   { roof:'#8c3f2e', body:'#6d5a45', w:1.5, h:34, kind:'keep',  mat:'stone',   rmat:'tile'   },
  barracks:   { roof:'#4f4a5c', body:'#5e5140', w:1.1, h:20, kind:'hall',  mat:'timber',  rmat:'slate'  },
  academy:    { roof:'#455a62', body:'#5c5344', w:1.1, h:22, kind:'hall',  mat:'plaster', rmat:'tile'   },
  watchtower: { roof:'#4a4a52', body:'#6b6152', w:0.7, h:40, kind:'tower', mat:'stone',   rmat:'slate'  },
  farm:       { roof:'#7a6a35', body:'#5f5236', w:1.2, h:12, kind:'field', mat:'timber',  rmat:'thatch' },
  granary:    { roof:'#6d5730', body:'#61513a', w:0.9, h:22, kind:'silo',  mat:'timber',  rmat:'thatch' },
  lumberyard: { roof:'#4f5f38', body:'#5b4a32', w:1.1, h:16, kind:'yard',  mat:'timber',  rmat:'thatch' },
  quarry:     { roof:'#55555c', body:'#5a5a5f', w:1.1, h:12, kind:'pit',   mat:'stone',   rmat:'slate'  },
  ironmine:   { roof:'#4a4048', body:'#514a4a', w:1.0, h:14, kind:'pit',   mat:'stone',   rmat:'slate'  },
  tavern:     { roof:'#7a5a2e', body:'#63503b', w:1.0, h:18, kind:'hall',  mat:'timber',  rmat:'thatch' },
  hospital:   { roof:'#5a6350', body:'#5f5647', w:1.0, h:18, kind:'hall',  mat:'plaster', rmat:'tile'   },
  warehouse:  { roof:'#5b4f3a', body:'#5a4f3e', w:1.2, h:18, kind:'hall',  mat:'timber',  rmat:'slate'  },
  library:    { roof:'#4c5661', body:'#5a5449', w:1.1, h:24, kind:'hall',  mat:'stone',   rmat:'tile'   },
  range:      { roof:'#4f6b3f', body:'#5c5140', w:1.0, h:16, kind:'yard',  mat:'timber',  rmat:'thatch' },
  stable:     { roof:'#6b5a3a', body:'#5f5342', w:1.2, h:18, kind:'hall',  mat:'timber',  rmat:'thatch' },
  /* Was a timber yard when this line built ballistae. A Mage Spire is stone and stands
     tall — violet where the Runeworks is blue, so the two arcane buildings read as
     related without reading as the same building. */
  siegeyard:  { roof:'#3b3350', body:'#4c4060', w:0.8, h:32, kind:'tower', mat:'stone',   rmat:'lead'   },
  embassy:    { roof:'#6b6250', body:'#5d5647', w:1.0, h:22, kind:'hall',  mat:'plaster', rmat:'tile'   },
  command:    { roof:'#6b4a3a', body:'#57503f', w:1.0, h:26, kind:'tower', mat:'stone',   rmat:'tile'   },
  forge:      { roof:'#6b3a2c', body:'#4f4640', w:1.0, h:22, kind:'hall',  mat:'stone',   rmat:'slate'  },
  runeworks:  { roof:'#41485c', body:'#4a4658', w:1.0, h:26, kind:'tower', mat:'stone',   rmat:'lead'   },
  kitchen:    { roof:'#7a5f3a', body:'#63543c', w:1.0, h:16, kind:'hall',  mat:'plaster', rmat:'thatch' },
  crucible:   { roof:'#4a3f3a', body:'#524740', w:1.0, h:24, kind:'tower', mat:'stone',   rmat:'lead'   },
};

const iso = (x, y) => ({ sx: (x - y) * TW/2, sy: (x + y) * TH/2 });

/* shade() returns HEX, not rgb(). It used to return rgb() while tinted() parsed
   hex, which meant a re-shaded skin colour silently broke — the comment warning
   about it is still below. Returning hex makes shading composable instead:
   shade(shade(c, .9), 1.1) is legal, which the materials below rely on. */
const shade = (hex, f) => {
  const n = parseInt(hex.slice(1), 16);
  const c = v => Math.max(0, Math.min(255, Math.round(v * f))).toString(16).padStart(2,'0');
  return '#' + c((n>>16)&255) + c((n>>8)&255) + c(n&255);
};
/* Mix toward another colour — for rim light, distance haze and warm window glow. */
const mix = (a, b, t) => {
  const x = parseInt(a.slice(1),16), y = parseInt(b.slice(1),16);
  const c = (sh) => {
    const v = ((x>>sh)&255) + (((y>>sh)&255) - ((x>>sh)&255)) * t;
    return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2,'0');
  };
  return '#' + c(16) + c(8) + c(0);
};

/* Deterministic noise. Textures must land in the same place every time the static
   layer re-renders, or every upgrade would make the whole village shimmer as its
   grain jumps. Seeded per surface, never Math.random(). */
function rnd(seed){
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => { s ^= s<<13; s>>>=0; s ^= s>>>17; s ^= s<<5; s>>>=0; return s/4294967296; };
}
const hash = str => { let h = 2166136261; for(let i=0;i<str.length;i++){ h ^= str.charCodeAt(i); h = (h*16777619)>>>0; } return h; };

/* ── materials ──
   Each takes a face as an ordered polygon whose FIRST EDGE is its top edge, so
   courses and planks can run parallel to the real geometry rather than parallel to
   the screen. Everything is clipped to the face, so grain never leaks. */

function path(ctx, pts){
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for(let i=1;i<pts.length;i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}
function bbox(pts){
  let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
  for(const [x,y] of pts){ x0=Math.min(x0,x); y0=Math.min(y0,y); x1=Math.max(x1,x); y1=Math.max(y1,y); }
  return { x:x0, y:y0, w:x1-x0, h:y1-y0 };
}

/* Courses of masonry. The rows run parallel to the face's top edge — which is the
   point of insisting the first edge IS the top edge — so the grain follows the
   isometric geometry instead of lying flat across the screen. Joints stagger
   course to course, because aligned joints read as a grid, not as stonework. */
function courses(ctx, pts, colour, seed, step){
  const [p0, p1] = pts, b = bbox(pts);
  const dx = p1[0]-p0[0], dy = p1[1]-p0[1];
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx/len, uy = dy/len;
  const dark = shade(colour, 0.80), light = shade(colour, 1.10);
  const r = rnd(seed);
  const rows = Math.ceil((b.h + Math.abs(dy) + step) / step);
  ctx.lineWidth = 1;
  for(let row = 0; row <= rows; row++){
    const off = row * step;
    // one course: start on the top edge's line, extended past both ends so the
    // clip does the trimming rather than the arithmetic
    const ax = p0[0] - ux*len*0.5, ay = p0[1] - uy*len*0.5 + off;
    const bx = p0[0] + ux*len*1.5, by = p0[1] + uy*len*1.5 + off;
    ctx.strokeStyle = dark;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    const n = Math.max(2, Math.round(len/9));
    for(let j=0;j<n;j++){
      const t = (j + (row % 2 ? 0.5 : 0)) / n;
      const jx = ax + (bx-ax)*t, jy = ay + (by-ay)*t;
      ctx.strokeStyle = r() > 0.5 ? dark : light;
      ctx.beginPath(); ctx.moveTo(jx, jy); ctx.lineTo(jx, jy + step*0.9); ctx.stroke();
    }
  }
}
/* Planks: lines running down the face, some a shade off to break the flat. */
function planks(ctx, pts, colour, seed){
  const b = bbox(pts), r = rnd(seed);
  ctx.lineWidth = 1;
  for(let x = b.x + 2; x < b.x + b.w; x += 4){
    const v = r();
    ctx.strokeStyle = v > 0.72 ? shade(colour, 1.12) : v > 0.4 ? shade(colour, 0.9) : shade(colour, 0.8);
    ctx.beginPath(); ctx.moveTo(x, b.y - 2); ctx.lineTo(x, b.y + b.h + 2); ctx.stroke();
  }
}
/* Plaster: a soft mottle, no lines — it should read as rendered daub. */
function mottle(ctx, pts, colour, seed){
  const b = bbox(pts), r = rnd(seed);
  for(let i=0;i<26;i++){
    ctx.globalAlpha = 0.05 + r()*0.06;
    ctx.fillStyle = r() > 0.5 ? '#ffffff' : '#000000';
    ctx.beginPath();
    ctx.ellipse(b.x + r()*b.w, b.y + r()*b.h, 2 + r()*5, 1.5 + r()*3, 0, 0, Math.PI*2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function face(ctx, pts, colour, mat, seed){
  ctx.save();
  path(ctx, pts);
  ctx.fillStyle = colour; ctx.fill();
  ctx.clip();
  if(mat === 'stone') courses(ctx, pts, colour, seed, 5);
  else if(mat === 'timber') planks(ctx, pts, colour, seed);
  else if(mat === 'plaster') mottle(ctx, pts, colour, seed);
  ctx.restore();
}

/* ── boxes and roofs ── */

/* The four corners of a diamond footprint, at height h. */
function corners(sx, sy, w, d, h){
  const hw = w*TW/2, hd = d*TH/2;
  return { n:[sx, sy-h], e:[sx+hw, sy+hd-h], s:[sx, sy+hd*2-h], w:[sx-hw, sy+hd-h] };
}

function isoBox(ctx, sx, sy, w, d, h, body, mat, seed, rimF){
  const t = corners(sx, sy, w, d, h), g = corners(sx, sy, w, d, 0);
  // faces first-edge-is-top-edge, so materials run with the geometry
  face(ctx, [t.w, t.s, g.s, g.w], shade(body, LIT.left),  mat, seed);
  face(ctx, [t.e, t.s, g.s, g.e], shade(body, LIT.right), mat, seed+7);
  face(ctx, [t.n, t.e, t.s, t.w], shade(body, LIT.top),   mat === 'stone' ? 'stone' : null, seed+13);
  // the lit corner catches a rim, which is what tells the eye where the light is
  ctx.strokeStyle = shade(body, rimF == null ? 1.5 : rimF); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(t.w[0], t.w[1]); ctx.lineTo(t.n[0], t.n[1]); ctx.lineTo(t.e[0], t.e[1]); ctx.stroke();
  return { t, g };
}

/* A pitched roof with real eaves. The overhang is the single cheapest thing that
   makes a roof look built rather than painted on: it casts a line of shade on the
   wall below and breaks the silhouette. */
function roofPitch(ctx, sx, sy, w, d, h, roof, rmat, seed, peak){
  const over = 0.14;
  const e = corners(sx, sy, w + over, d + over, h);
  const pk = peak == null ? 10 + w*4 : peak;
  const ridge = [sx, sy + (d+over)*TH/2 - h - pk];
  const near = shade(roof, 1.06), far = shade(roof, 0.70);

  // two visible slopes, split along the ridge
  face(ctx, [e.w, ridge, e.s], near, null, seed);
  face(ctx, [ridge, e.e, e.s], far,  null, seed+3);
  roofRows(ctx, [e.w, ridge, e.s], near, rmat, seed);
  roofRows(ctx, [ridge, e.e, e.s], far,  rmat, seed+5);

  // ridge beam and the shadow the eaves throw on the wall
  ctx.strokeStyle = shade(roof, 1.35); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(e.w[0], e.w[1]); ctx.lineTo(ridge[0], ridge[1]); ctx.lineTo(e.e[0], e.e[1]); ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,.30)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(e.w[0], e.w[1]+1); ctx.lineTo(e.s[0], e.s[1]+1); ctx.lineTo(e.e[0], e.e[1]+1); ctx.stroke();
  return { ridge, eave:e, pk };
}

/* A GABLED roof: one broad plane, a ridge, and a triangular gable end.
   The first version of this renderer hipped every roof — four slopes over a square
   footprint — and a screenshot showed why that was wrong: in a 2:1 projection a hip
   roof lands as a squat pyramid whose diamond is wider than the building, so it
   swallows the walls and every structure reads as a coloured plate on a stump.
   A gable gives one large plane plus a vertical triangle in the WALL material, so
   the wall stays visible and the silhouette says "building". Hips are kept for the
   keep and the tower caps, where a pyramid is what a keep actually has. */
function roofGable(ctx, sx, sy, w, d, h, roof, rmat, body, seed, pitch){
  const over = 0.07;                       // eaves, which throw the shade line below
  const c = corners(sx, sy, w + over, d + over, h);
  const pk = pitch == null ? (d + over) * TH * 0.50 : pitch;
  const mid = (a, b) => [(a[0]+b[0])/2, (a[1]+b[1])/2];
  const m0 = mid(c.n, c.w), m1 = mid(c.e, c.s);
  const r0 = [m0[0], m0[1] - pk], r1 = [m1[0], m1[1] - pk];
  const nearC = shade(roof, 1.08), farC = shade(roof, 0.68);

  face(ctx, [c.n, r0, r1, c.e], farC, null, seed+1);          // the away slope
  roofRows(ctx, [c.n, r0, r1, c.e], farC, rmat, seed+1);
  face(ctx, [c.n, r0, c.w], shade(body, LIT.left*0.88), null, seed+2);   // gable, back
  face(ctx, [c.w, r0, r1, c.s], nearC, null, seed+4);         // the broad plane
  roofRows(ctx, [c.w, r0, r1, c.s], nearC, rmat, seed+4);
  face(ctx, [c.e, r1, c.s], shade(body, LIT.right*1.06), null, seed+6);  // gable, front

  ctx.strokeStyle = shade(roof, 1.42); ctx.lineWidth = 1.5;   // ridge beam
  ctx.beginPath(); ctx.moveTo(r0[0], r0[1]); ctx.lineTo(r1[0], r1[1]); ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,.34)'; ctx.lineWidth = 2;     // eaves shade the wall
  ctx.beginPath(); ctx.moveTo(c.w[0], c.w[1]+1); ctx.lineTo(c.s[0], c.s[1]+1); ctx.stroke();
  return { r0, r1, pk };
}

/* Roof covering. Rows follow the eave; the material decides what sits on them. */
function roofRows(ctx, tri, colour, rmat, seed){
  if(!rmat) return;
  ctx.save();
  path(ctx, tri); ctx.clip();
  const b = bbox(tri), r = rnd(seed);
  if(rmat === 'thatch'){
    for(let i=0;i<40;i++){
      ctx.globalAlpha = 0.10 + r()*0.16;
      ctx.strokeStyle = r() > 0.5 ? shade(colour, 1.10) : shade(colour, 0.68);
      ctx.lineWidth = 1 + r();
      const x = b.x + r()*b.w, y = b.y + r()*b.h;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 3 + r()*5, y + 2 + r()*3); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  } else {
    const step = rmat === 'slate' ? 3 : 4;
    /* Row index, not absolute y. `y/step % 2` keyed the tile stagger off the
       building's position on screen, so the same roof drawn at two places got two
       different patterns — which is how the emitted sprites came to disagree with
       the live procedural draw. Grain should be phased to the geometry. */
    let rowN = -1;
    for(let y = b.y; y < b.y + b.h + step; y += step){
      rowN++;
      ctx.strokeStyle = shade(colour, 0.86);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(b.x - 2, y); ctx.lineTo(b.x + b.w + 2, y); ctx.stroke();
      if(rmat === 'tile')
        for(let x = b.x; x < b.x + b.w; x += 5){
          ctx.strokeStyle = shade(colour, 1.06);
          const off = rowN % 2 ? 2.5 : 0;
          ctx.beginPath(); ctx.moveTo(x + off, y); ctx.lineTo(x + off, y + step); ctx.stroke();
        }
    }
    if(rmat === 'lead'){                       // dull sheet metal: long seams, no tiles
      ctx.strokeStyle = shade(colour, 1.25); ctx.lineWidth = 1;
      for(let x = b.x; x < b.x + b.w; x += 7){ ctx.beginPath(); ctx.moveTo(x, b.y); ctx.lineTo(x, b.y+b.h); ctx.stroke(); }
    }
  }
  ctx.restore();
}

/* Windows and a door. Lit windows are the other half of "this is inhabited" —
   they scale with level, so a busy hold visibly has more lights on. */
function windows(ctx, sx, sy, w, d, h, n, warm){
  if(h < 10) return;
  const g = corners(sx, sy, w, d, 0);
  const rows = h > 26 ? 2 : 1;
  for(let row=0; row<rows; row++){
    const hy = h * (rows === 1 ? 0.55 : 0.38 + row*0.34);
    for(let i=0;i<n;i++){
      const p = (i+1)/(n+1);
      for(const side of [-1, 1]){
        const ax = side < 0 ? g.w[0] : g.e[0], ay = side < 0 ? g.w[1] : g.e[1];
        const x = ax + (g.s[0]-ax)*p, y = ay + (g.s[1]-ay)*p - hy;
        ctx.fillStyle = 'rgba(20,14,10,.75)';
        ctx.fillRect(x-1.6, y-3.2, 3.2, 4.4);
        ctx.fillStyle = warm;
        ctx.fillRect(x-1.1, y-2.7, 2.2, 3.4);
      }
    }
  }
  // door on the near face, with a lintel
  ctx.fillStyle = 'rgba(18,12,9,.82)';
  ctx.fillRect(g.s[0]-2.6, g.s[1]-8, 5.2, 8);
  ctx.fillStyle = shade('#3a2c1e', 1.2);
  ctx.fillRect(g.s[0]-3.2, g.s[1]-9, 6.4, 1.4);
}

function chimney(ctx, sx, sy, h, body){
  isoBox(ctx, sx, sy, 0.16, 0.16, h, shade(body, 0.95), 'stone', 91);
}

function flag(ctx, sx, sy, h, t, colour){
  ctx.strokeStyle = '#2b2118'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(sx, sy - h); ctx.lineTo(sx, sy - h - 14); ctx.stroke();
  const wave = Math.sin(t/260) * 2;
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(sx, sy - h - 14);
  ctx.lineTo(sx + 11, sy - h - 11 + wave);
  ctx.lineTo(sx, sy - h - 8);
  ctx.closePath(); ctx.fill();
}

function smoke(ctx, sx, sy, h, t, seed){
  for(let i=0;i<4;i++){
    const p = ((t/24 + i*24 + seed*17) % 96) / 96;
    ctx.globalAlpha = (1 - p) * 0.26;
    ctx.fillStyle = '#c9bda8';
    ctx.beginPath();
    ctx.arc(sx + Math.sin(p*5 + seed)*4, sy - h - 14 - p*30, 2 + p*5, 0, Math.PI*2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/* Hold skins repaint the scene and nothing else. `skinTint` shifts every roof and
   wall toward the skin's hue — no plot moves, no size changes, no rule reads it.
   Colour is the entire product. */
let skinTint = null;
export function setSkinTint(t){
  const was = skinTint ? skinTint.h+':'+skinTint.s+':'+skinTint.l : 'none';
  skinTint = t || null;
  const now = skinTint ? skinTint.h+':'+skinTint.s+':'+skinTint.l : 'none';
  if(was !== now) staticKey = null;         // the baked layer is the wrong colour
}
function tinted(hex){
  if(!skinTint) return hex;
  const n = parseInt(hex.slice(1), 16);
  let r = (n>>16)&255, g = (n>>8)&255, b = n&255;
  const { h, s: sat, l } = skinTint;
  // pull toward the skin's hue, then lift or drop the whole thing a little
  const hr = Math.cos((h) * Math.PI/180), hg = Math.cos((h-120) * Math.PI/180), hb = Math.cos((h-240) * Math.PI/180);
  const avg = (r+g+b)/3;
  r = r + (avg*(1+hr) - r)*sat + 255*l*hr*0.2;
  g = g + (avg*(1+hg) - g)*sat + 255*l*hg*0.2;
  b = b + (avg*(1+hb) - b)*sat + 255*l*hb*0.2;
  // must come back as HEX: shade() parses these with parseInt on a hex slice, so
  // returning rgb() here would break every wall it re-shades
  const cl = v => Math.max(0, Math.min(255, Math.round(v)));
  return '#' + [cl(r), cl(g), cl(b)].map(v => v.toString(16).padStart(2,'0')).join('');
}

/* ── ground ── */

const isRoad = (x, y) => (x===4 && y>4) || (y===4 && x>4);
/* Worn earth appears where something actually STANDS, not where the table says a
   building may one day go. Derived per render from the hold, so the courtyard
   spreads as the hold is built rather than being there from the first minute. */
function yardsOf(S){
  const set = new Set();
  for(const [k, p] of Object.entries(PLOTS))
    if(p && (S.b[k] || 0) > 0) set.add(p[0]+','+p[1]);
  return set;
}

function drawGround(ctx, S){
  const occupied = yardsOf(S);
  // a warm haze behind the hold, so the scene sits in air rather than on nothing
  const backPt = iso(0,0), frontPt = iso(GRID-1, GRID-1);
  const sky = ctx.createLinearGradient(0, backPt.sy - 60, 0, frontPt.sy + 40);
  sky.addColorStop(0, 'rgba(217,164,65,.07)');
  sky.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sky;
  ctx.fillRect(-GRID*TW/2 - 40, backPt.sy - 70, GRID*TW + 80, (frontPt.sy - backPt.sy) + 130);

  for(let y=0; y<GRID; y++) for(let x=0; x<GRID; x++){
    const { sx, sy } = iso(x, y);
    const edge = x===0 || y===0 || x===GRID-1 || y===GRID-1;
    const road = isRoad(x, y);
    const yard = occupied.has(x+','+y);
    const r = rnd(hash('g'+x+','+y));
    const tint = ((x*7 + y*13) % 5) / 100;
    // distance haze: back tiles sit slightly cooler and paler
    const depth = (x + y) / (2*GRID - 2);
    let base = road ? '#584a38' : yard ? '#5b5340' : edge ? shade('#3d4b33', 0.9+tint) : shade('#46592f', 0.94+tint);
    base = mix(base, '#5d6a72', (1 - depth) * 0.16);

    ctx.fillStyle = base;
    path(ctx, [[sx, sy], [sx+TW/2, sy+TH/2], [sx, sy+TH], [sx-TW/2, sy+TH/2]]);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.10)'; ctx.lineWidth = 1; ctx.stroke();

    if(road){
      // cart ruts and loose stones, so the road reads as travelled
      ctx.strokeStyle = 'rgba(0,0,0,.20)'; ctx.lineWidth = 1.5;
      for(const o of [-7, 7]){
        ctx.beginPath();
        ctx.moveTo(sx + o*0.9, sy + TH/2 - o*0.16);
        ctx.lineTo(sx + o*0.9 + TW/2*0.5, sy + TH/2 + TH/4*0.5 - o*0.16);
        ctx.stroke();
      }
      for(let i=0;i<4;i++){
        ctx.fillStyle = 'rgba(200,186,160,.13)';
        ctx.beginPath(); ctx.arc(sx - 14 + r()*28, sy + 6 + r()*18, 0.8 + r(), 0, Math.PI*2); ctx.fill();
      }
    } else if(!yard){
      // grass tufts, thicker away from the paths
      const n = edge ? 3 : 6;
      for(let i=0;i<n;i++){
        const gx = sx - 20 + r()*40, gy = sy + 6 + r()*20;
        ctx.strokeStyle = r() > 0.5 ? 'rgba(120,142,88,.42)' : 'rgba(86,106,64,.42)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx - 1.5, gy - 3); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + 1.5, gy - 3.5); ctx.stroke();
      }
    }
  }

}

/* Trees on the ground nobody has claimed. As the hold fills in, the woods retreat —
   the same idea as hiding unbuildable buildings: the map should show progress, not
   just report it.

   These are depth-sorted alongside the buildings rather than painted with the
   ground. Drawn with the ground they were technically present and completely
   invisible, buried under the roof of whatever stood in front — which a screenshot
   showed and no test could have. */
function treesOn(S){
  const occupied = yardsOf(S);
  const out = [];
  for(let y=1; y<GRID-1; y++) for(let x=1; x<GRID-1; x++){
    if(occupied.has(x+','+y) || isRoad(x,y)) continue;
    const r = rnd(hash('t'+x+','+y));
    if(r() > 0.6) continue;
    const { sx, sy } = iso(x, y);
    const px = sx + (r()-0.5)*20, py = sy + TH*0.7 + (r()-0.5)*8, hh = 15 + r()*11;
    out.push({ d: x + y, draw: ctx => {
      ctx.fillStyle = 'rgba(10,8,6,.26)';
      ctx.beginPath(); ctx.ellipse(px + hh*SHADOW_X*0.45, py + 1, hh*0.46, hh*0.18, 0, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#54402c'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py - hh*0.5); ctx.stroke();
      // three lit-to-shaded masses, so a tree has a light side like everything else
      for(const [dx, dy, rx, ry, c] of [
        [ 2.5,  1, 0.44, 0.30, '#374d2a'],
        [ 0,   -2, 0.46, 0.32, '#4d6a39'],
        [-2.5, -4, 0.36, 0.24, '#5e7f45'],
      ]){
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.ellipse(px + dx, py - hh*0.58 + dy, hh*rx, hh*ry, 0, 0, Math.PI*2);
        ctx.fill();
      }
    }});
  }
  return out;
}

/* ── shadows ──
   Every building throws one, all in the same direction, all drawn BEFORE any
   structure so a shadow can never fall across a building behind it. */
function groundShadow(ctx, sx, sy, w, d, h){
  const g = corners(sx, sy, w, d, 0);
  const ox = h * SHADOW_X, oy = h * SHADOW_Y;
  ctx.fillStyle = 'rgba(12,10,8,.30)';
  path(ctx, [[g.n[0]+ox, g.n[1]+oy], [g.e[0]+ox, g.e[1]+oy], [g.s[0]+ox*0.5, g.s[1]+oy*0.5], [g.w[0], g.w[1]]]);
  ctx.fill();
  // contact occlusion — the dark seam where a wall meets the dirt
  const ao = ctx.createRadialGradient(sx, sy + d*TH/2, 1, sx, sy + d*TH/2, w*TW/2*1.25);
  ao.addColorStop(0, 'rgba(0,0,0,.34)');
  ao.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = ao;
  path(ctx, [g.n, g.e, g.s, g.w]); ctx.fill();
}

/* ── a building ── */

function drawBuilding(ctx, key, lvl, opts){
  const plot = PLOTS[key], base = LOOK[key];
  if(!base || (!plot && !opts.at)) return;
  const look = skinTint ? { ...base, roof: tinted(base.roof), body: tinted(base.body) } : base;
  const { sx, sy } = opts.at || iso(plot[0], plot[1]);

  /* Real art, if this building has any. Checked per BUILDING, so sprites can
     arrive one file at a time and everything else keeps drawing itself. Skipped
     while a skin is worn — a skin repaints procedural colour, and repainting
     someone's painting is not the same operation. */
  if(!opts.raw && !skinTint && lvl > 0){
    const d = BUILDINGS[key];
    const spr = spriteFor(key, lvl, d ? d.max : 30);
    if(spr){
      ctx.drawImage(spr.img, spr.sx, spr.sy, spr.sw, spr.sh,
                    sx - spr.ax, sy - spr.ay, spr.dw, spr.dh);
      return;
    }
  }
  const seed = hash(key);
  const warm = '#f0c073';

  if(lvl <= 0 && !opts.building){
    // Nothing at all until the Town Hall is high enough to raise it. The hold
    // should look like it grows, which means the future must not be on display.
    if(opts.locked) return;
    ctx.strokeStyle = 'rgba(217,164,65,.30)';
    ctx.setLineDash([3,3]); ctx.lineWidth = 1;
    path(ctx, [[sx, sy], [sx+TW/2*0.8, sy+TH/2*0.8], [sx, sy+TH*0.8], [sx-TW/2*0.8, sy+TH/2*0.8]]);
    ctx.stroke(); ctx.setLineDash([]);
    return;
  }

  // height and footprint grow with level, tapering so level 20 is not a skyscraper
  const grow = Math.pow(Math.max(lvl,1), 0.42);
  const h = look.h * (0.62 + 0.62*grow/1.9);
  const w = look.w * (0.60 + 0.14*grow/1.9);
  const nw = Math.max(1, Math.min(4, Math.round(1 + lvl/5)));   // windows per side

  if(look.kind === 'field'){
    for(let i=0;i<4+Math.min(lvl,8);i++){
      const p = i/(4+Math.min(lvl,8));
      ctx.strokeStyle = shade('#6d7a35', 0.85 + 0.25*((i%3)/2));
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(sx - w*TW/2 + p*w*TW/2, sy + p*w*TH/2);
      ctx.lineTo(sx + p*w*TW/2, sy + w*TH/2 + p*w*TH/2);
      ctx.stroke();
      // heads of grain catching the light
      ctx.strokeStyle = 'rgba(214,186,96,.5)'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx - w*TW/2 + p*w*TW/2, sy + p*w*TH/2 - 2);
      ctx.lineTo(sx + p*w*TW/2, sy + w*TH/2 + p*w*TH/2 - 2);
      ctx.stroke();
    }
    isoBox(ctx, sx + 14, sy + 4, 0.4, 0.4, 12, look.body, 'timber', seed);
    roofGable(ctx, sx + 14, sy + 4, 0.4, 0.4, 12, look.roof, 'thatch', look.body, seed, 8);
  }
  else if(look.kind === 'pit'){
    // an excavated pit: dark floor, terraced sides, spoil heaps and a winch
    ctx.fillStyle = shade(look.body, 0.42);
    path(ctx, [[sx, sy+4], [sx + w*TW/2*0.9, sy + w*TH/2*0.9 + 4], [sx, sy + w*TH*0.9 + 4], [sx - w*TW/2*0.9, sy + w*TH/2*0.9 + 4]]);
    ctx.fill();
    for(let ring=1; ring<=2; ring++){
      ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.lineWidth = 1;
      const f = 0.9 - ring*0.22;
      path(ctx, [[sx, sy+4+ring*2], [sx + w*TW/2*f, sy + w*TH/2*f + 4+ring*2], [sx, sy + w*TH*f + 4+ring*2], [sx - w*TW/2*f, sy + w*TH/2*f + 4+ring*2]]);
      ctx.stroke();
    }
    const r = rnd(seed);
    for(let i=0;i<Math.min(3+lvl,9);i++){
      const a = i*2.1;
      isoBox(ctx, sx + Math.cos(a)*13, sy + 8 + Math.sin(a)*6, 0.16, 0.16, 5 + (i%3)*3,
             shade(look.body, 0.92 + r()*0.2), 'stone', seed+i);
    }
    // winch frame over the shaft
    ctx.strokeStyle = '#4a3a28'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(sx-9, sy+10); ctx.lineTo(sx, sy-6); ctx.lineTo(sx+9, sy+10); ctx.stroke();
    ctx.strokeStyle = '#2e2620'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(sx, sy-5); ctx.lineTo(sx, sy+7); ctx.stroke();
  }
  else if(look.kind === 'tower'){
    isoBox(ctx, sx, sy, w*0.8, w*0.8, h, look.body, look.mat, seed);
    windows(ctx, sx, sy, w*0.8, w*0.8, h, 1, warm);
    // a proper crenellated parapet rather than two lumps
    const t = corners(sx, sy, w*0.8, w*0.8, h);
    for(const [a, b2] of [[t.w, t.s], [t.s, t.e]])
      for(let i=0;i<4;i++){
        const p = i/4 + 0.06;
        const cx = a[0] + (b2[0]-a[0])*p, cy = a[1] + (b2[1]-a[1])*p;
        isoBox(ctx, cx, cy - 2, 0.13, 0.13, 5, shade(look.body, 1.12), null, seed+i);
      }
    // a low cap on every tower. The two arcane towers used to return here before
    // this line ran, which left both standing as plain boxes.
    roofPitch(ctx, sx, sy, w*0.66, w*0.66, h + 5, look.roof, look.rmat, seed, 12);
  }
  else if(look.kind === 'silo'){
    isoBox(ctx, sx, sy, w*0.7, w*0.7, h, look.body, 'timber', seed);
    // iron hoops, which is what makes a cylinder out of a box
    for(let i=1;i<=3;i++){
      const hy = h * i/4;
      const g = corners(sx, sy, w*0.7, w*0.7, hy);
      ctx.strokeStyle = 'rgba(30,24,18,.55)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(g.w[0], g.w[1]); ctx.lineTo(g.s[0], g.s[1]); ctx.lineTo(g.e[0], g.e[1]); ctx.stroke();
    }
    ctx.fillStyle = shade(look.roof, 1.05);
    ctx.beginPath();
    ctx.ellipse(sx, sy + w*0.7*TH/2 - h, w*0.7*TW/2, w*0.7*TH/2, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.strokeStyle = shade(look.roof, 0.7); ctx.lineWidth = 1; ctx.stroke();
  }
  else if(look.kind === 'yard'){
    isoBox(ctx, sx, sy, w*0.8, w*0.8, h, look.body, look.mat, seed);
    windows(ctx, sx, sy, w*0.8, w*0.8, h, Math.max(1, nw-1), warm);
    roofGable(ctx, sx, sy, w*0.8, w*0.8, h, look.roof, look.rmat, look.body, seed);
    // the yard itself — what is stacked here says which yard it is
    const r = rnd(seed);
    for(let i=0;i<Math.min(2+lvl,7);i++){
      const px = sx - 17 + (i%3)*8, py = sy + 13 + Math.floor(i/3)*5;
      if(key === 'lumberyard'){                       // stacked logs, end-on
        ctx.fillStyle = '#6b5334';
        ctx.fillRect(px, py, 9, 3.2);
        ctx.fillStyle = '#8a6f45';
        for(let j=0;j<3;j++){ ctx.beginPath(); ctx.arc(px + 1.6 + j*3, py + 1.6, 1.5, 0, Math.PI*2); ctx.fill(); }
      } else if(key === 'range'){                     // rack of pikes and a target
        ctx.strokeStyle = '#7a6a4a'; ctx.lineWidth = 1;
        for(let j=0;j<3;j++){ ctx.beginPath(); ctx.moveTo(px+j*3, py+3); ctx.lineTo(px+j*3+1.5, py-7); ctx.stroke(); }
      }
      if(r() > 0.7){ ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.ellipse(px+5, py+4, 5, 1.6, 0, 0, Math.PI*2); ctx.fill(); }
    }
    if(key === 'range'){
      ctx.fillStyle = '#c9b48a'; ctx.beginPath(); ctx.arc(sx+18, sy+6, 4, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#a8443a'; ctx.beginPath(); ctx.arc(sx+18, sy+6, 1.6, 0, Math.PI*2); ctx.fill();
    }
  }
  else if(look.kind === 'keep'){
    // the Town Hall: a keep with corner towers that gain floors with level
    isoBox(ctx, sx, sy, w, w, h, look.body, 'stone', seed);
    windows(ctx, sx, sy, w, w, h, nw, warm);
    roofPitch(ctx, sx, sy, w, w, h, look.roof, look.rmat, seed);
    const towers = lvl >= 5 ? 4 : lvl >= 3 ? 2 : 0;
    for(let i=0;i<towers;i++){
      const a = i*Math.PI/2 + Math.PI/4;
      const tx = sx + Math.cos(a)*w*TW/2*0.8, ty = sy + w*TH/2 + Math.sin(a)*w*TH/2*0.8;
      isoBox(ctx, tx, ty, 0.3, 0.3, h*0.85, shade(look.body, 0.95), 'stone', seed+i*11);
      roofPitch(ctx, tx, ty, 0.26, 0.26, h*0.85, look.roof, look.rmat, seed+i, 9);
    }
    // a stepped stair to the great door
    ctx.fillStyle = shade(look.body, 0.7);
    for(let i=0;i<3;i++) ctx.fillRect(sx - 7 + i, sy + w*TH - 2 + i*1.6, 14 - i*2, 1.8);
  }
  else {
    isoBox(ctx, sx, sy, w, w*0.9, h, look.body, look.mat, seed);
    windows(ctx, sx, sy, w, w*0.9, h, nw, key === 'forge' ? '#f0a04b' : warm);
    roofGable(ctx, sx, sy, w, w*0.9, h, look.roof, look.rmat, look.body, seed);
    if(key === 'tavern' || key === 'forge' || key === 'kitchen')
      chimney(ctx, sx + (key === 'kitchen' ? -9 : 8), sy + 2, h + 9, look.body);
    if(key === 'barracks'){
      // a drill yard of planted pikes
      ctx.strokeStyle = '#8a7550'; ctx.lineWidth = 1;
      for(let i=0;i<5;i++){ ctx.beginPath(); ctx.moveTo(sx-16+i*4, sy+15); ctx.lineTo(sx-15+i*4, sy+5); ctx.stroke(); }
    }
    if(key === 'stable'){
      // paddock rail
      ctx.strokeStyle = '#6b5334'; ctx.lineWidth = 1.4;
      for(let i=0;i<4;i++){ ctx.beginPath(); ctx.moveTo(sx-4+i*7, sy+16); ctx.lineTo(sx-4+i*7, sy+10); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(sx-4, sy+11.5); ctx.lineTo(sx+17, sy+11.5); ctx.stroke();
    }
    if(key === 'library'){
      // tall arched windows instead of the usual squares
      const g = corners(sx, sy, w, w*0.9, 0);
      for(let i=0;i<3;i++){
        const p = (i+1)/4;
        const x = g.w[0] + (g.s[0]-g.w[0])*p, y = g.w[1] + (g.s[1]-g.w[1])*p - h*0.5;
        ctx.fillStyle = 'rgba(20,14,10,.7)';
        ctx.beginPath(); ctx.ellipse(x, y, 1.8, 4.5, 0, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#cbd8e6';
        ctx.beginPath(); ctx.ellipse(x, y, 1.1, 3.6, 0, 0, Math.PI*2); ctx.fill();
      }
    }
    if(key === 'hospital'){
      ctx.fillStyle = '#e8dcc8';
      ctx.fillRect(sx - 2, sy - h + 4, 4, 10);
      ctx.fillRect(sx - 5, sy - h + 7, 10, 4);
    }
    if(key === 'kitchen'){
      // a cauldron over a fire pit, and a rack of salted stores
      ctx.fillStyle = '#2f2a26';
      ctx.beginPath(); ctx.ellipse(sx + 15, sy + 12, 5, 3, 0, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#4a3a28'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(sx+10, sy+14); ctx.lineTo(sx+15, sy+4); ctx.lineTo(sx+20, sy+14); ctx.stroke();
      ctx.strokeStyle = '#8a6f45'; ctx.lineWidth = 1;
      for(let i=0;i<4;i++){ ctx.beginPath(); ctx.moveTo(sx-18+i*3, sy+9); ctx.lineTo(sx-18+i*3, sy+14); ctx.stroke(); }
    }
    if(key === 'warehouse'){
      // crates and barrels against the near wall
      const r = rnd(seed);
      for(let i=0;i<4;i++){
        const px = sx - 14 + i*7, py = sy + 13 + (i%2)*3;
        ctx.fillStyle = shade('#6b5334', 0.9 + r()*0.3);
        ctx.fillRect(px, py - 5, 5.5, 5.5);
        ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = 1;
        ctx.strokeRect(px, py - 5, 5.5, 5.5);
      }
    }
    if(key === 'embassy'){
      // banners of the alliances that call
      for(let i=0;i<3;i++){
        ctx.fillStyle = ['#8c3f2e','#3f5a6b','#6b6250'][i];
        ctx.fillRect(sx - 10 + i*9, sy - h + 6, 3.5, 11);
      }
    }
  }
}

/* ── the wall ── */

function wallSegment(ctx, x, y, lvl, body) {
  const { sx, sy } = iso(x, y);
  const h = 8 + Math.min(lvl, 20) * 1.1;
  isoBox(ctx, sx, sy, 0.99, 0.99, h, body, 'stone', hash('w'+x+','+y), 1.12);
  if(lvl >= 4 && (x+y) % 2 === 0)
    isoBox(ctx, sx, sy - h, 0.3, 0.3, 4, shade(body, 1.15), null, hash('c'+x+y));
  // a walkway rail once the wall is worth walking
  if(lvl >= 8){
    const t = corners(sx, sy, 0.94, 0.94, h + 4);
    ctx.strokeStyle = 'rgba(30,24,18,.5)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(t.w[0], t.w[1]); ctx.lineTo(t.s[0], t.s[1]); ctx.lineTo(t.e[0], t.e[1]); ctx.stroke();
  }
}

/* ── living things (dynamic) ── */

const folk = [];
function initFolk(){
  if(folk.length) return;
  const r = rnd(4242);
  for(let i=0;i<10;i++)
    folk.push({
      x: 1 + r()*(GRID-2), y: 1 + r()*(GRID-2),
      tx: 1 + r()*(GRID-2), ty: 1 + r()*(GRID-2),
      sp: 0.10 + r()*0.12, ph: r()*6.28,
      load: r() > 0.6,
      c: i < 3 ? '#9c5f4a' : i < 6 ? '#6b7a52' : '#7a6b52',
    });
}
function drawFolk(ctx, dt, count, t){
  initFolk();
  for(let i=0;i<Math.min(count, folk.length);i++){
    const f = folk[i];
    const dx = f.tx - f.x, dy = f.ty - f.y;
    const d = Math.hypot(dx, dy);
    if(d < 0.15){
      const r = rnd(hash('f'+i+Math.round(t/1000)));
      f.tx = 1 + r()*(GRID-2);
      f.ty = 1 + r()*(GRID-2);
    }else{
      f.x += dx/d * f.sp * dt;
      f.y += dy/d * f.sp * dt;
    }
    const { sx, sy } = iso(f.x, f.y);
    const gy = sy + TH/2;
    const stride = Math.sin(t/110 + f.ph);
    const bob = Math.abs(stride) * 1.3;
    ctx.fillStyle = 'rgba(0,0,0,.26)';
    ctx.beginPath(); ctx.ellipse(sx + 1.5, gy, 3.6, 1.8, 0, 0, Math.PI*2); ctx.fill();
    // legs, which is what turns a rectangle into someone walking
    ctx.strokeStyle = '#3a2f24'; ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(sx, gy - 4 - bob); ctx.lineTo(sx + stride*1.8, gy - bob*0.3);
    ctx.moveTo(sx, gy - 4 - bob); ctx.lineTo(sx - stride*1.8, gy - bob*0.3);
    ctx.stroke();
    ctx.fillStyle = f.c;
    ctx.fillRect(sx - 1.6, gy - 9 - bob, 3.2, 5.5);
    ctx.fillStyle = '#d8c4a0';                                   // head
    ctx.beginPath(); ctx.arc(sx, gy - 10.6 - bob, 1.7, 0, Math.PI*2); ctx.fill();
    if(f.load){                                                  // a sack on the shoulder
      ctx.fillStyle = '#7d6a45';
      ctx.fillRect(sx + 1.4, gy - 10 - bob, 3, 3);
    }
  }
}

/* raiders gathering on the road before a wave */
function drawRaiders(ctx, secs, wave, t){
  const n = Math.min(14, 3 + Math.floor(wave/3));
  const approach = 1 - Math.max(0, Math.min(1, secs/15));   // 0 far → 1 at the gate
  for(let i=0;i<n;i++){
    const lane = (i % 3) - 1;
    const along = GRID - 0.5 + (1 - approach) * 5 - (i/n)*0.8;
    const { sx, sy } = iso(4 + lane*0.35, along);
    const gy = sy + TH/2;
    const stride = Math.sin(t/130 + i);
    const bob = Math.abs(stride) * 1.8;
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.beginPath(); ctx.ellipse(sx + 1.5, gy, 4, 2, 0, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#4a2a22'; ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(sx, gy - 4 - bob); ctx.lineTo(sx + stride*2, gy - bob*0.3);
    ctx.moveTo(sx, gy - 4 - bob); ctx.lineTo(sx - stride*2, gy - bob*0.3);
    ctx.stroke();
    ctx.fillStyle = '#8c3f34';
    ctx.fillRect(sx - 2, gy - 9 - bob, 4, 6);
    ctx.fillStyle = '#c2a184';
    ctx.beginPath(); ctx.arc(sx, gy - 10.4 - bob, 1.8, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#c9b48a'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx + 3.5, gy - 13 - bob);
    ctx.lineTo(sx + 3.5, gy - 2 - bob);
    ctx.stroke();
  }
}

/* ── badges: what needs your attention ── */

/* The Wall has no plot — it is the perimeter — so its badge hangs over the GATEHOUSE, which is
   the one part of the perimeter that reads as a structure you could tap.

   Reported from play: "to build wall, you can't see an arrow to build on the scene view, so I
   couldn't figure out what to build so I went into list view." Exactly right, and it was a
   one-line consequence of `wall: null`: the badge loop skips anything without a plot, so the Wall
   was the single building in the game that could never ask for attention. The comment above PLOTS
   already records this project doing the same thing to two buildings in v1.28 — invisible, and no
   error to say so. Same absence, one table down. */
const GATE_PLOT = [4, GRID - 1];
let ctxWallLvl = 0;      // set each frame, so the badge floats at the gatehouse's real height
/* exported so verify-ui can assert the Wall has somewhere to hang its badge and its name */
export const wallAnchor = () => [...GATE_PLOT];

function drawBadge(ctx, key, kind, t){
  const plot = PLOTS[key] || (key === 'wall' ? GATE_PLOT : null);
  if(!plot) return;
  const { sx, sy } = iso(plot[0], plot[1]);
  const look = LOOK[key];
  const bob = Math.sin(t/300) * 2.5;
  // the gatehouse's own height, since the Wall has no LOOK entry to read one from
  const hgt = key === 'wall' ? 16 + Math.min(ctxWallLvl, 20) * 1.1 : (look ? look.h : 20);
  const y = sy - hgt - 26 + bob;
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.beginPath(); ctx.arc(sx, y + 1.5, 8.5, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = kind === 'ready' ? '#7fa65a' : '#d9a441';
  ctx.beginPath(); ctx.arc(sx, y, 8, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#1a1410';
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(kind === 'ready' ? '↑' : '⚒', sx, y + 0.5);
}

/* ── the scene ── */

let cv = null, ctx = null, store = null, raf = 0, last = 0, tick = 0;
let originX = 0, originY = 0, scale = 1, dprNow = 1;
let sCv = null, sCtx = null, staticKey = null;

/* opts.artBase overrides where sprites are looked for. The default is right for
   the deployed game (index.html and art/ side by side); the test bench serves the
   repo root, where they are not. */
export function mountScene(canvas, gameStore, opts){
  cv = canvas; store = gameStore;
  ctx = cv.getContext('2d');
  lastCssW = 0; staticKey = null;
  const base = (opts && opts.artBase) || './art/';
  if(base !== 'none' && !artLoaded()) loadArt(base, () => { staticKey = null; });
  resize();
  cancelAnimationFrame(raf);
  last = performance.now();
  raf = requestAnimationFrame(frame);
}

let lastCssW = 0;
function resize(){
  if(!cv) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  /* The CONTAINER's width, not the canvas's. Below 820px the canvas is deliberately wider than
     its container and pans inside it, so reading cv.clientWidth would feed the canvas its own
     width back and the scale would never settle. */
  const boxW = cv.parentElement?.clientWidth || cv.clientWidth || 600;
  const w = GRID * TW, hgt = GRID * TH + 86;

  /* ── two modes ──
     Wide: fit the width, as it always did — the hold sits in a column beside the rail.
     Narrow: fill the HEIGHT and let it pan sideways, because fitting 576 logical pixels into a
     393px phone left the walls 255px tall — a third of the screen, an illustration rather than
     the subject. Whiteout Survival's city is bigger than the screen and you move it. */
  const narrow = boxW < 820;
  const wantH = narrow ? Math.max(300, Math.round(window.innerHeight * 0.46)) : 0;
  const next = narrow ? Math.min(1.6, wantH / hgt) : Math.min(1, boxW / w);
  if(boxW === lastCssW && Math.abs(next - scale) < 0.001) return;  // reallocating clears the buffer
  lastCssW = boxW;
  scale = next;

  const cssW = Math.round(w * scale);
  dprNow = dpr;
  cv.width = Math.round(cssW * dpr);
  cv.height = Math.round(hgt * scale * dpr);
  cv.style.width = cssW + 'px';
  cv.style.height = Math.round(hgt * scale) + 'px';
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
  originX = w/2;
  originY = 58;
  staticKey = null;                  // the baked layer is the wrong size now
}

export function sceneResize(){ resize(); }

/* What the static layer depends on. If this string is unchanged, the cached
   bitmap is still correct and nothing needs redrawing — which is what buys the
   detail budget. Cheap to build: 23 levels and two flags. */
/* Name plates on or off. A view preference, so it lives on the device like the sound
   toggles and never enters `s` — and it has to be part of the static layer's cache key,
   because that layer is baked once and reused until the key changes. Toggling a setting
   that the key ignores does nothing at all until the next building finishes, which is a
   bug that looks exactly like a dead button. */
const LABELS_KEY = 'crownhold-labels';
let labelsOn = true;
try {
  const raw = localStorage.getItem(LABELS_KEY);
  if(raw != null) labelsOn = raw === '1';
} catch {}

export function labelsShown(){ return labelsOn; }
export function setLabels(on){
  labelsOn = !!on;
  try { localStorage.setItem(LABELS_KEY, labelsOn ? '1' : '0'); } catch {}
  staticKey = null;                  // rebake now, not whenever something else changes
}

function keyOf(S, threat){
  let k = (artLoaded()?'a':'p') + '|' + (labelsOn?'L':'-') + '|' + (S.b.wall||0) + '|' + (threat?1:0) + '|' + (skinTint ? skinTint.h+','+skinTint.s+','+skinTint.l : '-');
  for(const b of Object.keys(PLOTS)) k += '|' + (S.b[b] || 0);
  for(const q of QUEUE_KEYS) k += '|' + (S[q] ? S[q].key : '');
  return k + '|' + cv.width + 'x' + cv.height;
}

function renderStatic(S, threat){
  if(!sCv || sCv.width !== cv.width || sCv.height !== cv.height){
    sCv = document.createElement('canvas');
    sCv.width = cv.width; sCv.height = cv.height;
    sCtx = sCv.getContext('2d');
  }
  const c = sCtx;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, sCv.width, sCv.height);
  c.setTransform(dprNow * scale, 0, 0, dprNow * scale, 0, 0);
  c.translate(originX, originY);

  drawGround(c, S);

  const wallLvl = S.b.wall || 0;
  ctxWallLvl = wallLvl;                    // for the gatehouse badge's height
  const wallBody = tinted(threat ? '#6e5347' : '#5d5449');

  /* Every shadow before any structure, so no shadow lands on a building behind
     it. This is the whole reason the scene is drawn in two passes. */
  for(const key of Object.keys(PLOTS)){
    const plot = PLOTS[key], look = LOOK[key];
    const lvl = S.b[key] || 0;
    if(!plot || !look || lvl <= 0) continue;
    const { sx, sy } = iso(plot[0], plot[1]);
    const grow = Math.pow(Math.max(lvl,1), 0.42);
    const fw = look.w * (0.60+0.14*grow/1.9);
    groundShadow(c, sx, sy, fw, fw, look.h * (0.62+0.62*grow/1.9));
  }
  if(wallLvl > 0)
    for(let i=0;i<GRID;i++)
      for(const [x,y] of [[i,0],[i,GRID-1],[0,i],[GRID-1,i]]){
        const { sx, sy } = iso(x, y);
        groundShadow(c, sx, sy, 0.94, 0.94, 8 + Math.min(wallLvl,20)*1.1);
      }

  /* Structures back-to-front. Wall segments join the same sort as buildings, so
     the near wall now correctly stands in FRONT of the buildings behind it —
     before this the whole wall was drawn first and the front of it sat behind
     everything, which read as a moat. */
  const items = treesOn(S);
  for(const key of Object.keys(PLOTS)){
    if(!PLOTS[key]) continue;
    const [x, y] = PLOTS[key];
    const underway = QUEUE_KEYS.some(q => S[q] && S[q].key === key);
    const def = BUILDINGS[key];
    const locked = !!(def && def.th && (S.b.townhall || 0) < def.th);
    items.push({ d: x + y, draw: cx => drawBuilding(cx, key, S.b[key] || 0, { building: underway, locked }) });
  }
  if(wallLvl > 0)
    for(let i=0;i<GRID;i++)
      for(const [x,y] of [[i,0],[i,GRID-1],[0,i],[GRID-1,i]]){
        if(x === 4 && y === GRID-1) continue;                   // the gatehouse, below
        items.push({ d: x + y, draw: cx => wallSegment(cx, x, y, wallLvl, wallBody) });
      }
  else if((S.b.townhall || 1) >= (BUILDINGS.wall.th || 1))
    /* An UNBUILT wall gets the same dashed footprint every other unbuilt building gets — drawn
       around the perimeter, because that is the wall's plot. Without it the wall was the one
       building with nothing in the scene to say it existed: no structure, no footprint, and (until
       drawBadge learned about the gatehouse) no badge either. Reported from play as not being able
       to find what to build without switching to the list. */
    for(let i=0;i<GRID;i++)
      for(const [x,y] of [[i,0],[i,GRID-1],[0,i],[GRID-1,i]]){
        items.push({ d: x + y, draw: cx => {
          const g = iso(x, y);
          cx.strokeStyle = 'rgba(217,164,65,.22)';
          cx.setLineDash([3,3]); cx.lineWidth = 1;
          path(cx, [[g.sx, g.sy], [g.sx+TW/2*0.8, g.sy+TH/2*0.8],
                    [g.sx, g.sy+TH*0.8], [g.sx-TW/2*0.8, g.sy+TH/2*0.8]]);
          cx.stroke(); cx.setLineDash([]);
        }});
      }
  items.sort((a,b) => a.d - b.d);
  for(const it of items) it.draw(c);

  if(wallLvl > 0){
    const h = 8 + Math.min(wallLvl, 20) * 1.1;
    const g = iso(4, GRID-1);
    isoBox(c, g.sx, g.sy, 1.15, 1.15, h + 8, shade(wallBody, 1.05), 'stone', 777);
    // the gate itself: a dark arch under the tower
    c.fillStyle = 'rgba(14,10,8,.85)';
    c.beginPath();
    c.ellipse(g.sx, g.sy + TH*0.9, 7, 9, 0, Math.PI, 0);
    c.fill();
    c.fillRect(g.sx - 7, g.sy + TH*0.9, 14, 6);
  }

  if(labelsOn) drawLabels(c, S);
}

/* ── name plates ──
   A hold at Town Hall 20 is twenty-three buildings that all read as "brown roof",
   and knowing which is the Runeworks meant tapping them one at a time. So each
   raised building carries its name and level.

   Drawn in a pass of their own, AFTER the wall and the gate, because a label that
   is depth-sorted with the geometry gets buried by the next building along — which
   is exactly what happened to the trees, twice. Depth is still used for the ORDER
   within the pass, so where two plates collide the nearer one lands on top and stays
   readable; the far one loses, which is the right one to lose. */
const PLATE_FONT = '600 8px ui-monospace, monospace';

function drawLabels(ctx, S){
  const plates = [];
  for(const key of Object.keys(PLOTS)){
    const plot = PLOTS[key], look = LOOK[key], def = BUILDINGS[key];
    if(!plot || !look || !def) continue;
    const lvl = S.b[key] || 0;
    const underway = QUEUE_KEYS.some(q => S[q] && S[q].key === key);
    if(lvl <= 0 && !underway) continue;          // nothing there yet: nothing to name
    const { sx, sy } = iso(plot[0], plot[1]);
    // the same height curve drawBuilding uses, so the plate sits just clear of the roof
    const grow = Math.pow(Math.max(lvl, 1), 0.42);
    const h = look.h * (0.62 + 0.62 * grow / 1.9);
    plates.push({ d: plot[0] + plot[1], sx, sy: sy - h - 14,
                  txt: def.name + (lvl > 0 ? ' ' + lvl : ' …'), underway });
  }
  /* And the Wall, over the gatehouse. It has no plot and no LOOK, so it fell out of this loop as
     well as out of drawBadge — leaving its badge as an unlabelled arrow floating on the perimeter,
     which is a mystery rather than an invitation. Named whether it stands or not, because the whole
     point of the report was not being able to tell what the thing at the edge WAS. */
  {
    const wl = S.b.wall || 0;
    const underway = QUEUE_KEYS.some(q => S[q] && S[q].key === 'wall');
    if((S.b.townhall || 1) >= (BUILDINGS.wall.th || 1)){
      const g = iso(GATE_PLOT[0], GATE_PLOT[1]);
      const h = wl > 0 ? 16 + Math.min(wl, 20) * 1.1 : 10;
      plates.push({ d: GATE_PLOT[0] + GATE_PLOT[1], sx: g.sx, sy: g.sy - h - 14,
                    txt: BUILDINGS.wall.name + (wl > 0 ? ' ' + wl : ' …'), underway });
    }
  }
  plates.sort((a, b) => a.d - b.d);

  ctx.save();
  ctx.font = PLATE_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  /* Nudge plates apart. Twenty-three names over a nine-by-nine grid collide badly, and
     half-hidden text is worse than no text — it does not read as occlusion, it reads as a
     different word. The first pass at this rendered "Great Library" as "Meat Library" and
     turned "Archery Range" into "Range", both of which look like data bugs rather than
     overlaps.

     Each plate takes its natural spot if free and otherwise searches nearby, preferring up
     (everything above a roof is sky) and trying a little down before giving up. The Town
     Hall is the case that forced a wider search: it sits dead centre on the tallest roof
     with a neighbour on every side, so it exhausted a five-step ladder and settled for an
     overlap that ate the Archery Range's first word. */
  const placed = [];
  const hits = (x0, y0, x1, y1) => placed.some(r =>
    x0 < r.x1 + 2 && x1 > r.x0 - 2 && y0 < r.y1 + 1 && y1 > r.y0 - 1);
  const OFFSETS = [0, -11, -22, -33, -44, -55, 12, 24, -66];
  for(const p of plates){
    p.w = ctx.measureText(p.txt).width + 6;
    const home = p.sy;
    for(let i = 0; i < OFFSETS.length; i++){
      const y = home + OFFSETS[i];
      if(i === OFFSETS.length - 1 || !hits(p.sx - p.w/2, y - 6, p.sx + p.w/2, y + 6)){
        p.sy = y; break;
      }
    }
    placed.push({ x0: p.sx - p.w/2, y0: p.sy - 6, x1: p.sx + p.w/2, y1: p.sy + 6 });
  }

  /* Two passes: every pill, then every name. A single pass draws each plate's background
     over whatever text is already down, so the one collision that does survive the search
     silently deletes a word. Backing first means the worst case is text over text, which
     still reads as two overlapping labels rather than as a wrong one. */
  for(const p of plates){
    ctx.fillStyle = 'rgba(12,9,7,.78)';
    ctx.beginPath();
    // roundRect is not in every engine this runs through (the stub DOM among them)
    if(ctx.roundRect) ctx.roundRect(p.sx - p.w/2, p.sy - 6, p.w, 12, 3);
    else ctx.rect(p.sx - p.w/2, p.sy - 6, p.w, 12);
    ctx.fill();
  }
  for(const p of plates){
    ctx.fillStyle = p.underway ? '#8fd0a0' : '#e6d6b0';
    ctx.fillText(p.txt, p.sx, p.sy);
  }
  ctx.restore();
}

function frame(now){
  raf = requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last)/1000);
  last = now; tick = now;
  if(!store || !store.s || !ctx) return;
  const S = store.s;

  const secsToWave = (S.nextWave - Date.now())/1000;
  const threat = secsToWave < 15 && !(S.shieldUntil > Date.now());

  const k = keyOf(S, threat);
  if(k !== staticKey){ renderStatic(S, threat); staticKey = k; }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cv.width, cv.height);
  if(sCv) ctx.drawImage(sCv, 0, 0);
  ctx.setTransform(dprNow * scale, 0, 0, dprNow * scale, 0, 0);
  ctx.translate(originX, originY);

  /* ── everything that moves ── */
  for(const key of Object.keys(PLOTS)){
    const plot = PLOTS[key], look = LOOK[key];
    const lvl = S.b[key] || 0;
    if(!plot || !look) continue;
    const underway = QUEUE_KEYS.some(q => S[q] && S[q].key === key);
    if(lvl <= 0 && !underway) continue;
    const { sx, sy } = iso(plot[0], plot[1]);
    const grow = Math.pow(Math.max(lvl,1), 0.42);
    const h = look.h * (0.55 + 0.45*grow/1.9);

    if(key === 'townhall'){ flag(ctx, sx, sy, h + 12, tick, '#d9a441'); if(lvl >= 8) smoke(ctx, sx - 10, sy, h, tick, 3); }
    if(key === 'tavern')  smoke(ctx, sx + 8, sy, h + 9, tick, 1);
    if(key === 'kitchen') smoke(ctx, sx - 9, sy, h + 9, tick, 7);
    if(key === 'barracks') flag(ctx, sx - 12, sy + 6, h, tick, '#a8443a');
    if(key === 'academy')  flag(ctx, sx + 12, sy + 6, h, tick, '#3f7a8c');
    if(key === 'forge'){
      smoke(ctx, sx + 8, sy, h + 9, tick, 5);
      const glow = 0.45 + 0.35*Math.sin(tick/220);
      ctx.globalAlpha = glow;
      ctx.fillStyle = '#e08a3c';
      ctx.beginPath(); ctx.ellipse(sx - 4, sy + 10, 7, 4, 0, 0, Math.PI*2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    if(key === 'watchtower' || key === 'command'){
      flag(ctx, sx, sy, h + 8, tick, '#d9a441');
      const sweep = Math.sin(tick/700);
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = '#f2d488';
      path(ctx, [[sx, sy - h - 2], [sx + 60*sweep, sy - h + 26], [sx + 60*sweep + 18, sy - h + 30]]);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if(key === 'runeworks'){
      for(let i=0;i<5;i++){
        const a = tick/900 + i*Math.PI*2/5;
        ctx.globalAlpha = 0.5 + 0.4*Math.sin(tick/300 + i);
        ctx.fillStyle = '#7fa8d9';
        ctx.beginPath(); ctx.arc(sx + Math.cos(a)*16, sy - h - 4 + Math.sin(a)*7, 2.2, 0, Math.PI*2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    if(key === 'siegeyard'){
      /* Sparks climbing the spire, not orbiting it — the Runeworks binds runestone in a
         circle, this place is drilling casters, so the motion goes up and leaves. */
      const glow = ctx.createRadialGradient(sx, sy - h - 4, 1, sx, sy - h - 4, 18);
      glow.addColorStop(0, 'rgba(178,142,232,0.34)');
      glow.addColorStop(1, 'rgba(178,142,232,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(sx, sy - h - 4, 18, 0, Math.PI*2); ctx.fill();
      for(let i=0;i<6;i++){
        const t = ((tick/1400) + i/6) % 1;             // 0 at the base, 1 at the tip
        ctx.globalAlpha = 0.55 * (1 - t);
        ctx.fillStyle = '#c9a6f2';
        ctx.beginPath();
        ctx.arc(sx + Math.sin(t*5 + i)*5, sy - 6 - t*(h + 10), 1.5 - t*0.7, 0, Math.PI*2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    if(key === 'crucible'){
      // Electrum runs molten. The light spills out of the crucible mouth and
      // pulses slowly, which is the one thing that says this building is working.
      const beat = 0.5 + 0.5*Math.sin(tick/520);
      const gl = ctx.createRadialGradient(sx, sy - h*0.5, 1, sx, sy - h*0.5, 26);
      gl.addColorStop(0, 'rgba(255,196,96,'+(0.32 + beat*0.26)+')');
      gl.addColorStop(1, 'rgba(255,150,40,0)');
      ctx.fillStyle = gl;
      ctx.beginPath(); ctx.arc(sx, sy - h*0.5, 26, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = 'rgba(255,214,140,'+(0.6 + beat*0.35)+')';
      ctx.beginPath(); ctx.ellipse(sx, sy - h - 2, 7, 3.4, 0, 0, Math.PI*2); ctx.fill();
      for(let i=0;i<3;i++){
        const p = ((tick/30 + i*32) % 96)/96;
        ctx.globalAlpha = (1-p)*0.5;
        ctx.fillStyle = '#ffcf82';
        ctx.beginPath(); ctx.arc(sx + Math.sin(p*7+i)*5, sy - h - 4 - p*22, 1.2, 0, Math.PI*2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    if(underway){
      // scaffolding, and a crane hook that actually swings
      ctx.strokeStyle = '#b08d44'; ctx.lineWidth = 1;
      for(let i=-1;i<=1;i++){
        ctx.beginPath(); ctx.moveTo(sx + i*14, sy + 10); ctx.lineTo(sx + i*14, sy - h - 6); ctx.stroke();
      }
      ctx.beginPath(); ctx.moveTo(sx - 16, sy - h - 2); ctx.lineTo(sx + 16, sy - h + 6); ctx.stroke();
      const swing = Math.sin(tick/420) * 8;
      ctx.beginPath(); ctx.moveTo(sx + 16, sy - h - 10); ctx.lineTo(sx + 16 + swing, sy - h + 4); ctx.stroke();
      ctx.fillStyle = '#8a6b32';
      ctx.fillRect(sx + 14 + swing, sy - h + 4, 5, 4);
    }
  }

  if((S.b.wall||0) > 0)
    flag(ctx, iso(4, GRID-1).sx, iso(4, GRID-1).sy, 8 + Math.min(S.b.wall,20)*1.1 + 12, tick,
         threat ? '#c25a45' : '#d9a441');

  drawFolk(ctx, dt, 4 + Math.min(6, S.b.townhall), tick);
  if(threat) drawRaiders(ctx, secsToWave, S.wave, tick);

  // attention badges: affordable upgrades
  for(const key of Object.keys(PLOTS)){
    // the Wall is allowed through without a plot: drawBadge hangs it over the gatehouse
    if(!PLOTS[key] && key !== 'wall') continue;
    const d = BUILDINGS[key];
    const lvl = S.b[key] || 0;
    if(!d) continue;
    if(QUEUE_KEYS.some(q => S[q] && S[q].key === key)) continue;
    if(lvl >= d.max) continue;
    if(d.th && S.b.townhall < d.th) continue;
    if(key !== 'townhall' && lvl >= S.b.townhall) continue;
    if(freeSlot(S) && canAfford(S, buildCost(S, key))) drawBadge(ctx, key, 'ready', tick);
  }

}

/* Tap → building, by the ground tile under the finger. Selecting by tile rather
   than by overlapping bounding boxes means no structure can ever swallow its
   neighbour's taps. A tap on a tall roof lands on the tile behind it, so we also
   check the three tiles nearer the viewer — which is where that roof came from. */
export function tileAt(clientX, clientY){
  const r = cv.getBoundingClientRect();
  const px = (clientX - r.left) / scale - originX;
  const py = (clientY - r.top) / scale - originY - TH/2;
  return {
    x: Math.round((px/(TW/2) + py/(TH/2)) / 2),
    y: Math.round((py/(TH/2) - px/(TW/2)) / 2),
  };
}
export function pickBuilding(clientX, clientY){
  if(!cv) return null;
  const { x, y } = tileAt(clientX, clientY);
  const at = (tx, ty) => Object.keys(PLOTS).find(k => PLOTS[k] && PLOTS[k][0] === tx && PLOTS[k][1] === ty);
  const hit = at(x, y) || at(x+1, y) || at(x, y+1) || at(x+1, y+1);
  if(hit) return hit;
  /* THE WALL. Third and last thing `PLOTS.wall = null` quietly broke: this lookup walks PLOTS too,
     so every tap on the perimeter resolved to nothing. Badge and name were fixed first, which made
     it worse rather than better — the game now pointed at something and then ignored you when you
     pressed it. Reported in exactly that order: "I can see that wall needs to be built but I can't
     click it in scene mode."

     Any perimeter tile answers, not just the gatehouse. The wall IS the perimeter, so a tap
     anywhere along it is unambiguous — nothing else stands there — and asking the player to find
     one specific tile of twenty-eight would be a worse bug than the one being fixed. */
  return pickTile(x, y);
}

/* The tile→building rule on its own, so it can be tested without a canvas. pickBuilding is the
   same thing with a coordinate conversion in front of it. */
export function pickTile(x, y){
  const at = (tx, ty) => Object.keys(PLOTS).find(k => PLOTS[k] && PLOTS[k][0] === tx && PLOTS[k][1] === ty);
  const hit = at(x, y) || at(x+1, y) || at(x, y+1) || at(x+1, y+1);
  if(hit) return hit;
  const onEdge = (x === 0 || y === 0 || x === GRID - 1 || y === GRID - 1)
              && x >= 0 && y >= 0 && x < GRID && y < GRID;
  return onEdge ? 'wall' : null;
}

export function unmountScene(){ cancelAnimationFrame(raf); raf = 0; }

/* Exported so verify-ui.mjs can assert every building has somewhere to stand.
   kitchen and crucible shipped in v1.28 with no plot and no look, so they were
   invisible in the hold for three versions. A test is cheaper than noticing. */
export { PLOTS, LOOK };

/* Paint a single building into any context at any position, ignoring its plot.
   Used by tools/emit-sprites.html to generate the placeholder strips FROM this
   renderer — which is what lets the sprite pipeline ship, and be tested in
   production, before any real art exists. `raw` forces the procedural path so the
   emitter can never accidentally re-photograph its own output. */
export function paintBuilding(ctx, key, lvl, sx, sy){
  drawBuilding(ctx, key, lvl, { at:{ sx, sy }, raw:true });
}
export { TW, TH };
