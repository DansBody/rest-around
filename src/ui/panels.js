// Panel contents. Each panel re-renders on state changes (and once a second when `live`).
import { h, fmt } from '../util.js';
import { assets } from '../assets.js';
import { portrait, thumb, plotThumb } from '../portrait.js';
import { ACCESSORIES, roleLook, nextCast } from '../looks.js';
import {
  ROLES, SNACKS, DISHES, DISH_CATS, EXTRA_CAT, WALL_DECOR, wallDecorById, dishPrice, dishPoints, levelUpCost, MAX_DISH_LEVEL, menuSlots, staffSlots,
  INGREDIENTS, ingById, SEEDS, FURNITURE, FLOORS, WALLS, furnitureById, SELL_RATE,
  UNIQUE_MODELS, UNIQUE_NAMES, SKILL, ABILITIES, ABILITY_UNLOCK_LV, KITS, staffWage, servingCost, SERVINGS_PER_UNIT, OFFLINE,
} from '../data.js';
import { clearSave, save, serialize } from '../save.js';
import { cloud } from '../cloud.js';
import { audio } from '../audio.js';
import { gl, glyph } from './icons.js';
import { t, tt, titledRole, LANGS, getLang } from '../i18n.js';

const I = (id, s = 22) => assets.iconEl(id, s);
/** Danger button that asks for a second tap instead of a browser confirm() dialog. */
export function confirmBtn(sel, label, ask, action) {
  let armed = false, timer = null;
  const b = h(sel, { onclick: (e) => {
    e.stopPropagation();
    if (armed) { clearTimeout(timer); action(); return; }
    armed = true; b.textContent = ask + ' ✓';
    timer = setTimeout(() => { armed = false; b.textContent = label; }, 3000);
  } }, label);
  return b;
}
const coinPill = (n) => h('span.pill', I('icon_coin', 18), fmt(n));
/** The role's active ability: name + what it does (or when it unlocks). */
function abilityLine(role, unlocked, long = false) {
  const ab = ABILITIES[role];
  return h('div.abil', { style: { '--c': ab.color }, title: ab.desc }, glyph(unlocked ? ab.glyph : 'lock', 15),
    h('b', ab.name), long ? h('span', '— ' + ab.desc) : h('span', unlocked ? t('· charges while working, fires by itself') : t('· unlocks at {title}', { title: SKILL.titles[ABILITY_UNLOCK_LV - 1] })));
}
/** A character's own kit: the perks (and drawbacks) that are always on, then the skill you cast from the dock. */
export function kitLines(model, unlocked = true, long = false) {
  const kit = KITS[model];
  if (!kit) return [];
  const rows = kit.perks.map((p) => h('div.abil' + (p.bad ? '.bad' : ''), { style: { '--c': p.bad ? '#e0783d' : '#2f9bff' }, title: p.desc },
    glyph(p.glyph, 15), h('b', p.name), long ? h('span', '— ' + p.desc) : null));
  const k = kit.active;
  if (k) rows.push(h('div.abil', { style: { '--c': k.color }, title: k.desc }, glyph(unlocked ? k.glyph : 'lock', 15), h('b', k.name),
    h('span', long ? '— ' + k.desc + (unlocked ? '' : ' ' + t('(unlocks at skill Lv{n})', { n: ABILITY_UNLOCK_LV })) : unlocked ? t('· cast it from the dock') : t('· unlocks at skill Lv{n}', { n: ABILITY_UNLOCK_LV }))));
  return rows;
}
/** Five small stars for a staff skill level. */
export function skillStars(lv, size = 13) {
  return h('span.skill-stars', { title: t('Skill Lv{n}: {title}', { n: lv, title: SKILL.titles[lv - 1] }) }, [1, 2, 3, 4, 5].map((i) => glyph(i <= lv ? 'star' : 'star_empty', size)));
}
/** "Skilled Chef" + stars + progress to the next skill level. */
export function skillLine(a, role = a.role) {
  const lv = a.skillLv(role), xp = a.xpIn(role);
  const lo = SKILL.levels[lv - 1], hi = SKILL.levels[lv];
  const frac = hi == null ? 1 : (xp - lo) / (hi - lo);
  return h('div.skill',
    skillStars(lv),
    h('span', titledRole(SKILL.titles[lv - 1], ROLES[role].name)),
    h('div.pbar.gold.xp', { title: hi == null ? t('Max skill') : t('{a}/{b} XP to {title}', { a: xp - lo, b: hi - lo, title: SKILL.titles[lv] }) }, h('i', { style: { width: Math.round(frac * 100) + '%' } })));
}


