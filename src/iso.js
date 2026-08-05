// The Hold, drawn. An isometric 2.5D village on a canvas: every building is a
// real structure that grows with its level, villagers walk the roads, smoke
// rises, scaffolding goes up while you build, and raiders appear on the road
// before a wave lands.
//
// The art is procedural — drawn from shapes at runtime, no image files. That
// keeps the whole game one self-contained page, and it is the placeholder layer:
// swap drawBuilding() for sprite blits when real art exists (see GRAPHICS.md).

import { BUILDINGS } from './defs.js';
import { buildCost, canAfford, storageCap, freeSlot, QUEUE_KEYS } from './logic.js';

const TW = 64, TH = 32;            // tile width/height (2:1 isometric)
const GRID = 9;

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
  forge:      [1, 3],
  runeworks:  [7, 1],
};

// per-building look: roof colour, body colour, and a shape hint
const LOOK = {
  townhall:   { roof:'#8c3f2e', body:'#6d5a45', w:1.5, h:34, kind:'keep'  },
  barracks:   { roof:'#5a4a6b', body:'#5e5140', w:1.1, h:20, kind:'hall'  },
  academy:    { roof:'#3f5a6b', body:'#5c5344', w:1.1, h:22, kind:'hall'  },
  watchtower: { roof:'#4a4a52', body:'#6b6152', w:0.7, h:40, kind:'tower' },
  farm:       { roof:'#7a6a35', body:'#5f5236', w:1.2, h:12, kind:'field' },
  granary:    { roof:'#6d5730', body:'#61513a', w:0.9, h:22, kind:'silo'  },
  lumberyard: { roof:'#4f5f38', body:'#5b4a32', w:1.1, h:16, kind:'yard'  },
  quarry:     { roof:'#55555c', body:'#5a5a5f', w:1.1, h:12, kind:'pit'   },
  ironmine:   { roof:'#4a4048', body:'#514a4a', w:1.0, h:14, kind:'pit'   },
  tavern:     { roof:'#7a5a2e', body:'#63503b', w:1.0, h:18, kind:'hall'  },
  hospital:   { roof:'#5f6b52', body:'#5f5647', w:1.0, h:18, kind:'hall'  },
  warehouse:  { roof:'#5b4f3a', body:'#5a4f3e', w:1.2, h:18, kind:'hall'  },
  library:    { roof:'#4a5a6b', body:'#5a5449', w:1.1, h:24, kind:'hall'  },
  forge:      { roof:'#6b3a2c', body:'#4f4640', w:1.0, h:22, kind:'hall'  },
  runeworks:  { roof:'#3c4a6b', body:'#4a4658', w:1.0, h:26, kind:'tower' },
};

const iso = (x, y) => ({ sx: (x - y) * TW/2, sy: (x + y) * TH/2 });
const shade = (hex, f) => {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n>>16)&255) * f));
  const g = Math.min(255, Math.round(((n>>8)&255) * f));
  const b = Math.min(255, Math.round((n&255) * f));
  return 'rgb('+r+','+g+','+b+')';
};

/* ── ground ── */

function drawGround(ctx){
  for(let y=0; y<GRID; y++) for(let x=0; x<GRID; x++){
    const { sx, sy } = iso(x, y);
    const edge = x===0 || y===0 || x===GRID-1 || y===GRID-1;
    const road = (x===4 && y>4) || (y===4 && x>4);
    const tint = ((x*7 + y*13) % 5) / 100;
    ctx.fillStyle = road ? '#4a3f2f' : edge ? shade('#33402c', 0.85 + tint) : shade('#3a4a30', 0.9 + tint);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + TW/2, sy + TH/2);
    ctx.lineTo(sx, sy + TH);
    ctx.lineTo(sx - TW/2, sy + TH/2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.12)';
    ctx.stroke();
  }
}

/* ── a building ── */

