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

/* Exported so the deed audit can walk it: every task's deed has to be one the game emits, and
   nothing checked that until three of them turned out not to be. */
export const POOL = [
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
  /* The other half of the same audit: `beast` was EMITTED on every kill and read by nothing — no
     task, no event scored it. The frontier's herds were the one deed in the game worth nothing. */
  { id:'beast',    txt:'Bring down a beast',           deed:'beast',      need:1,  reward:{valor:16} },
  { id:'beast2',   txt:'Bring down 3 beasts',          deed:'beast',      need:3,  reward:{valor:26} },
];

// the whole list finished pays a bonus worth more than any single line
export const DAILY_BONUS = { valor: 60, shield: 1 };

export const dayIndexOf = now => Math.floor(now / 86400000);

/* ── what a hold can actually DO ──
   A task that cannot be performed is not a challenge, it is a dead line — and because the slate's
   bonus needs EVERY line, one of them poisons the whole day. Two of these were in the pool from the
   start: "win an arena battle" needs a server, and "help an ally build" needs a server AND an
   alliance. A third, "run 3 expeditions", was impossible for everyone because the deed behind it was
   never emitted at all. Measured before fixing: 58% of days drew at least one, so the +60 Valor and
   the Writ for a clean slate were unreachable three days in five.

   `s.can` is stamped by the server, which is the only party that knows. Absent means a solo hold. */
export const DEED_NEEDS = { arenaWin:'online', help:'alliance' };
export function canDoDeed(s, deed){
  const need = DEED_NEEDS[deed];
  if(!need) return true;
  const can = (s && s.can) || {};
  return !!can[need];
}

/* Deterministic per day, so everyone in the realm sees the same slate — and then any line this hold
   could not possibly finish is SUBSTITUTED, not dropped, so the slate is always six real tasks.
   Still deterministic: the same hold sees the same six all day, across reloads. */
export function todaysTasks(now, s){
  const d = dayIndexOf(now);
  const able = t => canDoDeed(s, t.deed);
  const out = [];
  for(let i = 0; i < DAILY_COUNT; i++){
    // a simple decorrelated stride keeps consecutive days from repeating
    out.push(POOL[(d * 7 + i * 5 + Math.floor(d / 3)) % POOL.length]);
  }
  // no duplicate lines on the same day, and nothing this hold cannot do
  const seen = new Set(), uniq = [];
  for(const t of out){ if(seen.has(t.id) || !able(t)) continue; seen.add(t.id); uniq.push(t); }
  let k = 0;
  while(uniq.length < DAILY_COUNT && k < POOL.length * 2){
    const t = POOL[(d * 3 + k++) % POOL.length];
    if(!seen.has(t.id) && able(t)){ seen.add(t.id); uniq.push(t); }
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
  return todaysTasks(now, s).map(t => ({
    ...t,
    have: Math.min(st.counts[t.deed] || 0, t.need),
    done: (st.counts[t.deed] || 0) >= t.need,
    claimed: st.claimed.includes(t.id),
  }));
}
export function allDailyDone(s, now){
  return dailyProgress(s, now).every(t => t.claimed);
}
