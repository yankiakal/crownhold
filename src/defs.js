// Crownhold game data. Pure constants — no state, no DOM.
// Balance note: run `npm run sim` after changing any number here.

export const BUILDINGS = {
  townhall:  {name:'Town Hall',  icon:'🏰', fx:'Raises storage caps; gates every other building.',
              cost:{wood:200,stone:150}, time:20, max:30},
  farm:      {name:'Farm',       icon:'🌾', prod:'food', rate:2.0, cost:{wood:30},           time:8,  max:30},
  lumberyard:{name:'Lumberyard', icon:'🪵', prod:'wood', rate:1.6, cost:{food:30},           time:8,  max:30},
  quarry:    {name:'Quarry',     icon:'⛰️', prod:'stone',rate:1.0, cost:{wood:60,food:40},   time:12, max:30},
  ironmine:  {name:'Iron Mine',  icon:'⚒️', prod:'iron', rate:0.7, cost:{wood:80,stone:60},  time:15, max:30, th:3},
  barracks:  {name:'Barracks',   icon:'⚔️', fx:'Drills Spearmen. Each level trains 6% faster.',
              cost:{wood:60,stone:30},  time:15, max:30},
  range:     {name:'Archery Range',icon:'🏹', fx:'Drills Archers, on its own queue.',
              cost:{wood:110,stone:50}, time:16, max:30, th:3},
  stable:    {name:'Stable',     icon:'🐎', fx:'Drills Knights, on its own queue.',
              cost:{wood:160,food:120}, time:20, max:30, th:5},
  /* The keys `siegeyard` and `ballista` are deliberately NOT renamed to match the
     Battlemage. They are in every save on disk — `s.b.siegeyard`, `s.t.ballista`,
     `s.tier.ballista`, `s.trainedBy.ballista`, plus columns in flight, posted Watch
     garrisons and the raid register — and a rename for flavour is not worth a migration
     across all of them. Identifiers are for the machine; the player never sees one. */
  siegeyard: {name:'Mage Spire', icon:'☄️', fx:'Trains Battlemages, on its own queue.',
              cost:{wood:240,iron:90},  time:24, max:30, th:7},
  embassy:   {name:'Embassy',    icon:'🕊️', fx:'Opens alliances. +2 alliance helps your builds may take, per level.',
              cost:{stone:180,wood:120},time:18, max:25, th:5},
  wall:      {name:'Wall',       icon:'🧱', fx:'+18 defense power per level.',
              cost:{stone:90,wood:40},  time:18, max:30, th:2},
  watchtower:{name:'Watchtower', icon:'🗼', fx:'Scouts raid shape & strength; blunts attacks 4% per level.',
              cost:{wood:120,stone:80,iron:20}, time:20, max:16, th:3},
  tavern:    {name:'Tavern',     icon:'🍺', fx:'Expeditions: −1s cooldown and +3% yield per level.',
              cost:{wood:90,food:60},   time:14, max:25, th:2},
  granary:   {name:'Granary',    icon:'🏺', fx:'+2% food production and +3% storage per level.',
              cost:{wood:100,stone:40}, time:16, max:25, th:3},
  /* Nine levels and it was finished — and eight of those nine did exactly one thing, so the
     ninth was the last time the building was ever interesting. Now every third level opens a
     troop tier and EVERY level drills the muster harder, so there is no dull rung. */
  /* "+1%" here was stale for a long time: ACADEMY_POWER moved from 0.01 to 0.025 and this string
     did not follow, so the panel promised a quarter of what the building actually gave. */
  academy:   {name:'The Drillfield',icon:'🎓', fx:'+2.5% troop power per level. A troop tier every 3rd level from 6, up to Tier X at 30.',
              cost:{stone:150,iron:60}, time:25, max:30, th:4},
  hospital:  {name:'Infirmary',   icon:'⛑️', fx:'−4% casualties per level, more beds, faster healing, and more of the fallen come back wounded instead of dead.',
              cost:{wood:120,food:80},  time:18, max:25, th:4},
  command:   {name:'Command Center',icon:'🎖️', fx:'+1 march every 4 levels; marches travel 2% faster per level.',
              cost:{stone:220,wood:160},time:24, max:30, th:4},
  warehouse: {name:'Warehouse',  icon:'📦', fx:'Defeats plunder 4% less of your stores per level.',
              cost:{stone:130,wood:80}, time:18, max:20, th:5},
  library:   {name:'Great Library',icon:'📚', fx:'Houses your scholars. Its level is the ceiling on every study.',
              cost:{wood:200,stone:140}, time:22, max:30, th:4},
  forge:     {name:'Forge',      icon:'🔥', fx:'Smelts iron and wood into Steel, without pause.',
              cost:{stone:300,iron:180}, time:40, max:25, th:12},
  runeworks: {name:'Runeworks',  icon:'🔮', fx:'Binds stone and steel into Runestone.',
              cost:{stone:700,steel:25}, time:60, max:20, th:22},
  /* The two Kingshot buildings Crownhold skipped, given jobs that matter here
     rather than jobs that merely match. Together they are the chain that makes
     the Salt Isle possible: the Kitchen victuals a voyage, the voyage brings
     back ore, the Crucible turns ore into the finest metal in the Reach. */
  kitchen:   {name:'Victualler', icon:'🍲', fx:'Salts and packs Rations — what a voyage eats.',
              cost:{wood:220,food:260}, time:30, max:25, th:10},
  crucible:  {name:'Electrum Crucible', icon:'🏵️', fx:'Renders Isle ore into Electrum.',
              cost:{stone:900,steel:60}, time:70, max:20, th:18},
};
// polynomial curves: early levels are quick, late levels are the long road
export const COST_EXP = 2.0, TIME_EXP = 1.6;

/* ── troop tiers: the same soldier, forged better. Unlocked by the Drillfield ── */
export const TIERS = ['I','II','III','IV','V','VI','VII','VIII','IX','X'];
/* Academy levels per tier unlocked. Was 1 — nine levels, nine tiers, done. At 3 the ladder
   climbs properly and Tier X becomes a late-game achievement rather than something you have
   by Town Hall 9. */
export const ACADEMY_PER_TIER = 3;
/* THE LADDER STARTS AT 6, and that one change makes everything else come out even: Tier II at 6,
   then every third level — 6, 9, 12, 15, 18, 21, 24, 27, 30. Nine tiers, nine steps of three, and
   Tier X landing exactly on the Drillfield's last level with no gap anywhere in the ladder.

   Two worse versions came first. Starting at 3 with a flat step put Tier X at 27, three short of
   the top, which left this as the only building stopping short of 30 and made its last three levels
   the only ones in the game buying nothing but a percentage. Keeping the start at 3 and making
   Tier X ask for 30 fixed that but opened a six-level dry spell from 24 to 30 — and that is the
   worst place in the building to put one. Measured: levels 0→6 are 8,400 stone and 2.3 hours of
   queue; levels 24→30 are 634,650 stone, 79 hours, and refined goods besides. The same six levels
   cost seventy-five times as much at the top.

   So the quiet stretch belongs at the START, where it is nearly free, and every tier after it
   arrives on the same rhythm. The five levels before Tier II still pay ACADEMY_POWER each. */
export const ACADEMY_TOP = TIERS.length * ACADEMY_PER_TIER;   // 30, and BUILDINGS must agree
/* And what every level gives regardless, so no rung is dead. Deliberately troop POWER: it is
   the Academy's own domain, it lands on the multiplier every power figure already passes
   through, and it breaks no invariant.

   A promotion discount was the obvious first idea and is wrong — v1.43 made reforging cost
   exactly what the yard charges to drill a soldier a tier higher, so that neither route to a
   tier is cheaper than the other. Discounting promotions would reopen precisely that hole.

   0.025, not the 0.01 first shipped. At 1% a level the two rungs in three that open no tier
   read as nothing happening — power 3.09 to 3.12 — which is the exact dullness this bonus
   exists to remove. */
export const ACADEMY_POWER = 0.025;
/* TIER_COST is the premium a tier costs — and it is charged in exactly two places that must
   stay equal: the yard's price for drilling a soldier at that tier, and the per-head price of
   reforging one into it. Raising it makes promotions dearer, which is the point, and raising
   THIS number rather than the promotion formula is what keeps the two routes level. Nudging
   promoteCost alone would make drilling-then-reforging pricier than drilling at tier, which
   is the v1.43 hole in reverse. 0.22 → 0.28 makes a full climb to Tier X cost 2.52× a
   soldier's base price instead of 1.98×.

   Settled at 0.28 rather than the 0.36 first shipped, trading some of "cost a lot more" back
   for playability. Tiers remain far dearer in practice than before: they arrive a third as
   often, reforging occupies a timed queue, and the per-head price rose. Three frictions on one
   action was too many at once, and the simulator's WAVE RECORD is where it showed — the floors
   are catastrophe detectors and had nothing to say about an army quietly falling behind the
   raid clock. At 0.36 the 4-hour lopsided run lost 65 waves against 61 won; at 0.28 with the
   Academy bonus raised it loses 38 and reaches wave 116 instead of 62.

   (This comment said 0.22 → 0.55 for a while after the constant had moved to 0.36 — written
   during a sweep and never corrected. Prose drifts from code faster than anything else here.) */
export const TIER_POWER = 0.25, TIER_UPKEEP = 0.18, TIER_COST = 0.28;

/* And reforging a line now takes time, like every other commitment in the hold. Per soldier,
   so promoting a big line is a real decision rather than a button — and on its own queue, so
   it competes with nothing. Valor finishes it early, as it does any timer here. */
export const PROMOTE_MS_PER_TROOP = 900;
export const PROMOTE_MS_MIN = 30000;

/* ── one soldier, one tier bill, whichever door they came through ──
   A soldier can arrive at tier N two ways: drilled at tier N, or drilled at tier 1 and
   reforged later. TIER_COST is the premium the yard charges for the first route, so it
   has to be the promotion's per-soldier price for the second one too. Anything else
   makes the ROUTE matter rather than the destination, and the cheaper route becomes
   compulsory knowledge.

   It used to be 4.8× apart: 1.98× a soldier's base cost to drill them at tier X against
   9.45× to reforge them into it. So the efficient opening was to drill nothing until the
   Academy topped out, promote every line for almost nothing (the per-head term collapsed
   to 1 on an empty muster), and only then mass-drill. Measured end to end, that reached
   the same 400/400/200/100 army at tier X for 181,812 where growing an army the obvious
   way cost 716,113 — a 3.9× penalty for ordinary play, which is worse than an exploit
   for clever play.

   The per-head term itself was never the bug, and I removed it once by mistake. It is
   what keeps tiers NEUTRAL between a narrow army and a broad one: the bill scales with
   the bodies that benefit, so power-per-resource is the same either way and the meta is
   settled by cover and the counter triangle, which is where the design wants it settled.
   Pricing promotions per LINE instead handed a concentrated army the same upgrade for a
   quarter of the money, and mono took the floor at three budgets out of four.

   There is deliberately no separate metal charge on top. An earlier version added iron
   per step for the flavour of reforging, and that was exactly what broke the parity —
   the invariant is load-bearing and the flavour was not. */

