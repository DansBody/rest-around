// What the server lets a save gain while the game is being played. Playing is simulated on the player's
// machine, so the server cannot know what really happened in the café; what it can know is how much a café
// like this one could possibly have earned in the wall-clock time since the last save it accepted. Each
// upload is checked against that ceiling (see ONLINE.md, "上限檢查"):
//
//   - wealth: coins plus everything coins were turned into (furniture, floors, walls, room size, staff,
//     ingredients, snacks, accessories, dish upgrades, seeds). Buying only moves coins into things, selling loses half,
//     wages and rent burn coins; so wealth can only grow by trading, the daily goals and gift, the garden
//     and the odd Coin Shower. A crop in the garden counts as far as it has grown. Growth beyond the ceiling is taken back out of the coins.
//   - points (and so the level), the rating, the round counter and staff skill XP, each against its own ceiling.
//   - study vouchers: held plus spent on dish levels; they only come from the Today panel and level-ups.
//
// The ceiling is a throughput bound, not a replay: guests per second can never exceed what the café's
// stations, servers and seats could handle at full stretch, nor what walks in at a five-star rating at the
// busiest hour; each guest is counted at the dearest order with the biggest tip. It is meant to be generous
// (honest play should never touch it) yet tight enough that an edited save cannot do much.
//
// Pure, like offline.js: plain save JSON in, plain JSON out, so the same file runs in the browser and in the
// Supabase Edge Functions (Deno).
import {
  DAY, dishById, furnitureById, floorById, wallById, wallDecorById, EXPANSIONS, ROLES, ingById, ingPrice, snackById,
  SERVINGS_PER_UNIT, levelUpCost, dishPrice, dishPoints, EXTRA_CAT, SEEDS, gardenPlots, staffSlots, KITS, MAX_LEVEL,
  DAILY, dailyCoins, dailyPoints, studySpent, wearById, seatCap, stationCap, STATION_KINDS, STARTER, starterPaid, LEVEL_POINTS,
} from './data.js';
import { DIRS } from './iso.js';
import { MODEL, capacity, levelFor, arrivalsPerHour, SIM_SEC_PER_HOUR } from './offline.js';

export const CAP = {
  tolerance: 1.3,       // headroom on the throughput bound (active skills, rounding, a lucky streak)
  slackGuests: 3,       // plus this many of the dearest guests per upload, for the tiny windows
  gift: { coins: [20, 5], ingredients: 8 },   // the daily gift: [base, per level] coins and up to this many packs (goals: DAILY)
  xpPerGuest: 16,       // order + deliver + clear + cook + drink + sweep + a share of repairs
  ratingRate: 0.007,    // rating.js eases toward its target at this rate per sim second
  timeScale: 1,         // live play runs at 1 sim second per real second (the debug speed-up is off online)
};

const sum = (a, f) => a.reduce((x, y) => x + f(y), 0);
const dishCost = (id) => sum(dishById[id].ings, (i) => ingPrice(ingById[i]));

/** Coins plus what they were turned into, at purchase price. */
export function wealth(d) {
  const s = d.state, w = d.world;
  let v = s.coins || 0;
  for (const f of w.furniture || []) v += (furnitureById[f.t] || {}).price || 0;
  for (const col of w.floors || []) for (const id of col || []) if (id !== 'fl_oak') v += (floorById[id] || {}).price || 0;   // oak is what a new room comes with
  if (w.wallpaper && w.wallpaper !== 'wp_cream') v += ((wallById[w.wallpaper] || {}).price || 0) * (w.size * 2 - 1);
  for (const e of EXPANSIONS) if (e.size <= w.size || (s.expansion && e.size === s.expansion.size)) v += e.price;   // built, or paid for and being built
  for (const id of s.wallDeco || []) v += (wallDecorById[id] || {}).price || 0;
  for (const st of d.staff || []) v += (ROLES[st.role] || {}).hire || 0;
  for (const [id, n] of Object.entries(s.inv || {})) if (ingById[id]) v += ingPrice(ingById[id]) * n;
  for (const [id, n] of Object.entries(s.opened || {})) if (ingById[id]) v += ingPrice(ingById[id]) * n / SERVINGS_PER_UNIT;
  for (const [id, n] of Object.entries(s.snacks || {})) if (snackById[id]) v += snackById[id].price * n;
  for (const [id, n] of Object.entries(s.wardrobe || {})) if (wearById(id)) v += wearById(id).price * n;
  for (const [id, x] of Object.entries(s.dishes || {})) {
    const dish = dishById[id];
    if (!dish || !x) continue;
    for (let lv = 1; lv < (x.lv || 1); lv++) v += levelUpCost(lv) * dishCost(id);
    for (const [i, n] of Object.entries(x.prog || {})) if (ingById[i]) v += ingPrice(ingById[i]) * n;
  }
  for (const p of s.garden || []) {   // a crop in the ground is worth its seed, growing into its harvest
    const seed = p && p.crop && SEEDS.find((x) => x.crop === p.crop);
    if (seed) v += seed.price + Math.max(0, Math.min(1, p.prog || 0)) * (seed.yield * ingPrice(ingById[seed.crop]) - seed.price);
  }
  return v;
}

