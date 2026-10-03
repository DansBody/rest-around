// First visit: the player picks a starting partner from the whole cast, and that character walks them through
// the café one thing at a time. The coach card sits next to whatever the step is about (with a little arrow),
// a yellow ring marks it, and for "tap this" steps the rest of the screen dims a little (it all stays
// tappable). Each step moves on when the player has actually done it, with a short word of praise; the tour
// can be skipped any time. While it runs, other nudges wait: red badges are hidden except on the ring's target,
// cheerful toasts are muted and level-up / receipt cards are held back (UI.notice).
// What is done is kept in state.tutorial (step ids), and state.tutorialSeen once it is over.
import { h } from '../util.js';
import { portrait } from '../portrait.js';
import { roleLook } from '../looks.js';
import { UNIQUE_MODELS, UNIQUE_NAMES } from '../data.js';
import { kitLines } from './panels.js';
import { glyph } from './icons.js';
import { TILE } from '../models.js';
import { t } from '../i18n.js';

/**
 * The steps. `text` is what the partner says, `target` what to ring (an element, or { x, y, r } for a spot in
 * the scene), `dim` darkens everything else (a function: only then), `center` puts the card mid-screen, `ready` holds a step back (the
 * guest waits for the doors to open, the goodbye for everything else), `done` says the player did it, `next`
 * puts a button on the card instead (a function: only then). `enter` runs once as the step comes up, and
 * `panel` names the one panel the step works in (null: none): any other panel open then is closed.
 */
const STEPS = [
  { id: 'hello', center: true, next: true, text: (g) => t("Hi, I'm {name}! This café is ours now. Let me show you around.", { name: partnerName(g) }) },
  { id: 'look', text: () => t('Drag to look around. Pinch or scroll to zoom, twist with two fingers to turn.'), done: (g, ui, tu) => tu.moved },
  { id: 'guest', panel: null, ready: (g) => !g.day.isNight, enter: (tu) => tu.callGuest(), target: (ui, tu) => tu.guestSpot(),
    text: (g, tu) => tu.guestText(),
    done: (g, ui, tu) => !!(tu.guest && tu.guest.served) },   // the guest the tour called, not whoever else was in
  { id: 'staff', dim: true, panel: 'staff',
    target: (ui) => (ui.panel !== 'staff' ? ui.toolBtns.staff : ui.el.panelBody.querySelector(`[data-staff="${partnerId(ui.game)}"] .scard-status`)),
    text: (g, tu, ui) => (ui.panel !== 'staff' ? t('Tap Staff to meet the team.') : t('This bar is my energy. When it runs out I nap; a snack perks me right up.')),
    next: (g, ui) => ui.panel === 'staff' },
  { id: 'today', dim: true, panel: 'today', target: (ui) => (ui.panel === 'today' ? ui.el.panelBody.querySelector('.today-gift .btn.primary') : ui.el.questBtn),
    text: (g, tu, ui) => (ui.panel === 'today' ? t('A gift every day, and three goals that pay study vouchers. Open your gift!') : t('This checklist is Today. Tap it!')),
    done: (g) => !g.eco.giftAvailable() },
  { id: 'study', dim: true, panel: 'menu', target: (ui) => (ui.panel === 'menu' ? ui.el.panelBody.querySelector('[data-study="espresso"]') : ui.toolBtns.menu),
    text: (g, tu, ui) => (ui.panel === 'menu' ? t('Study the Espresso: it uses the beans and a voucher, and sells for more at Lv2.') : t('Now the Menu: this is where drinks level up.')),
    done: (g) => Object.values(g.state.dishes).some((d) => d.lv >= 2) },
  { id: 'build', dim: (ui, tu) => !ui.game.build.active || tu.placed(), enter: (tu) => tu.ui.closePanel(),
    target: (ui, tu) => (!ui.game.build.active ? ui.toolBtns.build : tu.placed() ? ui.el.buildbar.querySelector('.done') : ui.el.buildbar),
    text: (g, tu) => (!g.build.active ? t('Tap the hammer to build and decorate.') : tu.placed() ? t('Looks great! Tap Done when you are happy with it.') : t('Pick a table, a chair or a plant, then tap the floor to put it down.')),
    done: (g, ui, tu) => tu.built && !g.build.active },
  { id: 'bye', center: true, next: true, ready: (g, tu) => STEPS.every((x) => x.id === 'bye' || tu.done.includes(x.id)), enter: (tu) => tu.g.camera.fit(tu.g.world.size),
    text: () => t("That's the basics! We keep serving while you're away, so come back and see how we did.") },
];
const PRAISE = ['Nice!', "That's it!", 'Perfect!', 'Great job!'];
const partnerName = (g) => UNIQUE_NAMES[g.state.partner] || '';
const partnerId = (g) => { const a = g.staff.find((x) => x.look.model === g.state.partner); return a ? a.id : ''; };