// =====================================================================================
export const PANELS = {
  staff: { title: 'Staff', icon: 'tool_staff', render: renderStaff, tick: tickStaff },
  menu: { title: 'Menu', icon: 'tool_menu', render: renderMenu },
  garden: { title: 'Garden', icon: 'tool_garden', live: true, render: renderGarden },
  market: { title: 'Market', icon: 'tool_market', render: renderMarket },
  settings: { title: 'Settings', icon: 'tool_settings', render: renderSettings },
};

// ------------------------------------------------------------------ staff
function renderStaff(ui, body) {
  const g = ui.game, s = g.state;
  if (ui.subview && ui.subview.outfit) return renderOutfit(ui, body, ui.subview.outfit);
  if (ui.subview && ui.subview.job) return renderJobChange(ui, body, ui.subview.job);
  const staff = g.staff;
  const slots = staffSlots(s.level);
  body.append(h('div.muted', t('{n} / {m} staff slots · staff tire while working. Feed them snacks to perk them up!', { n: staff.length, m: slots })));
  body.append(h('div.muted', t('Payroll {n} coins a day, plus {m} coins rent. Paid when the café closes; if the till runs short the team starts the next day tired.', { n: g.eco.dailyWages(), m: g.eco.dailyRent() })));
  body.append(h('div.section-title', t('Your team')));
  for (const a of staff) {
    const bar = h('i', { style: { width: a.energy + '%' } });
    body.append(h('div.row', { 'data-staff': a.id },
      portrait(a.look, 64, 80),
      h('div.grow',
        h('h3', a.name, ' ', h('span.muted', '· ' + ROLES[a.role].name), ' ', h('span.pill', { title: t('Daily wage') }, I('icon_coin', 14), staffWage(a.role, a.skillLv()) + t('/day'))),
        skillLine(a),
        abilityLine(a.role, a.abilityUnlocked()),
        ...kitLines(a.look.model, a.kitUnlocked(), true),
        h('div.muted.task', a.napping ? t('😴 Napping') : tt(a.task)),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '4px', margin: '4px 0' } }, I('icon_energy', 18), h('div.pbar' + (a.energy < 25 ? '.orange' : ''), { style: { flex: 1 } }, bar)),
        h('div.btnrow',
          SNACKS.map((sn) => h('button.btn.small', { title: t('{snack}: +{n} energy ({src})', { snack: sn.name, n: sn.energy, src: s.snacks[sn.id] ? t('from pantry') : t('{n} coins', { n: sn.price }) }), onclick: () => g.eco.feed(a, sn.id) }, I(sn.asset, 20), `×${s.snacks[sn.id] || 0}`)),
          h('button.btn.small', { onclick: () => { ui.subview = { outfit: a }; ui.renderPanel(); } }, t('Outfit')),
          h('button.btn.small', { onclick: () => { ui.subview = { job: a }; ui.renderPanel(); } }, t('Change job')),
          confirmBtn('button.btn.small.danger', t('Fire'), t('Let {name} go?', { name: a.name }), () => g.eco.fire(a)),
          h('button.btn.small', { onclick: () => ui.select(a), title: t('Show on the floor') }, gl('eye', null, 16))))));
  }
  body.append(h('div.section-title', t('Hire')));
  const full = staff.length >= slots;
  const nextModel = nextCast(new Set(staff.map((a) => a.look.model)));   // new hires are always an original character
  body.append(h('div.muted', nextModel ? t('Next to join: {name}', { name: UNIQUE_NAMES[nextModel] }) : t('Every character is already on the team')));
  if (nextModel) body.append(...kitLines(nextModel, true, true));
  for (const [role, r] of Object.entries(ROLES)) {
    const count = staff.filter((a) => a.role === role).length;
    const note = t(ROLE_NOTE[role]);
    body.append(h('div.row',
      portrait(roleLook(role, nextModel || undefined), 48, 48),
      h('div.grow', h('h3', r.name, h('span.muted', t(' · you have {n}', { n: count }))), h('div.muted', note + ' ' + t('Wage {n}/day.', { n: staffWage(role, 1) }))),
      h('button.btn.primary.small' + (full || !g.eco.canAfford(r.hire) ? '.disabled' : ''), { onclick: () => g.eco.hire(role) }, t('Hire') + ' ', coinPill(r.hire))));
  }
  if (full) body.append(h('div.muted', t('All slots are full — reach the next level for more.')));
}
const ROLE_NOTE = { waiter: 'Takes orders, serves drinks, clears tables.', chef: 'Brews at a free espresso station.', cleaner: 'Sweeps up and tidies the restrooms and reading nooks.', bartender: 'Plates bakes at the Pastry Case.' };
function renderJobChange(ui, body, a) {
  const g = ui.game;
  if (!g.staff.includes(a)) { ui.subview = null; return renderStaff(ui, body); }
  body.append(
    h('div.btnrow', { style: { marginBottom: '8px' } }, h('button.btn.small', { onclick: () => { ui.subview = null; ui.renderPanel(); } }, gl('back', t('Back'), 14)), h('b', { style: { alignSelf: 'center' } }, t("{name}'s career", { name: a.name }))),
    h('div.row', portrait(a.look, 64, 64), h('div.grow', h('h3', a.name), skillLine(a), h('div.muted', t('Works {n}% faster than a novice', { n: Math.round((a.skillMul - 1) * 100) })))),
    h('div.section-title', t('Retrain as')));
  const roles = Object.keys(ROLES);
  for (const role of roles) {
    const r = ROLES[role], cur = role === a.role;
    const fee = g.eco.jobChangeFee(a, role);
    const action = cur
      ? h('span.pill', t('Current job'))
      : h('button.btn.primary.small' + (fee && !g.eco.canAfford(fee) ? '.disabled' : ''), { onclick: () => { if (g.eco.changeJob(a, role)) { ui.subview = null; ui.renderPanel(); } } },
        t('Retrain'), fee ? coinPill(fee) : h('span.pill', t('Free')));
    body.append(h('div.row' + (cur ? '.current' : ''),
      portrait(roleLook(role, a.look.model), 48, 48),
      h('div.grow', h('h3', r.name), skillLine(a, role), h('div.muted', t(ROLE_NOTE[role])), abilityLine(role, a.skillLv(role) >= ABILITY_UNLOCK_LV, true),
        role === 'bartender' && !g.world.byKind('bar').length ? h('div.bmsg.warn', { style: { marginTop: '4px', display: 'inline-block' } }, t('Needs a Pastry Case to work')) : null),
      action));
  }
  body.append(h('div.muted', { style: { marginTop: '6px', lineHeight: 1.5 } },
    t("Staff gain experience by finishing jobs in their current role and keep it in every role they've had. Skill makes them walk and work faster (up to +{n}% as a Master). Retraining costs half the hiring fee — going back to a job they're already {title} or better at is free.", { n: Math.round((SKILL.mul[SKILL.mul.length - 1] - 1) * 100), title: SKILL.titles[SKILL.freeReturnLv - 1] })));
}
function tickStaff(ui, body) {
  // keep energy bars moving between full renders
  for (const row of body.querySelectorAll('[data-staff]')) {
    const a = ui.game.staff.find((x) => String(x.id) === row.dataset.staff);
    if (!a) continue;
    const bar = row.querySelector('.pbar i');
    if (bar) bar.style.width = a.energy + '%';
    const tk = row.querySelector('.task');
    if (tk) tk.textContent = a.napping ? t('😴 Napping') : tt(a.task);
  }
}

