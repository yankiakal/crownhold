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

**Absolute pace still needs the launch multiplier.** The prototype holds about
200 hours of total build queue, so everyone caps within a month here. Multiply
build and training times 10–20× at launch and that becomes the intended 6–12
months — still an order of magnitude short of Kingshot's multi-year VIP grind.

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