/** Start (or pick up) the tour for a new café. Call once the UI is up. */
export function startTutorial(ui) {
  const s = ui.game.state;
  if (s.tutorialSeen) return;
  if (!s.partner) {
    if (s.points > 0) { s.tutorialSeen = true; return; }   // a café from before there was a partner: no tour
    ui.queueModal(() => pickCard(ui));
    return;
  }
  ui.tutorial = new Tour(ui);
}

/** The cast to choose from: tap a portrait to read about them, then start with them. */
function pickCard(ui) {
  const g = ui.game;
  let pick = UNIQUE_MODELS[Math.floor(Math.random() * UNIQUE_MODELS.length)];
  const card = h('div.card.starter');
  const render = () => card.replaceChildren(
    h('div.big-title', t('Pick your partner')),
    h('div.muted', t('They run the café with you from day one, and show you how it all works.')),
    h('div.pick-staff.starter-grid', UNIQUE_MODELS.map((m) => h('button.pick-tile' + (m === pick ? '.on' : ''), { onclick: () => { pick = m; render(); }, title: UNIQUE_NAMES[m] },
      portrait(roleLook('waiter', m), 64, 64), h('b', UNIQUE_NAMES[m])))),
    h('div.starter-pick',
      portrait(roleLook('waiter', pick), 112, 112),
      h('div.grow', h('h3', UNIQUE_NAMES[pick]),
        h('div.muted.starter-role', t('Starts as your Server: takes orders, serves drinks and clears tables.')),
        kitLines(pick, true, true).length ? h('div.sklist', ...kitLines(pick, true, true)) : h('div.muted', t('No special skills yet: a steady pair of hands.')))),
    h('button.btn.primary', { onclick: () => { g.setStarter(pick); ui.closeModal(); ui.tutorial = new Tour(ui); } }, t('Start with {name}', { name: UNIQUE_NAMES[pick] })));
  render();
  return card;
}

class Tour {
  constructor(ui) {
    this.ui = ui; this.g = ui.game;
    this.moved = false; this.built = false;
    this.cam = this.camKey();
    this.card = h('div#coach');
    this.spot = h('div#spot');
    ui.root.append(this.spot, this.card);
    ui.root.classList.add('touring');
    this.stepId = null; this.praise = null; this.targetEl = null;
    this.update();
  }
  get done() { return this.g.state.tutorial; }
  /** Something was put down (or taken away) since build mode opened. */
  placed() { return this.built && this.g.world.furniture.length !== this.furn; }
  camKey() { const c = this.g.camera; return [c.tx, c.tz, c.yawTarget, c.distTarget].map((v) => v.toFixed(1)).join(); }
  /** The step to show: the first one not done whose time has come (the guest waits for the doors to open). */
  current() {
    const left = STEPS.filter((st) => !this.done.includes(st.id));
    return left.find((st) => !st.ready || st.ready(this.g, this)) || null;
  }
  finish(id, praise) {
    if (!this.done.includes(id)) this.done.push(id);
    if (praise) this.praise = { text: t(PRAISE[Math.floor(Math.random() * PRAISE.length)]), until: performance.now() + 1300 };
    this.g.changed('tutorial');
  }
  end() {
    this.g.state.tutorialSeen = true;
    this.card.remove(); this.spot.remove();
    this.mark(null);
    this.ui.root.classList.remove('touring');
    this.ui.tutorial = null;
  }

