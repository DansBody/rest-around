// The street round the café, in the UI (style in street.css): a Refillit OS window with the map of the ring (each
// block's state and shop; tap one to fly there, the café in the middle flies back), opened from the left column, and
// the "recovering <shop>.dat … RESTORED ✦" dialog while a lot comes back (street.js plays it; RESTORED is an event,
// so coral). The map turns with the camera, so a block sits where it is on screen.
import { h, bus } from '../util.js';
import { t } from '../i18n.js';
import { pixIcon } from './os.js';
import { wipeIn, wipeOut, bump } from './transition.js';
import { LOTS, SHOPS } from '../street.js';

// where each lot sits on the 3 × 3 map: [row (north to south), column (west to east)]
const CELL = { nw: [1, 1], n: [1, 2], ne: [1, 3], w: [2, 1], e: [2, 3], sw: [3, 1], s: [3, 2], se: [3, 3] };
const BLOCKS = 16;   // the dialog's progress bar

export class StreetUI {
  constructor(ui) {
    this.ui = ui;
    this.game = ui.game;
    this.open = false;
    this.yaw = null;
    bus.on('streetRecover', (e) => this.recover(e));
    bus.on('changed', (what) => { if (what === 'street' && this.open) this.render(); });
  }

  /** Build the button, the map window and the dialog into the UI layer (again after a language switch). */
  mount(root) {
    this.btn = h('button.chip#streetbtn', { title: t('Street'), 'aria-label': t('Street'), 'aria-expanded': String(this.open), onclick: () => this.toggle() }, pixIcon('map'));
    this.grid = h('div.sm-grid');
    this.count = h('span.sm-count');
    this.win = h('div.oswin#streetmap' + (this.open ? '.open' : ''), { role: 'dialog', 'aria-label': t('Street') },
      h('div.sm-head', h('button.sm-x', { onclick: () => this.toggle(false), title: t('Close'), 'aria-label': t('Close') }), h('b', t('Street'))),
      h('div.sm-map', this.grid),
      h('div.sm-foot', this.count, h('button.btn.small', { onclick: () => this.home() }, t('Back to café'))));
    this.bar = h('div.rc-bar', Array.from({ length: BLOCKS }, () => h('i')));
    this.msg = h('div.rc-msg');
    this.pct = h('span.rc-pct', '0%');
    this.dlg = h('div.oswin#recover', { role: 'status', 'aria-live': 'polite' },
      h('div.rc-head', h('span', 'Refillit OS'), h('b.rc-flag', t('RESTORED ✦'))),
      this.msg, h('div.rc-row', this.bar, this.pct));
    root.append(this.btn, this.win, this.dlg);
    this.yaw = null;
    if (this.open) this.render();
  }

  toggle(open = !this.open) {
    if (open === this.open) return;
    this.open = open;
    this.game.sfx(open ? 'open' : 'close');
    this.btn.classList.toggle('active', open);
    this.btn.setAttribute('aria-expanded', String(open));
    if (open) {
      bump(this.btn);
      this.render();
      this.win.classList.add('open');
      wipeIn(this.win, this.grid, 'paper');
    } else {
      wipeOut(this.win);
      this.win.classList.remove('open');
    }
  }

  render() {
    const st = this.game.street;
    const tiles = LOTS.map((l) => {
      const look = SHOPS[l.shop], s = st.lotState(l.id), k = s >= 1.999 ? 2 : s >= 0.5 ? 1 : 0;
      const [r, c] = CELL[l.id];
      return h('button.sm-lot.s' + k, { style: { gridRow: r, gridColumn: c, '--c': look.body, '--t': look.trim }, onclick: () => this.fly(l.id), title: t(look.name) },
        h('span.sm-in', h('span.sm-name', t(look.name)), h('span.sm-st', k === 2 ? '✦' : k === 1 ? t('loading…') : '· · ·')));
    });
    const cafe = h('button.sm-lot.cafe', { style: { gridRow: 2, gridColumn: 2 }, onclick: () => this.home(), title: t('Back to café') },
      h('span.sm-in', h('span.sm-name', this.game.state.name), h('span.sm-st', '☕')));
    this.grid.replaceChildren(...tiles, cafe);
    this.count.textContent = t('{n}/{m} restored', { n: this.game.state.street.restored.length, m: LOTS.length });
    this.yaw = null;
  }

  fly(id) {
    this.game.sfx('click');
    this.game.selected = null;
    this.game.street.flyToLot(id);
  }
  home() {
    this.game.sfx('click');
    this.game.street.flyHome();
  }

  /** Every frame: the map turns with the camera (the block straight up the map is the one up the screen). */
  update() {
    if (!this.open) return;
    const yaw = this.game.camera.yaw;
    if (this.yaw !== null && Math.abs(yaw - this.yaw) < 0.005) return;
    this.yaw = yaw;
    this.grid.style.setProperty('--yaw', yaw.toFixed(3) + 'rad');
  }

  /** The recovery dialog, as street.js plays it. */
  recover(e) {
    const d = this.dlg;
    if (!d) return;
    if (e.phase === 'fly') return;
    if (e.phase === 'closed' || e.phase === 'end') {
      if (d.classList.contains('open')) { wipeOut(d); d.classList.remove('open', 'done'); }
      if (this.open) this.render();
      return;
    }
    if (!d.classList.contains('open')) {
      this.file = '';
      d.classList.add('open');
      wipeIn(d, d, 'paper');
    }
    const done = e.phase === 'done' || e.phase === 'back';
    if (done !== d.classList.contains('done') || this.file !== e.file) {
      this.file = e.file;
      d.classList.toggle('done', done);
      this.msg.textContent = done ? t('{file} — open for business', { file: e.file }) : t('recovering {file} …', { file: e.file });
      if (done && this.open) this.render();
    }
    const n = Math.round(e.p * BLOCKS);
    if (n !== this.n) { this.n = n; [...this.bar.children].forEach((b, i) => b.classList.toggle('on', i < n)); }
    this.pct.textContent = Math.round(e.p * 100) + '%';
  }
}