/* ── an army eats more than bread ──
   Food upkeep already does one job perfectly: it keeps the Farm permanently worth
   upgrading, because it sets the ceiling on how large a muster you can hold. Measured,
   food runs NEGATIVE against a full army at every hold level — so the Farm is a building
   you never stop caring about.

   The Lumberyard, Quarry and Iron Mine had no such job, and the numbers were stark: at
   level 30 a hold produced 48 wood/s and the refineries — the only continuous sink —
   ate 8.5. The surplus did not merely exist, it GREW, because production and refining
   scale on the same exponent. So past the early game those three buildings were finished
   objects, exactly the complaint Kingshot earns when its resource buildings die at 20.
   (Worse: the ×3–10 launch time multiplier would have made it much sharper, since longer
   builds mean more hours of banking against the same one-off costs.)

   So arrows, shafts, shoes and barding are upkeep too. Sized against measurement rather
   than taste: production per level runs food 2.0 / wood 1.6 / iron 0.7, and the per-soldier
   demand below is set in those same proportions — 0.80 and 0.35 of the food figure. That
   means a hold whose resource buildings are all at the same level finds all three binding
   at the SAME army size, so a balanced player loses nothing and gains a reason to keep
   every mine current. Neglect the Iron Mine and iron caps your army instead.

   It also makes composition an economic question, which is the point: an archer line runs
   on wood, cavalry on iron, and a mono army leans its whole weight on one mine.

   ── priced per LOAD, not per body ──
   The first table was written per soldier and quietly favoured the exact build the
   composition rules exist to discourage. Per unit of army capacity it came out at 0.0625
   for a battlemage against 0.27 for an archer, so a mono-battlemage army was four times
   cheaper to keep in the field — a supply rule that rewarded going all-in on one line.
   Load is the currency army size is measured in, so it has to be the denominator here too,
   exactly as it is for column capacity and for promotion pricing.

   So every type costs the SAME per load (0.098) and differs only in WHICH resource:
   spearmen and archers run on wood, cavalry on iron, battlemages on both. No shape can
   dodge the constraint; a shape can only choose which mine it leans on.

   The 0.055 per load is SOLVED, not chosen — and the first solve was wrong in an
   instructive way. Doing it by hand from the production rates (2.0 food / 1.6 wood / 0.7
   iron per building level) gave 0.098, and that number ignored two things a real hold has:
   the Granary lifting food production by 2% a level, and the refineries taking their cut of
   wood and iron before the army sees any. Together those left food with nearly twice the
   headroom of wood — so the Farm became the slack building instead of the Lumberyard, which
   is moving the complaint rather than answering it.

   Solved numerically against actual holds at levels 15 through 28 instead, the ceilings
   that food, wood and iron each place on army size come within 10% of one another at every
   stage. All three mines matter, and none of them is the obvious one to neglect. */
/* Foot and bow draw NO iron, and that is a hard requirement rather than flavour. The Iron
   Mine needs Town Hall 3; a new hold opens with eight spearmen and no way to make iron at
   all. The first version charged them 0.015 each, so iron went into permanent shortage on
   the first tick of a new game and every soldier stood at 94% power before the player had
   touched anything. The Stable (Town Hall 5) and Mage Spire (7) both open after the mine,
   so pinning iron to those two lines means the game can never ask for what it has not yet
   let you build. */
export const SUPPLY = {
  spearman:{wood:0.055},               // shafts and shield-bosses
  archer:  {wood:0.055},               // arrows, constantly
  knight:  {wood:0.022, iron:0.087},   // shoes, barding, tack
  ballista:{wood:0.140, iron:0.080},   // staves, and focus-iron by the ingot
};
/* And it phases in with the hall rather than starting on day one. A village of eight
   spearmen living off the land is not a quartermaster's problem; an army is. Ramped
   instead of switched at a threshold, because a cliff in a cost is the same mistake as
   the win/loss cliff in the raid curve — full weight by Town Hall 8, nothing before 3. */
export const SUPPLY_FROM_TH = 3, SUPPLY_FULL_TH = 8;

/* ── stone, and the wall that eats it ──
   Supply gave the Lumberyard and the Iron Mine a permanent job. It did nothing for the
   Quarry, which was still running a +23/s surplus at a maxed hold — stone's only sinks
   were one-off building costs and the Runeworks' modest appetite.

   A wall that has been hit needs stone. That is the honest sink: it scales with how big
   your wall is AND with how often you are attacked, so the Quarry matters in proportion to
   how much wall you are actually asking to hold. And it costs the same thing the wall cost
   to raise, which is the only currency that makes sense for repairing it.

   Deliberately the same shape as the supply rule rather than a new kind of penalty: wear
   is continuous, it is capped so a wall is never worthless, nothing is ever destroyed, and
   it mends itself as fast as the Quarry can pay for it. A player who keeps up never sees
   it; a player who over-builds the wall and under-builds the Quarry fights on a wall that
   is half rubble. */
export const WALL_WEAR_PER_HIT = 0.05;     // knocked loose by one assault
export const WALL_WEAR_MAX = 0.50;         // a breached wall still counts for half
export const WALL_MEND_RATE = 0.0016;      // fraction restored per second, stone allowing
/* Stone for a full repair, at this level. Quadratic like the wall's own build cost — a
   level 30 curtain is not four times the work of a level 15 one, it is nine. */
export function wallMendCost(lvl){ return 26 * lvl * lvl; }

/* ── decrees: a standing order, and what it costs you ──
   The one thing the game had no version of: a lever you pull to change how your hold runs
   for a while. Taken from the idea of a gold-and-decrees system, minus the gold — that
   currency is the premium currency in Kingshot and Whiteout Survival and the whole P2W
   spine, and an unsellable copy of it would just duplicate what steel and runestone
   already do. So decrees run on VALOR, which is earned only by playing and is already the
   thing you spend.

   Every decree is a TRADE, never a bonus. That is the rule that keeps this from being a
   power ratchet: each one names what it gives AND what it takes, on a different axis, so
   announcing one is a read of your situation rather than an upgrade. Nothing here can be
   bought, and a player who never announces a decree is not behind — they are unspecialised,
   which against the wrong season is sometimes correct.

   One at a time, deliberately. Two would let you stack the gives and split the takes across
   axes you do not care about, and a menu of stacking modifiers is how "choice" quietly
   becomes "arithmetic with one answer" — the same failure the troop ladder had.

   Every field below lands on a modifier key the game ALREADY reads through heroBonus, so a
   decree needs no plumbing at the point of use: the same lesson the Muster Roll learned by
   reading counters that already existed. */
/* ── an hour, because that is what the game already promised ──
   Reported from play: "every time I refresh the page the previous decree seems to be gone, so I
   have to select again?" Round-tripped it through save() and load() and the decree survives
   perfectly at 0, 1, 5 and 9 minutes — it was not being dropped, it was EXPIRING, at ten real
   minutes. Refreshing is simply when you look.

   Ten minutes was indefensible once measured against its own price. A decree costs 35–50 Valor
   against a daily quota of 100 + 25 × Town Hall, so keeping one standing all day cost 144 × 40 =
   5,760 Valor at Town Hall 10, where the quota is 350. Sixteen times a full day's earnings to
   maintain, which is not a trade, it is a tease. At an hour it is 24 × 40 = 960, so a day's Valor
   buys roughly nine hours of one standing order — a thing you put on for a session and feel.

   The First Light card already said a decree suits "what you are doing this hour". The copy was
   right and the constant was wrong; this is the constant catching up. */
export const DECREE_MS = 60 * 60 * 1000;
/* ── the effect lines are written by the code ──
   They used to be prose: "Production rises a fifth", "Drilling is a third faster". Two problems.
   A written-out fraction needs English to parse, and this is a game for anyone anywhere — a number
   reads the same in every language. And the prose had already drifted from the values sitting beside
   it: "a third faster" next to trainTime 0.35, "a fifth" next to production 0.20. Hand-written copy
   describing hand-written numbers disagrees eventually, always.

   So the text is GENERATED from up/down. It cannot drift, and it comes out numeric.

   The sign needs care. upkeep, trainTime and casualties are consumed as `1 − bonus`, so a POSITIVE
   value there is a REDUCTION and has to print with a minus; production, troopPower, speed and haul
   are consumed as `1 + bonus`. `inv` marks which is which. */
const FX_LABEL = {
  speed:      { txt: 'march speed',   inv: false },
  haul:       { txt: 'haul carried',  inv: false },
  upkeep:     { txt: 'upkeep',        inv: true  },
  trainTime:  { txt: 'training time', inv: true  },
  production: { txt: 'production',    inv: false },
  troopPower: { txt: 'troop power',   inv: false },
  casualties: { txt: 'casualties',    inv: true  },
};
export function fxText(effects){
  return Object.entries(effects).map(([k, v]) => {
    const m = FX_LABEL[k] || { txt: k, inv: false };
    const up = m.inv ? v < 0 : v > 0;      // an inverted key flips the SIGN SHOWN, not the maths
    return (up ? '+' : '−') + Math.round(Math.abs(v) * 100) + '% ' + m.txt;
  }).join(', ');
}
/* The two halves are exported SEPARATELY, and that is the point. The decree panel wants them in
   different colours — the gift green, the price red — and it used to get them by splitting `fx` on
   a ';'. When fx started being generated in v1.90 the separator became ' · ', the split stopped
   matching, `[1]` came back undefined, and the red span rendered empty: every downside was printed
   in the green line, styled as a benefit, for two versions. Reported from play as "decree negative
   things should be in red", which they had been until I joined the string differently.
   A caller that needs one half now asks for that half. There is no separator to agree on. */
export function decreeUp(def){ return fxText(def.up); }
export function decreeDown(def){ return fxText(def.down); }
export function decreeFx(def){ return decreeUp(def) + ' · ' + decreeDown(def); }

export const DECREES = {
  march:  {name:'Forced March',  icon:'🥁', cost:40,
           why:'For when the frontier matters more than the haul.',
           up:{speed:0.30},      down:{haul:-0.25}},
  ration: {name:'Rationing',     icon:'🍲', cost:35,
           why:'For a muster larger than your farms.',
           up:{upkeep:0.33},     down:{trainTime:-0.25}},
  levy:   {name:'The Levy',      icon:'📯', cost:45,
           why:'For rebuilding a muster in a hurry.',
           up:{trainTime:0.35},  down:{production:-0.15}},
  harvest:{name:'Full Granaries',icon:'🌾', cost:35,
           why:'For a quiet fortnight spent growing.',
           up:{production:0.20}, down:{troopPower:-0.10}},
  blood:  {name:'Bloody Work',   icon:'🗡️', cost:50,
           why:'For a fight you intend to win whatever it costs.',
           up:{troopPower:0.12}, down:{casualties:-0.25}},
};
/* fx is a getter rather than a stored string, so every existing reader of `def.fx` keeps working
   untouched and can never be handed a stale line. */
for(const d of Object.values(DECREES))
  Object.defineProperty(d, 'fx', { get(){ return decreeFx(this); }, enumerable: true });

