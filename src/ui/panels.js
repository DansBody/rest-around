// Panel contents. Each panel re-renders on state changes (and once a second when `live`).
import { h, fmt } from '../util.js';
import { assets } from '../assets.js';
import { portrait, thumb } from '../portrait.js';
import { ACCESSORIES, roleLook } from '../looks.js';
import {
  ROLES, SNACKS, DISHES, DISH_CATS, dishPrice, dishPoints, levelUpCost, MAX_DISH_LEVEL, menuSlots, staffSlots,
  INGREDIENTS, ingById, SEEDS, FURNITURE, FLOORS, WALLS, furnitureById, SELL_RATE,
  OUTFIT_COLORS, CHARACTER_MODELS, SKILL, ABILITIES, ABILITY_UNLOCK_LV,
} from '../data.js';
import { clearSave, save } from '../save.js';
import { audio } from '../audio.js';
import { gl, glyph } from './icons.js';
import { glassFx } from './glass.js';

const I = (id, s = 22) => assets.iconEl(id, s);
/** Danger button that asks for a second tap instead of a browser confirm() dialog. */
function confirmBtn(sel, label, ask, action) {
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
    h('b', ab.name), long ? h('span', '— ' + ab.desc) : h('span', unlocked ? '· charges while working, fires by itself' : `· unlocks at ${SKILL.titles[ABILITY_UNLOCK_LV - 1]}`));
}
/** Five small stars for a staff skill level. */
export function skillStars(lv, size = 13) {
  return h('span.skill-stars', { title: `Skill Lv${lv}: ${SKILL.titles[lv - 1]}` }, [1, 2, 3, 4, 5].map((i) => glyph(i <= lv ? 'star' : 'star_empty', size)));
}
/** "Skilled Chef" + stars + progress to the next skill level. */
export function skillLine(a, role = a.role) {
  const lv = a.skillLv(role), xp = a.xpIn(role);
  const lo = SKILL.levels[lv - 1], hi = SKILL.levels[lv];
  const frac = hi == null ? 1 : (xp - lo) / (hi - lo);
  return h('div.skill',
    skillStars(lv),
    h('span', `${SKILL.titles[lv - 1]} ${ROLES[role].name}`),
    h('div.pbar.gold.xp', { title: hi == null ? 'Max skill' : `${xp - lo}/${hi - lo} XP to ${SKILL.titles[lv]}` }, h('i', { style: { width: Math.round(frac * 100) + '%' } })));
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
  body.append(h('div.muted', `${staff.length} / ${slots} staff slots · staff tire while working. Feed them snacks to perk them up!`));
  body.append(h('div.section-title', 'Your team'));
  for (const a of staff) {
    const bar = h('i', { style: { width: a.energy + '%' } });
    body.append(h('div.row', { 'data-staff': a.id },
      portrait(a.look, 64, 80),
      h('div.grow',
        h('h3', a.name, ' ', h('span.muted', '· ' + ROLES[a.role].name)),
        skillLine(a),
        abilityLine(a.role, a.abilityUnlocked()),
        h('div.muted.task', a.napping ? '😴 Napping' : a.task),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '4px', margin: '4px 0' } }, I('icon_energy', 18), h('div.pbar' + (a.energy < 25 ? '.orange' : ''), { style: { flex: 1 } }, bar)),
        h('div.btnrow',
          SNACKS.map((sn) => h('button.btn.small', { title: `${sn.name}: +${sn.energy} energy (${s.snacks[sn.id] ? 'from pantry' : sn.price + ' coins'})`, onclick: () => g.eco.feed(a, sn.id) }, I(sn.asset, 20), `×${s.snacks[sn.id] || 0}`)),
          h('button.btn.small', { onclick: () => { ui.subview = { outfit: a }; ui.renderPanel(); } }, 'Outfit'),
          h('button.btn.small', { onclick: () => { ui.subview = { job: a }; ui.renderPanel(); } }, 'Change job'),
          confirmBtn('button.btn.small.danger', 'Fire', `Let ${a.name} go?`, () => g.eco.fire(a)),
          h('button.btn.small', { onclick: () => ui.select(a), title: 'Show on the floor' }, gl('eye', null, 16))))));
  }
  body.append(h('div.section-title', 'Hire'));
  const full = staff.length >= slots;
  for (const [role, r] of Object.entries(ROLES)) {
    const count = staff.filter((a) => a.role === role).length;
    const note = ROLE_NOTE[role];
    body.append(h('div.row',
      portrait(roleLook(role), 48, 48),
      h('div.grow', h('h3', r.name, h('span.muted', ` · you have ${count}`)), h('div.muted', note)),
      h('button.btn.primary.small' + (full || !g.eco.canAfford(r.hire) ? '.disabled' : ''), { onclick: () => g.eco.hire(role) }, 'Hire ', coinPill(r.hire))));
  }
  if (full) body.append(h('div.muted', 'All slots are full — reach the next level for more.'));
}
const ROLE_NOTE = { waiter: 'Takes orders, serves food, clears tables.', chef: 'Cooks at a free stove.', cleaner: 'Sweeps trash & repairs broken restrooms/arcades.', bartender: 'Mixes drinks at the Juice Bar.' };
function renderJobChange(ui, body, a) {
  const g = ui.game;
  if (!g.staff.includes(a)) { ui.subview = null; return renderStaff(ui, body); }
  body.append(
    h('div.btnrow', { style: { marginBottom: '8px' } }, h('button.btn.small', { onclick: () => { ui.subview = null; ui.renderPanel(); } }, gl('back', 'Back', 14)), h('b', { style: { alignSelf: 'center' } }, `${a.name}'s career`)),
    h('div.row', portrait(a.look, 64, 64), h('div.grow', h('h3', a.name), skillLine(a), h('div.muted', `Works ${Math.round((a.skillMul - 1) * 100)}% faster than a novice`))),
    h('div.section-title', 'Retrain as'));
  const roles = Object.keys(ROLES);
  for (const role of roles) {
    const r = ROLES[role], cur = role === a.role;
    const fee = g.eco.jobChangeFee(a, role);
    const action = cur
      ? h('span.pill', 'Current job')
      : h('button.btn.primary.small' + (fee && !g.eco.canAfford(fee) ? '.disabled' : ''), { onclick: () => { if (g.eco.changeJob(a, role)) { ui.subview = null; ui.renderPanel(); } } },
        'Retrain', fee ? coinPill(fee) : h('span.pill', 'Free'));
    body.append(h('div.row' + (cur ? '.current' : ''),
      portrait(roleLook(role), 48, 48),
      h('div.grow', h('h3', r.name), skillLine(a, role), h('div.muted', ROLE_NOTE[role]), abilityLine(role, a.skillLv(role) >= ABILITY_UNLOCK_LV, true),
        role === 'bartender' && !g.world.byKind('bar').length ? h('div.bmsg.warn', { style: { marginTop: '4px', display: 'inline-block' } }, 'Needs a Juice Bar to work') : null),
      action));
  }
  body.append(h('div.muted', { style: { marginTop: '6px', lineHeight: 1.5 } },
    `Staff gain experience by finishing jobs in their current role and keep it in every role they've had. Skill makes them walk and work faster (up to +${Math.round((SKILL.mul[SKILL.mul.length - 1] - 1) * 100)}% as a Master). Retraining costs half the hiring fee — going back to a job they're already ${SKILL.titles[SKILL.freeReturnLv - 1]} or better at is free.`));
}
function tickStaff(ui, body) {
  // keep energy bars moving between full renders
  for (const row of body.querySelectorAll('[data-staff]')) {
    const a = ui.game.staff.find((x) => String(x.id) === row.dataset.staff);
    if (!a) continue;
    const bar = row.querySelector('.pbar i');
    if (bar) bar.style.width = a.energy + '%';
    const t = row.querySelector('.task');
    if (t) t.textContent = a.napping ? '😴 Napping' : a.task;
  }
}

