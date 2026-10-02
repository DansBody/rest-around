// Settling the time away. The café keeps trading while the game is closed: when the player comes back,
// `settleOffline` takes the last save and the time since, and returns the café as it would be now plus a
// report of what happened ("while you were away…").
//
// It is an expected-value model, not a replay: guests, brewing and cleaning are not simulated one by one.
// Per phase of the day it works out how many guests would walk in (the same arrival formula as the live
// game), how many the team could actually serve (stations, waiters, seats, and how long staff can work
// before they need a nap), then walks the served guests through the pantry one at a time, so ingredients
// run out, the market restocks and facilities wear exactly as they do live. The only randomness is a seeded
// generator, so the same save and the same time away always give the same result.
//
// Pure: depends only on data.js / rating.js / pantry.js and works on the plain save JSON (see save.js), so
// the same file can run in the browser now and on a server later.
import {
  DAY, OFFLINE, ENERGY, SKILL, skillLevel, KITS, ROLES, DISHES, dishById, furnitureById, floorById, wallById, wallDecorById,
  EXTRA_CAT, LEVEL_POINTS, MAX_LEVEL, snackById, SNACKS, staffWage, rentFor, dishPrice, dishPoints, COSTS, SEEDS,
} from './data.js';
import { RATING_WEIGHTS } from './rating.js';
import * as pantry from './pantry.js';

/** How the live café behaves, as numbers (measured against the real simulation, see tools/calibrate). */
export const MODEL = {
  stationOverhead: 3.8,    // seconds a station sits idle around each drink (hand-over to a waiter)
  stationWalk: 1.5,        // seconds of the barista's own time around each drink, besides brewing
  waiterSecPerGuest: 9.3,  // waiter work per guest at skill 1: take the order, carry it, clear the table
  seatSec: 31,             // how long a guest holds a seat: ordering, waiting, sipping, clearing
  cleanSecPerTrash: 7,     // cleaner work per piece of litter
  trashPerGuest: 0.3,      // afterMeal(): chance a guest leaves litter
  bakeChance: 0.55,        // takeOrder(): chance of a bake on the side
  toiletChance: 0.28, arcadeChance: 0.35,
  tipRate: 0.3,            // finishMeal(): tip = 30% of the bill × satisfaction
  lostWeight: 0.35,        // how much a guest the team could not get to weighs on the service rating (many just see a full house)
  maxDuty: 0.95,
};

const phaseTable = () => DAY.phases.map((p, i) => ({ ...p, to: i + 1 < DAY.phases.length ? DAY.phases[i + 1].from : DAY.lastCallHour }));
export const SIM_SEC_PER_HOUR = DAY.length / (DAY.endHour - DAY.startHour);

export const levelFor = (points) => { let lv = 1; while (lv < MAX_LEVEL && points >= LEVEL_POINTS[lv + 1]) lv++; return lv; };

