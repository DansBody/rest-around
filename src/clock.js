// The café's clock follows the real one. A round (one opening, rushes, closing and a short night) lasts
// DAY.round real seconds, and rounds start on the even hours of the player's own time zone, so 08:00 on the
// wall is 08:00 in the café. `tz` is the player's offset from UTC in minutes (east positive), kept in the save.
// Pure: used by the game, the offline settlement and the server alike.
import { DAY } from './data.js';

export const ROUNDS_PER_DAY = 86400 / DAY.round;

/** This device's offset from UTC in minutes. */
export const localTz = () => -new Date().getTimezoneOffset();
/** A sane time-zone offset (UTC-12 … UTC+14), else 0. */
export const cleanTz = (tz) => (typeof tz === 'number' && isFinite(tz) && tz >= -720 && tz <= 840 ? Math.round(tz) : 0);

/** Seconds on the player's local wall clock since the epoch. */
export const wallSec = (nowMs, tz) => nowMs / 1000 + cleanTz(tz) * 60;
/** The round under way at `nowMs` (a running count) and how far into it the clock is (sim seconds). */
export const roundAt = (nowMs, tz) => Math.floor(wallSec(nowMs, tz) / DAY.round);
export const clockAt = (nowMs, tz) => { const w = wallSec(nowMs, tz); return w - Math.floor(w / DAY.round) * DAY.round; };
/** The player's local calendar day (a running count): when the daily goal and the daily gift come round. */
export const localDay = (nowMs, tz) => Math.floor(wallSec(nowMs, tz) / 86400);
/** Which of today's rounds `round` is (0-based). */
export const roundOfDay = (round) => ((round % ROUNDS_PER_DAY) + ROUNDS_PER_DAY) % ROUNDS_PER_DAY;

/** The café's hour at `clock` sim seconds into a round: 8–22 while open, then the night runs on to 32 (08:00). */
export function hourAt(clock) {
  if (clock < DAY.length) return DAY.startHour + (clock / DAY.length) * (DAY.endHour - DAY.startHour);
  return DAY.endHour + ((clock - DAY.length) / (DAY.round - DAY.length)) * (24 + DAY.startHour - DAY.endHour);
}