export const SUPPLY_RES = ['wood', 'iron'];
/* Running dry does NOT kill anybody. Desertion is right for hunger — an unfed soldier
   leaves — but wrong for equipment: blunt arrows and lame horses make an army weaker, not
   smaller, and a rule that deletes troops you paid for over a wood shortage would make
   the whole system feel like a trap. So the penalty is power, it is continuous in how long
   you have been short, and it heals twice as fast as it accrues. */
export const SUPPLY_PENALTY = 0.40;        // most a wholly unsupplied line can lose
export const SHORT_RAMP = 45000;           // ms of shortage to reach the full penalty
export const SHORT_MEND = 2;               // recovery runs this many times faster

/* upkeep: food/sec per soldier — armies eat. This is what keeps army size in
   equilibrium with your farms instead of scaling to infinity. */
export const TROOPS = {
  spearman:{name:'Spearman', plural:'Spearmen', icon:'🛡️', power:3,  upkeep:0.06, cost:{food:25,wood:10}, time:4,  at:'barracks'},
  archer:  {name:'Archer',   plural:'Archers',  icon:'🏹', power:5,  upkeep:0.10, cost:{food:20,wood:25}, time:6,  at:'range'},
  // iron units eat less per point of power — quality is the path past the food ceiling
  knight:  {name:'Knight',   plural:'Knights',  icon:'🐎', power:11, upkeep:0.17, cost:{food:60,iron:20}, time:12, at:'stable'},
  /* A battlemage, not a siege engine — and the profile is the reason, not the flavour.
     This line was always the glass cannon: dearest per body, highest power, HOLDS 0,
     NEEDS 1, worth half of itself with nobody standing in front. That is a spellcaster's
     shape, so the name follows the numbers rather than the numbers following the name.
     Asked about adding mages as a FIFTH line; measured, there is no room — see DESIGN.md. */
  ballista:{name:'Battlemage',plural:'Battlemages',icon:'☄️',power:24, upkeep:0.38, cost:{wood:80,iron:40}, time:20, at:'siegeyard'},
};

/* The Mastery track — Crownhold's replacement for VIP levels. Earned from every
   kind of play (raids, quests, building, drilling, patrols); never sold. */
export const MASTERY = [
  {need:60,   fx:'+6% production'},
  {need:190,  fx:'+6% troop power'},
  {need:400,  fx:'Expedition cooldown −12s'},
  {need:700,  fx:'+15% storage'},
  {need:1100, fx:'−12% build & training time'},
  {need:1600, fx:'+1 hero slot — another champion answers'},
  {need:2200, fx:'+1 Writ of Peace held at once'},
  {need:2900, fx:'+8% production & troop power'},
  {need:3700, fx:'+100% expedition yield'},
  {need:4600, fx:'+15% troop power — High Sovereign'},
  {need:5800, fx:'+8% production'},
  {need:7300, fx:'+8% troop power'},
  {need:9200, fx:'+10% storage'},
  {need:11600,fx:'+1 Writ of Peace held at once'},
  {need:14700,fx:'−10% casualties'},
  {need:18600,fx:'−8% army upkeep'},
  {need:23500,fx:'+15% raid loot'},
  {need:29700,fx:'−10% build & training time'},
  {need:37500,fx:'+10% Valor earned'},
  {need:47500,fx:'+20% troop power — Crown Eternal'},
  {need:60000,  fx:'+10% production'},
  {need:76000,  fx:'+10% troop power'},
  {need:96000,  fx:'+15% storage'},
  {need:121000, fx:'−10% army upkeep'},
  {need:152000, fx:'+20% refining speed'},
  {need:191000, fx:'+1 Writ of Peace held at once'},
  {need:240000, fx:'−12% build & training time'},
  {need:301000, fx:'+20% raid loot'},
  {need:378000, fx:'+15% Valor earned'},
  {need:475000, fx:'+25% troop power — Sovereign of the Reach'},
];

export function masteryLvl(s){
  let l = 0;
  for(const m of MASTERY){ if((s.mxp||0) >= m.need) l++; else break; }
  return l;
}

/* ── Divergence systems: randomness proposes, the player disposes. ──
   Heroes and Spoils arrive as random OFFERS (a draft of three, pick one) so
   every account walks a different path — but the choice is always the
   player's, and offers are never, ever sold. */

export const RARITY = {
  common:{w:62, tag:'Common'},
  rare:  {w:28, tag:'Rare'},
  epic:  {w:10, tag:'Epic'},
};

/* ── one quality ladder, borrowed on purpose ──
   Asked for directly: "can we have colors from wow — uncommon green, blue rare, epic purple,
   orange legendary, artifact red."

   Worth borrowing because two decades of players already read those hues without a legend, and
   because this game has three separate quality ladders that were each coloured by whatever was to
   hand: heroes had grey/blue/GOLD, gear tiers printed "tier 7/10" in plain text, and troop tiers
   were plain text too. Same idea, three presentations, none of them shared.

   So the ladder is defined once and every ladder in the game bands onto it. Heroes only ever reach
   Epic — there are three hero rarities and drafting is not a gacha, so there is nothing rarer to
   invent — and the top two colours earn their keep on the ten-step ladders instead: gear tiers and
   troop tiers, where Tier X sits behind Drillfield 30 and deserves to look like it.

   The hexes are WoW's hues moved onto this game's ground rather than copied raw. #1eff00 was drawn
   for a near-black blue UI; on #211b16 warm leather it reads as a highlighter. Legendary orange and
   the red are close to untouched, because they already sit well here. */
export const QUALITY = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'artifact'];
export const QUALITY_TAG = {
  common:'Common', uncommon:'Uncommon', rare:'Rare',
  epic:'Epic', legendary:'Legendary', artifact:'Artifact',
};
/* Band a step on any ladder onto the five coloured grades; 0 or below is Common. `top` is the
   highest step that ladder reaches, so gear (1–10) and troop tiers (II–X, passed as 1–9) both
   land Artifact on their own last step without either one hardcoding a width. */
export function qualityBand(n, top){
  if(!(n > 0) || !(top > 0)) return QUALITY[0];
  const grades = QUALITY.length - 1;                       // 5 coloured grades above Common
  return QUALITY[Math.min(grades, Math.ceil(n / (top / grades)))];
}

/* ── the season clock ──
   Shared by the browser and the server so both agree on which heroes have
   arrived. Offline play uses the same calendar, so a solo hold and an online
   one unlock the same cast on the same day. */
export const SEASON_MS = 14 * 24 * 3600 * 1000;
export const SEASON_EPOCH = Date.UTC(2026, 7, 1);   // Season 1 opened here
export function seasonNo(now){ return Math.max(1, Math.floor((now - SEASON_EPOCH) / SEASON_MS) + 1); }
export function seasonEndsIn(now){ return SEASON_MS - ((now - SEASON_EPOCH) % SEASON_MS); }

/* Each season names itself and brings four more heroes into the draft pool.
   Two rules keep this from becoming Kingshot's shard shop:
     1. Seasonal heroes are never stronger than the founding twelve. A new
        season widens the cast; it does not raise the ceiling. Nobody is ever
        obsolete for having started early.
     2. Nothing expires. Season 5's arrivals stay draftable forever, so a
        player who begins in Season 9 can still draft the whole roster. */
export const SEASON_ARCS = {
  0: {name:'The Founding',    blurb:'The twelve who answered the first horn.'},
  1: {name:'The Iron Winter', blurb:'Hard frost, hard people — those who kept the walls standing.'},
  2: {name:'The Salt Road',   blurb:'Traders, smugglers and pilots off the long coast.'},
  3: {name:'The Ashen Vale',  blurb:'Beast-hunters and fire-tenders from the burned country.'},
  4: {name:'The Hollow Crown', blurb:'Exiles of a court that ate itself.'},
  5: {name:'The Long Thaw',   blurb:'Builders and healers, come to make something last.'},
};

/* A hero does one of two jobs and cannot do both at once:
     · seated in COURT  → their `bonus` applies to the whole hold
     · LEADING a march  → their `lead` trait applies to that column alone
   That is the whole design. More heroes means more columns you can lead well,
   not a taller stack of passives — the court has a fixed number of chairs. */
export const LEAD_FX = {
  power: l=>'+'+(2*l)+'% column power',
  haul:  l=>'+'+(3*l)+'% resources hauled home',
  speed: l=>'−'+(1.5*l)+'% travel time',
  guard: l=>'−'+(3*l)+'% losses on the road',
  valor: l=>'+'+(4*l)+'% Valor from this march',
  lore:  l=>'+'+(4*l)+'% Mastery from this march',
};

