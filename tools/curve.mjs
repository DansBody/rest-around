// Level curve calculator: for every café level, a typical café at that level's caps (seats, stations, staff,
// floor plan, dish levels, rating) is run through the offline settlement to see how many café points a day
// brings, and the points needed for each level follow from how many days it should take. Prints the days per
// level, the running total and a LEVEL_POINTS line for src/data.js.
//   node tools/curve.mjs
// A day here is a casual player: the café away for the level's away hours (awayHours), plus an hour of live play
// (the offline settlement earns OFFLINE.efficiency of live play), plus the three daily goals.
import { settleOffline } from '../src/offline.js';
import {
  DISHES, OFFLINE, EXPANSIONS, DAILY, dailyPoints, menuSlots, dishCap, seatCap, stationCap, staffSlots, awayHours, UNIQUE_MODELS,
} from '../src/data.js';

const LEVELS = 30;
/** Days the step from level L to L+1 should take: the first levels fly by, then about a day and a half, then a few days. */
const daysFor = (L) => (L < 6 ? null : L < 15 ? 1 + (L - 6) * 0.1 : 3 + (L - 15) * 0.07);
const EARLY = [0, 0, 90, 260, 560, 1000, 1650];   // Lv1–6 keep today's quick start

function cafe(L) {
  const size = Math.max(8, ...EXPANSIONS.filter((e) => e.level <= L).map((e) => e.size));
  const tables = Math.floor(seatCap(L) / 2);
  const stove = L >= 6 ? 'stove_deluxe' : L >= 3 ? 'stove_steel' : 'stove_basic';
  const fur = [];
  for (let i = 0; i < stationCap('stove', L); i++) fur.push({ t: stove, x: size - 1 - i, y: 0, d: 1 });
  for (let i = 0; i < stationCap('oven', L); i++) fur.push({ t: 'oven_basic', x: size - 1 - i, y: 2, d: 1 });
  for (let i = 0; i < stationCap('bar', L); i++) fur.push({ t: 'bar_counter', x: 1 + i * 2, y: 0, d: 1 });
  fur.push({ t: 'cashier', x: 5, y: 0, d: 1 });
  for (let i = 0; i < tables; i++) {
    const x = 2 + (i % 4) * 3, y = 3 + Math.floor(i / 4) * 2;
    fur.push({ t: 'table_oak', x, y, d: 1 }, { t: 'chair_oak', x: x - 1, y, d: 0 }, { t: 'chair_oak', x: x + 1, y, d: 2 });
  }
  if (L >= 2) fur.push({ t: 'toilet', x: 0, y: size - 1, d: 1, ba: 8 });
  if (L >= 4) fur.push({ t: L >= 6 ? 'arcade_sky' : 'arcade_pink', x: 1, y: size - 1, d: 1, ba: 8 });
  // the team: a barista per espresso machine, a baker when there is an oven, a cleaner, servers for the rest
  const slots = staffSlots(L), team = [];
  const xp = Math.min(480, 30 * L);
  const add = (role) => { if (team.length < slots) team.push({ role, look: { model: UNIQUE_MODELS[team.length] }, energy: 100, skills: { [role]: xp } }); };
  add('waiter'); add('chef');
  for (let i = 1; i < stationCap('stove', L); i++) add('chef');
  if (stationCap('oven', L) && stationCap('bar', L)) add('bartender');
  if (L >= 3) add('cleaner');
  while (team.length < slots) add('waiter');
  // the menu: as many unlocked dishes as the slots take, studied to a level below the cap
  const slotsBy = menuSlots(L), dishes = {}, used = {};
  for (const d of DISHES) {
    const on = d.level <= L && (used[d.cat] || 0) < slotsBy[d.cat];
    if (on) used[d.cat] = (used[d.cat] || 0) + 1;
    dishes[d.id] = { lv: Math.max(1, dishCap(L) - 1), on };
  }
  const fl = Array.from({ length: size }, () => Array(size).fill('fl_oak'));
  return {
    v: 1, savedAt: 0,
    state: { coins: 5000, points: 0, rating: Math.min(4.7, 2.8 + 0.08 * L), service: [], round: 0, clock: 0, tz: 0, dishes, inv: { beans: 9, milk: 9, sugar: 9 }, opened: {}, snacks: { cookie: 4 }, totals: {}, settings: { autoRestock: true }, wallDeco: [] },
    world: { size, floors: fl, wallpaper: 'wp_cream', furniture: fur, trash: [] },
    meta: { seats: tables * 2 },
    staff: team,
  };
}

const perDay = [];
for (let L = 1; L <= LEVELS; L++) {
  const away = awayHours(L), save = cafe(L);
  const r = settleOffline(save, away * 3600, 1, { capHours: away, minSeconds: 0 });
  const hourly = r.report.points / away;
  const day = r.report.points + hourly / OFFLINE.efficiency + 3 * dailyPoints(DAILY.goal, L);
  perDay[L] = day;
}
const pts = [...EARLY];
let total = 0;
const rows = [];
for (let L = 1; L <= LEVELS; L++) {
  if (L >= 6) {
    const gap = daysFor(L) * perDay[L];
    const round = gap < 5000 ? 50 : gap < 20000 ? 100 : 500;
    pts[L + 1] = pts[L] + Math.round(gap / round) * round;
  }
  if (L < LEVELS) {
    const days = (pts[L + 1] - pts[L]) / perDay[L];
    total += days;
    rows.push(`Lv${String(L).padStart(2)} → ${String(L + 1).padStart(2)}  ${String(Math.round(perDay[L])).padStart(6)} pts/day  gap ${String(pts[L + 1] - pts[L]).padStart(7)}  ${days.toFixed(1).padStart(5)} days  (total ${total.toFixed(1)})`);
  }
}
console.log(rows.join('\n'));
console.log(`\nLv${LEVELS} after about ${Math.round(total)} days\n`);
console.log(`export const LEVEL_POINTS = [0, ${pts.slice(1, LEVELS + 1).join(', ')}];`);
