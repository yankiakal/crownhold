// Crownhold balance simulator. Unlike a hand-mirrored model, this drives the REAL
// game rules — src/logic.js `tick()` with a fake clock and deterministic rng — so
// sim results can never drift from what players experience. Run: npm run sim
//
// The bot is a competent active player: builds by priority, trains to stay ahead
// of the next wave without starving the food economy, patrols on cooldown, and
// spends Valor to finish long timers.

import { BUILDINGS, TROOPS, RES_META, WAVE_TYPES } from '../src/defs.js';
import * as D from '../src/defs.js';
import * as L from '../src/logic.js';
import * as W from '../src/world.js';
import { freshState } from '../src/state.js';

// skilled=true reads the scouts and sets the counter-stance; false stays Balanced.
// Both use hero orders — the delta isolates the value of paying attention.
/* `season` lets a run be played under a chosen temper: the clock starts that
   many fortnights past the epoch, so rollWaveType picks from that season's
   muster. Without it every run sits in season 1 (The Common Muster, even
   weights) and the temper system is never exercised. */
function simulate(minutes, enemyLuck, skilled, label, season = 1){
  const t0 = D.SEASON_EPOCH + (season - 1) * D.SEASON_MS;
  const s = freshState(t0, 42); // fixed map seed keeps runs comparable
  s.seenIntro = true;
  // resolveWave rolls enemy strength as 0.88 + rand()*0.24; invert for a fixed roll
  const rand = () => (enemyLuck - 0.88) / 0.24;

  const T = minutes*60;
  const ev = [];
  let idleBuild=0, cappedTime=0, valorSpent=0, prevTH=1, prevWon=0, prevLost=0;
  /* Frontier activity, by tile level. Tracked because "the bot fought no camps" is
     the exact shape the v1.19 disaster took — the frontier was mathematically
     unwinnable for two commits and the only symptom was an absence in this output.
     With levels now running to 8, an unreachable top of the ladder would look
     identical, so the ladder gets counted rather than assumed. */
  const campsAt = {}, gathersAt = {};
  const colChoice = {};   // which column shape the bot judged best, and how often
  const probe = { ticks:0, busy:0, couldBuild:0, onlyPoor:0, nothingLegal:0, capped:0, thPace:0, readySum:0, actSum:0, nothingToDo:0, noPick:0, startFailed:{} };
  const mm = t => String(Math.floor(t/60)).padStart(3,' ')+':'+String(t%60).padStart(2,'0');
  const note = (t,txt) => ev.push(mm(t)+'  '+txt);

  let prevML = 0;
  for(let t=1; t<=T; t++){
    const ms = t0 + t*1000;

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
      /* The safety gate now compares like with like. It used to weigh raw army power
         against a wave figure that ignored the wall, the Watchtower's blunting and the
         streak multiplier — i.e. against an enemy far stronger than the one that
         actually arrives. As waves escalated the gate closed for good, and the bot
         simply stopped going out: the 4-hour and 8-hour runs reported IDENTICAL
         frontier activity, meaning every march happened in the first two hours. This
         is the same expression resolveWave() fights with. */
      const nextEnemy = L.wavePower(s.wave)*(s.wave%5===0?1.6:1)*1.12
        * (1 - L.bluntMult(s)) * L.streakMult(s);
      if(L.armyPower(s) > 1.15*nextEnemy){
        let target = -1;
        // three leaders per column now, and they cap how many troops fit
        const party = skilled ? W.bestLeaders(s, 3) : [];
        /* The column the bot actually sends. It used to commit a flat 60% of every troop
           type, which meant the simulator NEVER discovered what the best column was — and
           that hardcoded ratio is what hid a genuine dominant strategy for months: a
           full column of ballistae hit for 13,284 against a mixed one's 6,218, because
           capacity is counted in bodies and a ballista is 6.5× a spearman per body.

           So the bot now compares candidates and takes the strongest, which is what an
           optimising player does. If a single type still wins outright, the numbers here
           will say so instead of concealing it. */
        const CANDIDATES = [
          { name:'all-in', mix:{ spearman:1, archer:1, knight:1, ballista:1 } },
          { name:'siege',  mix:{ ballista:1 } },
          { name:'cavalry',mix:{ knight:1 } },
          { name:'foot',   mix:{ spearman:1, archer:1 } },
          { name:'screened siege', mix:{ spearman:1, ballista:1 } },
          { name:'screened cavalry', mix:{ spearman:1, knight:1 } },
        ];
        let q = null, qName = 'none', best = -1;
        for(const c of CANDIDATES){
          const w = {};
          for(const k of Object.keys(TROOPS)) w[k] = c.mix[k] ? Math.floor(s.t[k] * 0.6) : 0;
          const fitted = W.fitColumn(s, w, party);
          if(!fitted.total) continue;
          const p = W.marchPower(s, fitted.troops, party, 'camp');
          if(p > best){ best = p; q = fitted.troops; qName = c.name; }
        }
        if(!q){ q = {}; }
        colChoice[qName] = (colChoice[qName] || 0) + 1;
        const want = q;
        /* The RICHEST camp this column can take, not the first one in the array.
           Taking the first meant always taking the nearest and weakest, so the deep
           map went unvisited no matter how strong the hold got — and a level-8 camp
           nobody ever attempts cannot be shown to be beatable. Real players push as
           high as they can. */
        const mine = W.marchPower(s, q, party, 'camp');
        let bestLvl = -1;
        for(let i=0;i<s.world.tiles.length;i++){
          const tl = s.world.tiles[i];
          if(tl.respawnAt || W.tileBusy(s,i) || tl.type!=='camp') continue;
          if(W.tileLocked && W.tileLocked(s, tl)) continue;  // the Town Hall gates the deep map
          if(mine > 1.5*W.campPower(s,tl) && tl.lvl > bestLvl){ bestLvl = tl.lvl; target = i; }
        }
        if(target<0){
          const scarce = ['iron','stone','wood','food'].sort((a,b)=>s.res[a]-s.res[b])[0];
          let rich = -1;
          for(let i=0;i<s.world.tiles.length;i++){
            const tl = s.world.tiles[i];
            if(tl.respawnAt || W.tileBusy(s,i) || (W.tileLocked && W.tileLocked(s, tl))) continue;
            const tt = W.TILE_TYPES[tl.type];
            if(tt.kind==='gather' && tt.res===scarce && tl.lvl > rich){ rich = tl.lvl; target = i; }
          }
        }
        let beast = -1;
        for(let i=0;i<(s.world.beasts||[]).length;i++){
          if(W.beastBusy(s,i)) continue;
          if(W.marchPower(s,q,party,'beast') > 1.4*W.beastPower(s, s.world.beasts[i])){ beast=i; break; }
        }
        /* Camps pay nearly twice the loot; beasts pay bond, and bond is the only
           road to a companion. So the errand is chosen by what the hold is short
           of — which is also the decision a real player is making here. */
        /* Send BOTH if there are slots for both. The bot used to start one march per
           tick and prefer a hunt unless the hold was short of resources — so once
           beasts unlocked it hunted essentially forever and the camp ladder went
           unmeasured: an 8-hour run took three camps, all before the first beast
           appeared. Nobody with eight march slots plays that way, and more to the
           point a system the bot never touches is a system the simulator cannot
           tell me anything about. */
        const sendCamp = () => {
          if(target < 0 || s.marches.length >= W.marchSlots(s)) return;
          const tl = s.world.tiles[target];
          const bag = tl.type === 'camp' ? campsAt : gathersAt;
          if(W.startMarch(s, target, want, ms, false, party) !== false) bag[tl.lvl] = (bag[tl.lvl]||0)+1;
        };
        const sendHunt = () => {
          if(beast < 0 || s.marches.length >= W.marchSlots(s)) return;
          W.startHunt(s, beast, want, ms, party);
        };
        // camps pay nearly twice the loot; beasts pay bond, the only road to a
        // companion. Short of stores, the loot goes first; otherwise the hunt does.
        const poor = s.res.food + s.res.wood < L.storageCap(s) * 0.5;
        if(poor){ sendCamp(); sendHunt(); } else { sendHunt(); sendCamp(); }
      }
    }
    // a companion left in the kennel is a bonus left on the floor
    if(!s.petOut){
      const first = Object.keys(s.pets||{})[0];
      if(first) L.setPetOut(s, first, ms);
    }
    // expeditions: the skilled bot dispatches by hand; the lazy one sets a caravan and forgets
    if(skilled){
      // compare against the clock, not the loop counter — `t` is elapsed seconds
      // and patrolReady is an absolute timestamp. These only coincided while the
      // sim started at epoch 0; rebasing onto the season clock silently stopped
      // the skilled bot expediting at all.
      if(ms >= s.patrolReady){
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
        /* One crew per structure — startUpgrade enforces it and the bot did not model
           it, so with two crews it picked its top-priority building twice and the
           second was refused, every tick. The second crew has been very nearly
           useless in this simulator since the day it was added, and the 8-hour run
           reported a 47% idle queue that was entirely this. */
        if(L.activeQueues(s).some(q => s[q].key === k)) return false;
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
        /* The NAMED pair first, then the nearest substitutable ones. The bot used to read
           only req.short — the closest candidates by level — which made it blind to the two
           buildings the level actually demands, so it kept raising almost-there buildings
           while the gate stayed shut. The simulator reported army 1,421 against a floor of
           1,500 and I nearly eased the rule over it: the rule was fine, the bot was reading
           the wrong field. A human player is shown these two by name on the road panel. */
        if(!req.ok) for(const k of req.pairShort) if(eligible(k)){ pick=k; break; }
        if(!pick && !req.ok) for(const k of req.short) if(eligible(k)){ pick=k; break; }
        const prodOf = {food:'farm',wood:'lumberyard',stone:'quarry',iron:'ironmine'};
        // only resources a building actually produces — Isle Ore has none
        const order = Object.keys(RES_META)
          .filter(r => !RES_META[r].refined && !RES_META[r].carried && prodOf[r])
          .sort((a,b)=>s.res[a]-s.res[b]);
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
        /* Last resort: ANYTHING legal and affordable. Without this the bot's hardcoded
           priority list was the real bottleneck, and every idleness figure it produced
           measured the list rather than the game — 58% "build-idle" and a 49% idle
           queue both turned out to be the bot declining work the game was offering.
           A real player does not leave a crew standing because their favourite
           building is capped. */
        if(!pick) for(const k of Object.keys(BUILDINGS)) if(eligible(k)){ pick=k; break; }
      }
      // break on a failed start too, or the free slot spins forever
      if(!pick){ idleBuild++; probe.noPick++; break; }
      if(!L.startUpgrade(s, pick, ms)){ idleBuild++; probe.startFailed[pick] = (probe.startFailed[pick]||0)+1; break; }
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

    /* Sampled at the END of the tick, after every decision is made. Sampling before
       the bot acted caught the build queue in the instant before it was filled and
       reported a 48% idle queue that the bot then filled microseconds later — my own
       probe manufacturing the exact artifact it was written to rule out.

       Why the hold is not building — measured against the GAME's rules, not against
       the bot's priority list. `build-idle` counts ticks where the bot found nothing
       it wanted, and the bot's list is hardcoded and incomplete (it never builds the
       Command Center at all), so that figure cannot distinguish "the game offers
       nothing" from "the bot asked for nothing". Those need completely different
       fixes, and the same conflation already fooled me once today over at-cap. */
    if(t % 10 === 0){
      probe.ticks++;
      let ready = 0, poor = 0, capped = 0;
      for(const k of Object.keys(BUILDINGS)){
        const d = BUILDINGS[k], lvl = s.b[k] || 0;
        if(L.activeQueues(s).some(q => s[q].key === k)) continue;   // already under way
        if(lvl >= d.max) continue;
        if(d.th && s.b.townhall < d.th) continue;              // not unlocked yet
        if(k === 'townhall'){
          if(!L.townhallReq(s).ok){ probe.thPace++; continue; }
        } else if(lvl >= s.b.townhall){ capped++; continue; }  // the Town Hall must lead
        if(L.canAfford(s, L.buildCost(s, k))) ready++; else poor++;
      }
      probe.capped += capped;
      if(!L.freeSlot(s)) probe.busy++;
      else if(ready > 0) probe.couldBuild++;
      else if(poor > 0) probe.onlyPoor++;
      else probe.nothingLegal++;
      probe.readySum += ready;

      /* The question the player actually asks is not "can I build" but "is there
         anything to DO". Counted across every parallel track, because this genre is
         made of timers and what stops it feeling like waiting is having somewhere
         else to spend attention while one runs. */
      let acts = 0;
      if(L.freeSlot(s) && ready > 0) acts++;                       // an upgrade
      if(L.activeTrainings(s).length < 1 &&
         Object.keys(TROOPS).some(k => s.b[TROOPS[k].at] > 0 && L.canAfford(s, L.trainCost(s,k,1)))) acts++;
      if(!s.rq) acts++;                                            // scholars idle
      if(!s.forgeQ) acts++;                                        // the forge idle
      if(s.marches.length < W.marchSlots(s) &&
         s.world.tiles.some((t,i) => !t.respawnAt && !W.tileBusy(s,i) && !W.tileLocked(s,t))) acts++;
      if((s.valor||0) >= 20) acts++;                               // Valor to spend on a timer
      if(s.choice || (s.choiceQueue||[]).length) acts++;           // a draft waiting
      if(Object.keys(TROOPS).some(k => L.tierOf(s,k) < L.maxTier(s) &&
         L.canAfford(s, L.promoteCost(s,k)))) acts++;              // a promotion
      probe.actSum += acts;
      if(acts === 0) probe.nothingToDo++;
    }
  }

  const famines = s.log.filter(e => e.txt.startsWith('Famine')).length;
  console.log('══ '+label+' · '+D.temperFor(t0).name+' ══');
  console.log(ev.join('\n'));
  console.log('-- end state: TH'+s.b.townhall+' wave '+s.wave+' won '+s.wavesWon+' lost '+s.wavesLost
    +' | army '+L.armyPower(s)+' (upkeep '+L.upkeepPerSec(s).toFixed(1)+'/s, food prod '+L.prodPerSec(s,'food').toFixed(1)+'/s)'
    +' | mastery '+L.masteryLvl(s)+' | quests '+s.questIdx+'/24');
  console.log('-- buildings: '+Object.entries(s.b).map(([k,v])=>k+':'+v).join(' '));
  const lvls = o => Object.keys(o).map(Number).sort((a,b)=>a-b);
  const show = o => lvls(o).length ? lvls(o).map(l=>'L'+l+'×'+o[l]).join(' ') : 'none';
  /* Reported alongside the deepest camp taken so a GATE is never mistaken for an
     unwinnable fight — the two look identical in a bare count, and that confusion is
     what let the frontier stay mathematically unbeatable for two commits in v1.19. */
  const LMAX = W.TILE_LVL_MAX || 3;
  let unlocked = 0, open8 = 0;
  for(const t of s.world.tiles){ if(!(W.tileLocked && W.tileLocked(s, t))) unlocked++; if(t.lvl === LMAX) open8++; }
  /* Derived by asking tileReq, not by restating its arithmetic. The restated version
     said "TH14 unlocks to L7" in the same line that reported an L8 camp taken — two
     formulas that have to agree, which is exactly the bug that mis-tiered seven
     sprites earlier today. */
  let cap = 1;
  for(let l = 1; l <= LMAX; l++) if(W.tileReq(l) <= (s.b.townhall || 0)) cap = l;
  const cc = Object.entries(colChoice).sort((a,b)=>b[1]-a[1]);
  console.log('-- best column judged: ' + (cc.length ? cc.map(([k,n])=>k+'×'+n).join(' | ') : 'never marched'));
  console.log('-- frontier tiles: camps '+show(campsAt)+' | gathers '+show(gathersAt)
    + ' | deepest taken L'+(lvls(campsAt).pop()||0)
    + ' | TH'+(s.b.townhall||0)+' unlocks to L'+Math.min(cap, LMAX)
    + ' ('+unlocked+'/'+s.world.tiles.length+' tiles open)');
  console.log('-- frontier: '+(s.beastsSlain||0)+' beasts slain, bond '+(s.bond||0)
    +' | pets: '+(Object.entries(s.pets||{}).map(([k,p])=>k+' L'+p.lvl).join(', ')||'none')
    +(s.petOut?' (out: '+s.petOut+')':''));
  console.log('-- troops: '+Object.entries(s.t).map(([k,v])=>k+':'+v).join(' ')
    +' (total '+Object.values(s.t).reduce((a,b)=>a+b,0)+')'
    +' | column capacity '+W.marchCapacity(s, W.bestLeaders(s, 3)));
  console.log('-- heroes: '+(Object.entries(s.heroes).map(([k,h])=>k+' L'+h.lvl+(h.stars?'+'+h.stars+'✦':'')+(h.deeds?'('+h.deeds+'d)':'')).join(', ')||'none')
    +' | spoils: '+(Object.entries(s.spoils).map(([k,n])=>k+(n>1?'×'+n:'')).join(', ')||'none'));
  console.log('-- valor left '+Math.floor(s.valor)+' spent '+valorSpent+' | famine events (recent log) '+famines
    +' | build-idle '+Math.round(100*idleBuild/T)+'% | at-cap '+Math.round(100*cappedTime/T)+'%');
  const pc = n => Math.round(100*n/Math.max(1,probe.ticks))+'%';
  console.log('-- build queue: busy '+pc(probe.busy)
    +' | free & something affordable '+pc(probe.couldBuild)
    +' | free but too poor '+pc(probe.onlyPoor)
    +' | free & NOTHING legal '+pc(probe.nothingLegal));
  const sf = Object.entries(probe.startFailed).sort((a,b)=>b[1]-a[1]).slice(0,4);
  console.log('-- crew idled: no eligible pick ×'+probe.noPick
    + ' | startUpgrade refused ' + (sf.length ? sf.map(([k,n])=>k+'×'+n).join(' ') : 'never'));
  console.log('-- things to do at any moment: '+(probe.actSum/Math.max(1,probe.ticks)).toFixed(1)
    +' on average across every track | NOTHING to do '+pc(probe.nothingToDo)+' of the time');
  console.log('-- when free: '+(probe.readySum/Math.max(1,probe.ticks)).toFixed(1)+' buildings affordable on average'
    +' | blocked by "Town Hall must lead" '+(probe.capped/Math.max(1,probe.ticks)).toFixed(1)+' per check'
    +' | Town Hall itself pace-blocked '+pc(probe.thPace));
  console.log('');
  judge(minutes, label, s);
}

