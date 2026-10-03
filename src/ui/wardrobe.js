// The wardrobe card: put accessories on a staff member and place them by hand. A 3D preview of the
// character (drag to turn), a tab per slot, the items for that slot and, for the one being worn, controls
// to nudge it up/down/left/right and toward the face or the back, tilt it and size it. Every item starts
// fitted automatically (src/wear.js); only the player's nudges are stored on top, in look.wear[slot].
// Only accessories bought in the Market are offered, and each copy is worn by one staff member at a time:
// picking one whose every copy is on somebody else moves a copy over on Done.
import { h } from '../util.js';
import { t } from '../i18n.js';
import { THREE } from '../models.js';
import { Stage } from '../tryout3d.js';
import { thumb } from '../portrait.js';
import { WEAR, WEAR_SLOTS, WEAR_LIMITS, wearById } from '../data.js';
import { sanitizeWear } from '../wear.js';
import { glyph } from './icons.js';

export const SLOT_NAME = { head: 'Head', face: 'Face', neck: 'Neck', back: 'On back' };
const STEP = 0.02;          // world units per nudge
const FRONT_YAW = 0.45;     // the preview's resting angle: a little to the side, so depth reads

/** The 3D preview: the character on a pale ground, turned by dragging, framed on the slot being dressed. */
class WardrobeStage extends Stage {
  constructor(canvas, look) {
    super(canvas, '#f1f1ef');
    this.scene.fog = null;
    this.mesh(new THREE.CircleGeometry(1.1, 40), new THREE.MeshBasicMaterial({ color: '#e2e2de' })).rotation.x = -Math.PI / 2;
    this.cv = this.character(look, 0, 0, FRONT_YAW);
    if (this.cv.inst.mixer) this.cv.inst.mixer.update(0);
    const box = new THREE.Box3().setFromObject(this.cv.root);
    this.top = box.max.y;
    this.yaw = this.goalYaw = FRONT_YAW;
    this.view = this.goal = this.framing('head');
  }
  /** Camera target height and distance for a slot: close on the head for hats and glasses, the whole body otherwise. */
  framing(slot) {
    const H = this.top, close = slot === 'head' || slot === 'face';
    return close ? { y: H * 0.8, d: H * 2.1 } : { y: H * 0.55, d: H * 2.6 };
  }
  focus(slot) {
    this.goal = this.framing(slot);
    this.goalYaw = slot === 'back' ? Math.PI + FRONT_YAW : FRONT_YAW;
  }
  update(dt) {
    const k = 1 - Math.exp(-dt * 8);
    this.yaw += (this.goalYaw - this.yaw) * k;
    this.view = { y: this.view.y + (this.goal.y - this.view.y) * k, d: this.view.d + (this.goal.d - this.view.d) * k };
    this.cv.root.rotation.y = this.yaw;
    if (this.cv.inst.mixer) this.cv.inst.mixer.update(dt);
    this.cam.fov = 30; this.cam.position.set(0, this.view.y + this.top * 0.12, this.view.d); this.cam.lookAt(0, this.view.y, 0);
    this.render();
  }
}

/** A button that repeats while held (a tap is one step). */
function holdBtn(sel, label, title, step) {
  let timer = null;
  const stop = () => { clearTimeout(timer); clearInterval(timer); timer = null; };
  const b = h(sel, { title, 'aria-label': title, type: 'button' }, label);
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); stop(); step(); timer = setTimeout(() => { timer = setInterval(step, 60); }, 350); });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, stop);
  b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); step(); } });
  return b;
}