function rngFrom(seed) {   // mulberry32
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Share of a day a staff member can actually spend working: drain while working vs. naps, snacks and the night's rest. */
export function dutyFor(snackEnergy = 0) {
  const L = DAY.length;
  return Math.min(MODEL.maxDuty, (ENERGY.overnight + ENERGY.napRegen * L + snackEnergy) / ((ENERGY.drainPerSec + ENERGY.napRegen) * L));
}

/** Work-speed multiplier of a staff member in a role at a point in the day (skill + the always-on kit perks). */
function workMul(st, role, phase, team) {
  let m = SKILL.mul[skillLevel(st.skills[role] || 0) - 1];
  const kit = KITS[st.model];
  if (kit) for (const p of kit.perks) {
    if (p.id === 'shy' && p.roles.includes(role)) m *= p.mul;
    if (p.id === 'night' && phase.from >= p.from) m *= p.mul;
    if (p.id === 'sprint' && role === 'waiter') m *= 1 + 0.6 * (p.speed - 1);   // walking is about 60% of a waiter's round
  }
  for (const o of team) if (o !== st && KITS[o.model] && KITS[o.model].perks.some((p) => p.id === 'aura')) m *= 1 + (KITS[o.model].perks.find((p) => p.id === 'aura').mul - 1) * 0.5;   // Caffeine Boost reaches about half the room
  return m;
}

const clampN = (v, a, b) => (v < a ? a : v > b ? b : v);
const sum = (a, f) => a.reduce((x, y) => x + f(y), 0);
const smoothMin = (a, b, k = 14) => (a <= 0 || b <= 0 ? 0 : Math.pow(Math.pow(a, -k) + Math.pow(b, -k), -1 / k));

/** What the team can do per sim-second in a phase, with a share `duty` of the time spent working. */
export function capacity(team, furn, seats, menu, phase, duty) {
  const foods = menu.filter((id) => dishById[id].cat !== EXTRA_CAT), bakes = menu.filter((id) => dishById[id].cat === EXTRA_CAT);
  const mean = (ids) => (ids.length ? sum(ids, (id) => dishById[id].cook) / ids.length : 0);
  const line = (role, kind, ids) => {
    const crew = team.filter((s) => s.role === role).map((s) => workMul(s, role, phase, team)).sort((a, b) => b - a);
    const st = furn.filter((f) => furnitureById[f.type].kind === kind && !f.broken).map((f) => furnitureById[f.type].speed || 1).sort((a, b) => b - a);
    let rate = 0;
    for (let i = 0; i < Math.min(crew.length, st.length); i++) {
      const c = mean(ids) / (st[i] * crew[i]);   // brewing time on this station by this barista
      rate += Math.min(1 / (c + MODEL.stationOverhead), duty / (c + MODEL.stationWalk));   // the station, or the barista's hours, whichever runs out first
    }
    return ids.length ? rate : 0;
  };
  const waiters = sum(team.filter((s) => s.role === 'waiter'), (s) => workMul(s, 'waiter', phase, team));
  return {
    drinks: line('chef', 'stove', foods),
    bakes: line('bartender', 'bar', bakes),
    service: (waiters / MODEL.waiterSecPerGuest) * duty,
    seats: seats / MODEL.seatSec,
  };
}

/** The 0–5 rating the café is heading toward (rating.js recompute(), from the same five parts). */
function ratingTarget(parts) {
  let t = 0;
  for (const k in RATING_WEIGHTS) t += RATING_WEIGHTS[k] * parts[k];
  return clampN(t * 5 + 0.35, 0, 5);
}

function decorScore(data) {
  let s = 0;
  for (const f of data.world.furniture) s += (furnitureById[f.t] || {}).decor || 0;
  const size = data.world.size;
  for (let x = 0; x < size; x++) for (let y = 0; y < size; y++) s += ((data.world.floors[x] && floorById[data.world.floors[x][y]]) || floorById.fl_oak).decor || 0;
  s += ((wallById[data.world.wallpaper] || wallById.wp_cream).decor || 0) * size * 2;
  for (const id of data.state.wallDeco || []) s += (wallDecorById[id] || {}).decor || 0;
  return s;
}

/**
 * @param data   a save, as written by save.js serialize() (not modified)
 * @param elapsedSec  seconds since it was saved
 * @param now    timestamp stamped on the result
 * @param opts   overrides of OFFLINE (minSeconds, capHours, hoursPerDay, efficiency), plus `seedBase`: the
 *               timestamp the dice are seeded from (default: the save's own savedAt; the server passes the
 *               time it last accepted the save, which the player cannot pick)
 * @returns null when the time away is too short to count, otherwise { data, report }
 */
export function settleOffline(data, elapsedSec, now = Date.now(), opts = {}) {
  const O = { ...OFFLINE, ...opts };
  if (!data || !data.state || !data.world || !(elapsedSec >= O.minSeconds)) return null;
  const out = JSON.parse(JSON.stringify(data));
  const st = out.state, wd = out.world;
  const capSec = O.capHours * 3600;
  const sec = Math.min(elapsedSec, capSec);
  const days = sec / (O.hoursPerDay * 3600);
  const rng = rngFrom(((opts.seedBase ?? data.savedAt ?? 0) ^ Math.floor(sec)) >>> 0);

  // ----- the working copy of the café -----
  const w = { coins: st.coins, level: levelFor(st.points), points: st.points, rating: st.rating, dishes: st.dishes, inv: st.inv || {}, opened: st.opened || {}, snacks: st.snacks || {} };
  const team = (out.staff || []).map((s) => ({ role: s.role, model: s.look && s.look.model, skills: s.skills || {}, ref: s }));
  const furn = wd.furniture.map((f) => ({ type: f.t, ref: f, get broken() { return !!f.b; }, set broken(v) { f.b = v; } }));
  const chairs = wd.furniture.filter((f) => furnitureById[f.t] && furnitureById[f.t].kind === 'chair').length;
  const tables = wd.furniture.filter((f) => furnitureById[f.t] && furnitureById[f.t].kind === 'table').length;
  const seats = out.meta && out.meta.seats != null ? out.meta.seats : Math.min(chairs, tables * 2);
  const area = wd.size * wd.size;
  const cleaners = team.filter((s) => s.role === 'cleaner');
  const hasHeeHee = team.some((s) => s.model === 'heehee');
  const restockOn = (st.settings || {}).autoRestock !== false;
  const bloom = hasHeeHee ? KITS.heehee.perks.find((p) => p.id === 'bloom') : null;

  const rep = {
    elapsedSec, usedSec: sec, capped: elapsedSec > capSec, days,
    served: 0, lost: 0, noSeat: 0, soldOut: 0, sales: 0, tips: 0, fees: 0, wages: 0, rent: 0, restock: 0, net: 0, points: 0,
    ratingFrom: st.rating, ratingTo: st.rating, levelFrom: w.level, levelTo: w.level,
    dishes: {}, phases: Object.fromEntries(DAY.phases.map((p) => [p.id, 0])), ranOut: [], broke: [], snacksUsed: 0, readyCrops: 0,
    unpaid: false, noStaff: !team.some((s) => s.role === 'waiter') || !team.some((s) => s.role === 'chef'),
  };
  const ranOut = new Set();
  const serviceLog = [];
  let trash = (wd.trash || []).length;
  const maxTrash = 1.5 + area / 22;
  const startCoins = w.coins;
  const partsNow = (service, trashNow) => {
    const menuNow = Object.keys(w.dishes).filter((id) => w.dishes[id].on && dishById[id].level <= w.level);
    return {
      service,
      clean: clampN(1 - trashNow / maxTrash, 0, 1),
      dishes: menuNow.length ? clampN(sum(menuNow, (id) => w.dishes[id].lv) / menuNow.length / 10, 0, 1) : 0,
      decor: clampN(decorScore(out) / (area * 0.55), 0, 1),
      repair: clampN(1 - furn.filter((x) => x.broken).length * 0.35, 0, 1),
    };
  };
  const sv0 = (st.service || []).length ? sum(st.service, (v) => v) / st.service.length : 0.6;
  let target = ratingTarget(partsNow(sv0, trash));   // where the rating is heading as the day opens

  for (let d = 0, left = days; left > 1e-6; d++, left -= 1) {
    const f = Math.min(1, left);                    // the share of a day this round covers
    const day = { restocked: 0, spent: 0 };
    const menu = Object.keys(w.dishes).filter((id) => w.dishes[id].on && dishById[id].level <= w.level);
    const phases = phaseTable();

    // staff only nap when they are worked hard: if guests would outrun the team, give everyone a snack
    let snackE = 0;
    const need = phases.some((p) => {
      const c = capacity(team, furn, seats, menu, p, dutyFor(0));
      const dem = demand(ratingAt(w.rating, target, p, f), seats, p, f, O.efficiency);
      return dem > 0.9 * Math.min(c.drinks, c.service, c.seats) * (p.to - p.from) * SIM_SEC_PER_HOUR * f;
    });
    if (need && team.length) {
      const stock = SNACKS.slice().sort((a, b) => a.energy - b.energy);
      for (let i = 0; i < team.length; i++) {
        const sn = stock.find((x) => (w.snacks[x.id] || 0) > 0);
        if (!sn) break;
        w.snacks[sn.id]--; snackE += sn.energy; rep.snacksUsed++;
      }
    }
    const duty = dutyFor(team.length ? snackE / team.length : 0);

    let servedDay = 0, lostDay = 0, soldDay = 0, carry = 0, trashMade = 0, seatLost = 0;
    const spans = [];   // per phase: guests whose visit counted toward the service rating, and their summed scores
    for (const p of phases) {
      const hours = (p.to - p.from) * f, secs = hours * SIM_SEC_PER_HOUR;
      const dem = demand(ratingAt(w.rating, target, p, f), seats, p, f, O.efficiency);
      const cap = capacity(team, furn, seats, menu, p, duty);
      const limit = Math.min(cap.drinks, cap.service, cap.seats) * (p.to - p.from) * SIM_SEC_PER_HOUR * f;
      const served = smoothMin(dem, limit);
      const staffLimit = Math.min(cap.drinks, cap.service) * secs, seatLimit = cap.seats * secs;
      const util = staffLimit > 0 ? dem / staffLimit : 9;   // guests turned away for want of a seat do not feel the service was slow
      const span = { n: 0, sum: 0 };
      spans.push(span);
      const sat = Math.max(0.3, Math.min(0.95, 0.95 - 0.5 * Math.max(0, util - 0.45)));
      const guestRate = served / Math.max(1, secs);
      const pBake = cap.bakes > 0 && menu.some((id) => dishById[id].cat === EXTRA_CAT) ? Math.min(MODEL.bakeChance, cap.bakes / Math.max(1e-6, guestRate)) : 0;
      const short = Math.max(0, dem - served);
      lostDay += short;
      if (seatLimit < staffLimit) seatLost += short; else span.n += short * MODEL.lostWeight;
      carry += served;
      const n = Math.floor(carry); carry -= n;
      for (let g = 0; g < n; g++) {
        if (restockOn) pantry.restock(w, day);
        let foods = menu.filter((id) => dishById[id].cat !== EXTRA_CAT && pantry.canMake(w, id));
        if (!foods.length && pantry.rescue(w, day)) { rep.rescued = true; foods = menu.filter((id) => dishById[id].cat !== EXTRA_CAT && pantry.canMake(w, id)); }
        if (!foods.length) {
          soldDay++;
          for (const id of menu) for (const i of dishById[id].ings) if (pantry.servings(w, i) < 1) ranOut.add(i);
          continue;
        }
        const food = foods[Math.floor(rng() * foods.length)];
        pantry.consume(w, food);
        const bakesOk = pBake > 0 ? menu.filter((id) => dishById[id].cat === EXTRA_CAT && pantry.canMake(w, id)) : [];
        const bake = bakesOk.length && rng() < pBake ? bakesOk[Math.floor(rng() * bakesOk.length)] : null;
        if (bake) pantry.consume(w, bake);
        let bill = 0;
        for (const id of bake ? [food, bake] : [food]) {
          const lv = w.dishes[id].lv;
          bill += dishPrice(dishById[id], lv); rep.points += dishPoints(dishById[id], lv); w.points += dishPoints(dishById[id], lv);
          rep.dishes[id] = (rep.dishes[id] || 0) + 1;
        }
        let tip = Math.round(bill * MODEL.tipRate * sat);
        if (bloom && sat >= bloom.min) tip = Math.round(tip * (1 + bloom.tip));
        w.coins += bill + tip; rep.sales += bill; rep.tips += tip;
        rep.served++; rep.phases[p.id]++; servedDay++;
        span.n++; span.sum += 0.55 + 0.45 * sat;
        if (rng() < MODEL.trashPerGuest) trashMade++;
        facilities(furn, rng, w, rep, cleaners.length > 0);
        w.level = levelFor(w.points);
      }
    }

    // litter: cleaners keep up with it as far as they have the hours for
    const cleanCap = sum(cleaners, (c) => workMul(c, 'cleaner', phases[1], team)) * duty * DAY.length * f / MODEL.cleanSecPerTrash;
    trash = Math.min(maxTrash, seats * 1.25, Math.max(0, trash + trashMade - cleanCap));   // litter lands on the few tiles beside the chairs, so it piles up only so far
    rep.lost += lostDay + soldDay; rep.soldOut += soldDay; rep.noSeat += seatLost;
    // the service rating is the average of the last 24 guests, so it reads the end of the day
    let sn = 0, ss = 0;
    for (let i = spans.length - 1; i >= 0 && sn < 24; i--) { sn += spans[i].n; ss += spans[i].sum; }
    const service = sn >= 3 ? ss / sn : (serviceLog.length ? serviceLog[serviceLog.length - 1] : sv0);   // a sliver of a day has no say
    serviceLog.push(service);

    // wages and rent for the day, as far as the till allows (nobody goes into debt)
    const closed = rep.noStaff;   // nobody could open the doors, so there was no payroll and the landlord let it slide
    const wages = closed ? 0 : Math.round(sum(team, (s) => staffWage(s.role, skillLevel(s.skills[s.role] || 0))) * f);
    const rent = closed ? 0 : Math.round(rentFor(wd.size) * f);
    const wPaid = Math.min(w.coins, wages), rPaid = Math.min(w.coins - wPaid, rent);
    w.coins -= wPaid + rPaid; rep.wages += wPaid; rep.rent += rPaid; rep.restock += day.restocked;
    if (wPaid < wages) rep.unpaid = true;

    // the rating drifts toward what the day earned
    rep.parts = partsNow(service, trash + (cleaners.length ? 0.04 * servedDay : 0));
    target = ratingTarget(rep.parts);
    w.rating += (target - w.rating) * (1 - Math.exp(-0.007 * DAY.length * f));
  }

  // ----- write the result back into the save -----
  rep.net = Math.round(w.coins - startCoins);
  rep.ratingTo = w.rating; rep.levelTo = w.level;
  rep.ranOut = [...ranOut];
  rep.lost = Math.round(rep.lost); rep.noSeat = Math.round(rep.noSeat);
  rep.broke = furn.filter((x) => x.broken).map((x) => x.type);
  st.coins = Math.max(0, Math.floor(w.coins)); st.points = Math.floor(w.points); st.rating = w.rating;
  st.service = serviceLog.length ? Array(24).fill(serviceLog[serviceLog.length - 1]) : st.service;
  st.inv = Object.fromEntries(Object.entries(w.inv).filter(([, n]) => n > 0));
  st.opened = Object.fromEntries(Object.entries(w.opened).filter(([, n]) => n > 0));
  st.snacks = Object.fromEntries(Object.entries(w.snacks).filter(([, n]) => n > 0));
  st.unpaid = false;
  const wholeDays = Math.floor(days + 1e-6);
  if (wholeDays >= 1) { st.day = (st.day || 1) + wholeDays; st.clock = 0; }
  st.totals = { ...(st.totals || {}), served: ((st.totals || {}).served || 0) + rep.served, lost: ((st.totals || {}).lost || 0) + rep.lost, coins: ((st.totals || {}).coins || 0) + rep.sales + rep.tips + rep.fees, days: ((st.totals || {}).days || 0) + wholeDays };
  for (const g of st.garden || []) if (g && g.crop && sec >= 600) { g.prog = 1; g.water = 0; rep.readyCrops++; }
  wd.dirty = [];
  const keep = Math.min((wd.trash || []).length, Math.round(trash));
  wd.trash = (wd.trash || []).slice(0, keep);
  wd.extraTrash = Math.max(0, Math.round(trash) - keep);
  // the team: rested while the café was shut, a little richer in skill, and grumpy if wages went unpaid
  const per = (role) => team.filter((s) => s.role === role);
  const give = (role, xp) => { const c = per(role); for (const s of c) s.ref.skills = { ...(s.ref.skills || {}), [role]: Math.floor(((s.ref.skills || {})[role] || 0) + xp / c.length) }; };
  give('waiter', rep.served * (SKILL.xp.order + SKILL.xp.deliver + SKILL.xp.clear));
  give('chef', rep.served * SKILL.xp.cook);
  give('bartender', Object.entries(rep.dishes).reduce((a, [id, n]) => a + (dishById[id].cat === EXTRA_CAT ? n : 0), 0) * SKILL.xp.drink);
  give('cleaner', Math.round(rep.served * MODEL.trashPerGuest) * SKILL.xp.sweep);
  for (const s of team) s.ref.energy = Math.max(10, Math.min(100, Math.round((s.ref.energy || 100) + sec * ENERGY.napRegen)) - (rep.unpaid ? COSTS.unpaidEnergy : 0));
  out.savedAt = now;
  rep.net = Math.round(st.coins - startCoins);
  rep.fees = Math.round(rep.fees);
  return { data: out, report: rep };
}


/** The rating part-way through a phase: it eases from where it started toward its target (rating.js update()). */
function ratingAt(r0, target, phase, f) {
  const t = ((phase.from + phase.to) / 2 - DAY.startHour) * SIM_SEC_PER_HOUR * f;
  return target + (r0 - target) * Math.exp(-0.007 * t);
}

/** Guests walking in during `phase` for `f` of a day (the live game's arrivalRate, times the away-from-keyboard discount). */
function demand(rating, seats, phase, f, efficiency) {
  return arrivalsPerHour(rating, seats, phase.mult) * (phase.to - phase.from) * f * efficiency;
}

/** Guests per in-game hour walking in (day.js arrivalRate). */
export const arrivalsPerHour = (rating, seats, mult) => (0.6 + rating * 0.78) * mult * (0.55 + 0.45 * Math.sqrt(Math.min(Math.max(1, seats), 24) / 4));

/** A guest's visit to the restroom or the reading nook after the meal, wearing the facility. */
function facilities(furn, rng, w, rep, cleaner) {
  const use = (kind, chance, fee) => {
    const usable = furn.filter((x) => furnitureById[x.type].kind === kind && !x.broken);
    if (!usable.length || rng() >= chance) return false;
    const f = usable[Math.floor(rng() * usable.length)];
    const cat = furnitureById[f.type];
    w.coins += cat.fee || fee; rep.fees += cat.fee || fee;
    f.ref.u = (f.ref.u || 0) + 1;
    const lim = f.ref.ba || Math.round((cat.breakAfter[0] + cat.breakAfter[1]) / 2);
    if (f.ref.u >= lim) {
      if (cleaner) { f.ref.u = 0; f.ref.ba = Math.round((cat.breakAfter[0] + cat.breakAfter[1]) / 2); }   // a cleaner fixes it again
      else { f.broken = true; }
    }
    return true;
  };
  if (!use('toilet', MODEL.toiletChance, 3)) use('arcade', MODEL.arcadeChance, 10);
}