function renderOutfit(ui, body, a) {
  const g = ui.game;
  const look = a.look;
  const refresh = () => { g.refreshCharacter(a); g.changed('look'); ui.renderPanel(); };
  const names = { knight: 'Knight', mage: 'Mage', barbarian: 'Barbarian', rogue: 'Rogue', rogue_hooded: 'Hooded Rogue' };
  const accName = (n) => n.split('_').slice(1).join(' ').replace('Hooded', 'Hood');
  const pc = portrait(look, 150, 190);
  pc.style.margin = '0 auto'; pc.style.display = 'block';
  const models = CHARACTER_MODELS;
  body.append(
    h('div.btnrow', { style: { marginBottom: '6px' } }, h('button.btn.small', { onclick: () => { ui.subview = null; ui.renderPanel(); } }, gl('back', 'Back', 14)), h('b', { style: { alignSelf: 'center' } }, `${a.name}'s wardrobe`)),
    pc,
    h('div.orow', h('span', 'Character'), h('div.stepper',
      h('button.btn.small', { onclick: () => { look.model = models[(models.indexOf(look.model) + models.length - 1) % models.length]; look.hide = []; refresh(); } }, gl('back', null, 14)),
      h('span', names[look.model] || look.model),
      h('button.btn.small', { onclick: () => { look.model = models[(models.indexOf(look.model) + 1) % models.length]; look.hide = []; refresh(); } }, gl('forward', null, 14)))),
    h('div.orow', h('span', 'Wear'), h('div.btnrow', (ACCESSORIES[look.model] || []).map((n) => {
      const on = !(look.hide || []).includes(n);
      return h('button.btn.small' + (on ? '.primary' : ''), { onclick: () => { look.hide = on ? [...(look.hide || []), n] : (look.hide || []).filter((x) => x !== n); refresh(); } }, on ? gl('check', accName(n), 14) : accName(n));
    }))),
    h('div.orow', h('span', 'Outfit tint'), h('div.swatches',
      h('span.sw' + (!look.tint ? '.on' : ''), { style: { background: 'linear-gradient(135deg,#fff 45%,#e9dccb 55%)' }, title: 'Original colours', onclick: () => { look.tint = null; refresh(); } }),
      OUTFIT_COLORS.map((c) => h('span.sw' + (look.tint === c ? '.on' : ''), { style: { background: c }, onclick: () => { look.tint = c; refresh(); } })))),
    h('div.orow', h('span', 'Chef hat'), h('button.btn.small' + (look.roleHat ? '.primary' : ''), { onclick: () => { look.roleHat = look.roleHat ? null : 'chef'; refresh(); } }, look.roleHat ? 'On' : 'Off')),
    h('div.muted', 'Characters come from the KayKit Adventurers pack (CC0). Drop in other glTF characters via assets/manifest.json.'));
}

