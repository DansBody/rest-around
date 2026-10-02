// Pantry rules shared by the live game (economy.js) and the offline settlement (offline.js): ingredients
// are used up a serving at a time, and the market can top the shelves up automatically. Everything here
// works on a plain state object ({ inv, opened, coins, level, dishes }), so it runs the same in the
// browser and on a server.
import { dishById, ingById, ingPrice, servingCost, EXTRA_CAT, SERVINGS_PER_UNIT, RESTOCK } from './data.js';

/** Servings of an ingredient on hand: the opened pack plus every sealed pack. */
export function servings(s, ing) { return (s.opened[ing] || 0) + (s.inv[ing] || 0) * SERVINGS_PER_UNIT; }

export function canMake(s, id) { return dishById[id].ings.every((i) => servings(s, i) >= 1); }

/** Give back the serving of each ingredient that consume() took (an order filled from stock after all). */
export function refund(s, id) {
  for (const i of dishById[id].ings) s.opened[i] = (s.opened[i] || 0) + 1;
}

/** How many more of a dish the pantry can make. */
export function canMakeCount(s, id) { return Math.floor(Math.min(...dishById[id].ings.map((i) => servings(s, i)))); }

/** Use one serving of every ingredient in the recipe. False (and nothing used) when something is missing. */
export function consume(s, id) {
  if (!canMake(s, id)) return false;
  for (const i of dishById[id].ings) {
    if ((s.opened[i] || 0) < 1) { s.inv[i]--; s.opened[i] = (s.opened[i] || 0) + SERVINGS_PER_UNIT; }
    s.opened[i] -= 1;
  }
  return true;
}

export const restockBudget = (level) => RESTOCK.base + RESTOCK.perLevel * level;
export const ingredientAvailable = (id, level) => { const i = ingById[id]; return !i.level || i.level <= level; };

/**
 * Buy back up the ingredients the menu uses (anything below RESTOCK.minUnits packs, up to RESTOCK.targetUnits),
 * within today's budget and what the till holds. `day` is the running tally { restocked, spent } for the
 * day. Returns the coins spent.
 */
export function restock(s, day) {
  let left = restockBudget(s.level) - (day.restocked || 0), spent = 0;
  const need = new Set();
  for (const id of Object.keys(s.dishes)) if (s.dishes[id].on && dishById[id].level <= s.level) for (const i of dishById[id].ings) need.add(i);
  for (const i of need) {
    if (!ingredientAvailable(i, s.level)) continue;
    const have = s.inv[i] || 0;
    if (have >= RESTOCK.minUnits) continue;
    const price = ingPrice(ingById[i]);
    const n = Math.min(RESTOCK.targetUnits - have, Math.floor(left / price), Math.floor(s.coins / price));
    if (n <= 0) continue;
    s.coins -= price * n; s.inv[i] = have + n; left -= price * n; spent += price * n;
    day.restocked = (day.restocked || 0) + price * n; day.spent = (day.spent || 0) + price * n;
  }
  return spent;
}

/**
 * A safety net so running dry is never a dead end: when no dish on the menu can be made and the till cannot
 * pay for the missing ingredients, the supplier leaves a starter pack (at most once a day). True if it did.
 */
export function rescue(s, day) {
  if ((day.rescued || 0) >= 1) return false;
  const foods = Object.keys(s.dishes).filter((id) => s.dishes[id].on && dishById[id].level <= s.level && dishById[id].cat !== EXTRA_CAT);
  if (!foods.length || foods.some((id) => canMake(s, id))) return false;
  const cheapest = foods.reduce((a, b) => (servingCost(dishById[a]) <= servingCost(dishById[b]) ? a : b));
  const missing = dishById[cheapest].ings.filter((i) => servings(s, i) < 1);
  if (s.coins >= missing.reduce((a, i) => a + ingPrice(ingById[i]), 0)) return false;
  for (const i of missing) s.inv[i] = (s.inv[i] || 0) + 2;
  day.rescued = 1;
  return true;
}
