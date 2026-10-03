// Gameplay data. Art references are asset ids from the manifest (+ an optional tint);
// no pixel sizes or offsets live here.

// ---------------- furniture ----------------
// kind: table | chair | stove | oven | bar | cashier | toilet | arcade | decor
// note: one line shown while placing it, for furniture that does something beyond looking nice
// Internal kinds keep their restaurant-era names: `stove` is the espresso station (a barista brews
// here), `bar` is the pastry case (a baker bakes at an `oven`, then sets the bake out here),
// `arcade` is the reading nook.
export const FURNITURE = [
  { id: 'table_oak', name: 'Café Table', kind: 'table', asset: 'm_table_round', price: 40, level: 1, decor: 1, cat: 'dining' },
  { id: 'table_walnut', name: 'Wooden Table', kind: 'table', asset: 'm_table_square', price: 60, level: 2, decor: 2, cat: 'dining' },
  { id: 'table_mint', name: 'Mint Table', kind: 'table', asset: 'm_table_square', tint: '#a9dcc6', price: 80, level: 3, decor: 3, cat: 'dining' },
  { id: 'table_rose', name: 'Rose Café Table', kind: 'table', asset: 'm_table_round', tint: '#f3b3c1', price: 110, level: 5, decor: 4, cat: 'dining' },
  { id: 'chair_oak', name: 'Café Chair', kind: 'chair', asset: 'm_chair_a', price: 20, level: 1, decor: 1, cat: 'dining' },
  { id: 'chair_wood', name: 'Wooden Chair', kind: 'chair', asset: 'm_chair_wood', price: 25, level: 1, decor: 1, cat: 'dining' },
  { id: 'chair_mint', name: 'Mint Chair', kind: 'chair', asset: 'm_chair_a', tint: '#a9dcc6', price: 35, level: 2, decor: 2, cat: 'dining' },
  { id: 'chair_rose', name: 'Cozy Armchair', kind: 'chair', asset: 'm_armchair', tint: '#d9895d', price: 55, level: 3, decor: 3, cat: 'dining' },
  { id: 'chair_sky', name: 'Rose Armchair', kind: 'chair', asset: 'm_armchair', tint: '#f3b3c1', price: 55, level: 4, decor: 3, cat: 'dining' },
  { id: 'stove_basic', name: 'Espresso Station', kind: 'stove', asset: 'm_espresso', price: 120, level: 1, speed: 1.0, decor: 1, cat: 'kitchen' },
  { id: 'stove_steel', name: 'Silver Espresso Station', kind: 'stove', asset: 'm_espresso_silver', price: 320, level: 3, speed: 1.45, decor: 2, cat: 'kitchen' },
  { id: 'stove_deluxe', name: 'Barista Bar', kind: 'stove', asset: 'm_espresso_deluxe', price: 750, level: 6, speed: 2.1, decor: 4, cat: 'kitchen' },
  { id: 'oven_basic', name: 'Bread Oven', kind: 'oven', asset: 'm_oven', price: 140, level: 2, speed: 1.0, decor: 2, cat: 'kitchen', note: 'The baker bakes here.' },
  { id: 'bar_counter', name: 'Pastry Case', kind: 'bar', asset: 'm_pastry_case_empty', price: 200, level: 2, speed: 1.0, decor: 3, cat: 'kitchen', note: 'Holds 3 bakes. Guests who see bakes order one more often.' },
  { id: 'cashier', name: 'Cashier Counter', kind: 'cashier', asset: 'm_counter_cafe', price: 70, level: 1, decor: 3, cat: 'kitchen', note: 'Guests pay here on the way out and tip extra; with no seat free, more of them wait in line, and longer.' },
  { id: 'toilet', name: 'Restroom', kind: 'toilet', asset: 'm_toilet', price: 160, level: 2, fee: 4, breakAfter: [6, 10], decor: 0, cat: 'fun' },
  { id: 'arcade_pink', name: 'Reading Nook', kind: 'arcade', asset: 'm_bookshelf', price: 380, level: 4, fee: 10, breakAfter: [5, 8], decor: 3, cat: 'fun' },
  { id: 'arcade_sky', name: 'Grand Library', kind: 'arcade', asset: 'm_library', price: 520, level: 6, fee: 16, breakAfter: [5, 8], decor: 5, cat: 'fun' },
  { id: 'plant_fern', name: 'Monstera Pot', kind: 'decor', asset: 'm_monstera', price: 30, level: 1, decor: 4, cat: 'decor' },
  { id: 'plant_tall', name: 'Big Monstera', kind: 'decor', asset: 'm_monstera_big', price: 70, level: 2, decor: 7, cat: 'decor' },
  { id: 'crate_tomatoes', name: 'Flower Box', kind: 'decor', asset: 'm_flower_box', price: 45, level: 2, decor: 5, cat: 'decor' },
  { id: 'crate_carrots', name: 'Planter Box', kind: 'decor', asset: 'm_planter', price: 85, level: 3, decor: 8, cat: 'decor' },
  { id: 'lamp_butter', name: 'Floor Lamp', kind: 'decor', asset: 'm_floor_lamp', price: 60, level: 1, decor: 5, cat: 'decor' },
  { id: 'lamp_rose', name: 'Rose Floor Lamp', kind: 'decor', asset: 'm_floor_lamp', tint: '#f6bdc8', price: 90, level: 3, decor: 7, cat: 'decor' },
  { id: 'lamp_mint', name: 'Mint Floor Lamp', kind: 'decor', asset: 'm_floor_lamp', tint: '#b9e4cf', price: 120, level: 5, decor: 9, cat: 'decor' },
  { id: 'teddy', name: 'Teddy Bear', kind: 'decor', asset: 'm_teddy', price: 25, level: 2, decor: 3, cat: 'decor' },
  { id: 'welcome', name: 'Welcome Sign', kind: 'decor', asset: 'm_welcome_sign', price: 50, level: 2, decor: 5, cat: 'decor' },
  { id: 'bookshelf', name: 'Bookshelf', kind: 'decor', asset: 'm_bookshelf', price: 120, level: 3, decor: 6, cat: 'decor' },
  { id: 'sofa', name: 'Terracotta Sofa', kind: 'decor', asset: 'm_sofa', price: 180, level: 3, decor: 9, cat: 'decor' },
];
export const FLOORS = [
  { id: 'fl_oak', name: 'Oak Planks', asset: 'tex_floor_wood', tint: '#e8c39a', price: 4, level: 1, decor: 0 },
  { id: 'fl_walnut', name: 'Walnut Planks', asset: 'tex_floor_wood', tint: '#c99a70', price: 6, level: 2, decor: 0.2 },
  { id: 'fl_cream', name: 'Cream Tiles', asset: 'tex_floor_checker', tint: '#f6e7cc', price: 6, level: 1, decor: 0.2 },
  { id: 'fl_mint', name: 'Mint Tiles', asset: 'tex_floor_checker', tint: '#c7e8d6', price: 8, level: 3, decor: 0.3 },
  { id: 'fl_rose', name: 'Rose Carpet', asset: 'tex_floor_carpet', tint: '#f5c3cf', price: 10, level: 4, decor: 0.4 },
  { id: 'fl_sky', name: 'Sky Carpet', asset: 'tex_floor_carpet', tint: '#c3dcf3', price: 10, level: 5, decor: 0.4 },
];
export const WALLS = [
  { id: 'wp_cream', name: 'Cream Plaster', asset: 'tex_wall_plain', tint: '#fbead3', price: 5, level: 1, decor: 0 },
  { id: 'wp_peach', name: 'Peach Plaster', asset: 'tex_wall_plain', tint: '#f9d0b3', price: 6, level: 1, decor: 0.2 },
  { id: 'wp_mint', name: 'Mint Stripes', asset: 'tex_wall_stripe', tint: '#cdebdc', price: 9, level: 2, decor: 0.4 },
  { id: 'wp_rose', name: 'Rose Stripes', asset: 'tex_wall_stripe', tint: '#f7cfd9', price: 9, level: 3, decor: 0.4 },
  { id: 'wp_sky', name: 'Sky Stripes', asset: 'tex_wall_stripe', tint: '#cfe1f4', price: 12, level: 5, decor: 0.5 },
];
export const EXPANSIONS = [
  { size: 10, level: 3, price: 600 },
  { size: 12, level: 5, price: 1600 },
  { size: 14, level: 7, price: 4000 },
];
export const SELL_RATE = 0.5;
export const furnitureById = Object.fromEntries(FURNITURE.map((f) => [f.id, f]));
export const floorById = Object.fromEntries(FLOORS.map((f) => [f.id, f]));
export const wallById = Object.fromEntries(WALLS.map((f) => [f.id, f]));

