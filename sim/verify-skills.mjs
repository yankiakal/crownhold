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
       worst-case floor test further down is what guards the meta. */
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

  /* The second crew has to matter, or Town Hall 10 is a hollow milestone. */
  ok('a second crew opens partway up, not at the end',
     D.SECOND_QUEUE_TH > 5 && D.SECOND_QUEUE_TH < D.BUILDINGS.townhall.max / 2,
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
  console.log('\n── the Drillfield: a tier every third level, and no dull rung ──');
  const at = a => { const s = hold(); s.b.academy = a; return s; };
  ok('an unbuilt Academy still allows Tier I', L.maxTier(at(0)) === 1);
  ok('a tier every third level', L.maxTier(at(3)) === 2 && L.maxTier(at(6)) === 3 && L.maxTier(at(9)) === 4,
     'L3→' + D.TIERS[L.maxTier(at(3))-1] + ', L6→' + D.TIERS[L.maxTier(at(6))-1] + ', L9→' + D.TIERS[L.maxTier(at(9))-1]);
  /* Tier X asks for the FINISHED building, not the ninth step of the ladder. It used to land at
     27, three short of the Drillfield's top, which made the last three levels the only ones that
     bought nothing but a percentage — and left this the one building stopping at 27 when
     everything near it runs to 30. Derived from ACADEMY_TOP so the two cannot drift. */
  ok('the step ladder stops at Tier IX however far it climbs',
     L.maxTier(at(24)) === 9 && L.maxTier(at(29)) === 9,
     'L24→' + D.TIERS[L.maxTier(at(24))-1] + ', L29→' + D.TIERS[L.maxTier(at(29))-1]);
  ok('Tier X arrives only with the whole Drillfield',
     L.maxTier(at(D.ACADEMY_TOP - 1)) === 9 && L.maxTier(at(D.ACADEMY_TOP)) === 10
       && D.BUILDINGS.academy.max === D.ACADEMY_TOP,
     'L' + (D.ACADEMY_TOP-1) + '→' + D.TIERS[L.maxTier(at(D.ACADEMY_TOP-1))-1]
       + ', L' + D.ACADEMY_TOP + '→' + D.TIERS[L.maxTier(at(D.ACADEMY_TOP))-1]);
  ok('and it never promises a tier past X', L.maxTier(at(99)) === D.TIERS.length);
  ok('the level a tier needs is nameable, for when the panel refuses',
     L.academyForTier(2) === 3 && L.academyForTier(9) === 24
       && L.academyForTier(10) === D.ACADEMY_TOP,
     'Tier II at ' + L.academyForTier(2) + ', IX at ' + L.academyForTier(9)
       + ', X at ' + L.academyForTier(10));
  /* Every level the tier ladder skips must still pay, and the run from 24 to 30 is the longest
     dry spell in the game — the honest cost of making the last tier a climb. */
  ok('the six levels between Tier IX and Tier X are reachable and none is the top',
     D.ACADEMY_TOP - L.academyForTier(9) === 6, String(D.ACADEMY_TOP - L.academyForTier(9)));

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

  console.log('\n── the triangle gives every specialist a predator ──');
  const shares = k => ({ [k]: 1 });
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
                    'cartography', 'victualling', 'spyglass', 'prospecting', 'seamanship', 'salvage'];
  const unexplained = dead.filter(k => !expected.includes(k));
  ok('every study moves a number this harness can see', unexplained.length === 0,
     unexplained.length ? 'DEAD: ' + unexplained.join(', ') : dead.length + ' deferred to their own tests');

  /* And every deferred one must still be READ by name somewhere in the engine — a weaker check
     than measurement, but it is what catches a study nothing consumes at all. world.js is in the
     list because that is where a voyage lives; logic.js alone would have called all six Seafaring
     studies unread. */
  const src = ['../src/logic.js', '../src/world.js']
    .map(f => readFileSync(new URL(f, import.meta.url), 'utf8')).join('\n');
  const unread = expected.filter(k => !src.includes("'" + k + "'"));
  ok('and every deferred study is consumed by name in logic.js or world.js', unread.length === 0,
     unread.join(', ') || 'all ' + expected.length + ' read');
}

console.log('\n' + (fail ? '✗ ' + fail + ' FAILED, ' + pass + ' passed' : '✓ all ' + pass + ' passed') + '\n');
process.exit(fail ? 1 : 0);
