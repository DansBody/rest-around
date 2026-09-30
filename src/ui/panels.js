// Panel contents. Each panel re-renders on state changes (and once a second when `live`).
import { h, fmt } from '../util.js';
import { assets } from '../assets.js';
import { portrait, drawPortrait, thumb } from './ui.js';
import {
  ROLES, SNACKS, DISHES, DISH_CATS, dishPrice, dishPoints, levelUpCost, MAX_DISH_LEVEL, menuSlots, staffSlots,
  INGREDIENTS, ingById, SEEDS, FURNITURE, FLOORS, WALLS, furnitureById, SELL_RATE,
  SKIN_TONES, HAIR_COLORS, OUTFIT_COLORS, HAIR_STYLES, TOP_STYLES, BOTTOM_STYLES, HAT_STYLES,
} from '../data.js';
import { clearSave, save } from '../save.js';
import { audio } from '../audio.js';

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
  const staff = g.staff;
  const slots = staffSlots(s.level);
  body.append(h('div.muted', `${staff.length} / ${slots} staff slots · staff tire while working. Feed them snacks to perk them up!`));
  body.append(h('div.section-title', 'Your team'));
  for (const a of staff) {
    const bar = h('i', { style: { width: a.energy + '%' } });
    body.append(h('div.row', { 'data-staff': a.id },
      portrait(a.look, 64, 80, { mode: a.napping ? 'nap' : 'idle' }),
      h('div.grow',
        h('h3', a.name, ' ', h('span.muted', '· ' + ROLES[a.role].name)),
        h('div.muted.task', a.napping ? '😴 Napping' : a.task),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '4px', margin: '4px 0' } }, I('icon_energy', 18), h('div.pbar' + (a.energy < 25 ? '.orange' : ''), { style: { flex: 1 } }, bar)),
        h('div.btnrow',
          SNACKS.map((sn) => h('button.btn.small', { title: `${sn.name}: +${sn.energy} energy (${s.snacks[sn.id] ? 'from pantry' : sn.price + ' coins'})`, onclick: () => g.eco.feed(a, sn.id) }, I(sn.asset, 20), `×${s.snacks[sn.id] || 0}`)),
          h('button.btn.small', { onclick: () => { ui.subview = { outfit: a }; ui.renderPanel(); } }, 'Outfit'),
          confirmBtn('button.btn.small.danger', 'Fire', `Let ${a.name} go?`, () => g.eco.fire(a)),
          h('button.btn.small', { onclick: () => ui.select(a), title: 'Show on the floor' }, '👁')))));
  }
  body.append(h('div.section-title', 'Hire'));
  const full = staff.length >= slots;
  for (const [role, r] of Object.entries(ROLES)) {
    const count = staff.filter((a) => a.role === role).length;
    const note = { waiter: 'Takes orders, serves food, clears tables.', chef: 'Cooks at a free stove.', cleaner: 'Sweeps trash & repairs broken restrooms/arcades.', bartender: 'Mixes drinks at the Juice Bar.' }[role];
    body.append(h('div.row',
      I(role === 'chef' ? 'hat_chef' : role === 'cleaner' ? 'held_broom' : role === 'bartender' ? 'held_shaker' : 'held_tray', 40),
      h('div.grow', h('h3', r.name, h('span.muted', ` · you have ${count}`)), h('div.muted', note)),
      h('button.btn.primary.small' + (full || !g.eco.canAfford(r.hire) ? '.disabled' : ''), { onclick: () => g.eco.hire(role) }, 'Hire ', coinPill(r.hire))));
  }
  if (full) body.append(h('div.muted', 'All slots are full — reach the next level for more.'));
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
  const pc = portrait(look, 150, 190, { zoom: 1 });
  pc.style.margin = '0 auto'; pc.style.display = 'block';
  let facing = 'fl';
  const redraw = () => drawPortrait(pc, look, { facing, t: g.renderTime });
  const set = () => { redraw(); g.changed('look'); };
  const cycle = (arr, cur, d) => arr[(arr.indexOf(cur) + d + arr.length) % arr.length];
  const stepper = (label, get, setv, arr) => h('div.orow', h('span', label), h('div.stepper',
    h('button.btn.small', { onclick: () => { setv(cycle(arr, get(), -1)); set(); ui.renderPanel(); } }, '◀'),
    h('span', get() || 'none'),
    h('button.btn.small', { onclick: () => { setv(cycle(arr, get(), 1)); set(); ui.renderPanel(); } }, '▶')));
  const swatches = (label, colors, get, setv) => h('div.orow', h('span', label), h('div.swatches', colors.map((c) => h('span.sw' + (get() === c ? '.on' : ''), { style: { background: c }, onclick: () => { setv(c); set(); ui.renderPanel(); } }))));
  body.append(
    h('div.btnrow', { style: { marginBottom: '6px' } }, h('button.btn.small', { onclick: () => { ui.subview = null; ui.renderPanel(); } }, '◀ Back'), h('b', { style: { alignSelf: 'center' } }, `${a.name}'s wardrobe`)),
    pc,
    h('div.btnrow', { style: { justifyContent: 'center' } }, h('button.btn.small', { onclick: () => { facing = { fl: 'fr', fr: 'br', br: 'bl', bl: 'fl' }[facing]; redraw(); } }, '↻ Turn')),
    swatches('Skin', SKIN_TONES, () => look.skin, (v) => { look.skin = v; }),
    stepper('Hair', () => look.hair[0], (v) => { look.hair[0] = v; }, HAIR_STYLES),
    swatches('', HAIR_COLORS, () => look.hair[1], (v) => { look.hair[1] = v; }),
    stepper('Top', () => look.top[0], (v) => { look.top[0] = v; }, TOP_STYLES),
    swatches('', OUTFIT_COLORS, () => look.top[1], (v) => { look.top[1] = v; }),
    stepper('Bottom', () => look.bottom[0], (v) => { look.bottom[0] = v; }, BOTTOM_STYLES),
    swatches('', OUTFIT_COLORS, () => look.bottom[1], (v) => { look.bottom[1] = v; }),
    stepper('Hat', () => (look.hat ? look.hat[0] : null), (v) => { look.hat = v ? [v, look.hat ? look.hat[1] : '#ffffff'] : null; }, HAT_STYLES),
    look.hat ? swatches('', ['#ffffff', ...OUTFIT_COLORS], () => look.hat[1], (v) => { look.hat[1] = v; }) : null,
    swatches('Shoes', ['#6b5040', '#5b5b6e', '#b86a5a', '#f2efe9', '#6a8fb3', '#e59aa8'], () => look.shoe, (v) => { look.shoe = v; }));
  ui.outfitCanvas = { pc, redraw };
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
          h('button.btn.small' + (st.on ? '.primary' : ''), { onclick: () => g.eco.toggleMenu(d.id) }, st.on ? '✓ On menu' : 'Add to menu'),
          maxed ? null : h('button.btn.small' + (canAdd ? '' : '.disabled'), { onclick: () => g.eco.contribute(d.id), title: 'Put pantry ingredients toward the next dish level' }, '🥣 Add ingredients')) : null)));
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
  const toggle = (label, key, after) => h('div.toggle', h('span', label), h('button.btn.small' + (s.settings[key] ? '.primary' : ''), { onclick: () => { s.settings[key] = !s.settings[key]; if (after) after(); ui.renderPanel(); } }, s.settings[key] ? 'On' : 'Off'));
  body.append(
    h('div.section-title', 'Restaurant name'), name,
    h('div.section-title', 'Sound'),
    toggle('Sound effects', 'sound', () => { audio.enabled = s.settings.sound; audio.unlock(); g.sfx('click'); }),
    h('div.orow', h('span', 'Volume'), vol),
    h('div.section-title', 'Game'),
    toggle('Auto-open next day', 'autoNextDay'),
    h('div.btnrow',
      h('button.btn.small', { onclick: () => { ui.toast(save(g) ? 'Saved!' : 'Could not save (storage blocked?)', 'good'); } }, '💾 Save now'),
      confirmBtn('button.btn.small.danger', 'Reset game', 'Tap again to erase everything', () => { g.resetting = true; clearSave(); location.reload(); })),
    h('div.muted', { style: { marginTop: '6px' } }, 'Progress autosaves every 10 seconds and when you close the tab.'),
    h('div.section-title', 'Controls'),
    h('div.muted', { style: { lineHeight: 1.8 } },
      'Drag to pan · Wheel to zoom · Click a character for details', h('br'),
      h('kbd', 'B'), ' build · ', h('kbd', 'R'), ' rotate · ', h('kbd', 'Del'), ' sell · ', h('kbd', 'Esc'), ' cancel/close · ', h('kbd', '`'), ' debug'),
    h('div.section-title', 'About'),
    h('div.muted', 'Rest Around — a cozy isometric bistro. Art is swappable: drop PNGs into assets/ (see ASSETS.md).'));
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
    BUILD_CATS.map((c) => h('button.btn.small.tab' + (c.id === cat ? '.on' : ''), { onclick: () => { ui.buildCat = c.id; b.setTool(null); } }, c.name)),
    h('div.grow'),
    h('button.btn.primary.done', { onclick: () => b.exit() }, '✓ Done'));
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
      h('button.btn.small', { onclick: () => { b.selected = null; ui.renderBuild(); } }, '✕'));
  }
  bar.replaceChildren(h('div.card', sel, tabs, items, h('div', { style: { marginTop: '4px' } }, msg)));
}
