// Crownhold UI: renders state to DOM, wires input to logic actions.

import {
  BUILDINGS, TROOPS, MASTERY, QUESTS, RES_META,
  HERO_POOL, HERO_SLOTS, SPOILS, RARITY,
  WAVE_MS, FIRST_WAVE_MS, SHIELD_MS,
} from './defs.js';
import {
  fmt, ftime, clock, masteryLvl, perk, shieldCap, storageCap,
  prodPerSec, prodMult, upkeepPerSec, buildCost, buildTime, canAfford, armyPower,
  wavePower, streakMult, finishCost, xpNeed,
  startUpgrade, startTraining, finishBuildNow, finishTrainNow, patrol, raiseShield,
  chooseOption, rerollChoice,
} from './logic.js';
import { store, freshState, save } from './state.js';

const app = document.getElementById('app');
const fx  = document.getElementById('fx');

/* ── sections ── */

function costHtml(S, cost){
  return '<span class="cost">' + Object.entries(cost).map(([r,v]) =>
    '<span class="'+(S.res[r]>=v?'':'lack')+'">'+RES_META[r].icon+' '+fmt(v)+'</span>'
  ).join('') + '</span>';
}

function renderHeader(S){
  const cap = storageCap(S);
  let h = '<header><div class="brand"><h1>CROWNHOLD</h1><span>hold the frontier</span></div><div class="res-row">';
  for(const [r,m] of Object.entries(RES_META)){
    let rate = prodPerSec(S,r);
    if(r==='food') rate -= upkeepPerSec(S);           // net of army upkeep
    const rateTxt = (rate<0?'−':'+')+Math.abs(rate).toFixed(1);
    const warn = rate<0 ? 'color:var(--bad)' : '';
    h += '<span class="res"><span class="lbl">'+m.lbl+'</span> '+fmt(S.res[r])
       + '<span class="rate" style="'+warn+'">/'+fmt(cap)+' · '+rateTxt+'/s</span></span>';
  }
  h += '<span class="res valor"><span class="lbl">Valor</span> '+fmt(S.valor)+'</span>';
  h += '</div></header>';
  return h;
}

function renderThreat(S){
  const now = Date.now();
  const shielded = S.shieldUntil > now;
  const left = S.nextWave - now;
  const total = S.wavesWon===0 && S.wave===1 ? FIRST_WAVE_MS : WAVE_MS;
  const pct = Math.max(0, Math.min(100, 100*left/total));
  const isWB = S.wave % 5 === 0;
  const scouted = S.b.watchtower >= 1;
  const est = scouted ? '≈'+Math.round(wavePower(S.wave)*(isWB?1.6:1)*streakMult(S))+' strength'
                        +(S.streak>0?' (bloodied)':'')
                      : 'strength unknown — a Watchtower would tell you';
  let h = '<div class="threat"><div class="row">';
  if(shielded){
    h += '<span class="title" style="color:var(--gold)">🛡 The Writ of Peace holds</span>'
      + '<span class="meta">raids resume in <b>'+ftime(S.shieldUntil-now)+'</b></span>';
  }else{
    h += '<span class="title"'+(isWB?' style="color:var(--bad)"':'')+'>'+(isWB?'⚔️ Warband':'Raid')+' '+S.wave+' approaches</span>'
      + '<span class="meta">in <b>'+ftime(left)+'</b></span>'
      + '<span class="meta">scouts: <b>'+est+'</b></span>';
  }
  h += '<span class="meta" style="margin-left:auto">your power: <b>'+armyPower(S)+'</b></span>'
    + '<span class="meta">writs: <b>'+S.shields+'/'+shieldCap(S)+'</b></span>'
    + (S.shields>0 && !shielded ? '<button class="valor-btn" data-act="raiseShield">🛡 Raise shield · 3m</button>' : '')
    + '</div><div class="bar'+(shielded?'':' threat-fill')+'"><i style="width:'
    + (shielded ? Math.max(0,Math.min(100,100*(S.shieldUntil-now)/SHIELD_MS)) : pct)
    + '%"></i></div></div>';
  return h;
}

function queueStrip(S, q, label, finishAct){
  const now = Date.now();
  const pct = Math.min(100, 100*(now-q.start)/Math.max(1,(q.end-q.start)));
  const c = finishCost(q.end, now);
  return '<div class="queue-strip"><span>'+label+'</span>'
    + '<div class="bar"><i style="width:'+pct+'%"></i></div>'
    + '<span>'+ftime(q.end-now)+'</span>'
    + '<button class="valor-btn" data-act="'+finishAct+'" '+(S.valor<c?'disabled':'')+'>Finish · '+c+' ⚜ Valor</button>'
    + '</div>';
}