export const HERO_POOL = {
  /* ── Season 0 · The Founding ── */
  marshal:      {name:'Ser Alden, the Marshal',  icon:'⚜️', rarity:'common', season:0, cls:'knight', fx:l=>'+'+(3*l)+'% troop power',            bonus:{troopPower:0.03}, lead:{key:'power', val:0.01},
                 order:{name:'Rally',           desc:'Next battle: +20% army power.',           cd:4, key:'rally'}},
  steward:      {name:'Maren, High Steward',     icon:'📜', rarity:'common', season:0, cls:'ballista', fx:l=>'+'+(5*l)+'% production',             bonus:{production:0.05}, lead:{key:'haul',  val:0.015},
                 order:{name:'Requisition',     desc:'Instantly gain food & wood (60 × Town Hall).', cd:5, key:'requisition'}},
  warden:       {name:'Odo, the Night Warden',   icon:'🦉', rarity:'common', season:0, cls:'ballista', fx:l=>'−'+(3*l)+'% training time',          bonus:{trainTime:0.03}, lead:{key:'speed', val:0.0075},
                 order:{name:'Forced March',    desc:'Current training completes instantly.',   cd:5, key:'forcedmarch'}},
  quartermaster:{name:'Petra, Quartermaster',    icon:'⚖️', rarity:'common', season:0, cls:'archer', fx:l=>'+'+(3*l)+'% raid loot',              bonus:{loot:0.03}, lead:{key:'haul', val:0.015},
                 order:{name:'Plunder Wagons',  desc:'Next win: loot ×2.',                      cd:4, key:'plunder'}},
  gatekeeper:   {name:'Bram, Gatekeeper',        icon:'🚪', rarity:'common', season:0, cls:'spearman', fx:l=>'+'+(6*l)+' wall power',              bonus:{wallPower:6}, lead:{key:'guard', val:0.015},
                 order:{name:'Brace the Gates', desc:'Next battle: +100% wall power.',        cd:4, key:'brace'}},
  forager:      {name:'Isolde, Forager',         icon:'🧺', rarity:'common', season:0, cls:'archer', fx:l=>'+'+(4*l)+'% expedition yield',       bonus:{patrolYield:0.04}, lead:{key:'haul', val:0.015},
                 order:{name:'Rich Trails',     desc:'Next expedition: +100% yield, no ambush.', cd:3, key:'richtrails'}},
  drillmaster:  {name:'Corin, Drillmaster',      icon:'🥁', rarity:'rare',   season:0, cls:'knight', fx:l=>'+'+(2*l)+'% troop power, −'+(2*l)+'% training time', bonus:{troopPower:0.02, trainTime:0.02}, lead:{key:'power', val:0.01},
                 order:{name:'Crash Course',    desc:'Next training batch: −75% time.',         cd:4, key:'crashcourse'}},
  spymaster:    {name:'Sable, Spymaster',        icon:'🗝️', rarity:'rare',   season:0, cls:'archer', fx:l=>'+'+(1*l)+'% raid blunting',          bonus:{blunt:0.01}, lead:{key:'speed', val:0.0075},
                 order:{name:'Expose the Camp', desc:'Next wave arrives 15% weaker.',           cd:4, key:'expose'}},
  medic:        {name:'Wren, Field Medic',       icon:'🌿', rarity:'rare',   season:0, cls:'spearman', fx:l=>'−'+(3*l)+'% casualties',             bonus:{casualties:0.03}, lead:{key:'guard', val:0.015},
                 order:{name:'Triage',          desc:'Next battle: no casualties on a win.',    cd:5, key:'triage'}},
  provisioner:  {name:'Tobias, Provisioner',     icon:'🫙', rarity:'rare',   season:0, cls:'spearman', fx:l=>'−'+(2.5*l)+'% army upkeep',          bonus:{upkeep:0.025}, lead:{key:'haul', val:0.015},
                 order:{name:'Ration Stores',   desc:'Upkeep paused for 60s.',                  cd:5, key:'ration'}},
  exile:        {name:'Queen Yara, the Exile',   icon:'👑', rarity:'epic',   season:0, cls:'knight', fx:l=>'+'+(5*l)+'% troop power',            bonus:{troopPower:0.05}, lead:{key:'power', val:0.01},
                 order:{name:'Royal Decree',    desc:'Next battle: +30% army power.',           cd:5, key:'decree'}},
  treasurer:    {name:'Aldric, Crown Treasurer', icon:'🪙', rarity:'epic',   season:0, cls:'ballista', fx:l=>'+'+(5*l)+'% Valor earned',           bonus:{valor:0.05}, lead:{key:'valor', val:0.02},
                 order:{name:'Tithe of War',    desc:'Next battle: Valor ×2.',                  cd:4, key:'tithe'}},

  /* ── Season 1 · The Iron Winter ── */
  icewright:    {name:'Halla Icewright',         icon:'❄️', rarity:'common', season:1, cls:'spearman', fx:l=>'+'+(6*l)+' wall power',              bonus:{wallPower:6}, lead:{key:'guard', val:0.015},
                 order:{name:'Frozen Ground',   desc:'Next battle: +100% wall power.',        cd:4, key:'brace'}},
  hearthkeep:   {name:'Ulf Hearthkeeper',        icon:'🔥', rarity:'common', season:1, cls:'spearman', fx:l=>'−'+(2.5*l)+'% army upkeep',          bonus:{upkeep:0.025}, lead:{key:'guard', val:0.015},
                 order:{name:'Bank the Fires',  desc:'Upkeep paused for 60s.',                  cd:5, key:'ration'}},
  snowrunner:   {name:'Ylva Snowrunner',         icon:'🐺', rarity:'rare',   season:1, cls:'archer', fx:l=>'+'+(4*l)+'% expedition yield',       bonus:{patrolYield:0.04}, lead:{key:'speed', val:0.0075},
                 order:{name:'Call Them Home',  desc:'Every march on the road turns for home at once.', cd:5, key:'recall'}},
  ironjaw:      {name:'Torvald Ironjaw',         icon:'🪓', rarity:'epic',   season:1, cls:'knight', fx:l=>'+'+(5*l)+'% troop power',            bonus:{troopPower:0.05}, lead:{key:'power', val:0.01},
                 order:{name:'Winter Oath',     desc:'Next battle: +30% army power.',           cd:5, key:'decree'}},

  /* ── Season 2 · The Salt Road ── */
  pilot:        {name:'Nessa the Pilot',         icon:'🧭', rarity:'common', season:2, cls:'ballista', fx:l=>'+'+(5*l)+'% production',             bonus:{production:0.05}, lead:{key:'speed', val:0.0075},
                 order:{name:'Fair Winds',      desc:'Next march sets out with +50% haul.',     cd:4, key:'fairwinds'}},
  saltfactor:   {name:'Dorin, Salt Factor',      icon:'🧂', rarity:'common', season:2, cls:'ballista', fx:l=>'+'+(3*l)+'% raid loot',              bonus:{loot:0.03}, lead:{key:'haul', val:0.015},
                 order:{name:'Open the Ledger', desc:'Instantly gain stone & iron (40 × Town Hall).', cd:5, key:'stockpile'}},
  smuggler:     {name:'Kip, the Smuggler',       icon:'🪝', rarity:'rare',   season:2, cls:'archer', fx:l=>'+'+(3*l)+'% raid loot',              bonus:{loot:0.03}, lead:{key:'haul', val:0.015},
                 order:{name:'Cut of the Take', desc:'Next win: loot ×2.',                      cd:4, key:'plunder'}},
  harbourlord:  {name:'Lady Ines, Harbourlord',  icon:'⚓', rarity:'epic',   season:2, cls:'ballista', fx:l=>'+'+(5*l)+'% Valor earned',           bonus:{valor:0.05}, lead:{key:'valor', val:0.02},
                 order:{name:'Harbour Levy',    desc:'Next battle: Valor ×2.',                  cd:4, key:'tithe'}},

  /* ── Season 3 · The Ashen Vale ── */
  houndmaster:  {name:'Garrick Houndmaster',     icon:'🐕', rarity:'common', season:3, cls:'knight', fx:l=>'+'+(3*l)+'% troop power',            bonus:{troopPower:0.03}, lead:{key:'speed', val:0.0075},
                 order:{name:'Loose the Pack',  desc:'Next battle: +20% army power.',           cd:4, key:'rally'}},
  cinderwright: {name:'Mira Cinderwright',       icon:'🕯️', rarity:'common', season:3, cls:'ballista', fx:l=>'−'+(3*l)+'% training time',          bonus:{trainTime:0.03}, lead:{key:'lore', val:0.02},
                 order:{name:'Green Again',     desc:'Every worked-out tile on the frontier regrows at once.', cd:5, key:'regrow'}},
  beastcaller:  {name:'Ren the Beastcaller',     icon:'🦌', rarity:'rare',   season:3, cls:'ballista', fx:l=>'−'+(3*l)+'% casualties',             bonus:{casualties:0.03}, lead:{key:'guard', val:0.015},
                 order:{name:'Set the Bones',   desc:'Every wounded soldier is healed at once.', cd:6, key:'mend'}},
  ashwalker:    {name:'The Ashwalker',           icon:'🌋', rarity:'epic',   season:3, cls:'knight', fx:l=>'+'+(1.5*l)+'% raid blunting',        bonus:{blunt:0.015}, lead:{key:'power', val:0.01},
                 order:{name:'Walk Ahead',      desc:'Next wave arrives 15% weaker.',           cd:4, key:'expose'}},

  /* ── Season 4 · The Hollow Crown ── */
  pretender:    {name:'Casimir the Pretender',   icon:'🗡️', rarity:'common', season:4, cls:'spearman', fx:l=>'+'+(3*l)+'% troop power',            bonus:{troopPower:0.03}, lead:{key:'power', val:0.01},
                 order:{name:'False Banners',   desc:'Next wave arrives 15% weaker.',           cd:4, key:'expose'}},
  chancellor:   {name:'Vesna, Lord Chancellor',  icon:'🖋️', rarity:'common', season:4, cls:'archer', fx:l=>'+'+(5*l)+'% production',             bonus:{production:0.05}, lead:{key:'lore', val:0.02},
                 order:{name:'Writ of Levy',    desc:'Instantly gain food & wood (60 × Town Hall).', cd:5, key:'requisition'}},
  poisoner:     {name:'Anselm, the King’s Cup', icon:'🍷', rarity:'rare', season:4, cls:'archer', fx:l=>'+'+(1*l)+'% raid blunting',        bonus:{blunt:0.01}, lead:{key:'valor', val:0.02},
                 order:{name:'A Quiet Word',    desc:'Next battle: no casualties on a win.',    cd:5, key:'triage'}},
  kingmaker:    {name:'Dowager Sethe, Kingmaker',icon:'♟️', rarity:'epic',   season:4, cls:'knight', fx:l=>'+'+(5*l)+'% Valor earned',           bonus:{valor:0.05}, lead:{key:'lore', val:0.02},
                 order:{name:'Move the Board',  desc:'Every march on the road turns for home at once.', cd:5, key:'recall'}},

  /* ── Season 5 · The Long Thaw ── */
  masonwright:  {name:'Old Jorem, Master Mason', icon:'🧱', rarity:'common', season:5, cls:'spearman', fx:l=>'+'+(6*l)+' wall power',              bonus:{wallPower:6}, lead:{key:'haul', val:0.015},
                 order:{name:'Quarry Rights',   desc:'Instantly gain stone & iron (40 × Town Hall).', cd:5, key:'stockpile'}},
  seedkeeper:   {name:'Aine Seedkeeper',         icon:'🌱', rarity:'common', season:5, cls:'archer', fx:l=>'+'+(4*l)+'% expedition yield',       bonus:{patrolYield:0.04}, lead:{key:'haul', val:0.015},
                 order:{name:'Sow Behind Us',   desc:'Every worked-out tile on the frontier regrows at once.', cd:5, key:'regrow'}},
  bonesetter:   {name:'Sister Ilva, Bonesetter', icon:'⚕️', rarity:'rare',   season:5, cls:'spearman', fx:l=>'−'+(3*l)+'% casualties',             bonus:{casualties:0.03}, lead:{key:'guard', val:0.015},
                 order:{name:'Long Vigil',      desc:'Every wounded soldier is healed at once.', cd:6, key:'mend'}},
  roadwarden:   {name:'Cassia, Warden of Roads', icon:'🛤️', rarity:'epic',   season:5, cls:'knight', fx:l=>'−'+(2*l)+'% training time, +'+(2*l)+'% production', bonus:{trainTime:0.02, production:0.02}, lead:{key:'speed', val:0.0075},
                 order:{name:'Clear the Way',   desc:'Next march sets out with +50% haul.',     cd:4, key:'fairwinds'}},
};

/* ── columns ──
   Three heroes ride at the head of every march, as in Kingshot. Their combined
   levels are what decides how many troops the column can hold, which is the
   honest answer to "why do I have eight march slots at Command Center 30?" —
   the slots are free, the capacity to fill them is not.

   Each hero also has a troop class they know how to handle: a column of
   knights led by three cavalry heroes hits far harder than a mixed one, which
   is what makes a wide roster worth having and formations worth saving.

   Capacity is sized against the armies this game actually fields — upkeep holds
   a hold to dozens or low hundreds of soldiers, not Kingshot's millions, so the
   numbers here are small on purpose. Measured: three level-1 heroes command 27,
   three level-10s command 108, three level-20s command 198. It binds hard while
   your heroes are green and stops binding once they are veterans, which makes it
   a gate on the *journey* rather than a permanent tax. */
