// The Chronicle of the Reach — Crownhold's lore.
//
// Pure data, like defs.js. Kept in its own module because it is the one part of
// the game that exists purely to be read, and because the story has a job here
// beyond flavour: every rule that makes Crownhold different from its genre is
// given a reason in the world. Valor cannot be bought because oath-coin cannot
// be minted. Heroes cannot be pulled because they answer horns, not purses.
// A player who never reads a word of this still feels the shape of it.

export const CHRONICLE = [
  {
    id: 'breaking',
    title: 'The Breaking at Hallowmere',
    when: 'Ninety years gone',
    body: `There was a Crown once, and it was not metal. It was an oath: that no one who
    held the line would go unpaid. Kings wore a circlet to remind them of the debt, but the
    Crown itself was the promise, and the promise was kept for four hundred years.

    At Hallowmere it broke. Not in battle — in a counting-house. The last king found the
    ledgers empty, the oath-fire cold, and eleven thousand soldiers on the northern line
    who had been promised a winter's wages he could not pay. He rode out to tell them
    himself. That much, at least, the chroniclers grant him.

    He did not come back, and neither did the Crown.`,
  },
  {
    id: 'unpaid',
    title: 'The Unpaid',
    when: 'Every night since',
    body: `What comes over the ridge is not a monster and never was. They are the ones who
    were owed.

    Ninety years is long enough that none of the original eleven thousand still walk, but
    the debt outlived them and the bands did not disband — they inherited. A grandson of a
    pikeman from the northern line still knows to the copper what his grandfather was
    promised. He comes to collect it from whoever holds a wall, because the crown that owed
    him is ash and a wall is the nearest thing to a king that remains.

    This is why they come back weaker after they win. A band that collects goes home a
    little squarer with the world. It is why they come back stronger after they lose:
    nothing sharpens a claim like being refused.`,
  },
  {
    id: 'wardens',
    title: 'The Wardens',
    when: 'Now',
    body: `No one appointed you. That office ended with the office that made it.

    What happened instead is that people who had nowhere else to go walked out to the
    frontier and started building, and the ones who built well enough that others sheltered
    behind them were called Wardens, first as a joke and then not.

    You have a hall, a wall you raised yourself, and a muster that eats whether or not it
    fights. Nobody is coming. That is the entire situation, and everything else in this
    game is what you decide to do about it.`,
  },
  {
    id: 'valor',
    title: 'Valor, and why it cannot be bought',
    when: 'The old currency',
    body: `Oath-coin was never minted. It was <i>witnessed</i> — struck at the moment a thing
    was done and worth exactly what the doing was worth. A merchant could not buy it, a king
    could not print it, and a thief could steal the disc but never the debt behind it.

    That is why the Reach still honours Valor when it honours nothing else. Every point in
    your treasury was cut the moment you held a wall, finished a study, or brought a column
    home. There is no forge that makes more.

    There are places in the world where you can buy a faster army. This is not one of them,
    and the reason is ninety years old.`,
  },
  {
    id: 'horns',
    title: 'Why heroes answer',
    when: 'The draft',
    body: `Heroes do not take contracts. They answer horns.

    When a hall grows enough to be worth defending, word travels, and riders turn up at the
    gate — usually three, rarely the three you were hoping for. You take one. The others ride
    on to someone else's gate, and you will meet them later on somebody else's wall.

    No Warden has ever assembled the roster they wanted. Every hall in the Reach is defended
    by a different accident, and the ones that last are the halls that learned to fight with
    who actually came.`,
  },
  {
    id: 'court',
    title: 'The chair and the saddle',
    when: 'On command',
    body: `A hero at your table changes how the whole hold runs — what it grows, how fast it
    drills, how hard it hits. A hero at the head of a column changes only that column, and
    changes it a great deal.

    They cannot do both. A voice at the table is a voice in the room, and a captain three
    days' ride out is three days' ride out. Every Warden learns this the same way: by
    sending their best adviser to burn a camp and discovering the harvest came in short.`,
  },
  {
    id: 'stars',
    title: 'On stars',
    when: 'Ascension',
    body: `The Reach marks a captain by what they have done, and it does the marking whether
    anyone is watching or not. Ride enough roads, burn enough camps, hold enough lines, and
    the name starts arriving before the person does.

    Nothing about this can be hurried, and nothing about it can be purchased, because there
    is no ledger — there is only the road behind them. A captain who has never left the hall
    is a captain nobody has heard of, however clever.`,
  },
  {
    id: 'realm',
    title: 'The Reach',
    when: 'Beyond your walls',
    body: `You are not the only one who walked out here.

    The Reach is what the frontier calls itself now — a scatter of halls that trade, argue,
    ally, and occasionally test each other's walls to see what is behind them. There is no
    capital. There is a great deal of opinion about where the capital ought to be.

    When holds fight here nothing is taken. A Warden who strips another Warden's granary has
    made the frontier one hall weaker against the thing that actually comes at night, and
    the Reach has long memories about that. What changes hands is reputation, which out here
    is the only currency above oath-coin.`,
  },
  {
    id: 'seasons',
    title: 'The turning',
    when: 'Every fortnight',
    body: `The frontier keeps its own calendar, and it is not the one the old crown used.

    A season out here is whatever the country is doing to you: a hard winter, a road that
    opens, a valley that burns. Each turning brings new riders to the gates — people the
    weather displaced, or the fire, or a court eating itself two hundred miles south.

    They are not better than the ones who came before. The Reach has never produced a
    generation that outclassed its parents, whatever the ballads say. They are only <i>new</i>,
    and they know different country, and the halls that last are the ones that keep making
    room.`,
  },
];

/* Season arcs get their own thread of the story — the reason each cohort came. */
export const SEASON_LORE = {
  1: `The Iron Winter closed the passes for a hundred and six days. The halls that held did
      it on stored grain and stubbornness, and the people who came down out of it in spring
      had learned exactly one thing very well: how to not lose.`,
  2: `When the passes opened the coast came inland. Salt factors, pilots and a certain
      amount of cargo nobody wanted to itemise — the Salt Road ran two seasons and made
      more Wardens rich than any battle ever has.`,
  3: `The Ashen Vale burned for a month and nobody is entirely sure why. What walked out of
      it were the people who had spent that month learning the habits of things that live in
      fire, which turned out to be a marketable skill.`,
  4: `The Hollow Crown is what the frontier calls the business in the south, where a court
      spent a year poisoning itself over a throne that had no kingdom attached. The
      survivors came north. Several of them are excellent company and none of them should
      be left alone with a wine cup.`,
  5: `The Long Thaw is the first season in living memory that asked the Reach to build
      rather than hold. Masons, seed-keepers and bone-setters — the unglamorous trades that
      decide whether a frontier becomes a country.`,
};