// ---------------- ingredients ----------------
// Icons are hand-made PNGs (market goods) or rendered from the 3D crop models (garden produce): `ing_<id>`.
export const INGREDIENTS = [
  { id: 'strawberry', name: 'Strawberry', source: 'garden', price: 7 },
  { id: 'blueberry', name: 'Blueberry', source: 'garden', price: 7 },
  { id: 'lemon', name: 'Lemon', source: 'garden', price: 6 },
  { id: 'mint', name: 'Mint', source: 'garden', price: 5 },
  { id: 'beans', name: 'Coffee Beans', source: 'market', price: 5, level: 1 },
  { id: 'milk', name: 'Milk', source: 'market', price: 4, level: 1 },
  { id: 'sugar', name: 'Sugar', source: 'market', price: 3, level: 1 },
  { id: 'flour', name: 'Flour', source: 'market', price: 4, level: 1 },
  { id: 'butter', name: 'Butter', source: 'market', price: 6, level: 1 },
  { id: 'egg', name: 'Egg', source: 'market', price: 4, level: 2 },
  { id: 'chocolate', name: 'Chocolate', source: 'market', price: 7, level: 2 },
  { id: 'cream', name: 'Whipping Cream', source: 'market', price: 6, level: 3 },
  { id: 'matcha', name: 'Matcha Powder', source: 'market', price: 9, level: 3 },
];
export const ingById = Object.fromEntries(INGREDIENTS.map((i) => [i.id, i]));
export const ingIcon = (id) => 'ing_' + id;

