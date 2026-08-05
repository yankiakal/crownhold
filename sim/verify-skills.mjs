// Verification for hero skills. Run from the repo root:  npm run verify
//
// It does not check that the module loads — it checks that every skill
// MEASURABLY changes the number it claims to. This project's failure mode has
// been systems that quietly did nothing (the frontier was unwinnable for two
// commits and the only symptom was an absence in the data), so each skill is
// equipped in isolation and the relevant figure compared before and after.
// The last block is the important one: it fails the run and NAMES any skill
// that moves no number anywhere.

import * as D from '../src/defs.js';
import * as L from '../src/logic.js';
import * as W from '../src/world.js';
import * as A from '../src/actions.js';
import * as SK from '../src/skills.js';
import * as AR from '../src/arena.js';
import { freshState } from '../src/state.js';

let pass = 0, fail = 0;
const ok = (name, cond, note='') => { cond ? pass++ : fail++;
  console.log((cond ? '  ✓ ' : '  ✗ ') + name + (note ? '  — ' + note : '')); };
const near = (a, b, tol=0.02) => Math.abs(a-b) <= Math.abs(b)*tol + 1e-9;

function hold(){
  const now = Date.now();
  const s = freshState(now, 42);
  s.b.townhall = 20; s.b.command = 30; s.b.academy = 9; s.b.hospital = 10;
  s.b.barracks = 10; s.b.range = 8; s.b.stable = 8; s.b.siegeyard = 8;
  s.b.farm = 25; s.b.granary = 10; s.b.forge = 10;
  s.tier = { spearman:5, archer:5, knight:5, ballista:5 };
  s.res = { food:9e5, wood:9e5, stone:9e5, iron:9e5, steel:9e5, runestone:9e5 };
  for(const id of ['marshal','gatekeeper','forager','steward'])
    s.heroes[id] = { lvl:20, xp:0, stars:3, deeds:0, gear:{}, skills:[null,null,null] };
  s.court = ['gatekeeper'];
  s.arenaTeam = ['marshal','gatekeeper','forager','steward'];
  s.t = { spearman:400, archer:200, knight:120, ballista:60 };
  s.now = now;
  return s;
}
const equip = (s, id, key) => { s.heroes[id].skills = [key, null, null]; };

console.log('\n── the cast has the classes these tests assume ──');
for(const [id, cls] of Object.entries({ marshal:'knight', gatekeeper:'spearman', forager:'archer', steward:'ballista' }))
  ok(id + ' is a ' + cls + ' captain', D.HERO_POOL[id].cls === cls, 'got ' + D.HERO_POOL[id].cls);

console.log('\n── slots open on investment, and an unopened slot is dead ──');
{
  const s = hold();
  s.heroes.marshal = { lvl:1, xp:0, stars:0, deeted:0, deeds:0, gear:{}, skills:[] };
  ok('level 1, 0 stars → 1 slot', SK.slotsOpen(s,'marshal') === 1, String(SK.slotsOpen(s,'marshal')));
  s.heroes.marshal.lvl = 10;
  ok('level 10 → 2 slots', SK.slotsOpen(s,'marshal') === 2, String(SK.slotsOpen(s,'marshal')));
  s.heroes.marshal.stars = 3;
  ok('level 10 + 3 stars → 3 slots', SK.slotsOpen(s,'marshal') === 3, String(SK.slotsOpen(s,'marshal')));
  s.heroes.marshal.lvl = 1; s.heroes.marshal.stars = 0;
  s.heroes.marshal.skills = [null, 'hardMarch', null];
  ok('a skill in an unopened slot contributes nothing', L.skillTotal(s, ['marshal'], 'power') === 0);
}

console.log('\n── legality: class branches exclusive, universals open ──');
{
  const s = hold();
  ok('knight captain may take Lance Charge', SK.skillLegal(s,'marshal','lanceCharge', D.HERO_POOL));
  ok('knight captain may NOT take Massed Volley', !SK.skillLegal(s,'marshal','massedVolley', D.HERO_POOL));
  ok('archer captain may take Massed Volley', SK.skillLegal(s,'forager','massedVolley', D.HERO_POOL));
  ok('every captain may take Hard March',
    ['marshal','gatekeeper','forager','steward'].every(id => SK.skillLegal(s,id,'hardMarch', D.HERO_POOL)));
  const n = SK.legalSkills(s,'marshal', D.HERO_POOL).length;
  ok('a captain has a wide legal set (>15)', n > 15, n + ' of ' + Object.keys(SK.SKILLS).length);
  ok('legal sets differ by class',
    SK.legalSkills(s,'marshal',D.HERO_POOL).join() !== SK.legalSkills(s,'forager',D.HERO_POOL).join());
}

