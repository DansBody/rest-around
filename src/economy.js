// Economy & progression: coins, café points, levels, dish leveling via ingredients, market,
// garden plots, daily gift, staff hiring/snacks, facility breakage & repair.
import {
  LEVEL_POINTS, MAX_LEVEL, DISHES, dishById, levelUpCost, MAX_DISH_LEVEL, ingById, INGREDIENTS, SEEDS, WATER_DURATION,
  snackById, ROLES, DISH_CATS, staffSlots, menuSlots, gardenPlots, furnitureById, EXPANSIONS, SKILL,
  EXTRA_CAT, QUESTS, questById, WALL_DECOR, wallDecorById, wallSlots, wallLayout,
  staffWage, rentFor, ingPrice,
} from './data.js';
import * as pantry from './pantry.js';
import { DOOR_Y } from './world.js';
import { makeStaff } from './staff.js';
import { nextCast } from './looks.js';
import { t } from './i18n.js';
import { bus, choice, randInt, clamp } from './util.js';

/** What reaching `level` opens up, as readable lines (also used by the welcome-back report). */
export function unlocksFor(level) {
  const unlocks = [], prev = level - 1;
  if (staffSlots(level) > staffSlots(prev)) unlocks.push(t('{n} staff slots', { n: staffSlots(level) }));
  const m = menuSlots(level), before = menuSlots(prev);
  for (const k of Object.keys(m)) if (m[k] > before[k]) unlocks.push(t('+1 {cat} menu slot', { cat: DISH_CATS.find((c) => c.id === k).name }));
  if (gardenPlots(level) > gardenPlots(prev)) unlocks.push(t('a new garden plot'));
  for (const d of DISHES) if (d.level === level) unlocks.push(t('dish: {name}', { name: d.name }));
  for (const f of Object.values(furnitureById)) if (f.level === level) unlocks.push(f.name);
  for (const w of WALL_DECOR) if (w.level === level) unlocks.push(w.name);
  for (const e of EXPANSIONS) if (e.level === level) unlocks.push(t('{n}×{n} floor plan', { n: e.size }));
  return unlocks;
}

export class Economy {
  constructor(game) { this.game = game; this.restockT = 0; }
  get s() { return this.game.state; }

  // ---------------- money & points ----------------
  earn(coins, points, tx, ty, lift = 110) {
    const g = this.game, s = this.s;
    if (coins > 0) { this.questProgress('coins', coins); s.coins += coins; s.stats.coins += coins; s.totals.coins += coins; g.floatText(tx, ty, '+' + coins, 'icon_coin', '#ffe27a', lift); g.sfx('coin'); }
    if (points > 0) { g.floatText(tx, ty, '+' + points, 'icon_points', '#bfe6ff', lift - 30); this.addPoints(points); }
    g.changed('coins');
  }
  canAfford(n) { return this.s.coins >= n; }
  spend(n, what = '') {
    if (n <= 0) return true;
    if (this.s.coins < n) { this.game.toast(what ? t('Not enough coins for {what} (need {n})', { what, n }) : t('Not enough coins (need {n})', { n }), 'bad'); this.game.sfx('error'); return false; }
    this.s.coins -= n;
    if (this.s.stats) this.s.stats.spent += n;
    this.game.changed('coins');
    return true;
  }
  addPoints(n) {
    const s = this.s;
    s.points += n;
    if (s.stats) s.stats.points += n;
    while (s.level < MAX_LEVEL && s.points >= LEVEL_POINTS[s.level + 1]) this.levelUp();
    this.game.changed('points');
  }
  levelProgress(points = this.s.points, level = this.s.level) {
    if (level >= MAX_LEVEL) return { cur: points, next: points, frac: 1 };
    const a = LEVEL_POINTS[level], b = LEVEL_POINTS[level + 1];
    return { cur: Math.max(0, points - a), next: b - a, frac: clamp((points - a) / (b - a), 0, 1) };
  }
  levelUp() {
    const s = this.s, g = this.game;
    s.level++;
    this.syncGarden();
    bus.emit('levelUp', { level: s.level, unlocks: unlocksFor(s.level) });
    g.sfx('levelup');
    g.fx.sparkle(g.at(g.world.size / 2, g.world.size / 2, 60), 30, '#ffd86b');
  }

