// Crownhold balance simulator. Unlike a hand-mirrored model, this drives the REAL
// game rules — src/logic.js `tick()` with a fake clock and deterministic rng — so
// sim results can never drift from what players experience. Run: npm run sim
//
// The bot is a competent active player: builds by priority, trains to stay ahead
// of the next wave without starving the food economy, patrols on cooldown, and
// spends Valor to finish long timers.

import { BUILDINGS, TROOPS, RES_META, WAVE_TYPES } from '../src/defs.js';
import * as L from '../src/logic.js';
import { freshState } from '../src/state.js';

// skilled=true reads the scouts and sets the counter-stance; false stays Balanced.
// Both use hero orders — the delta isolates the value of paying attention.
function simulate(minutes, enemyLuck, skilled, label){
  const s = freshState(0);
  s.seenIntro = true;
  // resolveWave rolls enemy strength as 0.88 + rand()*0.24; invert for a fixed roll
  const rand = () => (enemyLuck - 0.88) / 0.24;

  const T = minutes*60;
  const ev = [];
  let idleBuild=0, cappedTime=0, valorSpent=0, prevTH=1, prevWon=0, prevLost=0;
  const mm = t => String(Math.floor(t/60)).padStart(3,' ')+':'+String(t%60).padStart(2,'0');
  const note = (t,txt) => ev.push(mm(t)+'  '+txt);

  let prevML = 0;
  for(let t=1; t<=T; t++){
    const ms = t*1000;

    // capture pre-tick battle context (a wave will resolve inside this tick)
    let pre = null;
    if(ms >= s.nextWave){
      const w = s.wave, wb = w%5===0;
      const enemy = L.wavePower(w)*(wb?1.6:1)*enemyLuck
        *(1-L.bluntMult(s))*L.streakMult(s);
      pre = { w, wb, enemy, mine: L.armyPower(s) };
    }

    L.tick(s, ms, 1, rand);

    // draft decisions: always take the first offer
    if(s.choice){
      const id = s.choice.options[0];
      note(t, (s.choice.type==='hero' ? 'drafted hero: ' : 'spoils: ')+id);
      L.chooseOption(s, 0, ms);
    }

    if(pre){
      if(s.wavesWon > prevWon && pre.wb)
        note(t,'WARBAND '+pre.w+' won ('+pre.mine+' vs '+Math.round(pre.enemy)+')');
      if(s.wavesLost > prevLost)
        note(t,(pre.wb?'WARBAND':'raid')+' '+pre.w+' LOST ('+pre.mine+' vs '+Math.round(pre.enemy)+') streak '+s.streak);
      prevWon = s.wavesWon; prevLost = s.wavesLost;
    }
    if(s.b.townhall > prevTH){ prevTH = s.b.townhall; note(t,'Town Hall → '+prevTH); }
    const ml = L.masteryLvl(s);
    if(ml > prevML){ prevML = ml; note(t,'Mastery → '+ml); }
    if(Object.keys(RES_META).some(r => s.res[r] >= L.storageCap(s)-1)) cappedTime++;

    /* ── bot decisions ── */
    // stance: the skilled bot answers the scouted shape; the lazy bot never touches it
    if(skilled && s.b.watchtower >= 1){
      const want = WAVE_TYPES[s.waveType]?.weakTo || 'balanced';
      if(s.stance !== want) L.setStance(s, want, ms);
    }
    // orders: fire whatever is ready (battle mods persist until the next battle)
    for(const id of Object.keys(s.heroes)) if(!(s.orderCd[id]>0)) L.useOrder(s, id, ms);
    // expeditions: chase the current bottleneck
    if(t >= (s.patrolReady/1000)){
      const route = s.valor < 15 ? 'barrows'
        : (s.res.stone + s.res.iron < s.res.food ? 'wildwood' : 'kingsroad');
      L.expedition(s, route, ms, rand);
    }

    if(s.bq && s.bq.end-ms > 15000){
      const c = L.finishCost(s.bq.end, ms);
      if(s.valor >= c && L.finishBuildNow(s, ms)) valorSpent += c;
    }
    if(s.tq && s.tq.end-ms > 15000){
      const c = L.finishCost(s.tq.end, ms);
      if(s.valor >= c && L.finishTrainNow(s, ms)) valorSpent += c;
    }

    if(!s.bq){
      const eligible = k => {
        const d = BUILDINGS[k], lvl = s.b[k];
        if(lvl >= d.max) return false;
        if(k!=='townhall' && lvl >= s.b.townhall) return false;
        if(d.th && s.b.townhall < d.th) return false;
        return L.canAfford(s, L.buildCost(s,k));
      };
      let pick = null;
      if(eligible('townhall')) pick = 'townhall';
      else if(s.b.quarry===0 && eligible('quarry')) pick = 'quarry';
      else if(s.b.barracks===0 && eligible('barracks')) pick = 'barracks';
      else {
        const prodOf = {food:'farm',wood:'lumberyard',stone:'quarry',iron:'ironmine'};
        const order = [...Object.keys(RES_META)].sort((a,b)=>s.res[a]-s.res[b]);
        for(const r of order){ const k=prodOf[r]; if(eligible(k)){ pick=k; break; } }
        if(!pick && s.b.wall<s.b.townhall && eligible('wall')) pick='wall';
        if(!pick && s.b.barracks<s.b.townhall && eligible('barracks')) pick='barracks';
        if(!pick && s.b.watchtower<3 && eligible('watchtower')) pick='watchtower';
      }
      if(pick) L.startUpgrade(s, pick, ms);
      else idleBuild++;
    }

    // training: keep ahead of the next wave, but never beyond food sustainability
    if(!s.tq && s.b.barracks > 0){
      const wb = s.wave%5===0;
      const target = 1.4 * L.wavePower(s.wave)*(wb?1.6:1)*1.12
        *(1-L.bluntMult(s))*L.streakMult(s);
      const deficit = target - L.armyPower(s);
      const best = ['ballista','knight','archer','spearman'].find(k => s.b.barracks >= TROOPS[k].barracks);
      const dump = s.res.food > 0.8*L.storageCap(s);
      if(deficit > 0 || dump){
        const d = TROOPS[best];
        const headroom = L.prodPerSec(s,'food')*0.85 - L.upkeepPerSec(s);
        const maxSustain = Math.max(0, Math.floor(headroom/d.upkeep));
        const maxAfford = Math.min(...Object.entries(d.cost).map(([r,v]) => Math.floor(s.res[r]/v)));
        const want = deficit>0 ? Math.ceil(deficit/d.power) : 5;
        const n = Math.max(0, Math.min(25, maxAfford, want, maxSustain));
        if(n > 0) L.startTraining(s, best, n, ms);
      }
    }
  }

  const famines = s.log.filter(e => e.txt.startsWith('Famine')).length;
  console.log('══ '+label+' ══');
  console.log(ev.join('\n'));
  console.log('-- end state: TH'+s.b.townhall+' wave '+s.wave+' won '+s.wavesWon+' lost '+s.wavesLost
    +' | army '+L.armyPower(s)+' (upkeep '+L.upkeepPerSec(s).toFixed(1)+'/s, food prod '+L.prodPerSec(s,'food').toFixed(1)+'/s)'
    +' | mastery '+L.masteryLvl(s)+' | quests '+s.questIdx+'/24');
  console.log('-- buildings: '+Object.entries(s.b).map(([k,v])=>k+':'+v).join(' '));
  console.log('-- heroes: '+(Object.entries(s.heroes).map(([k,h])=>k+' L'+h.lvl).join(', ')||'none')
    +' | spoils: '+(Object.entries(s.spoils).map(([k,n])=>k+(n>1?'×'+n:'')).join(', ')||'none'));
  console.log('-- valor left '+Math.floor(s.valor)+' spent '+valorSpent+' | famine events (recent log) '+famines
    +' | build-idle '+Math.round(100*idleBuild/T)+'% | at-cap '+Math.round(100*cappedTime/T)+'%');
  console.log('');
}

simulate(90, 1.0,  true,  '90 min, average luck, SKILLED (reads scouts, counters)');
simulate(90, 1.0,  false, '90 min, average luck, LAZY (never changes stance)');
simulate(90, 1.12, true,  '90 min, worst-case rolls, skilled');
simulate(240, 1.0, true,  '4 hours, average luck, skilled');
