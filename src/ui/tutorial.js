// First visit: the player picks a starting partner from the whole cast, and that character walks them through
// the café one thing at a time. The coach card sits next to whatever the step is about (with a little arrow),
// a yellow ring marks it, and for "tap this" steps the rest of the screen dims a little. Only what the step is
// about can be tapped (and the view dragged): anything else just nudges the card (Tour.allows). A character
// the step is about (the first guest, whoever serves them) glows yellow in the scene itself and the camera keeps
// them in view, coming back after a drag (game.focus, Camera.letGo). Each step moves on when the player has
// actually done it, with a short word of praise; the tour can be skipped any time. While it runs, other nudges
// wait: red badges are hidden except on the ring's target, cheerful toasts are muted and level-up / receipt cards
// are held back (UI.notice).
// What is done is kept in state.tutorial (step ids), and state.tutorialSeen once it is over.
import { h } from '../util.js';
import { portrait } from '../portrait.js';
import { roleLook } from '../looks.js';
import { UNIQUE_MODELS, UNIQUE_NAMES, furnitureById, CLUBS, TROUBLE, DAY } from '../data.js';
import { CLUB_FOR } from '../trouble.js';
import { kitLines } from './panels.js';
import { glyph } from './icons.js';
import { TILE } from '../models.js';
import { t } from '../i18n.js';

/**
 * The steps. `text` is what the partner says, `target` the element to ring (the one thing that can be tapped,
 * plus whatever `allow` lists), `focus` the character in the scene the step is about (they glow, the camera keeps
 * them in view and the card waits at the bottom), `dim` darkens everything else (a function: only then), `center`
 * puts the card mid-screen, `ready` holds a step back (the goodbye waits for everything else), `done` says the
 * player did it, `next` puts a button on the card instead (a function: only then). `enter` runs once as the step
 * comes up, `panel` names the one panel the step works in (null: none): any other panel open then is closed, and
 * `scene` lets taps on the scene through (the view can always be dragged).
 */
