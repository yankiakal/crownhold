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
