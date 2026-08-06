// Every sound in Crownhold is synthesised at runtime. There are no audio files.
//
// Same reasoning as the renderer, and the same reason the sprite pipeline shipped with
// no art in it: an asset pipeline blocks on sourcing, licensing and file size, and a
// game with no sound at all reads as unfinished more loudly than any missing feature.
// WebAudio already has oscillators, filters and a place to put a noise buffer, which is
// a synthesiser — so the whole audio layer is about 200 lines and weighs nothing in the
// bundle. Real recorded audio can replace any cue later; the cue names are the seam.
//
// Four things here are deliberate:
//
//   1. THE CONTEXT IS BUILT ON THE FIRST GESTURE, never at import. Every browser
//      suspends an AudioContext created before the user has touched the page, and a
//      suspended context does not error — it plays nothing, for ever. That is the worst
//      shape a bug can have, so `unlock()` is the only thing that constructs it.
//   2. MUTE IS A DEVICE PREFERENCE, not game state. It lives in localStorage and never
//      enters `s`, so it does not ride in a save, does not sync to the server, and does
//      not travel between your phone and your desktop. Whether this room is quiet is not
//      a fact about your hold.
//   3. CUES FIRE FROM STATE DIFFS, not from logic.js. Nothing in the rules layer knows
//      sound exists, so the simulator stays silent and pure — and `watch()` below cannot
//      make a rule fire differently, because it only ever reads.
//   4. ONE CUE PER TICK, by priority. Eight watched signals can land in the same frame —
//      a wave resolving while a build finishes while troops arrive — and playing all of
//      them at once is noise, not feedback. The most important one wins and the rest are
//      dropped rather than queued, because feedback that arrives late is a lie.

import { WAVE_MS } from './defs.js';

const KEY = 'crownhold-audio';

let ctx = null, master = null, bed = null, buf = null;
let prefs = { sfx: true, amb: true };
try {
  const raw = localStorage.getItem(KEY);
  if(raw) prefs = { ...prefs, ...JSON.parse(raw) };
} catch { /* private browsing, or the stub DOM in verify-ui */ }

function persist(){
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch {}
}

export function muted(){ return !prefs.sfx; }
export function ambientOn(){ return !!prefs.amb; }
export function prefsOf(){ return { ...prefs }; }

export function setPref(k, on){
  prefs[k] = !!on;
  persist();
  if(k === 'amb') on ? startBed() : stopBed();
  if(k === 'sfx' && on) cue('tap');          // so the toggle proves itself audible
}

/* Called from the click handler, every time — it is cheap after the first one, and
   tying it to a single named gesture is how you end up with a page that is silent
   because the user's first tap happened to be somewhere else. */
export function unlock(){
  if(ctx) { if(ctx.state === 'suspended') ctx.resume().catch(()=>{}); return; }
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if(!AC) return;                             // no WebAudio here: stay silent, never throw
  try {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
    if(prefs.amb) startBed();
  } catch { ctx = null; }
}

/* ── the synth ── */

