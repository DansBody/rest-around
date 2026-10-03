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
 *
 * The budget is spread rather than spent first come, first served: every low ingredient is first brought
 * up to minUnits, the ones most of the menu leans on first, and only then topped up to targetUnits. And when
 * the budget is gone but nothing on the menu can be made any more, the till still pays for the cheapest
 * dish to get going again, so a café with coins in hand never turns guests away for want of a budget.
 */
export function restock(s, day) {
  let left = restockBudget(s.level) - (day.restocked || 0), spent = 0;
  const menu = Object.keys(s.dishes).filter((id) => s.dishes[id].on && dishById[id].level <= s.level);
  const uses = {};   // how much of the menu leans on each ingredient: a brewed drink counts double a bake on the side
  for (const id of menu) for (const i of dishById[id].ings) uses[i] = (uses[i] || 0) + (dishById[id].cat === EXTRA_CAT ? 1 : 2);
  const buy = (i, upTo, cap) => {
    const have = s.inv[i] || 0, price = ingPrice(ingById[i]);
    const n = Math.min(upTo - have, Math.floor(cap / price), Math.floor(s.coins / price));
    if (n <= 0) return 0;
    s.coins -= price * n; s.inv[i] = have + n; spent += price * n;
    day.restocked = (day.restocked || 0) + price * n; day.spent = (day.spent || 0) + price * n;
    return price * n;
  };
  const low = Object.keys(uses)
    .filter((i) => ingredientAvailable(i, s.level) && (s.inv[i] || 0) < RESTOCK.minUnits)
    .sort((a, b) => uses[b] - uses[a] || servings(s, a) - servings(s, b));
  for (const i of low) left -= buy(i, RESTOCK.minUnits, left);
  for (const i of low) left -= buy(i, RESTOCK.targetUnits, left);
  // over budget, only to keep the doors open
  const foods = menu.filter((id) => dishById[id].cat !== EXTRA_CAT);
  if (foods.length && !foods.some((id) => canMake(s, id))) {
    const missing = (id) => dishById[id].ings.filter((i) => servings(s, i) < 1);
    const unlock = (id) => (missing(id).every((i) => ingredientAvailable(i, s.level)) ? missing(id).reduce((a, i) => a + ingPrice(ingById[i]), 0) : Infinity);
    const pick = foods.reduce((a, b) => (unlock(b) < unlock(a) ? b : a));
    const gone = missing(pick);
    if (unlock(pick) <= s.coins) for (const upTo of [1, RESTOCK.minUnits]) for (const i of gone) buy(i, upTo, Infinity);   // one pack of each first, so all of the recipe is covered
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