function renderOutfit(ui, body, a) {
  const g = ui.game;
  const look = a.look;
  // a staff member is named after their character, so switching the character renames them
  const refresh = () => { a.name = UNIQUE_NAMES[look.model] || a.name; g.refreshCharacter(a); g.changed('look'); ui.renderPanel(); };
  const accName = (n) => t(n.split('_').slice(1).join(' ').replace('Hooded', 'Hood'));
  const pc = portrait(look, 150, 190);
  pc.style.margin = '0 auto'; pc.style.display = 'block';
  // staff are original characters, offered only while nobody else on the team is wearing them
  const taken = new Set(g.staff.filter((s) => s !== a).map((s) => s.look && s.look.model));
  const models = UNIQUE_MODELS.filter((m) => !taken.has(m));
  body.append(
    h('div.btnrow', { style: { marginBottom: '6px' } }, h('button.btn.small', { onclick: () => { ui.subview = null; ui.renderPanel(); } }, gl('back', t('Back'), 14)), h('b', { style: { alignSelf: 'center' } }, t("{name}'s wardrobe", { name: a.name }))),
    pc,
    h('div.orow', h('span', t('Character')), h('div.stepper',
      h('button.btn.small', { onclick: () => { look.model = models[(models.indexOf(look.model) + models.length - 1) % models.length]; look.hide = []; refresh(); } }, gl('back', null, 14)),
      h('span', UNIQUE_NAMES[look.model] || look.model),
      h('button.btn.small', { onclick: () => { look.model = models[(models.indexOf(look.model) + 1) % models.length]; look.hide = []; refresh(); } }, gl('forward', null, 14)))),
    ...(ACCESSORIES[look.model] || []).length ? [h('div.orow', h('span', t('Wear')), h('div.btnrow', ACCESSORIES[look.model].map((n) => {
      const on = !(look.hide || []).includes(n);
      return h('button.btn.small' + (on ? '.primary' : ''), { onclick: () => { look.hide = on ? [...(look.hide || []), n] : (look.hide || []).filter((x) => x !== n); refresh(); } }, on ? gl('check', accName(n), 14) : accName(n));
    })))] : [],
    h('div.orow', h('span', t('Barista cap')), h('button.btn.small' + (look.roleHat ? '.primary' : ''), { onclick: () => { look.roleHat = look.roleHat ? null : 'chef'; refresh(); } }, look.roleHat ? t('On') : t('Off'))),
    h('div.muted', t('Staff are our own characters, and take the name of the one they wear.')));
}

