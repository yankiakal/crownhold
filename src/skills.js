// Hero skills — choices, not levels.
//
// Kingshot's hero skills work because they are where hero shards go: the
// currency is the point, and the numbers only exist to give it somewhere to
// land. Strip the currency and levelled skills become a fourth vertical track on
// top of levels, stars and two gear slots — a spreadsheet, not a decision.
//
// So skills here change what a hero IS, never how big their numbers are:
//
//   · A shared pool of 26. Which ones a hero may take is filtered by their
//     troop class and by whether the skill is a court skill or a field skill,
//     so every hero has a different legal set — around twenty each.
//   · Three slots, opened by investment (one at level 1, one at 10, one at 3★).
//     Progression is in HOW MANY choices you get, not in their size.
//   · Freely reassignable, always, for nothing. A build you cannot change is a
//     mistake you paid for; this is meant to be re-thought every season when the
//     temper turns.
//   · Many carry a real cost. A skill that is simply better than the alternative
//     is not a choice, it is a tax on not reading the wiki.

export const SKILL_SLOTS = 3;
export const SLOT_AT = [
  { slot:1, lvl:1,  stars:0, hint:'from the start' },
  { slot:2, lvl:10, stars:0, hint:'at level 10' },
  { slot:3, lvl:1,  stars:3, hint:'at 3★' },
];

/* `where` decides when a skill applies:
     field — while this hero leads a column (or sorties in the arena)
     court — while this hero is seated
   `cls` restricts a skill to captains of that troop class. */
export const SKILLS = {
  /* ── field: the shape of a column ── */
  hardMarch:   {name:'Hard March',      icon:'🥁', where:'field',
                fx:'+12% column power, −15% hauled home',      mods:{power:0.12, haul:-0.15}},
  lightPack:   {name:'Light Packs',     icon:'🧺', where:'field',
                fx:'+25% hauled home, −10% column power',      mods:{haul:0.25, power:-0.10}},
  forcedPace:  {name:'Forced Pace',     icon:'🏃', where:'field',
                fx:'−20% travel time, +12% losses',            mods:{speed:0.20, guard:-0.12}},
  carefulRoute:{name:'Careful Route',   icon:'🧭', where:'field',
                fx:'−25% losses, +15% travel time',            mods:{guard:0.25, speed:-0.15}},
  longTrain:   {name:'Long Train',      icon:'🐂', where:'field',
                fx:'+22 column capacity, −8% column power',    mods:{cap:22, power:-0.08}},
  tightColumn: {name:'Tight Column',    icon:'📏', where:'field',
                fx:'+14% column power, −18 column capacity',   mods:{power:0.14, cap:-18}},
  taleTellers: {name:'Tale-Tellers',    icon:'📖', where:'field',
                fx:'+30% Mastery from this column',            mods:{lore:0.30}},
  warTithe:    {name:'War Tithe',       icon:'🪙', where:'field',
                fx:'+30% Valor from this column',              mods:{valor:0.30}},

  /* ── field: conditional. These are the real build decisions ── */
  onePurpose:  {name:'One Purpose',     icon:'🎯', where:'field', cond:'pure',
                fx:'+30% power if every soldier in the column is one class'},
  mixedArms:   {name:'Mixed Arms',      icon:'🔀', where:'field', cond:'mixed',
                fx:'+18% power if the column fields three or more classes'},
  fullMuster:  {name:'Full Muster',     icon:'🧱', where:'field', cond:'full',
                fx:'+15% power when the column rides at full capacity'},
  campBreaker: {name:'Camp-Breaker',    icon:'🔥', where:'field', cond:'camp',
                fx:'+35% power against bandit camps'},
  beastBane:   {name:'Beast-Bane',      icon:'🩸', where:'field', cond:'beast',
                fx:'+35% power against beasts'},
  hostBreaker: {name:'Host-Breaker',    icon:'💀', where:'field', cond:'host',
                fx:'+25% power against Great Hosts and in the Arena'},

  /* ── court: the hold, while they are seated ── */
  stewardship: {name:'Stewardship',     icon:'📜', where:'court',
                fx:'+7% production',                           mods:{production:0.07}},
  clerkship:   {name:'Clerkship',       icon:'✒️', where:'court',
                fx:'+6% Valor earned',                         mods:{valor:0.06}},
  vaultwright: {name:'Vaultwright',     icon:'📦', where:'court',
                fx:'+6% storage',                              mods:{store:0.06}},
  physician:   {name:'Physician',       icon:'⚕️', where:'court',
                fx:'+15% infirmary beds',                      mods:{mend:0.15}},
  armourer:    {name:'Armourer',        icon:'🛡️', where:'court',
                fx:'−6% casualties',                           mods:{casualties:0.06}},
  banneret:    {name:'Banneret',        icon:'🚩', where:'court',
                fx:'+6% troop power, −4% production',          mods:{troopPower:0.06, production:-0.04}},
  drillyard:   {name:'Drillyard',       icon:'⏱️', where:'court',
                fx:'−7% training time',                        mods:{trainTime:0.07}},

  /* ── class branches: only a captain of that troop may take these ── */
  shieldDrill: {name:'Shieldwall Drill',icon:'🛡️', where:'field', cls:'spearman',
                fx:'+30% to spearmen in the column',           mods:{cls:0.30}},
  massedVolley:{name:'Massed Volley',   icon:'🏹', where:'field', cls:'archer',
                fx:'+30% to archers in the column',            mods:{cls:0.30}},
  lanceCharge: {name:'Lance Charge',    icon:'🐎', where:'field', cls:'knight',
                fx:'+30% to knights in the column',            mods:{cls:0.30}},
  siegeTrain:  {name:'Siege Train',     icon:'⚙️', where:'field', cls:'ballista',
                fx:'+30% to ballistas in the column',          mods:{cls:0.30}},
  deepRaid:    {name:'Deep Raid',       icon:'🗺️', where:'field', cls:'knight',
                fx:'−30% travel time, −20% hauled home',       mods:{speed:0.30, haul:-0.20}},
};

export const COND_FX = {
  pure: 0.30, mixed: 0.18, full: 0.15, camp: 0.35, beast: 0.35, host: 0.25,
};

/* How many slots this hero has opened. Levels and stars buy *breadth*. */
export function slotsOpen(s, id){
  const h = s.heroes[id];
  if(!h) return 0;
  let n = 0;
  for(const g of SLOT_AT) if(h.lvl >= g.lvl && (h.stars||0) >= g.stars) n++;
  return n;
}
/* Which skills this hero is allowed. Class branches are theirs alone; everything
   else is open — so two heroes of the same class still differ by what you chose,
   and two of different classes differ by what they were ever able to choose. */
export function skillLegal(s, id, key, HERO_POOL){
  const d = SKILLS[key], hd = HERO_POOL[id];
  if(!d || !hd) return false;
  return !d.cls || d.cls === hd.cls;
}
export function legalSkills(s, id, HERO_POOL){
  return Object.keys(SKILLS).filter(k => skillLegal(s, id, k, HERO_POOL));
}
/* Equipped skills, trimmed to the slots actually open.
   Slice BEFORE filtering. Filtering first compacts the array, so a skill parked
   in slot 2 slid down into slot 1 and applied even when only one slot was open —
   a hero could have carried an effect they had not earned. */
export function equipped(s, id){
  const h = s.heroes[id];
  if(!h || !Array.isArray(h.skills)) return [];
  return h.skills.slice(0, slotsOpen(s, id)).filter(k => SKILLS[k]);
}
