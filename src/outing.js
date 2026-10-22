// Outing days (design/combat/DESIGN.md §3): the tickets and the window an outing shuts the café. A ticket comes
// each calendar day of the player's own time zone (clock.js localDay), banked up to OUTING.max; heading out spends
// one and shuts the café for OUTING.length seconds of wall clock from that moment (clock.js wallSec, the same
// count DayCycle.pos() keeps). Pure, like clock.js and offline.js: the game, the offline settlement and the
// server's checks (authority.js) all read it.
import { OUTING } from './data.js';

/** state.tickets from a save (untrusted): a count up to the cap, and the calendar day it was last counted on
 *  (null for a save from before outings: its first count starts from that day without a grant). */
export function cleanTickets(t) {
  const ok = (v) => typeof v === 'number' && isFinite(v);
  const n = t && ok(t.n) ? Math.max(0, Math.min(OUTING.max, Math.floor(t.n))) : OUTING.perDay;
  const day = t && ok(t.day) && t.day >= 0 ? Math.floor(t.day) : null;
  return { n, day };
}

/** The tickets on calendar day `today`: one a day since they were last counted, up to the cap. */
export function topUp(t, today) {
  if (t.day == null) return { n: t.n, day: today };
  if (today <= t.day) return t;
  return { n: Math.min(OUTING.max, t.n + (today - t.day) * OUTING.perDay), day: today };
}

/** state.outing from a save (untrusted): the window it shuts the café, or null. */
export function cleanOuting(o) {
  if (!o || typeof o.from !== 'number' || !isFinite(o.from) || o.until !== o.from + OUTING.length) return null;
  return { from: o.from, until: o.until };
}

/** The window a new outing shuts the café, heading out at `pos` (wall-clock seconds). */
export const outingAt = (pos) => { const from = Math.floor(pos); return { from, until: from + OUTING.length }; };

/** Is the café shut for an outing at `pos`? */
export const shutAt = (o, pos) => !!o && pos >= o.from && pos < o.until;

/** How many seconds of [a, b) an outing kept the café shut. */
export const shutWithin = (o, a, b) => (o ? Math.max(0, Math.min(b, o.until) - Math.max(a, o.from)) : 0);
