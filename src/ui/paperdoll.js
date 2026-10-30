// The paper doll (design/prologue/OPENING_PLAN.md, 紙娃娃介面; concept design/paper_doll/ui/paper_doll_ui_A.png): dress a
// cast character, the player's own in the prologue's puddle and every member of staff after. Only the outer layer
// changes, the species stays one of the cast (UNIQUE_MODELS).
//   top half  the character as a paper doll: the real 3D model standing on a blue halftone with orbit lines and a
//             soft shadow, turned by dragging; clothes and accessories float beside it as cut-outs with white
//             fold-over tabs, and dragging one onto the doll (or tapping it) puts it on. Each change gets a quiet
//             reaction (a glance, a little turn, a glint), never a jump, so changing ten things in a row stays calm.
//   bottom    four icon-only tabs (drop = colour, dots = pattern, tee = clothes, star = accessories) over a sticker
//             sheet (dashed cut lines, white edges, a thick denim ring on what is on), then the name and Save.
//   colour       the three regions (fur, belly, clothes), the palette's wells (the centre one, then the eight the
//                street fills as its lots are restored, palette.js) and the dyes found;
//   pattern      PATTERNS on the fur (outfit.js) and the colour they are drawn in;
//   clothes      TOPS over the clothes region (outfit.js), each in the clothes colour or its own;
//   accessories  the wardrobe's (WEAR): those bought in the Market with a copy no teammate is wearing. Tapping one that
//                is on opens the old wardrobe's fine-tuning (ui/wardrobe.js): up/down/left/right, toward the face or
//                the back, tilt, lean and size, stored the same way in look.wear[slot] ({ id, p, r, s }).
// openPaperDoll resolves with the new look and name; nothing is changed until the caller applies it (dressStaff does
// that for someone on the team).
import { h } from '../util.js';
import { t } from '../i18n.js';
import { THREE, models } from '../models.js';
import { CharacterView } from '../charview.js';
import { PPU, pixelLook, toonize, bakeLights, InkPass } from '../pixelview.js';
import { thumb } from '../portrait.js';
import { staffLook, withDress } from '../looks.js';
import { PATTERNS, TOPS, topById, patPx } from '../outfit.js';
import { WEAR, WEAR_SLOTS, WEAR_LIMITS, wearById, PALETTE_CENTRE, PALETTE_WELLS, UNIQUE_MODELS } from '../data.js';
import { wellOpen, ownedDyes } from '../palette.js';
import { LOTS, SHOPS } from '../street.js';
import { defaultName, cleanNick, NICK_MAX } from '../staff.js';
import { glyph } from './icons.js';
import { holdBtn, nudgeWear, SLOT_NAME } from './wardrobe.js';

const INK = '#1f2a4a';
const FRONT_YAW = 0.35;   // the doll's resting angle: a little to the side, so depth reads
const quiet = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const hexOf = (rgb) => '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('');
const svg = (body, vb = '0 0 24 24') => `<svg viewBox="${vb}" aria-hidden="true">${body}</svg>`;
const ICON = {
  color: svg('<path d="M12 2.5c3.2 4.6 6.4 7.9 6.4 11.6a6.4 6.4 0 0 1-12.8 0c0-3.7 3.2-7 6.4-11.6z"/>'),
  pattern: svg('<circle cx="12" cy="12" r="9.5"/><g class="pd-hole"><circle cx="8.5" cy="9" r="1.7"/><circle cx="15" cy="8.2" r="1.5"/><circle cx="12.2" cy="13.4" r="1.7"/><circle cx="8" cy="15.6" r="1.3"/><circle cx="16" cy="15.4" r="1.5"/></g>'),
  clothes: svg('<path d="M8.6 3.5 3 6.6l2.3 4.6 2.3-1V20.5h8.8V10.2l2.3 1 2.3-4.6-5.6-3.1c-.5 1.6-1.9 2.6-3.4 2.6S9.1 5.1 8.6 3.5z"/>'),
  acc: svg('<path d="m12 2.6 2.8 6 6.5.7-4.9 4.4 1.4 6.4L12 16.8l-5.8 3.3 1.4-6.4-4.9-4.4 6.5-.7z"/>'),
  pencil: svg('<path d="m4 16.5 10.6-10.6 3.5 3.5L7.5 20H4z"/><path d="m16 4.5 1.7-1.7 3.5 3.5-1.7 1.7z"/>'),
  doc: svg('<path d="M6 2.5h8.5l4 4v15H6z" fill="#fff"/><path d="M14.5 2.5v4h4M8.5 10.5h7M8.5 13.5h7M8.5 16.5h5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M6 2.5h8.5l4 4v15H6z" fill="none" stroke="currentColor" stroke-width="1.8"/>'),
};
const TABS = [['color', 'Colour'], ['pattern', 'Pattern'], ['clothes', 'Clothes'], ['acc', 'Accessories']];
const REGION_NAME = { fur: 'Fur', light: 'Belly', shirt: 'Clothes' };

