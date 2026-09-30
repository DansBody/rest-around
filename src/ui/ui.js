// DOM UI: top HUD, bottom toolbar, slide-in panels, build tray, character info card, toasts,
// end-of-day summary and level-up cards. Chrome images come from the manifest (skinnable).
import { h, bus, fmt, fmtTime, clamp } from '../util.js';
import { assets } from '../assets.js';
import { portrait } from '../portrait.js';
import { PANELS, buildTray, skillLine } from './panels.js';
import { RATING_WEIGHTS } from '../rating.js';
import { SNACKS, SKILL, ABILITY_UNLOCK_LV } from '../data.js';
import { audio } from '../audio.js';
import { glyph } from './icons.js';
import { glassFx } from './glass.js';

const TOOLS = [
  { id: 'build', label: 'Build', icon: 'tool_build' },
  { id: 'staff', label: 'Staff', icon: 'tool_staff' },
  { id: 'menu', label: 'Menu', icon: 'tool_menu' },
  { id: 'garden', label: 'Garden', icon: 'tool_garden' },
  { id: 'market', label: 'Market', icon: 'tool_market' },
  { id: 'settings', label: 'Settings', icon: 'tool_settings' },
];

export { portrait, thumb } from '../portrait.js';

export class UI {
  constructor(game, root) {
    this.game = game;
    this.root = root;
    this.panel = null;
    this.dirty = true;
    this.pointerInPanel = false;
    this.acc = 0;
    this.modalQueue = [];
    this.modalOpen = null;
  }

