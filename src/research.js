// Research: the slow, permanent power curve that runs beside construction.
//
// The design note that matters: research only feels worth doing when the numbers
// are big enough to *notice*. A tree that adds 5% over a hundred hours is the
// Rise-of-Empires trap — technically progress, emotionally nothing. So every
// track here tops out at a bonus you can feel (+30% troop power, +30%
// production, −30% training time), and a fully-researched hold is roughly
// half again as strong as an unresearched one at the same buildings.
//
// It runs on its OWN queue, so it never competes with the build crews — there is
// always something progressing while you are away.
//
// Research lives in a building, not in the Town Hall's shadow: the Great Library
// unlocks study at all, and ITS LEVEL IS THE CEILING on every track. Want
// Warcraft 7? Raise the Library to 7. That makes one building the spine of the
// whole tree, the way Kingshot's academy is.

import { TIME_SCALE } from './defs.js';

export const RESEARCH = {
  husbandry:    {name:'Husbandry',     icon:'🌾', max:10, per:3,   th:2,  lib:1,  unit:'%',
                 fx:'food & wood production', cost:{food:150, wood:150}, time:90},
  masonry:      {name:'Masonry',       icon:'⛏️', max:10, per:3,   th:3,  lib:1,  unit:'%',
                 fx:'stone & iron production', cost:{wood:180, stone:120}, time:100},
  logistics:    {name:'Logistics',     icon:'🛤️', max:10, per:4,   th:4,  lib:2,  unit:'%',
                 fx:'storage capacity', cost:{wood:220, stone:160}, time:120},
  warcraft:     {name:'Warcraft',      icon:'⚔️', max:10, per:3,   th:4,  lib:2,  unit:'%',
                 fx:'troop power', cost:{food:260, iron:90}, time:150},
  drillcraft:   {name:'Drillcraft',    icon:'🥁', max:10, per:3,   th:5,  lib:3,  unit:'%',
                 fx:'faster training', cost:{food:240, wood:180}, time:140},
  fortification:{name:'Fortification', icon:'🏯', max:10, per:8,   th:5,  lib:3,  unit:'',
                 fx:'wall power per level', cost:{stone:300, iron:80}, time:160},
  medicine:     {name:'Medicine',      icon:'⛑️', max:10, per:3,   th:6,  lib:4,  unit:'%',
                 fx:'fewer casualties', cost:{food:320, wood:240}, time:170},
  statecraft:   {name:'Statecraft',    icon:'📜', max:10, per:4,   th:7,  lib:5,  unit:'%',
                 fx:'Valor earned', cost:{food:380, stone:260}, time:180},
  siegecraft:   {name:'Siegecraft',    icon:'⚙️', max:10, per:5,   th:8,  lib:6,  unit:'%',
                 fx:'raid loot', cost:{wood:420, iron:180}, time:200},
  smelting:     {name:'Smelting',      icon:'🔥', max:10, per:6,   th:12, lib:8, unit:'%',
                 fx:'refining speed', cost:{stone:600, iron:300}, time:260},
};

export const RESEARCH_COST_EXP = 1.9, RESEARCH_TIME_EXP = 1.5;

export function techLvl(s, k){ return (s.research && s.research[k]) || 0; }
export function techBonus(s, k){ return techLvl(s, k) * RESEARCH[k].per / 100; }
/* fortification is a flat number, not a percentage */
export function techFlat(s, k){ return techLvl(s, k) * RESEARCH[k].per; }

export function techCost(s, k){
  const d = RESEARCH[k], lvl = techLvl(s, k), c = {};
  const mult = Math.pow(lvl + 1, RESEARCH_COST_EXP);
  for(const [r, v] of Object.entries(d.cost)) c[r] = Math.round(v * mult);
  return c;
}
export function techTime(s, k){
  const d = RESEARCH[k], lvl = techLvl(s, k);
  const scholars = Math.max(0.4, 1 - 0.02 * Math.max(0, (s.b.library || 1) - 1));
  return Math.round(d.time * Math.pow(lvl + 1, RESEARCH_TIME_EXP) * scholars) * 1000 * TIME_SCALE;
}
/* The Library caps every track: you can never study past its level. */
export function techCap(s, k){ return Math.min(RESEARCH[k].max, s.b.library || 0); }
export function techBlockedBy(s, k){
  const d = RESEARCH[k];
  if((s.b.library || 0) < 1) return 'Build the Great Library first';
  if((s.b.library || 0) < d.lib) return 'Needs Great Library ' + d.lib;
  if(s.b.townhall < d.th) return 'Needs Town Hall ' + d.th;
  if(techLvl(s, k) >= d.max) return 'Fully mastered';
  if(techLvl(s, k) >= techCap(s, k)) return 'Raise the Great Library past ' + (s.b.library || 0);
  return null;
}
export function techAvailable(s, k){ return !techBlockedBy(s, k); }
export function researchProgress(s){
  const done = Object.keys(RESEARCH).reduce((a, k) => a + techLvl(s, k), 0);
  const total = Object.values(RESEARCH).reduce((a, d) => a + d.max, 0);
  return { done, total, pct: Math.round(100 * done / total) };
}