/* ── beasts of the frontier ──
   Camps sit still and wait to be burned. Beasts roam, which is the whole point
   of them: a hunt is a thing you have to catch, and the map is never the same
   twice. Hunting only ever WOUNDS your troops (it is daily content, and the game
   should not ask you to weigh veterans against it) — the risk is the time and
   the column you tie up, not the muster.

   Beasts are also the only source of pets. A companion comes off the frontier
   with a hunting party; there is no other door, and certainly no purchasable
   one. `pet` is the weight this species carries toward the next companion. */
export const BEAST_ROAM_MS = 5 * 60000;      // how often the herds move
/* A slain beast is not replaced instantly — the herds have to wander back in.
   Without this the frontier became a conveyor belt: a bot farmed 281 of them in
   eight hours, which is not a hunt, it is a queue. */
export const BEAST_RESPAWN_MS = 6 * 60000;
export const BEAST_COUNT = 7;   // 7 on 135 cells keeps the herd density of 5 on 77
export const BEASTS = {
  boar:  {name:'Tusked Boar',      icon:'🐗', power:0.45, valor:8,  mxp:18, pet:1, blurb:'Bad-tempered and everywhere.'},
  wolf:  {name:'Ridgeback Wolf',   icon:'🐺', power:0.75, valor:12, mxp:26, pet:2, blurb:'Hunts in a pack; so should you.'},
  elk:   {name:'Greathorn Elk',    icon:'🦌', power:1.00, valor:16, mxp:34, pet:3, blurb:'Will not be driven. Must be met.'},
  bear:  {name:'Hallowmere Bear',  icon:'🐻', power:1.45, valor:24, mxp:52, pet:4, blurb:'Older than the Breaking, and it remembers.'},
  wyrm:  {name:'Ash Wyrm',         icon:'🐉', power:2.20, valor:40, mxp:90, pet:7, blurb:'Comes down out of the burned country to feed.'},
};
/* which species can appear, by how much hold you have — a wyrm on day one
   would simply be a wall you cannot pass */
export const BEAST_UNLOCK = { boar:1, wolf:4, elk:7, bear:11, wyrm:16 };

/* ── the season's temper ──
   The strongest way to make a season matter without making anyone's hero
   obsolete: change what is COMING AT YOU, not what you own.

   Each season the Unpaid muster differently — a season of riders makes pikes
   and shieldwall correct; a season of warcasters makes archers and volley
   correct. Nothing you own gets weaker. What changes is which of your things is
   the right answer this fortnight, which is exactly what a deep roster is for.

   Tempers CYCLE, so this works at season 5 and at season 500. The cycle length
   is coprime with nothing in particular — it just has to keep turning. */
export const TEMPERS = [
  {id:'muster',  name:'The Common Muster', icon:'🪓',
   blurb:'A mixed season. The bands come as they always have.',
   waves:{rabble:0.25, riders:0.25, skirmishers:0.25, brutes:0.25}, favours:null},
  {id:'horse',   name:'The Horselords', icon:'🐎',
   blurb:'Cavalry out of the grass country. Pikes and a shieldwall answer them.',
   waves:{rabble:0.10, riders:0.60, skirmishers:0.15, brutes:0.15}, favours:'spearman'},
  {id:'arrows',  name:'The Arrow Season', icon:'🏹',
   blurb:'Skirmishers and horse-archers. Ride them down — knights and a charge.',
   waves:{rabble:0.10, riders:0.15, skirmishers:0.60, brutes:0.15}, favours:'knight'},
  {id:'hammer',  name:'The Hammerfall', icon:'💪',
   blurb:'Heavy bands with casters at their backs. Break them at range with volley.',
   waves:{rabble:0.10, riders:0.15, skirmishers:0.15, brutes:0.60}, favours:'archer'},
  {id:'engines', name:'The Season of Sorcery', icon:'☄️',
   blurb:'Both sides bring casters. Battlemages earn their keep; walls do not.',
   waves:{rabble:0.15, riders:0.20, skirmishers:0.20, brutes:0.45}, favours:'ballista'},
  {id:'lean',    name:'The Lean Season', icon:'🌾',
   blurb:'Hungry, disorganised bands — many of them, none of them fine.',
   waves:{rabble:0.55, riders:0.15, skirmishers:0.15, brutes:0.15}, favours:'spearman'},
];
export function temperFor(now){ return TEMPERS[(seasonNo(now) - 1) % TEMPERS.length]; }

/* ── companions ──
   Kingshot's pets are a second gacha with a second currency. Here they come off
   the frontier: hunt beasts, earn bond, and at each threshold three companions
   are offered and you keep one. Same draft, same rule — never sold.

   Only ONE walks at your side at a time. That is what keeps a menagerie from
   becoming a stacked stat block: collecting more pets widens what you can
   choose to be good at this week, it never widens your total. Their bonuses are
   deliberately in corners no hero touches — refining, scouting, the infirmary,
   the fog on the wave timer — so a companion changes the texture of the hold
   rather than adding to its power. */
export const PET_BOND = [40, 110, 230, 420, 700, 1100, 1700, 2600];
export function petBondNeed(owned){ return PET_BOND[Math.min(owned, PET_BOND.length - 1)]; }
export const PET_POOL = {
  hound:   {name:'Greyfell, the Hound',   icon:'🐕', key:'scout',   per:0.05,
            fx:l=>'+'+(5*l)+'% expedition yield',        blurb:'Knows every trail within a day’s ride.'},
  raven:   {name:'Ash, the Raven',        icon:'🐦‍⬛', key:'warn',    per:0.04,
            fx:l=>'raids scouted '+(4*l)+'% earlier',    blurb:'Sees them form before they march.'},
  ox:      {name:'Boulder, the Ox',       icon:'🐂', key:'haul',    per:0.05,
            fx:l=>'+'+(5*l)+'% hauled home',             blurb:'Slow. Utterly immovable. Carries anything.'},
  ferret:  {name:'Pip, the Ferret',       icon:'🦦', key:'refine',  per:0.06,
            fx:l=>'+'+(6*l)+'% refining speed',          blurb:'Fits where a smith’s hand will not.'},
  goat:    {name:'Nan, the Crag Goat',    icon:'🐐', key:'mend',    per:0.08,
            fx:l=>'+'+(8*l)+'% infirmary beds',          blurb:'Eats anything; somehow heals everyone.'},
  falcon:  {name:'Stoop, the Falcon',     icon:'🦅', key:'speed',   per:0.03,
            fx:l=>'−'+(3*l)+'% march travel time',       blurb:'Rides ahead and comes back knowing.'},
  mastiff: {name:'Siege, the Mastiff',    icon:'🐕‍🦺', key:'hunt',    per:0.06,
            fx:l=>'+'+(6*l)+'% power against beasts',    blurb:'Was bred for exactly one thing.'},
  cat:     {name:'The Granary Cat',       icon:'🐈', key:'store',   per:0.04,
            fx:l=>'+'+(4*l)+'% storage',                 blurb:'Nobody decided to keep her. She simply stayed.'},
};
export const PET_MAX_LVL = 10;
export function petXpNeed(lvl){ return Math.round(60 * Math.pow(lvl, 1.45)); }

/* ── stars: the ladder that never ends ──
   XP alone is too shallow a track for a hero you keep for a year, so heroes
   ascend in stars on top of it. Stars are earned by *fielding* the hero —
   marches led, arena fought, camps burned — never by acquiring duplicates.
   That is the whole difference from a shard shop: the grind rewards attachment
   to the heroes you have, not acquisition of the ones you don't.

   The cap is the season number (floored at 5 so it is useful from day one), so
   Season 16 means sixteen stars for your ENTIRE roster — the founding twelve
   included. The ladder rises for everyone at once; nobody's hero is ever
   retired by the calendar. A star is worth +5% of everything that hero does,
   applied by raising their effective level. */
export const STAR_MAX = 30, STAR_FLOOR = 5, STAR_POWER = 0.05;
export function starCap(now){ return Math.min(STAR_MAX, Math.max(STAR_FLOOR, seasonNo(now))); }
export function starNeed(stars){ return Math.round(12 * Math.pow(stars + 1, 1.6)); }
/* deeds, by what the hero was actually doing when they earned them */
export const DEEDS = { march:1, longHaul:3, camp:2, arena:2, arenaWin:3 };

/* ── the arena five ──
   Five heroes ride out with an arena sortie, as in Kingshot. They are not
   "away" the way a march party is — a sortie is over in a minute — so the
   choice here is which five, not whether you can spare them. */
export const ARENA_HEROES = 5;

export const MARCH_HEROES = 3;
export const MARCH_BASE_CAP = 6;                  // a column with no leaders is a scouting party
export const CAP_PER_HERO = 4, CAP_PER_LEVEL = 3;
export const CLASS_AFFINITY = 0.01;               // per level, to that hero's own troop class

/* The court has a fixed number of chairs — this is the cap that keeps a wide
   roster from becoming a tall stack of passives.

   The ceiling is deliberately set where the old eight-hero roster already sat,
   so widening the pool to thirty-two changes what you can *do* and not how
   hard you hit. A hall reaches its full eight chairs around Town Hall 12,
   which is about where a player used to have drafted eight heroes anyway. */
export const COURT_BASE = 4, COURT_PER_TH = 3, COURT_MAX = 8;

/* ── Command layer: raids have a shape, you choose the answer ── */
export const WAVE_TYPES = {
  rabble:     {name:'Rabble',      icon:'🪓', weakTo:null,         counter:null},
  riders:     {name:'Riders',      icon:'🐎', weakTo:'shieldwall', counter:'spearman'},
  skirmishers:{name:'Skirmishers', icon:'🏹', weakTo:'charge',     counter:'knight'},
  brutes:     {name:'Brutes',      icon:'💪', weakTo:'volley',     counter:'archer'},
};
// cheap troops screen the expensive ones: casualty weight by class
export const SCREEN = {spearman:1.5, archer:1.2, knight:0.75, ballista:0.5};
/* What each kind costs of a column's capacity. THE fix for composition, and the reason
   troop pace was removed again a version after it was added.

   Capacity used to be counted in bodies, so a ballista and a spearman took the same slot
   while differing 6.5× in power — a ladder, and the top rung always wins. Whiteout
   Survival and Kingshot do not have this problem because their three types are a
   TRIANGLE: roughly equal power, differentiated by which one they counter, so the meta
   there is varied ratios (50/20/30, 40/20/40) rather than one answer.

   Counting capacity as LOAD levels power-per-slot at roughly 15 for archer, knight and
   ballista, leaving the spearman as the cheap screen it is meant to be. Composition then
   turns on the counter-class rotation and on screening — matchup questions, like theirs —
   instead of on arithmetic with a single solution.

   Differential march pace was a workaround for the ladder. With the ladder gone it was a
   second mechanic doing a job this one does properly, so it went. */
export const LOAD = {spearman:1, archer:1, knight:2, ballista:4};

