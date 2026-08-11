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

/* The panel prints numbers through the game's own fmt(), which switches to "12.6k" past ten thousand.
   An assertion looking for "12600" would silently never match. */
const fmtLike = n => n >= 10000 ? (n/1000).toFixed(1) + 'k' : String(Math.floor(n));
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
/* appendChild used to be a no-op with nothing to append to, which was fine while every dock was
   written by assigning innerHTML. The event feed builds real nodes and prunes itself by counting
   them, so the stub has to actually hold children — otherwise the only way to run it here is to make
   the game defensive about a DOM that does not exist, and that is the test bending the code. */
const el = () => ({ style:{ setProperty(){}, removeProperty(){}, getPropertyValue: () => '' },
  offsetHeight:0, offsetWidth:0,
  dataset:{}, classList:{ add(){}, remove(){}, toggle(){} },
  children:[],
  appendChild(c){ this.children.push(c); if(c) c.parentNode = this; return c; },
  removeChild(c){ const i = this.children.indexOf(c);
                  if(i >= 0) this.children.splice(i, 1); if(c) c.parentNode = null; return c; },
  get firstChild(){ return this.children[0] || null; },
  addEventListener(){}, removeEventListener(){}, setAttribute(){},
  querySelectorAll: () => [], querySelector: () => null, innerHTML:'', textContent:'',
  width:360, height:360, parentNode:null, remove(){},
  getBoundingClientRect: () => ({ width:360, height:360, left:0, top:0 }),
  getContext: () => ctx2d });

/* The feed schedules its own fade-out and removal. Node keeps the process alive for pending timers,
   so without this the suite sat for six seconds after its last assertion waiting for a toast nobody
   was looking at. Unref'd here rather than accommodated in the game. */
const rawTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms) => {
  const t = rawTimeout(fn, ms);
  if(t && typeof t.unref === 'function') t.unref();
  return t;
};

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
  '\nexport { chatBox as _chatBox };' +
  // the detail sheet is opened by a tap on a canvas; `detail` is module-local
  '\nexport function _openDetail(type, key){ detail = type ? { type, key } : null; }' +
  // the Salt Isle moved into a sheet behind the frontier ribbon's button; its flag is module-local
  '\nexport function _openIsle(){ isleOpen = true; }' +
  // the event feed's box is createElement'd like chatBox, and its high-water mark is module-local
  '\nexport { feedBox as _feedBox };' +
  '\nexport function _feedMark(){ return feedMark; }' +
  /* A FRESH open, which is the only state the replay guard exists for. Without this the earlier
     blocks in this suite have already called render(), the high-water mark is set, and the test
     passes whether the guard is there or not — which it did, on the first run, until the guard was
     deleted on purpose and the test stayed green. */
  '\nexport function _resetFeed(){ feedMark = 0; }\n');
/* Same seam for net.js: the session is module-local, and the App Store's account-deletion control
   only exists when signed in — so without a way to fake a session there is nothing to assert, and
   the requirement would be untested until a reviewer found it missing. */
