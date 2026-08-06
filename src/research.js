// Research: the slow, permanent power curve that runs beside construction.
//
// The design note that matters: research only feels worth doing when the numbers
// are big enough to *notice*. A tree that adds 5% over a hundred hours is the
// Rise-of-Empires trap — technically progress, emotionally nothing. So every
// track here tops out at a bonus you can feel. Measured at Town Hall 25 with the
// same buildings and troops either way: the general tracks alone are ×1.39 army,
// adding per-line mastery ×1.77, and the Truegold tier on top of that ×2.40. The
// wall rises with it rather than past it — 8% of total defence fully researched
// under the old tree, 9% under this one — so no amount of study turns a hold into
// something that cannot be raided.
//
// It runs on its OWN queue, so it never competes with the build crews — there is
// always something progressing while you are away.
//
// Research lives in a building, not in the Town Hall's shadow: the Great Library
// unlocks study at all, and ITS LEVEL IS THE CEILING on every track. Want
// Warcraft 7? Raise the Library to 7.
//
// ── the shape, and why it changed ──
// This was a FLAT list of ten tracks, gated only by Town Hall and Library level.
// That had a specific failure: because the Library capped everything at once, all
// ten unlocked in lockstep as it rose, so there was no tree and no choice — just
// ten bars filling at the same rate. Kingshot and Whiteout both branch (Growth vs
// Battle) and, more importantly, gate study behind OTHER STUDY, which is what
// makes a tree a tree.
//
// So there are three additions, and each one exists to create a decision:
//   1. BRANCHES. Growth or Battle. Two spines, one queue — so investing in one is
//      genuinely not investing in the other, and the queue makes that cost real.
//   2. PREREQUISITES (`needs`). A study can require a level in an earlier study.
//      This is the part the flat list was missing entirely.
//   3. PER-LINE MASTERY. Kingshot's battle tree researches each troop type
//      separately, and that is the deepest grind in it. Our combat model has ONE
//      power per line rather than Whiteout's four stats per line, so the honest
//      translation is a per-line power track — four of them, deliberately too
//      expensive to max all at once. That turns the Battle branch into a question
//      about what ARMY you are building, not just a bar.
//
// ── the Truegold tier ──
// Kingshot's endgame vertical, and here it fixes an outright bug. The Crucible
// refines Isle Ore into Truegold, and until now NOTHING IN THE GAME SPENT IT — the
// whole Kitchen → voyage → Crucible chain terminated in a resource with no sink,
// which means every hour anyone spent on it bought them nothing. These four
// studies are that sink. They are gated on the Crucible itself, they are the
// biggest single bonuses in the game, and they are slow.
//
// What is deliberately NOT copied: in both those games the research tree is where
// pay-to-win hides most quietly — the depth exists so speedups have somewhere to
// be sold, and alliance "research help" is a whale lever. We sell no speedups and
// no help, so depth here has to be paced against real time with no relief valve.
// That is why the tree gains STRUCTURE (branches, prerequisites, specialisation)
// without gaining Whiteout's hundreds of filler levels.

import { TIME_SCALE, TROOPS } from './defs.js';

export const BRANCHES = {
  growth: {name:'Growth', icon:'🌾', blurb:'Land, stores, and the speed of every crew.'},
  battle: {name:'Battle', icon:'⚔️', blurb:'The army, the wall, and what comes home.'},
};

/* `needs` is the tree: {study: level}. `line` marks a per-troop-line study.
   `tg` marks the Truegold tier, which is gated on the Crucible instead of the Library. */