// Garden seeds (grow time in sim seconds). The garden itself made way for the Training tab; old saves
// turn their crops into pantry stock (save.js), and the server's ceiling (authority.js) still reads these.
export const SEEDS = [
  { crop: 'mint', price: 6, grow: 55, yield: 3, level: 1 },
  { crop: 'strawberry', price: 8, grow: 70, yield: 3, level: 1 },
  { crop: 'lemon', price: 7, grow: 80, yield: 3, level: 2 },
  { crop: 'blueberry', price: 8, grow: 90, yield: 4, level: 3 },
];

export const SNACKS = [
  { id: 'cookie', name: 'Cookie', price: 12, energy: 30, asset: 'snack_cookie' },
  { id: 'sandwich', name: 'Croissant', price: 22, energy: 60, asset: 'snack_sandwich' },
  { id: 'bento', name: 'Cheesecake Slice', price: 35, energy: 100, asset: 'snack_bento' },
];
export const snackById = Object.fromEntries(SNACKS.map((s) => [s.id, s]));

// ---------------- the menu ----------------
// cook: base seconds on a speed-1 espresso station (bakes: on a speed-1 pastry case). price/points at Lv1.
// A guest orders one item from the brewed categories and sometimes one `EXTRA_CAT` bake on top.
export const EXTRA_CAT = 'bakery';
export const DISHES = [
  { id: 'espresso', name: 'Espresso', cat: 'coffee', asset: 'dish_espresso', level: 1, cook: 5, price: 9, points: 3, ings: ['beans'] },
  { id: 'americano', name: 'Americano', cat: 'coffee', asset: 'dish_americano', level: 1, cook: 6, price: 11, points: 4, ings: ['beans', 'sugar'] },
  { id: 'latte', name: 'Caffè Latte', cat: 'coffee', asset: 'dish_latte', level: 2, cook: 8, price: 15, points: 5, ings: ['beans', 'milk'] },
  { id: 'cappuccino', name: 'Cappuccino', cat: 'coffee', asset: 'dish_cappuccino', level: 3, cook: 9, price: 17, points: 6, ings: ['beans', 'milk', 'chocolate'] },
  { id: 'mocha', name: 'Mocha', cat: 'coffee', asset: 'dish_mocha', level: 4, cook: 10, price: 21, points: 8, ings: ['beans', 'milk', 'chocolate'] },
  { id: 'hotchoc', name: 'Hot Chocolate', cat: 'tea', asset: 'dish_hotchoc', level: 2, cook: 7, price: 13, points: 5, ings: ['chocolate', 'milk'] },
  { id: 'matcha', name: 'Matcha Latte', cat: 'tea', asset: 'dish_matcha', level: 4, cook: 9, price: 19, points: 7, ings: ['matcha', 'milk'] },
  { id: 'icedamericano', name: 'Iced Americano', cat: 'cold', asset: 'dish_icedamericano', level: 3, cook: 5, price: 13, points: 4, ings: ['beans', 'sugar'] },
  { id: 'icedlatte', name: 'Iced Latte', cat: 'cold', asset: 'dish_icedlatte', level: 5, cook: 7, price: 17, points: 6, ings: ['beans', 'milk', 'sugar'] },
  { id: 'berrylemonade', name: 'Berry Lemonade', cat: 'cold', asset: 'dish_berrylemonade', level: 6, cook: 7, price: 21, points: 8, ings: ['strawberry', 'lemon', 'mint'] },
  { id: 'croissant', name: 'Butter Croissant', cat: 'bakery', asset: 'dish_croissant', level: 1, cook: 5, price: 10, points: 4, ings: ['flour', 'butter'] },
  { id: 'cookie', name: 'Choc-Chip Cookie', cat: 'bakery', asset: 'dish_cookie', level: 2, cook: 5, price: 9, points: 4, ings: ['flour', 'chocolate', 'egg'] },
  { id: 'muffin', name: 'Blueberry Muffin', cat: 'bakery', asset: 'dish_muffin', level: 3, cook: 6, price: 13, points: 5, ings: ['flour', 'egg', 'blueberry'] },
  { id: 'cheesecake', name: 'Strawberry Cheesecake', cat: 'bakery', asset: 'dish_cheesecake', level: 5, cook: 7, price: 23, points: 9, ings: ['cream', 'egg', 'strawberry'] },
];
export const dishById = Object.fromEntries(DISHES.map((d) => [d.id, d]));
export const DISH_CATS = [
  { id: 'coffee', name: 'Coffee' }, { id: 'tea', name: 'Cocoa & Tea' }, { id: 'cold', name: 'Iced Drinks' }, { id: 'bakery', name: 'Bakery' },
];
export const MAX_DISH_LEVEL = 10;
/** Ingredients (of each kind in the recipe) needed to go from `lv` to `lv+1`. */
export const levelUpCost = (lv) => lv + 1;
export const dishPrice = (d, lv) => Math.round(d.price * (1 + 0.16 * (lv - 1)));
export const dishPoints = (d, lv) => Math.round(d.points * (1 + 0.2 * (lv - 1)));

