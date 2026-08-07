// The sound spec: `npm run sounds`
//
// Prints what a sound designer needs to deliver, in the order the cues matter. The audio layer
// is synthesised and always will be as a FALLBACK — what this describes is the recorded set that
// replaces it, one cue at a time, by dropping files into sfx/ and naming them in a manifest.
//
// Same shape as `npm run sprites`: the pipeline shipped before the assets, because a spec you can
// hand to someone is the thing that unblocks the assets, and a game that plays silently while it
// waits is worse than one that plays a synthesised beep.

const CUES = [
  ['alarm',   0.6, 'ALARM — a raid is inbound',
              'Two-note horn, twice. The one cue allowed to cut through everything; it is the only sound that means act now. Distant, brass, a little ugly.'],
  ['tap',    0.08, 'the sound of a button',
              'The most-played sound in the game by an order of magnitude — it fires on EVERY press, so it must survive ten thousand repetitions. Short, soft, woody. If in doubt make it quieter.'],
  ['build',  0.35, 'a building goes up a level',
              'A mallet on timber: the strike, then the body of the beam. Should feel like weight landing, not a click.'],
  ['done',    0.5, 'something finishes while you watch',
              'Small rising figure, warm. Satisfaction without fanfare — it fires often.'],
  ['drill',  0.25, 'troops are trained',
              'Iron on leather, a drum edge. Brisk and dry.'],
  ['promote', 0.7, 'a whole troop line is reforged a tier up',
              'The big one for progression. An arpeggio with a bright metallic tail — a forge, not a chime.'],
  ['march',   0.8, 'a column leaves the gate',
              'Three drum strokes and a horn behind them. Should sound like it is walking away from you.'],
  ['win',     0.7, 'a raid or wave is won',
              'Rising, brass-led, brief. Triumph that does not outstay a 75-second wave cadence.'],
  ['loss',    0.9, 'a raid or wave is lost',
              'Falling, low, a little hollow. Must not be punishing — losing is normal here and this plays a lot.'],
  ['coin',   0.15, 'Valor or loot arrives',
              'Bright, small, metallic. Two notes at most.'],
  ['beast',   0.7, 'a beast is engaged on the frontier',
              'Low animal weight — a growl with body under it. The only cue with something alive in it.'],
  ['hero',    0.8, 'a captain is drafted',
              'The rarest cue in the game and the one that should feel like an event. Warm, ascending, four notes.'],
  ['deny',   0.25, 'the action was refused',
              'Two low notes, flat. Should read as "not yet", never as an error — the player has done nothing wrong.'],
];

const BED = ['wind', 'a seamless loop, 30s or longer',
  'Wind off the Reach, under everything. It thickens as the next wave closes, so it must loop with NO audible seam and carry no rhythm of its own. Mixed to sit far under the cues — about 25 dB down.'];

const W = 78;
const wrap = (t, indent) => {
  const pad = ' '.repeat(indent);
  const out = []; let line = '';
  for(const word of t.split(' ')){
    if((line + word).length > W - indent){ out.push(pad + line.trim()); line = ''; }
    line += word + ' ';
  }
  if(line.trim()) out.push(pad + line.trim());
  return out.join('\n');
};

console.log('\n  CROWNHOLD — sound spec\n  ' + '─'.repeat(W - 2));
console.log(wrap('Thirteen effects and one ambient loop. Everything is currently synthesised at '
  + 'runtime and will keep working as a fallback, so these can be delivered in ANY ORDER and '
  + 'one at a time — each file replaces its cue the moment it is dropped in.', 2));
console.log('\n  FORMAT   Opus in .webm preferred (mp3 as a fallback for older Safari), mono,');
console.log('           48 kHz, normalised so the loudest cue peaks near -12 dBFS. Trim silence');
console.log('           from the head — these are triggered sounds and any lead-in reads as lag.');
console.log('  BUDGET   The whole game is one 314 KB file today. Keep the thirteen effects under');
console.log('           200 KB together; the ambient loop ships separately and is optional.');
console.log('  PERIOD   Medieval, and grounded — timber, stone, iron, horn, drum. No synthesis,');
console.log('           no electronic tails, nothing that sounds like a phone notification.\n');

console.log('  ' + '─'.repeat(W - 2));
console.log('  cue        secs   what it means');
console.log('  ' + '─'.repeat(W - 2));
for(const [name, secs, means, notes] of CUES){
  console.log('  ' + name.padEnd(10) + String(secs).padStart(4) + '   ' + means);
  console.log(wrap(notes, 17));
  console.log('');
}
console.log('  ' + BED[0].padEnd(10) + '   —   ' + BED[1]);
console.log(wrap(BED[2], 17));

console.log('\n  ' + '─'.repeat(W - 2));
console.log('  DELIVERY  put the files in sfx/ and list them in sfx/manifest.json:');
console.log('');
console.log('    { ' + CUES.slice(0, 3).map(c => '"' + c[0] + '": "' + c[0] + '.webm"').join(', ') + ', … }');
console.log('');
console.log(wrap('Only the names present are used; the rest stay synthesised. A missing manifest, '
  + 'a 404 or a file that will not decode all fall back silently, so a half-delivered set is '
  + 'never a broken game.', 2));
console.log('');