  // ---------------- daily goal ----------------
  /** A fresh goal for the day (never the same kind twice in a row). */
  rollQuest() {
    const s = this.s, prev = s.quest && s.quest.id;
    const g = this.game, canBake = g.world.byKind('bar').length && g.staff.some((a) => a.role === 'bartender');
    const q = choice(QUESTS.filter((x) => x.id !== prev && (x.id !== 'bakes' || canBake)));
    let target = Math.max(2, Math.round(q.base + q.perLevel * s.level));
    if (q.id === 'coins') target = Math.round(target / 5) * 5;
    s.quest = { id: q.id, target, prog: 0, done: false };
    this.game.changed('quest');
  }
  questReward() { return { coins: 25 + this.s.level * 10, points: 6 + this.s.level * 3 }; }
  questProgress(kind, n = 1) {
    const q = this.s.quest;
    if (!q || q.done || q.id !== kind || n <= 0) return;
    q.prog = Math.min(q.target, q.prog + n);
    this.game.changed('quest');
    if (q.prog < q.target) return;
    q.done = true;
    const r = this.questReward(), g = this.game, s = this.s;
    s.coins += r.coins; s.stats.coins += r.coins; s.totals.coins += r.coins;
    g.toast(t('Daily goal complete! +{c} coins, +{p} points', { c: r.coins, p: r.points }), 'good');
    g.sfx('levelup');
    g.fx.sparkle(g.at(g.world.size / 2, g.world.size / 2, 60), 18, '#ffd86b');
    this.addPoints(r.points);
    g.changed('coins');
  }

  // ---------------- wall decorations ----------------
  wallSlotCount() { return wallSlots(this.game.world.size, DOOR_Y).length; }
  /** Pin every hung piece to where it shows now, so placing one never shuffles the others. */
  freezeWallLayout() {
    const s = this.s;
    s.wallPos = { ...wallLayout(this.game.world.size, DOOR_Y, s.wallDeco, s.wallPos) };
  }
  /** Buy a wall piece and hang it at `pos` ({ side, a }); without a spot it takes the next free slot. */
  buyWallDecor(id, pos = null) {
    const s = this.s, w = wallDecorById[id], g = this.game;
    if (!w || s.wallDeco.includes(id)) return false;
    if (w.level > s.level) { g.toast(t('{name} unlocks at level {n}', { name: w.name, n: w.level }), 'bad'); return false; }
    if (!pos && s.wallDeco.length >= this.wallSlotCount()) { g.toast(t('The walls are full — expand the café for more room!'), 'bad'); return false; }
    if (!this.spend(w.price, w.name)) return false;
    this.freezeWallLayout();
    s.wallDeco.push(id);
    if (pos) s.wallPos[id] = { side: pos.side, a: pos.a };
    g.sfx('place');
    g.rating.recompute();
    g.changed('wall');
    return true;
  }
  moveWallDecor(id, pos) {
    const s = this.s;
    if (!s.wallDeco.includes(id)) return;
    this.freezeWallLayout();
    s.wallPos[id] = { side: pos.side, a: pos.a };
    this.game.sfx('place');
    this.game.changed('wall');
  }
  sellWallDecor(id) {
    const s = this.s, w = wallDecorById[id], g = this.game;
    if (!w || !s.wallDeco.includes(id)) return;
    this.freezeWallLayout();
    s.wallDeco = s.wallDeco.filter((x) => x !== id);
    delete s.wallPos[id];
    s.coins += Math.floor(w.price * 0.5);
    g.sfx('coin');
    g.toast(t('Sold {name} (+{n})', { name: w.name, n: Math.floor(w.price * 0.5) }));
    g.rating.recompute();
    g.changed('wall'); g.changed('coins');
  }

  // ---------------- dishes ----------------
  dishUnlocked(id) { return dishById[id].level <= this.s.level; }
  menuCount(cat) { return Object.keys(this.s.dishes).filter((id) => this.s.dishes[id].on && dishById[id].cat === cat && this.dishUnlocked(id)).length; }
  toggleMenu(id) {
    const s = this.s, d = dishById[id], st = s.dishes[id];
    if (!this.dishUnlocked(id)) return this.game.toast(t('{name} unlocks at level {n}', { name: d.name, n: d.level }), 'bad');
    if (st.on) {
      const foods = Object.keys(s.dishes).filter((k) => s.dishes[k].on && dishById[k].cat !== EXTRA_CAT && this.dishUnlocked(k));
      if (d.cat !== EXTRA_CAT && foods.length <= 1) return this.game.toast(t('Keep at least one dish on the menu!'), 'bad');
      st.on = false;
    } else {
      if (this.menuCount(d.cat) >= menuSlots(s.level)[d.cat]) return this.game.toast(t('No free {cat} slots — take a dish off first or level up', { cat: DISH_CATS.find((c) => c.id === d.cat).name }), 'bad');
      st.on = true;
    }
    this.game.sfx('click');
    this.game.changed('menu');
  }
  /** Put ingredients from the pantry into a dish; levels it up when the recipe is complete. */
  contribute(id) {
    const s = this.s, d = dishById[id], st = s.dishes[id], g = this.game;
    if (!this.dishUnlocked(id)) return;
    if (st.lv >= MAX_DISH_LEVEL) return g.toast(t('{name} is already max level!', { name: d.name }));
    const need = levelUpCost(st.lv);
    let moved = 0;
    for (const ing of d.ings) {
      const have = s.inv[ing] || 0, cur = st.prog[ing] || 0;
      const n = Math.min(have, need - cur);
      if (n > 0) { s.inv[ing] = have - n; st.prog[ing] = cur + n; moved += n; }
    }
    if (!moved) { g.toast(t('No matching ingredients in the pantry'), 'bad'); g.sfx('error'); return; }
    if (d.ings.every((i) => (st.prog[i] || 0) >= need)) {
      st.lv++; st.prog = {};
      this.addPoints(st.lv * 6);
      g.toast(t('{name} reached Lv{n}! Price and points up.', { name: d.name, n: st.lv }), 'good');
      g.sfx('levelup');
    } else g.sfx('pop');
    g.changed('menu');
  }

