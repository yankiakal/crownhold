// Crownhold game data. Pure constants — no state, no DOM.
// Balance note: run `npm run sim` after changing any number here.

export const BUILDINGS = {
  townhall:  {name:'Town Hall',  icon:'🏰', fx:'Raises storage caps; gates every other building.',
              cost:{wood:120,stone:90}, time:20, max:10},
  farm:      {name:'Farm',       icon:'🌾', prod:'food', rate:2.0, cost:{wood:30},           time:8,  max:10},
  lumberyard:{name:'Lumberyard', icon:'🪵', prod:'wood', rate:1.6, cost:{food:30},           time:8,  max:10},
  quarry:    {name:'Quarry',     icon:'⛰️', prod:'stone',rate:1.0, cost:{wood:60,food:40},   time:12, max:10},
  ironmine:  {name:'Iron Mine',  icon:'⚒️', prod:'iron', rate:0.7, cost:{wood:80,stone:60},  time:15, max:10, th:3},
  barracks:  {name:'Barracks',   icon:'⚔️', fx:'Trains troops; each level trains 8% faster.',
              cost:{wood:60,stone:30},  time:15, max:10},
  wall:      {name:'Wall',       icon:'🧱', fx:'+18 defense power per level.',
              cost:{stone:90,wood:40},  time:18, max:10, th:2},
  watchtower:{name:'Watchtower', icon:'🗼', fx:'Scouts raid strength; blunts attacks 5% per level.',
              cost:{wood:120,stone:80,iron:20}, time:20, max:6, th:3},
};
export const COST_MULT = 1.55, TH_COST_MULT = 1.7, TIME_MULT = 1.42;

/* upkeep: food/sec per soldier — armies eat. This is what keeps army size in
   equilibrium with your farms instead of scaling to infinity. */
export const TROOPS = {
  spearman:{name:'Spearman', icon:'🛡️', power:3,  upkeep:0.06, cost:{food:25,wood:10}, time:4,  barracks:1},
  archer:  {name:'Archer',   icon:'🏹', power:5,  upkeep:0.10, cost:{food:20,wood:25}, time:6,  barracks:2},
  knight:  {name:'Knight',   icon:'🐎', power:11, upkeep:0.22, cost:{food:60,iron:20}, time:12, barracks:4},
  ballista:{name:'Ballista', icon:'⚙️', power:24, upkeep:0.50, cost:{wood:80,iron:40}, time:20, barracks:6},
};

/* The Mastery track — Crownhold's replacement for VIP levels. Earned from every
   kind of play (raids, quests, building, drilling, patrols); never sold. */
export const MASTERY = [
  {need:60,   fx:'+6% production'},
  {need:190,  fx:'+6% troop power'},
  {need:400,  fx:'Patrol cooldown −8s'},
  {need:700,  fx:'+15% storage'},
  {need:1100, fx:'−12% build & training time'},
  {need:1600, fx:'Another champion answers (hero slot)'},
  {need:2200, fx:'Writ of Peace capacity +1'},
  {need:2900, fx:'+8% production & troop power'},
  {need:3700, fx:'Patrols return double resources'},
  {need:4600, fx:'+15% troop power — High Sovereign'},
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
  marshal:      {name:'Ser Alden, the Marshal',  icon:'⚜️', rarity:'common', fx:l=>'+'+(3*l)+'% troop power',            bonus:{troopPower:0.03}},
  steward:      {name:'Maren, High Steward',     icon:'📜', rarity:'common', fx:l=>'+'+(5*l)+'% production',             bonus:{production:0.05}},
  warden:       {name:'Odo, the Night Warden',   icon:'🦉', rarity:'common', fx:l=>'−'+(3*l)+'% training time',          bonus:{trainTime:0.03}},
  quartermaster:{name:'Petra, Quartermaster',    icon:'⚖️', rarity:'common', fx:l=>'+'+(3*l)+'% raid loot',              bonus:{loot:0.03}},
  gatekeeper:   {name:'Bram, Gatekeeper',        icon:'🚪', rarity:'common', fx:l=>'+'+(6*l)+' wall power',              bonus:{wallPower:6}},
  forager:      {name:'Isolde, Forager',         icon:'🧺', rarity:'common', fx:l=>'+'+(4*l)+'% patrol yield',           bonus:{patrolYield:0.04}},
  drillmaster:  {name:'Corin, Drillmaster',      icon:'🥁', rarity:'rare',   fx:l=>'+'+(2*l)+'% troop power, −'+(2*l)+'% training time', bonus:{troopPower:0.02, trainTime:0.02}},
  spymaster:    {name:'Sable, Spymaster',        icon:'🗝️', rarity:'rare',   fx:l=>'+'+(1*l)+'% raid blunting',          bonus:{blunt:0.01}},
  medic:        {name:'Wren, Field Medic',       icon:'🌿', rarity:'rare',   fx:l=>'−'+(3*l)+'% casualties',             bonus:{casualties:0.03}},
  provisioner:  {name:'Tobias, Provisioner',     icon:'🫙', rarity:'rare',   fx:l=>'−'+(2.5*l)+'% army upkeep',          bonus:{upkeep:0.025}},
  exile:        {name:'Queen Yara, the Exile',   icon:'👑', rarity:'epic',   fx:l=>'+'+(5*l)+'% troop power',            bonus:{troopPower:0.05}},
  treasurer:    {name:'Aldric, Crown Treasurer', icon:'🪙', rarity:'epic',   fx:l=>'+'+(5*l)+'% Valor earned',           bonus:{valor:0.05}},
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
];

export const RES_META = {
  food:{lbl:'Food',icon:'🌾'}, wood:{lbl:'Wood',icon:'🪵'},
  stone:{lbl:'Stone',icon:'⛰️'}, iron:{lbl:'Iron',icon:'⚒️'},
};
export const WAVE_MS = 75000, FIRST_WAVE_MS = 120000, PATROL_MS = 25000, SHIELD_MS = 180000;
