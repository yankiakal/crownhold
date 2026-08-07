// Verification for the UI layer. Run from the repo root:  npm run verify:ui
//
// Until this existed, nothing checked rendering at all. `npm run build` only
// proves the imports resolve, and verify-skills.mjs deliberately never touches
// the DOM — so a render that threw, or printed "undefined", or said "spearmans",
// would ship silently. That last one did: it took printing the march builder as
// flat text to notice the game had been pluralising troop names by bolting an
// "s" on the end.
//
// The approach is a stub DOM just rich enough for ui.js to run against, then a
// full render() of every panel, then the column composer on its own.
//
// The composer needs a wrinkle. It is only reachable in the real app by tapping
// a map tile, and it reads two module-local variables (which leaders are picked,
// how many of each troop) that a tap sets. Rather than export test hooks from
// shipped code, this copies src/ to a temp directory and appends the two exports
// THERE. The copy is byte-identical apart from those lines, so what runs is the
// real code — and the shipped bundle carries nothing that exists for a test.

import { mkdtempSync, cpSync, appendFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

let pass = 0, fail = 0;
const ok = (name, cond, note='') => { cond ? pass++ : fail++;
  console.log((cond ? '  ✓ ' : '  ✗ ') + name + (note ? '  — ' + note : '')); };

/* ── a DOM with just enough surface for ui.js and the isometric renderer ── */
/* The stub records fillText, so the suite can assert what the canvas was ASKED to draw.
   Everything else about a canvas is unobservable here, which is why the map went for
   versions without the player's own hold on it: drawMap threw no error, rendered nothing
   checkable, and the only witness was a screenshot nobody took. */
const drawn = [];
const ctx2d = new Proxy({}, { get:(t, k) => {
  if(k === 'canvas') return { width:360, height:360 };
  if(k === 'measureText') return () => ({ width:10 });
  if(k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop(){} });
  if(k === 'getImageData') return () => ({ data:new Uint8ClampedArray(4) });
  if(k === 'fillText') return (txt, x, y) => { drawn.push({ txt:String(txt), x, y }); };
  return typeof k === 'string' ? (() => {}) : undefined;
}, set: () => true });

/* `style` is a real CSSStyleDeclaration in a browser, with methods. Leaving it as a bare {}
   meant render() crashed the whole suite the moment it published the header's height as a custom
   property — offsetHeight also needs to exist, or the value written is "undefinedpx". */
const el = () => ({ style:{ setProperty(){}, removeProperty(){}, getPropertyValue: () => '' },
  offsetHeight:0, offsetWidth:0,
  dataset:{}, classList:{ add(){}, remove(){}, toggle(){} },
  appendChild(){}, addEventListener(){}, removeEventListener(){}, setAttribute(){},
  querySelectorAll: () => [], querySelector: () => null, innerHTML:'', textContent:'',
  width:360, height:360, parentNode:null, remove(){},
  getBoundingClientRect: () => ({ width:360, height:360, left:0, top:0 }),
  getContext: () => ctx2d });

const nodes = {};
globalThis.document = { createElement: el, body: el(), documentElement: el(),
  querySelector: () => el(), querySelectorAll: () => [], addEventListener(){},
  getElementById: id => (nodes[id] = nodes[id] || el()) };
globalThis.window = { addEventListener(){}, removeEventListener(){},
  matchMedia: () => ({ matches:false, addEventListener(){} }),
  location:{ href:'', search:'' }, innerWidth:390, innerHeight:844, devicePixelRatio:1,
  localStorage:{ getItem: () => null, setItem(){}, removeItem(){} },
  requestAnimationFrame: () => 0, cancelAnimationFrame(){} };
globalThis.localStorage = window.localStorage;
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};
globalThis.matchMedia = window.matchMedia;
globalThis.addEventListener = () => {};
globalThis.devicePixelRatio = 1;
globalThis.ResizeObserver = class { observe(){} unobserve(){} disconnect(){} };

/* ── the temp copy, with the composer and its two locals reachable ── */
const dir = mkdtempSync(join(tmpdir(), 'crownhold-ui-'));
cpSync(new URL('../src', import.meta.url), join(dir, 'src'), { recursive:true });
appendFileSync(join(dir, 'src', 'ui.js'),
  '\nexport { renderColumnComposer as _composer };' +
  '\nexport function _pick(ids, want){ marchParty = ids.slice(); marchWant = want; }' +
  // the settings sheet is behind a footer tap, and its open flag is module-local
  '\nexport function _openSettings(){ settingsOpen = true; }' +
  // chatBox is createElement'd and appended to body, so the stub's getElementById never sees it
  '\nexport { chatBox as _chatBox };\n');
/* Same seam for net.js: the session is module-local, and the App Store's account-deletion control
   only exists when signed in — so without a way to fake a session there is nothing to assert, and
   the requirement would be untested until a reviewer found it missing. */
appendFileSync(join(dir, 'src', 'net.js'),
  '\nexport function _fakeSession(name){ session = { name, token:\'test\' }; online = true; }\n');
const from = f => import(pathToFileURL(join(dir, 'src', f)).href);

