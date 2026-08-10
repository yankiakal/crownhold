// Events: four overlapping scoring windows with milestone rewards.
//
// The problem this design exists to solve: in Kingshot an event is scored by
// spending stockpiles, so the leaderboard is a spending leaderboard. Deleting
// purchasable speedups is not enough on its own — it just turns the same
// structure into a hoarding contest, won by whoever sat on resources longest.
//
// So here:
//   · Score comes from DEEDS DONE inside the window, never from spending a pile.
//   · A cap per window means thirty days of hoarding cannot be dumped in one hour.
//   · Milestones carry the material rewards, so every committed player gets them.
//   · Ranking (server-side, power-bracketed) carries prestige, not power.
//
// ── why LANES ──
// Until v4.6 this file ran exactly ONE event at a time: a single `s.ev` slot that
// the next window overwrote. That is not how any of these games work, and it is
// the reason a calendar page would have looked empty — there was never more than
// one thing on it. It is also why the game felt thin: whatever you happened to be
// doing that hour, there was a five-in-six chance the one live event did not read
// it, so most of an afternoon's work scored nothing anywhere.
//
// Now there are four lanes of different LENGTHS running at once — 6h, 12h, 24h,
// 48h — each cycling its own pool. Four events are always live, they end at
// different times, and one deed credits every live lane that reads it. So the
// calendar has something in it, and an hour of play nearly always feeds something.
//
// Lane length does all the scaling: a 48h window has 8× the cap and 8× the
// milestone thresholds of a 6h one, off the same per-deed point values. The reward
// ladder belongs to the LANE, not the event — which is how these games actually
// work (an event changes what you DO, not what the ladder pays) and it means
// there is no way for one event's table to drift into unreachable numbers.

import { tallyDaily } from './daily.js';

export const SPRINT_MS = 6 * 3600 * 1000;         // the shortest lane; the live game uses days
/* A bigger hold does more per hour, so its ceiling is higher — TH6 is the reference, and the ceiling
   itself is per-lane below rather than one formula stretched across four very different scoring
   rates. The floor stops a very young hold from being ceilinged out of an event it could otherwise
   finish. */
export const laneCap = (s, lane) =>
  Math.round(lane.cap * Math.max(0.6, 1 + 0.05 * (s.b.townhall - 6)));

/* ── how the source values were set ──
   Sources are deed keys emitted by logic/world/arena/raid as they happen, and the number beside each
   is points PER DEED. Which means a value is meaningless without knowing how OFTEN that deed fires —
   and the old table was set by how important each deed FELT, so `built:120` and `research:250` looked
   like a considered ratio while research actually fires once every twenty-five minutes and building
   fires every two. The event was thirteen times more about construction than the numbers suggested.

   So the sim counts deeds now, and every event is priced to the same target: about 3,000 points an
   hour at full attention, split across its sources by the weights in each comment. Measured rates for
   a mature hold playing continuously, which is what the values below divide into:

     trained 210/h · expedition 130/h · built 35/h · waveWon 28/h · beast 15/h · camp 14/h
     gathered 7/h · warbandWon 6/h · ruin ~5/h · longHaul ~3/h · help ~3/h · research 2.5/h
     arenaWin ~2/h · promoted 1/h

   That is why `expedition` is worth 5 and `promoted` is worth 900: an expedition comes round every
   fifteen seconds and a reforge is the work of an afternoon. Every key here is also audited against
   what the game actually emits by verify-skills — three of them turned out to be fiction once that
   test existed. */