function renderHold(S){
  let h = '<section class="panel"><h2>The Hold</h2>';
  if(S.bq){
    const d = BUILDINGS[S.bq.key];
    h += queueStrip(S, S.bq, d.icon+' '+d.name+' → '+(S.b[S.bq.key]+1), 'finishBuild');
  }
  h += '<div class="bgrid">';
  for(const [k,d] of Object.entries(BUILDINGS)){
    const lvl = S.b[k];
    const lockedTH = d.th && S.b.townhall < d.th;
    const fxTxt = d.prod
      ? '+'+(d.rate*Math.max(lvl,1)*prodMult(S,d.prod)).toFixed(1)+' '+d.prod+'/s'+(lvl===0?' when built':'')
      : d.fx;
    h += '<div class="bcard'+(lockedTH?' locked':'')+'">'
      + '<div class="head"><span>'+d.icon+'</span><span class="name">'+d.name+'</span>'
      + '<span class="lvl">'+(lvl===0?'not built':'LVL '+lvl)+'</span></div>'
      + '<div class="fx">'+fxTxt+'</div>';
    if(lockedTH){
      h += '<div class="tmeta" style="font-family:var(--sans);font-size:.7rem;color:var(--ink-dim)">Requires Town Hall '+d.th+'</div>';
    }else if(lvl >= d.max){
      h += '<div class="tmeta" style="font-family:var(--sans);font-size:.7rem;color:var(--gold)">Fully raised</div>';
    }else{
      const cost = buildCost(S, k);
      const capped = k!=='townhall' && lvl >= S.b.townhall;
      const dis = S.bq || !canAfford(S, cost) || capped;
      h += '<div style="display:flex;gap:.6rem;align-items:center;flex-wrap:wrap">'
        + '<button data-act="upgrade" data-key="'+k+'" '+(dis?'disabled':'')+'>'
        + (lvl===0?'Build':'Upgrade to '+(lvl+1))+' · '+ftime(buildTime(S,k))+'</button>'
        + costHtml(S, cost)
        + (capped?'<span class="tmeta" style="font-family:var(--sans);font-size:.65rem;color:var(--ink-dim)">Town Hall must lead</span>':'')
        + '</div>';
    }
    h += '</div>';
  }
  h += '</div></section>';
  return h;
}

function renderMuster(S){
  let h = '<section class="panel"><h2>Muster <span style="letter-spacing:.05em">power '+armyPower(S)+' · eats '+upkeepPerSec(S).toFixed(1)+' food/s</span></h2>';
  if(S.b.barracks === 0){
    h += '<p style="font-size:.85rem;color:var(--ink-dim);font-style:italic">Build the Barracks to train troops.</p>';
  }else{
    if(S.tq){
      const d = TROOPS[S.tq.key];
      h += queueStrip(S, S.tq, d.icon+' '+S.tq.count+'× '+d.name, 'finishTrain');
    }
    for(const [k,d] of Object.entries(TROOPS)){
      const locked = S.b.barracks < d.barracks;
      h += '<div class="trow"><span>'+d.icon+'</span><span class="tname">'+d.name+'</span>'
        + '<span class="tmeta">pwr '+d.power+'</span><span class="spacer"></span>';
      if(locked){
        h += '<span class="tmeta">Barracks '+d.barracks+'</span>';
      }else{
        h += '<span class="count">'+S.t[k]+'</span>'
          + '<button data-act="train" data-key="'+k+'" data-n="1" '+(S.tq?'disabled':'')+'>+1</button>'
          + '<button data-act="train" data-key="'+k+'" data-n="5" '+(S.tq?'disabled':'')+'>+5</button>'
          + '<button data-act="train" data-key="'+k+'" data-n="25" '+(S.tq?'disabled':'')+'>+25</button>';
      }
      h += '</div>';
    }
  }
  const now = Date.now(), cd = S.patrolReady - now;
  h += '<div style="margin-top:.7rem;display:flex;align-items:center;gap:.6rem">'
    + '<button class="primary" data-act="patrol" '+(cd>0?'disabled':'')+'>🐴 Send patrol'
    + (cd>0?' · '+ftime(cd):' · resources +2 ⚜')+'</button>'
    + '<span class="tmeta" style="font-family:var(--sans);font-size:.65rem;color:var(--ink-dim)">Active play earns Valor</span></div>';
  h += '</section>';
  return h;
}