/* ── the front line, and who needs one ──
   Levelling power-per-load stopped one type dominating, and then made a worse thing
   optimal: specialise. Tier promotions are per line (one line to tier 5 costs 165
   resources; all four cost 972), one troop building instead of four, and all three
   captains on a single class — so three archer captains fielding only archers measured
   3,803 against a mixed column's 3,263. Six times cheaper AND stronger.

   Percentage nudges cannot answer a 6× cost advantage. What answers it is STRUCTURE, which
   is what Whiteout Survival actually uses: marksmen die without an infantry line in front
   of them. So ranged troops and engines only fight at full worth behind a line, and the
   spearman — worth 55% of a knight in raw power — becomes the thing that makes the rest
   of your army work. */
/* ── and the number that actually decides the meta ──
   The structure above was right and the values were not, for a reason that took a proper
   measurement to see. Power-per-load was levelled BEFORE cover — archer 5.0, knight 5.5,
   ballista 6.0, a spread of ×1.20 that the ladder test happily passed — and then the cover
   system rebuilt the ladder AFTER it. The tax a line pays alone is 0.5 × (NEEDS − HOLDS):

       spearman  3.00/load  tax 0.000  →  3.00      knight  5.50/load  tax 0.000  →  5.50
       archer    5.00/load  tax 0.325  →  3.38      ballista 6.00/load  tax 0.500  →  3.00

   Three lines clustered at 3.0–3.4 and the knight stood alone at 5.5, because it was the only
   one with a damage line's power and a screen's cover profile. Measured consequences: knights
   won on ALL THREE constraints — load ×1.00 against 0.55–0.61, cost ×1.00 against 0.55–0.73,
   upkeep ×1.00 against 0.48–0.77 — the optimal column was 65% knights and 35% battlemages with
   spearmen and archers in none of the top six, and a spearman column, the knight's own designated
   predator, still LOST to it by 29%. The triangle cannot arbitrate a 63% raw gap with ±30%.

   The fix is not mono parity, which would flatten the interdependence this system exists for. A
   damage line never fights alone; it fights behind spearmen. So the governing quantity is
   ESCORTED EFFICIENCY — the line plus the screen it obliges you to bring, over the load the two
   consume together:

       (power/load + 3 × drain) / (1 + drain),   drain = NEEDS − HOLDS

   Ballistae sat at 4.50, archers 4.21, and knights at 5.50 because a negative drain means they
   bring no escort at all. Solving both back to the ballista's 4.50 needs a drain of 0.333 for
   archers and 0.667 for knights — and NO change to power, load, cost or upkeep, which is why
   none of those moved. The four top compositions now score identically (35/30/30/5, 35/35/20/10,
   35/40/10/15, 40/20/20/20), so composition stops being arithmetic with one answer and becomes
   the matchup question the triangle is there to settle. */
export const HOLDS = {spearman:1, knight:0.2, archer:0.15, ballista:0};   // stands in front
export const NEEDS = {spearman:0, knight:0.87, archer:0.48, ballista:1};  // wants one there
export const EXPOSED_LOSS = 0.5;      // how much of its worth a wholly uncovered unit loses

/* ── the counter triangle ──
   Pikes stop cavalry, cavalry runs down archers, archers shoot the slow line. Ballistae
   have no answer in the field, which is why they need cover most.
   Without this, a raid compared raw power and composition was irrelevant in PvP — so a
   mono army had no predator. A triangle gives every specialist one. */
export const BEATS = {spearman:'knight', knight:'archer', archer:'spearman'};
export const MATCHUP = 0.30;          // the edge a full counter is worth
export const STANCES = {
  balanced:  {name:'Balanced',    icon:'⚖️', hint:'No bonus, no penalty'},
  shieldwall:{name:'Shield Wall', icon:'🛡️', hint:'Counters Riders'},
  volley:    {name:'Volley',      icon:'🏹', hint:'Counters Brutes'},
  charge:    {name:'Charge',      icon:'⚔️', hint:'Counters Skirmishers'},
};
export const COUNTER_BONUS = 1.2, COUNTER_PENALTY = 0.92, COUNTER_CASUALTY = 0.6;

/* ── what a lost wave costs ──
   Waves are AMBIENT. They arrive every 75 seconds, resolve themselves with whatever stance you
   last set, and none of them happen while the game is closed — on returning, every missed wave
   is discarded and the next is 60 seconds out. So a player is never obliged to attend one.

   A flat 20% of the muster was the wrong bill for that. The winning branch has always scaled
   casualties by how close the fight was (0.30 × ratio²); only the loss branch was flat, which
   put a cliff at the boundary — a hold that lost 51-to-49 paid exactly what an empty one did.
   That is the same fault the raid curve had before v1.39, in the one place it survived.

   It matters most for the thing you actually want to do: send troops to the frontier. A full
   column takes about 29% of your defence with it, and measured against the wave curve that is
   free until roughly wave 80 and decisive by 120. Leaving a real garrison behind should be
   cheap; leaving nothing behind should not. Continuous in the margin does that on its own.

   The Infirmary and the medicine research now apply on a loss as well. They always applied
   when you won, and there was never a reason for a hospital to stop mattering the moment a
   fight went badly. */
export const WAVE_LOSS_FLOOR = 0.04, WAVE_LOSS_SPAN = 0.16;   // troops, 4% → 20%
export const WAVE_PLUNDER_FLOOR = 0.05, WAVE_PLUNDER_SPAN = 0.10;  // stores, 5% → 15%

/* ── the Infirmary, and four systems queueing for one ceiling ──
   Reported from play: "the Infirmary doesn't give any bonus after level 10." Measured, and true
   three times over — the building has 25 levels and every one of its three effects gave up early:

     woundShare   min(0.75, 0.30 + 0.045·lvl)  → hit the ceiling at level 10 exactly
     healTime     max(0.30, 1 − 0.03·lvl)      → hit its floor at 23
     casualties   the shared floor below

   The last is the deep one, and it is not the Infirmary's alone. FOUR systems reduce wave
   casualties — the Infirmary, Medicine research, Mastery 15 and any medic hero — and they were
   SUMMED and then clamped: max(0.15, 1 − sum). Measured across real loadouts, that sum reaches
   1.30 at the top of the game, so the clamp is holding back 1.15 of reduction that has been paid
   for. Past roughly Infirmary 14 with Medicine maxed, every further point from ANY of the four
   buys exactly nothing. The Infirmary is simply the source a player notices first, because it is
   the one with a level number on it.

   The shape of the repair: below the knee, NOTHING changes — every loadout that worked before
   gets the identical figure, so this is not a rebalance. Above it, each further RELIEF_KNEE of
   reduction halves what remains rather than being discarded, which is asymptotic: relief never
   reaches zero, and no source is ever worth nothing. A hard floor cannot have both properties,
   and that is the whole bug.

   WOUND_DECAY is derived, not chosen. The old curve killed 25% of the fallen at level 10; pinning
   the geometric curve to that point means levels 0 and 10 are unchanged and every level in
   between is at most 5.7pp kinder. Writing the pin as arithmetic rather than as 0.9022 keeps the
   reason legible — the next person to touch the top of the curve does not have to reverse it. */
export const WOUND_DIE0 = 0.70;                 // share of the fallen who die at Infirmary 0
export const WOUND_DIE10 = 0.25;                // ...and at level 10, the old linear curve's value
export const WOUND_DECAY = Math.pow(WOUND_DIE10 / WOUND_DIE0, 1 / 10);
export const HOSP_RELIEF = 0.04;                // casualty reduction per Infirmary level
export const MASTERY_RELIEF = 0.10;             // Mastery 15
export const RELIEF_KNEE = 0.15;                // where the old hard floor sat, now the soft knee
/* How much overshoot halves what remains. Tuned by measuring the extremes, not by taste: at 0.15
   the fully-kitted top of the game reached 0.001 relief, which is not "diminishing returns", it is
   free — waves would cost a maxed hold nothing at all and the beds would stop mattering. At 0.5 the
   same account gets roughly a 5× reduction on today's clamped figure instead of an 80× one, which
   pays for the investment without deleting the content. */
export const RELIEF_HALFLIFE = 0.5;
export const HEAL_SPEED_PER = 0.03, HEAL_SPEED_FLOOR = 0.25;   // floor now lands exactly at max

/* ── Expeditions: three routes, one choice, real trade-offs ── */
export const EXPEDITION_CD = 45000;
export const EXPEDITIONS = {
  kingsroad: {name:"King's Road",  icon:'🛤️', desc:'Safe: food & wood, +3 Valor'},
  wildwood:  {name:'Wildwood',     icon:'🌲', desc:'Risky: stone & iron haul — 35% ambush costs troops'},
  barrows:   {name:'Barrow Hills', icon:'⚱️', desc:'Strange: +6 Valor, Mastery — rarely a Writ'},
};

/* Hero slots unlock at these milestones; each grants a draft of three.
   There are enough of them to staff both a full court and every march slot a
   maxed Command Center fields — heroes are the answer to "who leads column
   six?", and that answer must never be "open your wallet". */
export const HERO_SLOTS = [
  {hint:'Reach Town Hall 2',      check:s=>s.b.townhall>=2},
  {hint:'Reach Town Hall 3',      check:s=>s.b.townhall>=3},
  {hint:'Repel 7 raids',          check:s=>s.wavesWon>=7},
  {hint:'Reach Mastery 6',        check:s=>masteryLvl(s)>=6},
  {hint:'Reach Town Hall 5',      check:s=>s.b.townhall>=5},
  {hint:'Repel 20 raids',         check:s=>s.wavesWon>=20},
  {hint:'Reach Town Hall 7',      check:s=>s.b.townhall>=7},
  {hint:'Reach Mastery 8',        check:s=>masteryLvl(s)>=8},
  {hint:'Burn 10 bandit camps',   check:s=>(s.campsBurned||0)>=10},
  {hint:'Reach Town Hall 9',      check:s=>s.b.townhall>=9},
  {hint:'Raise the Tavern to 6',  check:s=>(s.b.tavern||0)>=6},
  {hint:'Reach Mastery 11',       check:s=>masteryLvl(s)>=11},
  {hint:'Reach Town Hall 12',     check:s=>s.b.townhall>=12},
  {hint:'Raid 8 ancient ruins',   check:s=>(s.ruinsRaided||0)>=8},
  {hint:'Repel 60 raids',         check:s=>s.wavesWon>=60},
  {hint:'Reach Town Hall 15',     check:s=>s.b.townhall>=15},
  {hint:'Build the Command Center to 10', check:s=>(s.b.command||0)>=10},
  {hint:'Reach Mastery 15',       check:s=>masteryLvl(s)>=15},
  {hint:'Reach Town Hall 18',     check:s=>s.b.townhall>=18},
  {hint:'Raise the Tavern to 15', check:s=>(s.b.tavern||0)>=15},
  {hint:'Repel 150 raids',        check:s=>s.wavesWon>=150},
  {hint:'Reach Town Hall 21',     check:s=>s.b.townhall>=21},
  {hint:'Reach Mastery 20',       check:s=>masteryLvl(s)>=20},
  {hint:'Build the Command Center to 20', check:s=>(s.b.command||0)>=20},
  {hint:'Reach Town Hall 24',     check:s=>s.b.townhall>=24},
  {hint:'Burn 60 bandit camps',   check:s=>(s.campsBurned||0)>=60},
  {hint:'Reach Mastery 25',       check:s=>masteryLvl(s)>=25},
  {hint:'Reach Town Hall 27',     check:s=>s.b.townhall>=27},
  {hint:'Build the Command Center to 30', check:s=>(s.b.command||0)>=30},
  {hint:'Reach Town Hall 30',     check:s=>s.b.townhall>=30},
];

