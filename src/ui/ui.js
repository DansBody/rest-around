// DOM UI: top HUD, bottom toolbar, slide-in panels, build tray, character info card, toasts,
// end-of-day summary and level-up cards. Chrome images come from the manifest (skinnable).
import { h, bus, fmt, fmtTime, clamp } from '../util.js';
import { assets } from '../assets.js';
import { portrait } from '../portrait.js';
import { PANELS, buildTray, skillLine, kitLines, clubLines, confirmBtn } from './panels.js';
import { RATING_WEIGHTS } from '../rating.js';
import { DAY, SNACKS, SKILL, ABILITY_UNLOCK_LV, CLUBS, TROUBLE, questById, dishById, furnitureById, ingById, OFFLINE, SELL_RATE, wallDecorById, wallLayout } from '../data.js';
import { DOOR_Y } from '../world.js';
import { audio } from '../audio.js';
import { unlocksFor } from '../economy.js';
import { roundOfDay, ROUNDS_PER_DAY } from '../clock.js';
import { glyph } from './icons.js';
import { glassFx } from './glass.js';
import { t, tt, titledRole, setLang, getLang } from '../i18n.js';

// the tab bar uses monochrome line glyphs so it reads as one clean black capsule
const TOOLS = [
  { id: 'build', label: 'Build', glyph: 'build' },
  { id: 'staff', label: 'Staff', glyph: 'staff' },
  { id: 'menu', label: 'Menu', glyph: 'menu' },
  { id: 'train', label: 'Training', glyph: 'train' },
  { id: 'market', label: 'Market', glyph: 'market' },
  { id: 'settings', label: 'Settings', glyph: 'settings' },
];