  init() {
    const r = this.root;
    const ic = (id, s) => assets.iconEl(id, s);

    // ----- HUD -----
    this.el = {};
    const coin = h('div.chip', { title: 'Coins' }, ic('icon_coin', 30), (this.el.coins = h('span.num', '0')));
    this.el.lvlNum = h('span', 'Lv 1');
    this.el.lvlTxt = h('span.muted', '0/0');
    this.el.lvlBar = h('i');
    const lvl = h('div.chip', { title: 'Gourmet points & level' }, ic('icon_points', 30), h('div.lvl-wrap', h('div.lvl-top', this.el.lvlNum, this.el.lvlTxt), h('div.pbar', this.el.lvlBar)));
    this.el.stars = h('span.stars');
    this.starEls = [];
    for (let i = 0; i < 5; i++) {
      const full = ic('icon_star', 24);
      full.style.position = 'absolute'; full.style.left = '0'; full.style.top = '0';
      const wrap = h('span', { style: { position: 'relative', display: 'inline-block', width: '24px', height: '24px' } }, ic('icon_star_empty', 24), full);
      this.starEls.push(full);
      this.el.stars.appendChild(wrap);
    }
    this.el.ratingNum = h('span.num', { style: { minWidth: '30px', fontSize: '15px' } }, '0.0');
    const rating = h('div.chip', { onclick: () => this.toggleRatingTip() }, this.el.stars, this.el.ratingNum);
    this.el.time = h('span', '8:00am');
    this.el.phase = h('small', 'Opening');
    this.el.day = h('small', 'Day 1');
    const clock = h('div.chip', { title: 'Day clock' }, ic('icon_clock', 28), h('div.clock', h('span', this.el.day), this.el.time, this.el.phase));
    this.el.speedTxt = h('span', '1×');
    this.el.speed = h('div.chip', { style: { display: 'none', fontSize: '15px' } }, glyph('fast', 18), this.el.speedTxt);
    this.el.gift = h('div.chip#gift', { title: 'Daily gift!', onclick: () => this.claimGift() }, ic('icon_gift', 30));
    this.el.hud = h('div#hud', coin, lvl, rating, clock, this.el.speed, this.el.gift);
    this.el.ratingTip = h('div.card.rating-tip');
    r.append(this.el.hud, this.el.ratingTip);

    // ----- toolbar -----
    this.toolBtns = {};
    // camera controls (the scene is real 3D: rotate in 90deg steps, recenter)
    const cam = this.game.camera;
    this.el.camctl = h('div#camctl',
      h('button.btn.small', { title: 'Rotate left (Q)', onclick: () => { cam.rotate(-1); this.game.sfx('click'); } }, glyph('rotate', 20)),
      h('button.btn.small', { title: 'Center view', onclick: () => { cam.fit(this.game.world.size); this.game.sfx('click'); } }, glyph('recenter', 20)),
      h('button.btn.small', { title: 'Rotate right (E)', onclick: () => { cam.rotate(1); this.game.sfx('click'); } }, glyph('rotate_r', 20)));
    r.appendChild(this.el.camctl);

    // staff ability dock: one button per staff member (keys 1–9)
    this.el.abilities = h('div#abilities');
    r.appendChild(this.el.abilities);

    this.el.toolbar = h('div#toolbar', TOOLS.map((t) => (this.toolBtns[t.id] = h('button.btn.tool', { onclick: () => this.onTool(t.id), title: t.label }, ic(t.icon, 26), h('span', t.label)))));
    r.appendChild(this.el.toolbar);

    // ----- side panel -----
    this.el.panelTitle = h('h2', '');
    this.el.panelIcon = h('span');
    this.el.panelBody = h('div.panel-body');
    this.el.panel = h('div.card#panel',
      h('div.panel-head', this.el.panelIcon, this.el.panelTitle, h('button.btn.small.xbtn', { onclick: () => this.closePanel(), title: 'Close' }, glyph('close', 16))),
      this.el.panelBody);
    this.el.panel.addEventListener('pointerdown', () => { this.pointerInPanel = true; });
    window.addEventListener('pointerup', () => { setTimeout(() => { this.pointerInPanel = false; }, 0); });
    r.appendChild(this.el.panel);

    // ----- build tray -----
    this.el.buildbar = h('div#buildbar');
    this.el.buildBanner = h('div#buildbanner', glyph('build', 16), 'Build mode — the restaurant is paused');
    r.append(this.el.buildbar, this.el.buildBanner);

    // ----- info card, toasts, modal, debug host -----
    this.el.info = h('div.card#info');
    this.el.toasts = h('div#toasts');
    this.el.modal = h('div#modal');
    this.el.celebrate = h('div#celebrate');
    r.append(this.el.info, this.el.toasts, this.el.modal, this.el.celebrate);

    bus.on('toast', ({ msg, kind }) => this.toast(msg, kind));
    bus.on('changed', () => { this.dirty = true; });
    bus.on('build', (on) => this.onBuild(on));
    bus.on('buildChanged', () => this.renderBuild());
    bus.on('dayEnd', (s) => this.queueModal(() => this.summaryCard(s)));
    bus.on('levelUp', (e) => this.celebrate(e));
    bus.on('dayStart', (d) => this.toast(`☀️ Day ${d} — doors open!`, 'good'));
    this.renderBuild();
    this.update(1);
    this.initGlass();
  }

  /** Lens-rim refraction on the floating chrome (Chromium only; elsewhere the CSS frost stays). */
  initGlass() {
    glassFx.enabled = this.game.state.settings.glass !== false;
    for (const c of this.el.hud.children) glassFx.attach(c, { blur: 3, strength: 22, bezel: 12 });
    glassFx.attach(this.el.toolbar, { blur: 2.5, strength: 32, bezel: 18 });
    for (const b of this.el.camctl.children) glassFx.attach(b, { blur: 2, strength: 22, bezel: 14 });
    glassFx.attach(this.el.panel, { blur: 14, strength: 60, bezel: 28 });
    glassFx.attach(this.el.info, { blur: 12, strength: 44, bezel: 24 });
  }

