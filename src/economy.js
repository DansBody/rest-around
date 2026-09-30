// Economy & progression: coins, gourmet points, levels, dish leveling via ingredients, market,
// garden plots, daily gift, staff hiring/snacks, facility breakage & repair.
import {
  LEVEL_POINTS, MAX_LEVEL, DISHES, dishById, levelUpCost, MAX_DISH_LEVEL, ingById, INGREDIENTS, SEEDS, WATER_DURATION,
  snackById, ROLES, staffSlots, menuSlots, gardenPlots, furnitureById, EXPANSIONS,
} from './data.js';
import { makeStaff } from './staff.js';
import { toScreen } from './iso.js';
import { bus, choice, randInt, clamp } from './util.js';

export class Economy {
  constructor(game) { this.game = game; }
  get s() { return this.game.state; }

  // ---------------- money & points ----------------
  earn(coins, points, tx, ty, lift = 110) {
    const g = this.game, s = this.s;
    if (coins > 0) { s.coins += coins; s.stats.coins += coins; s.totals.coins += coins; g.floatText(tx, ty, '+' + coins, 'icon_coin', '#ffe27a', lift); g.sfx('coin'); }
    if (points > 0) { g.floatText(tx, ty, '+' + points, 'icon_points', '#bfe6ff', lift - 30); this.addPoints(points); }
    g.changed('coins');
  }
  canAfford(n) { return this.s.coins >= n; }
  spend(n, what = '') {
    if (n <= 0) return true;
    if (this.s.coins < n) { this.game.toast(`Not enough coins${what ? ' for ' + what : ''} (need ${n})`, 'bad'); this.game.sfx('error'); return false; }
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
    return { cur: points - a, next: b - a, frac: clamp((points - a) / (b - a), 0, 1) };
  }
  levelUp() {
    const s = this.s, g = this.game;
    const before = { staff: staffSlots(s.level), menu: menuSlots(s.level), plots: gardenPlots(s.level) };
    s.level++;
    const unlocks = [];
    if (staffSlots(s.level) > before.staff) unlocks.push(`${staffSlots(s.level)} staff slots`);
    const m = menuSlots(s.level);
    for (const k of Object.keys(m)) if (m[k] > before.menu[k]) unlocks.push(`+1 ${k} menu slot`);
    if (gardenPlots(s.level) > before.plots) unlocks.push('a new garden plot');
    for (const d of DISHES) if (d.level === s.level) unlocks.push(`dish: ${d.name}`);
    for (const f of Object.values(furnitureById)) if (f.level === s.level) unlocks.push(f.name);
    for (const e of EXPANSIONS) if (e.level === s.level) unlocks.push(`${e.size}×${e.size} floor plan`);
    this.syncGarden();
    bus.emit('levelUp', { level: s.level, unlocks });
    g.sfx('levelup');
    const c = toScreen(g.world.size / 2, g.world.size / 2);
    g.fx.sparkle(c.x, c.y - 60, 30, '#ffd86b');
  }

  // ---------------- dishes ----------------
  dishUnlocked(id) { return dishById[id].level <= this.s.level; }
  menuCount(cat) { return Object.keys(this.s.dishes).filter((id) => this.s.dishes[id].on && dishById[id].cat === cat && this.dishUnlocked(id)).length; }
  toggleMenu(id) {
    const s = this.s, d = dishById[id], st = s.dishes[id];
    if (!this.dishUnlocked(id)) return this.game.toast(`${d.name} unlocks at level ${d.level}`, 'bad');
    if (st.on) {
      const foods = Object.keys(s.dishes).filter((k) => s.dishes[k].on && dishById[k].cat !== 'drink' && this.dishUnlocked(k));
      if (d.cat !== 'drink' && foods.length <= 1) return this.game.toast('Keep at least one dish on the menu!', 'bad');
      st.on = false;
    } else {
      if (this.menuCount(d.cat) >= menuSlots(s.level)[d.cat]) return this.game.toast(`No free ${d.cat} slots — take a dish off first or level up`, 'bad');
      st.on = true;
    }
    this.game.sfx('click');
    this.game.changed('menu');
  }
  /** Put ingredients from the pantry into a dish; levels it up when the recipe is complete. */
  contribute(id) {
    const s = this.s, d = dishById[id], st = s.dishes[id], g = this.game;
    if (!this.dishUnlocked(id)) return;
    if (st.lv >= MAX_DISH_LEVEL) return g.toast(`${d.name} is already max level!`);
    const need = levelUpCost(st.lv);
    let moved = 0;
    for (const ing of d.ings) {
      const have = s.inv[ing] || 0, cur = st.prog[ing] || 0;
      const n = Math.min(have, need - cur);
      if (n > 0) { s.inv[ing] = have - n; st.prog[ing] = cur + n; moved += n; }
    }
    if (!moved) { g.toast('No matching ingredients in the pantry', 'bad'); g.sfx('error'); return; }
    if (d.ings.every((i) => (st.prog[i] || 0) >= need)) {
      st.lv++; st.prog = {};
      this.addPoints(st.lv * 6);
      g.toast(`${d.name} reached Lv${st.lv}! Price and points up.`, 'good');
      g.sfx('levelup');
    } else g.sfx('pop');
    g.changed('menu');
  }

  // ---------------- market ----------------
  ingredientPrice(id) { const i = ingById[id]; return i.source === 'garden' ? Math.ceil(i.price * 1.8) : i.price; }
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
    if (g.staff.length >= staffSlots(s.level)) return g.toast('All staff slots are full — level up for more', 'bad');
    if (!this.spend(ROLES[role].hire, 'hiring')) return;
    const st = makeStaff(g, role);
    const e = g.world.entry;
    const t = g.freeTileNear(e.x + 1, e.y) || e;
    g.addStaff(st, t.x, t.y);
    st.emote('emote_heart', 2); st.hop();
    g.toast(`${st.name} the ${ROLES[role].name} joined the team!`, 'good');
    g.changed('staff');
    return st;
  }
  fire(st) {
    const g = this.game;
    if (st.job) st.abortJob();
    g.removeAgent(st);
    g.toast(`${st.name} waved goodbye.`);
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
    const c = toScreen(f.x + 0.5, f.y + 0.5);
    g.fx.puff(c.x, c.y - 60, '#bdb5ae', 6);
    g.sfx('break');
    g.toast(`${furnitureById[f.type].name} broke down! A cleaner can fix it.`, 'bad');
    g.changed('broken');
  }
  repairFacility(f) {
    const g = this.game, cat = furnitureById[f.type];
    f.broken = false; f.uses = 0;
    f.breakAt = randInt(cat.breakAfter[0], cat.breakAfter[1]);
    const c = toScreen(f.x + 0.5, f.y + 0.5);
    g.fx.sparkle(c.x, c.y - 60, 12, '#ffd86b');
    g.sfx('ding');
    g.changed('broken');
  }

  update(dt) {
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