const STEPS = [
  { id: 'hello', center: true, next: true, text: (g) => t("Hi, I'm {name}! This café is ours now. Let me show you around.", { name: partnerName(g) }) },
  { id: 'look', text: () => t('Drag to look around. Pinch or scroll to zoom, twist with two fingers to turn.'), done: (g, ui, tu) => tu.moved },
  // the room starts bare: a table for two first (the guest needs somewhere to sit)
  // build mode opens by itself on the tables tab; the floor takes taps, and so do the buttons round the piece in hand
  { id: 'seats', panel: null, scene: (g) => g.build.placing(), enter: (tu) => tu.openBuild(), dim: (ui, tu) => tu.seatStage() === 'hammer' || tu.seatStage() === 'done',
    target: (ui, tu) => ({ hammer: () => ui.toolBtns.build, table: () => tu.buildTarget('f:table_oak'), chairs: () => tu.buildTarget('f:chair_oak'), done: () => tu.buildTarget('done') })[tu.seatStage()](),
    allow: (ui) => [ui.game.build.placing() ? ui.el.ghostctl : null],
    text: (g, tu) => ({
      hammer: t("Guests need somewhere to sit. Tap the hammer and let's set up a table."),
      table: g.build.locked ? t('Tap the check mark to put it down (the arrow turns it).')
        : g.build.tool ? t('Now tap the floor where it should go.')
        : t('Guests need somewhere to sit. Pick the {name}, then tap the floor to put it down.', { name: furnitureById.table_oak.name }),
      chairs: g.build.locked ? t('Tap the check mark to put it down (the arrow turns it).')
        : g.world.seats.length ? t('One more {name}!', { name: furnitureById.chair_oak.name })
        : t('Now two {name}s facing the table, any side you like. A table seats two.', { name: furnitureById.chair_oak.name }),
      done: t('A table for two! Tap Done to open up.'),
    })[tu.seatStage()],
    done: (g) => !g.build.active && g.world.seats.length >= 2 },
  { id: 'guest', panel: null, ready: (g) => g.day.isOpen && g.world.seats.length > 0, enter: (tu) => tu.callGuest(), focus: (tu) => tu.watched().who,
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
  { id: 'bye', center: true, next: true, panel: null, ready: (g, tu) => STEPS.every((x) => x.id === 'bye' || tu.done.includes(x.id)), enter: (tu) => tu.g.camera.fit(tu.g.world.size),
    text: (g) => (g.day.hour >= DAY.lastCallHour
      ? t("That's the basics! It's late, but tonight we stay open while you settle in. We keep serving while you're away too.")
      : t("That's the basics! We keep serving while you're away, so come back and see how we did.")) },
];
// what the tour's guard watches: a tap is a pointerdown and then a click, and both must stop at a blocked control
const GUARDED = ['pointerdown', 'mousedown', 'click', 'dblclick', 'contextmenu'];
const PRAISE = ['Nice!', "That's it!", 'Perfect!', 'Great job!'];
const FOCUS_UP = 90;   // px above the middle of the view where the camera keeps a focus (the card waits below it)
const FOCUS_DIST = 28;   // and it zooms in to at most this distance, so a far-off view still shows who it is about
const partnerName = (g) => UNIQUE_NAMES[g.state.partner] || '';
const partnerId = (g) => { const a = g.staff.find((x) => x.look.model === g.state.partner); return a ? a.id : ''; };

// ---------------- lessons: trouble, taught as it unlocks ----------------
// When a kind of trouble unlocks (dine and dash at Lv2, rude guests at Lv3) the partner takes the player to the
// club that handles it, and the first session there is free; that kind of trouble only starts once the lesson
// is over (done or skipped: 'L-dash' / 'L-rude' in state.tutorial, see Troubles.allowed). The first real
// incident of each kind is then watched together (startWatch).
const LESSON = {
  dash: {
    intro: () => t("From now on, a guest may try to sneak out without paying. Let's get someone ready at the {club}: the first session is on me!", { club: CLUBS.track.name }),
    done: () => t('Now we can chase down anyone who runs off with the bill. Off we go!'),
  },
  rude: {
    intro: () => t('Now and then a rude guest may come in and push the team around. A batter from the {club} sends them flying: the first session is on me!', { club: CLUBS.baseball.name }),
    done: () => t('Now nobody pushes our team around. Back to work!'),
  },
};
function lessonSteps(kind) {
  const club = CLUBS[CLUB_FOR[kind]], L = LESSON[kind];
  const trained = (g) => g.staff.some((a) => a.clubLv(club.id) > 0);
  return [
    { id: kind + '-1', center: true, next: true, text: L.intro },
    { id: kind + '-2', dim: true, panel: 'train', enter: (tu) => { tu.g.eco.freeClub = club.id; },
      target: (ui, tu) => {
        if (ui.panel !== 'train') { tu.clubShown = false; return ui.toolBtns.train; }
        const el = ui.el.panelBody.querySelector(`[data-club="${club.id}"]`);
        // once, as Training opens: scroll this lesson's club to the top (the other club may be first)
        if (el && !tu.clubShown) {
          tu.clubShown = true;
          const body = ui.el.panelBody;
          body.scrollTop += el.getBoundingClientRect().top - body.getBoundingClientRect().top - 8;
        }
        return el && el.querySelector('.club-go');
      },
      allow: (ui) => [ui.panel === 'train' ? ui.el.panelBody.querySelector(`[data-club="${club.id}"]`) : null],   // who goes, and the button
      text: (g, tu, ui) => (ui.panel === 'train' ? t('Pick who goes, then tap the button below. Pass the tryout to learn {skill}.', { skill: club.skill }) : t('Tap Training.')),
      done: trained },
    { id: kind + '-3', center: true, next: true, text: L.done, doneLabel: () => t('Got it') },
  ];
}
/** A lesson waiting to be taught now (the tour over, nothing else on screen), started; true if one was. */
export function maybeLesson(ui) {
  const g = ui.game, s = g.state;
  if (ui.tutorial || !s.tutorialSeen || g.visit || g.build.active || ui.modalOpen || (ui.notices && ui.notices.length)) return false;
  if (ui.el.celebrate.classList.contains('show') || ui.el.receipt.classList.contains('show')) return false;
  for (const kind of ['dash', 'rude']) {
    if (s.level < TROUBLE[kind].level || s.tutorial.includes('L-' + kind)) continue;
    ui.closePanel();
    ui.tutorial = new Tour(ui, lessonSteps(kind), { id: 'L-' + kind, onEnd: (tu) => { if (tu.g.eco.freeClub === CLUBS[CLUB_FOR[kind]].id) tu.g.eco.freeClub = null; } });
    return true;
  }
  return false;
}

/**
 * The first real incident of each kind, watched together: the ring and the camera stay on whoever matters
 * (the troublemaker, then whoever goes after them), the partner says what is happening, and once it is over
 * a Got it ends it. The troublemaker of that first time moves a bit slower (Customer.slowMo).
 */
export function startWatch(ui, c, kind) {
  const g = ui.game, id = 'W-' + kind;
  if (ui.tutorial || g.visit || g.state.tutorial.includes(id)) return false;
  const focus = () => (c.trouble && c.trouble.by && !c.trouble.over ? c.trouble.by : c);
  const text = () => {
    const tr = c.trouble || {}, by = tr.by;
    if (kind === 'dash') {
      if (tr.over) return c.state === 'caught' ? t('Caught! {name} pays up after all.', { name: c.name }) : t('They got away this time. Everyone who trains at the {club} joins the chase.', { club: CLUBS.track.name });
      return by ? t('{by} is giving chase!', { by: by.name }) : t('{name} is sneaking out without paying!', { name: c.name });
    }
    if (tr.over) return c.state === 'flying' ? t('Home run! Out they go.') : t('They stormed off. A trained batter gets there sooner.');
    return by ? t('{by} grabs the bat!', { by: by.name }) : t('A rude guest is pushing the team around!');
  };
  const step = { id: 'w-' + kind, panel: null, focus: () => (c.gone ? null : focus()), text, next: () => !!(c.trouble && c.trouble.over), doneLabel: () => t('Got it') };
  ui.closePanel();
  g.camera.follow(() => (ui.tutorial && ui.tutorial.opts.id === id && !c.gone ? { x: focus().x * TILE, z: focus().y * TILE } : null), () => ({ x: 0, y: FOCUS_UP }), FOCUS_DIST, true);
  ui.tutorial = new Tour(ui, [step], { id });
  return true;
}

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

/**
 * The coach: runs a list of steps (the first-visit tour, or a short lesson later on) with the partner's card,
 * the ring and the dimming. `opts.id` marks a lesson as over in state.tutorial when it ends (done or skipped).
 */
class Tour {
  constructor(ui, steps = STEPS, opts = {}) {
    this.ui = ui; this.g = ui.game;
    this.steps = steps; this.opts = opts;
    this.moved = false;
    this.cam = this.camKey();
    this.card = h('div#coach');
    this.spot = h('div#spot');
    ui.root.append(this.spot, this.card);
    ui.root.classList.add('touring');
    this.stepId = null; this.praise = null; this.targetEl = null; this.placed = null;
    // taps on anything the step isn't about are swallowed before they reach it (capture phase)
    this.guard = (e) => {
      if (this.allows(e.target)) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.type === 'click') this.nudge();
    };
    for (const type of GUARDED) document.addEventListener(type, this.guard, true);
    this.update();
  }
  get done() { return this.g.state.tutorial; }
  /** The step on screen (null between steps, while the praise shows). */
  get step() { return this.praise ? null : this.steps.find((x) => x.id === this.stepId) || null; }

  /**
   * May this element be tapped now? The coach card, an open card (the partner pick, a tryout), the debug panel
   * and the view always; otherwise only the step's target and what it `allow`s.
   */
  allows(el) {
    if (!(el instanceof Element)) return true;
    const ui = this.ui;
    if (this.card.contains(el) || el.closest('#modal, #debug, #view')) return true;
    const st = this.step;
    if (!st) return false;
    // the target looked up afresh: panels redraw their buttons, so the ringed one may already be a stale copy
    const ok = [st.target && !ui.modalOpen ? st.target(ui, this) : null, ...(st.allow ? st.allow(ui, this) : [])];
    return ok.some((x) => x instanceof Element && x.contains(el));
  }
  /** A tap on the scene (not a drag) goes through only on steps that work there. */
  sceneTap() { const st = this.step; return !!(st && st.scene && st.scene(this.g)); }
  /** Keys: turning the view always, the piece in hand on steps that work in the scene. */
  key(k) {
    if (k === 'q' || k === 'Q' || k === 'e' || k === 'E' || k === '`' || k === '~') return true;
    return this.sceneTap() && (k === 'r' || k === 'R');
  }
  /** Something else was tapped: the card gives a little shake, and the ring a pulse, to say "this first". */
  nudge() {
    for (const el of [this.card, this.spot]) { el.classList.remove('nudge'); void el.offsetWidth; el.classList.add('nudge'); }
  }
  /** The table-for-two step: straight into build mode, on the tab with the tables and chairs. */
  openBuild() {
    const g = this.g, ui = this.ui;
    if (!g.build.active) g.build.enter();
    ui.buildCat = 'dining'; ui.buildOpen = true;   // phones open the tray folded: unfold it
    ui.renderBuild();
  }
  /**
   * What to tap next in the build tray to get `want` (an item key, or 'done'): the ✓ beside the piece in hand once
   * it is pinned (nothing while it still follows the pointer: the floor comes first), "Back to items" with
   * something else in hand, Buy on a folded tray, else the item itself.
   */
  buildTarget(want) {
    const b = this.g.build, bar = this.ui.el.buildbar;
    if (b.placing()) {
      if (want !== 'done' && b.tool && 'f:' + b.tool.type === want) return b.locked ? this.ui.el.ghostctl.querySelector('.gc-btn.ok') : null;
      return bar.querySelector('.bb-mini .btn.small');
    }
    const fold = bar.querySelector('.bb-fold');
    if (fold) return fold.querySelector(want === 'done' ? '.done' : '.btn.primary');
    return bar.querySelector(want === 'done' ? '.done' : `[data-item="${want}"]`);
  }
  /** Where the table-for-two step stands: out of build mode, no table yet, chairs to add, or ready to finish. */
  seatStage() {
    const g = this.g, w = g.world;
    if (!g.build.active) return 'hammer';
    const tables = w.byKind('table');
    if (!tables.length) return 'table';
    return tables.some((f) => (f.seats || []).length >= 2) ? 'done' : 'chairs';
  }
  camKey() { const c = this.g.camera; return [c.tx, c.tz, c.yawTarget, c.distTarget].map((v) => v.toFixed(1)).join(); }
  /** The step to show: the first one not done whose time has come (the guest waits for the doors to open). */
  current() {
    const left = this.steps.filter((st) => !this.done.includes(st.id));
    return left.find((st) => !st.ready || st.ready(this.g, this)) || null;
  }
  finish(id, praise) {
    if (!this.done.includes(id)) this.done.push(id);
    if (praise) this.praise = { text: t(PRAISE[Math.floor(Math.random() * PRAISE.length)]), until: performance.now() + 1300 };
    this.g.changed('tutorial');
  }
  end() {
    if (this.opts.id) {   // a lesson: over for good, done or skipped
      if (!this.done.includes(this.opts.id)) this.done.push(this.opts.id);
      if (this.opts.onEnd) this.opts.onEnd(this);
    } else {
      this.g.state.tutorialSeen = true;
      // skipped before the table was set up: guests still need somewhere to sit
      if (!this.g.world.seats.length) { if (this.g.build.active) this.g.build.exit(); this.g.ensureSeats(); }
    }
    for (const type of GUARDED) document.removeEventListener(type, this.guard, true);
    this.card.remove(); this.spot.remove();
    this.mark(null);
    this.g.focus = null;
    if (this.g.camera.sticky) this.g.camera.unfollow(true);
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
    // the camera keeps whoever is busy with them in view (see watched()), a little above the middle so the card
    // below doesn't cover them; after a drag it comes back
    this.g.camera.follow(() => { const a = this.ui.tutorial === this && this.stepId === 'guest' && !c.gone && !c.served ? this.watched().who : null; return a ? { x: a.x * TILE, z: a.y * TILE } : null; }, () => ({ x: 0, y: FOCUS_UP }), FOCUS_DIST, true);
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
  /** Called with the UI's update (10 times a second). */
  update() {
    const g = this.g, ui = this.ui;
    if (this.camKey() !== this.cam) this.moved = true;
    this.cam = this.camKey();
    // a moment of praise after a step is done, before the next one comes up
    if (this.praise && performance.now() < this.praise.until) { g.focus = null; this.show('praise', null, this.praise.text, null); return; }
    this.praise = null;
    let st = this.current();
    while (st && st.done && st.done(g, ui, this)) { this.finish(st.id, true); return this.update(); }
    if (!this.steps.some((x) => !this.done.includes(x.id))) return this.end();
    if (st && st.id !== this.stepId) {
      this.stepId = st.id;
      if (st.panel !== undefined && ui.panel && ui.panel !== st.panel) ui.closePanel();   // the last step's panel goes away
      if (st.enter) st.enter(this);
    }
    if (st && st.id === 'guest') this.callGuest();
    // nothing ready yet (only the guest left, and it's night): say when the doors open
    const text = st ? st.text(g, this, ui) : t("We're closed for the night. The doors open at 08:00, see you then!");
    const target = st && st.target && !ui.modalOpen ? st.target(ui, this) : null;
    g.focus = (st && st.focus && st.focus(this)) || null;
    this.show(st ? st.id : 'wait', st, text, target);
  }
  /** Every frame: keep the ring and the card on the target as panels slide and the tray scrolls. */
  track() {
    if (!this.placed) return;
    let [st, target] = this.placed;
    // the panel redrew under the ring: find the new copy of the target rather than lose it for a moment
    if (target instanceof Element && !target.isConnected && st && st.target) this.placed[1] = target = st.target(this.ui, this);
    this.place(st, target);
  }

  /** Draw the card (only when what it says changed) and place it, the ring and the dimming around `target`. */
  show(id, st, text, target) {
    const ui = this.ui, g = this.g;
    const nextOn = st && (typeof st.next === 'function' ? st.next(g, ui) : st.next);
    const key = [id, text, nextOn ? 1 : 0].join('|');
    if (key !== this.key) {
      this.key = key;
      const look = (g.staff.find((a) => a.look.model === g.state.partner) || {}).look || roleLook('waiter', g.state.partner);
      const n = this.steps.findIndex((x) => x === st);
      const last = n === this.steps.length - 1;
      this.card.replaceChildren(
        h('i.coach-arrow'),
        h('div.coach-face', portrait(look, 56, 56)),
        h('div.coach-body',
          h('div.coach-who', h('b', partnerName(g)), n >= 0 && this.steps.length > 1 ? h('span', `${n + 1}/${this.steps.length}`) : null),
          h('div.coach-text', id === 'praise' ? [glyph('check', 18), ' ', text] : text),
          id === 'praise' ? null : h('div.coach-acts',
            nextOn ? h('button.btn.small.primary', { onclick: () => { this.finish(st.id, !st.center); this.update(); } }, last ? (st.doneLabel ? st.doneLabel() : t("Let's go!")) : n === 0 ? t('Next') : t('Got it')) : null,
            !last ? h('button.btn.small.ghost', { onclick: () => this.end() }, this.opts.id ? t('Skip') : t('Skip tour')) : null)));
      this.card.classList.toggle('praise', id === 'praise');
    }
    this.card.classList.toggle('hidden', !!ui.modalOpen);
    this.card.classList.toggle('center', !!(st && st.center));
    this.place(st, target);
    this.placed = [st, target];
  }

  /** Mark the ringed element (its red badge stays visible while the others are hidden during the tour). */
  mark(el) {
    if (this.targetEl === el) return;
    if (this.targetEl) this.targetEl.classList.remove('tour-target');
    if (el) el.classList.add('tour-target');
    this.targetEl = el;
    // an item further along the build tray: scrolled into view
    if (el && this.ui.el.buildbar.contains(el)) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
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
    const ch = c.offsetHeight || 110, gap = 16;
    // a character in the scene: the camera keeps them above the middle, the card waits at the bottom, clear of the toolbar
    if (!r && this.g.focus) {
      const cw = Math.min(420, W - 24), tb = ui.el.toolbar.getBoundingClientRect();
      const floor = tb.height && tb.top - root.top > H / 2 ? tb.top - root.top : H;
      Object.assign(c.style, { left: `${(W - cw) / 2}px`, top: `${Math.max(8, floor - ch - 12)}px`, right: 'auto', width: `${cw}px`, maxWidth: 'none' });
      return;
    }
    // nothing to point at, or something to tap while building (above the tray or beside the piece in hand the card
    // would cover the room being furnished): at the top
    if (!r || ui.el.ghostctl.contains(target) || ui.el.buildbar.contains(target)) { c.style.cssText = ''; return; }
    // inside an open side panel (desktop) with room to its left: sit beside the panel, so the row stays readable
    const P = ui.panel ? ui.el.panel.getBoundingClientRect() : null;
    const room = P ? P.left - root.left - 28 : 0;
    const inPanel = !!(P && target instanceof Element && ui.el.panel.contains(target));
    // a phone's bottom sheet holding the target: the card sits above the sheet, clear of the rows the step is
    // about (the staff to pick, say), and the ring alone marks the target
    if (inPanel && room < 300) {
      const cw = Math.min(420, W - 24), hudBottom = ui.el.hud.getBoundingClientRect().bottom - root.top;
      const top = Math.max(hudBottom + 8, P.top - root.top - gap - ch);
      Object.assign(c.style, { left: `${(W - cw) / 2}px`, top: `${top}px`, right: 'auto', width: `${cw}px`, maxWidth: 'none' });
      return;
    }
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
