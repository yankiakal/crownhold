// The Frontier: the world map around the hold. Tiles, marches, camp battles.
// Same contract as logic.js — pure state functions, injectable time and rng.
// tickWorld() is called from the main loop and the sim alongside logic.tick().

import { TROOPS, TIME_SCALE, HERO_POOL, BEASTS, BEAST_UNLOCK, BEAST_COUNT, BEAST_ROAM_MS,
         BEAST_RESPAWN_MS,
         MARCH_HEROES, MARCH_BASE_CAP, CAP_PER_HERO, CAP_PER_LEVEL, LOAD, seasonNo } from './defs.js';
import { ISLE_TH, VOYAGE_MS, RATION_COST, ISLE_REVEAL, ISLE_SITES,
         genIsle, cellAt, revealAround } from './isle.js';
import { scoreDeed } from './events.js';
import { takeCasualties } from './logic.js';
import {
  tierPower, heroBonus, spoilBonus, perk, wavePower, leadBonus, leadTotal, classMult, heroAway,
  coverOf, coverMult, matchupEdge, powerShares,
  effLvl, addDeeds, petBonus, gainBond, gainPetXp,
  skillTotal, skillClass, skillCond,
  gainRes, gainValor, gainShield, gainMastery, gainHeroXp, prodPerSec, pushLog, showBanner, fmt, ftime,
} from './logic.js';
/* Seafaring research reaches into the voyage: the crossing, the victuals, the ore, the losses,
   the ring charted on landing, and the rest of the haul. */
import { techBonus, techLvl } from './research.js';

/* The frontier. 15×9 with the hold at its centre — up from 11×7, which held only
   18 tiles and topped out at level 3, so the map ran out of interesting work by
   mid-game and the simulator's bot drifted to farming beasts instead.

   Whiteout Survival and Kingshot (same studio, same engine) both run a 1200×1200
   shared kingdom with resource nodes to level 8, richest toward the middle. Their
   map is that size because it has to HOLD thousands of player cities; ours holds
   nobody, so copying the dimensions would buy nothing. What is worth taking is the
   LADDER: a node level range deep enough that the map stays relevant for months.

   Their gradient is centre-outward, because the centre is contested. Ours has to be
   inverted — the hold sits at the centre, so richest-at-the-centre would put the
   best tiles on your doorstep. Here distance from home sets the level, and travel
   time is the price of richness. See tileBase(). */
export const MAP_W = 15, MAP_H = 9, CX = 7, CY = 4;
export const TILE_LVL_MAX = 8;
export const TRAVEL_MS_PER_TILE = 12000, RUIN_MS = 25000;
/* Working a node took ONE MINUTE, flat — the only activity in the game that ignored TIME_SCALE, so
   a column rode out for 36 seconds, worked for 60, and rode home. Reported as too short against
   Kingshot and Whiteout, where a node is tens of minutes to hours. Ten minutes here, which against
   the 75-second wave cadence is a real errand you set going rather than a button. */
export const GATHER_MS = 600000;
export const RESPAWN_MS = 240000;
/* The long haul: send a column out for hours and they work the node properly.
   This is the thing to set going before you close the game — the troops are
   away the whole time and cannot defend the wall, so it is a real wager. */
/* The long haul is six hours of work in one trip — the thing to set going before you close the app.
   It used to be GATHER_MS × 6 × TIME_SCALE, which was 60 minutes only because GATHER_MS was a flat
   minute; leaving that expression alone while lengthening the base would have made it ten hours. */
export const LONG_HAUL_WORK = GATHER_MS * 6;
/* Yield follows the CLOCK now (see gatherYield), so this only has to cover the difference in rate.
   Set so the long haul pays a little better per minute than shuttling — the reward for committing
   troops off the wall for an hour — rather than the 9× that predated a time-derived yield. */
export const LONG_HAUL_YIELD = 6.2;
/* How many times over a gather run beats leaving the same wall-clock to passive production. */
export const GATHER_RATIO = 2;

export const TILE_TYPES = {
  woods:    {icon:'🌲', name:'Deep Woods',  kind:'gather', res:'wood'},
  farmstead:{icon:'🌾', name:'Farmstead',   kind:'gather', res:'food'},
  quarry:   {icon:'⛰️', name:'Stone Cut',   kind:'gather', res:'stone'},
  ironvein: {icon:'⚒️', name:'Iron Vein',   kind:'gather', res:'iron'},
  camp:     {icon:'🏴', name:'Bandit Camp', kind:'camp'},
  ruin:     {icon:'🏛️', name:'Ancient Ruin',kind:'ruin'},
};

