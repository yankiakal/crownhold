// Research: the slow, permanent power curve that runs beside construction.
//
// The design note that matters: research only feels worth doing when the numbers
// are big enough to *notice*. A tree that adds 5% over a hundred hours is the
// Rise-of-Empires trap — technically progress, emotionally nothing. So every
// track here tops out at a bonus you can feel. Measured at Town Hall 25 with the
// same buildings and troops either way: the general tracks alone are ×1.39 army,
// adding per-line mastery ×1.77, and the Electrum tier on top of that ×2.40. The
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
//   1. BRANCHES, sharing one queue — so investing in one is genuinely not investing
//      in the others, and the single queue is what makes that cost real. Two at
//      first, four now (Growth, Battle, Seafaring, Electrum), and this is the axis
//      the tree is meant to grow along for years: a branch is a tab, and tabs
//      scroll, whereas a row cannot exceed four nodes on a portrait phone.
//   2. PREREQUISITES (`needs`). A study can require a level in an earlier study.
//      This is the part the flat list was missing entirely.
//   3. PER-LINE MASTERY. Kingshot's battle tree researches each troop type
//      separately, and that is the deepest grind in it. Our combat model has ONE
//      power per line rather than Whiteout's four stats per line, so the honest
//      translation is a per-line power track — four of them, deliberately too
//      expensive to max all at once. That turns the Battle branch into a question
//      about what ARMY you are building, not just a bar.
//
// ── the Electrum tier ──
// Kingshot's endgame vertical, and here it fixes an outright bug. The Crucible
// refines Isle Ore into Electrum, and until now NOTHING IN THE GAME SPENT IT — the
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

/* Four branches. Electrum has its own, which is Kingshot's arrangement too — theirs lives in a
   separate building — and there was a drawing reason as well: every Electrum study perfects a
   mundane track, so inside the main tree all four attached to roots four and five rows above them
   and drew as long edges looping around the whole diagram. Given its own branch each is simply an
   endgame study that names its prerequisite, and every other tree comes out clean.

   Seafaring came later, for a different reason: the Salt Isle had no research at all, and a game
   meant to run for years needs somewhere to keep growing that is not filler. The remaining
   candidates with zero research are marches and Command, heroes and the Court, the frontier and
   beasts, wall wear, and Writs — each one a branch's worth of studies that land on levers the
   engine already reads. */
export const BRANCHES = {
  growth:    {name:'Growth', icon:'🌾', blurb:'Land, stores, and the speed of every crew.'},
  battle:    {name:'Battle', icon:'⚔️', blurb:'The army, the wall, and what comes home.'},
  road:      {name:'The Road', icon:'🛤️', blurb:'Columns on the march — how far, how fast, how much they carry.'},
  watch:     {name:'The Watch', icon:'🛡️', blurb:'The wall between raids, and the peace you are owed.'},
  court:     {name:'The Court', icon:'👑', blurb:'Captains: how quickly they learn and how many may sit.'},
  seafaring: {name:'Seafaring', icon:'🧭', blurb:'The crossing to the Salt Isle, and what the ship brings back.'},
  electrum:  {name:'Electrum', icon:'🏵️', blurb:'The deepest study in the Reach, paid for in Electrum from the Salt Isle.'},
};

/* `needs` is the tree: {study: level}. `line` marks a per-troop-line study.
   `el` marks the Electrum tier, which is gated on the Crucible instead of the Library. */
