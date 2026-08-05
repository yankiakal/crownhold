// Crownhold UI: renders state to DOM, wires input to logic actions.

import {
  BUILDINGS, TROOPS, MASTERY, QUESTS, ACHIEVEMENTS, RES_META, REFINE,
  HERO_POOL, HERO_SLOTS, SPOILS, RARITY,
  WAVE_TYPES, STANCES, EXPEDITIONS,
  WAVE_MS, FIRST_WAVE_MS, SHIELD_MS, SECOND_QUEUE_TH,
} from './defs.js';
import { TIERS } from './defs.js';
import {
  TILE_TYPES, MAP_W, MAP_H, CX, CY, TRAVEL_MS_PER_TILE, GATHER_MS,
  tileDist, marchSlots, tileBusy, marchPower, campPower, gatherYield, startMarch,
  LONG_HAUL_WORK, LONG_HAUL_YIELD,
} from './world.js';
import {
  fmt, ftime, clock, masteryLvl, perk, shieldCap, storageCap, storageCapFor, capFor, isUnlocked,
  activeTrainings, trainQueue, woundedTotal, woundedCap, woundShare, healCost, healTime,
  prodPerSec, prodMult, upkeepPerSec, buildCost, buildTime, canAfford, armyPower,
  armyBreakdown, trainMult, trainMultFor, bluntFor, counterMult,
  valorQuota, valorToday, isRested, QUEUE_KEYS, buildSlots, activeQueues, freeSlot, townhallReq,
  maxTier, tierOf, tierPower, tierUpkeep, promoteCost, promote, trainCost,
  wavePower, streakMult, finishCost, xpNeed,
} from './logic.js';
import { applyAction, isGameAction } from './actions.js';
import {
  STANCE_BEATS, CLASS_ANSWER, stanceMult, composition, answerBonusForClass,
  committedTroops, forcePower,
} from './arena.js';
import {
  RESEARCH, techLvl, techCost, techTime, researchProgress, techCap, techBlockedBy,
} from './research.js';
import {
  EVENTS, EVENT_MS, currentEvent, eventEndsIn, eventState, eventCap,
  nextMilestone, claimableMilestones, schedule,
} from './events.js';
import { dailyProgress, dailyState, DAILY_BONUS } from './daily.js';
import * as net from './net.js';
import { mountScene, sceneResize, pickBuilding } from './iso.js';
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
    if(!isUnlocked(S, r)) continue;                   // refined goods appear once you can make them
    let rate, rateTxt;
    if(m.refined){
      rate = REFINE[m.from].rate * (S.b[m.from]||0);
      rateTxt = '+'+rate.toFixed(2);
    }else{
      rate = prodPerSec(S,r) - (r==='food' ? upkeepPerSec(S) : 0);
      rateTxt = (rate<0?'−':'+')+Math.abs(rate).toFixed(1);
    }
    const warn = rate<0 ? 'color:var(--bad)' : m.refined ? 'color:var(--info)' : '';
    h += '<span class="res"><span class="lbl">'+m.lbl+'</span> '+fmt(S.res[r]||0)
       + '<span class="rate" style="'+warn+'">/'+fmt(capFor(S,r))+' · '+rateTxt+'/s</span></span>';
  }
  const quota = valorQuota(S), today = valorToday(S);
  const spent = Math.min(today, quota);
  h += '<span class="res valor" title="Valor earns at full rate up to your daily quota, then trickles">'
    + '<span class="lbl">Valor</span> '+fmt(S.valor)
    + '<span class="rate" style="color:'+(today>=quota?'var(--ink-dim)':'var(--gold-deep)')+'">'
    + ' · today '+fmt(spent)+'/'+fmt(quota)+(today>=quota?' (trickle)':'')+'</span></span>';
  if(isRested(S))
    h += '<span class="res" style="color:var(--info)"><span class="lbl" style="color:var(--info)">Rested</span> '
      + ftime(S.rest)+'</span>';
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

function queueStrip(S, q, label, finishAct, slot){
  const now = Date.now();
  const pct = Math.min(100, 100*(now-q.start)/Math.max(1,(q.end-q.start)));
  const c = finishCost(q.end, now);
  return '<div class="queue-strip"><span>'+label+'</span>'
    + '<div class="bar"><i style="width:'+pct+'%"></i></div>'
    + '<span>'+ftime(q.end-now)+'</span>'
    + '<button class="valor-btn" data-act="'+finishAct+'"'+(slot?' data-key="'+slot+'"':'')
    + ' title="Valor buys time at a fixed rate" '+(S.valor<c?'disabled':'')+'>Finish · '+c+' ⚜ Valor</button>'
    + '</div>';
}

