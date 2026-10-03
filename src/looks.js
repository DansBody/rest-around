// Character looks for the 3D characters: which model, a fur and shirt colour (guests) and a small
// size variation. Guests wear our plain guest bodies
// (CHARACTER_MODELS) in random colours; staff are always one of our own characters (UNIQUE_MODELS),
// one staff member each.
import { choice, chance, rand } from './util.js';
import { OUTFIT_COLORS, GUEST_FUR, EAR_STYLES, CHARACTER_MODELS, UNIQUE_MODELS, WEAR, GUEST_WEAR } from './data.js';
import { sanitizeWear } from './wear.js';

/** A staff member's look: their own character, nothing worn yet (accessories come from the wardrobe). */
export function staffLook(model) {
  return { model, tint: null, scale: 1, wear: {} };
}

/** The first original character nobody on the team is wearing (null when the whole cast is hired). */
export function nextCast(taken) {
  return UNIQUE_MODELS.find((m) => !taken.has(m)) || null;
}

export function randomLook() {
  const model = choice(CHARACTER_MODELS);
  // now and then a guest turns up in a hat, glasses or a bow tie (never fitted by hand: the auto fit only)
  const wear = {};
  for (const [slot, p] of Object.entries(GUEST_WEAR)) if (chance(p)) wear[slot] = { id: choice(WEAR.filter((w) => w.slot === slot && w.guest !== false)).id };
  return { model, wear, tint: null, fur: choice(GUEST_FUR), shirt: choice(OUTFIT_COLORS), ears: choice(EAR_STYLES), scale: +rand(0.92, 1.05).toFixed(2) };
}

/** What a `role` hire looks like on `model` (used for the portraits in the hire and retrain lists). */
export function roleLook(role, model = UNIQUE_MODELS[0]) {
  return staffLook(model);
}

/**
 * A saved staff look, made safe. Staff are always one of the original characters nobody else on the
 * team wears (`taken`); saves from the KayKit days get the next free one. Null when the cast is used up.
 */
export function sanitizeLook(l, role, taken = new Set()) {
  const ok = l && typeof l === 'object' && UNIQUE_MODELS.includes(l.model) && !taken.has(l.model);
  const model = ok ? l.model : nextCast(taken);
  if (!model) return null;
  const look = staffLook(model);
  if (ok) {
    if (typeof l.scale === 'number') look.scale = Math.min(1.1, Math.max(0.9, l.scale));
    look.wear = sanitizeWear(l.wear);
    // saves from before the wardrobe: the barista cap was a job hat, now it's the cap they keep wearing
    if (l.roleHat === 'chef' && !look.wear.head) look.wear.head = { id: 'cap_barista' };
  }
  return look;
}
