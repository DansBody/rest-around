// Plain save JSON (as save.js serialize() writes it) for the pure-module tests in tools/test/.
// Built from a compact spec so the tests do not need a running game.

const floors = (size, fill = 'fl_oak') => Array.from({ length: size }, () => Array(size).fill(fill));
const furn = (t, x, y, d = 1, extra = {}) => ({ t, x, y, d, u: 0, b: false, ba: 0, ...extra });
const staff = (name, role, model, energy, skills) => ({ name, role, look: { model, hide: [], tint: null, scale: 1, roleHat: null }, energy, skills, x: 1, y: 1 });
const dishes = (on) => Object.fromEntries(['espresso', 'americano', 'latte', 'cappuccino', 'mocha', 'hotchoc', 'matcha', 'icedamericano', 'icedlatte',
  'berrylemonade', 'croissant', 'cookie', 'muffin', 'cheesecake'].map((id) => [id, { lv: 1, prog: {}, on: on.includes(id) }]));
const service = (v) => Array(24).fill(v);

function base({ coins, points, rating, inv, snacks, size, extraFurniture = [], team, seats, on = ['espresso', 'americano'] }) {
  return {
    v: 1,
    savedAt: 1790918930069,
    state: {
      v: 1, name: 'Sunny Café', coins, points, level: 1, rating, service: service(0.88), round: 248739, clock: 300, tz: 480,
      dishes: dishes(on), inv, opened: { sugar: 1.5 }, unpaid: false,
      wallDeco: ['wd_menu', 'wd_frame_tulip', 'wd_hanging'], wallPos: {},
      quest: { id: 'coins', target: 85, prog: 85, done: true }, snacks,
      garden: [{ crop: null, prog: 0, water: 0 }, { crop: null, prog: 0, water: 0 }], giftDay: 0,
      stats: { served: 50, lost: 0, noSeat: 12, coins: 687, points: 180, ratingStart: 2.6, levelStart: 1, spent: 52, restocked: 52, wages: 0, rent: 0, soldOut: 0 },
      totals: { served: 0, lost: 0, coins: 687, rounds: 0 },
      settings: { sound: true, music: true, volume: 0.7, glass: true, autoRestock: true },
      tutorialSeen: false,
    },
    world: {
      size, floors: floors(size), wallpaper: 'wp_cream',
      furniture: [
        furn('stove_basic', 6, 0), furn('cashier', 5, 0), furn('bookshelf', 2, 0), furn('sofa', 0, 5, 0),
        furn('plant_fern', 7, 7), furn('lamp_butter', 0, 7), furn('welcome', 1, 1),
        furn('table_oak', 3, 4), furn('chair_oak', 2, 4, 0), furn('chair_oak', 4, 4, 2),
        furn('table_oak', 3, 6), furn('chair_oak', 2, 6, 0), furn('chair_oak', 4, 6, 2),
        ...extraFurniture,
      ],
      trash: [{ x: 2, y: 7 }, { x: 5, y: 4 }, { x: 2, y: 5 }],
      dirty: [[2, 4]],
    },
    meta: { seats },
    staff: team,
  };
}

/** A brand-new café a few minutes in: two tables, one server, one barista. */
export const starter = () => base({
  coins: 460, points: 87, rating: 4.0, inv: { beans: 4, sugar: 2, milk: 2 }, snacks: { cookie: 1 }, size: 8, seats: 4,
  team: [staff('Mocha Latte', 'waiter', 'mochalatte', 34, { waiter: 86 }), staff('Bbaekko', 'chef', 'bbaekko', 59, { chef: 68 })],
});

/** A level-6 café: bigger room, two stations, a pastry case, a restroom, five staff with their kit perks. */
export const grown = () => base({
  coins: 5375, points: 1793, rating: 3.97, size: 12, seats: 12,
  inv: { beans: 30, sugar: 36, milk: 40, flour: 30, butter: 30, chocolate: 20, egg: 20 }, snacks: { cookie: 3, bento: 1 },
  on: ['espresso', 'americano', 'latte', 'croissant'],
  extraFurniture: [
    furn('stove_steel', 8, 0), furn('bar_counter', 2, 0), furn('oven_basic', 3, 0), furn('toilet', 10, 9, 1, { u: 7, ba: 7 }),
    furn('table_oak', 7, 4), furn('chair_oak', 6, 4, 0), furn('chair_oak', 8, 4, 2),
    furn('table_oak', 7, 7), furn('chair_oak', 6, 7, 0), furn('chair_oak', 8, 7, 2),
  ],
  team: [
    staff('Mocha Latte', 'waiter', 'mochalatte', 26, { waiter: 86 }), staff('Bbaekko', 'chef', 'bbaekko', 44, { chef: 68 }),
    staff('Hee Hee', 'waiter', 'heehee', 46, { waiter: 33 }), staff('Cheetie', 'chef', 'cheetie', 76, { chef: 32 }),
    staff('Oritokki', 'bartender', 'oritokki', 100, {}),
  ],
});