export const RESEARCH = {
  /* ── Growth ── */
  husbandry:    {name:'Husbandry',     short:'Husbandry',     icon:'🌾', branch:'growth', max:10, per:3,  th:2,  lib:1,  unit:'%',
                 fx:'food & wood production', cost:{food:150, wood:150}, time:90},
  masonry:      {name:'Masonry',       short:'Masonry',       icon:'⛏️', branch:'growth', max:10, per:3,  th:3,  lib:1,  unit:'%',
                 fx:'stone & iron production', cost:{wood:180, stone:120}, time:100,
                 needs:{husbandry:2}},
  logistics:    {name:'Logistics',     short:'Logistics',     icon:'🛤️', branch:'growth', max:10, per:4,  th:4,  lib:2,  unit:'%',
                 fx:'storage capacity', cost:{wood:220, stone:160}, time:120,
                 needs:{masonry:2}},
  drillcraft:   {name:'Drillcraft',    short:'Drillcraft',    icon:'🥁', branch:'growth', max:10, per:3,  th:5,  lib:3,  unit:'%',
                 fx:'faster training', cost:{food:240, wood:180}, time:140,
                 needs:{husbandry:4}},
  statecraft:   {name:'Statecraft',    short:'Statecraft',    icon:'📜', branch:'growth', max:10, per:4,  th:7,  lib:5,  unit:'%',
                 fx:'Valor earned', cost:{food:380, stone:260}, time:180,
                 needs:{logistics:4}},
  smelting:     {name:'Smelting',      short:'Smelting',      icon:'🔥', branch:'growth', max:10, per:6,  th:12, lib:8,  unit:'%',
                 fx:'refining speed', cost:{stone:600, iron:300}, time:260,
                 needs:{masonry:6}},

  /* ── Battle ── */
  warcraft:     {name:'Warcraft',      short:'Warcraft',      icon:'⚔️', branch:'battle', max:10, per:3,  th:4,  lib:2,  unit:'%',
                 fx:'troop power, every line', cost:{food:260, iron:90}, time:150},
  fortification:{name:'Fortification', short:'Walls', icon:'🏯', branch:'battle', max:10, per:8,  th:5,  lib:3,  unit:'',
                 fx:'wall power per level', cost:{stone:300, iron:80}, time:160,
                 needs:{warcraft:2}},
  /* Gated on Fortification rather than Warcraft: the infirmary is the building behind the wall, so
     the chain reads fight → wall → treat the wounded → campaign → specialise. It also makes the
     Battle branch a single unbroken spine with no edge skipping a row. */
  medicine:     {name:'Medicine',      short:'Medicine',      icon:'⛑️', branch:'battle', max:10, per:3,  th:6,  lib:4,  unit:'%',
                 fx:'fewer casualties', cost:{food:320, wood:240}, time:170,
                 needs:{fortification:2}},
  siegecraft:   {name:'Plunder',       short:'Plunder',       icon:'🧺', branch:'battle', max:10, per:5,  th:8,  lib:6,  unit:'%',
                 fx:'raid loot', cost:{wood:420, iron:180}, time:200,
                 needs:{medicine:2}},

  /* ── The Road ──
     Marching had no research at all, which is odd for the thing you spend the most time doing.
     Every lever below already exists: marchSpeed, marchCapacity, gatherYield, the road losses in
     resolveMarch, and marchSlots. Slots are the interesting one — an extra column is the single
     biggest quality-of-life gain in the game, so it is two levels and dear, not ten and cheap. */
  roadwork:     {name:'Roadwork',      short:'Roadwork',  icon:'🛤️', branch:'road', max:10, per:2,   th:6,  lib:4,  unit:'%',
                 fx:'faster on the march', cost:{stone:400, wood:300}, time:150},
  baggage:      {name:'Baggage Train', short:'Baggage',   icon:'🐴', branch:'road', max:10, per:3,   th:7,  lib:5,  unit:'%',
                 fx:'bigger columns', cost:{wood:520, food:380}, time:180,
                 needs:{roadwork:2}},
  foraging:     {name:'Foraging',      short:'Foraging',  icon:'🧺', branch:'road', max:10, per:4,   th:8,  lib:5,  unit:'%',
                 fx:'more from every gathering tile', cost:{food:600, wood:450}, time:200,
                 needs:{roadwork:4}},
  outriders:    {name:'Outriders',     short:'Outriders', icon:'🏇', branch:'road', max:10, per:3,   th:10, lib:8,  unit:'%',
                 fx:'fewer lost on the road', cost:{iron:520, food:700}, time:220,
                 needs:{foraging:3}},
  /* Two levels, like the Spyglass, and for the same reason: a march slot is an integer. Spread
     over ten levels it would be eight rungs that visibly do nothing. */
  relays:       {name:'Relay Posts',   short:'Relays',    icon:'📯', branch:'road', max:2,  per:1,   th:13, lib:11, unit:' march',
                 fx:'another column on the road', cost:{stone:2600, steel:90}, time:900,
                 needs:{outriders:4}},

  /* ── The Watch ──
     The wall between raids. Wear, mending and Writs were all unresearched, and they are what the
     defensive half of the game is made of. */
  ramparts:     {name:'Ramparts',      short:'Ramparts',  icon:'🧱', branch:'watch', max:10, per:3,  th:6,  lib:4,  unit:'%',
                 fx:'the wall loosens less per assault', cost:{stone:520, wood:260}, time:160},
  mortar:       {name:'Mortarwork',    short:'Mortar',    icon:'🪣', branch:'watch', max:10, per:4,  th:7,  lib:5,  unit:'%',
                 fx:'masons mend the wall faster', cost:{stone:680, iron:200}, time:190,
                 needs:{ramparts:2}},
  quarrymen:    {name:'Quarrymen',     short:'Quarrymen', icon:'⛏️', branch:'watch', max:10, per:3,  th:9,  lib:5,  unit:'%',
                 fx:'mending costs less stone', cost:{stone:900, food:500}, time:210,
                 needs:{ramparts:4}},
  /* Writ capacity is an integer too — and it is the strongest single defensive lever in the game,
     so it is the shallowest and dearest study here. */
  vigil:        {name:'The Vigil',     short:'Vigil',     icon:'🕊️', branch:'watch', max:2,  per:1,  th:14, lib:12, unit:' Writ',
                 fx:'one more Writ of Peace held at once', cost:{stone:3200, steel:110}, time:900,
                 needs:{quarrymen:4}},

  /* ── The Court ──
     Captains were the one system with no study at all, and they are the thing the whole column
     hangs off. Deliberately the smallest branch: heroes are drafted, never bought, and research
     that made them arrive faster would edge toward the gacha this game exists to avoid. What is
     studied is how quickly they LEARN and how many may sit — not who shows up. */
  tutelage:     {name:'Tutelage',      short:'Tutelage',  icon:'📖', branch:'court', max:10, per:4,  th:8,  lib:6,  unit:'%',
                 fx:'captains learn faster', cost:{food:700, stone:400}, time:200},
  heraldry:     {name:'Heraldry',      short:'Heraldry',  icon:'🎖️', branch:'court', max:10, per:2,  th:11, lib:9,  unit:'%',
                 fx:'a captain leads harder', cost:{stone:1100, iron:420}, time:240,
                 needs:{tutelage:3}},
  /* One extra chair, once. COURT_MAX is 8 and the Town Hall already grants up to that, so this
     study raises the ceiling itself rather than the rate — hence a single level. */
  chairs:       {name:'The High Table',short:'High Table',icon:'🪑', branch:'court', max:1,  per:1,  th:16, lib:14, unit:' chair',
                 fx:'one more seat at court', cost:{steel:140, stone:2400}, time:1200,
                 needs:{heraldry:4}},

  /* ── Seafaring ──
     The Salt Isle was a whole second map with no research touching it at all: its only study was
     the Electrum tier that spends what it produces. That made it the thinnest system in the game
     and the obvious first place to deepen, because every lever below already exists in the code —
     voyageTime, rationCost, the ore roll, the landing's loss factor, revealAround's radius, the
     non-ore haul. Nothing here is a new mechanic, so nothing here is a filler rung.

     Costs are partly in RATIONS on purpose. Rations are what victual a voyage, so studying the
     Isle competes with sailing it — the one branch in the tree where research and the thing being
     researched draw on the same purse. That is a decision rather than a queue.

     What is deliberately NOT here: a second simultaneous voyage. "One voyage at a time, however
     many march slots you own" is a stated pillar of the Isle's design — it is what makes a crossing
     a decision you live with rather than a farm — and no research should be able to buy that away. */
  cartography:  {name:'Cartography',   short:'Charts',    icon:'🗺️', branch:'seafaring', max:10, per:1.5, th:12, lib:12, unit:'%',
                 fx:'shorter crossing', cost:{wood:900, rations:40}, time:260},
  victualling:  {name:'Victualling',   short:'Victuals',  icon:'🥫', branch:'seafaring', max:10, per:2,   th:12, lib:13, unit:'%',
                 fx:'cheaper to victual a voyage', cost:{food:1200, rations:50}, time:280,
                 needs:{cartography:2}},
  /* Two levels, not ten. The reveal radius is an integer ring — a per-level fraction of a cell
     would be eight dull rungs and two real ones, which is the exact trap this tree is built to
     avoid. Shallow and expensive is the honest shape for a lever that cannot be continuous. */
  spyglass:     {name:'The Spyglass',  short:'Spyglass',  icon:'🔭', branch:'seafaring', max:2,  per:1,   th:12, lib:13, unit:' ring',
                 fx:'further sight from a landing', cost:{steel:60, rations:120}, time:600,
                 needs:{cartography:3}},
  prospecting:  {name:'Prospecting',   short:'Prospect',  icon:'⛏️', branch:'seafaring', max:10, per:4,   th:14, lib:15, unit:'%',
                 fx:'more Isle Ore from a landing', cost:{iron:900, rations:80}, time:320,
                 needs:{victualling:3}},
  seamanship:   {name:'Seamanship',    short:'Seamen',    icon:'⚓', branch:'seafaring', max:10, per:3,   th:14, lib:15, unit:'%',
                 fx:'fewer lost on a contested landing', cost:{steel:40, rations:70}, time:300,
                 needs:{spyglass:1}},
  salvage:      {name:'Salvage',       short:'Salvage',   icon:'🪝', branch:'seafaring', max:10, per:3,   th:16, lib:18, unit:'%',
                 fx:'more of everything else a site yields', cost:{stone:1400, rations:90}, time:340,
                 needs:{prospecting:3}},
};