// ------------------------------------------------------------------ menu
function renderMenu(ui, body) {
  const g = ui.game, s = g.state;
  const cat = ui.menuCat || 'starter';
  const slots = menuSlots(s.level);
  body.append(h('div.tabs', DISH_CATS.map((c) => h('button.btn.small.tab' + (c.id === cat ? '.on' : ''), { onclick: () => { ui.menuCat = c.id; ui.renderPanel(); } }, `${c.name} ${g.eco.menuCount(c.id)}/${slots[c.id]}`))));
  if (cat === 'drink') {
    const ok = g.world.byKind('bar').length && g.staff.some((a) => a.role === 'bartender');
    if (!ok) body.append(h('div.row', I('emote_menu', 32), h('div.grow.muted', 'Drinks need a Juice Bar (Build → Kitchen) and a Bartender (Staff → Hire).')));
  }
  if (slots[cat] === 0) body.append(h('div.muted', { style: { margin: '6px 2px' } }, `No ${cat} slots yet — they open up as you level.`));
  for (const d of DISHES.filter((x) => x.cat === cat)) {
    const st = s.dishes[d.id];
    const unlocked = g.eco.dishUnlocked(d.id);
    const need = levelUpCost(st.lv);
    const maxed = st.lv >= MAX_DISH_LEVEL;
    const ings = d.ings.map((i) => {
      const p = st.prog[i] || 0;
      return h('span.ing' + (p >= need || maxed ? '.done' : ''), { title: `${ingById[i].name}: ${p}/${need} added · ${s.inv[i] || 0} in pantry` }, I('ing_' + i, 20), maxed ? '✓' : `${p}/${need}`, h('span.muted', ` (${s.inv[i] || 0})`));
    });
    const canAdd = unlocked && !maxed && d.ings.some((i) => (s.inv[i] || 0) > 0 && (st.prog[i] || 0) < need);
    body.append(h('div.row' + (unlocked ? '' : '.locked'),
      I(d.asset, 56),
      h('div.grow',
        h('h3', d.name, ' ', h('span.pill', `Lv${st.lv}`)),
        h('div', { style: { display: 'flex', gap: '6px', margin: '2px 0' } }, coinPill(dishPrice(d, st.lv)), h('span.pill', I('icon_points', 18), dishPoints(d, st.lv)), h('span.pill', '⏱ ' + d.cook + 's')),
        unlocked ? h('div.ings', ings) : h('div.muted', I('icon_lock', 16), ` Unlocks at level ${d.level}`),
        unlocked ? h('div.btnrow',
          h('button.btn.small' + (st.on ? '.primary' : ''), { onclick: () => g.eco.toggleMenu(d.id) }, st.on ? gl('check', 'On menu', 14) : 'Add to menu'),
          maxed ? null : h('button.btn.small' + (canAdd ? '' : '.disabled'), { onclick: () => g.eco.contribute(d.id), title: 'Put pantry ingredients toward the next dish level' }, gl('bowl', 'Add ingredients', 15))) : null)));
  }
  body.append(h('div.muted', { style: { marginTop: '6px' } }, 'Collect every ingredient in a recipe to level a dish (Lv1→10): higher price and more gourmet points. Get ingredients from the Garden, the Market and the daily gift.'));
}

