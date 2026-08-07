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
    /* ── the bus ──
       A DynamicsCompressor was tried here as a safety net for overlapping cues and removed again:
       measured, it cost every cue about 10ms of lookahead latency and squashed the quiet ones
       hard — `build` fell from 0.118 peak to 0.029. A limiter that makes the game quieter and
       less responsive is not a safety net, and with ×8 headroom there was nothing to save. */
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);

    if(prefs.amb) startBed();
  } catch { ctx = null; }
}

/* ── the room, and why it is not a reverb node ──
   Two versions of this were built and neither survived contact with the harness. A ConvolverNode
   with a generated 1.1-second impulse never finished rendering offline. Four delay lines feeding
   back never finished either, and bisecting showed it was the CYCLE rather than the amount of
   feedback — loop gain zero still hung, cutting the one closing connection fixed it. Eight
   non-recirculating taps hung as well. Chrome's OfflineAudioContext and DelayNode do not get
   along here, and the failure looks exactly like a silent cue, which is the worst shape it could
   have taken.

   A fourth attempt scheduled the reflections as extra voices with no delay nodes at all. That
   rendered for simple cues and hung for the arpeggios, and it is neither the per-reflection
   filters nor the panners: `done` renders at 6 scheduled voices and hangs at 18. Chrome's offline
   renderer gives out well below what a real context handles, and the failure is indistinguishable
   from a silent cue — stuck at "rendering…", no exception, nothing in the console.

   Shipping reverb would mean shipping it unmeasured, in the one layer of this project that exists
   because it IS measured. So the cues are dry, and the three things that could be verified were
   done instead: variation, unison and stereo placement. If space is wanted later the honest route
   is a test on a real device, not this harness. */

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
/* Every voice now lands somewhere in the stereo field rather than connecting straight to the
   master. Nothing in this file had ever touched a StereoPanner, so every sound in the game arrived
   from a single point in the middle of the listener's head. */
function env(node, t0, dur, peak, attack = 0.006, o = {}){
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + Math.min(attack, dur * 0.5));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  node.connect(g);
  let out = g;
  if(ctx.createStereoPanner){
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, o.pan == null ? 0 : o.pan));
    g.connect(p);
    out = p;
  }
  out.connect(master);
  return g;
}

/* ── variation ──
   The old cues were deterministic: `tap` was 520 Hz for 45 ms, bit-identical on every press, and
   it fires on every button in the game. Identical repetition is the fastest way to make a sound
   feel cheap, and it is the thing a human notices within a minute of play that no peak/RMS
   measurement will ever report. Every voice is now nudged a few cents and a few milliseconds. */
const vary = (v, pct) => v * (1 + (Math.random() * 2 - 1) * pct);

function tone(f, dur, o = {}){
  if(!ctx) return;
  const t0 = ctx.currentTime + (o.at || 0) + Math.random() * 0.006;
  const freq = vary(f, o.jitter == null ? 0.012 : o.jitter);
  /* Unison: two or three oscillators a few cents apart, spread across the stereo field. One bare
     oscillator is a test tone; three detuned ones are an instrument, and the beating between them
     is most of what "body" means. Percussion passes voices:1 and stays a single source. */
  const n = o.voices == null ? 1 : o.voices;
  const peak = (o.gain == null ? 0.12 : o.gain) / Math.sqrt(n);
  for(let i = 0; i < n; i++){
    const spread = n === 1 ? 0 : (i / (n - 1) - 0.5) * 2;      // -1 … +1
    const pan = (o.pan || 0) + spread * (o.width == null ? 0.35 : o.width);
    const voice = (at, g, pn, cut) => {
      const osc = ctx.createOscillator();
      osc.type = o.type || 'sine';
      osc.frequency.setValueAtTime(freq * (1 + spread * 0.004), at);
      if(o.to) osc.frequency.exponentialRampToValueAtTime(vary(o.to, 0.01), at + dur);
      let src = osc;
      if(cut){                                  // reflections come back darker, as they do in a room
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass'; f.frequency.value = cut;
        osc.connect(f); src = f;
      }
      env(src, at, dur, g, o.attack, { pan: pn });
      osc.start(at);
      osc.stop(at + dur + 0.03);
    };
    voice(t0, peak, pan, 0);
  }
}