console.log('\n── the action refuses what it should ──');
{
  const s = hold(), now = s.now;
  ok('sets a legal skill', A.applyAction(s,'skill',{mode:'marshal',n:'1',key:'hardMarch'},now) === true);
  ok('refuses an out-of-class skill', A.applyAction(s,'skill',{mode:'marshal',n:'1',key:'massedVolley'},now) === false);
  ok('refuses an unopened slot', A.applyAction(s,'skill',{mode:'marshal',n:'9',key:'hardMarch'},now) === false);
  A.applyAction(s,'skill',{mode:'marshal',n:'2',key:'hardMarch'},now);
  const dup = s.heroes.marshal.skills.filter(x => x === 'hardMarch').length;
  ok('the same skill cannot fill two slots', dup === 1, 'found ' + dup);
  ok('a slot can be emptied', A.applyAction(s,'skill',{mode:'marshal',n:'2',key:''},now) === true
    && s.heroes.marshal.skills[1] === null);
}

console.log('\n── field skills move the column by what they claim ──');
{
  const party = ['marshal','gatekeeper','forager'];
  const troops = { spearman:60, archer:40, knight:30, ballista:10 };
  const b0 = W.marchPower(hold(), troops, party);
  const withSkill = key => { const s = hold(); equip(s,'marshal',key); return W.marchPower(s, troops, party); };

  ok('Hard March  +12% power', near(withSkill('hardMarch')/b0, 1.12), (withSkill('hardMarch')/b0).toFixed(3));
  ok('Light Packs −10% power', near(withSkill('lightPack')/b0, 0.90), (withSkill('lightPack')/b0).toFixed(3));
  ok('Tight Column +14% power', near(withSkill('tightColumn')/b0, 1.14), (withSkill('tightColumn')/b0).toFixed(3));

  const cap0 = W.marchCapacity(hold(), party);
  let s = hold(); equip(s,'marshal','longTrain');
  ok('Long Train +22 capacity', W.marchCapacity(s,party) === cap0 + 22, cap0 + ' → ' + W.marchCapacity(s,party));
  s = hold(); equip(s,'marshal','tightColumn');
  ok('Tight Column −18 capacity', W.marchCapacity(s,party) === cap0 - 18, cap0 + ' → ' + W.marchCapacity(s,party));

  const knights = { knight:50 }, spears = { spearman:50 };
  const k0 = W.marchPower(hold(), knights, ['marshal']);
  const sp0 = W.marchPower(hold(), spears, ['marshal']);
  s = hold(); equip(s,'marshal','lanceCharge');
  ok('Lance Charge +30% to knights', near(W.marchPower(s,knights,['marshal'])/k0, 1.30, 0.03),
     (W.marchPower(s,knights,['marshal'])/k0).toFixed(3));
  ok('Lance Charge leaves spearmen untouched', W.marchPower(s,spears,['marshal']) === sp0);
}

console.log('\n── conditional skills fire only on their condition ──');
{
  const party = ['marshal'];
  const pure = { knight:40 }, mixed = { spearman:20, archer:20, knight:20 };
  const purePlain = W.marchPower(hold(), pure, party);
  const mixedPlain = W.marchPower(hold(), mixed, party);

  let s = hold(); equip(s,'marshal','onePurpose');
  ok('One Purpose pays on one class', near(W.marchPower(s,pure,party)/purePlain, 1.30, 0.03));
  ok('One Purpose pays nothing when mixed', W.marchPower(s,mixed,party) === mixedPlain);

  s = hold(); equip(s,'marshal','mixedArms');
  ok('Mixed Arms pays on three classes', near(W.marchPower(s,mixed,party)/mixedPlain, 1.18, 0.03));
  ok('Mixed Arms pays nothing on one class', W.marchPower(s,pure,party) === purePlain);

  s = hold(); equip(s,'marshal','campBreaker');
  ok('Camp-Breaker pays vs camps', near(W.marchPower(s,mixed,party,'camp')/mixedPlain, 1.35, 0.03));
  ok('Camp-Breaker pays nothing vs beasts', W.marchPower(s,mixed,party,'beast') === mixedPlain);

  s = hold(); equip(s,'marshal','beastBane');
  ok('Beast-Bane pays vs beasts', near(W.marchPower(s,mixed,party,'beast')/mixedPlain, 1.35, 0.03));

  s = hold(); equip(s,'marshal','fullMuster');
  const full = W.fitColumn(s, { spearman:9999 }, party).troops;
  ok('Full Muster pays at capacity',
     near(W.marchPower(s,full,party)/W.marchPower(hold(),full,party), 1.15, 0.03));
  ok('Full Muster pays nothing below capacity',
     W.marchPower(s,{spearman:5},party) === W.marchPower(hold(),{spearman:5},party));
}