// deterministic PRNG so a save's map is stable
function mulberry32(a){
  return function(){
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/* A tile's level from where it sits: near the hold is poor and safe, the far edge
   is rich and defended. This is the map's geography — the reason a march is a
   decision rather than a button, since the good ground is the ground that costs an
   hour to reach and a column strong enough to take it.

   Kept as a pure function of position so it is stable: a worked-out tile regrows to
   its own level rather than re-rolling, or the far map would slowly flatten into
   the same porridge as the near map. */
/* What the hold must be to work a tile of this level. Taken from Whiteout Survival
   and Kingshot, where resource-node level is gated behind furnace/Town Center level
   rather than behind the strength of the column you send.

   Without it the deep map was free to a beginner: gather tiles carry no defence, so
   the only cost of a level-8 node was the walk, and the simulator's 90-minute runs
   were already hauling from level 7 and 8 — skipping the near map entirely. Camps are
   gated by the same rule for one explanation rather than two: the frontier opens as
   the hold rises. */
export function tileReq(lvl){ return lvl <= 2 ? 1 : 2*lvl - 3; }   // L1–2 open at once, then L8 at TH13
export function tileLocked(s, tile){ return (s.b.townhall || 0) < tileReq(tile.lvl); }

export function tileBase(x, y){
  /* Chebyshev, because tileDist() is Chebyshev and tileDist is what travel time is
     billed on. A Euclidean curve here would have priced richness against a distance
     the game does not actually charge for — and normalising per axis (my first
     attempt) was worse still: the map is wider than it is tall, so a tile two cells
     north read as "far" and got level 4 while a tile two cells east got level 2. */
  const d = Math.max(Math.abs(x-CX), Math.abs(y-CY));
  const t = Math.min(1, d / Math.max(CX, CY));
  return Math.max(1, Math.min(TILE_LVL_MAX, Math.round(1 + (TILE_LVL_MAX-1) * Math.pow(t, 1.35))));
}

export function genWorld(seed){
  const rng = mulberry32(seed);
  const spots = [];
  for(let y=0; y<MAP_H; y++) for(let x=0; x<MAP_W; x++){
    if(Math.abs(x-CX)<=1 && Math.abs(y-CY)<=1) continue; // keep the hold's doorstep clear
    spots.push({x,y});
  }
  const shuffle = a => { for(let i=a.length-1;i>0;i--){ const j=Math.floor(rng()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; };

  /* Placement is STRATIFIED by distance, not uniformly random. Uniform placement
     put almost nothing inside ring 3, because a ring at distance d holds ~8d cells —
     so four fifths of the map is far, and four fifths of the tiles landed there. The
     first build of this had exactly one tile below level 4, which would have left a
     new hold with nothing it could take. Quotas per band instead. */
  const band = d => d <= 3 ? 0 : d <= 5 ? 1 : 2;
  const bands = [[], [], []];
  for(const sp of shuffle(spots)) bands[band(Math.max(Math.abs(sp.x-CX), Math.abs(sp.y-CY)))].push(sp);
  const QUOTA = [10, 14, 16];                       // near / middle / far — 40 tiles
  const placed = [];
  for(let b=0; b<3; b++) placed.push(...bands[b].slice(0, QUOTA[b]));

  /* 40 tiles on 135 cells, up from 18 on 77 — denser as well as bigger, because a
     map you have to hunt across for something to do reads as empty rather than large.
     The kind list CYCLES rather than being shuffled, so every band gets a mix: a
     shuffle could have handed the near band no camps at all, and camps are where the
     early fighting is. */
  const need = { woods:9, farmstead:8, quarry:6, ironvein:5, camp:9, ruin:3 };
  const order = ['woods','camp','farmstead','quarry','ironvein','camp','farmstead','ruin'];
  const kinds = [];
  while(kinds.length < placed.length){
    let any = false;
    for(const k of order) if(need[k] > 0){ need[k]--; kinds.push(k); any = true; if(kinds.length >= placed.length) break; }
    if(!any) break;
  }

  /* Camps hold their ground with a particular kind of soldier, so the counter triangle
     applies on the frontier and not only in PvP. Without this, most of the game is PvE
     against a featureless number, and a mono army has no predator across the majority of
     play — which is how levelling power-per-load merely moved the best build from siege
     to cavalry. Now the frontier is a matchup: bring what beats what holds the ground. */
  const GARRISONS = ['spearman', 'archer', 'knight'];
  const tiles = placed.map(({x, y}, i) => {
    const base = tileBase(x, y);
    // ±1 of jitter, so two tiles the same distance out are not interchangeable
    const lvl = Math.max(1, Math.min(TILE_LVL_MAX, base + (rng() < 0.34 ? (rng() < 0.5 ? -1 : 1) : 0)));
    const type = kinds[i] || 'woods';
    const t = { x, y, type, base, lvl, respawnAt:0 };
    if(type === 'camp') t.def = GARRISONS[Math.floor(rng() * GARRISONS.length)];
    return t;
  });
  return { seed, tiles, beasts: [], roamAt: 0 };
}

/* ── beasts ──
   They wander open ground rather than sitting on a node, so the map has
   something in it that changes on its own. A hunt is a thing you have to catch. */
export function openGround(s){
  const taken = new Set(s.world.tiles.map(t => t.x+','+t.y));
  const out = [];
  for(let y=0; y<MAP_H; y++) for(let x=0; x<MAP_W; x++){
    if(Math.abs(x-CX)<=1 && Math.abs(y-CY)<=1) continue;
    if(!taken.has(x+','+y)) out.push({x,y});
  }
  return out;
}
export function beastSpecies(s){
  const th = s.b.townhall;
  return Object.keys(BEASTS).filter(k => th >= (BEAST_UNLOCK[k] || 1));
}
/* A hunted beast is never in the way of a march already out after it. */
export function beastBusy(s, i){ return (s.marches||[]).some(m => m.beast === i); }

export function spawnBeasts(s, now, rand){
  const w = s.world;
  w.beasts = w.beasts || [];
  const kinds = beastSpecies(s);
  if(!kinds.length) return;
  const ground = openGround(s).filter(g => !w.beasts.some(b => b.x===g.x && b.y===g.y));
  while(w.beasts.length < BEAST_COUNT && ground.length){
    const at = ground.splice(Math.floor(rand()*ground.length), 1)[0];
    // heavier beasts are rarer: bias the roll toward the front of the unlock list
    const roll = Math.floor(Math.pow(rand(), 1.8) * kinds.length);
    w.beasts.push({
      species: kinds[Math.min(kinds.length-1, roll)],
      x: at.x, y: at.y, lvl: 1 + Math.floor(rand()*3),
    });
  }
  w.roamAt = now + BEAST_ROAM_MS;
}
/* The herds move. A beast a column is already committed to stays put — being
   led on a wild chase by the interface is not the kind of difficulty anyone wants. */
export function roamBeasts(s, now, rand){
  const w = s.world;
  if(!w.beasts) return;
  const ground = openGround(s);
  w.beasts.forEach((b, i) => {
    if(beastBusy(s, i)) return;
    const near = ground.filter(g => Math.abs(g.x-b.x) <= 2 && Math.abs(g.y-b.y) <= 2
      && !w.beasts.some(o => o !== b && o.x===g.x && o.y===g.y));
    if(!near.length) return;
    const to = near[Math.floor(rand()*near.length)];
    b.x = to.x; b.y = to.y;
  });
  w.roamAt = now + BEAST_ROAM_MS;
}

/* ── how hard the frontier is ──
   Measured against a COLUMN, not against the raid clock. Camps and beasts used
   to scale on wavePower(s.wave), which grows without bound — while a column is
   hard-capped by its leaders' levels at a couple of hundred troops. The result
   was that from around wave 20 the entire frontier quietly became unbeatable,
   and nothing in the game said so.

   The anchor is now a reference column: how many troops your three best captains
   could command, times what a soldier of your current tier is worth. Both terms
   are bounded — capacity tops out at 198, tiers at ten — so difficulty converges
   while stars, gear and class affinity keep adding column power on top. That is
   what makes the late frontier feel earned rather than endless, and it rises in
   steps you can see coming instead of drifting up with the raid counter.

   Note it uses your best three heroes whether or not they are free: if this read
   availability, camp strength would lurch about every time a column rode out. */
export const REF_K = 0.93;
export function topLeaders(s, n = MARCH_HEROES){
  return Object.keys(s.heroes)
    .filter(id => HERO_POOL[id])
    .sort((a,b) => (effLvl(s,b) - effLvl(s,a)) || (a < b ? -1 : 1))
    .slice(0, n);
}
export function refPower(s){
  return REF_K * marchCapacity(s, topLeaders(s)) * tierPower(s, 'spearman');
}
export function beastPower(s, b){
  const d = BEASTS[b.species];
  if(!d) return 1;
  return Math.round(refPower(s) * d.power * (0.5 + 0.25*b.lvl));
}

export function tileDist(t){ return Math.max(Math.abs(t.x-CX), Math.abs(t.y-CY)); }
/* Columns used to carry a single `hero`; they now carry a party of three.
   Old saves and in-flight marches are read through here. */
export function marchParty(m){ return m.heroes || (m.hero ? [m.hero] : []); }
/* The Command Center is what lets you field more columns at once, and move them
   faster — march capacity is its whole job. */
/* Columns you can have on the road at once. The second one used to wait for Town Hall 10 — 39
   hours of build queue — so the entire early game was send one column, then watch it. It arrives at
   6 now, and the Command Center grants another every FOUR levels rather than five, so the curve
   from there is denser too. */
export function marchSlots(s){
  return 1 + Math.floor((s.b.command || 0) / 4) + (s.b.townhall >= 6 ? 1 : 0)
           + (s.b.townhall >= 14 ? 1 : 0)   // and a third, where TH10's used to be the second
           + techLvl(s, 'relays');          // Relay Posts: one more column per level, two levels
}
export function marchSpeed(s){
  // Roadwork shortens every march on top of the Command Center, floored so it never nears zero
  return Math.max(0.5, 1 - 0.02 * (s.b.command || 0)) * Math.max(0.6, 1 - techBonus(s, 'roadwork'));
}
export function tileBusy(s, idx){ return (s.marches||[]).some(m => m.tile===idx); }

/* A column's strength: the hold's standing bonuses, plus what its three leaders
   are worth. Troops are counted class by class, so a hero's affinity lifts only
   the soldiers they actually know how to handle. */
/* Note that SKILLS MULTIPLY rather than joining the additive pool. A skill that
   says "+12% column power" has to deliver exactly 12%, or the label is a lie —
   and added into a bracket that already holds hero, spoil and lead bonuses, +0.12
   came out as +9.7%. Everything a skill claims is applied on its own factor so
   the number in the tooltip is the number you get. */
export function marchPower(s, troops, heroes, against, enemy){
  /* A column in the field has no wall to stand behind, so its line is whatever it brought.
     This is what makes a spearman worth training: without one, the archers and engines
     behind him fight at a fraction of their worth. */
  const cover = coverOf(troops, 0);
  let p = 0;
  for(const k of Object.keys(TROOPS))
    p += tierPower(s,k) * (troops[k]||0) * classMult(s, heroes, k) * coverMult(k, cover);
  /* What holds the ground decides part of the fight. `enemy` is a troop kind (a camp's
     garrison) or a share map (another hold's army). */
  if(enemy){
    const theirs = typeof enemy === 'string' ? { [enemy]: 1 } : enemy;
    p *= 1 + matchupEdge(powerShares(s, troops), theirs);
  }
  const total = Object.values(troops).reduce((a,b)=>a+(b||0), 0);
  const atCap = total > 0 && columnLoad(troops) >= marchCapacity(s, heroes);
  return Math.round(p
    * (1 + heroBonus(s,'troopPower') + spoilBonus(s,'troopPower') + leadTotal(s, heroes, 'power'))
    * (1 + (perk(s,2)?0.06:0) + (perk(s,8)?0.08:0) + (perk(s,10)?0.15:0)
         + (perk(s,12)?0.08:0) + (perk(s,20)?0.20:0))
    * (1 + skillTotal(s, heroes, 'power') + skillCond(s, heroes, troops, against || null, atCap)));
}
/* Can this hero take a column out right now? */
export function heroCanLead(s, id){
  return !!(s.heroes[id] && HERO_POOL[id] && !heroAway(s, id));
}
/* How many soldiers this party of leaders can actually command. Slots are given
   by the Command Center; the capacity to fill them is earned hero by hero. */
export function marchCapacity(s, heroes){
  const list = (Array.isArray(heroes) ? heroes : (heroes ? [heroes] : []))
    .filter(id => s.heroes[id] && HERO_POOL[id]).slice(0, MARCH_HEROES);
  let cap = MARCH_BASE_CAP + skillTotal(s, list, 'cap');
  for(const id of list) cap += CAP_PER_HERO + CAP_PER_LEVEL * effLvl(s, id);
  /* Baggage multiplies the WHOLE column, captains included. Applied to MARCH_BASE_CAP alone — the
     obvious first placement — it moved a real column from 225 to 227, because almost all of the
     capacity comes from the three leaders that are added afterwards. */
  cap *= (1 + techBonus(s, 'baggage'));
  return Math.max(1, Math.round(cap));
}
/* The strongest available party, highest level first — used to preview capacity
   and by the sim's bot. Ties break on id so the pick is deterministic. */
export function bestLeaders(s, n = MARCH_HEROES){
  return Object.keys(s.heroes)
    .filter(id => HERO_POOL[id] && heroCanLead(s, id))
    .sort((a,b) => (s.heroes[b].lvl - s.heroes[a].lvl) || (a < b ? -1 : 1))
    .slice(0, n);
}
export function campPower(s, tile){
  return Math.round(refPower(s) * (0.55 + 0.3*tile.lvl));
}
/* Yield rises faster than linearly in the tile's level, because the cost of a far
   tile is not just its defence — it is the travel time, which is linear in distance.
   A level-8 node pays about 6× a level-1 one, against roughly 3× the round trip. */
export function gatherYield(s, tile){
  const th = s.b.townhall;
  /* ── gathering has to beat standing still, and by a lot ──
     Measured against passive production at Town Hall 3: a gather run paid ×0.58 of what the Farm
     made on its own, ×0.66 the Quarry, ×0.76 the Lumberyard. An ACTIVE mechanic — send a column,
     wait, bring it home, with those troops off the wall the whole time — was worth less per minute
     than doing nothing.

     And production is worth more than "nothing" suggests, because it RUNS WHILE YOU ARE OFFLINE.
     applyOffline grants it in full. So production is the floor you get for free, and gathering is
     paid for in attention on top of that — it has to clear the floor by a margin or the frontier is
     a worse use of a minute than closing the app.

     So the yield is now anchored to the resource's OWN production rate: a run is worth a fixed
     number of minutes of it, which makes the ratio uniform by construction rather than something
     that drifts with progression. It used to climb from ×0.58 at Town Hall 3 to ×1.73 at 25 — wrong
     at both ends and wrong differently. The per-resource weights follow the production rates
     (food 2.0, wood 1.6, stone 1.0, iron 0.7) for the same reason: weighting food lowest while the
     Farm produced the most is what made food the worst thing to go and fetch. */
  const res = TILE_TYPES[tile.type].res;
  const perMin = prodPerSec(s, res) * 60;
  /* Anchored to the ROUND TRIP, not to a fixed number of minutes. The yield is worth GATHER_RATIO
     times what the same wall-clock would have produced for free — so the ratio holds by construction
     whatever the travel distance or the work time, and lengthening either one pays for itself
     automatically. The earlier version assumed a 2.2-minute trip, which stopped being true the
     moment the work time changed. */
  const trip = (2 * tileDist(tile) * TRAVEL_MS_PER_TILE * marchSpeed(s) + GATHER_MS) / 60000;
  // deeper tiles are worth more, and they cost more travel to reach — the two pay for each other
  const depth = 0.62 + 0.13 * tile.lvl;
  const base = perMin * trip * GATHER_RATIO * depth;
  /* A floor for a hold whose production building is still at zero, so a node is never worthless —
     the Iron Vein before an Iron Mine exists is the case that matters. */
  const floor = (34 + 10 * Math.pow(tile.lvl, 1.36)) * th
              * {wood:1, food:1.25, stone:0.62, iron:0.44}[res];
  return Math.round(Math.max(base, floor) * (1 + techBonus(s, 'foraging')));
}

/* Trim a requested column to what is actually available and commandable:
   never more of a troop than you own, never more in total than the leaders can
   hold. Trimming is proportional, so the mix the player chose is preserved. */
/* What a column of these troops weighs. A siege engine takes four soldiers' worth of a
   captain's attention and the road's width; a spearman takes one. */
export function columnLoad(troops){
  let load = 0;
  for(const k of Object.keys(TROOPS)) load += ((troops && troops[k]) || 0) * (LOAD[k] || 1);
  return load;
}

export function fitColumn(s, want, heroes){
  const cap = marchCapacity(s, heroes);
  const troops = {};
  let total = 0, load = 0;
  for(const k of Object.keys(TROOPS)){
    const n = Math.max(0, Math.min(Math.floor(want[k]||0), s.t[k]||0));
    if(n > 0){ troops[k] = n; total += n; load += n * (LOAD[k] || 1); }
  }
  /* Trimmed against LOAD rather than headcount. Trimming by bodies is what let a column
     carry 225 ballistae for the price of 225 spearmen, at 6.5× the power. */
  if(load > cap){
    const scale = cap / load;
    total = 0; load = 0;
    for(const k of Object.keys(troops)){
      const n = Math.floor(troops[k] * scale);
      if(n > 0){ troops[k] = n; total += n; load += n * (LOAD[k] || 1); } else delete troops[k];
    }
  }
  return { troops, total, load, cap };
}

/* Hunt a beast. Shares everything with startMarch except the target: a beast is
   a moving point on open ground rather than an index into the tile list. */
export function startHunt(s, bi, want, now, heroes){
  s.now = now;
  const b = (s.world.beasts || [])[bi];
  if(!b || beastBusy(s, bi)) return false;
  if((s.marches||[]).length >= marchSlots(s)) return false;
  const party = (Array.isArray(heroes) ? heroes : (heroes ? [heroes] : []))
    .filter(Boolean).slice(0, MARCH_HEROES);
  if(new Set(party).size !== party.length) return false;
  if(party.some(id => !heroCanLead(s, id))) return false;
  const { troops, total } = fitColumn(s, want, party);
  if(total === 0) return false;
  for(const [k,n] of Object.entries(troops)) s.t[k] -= n;
  const travel = Math.round(tileDist(b)*TRAVEL_MS_PER_TILE*marchSpeed(s)
    * Math.max(0.4, 1 - leadTotal(s, party, 'speed') - petBonus(s, 'speed') - heroBonus(s, 'speed')));
  s.marches.push({
    beast: bi, troops, heroes: party, out: travel,
    arriveAt: now+travel, homeAt: now+travel+travel,
    resolved:false,
  });
  for(const id of party){
    if(!s.court) break;
    const at = s.court.indexOf(id);
    if(at >= 0) s.court.splice(at, 1);
    if(s.captain === id) s.captain = null;
  }
  const d = BEASTS[b.species];
  pushLog(s, '🏹 '+total+' troops go out after the '+d.name
    + (party.length ? ', under '+party.map(id => HERO_POOL[id].name.split(',')[0]).join(', ') : '')
    + ' ('+ftime(travel)+' out).');
  return true;
}

export function startMarch(s, idx, want, now, longHaul, heroes){
  s.now = now;
  const tile = s.world.tiles[idx];
  if(!tile || tile.respawnAt || tileBusy(s, idx)) return false;
  if(tileLocked(s, tile)) return false;              // the hold is not ready for this ground
  if((s.marches||[]).length >= marchSlots(s)) return false;
  const party = (Array.isArray(heroes) ? heroes : (heroes ? [heroes] : []))
    .filter(Boolean).slice(0, MARCH_HEROES);
  if(new Set(party).size !== party.length) return false;      // no hero rides twice
  if(party.some(id => !heroCanLead(s, id))) return false;
  const kind = TILE_TYPES[tile.type].kind;
  const long = !!longHaul && kind === 'gather';   // only nodes can be worked for hours
  const { troops, total, cap } = fitColumn(s, want, party);
  /* ── how much of the node this column can actually carry away ──
     Reported from play: "gathering nodes should be collected based on troops sent — if I send a full
     march or 1/4 march it doesn't change anything." Exactly so: the haul was computed from the tile
     and a bonus multiplier and never once looked at the troops, so three soldiers stripped a node as
     thoroughly as three hundred.

     Recorded as a FRACTION of the column's own capacity rather than an absolute carrying weight,
     because the two do not scale together: a node's yield is 14.7× a full column's load at Town Hall
     3 and 51× at Town Hall 25, so any fixed carry-per-soldier is either useless early or free late.
     A fraction is stage-independent and needs no constant to tune.

     Stored at DEPARTURE because the captains that set the capacity leave with the column, so it
     cannot be recomputed honestly on the way home. */
  /* Measured against what the HOLD could carry, not against this column's own capacity. Dividing by
     `cap` meant adding a captain raised the denominator while the troops stayed put, so a second
     leader dropped the haul from 100% to 62% — reported with screenshots, and a straight regression:
     bringing more help made you worse off. The denominator is the best party available, so a captain
     can only ever raise the ceiling you are filling toward. */
  const best = marchCapacity(s, bestLeaders(s, MARCH_HEROES));
  const fill = best > 0 ? Math.min(1, columnLoad(troops) / best) : 1;
  if(total === 0) return false;
  for(const [k,n] of Object.entries(troops)) s.t[k] -= n;
  const travel = Math.round(tileDist(tile)*TRAVEL_MS_PER_TILE*marchSpeed(s)
    * Math.max(0.4, (1 - leadTotal(s, party, 'speed')) * (1 - skillTotal(s, party, 'speed'))
                    * (1 - heroBonus(s, 'speed'))));
  const work = kind==='gather' ? (long ? LONG_HAUL_WORK : GATHER_MS) : kind==='ruin' ? RUIN_MS : 0;
  const boost = !!s.marchBoost;                   // Fair Winds, spent on this column
  s.marchBoost = false;
  s.marches.push({
    tile:idx, troops, long, heroes: party, boost, out: travel, fill,
    arriveAt: now+travel, homeAt: now+travel+work+travel,
    resolved:false,
  });
  // seated heroes who ride out give their chairs up — someone else can fill them
  for(const id of party){
    if(!s.court) break;
    const at = s.court.indexOf(id);
    if(at >= 0) s.court.splice(at, 1);
    if(s.captain === id) s.captain = null;
  }
  pushLog(s, '🚩 '+total+' troops march on the '+TILE_TYPES[tile.type].name
    + (party.length ? ', under '+party.map(id => HERO_POOL[id].icon+' '+HERO_POOL[id].name.split(',')[0]).join(', ') : '')
    + (long ? ' to work it through the night ('+ftime(travel+work+travel)+' round trip).'
            : ' ('+ftime(travel)+' out).'));
  return true;
}

/* The hunt. A beast never kills — it wounds — so the wager is the column's time
   and the wall standing thinner while they are out, not the veterans themselves. */
function resolveHunt(s, m, now, rand){
  m.resolved = true;
  const party = marchParty(m);
  const b = (s.world.beasts || [])[m.beast];
  if(!b){                                  // it moved on or was already taken
    m.loot = null; m.valor = 0; m.mxp = 4;
    m.report = '🏹 The trail went cold';
    return;
  }
  const d = BEASTS[b.species];
  const haul = (1 + leadTotal(s, party, 'haul') + petBonus(s, 'haul')) * (1 + skillTotal(s, party, 'haul'));
  const guard = Math.max(0.25, (1 - leadTotal(s, party, 'guard')) * (1 - skillTotal(s, party, 'guard')));
  const enemy = beastPower(s, b) * (0.9 + rand()*0.2);
  const mine = Math.round(marchPower(s, m.troops, party, 'beast') * (1 + petBonus(s, 'hunt')));
  m.woundedBack = {};
  if(mine >= enemy){
    const ratio = enemy/Math.max(mine,1);
    const lf = 0.22*ratio*ratio*guard * Math.max(0.5, 1 - techBonus(s, 'outriders'));
    for(const k of Object.keys(m.troops)){
      const l = Math.round(m.troops[k]*lf);
      m.troops[k] = Math.max(0, m.troops[k]-l);
      m.woundedBack[k] = (m.woundedBack[k]||0) + l;
    }
    const L = Math.round(enemy * 0.55 * haul);
    m.loot = {food:Math.round(L*0.55), wood:Math.round(L*0.2), iron:Math.round(L*0.12)};
    m.valor = d.valor + 4*b.lvl;
    m.mxp = d.mxp + 8*b.lvl;
    m.bond = d.pet * b.lvl;                // the hunt is the only road to a companion
    m.report = d.icon+' The '+d.name+' is brought down ('+mine+' vs '+Math.round(enemy)+')';
    s.beastsSlain = (s.beastsSlain||0) + 1;
    scoreDeed(s, 'beast', 1, now);
    s.world.beasts.splice(m.beast, 1);
    s.world.spawnAt = now + BEAST_RESPAWN_MS;   // the herds wander back in their own time
    // indices shift when one is removed — keep every other hunt pointed correctly
    for(const o of s.marches) if(o !== m && o.beast > m.beast) o.beast--;
    m.beast = -1;
  }else{
    const keep = 1 - 0.30*guard;
    for(const k of Object.keys(m.troops)){
      const l = m.troops[k] - Math.floor(m.troops[k]*keep);
      m.troops[k] = Math.floor(m.troops[k]*keep);
      m.woundedBack[k] = (m.woundedBack[k]||0) + l;
    }
    m.loot = null; m.valor = 3; m.mxp = 10; m.bond = Math.ceil(d.pet/2);
    m.report = d.icon+' The '+d.name+' drove them off ('+mine+' vs '+Math.round(enemy)+')';
    m.homeAt = now + (m.out || 0);
  }
}

function resolveArrival(s, m, now, rand){
  if(m.beast != null) return resolveHunt(s, m, now, rand);
  const tile = s.world.tiles[m.tile];
  const tt = TILE_TYPES[tile.type];
  m.resolved = true;
  const party = marchParty(m);
  /* heroBonus carries the DECREES, and Forced March's whole bargain is speed against haul. Neither
     half was read: `speed` and `haul` were consulted through leadTotal, skillTotal and petBonus only,
     so a decree costing 40 Valor changed nothing at all in either direction. */
  const haul = (1 + leadTotal(s, party, 'haul') + petBonus(s, 'haul') + heroBonus(s, 'haul')
                  + (m.boost ? 0.5 : 0))
    * (1 + skillTotal(s, party, 'haul'));
  const guard = Math.max(0.25, (1 - leadTotal(s, party, 'guard')) * (1 - skillTotal(s, party, 'guard')));
  if(tt.kind==='camp'){
    const enemy = campPower(s, tile) * (0.88 + rand()*0.24);
    const mine = marchPower(s, m.troops, party, 'camp', tile.def);
    if(mine >= enemy){
      const ratio = enemy/Math.max(mine,1);
      const lf = 0.25*ratio*ratio*guard * Math.max(0.5, 1 - techBonus(s, 'outriders'));
      // the fallen from a march are counted when the column gets home
      m.hurt = 0;
      for(const k of Object.keys(m.troops)){
        const l = Math.round(m.troops[k]*lf);
        m.troops[k] = Math.max(0, m.troops[k]-l);
        m.woundedBack = m.woundedBack || {};
        m.woundedBack[k] = (m.woundedBack[k]||0) + l;
      }
      const L = Math.round(enemy*1.1*haul);
      m.loot = {food:Math.round(L*0.4), wood:Math.round(L*0.4), stone:Math.round(L*0.15), iron:Math.round(L*0.08)};
      m.valor = 10+5*tile.lvl; m.mxp = 20+10*tile.lvl;
      m.report = '⚔️ The camp is burned ('+mine+' vs '+Math.round(enemy)+')';
      s.campsBurned = (s.campsBurned||0) + 1;
      scoreDeed(s, 'camp', 1, now);
      tile.respawnAt = now + RESPAWN_MS;
    }else{
      m.woundedBack = {};
      const keep = 1 - 0.35*guard;
      for(const k of Object.keys(m.troops)){
        const l = m.troops[k] - Math.floor(m.troops[k]*keep);
        m.troops[k] = Math.floor(m.troops[k]*keep);
        m.woundedBack[k] = (m.woundedBack[k]||0) + l;
      }
      m.loot = null; m.valor = 2; m.mxp = 8;
      m.report = '🔥 The camp held ('+mine+' vs '+Math.round(enemy)+') — the survivors fall back';
      m.homeAt = now + (m.out || tileDist(tile)*TRAVEL_MS_PER_TILE);
    }
  }else if(tt.kind==='gather'){
    /* `m.fill ?? 1` keeps marches already on the road when this shipped paying out in full rather
       than being silently short-changed mid-journey. */
    const mult = (m.long ? LONG_HAUL_YIELD : 1) * haul * (m.fill == null ? 1 : m.fill);
    m.loot = {[tt.res]: Math.round(gatherYield(s, tile) * mult)};
    m.valor = m.long ? 8 : 0; m.mxp = m.long ? 30 : 6;
    m.report = m.long ? '⛏ The '+tt.name+' is stripped to the bedrock' : '⛏ The '+tt.name+' is worked clean';
    scoreDeed(s, m.long ? 'longHaul' : 'gathered', 1, now);
    tile.respawnAt = now + RESPAWN_MS;
  }else{ // ruin
    m.loot = {food: Math.round(10*tile.lvl*s.b.townhall*haul*(m.fill == null ? 1 : m.fill))};
    m.valor = 12; m.mxp = 20+8*tile.lvl;
    m.writ = rand() < 0.20;
    m.report = '🏛️ The ruin gives up its secrets';
    s.ruinsRaided = (s.ruinsRaided||0) + 1;
    scoreDeed(s, 'ruin', 1, now);
    tile.respawnAt = now + RESPAWN_MS;
  }
}

/* rand reaches here because the pet offer needs it. It was added to the gainBond
   call below in v1.31 without being added to this signature — the line lives in
   resolveReturn, and I had read a grep of line numbers and assumed it was inside
   resolveArrival, which does take rand. Every completed beast hunt threw a
   ReferenceError from then on. */
function resolveReturn(s, m, now, rand){
  let home = 0;
  for(const [k,n] of Object.entries(m.troops)){ s.t[k] += n; home += n; }
  // losses on the road are settled here, so the Infirmary can take its share
  let dead = 0, hurt = 0;
  for(const [k,n] of Object.entries(m.woundedBack || {})){
    s.t[k] = (s.t[k]||0) + n;                    // put them back, then count them properly
    const r = takeCasualties(s, k, n, true);   // the frontier wounds, it does not kill
    dead += r.dead; hurt += r.hurt;
  }
  const party = marchParty(m).filter(id => HERO_POOL[id]);
  let txt = m.report+'. '+home+' return'
    + (party.length ? ' under '+party.map(id => HERO_POOL[id].name.split(',')[0]).join(', ') : '')
    + (dead||hurt ? ' ('+dead+' fell'+(hurt?', '+hurt+' wounded':'')+')' : '');
  if(m.loot){
    for(const [r,v] of Object.entries(m.loot)) gainRes(s, r, v);
    txt += ' with '+Object.entries(m.loot).map(([r,v])=>'+'+fmt(v)+' '+r).join(', ');
  }
  const v = Math.round((m.valor||0)
    * (1 + leadTotal(s, party, 'valor')) * (1 + skillTotal(s, party, 'valor')));
  if(v){ gainValor(s, v); txt += ', +'+v+' Valor'; }
  if(m.mxp) gainMastery(s, Math.round(m.mxp
    * (1 + leadTotal(s, party, 'lore')) * (1 + skillTotal(s, party, 'lore'))), now);
  // heroes who actually rode learn more than those who sat at the table
  for(const id of party) gainHeroXp(s, id, 40 + (m.long ? 120 : 0));
  // and the ride itself counts toward their next star
  addDeeds(s, party, m.long ? 'longHaul' : (m.report||'').startsWith('⚔️') ? 'camp' : 'march', now);
  // the hunt is what brings companions in, and what teaches the one at your side
  if(m.bond){ gainBond(s, m.bond, now, rand); gainPetXp(s, m.bond); }
  if(m.writ){ gainShield(s, 1); txt += ', and a sealed Writ of Peace'; }
  pushLog(s, txt+'.', m.loot ? 'win' : 'loss');
  showBanner(s, '🚩 March returned — '+m.report.toLowerCase(), m.loot?'win':'loss', now);
}

export function tickWorld(s, now, rand=Math.random){
  if(!s.world) return;
  for(const m of s.marches){
    if(!m.resolved && now >= m.arriveAt) resolveArrival(s, m, now, rand);
  }
  for(let i = s.marches.length-1; i >= 0; i--){
    if(s.marches[i].resolved && now >= s.marches[i].homeAt){
      resolveReturn(s, s.marches[i], now, rand);
      s.marches.splice(i,1);
    }
  }
  // the ship, and the tide that redraws the chart each season
  isleSeasonCheck(s, now);
  voyageStep(s, now, rand);
  // the herds: restock on a cadence, and move what is not being hunted
  if(!s.world.beasts || (s.world.beasts.length < BEAST_COUNT && now >= (s.world.spawnAt || 0)))
    spawnBeasts(s, now, rand);
  if(now >= (s.world.roamAt || 0)) roamBeasts(s, now, rand);
  /* Worked-out tiles regrow to what that GROUND is worth, not to a fresh roll.
     Re-rolling 1–3 everywhere used to quietly flatten the map: every rich far tile
     became a poor one the first time it was worked, so the ladder existed only
     until you climbed it once. */
  for(const t of s.world.tiles){
    if(t.respawnAt && now >= t.respawnAt){
      t.respawnAt = 0;
      const base = t.base || tileBase(t.x, t.y);
      t.base = base;
      t.lvl = Math.max(1, Math.min(TILE_LVL_MAX, base + (rand() < 0.34 ? (rand() < 0.5 ? -1 : 1) : 0)));
    }
  }
}

/* ── the Salt Isle ──
   Lives here rather than in logic.js because a voyage needs marchPower,
   marchCapacity and refPower, and logic.js importing this file back would make a
   cycle. The Isle is a map; maps live in world.js.

   One voyage at a time, hours long, no recall. What it costs is Rations and the
   column; what it brings home is Isle Ore, which nothing else can produce. The
   site resolves on RETURN, not on departure, so a voyage is a wager rather than
   a purchase. */
export function isleReady(s){ return (s.b.townhall || 0) >= ISLE_TH; }
export function rationCost(s){
  // the Victualler makes sailing cheaper as it grows: a full one halves the cost,
  // and Victualling research takes another fifth off on top
  return Math.round(RATION_COST * Math.max(0.5, 1 - 0.02 * (s.b.kitchen || 0))
                                * Math.max(0.5, 1 - techBonus(s, 'victualling')));
}
export function voyageTime(s){
  // the Command Center runs the shipping too, so a well-found ship crosses faster,
  // and Cartography shortens the crossing again — floored so it can never approach zero
  return Math.round(VOYAGE_MS * Math.max(0.55, 1 - 0.015 * (s.b.command || 0))
                              * Math.max(0.6, 1 - techBonus(s, 'cartography')));
}
export function voyageBlockedBy(s, x, y){
  if(!isleReady(s)) return 'The charts mean nothing until Town Hall ' + ISLE_TH;
  if(!s.isle) return 'No chart yet';
  if(s.isle.voyage) return 'Your ship is already at sea';
  const c = cellAt(s.isle, Number(x), Number(y));
  if(!c) return 'Nothing there';
  if(!c.known) return 'That water is not charted';
  if(c.spent) return 'Already stripped — the Isle refills when the season turns';
  if((s.res.rations || 0) < rationCost(s)) return 'Not enough Rations to victual her';
  return null;
}
/* A voyage is capped like a march: the same three captains, the same hulls. */
export function fitIsleColumn(s, want, heroes){ return fitColumn(s, want, heroes); }

export function startVoyage(s, x, y, want, heroes, now){
  s.now = now;
  if(voyageBlockedBy(s, x, y)) return false;
  const party = (Array.isArray(heroes) ? heroes : (heroes ? [heroes] : []))
    .filter(Boolean).slice(0, MARCH_HEROES);
  if(new Set(party).size !== party.length) return false;
  if(party.some(id => !heroCanLead(s, id))) return false;
  const { troops, total } = fitIsleColumn(s, want, party);
  if(!total) return false;
  s.res.rations -= rationCost(s);
  for(const [k,n] of Object.entries(troops)) s.t[k] -= n;
  for(const id of party){
    const at = (s.court || []).indexOf(id);
    if(at >= 0) s.court.splice(at, 1);
    if(s.captain === id) s.captain = null;
  }
  s.isle.voyage = { x:Number(x), y:Number(y), troops, heroes:party, end: now + voyageTime(s) };
  const c = cellAt(s.isle, Number(x), Number(y));
  pushLog(s, '⛵ The ship stands out for the '+ISLE_SITES[c.site].name
    + ' with '+total+' aboard — back in '+ftime(voyageTime(s))+'.', 'gold');
  return true;
}

export function voyageStep(s, now, rand = Math.random){
  const v = s.isle && s.isle.voyage;
  if(!v || now < v.end) return;
  const c = cellAt(s.isle, v.x, v.y);
  const d = c && ISLE_SITES[c.site];
  s.isle.voyage = null;
  // the column always comes home; the Isle wounds, like every other PvE place
  for(const [k,n] of Object.entries(v.troops)) s.t[k] = (s.t[k] || 0) + n;
  if(!d) return;
  const party = (v.heroes || []).filter(id => HERO_POOL[id]);
  const power = marchPower(s, v.troops, party, 'host');
  const against = Math.round(refPower(s) * d.fight * (0.7 + 0.3 * c.tier));
  const won = d.fight === 0 || power >= against;
  let hurt = 0;
  if(d.fight > 0){
    const ratio = against / Math.max(power, 1);
    const lf = Math.min(0.4, (won ? 0.10 : 0.30) * ratio)
             * Math.max(0.4, 1 - techBonus(s, 'seamanship'));
    for(const k of Object.keys(v.troops)){
      const l = Math.round(v.troops[k] * lf);
      if(l > 0){ const r = takeCasualties(s, k, l, true); hurt += r.hurt + r.dead; }
    }
  }
  if(won){
    const [lo, hi] = d.ore;
    const ore = Math.round((lo + rand() * (hi - lo)) * c.tier
                           * (1 + techBonus(s, 'prospecting')));
    gainRes(s, 'isleore', ore);
    const bits = ['+' + ore + ' Isle Ore'];
    for(const [r, amt] of Object.entries(d.res || {})){
      const got = Math.round(amt * (0.6 + 0.4 * c.tier) * (1 + techBonus(s, 'salvage')));
      gainRes(s, r, got); bits.push('+' + fmt(got) + ' ' + r);
    }
    if(d.valor){ gainValor(s, d.valor * c.tier); bits.push('+' + (d.valor * c.tier) + ' Valor'); }
    if(d.mxp) gainMastery(s, d.mxp * c.tier, now);
    if(d.writ){ gainShield(s, 1); bits.push('a Writ of Peace'); }
    addDeeds(s, party, 'longHaul', now);
    for(const id of party) gainHeroXp(s, id, 160);
    c.spent = true;
    const found = revealAround(s.isle, v.x, v.y, ISLE_REVEAL + techLvl(s, 'spyglass'));
    s.isle.sailed = (s.isle.sailed || 0) + 1;
    pushLog(s, '⛵ '+d.icon+' '+d.name+' gives up '+bits.join(', ')
      + (hurt ? ' ('+hurt+' wounded)' : '')
      + (found.length ? '. The crew charts '+found.length+' more of the coast.' : '.'), 'gold');
    showBanner(s, '⛵ Home from the '+d.name, 'win', now);
  }else{
    gainValor(s, 15); gainMastery(s, 60, now);
    pushLog(s, '⛵ '+d.icon+' The '+d.name+' threw them off ('+fmt(power)+' against '+fmt(against)
      + '). The ship comes home light'+(hurt ? ', '+hurt+' wounded' : '')+'.', 'loss');
    showBanner(s, '⛵ Driven off the '+d.name, 'loss', now);
  }
}

/* The Isle refills when the season turns, and is redrawn — new water, new wrecks.
   What you learned about the old chart is spent with it, which is what keeps the
   Isle a fortnightly expedition rather than a map you finish once. */
export function isleSeasonCheck(s, now){
  if(!s.isle) return;
  const season = seasonNo(now);
  if(s.isle.season === season) return;
  const sailed = s.isle.sailed || 0;
  s.isle = genIsle(s.isle.seed, season);
  if(sailed) pushLog(s, '⛵ The tides turn and the Salt Isle is another island — '
    + 'new water, new wrecks, and the old chart worth nothing.', 'gold');
}
