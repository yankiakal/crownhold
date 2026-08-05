// Crownhold game rules. Pure state-in, state-out — no DOM, no globals.
// Every function takes the state `s` explicitly; time (`now`, ms) and randomness
// (`rand`) are injected so the browser, the balance sim, and a future server all
// run this exact module.

import {
  BUILDINGS, TROOPS, MASTERY, QUESTS, ACHIEVEMENTS, RES_META,
  HERO_POOL, HERO_SLOTS, SPOILS, RARITY,
  COURT_BASE, COURT_PER_TH, COURT_MAX, seasonNo, CLASS_AFFINITY, MARCH_HEROES,
  ARENA_HEROES, STAR_POWER, starCap, starNeed, DEEDS, temperFor,
  PET_POOL, PET_MAX_LVL, petXpNeed, petBondNeed,
  WAVE_TYPES, STANCES, COUNTER_BONUS, COUNTER_PENALTY, COUNTER_CASUALTY, SCREEN,
  EXPEDITIONS, EXPEDITION_CD,
  COST_EXP, TIME_EXP, TIERS, TIER_POWER, TIER_UPKEEP, TIER_COST,
  REFINE, STEEL_FROM, RUNE_FROM,
  buildTimeCap, TIME_SCALE, SECOND_QUEUE_TH,
  VALOR_QUOTA_BASE, VALOR_QUOTA_PER_TH, VALOR_OVERFLOW,
  REST_CAP_MS, REST_PROD_BONUS, REST_QUOTA_BONUS,
  WAVE_MS, FIRST_WAVE_MS, masteryLvl,
} from './defs.js';

import { RESEARCH, techLvl, techBonus, techFlat, techCost, techTime, techAvailable } from './research.js';
import { REGALIA, WARGEAR, GEAR_MAX, gearCost, gearTime, regaliaBonus, regaliaTier,
         wargearTier, gearLevels } from './gear.js';
import { SKILLS, SKILL_SLOTS, COND_FX, slotsOpen, skillLegal, equipped } from './skills.js';
import { scoreDeed, eventState, currentEvent, claimableMilestones } from './events.js';
import { dailyState, dailyProgress, DAILY_BONUS } from './daily.js';

export { masteryLvl };

/* Alliance research reaches its members through here: the server stamps
   s.allyBonus before it advances a hold, so alliance techs feel like your own. */
export function allyBonus(s, key){ return (s.allyBonus && s.allyBonus[key]) || 0; }