  // ---------------- staff abilities (display only: they charge and fire by themselves) ----------------
  renderAbilities() {
    const g = this.game, dock = this.el.abilities;
    const key = g.build.active + '|' + g.staff.map((a) => `${a.id}:${a.role}:${a.abilityUnlocked()}`).join(',');
    if (key !== this.abilityKey) {
      this.abilityKey = key;
      this.abilityBtns = g.staff.map((a) => {
        const ab = a.ability;
        const b = h('button.ability' + (a.abilityUnlocked() ? '' : '.locked'), { onclick: () => this.select(a), style: { '--c': ab.color } },
          portrait(a.look, 44, 44, 'ab-face'),
          h('span.ab-cd'),
          h('span.ab-glyph', glyph(a.abilityUnlocked() ? ab.glyph : 'lock', 14)));
        b.title = `${a.name} · ${ab.name}\n${ab.desc}` + (a.abilityUnlocked() ? '\nCharges while working and fires by itself.' : `\nUnlocks when ${a.name} is ${SKILL.titles[ABILITY_UNLOCK_LV - 1]} ${a.roleName}`);
        return { a, b };
      });
      dock.replaceChildren(...this.abilityBtns.map((x) => x.b));
      dock.style.display = g.build.active || !g.staff.length ? 'none' : '';
    }
    for (const { a, b } of this.abilityBtns) {
      b.style.setProperty('--p', (a.boosted() ? 100 : a.charge * 100).toFixed(1) + '%');
      b.classList.toggle('ready', a.abilityUnlocked() && a.charge >= 1);
      b.classList.toggle('active', a.boosted());
      b.classList.toggle('tired', a.napping);
    }
  }

  // ---------------- toolbar & panels ----------------
  onTool(id) {
    audio.unlock();
    this.game.sfx('click');
    if (id === 'build') {
      if (this.game.build.active) this.game.build.exit();
      else if (!this.game.build.enter()) this.toast('Finish the day first!', 'bad');
      return;
    }
    if (this.panel === id) return this.closePanel();
    this.openPanel(id);
  }
  openPanel(id) {
    this.panel = id;
    this.subview = null;
    const p = PANELS[id];
    this.el.panelTitle.textContent = p.title;
    this.el.panelIcon.replaceChildren(assets.iconEl(p.icon, 30));
    this.el.panel.classList.add('open');
    for (const [k, b] of Object.entries(this.toolBtns)) b.classList.toggle('active', k === id);
    this.el.panelBody.scrollTop = 0;
    this.renderPanel();
  }
  closePanel() {
    this.panel = null;
    this.el.panel.classList.remove('open');
    for (const b of Object.values(this.toolBtns)) b.classList.remove('active');
  }
  renderPanel() {
    if (!this.panel) return;
    const body = this.el.panelBody;
    const top = body.scrollTop;
    body.replaceChildren();
    PANELS[this.panel].render(this, body);
    body.scrollTop = top;
    this.dirty = false;
    this.lastPanelRender = performance.now();
  }

  // ---------------- build ----------------
  onBuild(on) {
    this.el.toolbar.style.display = on ? 'none' : '';
    this.el.camctl.style.bottom = on ? '260px' : '';
    this.el.buildbar.classList.toggle('open', on);
    this.el.buildBanner.classList.toggle('show', on);
    if (on) { this.closePanel(); this.game.selected = null; this.buildCat = this.buildCat || 'dining'; }
    this.game.sfx(on ? 'open' : 'close');
    this.renderBuild();
  }
  renderBuild() {
    if (!this.el || !this.el.buildbar) return;
    buildTray(this, this.el.buildbar);
  }