// ------------------------------------------------------------------ garden
function renderGarden(ui, body) {
  const g = ui.game, s = g.state;
  body.append(h('div.muted', 'Plant seeds, keep the soil watered, and harvest fresh ingredients. Plots only grow while watered.'));
  const pick = ui.seedPick;
  const grid = h('div.grid2', { style: { marginTop: '8px' } });
  s.garden.forEach((p, i) => {
    const seed = p.crop ? g.eco.seedFor(p.crop) : null;
    const soil = h('div.soil', I('garden_soil', 112));
    soil.firstChild.style.left = '0'; soil.firstChild.style.top = '6px';
    if (p.crop) {
      const grown = p.prog;
      const icon = grown < 0.3 ? I('garden_sprout', 30 + grown * 40) : I('ing_' + p.crop, 20 + grown * 26);
      icon.style.left = '50%'; icon.style.top = '44%'; icon.style.transform = 'translate(-50%,-70%)';
      if (grown >= 1) icon.style.animation = 'wiggle 1.2s infinite';
      soil.append(icon);
    }
    const tile = h('div.tile.plot', soil);
    if (!p.crop) {
      tile.append(h('b', 'Empty plot'), h('button.btn.small.primary', { onclick: () => { ui.seedPick = i; ui.renderPanel(); } }, I('icon_seed', 18), 'Plant'));
    } else {
      tile.append(...[h('b', ingById[p.crop].name + (p.prog >= 1 ? ' — ready!' : '')),
        h('div', { style: { width: '100%' }, title: 'Growth' }, h('div.pbar.green', h('i', { style: { width: p.prog * 100 + '%' } }))),
        p.prog < 1 ? h('div', { style: { width: '100%', display: 'flex', alignItems: 'center', gap: '3px' }, title: 'Water' }, I('icon_water', 16), h('div.pbar' + (p.water <= 0 ? '.red' : ''), { style: { flex: 1 } }, h('i', { style: { width: p.water * 100 + '%' } }))) : null,
        p.prog >= 1
          ? h('button.btn.small.primary', { onclick: () => { const r = g.eco.harvest(i); if (r) ui.toast(`Harvested ${r.n} ${ingById[r.crop].name}!`, 'good'); } }, I('icon_harvest', 18), 'Harvest')
          : h('button.btn.small' + (p.water < 0.5 ? '.primary' : ''), { onclick: () => g.eco.water(i) }, I('icon_water', 18), p.water <= 0 ? 'Thirsty!' : 'Water'),
        h('span.muted', p.prog >= 1 ? `+${seed.yield}` : `${Math.ceil((1 - p.prog) * seed.grow)}s left`)].filter(Boolean));
    }
    grid.append(tile);
  });
  body.append(grid);
  if (pick != null && s.garden[pick] && !s.garden[pick].crop) {
    body.append(h('div.section-title', `Choose seeds for plot ${pick + 1}`));
    for (const sd of SEEDS) {
      const locked = sd.level > s.level;
      body.append(h('div.row' + (locked ? '.locked' : ''), I('ing_' + sd.crop, 36),
        h('div.grow', h('h3', ingById[sd.crop].name), h('div.muted', locked ? `Unlocks at level ${sd.level}` : `${sd.grow}s to grow · yields ${sd.yield}`)),
        locked ? I('icon_lock', 24) : h('button.btn.small.primary', { onclick: () => { g.eco.plant(pick, sd.crop); ui.seedPick = null; ui.renderPanel(); } }, coinPill(sd.price))));
    }
    body.append(h('button.btn.small', { onclick: () => { ui.seedPick = null; ui.renderPanel(); } }, 'Cancel'));
  }
  body.append(h('div.section-title', 'Pantry'), pantry(s));
}