// ------------------------------------------------------------------ menu
function renderMenu(ui, body) {
  const g = ui.game, s = g.state;
  const cat = ui.menuCat || 'coffee';
  const slots = menuSlots(s.level);
  body.append(h('div.tabs', DISH_CATS.map((c) => h('button.btn.small.tab' + (c.id === cat ? '.on' : ''), { onclick: () => { ui.menuCat = c.id; ui.renderPanel(); } }, `${c.name} ${g.eco.menuCount(c.id)}/${slots[c.id]}`))));
  if (cat === EXTRA_CAT) {
    const ok = g.world.byKind('bar').length && g.staff.some((a) => a.role === 'bartender');
    if (!ok) body.append(h('div.row', I('emote_menu', 32), h('div.grow.muted', t('Bakes need a Pastry Case (Build → Coffee Bar) and a Baker (Staff → Hire).'))));
  }
  if (slots[cat] === 0) body.append(h('div.muted', { style: { margin: '6px 2px' } }, t('No {cat} slots yet — they open up as you level.', { cat: DISH_CATS.find((c) => c.id === cat).name })));
  for (const d of DISHES.filter((x) => x.cat === cat)) {
    const st = s.dishes[d.id];
    const unlocked = g.eco.dishUnlocked(d.id);
    const need = levelUpCost(st.lv);
    const maxed = st.lv >= MAX_DISH_LEVEL;
    const ings = d.ings.map((i) => {
      const p = st.prog[i] || 0;
      return h('span.ing' + (p >= need || maxed ? '.done' : ''), { title: t('{ing}: {p}/{need} added · {n} in pantry', { ing: ingById[i].name, p, need, n: s.inv[i] || 0 }) }, I('ing_' + i, 20), maxed ? '✓' : `${p}/${need}`, h('span.muted', ` (${s.inv[i] || 0})`));
    });
    const canAdd = unlocked && !maxed && d.ings.some((i) => (s.inv[i] || 0) > 0 && (st.prog[i] || 0) < need);
    body.append(h('div.row' + (unlocked ? '' : '.locked'),
      I(d.asset, 56),
      h('div.grow',
        h('h3', d.name, ' ', h('span.pill', t('Lv{n}', { n: st.lv }))),
        h('div', { style: { display: 'flex', gap: '6px', margin: '2px 0' } }, coinPill(dishPrice(d, st.lv)), h('span.pill', I('icon_points', 18), dishPoints(d, st.lv)), h('span.pill', '⏱ ' + d.cook + 's')),
        unlocked ? h('div.ings', ings) : h('div.muted', I('icon_lock', 16), ' ' + t('Unlocks at level {n}', { n: d.level })),
        unlocked ? stockLine(g, d, st) : null,
        unlocked ? h('div.btnrow',
          h('button.btn.small' + (st.on ? '.primary' : ''), { onclick: () => g.eco.toggleMenu(d.id) }, st.on ? gl('check', t('On menu'), 14) : t('Add to menu')),
          maxed ? null : h('button.btn.small' + (canAdd ? '' : '.disabled'), { onclick: () => g.eco.contribute(d.id), title: t('Put pantry ingredients toward the next dish level') }, gl('bowl', t('Add ingredients'), 15))) : null)));
  }
  body.append(h('div.muted', { style: { marginTop: '6px' } }, t('Every cup uses up its ingredients — one pack makes about {n} servings of each recipe. Keep the pantry stocked, or let the market top it up for you (Market tab).', { n: SERVINGS_PER_UNIT })));
  body.append(h('div.muted', { style: { marginTop: '6px' } }, t('Collect every ingredient in a recipe to level a drink or bake (Lv1→10): higher price and more café points. Get ingredients from the Garden, the Market and the daily gift.')));
}

