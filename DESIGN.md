# Crownhold — Design Document (v0)

A kingdom-defense strategy game with Kingshot's core loop and none of its pay-to-win
economy. Working title: **Crownhold**.

## The pitch

You govern a medieval hold on a lawless frontier. Build and upgrade your town, train
troops, recruit heroes, and repel escalating bandit raids — eventually alongside an
alliance, against other players' holds. Everything Kingshot sells for money, Crownhold
awards for playing well.

## Kingshot's loop, deconstructed

What makes Kingshot compulsive (keep all of this):

1. **Timer-driven base building** — buildings upgrade over real time; there is always
   something about to finish.
2. **Interlocking resources** — food/wood/stone/iron gate each other, so progress always
   has a next bottleneck.
3. **Threat pressure** — beast attacks and rival players make your numbers matter.
4. **Heroes** — named characters with levels and buffs that personalize your army.
5. **Alliance obligations** — helping, rallying, and territory give social stickiness.

What makes it pay-to-win (replace all of this):

| Kingshot mechanic | Why it's P2W | Crownhold replacement |
|---|---|---|
| Paid speedups & gems | Wallet converts directly to progression speed | **Valor**: a speedup currency earned only by playing — winning defenses, finishing quests, active patrols. Spend it to instantly finish any timer. Not purchasable, ever. |
| Hero gacha banners | Best heroes locked behind lottery spend | Heroes unlock at **milestones** (Town Hall levels, waves survived, quests) and are drafted three-at-a-time, pick one. Paid hero content is cosmetic skins only. |
| Seasonal hero power creep | Each new season's hero outclasses the last, so the roster is a subscription | **Seasons add heroes, never stronger ones.** Four join the pool each fortnight at the same power band as the founding twelve, they never expire, and the full cast is listed openly. Cadence without the ratchet. |
| VIP levels | Permanent stat buffs scale with lifetime spend | No VIP. Permanent account buffs come from a free **Mastery track** driven by play. |
| Resource/pack sales | Buy the economy directly | Resources are never sold. Shop is cosmetic-only. |
| Paid peace shields | Safety becomes a subscription | Shields earned via gameplay (post-defeat grace, quest rewards) and capped for everyone equally. |
| Whale-dominated PvP | Spend gap = power gap | **Seasonal leagues bracketed by power**, with seasonal soft caps so armies converge; skill and coordination decide fights. |

## Fair monetization (how it actually makes money)

- **Cosmetics**: hold skins, hero skins, banner/sigil customization, march trails,
  victory animations. Visible in PvP — status without stats.
- **Supporter Pass** (seasonal): cosmetic track + account-wide *convenience* that never
  touches combat math (extra saved army presets, richer battle-log history, profile
  flair). Every gameplay-relevant item on the pass is also earnable free.
- **No premium currency** that touches any power system. One store, real prices.

Design rule for every future feature: *if deleting a purchase would change any battle's
outcome, the purchase is cut.*

Full store spec, supporter-pass contents, and revenue scenarios: see
[MONETIZATION.md](MONETIZATION.md).

## Core systems (prototype scope — implemented in `index.html`)

- **Resources**: Food, Wood, Stone, Iron. Produced per second by buildings; storage
  capped by Town Hall level.
- **Buildings**: Town Hall (gates everything), Farm, Lumberyard, Quarry, Iron Mine,
  Barracks, Wall, Watchtower. One build queue; costs and times scale ~1.5× per level.
- **Troops**: Spearmen, Archers, Knights — trained in batches at the Barracks; army
  power is the sum plus hero and wall bonuses.
- **Raids**: a bandit wave every ~75s, escalating only when you win (losing makes the
  same wave regroup — no death spiral). Watchtower scouts enemy strength.
- **Heroes**: three, unlocked by milestones, levelled by defending. Marshal (+troop
  power), Steward (+production), Warden (−training time).
- **Valor**: the anti-P2W centerpiece, fully playable in the prototype — every timer
  has a "finish now" button priced in Valor, and Valor only comes from play.
- **Mastery track** (v0.2): the VIP replacement — ten permanent account perks earned
  from every kind of play (raids, quests, building, drilling, patrols); includes a
  hero unlock at Mastery 6. Cannot be bought.
- **Writs of Peace** (v0.2): the earned shield — granted on raid losses, Warband wins,
  and quests; capped stock (2, +1 via Mastery); pauses raids for 3 minutes.
- **Warbands** (v0.2): every 5th raid is elite — 1.6× strength, double loot and Valor,
  always drops a Writ.
- **Quests**: a guided chain teaching the loop, each granting resources or Valor.
- **Persistence**: local save with offline production (capped at 2h).

## Divergence & RNG (v0.5)

Design rule: **randomness proposes, the player disposes.** RNG creates different
account paths — it never sits behind a purchase or decides an outcome you paid for.
This is the anti-gacha: same excitement of the roll, none of the wallet.

- **Hero drafts**: a pool of **32 heroes**, rarity-weighted 62 common / 28 rare /
  10 epic. **30 milestones** unlock slots; each offers a draft of **three random
  champions — pick one**, with one 5-Valor redraw. No banners, no pity timers, no
  duplicates. Every account ends up a different subset in a different order.
- **Spoils of war**: every Warband win offers **three random permanent relics —
  pick one** (production charters, drill manuals, war trophies, upkeep larders,
  writ capacity…). Most stack, so builds compound differently run to run.
- Hero/spoil effects flow through one bonus-aggregation layer in `logic.js`
  (`heroBonus`/`spoilBonus`), so adding a hero is a data change in `defs.js`.
- Sim-verified: identical bot policies under different rolls produce different
  rosters and meaningfully different end states (power, upkeep profile), while
  overall pacing stays inside the v0.3 targets.

## Heroes: the court, the column, and the season (v1.18)

Kingshot brings heroes in through seasons, and each new cohort is stronger than
the last — that is the engine of its spend, because the only fast way to a new
season's hero is shards. Crownhold takes the *cadence* and refuses the *ratchet*.

**Two jobs, never both at once.** A hero either sits in your **court**, where
their passive lifts the whole hold, or **leads a column**, where a smaller trait
applies to that march alone. Riding out gives up the chair for the whole trip.

**Chairs are the cap.** `courtSeats = min(8, 4 + ⌊TownHall/3⌋)` — four to start,
eight by Town Hall 12. That ceiling is deliberately set where the old eight-hero
roster already sat, so widening the pool from 12 to 32 changes *what you can do*
and not *how hard you hit*. Without a cap, tripling the roster would have tripled
the passive stack: the sim measured the uncapped version at TH12 army 10,344 and
the capped one at 12,156 with the same loss rate, so the cap holds the line while
the march traits add the new value.

**Why this is the answer to more march slots.** A maxed Command Center fields
eight columns. Eight columns want eight leaders, plus eight in court — sixteen
heroes in active use. That is the honest reason the roster needed to grow, and it
is a reason that resolves into *decisions* rather than *power*: with 32 heroes and
16 jobs, every account runs a different assignment.

**Lead traits** are one of: column power, resources hauled, travel speed, losses
on the road, Valor, or Mastery — all scaled by hero level, all smaller than a
court passive. A hero who actually rides earns far more XP than one who sits.

**Seasons open doors and never close them.** Four heroes join the draft pool
every fortnight, across five arcs (The Iron Winter, The Salt Road, The Ashen Vale,
The Hollow Crown, The Long Thaw). Two rules make this the opposite of a banner:

1. *No power creep.* Season 5's epic is the same strength as Season 0's epic. A
   new season widens the cast; it never raises the ceiling. Nobody is punished
   for starting early, and nobody is bought an advantage for starting late.
2. *Nothing expires.* A player who begins in Season 9 can still draft the entire
   roster. There is no limited-time window, so there is no FOMO to sell against.

The whole cast — arrived and still riding — is listed openly in the Calendar. A
season's heroes are never a mystery box.

**The slot-preservation rule.** If a draft milestone comes due when the season
has nobody left unclaimed, the slot is *not* spent — it waits for the next season
to bring more names. Earning a draft you cannot use would be the one way this
system could quietly cheat a player, so it is explicitly prevented in `tick()`.

The season clock itself lives in `defs.js` (`seasonNo`, `SEASON_EPOCH`,
`SEASON_MS`) and is imported by both the browser and the server, so the two can
never disagree about which heroes have arrived. Offline play uses the same
calendar as online play.

### Stars: the ladder that never ends (v1.20)

The objection that forced this: *"if Season 16's heroes are no stronger, why
does Season 16 matter?"* That was right, and "every hero equal forever" was a
dead system. The fix separates two things Kingshot deliberately fuses.

**Does a player need something that always gets stronger?** Yes.
**Does the *new hero* need to be stronger than the *old hero*?** No — and that
specific choice is what turns a roster into a subscription.

In Kingshot, stars come from **duplicate shards**: the new hero is stronger *and*
the only way to ascend them is the shop. The creep isn't retention, it's the
collection funnel. Change where stars come from and the same infinite vertical
grind stops being P2W:

- **Stars are earned by fielding the hero** — marches led, camps burned, arena
  fought. Never by acquiring duplicates. The grind rewards attachment to the
  heroes you have, not acquisition of next season's.
- **Each star is +5% of everything that hero does**, applied by raising their
  *effective level*. One number feeds passives, lead traits, class affinity and
  column capacity alike, so ascension needs no special case anywhere.
- **The cap is the season number** (floored at 5). Season 16 means sixteen stars
  for your *whole roster*, the founding twelve included. The ladder rises for
  everyone at once; no hero is ever retired by the calendar.
- **Deeds curve:** `12 × (n+1)^1.6`. An active player's core heroes take ~a day
  for the first star, ~3 weeks to 5★, months to 10★, a year-plus to 20★. Infinite
  by construction, and every rung is paid in play.

### The season's temper (v1.22) — the strongest lever, and it costs nothing

The cleanest way to make a season matter is to change **what is coming at you**,
not what you own. Each season the Unpaid muster differently:

| Temper | Muster | Answer |
|---|---|---|
| The Common Muster | even | none |
| The Horselords | 60% riders | Shield Wall · spearmen |
| The Arrow Season | 60% skirmishers | Charge · knights |
| The Hammerfall | 60% brutes | Volley · archers |
| The Season of Engines | 45% brutes, mixed | ballistas |
| The Lean Season | 55% rabble | spearmen |

Tempers **cycle**, so this works at season 5 and at season 500 — verified to
season 501. The shift reaches three systems at once, all of which already
existed: `counterMult` (stance, ±20%), `compBonus` (troop composition, +15% for
the counter class), and hero **class affinity** (+1%/level to that troop type).
So a Horselords fortnight makes shieldwall, spearmen *and* your spearman
captains all correct together.

Nothing you own ever gets weaker. What changes is which of your things is the
right answer — which is exactly what a 32-hero roster is *for*, and it is how a
season earns attention without anyone being made obsolete. The next four tempers
are listed openly in the Calendar so players can drill ahead.