// ------------------------------------------------------------------ the stage
/**
 * The doll: the character on a transparent canvas (the page draws the halftone and the shadow under it). With the
 * pixel look on (pixelview.js) it is drawn as the café draws its characters: in the bake's toon light, at the sprites'
 * PPU pixels per unit, outlined in ink and blown up with nearest sampling; off, the smooth model.
 */
class DollStage {
  constructor(canvas) {
    this.canvas = canvas;
    this.pixel = pixelLook.on;
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: !this.pixel, alpha: true });
    this.gl.setClearColor(0x000000, 0);
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.setPixelRatio(this.pixel ? 1 : Math.min(2, window.devicePixelRatio || 1));
    this.scene = new THREE.Scene();
    if (this.pixel) {
      this.gl.toneMapping = THREE.NeutralToneMapping;   // as the bake: the colours the sprites' palettes were picked from
      bakeLights(this.scene);
      this.ink = new InkPass(this.gl);
      canvas.classList.add('pixel');
    } else {
      this.scene.add(new THREE.HemisphereLight(0xfff6e8, 0xb9c6e4, 1.7));
      const sun = new THREE.DirectionalLight(0xfff1dc, 2.0);
      sun.position.set(-4, 8, 9);
      this.scene.add(sun);
    }
    this.cam = new THREE.PerspectiveCamera(28, 1, 0.1, 60);
    this.yaw = this.goal = FRONT_YAW;
    this.react = null;               // { kind, t }: the quiet reaction to the last change
    this.side = 1;
  }
  setLook(look) {
    if (this.cv) this.cv.dispose(this.scene);
    this.cv = new CharacterView(this.scene, { look, x: 0, y: 0, dir: 1, pose: {} }, { shadow: false });
    if (this.pixel) toonize(this.cv.root);
    this.cv.play('idle', 0);
    if (this.cv.inst.mixer) this.cv.inst.mixer.update(0);
    if (!this.H) { this.cv.root.updateMatrixWorld(true); this.H = Math.max(1, new THREE.Box3().setFromObject(this.cv.inst.root).max.y); }
  }
  /**
   * A quiet reaction to a change, short and small so a run of changes never nags: something put on gets a glance
   * down at it (a little nod), a colour or pattern a small turn to show it off, the side swapping each time.
   */
  cheer(kind = 'look') {
    if (quiet()) return;
    this.side = -this.side;
    this.react = { kind, t: 0 };
  }
  /** Put the accessories on again (fine-tuning moves one), without rebuilding the doll. */
  setWear(wear) {
    this.cv.setWear(wear);
    if (this.pixel) toonize(this.cv.root);
  }
  /** Turn to the slot being fine-tuned: the back for a backpack, the front for the rest. */
  focus(slot) {
    if (slot === 'back') this.goal = Math.PI + FRONT_YAW;
    else if (slot && Math.cos(this.goal) < 0) this.goal = FRONT_YAW;
  }
  update(dt) {
    const k = 1 - Math.exp(-dt * 9);
    this.yaw += (this.goal - this.yaw) * k;
    const r = this.cv.root;
    let nod = 0, turn = 0;
    if (this.react) {
      const a = this.react, p = Math.min(1, (a.t += dt) / (a.kind === 'wear' ? 0.5 : 0.42));
      if (a.kind === 'wear') nod = 0.075 * Math.sin(p * Math.PI);
      else turn = this.side * 0.24 * Math.sin(p * Math.PI * 2) * (1 - p);
      if (p >= 1) this.react = null;
    }
    r.rotation.set(nod, this.yaw + turn, 0);
    if (this.cv.inst.mixer) this.cv.inst.mixer.update(dt);
    const w = this.canvas.clientWidth, hh = this.canvas.clientHeight;
    if (w && hh && (w !== this.w || hh !== this.hh)) {
      this.w = w; this.hh = hh;
      if (this.pixel) {
        // PPU pixels to a unit, each a whole number of screen pixels where that shrinks the doll by little (a phone's
        // 3 screen pixels to a CSS one), else a fraction of one; the doll in frame with room to spare
        const dpr = window.devicePixelRatio || 1, need = Math.max(this.H * 1.3, (this.H * 1.05 * hh) / w);
        const fit = (hh * dpr) / (need * PPU), whole = Math.floor(fit);
        const k = Math.max(1, whole && fit / whole < 1.15 ? whole : fit);
        this.px = [Math.floor((w * dpr) / k), Math.floor((hh * dpr) / k)];
        this.gl.setSize(this.px[0], this.px[1], false);
        this.cam.aspect = this.px[0] / this.px[1];
      } else { this.gl.setSize(w, hh, false); this.cam.aspect = w / hh; }
    }
    // the whole doll in frame (room above for a hat, and for its width on a narrow stage), feet on its shadow at the bottom
    const view = this.pixel && this.px ? this.px[1] / PPU : Math.max(this.H * 1.3, this.H * 1.05 / this.cam.aspect), y = view / 2 - this.H * 0.04;
    const d = view / 2 / Math.tan((this.cam.fov * Math.PI) / 360);
    this.cam.position.set(0, y + this.H * 0.12, d);
    this.cam.lookAt(0, y, 0);
    this.cam.updateProjectionMatrix();
    if (this.pixel && this.px) this.ink.render(this.scene, this.cam, this.px[0], this.px[1]);
    else this.gl.render(this.scene, this.cam);
  }
  dispose() {
    if (this.cv) this.cv.dispose(this.scene);
    if (this.ink) this.ink.dispose();
    this.gl.dispose();
    this.gl.forceContextLoss();
  }
}