/* ── per-line mastery ──
   Generated from TROOPS so a fifth line could never be added without its study,
   and so the icons and names can never drift out of step with the troops
   themselves. Deliberately the same shape for all four: the CHOICE is which one
   you pour a hundred hours into, and the cost curve is what stops you doing all
   four.

   Each needs Plunder 3, not Warcraft 5 as first written. Thematically it is the better gate — you
   learn to fight, wall up, treat your wounded and campaign for spoils, and only a veteran army
   specialises. Structurally it is why the Battle branch is a tree at all: hung off Warcraft, these
   four sat one row below the root while the library floor pushed them four rows down, and SEVEN
   studies fanned out of a single node. Measured before changing anything — see DESIGN.md. */
export const LINE_PER = 2;          // % power for that line, per level
export const LINE_MAX = 15;         // deeper than the general tracks: this is the long grind
for(const [k, t] of Object.entries(TROOPS)){
  RESEARCH['line_' + k] = {
    name: t.plural + ' Mastery', short: t.plural, icon: t.icon, branch:'battle', line: k,
    max: LINE_MAX, per: LINE_PER, th: 9, lib: 7, unit:'%',
    fx: t.plural.toLowerCase() + ' only — power',
    cost: Object.fromEntries(Object.entries(t.cost).map(([r, v]) => [r, v * 14])),
    time: 210, needs:{siegecraft:3},
  };
}

