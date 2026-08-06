// Crownhold UI: renders state to DOM, wires input to logic actions.

import {
  BUILDINGS, TROOPS, MASTERY, QUESTS, ACHIEVEMENTS, RES_META, REFINE,
  HERO_POOL, HERO_SLOTS, SPOILS, RARITY, LEAD_FX, SEASON_ARCS, seasonNo, seasonEndsIn, SEASON_MS,
  WAVE_TYPES, STANCES, EXPEDITIONS,
  WAVE_MS, FIRST_WAVE_MS, SHIELD_MS, SECOND_QUEUE_TH, COURT_PER_TH, COURT_MAX,
  MARCH_HEROES, CLASS_AFFINITY, CAP_PER_HERO, CAP_PER_LEVEL, LOAD,
  ARENA_HEROES, STAR_POWER, starNeed, TEMPERS, temperFor,
  BEASTS, BEAST_ROAM_MS, PET_POOL, PET_MAX_LVL, petXpNeed, petBondNeed,
} from './defs.js';
import { TIERS } from './defs.js';
import {
  TILE_TYPES, MAP_W, MAP_H, CX, CY, TRAVEL_MS_PER_TILE, GATHER_MS,
  tileDist, marchSlots, tileBusy, marchPower, campPower, gatherYield, startMarch,
  heroCanLead, marchCapacity, fitColumn, bestLeaders, marchParty as partyOf,
  beastPower, beastBusy, marchSpeed,
  isleReady, rationCost, voyageTime, voyageBlockedBy, refPower, columnLoad,
  tileReq, tileLocked, TILE_LVL_MAX,
  LONG_HAUL_WORK, LONG_HAUL_YIELD,
} from './world.js';
import {
  fmt, ftime, clock, masteryLvl, perk, shieldCap, storageCap, storageCapFor, capFor, isUnlocked,
  activeTrainings, trainQueue, woundedTotal, woundedCap, woundShare, healCost, healTime,
  prodPerSec, prodMult, upkeepPerSec, buildCost, buildTime, canAfford, armyPower,
  armyBreakdown, trainMult, trainMultFor, bluntFor, counterMult,
  valorQuota, valorToday, isRested, QUEUE_KEYS, buildSlots, activeQueues, freeSlot, townhallReq, townhallPath,
  maxTier, tierOf, tierPower, tierUpkeep, promoteCost, promote, trainCost,
  wavePower, streakMult, finishCost, xpNeed,
  courtSeats, courtSeated, heroAway, leadBonus, leadTotal, heroSeasonOpen, classLift,
  effLvl, heroStarCap, arenaTeam, setArenaTeam, gearBlockedBy, petBonus, screenCover,
} from './logic.js';
import { applyAction, isGameAction } from './actions.js';
import * as sound from './audio.js';
import { CHRONICLE, SEASON_LORE } from './lore.js';
import { REGALIA, WARGEAR, GEAR_MAX, GEAR_PER_LEVEL, gearCost, gearTime,
         regaliaTier, wargearTier, wargearTotal, gearLevels, costLabel } from './gear.js';
import { SKILLS, SKILL_SLOTS, SLOT_AT, slotsOpen, legalSkills } from './skills.js';
import { ISLE_W, ISLE_H, ISLE_TH, ISLE_SITES, RATION_COST, cellAt, charted } from './isle.js';
import { COS_KINDS, CATALOGUE, HOLD_SKINS, SUBSCRIPTIONS, EARN, itemsOf, itemDef, isOwned } from './shop.js';
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
import { mountScene, sceneResize, pickBuilding, setSkinTint, setLabels, labelsShown } from './iso.js';
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
  // a raven at your side sees them form early enough to matter without a tower
  const raven = petBonus(S, 'warn') > 0;
  const scouted = S.b.watchtower >= 1 || raven;
  const wt = WAVE_TYPES[S.waveType||'rabble'];
  const est = scouted
    ? wt.icon+' '+wt.name+' · ≈'+Math.round(wavePower(S.wave)*(isWB?1.6:1)*streakMult(S))+' strength'
      +(S.streak>0?' (bloodied)':'')
      +(wt.weakTo?' · weak to '+STANCES[wt.weakTo].name+' &amp; '+TROOPS[wt.counter].plural:'')
      +(!S.b.watchtower && raven ? ' <span style="opacity:.7">(your raven brought word)</span>' : '')
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
    + '%"></i></div>';
  h += renderTemper(S, now);
  h += '</div>';
  return h;
}

/* What the Unpaid are mustering this season. Shown on the threat bar because it
   is a planning tool, not trivia: it tells you which troops to drill and which
   captains to raise for the next fortnight. */
