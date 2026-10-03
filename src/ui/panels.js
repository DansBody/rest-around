// Panel contents. Each panel re-renders on state changes (and once a second when `live`).
import { h, fmt } from '../util.js';
import { assets } from '../assets.js';
import { portrait, thumb } from '../portrait.js';
import { ACCESSORIES, roleLook } from '../looks.js';
import {
  ROLES, SNACKS, snackById, DISHES, DISH_CATS, EXTRA_CAT, WALL_DECOR, wallDecorById, dishPrice, dishPoints, MAX_DISH_LEVEL, dishCap, menuSlots, staffSlots,
  INGREDIENTS, ingById, FURNITURE, FLOORS, WALLS, furnitureById, SELL_RATE,
  UNIQUE_MODELS, UNIQUE_NAMES, SKILL, ABILITIES, ABILITY_UNLOCK_LV, KITS, KIT_ACTIVES, CLUBS, staffWage, perRound, servingCost, SERVINGS_PER_UNIT, OFFLINE,
} from '../data.js';
import { clearSave, save, serialize } from '../save.js';
import { cloud } from '../cloud.js';
import { accountSection } from './account.js';
import { renderFriends } from './friends.js';
import { renderTraining } from './training.js';
import { renderToday, tickToday } from './today.js';
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
const LOCKED = '#a1a1a6', PERK = '#2f9bff', DRAWBACK = '#e0783d';
/** One skill: icon, then the name with a tag saying how it fires, and the description under the name
 *  (every description starts on the same left edge, whatever the name's length). */
function skillItem(kind, gid, color, name, tag, desc) {
  return h('div.sk.' + kind, { style: { '--c': color }, title: desc || '' },
    h('span.sk-ico', glyph(gid, 16)),
    h('div.sk-name', h('b', name), h('span.sk-tag', tag)),
    desc ? h('div.sk-desc', glue(desc)) : null);
}
/** Keep a number with the word after it ("10 秒", "3 格") so a line never ends on the bare number. */
export const glue = (text) => text.replace(/(\d%?) (?=\S)/g, '$1\u00a0');
/** The job's ability: charges while working and fires by itself. */
function jobSkill(role, unlocked, long = true) {
  const ab = ABILITIES[role];
  return skillItem('auto', unlocked ? ab.glyph : 'lock', unlocked ? ab.color : LOCKED, ab.name,
    unlocked ? t('Auto') : t('Unlocks at {title}', { title: SKILL.titles[ABILITY_UNLOCK_LV - 1] }), long ? ab.desc : null);
}
/** A character's own kit: the skill you cast from the dock, then the perks (and drawbacks) that are always on. */
export function kitLines(model, unlocked = true, long = false) {
  const kit = KITS[model];
  if (!kit) return [];
  const rows = [];
  const k = KIT_ACTIVES && kit.active;
  if (k) rows.push(skillItem('cast', unlocked ? k.glyph : 'lock', unlocked ? k.color : LOCKED, k.name,
    unlocked ? t('Cast, {n} s cooldown', { n: k.cooldown }) : t('Unlocks at skill Lv{n}', { n: ABILITY_UNLOCK_LV }), long ? k.desc : null));
  for (const p of kit.perks) rows.push(skillItem(p.bad ? 'bad' : 'perk', p.glyph, p.bad ? DRAWBACK : PERK, p.name, p.bad ? t('Drawback') : t('Always on'), long ? p.desc : null));
  return rows;
}
/** What they learned at the clubs (Training tab): used on their own when trouble starts. */
export function clubLines(a, long = false) {
  return Object.values(CLUBS).filter((c) => a.clubLv(c.id) > 0)
    .map((c) => skillItem('club', c.glyph, c.color, c.skill, t('Auto'), long ? c.desc : null));
}
/** A staff member's whole skill set, grouped by how each one fires. */
function skillList(a, role = a.role, long = true) {
  return h('div.sklist', jobSkill(role, a.skillLv(role) >= ABILITY_UNLOCK_LV, long), ...kitLines(a.look.model, a.kitUnlocked(), long), ...clubLines(a, long));
}
/** The skills as a row of small coloured icons (the collapsed staff card). */
function skillDots(a) {
  const ab = a.ability, kit = KITS[a.look.model] || { perks: [] };
  const dot = (gid, color, name) => h('span.sk-dot', { style: { '--c': color }, title: name }, glyph(gid, 14));
  return h('div.sk-dots',
    dot(a.abilityUnlocked() ? ab.glyph : 'lock', a.abilityUnlocked() ? ab.color : LOCKED, ab.name),
    kit.active ? dot(a.kitUnlocked() ? kit.active.glyph : 'lock', a.kitUnlocked() ? kit.active.color : LOCKED, kit.active.name) : null,
    ...kit.perks.map((p) => dot(p.glyph, p.bad ? DRAWBACK : PERK, p.name)),
    ...Object.values(CLUBS).filter((c) => a.clubLv(c.id) > 0).map((c) => dot(c.glyph, c.color, c.skill)));
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
  today: { title: 'Today', icon: 'tool_today', render: renderToday, tick: tickToday },
  staff: { title: 'Staff', icon: 'tool_staff', render: renderStaff, tick: tickStaff },
  menu: { title: 'Menu', icon: 'tool_menu', render: renderMenu },
  train: { title: 'Training', icon: 'tool_train', render: renderTraining },
  market: { title: 'Market', icon: 'tool_market', render: renderMarket },
  friends: { title: 'Friends', icon: 'tool_friends', render: renderFriends },
  settings: { title: 'Settings', icon: 'tool_settings', render: renderSettings },
};

