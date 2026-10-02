// The pastry case's three shelves. A shelf is empty (null), held for a bake on its way from the oven
// ({ res: staff }), or holds a bake ({ dish, ticket }): ticket is the guest order it is set aside for,
// or null for stock the baker made ahead. Stock stays on the shelf overnight and is saved with the case.
import { dishById, EXTRA_CAT } from './data.js';

export const CASE_SLOTS = 3;
export const PREBAKE_SLOTS = 2;          // baking ahead stops here per case: one shelf stays free for bakes ordered fresh
export const BAKE_CHANCE = 0.55;         // a guest adds a bake to their order this often…
export const STOCK_BAKE_CHANCE = 0.75;   // …or this often when they can see bakes in the case

export function slotsOf(f) {
  if (!f.slots) f.slots = Array(CASE_SLOTS).fill(null);
  return f.slots;
}
export const freeSlot = (f) => slotsOf(f).findIndex((s) => !s);
export const isStock = (s) => !!(s && s.dish && !s.ticket);

/** Every bake on a shelf that nobody has claimed: [{ f, i, dish }]. */
export function stockIn(cases) {
  const out = [];
  for (const f of cases) slotsOf(f).forEach((s, i) => { if (isStock(s)) out.push({ f, i, dish: s.dish }); });
  return out;
}

/** Set a stocked bake aside for a guest's ticket. */
export function claim(f, i, t) {
  f.slots[i].ticket = t;
  t.state = 'ready'; t.station = f;
}

/** The shelf holding this ticket's bake, or -1. */
export const slotOfTicket = (f, t) => slotsOf(f).findIndex((s) => s && s.ticket === t);

/** Put a bake on the first free shelf (a full case gives up its oldest stock). */
export function putBack(f, dish, t) {
  const sl = slotsOf(f);
  let i = sl.findIndex((s) => !s);
  if (i < 0) i = sl.findIndex(isStock);
  if (i < 0) return false;
  sl[i] = { dish, ticket: t };
  if (t) { t.state = 'ready'; t.station = f; }
  return true;
}

/** Shelves in use across these cases, counting ones held for a bake on its way. */
export const shelvesUsed = (cases) => cases.reduce((n, f) => n + slotsOf(f).filter(Boolean).length, 0);

/** Save form: the dish on each shelf. Bakes set aside for a guest come back as stock. */
export const saveSlots = (f) => (f.slots ? f.slots.map((s) => (s && s.dish) || null) : null);
export function loadSlots(f, list) {
  if (!Array.isArray(list)) return;
  f.slots = Array.from({ length: CASE_SLOTS }, (_, i) => {
    const d = list[i];
    return d && dishById[d] && dishById[d].cat === EXTRA_CAT ? { dish: d, ticket: null } : null;
  });
}
