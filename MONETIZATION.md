# Crownhold — Monetization Spec (v0)

The business model in one sentence: forfeit the whale tail that funds Kingshot,
compete on retention and word-of-mouth, and monetize a large, loyal player base
lightly instead of a tiny one heavily.

**The guardrail (restated from DESIGN.md):** if deleting a purchase would change any
battle's outcome, the purchase is cut. Never sold, under any wrapper: Valor, resources,
speedups, heroes, Writs of Peace, Mastery, troops, or stat boosts of any kind.

## The store (cosmetic-only)

Everything below is visible to other players — status without stats. One store,
real currency, real prices. No premium gem layer to obscure costs.

| Category | Examples | Price point |
|---|---|---|
| Hold skins | seasonal architecture themes: Frosthold, Ember Keep, Ivy Court | $4.99 |
| Hero skins | alternate art + idle animation for Alden, Maren, Odo, Petra | $2.99 |
| Sigils & banners | premium pattern/emblem sets for the alliance banner editor | $1.99 |
| March & victory effects | march trails, gate-defense flourishes, raid-win fanfares | $1.99 |
| Profile flair | titles, name colors, chronicle frames | $0.99 |

## Supporter Pass — $4.99 per 8-week season

- A cosmetic reward track (the season's hold skin, sigil set, flair).
- Account **convenience that never touches combat math**: extra saved army presets,
  extended chronicle/battle-log history, cloud profile flair.
- Every gameplay-relevant item on the pass is also earnable free; the paid track is
  cosmetic and convenience only.

## Rewarded ads (optional module, capped)

Opt-in "watch an ad → small Valor bonus," hard-capped per day, identical cap for
everyone. This monetizes the ~95% who never buy anything and doesn't breach the
guardrail (attention, not money, and equally available). Ship it behind a config
flag and kill it if it cheapens the tone. Expected to rival cosmetic revenue at
small-to-mid scale.

## Revenue scenarios (order-of-magnitude honesty)

Assumptions: ~3% of monthly actives ever pay, average ~$18/payer/year (cosmetics +
pass); DAU ≈ 20% of MAU; rewarded ads ~2 views/day from ~30% of DAU at ~$10 eCPM.
Store platforms take 15–30% before these numbers.

| MAU | Cosmetics + Pass / yr | Rewarded ads / yr | Ballpark total |
|---|---|---|---|
| 1,000 | ~$540 | ~$450 | hobby money |
| 10,000 | ~$5.4k | ~$4.5k | covers servers + coffee |
| 100,000 | ~$54k | ~$44k | one modest salary |
| 500,000 | ~$270k | ~$220k | a real small studio |

Sobering context: most indie games never cross 10k MAU. The model only works if the
game retains — monetization is a multiplier on retention, and a multiplier on zero
is zero. The marketing asset is the promise itself ("Kingshot without the P2W"),
which converts the genre's burned-out players via Reddit/Discord/word-of-mouth —
the only acquisition channel that doesn't require outspending Century Games.

## Cost side (once multiplayer exists)

- Servers: ~$50–100/mo at prototype scale, ~$500+/mo at 100k MAU (authoritative
  state is cheap for slow-tick strategy games; it's the DB and egress that grow).
- Payment/platform cut: 15–30%. Web-first distribution keeps 97% via Stripe and is
  another argument for proving the game on web before app stores.