// ------------------------------------------------------------------ sticker pictures
/** A 24-px pixel picture, scaled up crisply: `fill(x, y)` gives a colour or null; edge pixels get the ink outline. */
function pixelPic(fill, size = 24, cls = 'pd-px') {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  c.className = cls;
  const g = c.getContext('2d'), grid = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) grid[y * size + x] = fill(x, y);
  const at = (x, y) => (x < 0 || y < 0 || x >= size || y >= size ? null : grid[y * size + x]);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const v = at(x, y);
    if (!v) continue;
    g.fillStyle = !at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1) ? INK : v;
    g.fillRect(x, y, 1, 1);
  }
  return c;
}
const shade = (hex, k) => { const v = parseInt(hex.slice(1), 16); return hexOf([v >> 16, (v >> 8) & 255, v & 255].map((c) => Math.max(0, Math.min(255, Math.round(c * k))))); };
const mixHex = (a, b, w) => { const p = parseInt(a.slice(1), 16), q = parseInt(b.slice(1), 16); return hexOf([16, 8, 0].map((s) => Math.round(((p >> s) & 255) * (1 - w) + ((q >> s) & 255) * w))); };
// garment outlines on the 24-px grid ('#' = cloth)
const SHAPES = {
  tee: ['......####....####......', '.....######..######.....', '...####################.', '..######################', '.#######################', '.#######################', '.######################.', '..###.############.###..'],
  bib: ['.......##......##.......', '.......##......##.......', '.......##......##.......', '.......############.....', '.......############.....', '.......############.....', '.......############.....', '.......############.....'],
  vest: ['.......###....###.......', '......####....####......', '......#####..#####......', '......######.#####......', '......############......', '......############......', '......############......', '......############......'],
};
function garment(kind, x, y) {
  const top = SHAPES[kind], r = y - 3;
  if (r < 0) return false;
  if (r < top.length) return top[r][x] === '#';
  if (kind === 'bib') return r < 18 && x >= 5 && x <= 18 && !(r >= 14 && x >= 11 && x <= 12);
  return r < 17 && x >= 6 && x <= 17;
}
/** A top as a sticker: its shape, in its colour, with its pattern drawn the way the sprites draw it. */
function topPic(top, base) {
  const kind = top.id === 'overalls' ? 'bib' : top.id === 'vest' ? 'vest' : 'tee';
  const col = top.c || base;
  return pixelPic((x, y) => {
    if (!garment(kind, x, y)) return null;
    const s = patPx('top', top.k, x, y);
    return shade(mixHex(col, top.c2 || '#ffffff', s.w), s.mul * (x < 9 ? 1.04 : 0.97));
  });
}
/** A pattern as a sticker: a round patch of fur with the pattern on it. */
function patPic(p, fur, ink) {
  return pixelPic((x, y) => {
    const dx = x - 11.5, dy = y - 11.5;
    if (dx * dx + dy * dy > 10.5 * 10.5) return null;
    return p && patPx('pat', p.k, x, y, 22).w ? ink : shade(fur, dx + dy < -6 ? 1.06 : 1);
  });
}

