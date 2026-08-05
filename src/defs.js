// Crownhold game data. Pure constants — no state, no DOM.
// Balance note: run `npm run sim` after changing any number here.

export const BUILDINGS = {
  townhall:  {name:'Town Hall',  icon:'🏰', fx:'Raises storage caps; gates every other building.',
              cost:{wood:200,stone:150}, time:20, max:30},
  farm:      {name:'Farm',       icon:'🌾', prod:'food', rate:2.0, cost:{wood:30},           time:8,  max:30},
  lumberyard:{name:'Lumberyard', icon:'🪵', prod:'wood', rate:1.6, cost:{food:30},           time:8,  max:30},
  quarry:    {name:'Quarry',     icon:'⛰️', prod:'stone',rate:1.0, cost:{wood:60,food:40},   time:12, max:30},
  ironmine:  {name:'Iron Mine',  icon:'⚒️', prod:'iron', rate:0.7, cost:{wood:80,stone:60},  time:15, max:30, th:3},
  barracks:  {name:'Barracks',   icon:'⚔️', fx:'Trains troops; each level trains 6% faster.',
              cost:{wood:60,stone:30},  time:15, max:30},
  wall:      {name:'Wall',       icon:'🧱', fx:'+18 defense power per level.',
              cost:{stone:90,wood:40},  time:18, max:30, th:2},
  watchtower:{name:'Watchtower', icon:'🗼', fx:'Scouts raid shape & strength; blunts attacks 4% per level.',
              cost:{wood:120,stone:80,iron:20}, time:20, max:16, th:3},
  tavern:    {name:'Tavern',     icon:'🍺', fx:'Expeditions: −1s cooldown and +3% yield per level.',
              cost:{wood:90,food:60},   time:14, max:25, th:2},
  granary:   {name:'Granary',    icon:'🏺', fx:'+2% food production and +3% storage per level.',
              cost:{wood:100,stone:40}, time:16, max:25, th:3},
  academy:   {name:'War Academy',icon:'🎓', fx:'Each level unlocks the next troop tier.',
              cost:{stone:150,iron:60}, time:25, max:9,  th:4},
  hospital:  {name:'Hospital',   icon:'⛑️', fx:'−4% battle casualties per level.',
              cost:{wood:120,food:80},  time:18, max:25, th:4},
  warehouse: {name:'Warehouse',  icon:'📦', fx:'Defeats plunder 4% less of your stores per level.',
              cost:{stone:130,wood:80}, time:18, max:20, th:5},
  forge:     {name:'Forge',      icon:'🔥', fx:'Smelts iron and wood into Steel, without pause.',
              cost:{stone:300,iron:180}, time:40, max:25, th:12},
  runeworks: {name:'Runeworks',  icon:'🔮', fx:'Binds stone and steel into Runestone.',
              cost:{stone:700,steel:25}, time:60, max:20, th:22},
};
// polynomial curves: early levels are quick, late levels are the long road
export const COST_EXP = 2.0, TIME_EXP = 1.6;

/* ── troop tiers: the same soldier, forged better. Unlocked by the War Academy ── */
export const TIERS = ['I','II','III','IV','V','VI','VII','VIII','IX','X'];
export const TIER_POWER = 0.25, TIER_UPKEEP = 0.18, TIER_COST = 0.22;

/* upkeep: food/sec per soldier — armies eat. This is what keeps army size in
   equilibrium with your farms instead of scaling to infinity. */
export const TROOPS = {
  spearman:{name:'Spearman', icon:'🛡️', power:3,  upkeep:0.06, cost:{food:25,wood:10}, time:4,  barracks:1},
  archer:  {name:'Archer',   icon:'🏹', power:5,  upkeep:0.10, cost:{food:20,wood:25}, time:6,  barracks:2},
  // iron units eat less per point of power — quality is the path past the food ceiling
  knight:  {name:'Knight',   icon:'🐎', power:11, upkeep:0.17, cost:{food:60,iron:20}, time:12, barracks:4},
  ballista:{name:'Ballista', icon:'⚙️', power:24, upkeep:0.38, cost:{wood:80,iron:40}, time:20, barracks:6},
};