  /** The guest step brings its own guest rather than leaving the player waiting for the next one to wander in
   *  (and another, if that one walks out unserved), and the camera goes to meet them. */
  callGuest() {
    const now = performance.now();
    if (this.guest && !this.guest.gone) return;
    if (this.guestAt && now - this.guestAt < 15000) return;
    const c = this.guest = this.g.spawnCustomer(true, this.g.world.entry.y - 3);   // a few steps up the street, in sight
    c.patient = true;   // never walks out: no free seat or a slow kitchen just means a longer wait
    this.guestAt = now;
    // the camera keeps them in view, a little above the middle so the card below doesn't cover them (a drag ends it)
    // the camera keeps whoever is busy with them in view (see watched()), a little above the middle so the card
    // below doesn't cover them; a drag ends it
    this.g.camera.follow(() => { const a = this.stepId === 'guest' && !c.gone ? this.watched().who : null; return a ? { x: a.x * TILE, z: a.y * TILE } : null; }, () => ({ x: 0, y: 70 }));
  }
  /**
   * Who to watch while the tour's guest is served, and why: the guest walking in and finding a seat, the server
   * on the way to take the order, the barista brewing it (or the baker baking the side), the server bringing it
   * over, then the guest again, enjoying it. { who, what }
   */
  watched() {
    const c = this.guest, g = this.g;
    if (!c || c.gone) return { who: null, what: 'none' };
    if (c.state === 'arriving' || c.state === 'enter') return { who: c, what: 'arrive' };
    if (c.state === 'toSeat') return { who: c, what: 'seat' };
    if (c.state === 'queue') return { who: c, what: 'queue' };
    if (c.state === 'eating') return { who: c, what: 'enjoy' };
    // whoever has picked up a job for this guest: taking the order, brewing, baking or carrying it over
    const busy = g.jobs.list.filter((j) => j.customer === c && j.assignee && !j.done && !j.canceled);
    const pick = (type) => busy.find((j) => j.type === type);
    const j = c.state === 'waitOrder' ? pick('order') : pick('deliver') || pick('cook') || pick('drink');
    if (j) return { who: j.assignee, what: j.type };
    if (c.state === 'waitOrder') return { who: c, what: 'wantOrder' };
    // nobody on it this moment: something is ready to carry (watch the servers), or still waiting its turn (the baristas)
    const tickets = c.tickets || [];
    const role = tickets.some((tk) => tk.state === 'ready') ? 'waiter' : tickets.some((tk) => tk.state !== 'served') ? (tickets.find((tk) => tk.state !== 'served').kind === 'drink' ? 'bartender' : 'chef') : null;
    const crew = role ? g.staff.filter((a) => a.role === role) : [];
    const who = crew.find((a) => a.look.model === g.state.partner) || crew[0];
    if (who) return { who, what: role === 'waiter' ? 'pickup' : 'queued' };
    return { who: c, what: 'waitFood' };
  }
  /** What the partner says about it ("I" when the partner is the one doing it). */
  guestText() {
    const { who, what } = this.watched(), g = this.g;
    const me = who && who.look && who.look.model === g.state.partner, name = who ? who.name : '';
    switch (what) {
      case 'arrive': return t('Here comes a guest! Watch the door.');
      case 'seat': return t('They pick a free seat.');
      case 'queue': return t('Every seat is taken, so they wait for a table to free up.');
      case 'wantOrder': return t('Seated! Someone will be over to take the order.');
      case 'order': return me ? t("I'm off to take their order.") : t('{name} is taking their order.', { name });
      case 'cook': return me ? t("I'm brewing their coffee.") : t('{name} is brewing their coffee at the espresso machine.', { name });
      case 'drink': return me ? t("I'm baking their treat.") : t('{name} is baking their treat.', { name });
      case 'deliver': return me ? t("Ready! I'm bringing it over.") : t('Ready! {name} is bringing it over.', { name });
      case 'queued': return me ? t('A few orders ahead of theirs: theirs is next.') : t('{name} has a few orders ahead of theirs: theirs is next.', { name });
      case 'pickup': return me ? t("It's ready on the counter: I'll grab it.") : t("It's ready on the counter: {name} will grab it.", { name });
      case 'waitFood': return t('Order in! The kitchen gets on it.');
      case 'enjoy': return t('Enjoy! They pay when they finish.');
      default: return t('Here comes a guest! Watch the door.');
    }
  }
  /** Where the guest is on screen (ringed while they come in and get served); the camera keeps them in view. */
  guestSpot() {
    const c = this.watched().who, R = this.g.renderer;
    if (!c || c.gone || !R) return null;
    return R.agentRing(c);
  }

  /** Called with the UI's update (10 times a second). */
  update() {
    const g = this.g, ui = this.ui;
    if (this.camKey() !== this.cam) this.moved = true;
    this.cam = this.camKey();
    if (g.build.active && !this.built) { this.built = true; this.furn = g.world.furniture.length; }
    // a moment of praise after a step is done, before the next one comes up
    if (this.praise && performance.now() < this.praise.until) { this.show('praise', null, this.praise.text, null); return; }
    this.praise = null;
    let st = this.current();
    while (st && st.done && st.done(g, ui, this)) { this.finish(st.id, true); return this.update(); }
    if (!STEPS.some((x) => !this.done.includes(x.id))) return this.end();
    if (st && st.id !== this.stepId) {
      this.stepId = st.id;
      if (st.panel !== undefined && ui.panel && ui.panel !== st.panel) ui.closePanel();   // the last step's panel goes away
      if (st.enter) st.enter(this);
    }
    if (st && st.id === 'guest') this.callGuest();
    // nothing ready yet (only the guest left, and it's night): say when the doors open
    const text = st ? st.text(g, this, ui) : t("We're closed for the night. The doors open at 08:00, see you then!");
    const target = st && st.target && !ui.modalOpen ? st.target(ui, this) : null;
    this.show(st ? st.id : 'wait', st, text, target);
  }