// ------------------------------------------------------------------ the card
/**
 * Open the paper doll over the game. Nothing changes until the caller applies the result.
 * @param game
 * @param opts.model    which of the cast (UNIQUE_MODELS); may be left out when `look` names it
 * @param opts.look     the look to start from (default: the character's own, nothing on)
 * @param opts.name     the name given so far ('' leaves the character's default name as the placeholder)
 * @param opts.who      the staff member being dressed, if they are on the team (the accessories they wear stay theirs)
 * @param opts.title    the window's title (default 紙娃娃)
 * @param opts.closable false: no close box (a look has to be saved, e.g. the prologue's reflection)
 * @param opts.onSave   called with the result just before the promise resolves
 * @returns Promise of { model, look, name } (name: the cleaned nickname, '' for the default one), or null if closed
 */
export function openPaperDoll(game, opts = {}) {
  const model = (opts.look && opts.look.model) || opts.model;
  if (!UNIQUE_MODELS.includes(model)) return Promise.reject(new Error('openPaperDoll: not one of the cast: ' + model));
  return new Promise((resolve) => {
    let look = withDress({ ...staffLook(model), ...(opts.look || {}), model }, { wear: (opts.look && opts.look.wear) || {} });
    const ref = (models.def(model) || {}).recolor || {};
    const regions = ['fur', 'light', 'shirt'].filter((k) => ref[k]);
    const colourOf = (k) => look[k] || (ref[k] ? hexOf(ref[k]) : '#cccccc');
    const state = { tab: 'color', region: regions[0], well: PALETTE_CENTRE.id, hint: null, sel: null };   // sel: the slot being fine-tuned
    // accessories: bought ones with a copy free of the rest of the team (what `who` wears is theirs already)
    const s = game.state, others = (game.staff || []).filter((a) => a !== opts.who);
    const wornElsewhere = (id) => others.reduce((n, a) => n + Object.values(a.look.wear || {}).filter((w) => w.id === id).length, 0);
    const own = new Set(Object.values(look.wear || {}).map((w) => w.id));
    const accs = WEAR.filter((w) => own.has(w.id) || ((s.wardrobe || {})[w.id] || 0) - wornElsewhere(w.id) > 0);

    // ---- the window
    const canvas = h('canvas.pd-3d');
    const doll = h('div.pd-doll', h('i.pd-floor'), canvas);
    const cuts = h('div.pd-cuts');
    const orbit = h('div.pd-orbit', { html: svg('<ellipse cx="50" cy="52" rx="46" ry="17" transform="rotate(-8 50 52)"/><ellipse cx="50" cy="48" rx="40" ry="26" transform="rotate(12 50 48)"/>'
      + '<g class="pd-spark"><path d="M14 18l1.2 3 3 1.2-3 1.2-1.2 3-1.2-3-3-1.2 3-1.2z"/><path d="M86 70l1 2.4 2.4 1-2.4 1-1 2.4-1-2.4-2.4-1 2.4-1z"/><path d="M60 10l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/><path d="M8 66l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z"/></g>', '0 0 100 100') });
    const glints = h('div.pd-glints');
    const stage = h('div.pd-stage', orbit, doll, glints, cuts, h('div.pd-hint', glyph('rotate', 13), t('Drag to turn')), h('i.pd-tape.a'), h('i.pd-tape.b'));
    const tabs = h('div.pd-tabs', { role: 'tablist' });
    const sub = h('div.pd-sub');
    const grid = h('div.pd-grid');
    const note = h('div.pd-note');
    const nameIn = h('input.pd-name-in', { type: 'text', maxlength: NICK_MAX, autocomplete: 'off', placeholder: defaultName(model), value: opts.name || '', 'aria-label': t('Name') });
    const save = h('button.pd-save', { type: 'button', onclick: () => finish(true) }, t('Save look'));
    const sheet = h('div.pd-sheet', sub, note, grid,
      h('div.pd-foot', h('label.pd-name', h('span.pd-pencil', { html: ICON.pencil }), nameIn), save));
    const win = h('div.pd-win', { role: 'dialog', 'aria-label': opts.title || t('Paper Doll') },
      h('div.pd-bar', h('span.pd-doc', { html: ICON.doc }), h('b.pd-title', opts.title || t('Paper Doll')),
        opts.closable === false ? null : h('button.pd-x', { type: 'button', title: t('Close'), 'aria-label': t('Close'), onclick: () => finish(false) }, glyph('close', 14))),
      stage, tabs, sheet);
    const root = h('div#paperdoll', win);
    document.body.appendChild(root);
    tornEdge(sheet);
    const held = game.hold;
    game.hold = true;
    if (!quiet()) win.animate([{ transform: 'translateY(-26px) rotate(-2deg)', opacity: 0 }, { transform: 'translateY(4px) rotate(.4deg)', opacity: 1, offset: 0.7 }, { transform: 'none', opacity: 1 }], { duration: 380, easing: 'cubic-bezier(.2,.8,.3,1.2)' });

    const dollStage = new DollStage(canvas);
    dollStage.setLook(look);
    let alive = true, last = performance.now();
    const frame = (now) => {
      if (!alive) return;
      dollStage.update(Math.min(0.05, Math.max(0, (now - last) / 1000)));
      last = now;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    /** Draw a frame now (rAF is held back while the page is hidden; tests call this through root.probe). */
    root.probe = () => { dollStage.update(0.05); return { look: JSON.parse(JSON.stringify(look)), name: nameIn.value, tab: state.tab }; };

    // drag the stage to turn the doll
    let turn = null;
    stage.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.pd-cut')) return;
      turn = { x: e.clientX, yaw: dollStage.goal };
      stage.setPointerCapture(e.pointerId);
    });
    stage.addEventListener('pointermove', (e) => { if (turn) dollStage.goal = turn.yaw + (e.clientX - turn.x) * 0.012; });
    for (const ev of ['pointerup', 'pointercancel']) stage.addEventListener(ev, () => { turn = null; });

    const onKey = (e) => {
      if (e.key === 'Escape' && opts.closable !== false) finish(false);
      else if (e.key === 'Enter' && e.target === nameIn) finish(true);
      else if (state.sel && e.target.tagName !== 'INPUT') {   // the old wardrobe's keys: arrows, and [ ] toward the back / the face
        const k = { ArrowUp: [0, 1, 0], ArrowDown: [0, -1, 0], ArrowLeft: [-1, 0, 0], ArrowRight: [1, 0, 0], ']': [0, 0, 1], '[': [0, 0, -1] }[e.key];
        if (k) { e.preventDefault(); nudgeWear(look.wear[state.sel], dollStage.goal, ...k); tune(); }
      }
    };
    window.addEventListener('keydown', onKey);

    function finish(ok) {
      if (!alive) return;
      alive = false;
      window.removeEventListener('keydown', onKey);
      const res = ok ? { model, look: withDress(look, {}), name: cleanNick(nameIn.value) } : null;
      const end = () => { dollStage.dispose(); root.remove(); game.hold = held; if (res && opts.onSave) opts.onSave(res); resolve(res); };
      if (quiet()) return end();
      win.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateY(30px) rotate(2deg)', opacity: 0 }], { duration: 220, easing: 'ease-in' }).onfinish = end;
    }

    // ---- changing the look
    const dress = (d, kind = 'look') => {
      look = withDress(look, d);
      dollStage.setLook(look);
      dollStage.cheer(kind);
      glint();
      render();
    };
    /** Two or three small sparkles round the doll that fade out (a fresh set each change, never piling up). */
    function glint() {
      if (quiet()) return;
      const b = doll.getBoundingClientRect(), sb = stage.getBoundingClientRect();
      glints.replaceChildren(...[0, 1, 2].map((i) => {
        const x = b.left - sb.left + b.width * (0.28 + Math.random() * 0.44);
        const y = b.top - sb.top + b.height * (0.15 + Math.random() * 0.6);
        return h('i.pd-glint', { style: { left: x.toFixed(0) + 'px', top: y.toFixed(0) + 'px', animationDelay: i * 90 + 'ms', scale: (0.7 + Math.random() * 0.5).toFixed(2) } });
      }));
    }
    /** Show a fine-tuned accessory where it now sits, without rebuilding the doll. */
    const tune = () => dollStage.setWear(look.wear);
    const select = (slot) => {
      state.sel = slot && look.wear && look.wear[slot] ? slot : null;
      dollStage.focus(state.sel);
    };
    const wearing = (id) => Object.values(look.wear || {}).some((w) => w.id === id);
    const topOn = () => (look.top && topById(look.top.id)) || TOPS[0];
    /** Put on (or, if it's on, take off) one clothes or accessory item. */
    const toggle = (kind, id) => {
      if (kind === 'top') {
        const tp = topById(id);
        if (tp.k === 0 || (look.top && look.top.id === id)) return dress({ top: null });
        return dress({ top: { id }, ...(tp.c && regions.includes('shirt') ? { shirt: tp.c } : {}) }, 'wear');
      }
      const item = wearById(id), wear = { ...(look.wear || {}) }, off = wearing(id);
      if (off) delete wear[item.slot]; else wear[item.slot] = { id };
      look = withDress(look, { wear });
      select(off || state.tab !== 'acc' ? null : item.slot);
      dress({}, off ? 'look' : 'wear');
    };

    // ---- the cut-outs floating by the doll
    function renderCuts() {
      const tops = regions.includes('shirt') ? TOPS.filter((tp) => tp.k && !(look.top && look.top.id === tp.id)) : [];
      const free = accs.filter((w) => !wearing(w.id));
      const pool = state.tab === 'acc' ? [...free.map((w) => ['acc', w]), ...tops.map((tp) => ['top', tp])] : [...tops.map((tp) => ['top', tp]), ...free.map((w) => ['acc', w])];
      // two clothes and an accessory when there is one, so both kinds are always to hand
      const pick = state.tab === 'acc' ? pool.slice(0, 3) : [...pool.filter((p) => p[0] === 'top').slice(0, free.length ? 2 : 3), ...pool.filter((p) => p[0] === 'acc').slice(0, 1)];
      cuts.replaceChildren(...pick.slice(0, 3).map(([kind, it], i) => cutout(kind, it, i)));
    }
    function cutout(kind, it, i) {
      const pic = kind === 'top' ? topPic(it, colourOf('shirt')) : thumb(it.model, null, 76, 66);
      const el = h('button.pd-cut.n' + i, { type: 'button', title: t(it.name), 'aria-label': t(it.name) }, h('i.pd-tab.a'), h('i.pd-tab.b'), pic);
      let drag = null;
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        el.setPointerCapture(e.pointerId);
        drag = { x: e.clientX, y: e.clientY, moved: false };
        el.classList.add('held');
      });
      el.addEventListener('pointermove', (e) => {
        if (!drag) return;
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 6) drag.moved = true;
        el.style.translate = `${dx}px ${dy}px`;
        doll.classList.toggle('drop', overDoll(e));
      });
      const up = (e) => {
        if (!drag) return;
        const moved = drag.moved, hit = e.type === 'pointerup' && (!moved || overDoll(e));
        drag = null;
        el.classList.remove('held');
        doll.classList.remove('drop');
        if (hit) {
          el.classList.add('worn');
          const go = () => toggle(kind === 'top' ? 'top' : 'acc', it.id);
          if (quiet() || !moved) return go();
          el.animate([{ scale: 1, opacity: 1 }, { scale: 0.3, opacity: 0 }], { duration: 160, easing: 'ease-in' }).onfinish = go;
        } else {
          if (!quiet()) el.animate([{ translate: el.style.translate }, { translate: '0 0' }], { duration: 260, easing: 'cubic-bezier(.3,1.5,.5,1)' });
          el.style.translate = '';
        }
      };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      return el;
    }
    function overDoll(e) {
      const b = canvas.getBoundingClientRect();
      return e.clientX > b.left + b.width * 0.12 && e.clientX < b.right - b.width * 0.12 && e.clientY > b.top && e.clientY < b.bottom;
    }

    // ---- the sheet
    const tile = (on, title, pic, onclick, extra = '') => h('button.pd-tile' + (on ? '.on' : '') + extra, { type: 'button', title, 'aria-label': title, 'aria-pressed': on ? 'true' : 'false', onclick }, h('span.pd-stk', pic));
    const blob = (c) => h('i.pd-blob', { style: { background: c } });
    function render() {
      tabs.replaceChildren(...TABS.map(([id, name]) => h('button.pd-tabbtn' + (state.tab === id ? '.on' : ''), {
        type: 'button', role: 'tab', 'aria-selected': state.tab === id ? 'true' : 'false', title: t(name), 'aria-label': t(name), html: ICON[id],
        onclick: () => { state.tab = id; state.hint = null; if (id !== 'acc') select(null); render(); grid.scrollTop = 0; },
      })));
      sub.replaceChildren();
      grid.replaceChildren();
      note.textContent = '';
      if (state.tab === 'color') renderColour();
      else if (state.tab === 'pattern') renderPattern();
      else if (state.tab === 'clothes') renderClothes();
      else renderAcc();
      renderCuts();
    }
    function renderColour() {
      const k = state.region, cur = look[k] || null;
      const wells = [PALETTE_CENTRE, ...PALETTE_WELLS];
      const well = wells.find((w) => w.id === state.well && wellOpen(s, w)) || PALETTE_CENTRE;
      sub.append(h('div.pd-seg', regions.map((r) => h('button' + (r === k ? '.on' : ''), { type: 'button', onclick: () => { state.region = r; render(); } },
        h('i.pd-dot', { style: { background: colourOf(r) } }), t(REGION_NAME[r])))),
      h('div.pd-wells', wells.map((w) => {
        const open = w === PALETTE_CENTRE || wellOpen(s, w), lot = w.lot && LOTS.find((l) => l.id === w.lot);
        const title = open ? t(w.name) : t('Restore the {shop} to fill this well', { shop: t(SHOPS[lot.shop].name) });
        return h('button.pd-well' + (open ? '' : '.locked') + (well === w ? '.on' : ''), { type: 'button', title, 'aria-label': title,
          style: { background: open ? (w === PALETTE_CENTRE ? colourOf(k) : w.colors[3]) : '' },
          onclick: () => { if (open) { state.well = w.id; state.hint = null; } else state.hint = title; render(); } }, open ? null : glyph('lock', 12));
      })));
      if (well === PALETTE_CENTRE) grid.append(tile(!cur, t('Original'), h('span.pd-own', blob(hexOf(ref[k]))), () => dress({ [k]: null })));
      for (const c of well.colors) grid.append(tile(cur === c, c, blob(c), () => dress({ [k]: c })));
      for (const d of ownedDyes(s)) grid.append(tile(cur === d.color, t(d.name), blob(d.color), () => dress({ [k]: d.color }), '.dye'));
      note.textContent = state.hint || (ownedDyes(s).length ? '' : t('Dyes') + '：' + t('Found on commissions and outings'));
    }
    function renderPattern() {
      const fur = colourOf('fur'), ink = (look.pat && look.pat.c) || shade(fur, 0.62);
      const inks = [...new Set([shade(fur, 0.62), shade(fur, 1.25), ...PALETTE_CENTRE.colors])];
      if (!regions.includes('fur')) { note.textContent = t('No pattern'); return; }
      grid.append(tile(!look.pat, t('No pattern'), patPic(null, fur, ink), () => dress({ pat: null })));
      for (const p of PATTERNS) grid.append(tile(look.pat && look.pat.id === p.id, t(p.name), patPic(p, fur, ink), () => dress({ pat: { id: p.id, c: ink } })));
      sub.append(h('span.pd-sublabel', t('Pattern colour')), h('div.pd-inks', inks.map((c) => h('button.pd-ink' + (c === ink ? '.on' : ''), { type: 'button', title: c, 'aria-label': c, style: { background: c },
        onclick: () => dress({ pat: { id: (look.pat && look.pat.id) || PATTERNS[0].id, c } }) }))));
    }
    function renderClothes() {
      if (!regions.includes('shirt')) { note.textContent = t("{name} doesn't wear clothes.", { name: cleanNick(nameIn.value) || defaultName(model) }); return; }
      const on = topOn();
      for (const tp of TOPS) grid.append(tile(on.id === tp.id, t(tp.name), topPic(tp, colourOf('shirt')), () => toggle('top', tp.id)));
      note.textContent = t('Drag a cut-out onto them to put it on');
    }
    function renderAcc() {
      if (!accs.length) { note.textContent = t('Accessories are bought in the Market.'); return; }
      const bySlot = WEAR_SLOTS.flatMap((sl) => accs.filter((w) => w.slot === sl));
      // tap one that's off: on, ready to fine-tune; one that's on: fine-tune it; the one being tuned: off
      for (const w of bySlot) {
        const on = wearing(w.id), tuning = on && state.sel === w.slot;
        grid.append(tile(on, t(w.name), thumb(w.model, null, 64, 56), () => {
          if (on && !tuning) { select(w.slot); render(); } else toggle('acc', w.id);
        }, tuning ? '.tuning' : ''));
      }
      const e = state.sel && look.wear[state.sel];
      if (e) sub.append(adjuster(e));
      note.textContent = e ? t('Tap it again to take it off.') : t('Tap one you have on to move it.');
    }
    /** The old wardrobe's fine-tuning (ui/wardrobe.js) for the accessory on `e`, an entry of look.wear: a pad, depth, tilt, lean, size. */
    function adjuster(e) {
      const L = WEAR_LIMITS, item = wearById(e.id), r = () => e.r || [0, 0, 0];
      const pad = (cls, label, title, d) => holdBtn('button.pd-key.' + cls, label, title, () => { nudgeWear(e, dollStage.goal, ...d); tune(); });
      const slider = (label, value, min, max, step, set) => {
        const input = h('input', { type: 'range', min, max, step, value, 'aria-label': label });
        input.addEventListener('input', () => { set(+input.value); tune(); });
        return h('label.pd-slider', h('span', label), input);
      };
      return h('div.pd-adjust',
        h('div.pd-adj-head', h('b', t(item.name)), h('span', t(SLOT_NAME[item.slot])),
          h('button.pd-mini', { type: 'button', title: t('Back to the automatic fit'), 'aria-label': t('Back to the automatic fit'),
            onclick: () => { delete e.p; delete e.r; delete e.s; tune(); render(); } }, glyph('recenter', 14), t('Back to the automatic fit'))),
        h('div.pd-adj-row',
          h('div.pd-pad',
            pad('up', glyph('back', 14), t('Up'), [0, 1, 0]), pad('left', glyph('back', 14), t('Left'), [-1, 0, 0]),
            pad('right', glyph('forward', 14), t('Right'), [1, 0, 0]), pad('down', glyph('forward', 14), t('Down'), [0, -1, 0]),
            pad('fwd', t('Toward the face'), t('Toward the face'), [0, 0, 1]), pad('bk', t('Toward the back'), t('Toward the back'), [0, 0, -1])),
          h('div.pd-sliders',
            slider(t('Tilt'), r()[2], -L.r, L.r, 1, (v) => { e.r = [r()[0], r()[1], v]; }),
            slider(t('Lean'), r()[0], -L.r, L.r, 1, (v) => { e.r = [v, r()[1], r()[2]]; }),
            slider(t('Size'), e.s ?? 1, L.s[0], L.s[1], 0.01, (v) => { e.s = v; }))));
    }
    render();
  });
}

/** A torn bottom edge for the paper sheet (a jagged clip-path, made once). */
function tornEdge(el) {
  const pts = ['0 0', '100% 0'];
  for (let i = 40; i >= 0; i--) pts.push(`${(i / 40) * 100}% calc(100% - ${(Math.random() * 6).toFixed(1)}px)`);
  el.style.clipPath = `polygon(${pts.join(',')})`;
}

/**
 * Dress someone on the team: the paper doll on their look and name, applied on Save.
 * @returns Promise of the paper doll's result (null if closed)
 */
export function dressStaff(game, a, opts = {}) {
  return openPaperDoll(game, { look: a.look, name: a.nick || '', who: a, ...opts }).then((res) => {
    if (!res) return null;
    a.look = { ...a.look, ...res.look };
    for (const k of ['fur', 'light', 'shirt', 'pat', 'top']) if (!(k in res.look)) delete a.look[k];
    a.setNick(res.name);
    game.refreshCharacter(a);
    game.changed('staff');
    return res;
  });
}