/** What a serving costs in ingredients, the margin on it, and how many the pantry can still make. */
function stockLine(g, d, st) {
  const cost = servingCost(d), profit = dishPrice(d, st.lv) - cost, n = g.eco.canMakeCount(d.id);
  return h('div.muted.stock' + (n === 0 ? '.out' : n < 6 ? '.low' : ''), t('Costs {c} a cup · profit {p} · {n} left in the pantry', { c: cost.toFixed(1), p: profit.toFixed(1), n }));
}

// ------------------------------------------------------------------ garden
function renderGarden(ui, body) {
  const g = ui.game, s = g.state;
  body.append(h('div.muted', t('Plant seeds, keep the soil watered, and harvest fresh herbs and berries. Plots only grow while watered.')));
  const pick = ui.seedPick;
  const grid = h('div.grid2', { style: { marginTop: '8px' } });
  s.garden.forEach((p, i) => {
    const seed = p.crop ? g.eco.seedFor(p.crop) : null;
    const soil = plotThumb(p, 112, 96);
    if (p.crop && p.prog >= 1) soil.style.animation = 'wiggle 1.4s infinite';
    const tile = h('div.tile.plot', soil);
    if (!p.crop) {
      tile.append(h('b', t('Empty plot')), h('button.btn.small.primary', { onclick: () => { ui.seedPick = i; ui.renderPanel(); } }, I('icon_seed', 18), t('Plant')));
    } else {
      tile.append(...[h('b', ingById[p.crop].name + (p.prog >= 1 ? t(' — ready!') : '')),
        h('div', { style: { width: '100%' }, title: t('Growth') }, h('div.pbar.green', h('i', { style: { width: p.prog * 100 + '%' } }))),
        p.prog < 1 ? h('div', { style: { width: '100%', display: 'flex', alignItems: 'center', gap: '3px' }, title: t('Water') }, I('icon_water', 16), h('div.pbar' + (p.water <= 0 ? '.red' : ''), { style: { flex: 1 } }, h('i', { style: { width: p.water * 100 + '%' } }))) : null,
        p.prog >= 1
          ? h('button.btn.small.primary', { onclick: () => { const r = g.eco.harvest(i); if (r) ui.toast(t('Harvested {n} {crop}!', { n: r.n, crop: ingById[r.crop].name }), 'good'); } }, I('icon_harvest', 18), t('Harvest'))
          : h('button.btn.small' + (p.water < 0.5 ? '.primary' : ''), { onclick: () => g.eco.water(i) }, I('icon_water', 18), p.water <= 0 ? t('Thirsty!') : t('Water')),
        h('span.muted', p.prog >= 1 ? `+${seed.yield}` : t('{n}s left', { n: Math.ceil((1 - p.prog) * seed.grow) }))].filter(Boolean));
    }
    grid.append(tile);
  });
  body.append(grid);
  if (pick != null && s.garden[pick] && !s.garden[pick].crop) {
    body.append(h('div.section-title', t('Choose seeds for plot {n}', { n: pick + 1 })));
    for (const sd of SEEDS) {
      const locked = sd.level > s.level;
      body.append(h('div.row' + (locked ? '.locked' : ''), I('ing_' + sd.crop, 36),
        h('div.grow', h('h3', ingById[sd.crop].name), h('div.muted', locked ? t('Unlocks at level {n}', { n: sd.level }) : t('{s}s to grow · yields {n}', { s: sd.grow, n: sd.yield }))),
        locked ? I('icon_lock', 24) : h('button.btn.small.primary', { onclick: () => { g.eco.plant(pick, sd.crop); ui.seedPick = null; ui.renderPanel(); } }, coinPill(sd.price))));
    }
    body.append(h('button.btn.small', { onclick: () => { ui.seedPick = null; ui.renderPanel(); } }, t('Cancel')));
  }
  body.append(h('div.section-title', t('Pantry')), pantry(s));
}

function pantry(s) {
  const items = INGREDIENTS.filter((i) => s.inv[i.id]).map((i) => h('span.ing', { title: i.name }, I('ing_' + i.id, 22), '×' + s.inv[i.id]));
  return h('div.ings', items.length ? items : h('span.muted', t('Empty — grow or buy some ingredients!')));
}

