// Events: a rotating scoring window with milestone rewards.
//
// The problem this design exists to solve: in Kingshot an event is scored by
// spending stockpiles, so the leaderboard is a spending leaderboard. Deleting
// purchasable speedups is not enough on its own — it just turns the same
// structure into a hoarding contest, won by whoever sat on resources longest.
//
// So here:
//   · Score comes from DEEDS DONE inside the window, never from spending a pile.
//   · A daily cap means thirty days of hoarding cannot be dumped in one hour.
//   · Milestones carry the material rewards, so every committed player gets them.
//   · Ranking (server-side, power-bracketed) carries prestige, not power.

import { TIME_SCALE } from './defs.js';

export const EVENT_MS = 6 * 3600 * 1000;          // a window; the live game uses days
export const EVENT_CAP_BASE = 3000, EVENT_CAP_PER_TH = 250;

/* Sources are deed keys emitted by logic/world as they happen. */
export const EVENTS = [
  {
    id:'muster', name:'Muster Days', icon:'🥁',
    blurb:'The drums do not stop. Score by drilling troops and reforging them.',
    sources:{ trained:2, promoted:400, arenaWin:250 },
    milestones:[
      {at:400,   reward:{valor:30},            txt:'+30 Valor'},
      {at:1200,  reward:{valor:60, shield:1},  txt:'+60 Valor, +1 Writ'},
      {at:3000,  reward:{valor:120},           txt:'+120 Valor'},
      {at:6000,  reward:{valor:200, shield:1}, txt:'+200 Valor, +1 Writ'},
    ],
  },
  {
    id:'stone', name:'Stonecutters', icon:'🧱',
    blurb:'Masons work through the night. Score by finishing construction.',
    sources:{ built:120, research:250 },
    milestones:[
      {at:300,   reward:{valor:30},            txt:'+30 Valor'},
      {at:900,   reward:{valor:70},            txt:'+70 Valor'},
      {at:2000,  reward:{valor:140, shield:1}, txt:'+140 Valor, +1 Writ'},
      {at:4000,  reward:{valor:240},           txt:'+240 Valor'},
    ],
  },
  {
    id:'hunt', name:'The Long Hunt', icon:'🏴',
    blurb:'The frontier is open. Score by burning camps, plundering ruins and working nodes.',
    sources:{ camp:500, ruin:350, gathered:120, longHaul:400 },
    milestones:[
      {at:500,   reward:{valor:40},            txt:'+40 Valor'},
      {at:1500,  reward:{valor:80, shield:1},  txt:'+80 Valor, +1 Writ'},
      {at:3500,  reward:{valor:160},           txt:'+160 Valor'},
      {at:7000,  reward:{valor:260, shield:1}, txt:'+260 Valor, +1 Writ'},
    ],
  },
  {
    id:'scholars', name:"Scholars' Term", icon:'📚',
    blurb:'The libraries are lit. Score by completing research and raising the Academy.',
    sources:{ research:900, built:60, promoted:200 },
    milestones:[
      {at:400,   reward:{valor:40},            txt:'+40 Valor'},
      {at:1100,  reward:{valor:90},            txt:'+90 Valor'},
      {at:2600,  reward:{valor:170, shield:1}, txt:'+170 Valor, +1 Writ'},
      {at:5000,  reward:{valor:280},           txt:'+280 Valor'},
    ],
  },
  {
    id:'warband', name:'Warband Season', icon:'⚔️',
    blurb:'The bands come in numbers. Score by holding the wall — warbands count double.',
    sources:{ waveWon:60, warbandWon:400, arenaWin:200 },
    milestones:[
      {at:400,   reward:{valor:40},            txt:'+40 Valor'},
      {at:1200,  reward:{valor:90, shield:1},  txt:'+90 Valor, +1 Writ'},
      {at:2800,  reward:{valor:180},           txt:'+180 Valor'},
      {at:5500,  reward:{valor:300, shield:1}, txt:'+300 Valor, +1 Writ'},
    ],
  },
];

export function eventIndex(now){ return Math.floor(now / EVENT_MS) % EVENTS.length; }
export function currentEvent(now){ return EVENTS[eventIndex(now)]; }
export function eventEndsIn(now){ return EVENT_MS - (now % EVENT_MS); }
export function eventCap(s){ return EVENT_CAP_BASE + EVENT_CAP_PER_TH * s.b.townhall; }

/* the running record for the window the player is currently inside */
export function eventState(s, now){
  const idx = eventIndex(now);
  if(!s.ev || s.ev.idx !== idx){
    s.ev = { idx, id: EVENTS[idx].id, score: 0, claimed: [], capped: false };
  }
  return s.ev;
}

/* Called wherever a deed happens. Respects the daily cap, which is what stops
   an event from becoming a stockpile-dumping contest. */
export function scoreDeed(s, source, count, now){
  const ev = currentEvent(now);
  const per = ev.sources[source];
  if(!per) return 0;
  const st = eventState(s, now);
  const cap = eventCap(s);
  if(st.score >= cap){ st.capped = true; return 0; }
  const gain = Math.min(per * (count || 1), cap - st.score);
  st.score += gain;
  if(st.score >= cap) st.capped = true;
  return gain;
}

export function nextMilestone(s, now){
  const ev = currentEvent(now), st = eventState(s, now);
  return ev.milestones.find(m => !st.claimed.includes(m.at)) || null;
}
export function claimableMilestones(s, now){
  const ev = currentEvent(now), st = eventState(s, now);
  return ev.milestones.filter(m => st.score >= m.at && !st.claimed.includes(m.at));
}
