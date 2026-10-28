// The colour palette staff are recoloured from (data.js PALETTE_*): its centre well is always open, each outer well
// fills when its street lot has been restored (state.street.restored, street.js), and dyes found on commissions and
// battles (state.dyes) add single colours. Cosmetic only: nothing here touches the economy or the server's checks.
import { PALETTE_CENTRE, PALETTE_WELLS, DYES, dyeById } from './data.js';
import { t } from './i18n.js';

/** Is this outer well filled (its lot restored)? The centre is always open. */
export function wellOpen(state, well) {
  if (well.id === PALETTE_CENTRE.id) return true;
  const st = state && state.street;
  return !!(st && Array.isArray(st.restored) && st.restored.includes(well.lot));
}

/** state.dyes from a save (untrusted): known dye ids, each once. */
export function cleanDyes(v) {
  return Array.isArray(v) ? v.filter((id, i, a) => dyeById[id] && a.indexOf(id) === i) : [];
}

/** The dyes found so far, in palette order. */
export const ownedDyes = (state) => DYES.filter((d) => (state.dyes || []).includes(d.id));

/**
 * A dye found (a commission or battle reward): kept for good, the whole team can wear it. False when it is unknown
 * or already owned. The reward screens call this; it toasts on its own.
 */
export function unlockDye(game, id) {
  const d = dyeById[id], s = game.state;
  if (!d || (s.dyes || []).includes(id)) return false;
  s.dyes = [...(s.dyes || []), id];
  game.toast(t('New dye: {name}', { name: t(d.name) }), 'good');
  game.changed('dyes');
  return true;
}

export { PALETTE_CENTRE, PALETTE_WELLS };
