// Crownhold UI: renders state to DOM, wires input to logic actions.

import {
  BUILDINGS, TROOPS, MASTERY, QUESTS, RES_META,
  HERO_POOL, HERO_SLOTS, SPOILS, RARITY,
  WAVE_TYPES, STANCES, EXPEDITIONS,
  WAVE_MS, FIRST_WAVE_MS, SHIELD_MS,
} from './defs.js';
import { TIERS } from './defs.js';
import {
  TILE_TYPES, MAP_W, MAP_H, CX, CY, TRAVEL_MS_PER_TILE, GATHER_MS,
  tileDist, marchSlots, tileBusy, marchPower, campPower, gatherYield, startMarch,
} from './world.js';
import {
  fmt, ftime, clock, masteryLvl, perk, shieldCap, storageCap, storageCapFor,
  prodPerSec, prodMult, upkeepPerSec, buildCost, buildTime, canAfford, armyPower,
  armyBreakdown, trainMult, trainMultFor, bluntFor, counterMult,
  maxTier, tierOf, tierPower, tierUpkeep, promoteCost, promote, trainCost,
  wavePower, streakMult, finishCost, xpNeed,
} from './logic.js';
import { applyAction, isGameAction } from './actions.js';
import * as net from './net.js';
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
  const wt = WAVE_TYPES[S.waveType||'rabble'];
  const est = scouted
    ? wt.icon+' '+wt.name+' · ≈'+Math.round(wavePower(S.wave)*(isWB?1.6:1)*streakMult(S))+' strength'
      +(S.streak>0?' (bloodied)':'')
      +(wt.weakTo?' · weak to '+STANCES[wt.weakTo].name+' &amp; '+TROOPS[wt.counter].name+'s':'')
    : 'an unknown band — a Watchtower would name it';
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
    + '<span class="meta">defeat costs: <b>20% troops · 15% stores</b></span>'
    + '<span class="meta">writs: <b>'+S.shields+'/'+shieldCap(S)+'</b></span>'
    + (S.shields>0 && !shielded ? '<button class="valor-btn" data-act="raiseShield">🛡 Raise shield · 3m</button>' : '')
    + '</div>';
  // the stance line: your standing answer to whatever comes up the road
  const cm = counterMult(S);
  h += '<div class="stance-row"><span class="meta">stance:</span>';
  for(const [k,st] of Object.entries(STANCES)){
    h += '<button class="stance-btn'+(S.stance===k?' active':'')+'" data-act="stance" data-key="'+k+'" title="'+st.hint+'">'
      + st.icon+' '+st.name+'</button>';
  }
  h += '<span class="meta" style="margin-left:auto">'
    + (scouted ? (cm>1?'✓ right answer: +20% power, fewer casualties':cm<1?'✗ wrong stance for '+wt.name+': −8%':'no counter to find')
               : 'scouts blind — stance is a guess')
    + '</span></div>';
  h += '<div class="bar'+(shielded?'':' threat-fill')+'"><i style="width:'
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
    + '<button class="valor-btn" data-act="'+finishAct+'" title="1 Valor per 4s remaining" '+(S.valor<c?'disabled':'')+'>Finish · '+c+' ⚜ Valor</button>'
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
      + '<button class="info-btn" data-act="detail" data-dtype="building" data-key="'+k+'" title="details">ⓘ</button>'
      + '<span class="lvl">'+(lvl===0?'not built':'LVL '+lvl+'/'+d.max)+'</span></div>'
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
  const bd = armyBreakdown(S);
  let h = '<section class="panel"><h2>Muster <span style="letter-spacing:.05em">power '+bd.total+'</span></h2>';
  h += '<div class="stat-note">'+Math.round(bd.base)+' troops × '+bd.mult.toFixed(2)+' bonuses + '+Math.round(bd.wall)+' wall = <b>'+bd.total+'</b>'
    + ' &nbsp;·&nbsp; eats '+upkeepPerSec(S).toFixed(1)+' food/s of your +'+prodPerSec(S,'food').toFixed(1)+'/s</div>';
  if(S.b.barracks === 0){
    h += '<p style="font-size:.85rem;color:var(--ink-dim);font-style:italic">Build the Barracks to train troops.</p>';
  }else{
    if(S.tq){
      const d = TROOPS[S.tq.key];
      h += queueStrip(S, S.tq, d.icon+' '+S.tq.count+'× '+d.name, 'finishTrain');
    }
    for(const [k,d] of Object.entries(TROOPS)){
      const locked = S.b.barracks < d.barracks;
      const tier = tierOf(S,k);
      const canPromote = !locked && tier < maxTier(S);
      h += '<div class="trow">'
        + '<span>'+d.icon+'</span><span class="tname">'+d.name+' <b class="tier-tag">'+TIERS[tier-1]+'</b></span>'
        + '<span class="tmeta">pwr '+tierPower(S,k).toFixed(0)+'</span>'
        + '<button class="info-btn" data-act="detail" data-dtype="troop" data-key="'+k+'" title="unit details'+(canPromote?' — promotion available!':'')+'">'
        + (canPromote?'⬆':'ⓘ')+'</button>'
        + '<span class="spacer"></span>';
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
  let note = cd>0 ? 'next in '+ftime(cd) : 'a road is open';
  if(cd<=0 && S.caravan) note = '⛺ caravan departs in '+ftime(S.patrolReady+15000-now)+' — dispatch by hand for full yield';
  h += '<div style="margin-top:.7rem">'
    + '<div class="stat-note">Expeditions — '+note
    + (S.expedBoost?' · <b style="color:var(--gold)">Rich Trails: next is ×2 and safe</b>':'')+'</div>'
    + '<div class="exped-row">';
  for(const [k,e] of Object.entries(EXPEDITIONS)){
    h += '<div class="exped-col">'
      + '<button class="exped-btn" data-act="expedition" data-key="'+k+'" '+(cd>0?'disabled':'')+' title="'+e.desc+'">'
      + e.icon+' '+e.name+'<span>'+e.desc+'</span></button>'
      + '<button class="cara-btn'+(S.caravan===k?' active':'')+'" data-act="caravan" data-key="'+k+'" '
      + 'title="Standing caravan: auto-runs this road at half yield — resources only, no Valor, no ambush">'
      + (S.caravan===k?'⛺ caravan assigned':'⛺ set caravan')+'</button>'
      + '</div>';
  }
  h += '</div></div>';
  h += '</section>';
  return h;
}

function renderHeroes(S){
  const owned = Object.entries(S.heroes);
  let h = '<section class="panel"><h2>Heroes <span style="letter-spacing:.05em">'+owned.length+'/'+HERO_SLOTS.length+' · drafted, never pulled</span></h2>';
  for(const [k,hero] of owned){
    const d = HERO_POOL[k];
    if(!d) continue;
    const isCapt = S.captain===k;
    const cd = S.orderCd[k]||0;
    h += '<div class="hero"><span class="hname">'+(isCapt?'★ ':'')+d.icon+' '+d.name+'</span>'
      + ' <span class="rar rar-'+d.rarity+'">'+RARITY[d.rarity].tag+'</span>'
      + '<button class="info-btn" data-act="detail" data-dtype="hero" data-key="'+k+'" title="hero details">ⓘ</button>'
      + '<div class="order-row"><span class="hmeta">L'+hero.lvl+' · '+d.fx(hero.lvl)+(isCapt?' <b style="color:var(--gold)">×2</b>':'')+'</span>'
      + '<button class="order-btn" data-act="order" data-key="'+k+'" '+(cd>0?'disabled':'')
      + ' title="'+d.order.desc+'">'+d.order.name+(cd>0?' · '+cd+'w':'')+'</button></div>'
      + '</div>';
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
  let h = '<section class="panel"><h2>Mastery <span style="letter-spacing:.05em">level '+lvl+'/10 · '+fmt(S.mxp)+' xp</span></h2>';
  MASTERY.forEach((m,i)=>{
    const got = lvl > i;
    h += '<div class="m-row'+(got?' got':'')+'">'+(got?'✦':'·')+' <span>'+(i+1)+'. '+m.fx+'</span>'
      + '<span style="margin-left:auto">'+fmt(m.need)+' xp</span></div>';
  });
  if(next)
    h += '<div style="font-family:var(--sans);font-size:.7rem;color:var(--ink-dim);margin-top:.3rem;font-variant-numeric:tabular-nums">Next: '+next.fx+' · '+fmt(S.mxp)+'/'+fmt(next.need)+' xp</div>';
  else
    h += '<div style="font-family:var(--sans);font-size:.7rem;color:var(--gold);margin-top:.3rem">High Sovereign — the track is complete.</div>';
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

function renderLeaderboard(S){
  if(!net.isOnline()) return '';
  const rows = net.leaderboardRows();
  let h = '<section class="panel"><h2>The Frontier Holds <span style="letter-spacing:.05em">waves held</span></h2>';
  if(!rows) h += '<div class="stat-note">Asking the server…</div>';
  else if(!rows.length) h += '<div class="stat-note">No holds on record yet.</div>';
  else{
    const me = net.accountName();
    for(let i=0;i<rows.length;i++){
      const r = rows[i];
      h += '<div class="trow'+(r.name===me?' mine':'')+'"><span class="tmeta">'+(i+1)+'</span>'
        + '<span class="tname">'+(r.name===me?'★ ':'')+r.name+'</span><span class="spacer"></span>'
        + '<span class="tmeta">TH'+r.townhall+' · M'+r.mastery+' · pwr '+fmt(r.power)+'</span>'
        + '<span class="count">'+r.wavesWon+'</span></div>';
    }
  }
  h += '</section>';
  return h;
}

function renderFooter(){
  const armed = Date.now() < resetArmedUntil;
  const who = net.accountName();
  return '<footer><span>Crownhold prototype — every Valor point was earned, none were sold.</span>'
    + '<button data-act="account">'+(who ? '☁ '+who : '☁ Play online')+'</button>'
    + '<button data-act="codex">📖 Codex — all the rules</button>'
    + '<button data-act="about">About</button>'
    + '<button data-act="reset"'+(armed?' style="color:var(--bad);border-color:var(--bad)"':'')+'>'
    + (armed?'⚠ Tap again to raze EVERYTHING':'Raze &amp; restart')+'</button></footer>';
}

let codexOpen = false;
let resetArmedUntil = 0; // two-tap raze confirmation window
let detail = null; // {type:'building'|'troop'|'hero', key} — the tap-to-inspect sheet

function renderDetail(S){
  if(!detail) return '';
  const k = detail.key;
  let body = '', title = '';

  if(detail.type==='building'){
    const d = BUILDINGS[k]; if(!d) return '';
    const lvl = S.b[k];
    title = d.icon+' '+d.name+' — '+(lvl===0?'not built':'level '+lvl+'/'+d.max);
    body += '<p class="d-fx">'+(d.prod ? '+'+d.rate+' '+d.prod+'/s per level' : d.fx)+'</p>';
    if(d.th && S.b.townhall < d.th) body += '<p class="d-warn">Requires Town Hall '+d.th+'</p>';
    if(lvl < d.max){
      let delta = '';
      if(d.prod) delta = '+'+(d.rate*lvl*prodMult(S,d.prod)).toFixed(1)+'/s → +'+(d.rate*(lvl+1)*prodMult(S,d.prod)).toFixed(1)+'/s';
      else if(k==='townhall') delta = 'storage '+fmt(storageCap(S))+' → '+fmt(storageCapFor(S,lvl+1));
      else if(k==='wall') delta = 'defense +'+(18*lvl)+' → +'+(18*(lvl+1));
      else if(k==='barracks') delta = 'train speed ×'+trainMult(S).toFixed(2)+' → ×'+trainMultFor(S,lvl+1).toFixed(2);
      else if(k==='watchtower') delta = 'blunts '+Math.round(bluntFor(S,lvl)*100)+'% → '+Math.round(bluntFor(S,lvl+1)*100)+'%';
      else if(k==='academy') delta = 'unlocks troop Tier '+TIERS[Math.min(9,lvl+1)];
      else if(k==='tavern') delta = 'expedition bonus +'+(3*lvl)+'% → +'+(3*(lvl+1))+'%';
      else if(k==='granary') delta = 'food +'+(2*lvl)+'%, storage +'+(3*lvl)+'% → +'+(2*(lvl+1))+'% / +'+(3*(lvl+1))+'%';
      else if(k==='hospital') delta = 'casualties −'+(4*lvl)+'% → −'+(4*(lvl+1))+'%';
      else if(k==='warehouse') delta = 'stores protected '+(4*lvl)+'% → '+(4*(lvl+1))+'%';
      if(delta) body += '<p class="d-delta">Next level: '+delta+'</p>';
      body += '<p class="d-row">Cost: '+costHtml(S, buildCost(S,k))+' · ⏱ '+ftime(buildTime(S,k))+'</p>';
      const capped = k!=='townhall' && lvl >= S.b.townhall;
      if(capped) body += '<p class="d-warn">Town Hall must lead — raise it first.</p>';
      body += '<button class="primary" data-act="upgrade" data-key="'+k+'" '
        + ((S.bq||!canAfford(S,buildCost(S,k))||capped||(d.th&&S.b.townhall<d.th))?'disabled':'')+'>'
        + (lvl===0?'Build':'Upgrade to '+(lvl+1))+'</button>';
    } else body += '<p class="d-delta" style="color:var(--gold)">Fully raised.</p>';
  }

  else if(detail.type==='troop'){
    const d = TROOPS[k]; if(!d) return '';
    const tier = tierOf(S,k), mt = maxTier(S);
    title = d.icon+' '+d.name+' — Tier '+TIERS[tier-1];
    body += '<div class="d-row">You muster <b>'+S.t[k]+'</b> · power '+tierPower(S,k).toFixed(1)+' each · eats '+tierUpkeep(S,k).toFixed(2)+' food/s each</div>'
      + '<div class="d-row">Train: '+costHtml(S, trainCost(S,k,1))+' · ⏱ '+(d.time*trainMult(S)).toFixed(1)+'s each · needs Barracks '+d.barracks+'</div>';
    if(tier < mt){
      const pc = promoteCost(S,k);
      body += '<p class="d-delta">Promote all to Tier '+TIERS[tier]+': power '+tierPower(S,k).toFixed(1)+' → '
        + (d.power*(1+0.25*tier)).toFixed(1)+' each (upkeep rises too)</p>'
        + '<p class="d-row">'+costHtml(S,pc)+'</p>'
        + '<button class="primary" data-act="promote" data-key="'+k+'" '+(canAfford(S,pc)?'':'disabled')+'>⬆ Promote to Tier '+TIERS[tier]+'</button>';
    }else if(tier < 10){
      body += '<p class="d-warn">Tier '+TIERS[tier]+' needs War Academy level '+tier+'.</p>';
    }else body += '<p class="d-delta" style="color:var(--gold)">Highest tier — none finer in the realm.</p>';
  }

  else if(detail.type==='tile'){
    const tile = S.world.tiles[k]; if(!tile) return '';
    const tt = TILE_TYPES[tile.type];
    const travel = tileDist(tile)*TRAVEL_MS_PER_TILE;
    title = tt.icon+' '+tt.name+' '+TIERS[tile.lvl-1];
    if(tile.respawnAt){
      body += '<p class="d-warn">Worked out — regrows in '+ftime(tile.respawnAt-Date.now())+'.</p>';
    }else{
      body += '<p class="d-row">Distance '+tileDist(tile)+' — '+ftime(travel)+' each way.</p>';
      if(tt.kind==='gather')
        body += '<p class="d-delta">Yields ~'+fmt(gatherYield(S,tile))+' '+tt.res+' after '+ftime(GATHER_MS)+' of work.</p>';
      else if(tt.kind==='camp')
        body += '<p class="d-delta">Camp strength ≈'+campPower(S,tile)+'. Victory: loot, Valor, Mastery — and the camp burns.</p>'
          + '<p class="d-warn">Defeat costs a third of the marchers.</p>';
      else
        body += '<p class="d-delta">Explorers return with Valor, Mastery, and a 20% chance of a Writ of Peace.</p>';
      const busy = tileBusy(S,k), full = S.marches.length >= marchSlots(S);
      if(busy) body += '<p class="d-warn">A march is already bound here.</p>';
      else if(full) body += '<p class="d-warn">All march slots are in use (Town Hall 10 grants a second).</p>';
      else{
        const home = armyPower(S);
        body += '<p class="d-row">Your home power is <b>'+home+'</b> — troops you send stop defending until they return.</p>'
          + '<div style="display:flex;gap:.5rem;margin-top:.5rem">'
          + '<button data-act="march" data-idx="'+k+'" data-frac="0.25">March ¼</button>'
          + '<button data-act="march" data-idx="'+k+'" data-frac="0.5">March ½</button>'
          + '<button class="primary" data-act="march" data-idx="'+k+'" data-frac="1">March all</button>'
          + '</div>';
      }
    }
  }

  else if(detail.type==='hero'){
    const d = HERO_POOL[k], hero = S.heroes[k]; if(!d||!hero) return '';
    const need = xpNeed(hero.lvl);
    const isCapt = S.captain===k, cd = S.orderCd[k]||0;
    title = (isCapt?'★ ':'')+d.icon+' '+d.name;
    body += '<p class="d-fx"><span class="rar rar-'+d.rarity+'">'+RARITY[d.rarity].tag+'</span> · Level '+hero.lvl
      + (hero.lvl>=20?' (max)':' · '+fmt(hero.xp)+'/'+fmt(need)+' xp from defending raids')+'</p>'
      + '<div class="xpbar"><i style="width:'+(hero.lvl>=20?100:Math.min(100,100*hero.xp/need))+'%"></i></div>'
      + '<p class="d-row">Passive: '+d.fx(hero.lvl)+(isCapt?' — <b style="color:var(--gold)">doubled as Captain</b>':'')+'</p>'
      + '<p class="d-row">Order — <b>'+d.order.name+'</b>: '+d.order.desc+' Cooldown '+d.order.cd+' waves.'+(cd>0?' Ready in '+cd+'.':'')+'</p>'
      + '<div style="display:flex;gap:.6rem;margin-top:.5rem">'
      + '<button class="primary" data-act="captain" data-key="'+k+'">'+(isCapt?'Relieve of command':'★ Appoint Captain')+'</button>'
      + '<button data-act="order" data-key="'+k+'" '+(cd>0?'disabled':'')+'>Use '+d.order.name+'</button>'
      + '</div>';
  }

  return '<div class="overlay" data-act-bg="detailClose"><div class="card dsheet">'
    + '<h1 style="font-size:1.15rem">'+title+'</h1><div class="rule"></div>'
    + body
    + '<button data-act="detailClose" style="margin-top:.8rem">Close</button>'
    + '</div></div>';
}

function renderCodex(S){
  if(!codexOpen) return '';
  const tm = trainMult(S);
  let troopRows = '';
  for(const [k,d] of Object.entries(TROOPS)){
    troopRows += '<tr><td>'+d.icon+' '+d.name+'</td><td>'+d.power+'</td>'
      + '<td>'+Object.entries(d.cost).map(([r,v])=>RES_META[r].icon+' '+v).join(' ')+'</td>'
      + '<td>'+(d.time*tm).toFixed(1)+'s</td><td>'+d.upkeep.toFixed(2)+'/s</td>'
      + '<td>Barracks '+d.barracks+'</td></tr>';
  }
  let prodRows = '';
  for(const [k,d] of Object.entries(BUILDINGS)){
    if(!d.prod) continue;
    prodRows += '<tr><td>'+d.icon+' '+d.name+'</td><td>+'+d.rate+' '+d.prod+'/s per level</td></tr>';
  }
  return '<div class="overlay"><div class="card codex">'
    + '<h1 style="font-size:1.4rem">THE CODEX</h1><div class="rule"></div>'
    + '<p class="sub">Every rule in the game. Nothing hidden, nothing sold.</p>'

    + '<h3>Economy</h3>'
    + '<div class="tscroll"><table>'+prodRows+'</table></div>'
    + '<ul>'
    + '<li>Storage cap: 800 × Town&nbsp;Hall<sup>1.7</sup>, +3% per Granary level — currently <b>'+fmt(storageCap(S))+'</b>. Production beyond it is wasted.</li>'
    + '<li>Offline: the hold produces (and the muster eats) for up to 2 hours while you are away. No raids strike while you are gone.</li>'
    + '<li>Build costs scale with level² — early levels are quick, the late road is long. One build queue, one training queue.</li>'
    + '</ul>'

    + '<h3>The Muster</h3>'
    + '<div class="tscroll"><table><tr><th>Troop</th><th>Power</th><th>Cost each</th><th>Time each*</th><th>Eats</th><th>Needs</th></tr>'+troopRows+'</table></div>'
    + '<ul>'
    + '<li>*time shown includes your current ×'+tm.toFixed(2)+' training multiplier (Barracks −6%/level, plus heroes, spoils, Mastery). Costs/power/upkeep shown are Tier I — each tier is +25% power, +18% upkeep, +22% cost.</li>'
    + '<li><b>Tiers</b>: the War Academy unlocks Tier II–X. Promoting reforges every unit of that class at once (cost scales with how many you own).</li>'
    + '<li>Army power = troop power × bonuses + 18 per Wall level.</li>'
    + '<li><b>Armies eat.</b> If food hits 0, roughly 2% of troops desert every 10s until the muster is affordable again.</li>'
    + '</ul>'

    + '<h3>Raids</h3>'
    + '<ul>'
    + '<li>A raid strikes every 75s (first at 2m). Strength grows ~wave<sup>1.3</sup>, rolled ±12%.</li>'
    + '<li>Every 5th wave is a <b>Warband</b>: ×1.6 strength, double loot and Valor, always drops a Writ and a choice of Spoils.</li>'
    + '<li>Watchtower: reveals exact enemy strength and blunts it 5% per level'+(bluntFor(S,S.b.watchtower)>0?' (yours: '+Math.round(bluntFor(S,S.b.watchtower)*100)+'%)':'')+'.</li>'
    + '<li><b>Win</b>: loot + Valor + hero XP; casualties scale with how close the fight was.</li>'
    + '<li><b>Lose</b>: 20% of troops fall, 15% of stores are taken — but the band returns 15% weaker per consecutive loss (floor ~61%) and the next attack waits 2m30s. Raids only escalate when you win.</li>'
    + '</ul>'

    + '<h3>Command — where skill lives</h3>'
    + '<ul>'
    + '<li><b>Wave shapes &amp; stances</b>: bands come as Rabble, Riders, Skirmishers, or Brutes. Shield Wall counters Riders, Volley counters Brutes, Charge counters Skirmishers. Right answer: +20% power and 40% fewer casualties. Wrong stance against a shaped band: −8%. Balanced never wins or loses the read. A Watchtower names the incoming band; without one you guess.</li>'
    + '<li><b>Class counters</b>: Spearmen counter Riders, Archers counter Brutes, Knights counter Skirmishers — up to +15% power, scaling with that class&#39;s share of your army (max at 30%). A one-class army leaves this on the table most waves.</li>'
    + '<li><b>The screening line</b>: casualties fall unevenly — Spearmen take 1.5× their share, Archers 1.2×, Knights 0.75×, Ballistas 0.5×. Cheap troops are the armor of expensive ones.</li>'
    + '<li><b>Captain</b>: appoint one hero — their passive counts double. Swap freely; it is a build choice, not a lock.</li>'
    + '<li><b>Orders</b>: every hero has an active ability on a cooldown measured in waves (Rally, Triage, Requisition…). Battle orders are consumed by the next battle.</li>'
    + '<li><b>Expeditions</b>: the King&#39;s Road is safe (food/wood, +3 Valor). Wildwood pays stone &amp; iron but a 35% ambush costs ~4% of troops. Barrow Hills pays Valor &amp; Mastery with a 15% Writ chance. One road per cooldown.</li>'
    + '<li><b>Standing caravan</b>: assign a road and it auto-runs 15s after each cooldown at half yield — resources only, no Valor, no Mastery, no ambush, and it keeps running while you are away (2h cap). Dispatching by hand always pays roughly 2.7× more.</li>'
    + '</ul>'

    + '<h3>The Frontier</h3>'
    + '<ul>'
    + '<li>Tap a map tile to inspect and <b>march</b> on it: resource nodes (worked for a large haul), Bandit Camps (burned for loot, Valor and Mastery), Ancient Ruins (Valor, Mastery, 20% Writ).</li>'
    + '<li>Travel costs 12s per tile each way; gathering takes 60s. Marching troops carry their own rations and <b>do not defend the wall</b> until they return.</li>'
    + '<li>Camp battles use your march&#39;s power (heroes and Mastery apply; no wall, no stance). Defeat costs a third of the marchers.</li>'
    + '<li>One march slot; Town Hall 10 grants a second. Worked tiles regrow in ~4 minutes, sometimes richer.</li>'
    + '</ul>'

    + '<h3>Valor &amp; Writs</h3>'
    + '<ul>'
    + '<li>Valor comes from wins (5 + wave, capped +15, warbands ×2), quests, patrols (+2), finished buildings (+2), even losses (+2). It is never sold.</li>'
    + '<li>Spend it to finish any timer: 1 Valor per 4s remaining. Redrawing a draft costs 5.</li>'
    + '<li>Writs of Peace pause raids for 3m. Earned from losses, warbands, and quests; capacity '+shieldCap(S)+'.</li>'
    + '</ul>'

    + '<h3>Heroes &amp; Spoils</h3>'
    + '<ul>'
    + '<li>12 heroes in the pool: 6 common / 4 rare / 2 epic, drafted at weights 62/28/10. Milestones open 8 slots; each offers 3, you keep 1.</li>'
    + '<li>Heroes level to 10 on raid XP. Spoils are permanent; most stack.</li>'
    + '<li>Mastery: the full 10-perk track is listed in its panel with exact XP thresholds. XP comes from every kind of play.</li>'
    + '</ul>'

    + '<button class="primary" data-act="codex" style="margin-top:.6rem">Close the Codex</button>'
    + '</div></div>';
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

function renderWorld(S){
  const slots = marchSlots(S);
  let h = '<section class="panel"><h2>The Frontier <span style="letter-spacing:.05em">marches '+S.marches.length+'/'+slots+' · troops away don’t defend the wall</span></h2>';
  h += '<canvas id="worldmap" width="'+(MAP_W*56)+'" height="'+(MAP_H*56)+'"></canvas>';
  const now = Date.now();
  for(const m of S.marches){
    const tile = S.world.tiles[m.tile], tt = TILE_TYPES[tile.type];
    const n = Object.values(m.troops).reduce((a,b)=>a+b,0);
    const phase = !m.resolved ? 'outbound · arrives '+ftime(m.arriveAt-now)
                              : 'returning · home '+ftime(m.homeAt-now);
    h += '<div class="stat-note">🚩 '+n+' troops → '+tt.icon+' '+tt.name+' — '+phase+'</div>';
  }
  if(!S.marches.length)
    h += '<div class="stat-note">Tap a tile to inspect it and send a march.</div>';
  h += '</section>';
  return h;
}

function drawMap(S){
  const cv = document.getElementById('worldmap');
  if(!cv) return;
  const ctx = cv.getContext('2d'), C = 56;
  ctx.clearRect(0,0,cv.width,cv.height);
  for(let y=0;y<MAP_H;y++) for(let x=0;x<MAP_W;x++){
    ctx.fillStyle = (x+y)%2 ? '#241d17' : '#221b15';
    ctx.fillRect(x*C+1, y*C+1, C-2, C-2);
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const marchTargets = new Set(S.marches.map(m=>m.tile));
  S.world.tiles.forEach((t,i)=>{
    const cx = t.x*C+C/2, cy = t.y*C+C/2;
    if(t.respawnAt){
      ctx.globalAlpha = 0.35;
      ctx.font = '20px serif'; ctx.fillText('⏳', cx, cy);
      ctx.globalAlpha = 1;
      return;
    }
    ctx.font = '24px serif';
    ctx.fillText(TILE_TYPES[t.type].icon, cx, cy-4);
    ctx.fillStyle = '#d9a441'; ctx.font = '9px sans-serif';
    ctx.fillText('I'.repeat(t.lvl), cx, cy+18);
    if(marchTargets.has(i)){
      ctx.strokeStyle = '#d9a441'; ctx.lineWidth = 2;
      ctx.strokeRect(t.x*C+3, t.y*C+3, C-6, C-6);
    }
  });
  ctx.font = '28px serif';
  ctx.fillText('🏰', CX*C+C/2, CY*C+C/2);
}

export function render(){
  const S = store.s;
  app.innerHTML = renderHeader(S) + renderThreat(S) + renderWorld(S)
    + '<main>' + renderHold(S)
    + '<div class="rail">' + renderMuster(S) + renderHeroes(S) + renderSpoils(S)
      + renderLeaderboard(S) + renderMastery(S) + renderQuest(S) + renderChronicle(S) + '</div>'
    + '</main>' + renderFooter();
  fx.innerHTML = renderFx(S) + (S.seenIntro ? renderChoice(S) + renderCodex(S) + renderDetail(S) : '');
  drawMap(S);
}

/* ── input ── */

// UI-only actions: they change what you are looking at, not the hold itself,
// so they never travel to the server.
const VIEW_ACTIONS = {
  about: () => { store.s.seenIntro = false; },
  codex: () => { codexOpen = !codexOpen; },
  detail: b => { detail = {type:b.dataset.dtype, key:b.dataset.key}; },
  detailClose: () => { detail = null; },
  account: () => { acctOpen = true; acctMsg = ''; renderAccount(); },
  accountClose: () => { acctOpen = false; renderAccount(); },
  signIn: b => submitAccount(b.dataset.mode),
  signOut: () => { net.logout(); acctMsg = 'Signed out — your local hold is back.'; renderAccount(); },
  // native confirm() is blocked in sandboxed frames — the button itself asks twice
  reset: () => {
    const now = Date.now();
    if(now < resetArmedUntil){
      resetArmedUntil = 0;
      if(net.isOnline()) net.resetHold().then(s => { store.s = s; render(); }).catch(()=>{});
      else { store.s = freshState(now); save(store.s, now); }
    }else{
      resetArmedUntil = now + 5000;
    }
  },
};

function paramsOf(btn){
  const d = btn.dataset;
  return { key:d.key, n:d.n, i:d.i, idx:d.idx, frac:d.frac };
}

function runAction(btn){
  if(btn.disabled) return;
  const act = btn.dataset.act;
  if(VIEW_ACTIONS[act]){ VIEW_ACTIONS[act](btn); render(); return; }
  if(!isGameAction(act)) return;
  const params = paramsOf(btn);
  if(act === 'march') detail = null;
  if(net.isOnline()){
    // the server rules on it, then hands back the truth
    net.sendAction(act, params)
      .then(s => { store.s = s; render(); })
      .catch(err => { acctMsg = err.message; renderAccount(); });
  }else{
    applyAction(store.s, act, params, Date.now());
  }
  render();
}

/* ── account sheet: lives outside the 4 Hz render so typing is never clobbered ── */

const acctBox = document.createElement('div');
document.body.appendChild(acctBox);
let acctOpen = false, acctMsg = '';

function submitAccount(mode){
  const name = (document.getElementById('acct-name')||{}).value || '';
  const pw   = (document.getElementById('acct-pw')||{}).value || '';
  const srv  = (document.getElementById('acct-server')||{}).value || '';
  net.setServer(srv);
  acctMsg = 'Contacting the server…'; renderAccount();
  const fn = mode === 'register' ? net.register : net.login;
  fn(name, pw)
    .then(s => {
      store.s = s;
      acctOpen = false; acctMsg = '';
      renderAccount(); render();
      net.refreshLeaderboard().then(render);
    })
    .catch(err => { acctMsg = err.message; renderAccount(); });
}

export function renderAccount(){
  if(!acctOpen){ acctBox.innerHTML = ''; return; }
  const name = net.accountName();
  acctBox.innerHTML = '<div class="overlay"><div class="card dsheet">'
    + '<h1 style="font-size:1.15rem">☁ Your Hold Online</h1><div class="rule"></div>'
    + (name
      ? '<p class="d-fx">Signed in as <b>'+name+'</b>. This hold lives on the server — it follows you to any device, and it stands on the leaderboard.</p>'
        + '<div style="display:flex;gap:.6rem;margin-top:.6rem">'
        + '<button data-act="signOut">Sign out</button>'
        + '<button class="primary" data-act="accountClose">Back to the walls</button></div>'
      : '<p class="d-row">Sign in and your hold is kept by the server: the same walls on your phone and your desktop, and a place on the leaderboard. Play offline and nothing leaves this browser.</p>'
        + '<label class="d-row">Server<br><input id="acct-server" value="'+(net.serverUrl()||'')+'" placeholder="http://localhost:8787"></label>'
        + '<label class="d-row">Hold name<br><input id="acct-name" maxlength="20" placeholder="Ravenmark"></label>'
        + '<label class="d-row">Password<br><input id="acct-pw" type="password" placeholder="at least 6 characters"></label>'
        + '<div style="display:flex;gap:.6rem;margin-top:.6rem;flex-wrap:wrap">'
        + '<button class="primary" data-act="signIn" data-mode="register">Found a new hold</button>'
        + '<button data-act="signIn" data-mode="login">Sign in</button>'
        + '<button data-act="accountClose">Play offline</button></div>')
    + (acctMsg ? '<p class="d-warn">'+acctMsg+'</p>' : '')
    + '</div></div>';
}

export function wire(){
  // pointerdown so the 4 Hz re-render can never swallow a click
  document.addEventListener('pointerdown', e => {
    // taps on the world map open the tile's sheet
    if(e.target && e.target.id === 'worldmap'){
      const rect = e.target.getBoundingClientRect();
      const x = Math.floor((e.clientX-rect.left)/rect.width*MAP_W);
      const y = Math.floor((e.clientY-rect.top)/rect.height*MAP_H);
      const idx = store.s.world.tiles.findIndex(t => t.x===x && t.y===y);
      if(idx >= 0){ detail = {type:'tile', key:idx}; render(); }
      return;
    }
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