// ---------------- progression ----------------
export const LEVEL_POINTS = [0, 0, 90, 260, 560, 1000, 1650, 2500, 3700, 5300, 7500, 10500, 14500, 20000];
export const MAX_LEVEL = LEVEL_POINTS.length - 1;
export const staffSlots = (lv) => Math.min(UNIQUE_MODELS.length, 1 + lv);   // one slot per original character
export const gardenPlots = (lv) => Math.min(6, 1 + lv);
export function menuSlots(lv) {
  const t = [
    null,
    { coffee: 2, tea: 0, cold: 0, bakery: 0 },
    { coffee: 3, tea: 1, cold: 0, bakery: 1 },
    { coffee: 3, tea: 1, cold: 1, bakery: 1 },
    { coffee: 4, tea: 2, cold: 2, bakery: 2 },
    { coffee: 5, tea: 2, cold: 2, bakery: 3 },
  ];
  return t[Math.min(lv, 5)] || { coffee: 5, tea: 3, cold: 3, bakery: 4 };
}

// ---------------- staff ----------------
export const ROLES = {
  waiter: { name: 'Server', hire: 90, model: 'rogue', look: { top: ['jacket', '#9cc3e6'], bottom: ['pants', '#6d6a8a'], hat: null } },
  chef: { name: 'Barista', hire: 110, model: 'barbarian', look: { top: ['jacket', '#fbfaf5'], bottom: ['pants', '#7c6f67'], hat: ['chef', '#ffffff'] } },
  cleaner: { name: 'Cleaner', hire: 70, model: 'knight', look: { top: ['hoodie', '#b5e0c8'], bottom: ['pants', '#7fa7c9'], hat: ['cap', '#f5b3a5'] } },
  bartender: { name: 'Baker', hire: 100, model: 'mage', look: { top: ['jacket', '#d99aa8'], bottom: ['skirt', '#5c4d6b'], hat: ['bow', '#f7d58b'] } },
};
// ---------------- running costs ----------------
// Ingredients are used up as drinks are made: one pack (the unit sold at the market) makes
// SERVINGS_PER_UNIT servings of every recipe it is part of. Staff draw a daily wage (more as they gain
// skill) and the room costs rent by floor area; unpaid wages only leave the team grumpy, never in debt.
export const SERVINGS_PER_UNIT = 2.5;
export const GARDEN_MARKUP = 1.8;                  // garden produce costs this much more at the market than it is worth to grow
export const COSTS = { wage: 0.18, wageSkill: 0.2, rentPerTile: 0.5, unpaidEnergy: 20 };
export const staffWage = (role, skillLv = 1) => Math.round(ROLES[role].hire * COSTS.wage * (1 + COSTS.wageSkill * (skillLv - 1)));
export const rentFor = (size) => Math.round(size * size * COSTS.rentPerTile);
/** Auto-restock: when a menu ingredient falls below `minUnits` packs, buy back up to `targetUnits`, within a daily budget. */
export const RESTOCK = { base: 90, perLevel: 70, minUnits: 2, targetUnits: 5 };
/** Market price of an ingredient pack. */
export const ingPrice = (i) => (i.source === 'garden' ? Math.ceil(i.price * GARDEN_MARKUP) : i.price);
/** What one serving of a dish costs in ingredients (at market price). */
export const servingCost = (d) => d.ings.reduce((a, id) => a + ingPrice(ingById[id]), 0) / SERVINGS_PER_UNIT;