console.log('\n── court skills move the hold, and only while seated ──');
{
  const prod0 = L.prodMult(hold(),'food'), store0 = L.storageCap(hold());
  const beds0 = L.woundedCap(hold()), train0 = L.trainMult(hold());

  let s = hold(); equip(s,'gatekeeper','stewardship');
  ok('Stewardship +7% production', near(L.prodMult(s,'food') - prod0, 0.07, 0.05),
     (L.prodMult(s,'food') - prod0).toFixed(4));
  s = hold(); equip(s,'gatekeeper','vaultwright');
  ok('Vaultwright raises storage', L.storageCap(s) > store0, store0 + ' → ' + L.storageCap(s));
  s = hold(); equip(s,'gatekeeper','physician');
  ok('Physician adds beds', L.woundedCap(s) > beds0, beds0 + ' → ' + L.woundedCap(s));
  s = hold(); equip(s,'gatekeeper','drillyard');
  ok('Drillyard shortens training', L.trainMult(s) < train0,
     train0.toFixed(3) + ' → ' + L.trainMult(s).toFixed(3));

  s = hold(); s.court = []; equip(s,'gatekeeper','stewardship');
  ok('an UNSEATED captain\'s court skill does nothing', near(L.prodMult(s,'food'), prod0, 0.001));

  s = hold(); equip(s,'gatekeeper','stewardship');
  ok('a court skill does not touch column power',
     W.marchPower(s,{spearman:50},['gatekeeper']) === W.marchPower(hold(),{spearman:50},['gatekeeper']));
  s = hold(); equip(s,'gatekeeper','hardMarch');
  ok('a field skill does not touch production', near(L.prodMult(s,'food'), prod0, 0.001));
}

console.log('\n── the Arena reads skills too ──');
{
  let s = hold(); s.arenaTeam = ['marshal'];
  const d0 = AR.defensePower(s);
  s = hold(); s.arenaTeam = ['marshal']; equip(s,'marshal','lanceCharge');
  ok('a class skill lifts arena defence', AR.defensePower(s) > d0, d0 + ' → ' + AR.defensePower(s));

  s = hold(); s.arenaTeam = ['marshal']; equip(s,'marshal','hostBreaker');
  const troops = AR.committedTroops(s, 1);
  const f1 = AR.forcePower(s, troops, ['marshal']).mult;
  const f0 = AR.forcePower(hold(), troops, ['marshal']).mult;
  ok('Host-Breaker lifts a sortie', f1 > f0, f0.toFixed(3) + ' → ' + f1.toFixed(3));
}

console.log('\n── NOTHING is inert (the test that matters) ──');
{
  const party = ['marshal'];
  /* A condition-gated skill has to be tested on a column where its condition
     CAN hold — checking One Purpose against a four-class column proves nothing
     and reads as inert. Each skill is probed against several shapes. */
  const shapes = [
    { spearman:30, archer:20, knight:20, ballista:10 },   // mixed, below capacity
    { knight:40 },                                        // single class
    { spearman:9999 },                                    // trimmed to full capacity
  ];
  const inert = [];
  for(const key of Object.keys(SK.SKILLS)){
    const d = SK.SKILLS[key];
    if(d.where === 'court') continue;
    if(!SK.skillLegal(hold(),'marshal',key, D.HERO_POOL)) continue;
    const s = hold(); equip(s,'marshal',key); const base = hold();
    const moved = shapes.some(shape => {
      const t = W.fitColumn(s, shape, party).troops;
      return ['', 'camp', 'beast', 'host'].some(a =>
        W.marchPower(s,t,party,a||null) !== W.marchPower(base,t,party,a||null));
    })
      || W.marchCapacity(s,party) !== W.marchCapacity(base,party)
      || ['haul','guard','speed','valor','lore'].some(k => L.skillTotal(s,party,k) !== 0);
    if(!moved) inert.push(key);
  }
  ok('no field skill is inert', inert.length === 0, inert.join(', ') || 'all fire');

  const courtInert = [];
  for(const key of Object.keys(SK.SKILLS)){
    const d = SK.SKILLS[key];
    if(d.where !== 'court') continue;
    const s = hold(); equip(s,'gatekeeper',key);
    let moved = Object.keys(d.mods || {}).some(k => L.heroBonus(s,k) !== L.heroBonus(hold(),k));
    if(!moved) moved = L.storageCap(s) !== L.storageCap(hold()) || L.woundedCap(s) !== L.woundedCap(hold());
    if(!moved) courtInert.push(key);
  }
  ok('no court skill is inert', courtInert.length === 0, courtInert.join(', ') || 'all fire');

  // class-locked skills, each checked on its own captain
  const classInert = [];
  for(const key of Object.keys(SK.SKILLS)){
    const d = SK.SKILLS[key];
    if(!d.cls) continue;
    const who = Object.keys(D.HERO_POOL).find(id => D.HERO_POOL[id].cls === d.cls
      && ['marshal','gatekeeper','forager','steward'].includes(id));
    if(!who) continue;
    const only = { [d.cls]: 50 };
    const s = hold(); equip(s,who,key);
    const moved = W.marchPower(s,only,[who]) !== W.marchPower(hold(),only,[who])
      || ['haul','guard','speed'].some(k => L.skillTotal(s,[who],k) !== 0);
    if(!moved) classInert.push(key);
  }
  ok('no class-branch skill is inert', classInert.length === 0, classInert.join(', ') || 'all fire');
}

