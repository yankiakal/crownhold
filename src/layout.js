// The player's own arrangement of their hold.
//
// Whiteout Survival and Kingshot both hand you a fixed city. This is the one place Crownhold can be
// visibly more generous than the games it is shaped like, at no balance cost at all — and it is unusually
// cheap in this renderer, because the satisfying half was already paid for years before anyone asked for
// it. drawBuilding already draws at an arbitrary point; every building looks identical at any tile
// because its detail seed is a hash of its KEY and the roof stagger was deliberately fixed so it does not
// key off screen position; the depth sort is real, so z-order sorts itself out; and worn earth and trees
// are derived from where things actually STAND rather than from the table. So a moved building takes its
// patch of trodden mud with it and the woods close over the tile it left, with no new drawing code.
//
// ── PURELY COSMETIC, and that is a decision, not an omission ──
// No rule in this game reads a position. Not production, not defence, not the wall, not a raid. Two
// reasons. Clash of Clans' movable base is tactical and that works because its combat is spatial; nothing
// here is, so position-as-power would have to be invented from scratch and would then be a system every
// player must study rather than a thing they may enjoy. And the moment layout affects strength there is
// an optimal layout, which turns a toy into homework and hands an advantage to whoever reads a guide.
// Asked and confirmed with the author before any of this was written.
//
// ── one funnel ──
// Everything here is pure and takes the hold as an argument. `plotOf` is the single place a position is
// decided, and every read site in the renderer goes through it. The alternative — a copy of the override
// logic at each of the twelve places iso.js asks where a building stands — is how a building comes to be
// drawn in one place, badged in a second and tapped in a third.

import { BUILDINGS, GRID, DEFAULT_PLOTS } from './defs.js';

/* The wall owns the perimeter, so the buildable interior is 1..GRID-2 — a 7x7 of 49 tiles for 22 movable
   buildings, which is enough freedom to be worth having and not so much that a hold looks abandoned. */
export const LO = 1, HI = GRID - 2;

/* ── the gatehouse rule ──
   The gatehouse is drawn AFTER the depth sort, at the gate's own depth of 12, so anything standing at a
   greater depth is painted over by it. Interior tiles reach 14, which is [6,7], [7,6] and [7,7] — three
   of forty-nine. Excluded rather than allowed-and-ugly.

   The real fix is to fold the gatehouse into the sorted items array, which removes this rule entirely;
   it also changes how the gate interleaves with the wall segments at its own depth, so it wants a pixel
   diff rather than a confident afternoon. Worth knowing that the shipped default table already obeys
   this rule exactly — nothing has ever stood deeper than 12 — which is why nobody has seen the artifact.
   The test asserts it over the defaults too, so this comment cannot rot. */
export const GATE_DEPTH = 12;

/* Fixed in place. The road is a hardcoded L from the gate to [4,4] (isRoad in iso.js), so a Town Hall
   that moved would leave its own road behind, pointing at nothing. Deriving the road from the hall's
   plot is about five lines and repaints the static bake, so it is deliberately not in this change. */
export const FIXED = ['townhall'];

/* Object.hasOwn, not truthiness, and not a `in` check either. `BUILDINGS['constructor']` is the Object
   constructor and perfectly truthy, so a key of "constructor" would pass a truthiness gate, persist to
   the server, and then throw inside the render loop on `const [x,y] = plot` — a hold whose scene is dead
   for ever, from one bad string. actions.js:68 already guards its dispatch this way for the same reason. */
export const isBuilding = key => typeof key === 'string' && Object.hasOwn(BUILDINGS, key);
export const hasPlot = key => typeof key === 'string' && Object.hasOwn(DEFAULT_PLOTS, key)
                              && Array.isArray(DEFAULT_PLOTS[key]);
export const movable = key => hasPlot(key) && !FIXED.includes(key);

export const inBounds = (x, y) =>
  Number.isInteger(x) && Number.isInteger(y) &&
  x >= LO && x <= HI && y >= LO && y <= HI && (x + y) <= GATE_DEPTH;

/* ── where a building stands ──
   The one place this is decided. A sparse override map: absence means the default, which is what makes
   this safe for every building that will ever be added. A complete map cloned once at migrate would
   permanently lack anything added afterwards, and a building with no plot is drawn by nothing — the
   v1.28 kitchen-and-crucible absence, reproduced per save, where no static test could see it. */