export const RESEARCH = {
  /* ── Growth ── */
  husbandry:    {name:'Husbandry',     icon:'🌾', branch:'growth', max:10, per:3,  th:2,  lib:1,  unit:'%',
                 fx:'food & wood production', cost:{food:150, wood:150}, time:90},
  masonry:      {name:'Masonry',       icon:'⛏️', branch:'growth', max:10, per:3,  th:3,  lib:1,  unit:'%',
                 fx:'stone & iron production', cost:{wood:180, stone:120}, time:100,
                 needs:{husbandry:2}},
  logistics:    {name:'Logistics',     icon:'🛤️', branch:'growth', max:10, per:4,  th:4,  lib:2,  unit:'%',
                 fx:'storage capacity', cost:{wood:220, stone:160}, time:120,
                 needs:{masonry:2}},
  drillcraft:   {name:'Drillcraft',    icon:'🥁', branch:'growth', max:10, per:3,  th:5,  lib:3,  unit:'%',
                 fx:'faster training', cost:{food:240, wood:180}, time:140,
                 needs:{husbandry:4}},
  statecraft:   {name:'Statecraft',    icon:'📜', branch:'growth', max:10, per:4,  th:7,  lib:5,  unit:'%',
                 fx:'Valor earned', cost:{food:380, stone:260}, time:180,
                 needs:{logistics:4}},
  smelting:     {name:'Smelting',      icon:'🔥', branch:'growth', max:10, per:6,  th:12, lib:8,  unit:'%',
                 fx:'refining speed', cost:{stone:600, iron:300}, time:260,
                 needs:{masonry:6}},

  /* ── Battle ── */
  warcraft:     {name:'Warcraft',      icon:'⚔️', branch:'battle', max:10, per:3,  th:4,  lib:2,  unit:'%',
                 fx:'troop power, every line', cost:{food:260, iron:90}, time:150},
  fortification:{name:'Fortification', icon:'🏯', branch:'battle', max:10, per:8,  th:5,  lib:3,  unit:'',
                 fx:'wall power per level', cost:{stone:300, iron:80}, time:160,
                 needs:{warcraft:2}},
  medicine:     {name:'Medicine',      icon:'⛑️', branch:'battle', max:10, per:3,  th:6,  lib:4,  unit:'%',
                 fx:'fewer casualties', cost:{food:320, wood:240}, time:170,
                 needs:{warcraft:3}},
  siegecraft:   {name:'Plunder',       icon:'🧺', branch:'battle', max:10, per:5,  th:8,  lib:6,  unit:'%',
                 fx:'raid loot', cost:{wood:420, iron:180}, time:200,
                 needs:{medicine:2}},
};

/* ── per-line mastery ──
   Generated from TROOPS so a fifth line could never be added without its study,
   and so the icons and names can never drift out of step with the troops
   themselves. Deliberately the same shape for all four: the CHOICE is which one
   you pour a hundred hours into, and the cost curve is what stops you doing all
   four. Each needs Warcraft 5 — you learn to fight before you specialise. */
export const LINE_PER = 2;          // % power for that line, per level
export const LINE_MAX = 15;         // deeper than the general tracks: this is the long grind
for(const [k, t] of Object.entries(TROOPS)){
  RESEARCH['line_' + k] = {
    name: t.plural + ' Mastery', icon: t.icon, branch:'battle', line: k,
    max: LINE_MAX, per: LINE_PER, th: 9, lib: 7, unit:'%',
    fx: t.plural.toLowerCase() + ' only — power',
    cost: Object.fromEntries(Object.entries(t.cost).map(([r, v]) => [r, v * 14])),
    time: 210, needs:{warcraft:5},
  };
}

/* ── the Truegold tier ──
   Gated on the Crucible, priced in Truegold, and the reason the Crucible exists.
   Big numbers, slow study, deepest in the game. Each one lands on a bonus the
   engine ALREADY reads, because a study whose number nothing consumes is exactly
   the dead end Truegold itself was. */
export const TG_LIB = 20;           // the Library still has to keep up
/* The Truegold price is set against the MEASURED ore economy, not by feel. The Salt Isle is the
   only source: 49 sites a season, one three-hour voyage at a time, spent when worked and refilled
   only when the season turns. Worked perfectly — every site, every fortnight — that is 586 Isle Ore
   a season, so 147 Truegold. This tier first shipped at 6 Truegold a level, which totalled 7,078
   and would have taken FORTY-EIGHT seasons of flawless sailing: not a long grind, an unreachable
   one. At 1 it totals ~1,230, or eight seasons at perfect play and roughly twice that for anyone
   living a normal life. That is the intended shape for the last thing in the game. */
