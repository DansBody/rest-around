// DOM UI: top HUD, bottom toolbar, slide-in panels, build tray, character info card, toasts,
// end-of-day summary and level-up cards. Chrome images come from the manifest (skinnable).
import { h, bus, fmt, fmtTime, clamp } from '../util.js';
import { assets } from '../assets.js';
import { portrait } from '../portrait.js';
import { PANELS, buildTray, skillLine, kitLines, confirmBtn } from './panels.js';
import { RATING_WEIGHTS } from '../rating.js';
import { SNACKS, SKILL, ABILITY_UNLOCK_LV, questById, dishById, furnitureById, ingById, OFFLINE, SELL_RATE, wallDecorById, wallLayout } from '../data.js';
import { DOOR_Y } from '../world.js';
import { audio } from '../audio.js';
import { unlocksFor } from '../economy.js';
import { glyph } from './icons.js';
import { glassFx } from './glass.js';
import { t, tt, titledRole, setLang, getLang } from '../i18n.js';

// the tab bar uses monochrome line glyphs so it reads as one clean black capsule
const TOOLS = [
  { id: 'build', label: 'Build', glyph: 'build' },
  { id: 'staff', label: 'Staff', glyph: 'staff' },
  { id: 'menu', label: 'Menu', glyph: 'menu' },
  { id: 'garden', label: 'Garden', glyph: 'garden' },
  { id: 'market', label: 'Market', glyph: 'market' },
  { id: 'settings', label: 'Settings', glyph: 'settings' },
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
    this.buildDom();
    bus.on('toast', ({ msg, kind }) => this.toast(msg, kind));
    bus.on('changed', () => { this.dirty = true; });
    bus.on('build', (on) => this.onBuild(on));
    bus.on('buildChanged', () => { this.renderBuild(); this.renderGhostCtl(); });
    bus.on('dayEnd', (s) => this.queueModal(() => this.summaryCard(s)));
    bus.on('levelUp', (e) => this.celebrate(e));
    bus.on('ability', (a) => this.cutIn(a));
    bus.on('kitCast', (a) => this.cutIn(a, a.kit.active));
    bus.on('dayStart', (d) => this.toast(t('☀️ Day {d} — doors open!', { d }), 'good'));
    this.renderBuild();
    this.update(1);
    this.initGlass();
  }

  /** Switch language live: localize the data, then rebuild every piece of UI chrome. */
  setLanguage(l) {
    setLang(l);
    const panel = this.panel, sub = this.subview, sel = this.game.selected, building = this.game.build.active;
    for (const n of this.nodes) n.remove();
    glassFx.prune();
    this.abilityKey = null; this.infoFor = null;
    this.buildDom();
    if (building) this.onBuild(true); else this.renderBuild();
    if (panel) { this.openPanel(panel); this.subview = sub; this.renderPanel(); }
    if (sel) this.select(sel);
    if (this.modalOpen) { this.el.modal.replaceChildren(this.modalOpen()); this.el.modal.classList.add('show'); }
    this.update(1);
    this.initGlass();
    document.title = `${this.game.state.name} · Refillit`;
  }

  buildDom() {
    const r = this.root;
    const before = new Set(r.children);
    const ic = (id, s) => assets.iconEl(id, s);

    // ----- HUD -----
    this.el = {};
    const coin = h('div.chip', { title: t('Coins') }, ic('icon_coin', 30), (this.el.coins = h('span.num', '0')));
    this.el.lvlNum = h('b', 'Lv 1');
    this.el.brandName = h('span.bname', this.game.state.name);
    this.el.lvlTxt = h('span.muted', '0/0');
    this.el.lvlBar = h('i');
    const lvl = h('div.chip.brand', { title: t('Café level & points') }, h('div.badge-c', ic('tool_menu', 28), this.el.lvlNum),
      h('div.lvl-wrap', h('div.lvl-top', this.el.brandName, this.el.lvlTxt), h('div.pbar', this.el.lvlBar)));
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
    const clock = h('div.chip', { title: t('Day clock') }, ic('icon_clock', 28), h('div.clock', h('span', this.el.day), this.el.time, this.el.phase));
    this.el.speedTxt = h('span', '1×');
    this.el.speed = h('div.chip', { style: { display: 'none', fontSize: '15px' } }, glyph('fast', 18), this.el.speedTxt);
    this.el.gift = h('div.chip#gift', { title: t('Daily gift!'), onclick: () => this.claimGift() }, ic('icon_gift', 30));
    this.el.hud = h('div#hud', coin, lvl, rating, clock, this.el.speed, this.el.gift);
    this.el.ratingTip = h('div.card.rating-tip');
    r.append(this.el.hud, this.el.ratingTip);

    // daily goal: folded into a checklist button (top-left); tapping it opens the goal card
    this.el.questBadge = h('span.qb-badge');
    this.el.questBtn = h('button.chip#questbtn', { title: t('Daily goal'), onclick: () => this.toggleQuest() }, glyph('checklist', 22), this.el.questBadge);
    r.appendChild(this.el.questBtn);
    this.el.questIcon = h('div.q-ico');
    this.el.questText = h('div.q-text');
    this.el.questBar = h('i');
    this.el.questN = h('span.q-n');
    this.el.questReward = h('span.q-reward');
    this.el.quest = h('div#quest.glass', { onclick: () => this.toggleQuest(false) }, this.el.questIcon, h('div.q-body', this.el.questText, h('div.q-row', h('div.pbar.green', this.el.questBar), this.el.questN), this.el.questReward));
    r.appendChild(this.el.quest);

    // ----- toolbar -----
    this.toolBtns = {};
    // camera controls (the scene is real 3D: rotate in 90deg steps, recenter)
    // (they turn whichever café is on screen: a friend's while visiting)
    const shown = () => (this.game.renderer ? this.game.renderer.game : this.game);
    this.el.camctl = h('div#camctl',
      h('button.btn.small', { title: t('Rotate left (Q)'), onclick: () => { shown().camera.rotate(-1); shown().sfx('click'); } }, glyph('rotate', 20)),
      h('button.btn.small', { title: t('Center view'), onclick: () => { shown().camera.fit(shown().world.size); shown().sfx('click'); } }, glyph('recenter', 20)),
      h('button.btn.small', { title: t('Rotate right (E)'), onclick: () => { shown().camera.rotate(1); shown().sfx('click'); } }, glyph('rotate_r', 20)));
    r.appendChild(this.el.camctl);

    // staff ability dock: one button per staff member (keys 1–9)
    this.el.abilities = h('div#abilities');
    r.appendChild(this.el.abilities);

    this.el.cutin = h('div#cutin');
    r.appendChild(this.el.cutin);

    this.el.toolbar = h('div#toolbar', TOOLS.map((tool) => (this.toolBtns[tool.id] = h('button.btn.tool', { onclick: () => this.onTool(tool.id), title: t(tool.label), 'aria-label': t(tool.label) }, glyph(tool.glyph, 24)))));
    r.appendChild(this.el.toolbar);
    // friends: a round button floating on the right, opposite the daily goal (the tab bar is full enough)
    this.toolBtns.friends = this.el.friendsBtn = h('button.chip#friendsbtn', { onclick: () => this.onTool('friends'), title: t('Friends'), 'aria-label': t('Friends') }, glyph('friends', 22));
    r.appendChild(this.el.friendsBtn);

    // ----- side panel -----
    this.el.panelTitle = h('h2', '');
    this.el.panelIcon = h('span');
    this.el.panelBody = h('div.panel-body');
    this.el.panel = h('div.card#panel', h('div.grabber'),
      h('div.panel-head', this.el.panelIcon, this.el.panelTitle, h('button.btn.small.xbtn', { onclick: () => this.closePanel(), title: t('Close') }, glyph('close', 16))),
      this.el.panelBody);
    this.el.panel.addEventListener('pointerdown', () => { this.pointerInPanel = true; });
    window.addEventListener('pointerup', () => { setTimeout(() => { this.pointerInPanel = false; }, 0); });
    // phones: panels and the info card are bottom sheets; tapping the dimmed scene above closes them
    this.el.scrim = h('div#scrim', { onclick: () => this.closeSheets() });
    r.insertBefore(this.el.scrim, this.el.toolbar);
    r.appendChild(this.el.panel);

    // ----- build tray -----
    this.el.buildbar = h('div#buildbar');
    // rotate / cancel / place (or rotate / move / sell) floating right next to the item in the scene
    this.el.ghostctl = h('div#ghostctl');
    r.appendChild(this.el.ghostctl);
    this.el.buildBanner = h('div#buildbanner', glyph('build', 16), t('Build mode — the café is paused'));
    r.append(this.el.buildbar, this.el.buildBanner);

    // ----- info card, toasts, modal, debug host -----
    this.el.info = h('div.card#info');
    this.el.toasts = h('div#toasts');
    this.el.modal = h('div#modal');
    this.el.celebrate = h('div#celebrate');
    r.append(this.el.info, this.el.toasts, this.el.modal, this.el.celebrate);
    this.nodes = [...r.children].filter((n) => !before.has(n));
  }

  /** Lens-rim refraction on the floating chrome (Chromium only; elsewhere the CSS frost stays). */
  initGlass() {
    // the mono theme uses solid white surfaces: no lens refraction (it was also costly on phones)
    glassFx.setEnabled(false);
  }

  /** Phones have room for one sheet at a time; this flags it so the HUD around it steps aside. */
  syncSheets() {
    const info = this.el.info.classList.contains('show');
    this.root.classList.toggle('has-panel', !!this.panel);
    this.root.classList.toggle('has-info', info);
    this.root.classList.toggle('has-sheet', !!this.panel || info);
  }
  closeSheets() {
    this.toggleQuest(false);
    this.closePanel();
    if (this.game.selected) { this.game.selected = null; this.renderInfo(); }
    this.el.ratingTip.classList.remove('show');
  }

  // ---------------- staff abilities: the job's ability charges and fires by itself; the character's skill is cast from the dock ----------------
  /** Skill cut-in: a glass card slides in with the staff portrait and the ability name. */
  cutIn(a, ab = a.ability) {
    if (this.game.fastForwarding) return;
    const el = this.el.cutin;
    el.style.setProperty('--c', ab.color);
    el.replaceChildren(
      h('div.ci-face', portrait(a.look, 52, 52, 'ci-portrait'), h('span.ab-glyph', glyph(ab.glyph, 14))),
      h('div.ci-text', h('b', t('{ability}!', { ability: ab.name })), h('span', `${a.name} · ${a.roleName}`)));
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    clearTimeout(this.cutinTimer);
    this.cutinTimer = setTimeout(() => el.classList.remove('show'), 1700);
  }
  renderAbilities() {
    const g = this.game, dock = this.el.abilities;
    const key = g.build.active + '|' + g.staff.map((a) => `${a.id}:${a.role}:${a.abilityUnlocked()}:${a.look.model}:${a.kitUnlocked()}`).join(',');
    if (key !== this.abilityKey) {
      this.abilityKey = key;
      this.abilityBtns = g.staff.map((a) => {
        const ab = a.ability;
        const b = h('button.ability' + (a.abilityUnlocked() ? '' : '.locked'), { onclick: () => this.select(a), style: { '--c': ab.color } },
          portrait(a.look, 44, 44, 'ab-face'),
          h('span.ab-cd'),
          h('span.ab-glyph', glyph(a.abilityUnlocked() ? ab.glyph : 'lock', 14)));
        b.title = `${a.name} · ${ab.name}\n${ab.desc}\n` + (a.abilityUnlocked() ? t('Charges while working and fires by itself.') : t('Unlocks when {name} is {title}', { name: a.name, title: titledRole(SKILL.titles[ABILITY_UNLOCK_LV - 1], a.roleName) }));
        // the character's own skill: cast by tapping it (a cooldown ring fills while it recharges)
        const k = a.kit.active;
        let kb = null;
        if (k) {
          kb = h('button.ability.kit' + (a.kitUnlocked() ? '' : '.locked'), { onclick: () => this.castKit(a), style: { '--c': k.color } },
            h('span.ab-cd'), h('span.kit-glyph', glyph(a.kitUnlocked() ? k.glyph : 'lock', 22)));
          kb.title = `${a.name} · ${k.name}
${k.desc}
` + (a.kitUnlocked() ? t('Tap to cast · recharges in {n} s', { n: k.cooldown }) : t('Unlocks when {name} reaches skill Lv{n}', { name: a.name, n: ABILITY_UNLOCK_LV }));
        }
        return { a, b, kb, row: h('div.ab-row', b, kb) };
      });
      dock.replaceChildren(...this.abilityBtns.map((x) => x.row));
      dock.style.display = g.build.active || !g.staff.length ? 'none' : '';
    }
    for (const { a, b, kb } of this.abilityBtns) {
      if (kb) {
        const k = a.kit.active;
        kb.style.setProperty('--p', (a.kitCd > 0 ? (1 - a.kitCd / k.cooldown) * 100 : 100).toFixed(1) + '%');
        kb.classList.toggle('ready', a.kitReady());
        kb.classList.toggle('active', a.kitT > 0);
        kb.classList.toggle('tired', a.napping);
      }
      b.style.setProperty('--p', (a.boosted() ? 100 : a.charge * 100).toFixed(1) + '%');
      b.classList.toggle('ready', a.abilityUnlocked() && a.charge >= 1);
      b.classList.toggle('active', a.boosted());
      b.classList.toggle('tired', a.napping);
      b.classList.toggle('windup', a.windup > 0);
    }
  }

  castKit(a) {
    const g = this.game, k = a.kit.active;
    audio.unlock();
    if (!k || g.paused || g.build.active) return;
    if (!a.kitUnlocked()) return this.toast(t('Unlocks when {name} reaches skill Lv{n}', { name: a.name, n: ABILITY_UNLOCK_LV }), 'bad');
    if (a.napping) return this.toast(t('{name} is napping', { name: a.name }), 'bad');
    if (a.kitCd > 0) return this.toast(t('{ability} is recharging ({n} s)', { ability: k.name, n: Math.ceil(a.kitCd) }), 'bad');
    a.castKit();
  }

  // ---------------- toolbar & panels ----------------
  onTool(id) {
    audio.unlock();
    this.game.sfx('click');
    if (id === 'build') {
      if (this.game.build.active) this.game.build.exit();
      else if (!this.game.build.enter()) this.toast(t('Finish the day first!'), 'bad');
      return;
    }
    if (this.panel === id) return this.closePanel();
    this.openPanel(id);
  }
  openPanel(id) {
    // one window at a time: a panel replaces the character card and the popovers
    if (this.game.selected) { this.game.selected = null; this.renderInfo(); }
    this.el.ratingTip.classList.remove('show');
    this.toggleQuest(false);
    this.panel = id;
    this.subview = null;
    const p = PANELS[id];
    this.el.panelTitle.textContent = t(p.title);
    this.el.panelIcon.replaceChildren(assets.iconEl(p.icon, 30));
    this.el.panel.classList.add('open');
    for (const [k, b] of Object.entries(this.toolBtns)) b.classList.toggle('active', k === id);
    this.el.panelBody.scrollTop = 0;
    this.renderPanel();
    this.syncSheets();
  }
  closePanel() {
    this.panel = null;
    this.el.panel.classList.remove('open');
    for (const b of Object.values(this.toolBtns)) b.classList.remove('active');
    this.syncSheets();
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
    this.root.classList.toggle('building', on);
    this.toggleQuest(false);
    this.el.buildbar.classList.toggle('open', on);
    this.el.buildBanner.classList.toggle('show', on);
    if (on) { this.closePanel(); this.game.selected = null; this.buildCat = this.buildCat || 'dining'; }
    this.game.sfx(on ? 'open' : 'close');
    this.renderBuild();
    this.renderGhostCtl();
  }
  renderBuild() {
    if (!this.el || !this.el.buildbar) return;
    buildTray(this, this.el.buildbar);
  }

  // ---------------- floating build controls ----------------
  /** Buttons that float beside the pinned ghost (rotate · place · cancel) or the selected furniture (rotate · move · sell). */
  renderGhostCtl() {
    const b = this.game.build, el = this.el.ghostctl;
    const gh = b.ghost, sel = b.selected;
    let kids = null;
    if (b.active && b.wallMode() && b.locked && gh && gh.kind === 'wall') {
      const name = wallDecorById[gh.id].name;
      kids = [
        h('div.gc-label' + (gh.valid ? '' : '.bad'), gh.valid ? name : gh.reason),
        h('div.gc-row',
          h('button.gc-btn.ok' + (gh.valid ? '' : '.off'), { onclick: () => b.confirm(), title: b.movingWall ? t('Drop here') : t('Place here') }, glyph('check', 26)),
          h('button.gc-btn', { onclick: () => b.cancelPlacing(), title: t('Cancel (Esc)') }, glyph('close', 20))),
      ];
    } else if (b.active && b.selectedWall && !b.placing()) {
      const w = wallDecorById[b.selectedWall];
      kids = [
        h('div.gc-label', w.name),
        h('div.gc-row',
          h('button.gc-btn', { onclick: () => b.startMoveWall(), title: t('Move') }, glyph('move', 22)),
          confirmBtn('button.gc-btn.sell', t('Sell +{n}', { n: Math.floor(w.price * 0.5) }), t('Sell?'), () => b.sellSelectedWall()),
          h('button.gc-btn', { onclick: () => { b.selectedWall = null; this.renderBuild(); this.renderGhostCtl(); }, title: t('Close') }, glyph('close', 20))),
      ];
    } else if (b.active && b.placing() && b.locked && gh && gh.type) {
      const name = furnitureById[gh.type].name;
      kids = [
        h('div.gc-label' + (gh.valid ? '' : '.bad'), gh.valid ? name : gh.reason),
        h('div.gc-row',
          h('button.gc-btn', { onclick: () => b.rotate(), title: t('Rotate (R)') }, glyph('rotate_r', 22)),
          h('button.gc-btn.ok' + (gh.valid ? '' : '.off'), { onclick: () => b.confirm(), title: b.moving ? t('Drop here') : t('Place here') }, glyph('check', 26)),
          h('button.gc-btn', { onclick: () => b.cancelPlacing(), title: t('Cancel (Esc)') }, glyph('close', 20))),
      ];
    } else if (b.active && sel && !b.moving) {
      const cat = furnitureById[sel.type];
      kids = [
        h('div.gc-label', cat.name + (sel.broken ? t(' (broken)') : '')),
        h('div.gc-row',
          h('button.gc-btn', { onclick: () => b.rotateSelected(), title: t('Rotate') }, glyph('rotate_r', 22)),
          h('button.gc-btn', { onclick: () => b.startMove(), title: t('Move') }, glyph('move', 22)),
          confirmBtn('button.gc-btn.sell', t('Sell +{n}', { n: Math.floor(cat.price * SELL_RATE) }), t('Sell?'), () => b.sellSelected()),
          h('button.gc-btn', { onclick: () => { b.selected = null; this.renderBuild(); this.renderGhostCtl(); }, title: t('Close') }, glyph('close', 20))),
      ];
    }
    el.replaceChildren(...(kids || []));
    el.classList.toggle('show', !!kids);
    this.placeGhostCtl();
  }
  /** Every frame: keep the floating controls under the item as the camera pans, zooms and turns. */
  placeGhostCtl() {
    const el = this.el.ghostctl;
    if (!el.classList.contains('show')) return;
    const b = this.game.build, R = this.game.renderer;
    if (!R) return;
    const pos = (q) => {
      const vw = window.innerWidth, vh = window.innerHeight, w = el.offsetWidth, hh = el.offsetHeight;
      const x = Math.max(8, Math.min(vw - w - 8, q.x - w / 2));
      const y = Math.max(60, Math.min(vh - hh - 96, q.y + 22));
      el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    };
    // wall pieces: the buttons hang just under the piece, on the wall
    const wallSpot = b.wallMode() && b.ghost && b.ghost.kind === 'wall' ? b.ghost
      : b.selectedWall && !b.placing() ? wallLayout(this.game.world.size, DOOR_Y, this.game.state.wallDeco, this.game.state.wallPos)[b.selectedWall] : null;
    if (wallSpot) { const q = R.wallScreen(wallSpot.side, wallSpot.a, 0.9); if (q) pos(q); return; }
    const f = b.placing() ? b.ghost : b.selected;
    if (!f) return;
    let cx = f.x + 0.5, cy = f.y + 0.5;
    if (f.fp) { cx = f.x + f.fp[0] / 2; cy = f.y + f.fp[1] / 2; }
    else if (f.tiles && f.tiles.length) { cx = f.tiles.reduce((a, q) => a + q.x, 0) / f.tiles.length + 0.5; cy = f.tiles.reduce((a, q) => a + q.y, 0) / f.tiles.length + 0.5; }
    const q = R.project(cx, cy, 0);
    if (q) pos(q);
  }

  // ---------------- daily goal ----------------
  toggleQuest(show = !this.el.quest.classList.contains('show')) {
    if (show) { this.closePanel(); this.el.ratingTip.classList.remove('show'); if (this.game.selected) { this.game.selected = null; this.renderInfo(); } }
    this.el.quest.classList.toggle('show', show);
    this.el.questBtn.classList.toggle('on', show);
  }

  // ---------------- info card ----------------
  select(a) {
    // one window at a time: the character card replaces an open panel (and the rating popover)
    if (a) { this.closePanel(); this.el.ratingTip.classList.remove('show'); this.toggleQuest(false); }
    this.game.selected = a;
    this.renderInfo(true);
  }
  renderInfo(full) {
    const a = this.game.selected;
    const el = this.el.info;
    if (!a || a.gone || !this.game.agents.includes(a)) {
      if (el.classList.contains('show')) { el.classList.remove('show'); this.syncSheets(); }
      this.game.selected = null; this.infoFor = null; return;
    }
    const key = a.kind === 'staff' ? a.role + a.skillLv() + a.look.model + a.kitUnlocked() : '';
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
          isStaff ? skillLine(a) : h('div.muted', t('Guest')),
          (this.infoMood = h('div', { style: { fontWeight: 900, fontSize: '14px' } })))),
        h('div', { style: { marginTop: '8px' } }, this.infoTask),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' } }, assets.iconEl(isStaff ? 'icon_energy' : 'icon_patience', 22), h('div.pbar.grow', { style: { flex: 1 } }, this.infoBar), this.infoBarLbl),
      ];
      if (isStaff) {
        body.push(h('div.btnrow', SNACKS.map((s) => h('button.btn.small', { title: t('Feed {snack} (+{n} energy)', { snack: s.name, n: s.energy }), onclick: () => { this.game.eco.feed(a, s.id); this.renderInfo(true); } },
          assets.iconEl(s.asset, 22), `×${this.game.state.snacks[s.id] || 0}`))));
        const ab = a.ability;
        this.infoCharge = h('i');
        body.push(h('div.abil', { style: { '--c': ab.color, marginTop: '8px' }, title: ab.desc }, glyph(a.abilityUnlocked() ? ab.glyph : 'lock', 16), h('b', ab.name),
          a.abilityUnlocked() ? h('div.pbar.grow', { style: { flex: 1 } }, this.infoCharge) : h('span', t('unlocks at {title}', { title: SKILL.titles[ABILITY_UNLOCK_LV - 1] }))));
        body.push(...kitLines(a.look.model, a.kitUnlocked()));
        body.push(h('div.btnrow',
          h('button.btn.small', { onclick: () => { this.openPanel('staff'); this.subview = { outfit: a }; this.renderPanel(); } }, t('Change outfit')),
          h('button.btn.small', { onclick: () => { this.openPanel('staff'); this.subview = { job: a }; this.renderPanel(); } }, t('Change job'))));
      }
      body.push(h('div.btnrow', h('button.btn.small', { onclick: () => { this.game.selected = null; this.renderInfo(); } }, t('Close'))));
      el.replaceChildren(h('div.grabber'), ...body);
      el.classList.add('show');
      this.syncSheets();
    }
    if (a.kind === 'staff') {
      this.infoMood.textContent = a.napping ? t('😴 Napping') : a.energy < 25 ? t('🥱 Tired') : t('😊 Cheerful');
      this.infoTask.textContent = t('Task: {task}', { task: tt(a.task) });
      this.infoBar.style.width = a.energy + '%';
      this.infoBar.parentElement.className = 'pbar ' + (a.energy < 25 ? 'orange' : '');
      this.infoBarLbl.textContent = Math.round(a.energy) + '%';
      if (this.infoCharge) { this.infoCharge.style.width = (a.boosted() ? 100 : a.charge * 100) + '%'; this.infoCharge.style.background = a.ability.color; }
    } else {
      this.infoMood.textContent = tt(a.mood);
      this.infoTask.textContent = tt(a.task);
      const v = a.showPatience ? a.patience : 1;
      this.infoBar.style.width = v * 100 + '%';
      this.infoBar.parentElement.className = 'pbar ' + (v > 0.5 ? 'green' : v > 0.25 ? 'gold' : 'red');
      this.infoBarLbl.textContent = a.showPatience ? Math.round(v * 100) + '%' : '—';
    }
  }

  // ---------------- per-frame ----------------
  update(dt) {
    this.placeGhostCtl();
    this.acc += dt;
    if (this.acc < 0.1) return;
    this.acc = 0;
    const g = this.game, s = g.state;
    this.el.coins.textContent = fmt(s.coins);
    const lp = g.levelProgress();
    this.el.lvlNum.textContent = t('Lv {n}', { n: s.level });
    if (this.el.brandName.textContent !== s.name) this.el.brandName.textContent = s.name;
    this.updateQuest();
    this.el.lvlTxt.textContent = s.level >= g.maxLevel() ? t('MAX') : `${fmt(lp.cur)}/${fmt(lp.next)}`;
    this.el.lvlBar.style.width = lp.frac * 100 + '%';
    for (let i = 0; i < 5; i++) {
      const f = clamp(s.rating - i, 0, 1);
      this.starEls[i].style.clipPath = `inset(0 ${100 - f * 100}% 0 0)`;
    }
    this.el.ratingNum.textContent = s.rating.toFixed(1);
    this.el.day.textContent = t('Day {n}', { n: s.day });
    this.el.time.textContent = fmtTime(g.day.hour, getLang() !== 'en');
    this.el.phase.textContent = g.paused ? t('Closed') : g.build.active ? t('Paused') : g.day.hour >= 22 ? t('Last guests…') : g.day.phase.name;
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
    badge('friends', this.friends && this.friends.data ? this.friends.data.incoming.length : 0);
  }

  /** Daily goal card: icon, text, progress and the reward. */
  updateQuest() {
    const g = this.game, q = g.state.quest, el = this.el.quest;
    const hide = !q || !questById[q.id] || g.build.active;
    this.el.questBtn.style.display = hide ? 'none' : '';
    if (hide) { el.style.display = 'none'; return; }
    el.style.display = '';
    this.el.questBadge.textContent = q.done ? '✓' : `${q.prog}/${q.target}`;
    this.el.questBtn.classList.toggle('done', !!q.done);
    this.el.questBtn.style.setProperty('--p', Math.round(Math.min(1, q.prog / q.target) * 100) + '%');
    const def = questById[q.id];
    if (this.questIconId !== q.id) {
      this.questIconId = q.id;
      this.el.questIcon.replaceChildren(assets.iconEl({ cups: 'tool_menu', guests: 'tool_staff', bakes: 'dish_croissant', coins: 'icon_coin' }[q.id] || 'icon_coin', 32));
    }
    const r = g.eco.questReward();
    this.el.questText.textContent = q.done ? t('Daily goal complete!') : t(def.text, { n: q.target });
    this.el.questBar.style.width = (q.prog / q.target * 100) + '%';
    this.el.questN.textContent = `${q.prog}/${q.target}`;
    this.el.questReward.textContent = q.done ? '✓' : t('Reward: {c} coins · {p} pts', { c: r.coins, p: r.points });
    el.classList.toggle('done', !!q.done);
  }

  toggleRatingTip() {
    const show = !this.el.ratingTip.classList.contains('show');
    if (show) { this.closePanel(); this.toggleQuest(false); if (this.game.selected) { this.game.selected = null; this.renderInfo(); } }
    this.el.ratingTip.classList.toggle('show', show);
    this.renderRatingTip();
  }
  renderRatingTip() {
    const p = this.game.rating.parts;
    const names = { service: 'Service', clean: 'Cleanliness', dishes: 'Menu levels', decor: 'Decor', repair: 'Upkeep' };
    const rows = Object.keys(RATING_WEIGHTS).map((k) => h('div.rrow', h('span', t(names[k])), h('div.pbar.gold', h('i', { style: { width: p[k] * 100 + '%' } })), h('span', Math.round(p[k] * 100) + '%')));
    this.el.ratingTip.replaceChildren(h('b', t('Rating {a} → {b}', { a: this.game.state.rating.toFixed(2), b: this.game.rating.target.toFixed(2) })), ...rows, h('div.muted', t('More stars bring more customers. Tap to close.')));
    this.el.ratingTip.onclick = () => this.el.ratingTip.classList.remove('show');
  }

  claimGift() {
    const r = this.game.eco.claimGift();
    if (!r) return;
    const items = Object.entries(r.got).map(([k, v]) => h('span.ing', assets.iconEl('ing_' + k, 22), '×' + v));
    this.queueModal(() => h('div.card',
      h('div.hero-ico', assets.iconEl('icon_gift', 64)),
      h('div.big-title', t('Daily Gift!')),
      h('div.muted', t('A friendly farmer dropped by with:')),
      h('div.ings', { style: { justifyContent: 'center', margin: '10px 0' } }, items, h('span.ing', assets.iconEl('icon_coin', 22), '+' + r.coins)),
      h('button.btn.primary', { onclick: () => this.closeModal() }, t('Thank you!'))));
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
    const btn = h('button.btn.primary', { onclick: next }, t('Open Day {n}', { n: sm.day + 1 }));
    let left = 20;
    if (g.state.settings.autoNextDay) {
      this.modalTimer = setInterval(() => {
        left -= 1 * Math.max(1, g.timeScale / 4);
        btn.textContent = `${t('Open Day {n}', { n: sm.day + 1 })} (${Math.max(0, Math.ceil(left))})`;
        if (left <= 0) next();
      }, 1000);
    }
    const stat = (icon, label, v) => h('div.stat', assets.iconEl(icon, 26), h('b', v), h('span.muted', label));
    const costs = (sm.wages || 0) + (sm.rent || 0), stock = sm.restocked || 0, profit = sm.coins - costs - stock;
    const note = sm.owed ? t('The till ran short, so some wages went unpaid — the team will start tired.')
      : sm.soldOut ? t('{n} guest(s) left because a drink was sold out — keep the pantry stocked!', { n: sm.soldOut })
        : sm.noSeat ? t('{n} guest(s) left because every seat was taken — more tables would help!', { n: sm.noSeat })
          : dr >= 0 ? t('Word is spreading about your cozy little place.') : t('Keep things clean and fast to win back the stars.');
    return h('div.card',
      h('div.big-title', t('Day {n} complete!', { n: sm.day })),
      h('div.muted', t('The chairs are up and the lights are low. Here’s how it went:')),
      h('div.stat-grid',
        stat('emote_heart', t('Guests served'), sm.served),
        stat('emote_angry', t('Guests lost'), `${sm.lost + sm.noSeat}`),
        stat('icon_coin', t('Coins earned'), '+' + fmt(sm.coins)),
        stat('icon_coin', t('Wages & rent'), '−' + fmt(costs)),
        stat('ing_beans', t('Ingredients'), '−' + fmt(stock)),
        stat('icon_coin', t('Profit'), (profit >= 0 ? '+' : '−') + fmt(Math.abs(profit))),
        stat('icon_points', t('Café points'), '+' + fmt(sm.points)),
        stat('icon_star', t('Rating'), `${sm.ratingStart.toFixed(1)} → ${sm.ratingEnd.toFixed(1)}`),
        stat('icon_level', t('Level'), sm.levelEnd > sm.levelStart ? `${sm.levelStart} → ${sm.levelEnd}` : sm.levelEnd)),
      h('div.muted', { style: { marginBottom: '10px' } }, note),
      btn);
  }

  /** "While you were away": what the café did with the time since the game was last open. */
  awayCard(r) {
    const g = this.game;
    const mins = Math.round(r.elapsedSec / 60), dur = mins >= 60 ? t('{h} h {m} min', { h: Math.floor(mins / 60), m: mins % 60 }) : t('{m} min', { m: mins });
    const stat = (icon, label, v) => h('div.stat', assets.iconEl(icon, 26), h('b', v), h('span.muted', label));
    const sign = (n) => (n >= 0 ? '+' : '−') + fmt(Math.abs(n));
    const top = Object.entries(r.dishes).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const warn = (...kids) => h('div.away-note.warn', ...kids);
    const notes = [];
    if (r.noStaff) notes.push(warn(t('Without both a Server and a Barista nobody could serve guests — hire them so the café earns while you are away.')));
    if (r.rescued) notes.push(h('div.away-note', t('The supplier dropped off a starter pack to get you going.')));
    if (r.ranOut.length) notes.push(warn(t('Ran out of:'), ' ', ...r.ranOut.map((i) => h('span.ing', assets.iconEl('ing_' + i, 18), ingById[i].name)), ' ', t('— {n} guest(s) left empty-handed.', { n: r.soldOut })));
    if (r.broke.length) notes.push(warn(t('Out of order:'), ' ' + [...new Set(r.broke)].map((x) => furnitureById[x].name).join(', ') + '. ' + t('A Cleaner can fix it.')));
    if (r.unpaid) notes.push(warn(t('The till ran short, so some wages went unpaid — the team is tired.')));
    if (r.levelTo > r.levelFrom) {
      const ups = []; for (let lv = r.levelFrom + 1; lv <= r.levelTo; lv++) ups.push(...unlocksFor(lv));
      if (ups.length) notes.push(h('div.away-note', h('b', t('New things unlocked:')), ' ' + ups.join(' · ')));
    }
    if (r.readyCrops) notes.push(h('div.away-note', t('{n} garden plot(s) are ready to harvest.', { n: r.readyCrops })));
    if (r.snacksUsed) notes.push(h('div.away-note', t('The team shared {n} snack(s) from the pantry to keep going.', { n: r.snacksUsed })));
    if (r.capped) notes.push(h('div.away-note.muted', t('Trading is counted for up to {n} hours while you are away.', { n: OFFLINE.capHours })));
    const card = h('div.card.away',
      h('div.hero-ico', assets.iconEl('icon_gift', 56)),
      h('div.big-title', t('Welcome back!')),
      h('div.muted', t('{name} kept serving while you were away ({time}).', { name: g.state.name, time: dur })),
      h('div.stat-grid',
        stat('emote_heart', t('Guests served'), r.served),
        stat('icon_coin', t('Coins earned'), sign(r.net)),
        stat('icon_points', t('Café points'), '+' + fmt(r.points)),
        stat('icon_star', t('Rating'), `${r.ratingFrom.toFixed(1)} → ${r.ratingTo.toFixed(1)}`),
        stat('icon_level', t('Level'), r.levelTo > r.levelFrom ? `${r.levelFrom} → ${r.levelTo}` : r.levelTo),
        stat('emote_angry', t('Guests lost'), String(r.lost))),
      h('div.muted', { style: { marginBottom: '6px' } }, t('Sales {s} + tips {p} + nooks {f} − wages & rent {w} − ingredients {i}', { s: fmt(r.sales), p: fmt(r.tips), f: fmt(r.fees), w: fmt(r.wages + r.rent), i: fmt(r.restock) })),
      top.length ? h('div', h('div.muted', t('Best sellers')), h('div.ings', { style: { justifyContent: 'center', margin: '4px 0 8px' } }, top.map(([id, n]) => h('span.ing', assets.iconEl(dishById[id].asset, 24), '×' + n)))) : null,
      ...notes,
      h('button.btn.primary', { onclick: () => { g.paused = false; this.closeModal(); } }, t('Open the café')));
    return card;
  }
  /** Level-up card: non-blocking (the café keeps running) and auto-dismissing. */
  celebrate(e) {
    // several level-ups in a row (e.g. a big dish level-up) merge into one card
    if (this.levelAcc && this.el.celebrate.classList.contains('show')) { this.levelAcc.level = e.level; this.levelAcc.unlocks.push(...e.unlocks); }
    else this.levelAcc = { level: e.level, unlocks: [...e.unlocks] };
    const acc = this.levelAcc;
    const hide = () => { this.el.celebrate.classList.remove('show'); this.levelAcc = null; };
    this.el.celebrate.replaceChildren(h('div.card',
      h('div.hero-ico', assets.iconEl('icon_level', 56)),
      h('div.big-title', t('Level {n}!', { n: acc.level })),
      h('div.muted', t('New things unlocked:')),
      h('div', { style: { margin: '8px 0', fontWeight: 900, lineHeight: 1.5, maxHeight: '40vh', overflow: 'auto' } }, acc.unlocks.length ? acc.unlocks.map((u) => h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', justifyContent: 'center' } }, glyph('sparkles', 16), u)) : t('More café glory!')),
      h('button.btn.primary', { onclick: hide }, t('Yay!'))));
    this.el.celebrate.classList.add('show');
    clearTimeout(this.celebrateTimer);
    this.celebrateTimer = setTimeout(hide, 9000);
  }
}