/* The Mastery track — Crownhold's replacement for VIP levels. Earned from every
   kind of play (raids, quests, building, drilling, patrols); never sold. */
export const MASTERY = [
  {need:60,   fx:'+6% production'},
  {need:190,  fx:'+6% troop power'},
  {need:400,  fx:'Expedition cooldown −12s'},
  {need:700,  fx:'+15% storage'},
  {need:1100, fx:'−12% build & training time'},
  {need:1600, fx:'Another champion answers (hero slot)'},
  {need:2200, fx:'Writ of Peace capacity +1'},
  {need:2900, fx:'+8% production & troop power'},
  {need:3700, fx:'Expeditions return double resources'},
  {need:4600, fx:'+15% troop power — High Sovereign'},
  {need:5800, fx:'+8% production'},
  {need:7300, fx:'+8% troop power'},
  {need:9200, fx:'+10% storage'},
  {need:11600,fx:'Writ of Peace capacity +1'},
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
  {need:191000, fx:'Writ of Peace capacity +1'},
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

export const HERO_POOL = {
  marshal:      {name:'Ser Alden, the Marshal',  icon:'⚜️', rarity:'common', fx:l=>'+'+(3*l)+'% troop power',            bonus:{troopPower:0.03},
                 order:{name:'Rally',           desc:'Next battle: +20% army power.',           cd:4, key:'rally'}},
  steward:      {name:'Maren, High Steward',     icon:'📜', rarity:'common', fx:l=>'+'+(5*l)+'% production',             bonus:{production:0.05},
                 order:{name:'Requisition',     desc:'Instantly gain food & wood (60 × Town Hall).', cd:5, key:'requisition'}},
  warden:       {name:'Odo, the Night Warden',   icon:'🦉', rarity:'common', fx:l=>'−'+(3*l)+'% training time',          bonus:{trainTime:0.03},
                 order:{name:'Forced March',    desc:'Current training completes instantly.',   cd:5, key:'forcedmarch'}},
  quartermaster:{name:'Petra, Quartermaster',    icon:'⚖️', rarity:'common', fx:l=>'+'+(3*l)+'% raid loot',              bonus:{loot:0.03},
                 order:{name:'Plunder Wagons',  desc:'Next win: loot ×2.',                      cd:4, key:'plunder'}},
  gatekeeper:   {name:'Bram, Gatekeeper',        icon:'🚪', rarity:'common', fx:l=>'+'+(6*l)+' wall power',              bonus:{wallPower:6},
                 order:{name:'Brace the Gates', desc:'Next battle: wall counts double.',        cd:4, key:'brace'}},
  forager:      {name:'Isolde, Forager',         icon:'🧺', rarity:'common', fx:l=>'+'+(4*l)+'% expedition yield',       bonus:{patrolYield:0.04},
                 order:{name:'Rich Trails',     desc:'Next expedition: double yield, no ambush.', cd:3, key:'richtrails'}},
  drillmaster:  {name:'Corin, Drillmaster',      icon:'🥁', rarity:'rare',   fx:l=>'+'+(2*l)+'% troop power, −'+(2*l)+'% training time', bonus:{troopPower:0.02, trainTime:0.02},
                 order:{name:'Crash Course',    desc:'Next training batch: −75% time.',         cd:4, key:'crashcourse'}},
  spymaster:    {name:'Sable, Spymaster',        icon:'🗝️', rarity:'rare',   fx:l=>'+'+(1*l)+'% raid blunting',          bonus:{blunt:0.01},
                 order:{name:'Expose the Camp', desc:'Next wave arrives 15% weaker.',           cd:4, key:'expose'}},
  medic:        {name:'Wren, Field Medic',       icon:'🌿', rarity:'rare',   fx:l=>'−'+(3*l)+'% casualties',             bonus:{casualties:0.03},
                 order:{name:'Triage',          desc:'Next battle: no casualties on a win.',    cd:5, key:'triage'}},
  provisioner:  {name:'Tobias, Provisioner',     icon:'🫙', rarity:'rare',   fx:l=>'−'+(2.5*l)+'% army upkeep',          bonus:{upkeep:0.025},
                 order:{name:'Ration Stores',   desc:'Upkeep paused for 60s.',                  cd:5, key:'ration'}},
  exile:        {name:'Queen Yara, the Exile',   icon:'👑', rarity:'epic',   fx:l=>'+'+(5*l)+'% troop power',            bonus:{troopPower:0.05},
                 order:{name:'Royal Decree',    desc:'Next battle: +30% army power.',           cd:5, key:'decree'}},
  treasurer:    {name:'Aldric, Crown Treasurer', icon:'🪙', rarity:'epic',   fx:l=>'+'+(5*l)+'% Valor earned',           bonus:{valor:0.05},
                 order:{name:'Tithe of War',    desc:'Next battle: Valor ×2.',                  cd:4, key:'tithe'}},
};

/* ── Command layer: raids have a shape, you choose the answer ── */
export const WAVE_TYPES = {
  rabble:     {name:'Rabble',      icon:'🪓', weakTo:null,         counter:null},
  riders:     {name:'Riders',      icon:'🐎', weakTo:'shieldwall', counter:'spearman'},
  skirmishers:{name:'Skirmishers', icon:'🏹', weakTo:'charge',     counter:'knight'},
  brutes:     {name:'Brutes',      icon:'💪', weakTo:'volley',     counter:'archer'},
};
// cheap troops screen the expensive ones: casualty weight by class
export const SCREEN = {spearman:1.5, archer:1.2, knight:0.75, ballista:0.5};
export const STANCES = {
  balanced:  {name:'Balanced',    icon:'⚖️', hint:'No bonus, no penalty'},
  shieldwall:{name:'Shield Wall', icon:'🛡️', hint:'Counters Riders'},
  volley:    {name:'Volley',      icon:'🏹', hint:'Counters Brutes'},
  charge:    {name:'Charge',      icon:'⚔️', hint:'Counters Skirmishers'},
};
export const COUNTER_BONUS = 1.2, COUNTER_PENALTY = 0.92, COUNTER_CASUALTY = 0.6;

/* ── Expeditions: three routes, one choice, real trade-offs ── */
export const EXPEDITION_CD = 45000;
export const EXPEDITIONS = {
  kingsroad: {name:"King's Road",  icon:'🛤️', desc:'Safe: food & wood, +3 Valor'},
  wildwood:  {name:'Wildwood',     icon:'🌲', desc:'Risky: stone & iron haul — 35% ambush costs troops'},
  barrows:   {name:'Barrow Hills', icon:'⚱️', desc:'Strange: +6 Valor, Mastery — rarely a Writ'},
};

// hero slots unlock at these milestones; each grants a draft of three
export const HERO_SLOTS = [
  {hint:'Reach Town Hall 2', check:s=>s.b.townhall>=2},
  {hint:'Reach Town Hall 3', check:s=>s.b.townhall>=3},
  {hint:'Repel 7 raids',     check:s=>s.wavesWon>=7},
  {hint:'Reach Mastery 6',   check:s=>masteryLvl(s)>=6},
  {hint:'Reach Town Hall 5', check:s=>s.b.townhall>=5},
  {hint:'Repel 20 raids',    check:s=>s.wavesWon>=20},
  {hint:'Reach Town Hall 7', check:s=>s.b.townhall>=7},
  {hint:'Reach Mastery 8',   check:s=>masteryLvl(s)>=8},
];

// permanent relics offered (3, pick 1) after every Warband win
export const SPOILS = {
  banner:  {name:'Banner of the Bloodied', icon:'🚩', fx:'+6% troop power',             stack:true,  bonus:{troopPower:0.06}},
  granary: {name:'Granary Charter',        icon:'🌾', fx:'+8% food production',         stack:true,  bonus:{foodProd:0.08}},
  sawmill: {name:'Sawmill Rights',         icon:'🪚', fx:'+8% wood production',         stack:true,  bonus:{woodProd:0.08}},
  veins:   {name:'Deep Vein Maps',         icon:'🗺️', fx:'+8% stone & iron production', stack:true,  bonus:{stoneProd:0.08, ironProd:0.08}},
  mason:   {name:"Mason's Oath",           icon:'🧱', fx:'−10% build time',             stack:true,  bonus:{buildTime:0.10}},
  drill:   {name:'Drill Manual',           icon:'📖', fx:'−8% training time',           stack:true,  bonus:{trainTime:0.08}},
  tollroad:{name:'Toll Road',              icon:'🛣️', fx:'+25% patrol yield',           stack:true,  bonus:{patrolYield:0.25}},
  larder:  {name:'Iron Larder',            icon:'🥩', fx:'−8% army upkeep',             stack:true,  bonus:{upkeep:0.08}},
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
  {txt:'Train a Ballista',               check:s=>(s.trainedBy.ballista||0)>=1, reward:{valor:12},rtxt:'+12 Valor'},
  {txt:'Repel 15 raids',                 check:s=>s.wavesWon>=15,     reward:{valor:15,shield:1}, rtxt:'+15 Valor, +1 Writ'},
  {txt:'Reach Town Hall 7',              check:s=>s.b.townhall>=7,    reward:{valor:25},          rtxt:'+25 Valor'},
  {txt:'Reach Mastery 6',                check:s=>masteryLvl(s)>=6,   reward:{valor:15},          rtxt:'+15 Valor'},
  {txt:'Repel 25 raids',                 check:s=>s.wavesWon>=25,     reward:{valor:25},          rtxt:'+25 Valor'},
  {txt:'Reach Town Hall 10',             check:s=>s.b.townhall>=10,   reward:{valor:50},          rtxt:'+50 Valor'},
  {txt:'Build the War Academy',          check:s=>s.b.academy>=1,     reward:{valor:15},          rtxt:'+15 Valor'},
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
  {id:'full-court',   txt:'Seat eight champions',             check:s=>Object.keys(s.heroes||{}).length>=8, valor:80},
  {id:'hero-20',      txt:'Raise a hero to level 20',         check:s=>Object.values(s.heroes||{}).some(h=>h.lvl>=20), valor:100},
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
  food:     {lbl:'Food',     icon:'🌾'},
  wood:     {lbl:'Wood',     icon:'🪵'},
  stone:    {lbl:'Stone',    icon:'⛰️'},
  iron:     {lbl:'Iron',     icon:'⚒️'},
  steel:    {lbl:'Steel',    icon:'🔩', refined:true, capMult:0.10, from:'forge'},
  runestone:{lbl:'Runestone',icon:'💠', refined:true, capMult:0.035, from:'runeworks'},
};
// levels at which every building starts demanding the next currency
export const STEEL_FROM = 15, RUNE_FROM = 24;
// what a refinery eats per unit it produces
export const REFINE = {
  forge:     { out:'steel',     rate:0.030, in:{iron:6, wood:4} },
  runeworks: { out:'runestone', rate:0.018, in:{stone:14, steel:3} },
};
export const WAVE_MS = 75000, FIRST_WAVE_MS = 120000, PATROL_MS = 25000, SHIELD_MS = 180000;

/* ── Pacing: the calendar sets the pace, not your stamina ──
   A player with ten hours a day should out-play everyone and enjoy every hour
   of it — but they should not finish the game in a week. So progression is
   gated by real time (long late-game builds), Valor earning has a daily quota
   past which it trickles, and anyone who has been away comes back Rested. */
// Build times cap per level, not globally: a level-3 hut is minutes, a level-28
// keep is hours. This is what makes the queue — not your stamina — the wall.
// The live game multiplies this by ~10, putting late builds in Kingshot's
// day-long territory, which is why nobody can play through the late game.
export const buildTimeCap = lvl => 600 + 400 * lvl;   // seconds
export const VALOR_QUOTA_BASE = 100, VALOR_QUOTA_PER_TH = 25;
export const VALOR_OVERFLOW = 0.25;              // earning rate once the quota is spent
export const REST_PER_MS_AWAY = 0.5;             // an hour away banks half an hour of Rest
export const REST_CAP_MS = 48*3600*1000;         // and it stops banking after two days
export const REST_PROD_BONUS = 0.5;              // +50% production while Rested
export const REST_QUOTA_BONUS = 1.0;             // and double the daily Valor quota
