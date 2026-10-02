// Character looks for the 3D characters: which model, which optional accessories are hidden,
// a fur and shirt colour (guests) and a small size variation. Guests wear our plain guest bodies
// (CHARACTER_MODELS) in random colours; staff are always one of our own characters (UNIQUE_MODELS),
// one staff member each.
import { choice, chance, rand } from './util.js';
import { OUTFIT_COLORS, GUEST_FUR, EAR_STYLES, CHARACTER_MODELS, UNIQUE_MODELS } from './data.js';

export const ACCESSORIES = {
  knight: ['Knight_Helmet', 'Knight_Cape'],
  mage: ['Mage_Hat', 'Mage_Cape'],
  barbarian: ['Barbarian_Hat', 'Barbarian_Cape'],
  rogue: ['Rogue_Cape'],
  rogue_hooded: ['Rogue_Cape'],
};

/** A staff member's look: their own character, plus the chef hat when cooking. */
export function staffLook(model, role) {
  return { model, hide: [], tint: null, scale: 1, roleHat: role === 'chef' ? 'chef' : null };
}

/** The first original character nobody on the team is wearing (null when the whole cast is hired). */
export function nextCast(taken) {
  return UNIQUE_MODELS.find((m) => !taken.has(m)) || null;
}

export function randomLook() {
  const model = choice(CHARACTER_MODELS);
  const hide = (ACCESSORIES[model] || []).filter(() => chance(0.55));
  return { model, hide, tint: null, fur: choice(GUEST_FUR), shirt: choice(OUTFIT_COLORS), ears: choice(EAR_STYLES), scale: +rand(0.92, 1.05).toFixed(2), roleHat: null };
}

/** What a `role` hire looks like on `model` (used for the portraits in the hire and retrain lists). */
export function roleLook(role, model = UNIQUE_MODELS[0]) {
  return staffLook(model, role);
}

/**
 * A saved staff look, made safe. Staff are always one of the original characters nobody else on the
 * team wears (`taken`); saves from the KayKit days get the next free one. Null when the cast is used up.
 */
export function sanitizeLook(l, role, taken = new Set()) {
  const ok = l && typeof l === 'object' && UNIQUE_MODELS.includes(l.model) && !taken.has(l.model);
  const model = ok ? l.model : nextCast(taken);
  if (!model) return null;
  const look = staffLook(model, role);
  if (ok) {
    if (typeof l.scale === 'number') look.scale = Math.min(1.1, Math.max(0.9, l.scale));
    look.roleHat = l.roleHat === 'chef' ? 'chef' : null;
  }
  return look;
}
