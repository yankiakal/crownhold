// Crownhold balance simulator. Unlike a hand-mirrored model, this drives the REAL
// game rules — src/logic.js `tick()` with a fake clock and deterministic rng — so
// sim results can never drift from what players experience. Run: npm run sim
//
// The bot is a competent active player: builds by priority, trains to stay ahead
// of the next wave without starving the food economy, patrols on cooldown, and
// spends Valor to finish long timers.

import { BUILDINGS, TROOPS, RES_META, WAVE_TYPES } from '../src/defs.js';
import * as L from '../src/logic.js';
import * as W from '../src/world.js';
import { freshState } from '../src/state.js';

// skilled=true reads the scouts and sets the counter-stance; false stays Balanced.
// Both use hero orders — the delta isolates the value of paying attention.
function simulate(minutes, enemyLuck, skilled, label){
  const s = freshState(0, 42); // fixed map seed keeps runs comparable
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
    W.tickWorld(s, ms, rand);

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
    if(Object.keys(RES_META).some(r => s.res[r] >= L.capFor(s,r)-1)) cappedTime++;

    /* ── bot decisions ── */
    // stance: the skilled bot answers the scouted shape; the lazy bot never touches it
    if(skilled && s.b.watchtower >= 1){
      const want = WAVE_TYPES[s.waveType]?.weakTo || 'balanced';
      if(s.stance !== want) L.setStance(s, want, ms);
    }
    // orders: fire whatever is ready (battle mods persist until the next battle)
    for(const id of Object.keys(s.heroes)) if(!(s.orderCd[id]>0)) L.useOrder(s, id, ms);
    // the court: a chair left empty is a passive left on the table. The Tavern
    // opens new ones as it grows, so this has to be re-checked, not done once.
    if(s.court.length < L.courtSeats(s)){
      for(const id of Object.keys(s.heroes)){
        if(s.court.includes(id) || L.heroAway(s,id)) continue;
        if(!L.seatHero(s, id, ms)) break;
      }
    }
    /* Marches: the skilled bot works the frontier whenever the wall can spare a
       quarter of the army. The old 2.2x gate almost never opened — the bot sat
       at home and the sim gave no signal at all on columns, leaders or stars,
       which is not how anyone actually plays. 1.4x is still cautious (it keeps
       a comfortable margin over the next wave) but it does go out. */
    if(skilled && s.marches.length < W.marchSlots(s)){
      const nextEnemy = L.wavePower(s.wave)*(s.wave%5===0?1.6:1)*1.12;
      if(L.armyPower(s) > 1.4*nextEnemy){
        let target = -1;
        // three leaders per column now, and they cap how many troops fit
        const party = skilled ? W.bestLeaders(s, 3) : [];
        const want = {}; for(const k of Object.keys(TROOPS)) want[k] = Math.floor(s.t[k]*0.25);
        const q = W.fitColumn(s, want, party).troops;
        for(let i=0;i<s.world.tiles.length;i++){
          const tl = s.world.tiles[i];
          if(tl.respawnAt || W.tileBusy(s,i) || tl.type!=='camp') continue;
          if(W.marchPower(s,q,party) > 1.5*W.campPower(s,tl)){ target=i; break; }
        }
        if(target<0){
          const scarce = ['iron','stone','wood','food'].sort((a,b)=>s.res[a]-s.res[b])[0];
          for(let i=0;i<s.world.tiles.length;i++){
            const tl = s.world.tiles[i];
            if(tl.respawnAt || W.tileBusy(s,i)) continue;
            const tt = W.TILE_TYPES[tl.type];
            if(tt.kind==='gather' && tt.res===scarce){ target=i; break; }
          }
        }
        if(target>=0) W.startMarch(s, target, want, ms, false, party);
      }
    }
    // expeditions: the skilled bot dispatches by hand; the lazy one sets a caravan and forgets
    if(skilled){
      if(t >= (s.patrolReady/1000)){
        const route = s.valor < 15 ? 'barrows'
          : (s.res.stone + s.res.iron < s.res.food ? 'wildwood' : 'kingsroad');
        L.expedition(s, route, ms, rand);
      }
    }else if(!s.caravan){
      L.setCaravan(s, 'kingsroad', ms);
    }

    for(const q of L.QUEUE_KEYS){
      if(s[q] && s[q].end-ms > 15000){
        const c = L.finishCost(s[q].end, ms);
        if(s.valor >= c && L.finishBuildNow(s, ms, q)) valorSpent += c;
      }
    }
    for(const tk of L.activeTrainings(s)){
      const q = L.trainQueue(s, tk);
      if(q && q.end-ms > 15000){
        const c = L.finishCost(q.end, ms);
        if(s.valor >= c && L.finishTrainNow(s, ms, tk)) valorSpent += c;
      }
    }

    while(L.freeSlot(s)){
      const eligible = k => {
        const d = BUILDINGS[k], lvl = s.b[k];
        if(lvl >= d.max) return false;
        if(k!=='townhall' && lvl >= s.b.townhall) return false;
        if(d.th && s.b.townhall < d.th) return false;
        if(k==='townhall' && !L.townhallReq(s).ok) return false;   // the hold must keep pace
        return L.canAfford(s, L.buildCost(s,k));
      };
      let pick = null;
      if(eligible('townhall')) pick = 'townhall';
      else if(s.b.quarry===0 && eligible('quarry')) pick = 'quarry';
      else if(s.b.barracks===0 && eligible('barracks')) pick = 'barracks';
      else if(s.b.academy < 6 && eligible('academy')) pick = 'academy';
      // a yard you do not own is a troop type you can never field — stand them
      // all up before widening anything else
      else if(s.b.range === 0 && eligible('range')) pick = 'range';
      else if(s.b.stable === 0 && eligible('stable')) pick = 'stable';
      else if(s.b.siegeyard === 0 && eligible('siegeyard')) pick = 'siegeyard';
      else {
        // clear the Town Hall's prerequisites first — that is what the gate is for
        const req = L.townhallReq(s);
        if(!req.ok) for(const k of req.short) if(eligible(k)){ pick=k; break; }
        const prodOf = {food:'farm',wood:'lumberyard',stone:'quarry',iron:'ironmine'};
        const order = Object.keys(RES_META).filter(r=>!RES_META[r].refined).sort((a,b)=>s.res[a]-s.res[b]);
        if(!pick) for(const r of order){ const k=prodOf[r]; if(eligible(k)){ pick=k; break; } }
        if(!pick && s.b.wall<s.b.townhall && eligible('wall')) pick='wall';
        if(!pick && s.b.barracks<s.b.townhall && eligible('barracks')) pick='barracks';
        if(!pick && s.b.watchtower<3 && eligible('watchtower')) pick='watchtower';
        // the refineries are not optional: without them every upgrade stops at 14
        // the Library is the spine of research — the bot keeps it climbing
        if(!pick && s.b.library < Math.min(10, s.b.townhall) && eligible('library')) pick='library';
        // the drilling yards are what let the army keep pace with the raid clock
        if(!pick) for(const k of ['range','stable','siegeyard','embassy','command','hospital'])
          if(s.b[k] < Math.min(8, s.b.townhall) && eligible(k)){ pick=k; break; }
        if(!pick) for(const k of ['forge','runeworks','tavern','granary','hospital','warehouse'])
          if(eligible(k)){ pick=k; break; }
      }
      // break on a failed start too, or the free slot spins forever
      if(!pick || !L.startUpgrade(s, pick, ms)){ idleBuild++; break; }
    }

    // research runs on its own queue — the bot always keeps the scholars busy
    if(!s.rq){
      if(s.rq2Cd === undefined) s.rq2Cd = 0;
      for(const k of ['husbandry','masonry','warcraft','logistics','drillcraft',
                      'fortification','medicine','statecraft','siegecraft','smelting']){
        if(L.startResearch(s, k, ms)) break;
      }
    }
    if(s.rq && s.rq.end-ms > 15000){
      const c = L.finishCost(s.rq.end, ms);
      if(s.valor >= c && L.finishResearchNow(s, ms)) valorSpent += c;
    }

    // tend the wounded whenever the stores allow — they are troops, not losses
    if(!s.hq && L.woundedTotal(s) > 0 && L.canAfford(s, L.healCost(s))) L.startHealing(s, ms);

    // promote troop tiers when the Academy allows and stores permit
    for(const k of ['ballista','knight','archer','spearman']){
      if(L.tierOf(s,k) < L.maxTier(s) && L.canAfford(s, L.promoteCost(s,k))){ L.promote(s, k, ms); break; }
    }

    // training: keep ahead of the next wave, but never beyond food sustainability
    for(const troopKey of ['ballista','knight','archer','spearman']){
     if(!L.trainQueue(s, troopKey) && (s.b[TROOPS[troopKey].at]||0) >= 1){
      const wb = s.wave%5===0;
      const target = 1.4 * L.wavePower(s.wave)*(wb?1.6:1)*1.12
        *(1-L.bluntMult(s))*L.streakMult(s);
      const deficit = target - L.armyPower(s);
      const best = troopKey;
      const dump = s.res.food > 0.8*L.storageCap(s);
      if(deficit > 0 || dump){
        // skilled: keep a mixed line for class counters and screening; lazy: spam the best
        let pick = best;
        if(skilled){
          const targets = {spearman:0.30, archer:0.20, knight:0.30, ballista:0.20};
          let worst = null, worstGap = 0, totalP = 0;
          for(const k of Object.keys(TROOPS)) totalP += L.tierPower(s,k)*s.t[k];
          for(const k of Object.keys(TROOPS)){
            if(s.b.barracks < TROOPS[k].barracks) continue;
            const gap = targets[k] - (totalP>0 ? L.tierPower(s,k)*s.t[k]/totalP : 0);
            if(gap > worstGap){ worstGap = gap; worst = k; }
          }
          if(worst) pick = worst;
        }
        const d = TROOPS[pick];
        const headroom = L.prodPerSec(s,'food')*0.85 - L.upkeepPerSec(s);
        const maxSustain = Math.max(0, Math.floor(headroom/d.upkeep));
        const maxAfford = Math.min(...Object.entries(d.cost).map(([r,v]) => Math.floor(s.res[r]/v)));
        const want = deficit>0 ? Math.ceil(deficit/d.power) : 5;
        const n = Math.max(0, Math.min(25, maxAfford, want, maxSustain));
        if(n > 0) L.startTraining(s, pick, n, ms);
      }
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
  console.log('-- troops: '+Object.entries(s.t).map(([k,v])=>k+':'+v).join(' ')
    +' (total '+Object.values(s.t).reduce((a,b)=>a+b,0)+')'
    +' | column capacity '+W.marchCapacity(s, W.bestLeaders(s, 3)));
  console.log('-- heroes: '+(Object.entries(s.heroes).map(([k,h])=>k+' L'+h.lvl+(h.stars?'+'+h.stars+'✦':'')+(h.deeds?'('+h.deeds+'d)':'')).join(', ')||'none')
    +' | spoils: '+(Object.entries(s.spoils).map(([k,n])=>k+(n>1?'×'+n:'')).join(', ')||'none'));
  console.log('-- valor left '+Math.floor(s.valor)+' spent '+valorSpent+' | famine events (recent log) '+famines
    +' | build-idle '+Math.round(100*idleBuild/T)+'% | at-cap '+Math.round(100*cappedTime/T)+'%');
  console.log('');
}

simulate(90, 1.0,  true,  '90 min, average luck, SKILLED (reads scouts, counters)');
simulate(90, 1.0,  false, '90 min, average luck, LAZY (never changes stance)');
simulate(240, 1.0, true,  '4 hours, average luck, skilled');
simulate(480, 1.0, true,  '8 hours, average luck, skilled — the long road');
