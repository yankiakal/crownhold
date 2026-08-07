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
import * as ST from '../src/state.js';
import * as AR from '../src/arena.js';
import * as R from '../src/research.js';
import * as IS from '../src/isle.js';
import { freshState } from '../src/state.js';
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const ok = (name, cond, note='') => { cond ? pass++ : fail++;
  console.log((cond ? '  ✓ ' : '  ✗ ') + name + (note ? '  — ' + note : '')); };
const near = (a, b, tol=0.02) => Math.abs(a-b) <= Math.abs(b)*tol + 1e-9;

function hold(){
  const now = Date.now();
  const s = freshState(now, 42);
  s.b.townhall = 20; s.b.command = 30; s.b.hospital = 10;
  s.b.academy = 30;   // the Drillfield's top, which is what Tier X asks for
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
  /* MARGINAL contribution, on top of a line thick enough to give full cover. The first
     version compared a pure column of each type against a pure ballista column, which
     stopped working the moment cover existed: a pure spearman column has cover 1 and a
     pure ballista column has cover 0, so the ratio was reading COVER as affinity and
     reported 146% for a 23% lift. Adding to a fixed spearman line holds cover at 1 in
     every probe, so what is left is the class term. */
  const LINE = 40000;                                  // enough that cover is 1 throughout
  const floorP = W.marchPower(s, { spearman: LINE }, party);
  const marginal = k => {
    const troops = k === 'spearman' ? { spearman: LINE + N } : { spearman: LINE, [k]: N };
    return (W.marchPower(s, troops, party) - floorP) / (L.tierPower(s, k) * N);
  };
  ok('the probe line really does give full cover',
     L.coverOf({ spearman: LINE, ballista: N }, 0) === 1);
  const bare = marginal('ballista');                   // nobody in the party covers ballistae
  for(const k of Object.keys(D.TROOPS)){
    const claimed = L.classLift(s, party, k);
    const measured = marginal(k) / bare - 1;
    ok(k + ': label ' + (claimed*100).toFixed(2) + '% = measured ' + (measured*100).toFixed(2) + '%',
       Math.abs(measured - claimed) < 2e-3);
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

/* ── composition: no shape may be free money ──
   Rise of Empires gave a full march of cavalry extra speed, and the result was that
   everybody used cavalry: a reward for one shape deletes the other three. We had the
   same disease pointed at siege, and worse, because it stacked — 6.5× the power per
   capacity slot AND a third of the casualties, since SCREEN's per-type weights were
   applied as independent multipliers rather than as a redistribution. A pure-ballista
   column enjoyed the protection of a screen that was not there. */
{
  console.log('\n── the screen has to actually be a screen ──');
  const budget = 0.30;
  const totalOf = t => Object.values(L.casualtySplit(t, budget, () => 0.5)).reduce((a,b)=>a+b,0);
  const foot = { spearman: 200 }, siege = { ballista: 200 };
  ok('the same battle costs the same number of casualties whatever you brought',
     totalOf(foot) === totalOf(siege),
     'foot ' + totalOf(foot) + ' vs siege ' + totalOf(siege) + ' of 200');
  const mixed = { spearman: 100, ballista: 100 };
  const split = L.casualtySplit(mixed, budget, () => 0.5);
  ok('but a line in front takes them instead of the engines',
     split.spearman > split.ballista * 2,
     'spearmen ' + split.spearman + ', ballistae ' + split.ballista);
  const bare = L.casualtySplit(siege, budget, () => 0.5);
  ok('engines with nobody in front take the lot',
     bare.ballista > split.ballista * 2,
     'unscreened ' + bare.ballista + ' vs screened ' + split.ballista);
  ok('screening is legible before you march',
     L.screenCover(mixed) > L.screenCover(siege) && L.screenCover(siege) === 0,
     'cover ' + L.screenCover(mixed).toFixed(2) + ' vs ' + L.screenCover(siege).toFixed(2));

  /* ── the ladder, levelled ──
     Capacity counted in bodies made the four types a LADDER whose top rung always won:
     a ballista and a spearman took the same slot at 6.5× the power, so the optimal column
     was 225 ballistae at 13,284 against a mixed column's 6,218. Whiteout Survival and
     Kingshot do not have this because their three types are a TRIANGLE — roughly equal
     power, differentiated by what they counter — which is why their meta is varied ratios
     rather than one answer.

     Counting capacity as LOAD is what levels it. These tests assert the property, not the
     tuning: no composition may be far ahead of the field. */
  console.log('\n── capacity is load, so no rung of the ladder wins outright ──');
  {
    const s2 = hold();
    s2.b.command = 30;
    s2.t = { spearman: 99999, archer: 99999, knight: 99999, ballista: 99999 };
    const party = ['marshal','gatekeeper','forager'];
    const cap = W.marchCapacity(s2, party);
    const powerOf = mix => {
      const want = {};
      for(const k of Object.keys(D.TROOPS)) want[k] = mix[k] ? 99999 : 0;
      const fit = W.fitColumn(s2, want, party);
      return { p: W.marchPower(s2, fit.troops, party, 'camp'), n: fit.total, load: fit.load };
    };
    /* Pure columns are no longer expected to be near-equal — cover means a column with no
       line SHOULD be worse, which is the whole point of interdependence. What load buys is
       that no type is ahead on power per unit of capacity BEFORE cover is applied; the
       worst-case floor test further down is what guards the meta.

       THIS MEASURES THE INHERENT LADDER, with no research applied, and that is deliberate.
       Per-line mastery raises one line's tierPower by up to 30%, so a hold with a single
       mastery maxed reads ×1.43 or ×1.56 here — but that compares an invested line against
       uninvested ones, which is progression rather than imbalance. The comparison that
       matters is between two players who have each invested, and it has its own test below. */
    const perLoad = Object.keys(D.TROOPS).map(k => ({
      k, per: L.tierPower(s2, k) / (D.LOAD[k] || 1),
    })).filter(x => x.k !== 'spearman');
    const bestPer = Math.max(...perLoad.map(x => x.per));
    const worstPer = Math.min(...perLoad.map(x => x.per));
    ok('no fighting type is ahead on power per unit of capacity', bestPer / worstPer < 1.25,
       perLoad.map(x => x.k + ' ' + x.per.toFixed(1)).join(', ') + '  → ×' + (bestPer/worstPer).toFixed(2));
    ok('a siege column is far smaller in bodies than a foot one',
       powerOf({ ballista:1 }).n * 3 < powerOf({ spearman:1 }).n,
       powerOf({ ballista:1 }).n + ' ballistae vs ' + powerOf({ spearman:1 }).n + ' spearmen');
    ok('but both fill the same column', Math.abs(powerOf({ ballista:1 }).load - cap) <= 4
       && Math.abs(powerOf({ spearman:1 }).load - cap) <= 4,
       'load ' + powerOf({ ballista:1 }).load + ' and ' + powerOf({ spearman:1 }).load + ' of ' + cap);
    const mixed = powerOf({ spearman:1, archer:1, knight:1, ballista:1 });
    ok('a mixed column fills the same capacity', Math.abs(mixed.load - cap) <= 4,
       'load ' + mixed.load + ' of ' + cap);
    ok('load is what a column is trimmed against, not headcount',
       W.columnLoad({ ballista: 10 }) === 10 * D.LOAD.ballista,
       '10 ballistae weigh ' + W.columnLoad({ ballista: 10 }));
  }
}

/* ── who eats what ──
   Asked for directly: "I need to see how much each troop type eats which rss, and in total."
   The totals were on screen but only in aggregate, so a player could watch 36 wood/s leave
   without being able to tell the archers were most of it.

   The property that matters is that the per-line columns SUM to the figures the rules
   actually charge. A breakdown that only approximately adds up is worse than none: it
   invites a player to plan against numbers the game does not use. */
{
  console.log('\n── the muster tells you who eats what ──');
  const s = hold();
  s.t = { spearman:300, archer:200, knight:100, ballista:50 };
  s.tier = { spearman:3, archer:3, knight:3, ballista:3 };

  const tot = L.musterDraw(s);
  ok('the food column sums to the upkeep the rules charge',
     Math.abs(tot.food - L.upkeepPerSec(s)) < 1e-9,
     tot.food.toFixed(2) + ' vs ' + L.upkeepPerSec(s).toFixed(2));
  for(const r of D.SUPPLY_RES)
    ok('the ' + r + ' column sums to the supply the rules draw',
       Math.abs(tot[r] - L.supplyPerSec(s, r)) < 1e-9,
       tot[r].toFixed(2) + ' vs ' + L.supplyPerSec(s, r).toFixed(2));

  /* And each line's own figures have to be attributable — an archer's draw is timber, a
     knight's is iron. This is the thing a player is reading the breakdown to find out. */
  const a = L.troopDraw(s, 'archer'), kn = L.troopDraw(s, 'knight');
  ok('archers show up under timber and not iron', a.wood > 0 && a.iron === 0,
     'archers: ' + a.wood.toFixed(1) + ' wood, ' + a.iron.toFixed(1) + ' iron');
  ok('cavalry show up mostly under iron', kn.iron > kn.wood * 2,
     'knights: ' + kn.wood.toFixed(1) + ' wood, ' + kn.iron.toFixed(1) + ' iron');
  ok('and everybody eats', Object.keys(D.TROOPS).every(k => L.troopDraw(s, k).food > 0));

  /* Zero troops of a line must draw nothing — the per-head scaling has been wrong in this
     codebase before, in exactly the direction of charging for an empty line. */
  const none = hold();
  none.t = { spearman:0, archer:0, knight:0, ballista:0 };
  const z = L.musterDraw(none);
  ok('an empty muster draws nothing at all',
     Object.values(z).every(v => v === 0), JSON.stringify(z));
}

/* ── a lost wave charges by the margin, not a flat rate ──
   Waves are ambient: they resolve themselves, and none arrive while the game is closed. A flat
   20% of the muster was the wrong bill for an event nobody is asked to attend — and it put a
   cliff at the boundary, where a hold that lost 51-to-49 paid exactly what an empty one did.
   The winning branch had always scaled by the margin; this was the one place the fault from
   v1.39 survived.

   It matters for the thing a player most wants to do: send a column to the frontier. That
   takes roughly 29% of the defence with it. */
{
  console.log('\n── a lost wave charges by how outmatched you were ──');
  /* Deterministic, and the near-loss point is FOUND rather than guessed.
     Two earlier passes picked wave 150 as "edged out" and wave 900 as "flattened" — but 600
     spearmen are routed at both, so `over` capped at 1 in each and the only difference left was
     the ±12% luck roll. The comparison flipped between runs and told me nothing. tick takes an
     injectable rand for exactly this reason; the margin is now bisected for. */
  const mk = (garrison, wave, hospital = 0) => {
    const now = D.SEASON_EPOCH + 2 * D.SEASON_MS;
    const s = freshState(now, 42);
    Object.assign(s.b, { townhall:20, academy:27, barracks:10, farm:25,
                         wall:0, warehouse:0, hospital });
    s.tier = { spearman:5, archer:5, knight:5, ballista:5 };
    s.t = { spearman: garrison, archer:0, knight:0, ballista:0 };
    s.wave = wave; s.nextWave = now; s.seenIntro = true; s.streak = 0;
    /* Stores seeded UNDER the storage cap. Seeding 9e5 put them far above what Town Hall 20
       can hold, so the first tick clamped them and the clamp swamped the plunder entirely —
       both a near loss and a rout measured "87% of stores gone", which is the cap, not the
       raid. */
    const room = Math.floor(L.storageCap(s) * 0.5);
    s.res = { food:room, wood:room, stone:room, iron:room,
              steel:0, runestone:0, rations:0, isleore:0, electrum:0 };
    return { s, now };
  };
  const beaten = (garrison, wave, hospital = 0) => {
    const { s, now } = mk(garrison, wave, hospital);
    const resBefore = s.res.food;
    L.tick(s, now + 1000, 1, () => 0.5);       // fixed luck: no coin flip in the measurement
    return { frac: (garrison - (s.t.spearman || 0)) / garrison,
             plunder: 1 - s.res.food / Math.max(1, resBefore),
             lost: (s.wavesLost || 0) > 0 };
  };

  /* The smallest wave that still beats a 600-strong garrison — a genuine near thing. */
  let lo = 1, hi = 2000;
  for(let i = 0; i < 20; i++){
    const mid = Math.floor((lo + hi) / 2);
    if(beaten(600, mid).lost) hi = mid; else lo = mid;
  }
  const edge = beaten(600, hi), rout = beaten(600, hi * 6);
  ok('found the wave that only just beats this garrison', edge.lost && !beaten(600, lo).lost,
     'wave ' + hi + ' loses, wave ' + lo + ' holds');
  ok('a near defeat costs a fraction of what a rout does', edge.frac * 1.5 < rout.frac,
     (100*edge.frac).toFixed(1) + '% edged out vs ' + (100*rout.frac).toFixed(1) + '% routed');
  ok('and stores follow the same shape', edge.plunder < rout.plunder - 0.01,
     (100*edge.plunder).toFixed(1) + '% vs ' + (100*rout.plunder).toFixed(1) + '%');

  ok('the floor is a scratch next to the old flat 20%',
     D.WAVE_LOSS_FLOOR <= 0.05 && D.WAVE_LOSS_FLOOR > 0,
     (D.WAVE_LOSS_FLOOR*100) + '% at parity');
  ok('and the ceiling is exactly the rate it replaced',
     Math.abs((D.WAVE_LOSS_FLOOR + D.WAVE_LOSS_SPAN) - 0.20) < 1e-9,
     (100*(D.WAVE_LOSS_FLOOR+D.WAVE_LOSS_SPAN)) + '% when flattened');

  /* The Infirmary now applies on a loss too — it always did when you won, and there was never
     a reason for a hospital to stop mattering the moment a fight went badly. */
  const bare = beaten(600, hi * 6, 0), warded = beaten(600, hi * 6, 20);
  ok('an Infirmary softens a defeat, not only a victory', warded.frac < bare.frac,
     (100*bare.frac).toFixed(1) + '% bare vs ' + (100*warded.frac).toFixed(1) + '% with a ward');

  /* And nothing at all happens while the game is closed — the property the whole "ambient"
     argument rests on. */
  const away = hold();
  away.t = { spearman: 200, archer: 0, knight: 0, ballista: 0 };
  const troopsBefore = away.t.spearman, waveBefore = away.wave;
  ST.applyOffline(away, 6 * 3600 * 1000);
  ok('six hours away costs no troops and no waves',
     away.t.spearman === troopsBefore && away.wave === waveBefore,
     'troops ' + away.t.spearman + ', wave ' + away.wave);
}

/* ── how long the game is ──
   DESIGN.md warned for weeks that launch would need build times multiplied a further 3-10x or
   "everything caps in 40 hours". Measured, that was stale by an order of magnitude: TIME_SCALE
   is already 10 and maxing every building is 2,544 hours of queue. Nobody knew, because
   nothing checked.

   This is a BAND, not a target. Too short and the game is over in a fortnight; too long and it
   is disrespectful. It exists so that a change to COST_EXP, TIME_EXP, buildTimeCap or
   TIME_SCALE cannot quietly turn a six-month game into a weekend or a decade. */
{
  console.log('\n── the game is as long as it is meant to be ──');
  const probe = () => {
    const s = freshState(Date.now(), 1);
    for(const k of Object.keys(D.BUILDINGS)) s.b[k] = 0;
    let ms = 0;
    for(const [k, d] of Object.entries(D.BUILDINGS)){
      for(let l = 0; l < d.max; l++){ s.b[k] = l; ms += L.buildTime(s, k); }
      s.b[k] = d.max;
    }
    return ms;
  };
  const days = probe() / 86400000;
  ok('maxing every building is months of queue, not days', days > 45 && days < 400,
     days.toFixed(0) + ' days of continuously busy queue at TIME_SCALE ' + D.TIME_SCALE);

  /* ── the first two minutes ──
     Reported from play: "first thing you do in the game, build quarry and you wait 2 mins, nothing
     else." Both halves of that were true and neither was visible to any existing test — the pacing
     test above measures the whole 106-day climb, which is exactly the wrong end of the telescope. */
  {
    const first = k => { const s = freshState(Date.now(), 1); return L.buildTime(s, k) / 1000; };
    for(const k of ['farm', 'lumberyard', 'quarry', 'barracks']){
      ok('a level-1 ' + D.BUILDINGS[k].name + ' takes seconds, not minutes', first(k) < 20,
         first(k).toFixed(0) + 's');
    }
    /* And the full weight still arrives: the ramp is a ramp, not a discount. */
    const s = freshState(Date.now(), 1); s.b.quarry = D.RAMP_LEVELS;
    ok('and the ramp is fully paid off by level ' + (D.RAMP_LEVELS + 1),
       D.earlyRamp(D.RAMP_LEVELS) === 1 && L.buildTime(s, 'quarry') / 60000 > 30,
       'a level-' + (D.RAMP_LEVELS+1) + ' Quarry is '
         + (L.buildTime(s, 'quarry') / 60000).toFixed(0) + ' min');

    /* The purse was the other half. 120 wood bought exactly two buildings, and the rest of the
       first session was watching it accrue at 1.6/s. Seeded stock has to clear a few builds AND
       stay under the Town Hall 1 storage cap, or the first tick clamps the surplus away and the
       generosity is invisible — the same clamp that hid three measurements elsewhere in this file. */
    const fresh = freshState(Date.now(), 1);
    const openers = ['farm', 'lumberyard', 'quarry', 'barracks'];
    let purse = { ...fresh.res }, bought = 0;
    for(const k of openers){
      const c = L.buildCost(fresh, k);
      if(Object.entries(c).every(([r, v]) => (purse[r] || 0) >= v)){
        for(const [r, v] of Object.entries(c)) purse[r] -= v;
        bought++;
      }
    }
    ok('the opening purse pays for every level-1 building at once', bought === openers.length,
       bought + ' of ' + openers.length + ' affordable from the starting stock');
    ok('and none of it is above the storage cap, so none is clamped away',
       ['food','wood','stone'].every(r => fresh.res[r] <= L.capFor(fresh, r)),
       ['food','wood','stone'].map(r => r + ' ' + fresh.res[r] + '/' + Math.round(L.capFor(fresh, r))).join(', '));
  }

  /* The second crew has to arrive EARLY, and this test used to say the opposite by accident. Its
     bound was `> 5`, written when the crew sat at Town Hall 10 to stop it drifting later still —
     but Town Hall 10 is 39 hours of continuously busy queue, three or four days, and for every one
     of them the player has one crew against a build queue that the simulator shows busy 77–91% of
     the time. The most common action in the game was unavailable nine times in ten, and the test
     was holding that in place. The invariant is not "partway up", it is "inside the first session
     and not free at level 1". */
  ok('a second crew opens inside the first session',
     D.SECOND_QUEUE_TH >= 2 && D.SECOND_QUEUE_TH <= 6,
     'Town Hall ' + D.SECOND_QUEUE_TH + ' of ' + D.BUILDINGS.townhall.max);

  /* Valor has to stay worth roughly the same amount of time however the scale is dialled —
     finishCost divides by TIME_SCALE precisely so that stretching the game does not silently
     make instant-finishing cheaper or dearer in real terms. */
  const now = Date.now();
  const oneHour = L.finishCost(now + 3600000, now);
  ok('Valor prices a timer by its length, not by the scale it was set at',
     oneHour > 0 && oneHour < 200, oneHour + ' Valor to skip an hour');

  /* And the fast loop must stay fast — the muster answers raids on a 75s cadence, so training
     deliberately does NOT scale. A change that swept TIME_SCALE into training would make the
     game unplayable long before anyone noticed the total length had moved. */
  /* Measured through startTraining rather than by re-deriving the formula — there is no
     exported trainTime, and copying the arithmetic into the test is exactly how the building
     detail sheet ended up carrying two drifted copies of the wall's defence curve. */
  const s = hold();
  const t0 = s.now;
  ok('a drill order is accepted', L.startTraining(s, 'spearman', 10, t0));
  const dur = s.tq.spearman ? s.tq.spearman.end - t0 : Infinity;
  ok('training stays on the fast cadence, unscaled by TIME_SCALE', dur < 600000,
     (dur / 1000).toFixed(0) + 's for ten spearmen — construction would be '
     + D.TIME_SCALE + '× longer');
}

/* ── First Light: the game teaching itself ──
   The 36 quests onboard the economy and teach nothing about combat, which is where every rule
   worth learning lives. A player could reach Town Hall 10 without discovering that a
   battlemage with no line in front is worth half.

   The guards below are the two ways a triggered-lesson system fails silently: a lesson whose
   `when` can never be true (so it is written and never seen), and a lesson that fires twice
   (so it nags). Both are invisible in play until a player complains. */
{
  console.log('\n── First Light: lessons fire once, when the rule starts to matter ──');
  const LS = await import('../src/lessons.js');

  ok('every lesson has an id, a title, a body and a trigger',
     LS.LESSONS.every(l => l.id && l.title && l.body && typeof l.when === 'function'),
     LS.LESSONS.length + ' lessons');
  ok('and no two share an id',
     new Set(LS.LESSONS.map(l => l.id)).size === LS.LESSONS.length);
  ok('the first few hold the screen, the rest do not',
     LS.LESSONS.filter(l => l.hold).length >= 3 && LS.LESSONS.some(l => !l.hold),
     LS.LESSONS.filter(l => l.hold).map(l => l.id).join(', ') + ' hold');

  /* Reachability. A hold that has done everything must have triggered every lesson — a `when`
     that can never fire is a lesson written and never read. */
  const rich = hold();
  rich.seenIntro = true;
  rich.valor = 500; rich.shields = 2; rich.warbandsWon = 3; rich.wavesWon = 20;
  rich.wallWear = 0.2; rich.marches = [{}]; rich.taught = {};
  /* "Everything" has to mean every building the lessons key off, or a perfectly reachable card reads
     as unreachable. hold() leaves the Library at 0, which is what made the `scholars` unlock look
     dead — it fires for any hold that has one. */
  rich.b.library = 8; rich.b.forge = 6; rich.b.command = 30; rich.b.embassy = 3;
  const fired = [];
  for(let i = 0; i < LS.LESSONS.length + 4; i++){
    const l = LS.nextLesson(rich, { thBlocked: true });
    if(!l) break;
    rich.taught[l.id] = 1; rich.lesson = l.id; fired.push(l.id);
    rich.lesson = null;
  }
  const never = LS.LESSONS.filter(l => !fired.includes(l.id)).map(l => l.id);
  ok('a hold that has done everything sees every lesson', never.length === 0,
     fired.length + ' of ' + LS.LESSONS.length + (never.length ? ' — never fires: ' + never.join(', ') : ''));

  /* Fires once. The tick records `taught` as it raises the card, so dismissing can never
     resurrect it — the failure would be a card that reappears every second. */
  const s = freshState(Date.now(), 7);
  s.seenIntro = true;
  let raised = 0;
  for(let i = 0; i < 30; i++){
    L.tick(s, s.now + (i+1)*1000, 1);
    if(s.lesson){ raised++; L.closeLesson(s); }
  }
  ok('a dismissed lesson never comes back', raised <= LS.LESSONS.length,
     raised + ' cards raised over 30 ticks');
  ok('and closing one clears the card', s.lesson === null);

  /* Off means off. */
  const quiet = freshState(Date.now(), 7);
  quiet.seenIntro = true; quiet.teachOff = true;
  for(let i = 0; i < 20; i++) L.tick(quiet, quiet.now + (i+1)*1000, 1);
  ok('turning lessons off raises none', !quiet.lesson && !Object.keys(quiet.taught || {}).length);

  /* And nothing before the intro — the opening screen is already a wall of text. */
  const fresh = freshState(Date.now(), 7);
  fresh.t = { spearman: 50 };
  ok('nothing is taught before the intro is dismissed',
     LS.nextLesson(fresh, { thBlocked: true }) === null);
}

/* ── the Drillfield is never a dull upgrade ──
   Nine levels, one thing each, and after the ninth it was finished furniture. Now a tier
   every third level (so Tier X is a late-game achievement, not something you hold by Town
   Hall 9) and a troop-power bonus on EVERY level, so no rung is dead.

   The bonus is deliberately not a promotion discount, which was the obvious first idea and
   would have reopened the v1.43 hole: reforging costs exactly what the yard charges to drill
   a soldier a tier higher, precisely so neither route to a tier is cheaper. Asserted below,
   because that invariant is easy to break from a long way away. */
{
  console.log('\n── the Drillfield: a tier every third level from 6, and no dull rung ──');
  const at = a => { const s = hold(); s.b.academy = a; return s; };
  ok('an unbuilt Academy still allows Tier I', L.maxTier(at(0)) === 1);
  /* The ladder STARTS at 6, which is what makes the whole thing come out even — nine tiers, nine
     steps of three, Tier X on the Drillfield's last level. The five levels below 6 pay power only,
     and that is deliberately where the quiet stretch goes: measured, 0→6 is 8,400 stone and 2.3
     hours, while the same six levels at 24→30 are 634,650 stone and 79 hours. */
  ok('nothing before level 6 opens a tier', L.maxTier(at(3)) === 1 && L.maxTier(at(5)) === 1,
     'L3→' + D.TIERS[L.maxTier(at(3))-1] + ', L5→' + D.TIERS[L.maxTier(at(5))-1]);
  ok('then a tier every third level', L.maxTier(at(6)) === 2 && L.maxTier(at(9)) === 3 && L.maxTier(at(12)) === 4,
     'L6→' + D.TIERS[L.maxTier(at(6))-1] + ', L9→' + D.TIERS[L.maxTier(at(9))-1] + ', L12→' + D.TIERS[L.maxTier(at(12))-1]);
  /* No gap anywhere: every step from Tier II up is exactly ACADEMY_PER_TIER. This is the invariant
     the two earlier versions each broke in a different place — one stranded Tier X three levels
     below the top, the other opened a six-level dry spell at the most expensive end of the curve. */
  {
    const steps = [];
    for(let t = 3; t <= D.TIERS.length; t++) steps.push(L.academyForTier(t) - L.academyForTier(t-1));
    ok('every step of the ladder is the same size', steps.every(x => x === D.ACADEMY_PER_TIER),
       'steps ' + steps.join(',') + ' (want all ' + D.ACADEMY_PER_TIER + ')');
  }
  /* Tier X asks for the FINISHED building, not the ninth step of the ladder. It used to land at
     27, three short of the Drillfield's top, which made the last three levels the only ones that
     bought nothing but a percentage — and left this the one building stopping at 27 when
     everything near it runs to 30. Derived from ACADEMY_TOP so the two cannot drift. */
  ok('Tier X arrives only with the whole Drillfield',
     L.maxTier(at(D.ACADEMY_TOP - 1)) === 9 && L.maxTier(at(D.ACADEMY_TOP)) === 10,
     'L' + (D.ACADEMY_TOP-1) + '→' + D.TIERS[L.maxTier(at(D.ACADEMY_TOP-1))-1]
       + ', L' + D.ACADEMY_TOP + '→' + D.TIERS[L.maxTier(at(D.ACADEMY_TOP))-1]);
  /* And the last tier lands EXACTLY on the building's last level. ACADEMY_TOP derives from
     TIERS.length × ACADEMY_PER_TIER, so adding a tier or changing the step moves it — and this is
     what fires if BUILDINGS.academy.max is not moved to match. */
  ok('the ladder ends exactly where the building does',
     L.academyForTier(D.TIERS.length) === D.BUILDINGS.academy.max
       && D.ACADEMY_TOP === D.BUILDINGS.academy.max,
     'Tier X at ' + L.academyForTier(D.TIERS.length) + ', building maxes at '
       + D.BUILDINGS.academy.max);
  ok('and it never promises a tier past X', L.maxTier(at(99)) === D.TIERS.length);
  ok('the level a tier needs is nameable, for when the panel refuses',
     L.academyForTier(1) === 0 && L.academyForTier(2) === 6
       && L.academyForTier(10) === D.ACADEMY_TOP,
     'Tier I free, II at ' + L.academyForTier(2) + ', X at ' + L.academyForTier(10));

  /* Every level pays, including the two out of three that open no tier. */
  const p = a => { const s = at(a); s.t = { spearman:100 }; s.tier = { spearman:1 }; return L.tierPower(s, 'spearman'); };
  ok('every level drills the muster harder, tier or no tier',
     p(4) > p(3) && p(5) > p(4) && p(D.ACADEMY_TOP) > p(D.ACADEMY_TOP - 1),
     'L3 ' + p(3).toFixed(2) + ' → L4 ' + p(4).toFixed(2) + ' → L5 ' + p(5).toFixed(2)
     + ' … L' + D.ACADEMY_TOP + ' ' + p(D.ACADEMY_TOP).toFixed(2));
  /* Derived from the constant, not written as a literal. This asserted ×1.27 — correct while
     the bonus was 1% a level — and failed the moment it moved to 2.5%, reporting a real change
     as a regression. A test that hardcodes the value of the thing it is measuring only ever
     checks that nobody changed it. */
  /* ...and the level it MEASURES at has to be derived too. The expectation came from
     BUILDINGS.academy.max while the measurement sat at a literal 27, so raising the max to 30
     compared a 27-level ladder against a 30-level expectation and reported ×1.675 vs ×1.750.
     Half a derived test is a test that fails for the wrong reason. */
  const top = D.BUILDINGS.academy.max;
  const expect = 1 + D.ACADEMY_POWER * top;
  ok('the whole ladder is worth what the constant says it is worth',
     Math.abs(p(top)/p(0) - expect) < 0.01,
     '×' + (p(top)/p(0)).toFixed(3) + ' against ×' + expect.toFixed(3)
     + ' (' + (D.ACADEMY_POWER*100) + '% × ' + top + ' levels)');

  /* The invariant the bonus was chosen to protect. */
  const tot = c => Object.values(c).reduce((a, b) => a + b, 0);
  const s = hold(); s.tier.knight = 4; s.t.knight = 200;
  const step = tot(L.promoteCost(s, 'knight'));
  const before = tot(L.trainCost(s, 'knight', 200));
  s.tier.knight = 5;
  ok('and the Academy does NOT discount promotions — that parity still holds',
     Math.abs(step - (tot(L.trainCost(s, 'knight', 200)) - before)) <= 200,
     'reforge ' + step + ' vs yard premium ' + (tot(L.trainCost(s,'knight',200)) - before));
}

/* ── the per-level ladder in a building's detail sheet ──
   Asked for directly: "I should be able to see how much food the farm produces at max level."

   The sheet used to carry its own copies of the formulas, and two had already drifted — the
   wall's `18*lvl` predated both wear and fortification research, and the Infirmary's `4*lvl`
   described a rule that had moved. So the ladder is measured: cloned state, real function.
   The test that matters is the LAST one here, which proves that — a hardcoded curve cannot
   respond to research it does not know about. */
{
  console.log('\n── a building tells you what it does at every level ──');
  const s = hold();
  s.b.farm = 12; s.b.wall = 9; s.b.academy = 5;

  for(const k of ['farm','lumberyard','quarry','ironmine','wall','academy','hospital','forge']){
    const c = L.buildingCurve(s, k);
    ok(D.BUILDINGS[k].name + ' has a ladder that reaches its cap',
       c.length >= 2 && c[c.length-1].lvl === D.BUILDINGS[k].max && !!c[c.length-1].readout,
       'L1 ' + (c[0] && c[0].readout) + '  →  L' + D.BUILDINGS[k].max + ' ' + (c[c.length-1] || {}).readout);
  }

  const farm = L.buildingCurve(s, 'farm');
  ok('it marks where you are and what one more level buys',
     farm.some(r => r.now && r.lvl === 12) && farm.some(r => r.next && r.lvl === 13),
     'now at ' + (farm.find(r => r.now) || {}).lvl + ', next ' + (farm.find(r => r.next) || {}).lvl);
  ok('and prices the levels ahead but not the ones behind',
     farm.filter(r => r.lvl > 12).every(r => r.cost) && farm.filter(r => r.lvl <= 12).every(r => !r.cost));

  /* Production has to rise monotonically up the ladder. A curve that dipped would mean the
     probe was leaking state between rows. */
  const out = farm.map(r => parseFloat(r.readout.replace(/[^0-9.]/g, '')));
  ok('production climbs all the way up, with no leak between rows',
     out.every((v, i) => i === 0 || v > out[i-1]), out.join(' → '));

  /* The proof that it is measured. Fortification research adds flat defence per level, and a
     hardcoded `18*lvl` cannot know that. If this figure moves when the research does, the
     ladder is reading the real rule. */
  const before = L.buildingCurve(s, 'wall').find(r => r.lvl === 20).readout;
  const s2 = hold();
  s2.b.wall = 9; s2.research = { ...(s2.research||{}), fortification: 10 };
  const after = L.buildingCurve(s2, 'wall').find(r => r.lvl === 20).readout;
  ok('the wall ladder answers to fortification research — so it is measured, not copied',
     before !== after, before + '  →  ' + after + ' with the research maxed');
}

/* ── the Town Hall names two buildings, and they cannot be substituted ──
   Counting buildings was not enough. The count caps at six, so the cheapest six carried a
   player to Town Hall 30 for 26% of a full hold's cost with the Archery Range, Stable, Mage
   Spire, Great Library and Command Center never raised at all — while the rule's own
   comment claimed the whole hold climbed together.

   The dangerous failure of a named requirement is an IMPOSSIBLE one: several buildings cap
   below 30, so a level demanding the Drillfield at 15 when it stops at 9 would wall the
   game off for ever. That is the first thing asserted here. */
{
  console.log('\n── the Town Hall names two buildings ──');
  const others = Object.keys(D.BUILDINGS).filter(k => k !== 'townhall');
  const max = D.BUILDINGS.townhall.max;

  let impossible = [], empty = [], dupes = 0, sameAsPrev = 0, prev = '';
  const named = {};
  for(let lvl = 2; lvl <= max; lvl++){
    const pair = L.townhallPair(lvl);
    if(pair.length !== 2) empty.push(lvl);
    if(pair[0] === pair[1]) dupes++;
    if(pair.join() === prev) sameAsPrev++;
    prev = pair.join();
    for(const k of pair){
      named[k] = (named[k] || 0) + 1;
      const need = L.pairLevel(k, lvl);
      // it must be reachable: within the building's own cap and its gate already open
      if(need > D.BUILDINGS[k].max) impossible.push('TH' + lvl + ' wants ' + k + ' ' + need);
      if(D.BUILDINGS[k].th && D.BUILDINGS[k].th > lvl - 1)
        impossible.push('TH' + lvl + ' wants ' + k + ' before its own gate opens');
    }
  }
  ok('every level names exactly two', empty.length === 0 && dupes === 0,
     empty.length ? 'short at ' + empty.join(',') : 'all ' + (max-1) + ' levels');
  ok('and never asks for a level a building cannot reach', impossible.length === 0,
     impossible.slice(0,3).join('; ') || 'clamped to every cap');
  ok('consecutive levels never name the same pair', sameAsPrev === 0);
  ok('and the pair is stable — the same level always names the same two',
     L.townhallPair(17).join() === L.townhallPair(17).join() &&
     L.townhallPair(17).join() !== L.townhallPair(18).join());

  /* Coverage: the whole point is that nothing is skippable. A building never named is a
     building a player can leave at zero for ever. */
  const never = others.filter(k => !named[k]);
  ok('EVERY building takes its turn — nothing is skippable', never.length === 0,
     Object.keys(named).length + ' of ' + others.length
     + (never.length ? ' — never named: ' + never.join(', ') : ''));
  /* The stride has to be coprime with the list length or the walk visits only a fraction of
     the positions. At 2 over 22 it reached even indices only, and the Runeworks — which
     enters the pool at Town Hall 23 with eight levels to go — was never named. Asserted as
     arithmetic so a future building count cannot silently reintroduce it. */
  const gcd = (a, b) => b ? gcd(b, a % b) : a;
  ok('and the stride is coprime with the roster, so the walk covers all of it',
     gcd(L.TH_STRIDE, others.length) === 1,
     'stride ' + L.TH_STRIDE + ' vs ' + others.length + ' buildings, gcd '
     + gcd(L.TH_STRIDE, others.length));

  /* And the rush is actually closed. A hold with the six cheapest buildings maxed and
     nothing else must be refused, where before it sailed through. */
  const rusher = hold();
  for(const k of others) rusher.b[k] = 0;
  for(const k of ['farm','lumberyard','quarry','ironmine','barracks','wall']) rusher.b[k] = 19;
  rusher.b.townhall = 19;
  const req = L.townhallReq(rusher);
  ok('the cheapest-six hold has the COUNT it needs', req.have >= req.need,
     req.have + ' of ' + req.need + ' at level ' + (req.toLvl-1));
  ok('but is refused, because the named pair has not kept pace', !req.ok,
     'missing: ' + (req.pairShort.map(k => D.BUILDINGS[k].name).join(', ') || 'nothing'));

  /* The costed route must include the pair, or the UI hands out a list of taps that does
     not unblock anything — worse than showing nothing, because the player follows it. */
  const path = L.townhallPath(rusher);
  ok('and the road it offers leads through them',
     req.pairShort.every(k => path.path.some(step => step.key === k)),
     path.path.map(x => x.key + (x.required ? '*' : '')).join(', '));
}

/* ── the wall eats stone ──
   Supply gave the Lumberyard and Iron Mine a permanent job and did nothing for the Quarry,
   which still ran +23 stone/s spare at a maxed hold. A wall that has been hit needs
   masonry, so stone drain now scales with how much wall you have AND how often you are
   attacked. Same shape as supply on purpose: capped, continuous, self-mending, destroys
   nothing. */
{
  console.log('\n── a wall that has been hit needs stone ──');
  /* hold() raises no Wall, and batterWall correctly does nothing to a hold that has none —
     so the first version of this block asserted against a wall of level 0 and reported
     "138 → 138" as a failure to take damage. The 138 was heroes and fortification tech,
     not stonework. */
  const walled = () => { const h = hold(); h.b.wall = 20; return h; };
  const s = walled();
  const whole = L.wallPower(s);
  ok('an untouched wall is at full strength', L.wallWear(s) === 0 && whole > 0, 'wall ' + Math.round(whole));
  ok('and asks for no stone at all', L.wallMendPerSec(s) === 0);

  L.batterWall(s);
  ok('an assault knocks part of it loose', L.wallPower(s) < whole,
     Math.round(whole) + ' → ' + Math.round(L.wallPower(s)));
  ok('and the masons now want stone', L.wallMendPerSec(s) > 0,
     L.wallMendPerSec(s).toFixed(1) + '/s');

  for(let i = 0; i < 40; i++) L.batterWall(s);
  ok('a battered wall still counts for half — never nothing',
     Math.abs(L.wallWear(s) - D.WALL_WEAR_MAX) < 1e-9 && L.wallPower(s) > whole * 0.49,
     'wear capped at ' + (D.WALL_WEAR_MAX*100) + '%, wall at ' + Math.round(L.wallPower(s)));
  ok('and the wall itself was never demolished', s.b.wall === 20);

  /* Against a CONTROL, not against "the stone went down" — the Runeworks eats stone every
     tick regardless, so an undamaged hold also spends some, and the first version of this
     passed on that alone. */
  const damaged = walled(), control = walled();
  L.batterWall(damaged, 4);
  for(let i = 0; i < 400; i++){
    L.tick(damaged, damaged.now + (i+1)*1000, 1);
    L.tick(control, control.now + (i+1)*1000, 1);
  }
  ok('the masons mend it', L.wallWear(damaged) < 0.01, 'wear → ' + L.wallWear(damaged).toFixed(3));
  ok('and are paid in stone the intact hold never spends', damaged.res.stone < control.res.stone * 0.999,
     'repaired ' + Math.round(control.res.stone - damaged.res.stone) + ' stone more than the control');

  /* No stone, no repair — but also no collapse. The failure mode has to be "it stays
     damaged", never "it falls down". */
  const broke = walled();
  L.batterWall(broke, 3);
  broke.res.stone = 0;
  const wearThen = L.wallWear(broke);
  for(let i = 0; i < 60; i++) L.tick(broke, broke.now + (i+1)*1000, 1);
  ok('a hold with no stone keeps a damaged wall rather than losing it',
     L.wallWear(broke) >= wearThen - 0.02 && broke.b.wall > 0 && L.wallPower(broke) > 0,
     'wear ' + L.wallWear(broke).toFixed(3) + ', wall still level ' + broke.b.wall);
}

/* ── decrees ──
   A standing order paid for in Valor. Every one is a TRADE — the rule that stops this
   being a power ratchet — and every field lands on a modifier key heroBonus already
   aggregates, so no rule at the point of use knows decrees exist. Both properties are
   asserted, because a decree naming a key nothing reads would be silent. */
{
  console.log('\n── decrees are trades, and they land on keys the game already reads ──');
  for(const [k, d] of Object.entries(D.DECREES)){
    ok(d.name + ' gives and takes', Object.keys(d.up).length > 0 && Object.keys(d.down).length > 0,
       Object.keys(d.up) + ' up / ' + Object.keys(d.down) + ' down');
    ok('and never on the same axis, which would just be arithmetic',
       !Object.keys(d.up).some(key => key in d.down));
  }

  /* Reachability: heroBonus is the seam every modifier flows through, so a decree's value
     must show up there — for the take as well as the give. */
  for(const [k, d] of Object.entries(D.DECREES)){
    const s = hold();
    s.valor = 999;
    for(const [key, v] of Object.entries({ ...d.up, ...d.down })){
      const before = L.heroBonus(s, key);
      L.announceDecree(s, k, s.now);
      const after = L.heroBonus(s, key);
      ok(d.name + ' reaches heroBonus("' + key + '")', Math.abs((after - before) - v) < 1e-9,
         before.toFixed(3) + ' → ' + after.toFixed(3));
      s.decree = null;
    }
  }

  const s = hold();
  s.valor = 999;
  s.t = { spearman:300, archer:200, knight:100, ballista:50 };
  const upkeepBefore = L.upkeepPerSec(s);
  ok('Rationing costs Valor', L.announceDecree(s, 'ration', s.now) && s.valor === 999 - D.DECREES.ration.cost,
     'valor 999 → ' + s.valor);
  ok('and actually lowers what the muster eats', L.upkeepPerSec(s) < upkeepBefore * 0.8,
     upkeepBefore.toFixed(1) + ' → ' + L.upkeepPerSec(s).toFixed(1) + ' food/s');
  ok('a second decree replaces the first — never stacks',
     L.announceDecree(s, 'levy', s.now) && L.decreeOf(s).key === 'levy' &&
     L.heroBonus(s, 'upkeep') === L.heroBonus(hold(), 'upkeep'),
     'standing: ' + L.decreeOf(s).key);
  ok('it cannot be announced without the Valor',
     (() => { const p = hold(); p.valor = 0; return !L.announceDecree(p, 'blood', p.now); })());

  /* And it runs out, out loud. A modifier that expires silently is a set of numbers that
     changed for no visible reason. */
  const logBefore = s.log.length;
  L.tick(s, s.now + D.DECREE_MS + 2000, 1);
  ok('a decree expires on its own', L.decreeOf(s) === null);
  /* Searched, not indexed at 0: a tick long enough to expire a decree also resolves waves
     and queues offers, so the newest entry is whatever happened last, not what we asked
     about. Asserting log[0] made this fail on a hero-draft message. */
  const said = s.log.find(e => /run its course/.test(e.txt));
  ok('and says so in the chronicle', s.log.length > logBefore && !!said,
     said ? said.txt.slice(0, 54) : 'not in the log');
  ok('with the hold back to its unmodified self',
     L.heroBonus(s, 'trainTime') === L.heroBonus(hold(), 'trainTime'));
}

/* ── an army eats more than bread ──
   The Lumberyard, Quarry and Iron Mine used to have no permanent job: at level 30 a hold
   made 48 wood/s against 8.5 eaten, and the surplus GREW. Arrows and shoes are upkeep now.

   The first version of the table was priced per SOLDIER and quietly rewarded the exact
   build the composition rules exist to discourage — per unit of army capacity it came out
   at 0.0625 for a battlemage against 0.27 for an archer, so going all-in on battlemages
   was four times cheaper to keep in the field. That is the test below that matters, and it
   is the one no amount of reading the table would have produced. */
{
  console.log('\n── an army eats more than bread ──');
  const s = hold();
  ok('every fighting type draws supply', Object.keys(D.TROOPS).every(k => D.SUPPLY[k]),
     Object.keys(D.SUPPLY).join(', '));

  /* Priced per LOAD, level across types, so no shape can dodge the constraint by
     concentrating. Load is the denominator for column capacity and promotion pricing too;
     this is the third rule that has to use it and the first that got it wrong. */
  const perLoad = Object.keys(D.TROOPS).map(k => {
    const n = D.SUPPLY[k];
    return { k, v: D.SUPPLY_RES.reduce((a, r) => a + (n[r] || 0), 0) / D.LOAD[k] };
  });
  const hi = Math.max(...perLoad.map(x => x.v)), lo = Math.min(...perLoad.map(x => x.v));
  ok('supply costs the same per unit of capacity, whatever the shape', hi / lo < 1.05,
     perLoad.map(x => x.k + ' ' + x.v.toFixed(4)).join(', ') + '  → ×' + (hi/lo).toFixed(3));

  /* Different types lean on DIFFERENT mines — the part that makes this interesting rather
     than just a second food. */
  const woodShare = k => (D.SUPPLY[k].wood || 0) /
    D.SUPPLY_RES.reduce((a, r) => a + (D.SUPPLY[k][r] || 0), 0);
  ok('archers run on timber and cavalry on iron',
     woodShare('archer') > 0.85 && woodShare('knight') < 0.30,
     'archer ' + (woodShare('archer')*100).toFixed(0) + '% wood, knight '
     + (woodShare('knight')*100).toFixed(0) + '% wood');

  /* Running dry costs POWER and never a body. This is the whole reason the rule is
     survivable: a timber shortage must not delete troops you paid for. */
  const dry = hold();
  dry.t = { spearman:200, archer:200, knight:100, ballista:50 };
  const bodiesBefore = Object.values(dry.t).reduce((a,b)=>a+b,0);
  const powerBefore = L.armyBreakdown(dry).total;
  dry.res.wood = 0; dry.res.iron = 0;
  for(let i = 0; i < 120; i++) L.tick(dry, dry.now + (i+1)*1000, 1);
  const bodiesAfter = Object.values(dry.t).reduce((a,b)=>a+b,0);
  ok('a hold with no timber loses no soldiers to it', bodiesAfter === bodiesBefore,
     bodiesBefore + ' → ' + bodiesAfter);
  ok('but it does fight weaker', L.armyBreakdown(dry).total < powerBefore * 0.95,
     powerBefore + ' → ' + L.armyBreakdown(dry).total);
  ok('and the penalty is capped, not a spiral',
     L.supplyMult(dry, 'archer') >= 1 - D.SUPPLY_PENALTY - 1e-9,
     'archers at ' + (L.supplyMult(dry,'archer')*100).toFixed(0) + '%');

  /* The shortage lands on whoever depended on the missing thing. */
  const noIron = hold();
  noIron.t = { spearman:200, archer:200, knight:100, ballista:50 };
  noIron.res.wood = 9e5; noIron.res.iron = 0;
  for(let i = 0; i < 120; i++) L.tick(noIron, noIron.now + (i+1)*1000, 1);
  ok('an iron drought hurts cavalry more than archers',
     L.supplyMult(noIron, 'knight') < L.supplyMult(noIron, 'archer') - 0.05,
     'knights ' + (L.supplyMult(noIron,'knight')*100).toFixed(0) + '%, archers '
     + (L.supplyMult(noIron,'archer')*100).toFixed(0) + '%');

  /* And it mends. A penalty you cannot recover from is a trap, not a constraint. */
  noIron.res.iron = 9e5;
  for(let i = 0; i < 120; i++) L.tick(noIron, noIron.now + (120+i+1)*1000, 1);
  ok('and it heals once the mine catches up', L.supplyMult(noIron, 'knight') > 0.999,
     'knights back to ' + (L.supplyMult(noIron,'knight')*100).toFixed(0) + '%');

  ok('a fully supplied hold is untouched by any of this',
     L.supplyMult(s, 'archer') === 1 && L.supplyMult(s, 'knight') === 1);
}

/* ── one soldier, one tier bill, whichever door they came through ──
   Drilling a soldier at tier N and reforging one into tier N have to cost the same, or
   the route matters more than the destination and the cheap route becomes compulsory
   knowledge. They were 4.8× apart, which made "drill nothing until the Academy tops out"
   the efficient opening and charged everyone who played normally 3.9× for the same army.

   Both properties below were invisible until measured, and the second one bit me twice:
   I removed the per-head term to fix the first, which quietly handed a concentrated army
   the same tiers for a quarter of the price. */
{
  console.log('\n── one soldier, one tier bill, whichever door they came through ──');
  const tot = c => Object.values(c).reduce((a, b) => a + b, 0);

  /* The per-step invariant, stated directly against the yard's own premium. */
  for(const k of Object.keys(D.TROOPS)){
    const s = hold();
    s.tier[k] = 4; s.t[k] = 200;
    const step = tot(L.promoteCost(s, k));
    const before = tot(L.trainCost(s, k, 200));
    s.tier[k] = 5;
    const after = tot(L.trainCost(s, k, 200));
    ok('reforging a ' + k + ' costs what drilling one a tier higher costs',
       Math.abs(step - (after - before)) <= 200,
       'reforge ' + step + ' vs yard premium ' + (after - before));
  }

  /* And per head, which is what keeps tiers neutral between a narrow army and a broad
     one — the bill scales with the bodies that benefit. */
  const small = hold(), big = hold();
  small.t = { spearman:100, archer:100, knight:100, ballista:100 };
  big.t   = { spearman:400, archer:400, knight:400, ballista:400 };
  for(const k of Object.keys(D.TROOPS))
    ok('a line four times the size costs four times as much to reforge',
       Math.abs(tot(L.promoteCost(big, k)) / tot(L.promoteCost(small, k)) - 4) < 0.02,
       '×' + (tot(L.promoteCost(big, k)) / tot(L.promoteCost(small, k))).toFixed(2));

  /* The end-to-end version of the trap: reach the same army at the same tier by both
     routes and check the bills agree. This is the assertion that would have caught it —
     the per-step costs looked reasonable in isolation. */
  const armyOf = () => ({ spearman:400, archer:400, knight:200, ballista:100 });
  const route = promoteFirst => {
    const s = hold();
    s.tier = { spearman:1, archer:1, knight:1, ballista:1 };
    s.t = promoteFirst ? { spearman:0, archer:0, knight:0, ballista:0 } : armyOf();
    let spent = 0;
    const drill = () => { for(const [k, n] of Object.entries(armyOf())) spent += tot(L.trainCost(s, k, n)); };
    if(!promoteFirst) drill();
    for(const k of Object.keys(D.TROOPS))
      while(L.tierOf(s, k) < 10){ spent += tot(L.promoteCost(s, k)); s.tier[k] = L.tierOf(s, k) + 1; }
    if(promoteFirst) drill();
    return spent;
  };
  const a = route(true), b = route(false);
  ok('neither route to a tier-X army is cheaper than the other',
     Math.abs(a - b) / Math.max(a, b) < 0.02,
     'promote-first ' + a + ' vs drill-first ' + b + ' (×' + (b / a).toFixed(3) + ') — was ×3.94');

  /* Tiers must not be a discount for concentrating. Power-per-resource on the tier axis
     has to be roughly equal for a narrow army and a broad one of the same size, so that
     cover and the counter triangle are what settle composition. Pricing per line instead
     of per head broke exactly this, and mono took the floor at three budgets of four. */
  const tierSpend = mix => {
    const s = hold();
    s.tier = { spearman:1, archer:1, knight:1, ballista:1 };
    s.t = { spearman:0, archer:0, knight:0, ballista:0 };
    const load = 960;
    const unit = Object.entries(mix).reduce((a2, [k, w]) => a2 + w * D.LOAD[k], 0);
    for(const [k, w] of Object.entries(mix)) s.t[k] = Math.round(w * load / unit);
    let spent = 0, gained = 0;
    const before = Object.keys(mix).reduce((p, k) => p + L.tierPower(s, k) * s.t[k], 0);
    for(const k of Object.keys(mix))
      while(L.tierOf(s, k) < 8){ spent += tot(L.promoteCost(s, k)); s.tier[k] = L.tierOf(s, k) + 1; }
    gained = Object.keys(mix).reduce((p, k) => p + L.tierPower(s, k) * s.t[k], 0) - before;
    return gained / spent;
  };
  const narrow = tierSpend({ knight:1 });
  const broad = tierSpend({ spearman:1, archer:1, knight:1, ballista:1 });
  ok('tiers buy the same power per resource narrow or broad',
     Math.max(narrow, broad) / Math.min(narrow, broad) < 1.35,
     'narrow ' + narrow.toFixed(4) + ' vs broad ' + broad.toFixed(4) +
     ' power/resource  (×' + (Math.max(narrow, broad) / Math.min(narrow, broad)).toFixed(2) + ')');
}

/* ── interdependence, which is what actually stops a mono army ──
   Levelling power-per-load stopped one TYPE dominating and then made something worse
   optimal: pick one and pour everything in. One troop building served instead of four,
   all three captains could share a class, and promotions were charged per soldier so a
   narrow army promoted cheaply — three archer captains fielding only archers measured
   3,803 against a mixed column's 3,263. Cheaper AND stronger.

   No percentage nudge answers a cost advantage that size. Structure does, and it is what
   Whiteout Survival actually uses: marksmen die without an infantry line, and the counter
   triangle is decisive. */
{
  console.log('\n── ranged troops and engines need a line in front ──');
  const s2 = hold();
  ok('a column of engines has no cover at all', L.coverOf({ ballista: 50 }, 0) === 0);
  ok('a column of pikes needs none', L.coverOf({ spearman: 50 }, 0) === 1);
  ok('engines behind a line are covered',
     L.coverOf({ spearman: 100, ballista: 25 }, 0) === 1,
     'cover ' + L.coverOf({ spearman: 100, ballista: 25 }, 0).toFixed(2));
  ok('an uncovered engine is worth half of a covered one',
     Math.abs(L.coverMult('ballista', 0) - 0.5) < 1e-9 && L.coverMult('ballista', 1) === 1,
     '×' + L.coverMult('ballista', 0) + ' bare vs ×' + L.coverMult('ballista', 1) + ' covered');
  ok('a pike never cares either way',
     L.coverMult('spearman', 0) === 1 && L.coverMult('spearman', 1) === 1);
  /* A wall is a line. Archers behind stonework are sound; the same archers in a field are
     not — which is why a defensive army and a marching column want different shapes. */
  const bare = { ...s2, t:{ spearman:0, archer:200, knight:0, ballista:0 }, b:{ ...s2.b, wall:0 } };
  const walled = { ...s2, t:{ spearman:0, archer:200, knight:0, ballista:0 }, b:{ ...s2.b, wall:12 } };
  ok('a wall counts as the line for the hold behind it',
     L.armyBreakdown(walled).cover > L.armyBreakdown(bare).cover,
     'no wall ' + L.armyBreakdown(bare).cover.toFixed(2) + ' → wall 12 ' + L.armyBreakdown(walled).cover.toFixed(2));

  /* ── why BEATS names three troops and not four ──
     Anyone reading BEATS sees three entries against four lines and reaches for the missing one. I
     did: I tabulated PURE columns, found the battlemage row and column all zeroes, called it "a
     quarter of the army exempt from matchups" and proposed closing the loop into a four-cycle.

     That was measuring a column nobody can field. Drain 1.0 means a battlemage force must bring
     one load of spearman per load of mage or lose half its worth, and a screened mage host is
     already exposed — archers beat spearmen, so archers are its predator at about -18%, while it
     takes knights at +16%. The counterplay runs through the SCREEN, which is the interesting part
     of the design rather than a gap in it.

     So the roster carries two KINDS of weakness on purpose: three lines are countered relationally
     by a specific type, and the battlemage is countered structurally by needing a line in front.
     Closing the cycle would flatten both into one, double-penalise the line already paying the
     game's highest cover tax, and — since mages would beat spearmen — make a mage host its own
     predator, because it is half spearmen. The test below pins the reasoning so the next person to
     spot the "missing" fourth entry finds out why it is missing. */
  console.log('\n── the triangle gives every specialist a predator ──');
  const shares = k => ({ [k]: 1 });
  {
    const bodies = c => { const tot = Object.values(c).reduce((a,b) => a+b, 0), o = {};
      for(const k of Object.keys(D.TROOPS)) o[k] = (c[k] || 0) / tot; return o; };
    /* 50/50 by LOAD, which is what drain 1.0 obliges: 200 spearmen screen 50 battlemages. */
    const mageHost = bodies({ spearman:200, ballista:50 });
    const archerHost = bodies({ archer:150, spearman:50 });
    const knightHost = bodies({ knight:100, spearman:50 });
    ok('a battlemage host is NOT exempt from matchups — its screen exposes it',
       L.matchupEdge(archerHost, mageHost) > 0.1,
       'archers take a mage host by ' + Math.round(L.matchupEdge(archerHost, mageHost) * 100) + '%');
    ok('and it preys on something in turn',
       L.matchupEdge(mageHost, knightHost) > 0.1,
       'a mage host takes knights by ' + Math.round(L.matchupEdge(mageHost, knightHost) * 100) + '%');
    ok('so BEATS is deliberately three entries, not an unfinished four',
       Object.keys(D.BEATS).length === 3 && !D.BEATS.ballista,
       Object.entries(D.BEATS).map(([a,b]) => a + '>' + b).join(' '));
  }
  ok('pikes stop cavalry', L.matchupEdge(shares('spearman'), shares('knight')) > 0.2);
  ok('cavalry runs down archers', L.matchupEdge(shares('knight'), shares('archer')) > 0.2);
  ok('archers shoot the slow line', L.matchupEdge(shares('archer'), shares('spearman')) > 0.2);
  ok('and each of those is symmetric the other way',
     L.matchupEdge(shares('knight'), shares('spearman')) < -0.2 &&
     L.matchupEdge(shares('archer'), shares('knight')) < -0.2 &&
     L.matchupEdge(shares('spearman'), shares('archer')) < -0.2);
  const evenShare = { spearman:0.25, archer:0.25, knight:0.25, ballista:0.25 };
  for(const k of ['spearman','archer','knight','ballista'])
    ok('a balanced force is never ambushed by ' + k,
       Math.abs(L.matchupEdge(evenShare, shares(k))) < 0.1,
       (L.matchupEdge(evenShare, shares(k))*100).toFixed(0) + '%');
  ok('while a specialist swings both ways',
     L.matchupEdge(shares('knight'), shares('archer')) - L.matchupEdge(shares('knight'), shares('spearman')) > 0.5,
     'cavalry: +' + Math.round(L.matchupEdge(shares('knight'), shares('archer'))*100)
       + '% against archers, ' + Math.round(L.matchupEdge(shares('knight'), shares('spearman'))*100) + '% against pikes');

  /* The frontier has to carry the triangle too, or the majority of play is PvE against a
     featureless number and a mono army has no predator across most of the game. */
  console.log('\n── camps hold their ground with something in particular ──');
  const fresh = freshState(Date.now(), 42);
  const camps = fresh.world.tiles.filter(t => t.type === 'camp');
  ok('every camp is garrisoned', camps.length > 0 && camps.every(c => !!c.def),
     camps.length + ' camps: ' + [...new Set(camps.map(c => c.def))].join(', '));
  ok('and not all with the same thing', new Set(camps.map(c => c.def)).size >= 2);
  {
    const s3 = hold();
    s3.t = { spearman:9999, archer:9999, knight:9999, ballista:9999 };
    const party = ['marshal','gatekeeper','forager'];
    const worst = mix => {
      const want = {}; for(const k of Object.keys(D.TROOPS)) want[k] = mix[k] ? 9999 : 0;
      const fit = W.fitColumn(s3, want, party);
      return Math.min(...['spearman','archer','knight'].map(g => W.marchPower(s3, fit.troops, party, 'camp', g)));
    };
    const balanced = worst({ spearman:1, archer:1, knight:1, ballista:1 });
    const monoBest = Math.max(...['spearman','archer','knight','ballista'].map(k => worst({ [k]: 1 })));
    ok('a balanced column has the best guaranteed floor', balanced >= monoBest,
       'balanced ' + balanced + ' vs the best mono floor ' + monoBest);
  }
}

/* ── the four rules of hold-against-hold ──
   Asserted on the pure resolution, not only over HTTP, because these four are the
   whole difference between this and the game it is modelled on. Whiteout Survival does
   not sell power to attackers; it sells RELIEF TO VICTIMS, bought in a panic in the ten
   minutes after someone burned your city. Each rule removes a reason to panic. */
{
  console.log('\n── raids: your wall is survivable, your ambition is not ──');
  const R = await import('../src/raid.js');
  const mk = (troops, opts = {}) => {
    const s = hold();
    s.t = { spearman:0, archer:0, knight:0, ballista:0, ...troops };
    s.b.hospital = opts.hospital == null ? 0 : opts.hospital;   // NO infirmary on purpose
    s.b.warehouse = opts.warehouse || 0;
    s.b.wall = opts.wall == null ? 6 : opts.wall;
    s.res = { food:40000, wood:40000, stone:20000, iron:9000,
              steel:5000, runestone:800, rations:300, isleore:5, electrum:2 };
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

  /* And the other half of rule 1, which the first version of this system got wrong:
     an ATTACKER's soldiers can die, because aggression that costs no blood is not a
     decision. Wounds-only on both sides made raiding free — heal up and go again — so
     the correct play was to raid every cooldown forever. */
  ok('an attacker buries some of their own even in victory', out.attDead > 0,
     out.attDead + ' fell, ' + out.attHurt + ' wounded');
  /* Tested as PROPERTIES of the curve rather than against magic numbers, because the
     properties are what the design actually claims: the cost rises smoothly as the odds
     worsen, and it does not step at the win/loss boundary. The first version switched on
     the outcome, which put a fourfold cliff there — 6% for winning 51-49 against 24% for
     losing 49-51 — and made a coin-flip feel arbitrary. */
  {
    const perTroop = L.tierPower(mk({}), 'spearman');
    const cost = mult => {
      const d = mk({ spearman: 200 });
      const defPower = R.defenceOf(d).total;
      const n = Math.max(1, Math.round(defPower * mult / perTroop));
      const a2 = mk({ spearman: 8000 });
      a2.name = 'A'; d.name = 'D';
      const o = R.resolveRaid(a2, d, { troops:{ spearman: n }, base: n*perTroop, mult: 1 },
                              d.now, () => 0.5);
      return { pct: o.attDead / n, won: o.won, n, def: d, dead: o.attDead };
    };
    const crush = cost(4), overWon = cost(1.05), underLost = cost(0.95), hopeless = cost(0.2);
    ok('a crushing win still costs the column something for good', crush.pct > 0.02,
       Math.round(crush.pct * 100) + '%');
    ok('the cost rises as the odds worsen',
       crush.pct < overWon.pct && overWon.pct <= hopeless.pct + 1e-9,
       [crush, overWon, underLost, hopeless].map(c => Math.round(c.pct*100) + '%').join(' → '));
    /* The property that matters most: no cliff where the outcome flips. */
    ok('winning by a hair and losing by a hair cost nearly the same',
       Math.abs(overWon.pct - underLost.pct) < 0.05 && overWon.won && !underLost.won,
       'won ' + Math.round(overWon.pct*100) + '% vs lost ' + Math.round(underLost.pct*100) + '%');
    ok('and the whole range is a factor of about three, not seven',
       hopeless.pct / crush.pct < 4.5,
       '×' + (hopeless.pct / crush.pct).toFixed(1) + ' from best case to worst');
    /* And the hold that threw back the hopeless charge still buried nobody. */
    const fw = Object.values(hopeless.def.wounded || {}).reduce((a, b) => a + b, 0);
    ok('while the DEFENDER still loses no one, only beds',
       200 - hopeless.def.t.spearman === fw,
       '200 → ' + hopeless.def.t.spearman + ' with ' + fw + ' wounded');
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

/* ── the research tree ──
   The tree grew branches, prerequisites, per-line mastery and a Electrum tier, and the
   LAST test in this block is the one that matters most. Electrum shipped as a resource
   the Crucible produced and nothing on earth spent — a whole refining chain terminating
   in a number no rule read. That bug was invisible because nothing was broken; something
   was merely absent, which is this project's signature failure. So every study is maxed
   in isolation and something observable must move, and the test NAMES any study that
   moves nothing. */
console.log('\n── the research tree is shaped, not a flat list ──');
{
  const keys = Object.keys(R.RESEARCH);
  const unbranched = keys.filter(k => !R.BRANCHES[R.RESEARCH[k].branch]);
  ok('every study sits in a real branch', unbranched.length === 0, unbranched.join(', ') || 'clean');
  ok('both branches are populated',
     R.branchKeys('growth').length > 0 && R.branchKeys('battle').length > 0,
     R.branchKeys('growth').length + ' growth, ' + R.branchKeys('battle').length + ' battle');
  ok('there are prerequisites at all — this is what a flat list lacked',
     keys.some(k => R.RESEARCH[k].needs));

  /* A prerequisite naming a study that does not exist, or demanding a level past that
     study's own maximum, is an permanently unreachable node. Both are silent. */
  const badDep = [];
  for(const k of keys)
    for(const [dep, lvl] of Object.entries(R.RESEARCH[k].needs || {})){
      if(!R.RESEARCH[dep]) badDep.push(k + ' needs unknown ' + dep);
      else if(lvl > R.RESEARCH[dep].max) badDep.push(k + ' needs ' + dep + ' ' + lvl + ' > max ' + R.RESEARCH[dep].max);
    }
  ok('no study requires a level that cannot be reached', badDep.length === 0, badDep.join('; ') || 'clean');

  /* Cycles: A needs B needs A locks both out forever, and nothing would report it. */
  const cyclic = [];
  for(const start of keys){
    const seen = new Set(); const stack = [start];
    while(stack.length){
      const cur = stack.pop();
      if(seen.has(cur)) continue;
      seen.add(cur);
      for(const dep of Object.keys(R.RESEARCH[cur] && R.RESEARCH[cur].needs || {})){
        if(dep === start){ cyclic.push(start); stack.length = 0; break; }
        stack.push(dep);
      }
    }
  }
  ok('no prerequisite cycles', cyclic.length === 0, cyclic.join(', ') || 'clean');

  /* The gates must agree with the tree: a study cannot require a prerequisite that only
     opens at a HIGHER Library level than the study itself, or it can never be legally begun. */
  const gateClash = [];
  for(const k of keys)
    for(const dep of Object.keys(R.RESEARCH[k].needs || {}))
      if(R.RESEARCH[dep].lib > R.RESEARCH[k].lib)
        gateClash.push(k + '(lib ' + R.RESEARCH[k].lib + ') needs ' + dep + '(lib ' + R.RESEARCH[dep].lib + ')');
  ok('no study unlocks before its own prerequisite can', gateClash.length === 0, gateClash.join('; ') || 'clean');
}

console.log('\n── Seafaring: six studies, measured by actually sailing ──');
{
  /* The Salt Isle was the thinnest system in the game — a whole second map with no research on it
     at all. These six exist because the levers were already in the code; none is a new mechanic.
     Four of them only take effect INSIDE voyageStep, so the only honest way to check them is to
     run a real voyage twice with the same seeded rand and compare what came home. The generic
     "every study moves a number" probe cannot see any of this, and it said so. */
  /* Three captains, not none. A column's capacity comes from marchCapacity(s, heroes), so an
     unled column carries 6 load — three spearmen — and its 37 power loses to everything on the
     island. `want` is a per-troop object too, not a headcount: passed a number, every want[k] is
     undefined and the ship silently refuses to sail. Both cost a debugging pass. */
  const CAPTAINS = ['marshal', 'gatekeeper', 'forager'];
  const COLUMN = { spearman:400, archer:200, knight:120, ballista:60 };
  /* wreck at tier 2 asks 1,914 against this column's 4,881, so the landing WINS and the `won`
     branch — where ore, salvage and charting all live — actually runs. It also yields iron and
     stone besides ore, which is what makes Salvage separable from Prospecting.
     hall at tier 2 asks 4,374: still a win, but a near enough one that the loss factor is large
     enough for Seamanship to move it by more than a rounding step. */
  const isleHold = (site = 'wreck') => {
    const s = hold();
    s.b.townhall = 20; s.b.kitchen = 10; s.b.library = 24;
    s.isle = IS.genIsle(4242, 0);
    // the beach at 3,6 is the one cell genIsle always leaves charted
    const beach = IS.cellAt(s.isle, 3, 6);
    beach.site = site; beach.tier = 2; beach.known = true; beach.spent = false;
    s.res.rations = 5000;
    /* Iron and stone start EMPTY. hold() seeds them at 900k, which is over the storage cap, so
       gainRes clamped both runs to the same ceiling and the salvage delta came out as an identical
       -730,650 in each — the gain was real and entirely invisible. The same clamp swallowed a
       wave-plunder fixture earlier in this project's life. */
    s.res.iron = 0; s.res.stone = 0;
    s.research = {};
    s.now = Date.now();
    return s;
  };
  const sail = (research, site = 'wreck') => {
    const s = isleHold(site);
    s.research = research;
    const before = { ore: s.res.isleore || 0, iron: s.res.iron || 0,
                     troops: Object.values(s.t).reduce((a, b) => a + b, 0),
                     known: s.isle.cells.filter(c => c.known).length };
    W.startVoyage(s, 3, 6, COLUMN, CAPTAINS, s.now);
    /* A fixed rand makes the ore roll deterministic, so a difference between two runs can only
       come from the research being measured. */
    W.voyageStep(s, s.now + 99 * 3600 * 1000, () => 0.5);
    return {
      ore: (s.res.isleore || 0) - before.ore,
      iron: (s.res.iron || 0) - before.iron,
      lost: before.troops - Object.values(s.t).reduce((a, b) => a + b, 0),
      known: s.isle.cells.filter(c => c.known).length - before.known,
    };
  };

  const base = sail({});
  ok('a voyage brings Isle Ore home at all', base.ore > 0, '+' + base.ore + ' ore');

  const cheap = isleHold(), dear = isleHold();
  dear.research = { cartography: 10 };
  ok('Cartography shortens the crossing',
     W.voyageTime(dear) < W.voyageTime(cheap),
     Math.round(W.voyageTime(cheap)/60000) + 'm → ' + Math.round(W.voyageTime(dear)/60000) + 'm');
  const vict = isleHold(); vict.research = { victualling: 10 };
  ok('Victualling makes her cheaper to victual',
     W.rationCost(vict) < W.rationCost(cheap),
     W.rationCost(cheap) + ' → ' + W.rationCost(vict) + ' rations');

  const pro = sail({ prospecting: 10 });
  ok('Prospecting brings back more ore', pro.ore > base.ore, base.ore + ' → ' + pro.ore);
  const sal = sail({ salvage: 10 });
  ok('Salvage brings back more of everything else', sal.iron > base.iron,
     base.iron + ' → ' + sal.iron + ' iron');
  ok('and Salvage does NOT quietly raise the ore too', sal.ore === base.ore,
     'ore ' + sal.ore + ' vs ' + base.ore);
  const seaBase = sail({}, 'hall');
  const sea = sail({ seamanship: 10 }, 'hall');
  ok('Seamanship costs fewer men on a contested landing', sea.lost < seaBase.lost,
     seaBase.lost + ' → ' + sea.lost + ' hurt on the Drowned Hall');
  const spy = sail({ spyglass: 2 });
  ok('The Spyglass charts a wider ring', spy.known > base.known,
     base.known + ' → ' + spy.known + ' cells charted');

  /* The pillar this branch must not break: one voyage at a time, whatever you have studied. */
  const two = isleHold(); two.research = { cartography:10, victualling:10, spyglass:2,
                                           prospecting:10, seamanship:10, salvage:10 };
  W.startVoyage(two, 3, 6, COLUMN, CAPTAINS, two.now);
  ok('no amount of Seafaring buys a second simultaneous voyage',
     W.voyageBlockedBy(two, 3, 6) === 'Your ship is already at sea',
     String(W.voyageBlockedBy(two, 3, 6)));
}

console.log('\n── an expedition has to actually go somewhere ──');
{
  /* Reported from play: "expeditions should give rewards after they are complete, not when you send
     them." They paid out on the press and set a cooldown, so the log line said "returns" about a
     party that had never left — an instant payout dressed as a journey. */
  const hold = () => {
    const s = freshState(Date.now(), 1);
    s.b.townhall = 8; s.b.tavern = 3;
    s.res = { food:5000, wood:5000, stone:5000, iron:5000, steel:0, runestone:0,
              rations:0, isleore:0, electrum:0 };
    /* No troops. A garrison EATS — 200 spearmen drained food during the tick and during
       applyOffline, and the first version of these assertions read that upkeep as the expedition
       paying out early, then as it failing to pay at all. Isolate the thing being measured. */
    s.t = { spearman:0, archer:0, knight:0, ballista:0 };
    s.patrolReady = 0; s.now = Date.now();
    return s;
  };
  const s = hold();
  const before = { ...s.res }, valor = s.valor;
  ok('sending one takes it out of the yard', L.expedition(s, 'kingsroad', s.now) === true);
  ok('and NOTHING arrives on the press',
     s.res.food === before.food && s.res.wood === before.wood && s.valor === valor,
     'food ' + s.res.food + ', wood ' + s.res.wood + ', valor ' + s.valor);
  ok('the party is recorded as away', !!L.expedPending(s),
     JSON.stringify(L.expedPending(s) && L.expedPending(s).route));
  ok('and a second cannot be sent while it is out',
     L.expedition(s, 'barrows', s.now) === false);

  /* The reward lands when it comes home, and the tick is what brings it. */
  const end = L.expedPending(s).end;
  L.tick(s, end - 1000, 1);
  /* Assert the STATE, not the stockpile: the Farm produces during the tick, so "food is unchanged"
     was never going to hold — it read 4990 with a garrison eating and 5002 without one. Both times
     the number moved for reasons that had nothing to do with the expedition. */
  ok('still away a second before it is due',
     !!L.expedPending(s) && (s.res.food - before.food) < 10,
     'pending, and only +' + (s.res.food - before.food).toFixed(1) + ' food from production');
  L.tick(s, end + 1000, 1);
  ok('and the goods land when it returns',
     s.res.food > before.food && s.res.wood > before.wood && s.valor > valor,
     '+' + Math.round(s.res.food - before.food) + ' food, +'
       + Math.round(s.res.wood - before.wood) + ' wood, +' + Math.round(s.valor - valor) + ' Valor');
  ok('and the road is open again', !L.expedPending(s));

  /* Sent, then the app closes. It must be home and paid when you come back, not waiting to be
     noticed — the same contract applyOffline already keeps for production and the caravan. */
  const s2 = hold();
  L.expedition(s2, 'kingsroad', s2.now);
  const f2 = s2.res.food;
  s2.now = L.expedPending(s2).end + 60000;
  ST.applyOffline(s2, 3600000);
  ok('a party sent before the app closed is home and paid when you return',
     !L.expedPending(s2) && s2.res.food > f2,
     'food ' + Math.round(f2) + ' → ' + Math.round(s2.res.food));

  /* And the cadence is unchanged: the cooldown BECAME the journey rather than being added to it. */
  const s3 = hold();
  const dur = L.expedCdMs(s3);
  L.expedition(s3, 'kingsroad', s3.now);
  ok('the journey is exactly the old cooldown, so pacing did not move',
     Math.abs((L.expedPending(s3).end - s3.now) - dur) < 2 && s3.patrolReady === s3.now + dur,
     'journey ' + Math.round(dur/1000) + 's, next available at the same moment');
}

console.log('\n── the haul depends on the troops you send ──');
{
  /* Reported from play: "gathering nodes should be collected based on troops sent — if I send a full
     march or 1/4 march it doesn't change anything." The loot was computed from the tile and a bonus
     multiplier and never once looked at the column, so three soldiers stripped a node as thoroughly
     as three hundred. A whole input the player was choosing did nothing at all. */
  const hold = () => {
    const s = freshState(Date.now(), 1);
    s.b.townhall = 6;
    for(const k of ['farm','lumberyard','quarry','command','barracks']) s.b[k] = 5;
    for(const id of ['marshal','gatekeeper','forager'])
      s.heroes[id] = { lvl:5, xp:0, stars:0, deeds:0, gear:{}, skills:[] };
    s.t = { spearman:400, archer:200, knight:120, ballista:60 };
    s.now = Date.now();
    return s;
  };
  const CAPTAINS = ['marshal','gatekeeper','forager'];
  /* Find a gather tile the hold can legally work, rather than assuming one is at a fixed index. */
  const pick = s => s.world.tiles.findIndex((t, i) =>
    W.TILE_TYPES[t.type].kind === 'gather' && !t.respawnAt && !W.tileLocked(s, t) && !W.tileBusy(s, i));
  const haulWith = frac => {
    const s = hold();
    const idx = pick(s);
    const cap = W.marchCapacity(s, CAPTAINS);
    W.startMarch(s, idx, { spearman: Math.max(1, Math.floor(cap * frac)) }, s.now, false, CAPTAINS);
    const m = s.marches[0];
    W.tickWorld(s, s.now + 99 * 3600 * 1000, () => 0.5);
    return Object.values(m.loot || {}).reduce((a, b) => a + b, 0);
  };
  /* And the ceiling is what the BEST party could carry, so a captain can only raise it. Dividing by
     the CHOSEN party's capacity meant adding a second leader lifted the denominator while the troops
     stayed put — reported with screenshots as 100% dropping to 62% for bringing more help. */
  {
    const s1 = hold(), idx1 = pick(s1);
    const cap1 = W.marchCapacity(s1, ['marshal']);
    const oneCap = (() => { W.startMarch(s1, idx1, { spearman: cap1 }, s1.now, false, ['marshal']);
                            return s1.marches[0].fill; })();
    const s2b = hold(), idx2 = pick(s2b);
    const twoCap = (() => { W.startMarch(s2b, idx2, { spearman: cap1 }, s2b.now, false, CAPTAINS);
                            return s2b.marches[0].fill; })();
    ok('adding a captain never shrinks the haul for the same troops',
       Math.abs(oneCap - twoCap) < 0.001,
       'one captain ' + (oneCap*100).toFixed(0) + '%, three captains ' + (twoCap*100).toFixed(0) + '%');
  }

  const quarter = haulWith(0.25), full = haulWith(1);
  ok('a quarter-full column brings home about a quarter as much',
     quarter > 0 && full > quarter * 2.5 && full < quarter * 5.5,
     quarter + ' against ' + full + ' — ×' + (full / Math.max(quarter, 1)).toFixed(1));
  ok('and a full column is not short-changed', full > 0 && Math.abs(full - haulWith(1)) / full < 0.01,
     'full haul ' + full + ', reproducible');
  /* A march already on the road when this shipped has no `fill` recorded, and must pay in full
     rather than be silently docked halfway home. */
  const s2 = hold(); const i2 = pick(s2);
  W.startMarch(s2, i2, { spearman: 40 }, s2.now, false, CAPTAINS);
  const legacy = s2.marches[0];                     // held: a resolved march leaves s.marches
  delete legacy.fill;                               // an in-flight column from before the change
  W.tickWorld(s2, s2.now + 99 * 3600 * 1000, () => 0.5);
  const paid = Object.values(legacy.loot || {}).reduce((a, b) => a + b, 0);
  ok('a column already marching when this shipped still pays in full', paid > 0,
     'legacy march hauled ' + paid);
}

console.log('\n── gathering has to beat standing still ──');
{
  /* Reported from play: "gathering gives too little", then "gatherings should feel rewarded since
     it's something active and not passive", then the observation that settles the number —
     "rss buildings give rss even when you're offline".

     That last one is the whole argument. Production is the floor a hold gets for FREE: applyOffline
     grants it in full whether anyone is watching or not. Gathering is paid for in attention, and in
     troops standing away from the wall while they do it. So it has to clear the floor by a margin,
     and it did the opposite — measured at Town Hall 3, a run paid ×0.58 of what the Farm made on
     its own, ×0.66 the Quarry, ×0.76 the Lumberyard. An active mechanic was worth less per minute
     than closing the app. */
  /* gatherYield reads the tile's DISTANCE now — the yield is anchored to the real round trip rather
     than to an assumed 2.2 minutes — so these must use tiles off the actual map. A synthetic
     {lvl, type} has no coordinates and tileDist returns NaN, which is how the first version of this
     reported "worst case ×NaN" instead of failing on a number. */
  const tripMin = (s, tile) =>
    (2 * W.tileDist(tile) * W.TRAVEL_MS_PER_TILE * W.marchSpeed(s) + W.GATHER_MS) / 60000;
  const ratios = [];
  for(const [th, bl] of [[3,2],[6,5],[10,9],[15,14],[20,19],[25,24],[30,30]]){
    const s = freshState(Date.now(), 1);
    s.b.townhall = th;
    for(const k of ['farm','lumberyard','quarry','ironmine','granary']) s.b[k] = bl;
    const seen = new Set();
    for(const tile of s.world.tiles){
      const def = W.TILE_TYPES[tile.type];
      if(def.kind !== 'gather' || seen.has(def.res)) continue;
      seen.add(def.res);
      const perMin = L.prodPerSec(s, def.res) * 60;
      if(perMin <= 0) continue;
      ratios.push({ th, res: def.res, r: W.gatherYield(s, tile) / tripMin(s, tile) / perMin });
    }
  }
  const worst = ratios.reduce((a, b) => a.r < b.r ? a : b);
  ok('a gather run always beats the same minutes of free production',
     worst.r >= 1.5,
     'worst case ×' + worst.r.toFixed(2) + ' (' + worst.res + ' at Town Hall ' + worst.th + ')');
  /* And by the SAME margin for every resource, or one of them is quietly the wrong thing to fetch —
     which is what weighting food lowest did while the Farm produced the most. */
  /* Equal per LOAD OF TRIP, which is the honest comparison now that each resource's tiles sit at
     their own distances and levels. The old per-Town-Hall equality assumed every resource was being
     fetched from an identical tile, which the map does not offer. */
  const s0 = freshState(Date.now(), 1); s0.b.townhall = 10;
  for(const k of ['farm','lumberyard','quarry','ironmine','granary']) s0.b[k] = 9;
  const sameTile = [];
  for(const tile of s0.world.tiles){
    const def = W.TILE_TYPES[tile.type];
    if(def.kind !== 'gather' || tile.lvl !== 3) continue;
    const perMin = L.prodPerSec(s0, def.res) * 60;
    if(perMin > 0) sameTile.push(W.gatherYield(s0, tile) / tripMin(s0, tile) / perMin);
  }
  ok('and every resource is worth fetching equally',
     sameTile.length < 2 || Math.max(...sameTile) / Math.min(...sameTile) < 1.05,
     sameTile.length + ' resources at level-3 tiles, spread ×'
       + (sameTile.length < 2 ? 'n/a' : (Math.max(...sameTile)/Math.min(...sameTile)).toFixed(3)));

  /* A node whose production building does not exist yet must still be worth the trip — the Iron
     Vein before an Iron Mine is the case, and anchoring to production alone would make it zero. */
  const bare = freshState(Date.now(), 1); bare.b.townhall = 3;
  const vein = bare.world.tiles.find(t => t.type === 'ironvein');
  ok('a node is worth taking even with no matching building at all',
     vein && W.gatherYield(bare, vein) > 40,
     (vein ? W.gatherYield(bare, vein) : 0) + ' iron from a vein with no Iron Mine');
}

console.log('\n── the Road, the Watch and the Court all move real numbers ──');
{
  /* Three branches over the last systems with no research on them: marching, the wall between
     raids, and the captains. Every lever already existed — marchSpeed, marchCapacity, gatherYield,
     the road's loss factor, marchSlots, the wear per assault, the masons' rate and their stone,
     the Writ ceiling, hero xp, leadBonus and the court's seats — so nothing here is a new mechanic
     and nothing is a filler rung. Each is measured against the function it claims to change. */
  const at = res => {
    const s = hold();
    s.b.townhall = 20; s.b.command = 20; s.b.wall = 10; s.b.library = 24;
    s.research = res; s.now = Date.now();
    return s;
  };
  const bare = at({});

  // ── The Road ──
  ok('Roadwork shortens every march',
     W.marchSpeed(at({ roadwork:10 })) < W.marchSpeed(bare),
     W.marchSpeed(bare).toFixed(2) + ' → ' + W.marchSpeed(at({ roadwork:10 })).toFixed(2));
  const party = ['marshal','gatekeeper','forager'];
  ok('Baggage Train carries more',
     W.marchCapacity(at({ baggage:10 }), party) > W.marchCapacity(bare, party),
     W.marchCapacity(bare, party) + ' → ' + W.marchCapacity(at({ baggage:10 }), party) + ' load');
  const tile = bare.world.tiles.find(t => t.type === 'woods');   // a real tile: yield reads its distance
  ok('Foraging brings more off a gathering tile',
     W.gatherYield(at({ foraging:10 }), tile) > W.gatherYield(bare, tile),
     W.gatherYield(bare, tile) + ' → ' + W.gatherYield(at({ foraging:10 }), tile));
  ok('Relay Posts open another column, one per level',
     W.marchSlots(at({ relays:2 })) === W.marchSlots(bare) + 2,
     W.marchSlots(bare) + ' → ' + W.marchSlots(at({ relays:2 })) + ' marches');

  // ── The Watch ──
  const wearAfter = res => { const s = at(res); s.wallWear = 0; L.batterWall(s, 1); return s.wallWear; };
  ok('Ramparts means an assault loosens less of the wall',
     wearAfter({ ramparts:10 }) < wearAfter({}),
     wearAfter({}).toFixed(3) + ' → ' + wearAfter({ ramparts:10 }).toFixed(3) + ' per hit');
  const mend = res => { const s = at(res); s.wallWear = 0.3; return L.wallMendPerSec(s); };
  ok('Mortarwork has the masons working faster',
     mend({ mortar:10 }) > mend({}),
     mend({}).toFixed(2) + ' → ' + mend({ mortar:10 }).toFixed(2) + ' per second');
  /* Quarrymen acts inside the tick, where the masons are actually paid, so it is measured by
     running one and comparing the stone that left the vault. */
  const stoneSpent = res => {
    const s = at(res); s.wallWear = 0.3;
    /* Stone must start BELOW the storage cap. Seeded at 500,000 against a Town Hall 20 cap near
       168,000, the tick clamped the overflow away and reported it as spending: the masons' 75-stone
       bill sat inside a 330,900 swing that was pure clamp. Third time this cap has swallowed a
       measurement in this suite — the wave-plunder fixture and the Salvage haul were the others. */
    s.res.stone = Math.round(L.capFor(s, 'stone') * 0.5);
    s.b.forge = 0; s.b.runeworks = 0; s.b.crucible = 0;   // and they eat stone too
    const before = s.res.stone;
    L.tick(s, s.now + 60000, 60);          // (s, now, dt) — omitting dt is what made this NaN
    return before - s.res.stone;
  };
  ok('Quarrymen makes the same mending cost less stone',
     stoneSpent({ quarrymen:10 }) < stoneSpent({}),
     Math.round(stoneSpent({})) + ' → ' + Math.round(stoneSpent({ quarrymen:10 })) + ' stone a minute');
  ok('the Vigil holds one more Writ per level',
     L.shieldCap(at({ vigil:2 })) === L.shieldCap(bare) + 2,
     L.shieldCap(bare) + ' → ' + L.shieldCap(at({ vigil:2 })) + ' Writs');

  // ── The Court ──
  const xpGain = res => {
    const s = at(res);
    s.heroes.marshal = { lvl:5, xp:0, stars:0, deeds:0, gear:{}, skills:[] };
    return L.gainHeroXp(s, 'marshal', 100);
  };
  ok('Tutelage teaches captains faster', xpGain({ tutelage:10 }) > xpGain({}),
     xpGain({}) + ' → ' + xpGain({ tutelage:10 }) + ' xp from the same deed');
  /* And it must reach EVERY grant. There are five, and the point of the funnel is that none of
     them can be left behind — so no file may still add to a hero's xp by hand. */
  const handGrants = ['../src/logic.js', '../src/world.js', '../src/arena.js'].flatMap(f => {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8');
    return (src.match(/\.xp\s*\+=/g) || []).map(() => f);
  });
  /* Exactly one, and it is the funnel's own `h.xp += got`. Any second is a site that skipped it. */
  ok('and every xp grant in the game goes through that one funnel', handGrants.length === 1,
     handGrants.length + ' direct writes to .xp (want 1, the funnel itself)');
  ok('Heraldry has a captain leading harder',
     L.leadBonus(at({ heraldry:10 }), 'marshal', D.HERO_POOL.marshal.lead.key)
       > L.leadBonus(bare, 'marshal', D.HERO_POOL.marshal.lead.key));
  /* The High Table lifts the CEILING. A hold at Town Hall 20 already sits at COURT_MAX, which is
     exactly the hold deep enough to have studied it — a study that only added seats would do
     nothing for its own audience. */
  ok('the High Table seats one more even at a maxed court',
     L.courtSeats(at({ chairs:1 })) === L.courtSeats(bare) + 1,
     L.courtSeats(bare) + ' → ' + L.courtSeats(at({ chairs:1 })) + ' chairs');
}

console.log('\n── a save from before the Electrum rename carries over ──');
{
  /* Truegold was Kingshot's resource name shipping verbatim, so the metal became Electrum and the
     KEYS moved with the label rather than leaving the old one littered through the code. That makes
     every save written earlier a migration problem, and a dropped resource is exactly the failure
     no other suite here would notice — the game would simply open with an empty vault and nothing
     would look broken. */
  const old = ST.freshState(Date.now(), 7);
  old.res = { food:100, wood:100, stone:100, iron:50, steel:20, runestone:5, rations:9,
              trueore:44, truegold:17 };
  delete old.res.isleore; delete old.res.electrum;
  old.research = { tg_might:6, tg_hoard:3, husbandry:4 };
  old.rq = { key:'tg_bulwark', start:0, end:0 };
  const s = ST.migrate(old);
  ok('the metal survives under its new key', s.res.electrum === 17, String(s.res.electrum));
  ok('and so does Isle Ore', s.res.isleore === 44, String(s.res.isleore));
  ok('levels already studied are kept',
     s.research.el_might === 6 && s.research.el_hoard === 3,
     'el_might ' + s.research.el_might + ', el_hoard ' + s.research.el_hoard);
  ok('an untouched study is undisturbed', s.research.husbandry === 4);
  ok('the old keys are gone rather than left to shadow the new ones',
     s.res.truegold === undefined && s.res.trueore === undefined
       && s.research.tg_might === undefined);
  /* A study in flight under the old key would otherwise complete into a study that no longer
     exists, silently losing however many hours were already spent on it. */
  ok('a study already in the queue is renamed too', s.rq.key === 'el_bulwark', s.rq.key);

  /* And nothing anywhere may still reference the old names, or a rule would read a key that
     migration has just deleted. */
  const files = ['../src/defs.js', '../src/logic.js', '../src/research.js', '../src/ui.js',
                 '../src/world.js', '../src/isle.js', '../src/state.js'];
  const stale = [];
  for(const f of files){
    const src = readFileSync(new URL(f, import.meta.url), 'utf8');
    /* state.js is allowed to name them — it is the one file that has to, to migrate them. */
    if(f.endsWith('state.js')) continue;
    if(/truegold|trueore|tg_might|tg_bulwark|tg_harvest|tg_hoard/i.test(src)) stale.push(f);
  }
  ok('no rule outside the migration still names the old keys', stale.length === 0,
     stale.join(', ') || 'clean');
}

console.log('\n── no line may be the answer to every question ──');
{
  /* These exist because retuning the knight's cover profile — the change that ended a
     two-of-four meta — broke NOT ONE existing test. Every guard here measured power-per-load
     BEFORE cover, which the old numbers passed at ×1.20 while the spread a player actually
     fielded was ×1.83. A whole dominant strategy lived in that gap, undetected. */

  const s = hold();
  s.b.townhall = 25; s.b.wall = 0; s.b.academy = 30;
  s.tier = { spearman:5, archer:5, knight:5, ballista:5 };
  s.research = {}; s.now = Date.now();
  const KEYS = Object.keys(D.TROOPS);

  /* 1. ESCORTED EFFICIENCY — the quantity that actually decides composition. A damage line does
        not fight alone; it fights behind spearmen, and its drain says how many it must bring. */
  const SP = D.TROOPS.spearman.power / D.LOAD.spearman;
  const escorted = k => {
    const drain = Math.max(0, D.NEEDS[k] - D.HOLDS[k]);
    return (D.TROOPS[k].power / D.LOAD[k] + SP * drain) / (1 + drain);
  };
  const effs = KEYS.filter(k => k !== 'spearman').map(escorted);
  ok('every damage line costs the same per point of power, screen included',
     Math.max(...effs) / Math.min(...effs) < 1.08,
     KEYS.filter(k => k !== 'spearman').map(k => k.slice(0,2) + ' ' + escorted(k).toFixed(2)).join(', ')
       + ' → ×' + (Math.max(...effs)/Math.min(...effs)).toFixed(3));
  /* The knight's old profile is the specific thing this refuses: a negative drain means no escort
     at all, so the line keeps its whole power-per-load and every other line pays a tax it does not. */
  ok('and none of them escapes the screen entirely',
     KEYS.every(k => k === 'spearman' || D.NEEDS[k] > D.HOLDS[k]),
     KEYS.filter(k => k !== 'spearman')
       .map(k => k.slice(0,2) + ' drain ' + (D.NEEDS[k] - D.HOLDS[k]).toFixed(2)).join(', '));

  /* 2. NO LINE BEST ON EVERY CONSTRAINT. A player is limited by column load when marching, by
        resources when building, and by food when standing an army. Knights used to top all three. */
  const monoPower = (k, n) => {
    const t = { spearman:0, archer:0, knight:0, ballista:0, [k]: n };
    return L.tierPower(s, k) * n * L.coverMult(k, L.coverOf(t, 0));
  };
  const per = {
    load:   k => D.LOAD[k],
    cost:   k => Object.values(D.TROOPS[k].cost).reduce((a,b) => a+b, 0) * L.tierCostMult(s, k),
    upkeep: k => L.tierUpkeep(s, k),
  };
  const winners = {};
  for(const [axis, cost] of Object.entries(per)){
    const budget = axis === 'load' ? 400 : axis === 'cost' ? 100000 : 60;
    let best = null;
    for(const k of KEYS){
      const p = monoPower(k, Math.floor(budget / cost(k)));
      if(!best || p > best.p) best = { k, p };
    }
    winners[axis] = best.k;
  }
  const sweep = KEYS.filter(k => Object.values(winners).every(w => w === k));
  ok('no single line is the best answer on load AND cost AND upkeep', sweep.length === 0,
     Object.entries(winners).map(([a,k]) => a + '→' + k).join(', '));

  /* 3. THE OPTIMAL COLUMN USES THE ARMY. Searched over every composition in 5% steps — the old
        numbers answered 65% knights / 35% battlemages with spearmen and archers in none of the
        top six, which is a two-of-four meta wearing a four-troop game's clothes. */
  const LOADB = 400;
  const powerOf = cnt => {
    const cov = L.coverOf(cnt, 0);
    return KEYS.reduce((a, k) => a + L.tierPower(s, k) * (cnt[k] || 0) * L.coverMult(k, cov), 0);
  };
  let top = null; const step = 0.05;
  for(let a = 0; a <= 1.0001; a += step)
    for(let b = 0; a + b <= 1.0001; b += step)
      for(let c = 0; a + b + c <= 1.0001; c += step){
        const d = 1 - a - b - c; if(d < -1e-9) continue;
        const share = { spearman:a, archer:b, knight:c, ballista:d }, cnt = {};
        for(const k of KEYS) cnt[k] = Math.floor(LOADB * share[k] / D.LOAD[k]);
        const p = powerOf(cnt);
        if(!top || p > top.p) top = { share, p };
      }
  const used = KEYS.filter(k => top.share[k] > 0.001);
  ok('the best column in the game fields at least three of the four lines',
     used.length >= 3,
     KEYS.map(k => k.slice(0,2) + Math.round(top.share[k]*100) + '%').join(' '));

  /* 4. AND MIXING MUST PAY. Cover is the whole reason to bring a screen; if a pure column ever
        matched the best mix, the interdependence would be decorative. */
  const bestMono = Math.max(...KEYS.map(k => monoPower(k, Math.floor(LOADB / D.LOAD[k]))));
  ok('and beats every pure column', bestMono < top.p,
     'best mono ' + Math.round(bestMono) + ' against the optimum ' + Math.round(top.p)
       + ' (' + ((bestMono/top.p - 1) * 100).toFixed(0) + '%)');
}

console.log('\n── per-line mastery must not pay for specialising ──');
{
  /* "Do all the troop masteries cost the same? Else people could focus on one type." They do NOT
     cost the same — each is priced at fourteen times its own troop's cost, so mastering
     Battlemages runs 1.64M against Spearmen's 478K. The question is whether that, or the bonus
     itself, hands an edge to whoever picks the right line.

     The comparison that answers it is between two players who have each invested — not between an
     invested line and an untouched one, which is just progression. Each specialist gets the same
     +30% on their own line, so it cancels in the ratio, and the counter triangle decides exactly
     as it did before anyone studied anything. Measured rather than argued: the same matchups come
     out identical with both specialists maxed and with neither researched at all. */
  const LOADB = 400;
  const mk = res => {
    const s = hold();
    s.b.townhall = 25; s.b.wall = 0; s.b.academy = 30; s.b.library = 30;
    s.tier = { spearman:5, archer:5, knight:5, ballista:5 };
    s.research = res; s.now = Date.now();
    return s;
  };
  const monoPower = (k, res) => {
    const s = mk(res);
    const n = Math.floor(LOADB / (D.LOAD[k] || 1));
    s.t = { spearman:0, archer:0, knight:0, ballista:0, [k]: n };
    const b = L.armyBreakdown(s);
    return b.base * b.mult;
  };
  const shares = k => ({ [k]: 1 });
  const outcome = (pred, prey, res) => {
    const a = monoPower(pred, res(pred)), b = monoPower(prey, res(prey));
    return a * (1 + L.matchupEdge(shares(pred), shares(prey))) / b;
  };
  const none = () => ({});
  const own = k => ({ ['line_' + k]: R.LINE_MAX });

  const drift = [];
  for(const [pred, prey] of [['spearman','knight'], ['knight','archer'], ['archer','spearman']]){
    const bare = outcome(pred, prey, none);
    const both = outcome(pred, prey, own);
    if(Math.abs(both - bare) > 0.001)
      drift.push(pred + '>' + prey + ' ' + bare.toFixed(3) + '→' + both.toFixed(3));
  }
  ok('two equally-invested specialists meet exactly as they would unresearched',
     drift.length === 0,
     drift.join('; ') || 'all three triangle matchups unchanged to within 0.1%');

  /* And the prices, while different, track what the line itself costs — so the mastery is dear in
     proportion to the army it improves rather than to the good it does. */
  const bill = k => {
    const s = mk({}); const key = 'line_' + k; let t = 0;
    for(let l = 0; l < R.RESEARCH[key].max; l++){
      s.research = { [key]: l };
      t += Object.values(R.techCost(s, key)).reduce((a, b) => a + b, 0);
    }
    return t;
  };
  const ratios = Object.keys(D.TROOPS).map(k =>
    bill(k) / Object.values(D.TROOPS[k].cost).reduce((a, b) => a + b, 0));
  ok('every mastery is the same multiple of its own troop\'s price',
     Math.max(...ratios) / Math.min(...ratios) < 1.01,
     ratios.map(r => Math.round(r)).join(', ') + '× the troop cost');
}

console.log('\n── a study you can see is a study you can pay for ──');
{
  /* A study priced in a refined good whose refinery opens LATER than the study does is a Begin
     button no hold in the game can press. It looks available, it is not, and nothing complains.
     el_harvest shipped exactly like that: priced in runestone, which only the Runeworks makes at
     Town Hall 22, while the Electrum tier gated at 18 — four Town Hall levels of a live button
     that could never be afforded. Derived from REFINE so a new refined good is covered for free. */
  const source = {};
  for(const [b, d] of Object.entries(D.REFINE || {})) source[d.out] = b;
  const bad = [];
  for(const [k, d] of Object.entries(R.RESEARCH))
    for(const res of Object.keys(d.cost)){
      const b = source[res];
      if(b && D.BUILDINGS[b].th > d.th)
        bad.push(k + ' opens at TH' + d.th + ' but wants ' + res
                 + ', and ' + D.BUILDINGS[b].name + ' is TH' + D.BUILDINGS[b].th);
    }
  ok('no study is priced in a resource its hold cannot yet make', bad.length === 0,
     bad.join('; ') || 'all ' + Object.keys(R.RESEARCH).length + ' payable on unlock');

  /* And the Electrum tier must open when the Crucible does, or the metal has a window with no
     sink again — the original bug, in miniature. */
  const early = Object.keys(R.ELECTRUM).filter(k => R.RESEARCH[k].th <= D.BUILDINGS.crucible.th);
  ok('the Electrum tier opens with the Crucible that feeds it', early.length > 0,
     early.length + ' of ' + Object.keys(R.ELECTRUM).length + ' at TH'
       + D.BUILDINGS.crucible.th + ', so the metal always has somewhere to go');
}

console.log('\n── the scholars never run out of work waiting for Electrum ──');
{
  /* The question is whether a hold can finish every non-Electrum study and then sit idle until the
     Electrum gates open. It cannot, and the reason is that research is far slower than the
     buildings that gate it — but that is a claim about two independent curves, so it is measured
     rather than asserted. */
  const s = hold(); s.b.library = 30; s.b.crucible = 20;
  const daysOf = br => {
    let ms = 0;
    for(const k of R.branchKeys(br)){
      const d = R.RESEARCH[k];
      for(let l = 0; l < d.max; l++){ s.research = { [k]: l }; ms += R.techTime(s, k); }
    }
    return ms / 86400000;
  };
  const nonElectrum = ['growth', 'battle', 'seafaring'].reduce((a, b) => a + daysOf(b), 0);

  /* Walk a minimal legal path to the Electrum gates, paying the Town Hall's pair rule as it goes,
     and total the build queue. Everything is affordable so this measures TIME, which is the
     binding constraint here. */
  const b = freshState(Date.now(), 1);
  b.res = { food:1e12, wood:1e12, stone:1e12, iron:1e12, steel:1e12,
            runestone:1e12, rations:1e12, isleore:1e12, electrum:1e12 };
  let buildDays = 0, guard = 0;
  const raise = k => { buildDays += L.buildTime(b, k) / 86400000; b.b[k] = (b.b[k] || 0) + 1; };
  while(b.b.townhall < 18 && guard++ < 8000){
    if(L.townhallReq(b).ok){ raise('townhall'); continue; }
    const p = L.townhallPath(b);
    const next = p.path && p.path[0] ? p.path[0].key : null;
    if(!next) break;
    raise(next);
  }
  while((b.b.library || 0) < R.EL_LIB) raise('library');
  while((b.b.crucible || 0) < 1) raise('crucible');

  ok('the Electrum gates are reached long before the other branches are exhausted',
     buildDays < nonElectrum,
     'gates at ' + buildDays.toFixed(1) + ' days of build queue against '
       + nonElectrum.toFixed(1) + ' days of research still to run');
  /* A comfortable margin, not a photo finish — if this ever narrows below a few days, a player
     who rushes the Library really could out-research the tree. */
  ok('and with room to spare, not by a hair', nonElectrum - buildDays > 5,
     (nonElectrum - buildDays).toFixed(1) + ' days of slack');
}

console.log('\n── the tree draws as a tree ──');
{
  /* The list view carried the same prerequisites and communicated almost none of them. The tree
     view is the fix, and these are the invariants a DRAWING needs that a list did not. */
  for(const br of Object.keys(R.BRANCHES)){
    const rows = R.treeRows(br);
    const flat = rows.flat();
    const keys = R.branchKeys(br);
    ok(br + ': every study is placed exactly once',
       flat.length === keys.length && new Set(flat).size === keys.length,
       flat.length + ' placed of ' + keys.length);
    ok(br + ': no empty row — a gap would draw as a break in the tree',
       rows.every(r => r.length > 0), rows.map(r => r.length).join('-'));

    /* The one that matters most. Every connector is drawn from a prerequisite DOWN to the study
       needing it, so a prerequisite sharing or exceeding its dependent's row would render as a
       line going sideways or backwards — a picture that contradicts the rules it is drawing.
       Husbandry and Masonry both sit at Library 1 and would have collided on exactly this, which
       is why rows are a longest-path layering with the Library rank only as a floor. */
    const at = {};
    rows.forEach((r, i) => r.forEach(k => { at[k] = i; }));
    const wrong = [];
    for(const k of keys)
      for(const dep of Object.keys(R.RESEARCH[k].needs || {}))
        if(at[dep] != null && at[dep] >= at[k])
          wrong.push(R.RESEARCH[k].name + '(row ' + at[k] + ') needs ' + R.RESEARCH[dep].name + '(row ' + at[dep] + ')');
    ok(br + ': every prerequisite sits strictly above what it unlocks',
       wrong.length === 0, wrong.join('; ') || rows.length + ' rows, all edges point down');
  }

  /* Portrait is the whole point of the layout: the widest row has to fit a phone without the
     player having to pan to find a node. 70px nodes with 6px gaps, and roughly 318px of usable
     width once the page padding and the dock's column are taken out. */
  const widest = Math.max(...Object.keys(R.BRANCHES).flatMap(br => R.treeRows(br).map(r => r.length)));
  const px = widest * 76 - 6 + 9 * 2;          // node field + a channel down each side
  ok('the widest row fits a portrait phone without panning', px <= 318,
     widest + ' nodes + channels = ' + px + 'px of the ~318px available');

  /* Every node needs a short label — the full name does not fit in 70px, and a node falling back
     to `undefined` is the kind of thing only a screenshot would catch. */
  const noShort = Object.keys(R.RESEARCH).filter(k => !R.RESEARCH[k].short);
  ok('every study has a short label for its node', noShort.length === 0, noShort.join(', ') || 'clean');
  const tooLong = Object.entries(R.RESEARCH).filter(([, d]) => d.short.length > 11);
  ok('and none of them overflows the node', tooLong.length === 0,
     tooLong.map(([k, d]) => k + '="' + d.short + '"').join(', ') || 'longest is '
       + Math.max(...Object.values(R.RESEARCH).map(d => d.short.length)) + ' chars');

  /* ── connectors must not run through unrelated nodes ──
     Reproduces the renderer's geometry exactly (ui.js: NODE_W 70, NODE_H 62, COL_GAP 6, ROW_GAP
     26, rows centred) and checks every edge's long vertical segment against every node box it
     passes. The first routing drew four Warcraft→Mastery edges straight across Medicine and
     Plunder; the fix drops each line at its TARGET's column, which clears the centre column by
     only a few pixels. That margin is too small to take on trust, so it is measured. */
  {
    const NODE_W = 70, NODE_H = 62, COL_GAP = 6, ROW_GAP = 26, CHAN = 9;
    const bad = [];
    let far = 0;
    for(const br of Object.keys(R.BRANCHES)){
      const rows = R.treeRows(br);
      const widest = Math.max(...rows.map(r => r.length), 1);
      const NW = widest * (NODE_W + COL_GAP) - COL_GAP;
      const W = NW + CHAN * 2;
      const pos = {};
      rows.forEach((keys, r) => {
        const rowW = keys.length * (NODE_W + COL_GAP) - COL_GAP;
        const x0 = CHAN + (NW - rowW) / 2;
        keys.forEach((k, i) => {
          pos[k] = { x: x0 + i * (NODE_W + COL_GAP), y: r * (NODE_H + ROW_GAP), row: r };
        });
      });
      const boxes = Object.entries(pos);
      /* Walk each edge as a list of segments, exactly as the renderer emits them, and test every
         segment against every unrelated node box. Checking only the long vertical would have
         missed a horizontal run clipping a neighbour. */
      for(const k of Object.keys(pos)){
        for(const dep of Object.keys(R.RESEARCH[k].needs || {})){
          if(!pos[dep]) continue;
          const a = pos[dep], b = pos[k];
          const x1 = a.x + NODE_W/2, y1 = a.y + NODE_H;
          const x2 = b.x + NODE_W/2, y2 = b.y;
          const gapA = y1 + ROW_GAP/2;
          const isFar = b.row - a.row > 1;
          if(isFar) far++;
          /* A far edge is drawn as a stub above its target, not routed — so that is what gets
             checked. See the routing note in ui.js for the three versions this replaced. */
          const pts = isFar
            ? [[x2, y2 - ROW_GAP*0.55], [x2, y2]]
            : (x1 === x2 ? [[x1,y1],[x2,y2]]
                         : [[x1,y1],[x1,gapA],[x2,gapA],[x2,y2]]);
          for(let i = 0; i < pts.length - 1; i++){
            const [ax, ay] = pts[i], [bx, by] = pts[i+1];
            const loX = Math.min(ax,bx), hiX = Math.max(ax,bx);
            const loY = Math.min(ay,by), hiY = Math.max(ay,by);
            for(const [other, p] of boxes){
              if(other === k || other === dep) continue;
              if(hiX > p.x && loX < p.x + NODE_W && hiY > p.y && loY < p.y + NODE_H)
                bad.push(br + ' ' + dep + '→' + k + ' crosses ' + other);
            }
          }
        }
      }
    }
    ok('no connector runs through a node it has nothing to do with', bad.length === 0,
       bad.length ? [...new Set(bad)].join('; ') : 'all edges clear, ' + far + ' drawn as stubs');
  }

  /* unlockedBy is the inverse of needs; if the two disagree the detail sheet would promise a
     study that nothing actually gates on this one. */
  const badInv = [];
  for(const k of Object.keys(R.RESEARCH))
    for(const child of R.unlockedBy(k))
      if(!(R.RESEARCH[child].needs || {})[k]) badInv.push(k + '→' + child);
  ok('unlockedBy is the exact inverse of needs', badInv.length === 0, badInv.join(', ') || 'clean');
}

console.log('\n── per-line mastery hits one line and only one line ──');
{
  const s = hold();
  s.research = {};
  const powerOf = k => L.tierPower(s, k);
  const before = Object.fromEntries(Object.keys(D.TROOPS).map(k => [k, powerOf(k)]));
  s.research = { line_knight: R.LINE_MAX };
  ok('the studied line gains', powerOf('knight') > before.knight,
     before.knight.toFixed(1) + ' → ' + powerOf('knight').toFixed(1));
  const others = Object.keys(D.TROOPS).filter(k => k !== 'knight');
  ok('and no other line moves',
     others.every(k => near(powerOf(k), before[k], 0)),
     others.map(k => k + ' ' + powerOf(k).toFixed(1)).join(', '));
  /* It must land in tierPower rather than the global multiplier, or a column's power and
     the muster roll would disagree about what one knight is worth. */
  ok('the gain is the size the study advertises',
     near(powerOf('knight') / before.knight, 1 + R.LINE_MAX * R.LINE_PER / 100),
     '×' + (powerOf('knight') / before.knight).toFixed(3));
}

console.log('\n── the Electrum tier is the sink the Crucible never had ──');
{
  ok('Electrum research exists', Object.keys(R.ELECTRUM).length > 0);
  const noGold = Object.entries(R.ELECTRUM).filter(([, d]) => !d.cost.electrum);
  ok('and every one of them is priced in Electrum', noGold.length === 0,
     noGold.map(([k]) => k).join(', ') || 'clean');

  /* Priced in it is not the same as SPENDING it — payCost is generic over resource keys,
     so this checks the stock actually falls. */
  const s = hold();
  s.b.library = 30; s.b.crucible = 20; s.b.townhall = 25;
  s.research = { warcraft: 10 };
  s.res.electrum = 500; s.res.isleore = 500;
  const held = s.res.electrum;
  const started = L.startResearch(s, 'el_might', s.now);
  ok('a Electrum study can actually be begun', started === true, R.techBlockedBy(s, 'el_might') || '');
  ok('and it spends Electrum from the vault', s.res.electrum < held,
     held + ' → ' + s.res.electrum);

  /* Affordability must bite: without Electrum the study is refused even when every
     other resource is overflowing. */
  const s2 = hold();
  s2.b.library = 30; s2.b.crucible = 20; s2.b.townhall = 25;
  s2.research = { warcraft: 10 };
  s2.res.electrum = 0;
  ok('and is refused outright with an empty Electrum vault',
     L.startResearch(s2, 'el_might', s2.now) === false);
}

console.log('\n── every study can actually be paid for ──');
{
  /* A level costing more than your maximum storage can NEVER be begun — canAfford compares
     against a stock that physically cannot reach the price. It is a permanent dead end that
     reports itself as a merely expensive study, so it is worth a test rather than a glance.
     Checked at the DEAREST level of every track, with the Town Hall and stores maxed. */
  const s = hold();
  s.b.townhall = 30; s.b.library = 30; s.b.crucible = 20; s.b.granary = 10;
  s.research = {};
  for(const k of Object.keys(R.RESEARCH)) s.research[k] = R.RESEARCH[k].max - 1;
  const bad = [];
  for(const k of Object.keys(R.RESEARCH))
    for(const [r, v] of Object.entries(R.techCost(s, k)))
      if(v > L.capFor(s, r)) bad.push(k + ':' + r + ' ' + v + ' > cap ' + Math.round(L.capFor(s, r)));
  ok('no study has a level dearer than the vault that must hold it', bad.length === 0,
     bad.join('; ') || 'all ' + Object.keys(R.RESEARCH).length + ' fit');

  /* And the Electrum tier must be reachable from the only place Electrum comes from. The Salt
     Isle yields a measured 586 Isle Ore a season worked perfectly, so 147 Electrum; the tier
     first shipped needing 7,078, which is 48 seasons of flawless sailing. The band is wide
     because the intent is loose — "a long endgame grind" — but 48 seasons is outside it, and
     nothing would have said so. */
  const tg = Object.keys(R.ELECTRUM).reduce((a, k) => {
    const st = hold(); st.b.library = 30; st.b.crucible = 20;
    let sum = 0;
    for(let l = 0; l < R.RESEARCH[k].max; l++){
      st.research = { [k]: l };
      sum += R.techCost(st, k).electrum || 0;
    }
    return a + sum;
  }, 0);
  const seasons = tg / 147;
  ok('the whole Electrum tier is 4–20 seasons of Isle play, not a lifetime',
     seasons >= 4 && seasons <= 20,
     tg + ' Electrum = ' + seasons.toFixed(1) + ' seasons at 147/season');
}

console.log('\n── no study moves nothing (the bug Electrum itself was) ──');
{
  /* Every study maxed in isolation, against a wide sample of observable outputs. If a
     study's number is read by no rule anywhere, it appears here by name. */
  const probe = s => JSON.stringify({
    food: L.prodMult(s, 'food'), stone: L.prodMult(s, 'stone'),
    cap: L.storageCap(s), army: L.armyPower(s), wall: L.wallPower(s),
    train: L.trainMultFor(s, 5), valor: L.valorGain ? 1 : 1,
    power: Object.keys(D.TROOPS).map(k => L.tierPower(s, k).toFixed(4)).join(','),
  });
  const dead = [];
  for(const k of Object.keys(R.RESEARCH)){
    const s = hold();
    s.b.wall = 9; s.b.library = 30; s.b.crucible = 20;
    s.research = {};
    const before = probe(s);
    s.research = { [k]: R.RESEARCH[k].max };
    if(probe(s) === before) dead.push(k);
  }
  /* Invisible to these probes and covered by their own, stronger tests elsewhere: loot and Valor
     are per-event multipliers, medicine is a casualty roll, and the whole Seafaring branch only
     takes effect inside a voyage — which the block above measures by actually sailing one, twice,
     and comparing what came home. Being on this list means "measured somewhere better", never
     "unmeasured": the grep below is the floor, and every name here also has a real assertion. */
  const expected = ['siegecraft', 'statecraft', 'medicine', 'smelting',
                    'cartography', 'victualling', 'spyglass', 'prospecting', 'seamanship', 'salvage',
                    'roadwork', 'baggage', 'foraging', 'outriders', 'relays',
                    'ramparts', 'mortar', 'quarrymen', 'vigil',
                    'tutelage', 'heraldry', 'chairs'];
  const unexplained = dead.filter(k => !expected.includes(k));
  ok('every study moves a number this harness can see', unexplained.length === 0,
     unexplained.length ? 'DEAD: ' + unexplained.join(', ') : dead.length + ' deferred to their own tests');

  /* And every deferred one must still be READ by name somewhere in the engine — a weaker check
     than measurement, but it is what catches a study nothing consumes at all. world.js is in the
     list because that is where a voyage lives; logic.js alone would have called all six Seafaring
     studies unread. */
  const src = ['../src/logic.js', '../src/world.js', '../src/arena.js']
    .map(f => readFileSync(new URL(f, import.meta.url), 'utf8')).join('\n');
  const unread = expected.filter(k => !src.includes("'" + k + "'"));
  ok('and every deferred study is consumed by name in logic.js or world.js', unread.length === 0,
     unread.join(', ') || 'all ' + expected.length + ' read');
}

/* ── no building level may be worth nothing ──
   Reported from play: "the Infirmary doesn't give any bonus after level 10." It had 25 levels and
   all three of its effects gave up early — the share who come back at exactly 10, healing at 23,
   and casualties into a floor shared with three other systems that between them oversubscribed it
   by 1.15 at the top of the game.

   These assert the PROPERTY rather than the numbers: every level of the building must move every
   figure it claims to, in the right direction, at the worst case for the test — which is a hold
   that has already maxed Medicine, taken Mastery 15 and seated a medic, because that is the
   loadout under which the old formula was flattest. A curve tuned to look right at one level is
   how the original was written. */
console.log('\n── no Infirmary level is worth nothing (four systems shared one ceiling) ──');
{
  const kitted = (l) => {
    const s = hold();
    s.b.hospital = l;
    s.research = { medicine: R.RESEARCH.medicine.max };
    s.mastery = 14700 * 3;                     // past the Mastery-15 casualty perk
    s.heroes.medic = { lvl:20, xp:0, stars:3, deeds:0, gear:{}, skills:[null,null,null] };
    s.court = ['medic'];
    return s;
  };
  const MAX = D.BUILDINGS.hospital.max;
  let shareBad = [], reliefBad = [], bedsBad = [], healBad = [];
  for(let l = 1; l <= MAX; l++){
    const a = kitted(l - 1), b = kitted(l);
    if(!(L.woundShare(b)   >  L.woundShare(a)))   shareBad.push(l);
    if(!(L.casualtyRelief(b) < L.casualtyRelief(a))) reliefBad.push(l);
    if(!(L.woundedCap(b)   >  L.woundedCap(a)))   bedsBad.push(l);
    const wound = (s) => { s.wounded = { spearman: 50 }; return L.healTime(s); };
    if(!(wound(kitted(l)) <= wound(kitted(l-1)))) healBad.push(l);
  }
  ok('every level raises the share who come back', shareBad.length === 0,
     shareBad.length ? 'flat at ' + shareBad.join(', ') : '30% → ' + Math.round(L.woundShare(kitted(MAX))*100) + '% over ' + MAX + ' levels');
  ok('every level cuts casualties, even with Medicine and a medic already maxed', reliefBad.length === 0,
     reliefBad.length ? 'flat at ' + reliefBad.join(', ') : 'relief ' + L.casualtyRelief(kitted(0)).toFixed(3)
       + ' → ' + L.casualtyRelief(kitted(MAX)).toFixed(3));
  ok('every level adds beds', bedsBad.length === 0, bedsBad.join(', ') || L.woundedCap(kitted(MAX)) + ' at max');
  ok('and no level heals slower than the one below it', healBad.length === 0, healBad.join(', ') || 'monotone');

  /* The user-visible symptom, asserted directly. Beds are deliberately EXCLUDED from the key: they
     were the one effect that never saturated, so including them makes every row unique and the
     assertion passes on the broken formula too. Measured — it did. What has to be distinct is the
     pair that froze. */
  const rows = new Set();
  for(let l = 0; l <= MAX; l++){
    const s = kitted(l);
    rows.add(Math.round(L.woundShare(s)*100) + '% ×' + L.casualtyRelief(s).toFixed(3));
  }
  ok('the level sheet prints a different line for every level', rows.size === MAX + 1,
     rows.size + ' distinct rows for ' + (MAX+1) + ' levels');

  /* And the repair must not be a rebalance: below the knee the new curve has to return exactly
     what the old one did, or every existing player's hold quietly changed. */
  const oldRelief = (s) => Math.max(0.15, 1 - L.heroBonus(s,'casualties') - 0.04*(s.b.hospital||0)
    - R.techBonus(s,'medicine') - (L.perk(s,15) ? 0.10 : 0));
  let drift = [];
  for(let l = 0; l <= MAX; l++){
    const s = hold(); s.b.hospital = l; s.research = {}; s.court = []; s.mastery = 0;
    const o = oldRelief(s), n = L.casualtyRelief(s);
    if(o > 0.15 + 1e-9 && Math.abs(o - n) > 1e-9) drift.push(l + ': ' + o.toFixed(3) + '≠' + n.toFixed(3));
    if(n > o + 1e-9) drift.push(l + ': WORSE ' + n.toFixed(3) + '>' + o.toFixed(3));
  }
  ok('and nothing below the old floor changed at all', drift.length === 0, drift.join(', ') || 'identical wherever the old curve was live');
}

/* ── a decree's price has to be legible, and it has to outlive a refresh ──
   Two play reports, one root each. The first: "decree negative things should be in red" — they
   were not, because the panel split `fx` on a ';' that stopped existing when the string started
   being generated, so the downside rendered inside the green span. The second: "every time I
   refresh the previous decree is gone" — which was not persistence at all, but a ten-minute life.

   The colour test asserts the two halves are non-empty and DISJOINT, which is the property the
   split silently lost. A test that only checked "fx mentions both effects" would have passed
   throughout the bug. */
/* ── a vault per resource, and the bill that has to fit in it ──
   Asked for directly: "since food, wood, stone and iron productions are at different rates even at
   max level and the rarity is different, max storage should be based on that too."

   Measured before the change: one shared ceiling meant filling from empty took 1.4h of food and
   6.0h of iron at a paced Town Hall 30 — ×4.29 apart, with the two-hour offline window landing
   inside the spread, so an overnight absence had food sitting full and wasting while iron climbed.

   Caps are derived from production rates now, and THAT is only safe because of the second block
   here. A cap smaller than a single purchase makes a building permanently unbuildable, and the
   binding case is not obvious — it is the Crucible's 20th level at 324,900 stone, the largest
   single cost in the game, in the vault with the second-slowest production. Anyone retuning a rate
   or a cost gets told which building they broke. */
/* ── a column has a position, not just a timer ──
   Asked for directly: "can I also see some kind of marching animation in the frontier when the march
   is going and returning — I want to see them on the map, the position."

   The whole journey is derived from three timestamps the march already carries, so what has to be
   asserted is the geometry: leaves the gate, reaches the node exactly when the panel says it
   arrives, sits still while it works, then retraces the SAME line home and lands back on the hold.
   The failure this guards against is a marker that drifts — off by a leg, or interpolating from the
   wrong endpoint, so a returning column appears to set out again. */
console.log('\n── a column can be seen crossing the map ──');
{
  const s = hold();
  s.b.command = 30;
  s.t = { spearman:400, archer:200, knight:120, ballista:60 };
  const idx = s.world.tiles.findIndex(t => W.TILE_TYPES[t.type].kind === 'gather' && !W.tileLocked(s, t));
  ok('there is a node to march on', idx >= 0);
  const t0 = s.now;
  ok('a column rides out', W.startMarch(s, idx, { spearman:60 }, t0, false, []));
  const m = s.marches[s.marches.length - 1];
  const tile = s.world.tiles[idx];
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const HOME = { x:W.CX, y:W.CY };

  const atDep  = W.marchPos(s, m, m.arriveAt - m.out);
  const midOut = W.marchPos(s, m, m.arriveAt - m.out / 2);
  const atNode = W.marchPos(s, m, m.arriveAt);
  const working = W.marchPos(s, m, m.arriveAt + (m.homeAt - m.out - m.arriveAt) / 2);
  const turn   = W.marchPos(s, m, m.homeAt - m.out);
  const midBack= W.marchPos(s, m, m.homeAt - m.out / 2);
  const atHome = W.marchPos(s, m, m.homeAt);

  ok('it starts at the hold', dist(atDep, HOME) < 0.02 && atDep.leg === 'out',
     atDep.x.toFixed(2) + ',' + atDep.y.toFixed(2) + ' ' + atDep.leg);
  ok('and is genuinely between the two halfway out',
     dist(midOut, HOME) > 0.4 && dist(midOut, tile) > 0.4 && midOut.leg === 'out',
     midOut.x.toFixed(2) + ',' + midOut.y.toFixed(2));
  ok('it reaches the node exactly when it arrives', dist(atNode, tile) < 0.02,
     atNode.x.toFixed(2) + ',' + atNode.y.toFixed(2) + ' vs ' + tile.x + ',' + tile.y);
  ok('and stands still while it works', dist(working, tile) < 0.02 && working.leg === 'work', working.leg);
  ok('it is still at the node when it turns for home', dist(turn, tile) < 0.02, turn.leg);
  ok('halfway back it is between them again, pointed home',
     dist(midBack, HOME) > 0.4 && dist(midBack, tile) > 0.4 && midBack.leg === 'home',
     midBack.x.toFixed(2) + ',' + midBack.y.toFixed(2) + ' ' + midBack.leg);
  ok('and it ends on the hold', dist(atHome, HOME) < 0.02,
     atHome.x.toFixed(2) + ',' + atHome.y.toFixed(2));
  /* The road home is the road out, walked backwards. Compared at the QUARTER point, not the
     midpoint: a marker interpolating from the wrong endpoint lands correctly at both ends AND at
     the middle, because home↔node is symmetric there. Measured — the midpoint version of this
     assertion passed against a deliberately reversed return leg. A quarter of the way out must
     match three quarters of the way back, and nothing else. */
  const quarterOut = W.marchPos(s, m, m.arriveAt - m.out * 0.75);
  const threeBack  = W.marchPos(s, m, (m.homeAt - m.out) + m.out * 0.75);
  ok('the way home retraces the way out', dist(quarterOut, threeBack) < 0.02,
     '25% out ' + quarterOut.x.toFixed(2) + ',' + quarterOut.y.toFixed(2)
     + ' vs 75% back ' + threeBack.x.toFixed(2) + ',' + threeBack.y.toFixed(2));
  // monotone progress: a marker must never slide backwards along its leg
  let backwards = 0, prev = 0;
  for(let i = 0; i <= 40; i++){
    const now = (m.arriveAt - m.out) + (m.out) * (i / 40);
    const d = dist(W.marchPos(s, m, now), HOME);
    if(d < prev - 1e-9) backwards++;
    prev = d;
  }
  ok('it never walks backwards on the way out', backwards === 0, backwards + ' reversals');

  /* And a hunt, which targets a beast rather than a tile — a separate code path that would
     otherwise have no witness. */
  {
    const h = hold();
    h.b.command = 30; h.t = { spearman:400, knight:120 };
    /* Spawned by the real spawner, not hand-written into the array. A synthetic {x,y} passed this
       kind of test once before and then returned NaN the moment the code under test read a field
       the fixture had never heard of. */
    W.spawnBeasts(h, h.now, () => 0.4);
    const bi = (h.world.beasts || []).findIndex(b => b);
    if(bi >= 0 && W.startHunt(h, bi, { spearman:60 }, h.now, [])){
      const hm = h.marches[h.marches.length - 1];
      const b = h.world.beasts[bi];
      ok('a hunt is drawn at the herd, not at tile zero',
         Math.hypot(W.marchPos(h, hm, hm.arriveAt).x - b.x, W.marchPos(h, hm, hm.arriveAt).y - b.y) < 0.02,
         'beast at ' + b.x + ',' + b.y);
    } else ok('a hunt is drawn at the herd, not at tile zero', false, 'could not start a hunt to measure');
  }
}

console.log('\n── every vault fills in the same time, and still holds its largest bill ──');
{
  const RAW = ['food', 'wood', 'stone', 'iron'];
  const paced = (th) => {
    const s = freshState(Date.now(), 42);
    s.b.townhall = th;
    for(const k of Object.keys(D.BUILDINGS)) if(k !== 'townhall') s.b[k] = Math.min(D.BUILDINGS[k].max, th);
    s.now = Date.now();
    return s;
  };
  ok('the four raw vaults are no longer the same size',
     new Set(RAW.map(r => L.capFor(paced(30), r))).size === 4,
     RAW.map(r => r + ' ' + L.fmt(L.capFor(paced(30), r))).join(', '));
  ok('and they are ordered by how fast the resource arrives',
     RAW.every((r, i) => i === 0 || L.capFor(paced(30), RAW[i-1]) > L.capFor(paced(30), r)),
     RAW.map(r => D.rawRate(r)).join(' > '));

  let worstSpread = 0, worstTh = 0;
  for(let th = 4; th <= 30; th++){
    const s = paced(th);
    const hrs = RAW.map(r => L.capFor(s, r) / L.prodPerSec(s, r));
    const spread = Math.max(...hrs) / Math.min(...hrs);
    if(spread > worstSpread){ worstSpread = spread; worstTh = th; }
  }
  /* Not 1.00, and deliberately: the Granary lifts food PRODUCTION as well as storage, so food
     still fills fastest. 1.6 is the measured residual with room, against ×4.29 before. */
  ok('no vault fills more than 1.6× faster than another, at any Town Hall', worstSpread <= 1.6,
     '×' + worstSpread.toFixed(2) + ' at Town Hall ' + worstTh);

  /* Every single purchase in the game, against the vault that has to hold it. */
  const top = paced(30);
  const tight = [];
  const HEADROOM = 1.30;
  for(const r of RAW){
    let worst = 0, who = '';
    for(const [k, def] of Object.entries(D.BUILDINGS))
      for(let l = 1; l <= def.max; l++){
        const p = { ...top, b: { ...top.b, [k]: l - 1 } };
        const v = L.buildCost(p, k)[r] || 0;
        if(v > worst){ worst = v; who = def.name + ' ' + l; }
      }
    for(const k of Object.keys(R.RESEARCH))
      for(let l = 0; l < R.RESEARCH[k].max; l++){
        const p = { ...top, research: { ...(top.research || {}), [k]: l } };
        const v = R.techCost(p, k)[r] || 0;
        if(v > worst){ worst = v; who = R.RESEARCH[k].name + ' ' + (l + 1); }
      }
    const cap = L.capFor(top, r);
    if(cap < worst * HEADROOM)
      tight.push(r + ': ' + who + ' costs ' + L.fmt(worst) + ' but the vault holds ' + L.fmt(cap));
  }
  ok('every vault holds its largest single purchase with 30% to spare', tight.length === 0,
     tight.join(' | ') || 'all four clear, tightest is stone');

  /* And the caravan clamp, which used the UNDIVIDED ceiling. That is wrong in BOTH directions once
     the multipliers differ, and which way depends on the resource: storageCap at Town Hall 20 is
     208,430, while food's own vault holds 402,763 and iron's only 307,179. So the old clamp
     truncated a food caravan at half the vault the player had paid for, and let an iron one
     overfill. Seeded near the cap on purpose — measured, a caravan delivers 25,920 over two hours
     against a 402,763 vault, so a test starting from empty never reaches the clamp at all and
     passes whichever version is installed. It did. */
  /* The fixture has NO producers and NO refineries, so the caravan is the only thing that moves a
     number. A paced hold cannot measure this: its four refineries at level 20 eat more raw goods
     over two hours than the caravan brings, so food ends BELOW where it started and the clamp never
     shows. Measured that too, chasing this assertion. */
  for(const [route, pair] of [['kingsroad', ['food','wood']], ['wildwood', ['stone','iron']]]){
    const s = paced(20);
    for(const k of ['farm','lumberyard','quarry','ironmine','forge','runeworks','kitchen','crucible']) s.b[k] = 0;
    s.t = {};                                             // and nothing eating, so food only rises
    const y = L.caravanYields({ ...s, caravan: route }) || {};
    const hit = pair.filter(r => y[r]);
    if(!hit.length){ ok('the ' + route + ' caravan yields ' + pair.join('/'), false, 'yields ' + JSON.stringify(y)); continue; }
    for(const r of RAW) s.res[r] = Math.max(0, L.capFor(s, r) - 5000);
    s.caravan = route;
    ST.applyOffline(s, 7200000);
    const over = RAW.filter(r => s.res[r] > L.capFor(s, r) + 1);
    ok(route + ': a standing caravan cannot overfill a vault', over.length === 0,
       over.map(r => r + ' ' + Math.round(s.res[r]) + ' > ' + L.capFor(s, r)).join(', ') || 'all within their own caps');
    // and it must be allowed to fill the whole vault, including past the undivided ceiling
    const shortChanged = hit.filter(r => L.capFor(s, r) > L.storageCap(s) && s.res[r] < L.capFor(s, r) - 1);
    ok(route + ': nor be cut off below the vault the player paid for', shortChanged.length === 0,
       shortChanged.map(r => r + ' stopped at ' + Math.round(s.res[r]) + ' of ' + L.capFor(s, r)).join(', ')
       || hit.map(r => r + ' ' + Math.round(s.res[r]) + '/' + L.capFor(s, r)).join(', '));
  }
}

/* ── the Founder's Peace, as a rule rather than as an endpoint ──
   Asked for as "up to a point WoS has shields when you start the game so nobody can attack you".
   The server test drives it over the wire; these are the three ways it ends and the one way it must
   never begin — a save that predates the feature is an existing player, not a new hold, and
   defaulting their `founded` to the current time would have handed the entire playerbase three days
   of immunity on release day. That is a one-character mistake with a live consequence. */
/* ── a finished batch waits, and waiting costs nothing ──
   Asked for: "you have to tap collect and then tap again to open the training window." The tap is the
   point; the PUNISHMENT that comes with it in the games this borrows from is not. There,
   uncollected production is lost past a cap, and the loss is what makes you open the app. Here the
   batch waits — so the assertions that matter are the ones about leaving it alone for a week. */
console.log('\n── troops stand ready until you take them in, and never spoil ──');
{
  const s = hold();
  s.t = { spearman:0, archer:0, knight:0, ballista:0 };
  s.tq = {};
  const t0 = s.now;
  ok('a batch can be started', L.startTraining(s, 'spearman', 20, t0));
  const q = s.tq.spearman;
  L.tick(s, q.end + 1000, 1);
  ok('it does not join the muster on its own', s.t.spearman === 0, String(s.t.spearman));
  ok('it is marked ready instead', !!(s.tq.spearman && s.tq.spearman.done));
  ok('and the hold knows which yards are waiting', L.readyTroops(s).join(',') === 'spearman',
     L.readyTroops(s).join(',') || 'none');
  ok('the yard stays busy, so a second batch cannot start', !L.startTraining(s, 'spearman', 5, q.end + 2000));

  /* A WEEK later, ticked the whole way. Nothing may decay, and no cap may eat it. */
  let at = q.end + 1000;
  for(let i = 0; i < 200; i++){ at += 3600000; L.tick(s, at, 3600); }
  ok('a week of neglect costs not one soldier', s.tq.spearman && s.tq.spearman.count === 20,
     s.tq.spearman ? String(s.tq.spearman.count) : 'THE BATCH IS GONE');

  const before = s.trained;
  const got = L.collectTroops(s, 'spearman', at);
  ok('taking them in delivers all 20', got === 20 && s.t.spearman === 20,
     got + ' delivered, muster ' + s.t.spearman);
  ok('and counts them once, not twice', s.trained === before + 20, before + ' → ' + s.trained);
  ok('the yard is free again', !L.trainQueue(s, 'spearman'));
  ok('collecting an empty yard does nothing', L.collectTroops(s, 'spearman', at) === 0);

  /* And the action table has to carry it, or online play cannot collect at all. */
  ok('collect is a real game action', A.isGameAction('collect'));
  const s2 = hold();
  s2.t.archer = 0; s2.tq = {};
  L.startTraining(s2, 'archer', 8, s2.now);
  L.tick(s2, s2.tq.archer.end + 1000, 1);
  ok('and applying it through the table takes them in',
     A.applyAction(s2, 'collect', { key:'archer' }, s2.now) === true && s2.t.archer === 8,
     'muster ' + s2.t.archer);
}

console.log('\n── the Founder\'s Peace ends three ways, and never starts for an old hold ──');
{
  const RAID = await import('../src/raid.js');
  const now = Date.now();
  const novice = () => { const s = freshState(now, 7); s.now = now; return s; };

  ok('a new hold is under the Peace', RAID.novicePeaceLeft(novice(), now) > 0,
     Math.round(RAID.novicePeaceLeft(novice(), now) / 3600000) + 'h');
  ok('and cannot be raided', RAID.raidShielded(novice(), now));
  ok('the reason given names the Peace', /Founder/.test(RAID.shieldReason(novice(), now) || ''),
     RAID.shieldReason(novice(), now));

  // 1. the clock
  ok('it ends when the clock runs out',
     RAID.novicePeaceLeft(novice(), now + RAID.NOVICE_PEACE_MS + 1000) === 0,
     Math.round(RAID.NOVICE_PEACE_MS / 3600000) + 'h');
  // 2. the Town Hall
  const grown = novice(); grown.b.townhall = RAID.NOVICE_PEACE_TH;
  ok('and when the Town Hall reaches ' + RAID.NOVICE_PEACE_TH, RAID.novicePeaceLeft(grown, now) === 0);
  const nearly = novice(); nearly.b.townhall = RAID.NOVICE_PEACE_TH - 1;
  ok('but not one level below it', RAID.novicePeaceLeft(nearly, now) > 0);
  // 3. the one that keeps it honest
  const raider = novice(); raider.peaceBroken = true;
  ok('and the moment the hold raids anyone', RAID.novicePeaceLeft(raider, now) === 0);
  ok('which leaves them raidable like anyone else', !RAID.raidShielded(raider, now));

  /* The migration. An old save has no `founded`; it must read as long-founded, not as brand new. */
  const old = novice();
  delete old.founded; delete old.peaceBroken;
  const migrated = ST.migrate(JSON.parse(JSON.stringify(old)), now);
  ok('a save from before the Peace does NOT gain one', RAID.novicePeaceLeft(migrated, now) === 0,
     'founded ' + migrated.founded);
  ok('and a fresh hold still does', RAID.novicePeaceLeft(ST.migrate(JSON.parse(JSON.stringify(novice())), now), now) > 0);
}

console.log('\n── a decree shows what it costs, and lasts long enough to matter ──');
{
  let bad = [];
  for(const [k, d] of Object.entries(D.DECREES)){
    const up = D.decreeUp(d), down = D.decreeDown(d);
    if(!up) bad.push(k + ': no upside text');
    if(!down) bad.push(k + ': no downside text');
    if(up && down && up.includes(down)) bad.push(k + ': downside is inside the upside string');
  }
  ok('every decree has both halves, and they are separate strings', bad.length === 0,
     bad.join('; ') || Object.keys(D.DECREES).length + ' decrees, up and down each rendered on their own');

  /* Bloody Work is the one whose downside RAISES a number rather than lowering it, so it is the
     one a sign bug hides in: +25% casualties has to read as a cost, not a gift. */
  ok('a downside that raises a number still reads as a cost', D.decreeDown(D.DECREES.blood).includes('+25%'),
     D.decreeDown(D.DECREES.blood));

  const s = hold(); s.valor = 500; s.now = Date.now();
  ok('a decree can be announced', L.announceDecree(s, 'march', s.now));
  // exactly the round trip the browser does on a refresh
  const back = ST.migrate(JSON.parse(JSON.stringify(s)), s.now + 30 * 60000);
  back.now = s.now + 30 * 60000;
  ok('and it is still standing half an hour later, across a save/load', !!L.decreeOf(back),
     L.decreeOf(back) ? Math.round(L.decreeLeft(back) / 60000) + ' min left' : 'GONE');
  const stale = ST.migrate(JSON.parse(JSON.stringify(s)), s.now + D.DECREE_MS + 60000);
  stale.now = s.now + D.DECREE_MS + 60000;
  ok('and it does expire once its hour is up', !L.decreeOf(stale));
  ok('a decree lasts long enough that a day of Valor buys most of a day of it',
     D.DECREE_MS >= 30 * 60000, Math.round(D.DECREE_MS / 60000) + ' min');
}

console.log('\n' + (fail ? '✗ ' + fail + ' FAILED, ' + pass + ' passed' : '✓ all ' + pass + ' passed') + '\n');
process.exit(fail ? 1 : 0);