  // ---------------- pantry: ingredients are used up as drinks are made (rules live in pantry.js) ----------------
  servings(ing) { return pantry.servings(this.s, ing); }
  canMake(id) { return pantry.canMake(this.s, id); }
  canMakeCount(id) { return pantry.canMakeCount(this.s, id); }
  /** Use one serving of every ingredient in the recipe. False (and nothing used) when something is missing. */
  consume(id) {
    if (!pantry.consume(this.s, id)) return false;
    this.game.changed('inv');
    return true;
  }
  restockBudget() { return pantry.restockBudget(this.s.level); }
  /** Top up the ingredients on the menu from the market, within today's budget. Returns the coins spent. */
  autoRestock() {
    const s = this.s;
    if (!s.settings.autoRestock || !s.stats) return 0;
    const spent = pantry.restock(s, s.stats);
    if (spent) { this.game.changed('inv'); this.game.changed('coins'); }
    return spent;
  }

  // ---------------- daily costs ----------------
  dailyWages() { return this.game.staff.reduce((a, st) => a + staffWage(st.role, st.skillLv()), 0); }
  dailyRent() { return rentFor(this.game.world.size); }
  /** Close the books for the day: pay the team and the landlord as far as the till allows. */
  payDay() {
    const s = this.s, wages = this.dailyWages(), rent = this.dailyRent();
    const w = Math.min(s.coins, wages);
    const r = Math.min(s.coins - w, rent);
    s.coins -= w + r;
    s.stats.wages = w; s.stats.rent = r; s.stats.spent += w + r;
    s.unpaid = w < wages;
    this.game.changed('coins');
    return { wages: w, rent: r, owed: wages + rent - w - r };
  }

  // ---------------- market ----------------
  ingredientPrice(id) { return ingPrice(ingById[id]); }
  ingredientAvailable(id) { const i = ingById[id]; return !i.level || i.level <= this.s.level; }
  buyIngredient(id, qty = 1) {
    if (!this.ingredientAvailable(id)) return;
    const cost = this.ingredientPrice(id) * qty;
    if (!this.spend(cost, ingById[id].name)) return;
    this.s.inv[id] = (this.s.inv[id] || 0) + qty;
    this.game.sfx('coin');
    this.game.changed('inv');
  }
  buySnack(id, qty = 1) {
    const sn = snackById[id];
    if (!this.spend(sn.price * qty, sn.name)) return false;
    this.s.snacks[id] = (this.s.snacks[id] || 0) + qty;
    this.game.sfx('coin');
    this.game.changed('inv');
    return true;
  }
  giftAvailable() { return this.s.giftDay < this.s.day; }
  claimGift() {
    const s = this.s, g = this.game;
    if (!this.giftAvailable()) return null;
    s.giftDay = s.day;
    const pool = INGREDIENTS.filter((i) => this.ingredientAvailable(i.id));
    const got = {};
    for (let i = 0; i < 4; i++) { const ing = choice(pool).id; got[ing] = (got[ing] || 0) + randInt(1, 2); }
    for (const [k, v] of Object.entries(got)) s.inv[k] = (s.inv[k] || 0) + v;
    const coins = 20 + s.level * 5;
    s.coins += coins;
    g.sfx('levelup');
    g.changed('inv');
    return { got, coins };
  }

