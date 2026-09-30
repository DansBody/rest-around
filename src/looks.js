// Character look generation (paper-doll layer choices + tints).
import { choice, chance } from './util.js';
import { SKIN_TONES, HAIR_COLORS, OUTFIT_COLORS, HAIR_STYLES, ROLES } from './data.js';

const SHOES = ['#7a5a48', '#5b5b6e', '#b86a5a', '#f2efe9', '#6a8fb3'];

export function randomLook() {
  const top = choice(['tee', 'tee', 'hoodie', 'jacket']);
  return {
    skin: choice(SKIN_TONES),
    shoe: choice(SHOES),
    hair: [choice(HAIR_STYLES), choice(HAIR_COLORS)],
    top: [top, choice(OUTFIT_COLORS)],
    bottom: [chance(0.4) ? 'skirt' : 'pants', choice(OUTFIT_COLORS)],
    hat: chance(0.3) ? [choice(['cap', 'bow']), choice(OUTFIT_COLORS)] : null,
  };
}

export function roleLook(role) {
  const r = ROLES[role].look;
  const l = randomLook();
  l.top = [...r.top];
  l.bottom = [...r.bottom];
  l.hat = r.hat ? [...r.hat] : null;
  l.shoe = '#6b5040';
  return l;
}

export function sanitizeLook(l) {
  const d = randomLook();
  if (!l || typeof l !== 'object') return d;
  const pair = (v, fallback) => (Array.isArray(v) && typeof v[0] === 'string' && typeof v[1] === 'string' ? [v[0], v[1]] : fallback);
  return {
    skin: typeof l.skin === 'string' ? l.skin : d.skin,
    shoe: typeof l.shoe === 'string' ? l.shoe : d.shoe,
    hair: pair(l.hair, d.hair),
    top: pair(l.top, d.top),
    bottom: pair(l.bottom, d.bottom),
    hat: l.hat === null ? null : pair(l.hat, null),
  };
}
