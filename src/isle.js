// The Salt Isle — the second map.
//
// A second map is only worth building if it plays differently from the first. The
// Frontier is your doorstep: short trips, several at once, everything visible,
// nodes that regrow. The Isle is the opposite on every axis, and each difference
// is doing a job:
//
//   · FOGGED. You have a chart of the coast and nothing else. Landing somewhere
//     reveals what is near it, permanently. The map is a thing you learn, and
//     what you learned is the account's own history.
//   · ONE VOYAGE AT A TIME, however many march slots you own. The Isle is not
//     something to farm in parallel; it is a decision you make and then live with.
//   · HOURS, not minutes, and no recall. A voyage is the thing you set going
//     before you close the game — the long-haul idea taken to its conclusion.
//   · RATIONS, not troops, are the gate. The Victualler is what limits how often
//     you can sail, so the Isle is fed by a building rather than by attention.
//   · IT DOES NOT REGROW. Sites are spent when worked. The Isle empties as you
//     learn it, and refills only when the season turns — so it is a fortnightly
//     expedition, not a daily chore.
//
// It is the only source of Isle Ore, and therefore the only road to Truegold.

export const ISLE_W = 7, ISLE_H = 7;
export const ISLE_TH = 12;                       // when the charts become useful
export const VOYAGE_MS = 3 * 3600 * 1000;        // the crossing, each way is folded in
export const ISLE_REVEAL = 1;                    // how far a landing sees
export const RATION_COST = 260;                  // per voyage, before the Victualler helps

export const ISLE_SITES = {
  shoal:   {icon:'🐚', name:'Salt Shoal',    blurb:'Shallow water, sharp rock, good salvage.',
            ore:[2,5],   fight:0,    res:{food:900, wood:400}},
  grove:   {icon:'🌴', name:'Windward Grove', blurb:'Hardwood the mainland stopped growing.',
            ore:[1,3],   fight:0,    res:{wood:2600}},
  wreck:   {icon:'⚓', name:'The Wrecks',     blurb:'Hulls of a fleet nobody sent for.',
            ore:[5,11],  fight:0.7,  res:{iron:1400, stone:700}},
  barrow:  {icon:'⚱️', name:'Sea Barrow',     blurb:'Older than the Breaking. Older than the Crown.',
            ore:[4,9],   fight:0.9,  valor:70, mxp:220},
  hall:    {icon:'🏛️', name:'Drowned Hall',   blurb:'A court that sank with its argument unfinished.',
            ore:[12,22], fight:1.6,  valor:160, mxp:520, writ:true},
  reef:    {icon:'🪸', name:'Bonereef',       blurb:'Something lives in it. Something large.',
            ore:[9,16],  fight:2.1,  valor:120, mxp:400},
};
/* Weighted so the rich, dangerous sites are the rare ones you are pleased to
   uncover — the fog is what makes finding a Drowned Hall an event. */
const SITE_BAG = ['shoal','shoal','shoal','shoal','grove','grove','grove',
                  'wreck','wreck','wreck','barrow','barrow','reef','hall'];

function mulberry32(a){
  return function(){
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/* The chart is generated per season from one seed, so everyone sailing in the
   same fortnight is learning the same island — which makes it something an
   alliance can actually talk about — and it is redrawn when the season turns. */
export function genIsle(seed, season){
  const rng = mulberry32((seed ^ (season * 2654435761)) >>> 0);
  const cells = [];
  for(let y = 0; y < ISLE_H; y++) for(let x = 0; x < ISLE_W; x++){
    // the landing beach is always known, so a first voyage is never a blind guess
    const beach = x === 3 && y === 6;
    cells.push({
      x, y,
      site: beach ? 'shoal' : SITE_BAG[Math.floor(rng() * SITE_BAG.length)],
      tier: 1 + Math.floor(rng() * 3),
      known: beach,
      spent: false,
    });
  }
  return { seed, season, cells, voyage: null, sailed: 0 };
}

export const cellAt = (isle, x, y) => isle.cells.find(c => c.x === x && c.y === y);
export function known(isle){ return isle.cells.filter(c => c.known); }
export function landable(isle){ return isle.cells.filter(c => c.known && !c.spent); }
export function revealAround(isle, x, y, r = ISLE_REVEAL){
  const found = [];
  for(const c of isle.cells){
    if(Math.abs(c.x - x) > r || Math.abs(c.y - y) > r) continue;
    if(!c.known){ c.known = true; found.push(c); }
  }
  return found;
}
/* How much of the island this account has charted — the only progress bar in the
   game that measures knowledge rather than power. */
export function charted(isle){
  return Math.round(100 * known(isle).length / isle.cells.length);
}