export function plotOf(s, key){
  const over = s && s.plots && Object.hasOwn(s.plots, key) ? s.plots[key] : null;
  if(Array.isArray(over) && inBounds(over[0], over[1])) return over;
  return hasPlot(key) ? DEFAULT_PLOTS[key] : null;
}
/* Every occupied tile, as "x,y" → key. Built from plotOf so it can never disagree with the drawing. */
export function occupancy(s){
  const map = new Map();
  for(const key of Object.keys(DEFAULT_PLOTS)){
    const p = plotOf(s, key);
    if(p) map.set(p[0] + ',' + p[1], key);
  }
  return map;
}
export function buildingAt(s, x, y){ return occupancy(s).get(x + ',' + y) || null; }

/* Where a given building could go: every legal tile that is empty, plus the one it already stands on so
   setting it back down where it was is never a refusal. */
export function legalTiles(s, key){
  if(!movable(key)) return [];
  const taken = occupancy(s), here = plotOf(s, key);
  const out = [];
  for(let x = LO; x <= HI; x++)
    for(let y = LO; y <= HI; y++){
      if(!inBounds(x, y)) continue;
      const who = taken.get(x + ',' + y);
      if(!who || who === key) out.push([x, y]);
    }
  return out;
}

/* ── the two verbs ── */
export function setPlot(s, key, x, y){
  if(!movable(key) || !inBounds(x, y)) return false;
  const who = buildingAt(s, x, y);
  if(who && who !== key) return false;              // occupied — the caller wants swapPlots
  if(!s.plots || typeof s.plots !== 'object') s.plots = {};
  const d = DEFAULT_PLOTS[key];
  // back on its default tile is an ABSENCE, not an override that happens to match
  if(d[0] === x && d[1] === y) delete s.plots[key];
  else s.plots[key] = [x, y];
  return true;
}
/* A swap is a transposition, and transpositions compose into permutations — so "no two buildings on one
   tile" holds by algebra rather than by a validator and a refusal path. It is also the edit people
   actually want on a hold that is visually full: exchange, not relocate. */
export function swapPlots(s, a, b){
  if(a === b || !movable(a) || !movable(b)) return false;
  const pa = plotOf(s, a), pb = plotOf(s, b);
  if(!pa || !pb || !inBounds(pa[0], pa[1]) || !inBounds(pb[0], pb[1])) return false;
  if(!s.plots || typeof s.plots !== 'object') s.plots = {};
  const put = (key, x, y) => {
    const d = DEFAULT_PLOTS[key];
    if(d[0] === x && d[1] === y) delete s.plots[key];
    else s.plots[key] = [x, y];
  };
  put(a, pb[0], pb[1]);
  put(b, pa[0], pa[1]);
  return true;
}
/* What the player means by tapping a tile with something in hand: an empty tile is a move, an occupied
   one is a swap. One verb at the edge, two underneath. */
export function placeAt(s, key, x, y){
  const who = buildingAt(s, x, y);
  return (who && who !== key) ? swapPlots(s, key, who) : setPlot(s, key, x, y);
}
export function resetPlots(s){
  const had = s.plots && Object.keys(s.plots).length > 0;
  s.plots = {};
  return !!had;
}

/* ── repair ──
   The one place a broken arrangement is fixed, and it runs on the server too because the server runs the
   same migrate. Anything that is not a movable building on a legal empty tile loses its override and
   goes back to the default — never the other way round, because the default table is the one arrangement
   guaranteed to be sound.

   Termination: 46 legal tiles for 22 movable buildings, so a free tile always exists and the fallback
   cannot loop. Returns the number of entries it fixed, which is 0 in every normal case — and that zero
   is what the test asserts, because a repair that quietly rearranges a hold on update day would be
   indistinguishable from a bug in the editor. */
export function repair(s){
  if(!s.plots || typeof s.plots !== 'object' || Array.isArray(s.plots)){ s.plots = {}; return 0; }
  let fixed = 0;
  for(const key of Object.keys(s.plots)){
    const v = s.plots[key];
    if(!movable(key) || !Array.isArray(v) || v.length !== 2 || !inBounds(v[0], v[1])){
      delete s.plots[key]; fixed++;
    }
  }
  // and no two on one tile: the LATER key loses its override, since the defaults never collide
  const seen = new Map();
  for(const key of Object.keys(DEFAULT_PLOTS)){
    const p = plotOf(s, key);
    if(!p) continue;
    const at = p[0] + ',' + p[1];
    if(!seen.has(at)){ seen.set(at, key); continue; }
    delete s.plots[key];                            // back to its default…
    fixed++;
    const d = plotOf(s, key);
    const dAt = d[0] + ',' + d[1];
    if(!seen.has(dAt)){ seen.set(dAt, key); continue; }
    // …and if its default is taken too, the first free legal tile
    const free = legalTiles(s, key).find(t => !seen.has(t[0] + ',' + t[1]));
    if(free){ s.plots[key] = [free[0], free[1]]; seen.set(free[0] + ',' + free[1], key); }
  }
  return fixed;
}