/* ── the Electrum tier ──
   Gated on the Crucible, priced in Electrum, and the reason the Crucible exists.
   Big numbers, slow study, deepest in the game. Each one lands on a bonus the
   engine ALREADY reads, because a study whose number nothing consumes is exactly
   the dead end Electrum itself was. */
export const EL_LIB = 20;           // the Library still has to keep up
/* The Electrum price is set against the MEASURED ore economy, not by feel. The Salt Isle is the
   only source: 49 sites a season, one three-hour voyage at a time, spent when worked and refilled
   only when the season turns. Worked perfectly — every site, every fortnight — that is 586 Isle Ore
   a season, so 147 Electrum. Prospecting in the Seafaring branch lifts that by up to two fifths, to
   about 205 a season, which is the intended shape: the branch that studies the Isle is what makes
   the metal it yields come faster. This tier first shipped at 6 Electrum a level, which totalled 7,078
   and would have taken FORTY-EIGHT seasons of flawless sailing: not a long grind, an unreachable
   one. At 1 it totals ~1,230, or eight seasons at perfect play and roughly twice that for anyone
   living a normal life. That is the intended shape for the last thing in the game. */
/* Each Electrum study hangs off the mundane track it perfects — you master iron before you
   master Electrum. Thematic, but structural too: without these the four of them had no
   prerequisites at all, so the tree view laid them in the TOP row beside Warcraft, which read as
   "start here" for the most endgame content in the game. */
export const ELECTRUM = {
  el_might:   {name:'Electrum Edge',    short:'Edge',    icon:'🏵️', branch:'electrum', max:20, per:2,  unit:'%',
               fx:'troop power, every line', cost:{electrum:1, steel:120}, time:900, cru:1,
               needs:{warcraft:10}},
  /* per:5, not the 14 this first shipped with. Each Electrum study should be worth
     roughly a third again its base track — el_might is 1.3× Warcraft, el_hoard 1.5×
     Logistics — and at 14 this one was 3.5× the whole Fortification track, which took a
     maxed wall from ×5 to ×21 and would have made an endgame hold simply unraidable.
     Measured, not guessed: see the ladder in DESIGN.md. */
  el_bulwark: {name:'Electrum Bulwark',  short:'Bulwark',  icon:'🛡️', branch:'electrum', max:20, per:5,  unit:'',
               fx:'wall power per level', cost:{electrum:1, stone:1400}, time:900, cru:4,
               needs:{fortification:10}},
  /* th:22, alone among the four. It is priced in runestone, and runestone comes only from the
     Runeworks at Town Hall 22 — so at the tier's default gate of 18 this study unlocked, showed a
     Begin button, and could not be paid for by any hold in the game until four Town Hall levels
     later. Keeping the cost and moving the gate is the better fix than the reverse: it ties the
     deepest production study to the deepest refinery, and the other three still open with the
     Crucible so Electrum never has a window without a sink. */
  el_harvest: {name:'Electrum Yield',    short:'Yield',    icon:'🌟', branch:'electrum', max:20, per:2,  unit:'%',
               fx:'all production', cost:{electrum:1, runestone:40}, time:900, cru:1, th:22,
               needs:{husbandry:10}},
  el_hoard:   {name:'Electrum Vaults',   short:'Vaults',   icon:'🏰', branch:'electrum', max:20, per:3,  unit:'%',
               fx:'storage capacity', cost:{electrum:1, stone:1600}, time:900, cru:7,
               needs:{logistics:10}},
};
for(const [k, d] of Object.entries(ELECTRUM)){
  /* th defaults to 18 — the Crucible's own gate, so the sink opens exactly when the source does —
     but a study may name a later one when its COST needs a building that opens later still. */
  RESEARCH[k] = {...d, el:true, th: d.th || 18, lib:EL_LIB};
}