function renderTemper(S, now){
  const t = temperFor(now);
  const fav = t.favours ? TROOPS[t.favours] : null;
  const cap = fav ? Object.entries(HERO_POOL).filter(([k,d]) => d.cls === t.favours && S.heroes[k]).length : 0;
  const top = Object.entries(t.waves).sort((a,b)=>b[1]-a[1])[0];
  return '<div class="temper"><span class="tname">'+t.icon+' '+t.name+'</span>'
    + '<span class="meta">'+t.blurb+'</span>'
    + '<span class="meta" style="margin-left:auto">'
    + Math.round(top[1]*100)+'% '+WAVE_TYPES[top[0]].name.toLowerCase()
    + (fav ? ' · favours <b>'+fav.icon+' '+fav.plural+'</b>'
        + (cap ? ' <span style="opacity:.7">('+cap+' captain'+(cap===1?'':'s')+' drafted)</span>'
              : ' <span style="opacity:.7">(no captain of theirs yet)</span>') : '')
    + '</span></div>';
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

/* ── the road to the next Town Hall ──
   The one place in the game where the thing the player wants is genuinely blocked,
   rather than merely slow: the pace gate is shut for a third to a half of the late
   game. Everything else that looked like waiting turned out to be the simulator's bot
   declining work the game was offering.

   Before this, the gate was only visible if you happened to tap the Town Hall, and it
   read as a refusal — "the hold must keep pace, 2 of 4". Now it is a costed checklist
   at the top of the hold with the cheapest route already worked out and a button per
   step, so a blocked goal reads as three taps rather than a wall. */
function renderRoad(S){
  const p = townhallPath(S);
  const d = BUILDINGS.townhall;
  if((S.b.townhall || 0) >= d.max) return '';
  const underway = QUEUE_KEYS.some(q => S[q] && S[q].key === 'townhall');
  if(underway) return '';

  if(p.ok){
    const cost = buildCost(S, 'townhall'), can = canAfford(S, cost) && freeSlot(S);
    return '<div class="road ready"><div class="rhead">🏛️ Town Hall '+p.toLvl+' is ready'
      + ' <span class="hmeta">'+p.have+' of '+p.need+' buildings at level '+(p.toLvl-1)+'</span></div>'
      + '<div class="rrow"><span class="rcost">'+costHtml(S, cost)+' · ⏱ '+ftime(buildTime(S,'townhall'))+'</span>'
      + '<button class="primary" data-act="upgrade" data-key="townhall" '+(can?'':'disabled')+'>Raise it</button></div></div>';
  }
  let h = '<div class="road"><div class="rhead">🏛️ The road to Town Hall '+p.toLvl
    + ' <span class="hmeta">'+p.have+' of '+p.need+' buildings at level '+(p.toLvl-1)
    + ' — cheapest '+p.want+' first</span></div>';
  for(const step of p.path){
    const bd = BUILDINGS[step.key];
    const now = S.b[step.key] || 0;
    const busy = QUEUE_KEYS.some(q => S[q] && S[q].key === step.key);
    const capped = now >= S.b.townhall;
    const cost = buildCost(S, step.key);
    const can = !busy && !capped && freeSlot(S) && canAfford(S, cost);
    h += '<div class="rrow"><span class="rname">'+bd.icon+' '+bd.name
      + ' <b>'+now+'→'+(p.toLvl-1)+'</b></span>'
      + '<span class="rcost">'+(step.levels > 1 ? step.levels+' levels · ' : '')+costHtml(S, cost)+'</span>'
      + '<button data-act="upgrade" data-key="'+step.key+'" '+(can?'':'disabled')+'>'
      + (busy ? 'building' : capped ? 'Town Hall caps it' : 'Raise') + '</button></div>';
  }
  if(!p.path.length)
    h += '<div class="stat-note">Nothing left within reach raises it — the buildings that would '
      + 'are capped by the Town Hall itself. Raise anything below its level.</div>';
  return h + '</div>';
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
  h += renderRoad(S);
  if(!listView){
    // the canvas itself is a persistent element re-parented after each render,
    // so the 60fps scene survives the 4Hz DOM rebuild
    h += '<div id="scene-slot"></div>'
      + '<div class="stat-note">Tap a building to inspect or raise it. '
      + '<span style="color:var(--good)">↑</span> marks one you can afford now.</div>'
      + '</section>';
    return h;
  }
  /* Buildings you cannot yet raise are not shown at all — the hold visibly
     grows new ground as the Town Hall rises, instead of greeting a new player
     with twenty-one greyed-out cards. Only the count is teased, so there is
     still something to look forward to. */
  const all = Object.entries(BUILDINGS);
  const shown = all.filter(([k,d]) => !d.th || S.b.townhall >= d.th || S.b[k] > 0);
  const hidden = all.length - shown.length;
  const nextAt = all.filter(([,d]) => d.th > S.b.townhall).map(([,d]) => d.th).sort((a,b)=>a-b)[0];

  h += '<div class="bgrid">';
  for(const [k,d] of shown){
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
  h += '</div>';
  if(hidden > 0)
    h += '<div class="stat-note">🏗 <b>'+hidden+'</b> more structure'+(hidden===1?'':'s')
      + ' still want ground you have not cleared. The next breaks earth at <b>Town Hall '+nextAt+'</b>.</div>';
  h += '</section>';
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

/* Stars, drawn compactly — a hero at 20★ should not push the row off a phone. */
function starStr(n, cap){
  if(n >= 6) return '✦'+n+(cap && n>=cap ? ' (max)' : '');
  return '✦'.repeat(n) || '';
}
function heroStars(S, k){ return (S.heroes[k] && S.heroes[k].stars) || 0; }

/* One hero row, told from wherever they happen to be standing. */
function heroRow(S, k, where){
  const d = HERO_POOL[k], hero = S.heroes[k];
  if(!d || !hero) return '';
  const isCapt = S.captain===k, cd = S.orderCd[k]||0;
  const seated = where === 'court';
  const eff = effLvl(S, k);
  const fx = seated ? d.fx(eff) + (isCapt ? ' <b style="color:var(--gold)">×2</b>' : '')
                    : LEAD_FX[d.lead.key](eff) + ' · +'+Math.round(CLASS_AFFINITY*eff*100)
                      +'% to '+TROOPS[d.cls].plural.toLowerCase();
  const st = heroStars(S, k);
  return '<div class="hero'+(where==='away'?' away':'')+'">'
    + '<span class="hname">'+(isCapt?'★ ':'')+(where==='away'?'🚩 ':'')+d.icon+' '+d.name+'</span>'
    + (st ? ' <span class="stars">'+starStr(st, heroStarCap(S))+'</span>' : '')
    + ' <span class="rar rar-'+d.rarity+'">'+TROOPS[d.cls].icon+' '+RARITY[d.rarity].tag+'</span>'
    + '<button class="info-btn" data-act="detail" data-dtype="hero" data-key="'+k+'" title="hero details">ⓘ</button>'
    + '<div class="order-row"><span class="hmeta">L'+hero.lvl+(st?'+'+st+'✦':'')+' · '+fx+'</span>'
    + '<button class="order-btn" data-act="order" data-key="'+k+'" '+(cd>0?'disabled':'')
    + ' title="'+d.order.desc+'">'+d.order.name+(cd>0?' · '+cd+'w':'')+'</button></div>'
    + '</div>';
}

function renderHeroes(S){
  const owned = Object.keys(S.heroes).filter(k => HERO_POOL[k]);
  const seats = courtSeats(S), court = courtSeated(S);
  const away = owned.filter(k => heroAway(S,k));
  const idle = owned.filter(k => !court.includes(k) && !away.includes(k));
  const arcs = Object.keys(HERO_POOL).filter(k => heroSeasonOpen(S,k)).length;

  let h = '<section class="panel"><h2>The Court <span style="letter-spacing:.05em">'
    + court.length+'/'+seats+' chairs · '+owned.length+' of '+arcs+' heroes drafted</span></h2>'
    + '<div class="stat-note">A hero either advises here or rides at the head of a column — never both. '
    + 'Chairs are the cap: another with every '+COURT_PER_TH+' levels of Town Hall, to '+COURT_MAX+'. '
    + 'Everyone else is free to lead a column.</div>';
  for(const k of court) h += heroRow(S, k, 'court');
  for(let i = court.length; i < seats; i++)
    h += '<div class="hero locked"><span class="hname">🪑 An empty chair</span>'
      + '<div class="hmeta">Seat a hero to make their counsel count for the whole hold</div></div>';

  if(away.length){
    h += '<div class="stat-note" style="margin-top:.7rem">On the road — their counsel is with the column, not the hall</div>';
    for(const k of away) h += heroRow(S, k, 'away');
  }
  if(idle.length){
    h += '<div class="stat-note" style="margin-top:.7rem">Awaiting a command — seat them, or send them out with a march</div>';
    for(const k of idle) h += heroRow(S, k, 'idle');
  }
  for(let i = S.offersDone; i < Math.min(HERO_SLOTS.length, S.offersDone + 3); i++){
    h += '<div class="hero locked"><span class="hname">❔ A rider not yet sent for</span>'
      + '<div class="hmeta">'+HERO_SLOTS[i].hint+' — a draft of three will answer</div></div>';
  }
  if(S.offersDone < HERO_SLOTS.length)
    h += '<div class="stat-note">'+(HERO_SLOTS.length - S.offersDone)+' more drafts still to earn, '
      + 'and the roster grows every season. Heroes are drafted, never pulled and never sold.</div>';
  h += '</section>';
  return h;
}

/* The kennel. One companion walks at your side; the rest wait their turn. */
function renderPets(S){
  const own = Object.entries(S.pets||{}).filter(([k]) => PET_POOL[k]);
  const slain = S.beastsSlain||0;
  if(!own.length && !slain) return '';
  const need = petBondNeed(own.length);
  const maxed = own.length >= Object.keys(PET_POOL).length;
  let h = '<section class="panel"><h2>The Kennel <span style="letter-spacing:.05em">'
    + own.length+'/'+Object.keys(PET_POOL).length+' · '+slain+' beast'+(slain===1?'':'s')+' taken</span></h2>'
    + '<div class="stat-note">Companions come off the frontier and nowhere else — hunt beasts, earn bond, and three '
    + 'are offered for you to keep one. <b>Only one walks at your side.</b> The rest wait, so a full kennel is more '
    + 'choices and never more power.</div>';
  if(!maxed)
    h += '<div class="stat-note">Bond <b>'+(S.bond||0)+'/'+need+'</b> toward the next'
      + '<div class="xpbar" style="margin-top:.3rem"><i style="width:'+Math.min(100,100*(S.bond||0)/need)+'%;background:var(--gold)"></i></div></div>';
  for(const [k,p] of own){
    const d = PET_POOL[k], out = S.petOut===k;
    const xn = petXpNeed(p.lvl);
    h += '<div class="hero'+(out?'':' locked')+'"><span class="hname">'+(out?'🐾 ':'')+d.icon+' '+d.name+'</span>'
      + '<div class="order-row"><span class="hmeta">L'+p.lvl+'/'+PET_MAX_LVL+' · '+d.fx(p.lvl)
      + (p.lvl<PET_MAX_LVL?' · '+fmt(p.xp||0)+'/'+fmt(xn)+' xp':' · fully grown')+'</span>'
      + '<button class="order-btn" data-act="petOut" data-key="'+k+'">'+(out?'Leave at home':'Take along')+'</button></div>'
      + '</div>';
  }
  if(!own.length)
    h += '<div class="stat-note" style="font-style:italic">Nothing has followed you home yet. Hunt the frontier.</div>';
  return h + '</section>';
}

/* Skills. Three slots, opened by investment, filled by choice, reassignable for
   nothing — so the picker is the whole system and it lives in the hero's sheet. */
let skillSlotOpen = null;   // {hero, slot} while a slot's menu is expanded

function renderSkills(S, id){
  const open = slotsOpen(S, id);
  const eq = (S.heroes[id].skills || []);
  const legal = legalSkills(S, id, HERO_POOL);
  let h = '<p class="d-row" style="margin-top:.7rem"><b>Skills</b> '
    + '<span class="hmeta">'+open+' of '+SKILL_SLOTS+' slots open · '+legal.length
    + ' to choose from · change them any time, for nothing</span></p>';
  for(let n = 1; n <= SKILL_SLOTS; n++){
    const gate = SLOT_AT[n-1];
    if(n > open){
      h += '<div class="skillslot locked"><span class="tname">Slot '+n+'</span>'
        + '<span class="hmeta">opens '+gate.hint+'</span></div>';
      continue;
    }
    const cur = SKILLS[eq[n-1]] ? eq[n-1] : null;
    const d = cur && SKILLS[cur];
    const expanded = skillSlotOpen && skillSlotOpen.hero === id && skillSlotOpen.slot === n;
    h += '<div class="skillslot'+(expanded?' open':'')+'">'
      + '<span class="tname">'+(d ? d.icon+' '+d.name : '— empty —')+'</span>'
      + '<span class="hmeta">'+(d ? d.fx : 'nothing chosen')+'</span>'
      + '<span class="spacer"></span>'
      + '<button data-act="skillPick" data-mode="'+id+'" data-n="'+n+'">'
      + (expanded ? 'Close' : d ? 'Change' : 'Choose')+'</button></div>';
    if(!expanded) continue;
    h += '<div class="leadpick">';
    if(cur) h += '<button class="lead" data-act="skill" data-mode="'+id+'" data-n="'+n+'" data-key="">'
      + '✕ Leave the slot empty</button>';
    for(const sk of legal){
      const sd = SKILLS[sk];
      const taken = eq.includes(sk) && eq[n-1] !== sk;
      h += '<button class="lead'+(eq[n-1]===sk?' on':'')+(taken?' dim':'')+'" data-act="skill" '
        + 'data-mode="'+id+'" data-n="'+n+'" data-key="'+sk+'">'
        + sd.icon+' '+sd.name
        + ' <span class="rar" style="color:var(--ink-dim)">'+(sd.where==='court'?'in court':'in the field')
        + (sd.cls ? ' · '+TROOPS[sd.cls].name : '')+'</span>'
        + '<span class="hmeta">'+sd.fx+(taken?' · already slotted':'')+'</span></button>';
    }
    h += '</div>';
  }
  return h;
}

/* One forgeable piece — used for both the Regalia and a hero's kit. */
function gearRow(S, who, slot, label, icon, fxText){
  const tier = who === 'lord' ? regaliaTier(S, slot) : wargearTier(S, who, slot);
  const maxed = tier >= GEAR_MAX;
  const blocked = gearBlockedBy(S, who, slot);
  const cost = maxed ? null : gearCost(tier);
  return '<div class="gearrow"><span class="tname">'+icon+' '+label+'</span>'
    + '<span class="gtier">'+(tier ? 'tier '+tier+'/'+GEAR_MAX : 'unforged')+'</span>'
    + '<span class="hmeta">'+(fxText || '')+'</span><span class="spacer"></span>'
    + (maxed
        ? '<span class="hmeta" style="color:var(--gold)">the finest work the Reach can do</span>'
        : '<span class="hmeta">'+costLabel(cost)+' · '+ftime(gearTime(tier))+'</span>'
          + '<button data-act="gear" data-mode="'+who+'" data-key="'+slot+'" '+(blocked?'disabled':'')
          + ' title="'+(blocked||'')+'">'+(tier ? 'Reforge to '+(tier+1) : 'Forge')+'</button>')
    + '</div>';
}

function renderRegalia(S){
  if((S.b.forge||0) < 1) return '';
  let h = '<section class="panel"><h2>The Lord’s Regalia <span style="letter-spacing:.05em">worn by you, not by any captain</span></h2>'
    + '<div class="stat-note">Forged from Steel and Runestone, never bought. No random stats — a tier-6 blade is a '
    + 'tier-6 blade for everyone, so there is nothing to reroll.</div>';
  if(S.gq) h += queueStrip(S, S.gq, '🔥 '+(S.gq.who==='lord' ? REGALIA[S.gq.slot].name
      : (HERO_POOL[S.gq.who] ? HERO_POOL[S.gq.who].name.split(',')[0] : '')+'’s '+WARGEAR[S.gq.slot].name.toLowerCase())
      +' → tier '+S.gq.to, 'finishGear', null);
  for(const [slot,d] of Object.entries(REGALIA))
    h += gearRow(S, 'lord', slot, d.name, d.icon, d.fx(regaliaTier(S, slot)) || 'nothing yet');
  return h + '</section>';
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

/* The store. Cosmetic only — the catalogue has no field for a stat, so there is
   nothing here for a rule to read. Prices are real and shown in real money; there
   is no gem layer to obscure them, which is the point. */
/* Settings. Deliberately only what belongs to this device: sound is a property of the
   room you are in, not of your hold, so none of it is saved with the game or synced.
   The two toggles are separate because they fail differently — effects are feedback you
   asked for by tapping, the bed is atmosphere you did not, and plenty of people want
   one without the other. */
function renderSettings(S){
  if(!settingsOpen) return '';
  const row = (act, on, label, note) =>
    '<button data-act="'+act+'" style="width:100%;text-align:left;margin-top:.5rem">'
    + (on ? '🔊 ' : '🔇 ') + label + ' — <b>' + (on ? 'on' : 'off') + '</b></button>'
    + '<p class="hmeta" style="margin:.15rem 0 .4rem">' + note + '</p>';
  return '<div class="overlay" data-act-bg="settings"><div class="card dsheet">'
    + '<h1 style="font-size:1.15rem">⚙ Settings</h1><div class="rule"></div>'
    + row('sfx', !sound.muted(), 'Sound effects',
          'Taps, hammers, drums, and the horn that sounds just before a raid lands.')
    + row('amb', sound.ambientOn(), 'Wind',
          'A bed under everything that thickens as the next wave closes in.')
    + row('labels', labelsShown(), 'Building names',
          'Names and levels over every building in the hold, so you can read it at a glance.')
    + '<p class="hmeta">Every sound is generated as it plays — there are no audio files to '
    + 'download, and nothing here is stored with your hold or sent to the server.</p>'
    + '<div class="rule"></div>'
    + '<button class="primary" data-act="settings" style="margin-top:.5rem">Back to the walls</button>'
    + '</div></div>';
}

function renderStore(S){
  if(!storeOpen) return '';
  const ch = charted(S.isle || {cells:[]}), ml = masteryLvl(S);
  let h = '<div class="overlay" data-act-bg="storeClose"><div class="card codex">'
    + '<h1 style="font-size:1.3rem">THE STORE</h1><div class="rule"></div>'
    + '<p class="sub">Everything here is visible to other people and changes no number. '
    + 'If deleting a purchase would alter any battle, it is not sold.</p>';

  for(const [kind, meta] of Object.entries(COS_KINDS)){
    h += '<h3>'+meta.name+'s</h3><p class="d-row" style="opacity:.75">'+meta.blurb+'</p>';
    for(const [id, def] of itemsOf(kind)){
      const owned = isOwned(S, kind, id, ch, ml);
      const worn = (S.cos && S.cos[kind]) === id;
      const earn = def.earn ? EARN[def.earn] : null;
      h += '<div class="gearrow"><span class="tname">'
        + (def.icon ? def.icon+' ' : '')+def.name+'</span>'
        + '<span class="hmeta">'+(def.blurb || '')+'</span><span class="spacer"></span>'
        + (earn ? '<span class="gtier">'+(owned ? 'earned' : esc(earn.need))+'</span>'
                : def.price ? '<span class="gtier">$'+def.price.toFixed(2)+'</span>' : '')
        + (owned
            ? '<button data-act="equipCos" data-mode="'+kind+'" data-key="'+id+'" '+(worn?'disabled':'')+'>'
              + (worn ? 'worn' : 'Wear')+'</button>'
            : earn ? '' : '<button data-act="buyCos" data-mode="'+kind+'" data-key="'+id+'">Buy</button>')
        + '</div>';
    }
  }

  h += '<h3>Subscriptions</h3>';
  for(const sub of SUBSCRIPTIONS){
    h += '<div class="chron"><h3>'+sub.name+' — $'+sub.price.toFixed(2)+' / '+sub.per+'</h3>'
      + '<ul>'+sub.lines.map(l => '<li>'+l+'</li>').join('')+'</ul></div>';
  }
  h += '<p class="d-warn" style="margin-top:.6rem">Checkout is not connected. Prices and items are final, '
    + 'but taking money needs a payment provider (Stripe, or the app stores) wired to a real account — '
    + 'so <b>Buy</b> explains what is missing rather than pretending to charge you.</p>'
    + '<button class="primary" data-act="storeClose" style="margin-top:.6rem">Close</button>'
    + '</div></div>';
  return h;
}

/* The Salt Isle. A fogged grid you learn by landing on it — so the panel's job is
   to show how little you know, and make the one ship you have feel like a choice. */
function renderIsle(S){
  if(!isleReady(S)){
    if(S.b.townhall < ISLE_TH - 3) return '';   // don't tease it from a great distance
    return '<section class="panel"><h2>The Salt Isle <span style="letter-spacing:.05em">out of reach</span></h2>'
      + '<div class="stat-note">There are charts in the Great Library of an island off the coast — wrecks, barrows, '
      + 'and a metal the mainland has never smelted. A hold of <b>Town Hall '+ISLE_TH+'</b> could victual a ship for it. '
      + 'Yours is '+S.b.townhall+'.</div></section>';
  }
  const isle = S.isle;
  if(!isle) return '';
  const v = isle.voyage, now = Date.now();
  const cost = rationCost(S), have = Math.floor(S.res.rations || 0);
  let h = '<section class="panel"><h2>The Salt Isle <span style="letter-spacing:.05em">'
    + charted(isle)+'% charted · '+(isle.sailed||0)+' landings this season</span></h2>';

  if(v){
    const c = cellAt(isle, v.x, v.y), d = ISLE_SITES[c.site];
    const n = Object.values(v.troops).reduce((a,b)=>a+b,0);
    h += '<div class="stat-note">⛵ At sea — '+n+' aboard, bound for '+d.icon+' <b>'+d.name+'</b>. '
      + 'Home in <b>'+ftime(v.end-now)+'</b>. There is no recalling a ship.</div>';
  }else{
    h += '<div class="stat-note">One ship, one voyage at a time — however many columns you can field on the '
      + 'mainland. A crossing takes <b>'+ftime(voyageTime(S))+'</b> and costs <b>'+cost+' 🥘 Rations</b>'
      + (have < cost ? ' <span style="color:var(--bad)">(you have '+have+')</span>' : ' (you have '+have+')')
      + '. Nothing on the Isle regrows; it is redrawn when the season turns.</div>';
  }

  // the chart itself
  h += '<div class="islegrid">';
  for(let y = 0; y < ISLE_H; y++) for(let x = 0; x < ISLE_W; x++){
    const c = cellAt(isle, x, y);
    const sailing = v && v.x === x && v.y === y;
    if(!c.known){
      h += '<div class="isle fog" title="uncharted">·</div>';
    }else{
      const d = ISLE_SITES[c.site];
      h += '<button class="isle'+(c.spent?' spent':'')+(sailing?' sailing':'')+'"'
        + ' data-act="detail" data-dtype="isle" data-key="'+x+','+y+'"'
        + ' title="'+esc(d.name+' '+TIERS[c.tier-1]+(c.spent?' — stripped':''))+'">'
        + d.icon+'<span class="t">'+'I'.repeat(c.tier)+'</span></button>';
    }
  }
  h += '</div>';
  const left = isle.cells.filter(c => c.known && !c.spent).length;
  h += '<div class="stat-note">'+left+' charted site'+(left===1?'':'s')+' still worth landing on. '
    + 'Isle Ore is the only thing the Truegold Crucible will eat, and the only place it comes from is here.</div>';
  return h + '</section>';
}

/* The Rift — realm against realm. A scoreboard, never a conquest. */
function renderRift(S){
  if(!net.isOnline()) return '';
  const d = net.realmData();
  const r = d && d.rift;
  if(!r) return '';
  const me = r.mine, them = r.theirs;
  let h = '<section class="panel"><h2>The Rift <span style="letter-spacing:.05em">'
    + (r.live ? 'open — closes in '+ftime(r.endsIn)
       : them ? 'sealed' : 'no neighbouring reach yet')+'</span></h2>';

  if(!them){
    h += '<div class="stat-note">Yours is the only reach so far — <b>'+me.name+'</b>, '+me.holds
      + ' hold'+(me.holds===1?'':'s')+'. When it fills, another opens beside it, and every '+r.every
      + ' seasons the Rift bridges the two.</div>';
    return h + '</section>';
  }

  const total = Math.max(1, me.score + them.score);
  h += '<div class="riftrow">'
    + '<span class="side mine">'+me.name+'<b>'+fmt(me.score)+'</b></span>'
    + '<span class="side them">'+them.name+'<b>'+fmt(them.score)+'</b></span></div>'
    + '<div class="riftbar"><i style="width:'+Math.round(100*me.score/total)+'%"></i></div>';

  if(r.live){
    h += '<div class="stat-note">The Arena reaches across: their holds are in your bracket, and beating one scores <b>+'
      + r.points.arena+'</b>. Breaking a Great Host scores <b>+'+r.points.host
      + '</b>. Contested ground pays <b>+'+r.points.hold+'</b> a minute while you hold it.</div>'
      + '<div class="stat-note" style="color:var(--gold)">Nothing is ever taken across a Rift — not stores, not troops, '
      + 'not ground you keep. The loser keeps everything it built. A Rift decides a title, not a fate.</div>';
  }else{
    h += '<div class="stat-note">Sealed. It opens every '+r.every+' seasons'
      + (r.nextIn ? ' — next in '+r.nextIn+' season'+(r.nextIn===1?'':'s') : '')+'.</div>';
  }
  for(const past of (r.history||[]))
    h += '<div class="trow"><span>🌌</span><span class="tname">Season '+past.season+'</span>'
      + '<span class="spacer"></span><span class="tmeta">'
      + (past.winner ? (past.winner === me.id ? 'your reach took it' : 'theirs took it') : 'nothing decided')+'</span></div>';
  return h + '</section>';
}

/* Rallies: the synchronous ritual. One member calls, the muster window opens,
   everyone commits a real column, and it goes as one attack. */
function renderRally(S){
  if(!net.isOnline()) return '';
  const d = net.realmData();
  if(!d || !d.hosts) return '';
  const r = d.rally;
  const me = net.accountName();
  let h = '<section class="panel"><h2>The Horn <span style="letter-spacing:.05em">'
    + (r ? 'mustering — '+ftime(r.launchesIn) : 'no rally called')+'</span></h2>';

  if(!r){
    h += '<div class="stat-note">A Great Host is past what one hold can meet. Call a rally, and your alliance '
      + 'has '+ftime(d.musterMs || 300000)+' to commit columns before it rides. Troops in a rally cannot defend your wall — '
      + 'and they come home wounded, never dead.</div>';
    if((S.rallyReady||0) > Date.now())
      h += '<div class="stat-note">Your hold is still recovering — '+ftime(S.rallyReady-Date.now())+'.</div>';
    for(const host of d.hosts)
      h += '<div class="trow"><span>'+host.icon+'</span><span class="tname">'+host.name+'</span>'
        + '<span class="tmeta">'+host.blurb+'</span><span class="spacer"></span>'
        + '<span class="count">'+fmt(host.power)+'</span>'
        + '<button data-act="rallyCall" data-key="'+host.id+'" '
        + (((S.rallyReady||0) > Date.now())?'disabled':'')+'>Sound the horn</button></div>';
    return h + '</section>';
  }

  const pct = Math.min(100, 100*r.committed/Math.max(1,r.power));
  const mine = r.joins.find(j => j.name === me);
  h += '<div class="stat-note">'+r.icon+' <b>'+r.name+'</b> — '+r.blurb+'<br>'
    + '<b>'+fmt(r.committed)+' / '+fmt(r.power)+'</b> mustered · called by '+r.caller+'</div>'
    + '<div class="bar'+(r.committed>=r.power?'':' threat-fill')+'" style="margin:.2rem 0 .5rem"><i style="width:'+pct+'%"></i></div>';
  for(const j of r.joins)
    h += '<div class="trow'+(j.name===me?' mine':'')+'"><span class="tname">'+j.name+'</span>'
      + '<span class="tmeta">'+Object.values(j.troops).reduce((a,b)=>a+b,0)+' troops</span>'
      + '<span class="spacer"></span><span class="count">'+fmt(j.power)+'</span></div>';
  if(mine){
    h += '<div class="stat-note">Your column has ridden out. It comes home when the rally resolves.</div>';
  }else{
    h += renderColumnComposer(S);
    const fit = fitColumn(S, marchWant, marchParty);
    h += '<button class="primary" data-act="rallyJoin" '+columnAttrs()+(fit.total?'':' disabled')+'>'
      + (fit.total ? '🏹 Commit '+fit.total+' troops' : 'Choose troops to commit')+'</button>';
  }
  if(r.caller === me && r.joins.length)
    h += '<button data-act="rallyLaunch" style="margin-top:.4rem">Send it now, without waiting</button>';
  h += '<p style="font-size:.68rem;font-family:var(--sans);color:var(--ink-dim);margin-top:.45rem">'
    + 'Rallies only ever face the Unpaid. Organising an attack on another player would make farming efficient, '
    + 'and nothing here is allowed to do that.</p>';
  return h + '</section>';
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

/* The roster's roadmap: who has arrived, who is still riding. Shown in full and
   up front — a season's cast is never a mystery box you pay to open. */
function renderSeasonCast(S, now){
  const cur = seasonNo(now);
  const arcs = Object.keys(SEASON_ARCS).map(Number).filter(n => n > 0).sort((a,b)=>a-b);
  let h = '<div class="stat-note" style="margin-top:.7rem">The roster — heroes arrive by season and never leave</div>';
  for(const n of arcs){
    const arc = SEASON_ARCS[n];
    const cast = Object.entries(HERO_POOL).filter(([,d]) => (d.season||0) === n);
    if(!cast.length) continue;
    const here = n <= cur;
    h += '<div class="trow'+(n===cur?' mine':'')+'" title="'+esc(arc.blurb)+'"><span>'+(here?'✓':'🕓')+'</span>'
      + '<span class="tname">Season '+n+' · '+arc.name+'</span>'
      + '<span class="tmeta">'+cast.map(([k,d]) => d.icon+' '+d.name.split(',')[0]
          + (S.heroes[k] ? '' : '')).join(' · ')+'</span>'
      + '<span class="spacer"></span>'
      + '<span class="tmeta">'+(here ? cast.filter(([k])=>S.heroes[k]).length+'/'+cast.length+' drafted'
                                     : 'in '+ftime((n - cur) * SEASON_MS - (SEASON_MS - seasonEndsIn(now))))+'</span></div>';
  }
  /* The tempers ahead — the point of showing them is that you can prepare.
     Nothing here is a surprise and nothing here is sold. */
  h += '<div class="stat-note" style="margin-top:.7rem">What the Unpaid will muster — plan your drilling</div>';
  for(let i = 0; i < 4; i++){
    const n = cur + i, t = TEMPERS[(n - 1) % TEMPERS.length];
    const fav = t.favours ? TROOPS[t.favours] : null;
    h += '<div class="trow'+(i===0?' mine':'')+'"><span>'+t.icon+'</span>'
      + '<span class="tname">'+(i===0?'now':'Season '+n)+' · '+t.name+'</span>'
      + '<span class="tmeta">'+t.blurb+'</span><span class="spacer"></span>'
      + '<span class="tmeta">'+(fav ? 'favours '+fav.icon+' '+fav.plural : 'no favourite')
      + (i ? ' · in '+ftime((n - cur) * SEASON_MS - (SEASON_MS - seasonEndsIn(now))) : '')+'</span></div>';
  }

  const founding = Object.entries(HERO_POOL).filter(([,d]) => !d.season);
  h += '<div class="stat-note">Season 0 · The Founding — '
    + founding.filter(([k])=>S.heroes[k]).length+'/'+founding.length+' drafted. '
    + 'New arrivals are never stronger than these; a season widens the cast, it does not raise the ceiling.</div>';
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
  h += renderSeasonCast(S, now);
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

/* ── raids: hold against hold ──
   The system Whiteout Survival monetizes hardest, so the panel states the four rules
   that keep it out of their territory. Not as marketing — a player who does not KNOW
   their troops cannot die will play as if they can, which is the fear the whole funnel
   is built on. Removing the fear only works if you also remove the doubt. */
function renderRaid(S){
  if(!net.isOnline()) return '';
  const r = net.raidData();
  if(!r) return '';
  let h = '<section class="panel"><h2>Raids'
    + ' <span style="letter-spacing:.05em">'+fmt(r.me.power)+' at your wall</span></h2>';

  h += '<div class="stat-note">Hold against hold, and four rules that never change. '
    + '<b>Your wall is survivable; your ambition is not</b> — soldiers defending your own hold are '
    + 'only ever wounded, however small your Infirmary, but soldiers you send out can die, and a '
    + 'broken assault buries most of the column. '
    + '<b>Only '+r.lootable.join(', ')+' can be taken</b>, and only the share your Warehouse leaves exposed. '
    + '<b>A column carries what it can carry.</b> And <b>losing buys peace free</b> — a beaten hold '
    + 'gets a Writ and '+ftime(r.graceMs)+' of grace, automatically. Targets are bracketed by power, '
    + 'so nobody can farm a smaller hold.</div>';

  if(r.me.graceIn > 0)
    h += '<div class="stat-note" style="color:var(--good)">You are under grace for '
      + ftime(r.me.graceIn)+' — no one may strike you.</div>';
  else if(r.me.shieldIn > 0)
    h += '<div class="stat-note" style="color:var(--good)">A Writ of Peace covers you for '+ftime(r.me.shieldIn)+'.</div>';

  for(const i of r.incoming)
    h += '<div class="d-warn">🔭 A column under '+esc(i.from)+'&#39;s banner is on the road — '
      + ftime(i.arriveIn)+' out.</div>';
  for(const o of r.outgoing)
    h += '<div class="trow mine"><span class="tname">Your column at '+esc(o.to)+'</span>'
      + '<span class="tmeta">'+(o.resolved ? 'riding home' : 'on the road')+'</span>'
      + '<span class="spacer"></span><span class="count">'
      + ftime(o.resolved ? o.homeIn : o.arriveIn)+'</span></div>';

  if(r.lastRaid){
    const l = r.lastRaid;
    h += '<div class="stat-note">Last raid — '+(l.won ? 'you broke ' : 'you were held by ')
      + esc(l.against)+' ('+fmt(l.mine)+' vs '+fmt(l.theirs)+')'
      + (l.won && Object.keys(l.loot||{}).length ? ', hauling '+Object.entries(l.loot).map(([k,v])=>fmt(v)+' '+k).join(', ') : '')
      + '. '+(l.dead||0)+' of yours fell and '+l.hurt+' came home wounded; '+l.theirHurt+' of theirs wounded.'
      + (l.theirWatchers ? ' '+l.theirWatchers+' allied column'+(l.theirWatchers===1?'':'s')+' stood with them.' : '')
      + (Math.abs(l.edge||0) > 0.03
          ? ' <b style="color:var(--'+(l.edge>0?'good':'bad')+')">The matchup was '
            + (l.edge>0?'yours':'theirs')+' by '+Math.round(Math.abs(l.edge)*100)+'%</b> — pikes stop cavalry, '
            + 'cavalry runs down archers, archers shoot the slow line.' : '')+'</div>';
  }
  if(r.lastDefence){
    const d = r.lastDefence;
    h += '<div class="stat-note">Last assault on you — '+esc(d.from)+' '+(d.held ? 'was thrown back' : 'broke through')
      + ' ('+fmt(d.mine)+' vs '+fmt(d.theirs)+'). '+d.hurt+' of yours wounded, none lost'
      + ((d.theirDead||0) ? ' — and '+d.theirDead+' of theirs will not be going home' : '')+'.'
      + (d.lifted ? ' The Watch at your wall lifted your whole line.' : '')
      + (Math.abs(d.edge||0) > 0.03
          ? ' <b style="color:var(--'+(d.edge>0?'good':'bad')+')">Your line '+(d.edge>0?'answered':'suited')
            + ' theirs by '+Math.round(Math.abs(d.edge)*100)+'%.</b>' : '')+'</div>';
  }

  if(r.me.cooldownIn > 0)
    h += '<div class="stat-note">Your marshals regroup for '+ftime(r.me.cooldownIn)+'.</div>';

  if(!r.targets.length)
    h += '<div class="stat-note">No hold in your reach is inside your bracket. That is the bracket '
      + 'working: it will not offer you someone you could only bully.</div>';
  else {
    h += '<p class="d-row" style="margin-top:.5rem">In your bracket</p>';
    for(const t of r.targets)
      h += '<div class="trow"><span class="tname">'+esc(t.name)+'</span>'
        + '<span class="tmeta">TH'+t.townhall+' · '+fmt(t.power)
        + (t.watchers ? ' · '+t.watchers+' allied column'+(t.watchers===1?'':'s')+' standing' : '')
        + (t.shielded ? ' · under a Writ' : '')+'</span><span class="spacer"></span>'
        + '<button data-act="raidPick" data-key="'+esc(t.name)+'" '
        + (t.shielded || r.me.cooldownIn > 0 || r.outgoing.length ? 'disabled' : '')+'>'
        + (t.shielded ? 'protected' : 'Raid')+'</button></div>';
    if(raidTarget){
      const fit = fitColumn(S, marchWant, marchParty);
      h += '<div class="stat-note">Riding against <b>'+esc(raidTarget)+'</b> — '+ftime(r.travelMs)
        + ' each way, and they cannot defend your own wall while away.</div>'
        + renderColumnComposer(S)
        + '<button class="primary" data-act="raidSend" data-key="'+esc(raidTarget)+'" '
        + columnAttrs()+(fit.total?'':' disabled')+'>'
        + (fit.total ? '⚔️ Send '+fit.total+' against '+esc(raidTarget) : 'Choose troops')+'</button>';
    }
  }
  return h + '</section>';
}

/* ── the Watch ──
   Troops standing at an ally's wall. The rule worth having is the one Whiteout
   Survival uses: everything at a wall fights under the BEST captain present, so a
   strong hold standing over a weak one lifts that hold's own soldiers too. That is
   stated in the panel, because a mechanic nobody can see is a mechanic nobody uses —
   which is the lesson the march-coverage work taught. */
function renderWatch(S){
  if(!net.isOnline()) return '';
  const w = net.watchData();
  if(!w) return '';
  if(!w.allies.length && !w.here.length && !w.watching.length)
    return '<section class="panel"><h2>The Watch</h2>'
      + '<div class="stat-note">Send troops to stand at an ally&#39;s wall and they defend it as if '
      + 'they were yours. Everything at a wall fights under the best captain there — so standing over '
      + 'a smaller hold lifts <i>their</i> soldiers to your numbers, not just adds yours. '
      + 'You need an alliance with someone else in it.</div></section>';

  let h = '<section class="panel"><h2>The Watch'
    + (w.hosting ? ' <span style="letter-spacing:.05em">'+w.hosting+'/'+w.cap+' at your wall</span>' : '')
    + '</h2>';

  if(w.here.length){
    if(w.lifted)
      h += '<div class="stat-note" style="color:var(--good)">Your wall fights under a better captain than your own — '
        + 'every soldier here, yours included, is at ×'+w.mult.toFixed(2)+' instead of ×'+w.ownMult.toFixed(2)+'.</div>';
    for(const g of w.here)
      h += '<div class="trow"><span class="tname">🕯️ '+esc(g.from)+'</span>'
        + '<span class="tmeta">'+fmt(g.count)+' troops · ×'+(g.mult||1).toFixed(2)+'</span>'
        + '<span class="spacer"></span><span class="count">'+ftime(g.endsIn)+'</span></div>';
  }
  for(const m of w.watching)
    h += '<div class="trow mine"><span class="tname">Your Watch at '+esc(m.to)+'</span>'
      + '<span class="tmeta">'+fmt(m.count)+' troops</span><span class="spacer"></span>'
      + '<span class="count">'+ftime(m.endsIn)+'</span>'
      + '<button data-act="watchRecall" data-key="'+esc(m.to)+'">Recall</button></div>';

  if(w.allies.length){
    h += '<p class="d-row" style="margin-top:.5rem">Stand over an ally'
      + ' <span class="hmeta">— weakest first, since that is where a Watch is worth most</span></p>';
    for(const a of w.allies)
      h += '<div class="trow"><span class="tname">'+esc(a.name)+'</span>'
        + '<span class="tmeta">TH'+a.townhall+' · '+fmt(a.power)+(a.weaker?' · weaker than you':'')+'</span>'
        + '<span class="spacer"></span>'
        + '<button data-act="watchPick" data-key="'+esc(a.name)+'" '
        + (a.hosting >= a.cap ? 'disabled' : '')+'>'+(a.hosting >= a.cap ? 'wall full' : 'Send')+'</button></div>';
    if(watchTarget){
      const fit = fitColumn(S, marchWant, marchParty);
      h += '<div class="stat-note">Standing watch over <b>'+esc(watchTarget)+'</b> for '
        + ftime(w.windowMs)+'. They cannot defend your own wall while away, and they come home '
        + 'wounded rather than dead.</div>'
        + renderColumnComposer(S)
        + '<button class="primary" data-act="watchSend" data-key="'+esc(watchTarget)+'" '
        + columnAttrs()+(fit.total?'':' disabled')+'>'
        + (fit.total ? '🕯️ Send '+fit.total+' to stand watch' : 'Choose troops')+'</button>';
    }
  }
  return h + '</section>';
}

/* ── the Muster Roll ──
   Every other alliance feature in this game is reactive: help a build someone
   started, strike the boss someone called, join a rally someone blew the horn for.
   The Roll is the one thing that gives an alliance a standing goal on a quiet day.

   Deliberately unlike Whiteout Survival's version in three ways, all visible here:
   everyone who scores is paid rather than the top five; no task is a purchase; and
   rerolling your own work is free, on a cooldown, rather than an officer privilege. */
function renderMusterRoll(S){
  if(!net.isOnline()) return '';
  const m = net.musterData();
  if(!m) return '';
  if(!m.open)
    return '<section class="panel"><h2>The Muster Roll</h2>'
      + '<div class="stat-note">The Roll needs at least '+m.needMembers+' holds in the alliance. '
      + 'Shared work wants someone to share it with.</div></section>';

  const t = m.task, pctDone = Math.round(100 * t.have / Math.max(1, t.need));
  let h = '<section class="panel"><h2>The Muster Roll'
    + ' <span style="letter-spacing:.05em">'+m.division.icon+' '+m.division.name+' · '+ftime(m.endsIn)+' left</span></h2>';

  h += '<div class="mroll'+(t.done ? ' done' : '')+'">'
    + '<div class="mhead"><span class="micon">'+(t.icon||'📜')+'</span>'
    + '<span class="mname">'+esc(t.name||'Work')+'</span>'
    + '<span class="mweight w-'+t.weight+'">'+t.weightName+' · '+t.points+' pts</span></div>'
    + '<div class="mbar'+(t.done?' full':'')+'"><i style="width:'+pctDone+'%"></i></div>'
    + '<div class="mrow"><span class="hmeta">'+t.have+' / '+t.need+' '+esc(t.unit||'')+'</span>'
    + '<span class="spacer"></span>'
    + '<button data-act="musterReroll" '+(m.canReroll?'':'disabled')+'>'
    + (m.canReroll ? 'Different work' : 'Redrawing ' + ftime(m.rerollIn)) + '</button>'
    + '<button class="primary" data-act="musterClaim" '+(t.done?'':'disabled')+'>'
    + (t.done ? 'Report it done' : 'Not yet') + '</button></div></div>';

  h += '<div class="d-row" style="margin-top:.5rem">Your effort <b>'+m.mine.points+'</b>'
    + ' <span class="hmeta">from '+m.mine.done+' task'+(m.mine.done===1?'':'s')
    + ' · the alliance has <b>'+fmt(m.total)+'</b></span></div>';
  if(m.projected)
    h += '<div class="stat-note">If the Roll closed now you would be paid <b>'
      + m.projected.valor+'</b> Valor, <b>'+m.projected.mastery+'</b> Mastery and <b>'
      + m.projected.steel+'</b> steel — a ×'+m.projected.together.toFixed(2)
      + ' share because of what the others did. Everyone who scores is paid; there is no top-five cut.</div>';

  if((m.board||[]).length){
    h += '<p class="d-row" style="margin-top:.5rem">The roll</p>';
    const me = net.accountName();
    for(const r of m.board.slice(0, 12))
      h += '<div class="trow'+(r.name===me?' mine':'')+'"><span class="tname">'+esc(r.name)+'</span>'
        + '<span class="tmeta">'+r.done+' done</span><span class="spacer"></span>'
        + '<span class="count">'+fmt(r.points)+'</span></div>';
  }
  if(m.last)
    h += '<div class="stat-note">Last Roll: '+fmt(m.last.total)+' points, '+esc(m.last.division)
      + ', '+m.last.paid+' hold'+(m.last.paid===1?'':'s')+' paid.</div>';
  return h + '</section>';
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

/* The five who ride with a sortie — and who answer one while you sleep. */
function renderArenaFive(S){
  const own = Object.keys(S.heroes).filter(k => HERO_POOL[k]);
  if(!own.length) return '';
  const five = S.arenaTeam || [];
  let h = '<div class="stat-note" style="margin-top:.5rem">Your arena five '
    + '<b>'+five.length+'/'+ARENA_HEROES+'</b> — their class affinity lifts the troops you commit, '
    + 'attacking <i>and</i> defending. They are not away; a sortie is over in a minute.</div>'
    + '<div class="fiverow">';
  for(const k of own){
    const d = HERO_POOL[k], on = five.includes(k), away = heroAway(S, k);
    const full = five.length >= ARENA_HEROES && !on;
    h += '<button class="five'+(on?' on':'')+((full||away)?' dim':'')+'" data-act="arenaTeam" data-key="'+k+'"'
      + ((full||away)?' disabled':'')+'>'+(on?'✓':'')+d.icon+' '+TROOPS[d.cls].icon
      + '<span class="hmeta">'+d.name.split(',')[0]+(away?' · away':'')+'</span></button>';
  }
  return h + '</div>';
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
  h += renderArenaFive(S);

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
    + '<button data-act="lore">📜 Annals — the story of the Reach</button>'
    + '<button data-act="store">🛍 Store — cosmetics only</button>'
    + '<button data-act="settings">'+(sound.muted() ? '🔇' : '🔊')+' Settings</button>'
    + '<button data-act="about">About</button>'
    + '<button data-act="reset"'+(armed?' style="color:var(--bad);border-color:var(--bad)"':'')+'>'
    + (armed?'⚠ Tap again to raze EVERYTHING':'Raze &amp; restart')+'</button></footer>';
}

let codexOpen = false, loreOpen = false, storeOpen = false, settingsOpen = false;
let resetArmedUntil = 0; // two-tap raze confirmation window
let arenaStance = 'balanced', arenaFrac = 0.5;
let listView = false, sceneMounted = false;
const sceneCanvas = document.createElement('canvas');
sceneCanvas.id = 'holdscene';
let detail = null; // {type:'building'|'troop'|'hero', key} — the tap-to-inspect sheet
// the column being assembled: up to three leaders and a count per troop type
let marchParty = [];
let watchTarget = null;
let raidTarget = null;    // which hold the raid composer is aimed at   // which ally the Watch composer is aimed at
let marchWant = {};
function esc(s){ return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]); }

function heroesOpen(S){ return Object.keys(HERO_POOL).filter(k => heroSeasonOpen(S,k)).length; }

/* The column being assembled, carried across renders so taps accumulate. */
function columnAttrs(){
  return 'data-heroes="'+marchParty.join(',')+'" '
    + Object.keys(TROOPS).map(k => 'data-t_'+k+'="'+(marchWant[k]||0)+'"').join(' ');
}
function marchTotal(){ return Object.keys(TROOPS).reduce((a,k)=>a+(marchWant[k]||0), 0); }

/* Formations name themselves — a text prompt is blocked in sandboxed frames and
   a keyboard is the wrong thing to raise on a phone mid-march. */
function formName(S){
  const lead = marchParty[0] && HERO_POOL[marchParty[0]];
  const biggest = Object.keys(TROOPS)
    .filter(k => marchWant[k] > 0)
    .sort((a,b) => marchWant[b] - marchWant[a])[0];
  const what = biggest ? TROOPS[biggest].plural.toLowerCase() : 'column';
  return lead ? lead.name.split(',')[0]+"'s "+what
              : what.charAt(0).toUpperCase()+what.slice(1);
}

/* ── coverage: three captains against four kinds of soldier ──
   Four troop types and three seats at the head of a column is a deliberate
   shortfall — it is the whole reason class affinity is a decision rather than a
   formality. But the shortfall was invisible: nothing in the march builder said
   which classes had a captain, so it read as a missing feature instead of a
   choice. These helpers exist to put the number on screen.

   The figure itself comes from logic.js — the SAME classLift() that marchPower
   and the arena fight with, so the label cannot drift from the maths. */
function coveredBy(S, party, k){
  return party.filter(id => HERO_POOL[id] && HERO_POOL[id].cls === k);
}
/* "spearmans" and "ballistas" were on screen until the smoke test printed the
   composer as flat text. Troop names now carry their own plural. */
function troopWord(k, n){
  const d = TROOPS[k];
  return (n === 1 ? d.name : d.plural).toLowerCase();
}
function pctLift(x){ return (x > 0 ? '+' : '') + (x*100).toFixed(x < 0.1 ? 1 : 0) + '%'; }
/* Which classes a saved formation covers — so a loadout reads as a build. */
function formCover(S, f){
  return Object.keys(TROOPS)
    .filter(k => (f.troops[k]||0) > 0 && coveredBy(S, f.heroes || [], k).length)
    .map(k => TROOPS[k].icon).join('');
}

/* Fill the column proportionally to what the hold owns, up to capacity. The old
   ¼ / ½ / all buttons, kept because most marches don't want fine-tuning. */
function fillColumn(S, frac){
  const want = {};
  for(const k of Object.keys(TROOPS)) want[k] = Math.floor((S.t[k]||0) * frac);
  const fit = fitColumn(S, want, marchParty);
  for(const k of Object.keys(TROOPS)) marchWant[k] = fit.troops[k] || 0;
}

/* Assemble a column: up to three leaders, then how many of each troop rides.
   Everything here is a tap — no dragging, no typing, no hover. */
function renderColumnComposer(S){
  const free = Object.keys(S.heroes).filter(k => HERO_POOL[k] && heroCanLead(S, k));
  marchParty = marchParty.filter(k => free.includes(k));      // someone may have ridden out
  const cap = marchCapacity(S, marchParty);
  const total = marchTotal();
  const over = false;   // capacity is judged on load now, computed below

  let h = '';

  // ── saved formations ──
  if((S.formations||[]).length){
    h += '<p class="d-row" style="margin-top:.6rem">Formations</p><div class="formrow">';
    for(const f of S.formations){
      const n = Object.values(f.troops).reduce((a,b)=>a+b,0);
      const cov = formCover(S, f);
      h += '<button class="form" data-act="formLoad" data-key="'+esc(f.name)+'">'+esc(f.name)
        + ' <span class="hmeta">'+f.heroes.length+' lead · '+n
        + (cov ? ' · '+cov+' led' : '')+'</span></button>';
    }
    h += '</div>';
  }

  // ── leaders ──
  h += '<p class="d-row" style="margin-top:.6rem">Leaders <b>'+marchParty.length+'/'+MARCH_HEROES+'</b>'
    + ' <span class="hmeta">— they set how many troops the column can hold</span></p>';
  if(!free.length)
    h += '<p class="d-warn">No hero is free to ride. A column can still go out alone, but it will be small.</p>';
  else{
    h += '<div class="leadpick">';
    for(const k of free){
      const d = HERO_POOL[k], hero = S.heroes[k];
      const on = marchParty.includes(k);
      const seated = (S.court||[]).includes(k);
      const full = marchParty.length >= MARCH_HEROES && !on;
      const eff = effLvl(S, k), st = hero.stars||0;
      h += '<button class="lead'+(on?' on':'')+(full?' dim':'')+'" data-act="pickLead" data-key="'+k+'">'
        + (on?'✓ ':'')+d.icon+' '+d.name.split(',')[0]
        + (st ? ' <span class="stars">'+starStr(st)+'</span>' : '')
        + ' <span class="rar rar-'+d.rarity+'">'+TROOPS[d.cls].icon+' '+TROOPS[d.cls].name+'</span>'
        + '<span class="hmeta">L'+hero.lvl+(st?'+'+st+'✦':'')+' · '+LEAD_FX[d.lead.key](eff)
        + ' · '+pctLift(classLift(S, [k], d.cls))+' to '+TROOPS[d.cls].plural.toLowerCase()
        + ' · +'+(CAP_PER_HERO + CAP_PER_LEVEL*eff)+' capacity'
        + (seated ? ' · leaves the court' : '')+'</span></button>';
    }
    h += '</div>';
  }

  // ── who covers what ──
  const kinds = Object.keys(TROOPS);
  const lift = {}; for(const k of kinds) lift[k] = classLift(S, marchParty, k);
  const covered = kinds.filter(k => lift[k] > 0).length;
  h += '<p class="d-row" style="margin-top:.6rem">Captains cover <b'
    + (covered ? '' : ' style="color:var(--ink-dim)"')+'>'+covered+'/'+kinds.length+'</b>'
    + ' <span class="hmeta">— '+MARCH_HEROES+' leaders, '+kinds.length+' kinds of soldier. '
    + 'Which ones you cover is the column\'s shape.</span></p>'
    + '<div class="affrow">';
  for(const k of kinds){
    const by = coveredBy(S, marchParty, k), sent = marchWant[k]||0;
    h += '<div class="aff'+(lift[k]>0?' on':'')+(sent && lift[k]<=0?' bare':'')+'">'
      + '<span class="ai">'+TROOPS[k].icon+'</span>'
      + '<b>'+(lift[k]>0 ? pctLift(lift[k]) : '—')+'</b>'
      + '<span class="hmeta">'+(by.length ? by.map(id => esc(HERO_POOL[id].name.split(',')[0].split(' ').pop())).join(', ')
                                          : 'no captain')+'</span></div>';
  }
  h += '</div>';

  // ── the column itself ──
  /* Capacity is LOAD, not headcount: a siege engine takes four soldiers' worth of a
     captain's attention. Both numbers are shown, because "82 troops" is what the player
     is sending and "225 / 225" is what fills the column. */
  const load = columnLoad(marchWant);
  const overLoad = load > cap;
  h += '<p class="d-row" style="margin-top:.6rem">Column <b'+(overLoad?' style="color:var(--bad)"':'')+'>'
    + Math.round(load)+' / '+cap+'</b> <span class="hmeta">load — '+total+' troops</span></p>'
    + '<div class="capbar'+(overLoad?' over':'')+'"><i style="width:'+Math.min(100, cap?100*load/cap:0)+'%"></i></div>';
  for(const [k,d] of Object.entries(TROOPS)){
    const owned = S.t[k]||0;
    if(!owned && !marchWant[k]) continue;
    const step = Math.max(1, Math.round(owned/10));
    h += '<div class="troopadj"><span class="tname">'+d.icon+' '+d.name+'</span>'
      + '<span class="hmeta">'+owned+' at home · '+(LOAD[k]||1)+(LOAD[k]>1?' load each':' load')
      + (lift[k] > 0 ? ' · <span class="led">'+pctLift(lift[k])+' led</span>'
                     : ((marchWant[k]||0) ? ' · <span class="unled">no captain</span>' : ''))
      + '</span><span class="spacer"></span>'
      + '<button data-act="troopAdj" data-key="'+k+'" data-n="-'+step+'" '+((marchWant[k]||0)<=0?'disabled':'')+'>−</button>'
      + '<span class="count">'+(marchWant[k]||0)+'</span>'
      + '<button data-act="troopAdj" data-key="'+k+'" data-n="'+step+'" '+((marchWant[k]||0)>=owned?'disabled':'')+'>+</button>'
      + '<button data-act="troopAdj" data-key="'+k+'" data-n="all">max</button></div>';
  }
  h += '<div class="fillrow">'
    + '<button data-act="fillCol" data-key="0.25">¼</button>'
    + '<button data-act="fillCol" data-key="0.5">½</button>'
    + '<button data-act="fillCol" data-key="1">Fill to capacity</button>'
    + '<button data-act="fillCol" data-key="0">Clear</button>'
    + '</div>';
  /* Whether the engines have anybody standing in front of them. Shown while building,
     because an invisible mechanic is an unused one — the lesson the captain-coverage
     strip taught. (Column pace lived here for one version; capacity-as-load does that
     job properly, so a second mechanic doing it badly was removed.) */
  if(total > 0){
    const cover = screenCover(marchWant);
    const engines = (marchWant.ballista||0) + (marchWant.knight||0);
    if(engines > 0)
      h += '<div class="paceline"><span class="'+(cover > 0.5 ? 'good' : cover < 0.2 ? 'bad' : '')+'">'
        + (cover > 0.5 ? '🛡️ Casters screened' : cover < 0.2 ? '⚠️ Casters unscreened' : '🛡️ Thin screen')
        + ' <span class="hmeta">— casualties fall on whoever is in front, and right now there is '
        + (cover < 0.2 ? 'nobody' : 'a line') + '</span></span></div>';
  }
  if(overLoad) h += '<p class="d-warn">Over capacity — the extra will stay home. Bring stronger captains, '
    + 'or fewer casters: a battlemage weighs '+LOAD.ballista+' where a spearman weighs 1.</p>';
  /* Stated as fact, not scolded. Riding uncovered is a legitimate call — you may
     want the bodies more than the bonus — so this reports the cost and stops. */
  const bare = kinds.filter(k => (marchWant[k]||0) > 0 && lift[k] <= 0);
  if(bare.length && marchParty.length)
    h += '<p class="d-row" style="color:var(--ink-dim)">'
      + bare.map(k => '<b>'+marchWant[k]+'</b> '+troopWord(k, marchWant[k])).join(' and ')
      + ' ride without a captain — no affinity. '
      + (bare.length < kinds.length ? 'Swap a leader, or leave them home and send more of what is led.' : '')+'</p>';
  return h;
}

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
        + '<p class="hmeta">A fixed price — it costs this whether you muster '+S.t[k]+' or none, and every '
        + d.plural.toLowerCase()+' you drill afterwards is already Tier '+TIERS[tier]+'.</p>'
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
    }else if(tileLocked(S, tile)){
      /* Stated as a requirement with a number, not a grey tile with no explanation.
         The deep frontier is the late game's ground; a player should be able to see
         what it is waiting for. */
      body += '<p class="d-warn">Beyond your reach. Working '+tt.name+' '+TIERS[tile.lvl-1]
        + ' needs <b>Town Hall '+tileReq(tile.lvl)+'</b> — yours is '+(S.b.townhall||0)+'.</p>'
        + '<p class="d-row" style="opacity:.8">The frontier opens as the hold rises: every two Town Hall '
        + 'levels reach one tier further out. Richer ground sits further from home, so it costs the ride as well.</p>';
      if(tt.kind==='gather')
        body += '<p class="d-delta">Would yield ~'+fmt(gatherYield(S,tile))+' '+tt.res+' a trip.</p>';
      else if(tt.kind==='camp')
        body += '<p class="d-delta">Held at ≈'+campPower(S,tile)+'.</p>';
    }else{
      body += '<p class="d-row">Distance '+tileDist(tile)+' — '+ftime(travel)+' each way.</p>';
      if(tt.kind==='gather')
        body += '<p class="d-delta">Yields ~'+fmt(gatherYield(S,tile))+' '+tt.res+' after '+ftime(GATHER_MS)+' of work.</p>';
      else if(tt.kind==='camp'){
        body += '<p class="d-delta">Camp strength ≈'+campPower(S,tile)+'. Victory: loot, Valor, Mastery — and the camp burns.</p>';
        if(tile.def)
          body += '<p class="d-row">Held by <b>'+TROOPS[tile.def].plural.toLowerCase()+'</b> '+TROOPS[tile.def].icon
            + ' — bring what beats them. <span class="hmeta">Pikes stop cavalry, cavalry runs down archers, '
            + 'archers shoot the slow line.</span></p>';
        body += '<p class="d-warn">Defeat costs a third of the marchers.</p>';
      }
      else
        body += '<p class="d-delta">Explorers return with Valor, Mastery, and a 20% chance of a Writ of Peace.</p>';
      const busy = tileBusy(S,k), full = S.marches.length >= marchSlots(S);
      if(busy) body += '<p class="d-warn">A march is already bound here.</p>';
      else if(full) body += '<p class="d-warn">All march slots are in use (Town Hall 10 grants a second).</p>';
      else{
        const fit = fitColumn(S, marchWant, marchParty);
        body += '<p class="d-row">Your home power is <b>'+armyPower(S)+'</b> — troops you send stop defending until they return.</p>'
          + renderColumnComposer(S);
        if(fit.total)
          // tell marchPower what it is facing, or Camp-Breaker would be missing
          // from the preview and present in the battle
          body += '<p class="d-delta">This column fights at <b>'
            + marchPower(S, fit.troops, marchParty, tt.kind==='camp' ? 'camp' : null, tile.def)+'</b>'
            + (tt.kind==='camp' ? ' against ≈'+campPower(S,tile) : '')+'.</p>';
        const none = fit.total === 0;
        body += '<div style="display:flex;gap:.5rem;margin-top:.5rem;flex-wrap:wrap">'
          + '<button class="primary" data-act="march" data-idx="'+k+'" '+columnAttrs()+(none?' disabled':'')+'>'
          + (none ? 'Choose troops to send' : '🚩 March — '+fit.total+' troops')+'</button>'
          + (none ? '' : '<button data-act="saveForm" data-key="'+esc(formName(S))+'" '+columnAttrs()+'>Save formation</button>')
          + '</div>';
        if(tt.kind === 'gather'){
          const haul = 1 + leadTotal(S, marchParty, 'haul') + (S.marchBoost ? 0.5 : 0);
          body += '<p class="d-delta" style="margin-top:.7rem">🌙 <b>Long haul</b>: work the node for '
            + ftime(LONG_HAUL_WORK)+' instead of '+ftime(GATHER_MS)+' and bring back <b>'
            + fmt(gatherYield(S,tile)*LONG_HAUL_YIELD*haul)+' '+tt.res+'</b> — the thing to set going before you close the game. '
            + 'Those troops defend nothing until dawn.</p>'
            + '<button class="primary" data-act="march" data-idx="'+k+'" data-long="1" '+columnAttrs()+(none?' disabled':'')
            + '>🌙 Send on the long haul</button>';
        }
      }
    }
  }

  else if(detail.type==='isle'){
    const [x, y] = String(k).split(',').map(Number);
    const c = S.isle && cellAt(S.isle, x, y);
    if(!c) return '';
    const d = ISLE_SITES[c.site];
    const blocked = voyageBlockedBy(S, x, y);
    const fit = fitColumn(S, marchWant, marchParty);
    title = d.icon+' '+d.name+' '+TIERS[c.tier-1];
    body += '<p class="d-row" style="font-style:italic;opacity:.8">'+d.blurb+'</p>';
    const oreLo = d.ore[0]*c.tier, oreHi = d.ore[1]*c.tier;
    body += '<p class="d-delta">Carries home <b>'+oreLo+'–'+oreHi+' 🪨 Isle Ore</b>'
      + (d.res ? ', plus '+Object.entries(d.res).map(([r,a]) =>
          fmt(Math.round(a*(0.6+0.4*c.tier)))+' '+r).join(' and ') : '')
      + (d.valor ? ', '+(d.valor*c.tier)+' Valor' : '')
      + (d.writ ? ', and a Writ of Peace' : '')+'.</p>';
    if(d.fight > 0)
      body += '<p class="d-warn">Held against you at ≈<b>'+fmt(Math.round(refPower(S)*d.fight*(0.7+0.3*c.tier)))
        + '</b>. Losses here wound, as everywhere the Unpaid are not involved.</p>';
    else
      body += '<p class="d-row" style="opacity:.75">Undefended — this one is work, not a fight.</p>';
    if(c.spent) body += '<p class="d-warn">Stripped. The Isle refills when the season turns.</p>';
    else if(blocked) body += '<p class="d-warn">'+blocked+'.</p>';
    else{
      body += renderColumnComposer(S);
      if(fit.total)
        body += '<p class="d-delta">Your party lands at <b>'+marchPower(S, fit.troops, marchParty, 'host')+'</b>.</p>';
      body += '<p class="d-row">The crossing takes <b>'+ftime(voyageTime(S))+'</b> and costs <b>'
        + rationCost(S)+' 🥘 Rations</b>. Landing charts the water around it.</p>'
        + '<button class="primary" data-act="voyage" data-x="'+x+'" data-y="'+y+'" '+columnAttrs()
        + (fit.total?'':' disabled')+'>'+(fit.total?'⛵ Sail — '+fit.total+' aboard':'Choose who sails')+'</button>';
    }
  }

  else if(detail.type==='beast'){
    const b = (S.world.beasts||[])[k]; if(!b) return '';
    const d = BEASTS[b.species];
    const fit = fitColumn(S, marchWant, marchParty);
    const mine = Math.round(marchPower(S, fit.troops, marchParty, 'beast') * (1 + petBonus(S,'hunt')));
    const enemy = beastPower(S, b);
    title = d.icon+' '+d.name+' '+TIERS[b.lvl-1];
    body += '<p class="d-row" style="font-style:italic;opacity:.8">'+d.blurb+'</p>'
      + '<p class="d-row">Distance '+tileDist(b)+' — '+ftime(tileDist(b)*TRAVEL_MS_PER_TILE*marchSpeed(S))+' each way. '
      + 'The herds move every '+ftime(BEAST_ROAM_MS)+', but one you are already hunting will stand.</p>'
      + '<p class="d-delta">Strength ≈<b>'+enemy+'</b>. Brings <b>'+(d.valor+4*b.lvl)+' Valor</b>, '
      + (d.mxp+8*b.lvl)+' Mastery, meat and hides — and <b>'+(d.pet*b.lvl)+' bond</b> toward your next companion.</p>'
      + '<p class="d-row" style="opacity:.75">A hunt only ever <b>wounds</b>. Nothing you send here dies.</p>';
    if(beastBusy(S,k)) body += '<p class="d-warn">A column is already out after this one.</p>';
    else if(S.marches.length >= marchSlots(S)) body += '<p class="d-warn">Every column is in the field.</p>';
    else{
      body += renderColumnComposer(S);
      if(fit.total)
        body += '<p class="d-delta">Your party hunts at <b'+(mine>=enemy?'':' style="color:var(--bad)"')+'>'+mine+'</b>'
          + ' against ≈'+enemy+(mine<enemy?' — they will be driven off':'')+'.</p>';
      body += '<button class="primary" data-act="hunt" data-idx="'+k+'" '+columnAttrs()
        + (fit.total?'':' disabled')+'>'+(fit.total?'🏹 Hunt — '+fit.total+' troops':'Choose troops to send')+'</button>';
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
      + '<p class="d-row">Their army leans on <b>'+(o.dominant ? TROOPS[o.dominant].plural : 'nothing in particular')+'</b>'
      + (answer ? ' — '+TROOPS[answer].plural+' are the answer, and your line is '
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
    const seated = (S.court||[]).includes(k), away = heroAway(S,k);
    const seats = courtSeats(S), full = (S.court||[]).length >= seats;
    const arc = SEASON_ARCS[d.season||0];
    const st = hero.stars||0, cap = heroStarCap(S), dNeed = starNeed(st);
    const eff = effLvl(S, k);
    const inFive = (S.arenaTeam||[]).includes(k);
    title = (isCapt?'★ ':'')+d.icon+' '+d.name;
    body += '<p class="d-fx"><span class="rar rar-'+d.rarity+'">'+RARITY[d.rarity].tag+'</span> · '
      + TROOPS[d.cls].icon+' '+TROOPS[d.cls].name+' captain · Level '+hero.lvl
      + (hero.lvl>=20?' (max)':' · '+fmt(hero.xp)+'/'+fmt(need)+' xp')+'</p>'
      + '<div class="xpbar"><i style="width:'+(hero.lvl>=20?100:Math.min(100,100*hero.xp/need))+'%"></i></div>'
      + '<p class="d-row"><b class="stars">'+(st?starStr(st):'—')+'</b> '+st+' of '+cap+' stars'
      + (st>=cap ? ' — <b>at this season’s ceiling; it rises with the next.</b>'
                 : ' · '+(hero.deeds||0)+'/'+dNeed+' deeds to the next')+'</p>'
      + (st>=cap ? '' : '<div class="xpbar"><i style="width:'+Math.min(100,100*(hero.deeds||0)/dNeed)+'%;background:var(--gold)"></i></div>')
      + '<p class="d-row" style="opacity:.75">Stars come from <b>fielding them</b> — every march led, camp burned and arena fought. '
      + 'Each is worth +'+Math.round(STAR_POWER*100)+'% of everything they do'
      + (st ? ', so they act as level <b>'+eff+'</b>' : '')+'.</p>'
      + (arc ? '<p class="d-row" style="opacity:.75">Came to the hold in Season '+(d.season||0)+' — '+arc.name+'</p>' : '')
      + '<p class="d-row">'+(seated?'<b style="color:var(--gold)">Seated.</b> ':'')+'In court: '+d.fx(eff)
      + (isCapt?' — <b style="color:var(--gold)">doubled as Captain</b>':'')+'</p>'
      + '<p class="d-row">'+(away?'<b style="color:var(--gold)">Riding out.</b> ':'')+'Leading a column: '+LEAD_FX[d.lead.key](eff)
      + ', and <b>+'+Math.round(CLASS_AFFINITY*eff*100)+'% to '+TROOPS[d.cls].name.toLowerCase()+'s</b> — the troops they know. '
      + 'Adds <b>'+(CAP_PER_HERO + CAP_PER_LEVEL*eff)+'</b> to what the column can hold.</p>'
      + '<p class="d-row">'+(inFive?'<b style="color:var(--gold)">In your arena five.</b> ':'')
      + 'In the arena their class affinity applies to the force you commit.</p>'
      + '<p class="d-row">Order — <b>'+d.order.name+'</b>: '+d.order.desc+' Cooldown '+d.order.cd+' waves.'+(cd>0?' Ready in '+cd+'.':'')+'</p>';
    // wargear: four pieces, each worth a quarter of an effective level
    if((S.b.forge||0) >= 1){
      const worn = wargearTotal(S, k), gl = gearLevels(S, k);
      body += '<p class="d-row" style="margin-top:.6rem"><b>Wargear</b> — '+worn+'/'+(GEAR_MAX*4)
        + ' tiers forged, worth <b>+'+gl+'</b> effective level'+(gl===1?'':'s')
        + ' (one per '+GEAR_PER_LEVEL+' tiers).</p>';
      for(const [slot,g] of Object.entries(WARGEAR))
        body += gearRow(S, k, slot, g.name, g.icon, '');
    }else{
      body += '<p class="d-row" style="opacity:.7;margin-top:.6rem">Wargear needs the Forge — Steel is what it eats.</p>';
    }
    body += renderSkills(S, k);
    if(away) body += '<p class="d-warn">They are out with a column and cannot take a chair until it comes home.</p>';
    else if(!seated && full) body += '<p class="d-warn">Every chair is taken ('+seats+'). Stand someone down, or raise the Tavern.</p>';
    body += '<div style="display:flex;gap:.6rem;margin-top:.5rem;flex-wrap:wrap">'
      + (away ? '' : '<button class="primary" data-act="seat" data-key="'+k+'" '+((!seated && full)?'disabled':'')
          + '>'+(seated?'Stand down from the court':'🪑 Seat in the court')+'</button>')
      + (seated ? '<button data-act="captain" data-key="'+k+'">'+(isCapt?'Relieve of command':'★ Appoint Captain')+'</button>' : '')
      + (away ? '' : '<button data-act="arenaTeam" data-key="'+k+'" '
          + ((!inFive && (S.arenaTeam||[]).length >= ARENA_HEROES)?'disabled':'')+'>'
          + (inFive?'Stand down from the five':'⚔ Add to the arena five')+'</button>')
      + '<button data-act="order" data-key="'+k+'" '+(cd>0?'disabled':'')+'>Use '+d.order.name+'</button>'
      + '</div>';
  }

  return '<div class="overlay" data-act-bg="detailClose"><div class="card dsheet">'
    + '<h1 style="font-size:1.15rem">'+title+'</h1><div class="rule"></div>'
    + body
    + '<button data-act="detailClose" style="margin-top:.8rem">Close</button>'
    + '</div></div>';
}

/* The Chronicle — the story, kept where it can be read at leisure rather than
   dribbled through tooltips. Every rule that makes this game unusual has a
   reason in here, which is the point of writing it at all. */
function renderLore(S){
  if(!loreOpen) return '';
  const cur = seasonNo(Date.now());
  let h = '<div class="overlay"><div class="card codex lorebook">'
    + '<h1 style="font-size:1.4rem">THE ANNALS OF THE REACH</h1><div class="rule"></div>';
  for(const e of CHRONICLE){
    h += '<article class="chron"><h3>'+e.title+'</h3>'
      + '<span class="when">'+e.when+'</span>'
      + e.body.trim().split(/\n\s*\n/).map(p => '<p>'+p.replace(/\s+/g,' ').trim()+'</p>').join('')
      + '</article>';
  }
  h += '<article class="chron"><h3>The seasons so far</h3><span class="when">The turning</span>';
  for(const [n, text] of Object.entries(SEASON_LORE)){
    const here = Number(n) <= cur;
    h += '<p class="'+(here?'':'unwritten')+'"><b>'+(here?'':'✎ ')+'Season '+n+' — '
      + (SEASON_ARCS[n] ? SEASON_ARCS[n].name : '')+'.</b> '
      + (here ? text.replace(/\s+/g,' ').trim() : 'Not yet written. The riders are still on the road.')+'</p>';
  }
  h += '</article>'
    + '<button class="primary" data-act="lore" style="margin-top:.6rem">Close the Annals</button>'
    + '</div></div>';
  return h;
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
    + '<li><b>Where troops actually die.</b> Holding your wall, burning camps and hunting beasts only ever <b>wound</b> — the game asks you to do those daily and should not make you weigh veterans against them. Permanent death is reserved for <b>marching on another player</b>, the one act that is genuinely your choice.</li>'
    + '<li><b>The Infirmary</b> holds the wounded (30 beds before you build one, far more after) and tending them costs resources and time, returning them whole. The one hard limit is beds: wounded past capacity die of their wounds — which is what makes the building matter and healing urgent. Nobody can buy a healing speedup here, so the bill is the cost.</li>'
    + '<li><b>The Command Center</b> grants another march every 5 levels (to 30) and speeds every column by 2% a level — a full one fields seven columns at once.</li>'
    + '<li><b>The Embassy</b> raises how many alliance helps your own builds may take (+2 a level), on top of what your alliance&#39;s Wide Roads research grants everyone.</li>'
    + '<li><b>Research lives in the Great Library</b> (Town Hall 4). Nothing can be studied without one, and <b>its level is the ceiling on every track</b> — a Library 7 means no study passes 7. Each level also speeds study by 2%. Research runs on its own queue and never competes with the build crews.</li>'
    + '<li><b>Refined goods</b>: the Forge (Town Hall 12) smelts iron and wood into <b>Steel</b> without pause; the Runeworks (Town Hall 22) binds stone and steel into <b>Runestone</b>. Their vaults are small — 10% and 3.5% of your raw storage.</li>'
    + '<li>From level '+15+' every upgrade also costs Steel; from level '+24+', Runestone too. That is what makes the last third of the game long — and why food, wood, stone and iron never stop mattering: they are the fuel.</li>'
    + '</ul>'

    + '<h3>The Muster</h3>'
    + '<div class="tscroll"><table><tr><th>Troop</th><th>Power</th><th>Cost each</th><th>Time each*</th><th>Eats</th><th>Needs</th></tr>'+troopRows+'</table></div>'
    + '<ul>'
    + '<li>*time shown includes your current ×'+tm.toFixed(2)+' training multiplier (Barracks −6%/level, plus heroes, spoils, Mastery). Costs/power/upkeep shown are Tier I — each tier is +25% power, +18% upkeep, +22% cost.</li>'
    + '<li><b>Tiers</b>: the War Academy unlocks Tier II–X. Promoting reforges every unit of that class at once, and every recruit after it matches. A fixed price per line — it does not matter whether you promote before or after you drill, so there is nothing to time.</li>'
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

    + '<h3>The Salt Isle</h3>'
    + '<ul>'
    + '<li><b>A second map that plays the opposite way.</b> The Frontier is your doorstep: many columns at once, '
    + 'everything visible, nodes that regrow. The Isle is <b>fogged</b> (landing charts the water around it, permanently), '
    + '<b>one voyage at a time</b> however many march slots you own, <b>hours long with no recall</b>, and it <b>does not '
    + 'regrow</b> — sites are spent when worked, and the whole chart is redrawn when the season turns.</li>'
    + '<li><b>Rations, not troops, are the gate.</b> A crossing costs '+RATION_COST+' Rations before the Victualler '
    + 'discounts it (2% a level, to half). So how often you can sail is set by a building rather than by how often you look '
    + 'at your phone. Yours costs <b>'+(store.s?rationCost(store.s):RATION_COST)+'</b> and takes <b>'
    + (store.s?ftime(voyageTime(store.s)):'3h')+'</b>.</li>'
    + '<li>Six kinds of site, from undefended Salt Shoals to the Bonereef and the Drowned Hall. The rich ones are the rare '
    + 'ones, which is what makes uncovering them worth the fog. Fights there <b>wound only</b>, like everywhere the Unpaid '
    + 'are not involved.</li>'
    + '<li><b>Isle Ore is the only resource in the game with no building behind it.</b> It cannot be produced, only carried '
    + 'home — and it is the only thing the Truegold Crucible will eat. That chain is the whole reason to sail.</li>'
    + '<li>The chart is generated from the season, so everyone sailing the same fortnight is learning the same island.</li>'
    + '</ul>'

    + '<h3>The Frontier</h3>'
    + '<ul>'
    + '<li>Tap a map tile to inspect and <b>march</b> on it: resource nodes (worked for a large haul), Bandit Camps (burned for loot, Valor and Mastery), Ancient Ruins (Valor, Mastery, 20% Writ).</li>'
    + '<li>Travel costs 12s per tile each way; gathering takes 60s. Marching troops carry their own rations and <b>do not defend the wall</b> until they return.</li>'
    + '<li><b>Long haul</b>: work a resource node for '+ftime(LONG_HAUL_WORK)+' instead of a minute and bring back '+LONG_HAUL_YIELD+'× the haul — the thing to set going before you close the game, at the price of an undefended wall until they are home.</li>'
    + '<li><b>Beasts roam.</b> Camps sit still; the herds move every '+ftime(BEAST_ROAM_MS)+' across open ground between the nodes, '
    + 'so a hunt is something you have to catch. Five species — '+Object.values(BEASTS).map(d=>d.icon+' '+d.name).join(', ')
    + ' — unlock by Town Hall. A hunt <b>only ever wounds</b>: nothing you send after a beast dies. '
    + 'A beast you are already hunting will stand and wait rather than lead you on a chase.</li>'
    + '<li><b>Companions come off the hunt and nowhere else.</b> Beasts pay <i>bond</i>; at each threshold three companions are '
    + 'offered and you keep one, the same draft as heroes. <b>Only one walks at your side</b>, so a full kennel of '
    + Object.keys(PET_POOL).length+' is more choices and never more power. Their bonuses sit in corners no hero touches — '
    + 'refining, expeditions, storage, infirmary beds, scouting, travel — so a companion changes the hold&#39;s texture rather than its strength. '
    + 'They level from hunting alongside you.</li>'
    + '<li>Camp battles use your march&#39;s power — the hold&#39;s bonuses, plus whatever the hero leading it is worth (no wall, no stance). Defeat costs a third of the marchers, wounded not dead.</li>'
    + '<li>You field '+marchSlots(S)+' columns: one, plus another every 5 Command Center levels and one more at Town Hall 10. Each can be given its own hero to lead. Worked tiles regrow in ~4 minutes, sometimes richer.</li>'
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
    + '<li><b>'+Object.keys(HERO_POOL).length+' heroes exist; '+heroesOpen(S)+' have arrived so far.</b> Rarity is drafted at weights 62 common / 28 rare / 10 epic. '
    + HERO_SLOTS.length+' milestones each open a draft of three — you keep one. Never pulled, never sold.</li>'
    + '<li><b>Seasons bring the rest.</b> Every fortnight four more heroes join the pool. They arrive no stronger than the founding twelve, '
    + 'and nothing ever leaves — start in Season 9 and the whole roster is still yours to draft. If a draft comes due with nobody left to offer, '
    + 'the slot waits for the next season rather than being spent.</li>'
    + '<li><b>A hero does one job at a time.</b> Seated in your court, their passive lifts the whole hold — but there are only '+courtSeats(S)
    + ' chairs (one more every '+COURT_PER_TH+' Town Hall levels, to '+COURT_MAX+'). Leading a column, they buff that march alone and give up their chair until it comes home.</li>'
    + '<li><b>Three heroes ride at the head of every column</b>, and their levels decide how many troops it can hold: '
    + CAP_PER_HERO+' + '+CAP_PER_LEVEL+' per level each, over a base of 6. Yours currently command <b>'+marchCapacity(S, bestLeaders(S, MARCH_HEROES))+'</b>. '
    + 'March slots are given by the Command Center; the capacity to fill them is earned hero by hero.</li>'
    + '<li><b>Every hero knows one troop class.</b> They add +'+Math.round(CLASS_AFFINITY*100)+'% per level to that troop type in their column, '
    + 'so three cavalry heroes leading knights hit far harder than a mixed party. This is what makes a wide roster worth having — '
    + 'and with '+marchSlots(S)+' march slots and three leaders each, a full field needs '+(marchSlots(S)*MARCH_HEROES)+' heroes.</li>'
    + '<li><b>'+MARCH_HEROES+' captains, '+Object.keys(TROOPS).length+' kinds of soldier — so a column can never cover everything.</b> That shortfall is on purpose. '
    + 'You may still <i>send</i> all four troop types in one march; what you cannot do is have a captain for all four at once, '
    + 'and choosing which three to cover is what gives a column its shape. The march builder shows the coverage as you build it, '
    + 'and says plainly when troops are riding with nobody who knows how to handle them. '
    + 'Were there four seats, the answer would be one captain of each kind, every march, forever — and there would be nothing left to decide.</li>'
    + '<li>Marching leaders also bring one of: column power, resources hauled, travel speed, losses on the road, Valor, or Mastery. '
    + 'A hero who actually rides earns far more XP than one who sits.</li>'
    + '<li><b>Formations</b> save a column — its three leaders and the exact count of each troop — for one-tap reuse. '
    + 'They hold nothing you could not assemble by hand; they just spare you assembling it eight times a day.</li>'
    + '<li><b>Every season the Unpaid muster differently.</b> This season is <b>'+temperFor(Date.now()).name+'</b> — '
    + temperFor(Date.now()).blurb+' The wave mix shifts, so the right <i>stance</i>, the right <i>troops</i> (+15% for the counter class) '
    + 'and therefore the right <i>hero captains</i> all change every fortnight. Nothing you own ever gets weaker; what changes is which of '
    + 'your things is the right answer. That is what a deep roster is for, and it is why seasons matter without anyone being made obsolete. '
    + 'The next four tempers are listed openly in the Calendar so you can drill ahead.</li>'
    + '<li><b>Stars are the ladder that never ends.</b> On top of levels, heroes ascend in stars — earned by <i>fielding</i> them '
    + '(marches led, camps burned, arena fought), never by acquiring duplicates. Each star is worth +'+Math.round(STAR_POWER*100)
    + '% of everything that hero does. The cap is the season number, so Season 16 means sixteen stars for your <i>whole roster</i>, '
    + 'the founding twelve included — the ladder rises for everyone at once and no hero is ever retired by the calendar. '
    + 'Yours cap at <b>'+heroStarCap(S)+'★</b> this season.</li>'
    + '<li><b>Five heroes ride with an arena sortie</b>, attacking and defending alike, and their class affinity lifts the force you commit. '
    + 'They are not away while they fight — a sortie is over in a minute — so the only rule is that a hero out with a column cannot be in the line.</li>'
    + '<li><b>Gear, both kinds.</b> The <b>Lord’s Regalia</b> (crown, signet, mantle, blade) is worn by you and lifts the whole hold: '
    + 'a full set is +20% production, +20% Valor, +20% troop power and −15% casualties. <b>Wargear</b> is per hero — four pieces, '
    + 'each '+GEAR_PER_LEVEL+' tiers worth one effective level, so a fully kitted captain gains +10. '
    + 'Everything is forged at the Forge from Steel and Runestone, never bought, and there are <b>no random stats</b> — '
    + 'a tier-6 blade is a tier-6 blade for everyone, so there is nothing to reroll and nothing to sell rerolls of. '
    + 'One smithing queue serves it all, which is the real cost: a full Regalia is about ten hours of exclusive forge time, '
    + 'and kitting an entire roster is hundreds.</li>'
    + '<li><b>Skills are choices, not levels.</b> '+Object.keys(SKILLS).length+' exist; which ones a hero may take '
    + 'depends on their troop class, so every captain has a different legal set of around twenty. Three slots open with '
    + 'investment (one from the start, one at level 10, one at 3★) — but the skills themselves never level, and you can '
    + 'reassign them any time for nothing. Many carry a real cost: Hard March trades haul for power, Light Packs trades '
    + 'power for haul, Careful Route buys lives with time. A skill that is simply better than the alternative would not '
    + 'be a choice, only a tax on not reading a wiki.</li>'
    + '<li><b>The interesting ones are conditional.</b> One Purpose pays +30% if every soldier in the column is one class; '
    + 'Mixed Arms pays +18% if you field three or more. Camp-Breaker, Beast-Bane and Host-Breaker each pay against one '
    + 'kind of enemy. These are what make the season’s temper worth reading — the right build changes when the muster does.</li>'
    + '<li>Heroes level to 20 on raid XP. Spoils are permanent; most stack.</li>'
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
      + '<p class="lore-open">There was a Crown once, and it was not metal — it was an oath, that no one '
      + 'who held the line would go unpaid. It broke at Hallowmere ninety years ago in an empty counting-house. '
      + 'What comes over the ridge each night are the ones who were owed.<br><br>'
      + 'Nobody appointed you Warden. You walked out here and started building, and people sheltered behind it. '
      + '<b>Nobody is coming.</b> Everything else is what you decide to do about that.</p>'
      + '<div class="pillars">'
      + '<p><b>No cash shop.</b> Every timer can be finished instantly — with Valor, a currency you can only earn by playing.</p>'
      + '<p><b>Heroes are drafted,</b> never gambled. Milestones offer three champions — you choose who stays. No banners, no pity timers, no pulls.</p>'
      + '<p><b>Losing never spirals.</b> A band that beats you returns <i>weaker</i>, not stronger — raids only escalate when you win. And armies eat: feed your muster or it deserts.</p>'
      + '</div>'
      + '<div style="display:flex;gap:.6rem;justify-content:center;flex-wrap:wrap">'
      + '<button class="primary" data-act="intro" style="font-size:.95rem;padding:.6rem 1.6rem">Take the field</button>'
      + '<button data-act="lore" style="font-size:.95rem;padding:.6rem 1.2rem">📜 Read the Annals</button>'
      + '</div></div></div>';
  }
  return h;
}

function renderChoice(S){
  const c = S.choice;
  if(!c) return '';
  const isHero = c.type==='hero', isPet = c.type==='pet';
  let cards = '';
  c.options.forEach((id, i) => {
    if(isPet){
      const d = PET_POOL[id];
      cards += '<button class="choice-card" data-act="choose" data-i="'+i+'">'
        + '<span class="cicon">'+d.icon+'</span>'
        + '<span class="rar" style="color:var(--ink-dim)">Companion</span>'
        + '<span class="cname">'+d.name+'</span>'
        + '<span class="cfx">'+d.fx(1)+' per level</span>'
        + '<span class="cfx" style="opacity:.7;font-style:italic">'+d.blurb+'</span>'
        + '</button>';
    }else if(isHero){
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
    + '<h1 style="font-size:1.5rem">'+(isHero?'A DRAFT OF CHAMPIONS':isPet?'SOMETHING FOLLOWED YOU HOME':'SPOILS OF WAR')+'</h1>'
    + '<div class="rule"></div>'
    + '<p class="sub">'+(isHero?'Three answer the call. One may stay.'
        :isPet?'Three came in behind the hunting party. One may stay.'
        :'Claim one prize from the routed warband.')+'</p>'
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
    // a column is out after a tile or after a beast; a slain beast leaves neither
    let icon = '🏹', name = 'the hunt';
    if(m.beast == null){
      const tile = S.world.tiles[m.tile], tt = TILE_TYPES[tile.type];
      icon = tt.icon; name = tt.name;
    }else{
      const b = (S.world.beasts||[])[m.beast], d = b && BEASTS[b.species];
      if(d){ icon = d.icon; name = d.name; }
    }
    const n = Object.values(m.troops).reduce((a,b)=>a+b,0);
    const phase = !m.resolved ? 'outbound · arrives '+ftime(m.arriveAt-now)
                              : 'returning · home '+ftime(m.homeAt-now);
    const party = partyOf(m).filter(id => HERO_POOL[id]);
    h += '<div class="stat-note">'+(m.beast==null?'🚩 ':'🏹 ')+n+' troops → '+icon+' '+name+' — '+phase
      + (party.length ? ' <span style="color:var(--gold)">· '
          + party.map(id => HERO_POOL[id].icon+' '+HERO_POOL[id].name.split(',')[0]).join(', ')+'</span>' : '')+'</div>';
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
  // the canvas is scaled to fit 640px, so a 15-wide grid renders every glyph at
  // ~76% — the icons are drawn larger to land at the same apparent size as before
  const IF = Math.round(24 * 15 / MAP_W), LF = Math.max(9, Math.round(9 * 15 / MAP_W));
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
    const locked = tileLocked(S, t);
    if(locked) ctx.globalAlpha = 0.34;         // visible, but plainly not yours yet
    ctx.font = IF+'px serif';
    ctx.fillText(TILE_TYPES[t.type].icon, cx, cy-4);
    // a numeral, not tally marks: 'I'.repeat(8) is eight glyphs wide in a 43px cell
    ctx.fillStyle = locked ? '#9c8d77' : '#d9a441'; ctx.font = 'bold '+LF+'px sans-serif';
    ctx.fillText('L'+t.lvl, cx, cy+18);
    ctx.globalAlpha = 1;
    if(marchTargets.has(i)){
      ctx.strokeStyle = '#d9a441'; ctx.lineWidth = 2;
      ctx.strokeRect(t.x*C+3, t.y*C+3, C-6, C-6);
    }
  });
  // the herds, on open ground between the nodes
  const hunted = new Set(S.marches.filter(m => m.beast != null && m.beast >= 0).map(m => m.beast));
  (S.world.beasts || []).forEach((b,i) => {
    const d = BEASTS[b.species];
    if(!d) return;
    const cx = b.x*C+C/2, cy = b.y*C+C/2;
    ctx.font = IF+'px serif';
    ctx.fillText(d.icon, cx, cy-4);
    ctx.fillStyle = '#c25a45'; ctx.font = 'bold '+LF+'px sans-serif';
    ctx.fillText('L'+b.lvl, cx, cy+18);
    ctx.strokeStyle = hunted.has(i) ? '#d9a441' : 'rgba(194,90,69,.55)';
    ctx.lineWidth = hunted.has(i) ? 2 : 1;
    ctx.strokeRect(b.x*C+3, b.y*C+3, C-6, C-6);
  });
  ctx.font = Math.round(IF*1.15)+'px serif';
  ctx.fillText('🏰', CX*C+C/2, CY*C+C/2);
}

export function render(){
  const S = store.s;
  /* One call, before anything is drawn: sound.watch diffs the state it was last shown
     and fires at most one cue. Here rather than in the tick loop because this is the
     single funnel every change passes through — a local action, a server pull and an
     offline fast-forward all end in a render, and none of them would remember to ring
     a bell on their own. */
  sound.watch(S);
  app.innerHTML = renderHeader(S) + renderThreat(S) + renderWorld(S)
    + '<main>' + renderHold(S)
    + '<div class="rail">' + renderMuster(S) + renderHeroes(S) + renderPets(S) + renderRegalia(S) + renderSpoils(S)
      + renderDaily(S) + renderIsle(S) + renderEvent(S) + renderRift(S) + renderRally(S) + renderBoss(S) + renderCalendar(S) + renderRealm(S) + renderResearch(S) + renderAlliance(S) + renderMusterRoll(S) + renderWatch(S) + renderRaid(S) + renderArena(S) + renderLeaderboard(S) + renderMastery(S) + renderQuest(S)
      + renderAchievements(S) + renderChronicle(S) + '</div>'
    + '</main>' + renderFooter();
  fx.innerHTML = renderFx(S) + renderLore(S) + renderStore(S) + renderSettings(S)
    + (S.seenIntro ? renderChoice(S) + renderCodex(S) + renderDetail(S) : '');
  setSkinTint((HOLD_SKINS[(S.cos && S.cos.hold) || 'default'] || {}).tint);
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
  settings: () => { settingsOpen = !settingsOpen; },
  // toggling sound is a device preference; it never touches the hold, so it stays here
  sfx: () => { sound.setPref('sfx', sound.muted()); },
  amb: () => { sound.setPref('amb', !sound.ambientOn()); },
  labels: () => { setLabels(!labelsShown()); },
  codex: () => { codexOpen = !codexOpen; },
  lore: () => { loreOpen = !loreOpen; },
  store: () => { storeOpen = true; },
  storeClose: () => { storeOpen = false; },
  // no fake payment sheet: say plainly what is missing
  buyCos: b => {
    const d = itemDef(b.dataset.mode, b.dataset.key);
    acctMsg = (d ? d.name + ' — $' + d.price.toFixed(2) + '. ' : '')
      + 'Checkout is not connected yet. It needs a payment provider tied to a real account; '
      + 'nothing here will pretend to take your money.';
    acctOpen = true; renderAccount();
  },
  detail: b => { detail = {type:b.dataset.dtype, key:b.dataset.key}; },
  detailClose: () => { detail = null; skillSlotOpen = null; },
  // expanding a skill slot's menu is a view state, not a change to the hold
  skillPick: b => {
    const hero = b.dataset.mode, slot = Number(b.dataset.n);
    skillSlotOpen = (skillSlotOpen && skillSlotOpen.hero === hero && skillSlotOpen.slot === slot)
      ? null : { hero, slot };
  },
  // assembling a column: all view state until the march order is actually given
  pickLead: b => {
    const k = b.dataset.key, at = marchParty.indexOf(k);
    if(at >= 0) marchParty.splice(at, 1);
    else if(marchParty.length < MARCH_HEROES) marchParty.push(k);
  },
  troopAdj: b => {
    const k = b.dataset.key, owned = store.s.t[k] || 0;
    marchWant[k] = b.dataset.n === 'all' ? owned
      : Math.max(0, Math.min(owned, (marchWant[k]||0) + Number(b.dataset.n)));
  },
  fillCol: b => fillColumn(store.s, Number(b.dataset.key)),
  formLoad: b => {
    const f = (store.s.formations||[]).find(x => x.name === b.dataset.key);
    if(!f) return;
    marchParty = f.heroes.filter(id => heroCanLead(store.s, id));
    marchWant = {};
    for(const k of Object.keys(TROOPS)) marchWant[k] = Math.min(f.troops[k]||0, store.s.t[k]||0);
  },
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
  rallyCall: b => {
    net.rallyCall(b.dataset.key)
      .then(d => { if(d.state) store.s = d.state; render(); })
      .catch(e => { acctMsg = e.message; acctOpen = true; renderAccount(); });
  },
  rallyJoin: b => {
    net.rallyJoin(paramsOf(b))
      .then(d => { if(d.state) store.s = d.state; marchParty = []; marchWant = {}; render(); })
      .catch(e => { acctMsg = e.message; acctOpen = true; renderAccount(); });
  },
  rallyLaunch: () => {
    net.rallyLaunch()
      .then(d => { if(d.state) store.s = d.state; render(); })
      .catch(e => { acctMsg = e.message; acctOpen = true; renderAccount(); });
  },
  raidPick: b => { raidTarget = (raidTarget === b.dataset.key) ? null : b.dataset.key; render(); },
  raidSend: b => {
    net.raidSend(b.dataset.key, fitColumn(store.s, marchWant, marchParty).troops, marchParty)
      .then(d => { if(d.state) store.s = d.state; raidTarget = null; marchParty = []; marchWant = {}; render(); })
      .catch(e => { acctMsg = e.message; acctOpen = true; renderAccount(); });
  },
  watchPick: b => { watchTarget = (watchTarget === b.dataset.key) ? null : b.dataset.key; render(); },
  watchSend: b => {
    net.watchSend(b.dataset.key, fitColumn(store.s, marchWant, marchParty).troops, marchParty)
      .then(d => { if(d.state) store.s = d.state; watchTarget = null; marchParty = []; marchWant = {}; render(); })
      .catch(e => { acctMsg = e.message; acctOpen = true; renderAccount(); });
  },
  watchRecall: b => {
    net.watchRecall(b.dataset.key)
      .then(d => { if(d.state) store.s = d.state; render(); })
      .catch(e => { acctMsg = e.message; acctOpen = true; renderAccount(); });
  },
  musterReroll: () => {
    net.musterReroll().then(render)
      .catch(e => { acctMsg = e.message; acctOpen = true; renderAccount(); });
  },
  musterClaim: () => {
    // claiming pays points and draws the next task, and the reward lands on the hold
    net.musterClaim().then(() => net.pullState())
      .then(st => { if(st) store.s = st; render(); })
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
      if(net.isOnline()) net.resetHold().then(s => { sound.forget(); store.s = s; render(); }).catch(()=>{});
      else { sound.forget(); store.s = freshState(now); save(store.s, now); }
    }else{
      resetArmedUntil = now + 5000;
    }
  },
};

function paramsOf(btn){
  const d = btn.dataset;
  const p = { key:d.key, n:d.n, i:d.i, idx:d.idx, frac:d.frac, long:d.long, mode:d.mode,
              heroes:d.heroes, x:d.x, y:d.y };
  for(const k of Object.keys(TROOPS)) if(d['t_'+k] != null) p['t_'+k] = d['t_'+k];
  return p;
}

function runAction(btn){
  if(btn.disabled) return;
  const act = btn.dataset.act;
  if(VIEW_ACTIONS[act]){ sound.cue('tap'); VIEW_ACTIONS[act](btn); render(); return; }
  if(!isGameAction(act)) return;
  const params = paramsOf(btn);
  if(act === 'march' || act === 'hunt' || act === 'voyage'){ detail = null; marchParty = []; marchWant = {}; }
  if(act === 'skill') skillSlotOpen = null;   // a choice made folds the menu away
  if(net.isOnline()){
    /* Optimistic: the tap is acknowledged now and corrected to a refusal only if the
       server disagrees. Waiting for the round trip would put the click sound 80ms
       behind the click, which reads as lag rather than as feedback. */
    sound.cueAction(act);
    net.sendAction(act, params)
      .then(s => { store.s = s; render(); })
      .catch(err => { sound.cueAction(act, false); acctMsg = err.message; renderAccount(); });
  }else{
    // offline the rules answer immediately, so the sound can tell the truth first time
    sound.cueAction(act, applyAction(store.s, act, params, Date.now()));
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
      // a different hold entirely: drop the sound baseline so the swap is not heard
      // as three hundred buildings finishing at once
      sound.forget();
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
      if(idx >= 0){ detail = {type:'tile', key:idx}; render(); return; }
      // nothing built there — a beast may be standing on it
      const bi = (store.s.world.beasts||[]).findIndex(b => b.x===x && b.y===y);
      if(bi >= 0){ detail = {type:'beast', key:bi}; render(); }
      return;
    }
    const btn = e.target.closest('button[data-act]');
    if(btn){ runAction(btn); return; }
    /* Tapping the dark outside a sheet closes it. Three sheets have carried a
       `data-act-bg` attribute since they were written and nothing ever read it, so the
       backdrop was decorative — the Store, the inspector and now Settings all get the
       behaviour from this one branch. `e.target === bg` matters: without it a tap
       anywhere inside the card would bubble up and close the sheet under your thumb. */
    const bg = e.target.closest('[data-act-bg]');
    if(bg && e.target === bg){
      const act = bg.dataset.actBg;
      if(VIEW_ACTIONS[act]){ sound.cue('tap'); VIEW_ACTIONS[act](bg); render(); }
    }
  });
  // keyboard activation arrives as click with detail 0
  document.addEventListener('click', e => {
    if(e.detail !== 0) return;
    const btn = e.target.closest('button[data-act]');
    if(btn) runAction(btn);
  });
  /* Audio has to be built inside a real gesture or the browser hands back a context
     that is permanently suspended. Bound on the document rather than on the buttons
     because the first thing a player touches is often the map, not a button. */
  document.addEventListener('pointerdown', () => sound.unlock(), { passive: true });
}