// permanent relics offered (3, pick 1) after every Warband win
export const SPOILS = {
  banner:  {name:'Banner of the Bloodied', icon:'🚩', fx:'+6% troop power',             stack:true,  bonus:{troopPower:0.06}},
  granary: {name:'Granary Charter',        icon:'🌾', fx:'+8% food production',         stack:true,  bonus:{foodProd:0.08}},
  sawmill: {name:'Sawmill Rights',         icon:'🪚', fx:'+8% wood — raises the army timber supports', stack:true, bonus:{woodProd:0.08}},
  veins:   {name:'Deep Vein Maps',         icon:'🗺️', fx:'+8% stone & iron — iron caps your cavalry', stack:true, bonus:{stoneProd:0.08, ironProd:0.08}},
  mason:   {name:"Mason's Oath",           icon:'🧱', fx:'−10% build time',             stack:true,  bonus:{buildTime:0.10}},
  drill:   {name:'Drill Manual',           icon:'📖', fx:'−8% training time',           stack:true,  bonus:{trainTime:0.08}},
  tollroad:{name:'Toll Road',              icon:'🛣️', fx:'+25% patrol yield',           stack:true,  bonus:{patrolYield:0.25}},
  /* "Army upkeep" now means food AND the wood and iron a muster draws — supplyPerSec applies
     the same relief term, on the reasoning that a quartermaster who stretches the rations
     stretches the arrows too. So this is a stronger pick than its old text implied, and the
     text said only "upkeep", which a player would reasonably read as food. */
  larder:  {name:'Iron Larder',            icon:'🥩', fx:'−8% upkeep: food, timber and iron', stack:true, bonus:{upkeep:0.08}},
  ledger:  {name:'Writ Ledger',            icon:'📜', fx:'+1 Writ of Peace capacity',   stack:false, bonus:{shieldCap:1}},
  trophies:{name:'War Trophies',           icon:'🏆', fx:'+15% raid loot',              stack:true,  bonus:{loot:0.15}},
};

export const QUESTS = [
  {txt:'Raise the Farm to level 2',      check:s=>s.b.farm>=2,        reward:{wood:60},           rtxt:'+60 wood'},
  {txt:'Raise the Lumberyard to level 2',check:s=>s.b.lumberyard>=2,  reward:{food:60},           rtxt:'+60 food'},
  {txt:'Build the Quarry',               check:s=>s.b.quarry>=1,      reward:{wood:80},           rtxt:'+80 wood'},
  {txt:'Build the Barracks',             check:s=>s.b.barracks>=1,    reward:{food:80,valor:2},   rtxt:'+80 food, +2 Valor'},
  {txt:'Train 5 troops',                 check:s=>s.trained>=5,       reward:{valor:4},           rtxt:'+4 Valor'},
  {txt:'Repel your first raid',          check:s=>s.wavesWon>=1,      reward:{stone:60,valor:3},  rtxt:'+60 stone, +3 Valor'},
  {txt:'Reach Town Hall 2',              check:s=>s.b.townhall>=2,    reward:{valor:5},           rtxt:'+5 Valor'},
  {txt:'Build the Wall',                 check:s=>s.b.wall>=1,        reward:{valor:4},           rtxt:'+4 Valor'},
  {txt:'Repel 3 raids',                  check:s=>s.wavesWon>=3,      reward:{valor:6},           rtxt:'+6 Valor'},
  {txt:'Reach Town Hall 3',              check:s=>s.b.townhall>=3,    reward:{valor:8},           rtxt:'+8 Valor'},
  {txt:'Build the Iron Mine',            check:s=>s.b.ironmine>=1,    reward:{food:120},          rtxt:'+120 food'},
  {txt:'Build the Watchtower',           check:s=>s.b.watchtower>=1,  reward:{valor:5},           rtxt:'+5 Valor'},
  {txt:'Train a Knight',                 check:s=>(s.trainedBy.knight||0)>=1, reward:{valor:6},   rtxt:'+6 Valor'},
  {txt:'Repel a Warband (every 5th raid)',check:s=>s.warbandsWon>=1,  reward:{valor:10,shield:1}, rtxt:'+10 Valor, +1 Writ of Peace'},
  {txt:'Repel 8 raids',                  check:s=>s.wavesWon>=8,      reward:{valor:10},          rtxt:'+10 Valor'},
  {txt:'Reach Town Hall 4',              check:s=>s.b.townhall>=4,    reward:{valor:20},          rtxt:'+20 Valor'},
  {txt:'Reach Mastery 3',                check:s=>masteryLvl(s)>=3,   reward:{valor:8},           rtxt:'+8 Valor'},
  {txt:'Reach Town Hall 5',              check:s=>s.b.townhall>=5,    reward:{valor:12,shield:1}, rtxt:'+12 Valor, +1 Writ'},
  {txt:'Train a Battlemage',             check:s=>(s.trainedBy.ballista||0)>=1, reward:{valor:12},rtxt:'+12 Valor'},
  {txt:'Repel 15 raids',                 check:s=>s.wavesWon>=15,     reward:{valor:15,shield:1}, rtxt:'+15 Valor, +1 Writ'},
  {txt:'Reach Town Hall 7',              check:s=>s.b.townhall>=7,    reward:{valor:25},          rtxt:'+25 Valor'},
  {txt:'Reach Mastery 6',                check:s=>masteryLvl(s)>=6,   reward:{valor:15},          rtxt:'+15 Valor'},
  {txt:'Repel 25 raids',                 check:s=>s.wavesWon>=25,     reward:{valor:25},          rtxt:'+25 Valor'},
  {txt:'Reach Town Hall 10',             check:s=>s.b.townhall>=10,   reward:{valor:50},          rtxt:'+50 Valor'},
  {txt:'Build the Drillfield',          check:s=>s.b.academy>=1,     reward:{valor:15},          rtxt:'+15 Valor'},
  {txt:'Promote a troop to Tier II',     check:s=>s.tier && Object.values(s.tier).some(t=>t>=2), reward:{valor:15}, rtxt:'+15 Valor'},
  {txt:'Reach Town Hall 12',             check:s=>s.b.townhall>=12,   reward:{valor:30,shield:1}, rtxt:'+30 Valor, +1 Writ'},
  {txt:'Light the Forge — nothing rises past 14 without Steel',
                                         check:s=>s.b.forge>=1,       reward:{valor:35},          rtxt:'+35 Valor'},
  {txt:'Reach Mastery 12',               check:s=>masteryLvl(s)>=12,  reward:{valor:20},          rtxt:'+20 Valor'},
  {txt:'Reach Town Hall 15',             check:s=>s.b.townhall>=15,   reward:{valor:40,shield:1}, rtxt:'+40 Valor, +1 Writ'},
  {txt:'Reach Town Hall 20',             check:s=>s.b.townhall>=20,   reward:{valor:100},         rtxt:'+100 Valor'},
  {txt:'Smelt 500 Steel',                check:s=>(s.res.steel||0)>=500, reward:{valor:50},       rtxt:'+50 Valor'},
  {txt:'Reach Town Hall 24',             check:s=>s.b.townhall>=24,   reward:{valor:80,shield:1}, rtxt:'+80 Valor, +1 Writ'},
  {txt:'Build the Runeworks',            check:s=>s.b.runeworks>=1,   reward:{valor:80},          rtxt:'+80 Valor'},
  {txt:'Reach Mastery 25',               check:s=>masteryLvl(s)>=25,  reward:{valor:120},         rtxt:'+120 Valor'},
  {txt:'Reach Town Hall 30',             check:s=>s.b.townhall>=30,   reward:{valor:300},         rtxt:'+300 Valor'},
];

/* ── Achievements: permanent, one-time, and they never expire. Unlike quests
   (a guided chain), these are the long tail — reasons to keep pushing every
   system rather than the one the charter is pointing at. ── */
export const ACHIEVEMENTS = [
  {id:'first-blood',  txt:'Repel your first raid',            check:s=>s.wavesWon>=1,             valor:5},
  {id:'warband-1',    txt:'Break a Warband',                  check:s=>s.warbandsWon>=1,          valor:10},
  {id:'warband-10',   txt:'Break 10 Warbands',                check:s=>s.warbandsWon>=10,         valor:40},
  {id:'warband-50',   txt:'Break 50 Warbands',                check:s=>s.warbandsWon>=50,         valor:150},
  {id:'hold-50',      txt:'Hold the frontier 50 waves',       check:s=>s.wavesWon>=50,            valor:30},
  {id:'hold-200',     txt:'Hold the frontier 200 waves',      check:s=>s.wavesWon>=200,           valor:100},
  {id:'hold-500',     txt:'Hold the frontier 500 waves',      check:s=>s.wavesWon>=500,           valor:250},
  {id:'unbroken',     txt:'Win 10 raids without a single defeat', check:s=>(s.bestStreakWon||0)>=10, valor:60},
  {id:'muster-100',   txt:'Muster 100 troops at once',        check:s=>Object.values(s.t).reduce((a,b)=>a+b,0)>=100, valor:20},
  {id:'muster-1000',  txt:'Muster 1,000 troops at once',      check:s=>Object.values(s.t).reduce((a,b)=>a+b,0)>=1000, valor:120},
  {id:'tier-5',       txt:'Forge a troop to Tier V',          check:s=>Object.values(s.tier||{}).some(t=>t>=5), valor:50},
  {id:'tier-10',      txt:'Forge a troop to Tier X',          check:s=>Object.values(s.tier||{}).some(t=>t>=10), valor:200},
  {id:'full-court',   txt:'Fill every chair in your court',   check:s=>(s.court||[]).length>=8,   valor:80},
  {id:'hero-20',      txt:'Raise a hero to level 20',         check:s=>Object.values(s.heroes||{}).some(h=>h.lvl>=20), valor:100},
  {id:'roster-20',    txt:'Draft 20 heroes to the hold',      check:s=>Object.keys(s.heroes||{}).length>=20, valor:150},
  {id:'six-columns',  txt:'Have six columns on the road at once', check:s=>(s.marches||[]).length>=6, valor:120},
  {id:'led-out',      txt:'Send a hero out at the head of a column', check:s=>(s.marches||[]).some(m=>m.hero), valor:30},
  {id:'spoils-10',    txt:'Claim 10 Spoils of War',           check:s=>Object.values(s.spoils||{}).reduce((a,b)=>a+b,0)>=10, valor:60},
  {id:'frontier-10',  txt:'Burn 10 bandit camps',             check:s=>(s.campsBurned||0)>=10,    valor:60},
  {id:'ruins-5',      txt:'Plunder 5 ancient ruins',          check:s=>(s.ruinsRaided||0)>=5,     valor:50},
  {id:'smith',        txt:'Light the Forge',                  check:s=>s.b.forge>=1,              valor:40},
  {id:'runebinder',   txt:'Raise the Runeworks',              check:s=>s.b.runeworks>=1,          valor:80},
  {id:'arena-1',      txt:'Win your first arena battle',      check:s=>(s.arenaWins||0)>=1,       valor:20},
  {id:'arena-25',     txt:'Win 25 arena battles',             check:s=>(s.arenaWins||0)>=25,      valor:120},
  {id:'laurels-1200', txt:'Reach 1,200 Laurels',              check:s=>(s.laurels||0)>=1200,      valor:100},
  {id:'sovereign',    txt:'Reach Mastery 20',                 check:s=>masteryLvl(s)>=20,         valor:150},
  {id:'crown',        txt:'Raise Town Hall 30',               check:s=>s.b.townhall>=30,          valor:400},
];