console.log('\n── a pre-skills save is inert, not broken ──');
{
  const s = hold();
  s.heroes.marshal = { lvl:20, xp:0, stars:3, deeds:0, gear:{} };   // no skills array at all
  ok('missing skills array is safe',
     L.skillTotal(s,['marshal'],'power') === 0 && SK.equipped(s,'marshal').length === 0);
}



/* ── class coverage: the figure on screen is the figure that fights ──
   The march builder prints classLift() as "+N% led". That label is only true if
   it is the same number marchPower multiplies by, so these tests measure it out
   of marchPower rather than trusting the expression. Ratios between two columns
   of equal size cancel every outer factor (hero bonuses, lead traits, perks,
   at-cap conditionals), leaving exactly the per-class term. */
{
  console.log('\n── the coverage figure matches what marchPower fights with ──');
  const s = hold();
  const party = ['marshal','gatekeeper','forager'];         // knight, spearman, archer
  // N is large on purpose: marchPower returns a rounded integer, and at N=20 the
  // half-point of rounding is a tenth of a percent of the figure under test —
  // enough to make a correct label look wrong. Tolerance is absolute for the same
  // reason: this compares a difference of ratios, where a relative bound is noise.
  const N = 5000;
  const powerOf = k => W.marchPower(s, { [k]: N }, party);
  for(const k of Object.keys(D.TROOPS)){
    const claimed = L.classLift(s, party, k);
    // measured: strip the flat per-soldier power out, compare against a class
    // nobody in the party covers (ballista here), whose lift is exactly 0.
    const bare = powerOf('ballista') / (L.tierPower(s,'ballista') * N);
    const mine = powerOf(k) / (L.tierPower(s,k) * N);
    const measured = mine/bare - 1;
    ok(k + ': label ' + (claimed*100).toFixed(2) + '% = measured ' + (measured*100).toFixed(2) + '%',
       Math.abs(measured - claimed) < 1e-3);
  }
  ok('an uncovered class lifts by exactly nothing', L.classLift(s, party, 'ballista') === 0);

  /* The multiplier is the primitive; the label is derived. Combat must keep
     evaluating the exact product it always did, so that a change made for the
     UI's benefit cannot reach the battle maths. */
  {
    const s3 = hold();
    equip(s3, 'steward', 'siegeTrain');                     // both terms non-zero
    const a = L.affinity(s3, ['steward'], 'ballista'), sk = L.skillClass(s3, ['steward'], 'ballista');
    ok('classMult is bit-identical to the product combat used before',
       L.classMult(s3, ['steward'], 'ballista') === (1 + a) * (1 + sk));
    ok('classLift is exactly classMult − 1',
       L.classLift(s3, ['steward'], 'ballista') === L.classMult(s3, ['steward'], 'ballista') - 1);
  }

  console.log('\n── three captains cannot cover four classes ──');
  ok('there are more troop types than march seats', D.MARCH_HEROES < Object.keys(D.TROOPS).length);
  const covered = p => Object.keys(D.TROOPS).filter(k => L.classLift(s, p, k) > 0).length;
  ok('one of each of three classes covers 3/4', covered(party) === 3, String(covered(party)));
  ok('a party of one covers 1/4', covered(['marshal']) === 1, String(covered(['marshal'])));
  ok('no leaders covers 0/4', covered([]) === 0, String(covered([])));
  s.heroes.steward.skills = ['siegeTrain', null, null];      // ballista captain's class skill
  ok('a ballista captain cannot be a 4th cover for a 3-seat party',
     covered(['marshal','gatekeeper','forager','steward'].slice(0, D.MARCH_HEROES)) === D.MARCH_HEROES);

  console.log('\n── affinity and class skills compose, they do not add ──');
  {
    const s2 = hold();
    const aff = L.affinity(s2, ['steward'], 'ballista');
    equip(s2, 'steward', 'siegeTrain');
    const sk = L.skillClass(s2, ['steward'], 'ballista');
    const lift = L.classLift(s2, ['steward'], 'ballista');
    ok('both terms are actually present', aff > 0 && sk > 0, 'aff ' + aff.toFixed(3) + ', skill ' + sk.toFixed(3));
    ok('lift = (1+aff)(1+skill)−1, not aff+skill',
       near(lift, (1+aff)*(1+sk)-1, 1e-9) && !near(lift, aff+sk, 1e-9),
       'composed ' + lift.toFixed(4) + ' vs summed ' + (aff+sk).toFixed(4));
    // and the composed figure is what the column is actually paid
    const bare = W.marchPower(s2, { ballista: 10 }, []) / 10;
    const led  = W.marchPower(s2, { ballista: 10 }, ['steward']) / 10;
    ok('a column of that class is paid the composed figure', led > bare,
       (bare).toFixed(1) + ' → ' + (led).toFixed(1) + ' per ballista');
  }
}

