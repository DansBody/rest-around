// Battle prototype data (design/combat/DESIGN.md §5–7): a Slay-the-Spire-lite card fight against the grey things
// of the "blue" world. Kept apart from data.js while the prototype is not tied to the café's economy or the server.
// Text is English source, translated by t() where it is drawn (ui/battle.js).

export const TEAM = ['mochalatte', 'cheetie', 'heehee', 'bbaekko'];
export const RULES = { chill: 60, hand: 3, handMax: 5, energy: 3, drinks: 2, knotChance: 0.1, nightMul: 0.8 };

/** Cards. fx keys:
 *  dmg (per hit) · hits · all (every foe) · rnd [lo, hi] (damage rolled) · random (a random foe) · fade (colour back)
 *  foam (block) · heal (chill) · draw · energy · cancel (the target's intent this turn) · boost (+dmg on the next attack)
 *  conjure (a random 0-cost card; sometimes a knot) · recall (the last card played comes back) · nextEnergy.
 *  target: 'foe' needs a foe tapped, 'none' plays at once. starter: in the deck from the start; the rest are rewards. */
export const CARDS = {
  // Mocha Latte: time control
  timestop: { who: 'mochalatte', name: 'Time Pause', cost: 2, type: 'skill', target: 'foe', starter: true, fx: { cancel: true } },
  lattehit: { who: 'mochalatte', name: 'Latte Smash', cost: 1, type: 'attack', target: 'foe', starter: true, fx: { dmg: 6, fade: 1 } },
  caffeine: { who: 'mochalatte', name: 'Caffeine Kick', cost: 1, type: 'skill', target: 'none', starter: true, fx: { draw: 1, boost: 3 } },
  shot: { who: 'mochalatte', name: 'Espresso Shot', cost: 0, type: 'attack', target: 'foe', fx: { dmg: 3, fade: 1 } },
  slowbrew: { who: 'mochalatte', name: 'Slow Brew', cost: 1, type: 'skill', target: 'none', fx: { foam: 5, nextEnergy: 1 } },
  // Cheetie: speed and mind reading
  dash: { who: 'cheetie', name: 'Dash Combo', cost: 1, type: 'attack', target: 'foe', starter: true, fx: { dmg: 4, hits: 2, fade: 2 } },
  mindread: { who: 'cheetie', name: 'Mind Read', cost: 0, type: 'skill', target: 'none', starter: true, fx: { draw: 1 } },
  sidestep: { who: 'cheetie', name: 'Sidestep', cost: 1, type: 'skill', target: 'none', starter: true, fx: { foam: 6 } },
  pounce: { who: 'cheetie', name: 'Pounce', cost: 2, type: 'attack', target: 'foe', fx: { dmg: 12, fade: 3 } },
  zoomies: { who: 'cheetie', name: 'Zoomies', cost: 1, type: 'attack', target: 'none', fx: { dmg: 3, all: true, fade: 1 } },
  // Hee Hee: spotlight and blooming
  spotlight: { who: 'heehee', name: 'Spotlight', cost: 1, type: 'skill', target: 'none', starter: true, fx: { foam: 10 } },
  bloom: { who: 'heehee', name: 'Bloom', cost: 1, type: 'skill', target: 'none', starter: true, fx: { heal: 5, foam: 2 } },
  curtain: { who: 'heehee', name: 'Curtain Call', cost: 2, type: 'attack', target: 'none', starter: true, fx: { dmg: 5, all: true, fade: 1 } },
  encore: { who: 'heehee', name: 'Encore', cost: 1, type: 'skill', target: 'none', fx: { recall: true } },
  petals: { who: 'heehee', name: 'Petal Storm', cost: 1, type: 'attack', target: 'none', fx: { dmg: 2, hits: 2, all: true, fade: 1 } },
  // Bbaekko: wrong chants and wild magic
  chant: { who: 'bbaekko', name: 'Wrong Chant', cost: 1, type: 'skill', target: 'none', starter: true, fx: { conjure: true } },
  wild: { who: 'bbaekko', name: 'Wild Magic', cost: 2, type: 'attack', target: 'none', starter: true, fx: { rnd: [3, 15], random: true, fade: 2 } },
  whisper: { who: 'bbaekko', name: 'Whisper', cost: 0, type: 'skill', target: 'foe', starter: true, fx: { fade: 2 } },
  bigspell: { who: 'bbaekko', name: 'Big Spell', cost: 2, type: 'attack', target: 'none', fx: { rnd: [4, 9], all: true, fade: 2 } },
  charm: { who: 'bbaekko', name: 'Lucky Charm', cost: 1, type: 'skill', target: 'none', fx: { draw: 2 } },
  // a wrong chant gone knotted: cannot be played, gone at the end of the turn
  knot: { who: 'bbaekko', name: 'Knotted Spell', cost: 0, type: 'junk', target: 'none', fx: {} },
};

/** What a team member does just by being there (DESIGN.md §6). */
export const PASSIVES = {
  mochalatte: { name: 'Caffeine Aura', desc: '+1 energy on the first turn.' },
  cheetie: { name: 'Mind Reading', desc: "See every foe's next move as well." },
  heehee: { name: 'Blooming Tips', desc: '+15% coins from the commission.', coins: 0.15 },
  bbaekko: { name: 'Afraid of the Dark', desc: 'Its cards deal 20% less after 7 pm.', bad: true },
};

/** Intent kinds: hit (dmg) · wind (winding up, does nothing) · ring (a big hit, dmg) · nap · jam (next card costs +n)
 *  · call (brings in a foe) · steal (coins) · flee (leaves with what it stole). Patterns loop. */
export const FOES = {
  clock: { name: 'Alarm Beast', img: 'clock', w: 112, hp: 76, fade: 10, coins: 30, boss: true,
    pattern: [{ k: 'hit', dmg: 12 }, { k: 'hit', dmg: 8 }, { k: 'wind' }, { k: 'ring', dmg: 30 }] },
  phone: { name: 'Unread Pings', img: 'phone', w: 60, hp: 24, fade: 5, coins: 10, badge: '99+',
    pattern: [{ k: 'jam', n: 1 }, { k: 'hit', dmg: 8 }, { k: 'call', foe: 'ping' }] },
  ping: { name: 'Ping', img: 'phone', w: 36, hp: 6, fade: 2, coins: 2,
    pattern: [{ k: 'hit', dmg: 5 }] },
  bill: { name: 'Month-end Bill', img: 'bill', w: 60, hp: 26, fade: 5, coins: 12,
    pattern: [{ k: 'steal', n: 12 }, { k: 'hit', dmg: 8 }, { k: 'steal', n: 12 }, { k: 'flee' }] },
};

export const DRINKS = {
  espresso: { name: 'Espresso', fx: { energy: 2 } },
  cocoa: { name: 'Hot Cocoa', fx: { heal: 12 } },
};

/** The one commission of the prototype (DESIGN.md §4). Nodes: fight · rest (a coffee stop) · boss. */
export const COMMISSION = {
  id: 'alarm', kind: 'Hunt', client: 'A Sleepy Owl', title: 'Make the Alarm Shut Up',
  plea: 'It rings every morning and never stops. Please, just one quiet morning.',
  drinks: ['espresso', 'cocoa'],
  nodes: [
    { type: 'fight', foes: ['phone', 'bill'] },
    { type: 'rest', heal: 15 },
    { type: 'boss', foes: ['clock', 'phone'] },
  ],
};