/** Seats (chairs facing a table: tables take one tile) and production stations of each kind, as the level caps count them. */
export function capacityCounts(d) {
  const f = (d.world.furniture || []).filter((x) => furnitureById[x.t]);
  const kind = (x) => furnitureById[x.t].kind;
  const tables = new Set(f.filter((x) => kind(x) === 'table').map((x) => x.x + ',' + x.y));
  const out = { seats: f.filter((x) => kind(x) === 'chair' && DIRS[x.d] && tables.has((x.x + DIRS[x.d].dx) + ',' + (x.y + DIRS[x.d].dy))).length };
  for (const k of STATION_KINDS) out[k] = f.filter((x) => kind(x) === k).length;
  return out;
}

/** Study vouchers held, plus those that went into dish levels. */
export function vouchers(d) {
  let v = d.state.vouchers || 0;
  for (const x of Object.values(d.state.dishes || {})) if (x) v += studySpent(x.lv || 1);
  return v;
}

/** The most guests per sim second this café could serve, and the most one guest can bring in. */
function throughput(d, level) {
  const w = d.world;
  const team = (d.staff || []).map((s) => ({ role: s.role, model: s.look && s.look.model, skills: s.skills || {} }));
  const furn = (w.furniture || []).filter((f) => furnitureById[f.t]).map((f) => ({ type: f.t, broken: false }));
  const kinds = (k) => (w.furniture || []).filter((f) => furnitureById[f.t] && furnitureById[f.t].kind === k).length;
  const seats = Math.min(kinds('chair'), kinds('table') * 2);   // never the client's own seat count
  const menu = Object.keys(d.state.dishes || {}).filter((id) => dishById[id] && d.state.dishes[id].on && dishById[id].level <= level);
  let rate = 0;
  for (const p of DAY.phases) {
    const c = capacity(team, furn, seats, menu, p, MODEL.maxDuty);
    const arrive = arrivalsPerHour(5, seats, p.mult) / SIM_SEC_PER_HOUR;
    rate = Math.max(rate, Math.min(c.drinks, c.service, c.seats, arrive));
  }
  const lvOf = (id) => (d.state.dishes[id] && d.state.dishes[id].lv) || 1;
  const best = (cat, f) => Math.max(0, ...menu.filter((id) => (dishById[id].cat === EXTRA_CAT) === cat).map((id) => f(dishById[id], lvOf(id))));
  const bill = best(false, dishPrice) + best(true, dishPrice);
  const bloom = team.some((s) => s.model === 'heehee') ? KITS.heehee.perks.find((p) => p.id === 'bloom').tip : 0;
  const tip = bill * MODEL.tipRate * 0.95 * (1 + bloom) * 2;   // × 2: Hee Hee's Spotlight doubles tips
  const fee = Math.max(0, ...(w.furniture || []).map((f) => (furnitureById[f.t] || {}).fee || 0));
  return { rate, coins: bill + tip + fee, points: best(false, dishPoints) + best(true, dishPoints), magic: team.some((s) => s.model === 'bbaekko') };
}

/** Rough shape check of an untrusted save before anything reads it: null when fine, else what is wrong. */
export function badShape(d) {
  const num = (v, lo, hi) => typeof v === 'number' && isFinite(v) && v >= lo && v <= hi;
  if (!d || typeof d !== 'object' || d.v !== 1) return 'version';
  const s = d.state, w = d.world;
  if (!s || typeof s !== 'object' || !w || typeof w !== 'object') return 'shape';
  if (!num(s.coins, 0, 1e9) || !num(s.points, 0, 1e9) || !num(s.rating, 0, 5) || !num(s.round || 0, 0, 1e7) || !num(s.tz || 0, -720, 840) || !num(s.vouchers || 0, 0, 1e6)) return 'numbers';
  if (![8, ...EXPANSIONS.map((e) => e.size)].includes(w.size)) return 'size';
  if (!Array.isArray(w.furniture) || w.furniture.length > w.size * w.size || !Array.isArray(w.floors)) return 'world';
  if (!Array.isArray(d.staff) || d.staff.length > 8) return 'staff';
  for (const o of [s.inv, s.opened, s.snacks]) if (o && Object.values(o).some((n) => !num(n, 0, 1e6))) return 'inventory';
  return null;
}