// ---------------- while you are away ----------------
// The café keeps trading while the game is closed: on return the time away is settled in one go
// (see offline.js). One game day of trading takes `hoursPerDay` real hours, at `efficiency` of what
// playing it live would earn, and only the first `capHours` away are counted.
export const OFFLINE = { capHours: 12, efficiency: 0.6, hoursPerDay: 4, minSeconds: 600 };

// Bump whenever a number here, offline.js or authority.js changes what a save earns. The server and the
// game must run the same balance (see ONLINE.md): deploy the server first, then the game.
export const BALANCE_VERSION = 6;

export const CUSTOMER_NAMES = ['Aster', 'Bramble', 'Cocoa', 'Daisy', 'Ember', 'Figgy', 'Gumdrop', 'Honey', 'Iris', 'Jelly', 'Kumo', 'Lulu', 'Momo', 'Nutmeg', 'Oona', 'Peaches', 'Quill', 'Rolo', 'Sunny', 'Toffee', 'Umi', 'Velvet', 'Waffles', 'Yuzu', 'Ziggy', 'Pudding', 'Biscuit', 'Clementine', 'Dumpling', 'Pickle'];

// Guests and passers-by: our own plain chibi bodies, recoloured per guest (fur + shirt, see GUEST_FUR).
export const CHARACTER_MODELS = ['guest_b'];
// Staff are always one of our own characters (one staff member each, named after the character).
export const UNIQUE_MODELS = ['mochalatte', 'bbaekko', 'heehee', 'cheetie', 'oritokki', 'tata', 'rj', 'chimmy', 'bboogyuli'];
export const UNIQUE_NAMES = { mochalatte: 'Mocha Latte', bbaekko: 'Bbaekko', heehee: 'Hee Hee', cheetie: 'Cheetie', oritokki: 'Oritokki', tata: 'TATA', rj: 'RJ', chimmy: 'Chimmy', bboogyuli: 'BBOOGYULI' };
export const SKIN_TONES = ['#fde3cf', '#f6cfae', '#e8b48f', '#c98c68', '#9c6a4f', '#f9dcc0'];
export const HAIR_COLORS = ['#4a3328', '#7a4e33', '#c98b4f', '#f0cf7a', '#e59aa8', '#8fb4e0', '#3b3a4a', '#b8a4d8', '#f2efe9'];
export const OUTFIT_COLORS = ['#f6b8c4', '#a9dcc6', '#9cc3e6', '#f9dd96', '#c9b6e3', '#f5b58d', '#fbfaf5', '#6d6a8a', '#d99aa8', '#b5e0c8', '#7fa7c9', '#e88a7a'];
// guest fur colours: soft animal tones, none so dark that the dark eyes get lost
export const GUEST_FUR = ['#fdebcb', '#e9c27a', '#c08a5c', '#96623e', '#b2b2b8', '#f6aa5a', '#fac4d2', '#b9d4ee', '#bfe3cf', '#d4c2ea', '#f8f6f0'];
// guest ear styles (made in code by src/ears.js); 'none' is the earless seal-like head
export const EAR_STYLES = ['cat', 'bear', 'bunny', 'dog', 'round', 'none'];
export const HAIR_STYLES = ['bob', 'spiky', 'bun', 'long'];
export const TOP_STYLES = ['tee', 'jacket', 'hoodie'];
export const BOTTOM_STYLES = ['pants', 'skirt'];
export const HAT_STYLES = [null, 'chef', 'cap', 'bow'];

