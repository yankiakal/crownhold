// Crownhold game rules. Pure state-in, state-out — no DOM, no globals.
// Every function takes the state `s` explicitly; time (`now`, ms) and randomness
// (`rand`) are injected so the browser, the balance sim, and a future server all
// run this exact module.

import {
  BUILDINGS, TROOPS, MASTERY, QUESTS, RES_META,
  HERO_POOL, HERO_SLOTS, SPOILS, RARITY,
  COST_MULT, TH_COST_MULT, TIME_MULT,
  WAVE_MS, FIRST_WAVE_MS, masteryLvl,
} from './defs.js';

export { masteryLvl };

/* ── formatting ── */
export function fmt(n){ return n>=10000 ? (n/1000).toFixed(1)+'k' : String(Math.floor(n)); }
export function ftime(ms){ const s=Math.max(0,Math.ceil(ms/1000)); return s>=60 ? Math.floor(s/60)+'m '+(s%60)+'s' : s+'s'; }
export function clock(t){ const d=new Date(t); return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'); }

/* ── bonus aggregation: heroes + spoils feed every stat below ── */
export function heroBonus(s, key){
  let b = 0;
  for(const [id,h] of Object.entries(s.heroes)){
    const d = HERO_POOL[id];
    if(d && d.bonus[key]) b += d.bonus[key]*h.lvl;
  }
  return b;
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
export function shieldCap(s){ return 2 + (perk(s,7)?1:0) + spoilBonus(s,'shieldCap'); }
export function storageCap(s){ return Math.round(800 * Math.pow(s.b.townhall,1.35) * (perk(s,4)?1.15:1)); }
export function prodMult(s, res){
  const resKey = {food:'foodProd',wood:'woodProd',stone:'stoneProd',iron:'ironProd'}[res];
  return 1 + heroBonus(s,'production') + (perk(s,1)?0.06:0) + (perk(s,8)?0.08:0) + spoilBonus(s,resKey);
}
export function prodPerSec(s, res){
  let p = 0;
  for(const [k,d] of Object.entries(BUILDINGS)) if(d.prod===res) p += d.rate * s.b[k];
  return p * prodMult(s,res);
}
export function upkeepPerSec(s){
  let u = 0;
  for(const [k,d] of Object.entries(TROOPS)) u += d.upkeep * (s.t[k]||0);
  return u * Math.max(0.55, 1 - heroBonus(s,'upkeep') - spoilBonus(s,'upkeep'));
}
export function buildCost(s,k){
  const d=BUILDINGS[k], lvl=s.b[k], c={};
  const mult = k==='townhall' ? TH_COST_MULT : COST_MULT;
  for(const [r,v] of Object.entries(d.cost)) c[r] = Math.round(v * Math.pow(mult,lvl));
  return c;
}
export function buildTime(s,k){
  const spoilMult = Math.max(0.5, 1 - spoilBonus(s,'buildTime'));
  return Math.min(300, BUILDINGS[k].time * Math.pow(TIME_MULT, s.b[k]) * (perk(s,5)?0.88:1) * spoilMult) * 1000;
}
export function canAfford(s,cost){ return Object.entries(cost).every(([r,v]) => s.res[r] >= v); }
export function payCost(s,cost){ for(const [r,v] of Object.entries(cost)) s.res[r] -= v; }
export function trainMult(s){
  const b = Math.max(0, s.b.barracks-1);
  return Math.max(0.25,
    (1 - 0.08*b - heroBonus(s,'trainTime') - spoilBonus(s,'trainTime')) * (perk(s,5)?0.88:1));
}
export function armyPower(s){
  let p = 0;
  for(const [k,d] of Object.entries(TROOPS)) p += d.power * s.t[k];
  p *= (1 + heroBonus(s,'troopPower') + spoilBonus(s,'troopPower'))
     * (1 + (perk(s,2)?0.06:0) + (perk(s,8)?0.08:0) + (perk(s,10)?0.15:0));
  return Math.round(p + 18*s.b.wall + heroBonus(s,'wallPower'));
}
export function wavePower(w){ return Math.round(10*Math.pow(w,1.3) + 5*w); }
// each consecutive loss bloodies the band: it returns at 85% strength, floor ~61%
export function streakMult(s){ return Math.pow(0.85, Math.min(s.streak||0, 3)); }
export function bluntMult(s){ return Math.min(0.4, 0.05*s.b.watchtower + heroBonus(s,'blunt')); }
export function finishCost(endTs, now){ return Math.max(1, Math.ceil((endTs-now)/4000)); }
export function xpNeed(lvl){ return Math.round(50*Math.pow(lvl,1.4)); }
export function unlockedSlots(s){ return HERO_SLOTS.filter(sl=>sl.check(s)).length; }

/* ── events, log, rewards ── */
export function pushLog(s, txt, cls){
  s.log.unshift({t:s.now||0, txt, cls:cls||''});
  if(s.log.length > 40) s.log.length = 40;
}
export function showBanner(s, txt, cls, now){ s.banner = {txt, cls:cls||'', until:now+4000}; }
export function gainRes(s, r, amt){ s.res[r] = Math.min(s.res[r]+amt, storageCap(s)); }
export function gainValor(s, v){ s.valor += Math.round(v * (1 + heroBonus(s,'valor'))); }
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

/* ── drafts: random offers, player choice, never sold ── */
export function rollHeroOffer(s, rand){
  const owned = new Set(Object.keys(s.heroes));
  const queued = new Set((s.choiceQueue||[]).flatMap(c => c.type==='hero' ? c.options : []));
  const avail = Object.keys(HERO_POOL).filter(id => !owned.has(id) && !queued.has(id));
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
    s.heroes[id] = {lvl:1, xp:0};
    const d = HERO_POOL[id];
    pushLog(s, d.icon+' '+d.name+' pledges service to the hold!', 'gold');
    showBanner(s, d.icon+' Hero drafted: '+d.name, 'win', now);
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
  const fresh = c.type==='hero' ? rollHeroOffer(s, rand) : rollSpoilOffer(s, rand);
  if(!fresh.length) return false;
  s.valor -= 5; c.reroll--;
  c.options = fresh;
  pushLog(s, 'The offer is redrawn for 5 Valor.');
  return true;
}

/* ── player actions ── */
export function startUpgrade(s, key, now){
  s.now = now;
  if(s.bq) return false;
  const d = BUILDINGS[key], lvl = s.b[key];
  if(lvl >= d.max) return false;
  if(key!=='townhall' && lvl >= s.b.townhall) return false;
  if(d.th && s.b.townhall < d.th) return false;
  const cost = buildCost(s, key);
  if(!canAfford(s, cost)) return false;
  payCost(s, cost);
  s.bq = {key, start:now, end:now+buildTime(s,key)};
  pushLog(s, (lvl===0?'Construction of the ':'Work begins on the ')+d.name+(lvl===0?' begins.':' (level '+(lvl+1)+').'));
  return true;
}
export function startTraining(s, key, count, now){
  s.now = now;
  if(s.tq) return false;
  const d = TROOPS[key];
  if(s.b.barracks < d.barracks) return false;
  count = Number(count)||1;
  const cost = {};
  for(const [r,v] of Object.entries(d.cost)) cost[r] = v*count;
  if(!canAfford(s, cost)) return false;
  payCost(s, cost);
  const dur = d.time*1000*count*trainMult(s);
  s.tq = {key, count, start:now, end:now+dur};
  pushLog(s, 'The Barracks begins drilling '+count+' '+d.name+(count>1?'s':'')+'.');
  return true;
}
export function finishBuildNow(s, now){
  if(!s.bq) return false;
  const c = finishCost(s.bq.end, now);
  if(s.valor < c) return false;
  s.valor -= c; s.bq.end = now;
  return true;
}
export function finishTrainNow(s, now){
  if(!s.tq) return false;
  const c = finishCost(s.tq.end, now);
  if(s.valor < c) return false;
  s.valor -= c; s.tq.end = now;
  return true;
}
export function patrol(s, now, rand=Math.random){
  s.now = now;
  if(now < s.patrolReady) return false;
  s.patrolReady = now + 25000 - (perk(s,3)?8000:0);
  const mult = (perk(s,9)?2:1) * (1 + heroBonus(s,'patrolYield') + spoilBonus(s,'patrolYield'));
  const th = s.b.townhall, f = Math.round((12+6*th)*mult), w = Math.round((12+6*th)*mult);
  gainRes(s,'food',f); gainRes(s,'wood',w); gainValor(s, 2);
  gainMastery(s, 3, now);
  let extra = '';
  if(rand() < 0.25){ const st = Math.round((10+4*th)*mult); gainRes(s,'stone',st); extra = ', +'+st+' stone'; }
  pushLog(s, 'Your patrol returns: +'+f+' food, +'+w+' wood'+extra+', +2 Valor.', 'gold');
  return true;
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
  const label = isWB ? 'Warband' : 'Raid';
  const raw = wavePower(w) * (isWB?1.6:1) * (0.88 + rand()*0.24) * streakMult(s);
  const enemy = raw * (1-bluntMult(s));
  const mine = armyPower(s);
  s.nextWave = now + WAVE_MS;

  if(mine >= enemy){
    // casualties scale with how close it was
    const ratio = enemy/Math.max(mine,1);
    const lossFrac = 0.30 * ratio*ratio * Math.max(0.5, 1 - heroBonus(s,'casualties'));
    let lost = 0;
    for(const k of Object.keys(TROOPS)){
      const l = Math.round(s.t[k] * lossFrac * (0.7+rand()*0.6));
      s.t[k] = Math.max(0, s.t[k]-l); lost += l;
    }
    const lootMult = (isWB?2:1) * (1 + heroBonus(s,'loot') + spoilBonus(s,'loot'));
    const base = 15*Math.pow(w,0.8);
    const loot = {food:Math.round(base*lootMult), wood:Math.round(base*lootMult),
                  stone:Math.round(0.4*base*lootMult), iron:Math.round(0.2*base*lootMult)};
    for(const [r,v] of Object.entries(loot)) gainRes(s,r,v);
    const valor = (5+Math.min(w,15)) * (isWB?2:1);
    gainValor(s, valor);
    for(const h of Object.values(s.heroes)) h.xp += (12+3*w)*(isWB?2:1);
    gainMastery(s, (8+2*w)*(isWB?2:1), now);
    s.wavesWon++; s.wave++; s.streak = 0;
    if(isWB){
      s.warbandsWon++; gainShield(s,1);
      s.choiceQueue.push({type:'spoil', options: rollSpoilOffer(s, rand), reroll:1});
    }
    pushLog(s, label+' '+w+' repelled! Loot: +'+fmt(loot.food)+' food, +'+fmt(loot.wood)+' wood, +'+fmt(loot.stone)+' stone, +'+fmt(loot.iron)+' iron. +'+valor+' Valor.'
      +(isWB?' A Writ of Peace was captured — and spoils are yours to choose.':'')+(lost?' Fallen: '+lost+'.':''), 'win');
    showBanner(s, '⚔️ '+label+' '+w+' repelled — +'+valor+' Valor'+(lost?', '+lost+' fallen':''), 'win', now);
  }else{
    s.streak++;
    s.wavesLost = (s.wavesLost||0)+1;
    s.nextWave = now + WAVE_MS*2; // a loss buys a longer breather
    for(const k of Object.keys(TROOPS)) s.t[k] = Math.floor(s.t[k]*0.8);
    for(const r of Object.keys(RES_META)) s.res[r] = Math.floor(s.res[r]*0.85);
    gainValor(s, 2);
    gainMastery(s, 3, now);
    gainShield(s, 1);
    pushLog(s, label+' '+w+' breaks through the gate and carries off part of your stores — but your defenders bloodied them, and the next assault will come weaker. +2 Valor, and a Writ of Peace is granted.', 'loss');
    showBanner(s, '🔥 '+label+' '+w+' broke through — they return weaker next time', 'loss', now);
  }
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

  // armies eat: upkeep drains food; an unfed muster deserts
  s.res.food -= upkeepPerSec(s)*dt;
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

  if(s.bq && now >= s.bq.end){
    s.b[s.bq.key]++;
    const d = BUILDINGS[s.bq.key];
    pushLog(s, d.name+' complete — now level '+s.b[s.bq.key]+'. +2 Valor.', 'gold');
    gainValor(s, 2); s.bq = null;
    gainMastery(s, 6, now);
  }
  if(s.tq && now >= s.tq.end){
    const n = s.tq.count;
    s.t[s.tq.key] += n;
    s.trained += n;
    s.trainedBy[s.tq.key] = (s.trainedBy[s.tq.key]||0) + n;
    pushLog(s, n+' '+TROOPS[s.tq.key].name+(n>1?'s':'')+' join the muster.');
    s.tq = null;
    gainMastery(s, n, now);
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

  // hero drafts: milestones unlock slots; each grants a choice of three
  if(unlockedSlots(s) > (s.offersDone||0)){
    s.offersDone = (s.offersDone||0) + 1;
    const opts = rollHeroOffer(s, rand);
    if(opts.length){
      s.choiceQueue.push({type:'hero', options:opts, reroll:1});
      pushLog(s, 'Champions answer the call — choose who joins the hold.', 'gold');
    }
  }
  if(!s.choice && s.choiceQueue.length) s.choice = s.choiceQueue.shift();
  if(s.choice) s.nextWave = Math.max(s.nextWave, now + 20000); // no raid mid-draft

  // hero levels
  for(const [id,h] of Object.entries(s.heroes)){
    const d = HERO_POOL[id];
    while(h.lvl < 10 && h.xp >= xpNeed(h.lvl)){
      h.xp -= xpNeed(h.lvl); h.lvl++;
      pushLog(s, d.name+' rises to level '+h.lvl+'.', 'gold');
    }
  }

  if(s.banner && now > s.banner.until) s.banner = null;
}
