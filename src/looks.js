// Character looks for the 3D characters: which model, which optional accessories are hidden,
// a light outfit tint and a small size variation. Staff roles get a recognisable default.
import { choice, chance, rand } from './util.js';
import { OUTFIT_COLORS, ROLES, CHARACTER_MODELS } from './data.js';

export const ACCESSORIES = {
  knight: ['Knight_Helmet', 'Knight_Cape'],
  mage: ['Mage_Hat', 'Mage_Cape'],
  barbarian: ['Barbarian_Hat', 'Barbarian_Cape'],
  rogue: ['Rogue_Cape'],
  rogue_hooded: ['Rogue_Cape'],
};

export function randomLook() {
  const model = choice(CHARACTER_MODELS);
  const hide = (ACCESSORIES[model] || []).filter(() => chance(0.55));
  return { model, hide, tint: chance(0.55) ? choice(OUTFIT_COLORS) : null, scale: +rand(0.92, 1.05).toFixed(2), roleHat: null };
}

export function roleLook(role) {
  const r = ROLES[role] || {};
  const model = r.model || 'knight';
  return {
    model,
    hide: [...(ACCESSORIES[model] || [])].filter((n) => !/Cape/.test(n) || role !== 'bartender'),
    tint: null,
    scale: 1,
    roleHat: role === 'chef' ? 'chef' : null,
  };
}

export function sanitizeLook(l, role) {
  if (!l || typeof l !== 'object' || !CHARACTER_MODELS.includes(l.model)) return role ? roleLook(role) : randomLook();
  const acc = ACCESSORIES[l.model] || [];
  return {
    model: l.model,
    hide: Array.isArray(l.hide) ? l.hide.filter((n) => acc.includes(n)) : [],
    tint: typeof l.tint === 'string' ? l.tint : null,
    scale: typeof l.scale === 'number' ? Math.min(1.1, Math.max(0.9, l.scale)) : 1,
    roleHat: l.roleHat === 'chef' ? 'chef' : null,
  };
}