  // ---------------- info card ----------------
  select(a) {
    this.game.selected = a;
    this.renderInfo(true);
  }
  renderInfo(full) {
    const a = this.game.selected;
    const el = this.el.info;
    if (!a || a.gone || !this.game.agents.includes(a)) { el.classList.remove('show'); this.game.selected = null; this.infoFor = null; return; }
    const key = a.kind === 'staff' ? a.role + a.skillLv() : '';
    if (full || this.infoFor !== a || this.infoKey !== key) {
      this.infoFor = a; this.infoKey = key;
      this.infoPortrait = portrait(a.look, 64, 80);
      this.infoTask = h('div.muted');
      this.infoBar = h('i');
      this.infoBarLbl = h('span.muted');
      const isStaff = a.kind === 'staff';
      const body = [
        h('div.info-head', this.infoPortrait, h('div.grow',
          h('h3', a.name),
          isStaff ? skillLine(a) : h('div.muted', 'Guest'),
          (this.infoMood = h('div', { style: { fontWeight: 900, fontSize: '14px' } })))),
        h('div', { style: { marginTop: '8px' } }, this.infoTask),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' } }, assets.iconEl(isStaff ? 'icon_energy' : 'icon_patience', 22), h('div.pbar.grow', { style: { flex: 1 } }, this.infoBar), this.infoBarLbl),
      ];
      if (isStaff) {
        body.push(h('div.btnrow', SNACKS.map((s) => h('button.btn.small', { title: `Feed ${s.name} (+${s.energy} energy)`, onclick: () => { this.game.eco.feed(a, s.id); this.renderInfo(true); } },
          assets.iconEl(s.asset, 22), `×${this.game.state.snacks[s.id] || 0}`))));
        const ab = a.ability;
        this.infoCharge = h('i');
        body.push(h('div.abil', { style: { '--c': ab.color, marginTop: '8px' }, title: ab.desc }, glyph(a.abilityUnlocked() ? ab.glyph : 'lock', 16), h('b', ab.name),
          a.abilityUnlocked() ? h('div.pbar.grow', { style: { flex: 1 } }, this.infoCharge) : h('span', `unlocks at ${SKILL.titles[ABILITY_UNLOCK_LV - 1]}`)));
        body.push(h('div.btnrow',
          h('button.btn.small', { onclick: () => { this.openPanel('staff'); this.subview = { outfit: a }; this.renderPanel(); } }, 'Change outfit'),
          h('button.btn.small', { onclick: () => { this.openPanel('staff'); this.subview = { job: a }; this.renderPanel(); } }, 'Change job')));
      }
      body.push(h('div.btnrow', h('button.btn.small', { onclick: () => { this.game.selected = null; this.renderInfo(); } }, 'Close')));
      el.replaceChildren(...body);
      el.classList.add('show');
    }
    if (a.kind === 'staff') {
      this.infoMood.textContent = a.napping ? '😴 Napping' : a.energy < 25 ? '🥱 Tired' : '😊 Cheerful';
      this.infoTask.textContent = 'Task: ' + a.task;
      this.infoBar.style.width = a.energy + '%';
      this.infoBar.parentElement.className = 'pbar ' + (a.energy < 25 ? 'orange' : '');
      this.infoBarLbl.textContent = Math.round(a.energy) + '%';
      if (this.infoCharge) { this.infoCharge.style.width = (a.boosted() ? 100 : a.charge * 100) + '%'; this.infoCharge.style.background = a.ability.color; }
    } else {
      this.infoMood.textContent = a.mood;
      this.infoTask.textContent = a.task;
      const v = a.showPatience ? a.patience : 1;
      this.infoBar.style.width = v * 100 + '%';
      this.infoBar.parentElement.className = 'pbar ' + (v > 0.5 ? 'green' : v > 0.25 ? 'gold' : 'red');
      this.infoBarLbl.textContent = a.showPatience ? Math.round(v * 100) + '%' : '—';
    }
  }