  /** Draw the card (only when what it says changed) and place it, the ring and the dimming around `target`. */
  show(id, st, text, target) {
    const ui = this.ui, g = this.g;
    const nextOn = st && (typeof st.next === 'function' ? st.next(g, ui) : st.next);
    const key = [id, text, nextOn ? 1 : 0].join('|');
    if (key !== this.key) {
      this.key = key;
      const look = (g.staff.find((a) => a.look.model === g.state.partner) || {}).look || roleLook('waiter', g.state.partner);
      const n = STEPS.findIndex((x) => x === st);
      const last = n === STEPS.length - 1;
      this.card.replaceChildren(
        h('i.coach-arrow'),
        h('div.coach-face', portrait(look, 56, 56)),
        h('div.coach-body',
          h('div.coach-who', h('b', partnerName(g)), n >= 0 ? h('span', `${n + 1}/${STEPS.length}`) : null),
          h('div.coach-text', id === 'praise' ? [glyph('check', 18), ' ', text] : text),
          id === 'praise' ? null : h('div.coach-acts',
            nextOn ? h('button.btn.small.primary', { onclick: () => { this.finish(st.id, !st.center); this.update(); } }, last ? t("Let's go!") : n === 0 ? t('Next') : t('Got it')) : null,
            !last ? h('button.btn.small.ghost', { onclick: () => this.end() }, t('Skip tour')) : null)));
      this.card.classList.toggle('praise', id === 'praise');
    }
    this.card.classList.toggle('hidden', !!ui.modalOpen);
    this.card.classList.toggle('center', !!(st && st.center));
    this.place(st, target);
  }

  /** Mark the ringed element (its red badge stays visible while the others are hidden during the tour). */
  mark(el) {
    if (this.targetEl === el) return;
    if (this.targetEl) this.targetEl.classList.remove('tour-target');
    if (el) el.classList.add('tour-target');
    this.targetEl = el;
  }

  /** Ring the target and put the card beside it, pointing at it; with no target the card sits at the top. */
  place(st, target) {
    const ui = this.ui, root = ui.root.getBoundingClientRect();
    let r = null;
    if (target instanceof Element) {
      const cs = target.isConnected ? getComputedStyle(target) : null;
      const b = cs && cs.display !== 'none' && cs.visibility !== 'hidden' ? target.getBoundingClientRect() : null;
      if (b && b.width) r = { left: b.left - root.left, top: b.top - root.top, width: b.width, height: b.height, round: false };
    } else if (target) r = { left: target.x - target.r, top: target.y - target.r, width: target.r * 2, height: target.r * 2, round: true };
    this.mark(target instanceof Element && r ? target : null);
    const dim = !!(r && st && (typeof st.dim === 'function' ? st.dim(ui, this) : st.dim));
    this.spot.classList.toggle('show', !!r);
    this.spot.classList.toggle('dim', dim);
    this.spot.classList.toggle('round', !!(r && r.round));
    if (r) {
      const pad = r.round ? 0 : 6;
      Object.assign(this.spot.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    }
    // the card: mid-screen, or beside the target (above it in the lower half of the screen, below it otherwise)
    const c = this.card, W = root.width, H = root.height;
    if (c.classList.contains('center') || c.classList.contains('hidden')) { c.style.cssText = ''; return; }
    c.classList.remove('above', 'below', 'side');
    if (!r) { c.style.cssText = ''; return; }
    const ch = c.offsetHeight || 110, gap = 16;
    // inside an open side panel (desktop) with room to its left: sit beside the panel, so the row stays readable
    const P = ui.panel ? ui.el.panel.getBoundingClientRect() : null;
    const room = P ? P.left - root.left - 28 : 0;
    if (P && room >= 300 && r.left >= P.left - root.left - 1) {
      const sw = Math.min(380, room), cy = r.top + r.height / 2;
      const top = Math.max(8, Math.min(H - ch - 8, cy - ch / 2));
      Object.assign(c.style, { left: `${P.left - root.left - gap - sw}px`, top: `${top}px`, right: 'auto', width: `${sw}px`, maxWidth: 'none' });
      c.style.setProperty('--ay', `${Math.max(20, Math.min(ch - 20, cy - top))}px`);
      c.classList.add('side');
      return;
    }
    const cw = Math.min(420, W - 24);
    const cx = r.left + r.width / 2;
    const above = r.top + r.height / 2 > H / 2;
    let top = above ? r.top - gap - ch - 6 : r.top + r.height + gap + 6;
    top = Math.max(8, Math.min(H - ch - 8, top));
    const left = Math.max(12, Math.min(W - cw - 12, cx - cw / 2));
    Object.assign(c.style, { left: `${left}px`, top: `${top}px`, right: 'auto', width: `${cw}px`, maxWidth: 'none' });
    c.style.setProperty('--ax', `${Math.max(22, Math.min(cw - 22, cx - left))}px`);
    c.classList.add(above ? 'above' : 'below');
  }
}