appendFileSync(join(dir, 'src', 'net.js'),
  '\nexport function _fakeSession(name){ session = { name, token:\'test\' }; online = true; }' +
  /* The Levy's shared total arrives on the alliance payload, which needs a server. Without a way to
     fake one there is no way to render the card's only interesting state, and the three states it has
     are exactly where a collective event goes wrong: silently absent when you have no alliance, or
     showing a ladder it cannot know the progress of. */
  '\nexport function _fakeAlliance(payload){ ally = payload; }' +
  /* And the realm payload, which is where the beast's health lives. The appointment strip's open state
     shows it, and there is no other way to reach that state without a running server. */
  '\nexport function _fakeRealm(payload){ realm = payload; }\n');
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

  /* ── a yard you tap is a yard you can drill from ──
     Reported: "you wanna train spearmen — you have to tap the building, else you won't be able to go
     to the training window." Tapping the Barracks opened a stats card and the only route to drilling
     was a tab the player has to already know about. Asserted per yard, because there are four of
     them and a mapping that covers three is the kind of gap nobody notices until someone tries to
     build battlemages. */
  {
    ST.store.s = s;
    const missing = [], noLine = [];
    for(const [tk, td] of Object.entries(D.TROOPS)){
      UI._openDetail('building', td.at);
      UI.render();
      const sheet = (nodes.fx && nodes.fx.innerHTML) || '';
      if(!sheet.includes('data-act="drillHere" data-key="' + tk + '"')) missing.push(td.at);
      if(!sheet.includes(td.plural)) noLine.push(td.at);
    }
    ok('every drilling yard offers its own line when tapped', missing.length === 0,
       missing.length ? 'no drill button on: ' + missing.join(', ')
                      : Object.keys(D.TROOPS).length + ' yards, all four');
    ok('and names the troops it drills', noLine.length === 0, noLine.join(', ') || 'named');
    /* A yard that is not built must not offer to drill from it — the button would be a dead end. */
    const bare = ST.freshState(now, 9); bare.seenIntro = true; bare.now = now;
    ST.store.s = bare;
    UI._openDetail('building', 'siegeyard');
    UI.render();
    ok('an unbuilt yard offers no drill button',
       !/data-act="drillHere"/.test((nodes.fx && nodes.fx.innerHTML) || ''));
    UI._openDetail(null);
    ST.store.s = s;
  }

  /* ── every timer in the hold shows up in the queue sheet ──
     Asked for: "we also need to see queues like a popup menu — building queue, research queue,
     marching queue, like in WoS." Nine kinds of timer exist, and the failure mode of a panel like
     this is a kind that is silently absent: the sheet looks right, and the one thing you were
     waiting for is the one it does not list. So this runs every kind at once and asserts the COUNT,
     which is the only assertion a missing row cannot pass. */
  {
    const q = ST.freshState(now, 5);
    q.seenIntro = true;
    Object.assign(q.b, { townhall:20, library:10, barracks:10, hospital:8, forge:8, command:20 });
    q.now = now;
    const at = now + 600000;
    q.bq  = { key:'farm', start:now, end:at };
    q.bq2 = { key:'wall', start:now, end:at + 1000 };
    q.rq  = { key:'husbandry', start:now, end:at + 2000 };
    q.tq  = { spearman:{ key:'spearman', count:40, start:now, end:at + 3000 } };
    q.hq  = { troops:{ spearman:12 }, start:now, end:at + 4000 };
    q.gq  = { who:'lord', slot:'blade', to:3, start:now, end:at + 5000 };
    q.pq  = { key:'archer', to:2, start:now, end:at + 6000 };
    q.marches = [{ tile:0, troops:{ spearman:10 }, out:60000,
                   arriveAt:now + 60000, homeAt:at + 7000, resolved:false }];
    q.isle = q.isle || { cells:[] };
    q.isle.voyage = { x:1, y:1, troops:{ spearman:10 }, heroes:[], end:at + 8000 };
    q.exped = { route:'kingsroad', end:at + 9000 };

    const rows = UI.holdQueues(q);
    const kinds = new Set(rows.map(r => r.kind));
    const WANT = ['Build','Study','Drill','Tending','Forge','Reforge','Column','Voyage','Party'];
    const missing = WANT.filter(k => !kinds.has(k));
    ok('every kind of timer reaches the queue sheet', missing.length === 0,
       missing.length ? 'MISSING: ' + missing.join(', ') : WANT.length + ' kinds, ' + rows.length + ' rows');
    ok('both build slots are listed, not just one',
       rows.filter(r => r.kind === 'Build').length === 2,
       rows.filter(r => r.kind === 'Build').length + ' build rows');
    ok('and they are ordered by what finishes soonest',
       rows.every((r, i) => i === 0 || rows[i-1].left <= r.left),
       rows.map(r => Math.round(r.left / 1000)).join('s ≤ ') + 's');
    ok('no row says undefined or NaN',
       !rows.some(r => /undefined|NaN/.test(r.kind + r.what)),
       rows.map(r => r.what).join(' | ').slice(0, 90));
    /* And an idle hold must report zero rather than a stale count — the chip's whole job. */
    ok('an idle hold has an empty sheet', UI.holdQueues(ST.freshState(now, 6)).length === 0);
  }

  /* ── the feed: the game announces what it does ──
     From play, after playing something else: "I feel like Crownhold is less fun", and what the other
     game did better was that "something happened constantly".

     The sim measured the opposite of the obvious reading: an event every 5–8 seconds, median gap 5s,
     no silence longer than two minutes in ninety. What it also measured is that 12–26% of them
     reached the screen. The rest were lines in a Ledger nobody has open, and the single banner slot
     that did reach the screen holds one message for four seconds — so a median gap of 5s means
     messages routinely overwrite each other.

     The feed reads s.log, the funnel all sixty-four event sites already push through, so a new event
     anywhere in the rules appears without being routed. The two failures worth guarding are the ones
     that would make it worse than nothing: replaying history the moment you open the game (offline
     catch-up settles hours in one tick BEFORE the first render), and an unbounded burst pushing the
     tab bar off the screen. */
  {
    ST.store.s = s;
    const box = UI._feedBox;
    box.children.length = 0;
    UI._resetFeed();          // as if the game had just been opened
    s.log = [{ t: s.now - 1000, txt: 'an old thing', cls:'' },
             { t: s.now - 2000, txt: 'an older thing', cls:'' }];
    UI.render();
    ok('opening the game never replays the Ledger', box.children.length === 0,
       box.children.length + ' toast(s) for 2 pre-existing entries');
    ok('but it remembers where it got to', UI._feedMark() >= s.now - 1000);

    s.log.unshift({ t: s.now + 500, txt: 'a wall went up', cls:'win' });
    UI.render();
    ok('a new event is announced on screen', box.children.length === 1,
       box.children.length + ' toast(s)');
    ok('and carries the words the rules wrote',
       (box.children[0] || {}).textContent === 'a wall went up');
    ok('and its tone', /win/.test((box.children[0] || {}).className || ''));

    /* A burst: what a night away looks like when the tick settles it all at once. */
    for(let i = 1; i <= 12; i++)
      s.log.unshift({ t: s.now + 500 + i * 10, txt: 'thing ' + i, cls:'' });
    UI.render();
    ok('a burst is capped rather than stacked to the ceiling', box.children.length <= 6,
       box.children.length + ' toasts for 12 events at once');
    ok('and says how many it did not show',
       box.children.some(c => /and \d+ more/.test(c.textContent || '')),
       box.children.map(c => c.textContent).join(' | '));

    /* Nothing new must produce nothing at all — this runs four times a second. */
    const held = box.children.length;
    UI.render(); UI.render();
    ok('a quiet tick adds nothing', box.children.length === held, held + ' → ' + box.children.length);

    box.children.length = 0;
    s.log = [];
  }

  /* ── the frontier's panels are furniture, and the Salt Isle is behind a button ──
     The map is a fullscreen camera; the panels sit on top of it. What was there was the frontier
     brief and the whole Salt Isle chart as two full-width opaque cards, together taller than a
     phone, so the map was complete and entirely hidden. Reported as "the frontier doesn't work".

     The layout is measured in a real browser by `npm run scroll` — a stub DOM has no heights, so
     "does it cover the map" is not a question that can be asked here. What CAN be asked, and is the
     regression that matters, is whether moving the Isle made it UNREACHABLE: a button whose sheet
     never renders is worse than the card that was in the way. */
  {
    ST.store.s = s;
    UI.render();
    const app = (nodes.app && nodes.app.innerHTML) || '';
    const pane = (app.match(/data-pane="world"[\s\S]*?(?=<div class="tabpane)/) || [''])[0];
    ok('the frontier pane is a ribbon', /class="panel worldbar"/.test(pane),
       (pane.match(/class="panel[^"]*"/) || ['(no panel)'])[0]);
    ok('and the Isle chart is no longer stacked on the map', !/islegrid/.test(pane));
    ok('the Isle is offered as a button instead', /data-act="isle"/.test(pane));

    UI._openIsle();
    UI.render();
    const sheet = (nodes.fx && nodes.fx.innerHTML) || '';
    ok('and that button leads to a sheet that actually renders', /data-act-bg="isleClose"/.test(sheet),
       sheet ? sheet.slice(0, 100) : '(nothing in the overlay layer)');
    ok('which carries the chart it used to show inline', /islegrid/.test(sheet));
    ok('and a way back out', /data-act="isleClose"/.test(sheet));
  }

  /* ── the Events tab ──
     Four live events, a claim path for each, and a week grid. All of it was inside the Ledger behind
     the mail until v4.6, and all of it is new markup — so what is asserted here is not "does it
     render" but the two things that would silently gut it: a panel that shows ONE event again, and a
     grid whose cells are empty. Either failure looks like a working page. */
  {
    const EV = await from('events.js');
    ST.store.s = s;
    UI.render();
    const app = (nodes.app && nodes.app.innerHTML) || '';
    const pane = (app.match(/data-pane="events"[\s\S]*?(?=<div class="tabpane)/) || [''])[0];
    ok('there is an Events tab, and it is its own pane', pane.length > 0,
       pane ? pane.length + ' chars' : 'NO EVENTS PANE');
    ok('and a bar button that reaches it', /data-act="tab" data-key="events"/.test(app));

    /* The single-slot bug, restated as a UI assertion: one card per lane, not one card. */
    const cards = (pane.match(/class="evcard/g) || []).length;
    ok('the panel shows a card for every live lane', cards === EV.LANES.length,
       cards + ' cards for ' + EV.LANES.length + ' lanes');
    for(const w of EV.liveWindows(Date.now()))
      ok('  ' + w.lane.name + ' names its running event', pane.includes(w.event.name), w.event.name);
    /* Four windows of four different lengths, so four different countdowns. If they collapsed to one
       value the lanes would have silently resynchronised. */
    const ends = new Set(pane.match(/class="evends">ends in [^<]*/g) || []);
    ok('and four separate countdowns', ends.size === EV.LANES.length, [...ends].join(' · '));

    /* Points per deed are the actionable content of the card — "a camp burned 75" is what decides
       what a player does next, and it is the number the whole rework is calibrated on. */
    ok('every card says what scores in it, in English and with its value',
       (pane.match(/class="evsrc"/g) || []).length === EV.LANES.length
       && /a wave held <b>|a job finished <b>|a camp burned <b>|each troop drilled <b>/.test(pane),
       (pane.match(/class="evsrc">([^<]*<b>[^<]*<\/b>)/) || [,'(none)'])[1]);
    ok('and shows all four rungs of its ladder',
       (pane.match(/class="evrung[ "]/g) || []).length === EV.LANES.length * 4,
       (pane.match(/class="evrung[ "]/g) || []).length + ' rungs');
    ok('no "undefined" and no raw deed keys leak into the cards',
       !/undefined/.test(pane) && !/warbandWon|arenaWin|longHaul/.test(pane));

    /* ── the week grid ──
       Seven day columns, a row per lane, and every cell carrying icons. An empty cell is the
       single-slot problem showing through the calendar. */
    ok('the calendar is a real grid', /<table class="cal">/.test(pane));
    const heads = (pane.match(/<th[^>]*><span class="cdow">/g) || []).length;
    ok('with seven day columns', heads === 7, heads + ' columns');
    ok('and today marked', /class="today"><span class="cdow">today/.test(pane));
    const rows = (pane.match(/<th class="clane"/g) || []).length;
    ok('and a row per lane', rows === EV.LANES.length, rows + ' rows');
    const cells = pane.match(/<td[^>]*>(?:(?!<\/td>).)*<\/td>/g) || [];
    const empty = cells.filter(c => !/class="cev/.test(c));
    ok('and not one empty day', cells.length === 7 * EV.LANES.length && empty.length === 0,
       cells.length + ' cells, ' + empty.length + ' empty');
    /* Counted per ROW, not in total: a 24h or 48h window straddles midnight and is correctly drawn in
       both day cells it touches, so the total number of lit icons is not the number of live windows.
       The first version of this asserted four and broke the moment a fifth lane made one straddle. */
    const rowsHtml = pane.split('<tr>').slice(2);
    const litPerRow = rowsHtml.map(r => (r.match(/class="cev live"/g) || []).length);
    /* The bound is per lane, from its own length: a 48h window can touch three day columns and a 6h one
       exactly one. A flat "at most two" broke on the banner lane, which is the code being right. */
    const maxCells = l => Math.ceil(l.ms / 86400000) + 1;
    ok('every lane has its running window lit, and only where it runs',
       litPerRow.length === EV.LANES.length
       && litPerRow.every((n, i) => n >= 1 && n <= maxCells(EV.LANES[i])),
       EV.LANES.map((l, i) => l.name + ' ' + litPerRow[i] + '/' + maxCells(l)).join(' '));
    /* Sixteen-plus icons is more than anyone memorises and a title attribute is unreachable on a
       phone, so the legend is the only thing that makes the grid readable at all. */
    ok('and a legend naming every event in every lane',
       EV.EVENTS.every(e => pane.includes(e.icon + ' ' + e.name)),
       EV.EVENTS.length + ' events named');

    /* ── claiming ── */
    {
      const owed = ST.load ? s : s;   // same hold; put it just over the first rung in every lane
      for(const lane of EV.LANES) EV.eventState(owed, lane, Date.now()).score = lane.ladder[0].at;
      UI.render();
      const p2 = ((nodes.app && nodes.app.innerHTML) || '')
        .match(/data-pane="events"[\s\S]*?(?=<div class="tabpane)/)[0];
      /* Solo lanes only: the Levy is claimed through its own endpoint, because its threshold is the
         alliance's total and the generic action has no way to know it. */
      const soloLanes = EV.LANES.filter(l => !l.shared);
      ok('a lane that is owed something offers a Claim for THAT lane',
         soloLanes.every(l => p2.includes('data-act="claimEvent" data-key="' + l.id + '"'))
         && !p2.includes('data-act="claimEvent" data-key="levy"'),
         (p2.match(/data-act="claimEvent" data-key="[a-z]+"/g) || []).join(' '));
      ok('and one button claims the lot rather than four taps',
         /data-act="claimEvent">🏆 Claim all 4 rewards/.test(p2),
         (p2.match(/Claim all \d+ rewards/) || ['(absent)'])[0]);
      ok('and that button counts only what it can actually claim',
         !/Claim all 5 rewards/.test(p2));
      const bar = ((nodes.app && nodes.app.innerHTML) || '').match(/<nav class="tabbar">[\s\S]*?<\/nav>/);
      ok('and the claim dot moved to Events with the panels',
         /data-key="events"[^>]*><span>🏆<i class="claimdot">/.test(bar ? bar[0] : ''),
         bar ? bar[0].replace(/<button /g, '\n    <button ') : 'NO TAB BAR');
      ok('and is no longer on the Ledger, which now only holds the mail',
         !/data-key="ledger"><span>📜<i class="claimdot">/.test(p2));
      for(const lane of EV.LANES) EV.eventState(owed, lane, Date.now()).score = 0;
    }
  }

  /* ── the appointment strip ──
     The countdown that did not exist. The Hunt has opened every four hours for a long time and the only
     place it was mentioned was inside the War tab, online, during the window — so what is asserted here
     is mostly that it is now visible at all, in the three states a player can be in.

     The strip is derived from the CLOCK, not from the server, which is the property worth protecting:
     an offline, signed-out hold in no alliance still gets a countdown and a straight answer about what
     it would need. Test it signed out first, because that is the state where the old code showed
     nothing whatsoever. */
  {
    const EV = await from('events.js');
    const NET4 = await from('net.js');
    const app = EV.APPOINTMENTS[0];
    const pane = () => (((nodes.app && nodes.app.innerHTML) || '')
      .match(/data-pane="events"[\s\S]*?(?=<div class="tabpane)/) || [''])[0];

    NET4.signOut && NET4.signOut();
    NET4._fakeAlliance(null);
    delete s.can;
    ST.store.s = s;
    UI.render();
    let p = pane();
    ok('the appointment is on the page even signed out', /class="appt/.test(p),
       (p.match(/class="appt[^"]*"/) || ['(absent)'])[0]);
    /* Named, and saying what it is. NOT "in the War tab" here: signed out, the button is the way IN
       rather than the way there — the destination is asserted in the reachable state below. */
    ok('and named, and says what it is', p.includes(app.name) && p.includes(app.note),
       app.icon + ' ' + app.name + ' · ' + app.note);
    /* Which state to expect is asked of the same function the strip uses, rather than accepting either.
       A test that passes on "open OR closed" checks only that SOME text is there — and since the real
       clock decides which one, whichever state the suite happened to miss would never be exercised. */
    {
      const at = EV.appointmentAt(app, Date.now());
      const shown = (p.match(/class="apptwhen">([^<]*)/) || [,''])[1];
      ok('and it counts down without a server, because the clock is ours',
         at.open ? /^OPEN — /.test(shown) : /^opens in /.test(shown),
         (at.open ? 'mid-window: ' : 'between windows: ') + shown);
      ok('and the strip is lit only while the window actually is',
         /class="appt on"/.test(p) === at.open,
         at.open ? 'open and lit' : 'closed and quiet');
    }
    ok('and says what it would take, rather than offering a dead button',
       /Sign in|find one/.test(p), (p.match(/<button[^>]*>([^<]*War tab|[^<]*Sign in[^<]*|[^<]*find one[^<]*)/) || [,'?'])[1]);
    /* The next few in local clock time — "20:00" is what a person plans around. */
    ok('and lists the next few by the clock, not as a bare timer',
       /class="apptnext">then \d\d:\d\d/.test(p),
       (p.match(/class="apptnext">([^<]*)/) || [,'(none)'])[1]);
    ok('the calendar page lists its fixed hours too',
       new RegExp('<b>' + app.icon + ' ' + app.name + '</b>').test(p)
       && (p.match(/class="cekey[^"]*">\d\d:\d\d/g) || []).length >= 3,
       (p.match(/class="cekey[^"]*">[^<]*/g) || []).slice(0, 5).join(' '));

    /* ── open, in an alliance, with a beast on the server ── */
    NET4._fakeSession('Aldis');
    s.can = { online:true, alliance:true };
    /* A realm payload whose boss is open: the strip must switch to the loudest thing on the page. */
    /* A whole realm payload, not just a boss: renderRealm reads the season and the landmark list off the
       same object and threw on a partial one — which is the harness being wrong, not the game. */
    NET4._fakeRealm && NET4._fakeRealm({
      boss: { icon:'🐗', name:'Gravemaw', hp:4000, maxHp:10000,
              open:true, opensIn:0, closesIn: 11 * 60000, slain:false, damage:{}, cycle:1,
              every: app.every, window: app.window },
      season: { no:1, endsIn: 86400000, realmDay:3, titles:[], history:[] },
      landmarks: [], alliances: [], eventBoard: { band:'Reach', rows:[] },
      /* `rift: null` rather than a stub: renderRift reads `r.mine.name` on the no-neighbour branch, so a
         half-built rift throws where an absent one is simply not rendered. */
      rally: null, rift: null,
    });
    UI.render();
    p = pane();
    /* And with a server on the line, ITS verdict wins — including when the two disagree, which they can:
       the server's period is overridable, so the clock alone is a guess about somebody else's schedule.
       This payload says open whatever the local clock thinks, which is the case that found the bug. */
    if(/class="appt on"/.test(p)){
      ok('an open window is marked as the loud thing it is, on the server\'s word not the clock\'s',
         /class="appt on"/.test(p),
         EV.appointmentAt(app, Date.now()).open ? 'clock agreed' : 'clock said closed, server said open');
      ok('and says how long is left of it', /OPEN — /.test(p),
         (p.match(/class="apptwhen">([^<]*)/) || [,''])[1]);
      ok('and names the beast and its health from the server',
         p.includes('Gravemaw') && /4000 of 10.0k/.test(p),
         (p.match(/Gravemaw[^<]*<\/div>|Gravemaw — [^<]*/) || ['(absent)'])[0]);
      ok('and the button becomes the primary action on the page',
         /class="primary"[^>]*data-act="tab" data-key="war"/.test(p));
    } else {
      ok('an open window is marked as the loud thing it is', false,
         'the strip did not switch to open: ' + (p.match(/class="appt[^"]*"/) || [''])[0]);
    }
    NET4._fakeRealm && NET4._fakeRealm(null);
    NET4._fakeAlliance(null);
    delete s.can;
  }

  /* ── the Levy card ──
     The fifth row, and the only card whose numbers come from the server. Three states, and the failure
     mode of each is a page that looks fine: absent when you have no alliance (so the fifth calendar row
     is a locked door with no sign), showing a ladder without knowing the alliance's progress, or —
     worst — offering a Claim for a rung the alliance never reached. */
  {
    const EV = await from('events.js');
    const NET3 = await from('net.js');
    const lane = EV.laneOf('levy');
    const pane = () => (((nodes.app && nodes.app.innerHTML) || '')
      .match(/data-pane="events"[\s\S]*?(?=<div class="tabpane)/) || [''])[0];

    ok('there is exactly one shared lane, and it is on the calendar',
       EV.LANES.filter(l => l.shared).length === 1);

    /* ── solo: told what it is, offered no ladder ── */
    NET3._fakeAlliance(null);
    ST.store.s = s;
    UI.render();
    let p = pane();
    ok('the Levy card is shown even with no alliance', /class="evcard levy/.test(p),
       (p.match(/class="evcard[^"]*"/g) || []).join(' | '));
    ok('and says what it is rather than sitting blank', /class="levylock"/.test(p)
       && /whole alliance/.test(p));
    ok('and names what clearing it is worth', /Levy Banner|Banner flies/.test(p));
    ok('and offers no Claim at all', !/data-act="levyClaim"/.test(p));
    ok('and points at the way in instead',
       /data-act="tab" data-key="ally"|data-act="tab" data-key="ledger"/.test(p));

    /* ── in an alliance, part-way up ──
       Signed in explicitly. The Levy view is only read when online, and leaning on a previous block
       having faked a session is how the feed's replay guard came to pass with the guard deleted. */
    NET3._fakeSession('Aldis');
    s.can = { online:true, alliance:true };   // what the server stamps for a hold in an alliance
    const holds = 8, ladder = EV.ladderOf(lane, holds);
    const win = EV.liveWindow(lane, Date.now());
    NET3._fakeAlliance({ levy: {
      in: true, event: win.event.id, name: win.event.name, icon: win.event.icon,
      blurb: win.event.blurb, w: win.w, endsIn: win.endsIn,
      total: ladder[1].at, holds, counted: holds, cap: 20000, mine: 2400,
      rungs: ladder.map((m, i) => ({ at:m.at, per:m.per, txt:m.txt, done: i <= 1, claimed: i === 0 })),
      rows: [{ name:'Brenna', score:9000 }, { name:'Aldis', score:2400 }, { name:'Corin', score:0 }],
      banner: { flying:false, earnedThis:false, fx:{}, endsIn:0 },
    } });
    UI.render();
    p = pane();
    ok('with an alliance it shows the shared total against the ladder',
       p.includes(fmtLike(ladder[1].at)) && p.includes(fmtLike(ladder[3].at)),
       'total ' + ladder[1].at + ' of ' + ladder[3].at);
    ok('and says the target is per hold, not a bare number',
       new RegExp(holds + ' holds × ').test(p),
       (p.match(/\d+ holds × [\d.k]+ each/) || ['(absent)'])[0]);
    ok('and shows your own part separately from the total', /Your part/.test(p));
    /* The contributor column IS the mechanism — a shared total with anonymous contributors is a total
       nobody feels responsible for. */
    ok('and names who is pulling', /class="levyrow/.test(p) && p.includes('Brenna'),
       (p.match(/class="levyrow[^"]*"><span>[^<]*</g) || []).join(' ').slice(0, 90));
    ok('and marks your own row', /class="levyrow mine"/.test(p));
    ok('and says how many have not scored yet', /have not scored yet/.test(p));
    ok('a reached-but-unclaimed rung offers its Claim', /data-act="levyClaim"/.test(p));
    ok('and the sweep button does not count it, since it cannot claim it',
       !/Claim all \d+ rewards/.test(p) || !/levyClaim/.test(
         (p.match(/Claim all[\s\S]*?<\/button>/) || [''])[0]));

    /* ── the Banner, in its three states ── */
    const setBanner = b => {
      const cur = NET3.allianceData();
      NET3._fakeAlliance({ levy: { ...cur.levy, banner: b } });
      UI.render();
      return pane();
    };
    ok('not yet earned: the card says what reaching it is worth',
       /Reach <b>/.test(setBanner({ flying:false, earnedThis:false, fx:{}, endsIn:0 })));
    ok('earned this window: it says the Banner flies when the window closes',
       /Answered/.test(setBanner({ flying:false, earnedThis:true, fx:{}, endsIn:0 })));
    const flying = setBanner({ flying:true, earnedThis:false, fx:{}, endsIn: 3600000 });
    ok('flying: it says so, and what every member is carrying',
       /class="levybanner on"/.test(flying) && /\+5% production/.test(flying),
       (flying.match(/class="levybanner on">([\s\S]{0,80})/) || [,''])[1].replace(/<[^>]*>/g, ''));

    /* ── the claim dot ──
       The Levy is the event a player is least likely to be watching, so the dot has to light for it. */
    {
      const cur = NET3.allianceData();
      /* `s.can` is what the server stamps to say this hold is in an alliance, and both the Claim button
         and the dot read it — one gate, so they cannot disagree about the same fact. */
      s.can = { online:true, alliance:true };
      NET3._fakeAlliance({ levy: { ...cur.levy,
        rungs: cur.levy.rungs.map(r => ({ ...r, done:true, claimed:false })) } });
      UI.render();
      const bar = (((nodes.app && nodes.app.innerHTML) || '').match(/<nav class="tabbar">[\s\S]*?<\/nav>/) || [''])[0];
      ok('an owed Levy lights the dot on the Events tab',
         /data-key="events"[^>]*><span>🏆<i class="claimdot">/.test(bar),
         bar ? '(bar read)' : 'NO TAB BAR');
    }
    NET3._fakeAlliance(null);
    delete s.can;
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
       /class="holdchip"[^>]*><b>TH20<\/b>/.test(head),
       (head.match(/class="holdchip"[\s\S]{0,80}?<\/button>/) || ['(absent)'])[0]);
    /* The dock is gone, so the chip is the only way to your account — WoS's avatar corner. If this
       stops being a button, sign-in becomes unreachable on a phone, which is the regression that
       removing a shelf of five icons invites. */
    ok('and it is the way into your account now the dock is gone',
       /class="holdchip" data-act="account"/.test(head));
    ok('nothing renders a dock any more', !/class="dock"/.test(head));
    /* And its four other items have somewhere to live, or removing it deleted the mute toggle. */
    for(const act of ['store','codex','lore','settings'])
      ok('the ' + act + ' is still reachable', new RegExp('data-act="' + act + '"').test(head));

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

  /* ── a tap lands on the building you can see ──
     The game's most-used gesture, and it was wrong more the longer you played. A tap was resolved by
     looking up the GROUND tile under the finger and then fudging one tile down-right for touch slop.
     But in a 2:1 isometric projection a building is DRAWN ABOVE its own ground tile, by more the taller
     it is — so a tap on a body landed on a tile behind the building and the fudge answered with the
     neighbour in front of it.

     Measured over every building's whole body at every level before the fix: 83% correct at level 1,
     60% at level 20, because buildings grow as they rise. The Town Hall was wrong across 71% of its own
     body and always answered "Embassy"; the Watchtower answered "Library". Nothing failed, nothing
     logged — the game just opened the wrong panel, which is this project's whole failure mode.

     Tested through the pure pickBody, so no canvas is needed: fractional tile coordinates in, key out. */
  {
    console.log('\n── a tap lands on the building you can see, not its neighbour ──');
    const TH = 32;
    /* Every building at level 20, not whatever this fixture happens to have raised. The rule is pure,
       the worst case is a full hold at max height (measured: 60% correct before the fix), and a test
       that only covers the twelve buildings one fixture built would have missed the Watchtower — the
       second-worst offender of the lot. */
    const heights = {};
    for(const k of Object.keys(s.b)) if(ISO.plotTile(k)) heights[k] = ISO.bodyHeight(k, 20);
    const built = ISO.bodyHeights(s);
    ok('the whole roster has a drawn height, so the full hold can be tested',
       Object.keys(heights).length >= 20, Object.keys(heights).length + ' buildings at level 20');
    ok('and only BUILT ones are offered to the pick, so an empty plot is not solid',
       Object.keys(built).length === Object.keys(s.b).filter(k =>
         (s.b[k] || 0) > 0 && ISO.plotTile(k)).length,
       Object.keys(built).length + ' with a body, of '
       + Object.keys(s.b).filter(k => (s.b[k] || 0) > 0).length + ' built');
    ok('and an unbuilt one has none, so its dashed plot still answers by ground',
       ISO.bodyHeight('forge', 0) === 0 && ISO.bodyHeight('forge', 5) > 0);
    /* Height must come from the same place the drawing gets it. If these drift, the pick mis-answers
       along every roofline and only a screenshot would ever show it. */
    ok('height grows with level and tapers',
       ISO.bodyHeight('townhall', 20) > ISO.bodyHeight('townhall', 1)
       && ISO.bodyHeight('townhall', 20) < ISO.bodyHeight('townhall', 1) * 3,
       'L1 ' + Math.round(ISO.bodyHeight('townhall', 1)) + 'px → L20 '
       + Math.round(ISO.bodyHeight('townhall', 20)) + 'px');

    /* Walk up every building's body and ask who is there. The answer is NOT always that building, and
       that is the point: a nearer, taller neighbour genuinely covers part of what is behind it — the
       Tavern's roof really does stand in front of the Lumberyard's base. Asserting "always itself"
       failed on thirteen buildings and every one of them was correct occlusion.

       The invariant that actually distinguishes right from wrong is DIRECTIONAL. The old bug always
       answered with a building drawn BEHIND the one tapped (the Town Hall answering "Embassy"), because
       it fudged down-right in tile space, which is up-screen in depth. Occlusion only ever answers with
       something NEARER. So: never farther, and never nothing. */
    const depth = k => ISO.plotTile(k)[0] + ISO.plotTile(k)[1];
    let self = 0, total = 0;
    const farther = [], missed = [];
    for(const key of Object.keys(heights)){
      const plot = ISO.plotTile(key);
      for(let i = 0; i <= 20; i++){
        const d = (heights[key] * (i / 20)) / TH;
        const got = ISO.pickBody(plot[0] - d, plot[1] - d, heights);
        total++;
        if(got === key) self++;
        else if(!got) missed.push(key + '@' + (i * 5) + '%');
        else if(depth(got) < depth(key)) farther.push(key + '@' + (i * 5) + '%→' + got);
      }
    }
    ok('a tap up a building never answers with one drawn BEHIND it', farther.length === 0,
       farther.length ? 'THE OLD BUG: ' + farther.slice(0, 6).join(' ')
         : total + ' taps across a full hold at level 20, none answered backwards');
    ok('and never answers with nothing at all', missed.length === 0,
       missed.length ? missed.slice(0, 6).join(' ') : 'every tap on a body hit something');
    ok('and mostly answers with the building itself, the rest being real occlusion',
       self / total > 0.75, self + '/' + total + ' itself, ' + (total - self) + ' covered by a nearer one');

    /* ── an independent implementation of the same rule ──
       pickBody intersects intervals. This samples t densely instead — a different construction of "is
       there a height at which this point lands on that tile" — and the two must agree everywhere. This
       is what caught the seam bug: they disagreed on 22 of 462 taps, all of them points sitting exactly
       on the boundary between two tiles, where an interval width of 1e-16 was deciding which building
       you had tapped. */
    {
      const sampled = (fx, fy) => {
        for(const k of Object.keys(heights).sort((a, b) => depth(b) - depth(a))){
          const p = ISO.plotTile(k), hh = heights[k] / TH, n = 2000;
          for(let i = 0; i <= n; i++){
            const t = hh * i / n;
            if(Math.round(fx + t) === p[0] && Math.round(fy + t) === p[1]) return k;
          }
        }
        return null;
      };
      let dis = 0;
      for(const key of Object.keys(heights)){
        const plot = ISO.plotTile(key);
        for(let i = 0; i <= 20; i++){
          const d = (heights[key] * (i / 20)) / TH;
          if(ISO.pickBody(plot[0] - d, plot[1] - d, heights) !== sampled(plot[0] - d, plot[1] - d)) dis++;
        }
      }
      ok('the interval rule agrees with a densely-sampled one everywhere', dis === 0,
         dis + ' disagreements of ' + total);
    }

    /* ── the wiring, not just the rule ──
       The reason this block exists in this shape. The assertions above all called pickBody directly, so
       deleting the call to it from the real pick left every one of them green — a perfect rule that
       nothing consults, which is this project's signature failure. pickFrom is what pickBuilding calls
       once it has turned a pointer into tile coordinates, and it is the thing under test from here on. */
    {
      const th = ISO.plotTile('townhall');
      const hh = built.townhall / TH;
      const roof = ISO.pickFrom(th[0] - hh * 0.7, th[1] - hh * 0.7, s);
      ok('the real pick consults the body pass, not only the ground', roof === 'townhall',
         'a tap 70% up the keep answers ' + (roof || 'nothing'));
      ok('and still answers the wall from the perimeter, which has no body',
         ISO.pickFrom(0, 0, s) === 'wall' && ISO.pickFrom(4, 8, s) === 'wall');
      ok('and still answers an unbuilt building from its dashed plot',
         (() => { const bare = Object.keys(s.b).find(k => !(s.b[k] > 0) && ISO.plotTile(k));
                  if(!bare) return true;
                  const p = ISO.plotTile(bare);
                  return ISO.pickFrom(p[0], p[1], s) === bare; })(),
         'by ground, since a level-0 building is drawn as a dashed outline only');
      ok('and answers nothing off the grid entirely',
         ISO.pickFrom(-3, -3, s) === null && ISO.pickFrom(20, 20, s) === null);
    }

    /* Bare earth is still bare earth: the body pass must not invent a hit. */
    ok('empty ground answers nothing, so the ground rule can have its turn',
       ISO.pickBody(4, 1, heights) === null,
       'pickBody at an empty tile: ' + (ISO.pickBody(4, 1, heights) || 'nothing'));
  }

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