// ---------------- simulation tuning ----------------
export const DAY = {
  length: 480,            // sim seconds per day (8 real minutes at 1x)
  startHour: 8, endHour: 22, lastCallHour: 21,
  phases: [
    { id: 'opening', name: 'First Brew', from: 8, mult: 0.8 },
    { id: 'lunch', name: 'Brunch Rush', from: 10, mult: 1.6 },
    { id: 'afternoon', name: 'Slow Sips', from: 13, mult: 0.85 },
    { id: 'dinner', name: 'Tea-Time Rush', from: 15, mult: 1.75 },
    { id: 'closing', name: 'Evening Glow', from: 19, mult: 0.5 },
  ],
};
export const PATIENCE = { seat: 24, order: 38, food: 60 };
// A cashier counter: guests stop to pay on the way out and add `tip` × the bill (× satisfaction) on top of
// the usual tip; and when every seat is taken, up to `queue` of them wait in line (not only for a table
// being cleared), with `queuePatience` × the patience.
export const CASHIER = { tip: 0.15, queue: 4, queuePatience: 1.6 };
export const SPEED = { customer: 1.9, staff: 2.8 };
export const ENERGY = { drainPerSec: 0.3, napRegen: 0.35, wakeAt: 30, overnight: 40 };
// Staff skill: finishing a job of their current role earns XP in that role. Every role keeps its own
// XP, so a waiter who retrains as a chef and later comes back is still a skilled waiter.
export const SKILL = {
  xp: { order: 1, deliver: 1, clear: 1, cook: 2, drink: 2, sweep: 3, repair: 5 },
  levels: [0, 40, 120, 260, 480],               // XP needed for skill Lv1..5
  mul: [1, 1.08, 1.16, 1.25, 1.35],             // walk + work speed at each level
  titles: ['Novice', 'Apprentice', 'Skilled', 'Expert', 'Master'],
  changeFee: 0.5,                               // retraining costs this × the new role's hire price…
  freeReturnLv: 2,                              // …but going back to a role you're Lv2+ in is free
};
// Abilities (one per role), unlocked at skill Lv2. They charge up while the staff member works
// (`charge` seconds of work, slower when idle) and fire on their own at a good moment: a waiter dashes
// when guests are waiting, a chef/bartender when a dish/drink has just started, a cleaner when
// trash has piled up nearby. Expert/Master staff charge faster (chargePerLv per level above 2).
export const ABILITIES = {
  waiter: { id: 'dash', name: 'Quick Refill', glyph: 'dash', color: '#2f9bff', charge: 40, dur: 8, speed: 1.9,
    desc: 'Zips between tables when guests are waiting: +90% walking and serving speed for 8 s.' },
  chef: { id: 'showtime', name: 'Latte Art', glyph: 'flame', color: '#ff7a2f', charge: 50, dur: 10, boost: 0.4, work: 2,
    desc: 'Pours a flourish: the drink on the machine jumps 40% ahead, then brews twice as fast for 10 s.' },
  cleaner: { id: 'whirlwind', name: 'Sparkle Sweep', glyph: 'whirl', color: '#30b85a', charge: 45, radius: 3,
    desc: 'Spins through the room when mess piles up: tidies every bit within 3 tiles at once.' },
  bartender: { id: 'juggle', name: 'Fresh Batch', glyph: 'juggle', color: '#b36bff', charge: 45, dur: 10, boost: 0.4, work: 2,
    desc: 'Pulls a fresh tray from the oven: the bake in hand jumps 40% ahead, then bakes twice as fast for 10 s.' },
};
export const ABILITY_UNLOCK_LV = 2;
export const ABILITY = { chargePerLv: 0.15, idleCharge: 0.35, impatientAfter: 20, windup: 0.9 };

