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
| Hero gacha banners | Best heroes locked behind lottery spend | Heroes unlock at **milestones** (Town Hall levels, waves survived, quests). Paid hero content is cosmetic skins only. |
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

- **Hero drafts**: a pool of 12 heroes (6 common / 4 rare / 2 epic, weight 62/28/10).
  Milestones unlock 8 slots; each slot offers a rarity-weighted draft of **three
  random champions — pick one**, with one 5-Valor redraw. No banners, no pity
  timers, no duplicates. Every account ends up a different subset in a different
  order.
- **Spoils of war**: every Warband win offers **three random permanent relics —
  pick one** (production charters, drill manuals, war trophies, upkeep larders,
  writ capacity…). Most stack, so builds compound differently run to run.
- Hero/spoil effects flow through one bonus-aggregation layer in `logic.js`
  (`heroBonus`/`spoilBonus`), so adding a hero is a data change in `defs.js`.
- Sim-verified: identical bot policies under different rolls produce different
  rosters and meaningfully different end states (power, upkeep profile), while
  overall pacing stays inside the v0.3 targets.

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
