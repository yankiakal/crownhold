// The Muster Roll — the alliance's shared work.
//
// Taken from Whiteout Survival's Alliance Mobilization, which fills the hole our
// social layer had: every alliance feature we already own is REACTIVE. Help a
// build when someone starts one, strike the boss when someone calls it, join a
// rally when the horn goes. Nothing gives an alliance a standing goal on a quiet
// Tuesday. A shared task board does.
//
// Three things about their version we deliberately do not copy:
//
//   1. Their tasks include "spend gems". A cooperative board whose rungs are
//      purchases is a spend funnel wearing a friendship badge. Every task here is
//      measured in play, and there is no field in a task for money.
//   2. Their rewards go to the TOP FIVE earners per alliance. That pays the
//      already-strong and tells everyone else not to bother. Here everyone who
//      scores anything is paid, in proportion to what they did.
//   3. Their rerolls are an officer privilege. Here you reroll your own work, free,
//      on a cooldown — the point of a reroll is "this task does not suit how I
//      play", which is not a thing a rank should adjudicate.
//
// ── how progress is measured ──
// Every task reads a counter the hold ALREADY keeps, and stores the counter's value
// at the moment the task was taken. Progress is the difference. That means no new
// tracking anywhere: no increments to thread through resolveWave, resolveReturn and
// a dozen other call sites, which is exactly where this project has put a `rand` in
// the wrong function before. A task cannot silently fail to count, because it is
// reading the same number the achievements read.

import { SEASON_MS, SEASON_EPOCH, seasonNo } from './defs.js';

/* A fortnight, on the season clock, so the Roll turns over with the temper and the
   star cap rather than on its own private schedule. */
export const MUSTER_MS = SEASON_MS;
export const MUSTER_MIN_MEMBERS = 2;      // WoS demands 15; that kills small alliances
export const REROLL_MS = 20 * 60 * 1000;  // 20 minutes
export const TASK_SLOTS = 1;              // one at a time, as in WoS — it forces a choice

/* The work. `of` reads a counter the hold already keeps monotonically, so progress
   is (now − whenTaken) and nothing new has to be recorded anywhere. */
export const TASKS = {
  camps:    { name:'Break bandit camps',      icon:'🏴', unit:'camps',    base:2,  of: s => s.campsBurned || 0 },
  beasts:   { name:'Take beasts',             icon:'🐗', unit:'beasts',   base:3,  of: s => s.beastsSlain || 0 },
  ruins:    { name:'Search ancient ruins',    icon:'🏛️', unit:'ruins',    base:2,  of: s => s.ruinsRaided || 0 },
  raids:    { name:'Repel raids on the wall', icon:'🛡️', unit:'raids',    base:4,  of: s => s.wavesWon || 0 },
  warbands: { name:'Break warbands',          icon:'⚔️', unit:'warbands', base:1,  of: s => s.warbandsWon || 0 },
  drill:    { name:'Drill fresh troops',      icon:'🥁', unit:'troops',   base:40, of: s => s.trained || 0 },
  mastery:  { name:'Earn Mastery',            icon:'📖', unit:'Mastery',  base:60, of: s => s.mxp || 0 },
  arena:    { name:'Win arena sorties',       icon:'🏆', unit:'wins',     base:2,  of: s => s.arenaWins || 0 },
};

/* Three weights. The hard ones pay better per unit of work, so taking one is a real
   choice rather than arithmetic — and rerolling toward light work costs you the
   cooldown, which is the only price anywhere in this system. */
export const WEIGHTS = [
  { key:'light', name:'Light',   mult:1,   points:10 },
  { key:'fair',  name:'Fair',    mult:2.5, points:30 },
  { key:'hard',  name:'Hard',    mult:5,   points:75 },
];

export function weightOf(key){ return WEIGHTS.find(w => w.key === key) || WEIGHTS[0]; }

/* Tasks scale with the hold, so "break 2 camps" does not stay trivial at Town Hall
   25 nor impossible at Town Hall 4. */
function scaleFor(s){ return 1 + 0.09 * Math.max(0, (s.b && s.b.townhall || 1) - 1); }

export function taskNeed(kind, weightKey, s){
  const d = TASKS[kind], w = weightOf(weightKey);
  if(!d) return 0;
  return Math.max(1, Math.round(d.base * w.mult * scaleFor(s)));
}

/* Roll an offer. Deliberately excludes whatever the member is already carrying, so a
   reroll always actually changes something — a reroll that can hand back the same
   task is a button that lies. */
export function rollTask(s, rand, avoidKind){
  const kinds = Object.keys(TASKS).filter(k => k !== avoidKind);
  const kind = kinds[Math.floor(rand() * kinds.length)] || 'camps';
  const w = WEIGHTS[Math.floor(rand() * WEIGHTS.length)] || WEIGHTS[0];
  return { kind, weight: w.key, need: taskNeed(kind, w.key, s), at: TASKS[kind].of(s) };
}

/* Where a task stands. `at` is the counter's value when the task was taken. */
export function taskProgress(s, task){
  if(!task || !TASKS[task.kind]) return { have: 0, need: 1, done: false };
  const have = Math.max(0, TASKS[task.kind].of(s) - (task.at || 0));
  const need = Math.max(1, task.need || 1);
  return { have: Math.min(have, need), need, done: have >= need, raw: have };
}

/* Which fortnight the Roll is in. Derived from the clock, never stored — a stored
   period goes stale the moment the schedule changes, which is the bug the Rift's
   `open` flag had. */
export function musterPeriod(now){
  return Math.max(1, Math.floor((now - SEASON_EPOCH) / MUSTER_MS) + 1);
}
export function musterEndsIn(now){
  const p = musterPeriod(now);
  return (SEASON_EPOCH + p * MUSTER_MS) - now;
}

/* What a member is owed when the Roll turns over. Everyone who scored is paid; the
   alliance's total lifts everybody's share, which is the whole point of a shared
   board — your neighbour's work is worth something to you. */
export function musterReward(personal, allianceTotal, members){
  if(personal <= 0) return null;
  const share = allianceTotal > 0 ? personal / allianceTotal : 0;
  const together = Math.min(2, 1 + allianceTotal / Math.max(1, members * 400));
  return {
    valor:   Math.round(personal * 0.5 * together),
    mastery: Math.round(personal * 1.2 * together),
    // paid in the two things that cannot be bought, plus stores for the trouble
    steel:   Math.round(personal * 0.35 * together),
    share, together,
  };
}

/* A division by total points, so a small alliance that works hard is not measured
   against a big one that does not. Cosmetic standing only — it pays a multiplier on
   effort already made, never power. */
export const DIVISIONS = [
  { at: 4000, name:'The King\'s Own',  icon:'👑' },
  { at: 1800, name:'The First Horn',   icon:'📯' },
  { at: 700,  name:'The Long Watch',   icon:'🕯️' },
  { at: 200,  name:'The Muster',       icon:'🪶' },
  { at: 0,    name:'Unmustered',       icon:'—'  },
];
export function divisionOf(total){ return DIVISIONS.find(d => total >= d.at) || DIVISIONS[DIVISIONS.length-1]; }

export function seasonLabel(now){ return 'Season ' + seasonNo(now) + ' · Roll ' + musterPeriod(now); }
