// Economy & progression: coins, café points, levels, dish leveling via ingredients, market,
// daily gift, staff hiring/snacks/training, facility breakage & repair.
import { SNACKS,
  LEVEL_POINTS, MAX_LEVEL, DISHES, dishById, levelUpCost, MAX_DISH_LEVEL, ingById, INGREDIENTS,
  snackById, ROLES, DISH_CATS, staffSlots, menuSlots, furnitureById, EXPANSIONS, SKILL, CLUBS, TROUBLE,
  EXTRA_CAT, QUESTS, questById, WALL_DECOR, wallDecorById, wallSlots, wallLayout,
  staffWage, rentFor, ingPrice, UNIQUE_MODELS, UNIQUE_NAMES, ROUND_SCALE, perRound,
  DAILY, dailyCoins, dailyPoints, studyCost, dishCap, wearById,
} from './data.js';
import * as pantry from './pantry.js';

const FEED_SLACK = 15;   // feeding the whole team skips anyone this close to full energy
import { DOOR_Y } from './world.js';
import { makeStaff } from './staff.js';
import { t } from './i18n.js';
import { choice, randInt, clamp } from './util.js';

/** What reaching `level` opens up, as readable lines (also used by the welcome-back report). */
export function unlocksFor(level) {
  const unlocks = [], prev = level - 1;
  if (staffSlots(level) > staffSlots(prev)) unlocks.push(t('{n} staff slots', { n: staffSlots(level) }));
  const m = menuSlots(level), before = menuSlots(prev);
  for (const k of Object.keys(m)) if (m[k] > before[k]) unlocks.push(t('+1 {cat} menu slot', { cat: DISH_CATS.find((c) => c.id === k).name }));
  if (TROUBLE.dash.level === level) unlocks.push(t('trouble: guests who dine and dash'));
  if (TROUBLE.rude.level === level) unlocks.push(t('trouble: rude guests'));
  for (const d of DISHES) if (d.level === level) unlocks.push(t('dish: {name}', { name: d.name }));
  for (const f of Object.values(furnitureById)) if (f.level === level) unlocks.push(f.name);
  for (const w of WALL_DECOR) if (w.level === level) unlocks.push(w.name);
  for (const e of EXPANSIONS) if (e.level === level) unlocks.push(t('{n}×{n} floor plan', { n: e.size }));
  if (dishCap(level) > dishCap(prev)) unlocks.push(t('drinks and bakes can be studied up to Lv{n}', { n: dishCap(level) }));
  unlocks.push(t('+{n} study vouchers', { n: DAILY.levelUpVouchers }));
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
    s.vouchers = (s.vouchers || 0) + DAILY.levelUpVouchers;
    this.game.emit('levelUp', { level: s.level, unlocks: unlocksFor(s.level) });
    g.sfx('levelup');
    g.fx.sparkle(g.at(g.world.size / 2, g.world.size / 2, 60), 30, '#ffd86b');
  }

  // ---------------- today: daily goals, the gift and its streak ----------------
  /** A new calendar day (the player's own time zone) brings three new goals. */
  checkDate() {
    const s = this.s, today = this.game.day.today();
    if (s.daily && s.daily.day === today && s.daily.goals.length) return;
    this.rollDaily(today);
  }
  /** Can goal `q` be worked on in this café right now? */
  questOpen(q) {
    if (q.needs === 'bakery') return this.bakeryReady();
    if (q.needs === 'cast') return this.game.staff.some((a) => a.kitUnlocked());
    return true;
  }
  /** Today's goals: two the café also works on while closed, and one for the player (yesterday's kinds last). */
  rollDaily(day = this.game.day.today()) {
    const s = this.s, before = new Set(((s.daily && s.daily.goals) || []).map((x) => x.id));
    const pick = (kind, n) => {
      const pool = QUESTS.filter((q) => q.kind === kind && this.questOpen(q));
      const out = [];
      for (const list of [pool.filter((q) => !before.has(q.id)), pool]) {
        while (out.length < n) {
          const left = list.filter((q) => !out.includes(q));
          if (!left.length) break;
          out.push(choice(left));
        }
      }
      return out;
    };
    const goals = [...pick('serve', DAILY.goals - 1), ...pick('act', 1)].map((q) => {
      let target = Math.max(1, Math.round(q.base + q.perLevel * s.level));
      if (q.id === 'coins') target = Math.round(target / 5) * 5;
      return { id: q.id, target, prog: 0, claimed: false };
    });
    s.daily = { day, goals, chest: false };
    this.game.changed('quest');
  }
  questProgress(kind, n = 1) {
    const d = this.s.daily;
    if (!d || n <= 0) return;
    for (const q of d.goals) {
      if (q.id !== kind || q.prog >= q.target) continue;
      q.prog = Math.min(q.target, q.prog + n);
      this.game.changed('quest');
      if (q.prog < q.target) continue;
      this.game.toast(t('Goal done: {goal}. Claim it in Today!', { goal: t(questById[q.id].text, { n: q.target }) }), 'good');
      this.game.sfx('pop');
    }
  }
  goalReward() { const l = this.s.level, r = DAILY.goal; return { vouchers: r.vouchers, coins: dailyCoins(r, l), points: dailyPoints(r, l) }; }
  chestReward() { const r = DAILY.chest; return { vouchers: r.vouchers, coins: dailyCoins(r, this.s.level), points: 0 }; }
  chestReady() { const d = this.s.daily; return !!d && !d.chest && d.goals.length > 0 && d.goals.every((q) => q.claimed); }
  /** Pay a reward from the Today panel (coins straight to the till: no trade, so no goal counts them). */
  payReward(r) {
    const s = this.s, g = this.game;
    s.vouchers = (s.vouchers || 0) + (r.vouchers || 0);
    s.coins += r.coins; s.stats.coins += r.coins; s.totals.coins += r.coins;
    g.sfx('levelup');
    g.fx.sparkle(g.at(g.world.size / 2, g.world.size / 2, 60), 18, '#ffd86b');
    if (r.points) this.addPoints(r.points);
    g.changed('coins'); g.changed('quest');
    return r;
  }
  claimGoal(i) {
    const q = this.s.daily && this.s.daily.goals[i];
    if (!q || q.claimed || q.prog < q.target) return null;
    q.claimed = true;
    return this.payReward(this.goalReward());
  }
  claimChest() {
    if (!this.chestReady()) return null;
    this.s.daily.chest = true;
    return this.payReward(this.chestReward());
  }
  /** Things waiting in the Today panel: finished goals, the chest and the gift. */
  claimable() {
    const d = this.s.daily;
    return (d ? d.goals.filter((q) => !q.claimed && q.prog >= q.target).length : 0) + (this.chestReady() ? 1 : 0) + (this.giftAvailable() ? 1 : 0);
  }
  /** The gift streak: how many gifts in a row are opened (counting today's, if opened) and which day the next one is. */
  streak() {
    const today = this.game.day.today(), k = this.s.streak || { n: 0, day: 0 };
    const alive = k.day === today || k.day === today - 1;
    const n = alive ? k.n : 0;
    return { n, today: k.day === today, next: (n % DAILY.streakDays) + 1 };
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
  /**
   * What studying dish `id` up a level takes and what stands in the way: { ings: [{ id, need, have }], vouchers,
   * have, cap, why }, `why` null when it can go ahead, else 'locked' | 'max' | 'cap' | 'vouchers' | 'ings'.
   */
  studyPlan(id) {
    const s = this.s, d = dishById[id], st = s.dishes[id];
    const need = levelUpCost(st.lv), cap = dishCap(s.level);
    const ings = d.ings.map((i) => ({ id: i, need, have: s.inv[i] || 0 }));
    const vouchers = studyCost(st.lv), have = s.vouchers || 0;
    const why = !this.dishUnlocked(id) ? 'locked' : st.lv >= MAX_DISH_LEVEL ? 'max' : st.lv >= cap ? 'cap'
      : have < vouchers ? 'vouchers' : ings.some((x) => x.have < x.need) ? 'ings' : null;
    return { ings, vouchers, have, cap, why };
  }
  /** Study a dish up one level: the ingredients and the vouchers are used up in one go. */
  study(id) {
    const s = this.s, d = dishById[id], st = s.dishes[id], g = this.game;
    const p = this.studyPlan(id);
    if (p.why) {
      const msg = { max: t('{name} is already max level!', { name: d.name }), cap: t('Café level {n} lets dishes reach Lv{m}', { n: s.level, m: p.cap }),
        vouchers: t('Not enough study vouchers (need {n})', { n: p.vouchers }), ings: t('Not enough ingredients in the pantry') }[p.why];
      if (msg) { g.toast(msg, 'bad'); g.sfx('error'); }
      return false;
    }
    for (const x of p.ings) s.inv[x.id] -= x.need;
    s.vouchers -= p.vouchers;
    st.lv++;
    this.addPoints(st.lv * 6);
    g.toast(t('{name} reached Lv{n}! Price and points up.', { name: d.name, n: st.lv }), 'good');
    g.sfx('levelup');
    g.changed('menu'); g.changed('inv');
    return true;
  }

  // ---------------- pantry: ingredients are used up as drinks are made (rules live in pantry.js) ----------------
  servings(ing) { return pantry.servings(this.s, ing); }
  canMake(id) { return pantry.canMake(this.s, id); }
  /** Bakes need an oven to bake in, a pastry case to set them out on and a baker. */
  bakeryReady() { const g = this.game, w = g.world; return !!(w.byKind('oven').length && w.byKind('bar').length && g.staff.some((a) => a.role === 'bartender')); }
  canMakeCount(id) { return pantry.canMakeCount(this.s, id); }
  /** Use one serving of every ingredient in the recipe. False (and nothing used) when something is missing. */
  consume(id) {
    if (!pantry.consume(this.s, id)) return false;
    this.game.changed('inv');
    return true;
  }
  refund(id) { pantry.refund(this.s, id); this.game.changed('inv'); }
  restockBudget() { return perRound(pantry.restockBudget(this.s.level)); }
  /** Top up the ingredients on the menu from the market, within today's budget. Returns the coins spent. */
  autoRestock() {
    const s = this.s;
    if (!s.settings.autoRestock || !s.stats) return 0;
    const spent = pantry.restock(s, s.stats, ROUND_SCALE);
    if (spent) { this.game.changed('inv'); this.game.changed('coins'); }
    return spent;
  }

  // ---------------- costs per round ----------------
  dailyWages() { return this.game.staff.reduce((a, st) => a + perRound(staffWage(st.role, st.skillLv())), 0); }
  dailyRent() { return perRound(rentFor(this.game.world.size)); }
  /**
   * Close the books for the round: pay the team and the landlord as far as the till allows. `share` is the
   * part of the opening hours the café traded live (the rest was settled offline, or the game opened late).
   */
  payDay(share = 1) {
    const s = this.s, wages = Math.round(this.dailyWages() * share), rent = Math.round(this.dailyRent() * share);
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
    this.questProgress('market', qty);
    this.game.sfx('coin');
    this.game.changed('inv');
  }
  /** A copy of a wardrobe accessory (each copy dresses one character at a time). */
  buyWear(id) {
    const w = wearById(id);
    if (!w || !this.spend(w.price, w.name)) return false;
    this.s.wardrobe[id] = (this.s.wardrobe[id] || 0) + 1;
    this.game.sfx('coin');
    this.game.toast(t('{item} is in the wardrobe: dress someone up from Staff → Outfit.', { item: w.name }), 'good');
    this.game.changed('wardrobe');
    return true;
  }
  buySnack(id, qty = 1) {
    const sn = snackById[id];
    if (!this.spend(sn.price * qty, sn.name)) return false;
    this.s.snacks[id] = (this.s.snacks[id] || 0) + qty;
    this.game.sfx('coin');
    this.game.changed('inv');
    return true;
  }
  /** Once per calendar day (the player's own time zone). Seven gifts in a row bring study vouchers too. */
  giftAvailable() { return this.s.giftDay !== this.game.day.today(); }
  claimGift() {
    const s = this.s, g = this.game;
    if (!this.giftAvailable()) return null;
    const today = this.game.day.today(), n = this.streak().next;
    s.streak = { n, day: today };
    s.giftDay = today;
    const pool = INGREDIENTS.filter((i) => this.ingredientAvailable(i.id));
    const got = {};
    for (let i = 0; i < 4; i++) { const ing = choice(pool).id; got[ing] = (got[ing] || 0) + randInt(1, 2); }
    for (const [id, v] of Object.entries(got)) s.inv[id] = (s.inv[id] || 0) + v;
    const coins = 20 + s.level * 5;
    const vouchers = n === DAILY.streakDays ? DAILY.streakVouchers : 0;
    s.coins += coins;
    s.vouchers = (s.vouchers || 0) + vouchers;
    g.sfx('levelup');
    g.changed('inv'); g.changed('coins'); g.changed('quest');
    return { got, coins, vouchers, streak: n };
  }

  // ---------------- staff ----------------
  /** Hire `model` (one of our own characters nobody on the team wears) as a `role`. */
  hire(role, model) {
    const g = this.game, s = this.s;
    if (g.staff.length >= staffSlots(s.level)) return g.toast(t('All staff slots are full — level up for more'), 'bad');
    if (!UNIQUE_MODELS.includes(model) || g.staff.some((a) => a.look.model === model)) return g.toast(t('{name} is already on the team', { name: UNIQUE_NAMES[model] || model }), 'bad');
    if (!this.spend(ROLES[role].hire, t('hiring'))) return;
    const st = makeStaff(g, role, model);
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
  /** Passed a club's mini-game: pay the fee and learn its skill (Lv1). */
  learnClub(st, id) {
    const g = this.game, club = CLUBS[id];
    if (!club || !g.staff.includes(st) || st.clubLv(id) > 0) return false;
    if (!this.spend(club.fee, club.name)) return false;
    st.clubs[id] = 1;
    st.emote('emote_sparkle', 2); st.hop();
    g.fx.sparkle(g.at(st.x, st.y, 60), 16, club.color);
    g.sfx('levelup');
    g.toast(t('{name} learned {skill}!', { name: st.name, skill: club.skill }), 'good');
    g.changed('staff');
    return true;
  }
  fire(st) {
    const g = this.game;
    if (st.look.model === this.s.partner) return g.toast(t('{name} is your partner and stays with the café.', { name: st.name }), 'bad');
    if (st.job) st.abortJob();
    g.removeAgent(st);
    g.toast(t('{name} waved goodbye.', { name: st.name }));
    g.changed('staff');
  }
  /**
   * Snacks to top the whole team up: snacks in the pantry first, then the cheapest buy for what's
   * left. Staff within FEED_SLACK of full are skipped. Returns { list: [{ st, id }], fed, pantry, buy, cost }.
   */
  planFeedAll() {
    const left = { ...this.s.snacks };
    const pantry = {}, buy = {}, list = [];
    const bySize = [...SNACKS].sort((a, b) => a.energy - b.energy);
    const fed = new Set();
    for (const st of this.game.staff) {
      let need = 100 - st.energy;
      while (need >= FEED_SLACK) {
        const have = bySize.filter((sn) => left[sn.id] > 0);
        // the smallest snack that fills them up, else the biggest one there is, and go again
        const pick = (arr) => arr.find((sn) => sn.energy >= need) || arr[arr.length - 1];
        const sn = have.length ? pick(have) : pick(bySize);
        if (have.length) { left[sn.id]--; pantry[sn.id] = (pantry[sn.id] || 0) + 1; } else buy[sn.id] = (buy[sn.id] || 0) + 1;
        list.push({ st, id: sn.id });
        fed.add(st);
        need -= sn.energy;
      }
    }
    const cost = Object.entries(buy).reduce((n, [id, k]) => n + snackById[id].price * k, 0);
    return { list, fed: fed.size, pantry, buy, cost };
  }
  /** Carry out planFeedAll(): buy what's missing in one go, then hand the snacks out. */
  feedAll(plan) {
    if (!plan.list.length) return false;
    if (plan.cost && !this.canAfford(plan.cost)) { this.game.toast(t('Not enough coins'), 'bad'); return false; }
    for (const [id, k] of Object.entries(plan.buy)) if (!this.buySnack(id, k)) return false;
    for (const { st, id } of plan.list) {
      if (!this.game.staff.includes(st) || !(this.s.snacks[id] > 0)) continue;
      this.s.snacks[id]--;
      st.feed(snackById[id]);
      this.questProgress('snack', 1);
    }
    this.game.sfx('eat');
    this.game.changed('staff');
    return true;
  }

  feed(st, snackId) {
    const s = this.s, sn = snackById[snackId];
    if (!(s.snacks[snackId] > 0)) { if (!this.buySnack(snackId)) return; }
    s.snacks[snackId]--;
    st.feed(sn);
    this.questProgress('snack', 1);
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
  }
}
