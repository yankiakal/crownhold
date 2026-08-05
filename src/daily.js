// Daily Tasks: the everyday anchor.
//
// The rotating events are a weekly rhythm and the alliance boss is an occasion.
// This is the other cadence a live game needs — a short, finishable list that
// resets every day, so opening the game always has a point even when nothing
// special is running. Kingshot's daily missions do the same job.
//
// Everything here is earnable and small. It is a reason to show up, not a
// power source, and there is nothing to sell.

export const DAILY_COUNT = 6;

const POOL = [
  { id:'drill',    txt:'Drill 20 troops',              deed:'trained',    need:20, reward:{valor:12} },
  { id:'drill2',   txt:'Drill 60 troops',              deed:'trained',    need:60, reward:{valor:20} },
  { id:'build',    txt:'Finish 2 construction jobs',   deed:'built',      need:2,  reward:{valor:15} },
  { id:'build2',   txt:'Finish 4 construction jobs',   deed:'built',      need:4,  reward:{valor:25} },
  { id:'study',    txt:'Complete a research',          deed:'research',   need:1,  reward:{valor:18} },
  { id:'hold',     txt:'Hold the wall 5 times',        deed:'waveWon',    need:5,  reward:{valor:14} },
  { id:'hold2',    txt:'Hold the wall 15 times',       deed:'waveWon',    need:15, reward:{valor:24} },
  { id:'warband',  txt:'Break a Warband',              deed:'warbandWon', need:1,  reward:{valor:20} },
  { id:'camp',     txt:'Burn a bandit camp',           deed:'camp',       need:1,  reward:{valor:18} },
  { id:'ruin',     txt:'Plunder a ruin',               deed:'ruin',       need:1,  reward:{valor:16} },
  { id:'gather',   txt:'Work a frontier node',         deed:'gathered',   need:2,  reward:{valor:14} },
  { id:'longhaul', txt:'Send a long haul',             deed:'longHaul',   need:1,  reward:{valor:22} },
  { id:'promote',  txt:'Reforge a troop tier',         deed:'promoted',   need:1,  reward:{valor:25} },
  { id:'arena',    txt:'Win an arena battle',          deed:'arenaWin',   need:1,  reward:{valor:20} },
  { id:'road',     txt:'Run 3 expeditions',            deed:'expedition', need:3,  reward:{valor:12} },
  { id:'help',     txt:'Help an ally build',           deed:'help',       need:3,  reward:{valor:18} },
];

// the whole list finished pays a bonus worth more than any single line
export const DAILY_BONUS = { valor: 60, shield: 1 };

export const dayIndexOf = now => Math.floor(now / 86400000);

/* Deterministic per day, so everyone in the realm sees the same slate. */
export function todaysTasks(now){
  const d = dayIndexOf(now);
  const out = [];
  for(let i = 0; i < DAILY_COUNT; i++){
    // a simple decorrelated stride keeps consecutive days from repeating
    out.push(POOL[(d * 7 + i * 5 + Math.floor(d / 3)) % POOL.length]);
  }
  // no duplicate lines on the same day
  const seen = new Set(), uniq = [];
  for(const t of out){ if(seen.has(t.id)) continue; seen.add(t.id); uniq.push(t); }
  let k = 0;
  while(uniq.length < DAILY_COUNT && k < POOL.length){
    const t = POOL[(d * 3 + k++) % POOL.length];
    if(!seen.has(t.id)){ seen.add(t.id); uniq.push(t); }
  }
  return uniq;
}

export function dailyState(s, now){
  const d = dayIndexOf(now);
  if(!s.daily || s.daily.day !== d) s.daily = { day: d, counts: {}, claimed: [], bonus: false };
  return s.daily;
}
export function tallyDaily(s, deed, n, now){
  const st = dailyState(s, now);
  st.counts[deed] = (st.counts[deed] || 0) + (n || 1);
}
export function dailyProgress(s, now){
  const st = dailyState(s, now);
  return todaysTasks(now).map(t => ({
    ...t,
    have: Math.min(st.counts[t.deed] || 0, t.need),
    done: (st.counts[t.deed] || 0) >= t.need,
    claimed: st.claimed.includes(t.id),
  }));
}
export function allDailyDone(s, now){
  return dailyProgress(s, now).every(t => t.claimed);
}