// ------------------------------------------------------------------ market
function renderMarket(ui, body) {
  const g = ui.game, s = g.state;
  if (g.eco.giftAvailable()) body.append(h('div.row', I('icon_gift', 44), h('div.grow', h('h3', t('Daily gift')), h('div.muted', t('Free ingredients and coins, once per day.'))), h('button.btn.primary.small', { onclick: () => ui.claimGift() }, t('Open!'))));
  body.append(h('div.section-title', t('Ingredients')));
  body.append(h('div.toggle', h('span', t('Auto-restock')), h('button.switch' + (s.settings.autoRestock ? '.on' : ''), { role: 'switch', 'aria-checked': String(!!s.settings.autoRestock), title: t('Auto-restock'), onclick: () => { s.settings.autoRestock = !s.settings.autoRestock; if (s.settings.autoRestock) g.eco.autoRestock(); ui.renderPanel(); } })));
  body.append(h('div.muted', { style: { marginBottom: '6px' } }, s.settings.autoRestock
    ? t('Packs for the dishes on your menu are bought automatically when they run low: up to {n} coins a day (spent {m} today). A pack makes about {k} servings.', { n: g.eco.restockBudget(), m: s.stats ? s.stats.restocked || 0 : 0, k: SERVINGS_PER_UNIT })
    : t('Restocking is up to you. A pack makes about {k} servings — guests leave if a drink is sold out.', { k: SERVINGS_PER_UNIT })));
  const grid = h('div.grid2');
  for (const i of INGREDIENTS) {
    const ok = g.eco.ingredientAvailable(i.id);
    const price = g.eco.ingredientPrice(i.id);
    grid.append(h('div.tile' + (ok ? '' : '.locked'), I('ing_' + i.id, 36), h('b', i.name), h('span.muted', t('have {n}', { n: s.inv[i.id] || 0 }) + (i.source === 'garden' ? t(' · grows in garden') : '')),
      ok ? h('div.btnrow', h('button.btn.small', { onclick: () => g.eco.buyIngredient(i.id, 1) }, coinPill(price)), h('button.btn.small', { onclick: () => g.eco.buyIngredient(i.id, 5) }, '×5 ', coinPill(price * 5)))
        : h('span.muted', I('icon_lock', 16), ' ' + t('Lv{n}', { n: i.level }))));
  }
  body.append(grid);
  body.append(h('div.section-title', t('Staff snacks')));
  for (const sn of SNACKS) {
    body.append(h('div.row', I(sn.asset, 36), h('div.grow', h('h3', sn.name), h('div.muted', t('+{n} energy · you have {m}', { n: sn.energy, m: s.snacks[sn.id] || 0 }))),
      h('button.btn.small', { onclick: () => g.eco.buySnack(sn.id) }, coinPill(sn.price))));
  }
}

// ------------------------------------------------------------------ settings
function renderSettings(ui, body) {
  const g = ui.game, s = g.state;
  const name = h('input', { type: 'text', value: s.name, maxlength: 24 });
  name.addEventListener('change', () => { s.name = name.value.trim().slice(0, 24) || 'Sunny Café'; document.title = `${s.name} · Refillit`; });
  const vol = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: s.settings.volume });
  vol.addEventListener('input', () => { s.settings.volume = +vol.value; audio.setVolume(+vol.value); });
  const toggle = (label, key, after) => h('div.toggle', h('span', label),
    h('button.switch' + (s.settings[key] ? '.on' : ''), { role: 'switch', 'aria-checked': String(!!s.settings[key]), title: label, onclick: () => { s.settings[key] = !s.settings[key]; if (after) after(); ui.renderPanel(); } }));
  body.append(
    h('div.section-title', t('Language')), langPicker(ui),
    h('div.section-title', t('Café name')), name,
    h('div.section-title', t('Sound')),
    toggle(t('Sound effects'), 'sound', () => { audio.enabled = s.settings.sound; audio.unlock(); g.sfx('click'); if (!s.settings.sound) audio.stopMusic(); else audio.setMusic(s.settings.music !== false); }),
    toggle(t('Café music'), 'music', () => { audio.unlock(); audio.setMusic(!!s.settings.music && s.settings.sound); }),
    h('div.orow', h('span', t('Volume')), vol),
    h('div.section-title', t('Game')),
    toggle(t('Auto-open next day'), 'autoNextDay'),
    toggle(t('Auto-restock ingredients'), 'autoRestock', () => { if (s.settings.autoRestock) g.eco.autoRestock(); }),
    h('div.btnrow',
      h('button.btn.small', { onclick: () => { ui.toast(save(g) ? t('Saved!') : t('Could not save (storage blocked?)'), 'good'); } }, gl('save', t('Save now'), 15)),
      confirmBtn('button.btn.small.danger', t('Reset game'), t('Tap again to erase everything'), async () => {
        g.resetting = true;
        if (cloud.online) {   // the server keeps the café: swap it for a new one there first
          g.newGame();
          try { await cloud.reset(serialize(g)); } catch (e) { console.warn(e); g.toast(t('Could not reach the server, try again.'), 'bad'); g.resetting = false; location.reload(); return; }
        }
        clearSave(); location.reload();
      })),
    h('div.muted', { style: { marginTop: '6px' } }, t('Progress autosaves every 10 seconds and when you close the tab. The café keeps trading while you are away (up to {n} hours) and tells you how it went when you come back.', { n: OFFLINE.capHours })),
    h('div.section-title', t('Controls')),
    h('div.muted', { style: { lineHeight: 1.8 } },
      t('Drag to pan · Wheel or pinch to zoom · Right-drag, two-finger twist or '), h('kbd', 'Q'), '/', h('kbd', 'E'), t(' to turn the camera · Click a character for details'), h('br'),
      h('kbd', 'B'), t(' build · '), h('kbd', 'R'), t(' rotate · '), h('kbd', 'Del'), t(' sell · '), h('kbd', 'Esc'), t(' cancel/close · '), h('kbd', '`'), t(' debug')),
    h('div.section-title', t('About')),
    h('div.muted', t('Refillit — a cozy 3D café. Art is swappable: drop glTF models or PNGs into assets/ (see ASSETS.md).')));
}

