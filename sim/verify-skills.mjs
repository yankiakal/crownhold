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