export { portrait, thumb } from '../portrait.js';
/** A sentence with one piece (marked by KEEP) that must not break across lines, e.g. "3 h 25 min". */
const KEEP = '\u2063';   // invisible separator
const keepTogether = (text, piece) => text.split(KEEP).flatMap((x, i) => (i ? [h('span.seg', piece), x] : [x]));
/** "a + b − c": each term with its sign stays on one line; lines break between terms. */
const GC_RING = 70;   // px from an item's centre to the buttons around it in build mode
// where each button goes round the ring, in degrees clockwise from 3 o'clock (by how many there are):
// 2 = ✓ right, ✕ left; 3 = top left, bottom, top right; 4 = a diamond: left, top, right, bottom (rotate · move · sell · ✓)
const GC_ANGLES = { 2: [0, 180], 3: [210, 90, -30], 4: [180, 270, 0, 90] };
const opSegs = (text) => text.split(/\s*(?=[＋－+−])/).map((x) => h('span.seg', x));

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
    bus.on('roundEnd', (s) => this.receipt(s));
    bus.on('levelUp', (e) => this.celebrate(e));
    bus.on('ability', (a) => this.cutIn(a));
    bus.on('kitCast', (a) => this.cutIn(a, a.kit.active));
    bus.on('roundStart', () => this.toast(t('☀️ 08:00 — doors open!'), 'good'));
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
    const ic = (id, s, cls) => assets.iconEl(id, s, cls);

    // ----- HUD: one row. The café (name, level, a hairline of level progress) on the left, the live numbers on the right -----
    this.el = {};
    this.el.lvlNum = h('b.hb-lv', 'Lv 1');
    this.el.brandName = h('span.bname', this.game.state.name);
    this.el.lvlTxt = h('span');   // level points and the day go in the tooltips, not on screen
    this.el.day = h('span');
    // level progress: a ring round the café pill, filling clockwise from the top centre
    const NS = 'http://www.w3.org/2000/svg';
    const ring = document.createElementNS(NS, 'svg');
    ring.setAttribute('class', 'hb-ring'); ring.setAttribute('aria-hidden', 'true');
    const track = document.createElementNS(NS, 'path'), fill = document.createElementNS(NS, 'path');
    track.setAttribute('class', 'hb-ring-track'); fill.setAttribute('class', 'hb-ring-fill');
    for (const p of [track, fill]) { p.setAttribute('pathLength', '100'); ring.appendChild(p); }
    this.el.lvlBar = fill;
    const brand = h('div#hudbrand', this.el.brandName, this.el.lvlNum, ring);
    // the pill is as wide as the name: redraw its outline whenever it changes size
    if (this.hudRO) this.hudRO.disconnect();
    this.hudRO = new ResizeObserver(() => {
      const w = brand.offsetWidth, ht = brand.offsetHeight, sw = 3, r = ht / 2 - sw / 2;
      if (!w) return;
      const d = `M${w / 2} ${sw / 2}H${w - ht / 2}A${r} ${r} 0 0 1 ${w - ht / 2} ${ht - sw / 2}H${ht / 2}A${r} ${r} 0 0 1 ${ht / 2} ${sw / 2}Z`;
      ring.setAttribute('viewBox', `0 0 ${w} ${ht}`);
      track.setAttribute('d', d); fill.setAttribute('d', d);
    });
    this.hudRO.observe(brand);
    // the five-star row is still kept up to date, but the pill shows one star and the number
    this.el.stars = h('span.stars');
    this.starEls = [];
    for (let i = 0; i < 5; i++) {
      const full = ic('icon_star', 24);
      full.style.position = 'absolute'; full.style.left = '0'; full.style.top = '0';
      const wrap = h('span', { style: { position: 'relative', display: 'inline-block', width: '24px', height: '24px' } }, ic('icon_star_empty', 24), full);
      this.starEls.push(full);
      this.el.stars.appendChild(wrap);
    }
    this.el.ratingNum = h('span.num', '0.0');
    const coin = h('span.hs', { title: t('Coins') }, ic('icon_coin', 20), (this.el.coins = h('span.num', '0')));
    const rating = h('button.hs.rating', { title: t('Rating'), onclick: () => this.toggleRatingTip() }, ic('icon_star', 18), this.el.ratingNum);
    this.el.time = h('span.num', '8:00am');
    this.el.phase = h('small', 'Opening');   // the clock's tooltip; not on screen
    const clock = h('span.hs.clock', { title: t('Café clock') }, this.el.time);
    this.el.speedTxt = h('span', '1×');
    this.el.speed = h('span.hs.speed', { style: { display: 'none' } }, glyph('fast', 16), this.el.speedTxt);
    this.el.hud = h('div#hud', brand, h('div#hudstats', coin, rating, clock, this.el.speed));
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
    // no on-screen camera buttons: drag / pinch / two-finger twist, right-drag or Q / E turn the view

    // staff ability dock: one button per staff member (keys 1–9), folded away behind the skills
    // button (bottom-left) until opened; the button glows while something is ready to fire
    try { this.abOpen = localStorage.getItem('refillit.skillsOpen') === '1'; } catch { this.abOpen = false; }
    this.el.abilities = h('div#abilities' + (this.abOpen ? '.open' : ''));
    this.el.abToggle = h('button.chip#abtoggle' + (this.abOpen ? '.open' : ''), { onclick: () => this.toggleSkills(), title: t('Staff skills'), 'aria-label': t('Staff skills'), 'aria-expanded': String(this.abOpen) }, glyph('sparkles', 22));
    r.append(this.el.abilities, this.el.abToggle);

    this.el.cutin = h('div#cutin');
    r.appendChild(this.el.cutin);

    // trouble in the café: one red button per troublemaker, under the HUD (tap = send a trained staff member)
    this.el.alerts = h('div#alerts');
    r.appendChild(this.el.alerts);
    this.alertKey = null;

    this.el.toolbar = h('div#toolbar', TOOLS.map((tool) => (this.toolBtns[tool.id] = h('button.btn.tool', { onclick: () => this.onTool(tool.id), title: t(tool.label), 'aria-label': t(tool.label) }, glyph(tool.glyph, 24)))));
    r.appendChild(this.el.toolbar);
    // friends: a round button floating on the right, opposite the daily goal (the tab bar is full enough)
    this.toolBtns.friends = this.el.friendsBtn = h('button.chip#friendsbtn', { onclick: () => this.onTool('friends'), title: t('Friends'), 'aria-label': t('Friends') }, glyph('friends', 22));
    r.appendChild(this.el.friendsBtn);

    // ----- side panel -----
    this.el.panelTitle = h('h2', '');
    this.el.panelIcon = h('span.ph-ico');
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
    this.el.buildBanner = h('div#buildbanner', glyph('build', 16), t('Build mode — the time is made up when you finish'));
    r.append(this.el.buildbar, this.el.buildBanner);

    // ----- info card, toasts, modal, debug host -----
    this.el.info = h('div.card#info');
    this.el.toasts = h('div#toasts');
    this.el.modal = h('div#modal');
    this.el.celebrate = h('div#celebrate');
    this.el.receipt = h('div#receipt');
    r.append(this.el.info, this.el.toasts, this.el.modal, this.el.celebrate, this.el.receipt);
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
      dock.style.display = this.el.abToggle.style.display = g.build.active || !g.staff.length ? 'none' : '';
    }
    let ready = false;
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
      if (a.kitReady()) ready = true;
    }
    this.el.abToggle.classList.toggle('ready', ready);
  }

  toggleSkills(open = !this.abOpen) {
    this.abOpen = open;
    this.el.abilities.classList.toggle('open', open);
    this.el.abToggle.classList.toggle('open', open);
    this.el.abToggle.setAttribute('aria-expanded', String(open));
    try { localStorage.setItem('refillit.skillsOpen', open ? '1' : '0'); } catch { /* private mode: just this session */ }
    this.game.sfx('click');
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
    if (on) { this.closePanel(); this.game.selected = null; this.buildCat = this.buildCat || 'dining'; this.buildOpen = false; }
    this.game.sfx(on ? 'open' : 'close');
    this.renderBuild();
    this.renderGhostCtl();
  }
  renderBuild() {
    if (!this.el || !this.el.buildbar) return;
    buildTray(this, this.el.buildbar);
  }

  // ---------------- floating build controls ----------------
  /** Buttons in a ring around the pinned ghost (rotate · place · cancel) or the selected item (rotate · move · sell · done). */
  renderGhostCtl() {
    const b = this.game.build, el = this.el.ghostctl;
    const gh = b.ghost, sel = b.selected;
    const done = (clear) => h('button.gc-btn.ok', { onclick: () => { clear(); this.renderBuild(); this.renderGhostCtl(); }, title: t('Done') }, glyph('check', 26));
    let label = null, btns = null;
    if (b.active && b.wallMode() && b.locked && gh && gh.kind === 'wall') {
      label = h('div.gc-label' + (gh.valid ? '' : '.bad'), gh.valid ? wallDecorById[gh.id].name : gh.reason);
      btns = [
        h('button.gc-btn.ok' + (gh.valid ? '' : '.off'), { onclick: () => b.confirm(), title: b.movingWall ? t('Drop here') : t('Place here') }, glyph('check', 26)),
        h('button.gc-btn', { onclick: () => b.cancelPlacing(), title: t('Cancel (Esc)') }, glyph('close', 20))];
    } else if (b.active && b.selectedWall && !b.placing()) {
      const w = wallDecorById[b.selectedWall];
      label = h('div.gc-label', w.name);
      btns = [
        h('button.gc-btn', { onclick: () => b.startMoveWall(), title: t('Move') }, glyph('move', 22)),
        done(() => { b.selectedWall = null; }),
        confirmBtn('button.gc-btn.sell', t('Sell +{n}', { n: Math.floor(w.price * 0.5) }), t('Sell?'), () => b.sellSelectedWall())];
    } else if (b.active && b.placing() && b.locked && gh && gh.type) {
      label = h('div.gc-label' + (gh.valid ? '' : '.bad'), gh.valid ? furnitureById[gh.type].name : gh.reason);
      btns = [
        h('button.gc-btn', { onclick: () => b.rotate(), title: t('Rotate (R)') }, glyph('rotate_r', 22)),
        h('button.gc-btn.ok' + (gh.valid ? '' : '.off'), { onclick: () => b.confirm(), title: b.moving ? t('Drop here') : t('Place here') }, glyph('check', 26)),
        h('button.gc-btn', { onclick: () => b.cancelPlacing(), title: t('Cancel (Esc)') }, glyph('close', 20))];
    } else if (b.active && sel && !b.moving) {
      const cat = furnitureById[sel.type];
      label = h('div.gc-label', cat.name + (sel.broken ? t(' (broken)') : ''));
      btns = [
        h('button.gc-btn', { onclick: () => b.rotateSelected(), title: t('Rotate') }, glyph('rotate_r', 22)),
        h('button.gc-btn', { onclick: () => b.startMove(), title: t('Move') }, glyph('move', 22)),
        confirmBtn('button.gc-btn.sell', t('Sell +{n}', { n: Math.floor(cat.price * SELL_RATE) }), t('Sell?'), () => b.sellSelected()),
        done(() => { b.selected = null; })];
    }
    // the buttons sit round a circle with the label above it, the ✓ always low down, near the thumb
    if (btns) btns.forEach((btn, i) => {
      const a = GC_ANGLES[btns.length][i] * Math.PI / 180;
      btn.style.left = Math.round(Math.cos(a) * GC_RING) + 'px';
      btn.style.top = Math.round(Math.sin(a) * GC_RING) + 'px';
      // the wide Sell pill grows outwards from its spot on the right, so it never covers the item
      btn.classList.toggle('out-r', btn.classList.contains('sell') && Math.cos(a) > 0.3);
    });
    el.replaceChildren(...(btns ? [label, ...btns] : []));
    el.classList.toggle('show', !!btns);
    this.placeGhostCtl();
  }
  /** Every frame: keep the ring centred on the item as the camera pans, zooms and turns. */
  placeGhostCtl() {
    const el = this.el.ghostctl;
    if (!el.classList.contains('show')) return;
    const b = this.game.build, R = this.game.renderer;
    if (!R) return;
    const pos = (q) => {
      // keep the whole ring (and the label over it) on screen, clear of the HUD and the folded tray
      const vw = window.innerWidth, vh = window.innerHeight, m = GC_RING + 40;
      const x = Math.max(m, Math.min(vw - m - 30, q.x));   // the right side holds the wider Sell pill
      const y = Math.max(GC_RING + 96, Math.min(vh - m - 90, q.y));
      el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    };
    // wall pieces: the ring sits on the piece, on the wall
    const wallSpot = b.wallMode() && b.ghost && b.ghost.kind === 'wall' ? b.ghost
      : b.selectedWall && !b.placing() ? wallLayout(this.game.world.size, DOOR_Y, this.game.state.wallDeco, this.game.state.wallPos)[b.selectedWall] : null;
    if (wallSpot) { const q = R.wallScreen(wallSpot.side, wallSpot.a, 1.6); if (q) pos(q); return; }
    const f = b.placing() ? b.ghost : b.selected;
    if (!f) return;
    let cx = f.x + 0.5, cy = f.y + 0.5;
    if (f.fp) { cx = f.x + f.fp[0] / 2; cy = f.y + f.fp[1] / 2; }
    else if (f.tiles && f.tiles.length) { cx = f.tiles.reduce((a, q) => a + q.x, 0) / f.tiles.length + 0.5; cy = f.tiles.reduce((a, q) => a + q.y, 0) / f.tiles.length + 0.5; }
    const q = R.project(cx, cy, 0.6);
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
    const key = a.kind === 'staff' ? a.role + a.skillLv() + a.look.model + a.kitUnlocked() + JSON.stringify(a.clubs) : '';
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
        // the job's ability shows its charge; the character's own skills show how they fire
        const on = a.abilityUnlocked();
        body.push(h('div.sklist', { style: { marginTop: '8px' } },
          h('div.sk.auto', { style: { '--c': on ? ab.color : '#a1a1a6' }, title: ab.desc }, h('span.sk-ico', glyph(on ? ab.glyph : 'lock', 16)),
            h('div.sk-name', h('b', ab.name), on ? h('div.pbar', { style: { flex: 1, minWidth: '40px' } }, this.infoCharge) : h('span.sk-tag', t('Unlocks at {title}', { title: SKILL.titles[ABILITY_UNLOCK_LV - 1] })))),
          ...kitLines(a.look.model, a.kitUnlocked()), ...clubLines(a)));
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
    this.el.lvlBar.style.strokeDashoffset = String(100 - lp.frac * 100);
    this.el.brandName.parentNode.title = `${s.name} · ${this.el.lvlNum.textContent} · ${t('Café level & points')} ${this.el.lvlTxt.textContent}`;
    for (let i = 0; i < 5; i++) {
      const f = clamp(s.rating - i, 0, 1);
      this.starEls[i].style.clipPath = `inset(0 ${100 - f * 100}% 0 0)`;
    }
    this.el.ratingNum.textContent = s.rating.toFixed(1);
    // which of today's rounds this is (they start on the even hours of the player's own clock): in the clock's tooltip
    const nth = roundOfDay(s.round), from = nth * 2;
    this.el.day.textContent = t('Round {n} of {m} today ({a}:00–{b}:00). A round lasts 2 hours and opens on the even hours.', { n: nth + 1, m: ROUNDS_PER_DAY, a: String(from).padStart(2, '0'), b: String((from + 2) % 24).padStart(2, '0') });
    this.el.time.textContent = fmtTime(g.day.hour % 24, getLang() !== 'en');
    this.el.phase.textContent = g.paused ? t('Closed') : g.build.active ? t('Building') : g.day.isNight ? (s.stats && s.stats.closed ? t('Night') : t('Last guests…')) : g.day.hour >= DAY.lastCallHour ? t('Last call') : g.day.phase.name;
    this.el.time.parentNode.title = `${this.el.phase.textContent} · ${this.el.day.textContent}`;
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
    this.renderAlerts();
    const badge = (id, n) => {
      const b = this.toolBtns[id];
      let el = b.querySelector('.badge');
      if (n > 0) { if (!el) b.appendChild((el = h('span.badge'))); el.textContent = n; } else if (el) el.remove();
    };
    badge('staff', g.staff.filter((a) => a.napping).length);
    // trouble that can happen now, with nobody trained to handle it
    badge('train', Object.values(CLUBS).filter((c) => s.level >= TROUBLE[c.trouble].level && g.staff.length && !g.staff.some((a) => a.clubLv(c.id) > 0)).length);
    // the daily gift lives in the Market only: nothing on the main screen points at it
    badge('friends', this.friends && this.friends.data ? this.friends.data.incoming.length : 0);
  }

  /** The red alerts for troublemakers in the café right now: who is dealing with it (trained staff go by
   *  themselves), or, with nobody trained, a tap through to the Training tab. */
  renderAlerts() {
    const g = this.game, list = g.build.active ? [] : g.troubles.active;
    const trained = (club) => g.staff.some((a) => a.clubLv(club.id) > 0);
    const key = list.map((c) => c.id + ':' + c.trouble.kind + ':' + (c.trouble.by ? c.trouble.by.id : '')).join(',') + '|' + Object.values(CLUBS).map(trained).join();
    if (key === this.alertKey) return;
    this.alertKey = key;
    this.el.alerts.replaceChildren(...list.map((c) => {
      const tr = c.trouble, club = CLUBS[tr.kind === 'rude' ? 'baseball' : 'track'], can = trained(club);
      const what = tr.kind === 'rude' ? t('Rude guest!') : t('{name} is running off without paying!', { name: c.name });
      const sub = tr.by ? t('{name} is on it!', { name: tr.by.name }) : can ? t('Sending help…') : t('Nobody can stop them: tap to train someone at the {club}', { club: club.name });
      return h('button.alert' + (tr.by ? '.sent' : ''), { style: { '--c': club.color }, onclick: () => { if (!can) this.openPanel('train'); } },
        h('span.al-ico', glyph(tr.by ? club.glyph : 'angry', 18)),
        h('span.al-text', h('b', what), h('small', sub)));
    }));
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
    // one shared grid, so every bar starts and every percentage ends at the same x
    const rows = Object.keys(RATING_WEIGHTS).flatMap((k) => [h('span', t(names[k])), h('div.pbar.gold', h('i', { style: { width: p[k] * 100 + '%' } })), h('span.rpct', Math.round(p[k] * 100) + '%')]);
    this.el.ratingTip.replaceChildren(h('b', t('Rating {a} → {b}', { a: this.game.state.rating.toFixed(2), b: this.game.rating.target.toFixed(2) })), h('div.rgrid', ...rows), h('div.muted', t('More stars bring more customers. Tap to close.')));
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

  /** The round's receipt at closing time: a card that stays out of the way (the café rolls on into the night). */
  receipt(sm) {
    const dr = sm.ratingEnd - sm.ratingStart;
    const hide = () => this.el.receipt.classList.remove('show');
    const stat = (icon, label, v) => h('div.stat', assets.iconEl(icon, 26), h('b', v), h('span.muted', label));
    const costs = (sm.wages || 0) + (sm.rent || 0), stock = sm.restocked || 0, profit = sm.coins - costs - stock;
    const note = sm.owed ? t('The till ran short, so some wages went unpaid — the team will start tired.')
      : sm.soldOut ? t('{n} guest(s) left because a drink was sold out — keep the pantry stocked!', { n: sm.soldOut })
        : sm.dashed ? t('{n} guest(s) ran off without paying — someone from the Track Club could have caught them.', { n: sm.dashed })
        : sm.noSeat ? t('{n} guest(s) left because every seat was taken — more tables would help!', { n: sm.noSeat })
          : dr >= 0 ? t('Word is spreading about your cozy little place.') : t('Keep things clean and fast to win back the stars.');
    this.el.receipt.replaceChildren(h('div.card',
      h('div.big-title', t('Closing time')),
      h('div.muted', t('The chairs are up and the lights are low. Here’s how the round went:')),
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
      h('div.muted', { style: { marginBottom: '10px' } }, note, ' ', t('The next round opens at the next even hour.')),
      h('button.btn.primary', { onclick: hide }, t('Good night'))));
    this.el.receipt.classList.add('show');
    clearTimeout(this.receiptTimer);
    this.receiptTimer = setTimeout(hide, 30000);
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
    if (r.ranOut.length && r.restockOff) notes.push(warn(t('Auto-restock is off, so nothing was bought while you were away — turn it on in the Market to keep the café going.')));
    if (r.broke.length) notes.push(warn(t('Out of order:'), ' ' + [...new Set(r.broke)].map((x) => furnitureById[x].name).join(', ') + '. ' + t('A Cleaner can fix it.')));
    if (r.unpaid) notes.push(warn(t('The till ran short, so some wages went unpaid — the team is tired.')));
    if (r.levelTo > r.levelFrom) {
      const ups = []; for (let lv = r.levelFrom + 1; lv <= r.levelTo; lv++) ups.push(...unlocksFor(lv));
      if (ups.length) notes.push(h('div.away-note', h('b', t('New things unlocked:')), ' ' + ups.join(' · ')));
    }
    if (r.snacksUsed) notes.push(h('div.away-note', t('The team shared {n} snack(s) from the pantry to keep going.', { n: r.snacksUsed })));
    if (r.capped) notes.push(h('div.away-note.muted', t('Trading is counted for up to {n} hours while you are away.', { n: OFFLINE.capHours })));
    const card = h('div.card.away',
      h('div.hero-ico', assets.iconEl('icon_gift', 56)),
      h('div.big-title', t('Welcome back!')),
      h('div.muted', ...keepTogether(t('{name} kept serving while you were away ({time}).', { name: g.state.name, time: KEEP }), dur)),
      h('div.stat-grid',
        stat('emote_heart', t('Guests served'), r.served),
        stat('icon_coin', t('Coins earned'), sign(r.net)),
        stat('icon_points', t('Café points'), '+' + fmt(r.points)),
        stat('icon_star', t('Rating'), `${r.ratingFrom.toFixed(1)} → ${r.ratingTo.toFixed(1)}`),
        stat('icon_level', t('Level'), r.levelTo > r.levelFrom ? `${r.levelFrom} → ${r.levelTo}` : r.levelTo),
        stat('emote_angry', t('Guests lost'), String(r.lost))),
      h('div.muted', { style: { marginBottom: '6px' } }, ...opSegs(t('Sales {s} + tips {p} + nooks {f} − wages & rent {w} − ingredients {i}', { s: fmt(r.sales), p: fmt(r.tips), f: fmt(r.fees), w: fmt(r.wages + r.rent), i: fmt(r.restock) }))),
      top.length ? h('div', h('div.muted', t('Best sellers')), h('div.ings', { style: { justifyContent: 'center', margin: '4px 0 8px' } }, top.map(([id, n]) => h('span.ing', assets.iconEl(dishById[id].asset, 24), '×' + n)))) : null,
      ...notes,
      h('button.btn.primary', { onclick: () => this.closeModal() }, t('Back to the café')));
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