// Character kits: staff are our own characters, and each brings a signature kit on top of their job's
// ability (above). `perks` are always on while the character is on shift (`bad: true` = a drawback that
// comes with the personality); `active` is cast by the player from the dock (a cooldown, no charging),
// unlocked once the character reaches skill Lv2 in any job. The kit follows the character they wear.
// Perk numbers: `speed`/`mul` multiply walking (and, for `mul`, working) speed; see Staff.kitMul().
export const NIGHT_FROM = 19;   // "Evening Glow" starts
export const KITS = {
  cheetie: {
    perks: [
      { id: 'sprint', glyph: 'dash', name: 'Cheetah Sprint', speed: 1.25,
        desc: 'The fastest on the team: walks 25% faster.' },
      { id: 'dislike', glyph: 'sad', bad: true, name: 'Matcha Aversion', dish: 'matcha', mul: 0.55,
        desc: 'Wrinkles its nose at anything green: carries matcha 45% slower.' },
    ],
    active: { id: 'mindread', glyph: 'eye', color: '#ffb84a', name: 'Mind Reader', cooldown: 45,
      desc: "Reads the mind of every guest waiting to order: all those orders are placed at once, and the guests are delighted." },
  },
  mochalatte: {
    perks: [
      { id: 'aura', glyph: 'energy', name: 'Caffeine Boost', radius: 3, mul: 1.12,
        desc: 'Colleagues within 3 tiles walk and work 12% faster.' },
    ],
    active: { id: 'timestop', glyph: 'clock', color: '#6fa8ff', name: 'Time Pause', cooldown: 70, dur: 7, burst: 15,
      desc: "Stops time: every guest's patience freezes for 7 s. The rush-hour lifesaver." },
  },
  heehee: {
    perks: [
      { id: 'bloom', glyph: 'heart', name: 'Blooming Tips', tip: 0.4, min: 0.7,
        desc: 'Delighted guests tip 40% more, in a shower of petals.' },
    ],
    active: { id: 'spotlight', glyph: 'sparkles', color: '#ffc93c', name: 'Spotlight', cooldown: 60, dur: 14, reach: 2.4,
      desc: 'Lights up the busiest table for 14 s: guests there wait longer, tip double and count double for the rating.' },
  },
  bbaekko: {
    perks: [
      { id: 'shy', glyph: 'sad', bad: true, name: 'Shy Heart', roles: ['waiter', 'cleaner'], mul: 0.65,
        desc: 'Out on the floor (Server, Cleaner) it works 35% slower. It is happiest in the kitchen.' },
      { id: 'night', glyph: 'zzz', bad: true, name: 'Afraid of the Dark', from: NIGHT_FROM, mul: 0.8,
        desc: 'After 7 pm it works 20% slower.' },
    ],
    active: { id: 'magic', glyph: 'sparkles', color: '#c37bff', name: 'Wild Magic', cooldown: 55,
      desc: 'Casts a random spell: a flash brew, a calming charm, a gust of haste or a coin shower… or the chant goes wrong.' },
  },
  oritokki: { perks: [], active: null },   // signature skills come with a later update
  tata: { perks: [], active: null },
  rj: { perks: [], active: null },
  chimmy: { perks: [], active: null },
  bboogyuli: { perks: [], active: null },
};
/** Every perk and active skill (for the translator). */
export const KIT_TEXT = Object.values(KITS).flatMap((k) => [...k.perks, k.active].filter(Boolean));

// ---------------- trouble & training ----------------
// Now and then a guest makes trouble: a rude guest storms in and shoves the staff around, or a guest eats
// and runs off without paying. Staff learn to deal with it at a club (Training tab): each staff member
// trains on their own, by passing the club's mini-game, keeps what they learned in every job, and from
// then on deals with that trouble by themselves.
// With nobody trained the trouble just runs its course: the rude guest leaves after `stay` seconds, the
// runaway gets away with the bill.
export const CLUBS = {
  baseball: { id: 'baseball', name: 'Baseball Club', skill: 'Home Run', glyph: 'bat', color: '#e5484d', fee: 80, trouble: 'rude',
    desc: 'When a rude guest shows up, this staff member grabs a bat on their own and knocks them clean out of the café.' },
  track: { id: 'track', name: 'Track Club', skill: 'Chase Down', glyph: 'run', color: '#2f9bff', fee: 60, trouble: 'dash',
    desc: 'When a guest runs off without paying, this staff member sprints after them on their own and gets the bill back.' },
};
export const CLUB_TEXT = Object.values(CLUBS);
export const TROUBLE = {
  // dine and dash: rolled when a guest finishes eating. Sneaks to the door, then runs `street` tiles along
  // the sidewalk before they're gone (long enough that a sprinter sent as they slip out can still catch up)
  dash: { level: 2, chance: 0.06, perDay: 2, sneak: 1.2, tiptoe: 0.8, run: 2.7, street: 14 },
  // rude guest: rolled when a guest walks in; shoves a staff member every `every` s (stunned `stun` s)
  rude: { level: 3, chance: 0.05, perDay: 1, stay: 40, every: 2.4, stun: 2.6, energy: 8, scare: 0.12 },
  respond: 1.9,        // trained staff on the job move this much faster
  react: 1,            // seconds before a trained staff member notices and goes (by themselves)
};