/* ── the four lanes ──
   `off` staggers the starts so the four windows do not all roll over on the same tick — otherwise
   every ending and every beginning would land in one instant four times a day, which is both a wall
   of toasts and a dead hour afterwards. Offsets are prime-ish fractions of each lane so the pattern
   does not resynchronise for days.

   ── where the numbers came from ──
   Not from taste. The sim reports points-per-hour per lane, and the first draft of these ladders was
   pitched off a guess that turned out to be wrong by a factor of ten: continuous play scores roughly
   2,000/h in the sprint lane and 4,000–5,000/h in the long ones, so every rung was being cleared in
   the first hour of a two-day window and event Valor came out five to ten times the old system's.

   Scoring needs the app OPEN — applyOffline settles production and a returning expedition, but it
   resolves no waves and finishes no buildings, so an absent hold scores nothing. The sim bot's rate
   is therefore the app-open rate, and the rungs are set against it directly:

     rung 4  about a THIRD of the window at full attention — hard, and meant to be
     rung 3  a committed day, where most regular players will finish
     rung 2  an ordinary session
     rung 1  a casual look-in cannot miss it
     cap     1.5× rung 4, so topping a ladder is not the same as being shut out

   Valor per hour is the SAME in every lane — 30 an hour fully claimed, so 720 a window in every lane
   and about 2,900 a day across all four if every rung is taken. Against the old single-slot system's
   1,640 maximum that is 1.75×, which is the raise this rework is meant to be worth and not more.
   Writs stay scarce: none at all in the sprint lane, which comes round four times a day. */
export const LANES = [
  {
    id:'sprint', name:'Sprint', icon:'⚡', ms: SPRINT_MS,      off: 1 * 3600 * 1000,
    note:'six hours — whatever you are already doing',
    cap: 9000,        // 6h at ~3,000/h is 18,000; rung 4 is a third of that
    ladder:[
      {at:750,   reward:{valor:25},           txt:'+25 Valor'},
      {at:2000,  reward:{valor:40},           txt:'+40 Valor'},
      {at:3700,  reward:{valor:50},           txt:'+50 Valor'},
      {at:6000,  reward:{valor:65},           txt:'+65 Valor'},
    ],
  },
  {
    id:'watch', name:'Watch', icon:'🕯️', ms: 12 * 3600 * 1000, off: 2 * 3600 * 1000,
    note:'half a day — one good sitting',
    cap: 18000,       // every lane's rungs are exactly twice the shorter one's
    ladder:[
      {at:1500,  reward:{valor:50},           txt:'+50 Valor'},
      {at:4000,  reward:{valor:80},           txt:'+80 Valor'},
      {at:7400,  reward:{valor:105},           txt:'+105 Valor'},
      {at:12000, reward:{valor:125, shield:1}, txt:'+125 Valor, +1 Writ'},
    ],
  },
  {
    id:'term', name:'Term', icon:'📖', ms: 24 * 3600 * 1000,    off: 5 * 3600 * 1000,
    note:'a full day — morning and evening both count',
    cap: 36000,
    ladder:[
      {at:3000,  reward:{valor:100},           txt:'+100 Valor'},
      {at:8000,  reward:{valor:160},           txt:'+160 Valor'},
      {at:14800, reward:{valor:210, shield:1}, txt:'+210 Valor, +1 Writ'},
      {at:24000, reward:{valor:250},           txt:'+250 Valor'},
    ],
  },
  {
    id:'banner', name:'Banner', icon:'🚩', ms: 48 * 3600 * 1000, off: 0,
    note:'two days — the long one, and the one worth planning for',
    cap: 72000,
    ladder:[
      {at:6000,  reward:{valor:200},           txt:'+200 Valor'},
      {at:16000, reward:{valor:320},           txt:'+320 Valor'},
      {at:29600, reward:{valor:420, shield:1}, txt:'+420 Valor, +1 Writ'},
      {at:48000, reward:{valor:500, shield:1}, txt:'+500 Valor, +1 Writ'},
    ],
  },
];

/* ── the sixteen events ──
   Four per lane, so each lane cycles on its own period: the sprint pool comes round daily, the
   banner pool every eight days. Each event names a lane and its scoring sources; the rewards come
   from the lane above.

   Assigned to lanes by the SHAPE of the deed, not at random. Construction and research are the slow
   deeds — a Great Library takes hours — so they anchor the long lanes, where there is time to finish
   something. Kills, waves and drills happen every few seconds, so they carry the short ones. An
   event in the wrong lane is unreachable or trivial, and neither is a game. */