Sim-verified balance-neutral: a skilled bot scores TH9 / wave 120 / 36 losses
under The Horselords against TH9 / wave 124 / 34 under The Common Muster. The
temper does not change difficulty for someone who reads it — it changes what
reading it *means*. (The sim understates the system: its bot adapts stance but
never its troop mix or captains, which is where most of the depth is.)

### Columns and the arena five (v1.19–1.20)

Three heroes ride at the head of every march and five with an arena sortie, as in
Kingshot. Two consequences worth stating:

- **Column capacity comes from the leaders' levels** (6 base, +4 +3/level each).
  This is the honest answer to "why eight march slots?" — the slots are free, the
  capacity to fill them is not. Sized against the armies this game actually
  fields (upkeep holds a hold to dozens or low hundreds, not millions), so it
  binds hard while heroes are green and stops binding once they are veterans.
- **Eight slots × three leaders = 24 heroes** to field a full frontier. That is
  the real reason the roster grew to 32, and it resolves into *assignment
  decisions* rather than *power*.

**Class affinity** gives every hero one troop class (8 each across spearman /
archer / knight / ballista — our siege tier, which Kingshot lacks, gets its own
captains). +1%/level to that troop type in their column. Measured on 50 knights:
930 power under three cavalry heroes, 666 mixed, 550 unled. That 69% spread is
what makes a *wide* roster valuable rather than a tall one, and it is why
**formations** (saved leader+troop presets) are a real tool and not just a
convenience.

#### Three captains, four classes — the shortfall is the mechanic (v1.31)

Asked whether march seats should go from 3 to 4 so a column could cover every
troop type. No, and it is worth writing down why, because the argument generalises.

The premise was slightly off: you can already **send** all four troop types in one
march — `fitColumn` takes any mix. What is class-locked is only *affinity*. So a
fourth seat would not unlock a four-type column; it would unlock affinity on all
four at once.

Which is the thing that must stay locked. **Three seats against four classes is
the only reason affinity is a decision.** Make seats equal classes and the optimum
collapses to one captain of each, every march, forever, for every player — the
puzzle solves itself on day one and never comes up again. Kingshot has 3 heroes
and 3 troop types, so *its* version of this is already pre-solved; the ballista is
ours, and it is what keeps the choice live. Going to four would spend the one
place this game is more interesting than the one it learns from.

The numbers agree. A fourth captain at effective level 20 adds `4 + 3×20 = 64`
capacity onto 198 — a **+32% larger column** before its lead trait, its skills and
the fourth affinity; call it ~+40%. Every march gets strictly stronger and there
are fewer worth thinking about, when eight slots was already the count that felt
like too many. And the roster is exactly saturated at three: **8 marches × 3 = 24
out, + 8 court seats = 32**, the whole pool. At four per march, full deployment
empties the court and a newcomer with seven heroes drops from two columns to one.

The real defect was that none of this was **visible**. Affinity was explained in
the arena, in three places, and *nowhere in the march builder* — so a structural
choice read as a missing feature. That is the actual lesson: when players ask for
a system to be loosened, check first whether it is merely illegible. The fix was a
coverage strip (four troop tiles, lit where a captain rides, with the real figure),
the same figure on each troop row, and a plain line when troops ride uncovered —
*"30 ballistae ride without a captain — no affinity."* Stated as a cost, not
scolded: riding uncovered is a legitimate call when you want the bodies more than
the bonus.

`classMult()` lives in `logic.js` and is used by both the label and the battle, so
the number on screen cannot drift from the number that fights — the failure that
made every skill percentage a lie in v1.27. The multiplier is the primitive and
the displayed lift is derived from it, so combat's arithmetic is untouched by a
function added for the UI's benefit.

### Gear, both kinds (v1.23)

Kingshot has hero gear and lord gear, and both are heavy spend funnels there —
fed by random forging and paid refreshes. Three rules keep this version honest:

- **Everything is crafted**, at the Forge, from Steel and Runestone. Those are
  already the scarcest goods in the economy (storage caps of 10% and 3.5%) and
  cannot be bought.
- **No random stats.** A tier-6 blade is a tier-6 blade for everyone. There is
  nothing to reroll, so there is nothing to sell rerolls of. This is the single
  most important line in the system.
- **Wargear raises effective level**, exactly as stars do — so it needs no
  special case anywhere in the rules, and it cannot overtake a hero you have
  actually been fielding.

| Track | Slots | Full set |
|---|---|---|
| Lord's Regalia (account-wide) | crown, signet, mantle, blade | +20% production, +20% Valor, +20% troop power, −15% casualties |
| Hero wargear (per hero) | weapon, armour, helm, banner | +10 effective levels (4 tiers = 1 level) |

**The real cost is the queue, not the materials.** One smithing queue serves the
Regalia and all 32 heroes. Measured: a full Regalia is ~10 hours of exclusive
forge time; kitting an entire roster is several hundred. Runestone enters at
tier 6, so early gear never blocks on the Runeworks (TH22).

**Charms and gear sockets: declined (v1.32).** Proposed and set aside, so it does
not get re-proposed as though it were new. Two reasons. Progression already has
three multiplying layers on a hero — level, stars, wargear — and a fourth adds
arithmetic, not decisions: nobody chooses *between* charm slots, they simply fill
them. And sockets are the standard vehicle for exactly what the no-random-stats
rule above exists to forbid; a socket wants something random to put in it, and
once a slot can hold a rerollable thing, rerolls are the obvious sale. The two
gear tracks stay as the ceiling on how much a hero can be equipped.

### The Salt Isle (v1.29) — a second map that plays the opposite way

A second map is only worth building if it plays differently from the first,
otherwise it is the same errand at a different address. Every property of the
Isle is the Frontier inverted, and each inversion is doing a job:

| | The Frontier | The Salt Isle |
|---|---|---|
| Visibility | all of it, always | **fogged**; landing charts the water around it, permanently |
| Concurrency | up to 8 columns | **one ship**, however many march slots you own |
| Duration | minutes | **hours**, and no recall |
| Gate | attention | **Rations** — a building, not a habit |
| Persistence | nodes regrow | **spent when worked**; the chart is redrawn each season |

The fog is the important one: it makes the map a thing you *learn*, and turns
uncovering a Drowned Hall into an event rather than a spawn. Charted percentage is
the only progress bar in the game that measures knowledge instead of power.

**Rations as the gate** is what keeps the Isle from becoming another daily chore.
How often you can sail is set by the Victualler's level (2% off per level, to
half), so it rewards having built the building rather than having checked your
phone. Measured: a level-15 Victualler brings a crossing from 260 Rations to 182,
and a level-20 Command Centre brings 3 hours down to 2h06m.

**Isle Ore is the only resource in the game with no building behind it.** It
cannot be produced, only carried home, and it is the only thing the Truegold
Crucible will eat. That chain — Victualler → voyage → ore → Crucible → Truegold —
is the entire reason to sail, and it means the Crucible deliberately idles between
voyages. It is a reason to go, not a treadmill.

The site resolves **on return, not on departure**, so a voyage is a wager. Fights
there wound only, like everywhere the Unpaid are not involved.

The chart is seeded from the season number, so everyone sailing the same fortnight
is learning the same island — which makes it something an alliance can actually
talk about.

Verified end to end: 224 aboard (capped by the three captains, not by the Isle),
all home, the site stripped, five new cells charted, 3 ore refined into exactly
0.75 Truegold, a second ship refused while the first is at sea, and the chart
reset when the tide turned.

Architectural note: the voyage code lives in `world.js` rather than `logic.js`,
because it needs `marchPower`, `marchCapacity` and `refPower` — and `logic.js`
importing `world.js` back would have made a cycle. The Isle is a map; maps live in
`world.js`.

### Hero skills — choices, not levels (v1.27)

Kingshot's hero skills work because they are *where hero shards go*. The currency
is the point; the numbers only exist to give it somewhere to land. Strip the
currency out and levelled skills become a fourth vertical track on top of levels,
stars and two gear slots — a spreadsheet, not a decision.

So skills here change what a hero **is**, never how big their numbers are:

- **26 skills in a shared pool.** Which ones a hero may take depends on their
  troop class, so every captain has a different legal set of around twenty. Two
  heroes of the same class still differ by what you chose; two of different
  classes differ by what they could ever have chosen.
- **Three slots, opened by investment** — one from the start, one at level 10,
  one at 3★. Progression is in *how many* choices you get, not their size.
- **Freely reassignable, always, for nothing.** A build you cannot change is a
  mistake you paid for. This is meant to be rethought every fortnight when the
  temper turns.
- **Many carry a real cost.** Hard March trades haul for power; Light Packs the
  reverse; Careful Route buys lives with time; Tight Column buys power with
  capacity. A skill that is simply better than the alternative is not a choice,
  it is a tax on not reading a wiki.

The conditional skills are where the actual decisions live: **One Purpose** pays
+30% if every soldier in the column is one class, **Mixed Arms** +18% if you field
three or more, and **Camp-Breaker / Beast-Bane / Host-Breaker** each pay against
one kind of enemy. Together with the season's temper this is the loop the whole
hero system was built for — the right build changes when the muster does, and
nothing about changing it costs a thing.

Skills aggregate onto the same keys as lead traits and court passives
(`skillTotal`, `skillCourt`, `skillClass`, `skillCond`), so they needed no new
plumbing at the point of use — but they **multiply** rather than joining the
additive pool, and that distinction turned out to matter more than anything else
in the system.

**Three bugs, and the first is the one worth remembering.** Written in the same
style as everything else, skills added their percentages into a bracket that
already held hero, spoil and lead bonuses. Hard March, labelled "+12% column
power", measured **+9.7%**. Lance Charge, labelled "+30% to knights", measured
**+24.4%**. Every percentage in the system was diluted by whatever else the hero
already had — so the number in the tooltip was never the number the player got,
and the dilution *varied with the hero*, which makes it unlearnable. For a game
whose whole pitch is showing exact mechanics, a label that is not literally true
is a defect, not a rounding difference. Everything a skill claims now applies on
its own factor.

Second: `equipped()` filtered empty slots *before* trimming to the slots you have
unlocked, which compacted the array — a skill parked in slot 2 slid into slot 1
and applied for free. Unreachable today (levels and stars never fall) but live the
instant anything lets a slot close. Slice first, filter second.

Third was in the test itself, which checked One Purpose against a four-class
column where its condition cannot hold, and read the resulting zero as proof the
skill was inert.

### The verification suite (`npm run verify`, `npm run check`)

Skills shipped with 48 assertions in `sim/verify-skills.mjs`, because this
project's characteristic failure is **a system that quietly does nothing** — the
frontier was mathematically unwinnable for two commits and the only symptom was
an absence in the simulator's output, which I read as caution. So the suite does
not check that modules load. It equips each skill alone and measures the figure it
claims to move, asserts that Lance Charge leaves spearmen *bit-identical*, that
One Purpose pays exactly nothing on a mixed column, that an unseated captain's
court skill does nothing at all — and ends with a sweep that fails the run and
**names** any skill that moves no number anywhere.

`npm run check` chains build → verify → verify:ui → sim, so a red test stops the
chain before the simulator runs.