function renderHeroes(S){
  const owned = Object.entries(S.heroes);
  let h = '<section class="panel"><h2>Heroes <span style="letter-spacing:.05em">'+owned.length+'/'+HERO_SLOTS.length+' · drafted, never pulled</span></h2>';
  for(const [k,hero] of owned){
    const d = HERO_POOL[k];
    if(!d) continue;
    const need = xpNeed(hero.lvl);
    const pct = hero.lvl>=10 ? 100 : Math.min(100, 100*hero.xp/need);
    h += '<div class="hero"><span class="hname">'+d.icon+' '+d.name+'</span>'
      + ' <span class="rar rar-'+d.rarity+'">'+RARITY[d.rarity].tag+'</span>'
      + '<div class="hmeta">Level '+hero.lvl+' · '+d.fx(hero.lvl)
      + (hero.lvl>=10?' · max':' · '+fmt(hero.xp)+'/'+fmt(need)+' xp')+'</div>'
      + '<div class="xpbar"><i style="width:'+pct+'%"></i></div></div>';
  }
  for(let i = S.offersDone; i < HERO_SLOTS.length; i++){
    h += '<div class="hero locked"><span class="hname">❔ An empty seat at the table</span>'
      + '<div class="hmeta">'+HERO_SLOTS[i].hint+' — a draft of three will answer</div></div>';
  }
  h += '</section>';
  return h;
}

function renderSpoils(S){
  const owned = Object.entries(S.spoils||{});
  if(!owned.length) return '';
  let h = '<section class="panel"><h2>Spoils of War</h2>';
  for(const [k,n] of owned){
    const d = SPOILS[k];
    if(!d) continue;
    h += '<div class="trow"><span>'+d.icon+'</span><span class="tname">'+d.name+(n>1?' ×'+n:'')+'</span>'
      + '<span class="spacer"></span><span class="tmeta">'+d.fx+(n>1?' each':'')+'</span></div>';
  }
  h += '</section>';
  return h;
}

function renderMastery(S){
  const lvl = masteryLvl(S);
  const next = MASTERY[lvl];
  const prev = lvl>0 ? MASTERY[lvl-1].need : 0;
  const pct = next ? Math.min(100, 100*(S.mxp-prev)/(next.need-prev)) : 100;
  let h = '<section class="panel"><h2>Mastery <span style="letter-spacing:.05em">level '+lvl+'/10</span></h2>';
  if(lvl>0)
    h += '<div style="font-family:var(--sans);font-size:.7rem;color:var(--ink)">Held: '+MASTERY[lvl-1].fx+(lvl>1?' — and '+(lvl-1)+' more':'')+'</div>';
  if(next)
    h += '<div style="font-family:var(--sans);font-size:.7rem;color:var(--ink-dim);margin-top:.2rem;font-variant-numeric:tabular-nums">Next: '+next.fx+' · '+fmt(S.mxp)+'/'+fmt(next.need)+' xp</div>';
  else
    h += '<div style="font-family:var(--sans);font-size:.7rem;color:var(--gold);margin-top:.2rem">High Sovereign — the track is complete.</div>';
  h += '<div class="xpbar" style="margin-top:.4rem"><i style="width:'+pct+'%;background:var(--gold)"></i></div>';
  h += '<p style="font-size:.72rem;font-family:var(--sans);color:var(--ink-dim);margin-top:.45rem">Earned from raids, quests, building, drilling, patrols. This replaces VIP — it cannot be bought.</p>';
  h += '</section>';
  return h;
}

function renderQuest(S){
  const q = QUESTS[S.questIdx];
  let h = '<section class="panel"><h2>Charter · '+Math.min(S.questIdx+1,QUESTS.length)+'/'+QUESTS.length+'</h2>';
  if(q){
    h += '<p class="quest-txt">'+q.txt+'</p><p class="quest-reward">Reward: '+q.rtxt+'</p>';
  }else{
    h += '<p class="quest-txt quest-done">The charter is fulfilled. Raids will keep escalating — hold as long as you can.</p>';
  }
  h += '</section>';
  return h;
}

function renderChronicle(S){
  let h = '<section class="panel"><h2>Chronicle</h2><div class="chronicle">';
  if(S.log.length===0) h += '<p>The chronicle is blank. For now.</p>';
  for(const e of S.log.slice(0,16))
    h += '<p class="'+e.cls+'"><time>'+clock(e.t)+'</time>'+e.txt+'</p>';
  h += '</div></section>';
  return h;
}

function renderFooter(){
  return '<footer><span>Crownhold prototype — every Valor point was earned, none were sold.</span>'
    + '<button data-act="about">About</button>'
    + '<button data-act="reset">Raze &amp; restart</button></footer>';
}