/* Raw resources you gather; refined ones you MAKE from them. Refining is what
   keeps early resources valuable forever — a Town Hall 25 upgrade is really an
   enormous pile of iron and wood, laundered through a Forge. */
export const RES_META = {
  /* The four raw ones carry NO capMult. Theirs is derived from how fast they arrive — see
     rawCapMult below — because a number typed here would drift from the Farm's rate the first
     time anyone retuned production, and this is exactly the kind of pair that drifts. */
  food:     {lbl:'Food',     icon:'🌾'},
  wood:     {lbl:'Wood',     icon:'🪵'},
  stone:    {lbl:'Stone',    icon:'⛰️'},
  iron:     {lbl:'Iron',     icon:'⚒️'},
  steel:    {lbl:'Steel',    icon:'🔩', refined:true, capMult:0.10, from:'forge'},
  runestone:{lbl:'Runestone',icon:'💠', refined:true, capMult:0.035, from:'runeworks'},
  rations:  {lbl:'Rations',  icon:'🥘', refined:true, capMult:0.08,  from:'kitchen'},
  /* Isle ore is neither gathered nor refined — it is CARRIED HOME, the only
     resource in the game with no building behind it at all. `carried` exists so
     that code can ask "does this have a producer?" instead of inferring it from
     "is it refined?", which is what several loops did: adding a resource that was
     neither immediately crashed them looking up a farm that does not exist. */
  isleore:  {lbl:'Isle Ore', icon:'🪨', carried:true, capMult:0.05},
  electrum: {lbl:'Electrum', icon:'🏵️', refined:true, capMult:0.02, from:'crucible'},
};
/* ── a vault per resource, sized by how fast the resource arrives ──
   Asked for directly: "since food, wood, stone and iron productions are at different rates even at
   max level and the rarity is different, max storage should be based on that too."

   Right, and the uniform cap had a measurable cost. Production per level is food 2.0, wood 1.6,
   stone 1.0, iron 0.7, so with one shared ceiling the time to fill from empty at a paced Town Hall
   30 was food 1.4h, wood 2.6h, stone 4.2h, iron 6.0h — a spread of ×4.29. Offline production is
   capped at two hours, which lands INSIDE that spread: come back after a night away and food and
   wood have been sitting full and throwing away everything they made, while stone and iron are
   still climbing. The shared ceiling was not neutral, it was quietly taxing the two resources you
   have most of.

   So the multiplier is the production rate itself, which makes cap/rate identical for all four:
   every vault fills in the same time and none of them overflows early. It also reads the way the
   player already thinks about the game — you hold a lot of food and never much iron.

   THE DIVISOR IS WHERE THE FAMILY SITS, AND IT IS NOT FREE. Shrinking a vault below its largest
   single bill makes a building unbuildable, and stone is the binding constraint: the Crucible's
   20th level costs 324,900 stone, the largest single cost of any resource in the game, against a
   Town Hall 30 cap. At 1.035 stone keeps that bill with 35% to spare — the same headroom the
   uniform cap gave it — and the other three land at ×2.96 or better. Anyone who raises a stone
   cost past that headroom gets a failure from verify-skills.mjs naming the building, which is the
   only reason it is safe to derive caps from a rate at all. */
/* ── alliances open with a building, not with an account ──
   Asked directly: "when can players join alliances? In WoS the alliance building comes at a certain
   level, which unlocks alliances."

   They could join from their first second, which was never a decision — there was simply no gate on
   /api/alliance/join at all. Two reasons that is wrong beyond not matching the reference games.
   Alliance Help is this game's ENTIRE answer to Kingshot's speedup store, so handing it to a hold
   that has not yet learnt what a build queue is spends the best social mechanic on someone with
   nothing to spend it on. And the Embassy already existed, at Town Hall 5, already described as the
   building that governs how many helps your builds may take — it just was not the door.

   Now it is the door. The rule lives HERE rather than in either the client or the server, because
   the server has to enforce it and the client has to explain it, and two copies of a gate is how
   you end up with a button that is offered and then refused. The level hint is the Embassy's own
   `th`, so raising that constant moves the gate and the explanation together. */
export const ALLY_FROM = 'embassy';
export const allyTh = () => BUILDINGS[ALLY_FROM].th;
export function canAlly(s){ return ((s && s.b && s.b[ALLY_FROM]) || 0) >= 1; }
export function allyBlockedWhy(s){
  if(canAlly(s)) return null;
  const d = BUILDINGS[ALLY_FROM];
  return 'Raise the ' + d.name + ' to treat with other holds — it opens at Town Hall ' + d.th + '.';
}

export const CAP_RATE_DIVISOR = 1.035;
export const rawRate = (res) =>
  Object.values(BUILDINGS).filter(d => d.prod === res).reduce((a, d) => a + d.rate, 0);
export const rawCapMult = (res) => {
  const rate = rawRate(res);
  return rate > 0 ? rate / CAP_RATE_DIVISOR : 1;
};
// levels at which every building starts demanding the next currency
export const STEEL_FROM = 15, RUNE_FROM = 24;
// what a refinery eats per unit it produces
export const REFINE = {
  forge:     { out:'steel',     rate:0.030, in:{iron:6, wood:4} },
  runeworks: { out:'runestone', rate:0.018, in:{stone:14, steel:3} },
  kitchen:   { out:'rations',   rate:0.055, in:{food:8, wood:3} },
  // the Crucible eats ore nothing else in the game can make, so it idles until
  // a voyage comes home — deliberately: it is a reason to sail, not a treadmill
  crucible:  { out:'electrum',  rate:0.012, in:{isleore:4, steel:2} },
};
export const WAVE_MS = 75000, FIRST_WAVE_MS = 120000, PATROL_MS = 25000, SHIELD_MS = 180000;

/* ── Pacing: the calendar sets the pace, not your stamina ──
   A player with ten hours a day should out-play everyone and enjoy every hour
   of it — but they should not finish the game in a week. So progression is
   gated by real time (long late-game builds), Valor earning has a daily quota
   past which it trickles, and anyone who has been away comes back Rested. */
/* The launch curve. TIME_SCALE stretches CONSTRUCTION and RESEARCH only. Training, raids,
   expeditions, healing and the arena stay on their fast cadence — those are the loop you
   actually play, and the muster has to answer raids that arrive every 75s. It is the building
   queue that paces the game. Dial this one number to retune.

   MEASURED at 10, one crew, no speed bonuses: 2,544 hours of construction to max every
   building — 106 days of continuously busy queue, or roughly 62 once the second crew opens at
   Town Hall 10. Research is 11 days on its own parallel queue. No real player keeps a queue
   100% busy, so that lands inside the intended six-to-twelve-month window with room to spare.

   DESIGN.md carried a note for weeks saying launch would need this multiplied by a further
   3–10× or "everything caps in 40 hours". That note predated the deep economy and this
   constant, and measuring it was the only way to find out it had gone stale. The pacing test
   in verify-skills.mjs now holds the real figure to a band, so the next person to change a
   cost curve or a time exponent finds out immediately rather than in a playtest. */
export const TIME_SCALE = 10;
// Build times cap per level, not globally: a level-3 hut is minutes, a level-28
// keep is a day. This makes the queue — not your stamina — the wall.
export const buildTimeCap = lvl => 600 + 400 * lvl;   // seconds, before TIME_SCALE

/* ── and the first levels are SECONDS, not minutes ──
   Reported from play: "first thing you do in the game, build quarry and you wait 2 mins, nothing
   else." Measured and exactly right — the opening levels were Farm 1.3 min, Lumberyard 1.3 min,
   Quarry 2.0 min, Barracks 2.5 min, with one crew, so the first session was press one thing and
   watch it. TIME_SCALE exists to stretch the whole climb to months and it was being applied flat,
   including to level 1, which is the one level whose entire job is to teach the loop.

   Kingshot and Whiteout both open in seconds. So the scale ramps in over the first eight levels
   instead of arriving whole: a level-1 building is a few seconds, level 3 about half a minute, and
   by level 8 the full weight is on. Measured on the Quarry — 4s, 6s, 35s, 2min, 5min, 11min — so
   the first minutes are dense and the long game is untouched, because the hours were always in the
   late levels rather than the early ones. */
export const RAMP_LEVELS = 8;
export const RAMP_FLOOR = 0.035;
export const earlyRamp = lvl => {
  if(lvl >= RAMP_LEVELS) return 1;
  const t = lvl / RAMP_LEVELS;
  return RAMP_FLOOR + t * t * (1 - RAMP_FLOOR);
};
// a second crew, earned by growing the hold
/* Town Hall 5, not 10. Measured, TH10 is 39 HOURS of continuously busy build queue — three or
   four days of real play — and for all of it you have one crew and one column. The build queue is
   busy 77–91% of the time in the simulator, so one crew means the single most common action in the
   game is unavailable nine times in ten, and a further quarter of the time it IS free you cannot
   afford anything. Kingshot and Whiteout front-load parallelism for exactly this reason: the early
   game's job is to always have something to press. Town Hall 4 is about an hour of queue — inside
   the first session, so it shapes how the game feels from the start, but far enough in that levels
   1 to 3 still teach one thing at a time.

   This barely moves the total length, because the game's hours are in the LATE levels — TH10 is 39
   hours of a 2,544-hour climb. What it moves is the first three days. */
export const SECOND_QUEUE_TH = 4;
/* Mirrors ISLE_TH in isle.js. Kept here so lessons.js can gate on it without importing the map
   module — and asserted equal in verify-ui, so the mirror cannot rot. */
export const ISLE_TH_HINT = 12;
export const VALOR_QUOTA_BASE = 100, VALOR_QUOTA_PER_TH = 25;
export const VALOR_OVERFLOW = 0.25;              // earning rate once the quota is spent
export const REST_PER_MS_AWAY = 0.5;             // an hour away banks half an hour of Rest
export const REST_CAP_MS = 48*3600*1000;         // and it stops banking after two days
export const REST_PROD_BONUS = 0.5;              // +50% production while Rested
export const REST_QUOTA_BONUS = 1.0;             // and double the daily Valor quota