### I reported a green check while the last step was crashing (v1.34)

`npm run check` chains build → verify → verify:ui → sim. From **v1.31 to v1.33** the
sim step crashed on every run, and I reported "check passes" three times.

The bug: v1.31 threaded `rand` into a `gainBond()` call that lives in
`resolveReturn()` — a function with no `rand` parameter. I had read a grep of line
numbers and assumed the line sat inside `resolveArrival()`, which does take one. Every
completed beast hunt threw a `ReferenceError`, **in the browser as well as the
simulator**, and it shipped.

The simulator caught it instantly. I never saw it, because I was filtering the output:

    npm run check 2>&1 | grep -E "all [0-9]+ passed|FAILED|✗|index.html written"

An uncaught exception matches none of those patterns. The two verify suites printed
their green lines, the sim died after them, and I read the green and moved on. The
`&&` chain did its job and returned non-zero; my grep threw that away.

Three changes, in order of how much they matter:

1. **`check` now ends with `== check complete ==`.** If that line is absent, something
   died — which survives careless filtering, because the thing I look for is now
   emitted only on total success rather than by each step individually.
2. **A test that exercises a march from muster to homecoming** and fails loudly, rather
   than requiring someone to read a stack trace in a log they filtered. Verified by
   re-introducing the bug and watching it fail.
3. The lesson under both: **narrowing output is a way of deciding in advance what
   failure looks like.** A crash is the failure mode you did not anticipate, so it is
   precisely what the filter removes. Read the tail of a build, not a grep of it.

### The simulator was lying, and that was worse than a bug (v1.31)

While checking that a refactor had changed no numbers, the sim reported a
divergence: one scenario ended a whole Town Hall level apart. I wrote a plausible
explanation (a floating-point round trip) and started fixing it — then ran the sim
twice on **identical code** and it disagreed with itself.

`gainBond()` called `Math.random()` directly instead of the `rand` it was handed.
Pets carry bonuses, so a different companion moved army power, which moved the
bot's commitment threshold, which moved the entire run. The one tool whose job is
to tell a balance change from noise **was the noise**, and it had been for as long
as pets existed. Every "the sim says this is fine" in this document from v1.24
onward was worth less than I thought.

Three lessons, in order of how much they cost:

1. **An injection point that silently isn't used is this project's oldest bug.**
   `rand = Math.random` as a parameter default is only a promise; something has to
   check it is kept. `verify-skills.mjs` now proves the pet offer follows the
   injected rng — including that a *different* rng gives a *different* offer, so
   the test cannot pass on the broken version.
2. **Determinism is a property to test, not to assume.** A simulator that isn't
   reproducible cannot be a regression check, and it fails silently: it just
   returns slightly different numbers, which look like the thing you were
   measuring.
3. **I explained the divergence before establishing it was real.** The
   floating-point story was coherent, specific, and wrong — and it was wrong in
   the direction of my own recent change, which is the direction to be most
   suspicious of. Reproduce first, theorise second. The check that settled it took
   one command: run it twice, unchanged.

### Sound (v1.44) — synthesised, because assets are a blocker and silence is worse

The game had thirty systems and no audio at all: no `Audio`, no `AudioContext`, not one
file. A kingdom-defence game where a raid lands in silence reads as unfinished more
loudly than any missing feature does.

**Every sound is generated at runtime.** Same reasoning as the procedural renderer and
the same reason the sprite pipeline shipped with no art in it: an asset pipeline blocks
on sourcing, licensing and file size, and this one would have blocked on the same person
the sprite art is blocked on. WebAudio has oscillators, filters and somewhere to put a
noise buffer, which is a synthesiser. Thirteen cues and an ambient bed in ~230 lines,
adding nothing to the bundle. Real recorded audio can replace any cue later; the cue
names are the seam.

Four decisions carry the design:

1. **The context is built on the first gesture, never at import.** Every browser suspends
   an AudioContext created before the user has touched the page, and a suspended context
   does not error — it plays nothing, for ever.
2. **Mute is a device preference, not game state.** It lives in localStorage, never enters
   `s`, so it does not ride in a save or sync to the server. Whether this room is quiet
   is not a fact about your hold.
3. **Cues fire from state diffs, not from logic.js.** The rules layer does not know sound
   exists, so the simulator stays silent and pure. `watch()` only ever reads — asserted,
   because a sound that could change a rule would be a genuine disaster.
4. **One cue per tick, by priority.** Eight watched signals can land in one frame; being
   attacked outranks a building finishing, and the losers are dropped rather than queued,
   because feedback that arrives late is a lie. A same-name debounce lets the button and
   the watcher both speak honestly without either knowing about the other.

Settings shipped with it. Sound with no mute is hostile, and there was no settings panel
of any kind before this.

#### `verify:audio` — the tests could not hear anything either

`verify-ui.mjs` runs in Node, which has no audio, so every assertion it can make is about
*not throwing*. Nothing in it would notice a cue that produces silence — and silence is
the likeliest failure in synthesised audio: a gain ramp that ends where it started, a node
never connected, an oscillator stopped before its envelope opens. All three are silent
successes. I also cannot listen to the output, so measuring was the only verification
available at all.

So the cues are rendered through an `OfflineAudioContext` in headless Chrome and the
waveform is measured — peak, RMS and onset per cue, with the shipped bundle carrying no
test hooks (the harness copies `src/` and appends the reset to the copy, as `verify-ui`
does for the composer).

**It immediately found something no amount of reading would have.** The ambient wind
measured a peak of **0.003** — 34 dB under the loudest cue, inaudible on a phone. The gains
in `startBed` looked reasonable next to the cues' gains, but the bed runs through a 260 Hz
lowpass at Q 0.8, which discards most of white noise's energy: the amplitude that reaches
the ear is about 0.3× the gain. `BED_QUIET`/`BED_LOUD` went from 0.010/0.042 to 0.05/0.15,
and the wind now rests at 0.018 and reaches 0.054 at full threat — ×0.43 of the loudest
cue, present but subordinate.

Getting the harness to work cost four wrong turns, all the same species:

- **`--dump-dom` emits the inline `<script>` source too**, so searching the whole dump for
  a marker finds the *page's own code* before the rendered payload. It reported the source
  of my error handler as the error, and before that blamed the JSON parser. Fixed by
  scoping every match to `<pre id="…">`.
- **The load event does not wait for a dynamic `import()`** issued after the initial module
  graph is evaluated. The page sat at "rendering…" for ever.
- **Nor does it wait for a chain of awaited renderings.** Raising
  `--virtual-time-budget` moved the loss from cue 2 to cue 4 to cue 12 — a race being lost
  more slowly, not a bug being fixed. One render per page *plus* a virtual clock is what
  actually works; either alone is flaky.
- **Rendering the bed measured the ramp, not the level.** `ambience()` moves gain with
  `setTargetAtTime`, an exponential approach that never formally arrives; 3- and 6-second
  windows did not resolve at all. Split into two questions instead: is the resting bed
  audible (measured), and how far above it does full threat go (`bedLevel`, exact
  arithmetic). Ask each the way it can actually be answered.

The lesson worth keeping is the one this project keeps relearning in new costume: **the
instrument is part of the system.** A frame rate under a virtual clock, a promotion priced
for an army of one, a probe reading its own source — every time, the measurement was wrong
in a way that looked like a finding.

### One soldier, one tier bill (v1.43) — and a fix that was worse than the bug

Asked whether to add a fifth troop type, mages, since the genre always stops at three.
Measuring that question meant measuring through the tier economy, and the tier economy
turned out to be broken.

A soldier can reach Tier X two ways: drilled at Tier X, or drilled at Tier I and reforged
later. Those cost the same thing and should cost the same money. They were **4.8× apart** —
1.98× a soldier's base cost at the yard against 9.45× to reforge them. And `promoteCost`
scaled with the line you *currently* fielded, with `n` collapsing to 1 on an empty muster,
so the efficient opening was to drill nothing until the War Academy topped out, promote
every line for pennies, and only then mass-drill:

| route to 400/400/200/100, all Tier X | cost |
|---|---|
| promote on an empty muster, then drill | 181,812 |
| drill as you go, then promote | 716,113 |
| | **3.9× penalty for playing the obvious way** |

A trap for ordinary play is worse than an exploit for clever play — nobody reads the second
one as unfair, and everybody who hits the first one just quietly falls behind.

**Then I fixed it wrong.** The per-head term looked like the culprit, so I replaced it with
a fixed price per line, tuned to land on the same income-hours the honest route already
cost. Every test passed. It also silently inverted the composition meta: mono took the
floor at three budgets out of four, where before the spread build won all four.

The per-head term was never the bug. It is what keeps tiers **neutral** between a narrow
army and a broad one — the bill scales with the bodies that benefit, so power per resource
comes out the same either way and composition is settled by cover and the counter triangle,
which is where the design wants it settled. Pricing per line hands a concentrated army the
same upgrade for a quarter of the money, because the cost is per line and the benefit is
per soldier.

The actual fix is one line: a reforge step costs each soldier exactly `TIER_COST` × their
base cost — the premium the yard would have charged to drill them a tier higher. Both routes
now agree to within 0.3%, and tiers buy 12% *more* power per resource broad than narrow.

I then spent a sweep of 25 candidate `HOLDS`/`NEEDS` values for cavalry trying to repair a
mono advantage that only existed because of my own fix. None of the 25 worked, which is what
finally pointed at the pricing rather than the cover table. **The four-type game needed no
balance change at all.**

Three things worth keeping:

1. **A fix that passes every test can still be a regression.** The suite asserted the
   invariant I had just thought of, not the property I was about to destroy. The guard now
   in place — *tiers buy the same power per resource narrow or broad* — is the one that
   would have caught it, and it exists only because the sweep failed loudly enough to make
   me look.
2. **When a sweep finds nothing, suspect the axis.** Twenty-five failures in a row is not a
   tuning problem, it is a sign you are turning the wrong dial.
3. **Price the destination, not the route.** Any rule where two paths to an identical state
   cost different amounts becomes compulsory knowledge, and the player who has not read the
   wiki pays for it.

#### And the answer on mages

Not the complexity risk it looks like — the game already carries four types where Whiteout
Survival and Kingshot carry three, and it absorbs the fourth by putting it **outside** the
counter triangle (`BEATS` is a 3-cycle; the ballista is not in it). The binding constraint
is the **cover budget**: `HOLDS` and `NEEDS` mean only so many fully-exposed troops can be
anchored, and the four existing lines already spend that budget. A balanced four-line army
sits at cover 0.50, which is the sweet spot — high enough that breadth pays, low enough that
concentrating is still a real gamble.

Five stat lines tested for a mage, from glass cannon to line-holder. **None held the shape:**

| HOLDS | NEEDS | balanced cover | spread floor | mono ceiling | |
|---|---|---|---|---|---|
| 0.00 | 1.00 | 0.31 | 2/4 | 4/4 | too many exposed — breadth stops paying |
| 0.00 | 0.80 | 0.34 | 4/4 | 3/4 | spread now out-ceilings mono — no gamble left |
| 0.15 | 0.80 | 0.40 | 3/4 | 2/4 | both properties gone |
| 0.30 | 0.50 | 0.52 | 0/4 | 4/4 | mono takes the floor everywhere |
| 0.50 | 0.30 | 0.62 | 0/4 | 4/4 | worse |