export function skillLevel(xp) {
  let lv = 1;
  while (lv < SKILL.levels.length && xp >= SKILL.levels[lv]) lv++;
  return lv;
}

// ---------------- daily goals ----------------
// One goal per day, shown top-left. `base + perLevel × level` is the target; the reward is paid on completion.
export const QUESTS = [
  { id: 'cups', text: 'Brew {n} drinks', base: 4, perLevel: 1, coins: 8, points: 3 },
  { id: 'guests', text: 'Serve {n} guests', base: 5, perLevel: 1, coins: 7, points: 3 },
  { id: 'bakes', text: 'Plate {n} bakes', base: 2, perLevel: 0.7, coins: 10, points: 4 },
  { id: 'coins', text: 'Earn {n} coins', base: 60, perLevel: 25, coins: 6, points: 4 },
];
export const questById = Object.fromEntries(QUESTS.map((q) => [q.id, q]));

// ---------------- wall decorations ----------------
// Bought in Build → Wall decor and hung wherever the player taps a wall (state.wallPos); pieces from older
// saves without a position fill the default slots. `y` is where the piece's centre hangs above the floor.
export const WALL_DECOR = [
  { id: 'wd_menu', name: 'Chalk Menu Board', asset: 'm_menu_board', price: 50, level: 1, decor: 4, y: 1.55 },
  { id: 'wd_frame_tulip', name: 'Tulip Print', asset: 'm_wall_frame', price: 30, level: 1, decor: 2, y: 1.7 },
  { id: 'wd_hanging', name: 'Hanging Pothos', asset: 'm_hanging_plant', price: 55, level: 2, decor: 5, y: 1.95 },
  { id: 'wd_sconce', name: 'Brass Wall Lamp', asset: 'm_wall_sconce', price: 45, level: 2, decor: 3, y: 1.9, light: true },
  { id: 'wd_frame_sage', name: 'Sage Print', asset: 'm_wall_frame', tint: '#cfe6c4', price: 35, level: 2, decor: 2, y: 1.7 },
  { id: 'wd_specials', name: 'Specials Board', asset: 'm_menu_board', tint: '#ffe2b8', price: 70, level: 3, decor: 4, y: 1.55 },
  { id: 'wd_frame_rose', name: 'Rose Print', asset: 'm_wall_frame', tint: '#f4c9d2', price: 40, level: 3, decor: 2, y: 1.7 },
  { id: 'wd_hanging2', name: 'Trailing Ivy', asset: 'm_hanging_plant', tint: '#bfe3a8', price: 65, level: 4, decor: 5, y: 1.95 },
  { id: 'wd_sconce2', name: 'Evening Wall Lamp', asset: 'm_wall_sconce', price: 55, level: 4, decor: 3, y: 1.9, light: true },
];
/** Where wall decorations hang: north wall first, then west (skipping the door), east, south. */
export function wallSlots(size, doorY) {
  const W = size * 2, lo = doorY * 2 - 1.0, hi = (doorY + 1) * 2 + 1.0, out = [];
  for (const side of ['north', 'west', 'east', 'south']) {
    for (let a = 2.5; a < W - 1.5; a += 2.7) { if (side === 'west' && a > lo && a < hi) continue; out.push({ side, a }); }
  }
  return out;
}
/** Centre-to-centre spacing two pieces on one wall need, and the stretch of the west wall around the door. */
export const WALL_GAP = 1.8;
export function wallDoorSpan(doorY) { return [doorY * 2 - 0.9, (doorY + 1) * 2 + 0.9]; }
/** Where every owned piece hangs: its saved spot, else the first default slot that has room. */
export function wallLayout(size, doorY, owned, pos = {}) {
  const out = {}, taken = [];
  const free = (side, a) => !taken.some((p) => p.side === side && Math.abs(p.a - a) < WALL_GAP);
  for (const id of owned) { const p = pos && pos[id]; if (p) { out[id] = { side: p.side, a: p.a }; taken.push(out[id]); } }
  const slots = wallSlots(size, doorY);
  for (const id of owned) {
    if (out[id]) continue;
    const q = slots.find((sl) => free(sl.side, sl.a));
    if (q) { out[id] = { side: q.side, a: q.a }; taken.push(out[id]); }
  }
  return out;
}
export const wallDecorById = Object.fromEntries(WALL_DECOR.map((w) => [w.id, w]));
export const START_WALL_DECOR = ['wd_menu', 'wd_frame_tulip', 'wd_hanging'];