function pantry(s) {
  const items = INGREDIENTS.filter((i) => s.inv[i.id]).map((i) => h('span.ing', { title: i.name }, I('ing_' + i.id, 22), '×' + s.inv[i.id]));
  return h('div.ings', items.length ? items : h('span.muted', 'Empty — grow or buy some ingredients!'));
}

// ------------------------------------------------------------------ market
function renderMarket(ui, body) {
  const g = ui.game, s = g.state;
  if (g.eco.giftAvailable()) body.append(h('div.row', I('icon_gift', 44), h('div.grow', h('h3', 'Daily gift'), h('div.muted', 'Free ingredients and coins, once per day.')), h('button.btn.primary.small', { onclick: () => ui.claimGift() }, 'Open!')));
  body.append(h('div.section-title', 'Ingredients'));
  const grid = h('div.grid2');
  for (const i of INGREDIENTS) {
    const ok = g.eco.ingredientAvailable(i.id);
    const price = g.eco.ingredientPrice(i.id);
    grid.append(h('div.tile' + (ok ? '' : '.locked'), I('ing_' + i.id, 36), h('b', i.name), h('span.muted', `have ${s.inv[i.id] || 0}${i.source === 'garden' ? ' · grows in garden' : ''}`),
      ok ? h('div.btnrow', h('button.btn.small', { onclick: () => g.eco.buyIngredient(i.id, 1) }, coinPill(price)), h('button.btn.small', { onclick: () => g.eco.buyIngredient(i.id, 5) }, '×5 ', coinPill(price * 5)))
        : h('span.muted', I('icon_lock', 16), ` Lv ${i.level}`)));
  }
  body.append(grid);
  body.append(h('div.section-title', 'Staff snacks'));
  for (const sn of SNACKS) {
    body.append(h('div.row', I(sn.asset, 36), h('div.grow', h('h3', sn.name), h('div.muted', `+${sn.energy} energy · you have ${s.snacks[sn.id] || 0}`)),
      h('button.btn.small', { onclick: () => g.eco.buySnack(sn.id) }, coinPill(sn.price))));
  }
}

// ------------------------------------------------------------------ settings
function renderSettings(ui, body) {
  const g = ui.game, s = g.state;
  const name = h('input', { type: 'text', value: s.name, maxlength: 24 });
  name.addEventListener('change', () => { s.name = name.value.trim().slice(0, 24) || 'Maple Nook'; document.title = `${s.name} · Rest Around`; });
  const vol = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: s.settings.volume });
  vol.addEventListener('input', () => { s.settings.volume = +vol.value; audio.setVolume(+vol.value); });
  const toggle = (label, key, after) => h('div.toggle', h('span', label),
    h('button.switch' + (s.settings[key] ? '.on' : ''), { role: 'switch', 'aria-checked': String(!!s.settings[key]), title: label, onclick: () => { s.settings[key] = !s.settings[key]; if (after) after(); ui.renderPanel(); } }));
  body.append(
    h('div.section-title', 'Restaurant name'), name,
    h('div.section-title', 'Sound'),
    toggle('Sound effects', 'sound', () => { audio.enabled = s.settings.sound; audio.unlock(); g.sfx('click'); }),
    h('div.orow', h('span', 'Volume'), vol),
    h('div.section-title', 'Game'),
    toggle('Auto-open next day', 'autoNextDay'),
    glassFx.supported ? toggle('Liquid glass refraction', 'glass', () => glassFx.setEnabled(s.settings.glass)) : null,
    h('div.btnrow',
      h('button.btn.small', { onclick: () => { ui.toast(save(g) ? 'Saved!' : 'Could not save (storage blocked?)', 'good'); } }, gl('save', 'Save now', 15)),
      confirmBtn('button.btn.small.danger', 'Reset game', 'Tap again to erase everything', () => { g.resetting = true; clearSave(); location.reload(); })),
    h('div.muted', { style: { marginTop: '6px' } }, 'Progress autosaves every 10 seconds and when you close the tab.'),
    h('div.section-title', 'Controls'),
    h('div.muted', { style: { lineHeight: 1.8 } },
      'Drag to pan · Wheel or pinch to zoom · Right-drag, two-finger twist or ', h('kbd', 'Q'), '/', h('kbd', 'E'), ' to turn the camera · Click a character for details', h('br'),
      h('kbd', 'B'), ' build · ', h('kbd', 'R'), ' rotate · ', h('kbd', 'Del'), ' sell · ', h('kbd', 'Esc'), ' cancel/close · ', h('kbd', '`'), ' debug'),
    h('div.section-title', 'About'),
    h('div.muted', 'Rest Around — a cozy 3D bistro. Art is swappable: drop glTF models or PNGs into assets/ (see ASSETS.md).'));
}