Fully-exposed mages dilute the cover pool; mages that can hold a line inflate it and hand
the floor back to mono. There is no room at five.

**Recommended instead: rename the ballista to a battlemage.** It already occupies exactly
that slot — dearest per body, highest power, `HOLDS: 0`, `NEEDS: 1`, worth half of itself
with nobody in front. That is not a siege engine's profile, it is a spellcaster's. The cost
is one `TROOPS` entry, one building name and one icon: no new economy, no new heroes, no
change to the triangle, and it delivers the differentiation the genre lacks at zero balance
risk.

### Composition: no shape may be free money (v1.40)

Asked whether to copy Rise of Empires' rule that a full march of cavalry moves faster.
The question contained its own answer — *"everybody was using knights"*. A reward for one
shape does not add a choice, it deletes three.

Checking whether we had the same disease found that **we did, worse, pointed at siege.**
Columns are capacity-limited by **headcount**, so what matters is power per slot:

| | power per slot | casualty weight |
|---|---|---|
| ballista | **59** | 0.5 |
| knight | 33 | 0.75 |
| archer | 15 | 1.2 |
| spearman | 9 | 1.5 |

A full column of ballistae hit for 13,284 where the same 225 slots mixed hit 6,218 — and
it took **a third of the casualties**, because `SCREEN`'s per-type weights were applied as
independent multipliers. The rule's own comment says *"the cheap line screens the expensive
engines"*, but as written a pure-ballista column enjoyed the protection of a screen that
was not there. Six and a half times the power and a third of the losses, with nothing
penalising purity. Hidden for months behind the simulator bot's hardcoded 30/20/30/20
training mix — the same blind spot that concealed four other things this session.

Two fixes, both **continuous rather than categorical**, which is the lesson the raid cost
curve taught twice:

**The screen now redistributes a fixed casualty budget instead of scaling it.** The same
battle costs the same number of casualties whatever you brought; the weights decide *who*
takes them. A line in front converts ballista losses into spearman losses (45 against 15
in a 50/50 column) — and cheap losses are the point, since a spearman costs 25 food and 10
wood against a ballista's 80 wood and 40 iron. Engines with nobody in front take all of it.

**Pace is a property of the column, not a bonus for a shape.** Share-weighted: cavalry ×0.8,
foot ×1.05, siege ×1.6. One ballista among two hundred cavalry costs ×0.804 rather than the
whole penalty — *"the slowest sets the pace"* would have been a gotcha and a cliff of exactly
the kind the raid curve just had removed. This delivers the Rise of Empires *feel* — cavalry
are how you cover ground — with no purity reward anywhere.

#### Interdependence, which is what actually stops a mono army (v1.42)

Levelling power-per-load stopped one *type* dominating and then made something worse
optimal: **specialise.** Asked why bother with four types at all if all-archers is 91% of
all-knights — just train one line and spend nothing on the others.

Measured, and the answer was that specialising has economies I had not priced:

- promoting **one** troop line to tier 5 costs **165** resources; all four cost **972**
- one troop building instead of four
- all three captains can share a class, so affinity triples on your only type

Three archer captains fielding only archers measured **3,803** against a mixed column's
**3,263**. Six times cheaper *and* stronger. No percentage nudge answers that — the counter
bonus was capped at +15% against a 6× cost advantage.

What answers it is **structure**, which is what Whiteout Survival actually uses: marksmen die
without an infantry line, and the counter triangle is decisive. We modelled the first as a
casualty *distribution* — which taxes nobody's power — and did not model the second at all.
A raid compared two totals and never asked what either side was made of, so **composition was
literally irrelevant in PvP** and a mono army had no predator anywhere.

**Cover.** `HOLDS`/`NEEDS` per type: ranged troops and engines are worth up to half as much
with nobody standing in front. A wall counts as the line, so archers behind stonework are
sound and the same archers in a field are not — which is why a defensive army and a marching
column now want different shapes. This is what makes the spearman worth training: at 55% of a
knight's raw power, his job is to make the rest of the army work.

**The triangle.** Pikes stop cavalry, cavalry runs down archers, archers shoot the slow line;
ballistae have no field answer, which is why they need cover most. Weighted by each side's
share of the fighting, so it is a matter of degree. Applied to raids *and* to camps — every
camp now holds its ground with a particular kind of soldier, because most play is PvE and a
triangle that only exists in PvP leaves the majority of the game without a predator.

|  | best case | **worst case** |
|---|---|---|
| all knights | 4,846 | 2,609 |
| **even four ways** | 2,882 | **2,616** |
| archers behind a line | 3,046 | 2,276 |
| all archers | 3,337 | 1,797 |
| all ballistae | 1,653 | 1,653 |

**Mono is now a gamble rather than a free win, and that is the intended end state** — not
"mono is dead". The balanced column has the best guaranteed floor and can take any camp on the
map; mono-knight peaks 67% higher but only against the third of camps that suit it, and in a
raid it is betting blind, because the raid board shows a target's power and never its
composition. Cheap-and-narrow against expensive-and-flexible is a real decision, and 0%-of-a-type
builds exist in Whiteout Survival too — they are a build, not the meta.

The battle report names the matchup afterwards, so the triangle is learnable without being
handed over before the fight.

*Three of my own tests failed on this change and all three were measuring the old model.* The
`classLift` probe compared a pure spearman column against a pure ballista one — which have
different cover now, so it was reading cover as affinity and reported 146% for a 23% lift. It
measures a marginal contribution on top of a fixed line instead. And two v1.41 assertions
demanded pure columns be near-equal in power, which interdependence deliberately breaks; the
property they should have been guarding is power per unit of *capacity*, plus the worst-case
floor.

#### Capacity is load, not headcount (v1.41) — and pace came back out

Asked whether march speed should be uniform across troop types, as in the reference games,
noting that some Whiteout Survival players run 0% cavalry.

Checking that found the premise slightly off and something more useful underneath. **0%
lancer is a fringe defence build**, not the meta — guides call it risky; the actual meta is
varied ratios of all three (50/20/30, 40/20/40, 50/10/40). And the reason they *have* varied
ratios is the structure, not the speed: **their three types are a triangle** — Infantry →
Lancer → Marksman → Infantry, roughly equal in power, differentiated by what they counter.
**Ours were a ladder**: power 3 → 5 → 11 → 24. A triangle makes composition a matchup
question; a ladder plus headcount capacity makes it arithmetic with one answer.

So differential march pace was never the cure — it was a restraint on a ladder. The cure is
`LOAD = {spearman:1, archer:1, knight:2, ballista:4}`: capacity measures what a column
*weighs* rather than how many bodies are in it.

| | troops | power | of the best |
|---|---|---|---|
| all knights | 112 | 3,728 | **100%** |
| all archers | 225 | 3,404 | 91% |
| all ballistae | 56 | 3,306 | 89% |
| even four ways | 112 | 3,263 | 88% |
| all spearmen | 225 | 2,042 | 55% |

Every fighting composition now lands within **13%** of the field, against a **2.1×**
dominance before. The spearman sits at 55% and should — it is the screen, not a damage unit.
Knights edge it only because `marshal` is a knight captain, which is the system working as
designed: **your captains decide your best mix**, and the temper rotates which class counters
this fortnight. That is their triangle, arrived at from our own parts.

Pace was removed in the same pass. It was a second mechanic doing a job this one does
properly, and one mechanic doing a job well beats two doing it badly. The screen fix stayed,
because it does a different job — it decides *who* takes the casualties, not how many.