export const EVENTS = [
  /* ── banner, 48h: the slow deeds, where a two-day window is the point ── */
  {
    id:'stone', lane:'banner', name:'Stonecutters', icon:'🧱',
    blurb:'Masons work through the night. Score by finishing construction and research.',
    sources:{ built:39, research:660 },   // built 45% · research 55%
  },
  {
    id:'scholars', lane:'banner', name:"Scholars' Term", icon:'📚',
    blurb:'The libraries are lit. Score by completing research, building, and reforging.',
    sources:{ research:600, built:26, promoted:600 },   // research 50% · built 30% · promoted 20%
  },
  {
    id:'muster', lane:'banner', name:'Muster Days', icon:'🥁',
    blurb:'The drums do not stop. Score by drilling troops and reforging them.',
    sources:{ trained:7, promoted:900, arenaWin:300 },   // trained 50% · promoted 30% · arenaWin 20%
  },
  {
    id:'charter', lane:'banner', name:'The Great Charter', icon:'📜',
    blurb:'A survey of the whole hold. Almost everything you do counts for something.',
    sources:{ built:21, research:240, trained:3, waveWon:16, gathered:43, help:100 },   // built 25% · research 20% · trained 20% · waveWon 15% · gathered 10% · help 10%
  },

  /* ── term, 24h: a day's worth of campaigning ── */
  {
    id:'hunt', lane:'term', name:'The Long Hunt', icon:'🏴',
    blurb:'The frontier is open. Score by burning camps, plundering ruins and working nodes.',
    sources:{ camp:75, ruin:150, gathered:85, longHaul:200 },   // camp 35% · ruin 25% · gathered 20% · longHaul 20%
  },
  {
    id:'warband', lane:'term', name:'Warband Season', icon:'⚔️',
    blurb:'The bands come in numbers. Score by holding the wall — warbands count for far more.',
    sources:{ waveWon:48, warbandWon:175, arenaWin:300 },   // waveWon 45% · warbandWon 35% · arenaWin 20%
  },
  {
    id:'forge', lane:'term', name:'Forge Fires', icon:'🔥',
    blurb:'The furnaces run hot. Score by building, reforging troops and finishing research.',
    sources:{ built:38, promoted:900, research:300 },   // built 45% · promoted 30% · research 25%
  },
  {
    id:'wardens', lane:'term', name:'Wardens of the Wall', icon:'🛡️',
    blurb:'Hold, then repair what held. Score by winning waves and raising the works behind them.',
    sources:{ waveWon:43, warbandWon:125, built:21, help:100 },   // waveWon 40% · warbandWon 25% · built 25% · help 10%
  },

  /* ── watch, 12h: one sitting ──
     Two of these four — Gathering Days and The Caravan — read ONLY frontier work and expeditions, and
     the sim proves the consequence: on the runs where the bot marched nowhere and sent no parties, this
     lane scored 0/h for the whole window while the other three ran at 2,000–3,800/h. That is deliberate
     and it is left in. An event whose whole content is "go and do this" has to be scoreable only by
     doing it, and the other three lanes carry the player who would rather not. The alternative is every
     event reading the deeds that always happen anyway, which makes seventeen events into one. It is
     recorded here because it looks exactly like a bug from the outside, and it is not one. */
  {
    id:'roads', lane:'watch', name:'Gathering Days', icon:'🛤️',
    blurb:'The roads are busy. Score by working the frontier and running expeditions.',
    sources:{ gathered:130, camp:54, longHaul:250, expedition:5 },   // gathered 30% · camp 25% · longHaul 25% · expedition 20%
  },
  {
    id:'trial', lane:'watch', name:"Champions' Trial", icon:'🏆',
    blurb:'The lists are open. Score in the arena and by holding your own wall.',
    sources:{ arenaWin:600, warbandWon:175, waveWon:27 },   // arenaWin 40% · warbandWon 35% · waveWon 25%
  },
  {
    id:'masons', lane:'watch', name:"Masons' Watch", icon:'⛏️',
    blurb:'One shift, one job finished. Score by completing construction and study.',
    sources:{ built:64, research:300 },   // built 75% · research 25%
  },
  {
    id:'caravan', lane:'watch', name:'The Caravan', icon:'🐎',
    blurb:'Wagons on every road. Score by long hauls, expeditions and worked nodes.',
    sources:{ longHaul:400, gathered:150, expedition:6 },   // longHaul 40% · gathered 35% · expedition 25%
  },

  /* ── sprint, 6h: the deeds that happen every few seconds ── */
  {
    id:'vigil', lane:'sprint', name:'Night Vigil', icon:'🌙',
    blurb:'Nothing gets past the wall tonight. Score by winning waves.',
    sources:{ waveWon:70, warbandWon:175 },   // waveWon 65% · warbandWon 35%
  },
  {
    id:'drill', lane:'sprint', name:'The Drill Yard', icon:'🏹',
    blurb:'Sergeants shouting until dark. Score by drilling and reforging troops.',
    sources:{ trained:10, promoted:900 },   // trained 70% · promoted 30%
  },
  {
    id:'beasts', lane:'sprint', name:'The Beast Hunt', icon:'🐗',
    blurb:'Something large is moving out there. Score by bringing down beasts and burning camps.',
    sources:{ beast:90, camp:64, ruin:150 },   // beast 45% · camp 30% · ruin 25%
  },
  {
    id:'relics', lane:'sprint', name:'Relic Run', icon:'🏺',
    blurb:'Old stones, quick hands. Score by plundering ruins and running expeditions.',
    sources:{ ruin:270, camp:64, expedition:6 },   // ruin 45% · camp 30% · expedition 25%
  },
  /* FIVE in this pool, not four, and that is the whole reason it exists. The sprint lane runs four
     windows a day, so a pool of four came round in exactly one day — every row of the calendar showed
     the same four icons in the same order for ever, which is a table pretending to be a calendar. Five
     against four means the pattern takes five days to repeat and the grid shifts as you read across
     it. The test below is what caught it. */
  {
    id:'sortie', lane:'sprint', name:'The Sortie', icon:'🗡️',
    blurb:'Out through the gate and back before dark. Score by burning camps and holding the wall.',
    sources:{ camp:86, waveWon:38, trained:4 },   // camp 40% · waveWon 35% · trained 25%
  },
];