// ------------------------------------------------------------------ build tray
const BUILD_CATS = [
  { id: 'dining', name: 'Tables & Chairs' }, { id: 'kitchen', name: 'Kitchen' }, { id: 'fun', name: 'Fun' }, { id: 'decor', name: 'Decor' },
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
    h('div.tabs', BUILD_CATS.map((c) => h('button.btn.small.tab' + (c.id === cat ? '.on' : ''), { onclick: () => { ui.buildCat = c.id; b.setTool(null); } }, c.name))),
    h('div.grow'),
    h('button.btn.primary.done', { onclick: () => b.exit() }, gl('check', 'Done', 16)));
  const items = h('div.bb-items');
  const card = (key, name, price, lvl, sel, onclick, thumbFn, sub) => {
    const locked = lvl > s.level;
    return h('div.bitem' + (sel ? '.sel' : '') + (locked ? '.locked' : ''), { onclick: locked ? () => b.say(`Unlocks at level ${lvl}`, 'bad') : onclick, title: name },
      cachedThumb(key, thumbFn), h('span', name), locked ? h('span.muted', I('icon_lock', 14), ` Lv ${lvl}`) : h('span.pill', I('icon_coin', 16), price + (sub || '')));
  };
  if (['dining', 'kitchen', 'fun', 'decor'].includes(cat)) {
    for (const f of FURNITURE.filter((x) => x.cat === cat)) {
      const sel = b.tool && b.tool.mode === 'place' && b.tool.type === f.id;
      items.append(card('f:' + f.id, f.name, f.price, f.level, sel, () => b.setTool(sel ? null : { mode: 'place', type: f.id }), () => thumb(f.asset, f.tint)));
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
      ? h('div.row', { style: { flex: 1 } }, I('icon_move', 40), h('div.grow', h('h3', `Expand to ${e.size}×${e.size}`), h('div.muted', e.level > s.level ? `Reach level ${e.level} to unlock` : 'More room for tables, fun and decor!')),
        h('button.btn.primary' + (e.level > s.level ? '.disabled' : ''), { onclick: () => b.expand() }, coinPill(e.price)))
      : h('div.row', { style: { flex: 1 } }, h('div.grow', h('h3', 'Your restaurant is as big as it gets!'))));
  }
  const msgText = b.message ? b.message.text : b.moving ? 'Moving — click a new spot' : b.tool ? (b.tool.mode === 'floor' ? 'Click or drag over tiles to paint' : 'Click the floor to place · R rotates · right-click / Esc to stop') : 'Pick an item to buy, or click furniture to rotate / move / sell it';
  const msg = h('div.bmsg' + (b.message ? '.' + b.message.kind : ''), msgText);
  // selected furniture: rotate / move / sell
  const f = b.selected;
  let sel = null;
  if (f && !b.moving) {
    const cat2 = furnitureById[f.type];
    sel = h('div.bb-sel',
      h('b', cat2.name + (f.broken ? ' (broken)' : '')),
      h('button.btn.small', { onclick: () => b.rotateSelected() }, I('icon_rotate', 20), 'Rotate'),
      h('button.btn.small', { onclick: () => b.startMove() }, I('icon_move', 20), 'Move'),
      h('button.btn.small.danger', { onclick: () => b.sellSelected() }, I('icon_sell', 20), `Sell +${Math.floor(cat2.price * SELL_RATE)}`),
      h('button.btn.small', { onclick: () => { b.selected = null; ui.renderBuild(); } }, gl('close', null, 14)));
  }
  bar.replaceChildren(h('div.card', sel, tabs, items, h('div', { style: { marginTop: '4px' } }, msg)));
}
