// Gameplay data. Art references are asset ids from the manifest (+ an optional tint);
// no pixel sizes or offsets live here.

// ---------------- furniture ----------------
// kind: table | chair | stove | bar | toilet | arcade | decor
export const FURNITURE = [
  { id: 'table_oak', name: 'Oak Table', kind: 'table', asset: 'table_square', tint: '#e2b784', price: 40, level: 1, decor: 1, cat: 'dining' },
  { id: 'table_walnut', name: 'Walnut Table', kind: 'table', asset: 'table_square', tint: '#b98761', price: 60, level: 2, decor: 2, cat: 'dining' },
  { id: 'table_mint', name: 'Mint Table', kind: 'table', asset: 'table_square', tint: '#a9dcc6', price: 80, level: 3, decor: 3, cat: 'dining' },
  { id: 'table_rose', name: 'Rose Table', kind: 'table', asset: 'table_square', tint: '#f3b3c1', price: 110, level: 5, decor: 4, cat: 'dining' },
  { id: 'chair_oak', name: 'Oak Chair', kind: 'chair', asset: 'chair_wood', tint: '#e2b784', price: 20, level: 1, decor: 1, cat: 'dining' },
  { id: 'chair_mint', name: 'Mint Chair', kind: 'chair', asset: 'chair_wood', tint: '#a9dcc6', price: 35, level: 2, decor: 2, cat: 'dining' },
  { id: 'chair_rose', name: 'Puffy Rose Chair', kind: 'chair', asset: 'chair_cushion', tint: '#f3b3c1', price: 55, level: 3, decor: 3, cat: 'dining' },
  { id: 'chair_sky', name: 'Puffy Sky Chair', kind: 'chair', asset: 'chair_cushion', tint: '#b3d3ef', price: 55, level: 4, decor: 3, cat: 'dining' },
  { id: 'stove_basic', name: 'Cozy Stove', kind: 'stove', asset: 'stove_basic', tint: '#f4e6cf', price: 120, level: 1, speed: 1.0, decor: 0, cat: 'kitchen' },
  { id: 'stove_steel', name: 'Steel Stove', kind: 'stove', asset: 'stove_basic', tint: '#c3d2e0', price: 320, level: 3, speed: 1.45, decor: 1, cat: 'kitchen' },
  { id: 'stove_deluxe', name: 'Copper Range', kind: 'stove', asset: 'stove_deluxe', price: 750, level: 6, speed: 2.1, decor: 3, cat: 'kitchen' },
  { id: 'bar_counter', name: 'Juice Bar', kind: 'bar', asset: 'bar_counter', tint: '#e8c9a0', price: 260, level: 2, speed: 1.0, decor: 2, cat: 'kitchen' },
  { id: 'toilet', name: 'Restroom', kind: 'toilet', asset: 'toilet', price: 160, level: 2, fee: 4, breakAfter: [6, 10], decor: 0, cat: 'fun' },
  { id: 'arcade_pink', name: 'Arcade Cabinet', kind: 'arcade', asset: 'arcade', tint: '#f3b3c1', price: 380, level: 4, fee: 10, breakAfter: [5, 8], decor: 2, cat: 'fun' },
  { id: 'arcade_sky', name: 'Arcade Cabinet (Sky)', kind: 'arcade', asset: 'arcade', tint: '#a9cbe8', price: 380, level: 6, fee: 10, breakAfter: [5, 8], decor: 2, cat: 'fun' },
  { id: 'plant_fern', name: 'Fern', kind: 'decor', asset: 'plant_fern', price: 30, level: 1, decor: 4, cat: 'decor' },
  { id: 'plant_tall', name: 'Tall Plant', kind: 'decor', asset: 'plant_tall', price: 70, level: 2, decor: 7, cat: 'decor' },
  { id: 'lamp_butter', name: 'Butter Lamp', kind: 'decor', asset: 'lamp_floor', tint: '#f9e3a1', price: 60, level: 1, decor: 5, cat: 'decor' },
  { id: 'lamp_rose', name: 'Rose Lamp', kind: 'decor', asset: 'lamp_floor', tint: '#f6bdc8', price: 90, level: 3, decor: 7, cat: 'decor' },
  { id: 'lamp_mint', name: 'Mint Lamp', kind: 'decor', asset: 'lamp_floor', tint: '#b9e4cf', price: 120, level: 5, decor: 9, cat: 'decor' },
];
export const FLOORS = [
  { id: 'fl_oak', name: 'Oak Planks', asset: 'floor_wood', tint: '#ecc79b', price: 4, level: 1, decor: 0 },
  { id: 'fl_walnut', name: 'Walnut Planks', asset: 'floor_wood', tint: '#c99a70', price: 6, level: 2, decor: 0.2 },
  { id: 'fl_cream', name: 'Cream Tiles', asset: 'floor_checker', tint: '#f6e7cc', price: 6, level: 1, decor: 0.2 },
  { id: 'fl_mint', name: 'Mint Tiles', asset: 'floor_checker', tint: '#c7e8d6', price: 8, level: 3, decor: 0.3 },
  { id: 'fl_rose', name: 'Rose Carpet', asset: 'floor_carpet', tint: '#f5c3cf', price: 10, level: 4, decor: 0.4 },
  { id: 'fl_sky', name: 'Sky Carpet', asset: 'floor_carpet', tint: '#c3dcf3', price: 10, level: 5, decor: 0.4 },
];
export const WALLS = [
  { id: 'wp_cream', name: 'Cream Plaster', asset: 'wall_plain', tint: '#fbead3', price: 5, level: 1, decor: 0 },
  { id: 'wp_peach', name: 'Peach Plaster', asset: 'wall_plain', tint: '#f9d0b3', price: 6, level: 1, decor: 0.2 },
  { id: 'wp_mint', name: 'Mint Stripes', asset: 'wall_stripe', tint: '#cdebdc', price: 9, level: 2, decor: 0.4 },
  { id: 'wp_rose', name: 'Rose Stripes', asset: 'wall_stripe', tint: '#f7cfd9', price: 9, level: 3, decor: 0.4 },
  { id: 'wp_sky', name: 'Sky Stripes', asset: 'wall_stripe', tint: '#cfe1f4', price: 12, level: 5, decor: 0.5 },
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
export const INGREDIENTS = [
  { id: 'tomato', name: 'Tomato', source: 'garden', price: 6 },
  { id: 'lettuce', name: 'Lettuce', source: 'garden', price: 5 },
  { id: 'carrot', name: 'Carrot', source: 'garden', price: 5 },
  { id: 'potato', name: 'Potato', source: 'garden', price: 6 },
  { id: 'strawberry', name: 'Strawberry', source: 'garden', price: 9 },
  { id: 'herb', name: 'Basil', source: 'garden', price: 5 },
  { id: 'egg', name: 'Egg', source: 'market', price: 5, level: 1 },
  { id: 'flour', name: 'Flour', source: 'market', price: 4, level: 1 },
  { id: 'milk', name: 'Milk', source: 'market', price: 5, level: 1 },
  { id: 'rice', name: 'Rice', source: 'market', price: 4, level: 1 },
  { id: 'cheese', name: 'Cheese', source: 'market', price: 8, level: 2 },
  { id: 'lemon', name: 'Lemon', source: 'market', price: 6, level: 2 },
  { id: 'fish', name: 'Fish', source: 'market', price: 10, level: 3 },
  { id: 'tea', name: 'Tea Leaves', source: 'market', price: 7, level: 4 },
];
export const ingById = Object.fromEntries(INGREDIENTS.map((i) => [i.id, i]));
export const ingIcon = (id) => 'ing_' + id;

// Garden seeds (grow time in sim seconds; the plot must stay watered to grow)
export const SEEDS = [
  { crop: 'lettuce', price: 6, grow: 60, yield: 3, level: 1 },
  { crop: 'tomato', price: 8, grow: 80, yield: 3, level: 1 },
  { crop: 'carrot', price: 7, grow: 70, yield: 3, level: 1 },
  { crop: 'herb', price: 5, grow: 50, yield: 3, level: 2 },
  { crop: 'potato', price: 8, grow: 95, yield: 4, level: 3 },
  { crop: 'strawberry', price: 12, grow: 120, yield: 3, level: 4 },
];
export const WATER_DURATION = 45; // seconds a full watering lasts

export const SNACKS = [
  { id: 'cookie', name: 'Cookie', price: 12, energy: 30, asset: 'snack_cookie' },
  { id: 'sandwich', name: 'Sandwich', price: 22, energy: 60, asset: 'snack_sandwich' },
  { id: 'bento', name: 'Bento', price: 35, energy: 100, asset: 'snack_bento' },
];
export const snackById = Object.fromEntries(SNACKS.map((s) => [s.id, s]));

// ---------------- dishes ----------------
// cook: base seconds on a speed-1 stove. price/points at Lv1.
export const DISHES = [
  { id: 'salad', name: 'Garden Salad', cat: 'starter', asset: 'dish_salad', level: 1, cook: 6, price: 10, points: 4, ings: ['lettuce', 'tomato', 'carrot'] },
  { id: 'soup', name: 'Tomato Soup', cat: 'starter', asset: 'dish_soup', level: 2, cook: 8, price: 14, points: 5, ings: ['tomato', 'herb', 'milk'] },
  { id: 'bread', name: 'Cheesy Bread', cat: 'starter', asset: 'dish_bread', level: 4, cook: 8, price: 17, points: 6, ings: ['flour', 'cheese', 'herb'] },
  { id: 'omurice', name: 'Omelette Rice', cat: 'main', asset: 'dish_omurice', level: 1, cook: 11, price: 20, points: 7, ings: ['egg', 'rice', 'tomato'] },
  { id: 'fish', name: 'Fish & Chips', cat: 'main', asset: 'dish_fish', level: 3, cook: 13, price: 28, points: 9, ings: ['fish', 'potato', 'flour'] },
  { id: 'pasta', name: 'Veggie Pasta', cat: 'main', asset: 'dish_pasta', level: 5, cook: 12, price: 34, points: 11, ings: ['flour', 'tomato', 'cheese'] },
  { id: 'pudding', name: 'Caramel Pudding', cat: 'dessert', asset: 'dish_pudding', level: 2, cook: 7, price: 16, points: 6, ings: ['egg', 'milk'] },
  { id: 'cake', name: 'Strawberry Shortcake', cat: 'dessert', asset: 'dish_cake', level: 5, cook: 10, price: 28, points: 9, ings: ['strawberry', 'flour', 'milk'] },
  { id: 'tart', name: 'Lemon Tart', cat: 'dessert', asset: 'dish_tart', level: 7, cook: 11, price: 36, points: 12, ings: ['lemon', 'flour', 'egg'] },
  { id: 'lemonade', name: 'Lemonade', cat: 'drink', asset: 'drink_lemonade', level: 2, cook: 4, price: 8, points: 3, ings: ['lemon'] },
  { id: 'milktea', name: 'Milk Tea', cat: 'drink', asset: 'drink_milktea', level: 4, cook: 5, price: 12, points: 4, ings: ['milk', 'tea'] },
  { id: 'smoothie', name: 'Berry Smoothie', cat: 'drink', asset: 'drink_smoothie', level: 6, cook: 6, price: 16, points: 6, ings: ['strawberry', 'milk'] },
];
export const dishById = Object.fromEntries(DISHES.map((d) => [d.id, d]));
export const DISH_CATS = [
  { id: 'starter', name: 'Starters' }, { id: 'main', name: 'Mains' }, { id: 'dessert', name: 'Desserts' }, { id: 'drink', name: 'Drinks' },
];
export const MAX_DISH_LEVEL = 10;
/** Ingredients (of each kind in the recipe) needed to go from `lv` to `lv+1`. */
export const levelUpCost = (lv) => lv + 1;
export const dishPrice = (d, lv) => Math.round(d.price * (1 + 0.16 * (lv - 1)));
export const dishPoints = (d, lv) => Math.round(d.points * (1 + 0.2 * (lv - 1)));

// ---------------- progression ----------------
export const LEVEL_POINTS = [0, 0, 90, 260, 560, 1000, 1650, 2500, 3700, 5300, 7500, 10500, 14500, 20000];
export const MAX_LEVEL = LEVEL_POINTS.length - 1;
export const staffSlots = (lv) => Math.min(9, 1 + lv);
export const gardenPlots = (lv) => Math.min(6, 1 + lv);
export function menuSlots(lv) {
  const t = [
    null,
    { starter: 1, main: 1, dessert: 0, drink: 0 },
    { starter: 1, main: 1, dessert: 1, drink: 1 },
    { starter: 2, main: 2, dessert: 1, drink: 1 },
    { starter: 2, main: 2, dessert: 2, drink: 2 },
    { starter: 2, main: 3, dessert: 2, drink: 2 },
  ];
  return t[Math.min(lv, 5)] || { starter: 3, main: 3, dessert: 3, drink: 3 };
}

// ---------------- staff ----------------
export const ROLES = {
  waiter: { name: 'Waiter', hire: 90, look: { top: ['jacket', '#9cc3e6'], bottom: ['pants', '#6d6a8a'], hat: null } },
  chef: { name: 'Chef', hire: 110, look: { top: ['jacket', '#fbfaf5'], bottom: ['pants', '#7c6f67'], hat: ['chef', '#ffffff'] } },
  cleaner: { name: 'Cleaner', hire: 70, look: { top: ['hoodie', '#b5e0c8'], bottom: ['pants', '#7fa7c9'], hat: ['cap', '#f5b3a5'] } },
  bartender: { name: 'Bartender', hire: 100, look: { top: ['jacket', '#d99aa8'], bottom: ['skirt', '#5c4d6b'], hat: ['bow', '#f7d58b'] } },
};
export const STAFF_NAMES = ['Mochi', 'Pip', 'Tansy', 'Juniper', 'Bo', 'Clover', 'Wren', 'Suki', 'Olive', 'Fennel', 'Poppy', 'Taro', 'Miso', 'Hazel', 'Basil', 'Kiki', 'Nori', 'Sprout', 'Maple', 'Dot'];
export const CUSTOMER_NAMES = ['Aster', 'Bramble', 'Cocoa', 'Daisy', 'Ember', 'Figgy', 'Gumdrop', 'Honey', 'Iris', 'Jelly', 'Kumo', 'Lulu', 'Momo', 'Nutmeg', 'Oona', 'Peaches', 'Quill', 'Rolo', 'Sunny', 'Toffee', 'Umi', 'Velvet', 'Waffles', 'Yuzu', 'Ziggy', 'Pudding', 'Biscuit', 'Clementine', 'Dumpling', 'Pickle'];

export const SKIN_TONES = ['#fde3cf', '#f6cfae', '#e8b48f', '#c98c68', '#9c6a4f', '#f9dcc0'];
export const HAIR_COLORS = ['#4a3328', '#7a4e33', '#c98b4f', '#f0cf7a', '#e59aa8', '#8fb4e0', '#3b3a4a', '#b8a4d8', '#f2efe9'];
export const OUTFIT_COLORS = ['#f6b8c4', '#a9dcc6', '#9cc3e6', '#f9dd96', '#c9b6e3', '#f5b58d', '#fbfaf5', '#6d6a8a', '#d99aa8', '#b5e0c8', '#7fa7c9', '#e88a7a'];
export const HAIR_STYLES = ['bob', 'spiky', 'bun', 'long'];
export const TOP_STYLES = ['tee', 'jacket', 'hoodie'];
export const BOTTOM_STYLES = ['pants', 'skirt'];
export const HAT_STYLES = [null, 'chef', 'cap', 'bow'];

// ---------------- simulation tuning ----------------
export const DAY = {
  length: 480,            // sim seconds per day (8 real minutes at 1x)
  startHour: 8, endHour: 22, lastCallHour: 21,
  phases: [
    { id: 'opening', name: 'Opening', from: 8, mult: 0.75 },
    { id: 'lunch', name: 'Lunch Rush', from: 11, mult: 1.6 },
    { id: 'afternoon', name: 'Afternoon', from: 14, mult: 0.9 },
    { id: 'dinner', name: 'Dinner Rush', from: 17, mult: 1.75 },
    { id: 'closing', name: 'Closing', from: 20, mult: 0.45 },
  ],
};
export const PATIENCE = { seat: 22, order: 28, food: 50 };
export const SPEED = { customer: 1.9, staff: 2.4 };
export const ENERGY = { drainPerSec: 0.32, napRegen: 0.22, wakeAt: 30, overnight: 35 };