function isoBox(ctx, sx, sy, w, d, h, body){
  const hw = w*TW/2, hd = d*TH/2;
  // top face
  ctx.fillStyle = shade(body, 1.25);
  ctx.beginPath();
  ctx.moveTo(sx, sy - h);
  ctx.lineTo(sx + hw, sy + hd - h);
  ctx.lineTo(sx, sy + hd*2 - h);
  ctx.lineTo(sx - hw, sy + hd - h);
  ctx.closePath(); ctx.fill();
  // left face
  ctx.fillStyle = shade(body, 0.8);
  ctx.beginPath();
  ctx.moveTo(sx - hw, sy + hd - h);
  ctx.lineTo(sx, sy + hd*2 - h);
  ctx.lineTo(sx, sy + hd*2);
  ctx.lineTo(sx - hw, sy + hd);
  ctx.closePath(); ctx.fill();
  // right face
  ctx.fillStyle = shade(body, 0.58);
  ctx.beginPath();
  ctx.moveTo(sx + hw, sy + hd - h);
  ctx.lineTo(sx, sy + hd*2 - h);
  ctx.lineTo(sx, sy + hd*2);
  ctx.lineTo(sx + hw, sy + hd);
  ctx.closePath(); ctx.fill();
}

function roofPitch(ctx, sx, sy, w, d, h, roof){
  const hw = w*TW/2, hd = d*TH/2, peak = 10;
  ctx.fillStyle = shade(roof, 1.1);
  ctx.beginPath();
  ctx.moveTo(sx - hw, sy + hd - h);
  ctx.lineTo(sx, sy - h - peak);
  ctx.lineTo(sx + hw, sy + hd - h);
  ctx.lineTo(sx, sy + hd*2 - h);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = shade(roof, 0.72);
  ctx.beginPath();
  ctx.moveTo(sx, sy - h - peak);
  ctx.lineTo(sx + hw, sy + hd - h);
  ctx.lineTo(sx, sy + hd*2 - h);
  ctx.closePath(); ctx.fill();
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
  for(let i=0;i<3;i++){
    const p = ((t/24 + i*30 + seed*17) % 90) / 90;
    ctx.globalAlpha = (1 - p) * 0.28;
    ctx.fillStyle = '#c9bda8';
    ctx.beginPath();
    ctx.arc(sx + Math.sin(p*5 + seed)*4, sy - h - 14 - p*26, 2 + p*4, 0, Math.PI*2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawBuilding(ctx, key, lvl, t, opts){
  const plot = PLOTS[key], look = LOOK[key];
  if(!plot || !look) return;
  const { sx, sy } = iso(plot[0], plot[1]);
  const built = lvl > 0;

  if(!built && !opts.building){
    // an empty, pegged-out plot
    ctx.strokeStyle = 'rgba(217,164,65,.30)';
    ctx.setLineDash([3,3]); ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx, sy); ctx.lineTo(sx + TW/2*0.8, sy + TH/2*0.8);
    ctx.lineTo(sx, sy + TH*0.8); ctx.lineTo(sx - TW/2*0.8, sy + TH/2*0.8);
    ctx.closePath(); ctx.stroke();
    ctx.setLineDash([]);
    return;
  }

  // height and footprint grow with level, tapering so level 20 is not a skyscraper
  const grow = Math.pow(Math.max(lvl,1), 0.42);
  const h = look.h * (0.55 + 0.45*grow/1.9);
  const w = look.w * (0.85 + 0.15*grow/1.9);

  // ground platform
  ctx.fillStyle = 'rgba(0,0,0,.22)';
  ctx.beginPath();
  ctx.moveTo(sx, sy + 2); ctx.lineTo(sx + w*TW/2, sy + w*TH/2 + 2);
  ctx.lineTo(sx, sy + w*TH + 2); ctx.lineTo(sx - w*TW/2, sy + w*TH/2 + 2);
  ctx.closePath(); ctx.fill();

  if(look.kind === 'field'){
    // rows of crop, greener and denser with level
    for(let i=0;i<4+Math.min(lvl,8);i++){
      const p = i/(4+Math.min(lvl,8));
      ctx.strokeStyle = shade('#6d7a35', 0.8 + 0.3*Math.sin(i+t/900));
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx - w*TW/2 + p*w*TW/2, sy + p*w*TH/2);
      ctx.lineTo(sx + p*w*TW/2, sy + w*TH/2 + p*w*TH/2);
      ctx.stroke();
    }
    isoBox(ctx, sx + 14, sy + 4, 0.35, 0.35, 10, look.body);
    roofPitch(ctx, sx + 14, sy + 4, 0.35, 0.35, 10, look.roof);
  }
  else if(look.kind === 'pit'){
    ctx.fillStyle = shade(look.body, 0.55);
    ctx.beginPath();
    ctx.moveTo(sx, sy + 4); ctx.lineTo(sx + w*TW/2*0.9, sy + w*TH/2*0.9 + 4);
    ctx.lineTo(sx, sy + w*TH*0.9 + 4); ctx.lineTo(sx - w*TW/2*0.9, sy + w*TH/2*0.9 + 4);
    ctx.closePath(); ctx.fill();
    for(let i=0;i<Math.min(3+lvl,9);i++){
      const a = i*2.1;
      isoBox(ctx, sx + Math.cos(a)*13, sy + 8 + Math.sin(a)*6, 0.16, 0.16, 5 + (i%3)*3, look.body);
    }
  }
  else if(look.kind === 'tower'){
    isoBox(ctx, sx, sy, w*0.8, w*0.8, h, look.body);
    // crenellations
    for(let i=-1;i<=1;i+=2)
      isoBox(ctx, sx + i*10, sy + 4, 0.15, 0.15, h+5, shade(look.body,1.1));
    if(key === 'runeworks'){
      // a slowly turning ring of bound runes
      for(let i=0;i<5;i++){
        const a = t/900 + i*Math.PI*2/5;
        ctx.globalAlpha = 0.5 + 0.4*Math.sin(t/300 + i);
        ctx.fillStyle = '#7fa8d9';
        ctx.beginPath();
        ctx.arc(sx + Math.cos(a)*16, sy - h - 4 + Math.sin(a)*7, 2.2, 0, Math.PI*2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      return;
    }
    flag(ctx, sx, sy, h + 8, t, '#d9a441');
    // a slow scanning lantern
    const sweep = Math.sin(t/700);
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = '#f2d488';
    ctx.beginPath();
    ctx.moveTo(sx, sy - h - 2);
    ctx.lineTo(sx + 60*sweep, sy - h + 26);
    ctx.lineTo(sx + 60*sweep + 18, sy - h + 30);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
  }
  else if(look.kind === 'silo'){
    isoBox(ctx, sx, sy, w*0.7, w*0.7, h, look.body);
    ctx.fillStyle = shade(look.roof, 1.05);
    ctx.beginPath();
    ctx.ellipse(sx, sy + w*0.7*TH/2 - h, w*0.7*TW/2, w*0.7*TH/2, 0, 0, Math.PI*2);
    ctx.fill();
  }
  else if(look.kind === 'yard'){
    isoBox(ctx, sx, sy, w*0.8, w*0.8, h, look.body);
    roofPitch(ctx, sx, sy, w*0.8, w*0.8, h, look.roof);
    for(let i=0;i<Math.min(2+lvl,7);i++)
      isoBox(ctx, sx - 16 + (i%3)*7, sy + 12 + Math.floor(i/3)*4, 0.12, 0.5, 4, '#6b5334');
  }
  else if(look.kind === 'keep'){
    // the Town Hall: a keep with corner towers that gain floors with level
    isoBox(ctx, sx, sy, w, w, h, look.body);
    roofPitch(ctx, sx, sy, w, w, h, look.roof);
    const towers = lvl >= 5 ? 4 : lvl >= 3 ? 2 : 0;
    for(let i=0;i<towers;i++){
      const a = i*Math.PI/2 + Math.PI/4;
      isoBox(ctx, sx + Math.cos(a)*w*TW/2*0.8, sy + w*TH/2 + Math.sin(a)*w*TH/2*0.8,
             0.28, 0.28, h*0.85, shade(look.body, 0.95));
    }
    flag(ctx, sx, sy, h + 12, t, '#d9a441');
    if(lvl >= 8) smoke(ctx, sx - 10, sy, h, t, 3);
  }
  else {
    isoBox(ctx, sx, sy, w, w*0.9, h, look.body);
    roofPitch(ctx, sx, sy, w, w*0.9, h, look.roof);
    if(key === 'tavern') smoke(ctx, sx + 8, sy, h, t, 1);
    if(key === 'forge'){
      smoke(ctx, sx + 6, sy, h, t, 5);
      // forge-light pulsing in the doorway
      const glow = 0.45 + 0.35*Math.sin(t/220);
      ctx.globalAlpha = glow;
      ctx.fillStyle = '#e08a3c';
      ctx.beginPath(); ctx.ellipse(sx - 4, sy + 10, 6, 3.5, 0, 0, Math.PI*2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    if(key === 'barracks') flag(ctx, sx - 12, sy + 6, h, t, '#a8443a');
    if(key === 'academy' && lvl > 0) flag(ctx, sx + 12, sy + 6, h, t, '#3f7a8c');
    if(key === 'hospital'){
      ctx.fillStyle = '#e8dcc8';
      ctx.fillRect(sx - 2, sy - h + 4, 4, 10);
      ctx.fillRect(sx - 5, sy - h + 7, 10, 4);
    }
  }

  // scaffolding while under construction
  if(opts.building){
    ctx.strokeStyle = '#b08d44'; ctx.lineWidth = 1;
    for(let i=-1;i<=1;i++){
      ctx.beginPath();
      ctx.moveTo(sx + i*14, sy + 10);
      ctx.lineTo(sx + i*14, sy - h - 6);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(sx - 16, sy - h - 2); ctx.lineTo(sx + 16, sy - h + 6);
    ctx.stroke();
    // a swinging crane hook
    const swing = Math.sin(t/420) * 8;
    ctx.beginPath();
    ctx.moveTo(sx + 16, sy - h - 10); ctx.lineTo(sx + 16 + swing, sy - h + 4);
    ctx.stroke();
    ctx.fillStyle = '#8a6b32';
    ctx.fillRect(sx + 14 + swing, sy - h + 4, 5, 4);
  }
}

/* ── the wall ── */

function drawWall(ctx, lvl, t, threat){
  if(lvl <= 0) return;
  const h = 8 + Math.min(lvl, 20) * 1.1;
  const body = threat ? '#6e5347' : '#5d5449';
  for(let i=0;i<GRID;i++){
    for(const [x,y] of [[i,0],[i,GRID-1],[0,i],[GRID-1,i]]){
      const { sx, sy } = iso(x, y);
      isoBox(ctx, sx, sy, 0.9, 0.9, h, body);
      if(lvl >= 4 && (x+y) % 2 === 0)
        isoBox(ctx, sx, sy - h, 0.3, 0.3, 4, shade(body, 1.15));
    }
  }
  // gatehouse on the road
  const g = iso(4, GRID-1);
  isoBox(ctx, g.sx, g.sy, 1.1, 1.1, h + 8, shade(body, 1.05));
  flag(ctx, g.sx, g.sy, h + 12, t, threat ? '#c25a45' : '#d9a441');
}

/* ── living things ── */

const folk = [];
function initFolk(){
  if(folk.length) return;
  for(let i=0;i<10;i++)
    folk.push({
      x: 1 + Math.random()*(GRID-2), y: 1 + Math.random()*(GRID-2),
      tx: 1 + Math.random()*(GRID-2), ty: 1 + Math.random()*(GRID-2),
      sp: 0.10 + Math.random()*0.12,
      c: i < 3 ? '#9c5f4a' : i < 6 ? '#6b7a52' : '#7a6b52',
    });
}
function drawFolk(ctx, dt, count){
  initFolk();
  for(let i=0;i<Math.min(count, folk.length);i++){
    const f = folk[i];
    const dx = f.tx - f.x, dy = f.ty - f.y;
    const d = Math.hypot(dx, dy);
    if(d < 0.15){
      f.tx = 1 + Math.random()*(GRID-2);
      f.ty = 1 + Math.random()*(GRID-2);
    }else{
      f.x += dx/d * f.sp * dt;
      f.y += dy/d * f.sp * dt;
    }
    const { sx, sy } = iso(f.x, f.y);
    const bob = Math.abs(Math.sin((f.x+f.y)*6)) * 1.5;
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.beginPath(); ctx.ellipse(sx, sy + TH/2, 3.5, 1.8, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = f.c;
    ctx.fillRect(sx - 1.5, sy + TH/2 - 8 - bob, 3, 7);
    ctx.fillStyle = '#d8c4a0';
    ctx.fillRect(sx - 1.5, sy + TH/2 - 10.5 - bob, 3, 2.5);
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
    const bob = Math.abs(Math.sin(t/160 + i)) * 2;
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.beginPath(); ctx.ellipse(sx, sy + TH/2, 4, 2, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#8c3f34';
    ctx.fillRect(sx - 2, sy + TH/2 - 9 - bob, 4, 8);
    ctx.strokeStyle = '#c9b48a'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx + 3, sy + TH/2 - 12 - bob);
    ctx.lineTo(sx + 3, sy + TH/2 - 2 - bob);
    ctx.stroke();
  }
}

/* ── badges: what needs your attention ── */

function drawBadge(ctx, key, kind, t){
  const plot = PLOTS[key];
  if(!plot) return;
  const { sx, sy } = iso(plot[0], plot[1]);
  const look = LOOK[key];
  const bob = Math.sin(t/300) * 2.5;
  const y = sy - (look ? look.h : 20) - 26 + bob;
  ctx.fillStyle = kind === 'ready' ? '#7fa65a' : '#d9a441';
  ctx.beginPath(); ctx.arc(sx, y, 8, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#1a1410';
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(kind === 'ready' ? '↑' : '⚒', sx, y + 0.5);
}

/* ── the scene ── */

let cv = null, ctx = null, store = null, raf = 0, last = 0, tick = 0;
let originX = 0, originY = 0, scale = 1;

export function mountScene(canvas, gameStore){
  cv = canvas; store = gameStore;
  ctx = cv.getContext('2d');
  lastCssW = 0;
  resize();
  cancelAnimationFrame(raf);
  last = performance.now();
  raf = requestAnimationFrame(frame);
}

let lastCssW = 0;
function resize(){
  if(!cv) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cssW = cv.clientWidth || cv.parentElement?.clientWidth || 600;
  if(cssW === lastCssW) return;      // reallocating the buffer clears it — only on real changes
  lastCssW = cssW;
  const w = GRID * TW, hgt = GRID * TH + 120;
  scale = Math.min(1, cssW / w);
  cv.width = Math.round(cssW * dpr);
  cv.height = Math.round(hgt * scale * dpr);
  cv.style.height = Math.round(hgt * scale) + 'px';
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
  originX = w/2;
  originY = 70;
}

export function sceneResize(){ resize(); }

function frame(now){
  raf = requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last)/1000);
  last = now; tick = now;
  if(!store || !store.s || !ctx) return;
  const S = store.s;

  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.save();
  ctx.translate(originX, originY);

  const secsToWave = (S.nextWave - Date.now())/1000;
  const threat = secsToWave < 15 && !(S.shieldUntil > Date.now());

  drawGround(ctx);
  drawWall(ctx, S.b.wall, tick, threat);

  // buildings back-to-front so nearer ones overlap correctly
  const order = Object.keys(PLOTS)
    .filter(k => PLOTS[k])
    .sort((a,b) => (PLOTS[a][0]+PLOTS[a][1]) - (PLOTS[b][0]+PLOTS[b][1]));
  for(const key of order){
    const underway = QUEUE_KEYS.some(q => S[q] && S[q].key === key);
    drawBuilding(ctx, key, S.b[key] || 0, tick, { building: underway });
  }

  drawFolk(ctx, dt, 4 + Math.min(6, S.b.townhall));
  if(threat) drawRaiders(ctx, secsToWave, S.wave, tick);

  // attention badges: affordable upgrades, finished-ish queues
  for(const key of order){
    const d = BUILDINGS[key];
    const lvl = S.b[key] || 0;
    if(QUEUE_KEYS.some(q => S[q] && S[q].key === key)) continue;
    if(lvl >= d.max) continue;
    if(d.th && S.b.townhall < d.th) continue;
    if(key !== 'townhall' && lvl >= S.b.townhall) continue;
    if(freeSlot(S) && canAfford(S, buildCost(S, key))) drawBadge(ctx, key, 'ready', tick);
  }

  ctx.restore();
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
  return at(x, y) || at(x+1, y) || at(x, y+1) || at(x+1, y+1) || null;
}

export function unmountScene(){ cancelAnimationFrame(raf); raf = 0; }