// One second and a half of white noise, made once and looped. Everything percussive
// in the game is this buffer through a different filter.
function noiseBuf(){
  if(buf) return buf;
  const n = Math.floor(ctx.sampleRate * 1.5);
  buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for(let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

/* An envelope that always ends at zero. The exponential tail has to aim at a small
   positive number rather than 0 — WebAudio refuses a ramp to zero and, again, refuses
   it silently. */
function env(node, t0, dur, peak, attack = 0.006){
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + Math.min(attack, dur * 0.5));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  node.connect(g);
  g.connect(master);
  return g;
}

function tone(f, dur, o = {}){
  if(!ctx) return;
  const t0 = ctx.currentTime + (o.at || 0);
  const osc = ctx.createOscillator();
  osc.type = o.type || 'sine';
  osc.frequency.setValueAtTime(f, t0);
  if(o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t0 + dur);
  env(osc, t0, dur, o.gain == null ? 0.12 : o.gain);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

function noise(dur, o = {}){
  if(!ctx) return;
  const t0 = ctx.currentTime + (o.at || 0);
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf();
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = o.type || 'lowpass';
  f.frequency.setValueAtTime(o.cut || 1200, t0);
  f.Q.value = o.q == null ? 1 : o.q;
  if(o.sweepTo) f.frequency.exponentialRampToValueAtTime(o.sweepTo, t0 + dur);
  src.connect(f);
  env(f, t0, dur, o.gain == null ? 0.12 : o.gain);
  src.start(t0);
  src.stop(t0 + dur + 0.03);
}

// a run of notes, which is most of what a cue is
function run(freqs, dur, o = {}){
  freqs.forEach((f, i) => tone(f, dur, { ...o, at: (o.at || 0) + i * (o.step || 0.07) }));
}

/* ── the cues ──
   Pentatonic and mostly triads, so two landing near each other cannot sound wrong.
   Kept quiet on purpose: this plays under a thumb on a phone, and the loudest thing
   in the mix should be the one that means you are being attacked. */
export const CUES = {
  tap:     () => tone(520, 0.045, { gain: 0.05 }),
  deny:    () => { tone(190, 0.10, { type:'square', gain:0.06 });
                   tone(138, 0.15, { type:'square', gain:0.05, at:0.07 }); },
  // a mallet on timber: the strike, then the body of the beam
  build:   () => { noise(0.08, { gain:0.15, cut:1100, sweepTo:220 });
                   tone(104, 0.20, { type:'triangle', gain:0.13 }); },
  done:    () => run([523, 659, 784], 0.32, { type:'triangle', gain:0.10, step:0.075 }),
  drill:   () => { noise(0.055, { gain:0.13, cut:2800, q:2 });
                   tone(392, 0.13, { type:'square', gain:0.06, at:0.03 }); },
  // reforging: an arpeggio with a bright tail over it
  promote: () => { run([523, 659, 784, 1047], 0.44, { type:'triangle', gain:0.09, step:0.06 });
                   noise(0.55, { type:'highpass', gain:0.045, cut:4800, q:0.7, at:0.10 }); },
  // three drum strokes and a horn behind them
  march:   () => { [0, 0.17, 0.34].forEach(t => noise(0.11, { gain:0.18, cut:190, at:t }));
                   tone(196, 0.50, { type:'sawtooth', gain:0.065, at:0.10 }); },
  win:     () => run([392, 523, 659, 784], 0.46, { type:'sawtooth', gain:0.07, step:0.085 }),
  loss:    () => { tone(220, 0.75, { type:'sawtooth', gain:0.085, to:104 });
                   noise(0.85, { gain:0.095, cut:420, sweepTo:90 }); },
  // two-note horn, twice — the one cue allowed to cut through
  alarm:   () => [0, 0.30].forEach(t => { tone(587, 0.21, { type:'square', gain:0.085, at:t });
                                          tone(440, 0.24, { type:'square', gain:0.075, at:t + 0.11 }); }),
  coin:    () => { tone(988, 0.065, { gain:0.06 }); tone(1319, 0.10, { gain:0.05, at:0.05 }); },
  beast:   () => { tone(88, 0.55, { type:'sawtooth', gain:0.12, to:60 });
                   noise(0.50, { gain:0.085, cut:320, q:3 }); },
  hero:    () => run([659, 880, 1047, 1319], 0.52, { gain:0.085, step:0.055 }),
};

/* How soon the same cue may play again. This is what lets the action handler and the
   watcher both be honest without co-ordinating: tapping Promote fires `promote`
   immediately, the watcher notices the tier went up a frame later and asks for
   `promote` again, and the second one is dropped here rather than by either caller
   knowing about the other. It also stops a held button machine-gunning. */
const GAP = { tap: 45, coin: 90, drill: 140 };
const DEFAULT_GAP = 300;
const last = {};

export function cue(name){
  if(!prefs.sfx || !ctx) return false;
  const c = CUES[name];
  if(!c) return false;                        // an unknown name is silence, never a throw
  const t = ctx.currentTime * 1000;
  if(last[name] != null && t - last[name] < (GAP[name] || DEFAULT_GAP)) return false;
  last[name] = t;
  try { c(); return true; } catch { return false; }
}

/* What a tap should sound like the instant it lands, before any state has changed.
   Immediate feedback belongs to the button; the watcher covers what happens without
   you. Where both would speak, the debounce above keeps only the first. */
const ACT_CUE = {
  upgrade:'build', finishBuild:'done', train:'drill', finishTrain:'drill',
  promote:'promote', march:'march', hunt:'march', voyage:'march',
  research:'build', finishResearch:'done', gear:'build', finishGear:'promote',
  heal:'drill', finishHeal:'done', claimEvent:'coin', claimDaily:'coin',
  expedition:'coin', caravan:'coin', raiseShield:'done', order:'alarm',
};
export function cueAction(action, ok = true){
  return cue(ok ? (ACT_CUE[action] || 'tap') : 'deny');
}

/* ── the bed ──
   Wind off the Reach: looped noise under a lowpass, drifting. It thickens as the next
   wave closes, which makes the countdown something you can feel without reading it. */
function startBed(){
  if(!ctx || bed) return;
  try {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf();
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 260; f.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.value = BED_QUIET;   // the level a quiet fortnight sits at
    // a slow drift so it never sits perfectly still, which is what makes a loop audible
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 0.07; lg.gain.value = 90;
    lfo.connect(lg); lg.connect(f.frequency);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(); lfo.start();
    bed = { src, f, g, lfo };
  } catch {}
}
function stopBed(){
  if(!bed) return;
  try { bed.src.stop(); bed.lfo.stop(); bed.g.disconnect(); } catch {}
  bed = null;
}

/* How loud the wind is at a given threat, named rather than inlined so it can be checked
   as a number. `ambience` moves toward it with setTargetAtTime, which is an exponential
   approach that never formally arrives — so an offline render of the RAMP measures the
   ramp, not the level, and cannot be used to ask "is the wind subordinate to the cues".
   The probe compares this against a measured base level instead. */
/* These are GAIN on the noise source, not the amplitude you hear: the bed runs through a
   260 Hz lowpass at Q 0.8, which throws away most of white noise's energy, so the peak
   that reaches the ear is roughly 0.3× the number here. The first version used 0.010 and
   0.042 — chosen to look like sensible gains next to the cues — and measured 0.003 at
   rest, which is 34 dB under the loudest cue and inaudible on a phone. The probe is the
   only reason that was ever noticed; it cannot be heard by reading the code. */
export const BED_QUIET = 0.05, BED_LOUD = 0.15;
export function bedLevel(level){
  return BED_QUIET + (BED_LOUD - BED_QUIET) * Math.max(0, Math.min(1, level));
}

export function ambience(level){
  if(!bed || !ctx) return;
  const l = Math.max(0, Math.min(1, level));
  try {
    bed.g.gain.setTargetAtTime(bedLevel(l), ctx.currentTime, 1.6);
    bed.f.frequency.setTargetAtTime(240 + 520 * l, ctx.currentTime, 1.6);
  } catch {}
}

/* ── the watcher ──
   Reads state, remembers a handful of numbers, and fires at most one cue per call.
   PRIORITY order, highest first: anything about being attacked outranks anything about
   a building finishing. `watch` never writes to `s`.

   Every name below is checked against CUES by the suite, because this codebase has
   shipped a name that matched nothing three separate times — a building with no plot,
   a sprite tier that round-tripped wrong, and a `rand` handed to a function that had
   no such parameter. A cue name is exactly that shape of mistake. */
const SIGNALS = [
  { cue:'loss',    of: s => (s.banner && s.banner.cls === 'loss') ? s.banner.until : 0 },
  { cue:'win',     of: s => (s.banner && s.banner.cls === 'win')  ? s.banner.until : 0 },
  { cue:'beast',   of: s => s.beastsSlain || 0 },
  { cue:'promote', of: s => sum(s.tier) },
  { cue:'hero',    of: s => Object.keys(s.heroes || {}).length },
  { cue:'march',   of: s => (s.marches || []).length },
  { cue:'done',    of: s => sum(s.b) },
  { cue:'drill',   of: s => sum(s.t) },
];
function sum(o){ let n = 0; for(const k in o) n += o[k] || 0; return n; }

let seen = null, warned = 0;

export function watch(s){
  if(!s) return null;
  const now = { wave: s.nextWave || 0 };
  for(const sig of SIGNALS) now[sig.cue] = sig.of(s);

  if(!seen){ seen = now; warned = s.nextWave || 0; return null; }

  let fired = null;
  for(const sig of SIGNALS){
    // marches only count going UP: a column coming home lowers the count and is
    // already announced by its own banner
    if(now[sig.cue] > seen[sig.cue]){ fired = sig.cue; break; }
  }

  /* The horn, at most once per wave. It is the only cue the game generates on a timer
     rather than in answer to a tap, so it is also the only one that can nag. */
  const left = (s.nextWave || 0) - (s.now || 0);
  if(!fired && left > 0 && left < 8000 && warned !== s.nextWave){
    warned = s.nextWave;
    fired = 'alarm';
  }
  if(warned !== s.nextWave && left >= 8000) warned = 0;

  seen = now;
  if(fired) cue(fired);
  if(prefs.amb) ambience(1 - Math.max(0, Math.min(1, left / WAVE_MS)));
  return fired;
}

// so a test can drive watch() from a known baseline
export function forget(){ seen = null; warned = 0; }