/* ── the frontier ladder ──
   The map went from 18 tiles at levels 1–3 to 40 at levels 1–8, with level gated
   behind Town Hall the way Whiteout Survival and Kingshot gate resource nodes behind
   furnace level. Two things have to hold or the deepening is a mirage: the near map
   must stay usable by a beginner, and the deep map must actually be reachable rather
   than decorative. */
{
  console.log('\n── the frontier is a ladder, open at the bottom ──');
  const s = hold();
  ok('the map is 40 tiles on ' + (W.MAP_W*W.MAP_H) + ' cells', s.world.tiles.length === 40,
     String(s.world.tiles.length));
  const lv = s.world.tiles.map(t => t.lvl);
  ok('levels span the whole range', Math.min(...lv) <= 2 && Math.max(...lv) >= 7,
     'L' + Math.min(...lv) + '–L' + Math.max(...lv));

  /* Richness must track TRAVEL distance, since travel is what it costs. tileDist is
     Chebyshev, so tileBase has to be too — a Euclidean curve priced richness against
     a distance the game never charges for. */
  let monotone = true;
  for(let d = 1; d < Math.max(W.CX, W.CY); d++)
    if(W.tileBase(W.CX + d, W.CY) > W.tileBase(W.CX + d + 1, W.CY)) monotone = false;
  ok('level rises with distance from the hold', monotone,
     [1,2,3,4,5,6,7].map(d => 'd'+d+'→L'+W.tileBase(W.CX+d, W.CY)).join(' '));

  /* A brand-new hold must have work. The first build of this had exactly one tile
     below level 4 — uniform placement puts four fifths of the tiles in the outer
     rings, because a ring at distance d holds ~8d cells. */
  const fresh = freshState(Date.now(), 42);
  const open = fresh.world.tiles.filter(t => !W.tileLocked(fresh, t));
  ok('a Town Hall 1 hold has real work waiting', open.length >= 5, open.length + ' of 40 tiles open');
  const nearCamps = fresh.world.tiles.filter(t => t.type === 'camp' && W.tileDist(t) <= 3);
  ok('and camps within reach to fight', nearCamps.length >= 2, nearCamps.length + ' near camps');

  /* The gate must be total: every level reachable at some Town Hall, and the top of
     the map reachable before the Town Hall runs out of levels. */
  ok('level 8 unlocks at Town Hall ' + W.tileReq(W.TILE_LVL_MAX),
     W.tileReq(W.TILE_LVL_MAX) <= D.BUILDINGS.townhall.max,
     'TH max is ' + D.BUILDINGS.townhall.max);
  /* Strictly rising from L3 up. L1 and L2 deliberately share Town Hall 1: gating the
     second tier behind TH3 left a brand-new hold just TWO workable tiles out of forty,
     which is not an opening, it is a wait. */
  ok('the first two tiers are open immediately', W.tileReq(1) === 1 && W.tileReq(2) === 1);
  let ladder = true;
  for(let l = 4; l <= W.TILE_LVL_MAX; l++) if(W.tileReq(l) <= W.tileReq(l-1)) ladder = false;
  ok('every tier above the second needs a higher hold than the last', ladder,
     [1,2,3,4,5,6,7,8].map(l => 'L'+l+'→TH'+W.tileReq(l)).join(' '));

  // and the gate is actually enforced, not merely advertised
  const deep = fresh.world.tiles.find(t => t.lvl >= 6);
  if(deep){
    const idx = fresh.world.tiles.indexOf(deep);
    fresh.b.townhall = 1;
    ok('a locked tile refuses the march',
       W.startMarch(fresh, idx, { spearman: 5 }, Date.now(), false, []) === false);
  } else ok('a deep tile exists to test the gate with', false, 'none found');

  /* Worked-out ground regrows to what that GROUND is worth. Re-rolling 1–3 flattened
     the far map the first time it was touched. */
  const t0 = s.world.tiles.find(t => t.lvl >= 5);
  if(t0){
    t0.respawnAt = 1; const wasBase = t0.base;
    W.tickWorld(s, 2, () => 0.9);
    ok('a rich tile regrows rich', t0.lvl >= wasBase - 1, 'base ' + wasBase + ' → L' + t0.lvl);
  } else ok('a rich tile exists to regrow', false, 'none');
}