export const RESEARCH_COST_EXP = 1.9, RESEARCH_TIME_EXP = 1.5;
/* Electrum flattens both curves — level 20 of a 1.9-exponent track would cost
   ~1,700 Electrum, which at 0.012/s is over a year. These are meant to be a long
   grind, not an unreachable one. */
export const EL_COST_EXP = 1.15, EL_TIME_EXP = 1.1;

export function techLvl(s, k){ return (s.research && s.research[k]) || 0; }
export function techBonus(s, k){ return techLvl(s, k) * RESEARCH[k].per / 100; }
/* fortification and its Electrum echo are flat numbers, not percentages */
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
  const mult = Math.pow(lvl + 1, d.el ? EL_COST_EXP : RESEARCH_COST_EXP);
  for(const [r, v] of Object.entries(d.cost)) c[r] = Math.round(v * mult);
  return c;
}
export function techTime(s, k){
  const d = RESEARCH[k], lvl = techLvl(s, k);
  const scholars = Math.max(0.4, 1 - 0.02 * Math.max(0, (s.b.library || 1) - 1));
  const exp = d.el ? EL_TIME_EXP : RESEARCH_TIME_EXP;
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
  if(d.el && (s.b.crucible || 0) < d.cru) return 'Needs Electrum Crucible ' + d.cru;
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

/* ── the tree, as a layout ──
   Whiteout and Kingshot draw research as a graph you look at: nodes in rows, lines between a
   study and the study that unlocks it. A list of rows with a "Requires:" line buried in each
   detail sheet carries the same information and communicates almost none of it — you cannot see
   the shape of your own progress, which is the entire appeal of a tech tree.

   Rows are computed rather than authored, so the picture can never drift from the rules:

     row(k) = max( libRank(k), 1 + row(dep) for every prerequisite dep )

   The libRank floor keeps the Library's progression legible — it IS the spine of the tree, so a
   study needing Library 8 should sit below one needing Library 2 even when neither depends on the
   other. The prerequisite term is what guarantees the drawing is honest: a node is ALWAYS strictly
   below everything it needs, so every connector runs downward and none can point sideways or
   backwards. Authoring rows by hand would have let the two disagree the first time anyone edited
   `needs`; this cannot. */
export function treeRows(br){
  const keys = branchKeys(br);
  const inBranch = new Set(keys);
  /* Distinct Library requirements, compressed to consecutive ranks — the raw values jump 1,2,3,5,
     8,20 and using them directly would leave eleven empty rows above the Electrum tier. */
  const libs = [...new Set(keys.map(k => RESEARCH[k].lib))].sort((a, b) => a - b);
  const libRank = k => libs.indexOf(RESEARCH[k].lib);

  const row = {};
  const depth = k => {
    if(row[k] != null) return row[k];
    row[k] = 0;                                    // guards against a cycle mid-resolution
    let r = libRank(k);
    for(const dep of Object.keys(RESEARCH[k].needs || {}))
      if(inBranch.has(dep)) r = Math.max(r, 1 + depth(dep));
    return (row[k] = r);
  };
  keys.forEach(depth);

  const rows = [];
  for(const k of keys){
    (rows[row[k]] ||= []).push(k);
  }
  /* A branch whose rows are not contiguous would draw as a tree with gaps in it. */
  return rows.map(r => r || []);
}
/* Which studies this one unlocks — the downward edges, for drawing and for the detail sheet. */
export function unlockedBy(k){
  return Object.keys(RESEARCH).filter(x => RESEARCH[x].needs && RESEARCH[x].needs[k] != null);
}