export const TRUEGOLD = {
  tg_might:   {name:'Truegold Edge',    icon:'🏵️', branch:'battle', max:20, per:2,  unit:'%',
               fx:'troop power, every line', cost:{truegold:1, steel:120}, time:900, cru:1},
  /* per:5, not the 14 this first shipped with. Each Truegold study should be worth
     roughly a third again its base track — tg_might is 1.3× Warcraft, tg_hoard 1.5×
     Logistics — and at 14 this one was 3.5× the whole Fortification track, which took a
     maxed wall from ×5 to ×21 and would have made an endgame hold simply unraidable.
     Measured, not guessed: see the ladder in DESIGN.md. */
  tg_bulwark: {name:'Truegold Bulwark',  icon:'🛡️', branch:'battle', max:20, per:5,  unit:'',
               fx:'wall power per level', cost:{truegold:1, stone:1400}, time:900, cru:4},
  tg_harvest: {name:'Truegold Yield',    icon:'🌟', branch:'growth', max:20, per:2,  unit:'%',
               fx:'all production', cost:{truegold:1, runestone:40}, time:900, cru:1},
  tg_hoard:   {name:'Truegold Vaults',   icon:'🏰', branch:'growth', max:20, per:3,  unit:'%',
               fx:'storage capacity', cost:{truegold:1, stone:1600}, time:900, cru:7},
};
for(const [k, d] of Object.entries(TRUEGOLD)){
  RESEARCH[k] = {...d, tg:true, th:18, lib:TG_LIB};
}

export const RESEARCH_COST_EXP = 1.9, RESEARCH_TIME_EXP = 1.5;
/* Truegold flattens both curves — level 20 of a 1.9-exponent track would cost
   ~1,700 Truegold, which at 0.012/s is over a year. These are meant to be a long
   grind, not an unreachable one. */
export const TG_COST_EXP = 1.15, TG_TIME_EXP = 1.1;

export function techLvl(s, k){ return (s.research && s.research[k]) || 0; }
export function techBonus(s, k){ return techLvl(s, k) * RESEARCH[k].per / 100; }
/* fortification and its Truegold echo are flat numbers, not percentages */
export function techFlat(s, k){ return techLvl(s, k) * RESEARCH[k].per; }

/* Per-line power: the general Warcraft bonus applies to everyone, this one only to
   its own line. Read by tierPower, so it lands wherever a single troop's power is
   asked for — the muster roll, the wall, a column on the road. */
export function techLine(s, k){
  const d = RESEARCH['line_' + k];
  return d ? techLvl(s, 'line_' + k) * d.per / 100 : 0;
}

export function techCost(s, k){
  const d = RESEARCH[k], lvl = techLvl(s, k), c = {};
  const mult = Math.pow(lvl + 1, d.tg ? TG_COST_EXP : RESEARCH_COST_EXP);
  for(const [r, v] of Object.entries(d.cost)) c[r] = Math.round(v * mult);
  return c;
}
export function techTime(s, k){
  const d = RESEARCH[k], lvl = techLvl(s, k);
  const scholars = Math.max(0.4, 1 - 0.02 * Math.max(0, (s.b.library || 1) - 1));
  const exp = d.tg ? TG_TIME_EXP : RESEARCH_TIME_EXP;
  return Math.round(d.time * Math.pow(lvl + 1, exp) * scholars) * 1000 * TIME_SCALE;
}
/* The Library caps every track: you can never study past its level. */
export function techCap(s, k){ return Math.min(RESEARCH[k].max, s.b.library || 0); }

/* The prerequisite check, reported as prose rather than a boolean so the panel can
   say WHICH study is in the way — a locked node that will not tell you why is the
   thing that makes these trees feel opaque. */
export function techNeeds(s, k){
  const need = RESEARCH[k].needs;
  if(!need) return null;
  for(const [dep, lvl] of Object.entries(need)){
    if(techLvl(s, dep) < lvl) return 'Needs ' + RESEARCH[dep].name + ' ' + lvl;
  }
  return null;
}

export function techBlockedBy(s, k){
  const d = RESEARCH[k];
  if((s.b.library || 0) < 1) return 'Build the Great Library first';
  if(d.tg && (s.b.crucible || 0) < d.cru) return 'Needs Truegold Crucible ' + d.cru;
  if((s.b.library || 0) < d.lib) return 'Needs Great Library ' + d.lib;
  if(s.b.townhall < d.th) return 'Needs Town Hall ' + d.th;
  const dep = techNeeds(s, k);
  if(dep) return dep;
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
/* Per-branch progress, for the two tabs. */
export function branchProgress(s, br){
  const keys = Object.keys(RESEARCH).filter(k => RESEARCH[k].branch === br);
  const done = keys.reduce((a, k) => a + techLvl(s, k), 0);
  const total = keys.reduce((a, k) => a + RESEARCH[k].max, 0);
  return { done, total, pct: total ? Math.round(100 * done / total) : 0 };
}
export const branchKeys = br => Object.keys(RESEARCH).filter(k => RESEARCH[k].branch === br);