/* ── a march completes end to end ──
   v1.31 threaded `rand` into a gainBond() call that lives in resolveReturn(), a
   function with no rand parameter — so EVERY completed beast hunt threw a
   ReferenceError, in the browser as well as the simulator, for three versions. The
   simulator caught it immediately and I did not see it: I was grepping `npm run
   check` output for "passed" and "FAILED", and an uncaught exception in the sim step
   matches neither. The verify suites printed their green lines, the sim died after
   them, and I read the green.

   So the fix is not only the argument. It is a test that exercises the full
   arrival→return path and FAILS rather than requiring someone to read a stack trace
   in a log they filtered. */
{
  console.log('\n── a march runs from muster to homecoming ──');
  const s = hold();
  s.b.command = 30;
  const fixed = () => 0.5;
  W.spawnBeasts(s, s.now, fixed);
  const beasts = (s.world.beasts || []).length;
  ok('a herd is on the map', beasts > 0, beasts + ' beasts');

  let threw = null, slain = 0;
  try {
    const party = ['marshal','gatekeeper','forager'];
    const troops = { spearman: 60, archer: 40, knight: 30, ballista: 10 };
    const started = W.startHunt(s, 0, troops, s.now, party);   // (s, bi, want, now, heroes)
    ok('the hunt sets out', started !== false);
    // run the clock past arrival and all the way home
    for(let t = 1; t <= 3600; t++){
      const ms = s.now + t * 1000;
      L.tick(s, ms, 1, fixed);
      W.tickWorld(s, ms, fixed);
      if(!s.marches.length) break;
    }
    slain = s.beastsSlain || 0;
  } catch(e){ threw = e; }

  ok('nothing threw between muster and homecoming', !threw,
     threw ? threw.constructor.name + ': ' + threw.message : 'clean');
  ok('the column came home', s.marches.length === 0, s.marches.length + ' still out');
  ok('the beast was accounted for', slain > 0, String(slain));
  ok('and the hunt produced bond toward a companion', (s.bond || 0) > 0 || !!(s.choiceQueue||[]).length,
     'bond ' + (s.bond || 0));
}

/* ── every roll obeys the injected rng ──
   gainBond() called Math.random() directly, so the pet offer was the one roll the
   simulator could not control. Pets carry bonuses, so a different companion moved
   army power, which moved the bot's commitment threshold, which moved the entire
   run: two sim runs of IDENTICAL code disagreed by two Town Hall levels. That made
   the simulator useless for telling a real balance change from noise — the worst
   possible failure in the one tool that is supposed to catch balance changes.
   An injection point that silently isn't used is this project's oldest bug, so it
   gets a test rather than a comment. */
{
  console.log('\n── the simulator can control every roll ──');
  const fixed = () => 0;                       // always picks the first option
  const draw = seed => {
    const s = hold();
    s.pets = {}; s.bond = 0; s.choiceQueue = [];
    L.gainBond(s, 1e6, s.now, seed);
    const c = (s.choiceQueue || []).find(x => x.type === 'pet');
    return c ? c.options.join(',') : '';
  };
  ok('a pet offer is actually made', draw(fixed).length > 0, draw(fixed) || 'none');
  ok('the same rng gives the same offer twice', draw(fixed) === draw(fixed));
  // a different rng must give a different offer — otherwise the rng is ignored
  // and the test above would pass just as happily on the broken version.
  let differs = false;
  for(const r of [() => 0.99, () => 0.5, () => 0.25])
    if(draw(r) !== draw(fixed)) differs = true;
  ok('a different rng gives a different offer (the rng is really used)', differs,
     'fixed→' + draw(fixed) + '  vs  0.99→' + draw(() => 0.99));
}