Frontier balance held: the 8-hour run still reaches level-7 camps at wave 310. And the
simulator's bot now *varies* its column — `all-in×420 | screened siege×51 | screened
cavalry×4` — where before it chose all-in every single time. A live decision, visible in the
data.

#### Measured, and honestly: narrowed, not closed (v1.40, superseded above)

| | power | pace | power × trips/hr | power per troop-cost lost |
|---|---|---|---|---|
| all ballistae | 13,284 | ×1.60 | 272,959 | 122 |
| all knights | 7,489 | ×0.80 | 229,255 | 110 |
| ballista + screen | 7,697 | ×1.33 | 178,309 | **171** |
| even four ways | 6,526 | ×1.11 | 167,692 | 143 |

Siege's throughput advantage over cavalry fell from **1.8× to 1.19×**, and screened mixes
became the most casualty-efficient columns in the game. But for a **single decisive fight** —
a raid, a camp you must beat — raw power is all that counts, and all-ballistae still wins by
1.8×. The root cause is untouched: **a ballista and a spearman consume the same capacity slot
while differing 6.5× in power.**

The fix that would close it is to make capacity a measure of *load* rather than headcount —
`{spearman:1, archer:1, knight:2, ballista:4}` — which levels power-per-slot-unit at roughly
15 for archer, knight and ballista and leaves the spearman as the cheap screen it is meant to
be. That changes what "capacity" means to the player and every number that displays it, so it
is a decision to take deliberately rather than to slip in behind a balance pass.

### Hold against hold (v1.37) — and the one line the whole thing rests on

The attack side the Watch was built to defend against. This is the system Whiteout
Survival monetizes hardest, so the anti-P2W line had to be drawn in code rather than in
this document. **WoS does not sell power to attackers. It sells relief to victims** —
shields, teleports, instant healing, resource protection, all bought in a panic in the
ten minutes after someone burned your city. Fear of loss is the product.

Four rules remove the fear without removing the fight, each one a line in `src/raid.js`:

1. **Your wall is survivable; your ambition is not.** Soldiers defending your own hold
   are only ever wounded — however small your Infirmary. Soldiers you *send out* can die,
   and a broken assault buries most of the column.
2. **Only food, wood, stone and iron can be taken**, and only the share the Warehouse
   leaves exposed. Steel, runestone, rations, Isle ore and Truegold — the scarce spine of
   the economy — cannot be carted off at all.
3. **A column carries what it can carry.** Loot is capped by the size of the column that
   came for it: a four-soldier raid on a hold sitting on five million food took 165.
4. **Losing buys peace, free.** A beaten hold gets a Writ and 30 minutes of grace,
   automatically. In WoS that window is the checkout page.

Attacks are bracketed by defensive power on the **same rule the arena already used** —
one bracket in this codebase, not two — so a maxed hold cannot farm a beginner. The test
suite's first attempt to stage a raid was refused by it, which was the bracket working
and my setup being wrong.

#### Rule 1 was half wrong, and the correction is the better design (v1.38)

The first version made **both** sides wounds-only, and that was a mistake: it meant an
attack cost nothing you could not heal, so raiding was free and the correct play was to
raid every cooldown forever.

The distinction that fixes it is the one that mattered all along. WoS's funnel is **victim
desperation** — troops destroyed while you slept, by an attack you did not choose, and then
a healing pack for sale. An **attacker's** losses are a risk they opted into. So a share of
an attacker's casualties are dead for good (35% of them on a win, 70% on a defeat), and the
defender's are still never.

The cost curve took two passes to get right, and both faults were the same fault.

**First attempt:** both sides used *"a rout costs the loser little because there was no
fight"*, which for an attacker is exactly wrong — hurling 60 soldiers at a hold four times
their strength cost 17% of the column, a cheap probe. Fixed by giving the attacker a curve
that rises with the mismatch.

**Second attempt** still switched on *who won*, which put a **cliff at the boundary**:
winning 51-to-49 cost 6% of the column for good, losing 49-to-51 cost 24%. A fourfold jump
across an infinitesimal difference in power makes a coin-flip feel arbitrary rather than
earned — and it made the spread from best case to worst a factor of **seven**.

Both curves now read a single continuous axis — `oddsOf(mine, theirs)`, how outgunned the
column was — and **neither asks who won**:

| attacker's power vs the wall | outcome | lost for good |
|---|---|---|
| ×4 | won | 9% |
| ×2 | won | 11% |
| ×1.3 | won | 14% |
| ×1.05 | won | **17%** |
| ×0.95 | lost | **18%** |
| ×0.7 | lost | 24% |
| ×0.2 | lost | 28% |

Smooth through the boundary, and a factor of about three end to end instead of seven. The
suite asserts these as *properties* rather than magic numbers — the cost rises with the
odds, the two sides of the boundary agree within five points, and the whole range stays
under ×4.5 — because the properties are what the design claims and the exact figures are
tuning.

#### The bug that the defender's half was hiding

`takeCasualties` has always capped the wounded at the beds the Infirmary provides and
buried the overflow. Its own comment says so: *"`pve` means nobody dies except for want
of a bed."* For the Unpaid that is a good mechanic — it is why the Hospital matters.

With another player as the attacker it is **exactly the funnel**. The server test found
it immediately: a raid on a hold with no Hospital took 120 defenders to 69 with only 30
wounded. **Twenty-one soldiers were gone permanently because there was nowhere to lay
them down** — which is the precise moment a real game shows you a healing pack.

So raids resolve through `takeWounds()`, which never kills and which the Infirmary's size
does not get a vote in. The overflow waits in a field camp. The cost stays real — the
wounded cannot fight, and healing them takes resources and time, both earned — but troops
cannot be destroyed. Asserted directly rather than hoped for out of a battle:
`takeWounds` holds 120 wounded against 30 beds and buries nobody, while `takeCasualties`
given the same numbers kills 90.

#### Where the Watch pays off

A garrison an ally posted is counted by `armyBreakdown`, so it is felt in a real assault:
a bare hold defending at 606 defended at **3396** with one allied column standing, and its
own soldiers were lifted from ×1.00 to ×2.50 rather than merely joined. That is the payoff
for having built the defensive half first.

#### Two things worth keeping

Battle reports **persist on both holds** rather than living only on the in-flight record.
The register is emptied when a column gets home, and a battle you cannot look at afterwards
may as well not have had a result. Each side reads it from their own side.

And the panel **states all four rules on screen**. Not as marketing: a player who does not
know their troops cannot die will play as though they can, and that fear is what the entire
funnel is built on. Removing the fear only works if you also remove the doubt.

### The Muster Roll and the Watch (v1.36) — copying Whiteout Survival, minus the funnel

Two systems taken from Whiteout Survival, chosen after checking what we already had —
which was most of it. Alliance tech funded by donations, alliance help on build
timers, landmark garrisons and banners, an alliance boss, rallies, realms and the
Rift were all in. The genuine holes were a *standing* shared goal and a way to spend
troops on someone else.

**The Muster Roll** (Alliance Mobilization). A fortnightly board on the season clock:
one task at a time, drawn from eight kinds of work, at Light / Fair / Hard weights
that pay 10 / 30 / 75 points. Both counters WoS keeps — personal points pay you,
alliance points lift everyone's share — because your neighbour's work being worth
something to you is the entire reason a shared board beats a private quest list.

Three of their choices we refused, and each refusal is a line of code:

- **Their tasks include "spend gems."** A cooperative board whose rungs are purchases
  is a spend funnel wearing a friendship badge. Every task here reads a counter the
  hold already keeps, and a test asserts no task carries a `price`, `gems` or `cost`.
- **Their rewards go to the top five earners per alliance.** That pays the already
  strong and tells everyone else not to bother. Here everyone who scores is paid, in
  proportion to what they did.
- **Their rerolls are an officer privilege.** Here you redraw your own work, free, on a
  20-minute cooldown — "this task doesn't suit how I play" is not something a rank
  should adjudicate. The reroll also refuses to hand back the task you already had,
  because a button that can do nothing is a button that lies.

Progress is measured from a **snapshot of an existing counter**, so there is no new
tracking anywhere. That was deliberate: threading increments through `resolveWave`,
`resolveReturn` and a dozen other call sites is exactly where this project put a
`rand` in the wrong function and shipped a crash for three versions.

**The Watch** (garrison). A column stationed at an ally's wall for four hours. The
rule worth having is theirs: **everything at a wall fights under the best captain
present**, so a strong hold standing over a weak one lifts *that hold's own soldiers*
to its numbers rather than merely adding to them. Measured over HTTP: a host at ×1.000
became ×3.010 with one column posted. In WoS that is a reason to *buy* power — you pay
to be the umbrella. Here it can only be given.

It bleeds, or it would be free power and stationing troops would strictly beat keeping
them home. Wounds, never deaths; the hurt lands in the **owner's** infirmary when the
Watch comes home, so the cost of standing over a neighbour falls on whoever chose to.
Return is driven from the sender's side, because the host may not log in for a week and
a column must not be stranded by someone else's absence — the bug rallies had before
v1.25.

**On PvP.** The garrison was built for hold-vs-hold combat, which is the stated
direction. The guardrail that keeps that non-P2W is worth stating plainly, because it
is the whole game: **WoS monetizes fear of loss** — shields, teleports, instant healing
and resource protection, all sold, all bought in a panic after someone hit you. So
attacks must wound rather than kill, stores must stay partly protected, and Writs must
stay earned-only. Those three lines are what separate "Whiteout Survival without P2W"
from "Whiteout Survival".

### `verify-server.mjs` — the third place nothing was tested (v1.36)

Both systems live almost entirely in server code, and this project had **no server test
at all**. That is the same gap the renderer had before v1.32 and the more dangerous
one: `node --check` proves a file parses, not that sending a column moves the right
troops or that a recalled Watch comes home rather than evaporating.

The suite boots the real server on a spare port against a throwaway `DATA_DIR` and
talks to it over HTTP, because the thing worth testing is the wire behaviour — two
accounts, one alliance, state that has to stay consistent across both. 39 assertions.
Test-only endpoints exist for moving a counter and kitting a hold, gated behind
`ALLOW_DEBUG=1` so a deployed server never exposes them.

It immediately paid for itself on the small things: the register endpoint takes
`password`, not `pass`, and my first cleanup raced the dying server and threw
`ENOTEMPTY` *after* a green run — which would have turned a passing suite into a
non-zero exit.

### "It feels like waiting" (v1.35) — four of five signals were my own instruments

Asked to make the late game feel less like waiting, off the back of a number I had
flagged myself: **build-idle 51–58%**. Before changing anything I measured *why* the
queue was idle, against the game's rules rather than the bot's preferences. Nearly all
of it was instrumentation.

| signal | looked like | actually was |
|---|---|---|
| build-idle 51–58% | nothing to build | the bot's hardcoded priority list running out; it declined work the game was offering |
| resources at cap 55% | economy over-supplying | the same bot not spending |
| queue free with 13.8 affordable upgrades | queue throughput too low | my probe sampling *before* the bot acted each tick — catching the queue in the instant before it was filled |
| queue idle 47% in the long run | still throughput | the bot picking its top-priority building for **both** crews; `startUpgrade` enforces one crew per structure and the bot's model did not know. The second build crew has been very nearly useless in this simulator since the day it shipped |
| **Town Hall pace-blocked 35–55%** | — | **real, and the rule** |

With the bot taught the rules and the probe moved to the end of the tick: build queue
**busy 77–96%**, "free and something affordable" **0%**, "free and nothing legal" **0%**,
and — the number that answers the question — **"nothing to do" 0% of the time** in every
scenario, with 2.9–3.6 actionable tracks at any moment.

So the game does not make an engaged player wait for lack of things to do, and adding
content would have been the wrong fix. The one genuine blocked goal is the **Town Hall
pace gate**: for a third to a half of the late game you cannot raise the building that
unlocks everything else. That is by design — it stops you rushing the Town Hall and
leaving a hollow hold — but it was only visible if you happened to tap the Town Hall,
where it read as a refusal: *"the hold must keep pace, 2 of 4."*

**Being blocked is fine. Being blocked without being shown the way through is what
feels like waiting.** So `townhallPath()` costs the cheapest route to the next level —
summed level by level, because `buildCost` is a power curve with refined-goods
surcharges at thresholds, and cost × levels would badly understate a long climb — and
the hold panel now opens with it: a checklist of the cheapest N buildings, each with its
cost and a Raise button, flipping to *"Town Hall 13 is ready"* the moment the pace is
met.

The lesson, which is the third time today: **a measurement of a system that includes an
agent measures the agent too.** Every one of those four false signals came from reading
the bot's behaviour as the game's. The way out was to measure against the rules
(`canAfford`, `townhallReq`, `startUpgrade`) rather than against what the bot chose to do.

### The frontier, deepened (v1.34) — and what Kingshot's map is actually for

Researched Kingshot's map properly, and Whiteout Survival's, which is the same studio
on the same engine and far better documented. Both run **1200×1200 ≈ 1.44M tiles** per
kingdom, resource nodes at **levels 1–8**, richest toward the middle, with alliance
territory claimed by banners.

**Their map is that size because it has to hold the players.** Those coordinates are
mostly empty ground whose job is to seat thousands of cities far enough apart that
travel time and neighbourhood politics mean something — which is why teleports and
territory claims exist. Ours seats nobody: the Frontier is single-player and the shared
layer is realms and the Rift, which have no map at all. So copying the dimensions would
buy exactly nothing.

What was worth taking is the **ladder**, and two inversions:

- **Level range.** Ours stopped at 3 on 18 tiles, so the map ran out of interesting
  work by mid-game — the simulator's bot ground level-2 camps **187 times** in an
  8-hour run. Now 40 tiles across levels 1–8 on a 15×9 grid.
- **Richest at the centre → richest at the edge.** Their centre is contested, so
  centre-outward is right for them. Our hold sits *at* the centre, so the same
  gradient would put the best ground on the doorstep. Here `tileBase()` sets level
  from distance, and travel time is the price of richness.
- **Node level gated behind furnace level → gated behind Town Hall.** Taken directly,
  and it closed a real hole: gather tiles carry no defence, so before this the only
  cost of a level-8 node was the walk, and 90-minute runs were already hauling from
  level 7 and 8 — skipping the near map entirely. `tileReq()` opens one tier every
  two Town Hall levels, L1–L2 free, L8 at TH13.

Measured, same bot, old map vs new: army 22,941 → 22,197, at-cap 55% in both, TH14 in
both. **Income-neutral.** What changed is the shape: level-2 camps ×187 became a spread
across L2/L4/L5/L7/L8, and the deepest camp taken rises with the hold — TH5→L2,
TH9→L6, TH14→L8. That isolation mattered: my first read blamed the richer map for a
55% at-cap figure that turned out to be the improved bot.

Three fixes to the simulator were needed before it could measure any of this, and each
was hiding a real distortion:

- **The bot's safety gate compared raw army power to an enemy figure that ignored the
  wall, blunting and the streak multiplier** — an enemy far stronger than the one that
  actually arrives. As waves escalated the gate closed for good and the bot stopped
  going out: the 4-hour and 8-hour runs reported *identical* frontier activity.
- **It took the first camp it could beat, not the best**, so it always took the
  nearest and weakest and the deep map went unvisited however strong it got.
- **It started one march per tick and preferred a hunt**, so once beasts unlocked it
  hunted essentially forever. Nobody with eight march slots plays that way.

### The renderer, and the limits of a stub DOM (v1.32)

Asked to spend the effort on the procedural renderer rather than start a sprite
pipeline. Full write-up in GRAPHICS.md; the transferable lessons:

**The performance ceiling was the art ceiling.** The scene redrew entirely at
60fps, so every surface had to be cheap, and cheap looks like boxes. Splitting it
into a cached static layer (ground, wall, buildings — invalidated only by a level,
the threat state, the skin or a resize) and a dynamic pass (smoke, flags, folk,
badges) did not make the old picture faster; it made a better picture affordable.
Measured over a run: the static layer rebuilt **once**.

**A test that cannot see cannot check a renderer.** `verify-ui.mjs` runs against a
stub DOM whose canvas context discards everything, so it happily proved the scene
rendered while three things were badly wrong — two buildings invisible since v1.28,
trees drawn underneath the buildings that hid them, and a mud patch on every future
building site. `npm run shoot` now screenshots six states in headless Chrome.
Anything whose output is *looked at* needs an instrument that looks.

**And it caught my own bad geometry.** I hipped every roof, reasoned that it was
right, and the first screenshot showed a village of coloured plates on stumps — a
hip roof over a square footprint projects, in 2:1 iso, as a pyramid wider than the
building it sits on. No amount of reading the code would have told me that.

I also reported a frame rate from headless Chrome before noticing that
`--virtual-time-budget` runs a virtual clock, so the figure meant nothing. The
cache-hit count was measurable and the fps was not; only one of them belongs in
this document.

### `verify-ui.mjs` — because nothing checked rendering (v1.31)

`npm run build` proves the imports resolve. It does not notice a render that
throws, prints `undefined`, or says **"spearmans"** — which the game did, in four
places, because it pluralised troop names by appending an `s`. Correct for
Archers; wrong for Spearmen and Ballistae. It survived every review because a
plural is exactly the kind of thing you read past.

The suite renders every panel against a stub DOM, then the march builder on its
own, and asserts on the flat text. Troop names now carry their own `plural`.

One design note: the composer is only reachable by tapping, and reads two
module-local variables a tap sets. Rather than export test hooks from shipped
code, the suite copies `src/` to a temp directory and appends the two exports
there — so what runs is the real code, byte-identical, and the bundle carries
nothing that exists for a test.

### KvK — realms and the Rift (v1.26)

The last structural gap. Two parts.

**Realms are now first-class containers.** Holds, alliances, landmarks, the state
chat channel and the ladder all belong to one. New accounts join the youngest
realm still taking people (population cap, or 30 days old, whichever first); when
it closes, the next one opens and is announced in the old one's chat. Realm 1 is
the world that already existed, so every pre-existing account belongs to it and
the old global structures migrate into it.

This matters for fairness on its own, before any war: a hold founded in month six
should never be dropped into a world that has been compounding for six months.
The ladder is scoped for the same reason — comparing worlds of different ages is
noise, not competition.

**The Rift** pairs realms by age (1↔2, 3↔4, …) every other season for a week:

| Scores | Points |
|---|---|
| Beating a paired-realm hold in the Arena | 30 |
| Breaking a Great Host | 120 × tier |
| Holding contested ground | 4 per minute |

While a Rift is open the Arena pool includes the paired realm and three neutral
**Rift Holds** appear that alliances from either realm can take. While it is
sealed, cross-realm attacks are refused outright.

**What is deliberately absent: nothing is ever taken.** No resources, no
buildings, no troops, no occupation, no migration under duress. Verified: the
losing realm's holds finished with their troops and stores untouched. A Rift
decides a title and a standing bonus — because the moment a realm can be *farmed*,
the biggest wallet in it decides who else gets to play. The winner's holds are
named Rift-Warden; the loser keeps everything it built.

Two bugs found while testing with four accounts across two realms:

- **The Rift's `open` flag was snapshotted at creation.** A season that should
  have been sealed still read as open once the schedule changed under it — so
  cross-realm attacks stayed legal after the window should have closed. Openness
  is now derived at read time, never stored. Anything computed from config and
  cached is a bug waiting for the config to change.
- **The leaderboard handler ran before the POST body was parsed.** Scoping the
  ladder by `body.token` would have thrown on every single leaderboard request;
  it reads the token off the query string instead, and the client now sends it.

### Rallies: the Great Hosts (v1.25)

The alliance boss is an **asynchronous** pile-on — everyone strikes when they
can, damage accumulates. A rally is the other thing entirely, and the thing this
genre is actually social for: one member calls it, a muster window opens, others
commit **real columns**, and it launches as a single combined attack. *"Rally in
five minutes"* is the sentence that turns an alliance from a help button into a
team.

Four Great Hosts, priced at 1.8× / 2.4× / 3.0× / 4.0× the average member's
column — so the tiers need roughly **two to four people to answer the horn**.
Committed troops leave home and cannot defend, which is the whole cost. They come
back wounded, never dead, like all PvE. Rewards split by share of the muster,
with a Writ for everyone who rode.

**Rallies only ever face the Unpaid.** Organised attacks on other players would
make farming efficient, and nothing in Crownhold is allowed to do that.

Two bugs worth recording from building it:

- **Hosts were priced against whole armies.** A member's rally contribution is a
  *column*, capped by their leaders at ~198 troops — perhaps 40% of their army
  power. Pricing the host on `armyPower` made every host unreachable no matter
  how many people committed: two fully-committed members mustered 28 against a
  host needing 3,492. Hosts are now priced in columns (`memberColumn`), and the
  same test musters 2,658 against 2,392 — a win that needed both of them.
- **Resolution had to move out of the rally endpoints.** A rally holds real troops
  out of their owners' holds. If it only resolved when someone polled the rally,
  an alliance that all logged off mid-muster would leave those columns stranded
  indefinitely. `resolveRallies(now)` now runs at the top of *every* request.

### Beasts and companions (v1.24)

**Beasts roam.** Camps sit on a node and wait; the herds move every five minutes
across the open ground between nodes, so a hunt is something you have to catch.
Five species (boar → wolf → elk → bear → wyrm) unlock by Town Hall. A hunt
**only ever wounds** — verified in isolation: 400 troops out, 396 home, 4 wounded,
nobody dead. The wager is the column's time and a thinner wall, never veterans.
A beast you are already committed to stands and waits rather than leading you on a
chase; that is interface cruelty, not difficulty.

Camps and beasts now split cleanly: camps pay nearly double the loot, beasts pay
**bond**. So the errand you pick is decided by what the hold is short of.

**Companions come off the hunt and nowhere else.** Bond accumulates, and at each
threshold three companions are offered and you keep one — the hero draft again.
**Only one walks at your side**, which is what stops a kennel of eight becoming a
stacked stat block: more companions is more things you can choose to be good at
this week, never more total. Their effects sit deliberately in corners no hero
touches — refining speed, expedition yield, storage, infirmary beds, scouting
without a Watchtower, travel time — so a companion changes the hold's *texture*
rather than its strength. They level by hunting alongside you.

Measured over 8 hours of active play: ~91 beasts taken, 2–3 companions drafted,
one of them level 2. A full kennel is days of hunting, and levelling it out is
much longer.

### The frontier was broken, and beasts found it (v1.24)

Adding beasts surfaced a serious regression **I introduced in v1.19**. Camp and
beast strength scaled on `wavePower(s.wave)`, which grows without bound — but the
same commit hard-capped a column at ~198 troops via `marchCapacity`. From roughly
wave 20 the entire frontier became mathematically unwinnable, and nothing said so:
the simulator recorded **zero camp fights across every scenario** and I read that
as the bot being cautious.

The fix re-anchors frontier difficulty on a **reference column** — what your three
best captains could command, times a soldier of your current tier — instead of the
raid clock. Both terms are bounded (capacity 198, tiers ten), so difficulty
converges while stars, gear and class affinity keep adding column power on top.
It also reads your best three heroes regardless of availability, or camp strength
would lurch every time a column rode out.

| Stage | Column | Camp I | Camp III | Wyrm |
|---|---|---|---|---|
| TH3, heroes L3 | 252 | 140 ✓ | 239 ✓ | 363 ✗ |
| TH8, heroes L10 | 1,227 | 1,010 ✓ | 1,723 ✗ | 2,614 ✗ |
| TH10, heroes L20 | 3,658 | 1,178 ✓ | 2,010 ✓ | 3,049 ✓ |
| TH30, heroes L20 | 6,793 | 2,188 ✓ | 3,732 ✓ | 5,663 ✓ |

Early on, easy camps and small beasts are winnable while bears and wyrms are
walls to grow toward. Late, everything is takeable and the wyrm is still the
tightest fight in the game. **Lesson recorded:** a system that silently becomes
impossible produces no error and no log line — only an absence in the data, which
is the hardest thing to notice. The sim now reports beasts slain, bond and pets so
an absence here would be visible.

### The hold that grows (v1.21)

Buildings you cannot yet raise are no longer shown at all. A new hold displays
**5 of 21** structures and reveals new ground as the Town Hall rises, announcing
each one. The alternative — greeting a new player with sixteen greyed-out cards —
communicated "look what you don't have" instead of "look what you built".

### Lore (v1.21)

`src/lore.js` — the Annals of the Reach, ~950 words in nine entries plus a
per-season thread. It has a job beyond flavour: **every rule that makes Crownhold
different is given a reason in the world.** Valor cannot be bought because
oath-coin was never minted, only witnessed. Heroes cannot be pulled because they
answer horns, not purses. Raids come back weaker after winning because the
Unpaid are collecting a debt, not farming a resource. Nothing is taken in the
Arena because a Warden who strips another Warden's granary has made the frontier
one hall weaker against the thing that actually comes at night.

A player who never reads a word of it still feels the shape of it.

## The deep economy (v1.4 — refined goods and the long climb)

Kingshot introduces new currencies deep into the curve; Crownhold does the same,
with one rule that makes it better: **refined goods are made from raw ones**, so
food, wood, stone and iron never stop mattering. A Town Hall 25 upgrade is really
an enormous pile of iron and wood, laundered through a Forge.

- **Steel** — the Forge (Town Hall 12) smelts iron + wood into it, continuously.
- **Runestone** — the Runeworks (Town Hall 22) binds stone + steel into it.
- Every building costs Steel from level **15**, and Runestone from level **24**.
- Refined vaults are deliberately tiny: 10% and 3.5% of raw storage.
- The refineries are **exempt from the surcharge on their own upgrades** — a
  Runeworks gated behind runestone deadlocks the economy it exists to feed.
  (The simulator found exactly that deadlock before ship.)

Everything now runs to **Town Hall 30**, Mastery **30**, and a 30-step charter,
with a 24-entry permanent achievement list underneath.

### Truegold had no sink at all (v1.67)

The Victualler packs Rations, Rations pay for a voyage, a voyage brings back Isle Ore,
and the Crucible refines Isle Ore into Truegold. Four buildings and a whole second map,
and **nothing in the game spent the Truegold**. It was produced, it was displayed, it
counted toward nothing. Every hour anyone put into that chain bought them a number that
no rule read.

Nothing was broken, so nothing complained — this project's signature failure, the same
shape as the frontier being unwinnable for two commits. The Truegold research tier below
is the sink, and `verify-skills` now maxes **every** study in isolation and fails the run
naming any whose number moves nothing observable.

### The research tree grew a shape (v1.67)

It was a flat list: ten tracks, gated on Town Hall and Library level only. The specific
failure was that the Library capped *everything* at once, so all ten unlocked in lockstep
as it rose — ten bars filling at the same rate, no tree and no decision. Kingshot and
Whiteout both branch, and both gate study behind *other study*, which is the part that
makes a tree a tree.

- **Two branches**, Growth and Battle, sharing one queue — so investing in one is
  genuinely not investing in the other.
- **Prerequisites**, the thing the flat list lacked entirely. Masonry needs Husbandry 2;
  Plunder needs Medicine 2.
- **Per-line mastery** — Kingshot's per-troop-type battle research, translated. Our combat
  model has one `power` per line rather than Whiteout's four stats per line, so the honest
  version is four per-line power tracks, priced so you cannot max all four. It lands in
  `tierPower`, the single place one soldier's worth is computed, so the muster roll, the
  wall and a column on the road cannot disagree about it.
- **The Truegold tier** — four studies, gated on the Crucible, the biggest bonuses in the
  game and the deepest grind.

100 levels became 240. Measured at Town Hall 25, identical buildings and troops: the
general tracks alone are **×1.39** army, per-line takes it to **×1.77**, Truegold to
**×2.40**. The wall rises *with* that rather than past it — 8% of total defence fully
researched under the old tree, 9% under this one — so no amount of study makes a hold
unraidable.

**Two things measurement caught that judgement had not.** Truegold Bulwark first shipped at
+14 wall power per level, which is 3.5× the entire Fortification track where its three
siblings are ~1.3×; it took a maxed wall from ×5 to ×21. And the tier was priced at 6
Truegold a level, totalling 7,078 — against a Salt Isle that yields a measured 586 Isle Ore
a season worked *perfectly*, that is 48 seasons of flawless sailing. Not a long grind, an
unreachable one. At 1 Truegold a level it is 1,232, about 8 seasons at perfect play and
roughly twice that for anyone living a normal life. Both figures are now held by tests,
along with the one nobody would think to check: **no study may have a level dearer than the
vault that has to hold the payment**, which would be a permanent dead end wearing the
costume of an expensive study.

What is deliberately *not* copied: in both those games the tree is where pay-to-win hides
most quietly. The depth exists so research speedups have somewhere to be sold, and alliance
research help is a whale lever. We sell neither, so the tree gains structure without gaining
Whiteout's hundreds of filler levels.

## Pacing: can an addict finish it in a week? (v1.5)

The honest failure the simulator exposed: with uncapped Valor, attention
converted straight into skipped time (~2.4 h of timers skipped per 1.5 h
played), so a ten-hour-a-day player capped the game in about four days.

Kingshot's answer is that **the calendar paces you, not your stamina** — a
Town Hall 25 upgrade takes real days, and playing longer cannot touch it. That
is also exactly where they sell the escape hatch. We keep the pacing and refuse
to sell the exit:

- **Build times cap per level** (`600 + 400 × level` seconds; the live game
  multiplies by ~10, putting late builds in day-long territory). The build
  queue, not your energy, is the wall — and it runs while you sleep.
- **Daily Valor quota** (`100 + 25 × Town Hall`, doubled while Rested). Earn
  freely up to it, then Valor trickles at 25%. Ten hours still beats one hour;
  it does not beat it tenfold.
- **Rested** — the catch-up. Every hour away banks half an hour of Rest (max
  two days' worth). While Rested, production runs +50% and the Valor quota
  doubles. Coming back after a week away is a running start, not a hole.

### Measured: 30 days on three human schedules

| Schedule | Town Hall | Mastery | Army | Waves held |
|---|---|---|---|---|
| 1 h/day | 23 | 30 | 27,568 | 798 |
| 3 h/day | 23 | 30 | 27,794 | 830 |
| 10 h/day | 30 | 30 | 25,908 | 1,035 |

### The launch curve (v1.6)

`TIME_SCALE = 10` stretches **construction only**. Training, raids, expeditions
and the arena keep their fast cadence — those are the loop you play, and with
raids every 75 s the muster has to answer on that clock. (Scaling training too
was tried and broke the defence loop outright: the sim lost 111 raids in eight
hours.) Valor's finish cost scales with the dial, so its relative worth is
unchanged however the curve is retuned.

A **second build crew** arrives at Town Hall 10 — two upgrades at once, never
two on the same building. It is the lever that rewards presence without breaking
the calendar: an attentive player keeps both crews fed, and that is worth about
seven Town Hall levels a month over a casual schedule. A one-hour-a-day player
is on a three-to-four month pace to the cap; raise `TIME_SCALE` to push that
toward the twelve-month end.

*Watch in playtesting:* the sim's raid loss rate rose to ~33% once building
slowed, since wave difficulty tracks the clock while power now tracks the queue.
The rubber-band stops it spiralling and wins still outnumber losses 2:1, but if
losing one raid in three feels bad in the hand, slow the raid cadence before
touching difficulty.

Progression no longer converges completely — which is what heavy play should buy.
The shape is still Kingshot-minus-
speedups. What heavy play still buys is everything the calendar does not gate:
a bigger army, arena rating, achievements, waves survived, and keeping the build
queue full (worth roughly a Town Hall level a month over a one-hour player).

**Absolute pace — the note that was stale for weeks.** This section used to say the
prototype held about 200 hours of build queue and that launch would need build and
training times multiplied a further 10–20×. Measured, that had been wrong for a long
time: `TIME_SCALE` is already 10, and maxing every building is **2,544 hours of
construction — 106 days of continuously busy queue**, or roughly 62 once the second crew
opens at Town Hall 10. Research is a further 74 days on its own parallel queue —
11 of them the general tracks, 15 the per-line masteries, and 47 the Truegold tier.

No player keeps a queue 100% busy, so the real figure is comfortably inside the intended
six-to-twelve-month window. The multiplier does not need applying; it already was.

Nobody knew, because nothing checked — the note simply aged past the code. `verify-skills`
now holds the measured length to a band (45–400 days), so a change to `COST_EXP`,
`TIME_EXP`, `buildTimeCap` or `TIME_SCALE` cannot quietly turn a six-month game into a
weekend or a decade. It also asserts that training stays UNSCALED, because the muster has
to answer raids on a 75-second cadence and a change that swept `TIME_SCALE` into training
would make the game unplayable long before anyone noticed the total length had moved.

### How long to max, measured

| Milestone | Perfect always-online play |
|---|---|
| Town Hall 10 | 2.7 h |
| Town Hall 15 | 5.4 h |
| Town Hall 20 | ~10 h |
| Town Hall 24 | ~18 h |
| Town Hall 28 | ~35 h |
| Everything capped | 40 h+ — no naive strategy finished it in 200 simulated hours |

Before v1.4 the entire game capped out in **7.7 hours**. The late game is now
also an *allocation* problem: two different greedy bots both stalled near the top
because they spent refined goods badly. Watch this in playtesting — a wall that
punishes bad allocation is good; one that punishes not knowing the rules is not.

**Scaling to the live target (6–12 months).** These are prototype timers, where
a build takes seconds and a raid comes every 75 s. A human playing ~1 h/day, not
perfectly, is already looking at many months. Multiply build/training times and
late-game costs by 3–10× at launch and the cap lands in the intended window —
still an order of magnitude short of Kingshot's multi-year VIP grind, which is
the point.

## The Realm — landmarks, banners, seasons (v1.11)

The state-wide layer, and the answer to "what do alliances actually fight over".

**Five landmarks** sit on the map — the Sunspire, Ironhold Bridge, the Old Mint,
Quarryhead, the Watchfires. Whichever alliance holds one gives *every member* a
standing bonus (production, troop power, Valor, build speed, raid loot). Taking
one has two beats:

1. **Assault.** Members throw their army power at the garrison, once per
   cooldown, losing ~5% of the muster each time. Garrisons regenerate, and a
   strong holder's garrison is larger — so holding is real, and dislodging a big
   alliance takes a coordinated push rather than one player.
2. **Raise the Banner.** Breaking the garrison does not hand you the landmark;
   it lets you start *building a claim* there, over real time, which **alliance
   help accelerates**. That is what banners are — the thing everyone in Kingshot
   is always begging help for. Help on a banner is the same currency as help on
   a build: attention from people who like you.

Losing a landmark costs nothing but the bonus. No stores, no troops, no
buildings — consistent with the arena. The prize is the buff and the flag.

**Twelve sites, opened over the realm's own age.** Only some are awake at the
start; the rest have a wake day counted from the realm's founding (day 2, 4, 7,
10, 14, 21, 28, 35, 45). There is always a new site coming, and the map a
year-old realm fights over is not the one it started with.

**Seasons** run a fortnight, and roll over on their own: standings freeze, the
top three are named Sovereign / Warden / Bannerlord of the Realm, everyone who
fought gets a share, event scores clear, and **Laurels drift halfway back to
1000** — a soft reset, so a champion starts ahead but never untouchable and
nobody is locked out of climbing. All of it is earned; none of it is sold.

**Calendar.** Event windows are deterministic from the clock, so the client can
show what is running, what comes next, when each begins and ends, how long the
season has left, and which sites are still sleeping — without asking the server.

### How states should open (recommended)

Kingshot gates its content by **server age**: every kingdom has a founding date,
and hero generations, fortresses and events unlock on fixed *server days*, not
calendar dates. Crownhold already works this way — landmarks wake on realm days.

For opening new states, the model to copy is a hybrid, because either rule alone
fails: purely time-based opening leaves half-empty realms, and purely cap-based
opening can stall for weeks. So: **a new state opens when the newest one reaches
a population cap OR a fixed age, whichever comes first**, new players always join
the newest open state, and each state runs its own age clock from its founding
day. Old states never take newcomers — which is what keeps a two-year-old realm
from swallowing a beginner. The realm's landmark map, event calendar and
rankings live inside one, and the paid track is cosmetic (MONETIZATION.md).

**Event standings** are ranked inside Town Hall bands — Reach (1–8), March
(9–16), Dominion (17–24), Crown (25+) — so a new hold never shares a board with
the server's oldest account.

## The calendar's four rhythms (v1.13)

A live game needs more than a list of events — it needs different *cadences*,
which is what makes Kingshot's calendar feel full:

1. **Every day — Daily Tasks.** Six short lines drawn from a pool, the same slate
   for everyone in the realm, reset at midnight, with a bonus for clearing them
   all. This is the reason to open the game on a quiet Tuesday.
2. **Every window — the rotating events.** Eight now: Muster Days, Stonecutters,
   The Long Hunt, Scholars' Term, Warband Season, Gathering Days, Forge Fires,
   Champions' Trial. Milestones carry the rewards; the board carries the glory.
3. **Every few hours — the alliance boss.** A great beast walks out of the fog
   for a window; the alliance piles onto it. **Its health scales to the alliance
   facing it**, so no whale can solo it away from the group and no small band is
   locked out. Damage is ranked but *every hand that lands a blow shares the
   kill* — rank only tilts the share.
4. **Every fortnight — the season.** Standings freeze, titles are named, Laurels
   soft-reset. See above.

Still missing, and the honest gap: **realm versus realm**. Kingshot's KvK is the
fifth rhythm and it needs more than one state to exist, so it waits on the
multi-state work described under "How states should open".

## Events — and the spending-race problem

Kingshot's events are the monetisation engine, and the mechanism is worth naming
precisely: an event is a scoring window, score comes from spending stockpiles
(speedups, resources), and rewards are ranked. So the leaderboard is a **spending
leaderboard**. Free players hoard for weeks to place once; payers place whenever
they like. Remove purchasable speedups and the same structure still rots — it
just becomes a hoarding contest, where the winner is whoever sat on their
resources longest rather than whoever played best.

Five rules make events competitive without becoming a wallet or a warehouse race:

1. **Milestones carry the rewards, rankings carry the glory.** Roughly 90% of an
   event's material value sits in personal thresholds every committed player can
   reach ("score 5,000 → 3 Writs, 400 Valor"). Ranking pays prestige: titles,
   banners, a cosmetic frame, a line on the state board. Nobody is priced out of
   the rewards; the top slots are still worth fighting for.
2. **Score the doing, not the dumping.** Points come from actions completed
   during the window — levels raised, waves held, camps burned, troops drilled,
   research finished — and each source has a **daily cap**, exactly like the Valor
   quota. Thirty days of hoard cannot be dumped in one hour.
3. **Bracketed boards.** Rank inside your power band, as the arena already does.
   A Town Hall 12 hold competes with its peers, not with the server's oldest
   account.
4. **Alliance events outnumber solo ones.** A shared bar the whole alliance
   fills turns "who spent most" into "who showed up", and it is the reason
   alliances retain people. Rewards go to every member above a participation
   floor, not to the top contributor.
5. **Seasons rotate, and the pass is cosmetic.** An eight-week season with its own
   event calendar, a free reward track and a paid *cosmetic* track — never a
   power track. This is where the money is, per MONETIZATION.md.

The honest trade: we will earn less per event than Kingshot does. In exchange the
event calendar stays fun for someone with a job, which is the entire pitch.

Planned first set: **Muster Days** (drilling and troop tiers), **Stonecutters**
(construction), **The Long Hunt** (frontier camps and ruins), **Scholars' Term**
(research), and **Warband Season** (alliance-wide waves held) — each a scoring
window with milestones, a bracketed board, and daily caps per source.

## The Arena (v1.2 — fair PvP, finally)

This is the system Kingshot gets worst, so ours inverts its incentives.

**What never happens:** no resources, buildings or defenders are ever taken from
a loser. Winners gain Laurels (Elo rating), Valor and Mastery from a purse —
nothing from the other player's stores. A hold cannot be farmed, so there is no
reason to buy safety, and no reason for a big account to hunt small ones.

**What decides fights** (measured win rates for an evenly-matched pair, 400
trials each — `scratchpad/arena3.mjs` pattern, rerun after any change):

| The attacker's read | Win rate |
|---|---|
| Right stance + right composition | 69% |
| Neutral | 42% |
| Wrong stance | 8% |
| Half-commitment (right read) | 0% |
| Ballista siege vs a Wall 8 defender | 58% (vs 50% without) |

- **Stance triangle**: Charge > Volley > Shield Wall > Charge, ±15%/−12%.
  Scouting reveals the defender's standing stance, so it is an informed read.
- **Composition**: bring the answer to their dominant class (Spearmen vs
  Knights, Knights vs Archers/Ballistas, Archers vs Spearmen), up to +15%.
- **Siege**: a wall counts at half strength in the arena, and ballistas cut it
  to as low as 10% — which is Ballistas' PvP job.
- **Defenders** fight *prepared* (×1.12) plus their wall, lose no troops, and
  risk half the rating. An even army is not enough; the attacker needs a read.
- **Commitment**: sending a quarter/half/all — and casualties (≤6% winning,
  ≤14% losing) thin the wall that must hold your next raid. Real tension between
  ladder ambition and home defence.
- **Brackets**: opponents shown only between 0.65× and 1.35× your defence
  (widening if the pool is thin); the server hard-refuses outside 0.3×–2.2×.
- Outcomes roll ±22%, so close odds are a genuine gamble and no fight is decided
  before the dice.

## Going online (v1.1 — the authoritative server)

`server/server.js` imports the same rule modules the browser runs
(`logic.js`, `world.js`, `actions.js`), so there is exactly one definition of
what an action does. Architecture notes:

- **No game loop.** This genre ticks slowly, so state is stored per account with
  a `lastSeen` stamp and *fast-forwarded on demand*: a request arrives, the hold
  catches up (production, queues, quests, caravans — never unattended battles),
  the action applies, the state saves. One process handles thousands of holds.
- **Client prediction.** The browser keeps ticking locally so the display stays
  smooth, and pulls authoritative state every 10s; the server's copy always wins.
- **Offline-first.** With no server configured the game is exactly what it was —
  localStorage, no account, no network. Online is opt-in.
- **Honest security line.** Actions are validated against a whitelist and all
  outcomes are computed server-side, which is the foundation PvP needs. What is
  still missing before competitive play: HTTPS, a real session store, a database
  instead of a JSON file, and rate limits per account rather than per IP.
- **Next on this layer:** alliances, an arena of async battles against other
  holds' snapshot armies, and seasons (which is also where the cosmetic passes
  from MONETIZATION.md live).

## The long game (v0.8 — pacing to months, not minutes)

Target: **6–12 months of meaningful progression** for a regular free player — long
enough to retain, short enough that the cap is a real destination (Kingshot's
multi-year VIP grind is the anti-pattern). The rule at every stage: a level-3
player and a level-18 player should both finish a session having visibly moved.

Prototype-scale proof (simulator, perfect always-online play — a strict upper
bound on human pace): 90 min ≈ TH 6/20 · 4 h ≈ TH 14, Mastery 18/20 ·
TH 20 + Mastery 20 ≈ 7.5 h. A human at ~1 h/day plays this curve for weeks; the
live game then scales timers/costs 10–50× to land in the 6–12 month window.
Polynomial (level²) cost curves keep early levels snappy and late levels long.

Progression ladders (all free, all parallel — there is always a next rung):
- **Town Hall 1–20** gating 13 buildings (Tavern, Granary, War Academy, Hospital,
  Warehouse joined in v0.8, each with a distinct lever).
- **Troop tiers I–X** via the War Academy; promotion reforges the whole class.
- **Mastery 1–20** (the VIP replacement), **heroes to level 20**, spoils stacking.
- Roadmap ladders, in order: **hero gear** (crafted from raid drops), **player/lord
  gear**, **seasons** (leagues + cosmetic passes), **arena** (async PvP vs snapshot
  armies — needs the server), alliance tech. Seasons are also the revenue engine —
  see [MONETIZATION.md](MONETIZATION.md); servers are covered by cosmetics + the
  supporter pass at even modest scale.

## The command layer (v0.7 — where skill lives)

The loop was fully automatic; these systems convert attention and decisions into
power, which is how a strategy game values skill:

- **Wave shapes & stances**: raids arrive as Rabble / Riders / Skirmishers / Brutes.
  The player sets a stance (Shield Wall / Volley / Charge / Balanced); the right
  counter is +20% power and −40% casualties, a wrong read −8%. The Watchtower
  reveals the incoming shape — scouting becomes an information advantage.
- **Captain**: one appointed hero's passive counts double. A swappable build choice.
- **Orders**: every hero has an active ability on a waves-based cooldown (Rally,
  Triage, Expose the Camp, Requisition…). Timing them is tactics.
- **Expeditions** (replaced the Patrol button): three routes with different
  yields and risk — safe (King's Road), risky stone/iron with 35% ambush
  (Wildwood), Valor/Mastery gamble (Barrow Hills).
- **Measured skill gap**: in the sim, an attentive bot that counters scouted waves
  reaches wave 65 with 4 losses in 90 minutes; an identical account that never
  changes stance reaches wave 56 with 8. Attention ≈ nine waves of progression.

## Balance model (v0.3 — simulator-tuned)

Numbers are tuned with `sim.js`, a bot that plays a full session with the exact game
formulas (run `node sim.js`). Targets it currently hits:

- **Army equilibrium via upkeep**: troops eat food/sec (~0.02 per power point), so
  army size converges to what your farms support instead of scaling forever. Famine
  causes desertion. This is the ceiling mechanic — Farms, Steward, and Mastery raise it.
- **Rubber-banded raids**: a band that beats you returns at 85% strength per
  consecutive loss (floor ~61%) and gives a 2.5-minute breather — you grind through
  a wall, never get farmed by it. Wins reset the band to full strength.
- **Session shape** (competent active play): Town Hall 4 ≈ 11 min, TH8 ≈ 36 min,
  TH10 ≈ 2 h; a warband every ~6 min won by a shrinking margin; the survival
  ceiling lands near wave 80 at ~2.5 h, past the end of quest content.
- **Valor economy**: earned ≈ spendable (waves cap at 5+min(w,15)); finish-now costs
  1 Valor per 4 s remaining.

## Roadmap after the prototype

1. **Tune the single-player loop** — the numbers in v0 are placeholders scaled to
   minutes, not days; find the fun before adding anyone else.
2. **Server + accounts** — move state authoritative server-side (Node/Postgres or
   similar); the prototype's systems port directly.
3. **Alliances & the shared map** — territory, rallies, helping hands; this is where
   retention actually lives.
4. **Seasonal leagues** — the fair-PvP structure above.
5. **Mobile** — wrap (Capacitor) or rebuild the client (Unity/Godot) once the design
   is proven; the server doesn't care.