function langPicker(ui) {
  return h('div.tabs', Object.entries(LANGS).map(([id, label]) => h('button.btn.small.tab' + (getLang() === id ? '.on' : ''), { onclick: () => { if (getLang() !== id) ui.setLanguage(id); } }, label)));
}

// ------------------------------------------------------------------ build tray
const BUILD_CATS = [
  { id: 'dining', name: 'Tables & Chairs' }, { id: 'kitchen', name: 'Coffee Bar' }, { id: 'fun', name: 'Nooks' }, { id: 'decor', name: 'Decor' }, { id: 'walldeco', name: 'Wall decor' },
  { id: 'floor', name: 'Floors' }, { id: 'wall', name: 'Walls' }, { id: 'room', name: 'Room' },
];
const thumbCache = new Map();
function cachedThumb(key, make) { if (!thumbCache.has(key)) thumbCache.set(key, make()); return cloneCanvas(thumbCache.get(key)); }
function cloneCanvas(c) { const n = document.createElement('canvas'); n.width = c.width; n.height = c.height; n.style.cssText = c.style.cssText; n.getContext('2d').drawImage(c, 0, 0); return n; }

export function buildTray(ui, bar) {
  const g = ui.game, b = g.build, s = g.state;
  if (!b.active) { bar.replaceChildren(); return; }
  const cat = ui.buildCat || 'dining';
  const tabs = h('div.bb-top',
    h('div.tabs', BUILD_CATS.map((c) => h('button.btn.small.tab' + (c.id === cat ? '.on' : ''), { onclick: () => { ui.buildCat = c.id; b.setTool(null); } }, t(c.name)))),
    h('div.grow'),
    h('button.btn.primary.done', { onclick: () => b.exit() }, gl('check', t('Done'), 16)));
  const items = h('div.bb-items');
  const card = (key, name, price, lvl, sel, onclick, thumbFn, sub) => {
    const locked = lvl > s.level;
    return h('div.bitem' + (sel ? '.sel' : '') + (locked ? '.locked' : ''), { onclick: locked ? () => b.say(t('Unlocks at level {n}', { n: lvl }), 'bad') : onclick, title: name },
      cachedThumb(key, thumbFn), h('span', name), locked ? h('span.muted', I('icon_lock', 14), ' ' + t('Lv{n}', { n: lvl })) : h('span.pill', I('icon_coin', 16), price + (sub ? t(sub) : '')));
  };
  if (['dining', 'kitchen', 'fun', 'decor'].includes(cat)) {
    for (const f of FURNITURE.filter((x) => x.cat === cat)) {
      const sel = b.tool && b.tool.mode === 'place' && b.tool.type === f.id;
      items.append(card('f:' + f.id, f.name, f.price, f.level, sel, () => b.setTool(sel ? null : { mode: 'place', type: f.id }), () => thumb(f.asset, f.tint)));
    }
  } else if (cat === 'walldeco') {
    // wall pieces are one of a kind: pick one, then tap a wall to hang it; ones already up just get selected
    items.append(h('div.bitem.charm', { title: t('Café charm') }, I('icon_star', 34), h('span', t('Café charm')), h('span.pill', Math.round(g.rating.parts.decor * 100) + '%')));
    for (const w of WALL_DECOR) {
      const owned = s.wallDeco.includes(w.id);
      const sel = owned ? b.selectedWall === w.id : b.tool && b.tool.mode === 'wall' && b.tool.id === w.id;
      const c = card('wd:' + w.id, w.name, w.price, owned ? 0 : w.level, sel, () => (owned ? b.selectWall(w.id) : b.setTool({ mode: 'wall', id: w.id })), () => thumb(w.asset, w.tint));
      if (owned) { c.classList.add('owned'); c.lastChild.replaceWith(h('span.pill.hung', gl('check', t('On the wall'), 12))); }
      items.append(c);
    }
  } else if (cat === 'floor') {
    for (const f of FLOORS) {
      const sel = b.tool && b.tool.mode === 'floor' && b.tool.id === f.id;
      items.append(card('fl:' + f.id, f.name, f.price, f.level, sel, () => b.setTool(sel ? null : { mode: 'floor', id: f.id }), () => thumb(f.asset, f.tint), '/tile'));
    }
  } else if (cat === 'wall') {
    const segs = g.world.size * 2 - 1;
    for (const w of WALLS) {
      const on = g.world.wallpaper === w.id;
      items.append(card('wp:' + w.id + segs, w.name + (on ? ' ✓' : ''), w.price * segs, w.level, on, () => b.applyWallpaper(w.id), () => thumb(w.asset, w.tint)));
    }
  } else if (cat === 'room') {
    const e = b.nextExpansion();
    items.append(e
      ? h('div.row', { style: { flex: 1 } }, I('icon_move', 40), h('div.grow', h('h3', t('Expand to {n}×{n}', { n: e.size })), h('div.muted', e.level > s.level ? t('Reach level {n} to unlock', { n: e.level }) : t('More room for tables, fun and decor!'))),
        h('button.btn.primary' + (e.level > s.level ? '.disabled' : ''), { onclick: () => b.expand() }, coinPill(e.price)))
      : h('div.row', { style: { flex: 1 } }, h('div.grow', h('h3', t('Your café is as big as it gets!')))));
  }
  const touch = g.touchMode;
  // an item is picked: the tray folds down to one line so the café is in full view, and the rotate /
  // cancel / place buttons float next to the item itself (ui.js #ghostctl)
  if (b.placing()) {
    const wid = b.wallMode() ? b.movingWall || b.tool.id : null;
    const type = wid || (b.moving ? b.moving.f.type : b.tool.type), cat2 = wid ? wallDecorById[wid] : furnitureById[type];
    const moving = !!(b.moving || b.movingWall);
    const tip = b.message ? b.message.text : t(b.locked ? (touch ? 'Tap ✓ to place, or tap another spot' : 'Click ✓ to place, or click another spot')
      : wid ? (touch ? 'Tap a wall where it should hang' : 'Click a wall where it should hang') : touch ? 'Tap the floor where it should go' : 'Click the floor where it should go');
    bar.replaceChildren(h('div.card.bb-mini',
      h('div.thumb-slot', cachedThumb((wid ? 'wd:' : 'f:') + type, () => thumb(cat2.asset, cat2.tint))),
      h('div.grow', h('b', cat2.name, moving ? '' : ' ', moving ? null : coinPill(cat2.price)), h('div.muted' + (b.message && b.message.kind === 'bad' ? '.bad' : ''), tip)),
      h('button.btn.small', { onclick: () => b.cancelPlacing() }, moving ? t('Cancel') : t('Back to items'))));
    return;
  }
  const hint = b.tool ? (b.tool.mode === 'floor' ? (touch ? 'Tap or drag over tiles to paint' : 'Click or drag over tiles to paint') : '')
    : touch ? 'Pick an item to buy, or tap furniture to rotate / move / sell it' : 'Pick an item to buy, or click furniture to rotate / move / sell it';
  const msg = h('div.bmsg' + (b.message ? '.' + b.message.kind : ''), b.message ? b.message.text : t(hint));
  bar.replaceChildren(h('div.card', tabs, items, h('div.bb-msg', msg)));
  // keep the chosen category tab in view (the row scrolls sideways on phones)
  const on = tabs.querySelector('.tab.on'), row = on && on.parentElement;
  if (on && row.scrollWidth > row.clientWidth) row.scrollLeft = on.offsetLeft - row.offsetLeft - (row.clientWidth - on.offsetWidth) / 2;
}