  // ---------------- per-frame ----------------
  update(dt) {
    this.acc += dt;
    if (this.acc < 0.1) return;
    this.acc = 0;
    const g = this.game, s = g.state;
    this.el.coins.textContent = fmt(s.coins);
    const lp = g.levelProgress();
    this.el.lvlNum.textContent = 'Lv ' + s.level;
    this.el.lvlTxt.textContent = s.level >= g.maxLevel() ? 'MAX' : `${fmt(lp.cur)}/${fmt(lp.next)}`;
    this.el.lvlBar.style.width = lp.frac * 100 + '%';
    for (let i = 0; i < 5; i++) {
      const f = clamp(s.rating - i, 0, 1);
      this.starEls[i].style.clipPath = `inset(0 ${100 - f * 100}% 0 0)`;
    }
    this.el.ratingNum.textContent = s.rating.toFixed(1);
    this.el.day.textContent = 'Day ' + s.day;
    this.el.time.textContent = fmtTime(g.day.hour);
    this.el.phase.textContent = g.paused ? 'Closed' : g.build.active ? 'Paused' : g.day.hour >= 22 ? 'Last guests…' : g.day.phase.name;
    this.el.gift.style.display = g.eco.giftAvailable() ? '' : 'none';
    this.el.speed.style.display = g.timeScale !== 1 ? '' : 'none';
    this.el.speedTxt.textContent = `${g.timeScale}×`;
    if (this.el.ratingTip.classList.contains('show')) this.renderRatingTip();
    if (this.panel) {
      const age = performance.now() - (this.lastPanelRender || 0);
      const live = PANELS[this.panel].live && age > 1000;
      if ((this.dirty || live) && !this.pointerInPanel) this.renderPanel();
      else if (PANELS[this.panel].tick) PANELS[this.panel].tick(this, this.el.panelBody);
    }
    this.renderInfo();
    this.renderAbilities();
    const badge = (id, n) => {
      const b = this.toolBtns[id];
      let el = b.querySelector('.badge');
      if (n > 0) { if (!el) b.appendChild((el = h('span.badge'))); el.textContent = n; } else if (el) el.remove();
    };
    badge('staff', g.staff.filter((a) => a.napping).length);
    badge('garden', s.garden.filter((p) => p.crop && (p.prog >= 1 || p.water <= 0)).length);
    badge('market', g.eco.giftAvailable() ? 1 : 0);
  }

  toggleRatingTip() { this.el.ratingTip.classList.toggle('show'); this.renderRatingTip(); }
  renderRatingTip() {
    const p = this.game.rating.parts;
    const names = { service: 'Service', clean: 'Cleanliness', dishes: 'Dish levels', decor: 'Decor', repair: 'Upkeep' };
    const rows = Object.keys(RATING_WEIGHTS).map((k) => h('div.rrow', h('span', names[k]), h('div.pbar.gold', h('i', { style: { width: p[k] * 100 + '%' } })), h('span', Math.round(p[k] * 100) + '%')));
    this.el.ratingTip.replaceChildren(h('b', `Rating ${this.game.state.rating.toFixed(2)} → ${this.game.rating.target.toFixed(2)}`), ...rows, h('div.muted', 'More stars bring more customers. Tap to close.'));
    this.el.ratingTip.onclick = () => this.el.ratingTip.classList.remove('show');
  }

  claimGift() {
    const r = this.game.eco.claimGift();
    if (!r) return;
    const items = Object.entries(r.got).map(([k, v]) => h('span.ing', assets.iconEl('ing_' + k, 22), '×' + v));
    this.queueModal(() => h('div.card',
      h('div.hero-ico', assets.iconEl('icon_gift', 64)),
      h('div.big-title', 'Daily Gift!'),
      h('div.muted', 'A friendly farmer dropped by with:'),
      h('div.ings', { style: { justifyContent: 'center', margin: '10px 0' } }, items, h('span.ing', assets.iconEl('icon_coin', 22), '+' + r.coins)),
      h('button.btn.primary', { onclick: () => this.closeModal() }, 'Thank you!')));
  }