/* ── the four rules of hold-against-hold ──
   Asserted on the pure resolution, not only over HTTP, because these four are the
   whole difference between this and the game it is modelled on. Whiteout Survival does
   not sell power to attackers; it sells RELIEF TO VICTIMS, bought in a panic in the ten
   minutes after someone burned your city. Each rule removes a reason to panic. */
{
  console.log('\n── raids: nobody dies, and only stores move ──');
  const R = await import('../src/raid.js');
  const mk = (troops, opts = {}) => {
    const s = hold();
    s.t = { spearman:0, archer:0, knight:0, ballista:0, ...troops };
    s.b.hospital = opts.hospital == null ? 0 : opts.hospital;   // NO infirmary on purpose
    s.b.warehouse = opts.warehouse || 0;
    s.b.wall = opts.wall == null ? 6 : opts.wall;
    s.res = { food:40000, wood:40000, stone:20000, iron:9000,
              steel:5000, runestone:800, rations:300, trueore:5, truegold:2 };
    return s;
  };

  const att = mk({ spearman: 400 }), def = mk({ spearman: 60 });
  att.name = 'Attacker'; def.name = 'Defender';
  const col = { troops: { spearman: 300 }, base: 0, mult: 2 };
  for(const [k, n] of Object.entries(col.troops)) col.base += L.tierPower(att, k) * n;
  const troopsBefore = def.t.spearman;
  const resBefore = { ...def.res };
  const out = R.resolveRaid(att, def, col, def.now, () => 0.5);
  ok('the attack landed', out.won === true, out.mine + ' vs ' + out.theirs);

  /* RULE 1, and the one that matters most: the defender has NO Infirmary at all, and
     still buries nobody. takeCasualties caps the wounded at the beds available and kills
     the overflow — right for the Unpaid, and exactly WoS's funnel when the attacker is a
     person. A raid against a hospital-less hold killed 21 of 120 before this was fixed. */
  const wounded = Object.values(def.wounded || {}).reduce((a, b) => a + b, 0);
  ok('every casualty is a wound, with no Infirmary at all',
     troopsBefore - def.t.spearman === wounded,
     troopsBefore + ' → ' + def.t.spearman + ', ' + wounded + ' wounded, beds for ' + L.woundedCap(def));
  /* Tested directly rather than hoped for out of a battle: the first version of this
     assertion demanded the fight produce more casualties than beds, and a rout only
     wounded 12 against 30 beds — so it proved nothing about the overflow path, which is
     the entire point. takeWounds is where the guarantee lives, so that is what is asked. */
  {
    const full = hold();
    full.b.hospital = 0;
    full.t = { spearman: 500, archer:0, knight:0, ballista:0 };
    full.wounded = {};
    const beds = L.woundedCap(full);
    const r = L.takeWounds(full, 'spearman', beds * 4);
    const held = Object.values(full.wounded).reduce((a, b) => a + b, 0);
    ok('takeWounds buries nobody even at four times the beds available',
       r.dead === 0 && held === beds * 4,
       held + ' wounded held with beds for ' + beds);
    const viaCasualties = hold();
    viaCasualties.b.hospital = 0; viaCasualties.wounded = {};
    viaCasualties.t = { spearman: 500, archer:0, knight:0, ballista:0 };
    const c = L.takeCasualties(viaCasualties, 'spearman', L.woundedCap(viaCasualties) * 4, true);
    ok('while takeCasualties still buries the overflow, as PvE intends',
       c.dead > 0, c.dead + ' dead, ' + c.hurt + ' wounded — the reason raids needed their own path');
  }

  /* RULE 2 — the scarce spine of the economy cannot be carted off. */
  const moved = R.unlootable().filter(r => def.res[r] !== resBefore[r]);
  ok('refined and carried goods are untouchable', moved.length === 0,
     moved.length ? 'MOVED: ' + moved.join(', ') : R.unlootable().join(', ') + ' all held');
  ok('and the base stores did move', R.LOOTABLE.some(r => def.res[r] < resBefore[r]),
     Object.entries(out.loot).map(([k, v]) => v + ' ' + k).join(', '));

  /* RULE 3 — a column carries what it can carry. */
  {
    const rich = mk({ spearman: 60 });
    rich.name = 'Rich'; rich.res.food = 5_000_000;
    const tiny = { troops: { spearman: 4 }, base: 0, mult: 40 };
    for(const [k, n] of Object.entries(tiny.troops)) tiny.base += L.tierPower(att, k) * n;
    const before = rich.res.food;
    const o2 = R.resolveRaid(att, rich, tiny, rich.now, () => 0.5);
    const took = before - rich.res.food;
    const survivors = Object.values(o2.survivors).reduce((a, b) => a + b, 0);
    ok('a four-soldier column cannot empty a rich hold',
       took <= survivors * R.CARRY_PER_TROOP && took < before * 0.01,
       'took ' + took + ' of ' + before + ' with ' + survivors + ' survivors');
  }

  /* RULE 4 — losing buys peace, free. */
  ok('the beaten hold is under grace', (def.graceUntil || 0) > def.now,
     Math.round(((def.graceUntil||0) - def.now)/60000) + ' minutes');
  ok('and holds a Writ it did not pay for', (def.shields || 0) >= 1, String(def.shields));
  ok('grace and Writs both read as shielded', R.raidShielded(def, def.now) === true);

  /* And the bracket, which is the same rule the arena uses rather than a second one. */
  console.log('\n── the bracket refuses a mismatch ──');
  ok('an equal hold is fair game', R.inBracket(1000, 1000) === true);
  ok('twice your strength is still fair', R.inBracket(1000, 2000) === true);
  ok('a hold you could only bully is refused', R.inBracket(1000, 200) === false);
  ok('and one that would flatten you is refused', R.inBracket(1000, 5000) === false);

  /* The Watch is felt here — the whole reason it was built. */
  console.log('\n── a garrison is felt in a real assault ──');
  {
    const bare = mk({ spearman: 60 }), held = mk({ spearman: 60 });
    bare.name = held.name = 'Defender';
    const solo = R.defenceOf(bare).total;
    held.watch = [{ from:'Ally', base: 900, mult: R.defenceOf(bare).ownMult * 2.5,
                    troops: { spearman: 150 }, count: 150, hurt: 0 }];
    const guarded = R.defenceOf(held).total;
    ok('a posted Watch raises the wall it stands on', guarded > solo, solo + ' → ' + guarded);
    ok('and lifts the host\'s own soldiers, not just adds its own',
       R.defenceOf(held).lifted === true,
       '×' + R.defenceOf(bare).ownMult.toFixed(2) + ' → ×' + R.defenceOf(held).mult.toFixed(2));
  }
}