/* ── the floor ──
   The simulator printed and never judged, so a change that flattened the whole economy
   still exited 0 and `npm run check` went green over it. That happened: multi-resource
   upkeep demanded iron before the Iron Mine could exist, the run ended at Town Hall 1 with
   sixty soldiers instead of Town Hall 8 with seven thousand, and nothing failed.

   These are not balance targets — they are catastrophe detectors, set far below any healthy
   run, so they only fire when something is broken rather than merely different. */
const FLOORS = { th: 6, army: 1500, waves: 60 };
const failures = [];
function judge(minutes, label, s){
  if(minutes < 240) return;               // a 90-minute run is legitimately small
  const th = s.b.townhall, army = L.armyPower(s);
  if(th < FLOORS.th) failures.push(label + ': Town Hall ' + th + ' < ' + FLOORS.th);
  if(army < FLOORS.army) failures.push(label + ': army ' + Math.round(army) + ' < ' + FLOORS.army);
  if(s.wavesWon < FLOORS.waves) failures.push(label + ': ' + s.wavesWon + ' waves won < ' + FLOORS.waves);
}

simulate(90, 1.0,  true,  '90 min, average luck, SKILLED (reads scouts, counters)');
simulate(90, 1.0,  false, '90 min, average luck, LAZY (never changes stance)');
simulate(240, 1.0, true,  '4 hours, average luck, skilled');
simulate(480, 1.0, true,  '8 hours, average luck, skilled — the long road');
// the temper system only earns its keep if a lopsided season plays differently
simulate(240, 1.0, true,  '4 hours, skilled, under a lopsided muster', 2);
simulate(240, 1.0, false, '4 hours, LAZY, under a lopsided muster', 2);

if(failures.length){
  console.error('\n== SIM FLOOR BREACHED ==');
  for(const f of failures) console.error('  ✗ ' + f);
  console.error('\nA run this far below a healthy one means the economy is broken, not tuned.');
  process.exit(1);
}
console.log('== sim floors held: Town Hall \u2265' + FLOORS.th + ', army \u2265' + FLOORS.army
  + ', waves \u2265' + FLOORS.waves + ' on the long runs ==');