  // ---------------- garden ----------------
  syncGarden() {
    const s = this.s;
    const n = gardenPlots(s.level);
    while (s.garden.length < n) s.garden.push({ crop: null, prog: 0, water: 0 });
  }
  seedFor(crop) { return SEEDS.find((x) => x.crop === crop); }
  plant(i, crop) {
    const p = this.s.garden[i], seed = this.seedFor(crop);
    if (!p || p.crop || !seed || seed.level > this.s.level) return;
    if (!this.spend(seed.price, 'seeds')) return;
    p.crop = crop; p.prog = 0; p.water = 1;
    this.game.sfx('pop');
    this.game.changed('garden');
  }
  water(i) {
    const p = this.s.garden[i];
    if (!p || !p.crop || p.prog >= 1) return;
    p.water = 1;
    this.game.sfx('water');
    this.game.changed('garden');
  }
  harvest(i) {
    const p = this.s.garden[i];
    if (!p || !p.crop || p.prog < 1) return null;
    const seed = this.seedFor(p.crop);
    this.s.inv[p.crop] = (this.s.inv[p.crop] || 0) + seed.yield;
    const r = { crop: p.crop, n: seed.yield };
    p.crop = null; p.prog = 0; p.water = 0;
    this.game.sfx('coin');
    this.game.changed('garden');
    return r;
  }

  // ---------------- staff ----------------
  hire(role) {
    const g = this.game, s = this.s;
    if (g.staff.length >= staffSlots(s.level)) return g.toast(t('All staff slots are full — level up for more'), 'bad');
    if (!nextCast(new Set(g.staff.map((a) => a.look.model)))) return g.toast(t('Every character is already on the team'), 'bad');
    if (!this.spend(ROLES[role].hire, t('hiring'))) return;
    const st = makeStaff(g, role);
    const e = g.world.entry;
    const spot = g.freeTileNear(e.x + 1, e.y) || e;
    g.addStaff(st, spot.x, spot.y);
    st.emote('emote_heart', 2); st.hop();
    g.toast(t('{name} the {role} joined the team!', { name: st.name, role: ROLES[role].name }), 'good');
    g.changed('staff');
    return st;
  }
  /** Retraining fee to move a staff member into `role` (free back into a role they're good at). */
  jobChangeFee(st, role) {
    if (role === st.role) return 0;
    return st.skillLv(role) >= SKILL.freeReturnLv ? 0 : Math.round(ROLES[role].hire * SKILL.changeFee);
  }
  changeJob(st, role) {
    const g = this.game;
    if (!ROLES[role] || role === st.role || !g.staff.includes(st)) return false;
    const fee = this.jobChangeFee(st, role);
    if (fee && !this.spend(fee, t('retraining'))) return false;
    const from = st.roleName;
    st.changeRole(role);
    g.sfx('levelup');
    g.toast(t('{name} retrained: {from} → {to}!', { name: st.name, from, to: st.roleName }), 'good');
    g.changed('staff');
    return true;
  }
  fire(st) {
    const g = this.game;
    if (st.job) st.abortJob();
    g.removeAgent(st);
    g.toast(t('{name} waved goodbye.', { name: st.name }));
    g.changed('staff');
  }
  feed(st, snackId) {
    const s = this.s, sn = snackById[snackId];
    if (!(s.snacks[snackId] > 0)) { if (!this.buySnack(snackId)) return; }
    s.snacks[snackId]--;
    st.feed(sn);
    this.game.sfx('eat');
    this.game.changed('staff');
  }

  // ---------------- facilities ----------------
  breakFacility(f) {
    const g = this.game;
    if (f.broken) return;
    f.broken = true;
    g.fx.puff(g.at(f.x + 0.5, f.y + 0.5, 60), '#bdb5ae', 6);
    g.sfx('break');
    g.toast(t('{name} broke down! A cleaner can fix it.', { name: furnitureById[f.type].name }), 'bad');
    g.changed('broken');
  }
  repairFacility(f) {
    const g = this.game, cat = furnitureById[f.type];
    f.broken = false; f.uses = 0;
    f.breakAt = randInt(cat.breakAfter[0], cat.breakAfter[1]);
    g.fx.sparkle(g.at(f.x + 0.5, f.y + 0.5, 60), 12, '#ffd86b');
    g.sfx('ding');
    g.changed('broken');
  }

  update(dt) {
    this.restockT -= dt;
    if (this.restockT <= 0) {
      this.restockT = 2;
      this.autoRestock();
      if (this.s.stats && pantry.rescue(this.s, this.s.stats)) { this.game.toast(t('The supplier dropped off a starter pack to get you going.'), 'good'); this.game.changed('inv'); }
    }
    // garden growth (sim time; pauses in build mode)
    for (const p of this.s.garden) {
      if (!p.crop || p.prog >= 1) continue;
      if (p.water > 0) {
        p.prog = Math.min(1, p.prog + dt / this.seedFor(p.crop).grow);
        p.water = Math.max(0, p.water - dt / WATER_DURATION);
      }
    }
  }
}