/* ── formatting ── */
export function fmt(n){ return n>=10000 ? (n/1000).toFixed(1)+'k' : String(Math.floor(n)); }
export function ftime(ms){ const s=Math.max(0,Math.ceil(ms/1000)); return s>=60 ? Math.floor(s/60)+'m '+(s%60)+'s' : s+'s'; }
export function clock(t){ const d=new Date(t); return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'); }

/* ── stars ──
   A star is worth +5% of everything a hero does, applied by raising their
   effective level. One number feeds passives, lead traits, class affinity and
   column capacity alike, so ascension never needs a special case anywhere. */
export function heroStars(s, id){ return (s.heroes[id] && s.heroes[id].stars) || 0; }
export function effLvl(s, id){
  const h = s.heroes[id];
  if(!h) return 0;
  return Math.round(h.lvl * (1 + STAR_POWER * (h.stars || 0))) + gearLevels(s, id);
}
export function heroStarCap(s){ return starCap(s.now || Date.now()); }
/* Deeds are earned by fielding the hero. Ascension is automatic — there is no
   currency to hoard and nothing to buy, so there is nothing to sell. */
export function addDeeds(s, ids, kind, now){
  const list = (Array.isArray(ids) ? ids : [ids]).filter(id => s.heroes[id] && HERO_POOL[id]);
  const gain = DEEDS[kind] || 1, cap = heroStarCap(s);
  for(const id of list){
    const h = s.heroes[id];
    h.deeds = (h.deeds || 0) + gain;
    while((h.stars || 0) < cap && h.deeds >= starNeed(h.stars || 0)){
      h.deeds -= starNeed(h.stars || 0);
      h.stars = (h.stars || 0) + 1;
      const d = HERO_POOL[id];
      pushLog(s, '✦ '+d.icon+' '+d.name.split(',')[0]+' ascends to '+h.stars+'★.', 'gold');
      showBanner(s, '✦ '+d.name.split(',')[0]+' — '+h.stars+'★', 'win', now);
    }
  }
}

/* ── companions ──
   One pet walks at your side; the rest wait in the kennel. That single-slot rule
   is what keeps a collection from becoming a stat stack — more companions means
   more things you can choose to be good at, never more total. Bond comes only
   from hunting beasts, and companions are drafted three-at-a-time like heroes. */
export function petBonus(s, key){
  const id = s.petOut;
  if(!id) return 0;
  const d = PET_POOL[id], p = (s.pets || {})[id];
  if(!d || !p || d.key !== key) return 0;
  return d.per * p.lvl;
}
export function setPetOut(s, id, now){
  if(id && !(s.pets || {})[id]) return false;
  s.now = now;
  s.petOut = (s.petOut === id) ? null : id;
  return true;
}
export function gainBond(s, n, now){
  s.bond = (s.bond || 0) + n;
  const owned = Object.keys(s.pets || {}).length;
  const queued = (s.choiceQueue || []).filter(c => c.type === 'pet').length;
  if(owned + queued >= Object.keys(PET_POOL).length) return;      // the whole kennel is yours
  const need = petBondNeed(owned + queued);
  if(s.bond >= need){
    s.bond -= need;
    const opts = rollPetOffer(s, Math.random);
    if(opts.length){
      s.choiceQueue.push({ type:'pet', options:opts, reroll:1 });
      pushLog(s, '🐾 Something has been following the hunting party home — choose which.', 'gold');
    }else s.bond += need;
  }
}
export function gainPetXp(s, n){
  const id = s.petOut;
  const p = id && (s.pets || {})[id];
  if(!p || p.lvl >= PET_MAX_LVL) return;
  p.xp = (p.xp || 0) + n;
  while(p.lvl < PET_MAX_LVL && p.xp >= petXpNeed(p.lvl)){
    p.xp -= petXpNeed(p.lvl);
    p.lvl++;
    const d = PET_POOL[id];
    pushLog(s, d.icon+' '+d.name+' grows into it — level '+p.lvl+' ('+d.fx(p.lvl)+').', 'gold');
  }
}
export function rollPetOffer(s, rand){
  const owned = new Set(Object.keys(s.pets || {}));
  const queued = new Set((s.choiceQueue||[]).flatMap(c => c.type==='pet' ? c.options : []));
  const avail = Object.keys(PET_POOL).filter(id => !owned.has(id) && !queued.has(id));
  const picks = [];
  for(let i=0; i<3 && avail.length; i++)
    picks.push(avail.splice(Math.floor(rand()*avail.length), 1)[0]);
  return picks;
}

/* ── the court ──
   A hero either sits in the court or rides at the head of a column; they
   cannot do both, and the court has only so many chairs. This is what lets the
   roster grow to thirty-odd without the hold's power growing with it: drafting
   a new hero widens your options, it never widens your stat block. */
export function courtSeats(s){
  return Math.min(COURT_MAX, COURT_BASE + Math.floor((s.b.townhall||1) / COURT_PER_TH));
}
export function heroAway(s, id){
  return (s.marches||[]).some(m => m.heroes ? m.heroes.includes(id) : m.hero === id);
}
export function courtSeated(s){
  return (s.court||[]).filter(id => s.heroes[id] && HERO_POOL[id]).slice(0, courtSeats(s));
}
/* seated, and actually at home to do the job */
export function courtActive(s){ return courtSeated(s).filter(id => !heroAway(s, id)); }

export function seatHero(s, id, now){
  if(!s.heroes[id] || !HERO_POOL[id]) return false;
  s.now = now;
  s.court = s.court || [];
  const at = s.court.indexOf(id);
  if(at >= 0){                                   // already seated — stand them down
    s.court.splice(at, 1);
    if(s.captain === id) s.captain = null;
    return true;
  }
  if(heroAway(s, id)) return false;              // they are out with a column
  if(s.court.length >= courtSeats(s)) return false;
  s.court.push(id);
  return true;
}

/* ── bonus aggregation: the court + spoils feed every stat below ── */
/* Standing bonuses: your seated court, plus the regalia you wear yourself.
   The Lord's Regalia is folded in here rather than plumbed to four separate
   call sites, so production, Valor, troop power and casualties all pick it up
   wherever they are already computed. */
export function heroBonus(s, key){
  let b = regaliaBonus(s, key) + skillCourt(s, key);
  for(const id of courtActive(s)){
    const d = HERO_POOL[id];
    if(d && d.bonus[key]) b += d.bonus[key]*effLvl(s,id) * (s.captain===id ? 2 : 1); // the Captain's passive counts double
  }
  return b;
}
/* What a hero brings to the column they ride with. Deliberately smaller than a
   court passive: leading is about covering many marches, not out-scaling one. */
export function leadBonus(s, id, key){
  const d = HERO_POOL[id], h = s.heroes[id];
  if(!d || !h || !d.lead || d.lead.key !== key) return 0;
  return d.lead.val * effLvl(s, id);
}
/* Three heroes ride per column, so every lead trait is a sum over the party.
   Accepts a single id too, so older callers and saves keep working. */
export function leadTotal(s, heroes, key){
  const list = Array.isArray(heroes) ? heroes : (heroes ? [heroes] : []);
  let b = 0;
  for(const id of list) b += leadBonus(s, id, key);
  return b;
}
/* A hero knows one troop class. Lead a column of what they know and it hits
   harder — the reason to keep archers' captains and knights' captains both. */
export function affinity(s, heroes, troopKey){
  const list = Array.isArray(heroes) ? heroes : (heroes ? [heroes] : []);
  let b = 0;
  for(const id of list){
    const d = HERO_POOL[id], h = s.heroes[id];
    if(d && h && d.cls === troopKey) b += CLASS_AFFINITY * effLvl(s, id);
  }
  return b;
}

/* ── skills ──
   Aggregated exactly like lead traits and court passives, so a skill needs no
   new plumbing at the point of use: it lands on the same keys everything else
   already reads. Conditional skills are separate because they need to see the
   column's actual composition and what it is fighting. */
export function skillTotal(s, heroes, key){
  const list = Array.isArray(heroes) ? heroes : (heroes ? [heroes] : []);
  let b = 0;
  for(const id of list)
    for(const k of equipped(s, id)){
      const d = SKILLS[k];
      if(d.where === 'field' && d.mods && d.mods[key]) b += d.mods[key];
    }
  return b;
}
/* The seated court's skills. Folded into heroBonus, so production, Valor,
   troop power and the rest pick them up wherever they are already computed. */
export function skillCourt(s, key){
  let b = 0;
  for(const id of courtActive(s))
    for(const k of equipped(s, id)){
      const d = SKILLS[k];
      if(d.where === 'court' && d.mods && d.mods[key]) b += d.mods[key];
    }
  return b;
}
/* Class-branch skills lift only that captain's own troop class. */
export function skillClass(s, heroes, troopKey){
  const list = Array.isArray(heroes) ? heroes : (heroes ? [heroes] : []);
  let b = 0;
  for(const id of list){
    const hd = HERO_POOL[id];
    if(!hd || hd.cls !== troopKey) continue;
    for(const k of equipped(s, id)){
      const d = SKILLS[k];
      if(d.mods && d.mods.cls) b += d.mods.cls;
    }
  }
  return b;
}
/* Conditional skills: `troops` is the column, `against` is 'camp' | 'beast' |
   'host' | null, `atCap` whether the column rides full. */
export function skillCond(s, heroes, troops, against, atCap){
  const list = Array.isArray(heroes) ? heroes : (heroes ? [heroes] : []);
  const kinds = Object.keys(TROOPS).filter(k => (troops[k] || 0) > 0);
  let b = 0;
  for(const id of list)
    for(const k of equipped(s, id)){
      const c = SKILLS[k].cond;
      if(!c) continue;
      if(c === 'pure'  && kinds.length === 1) b += COND_FX.pure;
      if(c === 'mixed' && kinds.length >= 3)  b += COND_FX.mixed;
      if(c === 'full'  && atCap)              b += COND_FX.full;
      if(c === against)                       b += COND_FX[c] || 0;
    }
  return b;
}

export function setSkill(s, id, slot, key, now){
  const h = s.heroes[id];
  if(!h || !HERO_POOL[id]) return false;
  const n = Number(slot);
  if(!(n >= 1 && n <= slotsOpen(s, id))) return false;
  if(key && !skillLegal(s, id, key, HERO_POOL)) return false;
  s.now = now;
  h.skills = Array.isArray(h.skills) ? h.skills.slice(0, SKILL_SLOTS) : [];
  while(h.skills.length < SKILL_SLOTS) h.skills.push(null);
  // the same skill twice would just be a doubled number, which is not a choice
  if(key) for(let i = 0; i < h.skills.length; i++) if(i !== n-1 && h.skills[i] === key) h.skills[i] = null;
  h.skills[n-1] = key || null;
  return true;
}

/* ── the arena five ──
   Who sorties with an arena attack, and who answers one. Unlike a march party
   these heroes are not away — a sortie is over in a minute — so the only rule
   is that a hero out with a column cannot also be in the line. */
export function arenaTeam(s){
  return (s.arenaTeam || []).filter(id => s.heroes[id] && HERO_POOL[id] && !heroAway(s, id)).slice(0, ARENA_HEROES);
}
export function setArenaTeam(s, id, now){
  if(!s.heroes[id] || !HERO_POOL[id]) return false;
  s.now = now;
  s.arenaTeam = s.arenaTeam || [];
  const at = s.arenaTeam.indexOf(id);
  if(at >= 0){ s.arenaTeam.splice(at, 1); return true; }
  if(heroAway(s, id)) return false;
  if(s.arenaTeam.length >= ARENA_HEROES) return false;
  s.arenaTeam.push(id);
  return true;
}
export function spoilBonus(s, key){
  let b = 0;
  for(const [id,n] of Object.entries(s.spoils||{})){
    const d = SPOILS[id];
    if(d && d.bonus[key]) b += d.bonus[key]*n;
  }
  return b;
}

/* ── derived values ── */
export function perk(s,n){ return masteryLvl(s)>=n; }
export function shieldCap(s){ return 2 + (perk(s,7)?1:0) + (perk(s,14)?1:0) + spoilBonus(s,'shieldCap'); }
export function storageCapFor(s, thLvl){
  return Math.round(800 * Math.pow(thLvl,1.7)
    * (1 + 0.03*(s.b.granary||0) + techBonus(s,'logistics') + petBonus(s,'store') + skillCourt(s,'store'))
    * (perk(s,4)?1.15:1) * (perk(s,13)?1.10:1));
}
export function storageCap(s){ return storageCapFor(s, s.b.townhall); }
/* refined goods are scarce by design: their vaults hold a fraction of the raw ones */
export function capFor(s, res){
  const m = RES_META[res];
  return Math.round(storageCap(s) * (m && m.capMult ? m.capMult : 1));
}
export function isUnlocked(s, res){
  const m = RES_META[res];
  if(!m || (!m.refined && !m.carried)) return true;
  if(m.carried) return (s.res[res] || 0) > 0 || (s.b.crucible || 0) > 0;
  return (s.b[m.from] || 0) > 0 || (s.res[res] || 0) > 0;
}
export function prodMult(s, res){
  const resKey = {food:'foodProd',wood:'woodProd',stone:'stoneProd',iron:'ironProd'}[res];
  const soft = (res==='food'||res==='wood') ? techBonus(s,'husbandry') : techBonus(s,'masonry');
  return 1 + heroBonus(s,'production') + (perk(s,1)?0.06:0) + (perk(s,8)?0.08:0) + (perk(s,11)?0.08:0)
       + (res==='food' ? 0.02*(s.b.granary||0) : 0)
       + soft + allyBonus(s,'production')
       + spoilBonus(s,resKey);
}
export function prodPerSec(s, res){
  let p = 0;
  for(const [k,d] of Object.entries(BUILDINGS)) if(d.prod===res) p += d.rate * s.b[k];
  return p * prodMult(s,res) * (isRested(s) ? 1 + REST_PROD_BONUS : 1);
}
/* ── troop tiers ── */
export function maxTier(s){ return Math.min(10, (s.b.academy||0)+1); }
export function tierOf(s,k){ return (s.tier && s.tier[k]) || 1; }
export function tierPower(s,k){ return TROOPS[k].power * (1 + TIER_POWER*(tierOf(s,k)-1)); }
export function tierUpkeep(s,k){ return TROOPS[k].upkeep * (1 + TIER_UPKEEP*(tierOf(s,k)-1)); }
export function tierCostMult(s,k){ return 1 + TIER_COST*(tierOf(s,k)-1); }
export function promoteCost(s,k){
  const d = TROOPS[k], n = Math.max(s.t[k],1), next = tierOf(s,k)+1, c = {};
  for(const [r,v] of Object.entries(d.cost)) c[r] = Math.ceil(v * (1 + TIER_COST*(next-1)) * 0.5 * n);
  c.iron = (c.iron||0) + Math.ceil(1.5 * next * n); // reforging is done in steel
  return c;
}
export function promote(s, k, now){
  s.now = now;
  const cur = tierOf(s,k);
  if(cur >= maxTier(s)) return false;
  const c = promoteCost(s,k);
  if(!canAfford(s,c)) return false;
  payCost(s,c);
  s.tier[k] = cur+1;
  scoreDeed(s, 'promoted', 1, now);
  pushLog(s, TROOPS[k].icon+' Every '+TROOPS[k].name+' is reforged to Tier '+TIERS[cur]+' — new recruits will match.', 'gold');
  return true;
}

/* ── the wounded ──
   A battle no longer just deletes soldiers. The Infirmary decides how many of
   the fallen are carried back alive, holds them up to its capacity, and healing
   them costs resources and time — so a bad defeat is a bill, not an erasure.
   (Kingshot sells healing speedups. We sell nothing, so the bill is the cost.) */
/* Where troops actually die.
   Defending your wall, burning camps, hunting beasts — the things the game asks
   you to do every day — only ever WOUND. Nobody should have to weigh "is this
   raid worth losing veterans over" about content they are meant to repeat.
   Permanent death is reserved for the one act that is genuinely yours to choose:
   marching on another player. That is where stakes belong, and it is consensual.
   The one hard limit is beds: wounded past your Infirmary's capacity die of
   their wounds, which is what makes the building matter and healing urgent. */
export function woundShare(s){ return Math.min(0.75, 0.30 + 0.045 * (s.b.hospital || 0)); }
export function woundedCap(s){
  const l = s.b.hospital || 0;
  return Math.round((30 + 40 * l * (1 + 0.08 * l)) * (1 + petBonus(s,'mend') + skillCourt(s,'mend')));
}
export function woundedTotal(s){
  return Object.values(s.wounded || {}).reduce((a,b) => a + (b||0), 0);
}
/* Every casualty in the game goes through here — raids, arena, marches, beasts.
   `pve` means nobody dies except for want of a bed. */
export function takeCasualties(s, k, n, pve){
  n = Math.max(0, Math.round(n));
  if(!n) return { dead:0, hurt:0 };
  s.t[k] = Math.max(0, (s.t[k] || 0) - n);
  s.wounded = s.wounded || {};
  const room = Math.max(0, woundedCap(s) - woundedTotal(s));
  const share = pve ? 1 : woundShare(s);
  const hurt = Math.max(0, Math.min(n, Math.round(n * share), room));
  if(hurt) s.wounded[k] = (s.wounded[k] || 0) + hurt;
  return { dead: n - hurt, hurt };
}
export function healCost(s){
  const c = {};
  for(const [k,n] of Object.entries(s.wounded || {})){
    if(!n) continue;
    for(const [r,v] of Object.entries(TROOPS[k].cost))
      c[r] = (c[r] || 0) + Math.ceil(v * 0.35 * n * tierCostMult(s,k));
  }
  return c;
}
export function healTime(s){
  const n = woundedTotal(s);
  if(!n) return 0;
  const speed = Math.max(0.3, 1 - 0.03 * (s.b.hospital || 0));
  return Math.round(Math.max(20, n * 1.4) * 1000 * speed);
}
export function startHealing(s, now){
  s.now = now;
  if(s.hq || !woundedTotal(s)) return false;
  const cost = healCost(s);
  if(!canAfford(s, cost)) return false;
  payCost(s, cost);
  s.hq = { troops: { ...s.wounded }, start: now, end: now + healTime(s) };
  s.wounded = {};
  pushLog(s, '⛑️ The Infirmary takes in '
    + Object.values(s.hq.troops).reduce((a,b)=>a+b,0)+' wounded.');
  return true;
}
export function finishHealNow(s, now){
  if(!s.hq) return false;
  const c = finishCost(s.hq.end, now);
  if(s.valor < c) return false;
  s.valor -= c; s.hq.end = now;
  return true;
}

export function upkeepPerSec(s){
  let u = 0;
  for(const k of Object.keys(TROOPS)) u += tierUpkeep(s,k) * (s.t[k]||0);
  return u * Math.max(0.5, 1 - heroBonus(s,'upkeep') - spoilBonus(s,'upkeep') - (perk(s,16)?0.08:0));
}
export function buildCost(s,k){
  const d=BUILDINGS[k], lvl=s.b[k], c={};
  const mult = Math.max(1, Math.pow(lvl, COST_EXP));
  for(const [r,v] of Object.entries(d.cost)) c[r] = Math.round(v * mult);
  // Past a threshold every building demands refined goods — the late-game gate.
  // The refineries themselves are exempt: a Runeworks gated behind runestone
  // would deadlock the very economy it exists to feed.
  if(REFINE[k]) return c;
  const next = lvl + 1;
  if(next >= STEEL_FROM) c.steel = (c.steel||0) + Math.round(10 * Math.pow(next - STEEL_FROM + 1, 1.7));
  if(next >= RUNE_FROM)  c.runestone = (c.runestone||0) + Math.round(5 * Math.pow(next - RUNE_FROM + 1, 1.6));
  return c;
}
export function buildTime(s,k){
  const spoilMult = Math.max(0.4, 1 - spoilBonus(s,'buildTime') - allyBonus(s,'buildSpeed'));
  return Math.min(buildTimeCap(s.b[k]), BUILDINGS[k].time * Math.max(1, Math.pow(s.b[k], TIME_EXP))
    * (perk(s,5)?0.88:1) * (perk(s,18)?0.9:1) * spoilMult) * 1000 * TIME_SCALE;
}

/* ── the Town Hall cannot outpace its hold ──
   Without this you could rush the keep and leave a village of huts behind it.
   Raising the Town Hall to level L needs a growing number of other buildings
   already standing at L−1 — so the whole hold climbs together. */
export function townhallNeedCount(toLvl){ return Math.min(6, 1 + Math.floor(toLvl/4)); }
export function townhallReq(s){
  const toLvl = s.b.townhall + 1;
  const need = townhallNeedCount(toLvl);
  const others = Object.keys(BUILDINGS).filter(k => k !== 'townhall');
  const ready = others.filter(k => s.b[k] >= toLvl - 1);
  // the closest candidates, so the UI can say what to raise next
  const short = others
    .filter(k => s.b[k] < toLvl - 1 && !(BUILDINGS[k].th && s.b.townhall < BUILDINGS[k].th))
    .sort((a,b) => s.b[b] - s.b[a])
    .slice(0, 4);
  return { toLvl, need, have: ready.length, ok: ready.length >= need, ready, short };
}

/* ── the build crews ── */
export const QUEUE_KEYS = ['bq', 'bq2'];
export function buildSlots(s){ return s.b.townhall >= SECOND_QUEUE_TH ? 2 : 1; }
export function freeSlot(s){
  const slots = buildSlots(s);
  for(let i = 0; i < slots; i++) if(!s[QUEUE_KEYS[i]]) return QUEUE_KEYS[i];
  return null;
}
export function activeQueues(s){
  return QUEUE_KEYS.slice(0, buildSlots(s)).filter(k => s[k]);
}
export function canAfford(s,cost){ return Object.entries(cost).every(([r,v]) => s.res[r] >= v); }
export function payCost(s,cost){ for(const [r,v] of Object.entries(cost)) s.res[r] -= v; }
export function trainMultFor(s, houseLvl){
  const b = Math.max(0, houseLvl-1);
  return Math.max(0.25,
    (1 - 0.06*b - heroBonus(s,'trainTime') - spoilBonus(s,'trainTime') - techBonus(s,'drillcraft'))
    * (perk(s,5)?0.88:1) * (perk(s,18)?0.9:1));
}
/* Each troop drills in its own building, so the queues run in parallel — four
   things training at once instead of one, the way Kingshot splits Barracks,
   Range and Stable. */
export function trainHouse(s, k){ return TROOPS[k].at; }
export function trainHouseLvl(s, k){ return s.b[TROOPS[k].at] || 0; }
export function trainMult(s, k){ return trainMultFor(s, k ? trainHouseLvl(s,k) : s.b.barracks); }
export function trainQueue(s, k){ return (s.tq && s.tq[k]) || null; }
export function activeTrainings(s){
  return Object.keys(TROOPS).filter(k => trainQueue(s, k));
}
export function armyBreakdown(s){
  let base = 0;
  for(const k of Object.keys(TROOPS)) base += tierPower(s,k) * s.t[k];
  const mult = (1 + heroBonus(s,'troopPower') + spoilBonus(s,'troopPower')
                  + techBonus(s,'warcraft') + allyBonus(s,'troopPower'))
             * (1 + (perk(s,2)?0.06:0) + (perk(s,8)?0.08:0) + (perk(s,10)?0.15:0)
                  + (perk(s,12)?0.08:0) + (perk(s,20)?0.20:0));
  const wall = (18 + techFlat(s,'fortification'))*s.b.wall + heroBonus(s,'wallPower');
  return { base, mult, wall, total: Math.round(base*mult + wall) };
}
export function armyPower(s){ return armyBreakdown(s).total; }
export function wavePower(w){ return Math.round(10*Math.pow(w,1.3) + 5*w); }
// each consecutive loss bloodies the band: it returns at 85% strength, floor ~61%
export function streakMult(s){ return Math.pow(0.85, Math.min(s.streak||0, 3)); }
export function bluntFor(s, towerLvl){ return Math.min(0.4, 0.04*towerLvl + heroBonus(s,'blunt')); }
export function bluntMult(s){ return bluntFor(s, s.b.watchtower); }
// 1 Valor buys 4 seconds of the prototype's clock — so it keeps exactly the same
// relative worth however TIME_SCALE is dialled
export function finishCost(endTs, now){ return Math.max(1, Math.ceil((endTs-now)/(4000*TIME_SCALE))); }
export function xpNeed(lvl){ return Math.round(50*Math.pow(lvl,1.4)); }
export function unlockedSlots(s){ return HERO_SLOTS.filter(sl=>sl.check(s)).length; }

/* ── events, log, rewards ── */
export function pushLog(s, txt, cls){
  s.log.unshift({t:s.now||0, txt, cls:cls||''});
  if(s.log.length > 40) s.log.length = 40;
}
export function showBanner(s, txt, cls, now){ s.banner = {txt, cls:cls||'', until:now+4000}; }
export function gainRes(s, r, amt){ s.res[r] = Math.min((s.res[r]||0)+amt, capFor(s, r)); }

/* The refineries: they run without pause, eating raw goods to make refined ones.
   This is what stops food/wood/stone/iron from ever becoming worthless. */
export function refineStep(s, dt){
  for(const [b, def] of Object.entries(REFINE)){
    const lvl = s.b[b] || 0;
    if(lvl <= 0) continue;
    let want = def.rate * lvl * dt * (1 + techBonus(s,'smelting') + petBonus(s,'refine') + (perk(s,25)?0.20:0));
    const room = capFor(s, def.out) - (s.res[def.out] || 0);
    if(room <= 0) continue;
    want = Math.min(want, room);
    // only smelt what the stores can actually feed
    for(const [r, per] of Object.entries(def.in)) want = Math.min(want, (s.res[r] || 0) / per);
    if(want <= 0) continue;
    for(const [r, per] of Object.entries(def.in)) s.res[r] -= want * per;
    s.res[def.out] = (s.res[def.out] || 0) + want;
  }
}
/* ── the daily quota ──
   Valor is the one currency that converts attention into skipped time, so it is
   the one that must not scale linearly with hours played. Earn freely up to a
   quota that grows with your hold (and doubles while Rested); past it Valor
   still comes, at a trickle. A ten-hour day still beats a one-hour day — by
   something like half again, not by tenfold. */
export function isRested(s){ return (s.rest || 0) > 0; }
export function valorQuota(s){
  const base = VALOR_QUOTA_BASE + VALOR_QUOTA_PER_TH * s.b.townhall;
  return Math.round(base * (isRested(s) ? 1 + REST_QUOTA_BONUS : 1));
}
export function dayIndex(now){ return Math.floor(now / 86400000); }
export function valorToday(s){ return s.valorDay === dayIndex(s.now || 0) ? (s.valorToday || 0) : 0; }

export function gainValor(s, v){
  const raw = v * (1 + heroBonus(s,'valor') + techBonus(s,'statecraft')
    + allyBonus(s,'valor') + (perk(s,19)?0.10:0));
  const day = dayIndex(s.now || 0);
  if(s.valorDay !== day){ s.valorDay = day; s.valorToday = 0; }
  const quota = valorQuota(s);
  const left = Math.max(0, quota - s.valorToday);
  const full = Math.min(raw, left);
  const over = raw - full;                       // past the quota it only trickles
  const got = full + over * VALOR_OVERFLOW;
  s.valorToday += raw;
  s.valor += Math.round(got);
  return got;
}

/* Rest: banked while you are away, spent while you play. It is the catch-up —
   production runs hot and the Valor quota doubles until it runs out, so coming
   back after a week away is a boost, not a hole you have to dig out of. */
export function restStep(s, dt){
  if((s.rest || 0) > 0) s.rest = Math.max(0, s.rest - dt*1000);
}
export function bankRest(s, awayMs){
  s.rest = Math.min(REST_CAP_MS, (s.rest || 0) + awayMs * 0.5);
}
export function gainShield(s, n){ s.shields = Math.min(shieldCap(s), s.shields + (n||1)); }
export function gainMastery(s, amt, now){
  const before = masteryLvl(s);
  s.mxp += amt;
  const after = masteryLvl(s);
  if(after > before){
    pushLog(s, 'Mastery rises to '+after+' — '+MASTERY[after-1].fx+'.', 'gold');
    showBanner(s, '✦ Mastery '+after+': '+MASTERY[after-1].fx, 'win', now);
  }
}
export function gainReward(s, reward){
  for(const [k,v] of Object.entries(reward)){
    if(k==='valor') gainValor(s, v);
    else if(k==='shield') gainShield(s, v);
    else gainRes(s, k, v);
  }
}

/* ── drafts: random offers, player choice, never sold ──
   The pool is filtered by the season clock, so the cast grows every fortnight.
   Note the direction of the filter: a hero is available once their season has
   *arrived* and stays available forever after. Seasons open doors here; they
   never close them, which is the whole difference between this and a shard
   shop with a countdown on it. */
export function heroSeasonOpen(s, id){
  const d = HERO_POOL[id];
  return !d ? false : (d.season || 0) <= seasonNo(s.now || Date.now());
}
export function rollHeroOffer(s, rand){
  const owned = new Set(Object.keys(s.heroes));
  const queued = new Set((s.choiceQueue||[]).flatMap(c => c.type==='hero' ? c.options : []));
  const avail = Object.keys(HERO_POOL)
    .filter(id => !owned.has(id) && !queued.has(id) && heroSeasonOpen(s, id));
  const picks = [];
  for(let i=0; i<3 && avail.length; i++){
    const weights = avail.map(id => RARITY[HERO_POOL[id].rarity].w);
    let r = rand() * weights.reduce((a,b)=>a+b, 0);
    let idx = 0;
    while(idx < weights.length-1 && r > weights[idx]){ r -= weights[idx]; idx++; }
    picks.push(avail.splice(idx,1)[0]);
  }
  return picks;
}
export function rollSpoilOffer(s, rand){
  const avail = Object.keys(SPOILS).filter(id => SPOILS[id].stack || !(s.spoils||{})[id]);
  const picks = [];
  for(let i=0; i<3 && avail.length; i++){
    const idx = Math.min(avail.length-1, Math.floor(rand()*avail.length));
    picks.push(avail.splice(idx,1)[0]);
  }
  return picks;
}
export function chooseOption(s, idx, now){
  s.now = now;
  const c = s.choice;
  if(!c || idx<0 || idx>=c.options.length) return false;
  const id = c.options[idx];
  if(c.type==='hero'){
    s.heroes[id] = {lvl:1, xp:0, stars:0, deeds:0, gear:{}, skills:[null,null,null]};
    const d = HERO_POOL[id];
    s.court = s.court || [];
    // a free chair is filled straight away so the draft never feels inert
    const seated = s.court.length < courtSeats(s);
    if(seated) s.court.push(id);
    pushLog(s, d.icon+' '+d.name+' pledges service to the hold'
      + (seated ? ' and takes a seat in your court!' : ' — no chair is free, so they await a command.'), 'gold');
    showBanner(s, d.icon+' Hero drafted: '+d.name, 'win', now);
  }else if(c.type==='pet'){
    s.pets = s.pets || {};
    s.pets[id] = { lvl:1, xp:0 };
    const d = PET_POOL[id];
    if(!s.petOut) s.petOut = id;            // the first one simply stays at your side
    pushLog(s, d.icon+' '+d.name+' has decided to stay — '+d.fx(1)+'.', 'gold');
    showBanner(s, d.icon+' A companion: '+d.name, 'win', now);
  }else{
    s.spoils[id] = (s.spoils[id]||0)+1;
    const d = SPOILS[id];
    pushLog(s, d.icon+' Spoils claimed: '+d.name+' — '+d.fx+'.', 'gold');
    showBanner(s, d.icon+' '+d.name+' claimed', 'win', now);
  }
  s.choice = null;
  return true;
}
export function rerollChoice(s, now, rand=Math.random){
  s.now = now;
  const c = s.choice;
  if(!c || c.reroll < 1 || s.valor < 5) return false;
  const fresh = c.type==='hero' ? rollHeroOffer(s, rand)
    : c.type==='pet' ? rollPetOffer(s, rand) : rollSpoilOffer(s, rand);
  if(!fresh.length) return false;
  s.valor -= 5; c.reroll--;
  c.options = fresh;
  pushLog(s, 'The offer is redrawn for 5 Valor.');
  return true;
}

/* ── player actions ── */
export function startUpgrade(s, key, now){
  s.now = now;
  const slot = freeSlot(s);
  if(!slot) return false;
  // one crew per building: no stacking two upgrades on the same structure
  if(activeQueues(s).some(q => s[q].key === key)) return false;
  const d = BUILDINGS[key], lvl = s.b[key];
  if(lvl >= d.max) return false;
  if(key!=='townhall' && lvl >= s.b.townhall) return false;
  if(key==='townhall' && !townhallReq(s).ok) return false;
  if(d.th && s.b.townhall < d.th) return false;
  const cost = buildCost(s, key);
  if(!canAfford(s, cost)) return false;
  payCost(s, cost);
  s[slot] = {key, start:now, end:now+buildTime(s,key)};
  pushLog(s, (lvl===0?'Construction of the ':'Work begins on the ')+d.name+(lvl===0?' begins.':' (level '+(lvl+1)+').'));
  return true;
}
export function trainCost(s, key, count){
  const d = TROOPS[key], c = {};
  for(const [r,v] of Object.entries(d.cost)) c[r] = Math.ceil(v * count * tierCostMult(s,key));
  return c;
}
export function startTraining(s, key, count, now){
  s.now = now;
  const d = TROOPS[key];
  if(!d) return false;
  if(!s.tq || s.tq.key) s.tq = {};              // migrate a stale single queue
  if(s.tq[key]) return false;                   // that yard is already busy
  if(trainHouseLvl(s, key) < 1) return false;   // no building, no drilling
  count = Number(count)||1;
  const cost = trainCost(s, key, count);
  if(!canAfford(s, cost)) return false;
  payCost(s, cost);
  // deliberately NOT scaled by TIME_SCALE: raids keep arriving every 75s, so the
  // muster has to answer on that cadence. Construction is the long game; the
  // army is the fast one.
  let dur = d.time*1000*count*trainMult(s, key);
  if(s.trainFastNext){ dur *= 0.25; s.trainFastNext = false; }
  s.tq[key] = {key, count, start:now, end:now+dur};
  pushLog(s, 'The '+BUILDINGS[d.at].name+' begins drilling '+count+' '+d.name+(count>1?'s':'')+'.');
  return true;
}
/* ── events ── */
export function claimEvent(s, now){
  s.now = now;
  const ready = claimableMilestones(s, now);
  if(!ready.length) return false;
  const st = eventState(s, now);
  for(const m of ready){
    st.claimed.push(m.at);
    gainReward(s, m.reward);
    gainMastery(s, 20, now);
    pushLog(s, '🏆 '+currentEvent(now).name+' — milestone '+fmt(m.at)+' claimed ('+m.txt+').', 'gold');
  }
  showBanner(s, '🏆 Event reward claimed', 'win', now);
  return true;
}

export function claimDaily(s, now){
  s.now = now;
  const st = dailyState(s, now);
  const rows = dailyProgress(s, now);
  let got = false;
  for(const t of rows){
    if(!t.done || t.claimed) continue;
    st.claimed.push(t.id);
    gainReward(s, t.reward);
    gainMastery(s, 8, now);
    pushLog(s, '📋 Daily task done — '+t.txt+'.', 'gold');
    got = true;
  }
  if(!st.bonus && rows.length && rows.every(t => st.claimed.includes(t.id))){
    st.bonus = true;
    gainReward(s, DAILY_BONUS);
    gainMastery(s, 40, now);
    pushLog(s, '📋 Every task done today — the hold is well run. +60 Valor, +1 Writ.', 'gold');
    showBanner(s, '📋 Daily slate cleared', 'win', now);
    got = true;
  }
  return got;
}

/* ── research: its own queue, so there is always something progressing ── */
export function startResearch(s, key, now){
  s.now = now;
  if(s.rq || !RESEARCH[key] || !techAvailable(s, key)) return false;
  const cost = techCost(s, key);
  if(!canAfford(s, cost)) return false;
  payCost(s, cost);
  s.rq = { key, start: now, end: now + techTime(s, key) };
  pushLog(s, '📚 The scholars take up '+RESEARCH[key].name+' '+(techLvl(s,key)+1)+'.');
  return true;
}
export function finishResearchNow(s, now){
  if(!s.rq) return false;
  const c = finishCost(s.rq.end, now);
  if(s.valor < c) return false;
  s.valor -= c; s.rq.end = now;
  return true;
}

export function finishBuildNow(s, now, slot){
  const q = slot && QUEUE_KEYS.includes(slot) ? slot : activeQueues(s)[0];
  if(!q || !s[q]) return false;
  const c = finishCost(s[q].end, now);
  if(s.valor < c) return false;
  s.valor -= c; s[q].end = now;
  return true;
}
export function finishTrainNow(s, now, key){
  const k = key && trainQueue(s, key) ? key : activeTrainings(s)[0];
  if(!k) return false;
  const q = s.tq[k];
  const c = finishCost(q.end, now);
  if(s.valor < c) return false;
  s.valor -= c; q.end = now;
  return true;
}
export const CARAVAN_GRACE = 15000, CARAVAN_YIELD = 0.5;
export function expedCdMs(s){
  return Math.max(15000, EXPEDITION_CD - (perk(s,3)?12000:0) - 1000*(s.b.tavern||0));
}
export function expedMult(s){
  return (perk(s,9)?2:1) * (1 + heroBonus(s,'patrolYield') + spoilBonus(s,'patrolYield')
    + petBonus(s,'scout') + 0.03*(s.b.tavern||0));
}
/* the standing caravan: set-and-forget half-yield runs — resources only, no
   Valor, no Mastery, no ambush. Presence stays strictly better. */
export function caravanYields(s){
  const m = expedMult(s) * CARAVAN_YIELD, th = s.b.townhall;
  if(s.caravan==='kingsroad') return {food:Math.round((20+8*th)*m), wood:Math.round((20+8*th)*m)};
  if(s.caravan==='wildwood')  return {wood:Math.round((15+5*th)*m), stone:Math.round((15+5*th)*m), iron:Math.round((6+2*th)*m)};
  if(s.caravan==='barrows')   return {food:Math.round((8+3*th)*m)};
  return null;
}
export function caravanRun(s, now){
  const y = caravanYields(s);
  if(!y) return false;
  s.now = now;
  for(const [r,v] of Object.entries(y)) gainRes(s,r,v);
  s.patrolReady = now + expedCdMs(s);
  pushLog(s, '⛺ The standing caravan returns from '+EXPEDITIONS[s.caravan].name+': '
    + Object.entries(y).map(([r,v])=>'+'+v+' '+r).join(', ')+' (half yield — dispatch by hand for the full run).');
  return true;
}
export function setCaravan(s, route, now){
  s.now = now;
  s.caravan = (s.caravan===route || !EXPEDITIONS[route]) ? null : route;
  return true;
}

export function expedition(s, route, now, rand=Math.random){
  s.now = now;
  if(now < s.patrolReady || !EXPEDITIONS[route]) return false;
  s.patrolReady = now + expedCdMs(s);
  const boost = s.expedBoost ? 2 : 1;
  const mult = expedMult(s) * boost;
  const th = s.b.townhall;
  const R = n => Math.round(n*mult);

  if(route==='kingsroad'){
    const f = R(20+8*th), w = R(20+8*th);
    gainRes(s,'food',f); gainRes(s,'wood',w); gainValor(s,3); gainMastery(s,4,now);
    pushLog(s, "🛤️ The King's Road expedition returns: +"+f+' food, +'+w+' wood, +3 Valor.', 'gold');
  }else if(route==='wildwood'){
    if(!s.expedBoost && rand() < 0.35){
      let lost = 0;
      for(const k of Object.keys(TROOPS)){
        if(s.t[k] > 0){ const l = Math.ceil(s.t[k]*0.04); s.t[k] -= l; lost += l; }
      }
      const st = R((15+5*th)/2), ir = R((6+2*th)/2);
      gainRes(s,'stone',st); gainRes(s,'iron',ir); gainValor(s,1); gainMastery(s,4,now);
      pushLog(s, '🌲 Ambush in the Wildwood! '+lost+' troops fall covering the retreat — the survivors still haul +'+st+' stone, +'+ir+' iron.', 'loss');
    }else{
      const w = R(15+5*th), st = R(15+5*th), ir = R(6+2*th);
      gainRes(s,'wood',w); gainRes(s,'stone',st); gainRes(s,'iron',ir); gainValor(s,3); gainMastery(s,4,now);
      pushLog(s, '🌲 The Wildwood expedition returns heavy: +'+w+' wood, +'+st+' stone, +'+ir+' iron, +3 Valor.', 'gold');
    }
  }else{ // barrows
    const f = R(8+3*th);
    gainRes(s,'food',f); gainValor(s,6); gainMastery(s,8,now);
    let extra = '';
    if(rand() < 0.15){ gainShield(s,1); extra = ' A sealed Writ of Peace lay among the barrow-gifts!'; }
    pushLog(s, '⚱️ The Barrow Hills expedition returns changed: +'+f+' food, +6 Valor, +8 Mastery.'+extra, 'gold');
  }
  s.expedBoost = false;
  return true;
}

export function setStance(s, stance, now){
  if(!STANCES[stance]) return false;
  s.now = now;
  s.stance = stance;
  return true;
}
export function setDefStance(s, stance, now){
  if(!STANCES[stance]) return false;
  s.now = now;
  s.defStance = stance;
  return true;
}
export function setCaptain(s, id, now){
  if(!s.heroes[id]) return false;
  if(!(s.court||[]).includes(id)) return false;   // the Captain is chosen from the court
  s.now = now;
  s.captain = (s.captain===id) ? null : id;
  return true;
}

/* ── the Forge's other job: gear ──
   One smithing queue, shared by the Regalia and every hero's kit. Crafting is
   deterministic — a tier-6 blade is a tier-6 blade — so there is nothing to
   reroll and nothing to sell rerolls of. It is gated on the Forge because Steel
   is what it eats, and Steel is the scarcest honest thing in the economy. */
export function gearTarget(s, who, slot){
  if(who === 'lord') return REGALIA[slot] ? regaliaTier(s, slot) : -1;
  return (s.heroes[who] && WARGEAR[slot]) ? wargearTier(s, who, slot) : -1;
}
export function gearBlockedBy(s, who, slot){
  if((s.b.forge || 0) < 1) return 'Light the Forge first';
  const tier = gearTarget(s, who, slot);
  if(tier < 0) return 'No such piece';
  if(tier >= GEAR_MAX) return 'Already at the finest work the Reach can do';
  if(s.gq) return 'The Forge is already at work';
  if(!canAfford(s, gearCost(tier))) return 'Not enough materials';
  return null;
}
export function startGear(s, who, slot, now){
  s.now = now;
  if(gearBlockedBy(s, who, slot)) return false;
  const tier = gearTarget(s, who, slot);
  payCost(s, gearCost(tier));
  s.gq = { who, slot, to: tier + 1, start: now, end: now + gearTime(tier) };
  const name = who === 'lord' ? REGALIA[slot].name
    : HERO_POOL[who].name.split(',')[0] + '’s ' + WARGEAR[slot].name.toLowerCase();
  pushLog(s, '🔥 The Forge takes up ' + name + ' — tier ' + (tier + 1) + '.');
  return true;
}
export function finishGearNow(s, now){
  if(!s.gq) return false;
  const c = finishCost(s.gq.end, now);
  if(s.valor < c) return false;
  s.valor -= c; s.gq.end = now;
  return true;
}
function completeGear(s, now){
  const q = s.gq;
  if(q.who === 'lord'){
    s.regalia = s.regalia || {};
    s.regalia[q.slot] = q.to;
    const d = REGALIA[q.slot];
    pushLog(s, d.icon + ' ' + d.name + ' is raised to tier ' + q.to + ' — ' + d.fx(q.to) + '.', 'gold');
    showBanner(s, d.icon + ' ' + d.name + ' · tier ' + q.to, 'win', now);
  }else{
    const h = s.heroes[q.who];
    if(h){
      h.gear = h.gear || {};
      h.gear[q.slot] = q.to;
      const d = HERO_POOL[q.who];
      pushLog(s, WARGEAR[q.slot].icon + ' ' + d.name.split(',')[0] + ' takes up new '
        + WARGEAR[q.slot].name.toLowerCase() + ' — tier ' + q.to + '.', 'gold');
    }
  }
  s.gq = null;
  gainMastery(s, 12, now);
}

/* ── formations ──
   A saved column: who leads it and how many of each troop go. Sending the same
   shaped march eight times a day is the single most repetitive thing this genre
   asks of a player, so it gets one tap. Purely a convenience — a formation can
   hold nothing you could not assemble by hand. */
export const MAX_FORMATIONS = 8;
export function saveFormation(s, name, heroes, troops, now){
  s.now = now;
  s.formations = s.formations || [];
  const clean = {
    name: String(name || 'Column').trim().slice(0, 24) || 'Column',
    heroes: (heroes||[]).filter(id => s.heroes[id] && HERO_POOL[id]).slice(0, MARCH_HEROES),
    troops: {},
  };
  for(const k of Object.keys(TROOPS)){
    const n = Math.max(0, Math.floor(troops && troops[k] || 0));
    if(n) clean.troops[k] = n;
  }
  const at = s.formations.findIndex(f => f.name === clean.name);
  if(at >= 0) s.formations[at] = clean;
  else{
    if(s.formations.length >= MAX_FORMATIONS) return false;
    s.formations.push(clean);
  }
  return true;
}
export function deleteFormation(s, name, now){
  s.now = now;
  const at = (s.formations||[]).findIndex(f => f.name === name);
  if(at < 0) return false;
  s.formations.splice(at, 1);
  return true;
}

export function freshMods(){ return {powerX:1, wallX:1, lootX:1, valorX:1, enemyX:1, noCasual:false}; }
export function getMods(s){ if(!s.mods) s.mods = freshMods(); return s.mods; }

export function useOrder(s, id, now){
  s.now = now;
  const h = s.heroes[id], d = HERO_POOL[id];
  if(!h || !d || !d.order) return false;
  if((s.orderCd[id]||0) > 0) return false;
  const m = getMods(s);
  switch(d.order.key){
    case 'rally':       m.powerX *= 1.2; break;
    case 'decree':      m.powerX *= 1.3; break;
    case 'brace':       m.wallX = 2; break;
    case 'plunder':     m.lootX *= 2; break;
    case 'tithe':       m.valorX *= 2; break;
    case 'triage':      m.noCasual = true; break;
    case 'expose':      m.enemyX *= 0.85; break;
    case 'requisition': gainRes(s,'food',60*s.b.townhall); gainRes(s,'wood',60*s.b.townhall); break;
    case 'forcedmarch': {
      const ks = activeTrainings(s);
      if(!ks.length) return false;
      for(const k of ks) s.tq[k].end = now;
      break;
    }
    case 'crashcourse': s.trainFastNext = true; break;
    case 'richtrails':  s.expedBoost = true; break;
    case 'ration':      s.upkeepPauseUntil = now + 60000; break;
    case 'stockpile':   gainRes(s,'stone',40*s.b.townhall); gainRes(s,'iron',40*s.b.townhall); break;
    case 'fairwinds':   s.marchBoost = true; break;
    case 'regrow': {
      // the frontier is worked out and there is nothing to march on — fix that
      const t = (s.world && s.world.tiles || []).filter(x => x.respawnAt);
      if(!t.length) return false;
      for(const x of t) x.respawnAt = 0;
      break;
    }
    case 'mend': {
      const n = woundedTotal(s);
      if(!n && !s.hq) return false;
      for(const [k,v] of Object.entries(s.wounded||{})) s.t[k] = (s.t[k]||0) + v;
      if(s.hq) for(const [k,v] of Object.entries(s.hq.troops)) s.t[k] = (s.t[k]||0) + v;
      s.wounded = {}; s.hq = null;
      break;
    }
    case 'recall': {
      // columns turn on the spot; those already at work drop it and ride home
      const out = (s.marches||[]).filter(x => !x.recalled);
      if(!out.length) return false;
      for(const x of out){
        const leg = x.out || 0;
        if(!x.resolved){
          const elapsed = Math.max(0, leg - Math.max(0, x.arriveAt - now));
          x.resolved = true; x.recalled = true;
          x.loot = null; x.valor = 0; x.mxp = 6;
          x.report = '↩️ Recalled before they ever arrived';
          x.homeAt = now + elapsed;
        }else{
          x.homeAt = Math.min(x.homeAt, now + leg);
        }
      }
      break;
    }
    default: return false;
  }
  s.orderCd[id] = d.order.cd;
  pushLog(s, d.icon+' '+d.name+' — '+d.order.name+': '+d.order.desc, 'gold');
  return true;
}

/* What musters against you this season. The weights come from the season's
   temper, so the correct stance — and the correct troops, and therefore the
   correct hero captains — shift every fortnight without anything you own ever
   getting weaker. This is the whole reason a deep roster is worth keeping. */
export function rollWaveType(rand, now){
  const w = temperFor(now || Date.now()).waves;
  let r = rand(), acc = 0;
  for(const [k,v] of Object.entries(w)){ acc += v; if(r < acc) return k; }
  return 'rabble';
}
export function counterMult(s){
  const wt = WAVE_TYPES[s.waveType||'rabble'];
  if(!wt.weakTo) return 1;
  if(s.stance === wt.weakTo) return COUNTER_BONUS;
  if(s.stance !== 'balanced') return COUNTER_PENALTY;
  return 1;
}
// class counter: the right troops as a share of your army add up to +15% power
export function compBonus(s){
  const wt = WAVE_TYPES[s.waveType||'rabble'];
  if(!wt.counter) return 0;
  let base = 0;
  for(const k of Object.keys(TROOPS)) base += tierPower(s,k) * s.t[k];
  if(base <= 0) return 0;
  const share = tierPower(s,wt.counter) * s.t[wt.counter] / base;
  return Math.min(0.15, 0.5*share);
}
export function raiseShield(s, now){
  s.now = now;
  if(s.shields < 1 || s.shieldUntil > now) return false;
  s.shields--;
  s.shieldUntil = now + 180000;
  s.nextWave += 180000;
  pushLog(s, 'The Writ of Peace is raised — no raid can touch the hold for 3m 0s.', 'gold');
  return true;
}

/* ── battle resolution ── */
export function resolveWave(s, now, rand=Math.random){
  const w = s.wave;
  const isWB = w % 5 === 0; // every 5th raid is an elite Warband
  const wt = WAVE_TYPES[s.waveType||'rabble'];
  const label = (isWB ? 'Warband' : 'Raid')+' '+w+' ('+wt.name+')';
  const mods = getMods(s);
  const cm = counterMult(s);
  const raw = wavePower(w) * (isWB?1.6:1) * (0.88 + rand()*0.24) * streakMult(s);
  const enemy = raw * (1-bluntMult(s)) * mods.enemyX;
  const bd = armyBreakdown(s);
  const cb = compBonus(s);
  const mine = Math.round(bd.base*bd.mult*cm*(1+cb)*mods.powerX + bd.wall*mods.wallX);
  let stanceNote = cm > 1 ? ' Your '+STANCES[s.stance].name+' broke their '+wt.name+' (+20%).'
                 : cm < 1 ? ' Your '+STANCES[s.stance].name+' was the wrong answer to '+wt.name+' (−8%).' : '';
  if(cb >= 0.08 && wt.counter) stanceNote += ' Your '+TROOPS[wt.counter].name+' line countered them (+'+Math.round(cb*100)+'%).';
  s.nextWave = now + WAVE_MS;

  if(mine >= enemy){
    // casualties scale with how close it was; a right counter-read spills less blood
    const ratio = enemy/Math.max(mine,1);
    let lossFrac = 0.30 * ratio*ratio
      * Math.max(0.15, 1 - heroBonus(s,'casualties') - 0.04*(s.b.hospital||0)
        - techBonus(s,'medicine') - (perk(s,15)?0.10:0));
    if(cm > 1) lossFrac *= COUNTER_CASUALTY;
    if(mods.noCasual) lossFrac = 0;
    let lost = 0, hurtTotal = 0;
    // the cheap line screens the expensive engines: casualties weighted by class
    for(const k of Object.keys(TROOPS)){
      const l = Math.round(s.t[k] * Math.min(0.95, lossFrac*SCREEN[k]) * (0.7+rand()*0.6));
      const r = takeCasualties(s, k, l, true);   // holding your own wall never kills
      lost += r.dead; hurtTotal += r.hurt;
    }
    const lootMult = (isWB?2:1) * (1 + heroBonus(s,'loot') + spoilBonus(s,'loot') + techBonus(s,'siegecraft')
      + allyBonus(s,'loot') + (perk(s,17)?0.15:0)) * mods.lootX;
    const base = 15*Math.pow(w,0.8);
    const loot = {food:Math.round(base*lootMult), wood:Math.round(base*lootMult),
                  stone:Math.round(0.4*base*lootMult), iron:Math.round(0.2*base*lootMult)};
    for(const [r,v] of Object.entries(loot)) gainRes(s,r,v);
    const valor = Math.round((5+Math.min(w,15)) * (isWB?2:1) * mods.valorX);
    gainValor(s, valor);
    for(const h of Object.values(s.heroes)) h.xp += (12+3*w)*(isWB?2:1);
    gainMastery(s, (8+2*w)*(isWB?2:1), now);
    s.wavesWon++; s.wave++; s.streak = 0;
    scoreDeed(s, 'waveWon', 1, now);
    if(isWB) scoreDeed(s, 'warbandWon', 1, now);
    s.winStreak = (s.winStreak||0) + 1;
    s.bestStreakWon = Math.max(s.bestStreakWon||0, s.winStreak);
    if(isWB){
      s.warbandsWon++; gainShield(s,1);
      s.choiceQueue.push({type:'spoil', options: rollSpoilOffer(s, rand), reroll:1});
    }
    pushLog(s, label+' repelled!'+stanceNote+' Loot: +'+fmt(loot.food)+' food, +'+fmt(loot.wood)+' wood, +'+fmt(loot.stone)+' stone, +'+fmt(loot.iron)+' iron. +'+valor+' Valor.'
      +(isWB?' A Writ of Peace was captured — and spoils are yours to choose.':'')+(lost?' Fallen: '+lost+'.':'')+(hurtTotal?' Wounded: '+hurtTotal+'.':''), 'win');
    showBanner(s, '⚔️ '+label+' repelled — +'+valor+' Valor'+(lost?', '+lost+' fallen':'')+(hurtTotal?', '+hurtTotal+' wounded':''), 'win', now);
  }else{
    s.streak++;
    s.winStreak = 0;
    s.wavesLost = (s.wavesLost||0)+1;
    s.nextWave = now + WAVE_MS*2; // a loss buys a longer breather
    const protect = Math.min(0.6, 0.04*(s.b.warehouse||0)); // the Warehouse hides part of your stores
    for(const k of Object.keys(TROOPS))
      takeCasualties(s, k, Math.round(s.t[k] * Math.min(0.5, 0.2*SCREEN[k])), true);
    for(const r of Object.keys(RES_META)) s.res[r] = Math.floor((s.res[r]||0)*(1 - 0.15*(1-protect)));
    gainValor(s, 2);
    gainMastery(s, 3, now);
    gainShield(s, 1);
    pushLog(s, label+' breaks through the gate and carries off part of your stores.'+stanceNote+' Your defenders bloodied them — the next assault will come weaker. +2 Valor, and a Writ of Peace is granted.', 'loss');
    showBanner(s, '🔥 '+label+' broke through — they return weaker next time', 'loss', now);
  }

  // the battle consumes orders; the next band takes shape on the horizon
  s.mods = freshMods();
  for(const id of Object.keys(s.orderCd)) if(s.orderCd[id] > 0) s.orderCd[id]--;
  s.waveType = rollWaveType(rand, s.now);
}

/* ── the simulation step: everything that happens per tick ── */
export function tick(s, now, dt, rand=Math.random){
  s.now = now;
  // tab was backgrounded a while: grant production, but don't fight unattended
  if(dt > 10){
    dt = Math.min(dt, 7200);
    if(s.nextWave < now + 5000) s.nextWave = now + 30000;
  }
  // hold the first raid while the title screen is up
  if(!s.seenIntro) s.nextWave = Math.max(s.nextWave, now + FIRST_WAVE_MS);

  for(const r of Object.keys(RES_META)) gainRes(s, r, prodPerSec(s,r)*dt);
  refineStep(s, dt);
  restStep(s, dt);

  // armies eat: upkeep drains food; an unfed muster deserts
  if(!(s.upkeepPauseUntil > now)) s.res.food -= upkeepPerSec(s)*dt;
  if(s.res.food < 0){
    s.res.food = 0;
    s.famineAcc = (s.famineAcc||0) + dt;
    if(s.famineAcc >= 10){
      s.famineAcc = 0;
      let lost = 0;
      for(const k of Object.keys(TROOPS)){
        if(s.t[k] > 0){ const l = Math.ceil(s.t[k]*0.02); s.t[k] -= l; lost += l; }
      }
      if(lost) pushLog(s, 'Famine! '+lost+' troops desert an unfed muster — raise your Farms or let raids thin the ranks.', 'loss');
    }
  } else s.famineAcc = 0;

  for(const q of QUEUE_KEYS){
    if(s[q] && now >= s[q].end){
      const wasTH = s.b.townhall;
      s.b[s[q].key]++;
      const d = BUILDINGS[s[q].key];
      pushLog(s, d.name+' complete — now level '+s.b[s[q].key]+'. +2 Valor.', 'gold');
      gainValor(s, 2); s[q] = null;
      gainMastery(s, 6, now);
      scoreDeed(s, 'built', 1, now);
      // a growing hall makes room for new ground — announce what just appeared
      if(s.b.townhall > wasTH){
        const opened = Object.entries(BUILDINGS).filter(([,b]) => b.th === s.b.townhall);
        for(const [,b] of opened){
          pushLog(s, '🏗 Ground is cleared for the '+b.name+' — '+b.fx, 'gold');
          showBanner(s, '🏗 New ground: the '+b.name, 'win', now);
        }
      }
    }
  }
  if(s.gq && now >= s.gq.end) completeGear(s, now);
  if(s.hq && now >= s.hq.end){
    let back = 0;
    for(const [k,n] of Object.entries(s.hq.troops)){ s.t[k] = (s.t[k]||0) + n; back += n; }
    pushLog(s, '⛑️ '+back+' wounded return to the muster, whole.', 'gold');
    s.hq = null;
    gainMastery(s, 12, now);
  }
  if(s.rq && now >= s.rq.end){
    const k = s.rq.key;
    s.research[k] = (s.research[k] || 0) + 1;
    const d = RESEARCH[k];
    pushLog(s, '📚 '+d.name+' '+s.research[k]+' — now +'+(s.research[k]*d.per)+(d.unit||'')+' '+d.fx+'.', 'gold');
    showBanner(s, '📚 '+d.name+' '+s.research[k], 'win', now);
    s.rq = null;
    gainMastery(s, 10, now);
    scoreDeed(s, 'research', 1, now);
  }
  if(s.tq && !Array.isArray(s.tq)){
    for(const k of Object.keys(TROOPS)){
      const q = s.tq[k];
      if(!q || now < q.end) continue;
      const n = q.count;
      s.t[k] += n;
      s.trained += n;
      s.trainedBy[k] = (s.trainedBy[k]||0) + n;
      pushLog(s, n+' '+TROOPS[k].name+(n>1?'s':'')+' join the muster.');
      s.tq[k] = null;
      gainMastery(s, n, now);
      scoreDeed(s, 'trained', n, now);
    }
  }

  if(now >= s.nextWave) resolveWave(s, now, rand);

  // quests
  const q = QUESTS[s.questIdx];
  if(q && q.check(s)){
    gainReward(s, q.reward);
    gainMastery(s, 12, now);
    pushLog(s, 'Quest complete — '+q.txt+' ('+q.rtxt+').', 'gold');
    showBanner(s, '📜 Quest complete: '+q.rtxt, 'win', now);
    s.questIdx++;
    if(s.questIdx >= QUESTS.length)
      pushLog(s, 'The charter is fulfilled. The hold — and its numbers — are yours to tune.', 'gold');
  }

  // achievements: permanent, one-time, checked quietly in the background
  for(const a of ACHIEVEMENTS){
    if(s.achieved[a.id]) continue;
    if(a.check(s)){
      s.achieved[a.id] = now;
      gainValor(s, a.valor);
      gainMastery(s, a.valor, now);
      pushLog(s, '🏅 Achievement — '+a.txt+' (+'+a.valor+' Valor).', 'gold');
      showBanner(s, '🏅 '+a.txt, 'win', now);
    }
  }

  /* Hero drafts: milestones unlock slots; each grants a choice of three.
     If the season has nobody left unclaimed, the slot is NOT spent — it waits
     for the next season to bring more names. Earning a draft you cannot use
     would be the one way this system could quietly cheat a player. */
  if(unlockedSlots(s) > (s.offersDone||0)){
    const opts = rollHeroOffer(s, rand);
    if(opts.length){
      s.offersDone = (s.offersDone||0) + 1;
      s.choiceQueue.push({type:'hero', options:opts, reroll:1});
      pushLog(s, 'Champions answer the call — choose who joins the hold.', 'gold');
    }
  }
  if(!s.choice && s.choiceQueue.length) s.choice = s.choiceQueue.shift();
  if(s.choice) s.nextWave = Math.max(s.nextWave, now + 20000); // no raid mid-draft

  // hero levels
  for(const [id,h] of Object.entries(s.heroes)){
    const d = HERO_POOL[id];
    while(h.lvl < 20 && h.xp >= xpNeed(h.lvl)){
      h.xp -= xpNeed(h.lvl); h.lvl++;
      pushLog(s, d.name+' rises to level '+h.lvl+'.', 'gold');
    }
  }

  // the standing caravan departs on its own if you leave the road idle
  if(s.caravan && now >= s.patrolReady + CARAVAN_GRACE) caravanRun(s, now);

  if(s.banner && now > s.banner.until) s.banner = null;
}