function noise(dur, o = {}){
  if(!ctx) return;
  const t0 = ctx.currentTime + (o.at || 0) + Math.random() * 0.005;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf();
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = o.type || 'lowpass';
  f.frequency.setValueAtTime(vary(o.cut || 1200, 0.06), t0);
  f.Q.value = o.q == null ? 1 : o.q;
  if(o.sweepTo) f.frequency.exponentialRampToValueAtTime(vary(o.sweepTo, 0.06), t0 + dur);
  src.connect(f);
  const g0 = vary(o.gain == null ? 0.12 : o.gain, 0.08);
  const pan0 = o.pan == null ? 0 : o.pan;
  env(f, t0, dur, g0, o.attack, { pan: pan0 });
  /* Start from a random point in the 1.5s buffer. Every percussive cue in the game is this one
     buffer through a filter, so always entering at sample zero meant every strike was the same
     strike — the noise was random once, at startup, and deterministic forever after. */
  src.start(t0, Math.random() * 1.2);
  src.stop(t0 + dur + 0.03);
}

function run(freqs, dur, o = {}){
  /* Notes walk across the field as they rise. Stacked at dead centre an arpeggio is a stack of
     beeps; spread across a third of the width it reads as a phrase being played. */
  freqs.forEach((f, i) => {
    const at = (o.at || 0) + i * (o.step || 0.07);
    const pan = freqs.length < 2 ? 0 : ((i / (freqs.length - 1)) - 0.5) * 0.7;
    tone(f, dur, { ...o, at, pan: (o.pan || 0) + pan });
  });
}

/* ── the cues ──
   Pentatonic and mostly triads, so two landing near each other cannot sound wrong.
   Kept quiet on purpose: this plays under a thumb on a phone, and the loudest thing
   in the mix should be the one that means you are being attacked. */
export const CUES = {
  /* voices:1 keeps a source mono and single; pan places it; wet is how much room it feeds.
     Percussion sits dry and centred, horns and arpeggios are wide and wet — that contrast is
     most of what makes a set of cues sound like one place rather than a list of beeps. */
  tap:     () => tone(520, 0.045, { gain: 0.05, voices:1, wet:0.25, jitter:0.03 }),
  deny:    () => { tone(190, 0.10, { type:'square', gain:0.06, voices:1, wet:0.3 });
                   tone(138, 0.15, { type:'square', gain:0.05, at:0.07, voices:1, wet:0.3 }); },
  // a mallet on timber: the strike, then the body of the beam
  build:   () => { noise(0.08, { gain:0.15, cut:1100, sweepTo:220, wet:0.35, pan:-0.15 });
                   tone(104, 0.20, { type:'triangle', gain:0.13, width:0.2, wet:0.5 }); },
  done:    () => run([523, 659, 784], 0.32, { type:'triangle', gain:0.10, step:0.075, wet:0.9 }),
  drill:   () => { noise(0.055, { gain:0.13, cut:2800, q:2, wet:0.3, pan:0.2 });
                   tone(392, 0.13, { type:'square', gain:0.06, at:0.03, wet:0.4 }); },
  // reforging: an arpeggio with a bright tail over it
  promote: () => { run([523, 659, 784, 1047], 0.44, { type:'triangle', gain:0.09, step:0.06, wet:1 });
                   noise(0.55, { type:'highpass', gain:0.045, cut:4800, q:0.7, at:0.10, wet:1 }); },
  /* three drum strokes and a horn behind them. The strokes alternate across the field, which is
     what makes a repeated hit read as a marching column rather than one drum played three times. */
  march:   () => { [[0,-0.4],[0.17,0.35],[0.34,-0.2]].forEach(([t,pan]) =>
                     noise(0.11, { gain:0.18, cut:190, at:t, pan, wet:0.5 }));
                   tone(196, 0.50, { type:'sawtooth', gain:0.065, at:0.10, width:0.5, wet:1 }); },
  win:     () => run([392, 523, 659, 784], 0.46, { type:'sawtooth', gain:0.07, step:0.085, wet:1 }),
  loss:    () => { tone(220, 0.75, { type:'sawtooth', gain:0.085, to:104, width:0.45, wet:1 });
                   noise(0.85, { gain:0.095, cut:420, sweepTo:90, wet:0.8 }); },
  // two-note horn, twice — the one cue allowed to cut through, so it stays wide and wet
  alarm:   () => [0, 0.30].forEach(t => { tone(587, 0.21, { type:'square', gain:0.085, at:t, width:0.55, wet:1 });
                                          tone(440, 0.24, { type:'square', gain:0.075, at:t + 0.11, width:0.55, wet:1 }); }),
  coin:    () => { tone(988, 0.065, { gain:0.06, voices:1, wet:0.5, pan:0.25 });
                   tone(1319, 0.10, { gain:0.05, at:0.05, voices:1, wet:0.5, pan:-0.2 }); },
  beast:   () => { tone(88, 0.55, { type:'sawtooth', gain:0.12, to:60, width:0.5, wet:0.8 });
                   noise(0.50, { gain:0.085, cut:320, q:3, wet:0.7 }); },
  hero:    () => run([659, 880, 1047, 1319], 0.52, { gain:0.085, step:0.055, wet:1 }),
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