  // ---------------- toasts & modals ----------------
  toast(msg, kind = '') {
    const t = h('div.toast' + (kind ? '.' + kind : ''), msg);
    this.el.toasts.appendChild(t);
    while (this.el.toasts.children.length > 4) this.el.toasts.firstChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 350); }, 2800);
  }
  queueModal(fn) {
    this.modalQueue.push(fn);
    if (!this.modalOpen) this.nextModal();
  }
  nextModal() {
    const fn = this.modalQueue.shift();
    if (!fn) { this.modalOpen = null; this.el.modal.classList.remove('show'); return; }
    this.modalOpen = fn;
    this.el.modal.replaceChildren(fn());
    this.el.modal.classList.add('show');
  }
  closeModal() {
    if (this.modalTimer) { clearInterval(this.modalTimer); this.modalTimer = null; }
    this.modalOpen = null;
    this.nextModal();
  }

  summaryCard(sm) {
    const g = this.game;
    const dr = sm.ratingEnd - sm.ratingStart;
    const next = () => { this.closeModal(); if (g.paused) g.day.startNextDay(); };
    const btn = h('button.btn.primary', { onclick: next }, `Open Day ${sm.day + 1}`);
    let left = 20;
    if (g.state.settings.autoNextDay) {
      this.modalTimer = setInterval(() => {
        left -= 1 * Math.max(1, g.timeScale / 4);
        btn.textContent = `Open Day ${sm.day + 1} (${Math.max(0, Math.ceil(left))})`;
        if (left <= 0) next();
      }, 1000);
    }
    const stat = (icon, label, v) => h('div.stat', assets.iconEl(icon, 26), h('b', v), h('span.muted', label));
    return h('div.card',
      h('div.big-title', `Day ${sm.day} complete!`),
      h('div.muted', 'The chairs are up and the lights are low. Here’s how it went:'),
      h('div.stat-grid',
        stat('emote_heart', 'Guests served', sm.served),
        stat('emote_angry', 'Guests lost', `${sm.lost + sm.noSeat}`),
        stat('icon_coin', 'Coins earned', '+' + fmt(sm.coins)),
        stat('icon_points', 'Gourmet points', '+' + fmt(sm.points)),
        stat('icon_star', 'Rating', `${sm.ratingStart.toFixed(1)} → ${sm.ratingEnd.toFixed(1)}`),
        stat('icon_level', 'Level', sm.levelEnd > sm.levelStart ? `${sm.levelStart} → ${sm.levelEnd}` : sm.levelEnd)),
      h('div.muted', { style: { marginBottom: '10px' } }, sm.noSeat ? `${sm.noSeat} guest(s) left because every seat was taken — more tables would help!` : dr >= 0 ? 'Word is spreading about your cozy little place.' : 'Keep things clean and fast to win back the stars.'),
      btn);
  }
  /** Level-up card: non-blocking (the restaurant keeps running) and auto-dismissing. */
  celebrate(e) {
    // several level-ups in a row (e.g. a big dish level-up) merge into one card
    if (this.levelAcc && this.el.celebrate.classList.contains('show')) { this.levelAcc.level = e.level; this.levelAcc.unlocks.push(...e.unlocks); }
    else this.levelAcc = { level: e.level, unlocks: [...e.unlocks] };
    const acc = this.levelAcc;
    const hide = () => { this.el.celebrate.classList.remove('show'); this.levelAcc = null; };
    this.el.celebrate.replaceChildren(h('div.card',
      h('div.hero-ico', assets.iconEl('icon_level', 56)),
      h('div.big-title', `Level ${acc.level}!`),
      h('div.muted', 'New things unlocked:'),
      h('div', { style: { margin: '8px 0', fontWeight: 900, lineHeight: 1.5, maxHeight: '40vh', overflow: 'auto' } }, acc.unlocks.length ? acc.unlocks.map((u) => h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', justifyContent: 'center' } }, glyph('sparkles', 16), u)) : 'More gourmet glory!'),
      h('button.btn.primary', { onclick: hide }, 'Yay!')));
    this.el.celebrate.classList.add('show');
    clearTimeout(this.celebrateTimer);
    this.celebrateTimer = setTimeout(hide, 9000);
  }
}
