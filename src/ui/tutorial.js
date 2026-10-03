// First visit: the player picks a starting partner from the whole cast, and that character walks them through
// the café in a few steps (a coach card at the top with their portrait, and a yellow spotlight on what to tap).
// Each step moves on when the player has actually done it, not on a Next button; the tour can be skipped any time.
// What is done is kept in state.tutorial (step ids), and state.tutorialSeen once it is over.
import { h } from '../util.js';
import { portrait } from '../portrait.js';
import { roleLook } from '../looks.js';
import { UNIQUE_MODELS, UNIQUE_NAMES } from '../data.js';
import { kitLines } from './panels.js';
import { t } from '../i18n.js';

/**
 * The tour. `target` is the element to spotlight, `ready` holds a step back (a guest step at night is done
 * after the others), `done` says the player did it (`tu` carries what the tour saw happen), `next` puts a
 * button on the card instead.
 */
const STEPS = [
  { id: 'hello', next: true, text: (g) => t("Hi, I'm {name}! This café is ours now. Let me show you around.", { name: UNIQUE_NAMES[g.state.partner] }) },
  { id: 'look', text: () => t('Drag to look around. Pinch or scroll to zoom, twist with two fingers to turn.'), done: (g, ui, tu) => tu.moved },
  { id: 'guest', ready: (g) => !g.day.isNight, text: (g) => t('Here comes a guest! I take the orders and {chef} brews. Watch us serve.', { chef: chefName(g) }),
    done: (g, ui, tu) => g.state.stats.served > (g.state.stats === tu.stats ? tu.served : 0) },   // a new round starts its count over
  { id: 'staff', target: (ui) => ui.toolBtns.staff, text: () => t('Tap Staff to see how much energy we have left. Snacks perk us up.'), done: (g, ui) => ui.panel === 'staff' },
  { id: 'today', target: (ui) => (ui.panel === 'today' ? ui.el.panelBody.querySelector('.today-gift .btn.primary') : ui.el.questBtn), text: () => t('The checklist is Today: a gift every day and three goals. Open your gift!'), done: (g) => !g.eco.giftAvailable() },
  { id: 'study', target: (ui) => (ui.panel === 'menu' ? ui.el.panelBody.querySelector('[data-study="espresso"]') : ui.toolBtns.menu), text: () => t('Goals pay study vouchers. In the Menu, study the Espresso to Lv2: it sells for more.'),
    done: (g) => Object.values(g.state.dishes).some((d) => d.lv >= 2) },
  { id: 'build', target: (ui, tu) => (!ui.game.build.active ? ui.toolBtns.build : tu.placed() ? ui.el.buildbar.querySelector('.done') : null), text: (g, tu) => (!g.build.active ? t('Tap the hammer to build and decorate.') : tu.placed() ? t('Looks great! Tap Done when you are happy with it.') : t('Add a table, a chair or a plant, then tap Done.')),
    done: (g, ui, tu) => tu.built && !g.build.active },
  { id: 'bye', next: true, ready: (g, tu) => STEPS.every((x) => x.id === 'bye' || tu.done.includes(x.id)), text: () => t("That's the basics! We keep serving while you're away, so come back and see how we did.") },
];
const chefName = (g) => { const c = g.staff.find((a) => a.role === 'chef'); return c ? c.name : t('our Barista'); };

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
    this.stats = this.g.state.stats; this.served = this.stats.served;
    this.moved = false; this.built = false;
    this.cam = this.camKey();
    this.card = h('div#coach');
    this.spot = h('div#spot');
    ui.root.append(this.spot, this.card);
    this.stepId = null;
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
  finish(id) { if (!this.done.includes(id)) this.done.push(id); this.g.changed('tutorial'); }
  end() {
    this.g.state.tutorialSeen = true;
    this.card.remove(); this.spot.remove();
    this.ui.tutorial = null;
  }
  /** Called with the UI's update (10 times a second). */
  update() {
    const g = this.g, ui = this.ui;
    if (this.camKey() !== this.cam) this.moved = true;
    if (g.build.active && !this.built) { this.built = true; this.furn = g.world.furniture.length; }
    let st = this.current();
    while (st && st.done && st.done(g, ui, this)) { this.finish(st.id); st = this.current(); }
    if (!STEPS.some((x) => !this.done.includes(x.id))) return this.end();
    // nothing ready yet (only the guest left, and it's night): say when the doors open
    const text = st ? st.text(g, this) : t("We're closed for the night. The doors open at 08:00, see you then!");
    const key = (st ? st.id : 'wait') + '|' + text + '|' + (ui.modalOpen ? 1 : 0);
    if (key !== this.key) { this.key = key; this.render(st, text); }
    this.place(st);
  }
  render(st, text) {
    const g = this.g, partner = g.staff.find((a) => a.look.model === g.state.partner);
    const look = partner ? partner.look : roleLook('waiter', g.state.partner);
    const n = STEPS.findIndex((x) => x === st);
    this.card.replaceChildren(
      h('div.coach-face', portrait(look, 56, 56)),
      h('div.coach-body',
        h('div.coach-who', h('b', UNIQUE_NAMES[g.state.partner] || ''), n >= 0 ? h('span', `${n + 1}/${STEPS.length}`) : null),
        h('div.coach-text', text),
        h('div.coach-acts',
          st && st.next ? h('button.btn.small.primary', { onclick: () => { this.finish(st.id); this.update(); } }, n === STEPS.length - 1 ? t("Let's go!") : t('Next')) : null,
          n < STEPS.length - 1 ? h('button.btn.small.ghost', { onclick: () => this.end() }, t('Skip tour')) : null)));
    this.card.classList.toggle('hidden', !!this.ui.modalOpen);
  }
  /** Ring the step's target, wherever it is on screen now (hidden when it is not showing). */
  place(st) {
    const el = st && st.target && !this.ui.modalOpen ? st.target(this.ui, this) : null;
    const r = el && el.isConnected ? el.getBoundingClientRect() : null;
    if (!r || !r.width || getComputedStyle(el).display === 'none' || getComputedStyle(el).visibility === 'hidden') { this.spot.classList.remove('show'); return; }
    const root = this.ui.root.getBoundingClientRect(), pad = 6;
    Object.assign(this.spot.style, { left: `${r.left - root.left - pad}px`, top: `${r.top - root.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    this.spot.classList.add('show');
  }
}