function renderHold(S){
  let h = '<section class="panel"><h2>The Hold'
    + '<button class="info-btn" data-act="holdView" style="letter-spacing:0">'
    + (listView ? '🏰 scene' : '▤ list') + '</button></h2>';
  for(const q of QUEUE_KEYS){
    if(!S[q]) continue;
    const d = BUILDINGS[S[q].key];
    h += queueStrip(S, S[q], d.icon+' '+d.name+' → '+(S.b[S[q].key]+1), 'finishBuild', q);
  }
  if(buildSlots(S) > 1 && activeQueues(S).length < 2)
    h += '<div class="stat-note">🔨 '+(2-activeQueues(S).length)+' crew idle — two builds can run at once.</div>';
  if(!listView){
    // the canvas itself is a persistent element re-parented after each render,
    // so the 60fps scene survives the 4Hz DOM rebuild
    h += '<div id="scene-slot"></div>'
      + '<div class="stat-note">Tap a building to inspect or raise it. '
      + '<span style="color:var(--good)">↑</span> marks one you can afford now.</div>'
      + '</section>';
    return h;
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
      const dis = !freeSlot(S) || !canAfford(S, cost) || capped;
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
  const yards = Object.values(TROOPS).filter(d => (S.b[d.at]||0) >= 1).length;
  let h = '<section class="panel"><h2>Muster <span style="letter-spacing:.05em">power '+bd.total
    + ' · '+yards+' yard'+(yards===1?'':'s')+' drilling in parallel</span></h2>';
  h += '<div class="stat-note">'+Math.round(bd.base)+' troops × '+bd.mult.toFixed(2)+' bonuses + '+Math.round(bd.wall)+' wall = <b>'+bd.total+'</b>'
    + ' &nbsp;·&nbsp; eats '+upkeepPerSec(S).toFixed(1)+' food/s of your +'+prodPerSec(S,'food').toFixed(1)+'/s</div>';
  if(!yards){
    h += '<p style="font-size:.85rem;color:var(--ink-dim);font-style:italic">Build the Barracks to drill Spearmen. The Archery Range, Stable and Siege Yard each drill their own troops, on their own queues.</p>';
  }else{
    for(const k of activeTrainings(S)){
      const q = trainQueue(S, k), d = TROOPS[k];
      h += queueStrip(S, q, d.icon+' '+q.count+'× '+d.name, 'finishTrain', k);
    }
    for(const [k,d] of Object.entries(TROOPS)){
      const house = BUILDINGS[d.at];
      const locked = (S.b[d.at] || 0) < 1;
      const busy = !!trainQueue(S, k);
      const tier = tierOf(S,k);
      const canPromote = !locked && tier < maxTier(S);
      h += '<div class="trow">'
        + '<span>'+d.icon+'</span><span class="tname">'+d.name+' <b class="tier-tag">'+TIERS[tier-1]+'</b></span>'
        + '<span class="tmeta">pwr '+tierPower(S,k).toFixed(0)+'</span>'
        + '<button class="info-btn" data-act="detail" data-dtype="troop" data-key="'+k+'" title="unit details'+(canPromote?' — promotion available!':'')+'">'
        + (canPromote?'⬆':'ⓘ')+'</button>'
        + '<span class="spacer"></span>';
      if(locked){
        h += '<span class="tmeta">needs a '+house.name+'</span>';
      }else{
        h += '<span class="count">'+S.t[k]+'</span>'
          + '<button data-act="train" data-key="'+k+'" data-n="1" '+(busy?'disabled':'')+'>+1</button>'
          + '<button data-act="train" data-key="'+k+'" data-n="5" '+(busy?'disabled':'')+'>+5</button>'
          + '<button data-act="train" data-key="'+k+'" data-n="25" '+(busy?'disabled':'')+'>+25</button>';
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

function renderAchievements(S){
  const got = Object.keys(S.achieved||{}).length;
  const next = ACHIEVEMENTS.filter(a => !S.achieved[a.id]).slice(0, 4);
  let h = '<section class="panel"><h2>Achievements <span style="letter-spacing:.05em">'+got+'/'+ACHIEVEMENTS.length+'</span></h2>';
  for(const a of next)
    h += '<div class="m-row">· <span>'+a.txt+'</span><span style="margin-left:auto">+'+a.valor+' ⚜</span></div>';
  if(!next.length) h += '<div class="m-row got">✦ <span>Every deed is done. The chronicle is complete.</span></div>';
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

function renderDaily(S){
  const now = Date.now();
  const rows = dailyProgress(S, now);
  const st = dailyState(S, now);
  const claimable = rows.some(t => t.done && !t.claimed);
  const doneAll = rows.every(t => t.claimed);
  const resets = 86400000 - (now % 86400000);
  let h = '<section class="panel"><h2>Daily Tasks <span style="letter-spacing:.05em">'
    + rows.filter(t=>t.claimed).length+'/'+rows.length+' · resets in '+ftime(resets)+'</span></h2>';
  for(const t of rows){
    h += '<div class="trow'+(t.claimed?'':t.done?' mine':'')+'">'
      + '<span class="tname">'+(t.claimed?'✔ ':'')+t.txt+'</span>'
      + '<span class="tmeta">'+t.have+'/'+t.need+'</span><span class="spacer"></span>'
      + '<span class="tmeta">'+(t.claimed?'claimed':'+'+t.reward.valor+' ⚜')+'</span></div>';
  }
  h += '<div style="display:flex;gap:.6rem;align-items:center;margin-top:.5rem">'
    + '<button class="primary" data-act="claimDaily" '+(claimable?'':'disabled')+'>Collect</button>'
    + '<span class="tmeta" style="font-family:var(--sans);font-size:.65rem;color:var(--ink-dim)">'
    + (doneAll && st.bonus ? 'Slate cleared — the full-day bonus is yours.'
       : 'Clear every line for +'+DAILY_BONUS.valor+' Valor and a Writ.')+'</span></div>';
  h += '</section>';
  return h;
}

function renderBoss(S){
  if(!net.isOnline()) return '';
  const d = net.realmData();
  const b = d && d.boss;
  if(!b) return '';
  let h = '<section class="panel"><h2>'+b.icon+' '+b.name
    + ' <span style="letter-spacing:.05em">'+(b.slain ? 'slain' : b.open ? 'closes in '+ftime(b.closesIn) : 'stirs in '+ftime(b.opensIn))+'</span></h2>';
  if(b.slain){
    h += '<div class="stat-note">It is down. Another of its kin will come out of the fog.</div>';
  }else{
    const pct = Math.max(0, Math.min(100, 100*b.hp/b.maxHp));
    h += '<div class="stat-note">'+fmt(b.hp)+' / '+fmt(b.maxHp)+' left — its strength is drawn from your whole alliance, so it takes all of you.</div>'
      + '<div class="bar threat-fill" style="margin:.2rem 0 .5rem"><i style="width:'+pct+'%"></i></div>'
      + '<button class="primary" data-act="bossStrike" '+(b.open?'':'disabled')+'>⚔ Strike the beast</button>';
  }
  const dmg = Object.entries(b.damage||{}).sort((x,y)=>y[1]-x[1]).slice(0,6);
  if(dmg.length){
    h += '<div class="stat-note" style="margin-top:.5rem">Blows landed</div>';
    const me = net.accountName();
    for(const [name, v] of dmg)
      h += '<div class="trow'+(name===me?' mine':'')+'"><span class="tname">'+name+'</span>'
        + '<span class="spacer"></span><span class="count">'+fmt(v)+'</span></div>';
  }
  h += '<p style="font-size:.68rem;font-family:var(--sans);color:var(--ink-dim);margin-top:.45rem">'
    + 'Every hand that strikes it shares the kill — rank only tilts the share. Nothing here can be bought.</p>';
  h += '</section>';
  return h;
}

function renderCalendar(S){
  const now = Date.now();
  const rows = schedule(now, 5);
  const realm = net.isOnline() ? net.realmData() : null;
  let h = '<section class="panel"><h2>Calendar'
    + (realm ? ' <span style="letter-spacing:.05em">Season '+realm.season.no
        + ' · day '+realm.season.realmDay+' of the realm</span>' : '')+'</h2>';
  if(realm)
    h += '<div class="stat-note">Season ends in <b>'+ftime(realm.season.endsIn)+'</b>'
      + ' — standings freeze, titles are named, and Laurels drift halfway back to 1000.</div>';
  for(const r of rows){
    h += '<div class="trow'+(r.live?' mine':'')+'"><span>'+r.event.icon+'</span>'
      + '<span class="tname">'+r.event.name+'</span>'
      + '<span class="tmeta">'+(r.live ? 'running now' : 'starts in '+ftime(r.startsIn))+'</span>'
      + '<span class="spacer"></span>'
      + '<span class="tmeta">'+(r.live ? 'ends in '+ftime(r.endsIn) : 'lasts '+ftime(EVENT_MS))+'</span></div>';
  }
  if(realm && realm.landmarks){
    const sleeping = realm.landmarks.filter(l => !l.awake).slice(0, 4);
    if(sleeping.length){
      h += '<div class="stat-note" style="margin-top:.6rem">Sites still sleeping — the realm keeps opening</div>';
      for(const l of sleeping)
        h += '<div class="trow"><span>'+l.icon+'</span><span class="tname">'+l.name+'</span>'
          + '<span class="tmeta">'+l.fx+'</span><span class="spacer"></span>'
          + '<span class="tmeta">wakes on realm day '+l.wake+' — '+ftime(l.wakesIn)+'</span></div>';
    }
  }
  if(realm && realm.season.titles && realm.season.titles.length){
    h += '<div class="stat-note" style="margin-top:.6rem">Your titles</div>';
    for(const t of realm.season.titles.slice(-3))
      h += '<div class="trow"><span class="tname">👑 '+t.title+'</span>'
        + '<span class="spacer"></span><span class="tmeta">Season '+t.season+'</span></div>';
  }
  h += '</section>';
  return h;
}

function renderRealm(S){
  if(!net.isOnline())
    return '<section class="panel"><h2>The Realm</h2>'
      + '<p style="font-size:.85rem;color:var(--ink-dim);font-style:italic">Sign in to see the map of landmarks. '
      + 'Alliances break a garrison, then raise a banner over it — and every member carries the bonus while it flies.</p></section>';
  const d = net.realmData();
  if(!d) return '<section class="panel"><h2>The Realm</h2><div class="stat-note">Asking the server…</div></section>';
  const myTag = (net.allianceData() && net.allianceData().alliance) ? net.allianceData().alliance.tag : null;
  let h = '<section class="panel"><h2>The Realm <span style="letter-spacing:.05em">Season '
    + d.season.no + ' · ' + ftime(d.season.endsIn) + ' left</span></h2>';
  for(const l of d.landmarks.filter(x => x.awake)){
    const mine = l.holder && l.holder.tag === myTag;
    const raising = l.banner;
    h += '<div class="trow'+(mine?' mine':'')+'"><span>'+l.icon+'</span>'
      + '<span class="tname">'+l.name+'</span>'
      + '<span class="tmeta">'+l.fx+'</span><span class="spacer"></span>';
    if(raising){
      const ours = raising.tag === myTag;
      h += '<span class="tmeta">🚩 ['+raising.tag+'] raising — '+ftime(raising.endsIn)+' ('+raising.helps+' helps)</span>'
        + (ours ? '<button class="primary" data-act="landmarkHelp" data-key="'+l.id+'">🤝 Help raise</button>' : '');
    }else{
      h += '<span class="tmeta">'+(l.holder ? 'held by ['+l.holder.tag+'] '+l.holder.name : 'unclaimed')
        + ' · garrison '+fmt(l.garrison)+'/'+fmt(l.max)+'</span>';
      if(myTag && !mine) h += '<button data-act="landmarkAssault" data-key="'+l.id+'">⚔ Assault</button>';
    }
    h += '</div>';
  }
  if(d.eventBoard && d.eventBoard.rows.length){
    h += '<div class="stat-note" style="margin-top:.6rem">Event standings — '+d.eventBoard.band+' bracket</div>';
    const me = net.accountName();
    d.eventBoard.rows.slice(0,8).forEach((r,i) => {
      h += '<div class="trow'+(r.name===me?' mine':'')+'"><span class="tmeta">'+(i+1)+'</span>'
        + '<span class="tname">'+r.name+'</span>'
        + '<span class="tmeta">'+(r.alliance?'['+r.alliance+']':'')+' TH'+r.townhall+'</span>'
        + '<span class="spacer"></span><span class="count">'+fmt(r.score)+'</span></div>';
    });
  }
  if(d.alliances && d.alliances.length){
    h += '<div class="stat-note" style="margin-top:.6rem">Alliances of the realm</div>';
    for(const a of d.alliances.slice(0,6))
      h += '<div class="trow'+(a.tag===myTag?' mine':'')+'"><span class="tname">['+a.tag+'] '+a.name+'</span>'
        + '<span class="tmeta">'+a.members+' holds'+(a.holds?' · '+a.holds+' 🚩':'')+'</span>'
        + '<span class="spacer"></span><span class="count">'+fmt(a.power)+'</span></div>';
  }
  h += '<p style="font-size:.68rem;font-family:var(--sans);color:var(--ink-dim);margin-top:.45rem">'
    + 'Break a garrison with assaults, then your alliance raises a banner there — a long build that alliance help speeds up. '
    + 'While it flies, every member carries the bonus.</p>';
  h += '</section>';
  return h;
}

function renderEvent(S){
  const now = Date.now();
  const ev = currentEvent(now), st = eventState(S, now);
  const cap = eventCap(S), next = nextMilestone(S, now);
  const ready = claimableMilestones(S, now);
  const idx = EVENTS.indexOf(ev);
  const then = EVENTS[(idx+1) % EVENTS.length];
  let h = '<section class="panel"><h2>'+ev.icon+' '+ev.name
    + ' <span style="letter-spacing:.05em">ends in '+ftime(eventEndsIn(now))+'</span></h2>';
  h += '<p style="font-size:.85rem;color:var(--ink-dim);font-style:italic">'+ev.blurb+'</p>';
  h += '<div class="stat-note">Your score <b>'+fmt(st.score)+'</b> / '+fmt(cap)+' today'
    + (st.capped ? ' — <span style="color:var(--gold)">day\'s limit reached; the board resets with the window</span>' : '')+'</div>';
  const pct = Math.min(100, 100*st.score/cap);
  h += '<div class="xpbar" style="margin:.2rem 0 .5rem"><i style="width:'+pct+'%;background:var(--gold)"></i></div>';
  for(const m of ev.milestones){
    const got = st.claimed.includes(m.at);
    const can = st.score >= m.at && !got;
    h += '<div class="trow'+(can?' mine':'')+'"><span class="tname">'+fmt(m.at)+' points</span>'
      + '<span class="tmeta">'+m.txt+'</span><span class="spacer"></span>'
      + (got ? '<span class="tmeta" style="color:var(--gold)">claimed</span>'
             : can ? '<button class="primary" data-act="claimEvent">Claim</button>'
                   : '<span class="tmeta">'+fmt(Math.max(0,m.at-st.score))+' to go</span>')
      + '</div>';
  }
  h += '<p style="font-size:.68rem;font-family:var(--sans);color:var(--ink-dim);margin-top:.45rem">'
    + 'Scored by deeds done inside the window — never by spending a stockpile, which is why there is a daily ceiling. '
    + 'Milestones hold the rewards; the state board holds the glory. Next window: '+then.icon+' '+then.name+'.</p>';
  h += '</section>';
  return h;
}

function renderResearch(S){
  const p = researchProgress(S);
  const lib = S.b.library || 0;
  let h = '<section class="panel"><h2>Research <span style="letter-spacing:.05em">'
    + p.done+'/'+p.total+' · Library '+lib+'</span></h2>';
  if(!lib)
    h += '<div class="stat-note" style="color:var(--bad)">📚 No Great Library — your scholars have nowhere to work. Build it (Town Hall 4) before anything can be studied.</div>';
  else
    h += '<div class="stat-note">📚 The Great Library is level '+lib+', so no study may pass level '+lib+'. Raise it to raise the ceiling.</div>';
  if(S.rq){
    const d = RESEARCH[S.rq.key];
    h += queueStrip(S, S.rq, '📚 '+d.name+' → '+(techLvl(S,S.rq.key)+1), 'finishResearch');
  }else{
    h += '<div class="stat-note">The scholars are idle — research runs on its own queue, so it never competes with your builders.</div>';
  }
  for(const [k,d] of Object.entries(RESEARCH)){
    const lvl = techLvl(S,k);
    const blocked = techBlockedBy(S,k);
    h += '<div class="trow"><span>'+d.icon+'</span><span class="tname">'+d.name+'</span>'
      + '<span class="tmeta">'+(lvl?'+'+(lvl*d.per)+(d.unit||'')+' ':'')+d.fx+'</span>'
      + '<span class="spacer"></span><span class="count">'+lvl+'/'+d.max+'</span>';
    if(blocked) h += '<span class="tmeta">'+blocked+'</span>';
    else h += '<button data-act="detail" data-dtype="tech" data-key="'+k+'">Study</button>';
    h += '</div>';
  }
  h += '</section>';
  return h;
}

function renderAlliance(S){
  if(!net.isOnline())
    return '<section class="panel"><h2>Alliance</h2>'
      + '<p style="font-size:.85rem;color:var(--ink-dim);font-style:italic">Sign in (☁ below) to found or join one. '
      + 'Alliance members shave real time off each other&#39;s builds — in this game your allies are the speedups.</p></section>';
  const d = net.allianceData();
  const a = d && d.alliance;
  let h = '<section class="panel"><h2>Alliance'
    + (a ? ' <span style="letter-spacing:.05em">['+a.tag+'] '+a.members.length+' holds · '+fmt(a.power)+' power</span>' : '')
    + '<button class="info-btn" data-act="allianceOpen">'+(a?'manage':'join')+'</button></h2>';
  if(!a){
    h += '<div class="stat-note">You stand alone. Found an alliance or join one — members cut real time off each other&#39;s construction.</div>';
    if(d && d.directory && d.directory.length){
      for(const x of d.directory.slice(0,5))
        h += '<div class="trow"><span class="tname">['+x.tag+'] '+x.name+'</span><span class="spacer"></span>'
          + '<span class="tmeta">'+x.members+' holds</span>'
          + '<button data-act="allianceJoin" data-key="'+x.tag+'">Join</button></div>';
    }
  }else{
    const pending = a.members.reduce((t,m)=>t+(m.name===net.accountName()?0:m.builds.length),0);
    h += '<div style="display:flex;gap:.6rem;align-items:center;margin-bottom:.5rem">'
      + '<button class="primary" data-act="allianceHelpAll" '+(pending?'':'disabled')+'>🤝 Help all'
      + (pending?' ('+pending+')':'')+'</button>'
      + '<span class="tmeta" style="font-family:var(--sans);font-size:.65rem;color:var(--ink-dim)">'
      + 'each help cuts <b style="color:var(--gold)">'+(a.helpPct||1.5)+'%</b> off a build · your builds take up to '
      + (20 + 2*(S.b.embassy||0))+' helps — Fellowship research raises the value, your Embassy raises the ceiling</span></div>';
    // alliance research: what makes the help worth having
    if(a.tech){
      h += '<div class="stat-note" style="margin-top:.5rem">Alliance research — everyone contributes, everyone benefits</div>';
      for(const t of a.tech){
        const pct = t.done ? 100 : Math.min(100, Math.round(100*t.points/t.need));
        h += '<div class="trow"><span class="tname">'+t.name+'</span>'
          + '<span class="tmeta">'+t.fx+'</span><span class="spacer"></span>'
          + '<span class="count">'+t.lvl+'/'+t.max+'</span>';
        if(!t.done) h += '<button data-act="allianceGive" data-key="'+t.key+'" title="Give 8% of your stores — repaid in Valor and Mastery">Fund ('+pct+'%)</button>';
        else h += '<span class="tmeta" style="color:var(--gold)">complete</span>';
        h += '</div>';
      }
    }
    for(const m of a.members){
      const mine = m.name === net.accountName();
      h += '<div class="trow'+(mine?' mine':'')+'"><span class="tname">'+(m.leader?'👑 ':'')+m.name+'</span>'
        + '<span class="tmeta">TH'+m.townhall+' · '+fmt(m.power)+'</span><span class="spacer"></span>';
      if(m.builds.length){
        h += '<span class="tmeta">'+m.builds.map(b =>
          (BUILDINGS[b.key]?BUILDINGS[b.key].icon:'') + ' ' + ftime(b.endsIn) + ' (' + b.helps + '/' + b.cap + ')'
        ).join(' · ')+'</span>';
        if(!mine) h += '<button data-act="allianceHelp" data-key="'+m.name+'">🤝 Help</button>';
      }else h += '<span class="tmeta">idle</span>';
      h += '</div>';
    }
  }
  h += '</section>';
  return h;
}

function renderArena(S){
  if(!net.isOnline())
    return '<section class="panel"><h2>The Arena</h2>'
      + '<p style="font-size:.85rem;color:var(--ink-dim);font-style:italic">Sign in (☁ below) to face other holds. '
      + 'Opponents are matched by power, and victors take no stores — only Laurels.</p></section>';
  const a = net.arenaData();
  const me = a && a.me;
  let h = '<section class="panel"><h2>The Arena <span style="letter-spacing:.05em">'
    + (me ? me.laurels + ' Laurels · ' + me.wins + '–' + me.losses : 'asking the server…') + '</span></h2>';

  h += '<div class="stance-row"><span class="meta">your standing defence:</span>';
  for(const [k,st] of Object.entries(STANCES)){
    h += '<button class="stance-btn'+(S.defStance===k?' active':'')+'" data-act="defStance" data-key="'+k+'" title="'+st.hint+'">'
      + st.icon+' '+st.name+'</button>';
  }
  h += '</div>';

  if(S.arenaLast){
    const r = S.arenaLast;
    h += '<div class="stat-note" style="color:'+(r.won?'var(--good)':'var(--bad)')+'">'+r.text+'</div>';
  }
  if(me && me.readyIn > 0)
    h += '<div class="stat-note">Marshals regrouping — next attack in '+ftime(me.readyIn)+'.</div>';

  if(a && a.opponents){
    if(!a.opponents.length) h += '<div class="stat-note">No holds in your bracket yet — found a second hold on another device to spar with.</div>';
    for(const o of a.opponents){
      h += '<div class="trow"><span class="tname">'+o.name+'</span>'
        + '<span class="tmeta">'+o.laurels+' ⚜L · TH'+o.townhall+'</span><span class="spacer"></span>'
        + '<span class="count">'+fmt(o.power)+'</span>'
        + '<button data-act="detail" data-dtype="arena" data-key="'+o.key+'">Scout</button></div>';
    }
  }
  h += '<p style="font-size:.68rem;font-family:var(--sans);color:var(--ink-dim);margin-top:.45rem">'
    + 'Nobody loses resources, buildings, or a single defender here. Only rating moves.</p>';
  h += '</section>';
  return h;
}

function renderLeaderboard(S){
  if(!net.isOnline()) return '';
  const rows = net.leaderboardRows();
  let h = '<section class="panel"><h2>The Frontier Holds <span style="letter-spacing:.05em">by Laurels</span></h2>';
  if(!rows) h += '<div class="stat-note">Asking the server…</div>';
  else if(!rows.length) h += '<div class="stat-note">No holds on record yet.</div>';
  else{
    const me = net.accountName();
    for(let i=0;i<rows.length;i++){
      const r = rows[i];
      h += '<div class="trow'+(r.name===me?' mine':'')+'"><span class="tmeta">'+(i+1)+'</span>'
        + '<span class="tname">'+(r.name===me?'★ ':'')+r.name+'</span><span class="spacer"></span>'
        + '<span class="tmeta">TH'+r.townhall+' · '+r.wavesWon+'w · arena '+r.arena+'</span>'
        + '<span class="count">'+r.laurels+'</span></div>';
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
let arenaStance = 'balanced', arenaFrac = 0.5;
let listView = false, sceneMounted = false;
const sceneCanvas = document.createElement('canvas');
sceneCanvas.id = 'holdscene';
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
      let reqBlocked = false;
      if(k==='townhall'){
        const r = townhallReq(S);
        reqBlocked = !r.ok;
        body += '<p class="'+(r.ok?'d-delta':'d-warn')+'">The hold must keep pace: '
          + r.have+' of '+r.need+' buildings at level '+(r.toLvl-1)+'.'
          + (r.ok ? ' Ready.' : ' Raise '+r.short.map(x=>BUILDINGS[x].name+' ('+S.b[x]+')').join(', ')+'.')+'</p>';
      }
      body += '<button class="primary" data-act="upgrade" data-key="'+k+'" '
        + ((!freeSlot(S)||!canAfford(S,buildCost(S,k))||capped||reqBlocked||(d.th&&S.b.townhall<d.th))?'disabled':'')+'>'
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
          + '<div style="display:flex;gap:.5rem;margin-top:.5rem;flex-wrap:wrap">'
          + '<button data-act="march" data-idx="'+k+'" data-frac="0.25">March ¼</button>'
          + '<button data-act="march" data-idx="'+k+'" data-frac="0.5">March ½</button>'
          + '<button class="primary" data-act="march" data-idx="'+k+'" data-frac="1">March all</button>'
          + '</div>';
        if(tt.kind === 'gather'){
          body += '<p class="d-delta" style="margin-top:.7rem">🌙 <b>Long haul</b>: work the node for '
            + ftime(LONG_HAUL_WORK)+' instead of '+ftime(GATHER_MS)+' and bring back <b>'
            + fmt(gatherYield(S,tile)*LONG_HAUL_YIELD)+' '+tt.res+'</b> — the thing to set going before you close the game. '
            + 'Those troops defend nothing until dawn.</p>'
            + '<div style="display:flex;gap:.5rem">'
            + '<button data-act="march" data-idx="'+k+'" data-frac="0.5" data-long="1">Long haul ½</button>'
            + '<button class="primary" data-act="march" data-idx="'+k+'" data-frac="1" data-long="1">Long haul, all</button>'
            + '</div>';
        }
      }
    }
  }

  else if(detail.type==='arena'){
    const a = net.arenaData();
    const o = a && a.opponents.find(x => x.key === k);
    if(!o) return '';
    title = '⚔ Scouting ' + o.name;
    const answer = o.dominant ? CLASS_ANSWER[o.dominant] : null;
    const beats = Object.entries(STANCE_BEATS).find(([, loses]) => loses === o.defStance);
    body += '<p class="d-row">Defence <b>'+fmt(o.power)+'</b> (their wall included) · '+o.laurels+' Laurels · Town Hall '+o.townhall+'</p>'
      + '<p class="d-row">Their army leans on <b>'+(o.dominant ? TROOPS[o.dominant].name+'s' : 'nothing in particular')+'</b>'
      + (answer ? ' — '+TROOPS[answer].name+'s are the answer, and your line is '
          + Math.round(100*(composition(S).parts[answer]||0)/Math.max(composition(S).total,1))+'% '+TROOPS[answer].name+'.' : '.')+'</p>'
      + '<p class="d-row">They stand in <b>'+STANCES[o.defStance].name+'</b>'
      + (beats ? ' — <b style="color:var(--gold)">'+STANCES[beats[0]].name+'</b> breaks it (+15%)' : '')+'.</p>'
      + '<div class="stance-row"><span class="meta">attack in:</span>';
    for(const [sk,st] of Object.entries(STANCES)){
      const m = stanceMult(sk, o.defStance);
      body += '<button class="stance-btn'+(arenaStance===sk?' active':'')+'" data-act="arenaStance" data-key="'+sk+'">'
        + st.icon+' '+st.name+(m>1?' +15%':m<1?' −12%':'')+'</button>';
    }
    body += '</div>';
    const troops = committedTroops(S, arenaFrac);
    const sent = Object.values(troops).reduce((x,y)=>x+y,0);
    const f = forcePower(S, troops);
    const est = Math.round(f.base * f.mult * stanceMult(arenaStance, o.defStance)
      * (1 + answerBonusForClass(S, o.dominant)));
    body += '<div class="stance-row"><span class="meta">commit:</span>'
      + ['0.25','0.5','1'].map(fr => '<button class="stance-btn'+(String(arenaFrac)===fr?' active':'')+'" data-act="arenaFrac" data-key="'+fr+'">'
          + (fr==='1'?'everything':fr==='0.5'?'half':'a quarter')+'</button>').join('')
      + '</div>'
      + '<p class="d-delta">Sending '+sent+' troops ≈ <b>'+fmt(est)+'</b> against their '+fmt(o.power)+'.'
      + ' The clash rolls ±22%, so close odds are a real gamble.</p>'
      + '<p class="d-row">Casualties fall only on what you send (≤6% winning, ≤14% losing) — and thin your walls for the next raid. '
      + 'Win or lose, no stores change hands.</p>'
      + '<button class="primary" data-act="arenaAttack" data-key="'+o.key+'" '+(sent?'':'disabled')+'>⚔ Attack '+o.name+'</button>';
  }

  else if(detail.type==='tech'){
    const d = RESEARCH[k]; if(!d) return '';
    const lvl = techLvl(S,k), maxed = lvl >= d.max;
    title = d.icon+' '+d.name+' '+lvl+'/'+d.max;
    body += '<p class="d-fx">Each level: +'+d.per+(d.unit||'')+' '+d.fx+'</p>'
      + '<p class="d-row">Now: <b>+'+(lvl*d.per)+(d.unit||'')+'</b>'
      + (maxed ? '' : ' → next level <b>+'+((lvl+1)*d.per)+(d.unit||'')+'</b>')
      + ' · fully mastered: +'+(d.max*d.per)+(d.unit||'')+'</p>';
    const blocked = techBlockedBy(S,k);
    body += '<p class="d-row">The Great Library (level '+(S.b.library||0)+') caps this at <b>'+techCap(S,k)+'</b>.</p>';
    if(blocked) body += '<p class="d-warn">'+blocked+'.</p>';
    else{
      body += '<p class="d-row">Cost: '+costHtml(S, techCost(S,k))+' · ⏱ '+ftime(techTime(S,k))+'</p>'
        + (S.rq ? '<p class="d-warn">Your scholars are already busy with '+RESEARCH[S.rq.key].name+'.</p>' : '')
        + '<button class="primary" data-act="research" data-key="'+k+'" '
        + ((S.rq || !canAfford(S, techCost(S,k)))?'disabled':'')+'>Begin study</button>';
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
    + '<li>Build costs scale with level², and build <i>times</i> stretch with level too — a level-3 hut is minutes, a late keep is most of a day. The queue is the wall, and it keeps working while you are away.</li>'
    + '<li><b>A second crew</b> joins at Town Hall '+SECOND_QUEUE_TH+', so two upgrades can run at once (never two on the same building). Training runs on its own queue and is deliberately fast — raids arrive every 75s and the muster has to answer.</li>'
    + '<li><b>Four drilling yards, four queues</b>: the Barracks drills Spearmen, the Archery Range Archers, the Stable Knights, the Siege Yard Ballistas — each on its own timer, so four batches can be in progress at once. A troop type you have no yard for is one you cannot field at all.</li>'
    + '<li><b>Wounded, not dead</b>: the Infirmary decides how many of the fallen are carried back alive (30% + 4.5% a level, up to 75%) and holds them in its beds. Tending them costs resources and time and returns them whole. With no Infirmary, everyone who falls is simply gone — and nobody can buy a healing speedup here, so the bill is the cost.</li>'
    + '<li><b>The Command Center</b> grants another march every 6 levels and speeds every column by 2% a level.</li>'
    + '<li><b>The Embassy</b> raises how many alliance helps your own builds may take (+2 a level), on top of what your alliance&#39;s Wide Roads research grants everyone.</li>'
    + '<li><b>Research lives in the Great Library</b> (Town Hall 4). Nothing can be studied without one, and <b>its level is the ceiling on every track</b> — a Library 7 means no study passes 7. Each level also speeds study by 2%. Research runs on its own queue and never competes with the build crews.</li>'
    + '<li><b>Refined goods</b>: the Forge (Town Hall 12) smelts iron and wood into <b>Steel</b> without pause; the Runeworks (Town Hall 22) binds stone and steel into <b>Runestone</b>. Their vaults are small — 10% and 3.5% of your raw storage.</li>'
    + '<li>From level '+15+' every upgrade also costs Steel; from level '+24+', Runestone too. That is what makes the last third of the game long — and why food, wood, stone and iron never stop mattering: they are the fuel.</li>'
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

    + '<h3>Alliances (online)</h3>'
    + '<ul>'
    + '<li>Up to 30 holds under one banner. Members <b>Help</b> each other&#39;s construction: each help cuts 1.5% of a build (at least a minute), up to 20 helps per build, one per hold per build.</li>'
    + '<li>That is the whole anti-P2W thesis in one mechanic — Kingshot sells speedups, here your alliance <i>is</i> the speedup, and it costs nothing but showing up for each other.</li>'
    + '</ul>'

    + '<h3>Chat</h3>'
    + '<ul><li>Four rooms: the whole state, your alliance, direct messages, and private groups anyone can make. The 💬 button sits bottom-right whenever you are signed in.</li></ul>'

    + '<h3>The Frontier</h3>'
    + '<ul>'
    + '<li>Tap a map tile to inspect and <b>march</b> on it: resource nodes (worked for a large haul), Bandit Camps (burned for loot, Valor and Mastery), Ancient Ruins (Valor, Mastery, 20% Writ).</li>'
    + '<li>Travel costs 12s per tile each way; gathering takes 60s. Marching troops carry their own rations and <b>do not defend the wall</b> until they return.</li>'
    + '<li><b>Long haul</b>: work a resource node for '+ftime(LONG_HAUL_WORK)+' instead of a minute and bring back '+LONG_HAUL_YIELD+'× the haul — the thing to set going before you close the game, at the price of an undefended wall until they are home.</li>'
    + '<li>Camp battles use your march&#39;s power (heroes and Mastery apply; no wall, no stance). Defeat costs a third of the marchers.</li>'
    + '<li>One march slot; Town Hall 10 grants a second. Worked tiles regrow in ~4 minutes, sometimes richer.</li>'
    + '</ul>'

    + '<h3>The Arena (online)</h3>'
    + '<ul>'
    + '<li><b>Nothing is stolen.</b> Win or lose, no resources, buildings or defenders change hands — only Laurels (rating), plus Valor and Mastery for the attacker. Nobody can be farmed.</li>'
    + '<li><b>Bracketed</b>: you are only shown holds between 0.65× and 1.35× your defence (widening if the pool is thin), and the server refuses attacks outside 0.3×–2.2× regardless.</li>'
    + '<li><b>The stance triangle</b>: Charge beats Volley, Volley beats Shield Wall, Shield Wall beats Charge — +15% for the right read, −12% for the wrong one. Balanced is neutral. Scouting shows their standing defence, so this is a real decision.</li>'
    + '<li><b>Composition</b>: bring the answer to their dominant class — Spearmen vs Knights, Knights vs Archers and Ballistas, Archers vs Spearmen — up to +15% by share.</li>'
    + '<li><b>Commitment</b>: you send a quarter, half or all of your army. Casualties fall only on what you sent (≤6% winning, ≤14% losing) and they thin the wall that must hold your next raid.</li>'
    + '<li><b>Attack and defence</b>: the attacker strikes with 8% initiative for choosing the hour; the defender&#39;s edge is the wall they paid for. Neglect your Wall and you are a soft target on the ladder.</li>'
    + '<li><b>Defenders</b> fight from a snapshot, lose no troops at all, and risk only half the rating — they were not there to command.</li>'
    + '<li>Laurels move on Elo (K=24), so beating a stronger hold pays more. One attack every 90s.</li>'
    + '</ul>'

    + '<h3>Valor &amp; Writs</h3>'
    + '<ul>'
    + '<li>Valor comes from wins (5 + wave, capped +15, warbands ×2), quests, patrols (+2), finished buildings (+2), even losses (+2). It is never sold.</li>'
    + '<li>Spend it to finish any timer: 1 Valor per 4s remaining. Redrawing a draft costs 5.</li>'
    + '<li><b>Daily quota</b>: Valor earns at full rate up to '+fmt(valorQuota(S))+' a day (it grows with your Town Hall), then trickles at a quarter rate. Ten hours of play beats one hour — by about half again, not tenfold. Progression is paced by the calendar, so nobody can be sold a way past it either.</li>'
    + '<li><b>Rested</b>: every hour away banks half an hour of Rest (up to two days&#39; worth). While Rested, production runs +50% and your Valor quota doubles — so a week away is a running start, not a hole.</li>'
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
      + renderDaily(S) + renderEvent(S) + renderBoss(S) + renderCalendar(S) + renderRealm(S) + renderResearch(S) + renderAlliance(S) + renderArena(S) + renderLeaderboard(S) + renderMastery(S) + renderQuest(S)
      + renderAchievements(S) + renderChronicle(S) + '</div>'
    + '</main>' + renderFooter();
  fx.innerHTML = renderFx(S) + (S.seenIntro ? renderChoice(S) + renderCodex(S) + renderDetail(S) : '');
  drawMap(S);
  const slot = document.getElementById('scene-slot');
  if(slot){
    if(sceneCanvas.parentNode !== slot) slot.appendChild(sceneCanvas);
    if(!sceneMounted){ mountScene(sceneCanvas, store); sceneMounted = true; }
    else sceneResize();
  }
}

/* ── input ── */

// UI-only actions: they change what you are looking at, not the hold itself,
// so they never travel to the server.
const VIEW_ACTIONS = {
  about: () => { store.s.seenIntro = false; },
  codex: () => { codexOpen = !codexOpen; },
  detail: b => { detail = {type:b.dataset.dtype, key:b.dataset.key}; },
  detailClose: () => { detail = null; },
  holdView:    () => { listView = !listView; sceneMounted = false; },
  arenaStance: b => { arenaStance = b.dataset.key; },
  arenaFrac:   b => { arenaFrac = Number(b.dataset.key); },
  arenaAttack: b => {
    const target = b.dataset.key;
    detail = null;
    net.arenaAttack(target, arenaStance, arenaFrac)
      .then(d => { store.s = d.state; net.refreshArena().then(render); net.refreshLeaderboard().then(render); render(); })
      .catch(err => { acctMsg = err.message; acctOpen = true; renderAccount(); });
  },
  chatToggle: () => { chatOpen = !chatOpen; chatHint = ''; renderChat(true); },
  chatRoom:   b => {
    chatRoom = { channel: b.dataset.key, target: b.dataset.mode || null };
    renderChat(true);
  },
  chatSend: () => {
    const el = document.getElementById('chat-input');
    const text = el && el.value.trim();
    if(!text) return;
    el.value = '';
    net.chatSend(chatRoom.channel, chatRoom.target, text).then(() => renderChat(true)).catch(()=>{});
  },
  chatNewGroup: () => {
    const name = prompt2('Name your group');
    if(name) net.chatGroup(name).then(d => { chatRoom = {channel:'group', target:d.id}; renderChat(true); }).catch(()=>{});
  },
  chatNewDm: () => {
    const who = prompt2('Which hold do you want to message?');
    if(who) net.chatSend('dm', who, 'Hail.').then(() => { chatRoom = {channel:'dm', target:who}; renderChat(true); }).catch(()=>{});
  },
  chatInvite: () => {
    const who = prompt2('Invite which hold?');
    if(who) net.chatInvite(chatRoom.target, who).then(() => renderChat(true)).catch(()=>{});
  },
  allianceOpen:  () => { allyOpen = true; allyMsg = ''; renderAllySheet(); },
  allianceClose: () => { allyOpen = false; renderAllySheet(); },
  allianceMake:  () => {
    const name = (document.getElementById('ally-name')||{}).value || '';
    const tag  = (document.getElementById('ally-tag')||{}).value || '';
    allyMsg = 'Raising the banner…'; renderAllySheet();
    net.allianceCreate(name, tag)
      .then(() => { allyOpen = false; allyMsg=''; renderAllySheet(); render(); })
      .catch(e => { allyMsg = e.message; renderAllySheet(); });
  },
  allianceJoin: b => {
    const tag = b.dataset.key || (document.getElementById('ally-join')||{}).value || '';
    net.allianceJoin(tag)
      .then(() => { allyOpen = false; allyMsg=''; renderAllySheet(); render(); })
      .catch(e => { allyMsg = e.message; allyOpen = true; renderAllySheet(); });
  },
  allianceLeave: () => {
    net.allianceLeave().then(() => { allyOpen = false; renderAllySheet(); render(); }).catch(()=>{});
  },
  landmarkAssault: b => {
    net.landmarkAssault(b.dataset.key)
      .then(d => { if(d.state) store.s = d.state; render(); })
      .catch(e => { acctMsg = e.message; acctOpen = true; renderAccount(); });
  },
  landmarkHelp: b => { net.landmarkHelp(b.dataset.key).then(render).catch(()=>{}); },
  bossStrike: () => {
    net.bossStrike()
      .then(d => { if(d.state) store.s = d.state; render(); })
      .catch(e => { acctMsg = e.message; acctOpen = true; renderAccount(); });
  },
  allianceGive:    b => {
    net.allianceContribute(b.dataset.key)
      .then(d => { if(d.levelled) allyMsg = ''; return net.pullState(); })
      .then(s => { store.s = s; render(); }).catch(()=>{});
  },
  allianceHelp:    b => { net.allianceHelp(b.dataset.key).then(render).catch(()=>{}); },
  allianceHelpAll: () => { net.allianceHelp(null).then(render).catch(()=>{}); },
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
  return { key:d.key, n:d.n, i:d.i, idx:d.idx, frac:d.frac, long:d.long, mode:d.mode };
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

/* ── chat ──
   Also outside the tick loop: an input that gets rebuilt four times a second
   cannot be typed into. Redrawn only when messages arrive or the room changes. */
const chatBox = document.createElement('div');
chatBox.id = 'chatdock';
document.body.appendChild(chatBox);

// native prompt() is blocked in sandboxed frames, same as confirm() was
function prompt2(question){
  const el = document.getElementById('chat-input');
  const v = el && el.value.trim();
  if(v){ el.value = ''; return v; }
  chatHint = question + ' — type it in the box below, then tap again.';
  return null;
}
let chatHint = '';
let chatOpen = false, chatRoom = {channel:'state', target:null}, chatSig = '';

export function renderChat(force){
  if(!net.isOnline()){ chatBox.innerHTML = ''; return; }
  const d = net.chatData();
  const msgs = !d ? []
    : chatRoom.channel === 'state' ? d.state
    : chatRoom.channel === 'alliance' ? d.alliance
    : chatRoom.channel === 'dm' ? (d.dms[chatRoom.target] || [])
    : ((d.groups.find(g => g.id === chatRoom.target) || {}).msgs || []);
  // only redraw when something actually changed, or typing gets interrupted
  const sig = chatOpen + '|' + chatRoom.channel + '|' + chatRoom.target + '|'
    + msgs.length + '|' + (msgs.length ? msgs[msgs.length-1].id : 0)
    + '|' + (d ? d.groups.length + Object.keys(d.dms).length : 0);
  if(!force && sig === chatSig) return;
  chatSig = sig;

  if(!chatOpen){
    chatBox.innerHTML = '<button class="chat-fab" data-act="chatToggle">💬 Chat</button>';
    return;
  }
  const tabs = [['state','🌍 State'], ['alliance','🛡 Alliance']];
  let tabHtml = tabs.map(([c,l]) =>
    '<button class="chat-tab'+(chatRoom.channel===c?' active':'')+'" data-act="chatRoom" data-key="'+c+'">'+l+'</button>').join('');
  if(d){
    for(const name of Object.keys(d.dms))
      tabHtml += '<button class="chat-tab'+(chatRoom.channel==='dm'&&chatRoom.target===name?' active':'')
        + '" data-act="chatRoom" data-key="dm" data-mode="'+name+'">@'+name+'</button>';
    for(const g of d.groups)
      tabHtml += '<button class="chat-tab'+(chatRoom.channel==='group'&&chatRoom.target===g.id?' active':'')
        + '" data-act="chatRoom" data-key="group" data-mode="'+g.id+'">◇ '+g.name+'</button>';
  }
  const me = net.accountName();
  const body = msgs.map(m =>
    '<p class="chat-msg'+(m.from===me?' mine':'')+'"><b>'+m.from+'</b> '+m.text+'</p>').join('')
    || '<p class="chat-msg" style="opacity:.6">Nothing said here yet.</p>';

  chatBox.innerHTML = '<div class="chat-panel">'
    + '<div class="chat-head"><span>Chat</span>'
    + '<button class="info-btn" data-act="chatNewGroup" title="Start a private group">＋ group</button>'
    + '<button class="info-btn" data-act="chatNewDm" title="Message a hold directly">＋ dm</button>'
    + '<button class="info-btn" data-act="chatToggle">✕</button></div>'
    + '<div class="chat-tabs">'+tabHtml+'</div>'
    + '<div class="chat-log" id="chatlog">'+body+'</div>'
    + (chatRoom.channel==='group'
      ? '<div class="chat-tabs"><button class="chat-tab" data-act="chatInvite">＋ invite a hold</button></div>' : '')
    + (chatHint ? '<p class="chat-msg" style="color:var(--gold)">'+chatHint+'</p>' : '')
    + '<div class="chat-row"><input id="chat-input" maxlength="300" placeholder="Say something…">'
    + '<button class="primary" data-act="chatSend">Send</button></div>'
    + '</div>';
  const log = document.getElementById('chatlog');
  if(log) log.scrollTop = log.scrollHeight;
  const input = document.getElementById('chat-input');
  if(input) input.onkeydown = e => { if(e.key === 'Enter') VIEW_ACTIONS.chatSend(); };
}

/* the alliance sheet lives outside the tick loop too, for the same reason */
const allyBox = document.createElement('div');
document.body.appendChild(allyBox);
let allyOpen = false, allyMsg = '';

export function renderAllySheet(){
  if(!allyOpen){ allyBox.innerHTML = ''; return; }
  const d = net.allianceData();
  const a = d && d.alliance;
  allyBox.innerHTML = '<div class="overlay"><div class="card dsheet">'
    + '<h1 style="font-size:1.15rem">🤝 '+(a ? '['+a.tag+'] '+a.name : 'Alliance')+'</h1><div class="rule"></div>'
    + (a
      ? '<p class="d-row">'+a.members.length+' holds · '+fmt(a.power)+' combined power · led by <b>'+a.leader+'</b></p>'
        + '<p class="d-row">Members cut real time off each other&#39;s construction — 1.5% (at least a minute) per help, up to 20 helps a build. Nobody pays for a speedup here; they ask.</p>'
        + '<div style="display:flex;gap:.6rem;margin-top:.6rem"><button data-act="allianceLeave">Leave alliance</button>'
        + '<button class="primary" data-act="allianceClose">Back to the walls</button></div>'
      : '<p class="d-row">Found your own banner, or join one by tag. Alliance members shave real time off each other&#39;s builds — the answer to buying speedups is having friends.</p>'
        + '<label class="d-row">Alliance name<br><input id="ally-name" maxlength="24" placeholder="The Iron Concord"></label>'
        + '<label class="d-row">Tag (2–4 characters)<br><input id="ally-tag" maxlength="4" placeholder="IRON"></label>'
        + '<button class="primary" data-act="allianceMake">Raise the banner</button>'
        + '<label class="d-row" style="margin-top:1rem">…or join by tag<br><input id="ally-join" maxlength="4" placeholder="IRON"></label>'
        + '<div style="display:flex;gap:.6rem"><button data-act="allianceJoin">Join</button>'
        + '<button data-act="allianceClose">Not now</button></div>')
    + (allyMsg ? '<p class="d-warn">'+allyMsg+'</p>' : '')
    + '</div></div>';
}

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
        + '<label class="d-row">Server<br><input id="acct-server" value="'+(net.serverUrl()||net.DEFAULT_SERVER)+'"></label>'
        + (location.protocol === 'https:' && /localhost/.test(net.serverUrl()||net.DEFAULT_SERVER)
          ? '<p class="d-warn">You are on a secure page trying to reach a server on your own machine — some browsers block that. If sign-in fails, open the server\'s own address instead: <b>'+(net.serverUrl()||net.DEFAULT_SERVER)+'</b></p>' : '')
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
    // taps on the hold scene open that building's sheet
    if(e.target && e.target.id === 'holdscene'){
      const key = pickBuilding(e.clientX, e.clientY);
      if(key){ detail = {type:'building', key}; render(); }
      return;
    }
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
