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

console.log('\n' + (fail ? '✗ ' + fail + ' FAILED, ' + pass + ' passed' : '✓ all ' + pass + ' passed') + '\n');
process.exit(fail ? 1 : 0);