/* ── the store's guardrail, asserted rather than trusted ──
   Appended here because it is the same kind of check: a claim in a design doc is
   worth nothing unless something fails when it stops being true. */
{
  console.log('\n── the store cannot carry a stat ──');
  const SH = await import('../src/shop.js');
  const forbidden = ['bonus','mods','power','troopPower','production','casualties','valor','fx','cls'];
  const offenders = [];
  for(const [kind, cat] of Object.entries(SH.CATALOGUE))
    for(const [id, d] of Object.entries(cat))
      for(const f of forbidden) if(d[f] !== undefined) offenders.push(kind+':'+id+'.'+f);
  ok('no catalogue item has a field any rule reads', offenders.length === 0, offenders.join(', ') || 'clean');

  const s = hold();
  const before = JSON.stringify({ p:L.prodMult(s,'food'), a:L.armyPower(s), c:L.storageCap(s), u:L.upkeepPerSec(s) });
  L.grantCos(s,'hold','frost'); L.grantCos(s,'sigil','pike'); L.grantCos(s,'title','marshal');
  L.equipCos(s,'hold','frost',s.now); L.equipCos(s,'sigil','pike',s.now); L.equipCos(s,'title','marshal',s.now);
  const after = JSON.stringify({ p:L.prodMult(s,'food'), a:L.armyPower(s), c:L.storageCap(s), u:L.upkeepPerSec(s) });
  ok('wearing cosmetics changes no number', before === after);
  ok('all three are actually worn',
     s.cos.hold==='frost' && s.cos.sigil==='pike' && s.cos.title==='marshal');

  const s2 = hold();
  ok('cannot wear an unowned paid item', L.equipCos(s2,'hold','frost',s2.now) === false);
  ok('can always wear the free default', L.equipCos(s2,'hold','default',s2.now) === true);
  ok('an unknown id is refused', L.equipCos(s2,'hold','nope',s2.now) === false);
}

console.log('\n' + (fail ? '✗ ' + fail + ' FAILED, ' + pass + ' passed' : '✓ all ' + pass + ' passed') + '\n');
process.exit(fail ? 1 : 0);