/* What a source key is called out loud. The panel lists an event's sources with their point values,
   because "camps 500 · ruins 350" is the sentence that decides what a player does next, and a blurb
   is not. Audited both ways by verify-skills: a source with no label would render as a raw deed key. */
export const DEED_LABEL = {
  trained:'each troop drilled', promoted:'reforging a tier', built:'a job finished',
  research:'a study completed', waveWon:'a wave held', warbandWon:'a warband broken',
  camp:'a camp burned', ruin:'a ruin plundered', gathered:'a node worked',
  longHaul:'a long haul', expedition:'an expedition', beast:'a beast felled',
  arenaWin:'an arena win', help:'helping an ally',
};

export const laneOf = id => LANES.find(l => l.id === id) || null;
export const eventOf = id => EVENTS.find(e => e.id === id) || null;
/* Each lane's own pool, in table order. Built once: `poolOf` is called on every scoring deed and
   every calendar cell, and a filter per call would be a scan of sixteen events each time. */
const POOLS = {};
for(const l of LANES) POOLS[l.id] = EVENTS.filter(e => e.lane === l.id);
export const poolOf = lane => POOLS[typeof lane === 'string' ? lane : lane.id] || [];

/* ── which window a lane is in ──
   Deterministic from the clock alone, so no server is needed to agree on it and an offline hold sees
   exactly the same calendar as an allied one. `w` is the absolute window number since the epoch,
   which is what state is keyed on: it never repeats, so a save cannot be mistaken for the same
   window coming round again eight days later. */