try {
  const D  = await from('defs.js');
  const L  = await from('logic.js');
  const ST = await from('state.js');
  const UI = await from('ui.js');
  const W  = await from('world.js');

  /* A mid-game hold with a captain of every troop class, two seasons in so the
     seasonal systems are live. Skills are left unequipped: writing them straight
     into the array bypasses the legality gate, and an illegal skill makes the
     figures on screen fiction. */
  const now = D.SEASON_EPOCH + 2 * D.SEASON_MS;
  const s = ST.freshState(now, 42);
  s.seenIntro = true;
  Object.assign(s.b, { townhall:20, command:30, academy:27, barracks:10,
    range:8, stable:8, siegeyard:8, kitchen:10, farm:25, granary:10 });
  s.tier = { spearman:5, archer:5, knight:5, ballista:5 };
  s.t = { spearman:400, archer:200, knight:120, ballista:60 };
  for(const id of ['marshal','gatekeeper','forager','steward'])
    s.heroes[id] = { lvl:20, xp:0, stars:3, deeds:0, gear:{}, skills:[null,null,null] };
  s.court = ['steward'];
  s.now = now;
  ST.store.s = s;

  console.log('\n── every panel renders ──');
  UI.render();
  const full = (nodes.app && nodes.app.innerHTML) || '';
  ok('render() produced a hold', full.length > 5000, full.length + ' chars');
  ok('no "undefined" reached the page', !/undefined/.test(full));
  ok('no "NaN" reached the page', !/NaN/.test(full));
  /* The build stamp has to be ON SCREEN, not merely defined. Its whole purpose is
     answering "which version am I looking at" during a test, and a stamp that exists only
     in the bundle answers nothing. `dev` is the value when src/ is imported without Vite,
     which is exactly what this suite does. */
  ok('the build stamp is rendered', /build (dev|[0-9a-f]{6,})/.test(full),
     (full.match(/build [^<]{0,24}/) || ['(absent)'])[0]);
  /* And the RELEASE number, which is the part a person actually reads. A commit hash answers
     "are these two builds the same"; it does not answer "am I on the version you just told me
     about", which is the question that gets asked. */
  ok('and the release number beside it', /class="vtag"[^>]*>(v\d+\.\d+|dev)</.test(full),
     (full.match(/class="vtag"[^>]*>([^<]+)/) || [,'(absent)'])[1]);

  /* ── the frontier draws the player's own hold ──
     It did not, for every version up to this one. genWorld keeps the middle nine cells
     clear for it in two separate loops, every distance in the world is measured from that
     square, and drawMap never put anything there — so the map was a ring of targets around
     a hole. Asserted against the canvas calls, because that is the only thing observable
     from here. */
  const C = 56;
  const home = drawn.find(d => d.txt === '\u{1F3F0}' &&
    Math.abs(d.x - (W.CX*C + C/2)) < 2 && Math.abs(d.y - (W.CY*C + C/2 - 4)) < 2);
  ok('the frontier shows your hold at its centre', !!home,
     home ? 'at ' + home.x + ',' + home.y : 'nothing drawn at ' + (W.CX*C + C/2) + ',' + (W.CY*C + C/2 - 4));
  ok('and labels it', drawn.some(d => d.txt === 'HOLD'));

  /* ── and it shows the columns on the road ──
     Asked for directly: "can I also see some kind of marching animation in the frontier when the
     march is going and returning — I want to see them on the map, the position."

     The geometry is asserted in verify-skills.mjs; what this checks is that the renderer actually
     puts a marker on the canvas, at the interpolated position rather than on the destination cell.
     Drawing it on the target would look almost right and be exactly the old behaviour. */
  {
    const idx = s.world.tiles.findIndex(t => W.TILE_TYPES[t.type].kind === 'gather' && !W.tileLocked(s, t));
    const started = idx >= 0 && W.startMarch(s, idx, { spearman:40 }, s.now, false, []);
    ok('a column is on the road to measure', !!started);
    if(started){
      const m = s.marches[s.marches.length - 1];
      const tile = s.world.tiles[idx];
      // a quarter of the way out: far enough from both ends that neither can be mistaken for it
      s.now = m.arriveAt - m.out * 0.75;
      drawn.length = 0;
      UI.render();
      const mark = drawn.find(d => d.txt === '▶' || d.txt === '◀');
      ok('the frontier draws a marker for a column in transit', !!mark,
         mark ? 'at ' + Math.round(mark.x) + ',' + Math.round(mark.y) : 'no marker drawn');
      if(mark){
        const onTarget = Math.hypot(mark.x - (tile.x*C + C/2), mark.y - (tile.y*C + C/2)) < 4;
        const onHome = Math.hypot(mark.x - (W.CX*C + C/2), mark.y - (W.CY*C + C/2)) < 4;
        ok('and places it between the hold and the node, not on either', !onTarget && !onHome,
           'marker ' + Math.round(mark.x) + ',' + Math.round(mark.y)
           + ' · hold ' + (W.CX*C + C/2) + ',' + (W.CY*C + C/2)
           + ' · node ' + (tile.x*C + C/2) + ',' + (tile.y*C + C/2));
        ok('and points it outbound', mark.txt === '▶', mark.txt);
      }
      // and turned around, it points the other way
      s.now = (m.homeAt - m.out) + m.out * 0.5;
      drawn.length = 0;
      UI.render();
      const back = drawn.find(d => d.txt === '▶' || d.txt === '◀');
      ok('a returning column points home', back && back.txt === '◀', back ? back.txt : 'no marker');
      s.marches.length = 0;
      s.now = now;
    }
  }

  /* ── the phone layout ──
     Measured with `npm run phone` at real phone widths, the single column ran 11.8 screens
     on an iPhone SE. Tabs cut it to 4.6. Asserted here as structure rather than pixels: every
     tab must have a pane, exactly one may be active, and every pane's panels must still be
     in the DOM — they are hidden by CSS, so a pane that stopped rendering would take its
     panels out of the desktop layout too, where there are no tabs at all. */
  /* Five tabs offline, not six. The Alliance tab needs a server — offline it held a single line
     telling you to sign in, which is a sixth of the navigation spent on an instruction. Its
     panels fold into the Ledger instead, so nothing becomes unreachable. This suite runs with no
     server, so the offline arrangement is what it sees. */
  const panes = [...full.matchAll(/data-pane="([a-z]+)"/g)].map(m => m[1]);
  ok('every tab that is offered has a pane',
     ['hold','war','world','court','ledger'].every(t => panes.includes(t)),
     [...new Set(panes)].join(', '));
  ok('and the Alliance tab is not offered while offline',
     !full.includes('data-act="tab" data-key="ally"'));
  /* The Alliance panel itself is still there — it is what invites you to sign in. The Muster
     Roll is NOT, because renderMusterRoll returns nothing without a server, which is correct and
     is why asserting on it was wrong: a test looking for something the offline game deliberately
     never draws. */
  ok('but the Alliance panel is still on the page, folded into the Ledger',
     /found or join one/.test(full));
  /* Matched on the `on` marker rather than an exact class string. The old pattern demanded
     `class="tabpane"` verbatim, so it silently matched nothing the moment panes gained base/sheet
     classes — and "nothing" collapsed to a Set of size 0, which is not 1, which is how a
     structural change surfaced as a mystery assertion failure. */
  const active = [...full.matchAll(/class="tabpane [^"]*\bon\b[^"]*" data-pane="([a-z]+)"/g)]
    .map(m => m[1]);
  ok('exactly one tab is active at a time', new Set(active).size === 1,
     'active: ' + ([...new Set(active)].join(', ') || 'none'));
  /* And the hold is always the base beneath it — that is the whole arrangement. */
  ok('the hold is always present as the base view',
     /class="tabpane base[^"]*" data-pane="hold"/.test(full));
  ok('and the bar offers every tab it should', ['hold','war','world','court','ledger']
     .every(t => full.includes('data-act="tab" data-key="' + t + '"')));
  /* The panels themselves must survive — hidden, not removed. */
  ok('hidden panes still render their panels, for the desktop layout',
     /THE FRONTIER|Frontier/i.test(full) && /Muster/.test(full) && /Decrees/.test(full));

  /* ── the column composer: three captains, four classes ──
     The party covers spearman/archer/knight and leaves the ballista uncovered,
     with ballistae committed anyway. That is the exact case this UI exists to
     explain, and the case a fourth march seat would have deleted. */
  console.log('\n── the march builder explains the three-of-four choice ──');
  UI._pick(['marshal','gatekeeper','forager'],
           { spearman:120, archer:60, knight:40, ballista:30 });
  const h = UI._composer(s);
  const flat = h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  ok('a coverage strip is drawn', /class="affrow"/.test(h));
  ok('it counts the covered classes', /Captains cover.*>3\/4</s.test(h), (flat.match(/Captains cover \S+/)||[])[0]);
  ok('a covered class is lit', /class="aff on"/.test(h));
  ok('an uncovered class with troops in it is flagged', /class="aff bare"/.test(h));
  ok('the covered troop rows carry their figure', (h.match(/class="led"/g)||[]).length === 3,
     String((h.match(/class="led"/g)||[]).length) + ' of 3');
  ok('the uncovered row says so', /class="unled">no captain/.test(h));
  ok('and the cost is stated in words', /ride without a captain — no affinity/.test(flat));
  ok('no "undefined" in the composer', !/undefined/.test(h));
  ok('no "NaN" in the composer', !/NaN/.test(h));

  /* Plurals. The bug this file was written to catch — the game used to append an "s" to
     the singular, which is right for Archers and wrong for Spearmen. So the test is
     "every troop declares a plural", not "every plural is irregular": demanding
     irregularity would fail Archers, which is correct.

     Derived from TROOPS rather than spelled out. This block used to assert the literal
     word "ballistae" and broke the moment that line was renamed to the Battlemage —
     a test that pins today's nouns fails on a rename that changed nothing it was
     guarding. The property is "each declared plural reaches the screen, and no naive
     singular+s does", which survives any renaming. */
  console.log('\n── every troop declares its own plural ──');
  for(const [k, d] of Object.entries(D.TROOPS))
    ok(k + ' declares a plural', typeof d.plural === 'string' && d.plural.length > d.name.length - 2,
       d.plural);
  for(const [k, d] of Object.entries(D.TROOPS)){
    ok('the composer says "' + d.plural + '"', flat.includes(d.plural.toLowerCase()), d.plural);
    const naive = d.name.toLowerCase() + 's';
    if(naive !== d.plural.toLowerCase())
      ok('and never "' + naive + '"', !flat.includes(naive), 'irregular: ' + d.name + ' → ' + d.plural);
  }

  /* ── the road to the next Town Hall ──
     The pace gate is the only genuinely blocked goal in the game — closed for a third
     to a half of the late game, and unlike every other "waiting" signal I chased, not
     an artifact of the simulator's bot. So it has to read as a costed checklist rather
     than a refusal, and the checklist has to be correct: a step that cannot actually
     be started is worse than no step at all. */
  console.log('\n── the road to the next Town Hall is a checklist ──');
  {
    const r = ST.freshState(now, 42);
    r.seenIntro = true;
    r.b.townhall = 12;
    for(const k of ['farm','lumberyard','quarry','ironmine','barracks','wall']) r.b[k] = 11;
    r.res = { food:9e5, wood:9e5, stone:9e5, iron:9e5, steel:9e5, runestone:9e5 };
    ST.store.s = r;
    const p = L.townhallPath(r);
    ok('the gate is shut in this hold', !p.ok, p.have + ' of ' + p.need + ' at level ' + (p.toLvl-1));
    ok('it names exactly the shortfall', p.path.length === p.want,
       p.path.length + ' steps for a shortfall of ' + p.want);
    ok('every step is a real building below the target level',
       p.path.every(x => D.BUILDINGS[x.key] && (r.b[x.key]||0) < p.toLvl - 1),
       p.path.map(x => x.key + ' ' + (r.b[x.key]||0)).join(', '));
    ok('every step can reach the target level at all',
       p.path.every(x => D.BUILDINGS[x.key].max >= p.toLvl - 1));
    /* Required-then-cheapest, not cheapest-first. The named pair leads the list because it
       cannot be substituted — a route sorted purely by price would put two cheap buildings
       above a mandatory expensive one, and a player following it in order would do the
       cheap work first and still be refused. */
    const req = p.path.filter(x => x.required), rest = p.path.filter(x => !x.required);
    ok('the named pair leads the road', p.path.slice(0, req.length).every(x => x.required),
       p.path.map(x => x.key + (x.required ? '*' : '')).join(' → '));
    ok('and the substitutable steps after it are cheapest first',
       rest.every((x, i) => i === 0 || rest[i-1].weight <= x.weight),
       rest.map(x => x.weight).join(' ≤ ') || 'none');
    ok('no step is the Town Hall itself', !p.path.some(x => x.key === 'townhall'));
    // and the whole road renders into the hold panel
    UI.render();
    const road = (nodes.app && nodes.app.innerHTML) || '';
    ok('the road is drawn in the hold', /class="road"/.test(road));
    ok('it names the Town Hall level it leads to', road.includes('Town Hall ' + p.toLvl));
    ok('no "undefined" or "NaN" in it', !/undefined|NaN/.test(road));

    /* And when the gate opens it must flip to the raise itself, not keep listing
       chores. A checklist that stays up after it is satisfied is a lie. */
    /* Satisfying the COUNT is no longer enough — the two named buildings have to have kept
       pace as well, which is the entire point of the change. This block used to raise six
       cheap buildings and expect the gate to open; now it must also honour the pair, and
       that is exactly the player behaviour the rule is meant to force. */
    for(const k of ['farm','lumberyard','quarry','ironmine','barracks','wall']) r.b[k] = 12;
    for(const k of L.townhallPair(r.b.townhall + 1)) r.b[k] = L.pairLevel(k, r.b.townhall + 1);
    const p2 = L.townhallPath(r);
    ok('with the count AND the named pair met, the gate reads open', p2.ok && p2.path.length === 0,
       p2.have + ' of ' + p2.need + ', pair ' + p2.pair.join('+'));
    UI.render();
    const ready = (nodes.app && nodes.app.innerHTML) || '';
    ok('and the road offers the Town Hall itself', /class="road ready"/.test(ready));
  }

  /* ── every building has somewhere to stand ──
     kitchen and crucible shipped in v1.28 with no entry in PLOTS and none in
     LOOK, so drawBuilding() returned early and both were INVISIBLE in the hold
     for three versions: buildable, producing, and simply not drawn. No error, no
     log line, just an absence — the failure mode this project keeps repeating.
     The scene is data-driven from these two tables, so the test is one loop. */
  console.log('\n── the scene can draw every building ──');
  const ISO = await from('iso.js');
  const noPlot = Object.keys(D.BUILDINGS).filter(k => k !== 'wall' && !ISO.PLOTS[k]);
  const noLook = Object.keys(D.BUILDINGS).filter(k => k !== 'wall' && !ISO.LOOK[k]);
  ok('every building has a plot', noPlot.length === 0, noPlot.join(', ') || 'all placed');
  ok('every building has a look', noLook.length === 0, noLook.join(', ') || 'all styled');
  /* ── numbers, not English fractions ──
     Asked for directly: "instead of using English, use numbers everywhere so it's easier to
     understand for people all over the world" — "production rises a fifth", "drilling is a third
     faster". A written-out fraction needs English to parse; a percentage reads the same anywhere.

     The decrees were also the worst case of a second problem: the prose had drifted from the numbers
     beside it. "A third faster" sat next to trainTime 0.35 and "a fifth" next to production 0.20, so
     the copy was both unreadable to most of the world AND wrong. Those lines are generated from the
     values now, which is why this test can be strict. */
  const PROSE = /\b(a|one) (fifth|third|quarter|half|tenth|sixth|eighth)\b|\bdouble\b|\btwice\b|\bhalf of\b|counts double/i;
  const prose = [];
  for(const [k, d] of Object.entries(D.DECREES))
    if(PROSE.test(d.fx)) prose.push('decree ' + k + ': ' + d.fx);
  for(const m of D.MASTERY) if(PROSE.test(m.fx)) prose.push('mastery: ' + m.fx);
  for(const [k, b] of Object.entries(D.BUILDINGS)) if(PROSE.test(b.fx || '')) prose.push('building ' + k + ': ' + b.fx);
  ok('no player-facing effect describes a number in words', prose.length === 0,
     prose.join(' | ') || 'decrees, mastery and buildings all numeric');

  /* And every decree line must actually carry a figure, or "numeric" is satisfied by saying nothing. */
  const vague = Object.entries(D.DECREES).filter(([, d]) => !/[0-9]+%/.test(d.fx));
  ok('and every decree states its effect as a percentage', vague.length === 0,
     vague.map(([k]) => k).join(', ') || Object.keys(D.DECREES).length + ' decrees, all with figures');

  /* The generated line has to agree with the values it was generated from — including the sign flip
     on the inverted keys, which is the part a human writing this by hand got wrong. */
  ok('a reduction reads as a minus even though its value is positive',
     D.DECREES.ration.fx.includes('−33% upkeep'), D.DECREES.ration.fx);
  ok('and a penalty reads as a plus when the penalty is more of something',
     D.DECREES.blood.fx.includes('+25% casualties'), D.DECREES.blood.fx);

  /* ── and the price has to be RENDERED as a price ──
     Reported from play: "decree negative things should be in red." They were not. The panel had
     always meant to split the effect into a green half and a red half, and it did it by splitting
     `fx` on a ';' — so when v1.90 started generating that string with ' · ' between the halves, the
     split stopped matching, index [1] came back undefined, and the red span rendered EMPTY. Every
     downside was printed inside the green span, styled as a benefit, for two versions.

     The test above could not catch it: `fx` contained both halves and read perfectly. The bug was
     entirely in how the panel took it apart. So this asserts against the RENDERED HTML — the
     downside text has to appear immediately inside the element coloured `--bad`, for all five. */
  {
    UI.render();
    const html = (nodes.app && nodes.app.innerHTML) || '';
    const notRed = [], inGreen = [];
    for(const [k, d] of Object.entries(D.DECREES)){
      const down = D.decreeDown(d), up = D.decreeUp(d);
      if(!html.includes('color:var(--bad)">' + down)) notRed.push(k + ': ' + down);
      if(html.includes('color:var(--good)">' + up + ' · ')) inGreen.push(k);
    }
    ok('every decree renders its downside inside the red span', notRed.length === 0,
       notRed.join(' | ') || 'all ' + Object.keys(D.DECREES).length + ' priced in red');
    ok('and no downside is smuggled into the green one', inGreen.length === 0,
       inGreen.join(', ') || 'green carries the gift only');
  }

  /* ── the App Store's account-deletion requirement ──
     Guideline 5.1.1(v): an app offering account creation must offer deletion IN-APP. A hard
     rejection without it, and invisible until a reviewer looks — which makes it exactly the kind of
     thing a test should hold in place. Asserted on the rendered sheet, not on the existence of the
     endpoint, because a working endpoint no button reaches satisfies nobody. */
  {
    const NET = await from('net.js');
    UI._openSettings();
    ST.store.s = s;
    UI.render();
    const anon = (nodes.fx && nodes.fx.innerHTML) || '';
    ok('a solo hold is offered no account deletion', !/data-act="deleteAccount"/.test(anon),
       'nothing to delete when there is no account');

    NET._fakeSession('Aldis');
    UI._openSettings();
    UI.render();
    const signedIn = (nodes.fx && nodes.fx.innerHTML) || '';
    ok('a signed-in hold can delete its account from inside the app',
       /data-act="deleteAccount"/.test(signedIn));
    ok('and is asked for its password first', /id="delpw"/.test(signedIn));
    ok('and warned that it cannot be undone', /cannot be undone/i.test(signedIn));
    ok('the sheet still names the account being deleted', /Aldis/.test(signedIn));
    NET.logout();
  }

  /* ── the phone shell: who you are, and what was said ──
     Two pieces of the Whiteout-Survival-shaped shell. The chip carries the Town Hall level where the
     wordmark used to sit, and the chat bubble carries the last line anyone said rather than the word
     "Chat" — a button tells you chat exists, a bubble tells you whether it is worth opening. */
  {
    const NET2 = await from('net.js');
    ST.store.s = s;
    UI.render();
    const head = (nodes.app && nodes.app.innerHTML) || '';
    ok('the header carries a hold chip with the Town Hall level',
       /class="holdchip"><b>TH20<\/b>/.test(head),
       (head.match(/class="holdchip">[^<]*<b>[^<]*<\/b>[^<]*/) || ['(absent)'])[0]);

    /* The bubble only exists online — there is nobody to talk to solo. Rendered through the same
       fake-session seam the account-deletion test uses. */
    NET2._fakeSession('Aldis');
    UI.renderChat(true);
    const bub = UI._chatBox.innerHTML || '';
    ok('a chat bubble is offered when signed in', /class="chat-fab/.test(bub),
       bub ? bub.slice(0, 90) : '(nothing rendered)');
    ok('and it has room for a message, not just a label', /cf-msg/.test(bub));
    NET2.logout();
    UI.renderChat(true);
    ok('and no bubble at all when solo', !/chat-fab/.test(UI._chatBox.innerHTML || ''));
  }

  /* ── one quality ladder, and every colour on it earns its keep ──
     Asked for directly: "can we have colors from wow — uncommon green, blue rare, epic purple,
     orange legendary, artifact red."

     The trap in a palette is a colour that is defined and never reached: five grades declared, three
     ever rendered, and the two at the top exist only in the stylesheet. So this walks both ten-step
     ladders and asserts every grade is actually produced by one of them, and that each grade has a
     colour of its own — a duplicated hex would make two grades indistinguishable, which is the same
     bug as not having the colour at all. */
  {
    const GEAR = await from('gear.js');
    const bands = new Set();
    for(let t = 0; t <= GEAR.GEAR_MAX; t++) bands.add(D.qualityBand(t, GEAR.GEAR_MAX));
    for(let t = 1; t <= D.TIERS.length; t++) bands.add(D.qualityBand(t - 1, D.TIERS.length - 1));
    const unreached = D.QUALITY.filter(q => !bands.has(q));
    ok('every grade on the ladder is reached by a real tier', unreached.length === 0,
       unreached.join(', ') || D.QUALITY.length + ' grades, all reachable');

    ok('the ladder is monotone across gear tiers',
       Array.from({length: GEAR.GEAR_MAX}, (_, i) => D.QUALITY.indexOf(D.qualityBand(i + 1, GEAR.GEAR_MAX)))
         .every((v, i, a) => i === 0 || v >= a[i-1]),
       Array.from({length: GEAR.GEAR_MAX}, (_, i) => D.qualityBand(i + 1, GEAR.GEAR_MAX)).join(' '));
    ok('tier 0 and an unforged slot are Common', D.qualityBand(0, GEAR.GEAR_MAX) === 'common' && D.qualityBand(-3, GEAR.GEAR_MAX) === 'common');
    ok('and the last step of a ladder is Artifact',
       D.qualityBand(GEAR.GEAR_MAX, GEAR.GEAR_MAX) === 'artifact' && D.qualityBand(D.TIERS.length - 1, D.TIERS.length - 1) === 'artifact',
       'gear ' + GEAR.GEAR_MAX + ' → ' + D.qualityBand(GEAR.GEAR_MAX, GEAR.GEAR_MAX) + ', Tier ' + D.TIERS[D.TIERS.length-1] + ' → '
         + D.qualityBand(D.TIERS.length - 1, D.TIERS.length - 1));

    /* Every grade needs a colour, and a DISTINCT one. Read out of the stylesheet the app actually
       ships, not a copy in the test — a palette asserted against itself proves nothing. */
    const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
    const hexOf = {}, missing = [];
    for(const q of D.QUALITY){
      const m = css.match(new RegExp('--q-' + q + ':\\s*(#[0-9a-fA-F]{3,8})'));
      if(!m) missing.push(q); else hexOf[q] = m[1].toLowerCase();
    }
    ok('every grade has a colour defined in the stylesheet', missing.length === 0, missing.join(', ') || Object.values(hexOf).join(' '));
    ok('and no two grades share one', new Set(Object.values(hexOf)).size === Object.values(hexOf).length,
       Object.entries(hexOf).map(([q, h]) => q + ' ' + h).join(' · '));
    // and a class per grade, or the hex is unreachable from markup
    const noClass = D.QUALITY.filter(q => !css.includes('.q-' + q + '{'));
    ok('and a class per grade so markup can reach it', noClass.length === 0, noClass.join(', ') || 'all wired');

    /* Rendered, not merely defined. The tier is set HERE rather than trusted from the shared
       fixture: earlier blocks in this file mutate it, and the first version of this assertion
       passed while every rendered tag said q-common — which is the default, so it proved only that
       the attribute existed. What has to be true is that a real grade reaches the page. */
    /* And render OUR hold. The Town Hall road block above swaps store.s to its own fixture and
       never swaps it back, so every render after it draws that hold instead — which is why the
       first version of this assertion saw Tier I everywhere. Anything added below this point in
       the file has the same trap waiting for it. */
    ST.store.s = s;
    s.tier = { spearman:1, archer:4, knight:8, ballista:D.TIERS.length };
    UI.render();
    const html = (nodes.app && nodes.app.innerHTML) || '';
    const tags = html.match(/class="tier-tag q-([a-z]+)"/g) || [];
    const grades = new Set(tags.map(t => t.match(/q-([a-z]+)/)[1]));
    ok('the muster colours its troop tiers', tags.length >= 4, tags.length + ' tags');
    ok('and a tier above the first renders a grade above Common',
       grades.size > 1 && [...grades].some(g => g !== 'common'), [...grades].join(', '));
    ok('and the top tier renders as Artifact', grades.has('artifact'),
       'Tier ' + D.TIERS[D.TIERS.length-1] + ' → ' + [...grades].join(', '));
  }

  /* ── an unlock has to announce itself ──
     Reported from play: "I get 2nd building queue, but I don't even get any notification — I need to
     be able to see this as a big warning, it should interrupt my game."

     Same failure as the Wall having no badge: the capability existed, worked, and said nothing. A
     capability the player does not know about is one they do not have. Every unlock card is
     `hold: true`, which renders a full-screen overlay rather than a corner dock — that is what
     "interrupt" means here. */
  {
    const LSN = await from('lessons.js');
    const ISLE_MOD = await from('isle.js');
    const UNLOCKS = ['crew2', 'march2', 'scholars', 'refine', 'isle'];
    const missing = UNLOCKS.filter(id => !LSN.LESSON_BY_ID[id]);
    ok('every major unlock has a card', missing.length === 0, missing.join(', ') || UNLOCKS.join(', '));
    const soft = UNLOCKS.filter(id => !(LSN.LESSON_BY_ID[id] || {}).hold);
    ok('and every one of them interrupts rather than docking', soft.length === 0,
       soft.join(', ') || 'all ' + UNLOCKS.length + ' hold the screen');

    /* The second crew is the one that was reported, so it is checked against the real gate rather
       than a literal — that constant moved from 10 to 4 today and a hardcoded card would now be
       firing at the wrong moment. */
    const at = th => { const s = ST.freshState(Date.now(), 1); s.b.townhall = th; s.seenIntro = true;
                       s.taught = {}; return s; };
    const crew = LSN.LESSON_BY_ID.crew2;
    ok('the second-crew card fires exactly when the second crew arrives',
       !crew.when(at(D.SECOND_QUEUE_TH - 1)) && !!crew.when(at(D.SECOND_QUEUE_TH)),
       'silent at Town Hall ' + (D.SECOND_QUEUE_TH - 1) + ', fires at ' + D.SECOND_QUEUE_TH);

    /* lessons.js gates the Isle card on a copy of ISLE_TH, because importing isle.js would drag the
       map module into the teaching layer. A mirrored constant is a constant that can rot. */
    ok('the Isle card is gated on the real Isle unlock', D.ISLE_TH_HINT === ISLE_MOD.ISLE_TH,
       'hint ' + D.ISLE_TH_HINT + ' vs ISLE_TH ' + ISLE_MOD.ISLE_TH);
  }

  ok('the wall is deliberately plotless', ISO.PLOTS.wall === null);
  /* ...but plotless must not mean voiceless. Reported from play: "to build wall you can't see an
     arrow on the scene view, so I couldn't figure out what to build and went into list view."
     Being absent from PLOTS dropped the Wall out of BOTH the badge loop and the name plates, so it
     was the one building in the game that could never ask to be built. The test above only ever
     checked that it was plotless on purpose — it never asked whether anything downstream noticed. */
  ok('but the wall still gets a badge and a name at the gatehouse',
     typeof ISO.wallAnchor === 'function' && Array.isArray(ISO.wallAnchor()),
     'gate anchor ' + (typeof ISO.wallAnchor === 'function' ? JSON.stringify(ISO.wallAnchor()) : 'MISSING'));
  /* AND IT HAS TO BE TAPPABLE. Fixing the badge and the name first made things worse, not better:
     the scene pointed at the Wall and then ignored the press, because pickBuilding walks PLOTS as
     well. Reported in that exact order. Every perimeter tile answers 'wall'; nothing inside does. */
  ok('and a tap anywhere on the perimeter picks the wall',
     typeof ISO.pickTile === 'function'
       && ISO.pickTile(0, 0) === 'wall' && ISO.pickTile(4, 8) === 'wall'
       && ISO.pickTile(8, 3) === 'wall' && ISO.pickTile(3, 7) !== 'wall',
     typeof ISO.pickTile === 'function'
       ? 'corner ' + ISO.pickTile(0,0) + ', gate ' + ISO.pickTile(4,8)
         + ', inside ' + (ISO.pickTile(3,7) || 'nothing')
       : 'pickTile MISSING');

  // two buildings must never share a tile, or one silently hides the other
  const seen = new Map(), clashes = [];
  for(const [k, p] of Object.entries(ISO.PLOTS)){
    if(!p) continue;
    const at = p[0] + ',' + p[1];
    if(seen.has(at)) clashes.push(seen.get(at) + ' & ' + k + ' both on ' + at);
    seen.set(at, k);
  }
  ok('no two buildings share a plot', clashes.length === 0, clashes.join('; ') || 'all distinct');
  // and every plot must be inside the walls, not under them
  const outside = Object.entries(ISO.PLOTS).filter(([, p]) => p &&
    (p[0] < 1 || p[1] < 1 || p[0] > 7 || p[1] > 7)).map(([k]) => k);
  ok('every plot is inside the wall', outside.length === 0, outside.join(', ') || 'all within');

  /* Materials are what stop every building being the same box in a new colour. */
  const noMat = Object.entries(ISO.LOOK).filter(([, l]) => !l.mat).map(([k]) => k);
  ok('every look names a wall material', noMat.length === 0, noMat.join(', ') || 'all textured');

  /* ── the sprite pipeline, without any sprites ──
     The shipped game has no art directory: placeholder art is generated on demand
     by `npm run sprites`, never committed. So "no art" is the normal path and has
     to be the tested one. */
  console.log('\n── the sprite layer degrades to procedural ──');
  const SP = await from('sprites.js');
  SP._resetArt();
  ok('no art means no sprite', SP.spriteFor('townhall', 12, 30) === null);
  ok('artLoaded() is false', SP.artLoaded() === false);
  const bare = UI._composer(s);            // the UI must not care either way
  ok('the app still renders with no art', bare.length > 500);

  /* The tier↔level round trip. tierLevel(t) picked round(t*max/4), which for a
     building with max 25 returned level 13 while artTier(13,25) is tier 3 — so the
     emitter drew frames the game never asks for and the game asked for frames that
     were never drawn. Seven of 22 buildings were mis-tiered, invisible until sprite
     and procedural were compared pixel for pixel. Real art would have inherited it. */
  console.log('\n── every tier maps back to itself ──');
  const broken = [];
  for(const [k, d] of Object.entries(D.BUILDINGS))
    for(let t = 1; t <= SP.ART_TIERS; t++){
      const lvl = SP.tierLevel(t, d.max);
      if(SP.artTier(lvl, d.max) !== t)
        broken.push(k + '(max ' + d.max + ') tier ' + t + '→lvl ' + lvl + '→tier ' + SP.artTier(lvl, d.max));
    }
  ok('tierLevel round-trips through artTier for all ' + Object.keys(D.BUILDINGS).length + ' buildings',
     broken.length === 0, broken.slice(0,3).join('; ') || 'exact');
  // and every level in range must land in exactly one tier, none skipped
  const unbanded = [];
  for(const [k, d] of Object.entries(D.BUILDINGS))
    for(let l = 1; l <= d.max; l++){
      const t = SP.artTier(l, d.max);
      if(!(t >= 1 && t <= SP.ART_TIERS)) unbanded.push(k + ' lvl ' + l + ' → ' + t);
    }
  ok('every level 1..max falls in a tier', unbanded.length === 0, unbanded.slice(0,3).join('; ') || 'total');
  ok('level 0 has no art', SP.artTier(0, 30) === 0);

  /* A malformed manifest must be ignored rather than trusted: a wrong cell size
     would blit whatever sits next to the frame. */
  console.log('\n── a bad manifest is refused, not trusted ──');
  const fakeImg = { width: 4000, height: 400 };
  SP._installArt({ good: { cell:[100,100], anchor:[50,90], tiers:4, scale:2 } }, { good: fakeImg });
  ok('a well-formed entry is used', !!SP.spriteFor('good', 10, 30));
  for(const [name, entry] of [
    ['no cell',        { anchor:[1,1], tiers:4 }],
    ['zero cell',      { cell:[0,10], anchor:[1,1], tiers:4 }],
    ['cell not a pair',{ cell:[10], anchor:[1,1], tiers:4 }],
    ['no anchor',      { cell:[10,10], tiers:4 }],
    ['too many tiers', { cell:[10,10], anchor:[1,1], tiers:99 }],
  ]){
    SP._installArt({ bad: entry }, { bad: fakeImg });
    ok('refused: ' + name, SP.spriteFor('bad', 10, 30) === null);
  }
  SP._resetArt();

  /* With nobody picked the strip must still render, and claim nothing. */
  console.log('\n── with no leaders picked it claims nothing ──');
  UI._pick([], {});
  const empty = UI._composer(s);
  ok('strip still drawn', /class="affrow"/.test(empty));
  ok('covers 0 of 4', />0\/4</.test(empty));
  ok('no class is lit', !/class="aff on"/.test(empty));
  ok('and no uncovered warning, since nothing was committed',
     !/ride without a captain/.test(empty));

  /* ── sound ──
     There is no AudioContext in this stub DOM, which is the point: the whole layer has
     to be inert and silent rather than throwing, because that is also what happens in
     a browser that blocks audio and on a server rendering the page.

     The name check is the one that matters. This codebase has three times shipped a
     name that matched nothing on the other side — a building with no plot entry, a
     sprite tier that round-tripped to the wrong level, and a `rand` passed to a
     function that had no such parameter. A cue name is exactly that shape, and a
     missing one is silence, which no test of "did it throw" would ever catch. */
  console.log('\n── sound is inert without an AudioContext, and every cue name resolves ──');
  const A = await from('audio.js');
  ok('no AudioContext in this environment', typeof globalThis.AudioContext === 'undefined');
  ok('unlock() is a no-op rather than a throw', (() => { try { A.unlock(); return true; }
                                                        catch { return false; } })());
  ok('cue() reports that it played nothing', A.cue('win') === false);
  ok('an unknown cue name is refused, not thrown', A.cue('no-such-sound') === false);

  const names = Object.keys(A.CUES);
  ok('there are cues to play', names.length >= 10, names.length + ': ' + names.join(', '));
  for(const [act, name] of Object.entries(A.ACT_CUE || {}))
    ok('the cue for action "' + act + '" exists', !!A.CUES[name], name);
  ok('every cue is a function', names.every(n => typeof A.CUES[n] === 'function'));
  ok('deny and tap exist, since runAction calls them by name',
     !!A.CUES.deny && !!A.CUES.tap);

  /* The watcher's own names, checked the same way, plus the guarantee that it never
     writes to the state it is given — it runs inside render(), so a stray mutation
     there would be a rule changed by a sound. */
  A.forget();
  const before = JSON.stringify(s);
  ok('the first watch only takes a baseline', A.watch(s) === null);
  const s2 = JSON.parse(before);
  s2.b = { ...s2.b, farm: s2.b.farm + 1 };
  ok('a finished building is noticed', A.watch(s2) === 'done');
  s2.banner = { txt:'x', cls:'loss', until: s2.now + 4000 };
  ok('being attacked outranks everything else', A.watch(s2) === 'loss');
  ok('and nothing changed in the state it was shown',
     JSON.stringify(s) === before);
  ok('an unchanged state fires nothing', A.watch(s2) === null);

  ok('mute is readable without a context', typeof A.muted() === 'boolean');

  /* Reachability, against the real render. A mute toggle nobody can find is the same
     bug as no mute at all, and `render()` above is the only honest witness to whether
     the button is actually on the page. */
  ok('Settings is reachable from the footer', /data-act="settings"/.test(full));
  UI._openSettings();
  UI.render();
  const sheet = (nodes.fx && nodes.fx.innerHTML) || '';
  ok('the sheet offers a sound-effects toggle', /data-act="sfx"/.test(sheet));
  ok('the sheet offers a wind toggle', /data-act="amb"/.test(sheet));
  ok('and a way back out', /data-act="settings"/.test(sheet));
  ok('no "undefined" in the settings sheet', !/undefined/.test(sheet));
} finally {
  rmSync(dir, { recursive:true, force:true });
}

console.log('\n' + (fail ? '✗ ' + fail + ' FAILED, ' + pass + ' passed' : '✓ all ' + pass + ' passed') + '\n');
process.exit(fail ? 1 : 0);