/** The card for `a` (a staff member), opened on `slot`. */
export function wardrobeCard(ui, a, slot = 'head') {
  const g = ui.game;
  const draft = JSON.parse(JSON.stringify(a.look.wear || {}));
  const L = WEAR_LIMITS;
  // who else wears what, and how many copies are left for this character
  const wornBy = new Map();
  for (const s of g.staff) if (s !== a) for (const w of Object.values(s.look.wear || {})) wornBy.set(w.id, [...(wornBy.get(w.id) || []), s]);
  const owned = (id) => g.state.wardrobe[id] || 0;
  const spare = (id) => owned(id) - (wornBy.get(id) || []).length;
  const holder = (id) => (spare(id) > 0 ? null : (wornBy.get(id) || [])[0]);

  const view = h('canvas.wr-3d');
  const stageBox = h('div.wr-stage', view, h('div.wr-hint', glyph('rotate', 13), t('Drag to turn')));
  const stage = new WardrobeStage(view, { ...a.look, wear: draft });
  const card = h('div.card.wardrobe');
  const controls = h('div.wr-controls');
  let alive = true, last = performance.now();
  const frame = (now) => {
    if (!alive || !view.isConnected) return;
    stage.update(Math.min(0.05, Math.max(0, (now - last) / 1000)));
    last = now;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  // drag to turn the character
  let drag = null;
  stageBox.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, yaw: stage.goalYaw }; stageBox.setPointerCapture(e.pointerId); });
  stageBox.addEventListener('pointermove', (e) => { if (drag) stage.goalYaw = drag.yaw + (e.clientX - drag.x) * 0.012; });
  for (const ev of ['pointerup', 'pointercancel']) stageBox.addEventListener(ev, () => { drag = null; });

  const close = () => { alive = false; stage.dispose(); window.removeEventListener('keydown', onKey); ui.closeModal(); ui.renderPanel(); };
  const done = () => {
    const wear = sanitizeWear(draft);
    for (const w of Object.values(wear)) {   // a copy taken from a teammate comes off them
      const s = holder(w.id);
      if (!s) continue;
      for (const sl of WEAR_SLOTS) if (s.look.wear[sl] && s.look.wear[sl].id === w.id) delete s.look.wear[sl];
      g.refreshCharacter(s);
    }
    a.look.wear = wear;
    g.refreshCharacter(a);
    g.changed('look');
    close();
  };

  const apply = () => stage.cv.setWear(draft);
  const entry = () => draft[slot];
  const clampP = (v) => Math.max(-L.p, Math.min(L.p, v));
  // left/right follow the screen (the preview's nearest quarter turn), so a tap never moves diagonally
  const nudge = (dx, dy, dz) => {
    const e = entry(); if (!e) return;
    const q = Math.round(stage.goalYaw / (Math.PI / 2)) * (Math.PI / 2);
    const p = e.p || [0, 0, 0];
    e.p = [clampP(p[0] + dx * Math.cos(q) * STEP), clampP(p[1] + dy * STEP), clampP(p[2] + (dx * Math.sin(q) + dz) * STEP)].map((v) => +v.toFixed(3));
    apply();
  };

  function render() {
    const e = entry(), item = e && wearById(e.id), owner = item && holder(item.id);
    const items = WEAR.filter((w) => w.slot === slot && owned(w.id));
    const pick = (id) => {
      if (id) draft[slot] = { id }; else delete draft[slot];
      apply(); render();
    };
    const slider = (label, value, min, max, step, set) => {
      const input = h('input', { type: 'range', min, max, step, value, 'aria-label': label });
      input.addEventListener('input', () => { set(+input.value); apply(); });
      return h('label.wr-slider', h('span', label), input);
    };
    controls.replaceChildren(...[
      h('div.tabs.wr-tabs', WEAR_SLOTS.map((sl) => h('button.btn.small.tab' + (sl === slot ? '.on' : ''), {
        onclick: () => { slot = sl; stage.focus(sl); render(); },
      }, t(SLOT_NAME[sl]), draft[sl] ? h('i.wr-dot') : null))),
      h('div.wr-items',
        h('button.wr-item' + (!e ? '.on' : ''), { onclick: () => pick(null), title: t('Nothing') }, h('span.wr-none', glyph('close', 18)), h('span', t('Nothing'))),
        items.map((w) => h('button.wr-item' + (e && e.id === w.id ? '.on' : ''), { onclick: () => pick(w.id), title: w.name },
          thumb(w.model, null, 56, 48), h('span', w.name), holder(w.id) ? h('small', t('On {name}', { name: holder(w.id).name })) : null))),
      items.length ? null : h('div.wr-empty', h('span.muted', t('Nothing for this spot yet.')),
        h('button.btn.small', { onclick: () => { close(); ui.marketCat = 'wear'; ui.openPanel('market'); } }, t('Shop in the Market'))),
      owner ? h('div.bmsg.warn', t('{name} is wearing this. It moves over when you tap Done.', { name: owner.name })) : null,
      e ? h('div.wr-adjust',
        h('div.wr-pads',
          h('div.wr-dpad',
            holdBtn('button.btn.small.wr-up', glyph('back', 16), t('Up'), () => nudge(0, 1, 0)),
            holdBtn('button.btn.small.wr-left', glyph('back', 16), t('Left'), () => nudge(-1, 0, 0)),
            holdBtn('button.btn.small.wr-right', glyph('forward', 16), t('Right'), () => nudge(1, 0, 0)),
            holdBtn('button.btn.small.wr-down', glyph('forward', 16), t('Down'), () => nudge(0, -1, 0))),
          h('div.wr-depth',
            holdBtn('button.btn.small', t('Toward the face'), t('Toward the face'), () => nudge(0, 0, 1)),
            holdBtn('button.btn.small', t('Toward the back'), t('Toward the back'), () => nudge(0, 0, -1)))),
        slider(t('Tilt'), (e.r || [0, 0, 0])[2], -L.r, L.r, 1, (v) => { e.r = [(e.r || [0, 0, 0])[0], (e.r || [0, 0, 0])[1], v]; }),
        slider(t('Lean'), (e.r || [0, 0, 0])[0], -L.r, L.r, 1, (v) => { e.r = [v, (e.r || [0, 0, 0])[1], (e.r || [0, 0, 0])[2]]; }),
        slider(t('Size'), e.s ?? 1, L.s[0], L.s[1], 0.01, (v) => { e.s = v; }),
        h('button.btn.small.wr-reset', { onclick: () => { draft[slot] = { id: e.id }; apply(); render(); } }, glyph('recenter', 14), t('Back to the automatic fit'))) : null,
    ].filter(Boolean));
  }

  // arrow keys nudge, [ and ] move toward the back / the face, Esc cancels
  const onKey = (e) => {
    if (!view.isConnected) return window.removeEventListener('keydown', onKey);
    if (e.target && e.target.tagName === 'INPUT') return;
    if (e.key === 'Escape') return close();
    const k = { ArrowUp: [0, 1, 0], ArrowDown: [0, -1, 0], ArrowLeft: [-1, 0, 0], ArrowRight: [1, 0, 0], ']': [0, 0, 1], '[': [0, 0, -1] }[e.key];
    if (k) { e.preventDefault(); nudge(...k); }
  };
  window.addEventListener('keydown', onKey);

  stage.focus(slot);
  render();
  card.append(
    h('div.wr-head', h('b', t("{name}'s wardrobe", { name: a.name })),
      h('button.btn.small.xbtn', { onclick: close, title: t('Close'), 'aria-label': t('Close') }, glyph('close', 14))),
    stageBox, controls,
    h('div.feed-btns', h('button.btn', { onclick: close }, t('Cancel')), h('button.btn.primary', { onclick: done }, t('Done'))));
  return card;
}

/** Open the wardrobe for a staff member. */
export function openWardrobe(ui, a, slot) {
  ui.queueModal(() => wardrobeCard(ui, a, slot));
}