// ------------------------------------------------------------------ staff
/** Asks before feeding the whole team: who gets fed, which snacks come from the pantry, what gets bought. */
function feedAllCard(ui) {
  const g = ui.game, plan = g.eco.planFeedAll();
  const close = h('button.btn', { onclick: () => ui.closeModal() }, plan.list.length ? t('Cancel') : t('OK'));
  if (!plan.list.length) return h('div.card', h('div.big-title', t('Feed all')), h('div.muted', t('Everyone is full of energy already.')), h('div.feed-btns', close));
  const line = (counts) => Object.entries(counts).map(([id, n]) => h('span.ing', I(snackById[id].asset, 22), `${snackById[id].name} ×${n}`));
  const short = plan.cost > g.state.coins;
  const go = h('button.btn.primary' + (short ? '.disabled' : ''), { onclick: () => { if (short) return; ui.closeModal(); if (g.eco.feedAll(plan)) ui.toast(t('Fed {n} staff', { n: plan.fed }), 'good'); ui.renderPanel(); } },
    plan.cost ? h('span', t('Feed for'), ' ', coinPill(plan.cost)) : t('Feed'));
  return h('div.card.feed-card',
    h('div.big-title', t('Feed all')),
    h('div.muted', t('Tops up {n} staff (anyone nearly full is skipped).', { n: plan.fed })),
    Object.keys(plan.pantry).length ? h('div.feed-row', h('b', t('From the pantry')), h('div.feed-items', line(plan.pantry))) : null,
    Object.keys(plan.buy).length ? h('div.feed-row', h('b', t('To buy')), h('div.feed-items', line(plan.buy))) : null,
    h('div.feed-row.total', h('b', t('Cost')), plan.cost ? coinPill(plan.cost) : h('span', t('Free (all from the pantry)'))),
    short ? h('div.bmsg.bad', t('Not enough coins')) : null,
    h('div.feed-btns', close, go));
}