function renderFx(S){
  let h = '';
  if(S.banner) h += '<div class="banner '+S.banner.cls+'">'+S.banner.txt+'</div>';
  if(!S.seenIntro){
    h += '<div class="overlay"><div class="card">'
      + '<h1>CROWNHOLD</h1><div class="rule"></div>'
      + '<p class="sub">Hold the frontier. Pay in effort, never in coin.</p>'
      + '<div class="pillars">'
      + '<p><b>No cash shop.</b> Every timer can be finished instantly — with Valor, a currency you can only earn by playing.</p>'
      + '<p><b>Heroes are drafted,</b> never gambled. Milestones offer three champions — you choose who stays. No banners, no pity timers, no pulls.</p>'
      + '<p><b>Losing never spirals.</b> A band that beats you returns <i>weaker</i>, not stronger — raids only escalate when you win. And armies eat: feed your muster or it deserts.</p>'
      + '</div>'
      + '<button class="primary" data-act="intro" style="font-size:.95rem;padding:.6rem 1.6rem">Take the field</button>'
      + '</div></div>';
  }
  return h;
}

function renderChoice(S){
  const c = S.choice;
  if(!c) return '';
  const isHero = c.type==='hero';
  let cards = '';
  c.options.forEach((id, i) => {
    if(isHero){
      const d = HERO_POOL[id];
      cards += '<button class="choice-card" data-act="choose" data-i="'+i+'">'
        + '<span class="cicon">'+d.icon+'</span>'
        + '<span class="rar rar-'+d.rarity+'">'+RARITY[d.rarity].tag+'</span>'
        + '<span class="cname">'+d.name+'</span>'
        + '<span class="cfx">'+d.fx(1)+' per level</span>'
        + '</button>';
    }else{
      const d = SPOILS[id];
      cards += '<button class="choice-card" data-act="choose" data-i="'+i+'">'
        + '<span class="cicon">'+d.icon+'</span>'
        + '<span class="rar" style="color:var(--ink-dim)">'+(d.stack?'Stacks':'Unique')+'</span>'
        + '<span class="cname">'+d.name+'</span>'
        + '<span class="cfx">'+d.fx+'</span>'
        + '</button>';
    }
  });
  return '<div class="overlay"><div class="card" style="max-width:42rem">'
    + '<h1 style="font-size:1.5rem">'+(isHero?'A DRAFT OF CHAMPIONS':'SPOILS OF WAR')+'</h1>'
    + '<div class="rule"></div>'
    + '<p class="sub">'+(isHero?'Three answer the call. One may stay.':'Claim one prize from the routed warband.')+'</p>'
    + '<div class="choice-grid">'+cards+'</div>'
    + (c.reroll>0 ? '<button data-act="rerollChoice" '+(S.valor<5?'disabled':'')+'>Redraw the offer · 5 ⚜ Valor</button>' : '')
    + '</div></div>';
}

export function render(){
  const S = store.s;
  app.innerHTML = renderHeader(S) + renderThreat(S)
    + '<main>' + renderHold(S)
    + '<div class="rail">' + renderMuster(S) + renderHeroes(S) + renderSpoils(S) + renderMastery(S) + renderQuest(S) + renderChronicle(S) + '</div>'
    + '</main>' + renderFooter();
  fx.innerHTML = renderFx(S) + (S.seenIntro ? renderChoice(S) : '');
}

/* ── input ── */

const ACTIONS = {
  upgrade: b => startUpgrade(store.s, b.dataset.key, Date.now()),
  train:   b => startTraining(store.s, b.dataset.key, Number(b.dataset.n)||1, Date.now()),
  finishBuild: () => finishBuildNow(store.s, Date.now()),
  finishTrain: () => finishTrainNow(store.s, Date.now()),
  patrol:      () => patrol(store.s, Date.now()),
  raiseShield: () => raiseShield(store.s, Date.now()),
  choose:      b => chooseOption(store.s, Number(b.dataset.i), Date.now()),
  rerollChoice:() => rerollChoice(store.s, Date.now()),
  intro: () => { store.s.seenIntro = true; },
  about: () => { store.s.seenIntro = false; },
  reset: () => {
    if(confirm('Raze the hold and start over? Your save will be erased.')){
      store.s = freshState(Date.now());
      save(store.s, Date.now());
    }
  },
};

function runAction(btn){
  if(btn.disabled) return;
  const fn = ACTIONS[btn.dataset.act];
  if(!fn) return;
  fn(btn);
  render();
}

export function wire(){
  // pointerdown so the 4 Hz re-render can never swallow a click
  document.addEventListener('pointerdown', e => {
    const btn = e.target.closest('button[data-act]');
    if(btn) runAction(btn);
  });
  // keyboard activation arrives as click with detail 0
  document.addEventListener('click', e => {
    if(e.detail !== 0) return;
    const btn = e.target.closest('button[data-act]');
    if(btn) runAction(btn);
  });
}