/**
 * Checks an uploaded save against the last accepted one.
 * @param prev    the save the server accepted last (trusted)
 * @param next    the save just uploaded (untrusted)
 * @param wallSec real seconds between the two, by the server's clock
 * @returns { reject, flags, data, claimed, allowed }: `reject` means the upload cannot be repaired and the
 *          server keeps `prev`; otherwise `data` is `next` with any excess taken back (flags say what).
 */
export function capCheck(prev, next, wallSec) {
  const flags = [];
  const reject = (why) => ({ reject: true, flags: [why], data: null });
  const bad = badShape(next);
  if (bad) return reject('shape:' + bad);
  const sim = Math.max(0, wallSec) * CAP.timeScale;
  const lvPrev = levelFor(prev.state.points || 0);
  const level = Math.min(MAX_LEVEL, lvPrev + 1);   // one level-up within an upload at most counts toward the bonuses

  // the round counter follows the wall clock: a round takes DAY.round seconds (moving time zones shifts it by up to 13)
  const prevRound = prev.state.round || 0, roundStep = (next.state.round || 0) - prevRound;
  const tzMoved = (next.state.tz || 0) !== (prev.state.tz || 0);
  if (prevRound && roundStep > Math.ceil(sim / DAY.round) + 1 + (tzMoved ? 13 : 0)) return reject('rounds');
  if ((next.staff || []).length > staffSlots(levelFor(next.state.points || 0))) return reject('staff');

  // seats and stations the level caps: a room over its caps (from before them) may keep what it has, not add more
  const lvNext = levelFor(next.state.points || 0), cn = capacityCounts(next), cp = capacityCounts(prev);
  if (cn.seats > seatCap(lvNext) && cn.seats > cp.seats) return reject('seats');
  for (const k of STATION_KINDS) if (cn[k] > stationCap(k, lvNext) && cn[k] > cp[k]) return reject('stations');

  // floor plans are built in real time (Build.expand): the room only grows once the server's clock passed the
  // finish time of the expansion it already knew about; a new one can't be dated before the last accepted save
  const slack = 120 * 1000, prevAt = prev.savedAt || 0, nowAt = prevAt + Math.max(0, wallSec) * 1000;
  const px = prev.state.expansion, nx = next.state.expansion;
  if (next.world.size > prev.world.size && !(px && px.size === next.world.size && px.end <= nowAt + slack)) return reject('expansion');
  if (nx && !(px && px.size === nx.size)) {
    const e = EXPANSIONS.find((x) => x.size === nx.size), ms = e ? e.hours * 3600 * 1000 : 0;
    if (!e || e.level > level || Math.abs(nx.end - nx.start - ms) > 2000 || nx.end < prevAt + ms - slack) return reject('expansion');
  }
  if (nx && px && px.size === nx.size && nx.end < px.end) return reject('expansion');   // no shortening the work

  // what this café could have earned: the better of the layout it had and the one it has now
  const tp = [throughput(prev, level), throughput(next, level)];
  const rate = Math.max(tp[0].rate, tp[1].rate);
  const perGuest = Math.max(tp[0].coins, tp[1].coins), ptsGuest = Math.max(tp[0].points, tp[1].points);
  const guests = rate * sim * CAP.tolerance + CAP.slackGuests;
  // the daily goals (three and a chest) and the daily gift come once per calendar day: count the days in this
  // window, plus today's if something was claimed in it
  const days = Math.floor(sim / 86400) + (tzMoved ? 1 : 0);
  const claims = (d) => { const x = d.state.daily; return x ? { day: x.day, n: (x.goals || []).filter((q) => q && q.claimed).length + (x.chest ? 1 : 0) } : { day: 0, n: 0 }; };
  const pc = claims(prev), nc = claims(next);
  const claimDays = days + ((nc.day !== pc.day ? nc.n : nc.n - pc.n) > 0 ? 1 : 0);
  const gifts = (next.state.giftDay || 0) !== (prev.state.giftDay || 0) ? days + 1 : 0;
  const b = CAP.gift;
  const garden = gardenPlots(level) * Math.max(...SEEDS.map((s) => s.yield * ingPrice(ingById[s.crop]) / s.grow)) * sim;
  const coinShower = tp.some((t) => t.magic) ? (Math.floor(sim / KITS.bbaekko.active.cooldown) + 1) * (12 + 5 * level) : 0;
  const maxIng = Math.max(...Object.values(ingById).map(ingPrice));
  // getting-started steps claimed in this window (the step never goes back, so each pays once)
  const si = (d) => { const x = d.state.starter; return x && typeof x === 'object' ? Math.max(0, Math.min(STARTER.length, Math.floor(+x.i || 0))) : (d.state.points || 0) >= LEVEL_POINTS[3] ? STARTER.length : 0; };
  const s0 = si(prev), starter = starterPaid(s0, Math.max(s0, si(next)));
  const allowedWealth = guests * perGuest + garden + coinShower + starter.coins
    + claimDays * (DAILY.goals * dailyCoins(DAILY.goal, level) + dailyCoins(DAILY.chest, level))
    + gifts * (b.coins[0] + b.coins[1] * level + b.ingredients * maxIng);

  let dishPts = 0;
  for (const [id, x] of Object.entries(next.state.dishes || {})) {
    const from = ((prev.state.dishes || {})[id] || {}).lv || 1;
    for (let lv = from + 1; lv <= ((x && x.lv) || 1); lv++) dishPts += lv * 6;
  }
  const allowedPoints = guests * ptsGuest + claimDays * DAILY.goals * dailyPoints(DAILY.goal, level) + dishPts + starter.points;

  const out = JSON.parse(JSON.stringify(next));
  const st = out.state;
  if (si(next) < s0) { st.starter = { i: s0, prog: 0 }; flags.push('starter'); }
  const claimedWealth = wealth(next) - wealth(prev);
  const claimedPoints = (next.state.points || 0) - (prev.state.points || 0);

  if (claimedWealth > allowedWealth) {
    const excess = Math.ceil(claimedWealth - allowedWealth);
    if (excess > (st.coins || 0)) return reject('wealth');   // things that were never paid for: nothing to take back
    st.coins -= excess;
    flags.push('wealth');
  }
  if (claimedPoints > allowedPoints) { st.points = (prev.state.points || 0) + Math.floor(allowedPoints); flags.push('points'); }
  if (claimedPoints < 0) { st.points = prev.state.points || 0; flags.push('points'); }   // points never go down

  // vouchers: the goals and the chest, the 7th gift in a row, and every level gained (by the points allowed above)
  const levels = Math.max(0, levelFor(st.points || 0) - lvPrev);
  const allowedVouchers = claimDays * (DAILY.goals * DAILY.goal.vouchers + DAILY.chest.vouchers) + (gifts ? Math.ceil(gifts / DAILY.streakDays) * DAILY.streakVouchers : 0)
    + levels * DAILY.levelUpVouchers;
  const claimedVouchers = vouchers(next) - vouchers(prev);
  if (claimedVouchers > allowedVouchers) {
    const excess = claimedVouchers - allowedVouchers;
    if (excess > (st.vouchers || 0)) return reject('vouchers');   // dish levels nobody paid for
    st.vouchers -= excess;
    flags.push('vouchers');
  }

  const maxDrift = 5 * (1 - Math.exp(-CAP.ratingRate * sim)) + 0.05;
  const r0 = prev.state.rating || 0;
  if (Math.abs((st.rating || 0) - r0) > maxDrift) { st.rating = Math.max(0, Math.min(5, r0 + Math.sign(st.rating - r0) * maxDrift)); flags.push('rating'); }

  const xpOf = (d) => sum(d.staff || [], (s) => sum(Object.values(s.skills || {}), (v) => v || 0));
  if (xpOf(next) - xpOf(prev) > guests * CAP.xpPerGuest) {
    const before = Object.fromEntries((prev.staff || []).map((s) => [s.look && s.look.model, s.skills || {}]));
    for (const s of out.staff || []) s.skills = { ...(before[s.look && s.look.model] || {}) };
    flags.push('xp');
  }

  return {
    reject: false, flags, data: out,
    claimed: { wealth: Math.round(claimedWealth), points: claimedPoints },
    allowed: { wealth: Math.round(allowedWealth), points: Math.floor(allowedPoints), guests: +guests.toFixed(1) },
  };
}

/** A brand-new café (what "Reset game" uploads): nothing earned yet, no more than a new game starts with. */
export const FRESH_WEALTH = 1500;   // a new game is worth well under it (200 coins + the bare starter room, team and pantry)
export function isFreshSave(d) {
  return !badShape(d) && d.state.points === 0 && wealth(d) <= FRESH_WEALTH;
}