function renderStaff(ui, body) {
  const g = ui.game, s = g.state;
  if (ui.subview && ui.subview.outfit) return renderOutfit(ui, body, ui.subview.outfit);
  if (ui.subview && ui.subview.job) return renderJobChange(ui, body, ui.subview.job);
  if (ui.subview && ui.subview.hire) return renderHirePick(ui, body, ui.subview.hire);
  const staff = g.staff;
  const slots = staffSlots(s.level);
  // the numbers up top; the rules behind them only when asked
  body.append(h('div.stat-strip',
    h('span.pill', I('tool_staff', 16), t('Staff {n}/{m}', { n: staff.length, m: slots })),
    h('span.pill', I('icon_coin', 16), t('Costs {n}/round', { n: g.eco.dailyWages() + g.eco.dailyRent() })),
    staff.length ? h('button.btn.small.feedall', { title: t('Feed the whole team'), onclick: () => ui.queueModal(() => feedAllCard(ui)) }, I('icon_energy', 18), t('Feed all')) : null,
    h('button.btn.small.xbtn' + (ui.staffHelp ? '.primary' : ''), { title: t('How staff work'), 'aria-expanded': String(!!ui.staffHelp), onclick: () => { ui.staffHelp = !ui.staffHelp; ui.renderPanel(); } }, h('b', '?'))));
  if (ui.staffHelp) body.append(h('div.note', t('Staff tire while working; feed them snacks to perk them up. Wages ({w}) and rent ({r}) are paid each round when the café closes. If the till runs short, the team starts the next round tired.', { w: g.eco.dailyWages(), r: g.eco.dailyRent() })));
  body.append(h('div.section-title', t('Your team')));
  ui.staffOpen ||= new Set();
  for (const a of staff) {
    const open = ui.staffOpen.has(a.id);
    const toggle = () => { open ? ui.staffOpen.delete(a.id) : ui.staffOpen.add(a.id); ui.renderPanel(); };
    body.append(h('div.scard' + (open ? '.open' : ''), { 'data-staff': a.id },
      h('button.scard-head', { onclick: toggle, 'aria-expanded': String(open) },
        portrait(a.look, 56, 56),
        h('div.grow',
          h('div.scard-title', h('b', a.name), h('span.pill', { title: t('Wage per round') }, I('icon_coin', 14), perRound(staffWage(a.role, a.skillLv())) + t('/round'))),
          skillLine(a),
          h('div.scard-status', h('span.task', a.napping ? t('😴 Napping') : tt(a.task)), I('icon_energy', 16),
            h('div.pbar.energy' + (a.energy < 25 ? '.orange' : ''), h('i', { style: { width: a.energy + '%' } }))),
          open ? null : skillDots(a)),
        h('span.scard-chev', glyph('forward', 16))),
      open ? h('div.scard-body',
        skillList(a),
        h('div.scard-acts',
          h('span.acts-label', t('Snack')),
          SNACKS.map((sn) => h('button.btn.small', { title: t('{snack}: +{n} energy ({src})', { snack: sn.name, n: sn.energy, src: s.snacks[sn.id] ? t('from pantry') : t('{n} coins', { n: sn.price }) }), onclick: () => g.eco.feed(a, sn.id) }, I(sn.asset, 20), `×${s.snacks[sn.id] || 0}`))),
        h('div.scard-acts',
          h('button.btn.small', { onclick: () => { ui.subview = { outfit: a }; ui.renderPanel(); } }, t('Outfit')),
          h('button.btn.small', { onclick: () => { ui.subview = { job: a }; ui.renderPanel(); } }, t('Change job')),
          h('button.btn.small.xbtn', { onclick: () => ui.select(a), title: t('Show on the floor') }, gl('eye', null, 16)),
          confirmBtn('button.btn.small.danger.push', t('Fire'), t('Confirm fire'), () => g.eco.fire(a)))) : null));
  }
  body.append(h('div.section-title', t('Hire')));
  const full = staff.length >= slots;
  // hiring opens a job; who fills it is picked next (renderHirePick), from the cast nobody wears yet
  const free = freeCast(g);
  if (!free.length) body.append(h('div.muted', t('Every character is already on the team')));
  for (const [role, r] of Object.entries(ROLES)) {
    const count = staff.filter((a) => a.role === role).length;
    const note = t(ROLE_NOTE[role]);
    body.append(h('div.row.split',
      I('role_' + role, 48),
      h('div.grow', h('h3', r.name)),
      h('button.btn.primary.small' + (full || !free.length || !g.eco.canAfford(r.hire) ? '.disabled' : ''), { onclick: () => { ui.subview = { hire: role }; ui.renderPanel(); } }, t('Hire') + ' ', coinPill(r.hire)),
      h('div.row-full', h('div.muted', note), h('div.meta', t('Wage {w}/round, you have {n}', { w: perRound(staffWage(role, 1)), n: count })))));
  }
  if (full) body.append(h('div.muted', t('All slots are full — reach the next level for more.')));
}
/** Our own characters nobody on the team wears, in cast order. */
const freeCast = (g) => UNIQUE_MODELS.filter((m) => !g.staff.some((a) => a.look.model === m));
/** Step two of hiring: the job is chosen, now the player taps who takes it, then confirms. */
function renderHirePick(ui, body, role) {
  const g = ui.game, r = ROLES[role], sub = ui.subview;
  const back = () => { ui.subview = null; ui.renderPanel(); };
  const free = freeCast(g);
  if (!free.includes(sub.pick)) sub.pick = free[0];
  const full = g.staff.length >= staffSlots(g.state.level);
  body.append(
    h('div.subhead', h('button.btn.small', { onclick: back }, gl('back', t('Back'), 14)), h('b', t('Hire a {role}', { role: r.name }))),
    h('div.pick-staff', free.map((m) => h('button.pick-tile' + (m === sub.pick ? '.on' : ''), { onclick: () => { sub.pick = m; ui.renderPanel(); }, title: UNIQUE_NAMES[m] },
      portrait(roleLook(role, m), 64, 64), h('b', UNIQUE_NAMES[m])))));
  if (sub.pick) body.append(h('button.btn.primary' + (full || !g.eco.canAfford(r.hire) ? '.disabled' : ''), { style: { width: '100%', marginTop: '12px' }, onclick: () => { if (g.eco.hire(role, sub.pick)) back(); } },
    t('Hire {name}', { name: UNIQUE_NAMES[sub.pick] }) + ' ', coinPill(r.hire)));
}
const ROLE_NOTE = { waiter: 'Takes orders, serves drinks, clears tables.', chef: 'Brews at a free espresso station.', cleaner: 'Sweeps up and tidies the restrooms and reading nooks.', bartender: 'Bakes in the Bread Oven and keeps the Pastry Case stocked.' };
function renderJobChange(ui, body, a) {
  const g = ui.game;
  if (!g.staff.includes(a)) { ui.subview = null; return renderStaff(ui, body); }
  body.append(
    h('div.subhead', h('button.btn.small', { onclick: () => { ui.subview = null; ui.renderPanel(); } }, gl('back', t('Back'), 14)), h('b', t("{name}'s career", { name: a.name }))),
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
    body.append(h('div.row.split' + (cur ? '.current' : ''),
      portrait(roleLook(role, a.look.model), 48, 48),
      h('div.grow', h('h3', r.name)),
      action,
      h('div.row-full', skillLine(a, role), h('div.muted', t(ROLE_NOTE[role])),
        role === 'bartender' && !(g.world.byKind('oven').length && g.world.byKind('bar').length) ? h('div.bmsg.warn', { style: { marginTop: '6px' } }, t('Needs a Bread Oven and a Pastry Case to work')) : null,
        h('div.sklist.flush', jobSkill(role, a.skillLv(role) >= ABILITY_UNLOCK_LV)))));
  }
  body.append(h('div.muted', { style: { marginTop: '6px', lineHeight: 1.5 } },
    t("Staff gain experience by finishing jobs in their current role and keep it in every role they've had. Skill makes them walk and work faster (up to +{n}% as a Master). Retraining costs half the hiring fee — going back to a job they're already {title} or better at is free.", { n: Math.round((SKILL.mul[SKILL.mul.length - 1] - 1) * 100), title: SKILL.titles[SKILL.freeReturnLv - 1] })));
}
function tickStaff(ui, body) {
  // keep energy bars moving between full renders
  for (const row of body.querySelectorAll('[data-staff]')) {
    const a = ui.game.staff.find((x) => String(x.id) === row.dataset.staff);
    if (!a) continue;
    const bar = row.querySelector('.energy i');
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
    h('div.subhead', h('button.btn.small', { onclick: () => { ui.subview = null; ui.renderPanel(); } }, gl('back', t('Back'), 14)), h('b', t("{name}'s wardrobe", { name: a.name }))),
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
  body.append(h('div.tabs.seg', { style: { '--n': DISH_CATS.length } }, DISH_CATS.map((c) => h('button.btn.small.tab' + (c.id === cat ? '.on' : ''), { onclick: () => { ui.menuCat = c.id; ui.renderPanel(); } }, h('span', c.name), h('small', `${g.eco.menuCount(c.id)}/${slots[c.id]}`)))));
  if (cat === EXTRA_CAT) {
    if (!g.eco.bakeryReady()) body.append(h('div.row', I('emote_menu', 32), h('div.grow.muted', t('Bakes need a Bread Oven and a Pastry Case (Build → Equipment) and a Baker (Staff → Hire).'))));
  }
  if (slots[cat] === 0) body.append(h('div.muted', { style: { margin: '6px 2px' } }, t('No {cat} slots yet — they open up as you level.', { cat: DISH_CATS.find((c) => c.id === cat).name })));
  body.append(h('div.study-bar', I('icon_voucher', 22), h('b', fmt(s.vouchers || 0)), h('span.muted', t('study vouchers · dishes reach Lv{n} at café level {c}', { n: dishCap(s.level), c: s.level })),
    h('button.btn.small', { onclick: () => ui.openPanel('today') }, t('Get more'))));
  for (const d of DISHES.filter((x) => x.cat === cat)) {
    const st = s.dishes[d.id];
    const unlocked = g.eco.dishUnlocked(d.id);
    const maxed = st.lv >= MAX_DISH_LEVEL;
    const plan = g.eco.studyPlan(d.id);
    // what the next level takes: each ingredient (have / need) and the vouchers; short ones are marked
    const cost = maxed ? [h('span.muted', t('Max level'))] : plan.why === 'cap' ? [h('span.muted', I('icon_lock', 16), ' ' + t('Lv{n} at café level {c}', { n: st.lv + 1, c: (st.lv - 1) * 3 }))] : [
      ...plan.ings.map((x) => h('span.ing' + (x.have >= x.need ? '.done' : '.short'), { title: t('{ing}: {n} in pantry, {need} needed', { ing: ingById[x.id].name, n: x.have, need: x.need }) }, I('ing_' + x.id, 20), `${x.have}/${x.need}`)),
      h('span.ing' + (plan.have >= plan.vouchers ? '.done' : '.short'), { title: t('Study vouchers: {n} held, {need} needed', { n: plan.have, need: plan.vouchers }) }, I('icon_voucher', 20), `${plan.have}/${plan.vouchers}`),
    ];
    const canStudy = unlocked && !plan.why;
    // name and numbers beside the picture; ingredients, stock and buttons get the full width below
    body.append(h('div.row.split.dish' + (unlocked ? '' : '.locked'),
      I(d.asset, 48),
      h('div.grow',
        h('h3', d.name, ' ', h('span.pill', t('Lv{n}', { n: st.lv }))),
        h('div.chips', coinPill(dishPrice(d, st.lv)), h('span.pill', I('icon_points', 18), dishPoints(d, st.lv)), h('span.pill', '⏱ ' + d.cook + 's'))),
      h('div.row-full.flat',
        unlocked ? h('div.chips', cost) : h('div.muted', I('icon_lock', 16), ' ' + t('Unlocks at level {n}', { n: d.level })),
        unlocked ? stockLine(g, d, st) : null,
        unlocked ? h('div.chips.acts',
          h('button.btn.small' + (st.on ? '.primary' : ''), { onclick: () => g.eco.toggleMenu(d.id) }, st.on ? gl('check', t('On menu'), 14) : t('Add to menu')),
          maxed || plan.why === 'cap' ? null : h('button.btn.small' + (canStudy ? '.primary' : '.disabled'), { onclick: () => g.eco.study(d.id), title: t('Use the ingredients and vouchers shown to reach Lv{n}', { n: st.lv + 1 }) }, gl('level', t('Study → Lv{n}', { n: st.lv + 1 }), 15))) : null)));
  }
  body.append(h('div.muted', { style: { marginTop: '6px' } }, t('Every cup uses up its ingredients — one pack makes about {n} servings of each recipe. Keep the pantry stocked, or let the market top it up for you (Market tab).', { n: SERVINGS_PER_UNIT })));
  body.append(h('div.muted', { style: { marginTop: '6px' } }, t('Study a drink or bake to level it up (Lv1→10): it sells for more and earns more café points. Each level takes its ingredients plus study vouchers from Today, and your café level sets how far dishes can go.')));
}

/** What a serving costs in ingredients, the margin on it, and how many the pantry can still make. */
function stockLine(g, d, st) {
  const cost = servingCost(d), profit = dishPrice(d, st.lv) - cost, n = g.eco.canMakeCount(d.id);
  return h('div.muted.stock' + (n === 0 ? '.out' : n < 6 ? '.low' : ''), segs(t('Costs {c} a cup · profit {p} · {n} left in the pantry', { c: cost.toFixed(1), p: profit.toFixed(1), n })));
}
/** "a · b · c" as unbreakable pieces, so a narrow screen breaks the line between pieces, never inside one. */
export function segs(text) {
  const dot = (text.match(/[·・．]/) || ['·'])[0];
  return text.split(/\s*[·・．]\s*/).flatMap((x, i) => (i ? [h('span.seg-dot', dot), h('span.seg', x)] : [h('span.seg', x)]));
}

// ------------------------------------------------------------------ market
function renderMarket(ui, body) {
  const g = ui.game, s = g.state;
  body.append(h('div.section-title', t('Ingredients')));
  body.append(h('div.toggle', h('span', t('Auto-restock')), h('button.switch' + (s.settings.autoRestock ? '.on' : ''), { role: 'switch', 'aria-checked': String(!!s.settings.autoRestock), title: t('Auto-restock'), onclick: () => { s.settings.autoRestock = !s.settings.autoRestock; if (s.settings.autoRestock) g.eco.autoRestock(); ui.renderPanel(); } })));
  body.append(h('div.muted', { style: { marginBottom: '6px' } }, s.settings.autoRestock
    ? t('Packs for the dishes on your menu are bought automatically when they run low: up to {n} coins a round (spent {m} this round). A pack makes about {k} servings.', { n: g.eco.restockBudget(), m: s.stats ? s.stats.restocked || 0 : 0, k: SERVINGS_PER_UNIT })
    : t('Restocking is up to you. A pack makes about {k} servings — guests leave if a drink is sold out.', { k: SERVINGS_PER_UNIT })));
  const grid = h('div.grid2');
  for (const i of INGREDIENTS) {
    const ok = g.eco.ingredientAvailable(i.id);
    const price = g.eco.ingredientPrice(i.id);
    grid.append(h('div.tile' + (ok ? '' : '.locked'), I('ing_' + i.id, 36), h('b', i.name), h('span.muted', t('have {n}', { n: s.inv[i.id] || 0 }) ),
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
    toggle(t('Auto-restock ingredients'), 'autoRestock', () => { if (s.settings.autoRestock) g.eco.autoRestock(); }),
    h('div.btnrow',
      h('button.btn.small', { onclick: () => { cloud.beat(g); ui.toast(save(g) ? t('Saved!') : t('Could not save (storage blocked?)'), 'good'); } }, gl('save', t('Save now'), 15)),
      confirmBtn('button.btn.small.danger', t('Reset game'), t('Tap again to erase everything'), async () => {
        g.resetting = true;
        if (cloud.online) {   // the server keeps the café: swap it for a new one there first
          g.newGame();
          try { await cloud.reset(serialize(g)); } catch (e) { console.warn(e); g.toast(t('Could not reach the server, try again.'), 'bad'); g.resetting = false; location.reload(); return; }
        }
        clearSave(); location.reload();
      })),
    h('div.muted', { style: { marginTop: '6px' } }, t('Progress autosaves every 10 seconds and when you close the tab. The café keeps trading while you are away (up to {n} hours) and tells you how it went when you come back.', { n: OFFLINE.capHours })),
    ...accountSection(ui),
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
  { id: 'dining', name: 'Tables & Chairs' }, { id: 'kitchen', name: 'Equipment' }, { id: 'fun', name: 'Nooks' }, { id: 'decor', name: 'Decor' }, { id: 'walldeco', name: 'Wall decor' },
  { id: 'floor', name: 'Floors' }, { id: 'wall', name: 'Walls' }, { id: 'room', name: 'Room' },
];
const thumbCache = new Map();
function cachedThumb(key, make) { if (!thumbCache.has(key)) thumbCache.set(key, make()); return cloneCanvas(thumbCache.get(key)); }
function cloneCanvas(c) { const n = document.createElement('canvas'); n.width = c.width; n.height = c.height; n.style.cssText = c.style.cssText; n.getContext('2d').drawImage(c, 0, 0); return n; }

const TOUCH_SCREEN = matchMedia('(hover: none) and (pointer: coarse)');   // same test as the CSS
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
      items.append(card('wp:' + w.id + segs, w.name, w.price * segs, w.level, on, () => b.applyWallpaper(w.id), () => thumb(w.asset, w.tint)));
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
      h('div.grow', h('b', cat2.name, moving ? '' : ' ', moving ? null : coinPill(cat2.price)), cat2.note && !b.message ? h('div.muted', t(cat2.note)) : null, h('div.muted' + (b.message && b.message.kind === 'bad' ? '.bad' : ''), tip)),
      h('button.btn.small', { onclick: () => b.cancelPlacing() }, moving ? t('Cancel') : t('Back to items'))));
    return;
  }
  const hint = b.tool ? (b.tool.mode === 'floor' ? (touch ? 'Tap or drag over tiles to paint' : 'Click or drag over tiles to paint') : '')
    : touch ? 'Pick an item to buy, or tap furniture to rotate / move / sell it' : 'Pick an item to buy, or click furniture to rotate / move / sell it';
  // phones open build mode with the tray folded down to one line, so the whole café is in view for
  // rotating / moving what's there; Buy unfolds the shop
  if (TOUCH_SCREEN.matches && !ui.buildOpen) {
    const tip = b.message ? b.message.text : t('Tap furniture to rotate / move / sell it');
    bar.replaceChildren(h('div.card.bb-mini.bb-fold',
      h('button.btn.primary', { onclick: () => { ui.buildOpen = true; ui.renderBuild(); } }, gl('build', t('Buy'), 16)),
      h('div.grow.muted' + (b.message && b.message.kind === 'bad' ? '.bad' : ''), tip),
      h('button.btn.small.done', { onclick: () => b.exit() }, gl('check', t('Done'), 16))));
    return;
  }
  if (TOUCH_SCREEN.matches) tabs.prepend(h('button.btn.small.fold', { onclick: () => { ui.buildOpen = false; b.setTool(null); ui.renderBuild(); }, title: t('Hide') }, glyph('back', 16)));
  const msg = h('div.bmsg' + (b.message ? '.' + b.message.kind : ''), b.message ? b.message.text : t(hint));
  bar.replaceChildren(h('div.card', tabs, items, h('div.bb-msg', msg)));
  // keep the chosen category tab in view (the row scrolls sideways on phones)
  const on = tabs.querySelector('.tab.on'), row = on && on.parentElement;
  if (on && row.scrollWidth > row.clientWidth) row.scrollLeft = on.offsetLeft - row.offsetLeft - (row.clientWidth - on.offsetWidth) / 2;
}