export function windowNo(lane, now){ return Math.floor((now - lane.off) / lane.ms); }
export function windowAt(lane, w){
  const pool = poolOf(lane);
  /* Negative window numbers exist — the offsets put a lane's window 0 after the epoch — and
     `-1 % 4` is -1 in JavaScript, which would index off the end of the pool. */
  const i = ((w % pool.length) + pool.length) % pool.length;
  return { lane, w, event: pool[i], start: w * lane.ms + lane.off, end: (w + 1) * lane.ms + lane.off };
}
export function liveWindow(lane, now){
  const win = windowAt(lane, windowNo(lane, now));
  return { ...win, live: true, endsIn: win.end - now, startsIn: 0 };
}
/* All four, in lane order — shortest first, because that is the one about to end. */
export function liveWindows(now){ return LANES.map(l => liveWindow(l, now)); }


/* ── the running record, one per lane ──
   `s.evs` is keyed by lane id; each entry remembers which window it belongs to, so a stale entry
   from the previous window is replaced rather than credited. */
export function eventState(s, lane, now){
  if(!s.evs || typeof s.evs !== 'object') s.evs = {};
  const w = windowNo(lane, now);
  const st = s.evs[lane.id];
  if(!st || st.w !== w){
    const win = windowAt(lane, w);
    s.evs[lane.id] = { w, id: win.event.id, score: 0, claimed: [], capped: false };
  }
  return s.evs[lane.id];
}

/* Called wherever a deed happens, and it credits EVERY live lane that reads that deed — which is the
   whole point of running four. Respects each lane's cap, which is what stops an event from becoming
   a stockpile-dumping contest. Returns the total scored, across lanes. */
export function scoreDeed(s, source, count, now){
  tallyDaily(s, source, count, now);      // the same deed feeds today's task list
  let total = 0;
  for(const lane of LANES){
    const win = windowAt(lane, windowNo(lane, now));
    const per = win.event.sources[source];
    if(!per) continue;
    const st = eventState(s, lane, now);
    const cap = laneCap(s, lane);
    if(st.score >= cap){ st.capped = true; continue; }
    const gain = Math.min(per * (count || 1), cap - st.score);
    st.score += gain;
    if(st.score >= cap) st.capped = true;
    total += gain;
  }
  return total;
}

export function nextMilestone(s, lane, now){
  const st = eventState(s, lane, now);
  return lane.ladder.find(m => !st.claimed.includes(m.at)) || null;
}
export function claimableMilestones(s, lane, now){
  const st = eventState(s, lane, now);
  return lane.ladder.filter(m => st.score >= m.at && !st.claimed.includes(m.at));
}
/* Anything owed anywhere — what the tab badge asks, and what a player means by "is there something
   to collect". Flat, with its lane attached, so a caller can claim it without asking twice. */
export function allClaimable(s, now){
  const out = [];
  for(const lane of LANES)
    for(const m of claimableMilestones(s, lane, now)) out.push({ lane, m });
  return out;
}

/* ── the calendar ──
   Rows are lanes, columns are days, and a cell holds every window of that lane touching that day.
   Local midnights, because a calendar that disagrees with the player's own date is worse than none.
   Everything is derived from `now`, so this needs no server and no stored schedule. */
const dayStart = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

export function calendar(now, days = 7){
  const first = dayStart(now);
  const cols = [];
  for(let i = 0; i < days; i++){
    const start = dayStart(first + i * 86400000 + 43200000);   // noon, so a DST shift cannot skip a day
    cols.push({ start, end: dayStart(start + 86400000 + 43200000), today: i === 0 });
  }
  const last = cols[cols.length - 1].end;
  const rows = LANES.map(lane => {
    const wins = [];
    for(let w = windowNo(lane, first); w * lane.ms + lane.off < last; w++){
      const win = windowAt(lane, w);
      if(win.end <= first) continue;
      wins.push({ ...win,
        live: win.start <= now && now < win.end,
        startsIn: Math.max(0, win.start - now), endsIn: win.end - now });
    }
    return { lane, wins, cells: cols.map(c => wins.filter(w => w.start < c.end && w.end > c.start)) };
  });
  return { cols, rows, live: liveWindows(now) };
}
