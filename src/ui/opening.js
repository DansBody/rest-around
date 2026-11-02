// The opening (design/prologue/OPENING_PLAN.md, the first cup, re-staged in the 3D café on 2026-11-02): straight after
// the prologue, on the café's own empty lot. Nothing on it but the cart, bare: its two counters and its things lie
// scattered round it where the wind left them, and everything else of the café (the furniture, the flower boxes, the
// staff, the passers-by, the HUD) is kept out of the picture. The colourist's note on the cart says it's yours; tap
// each thing and it goes back where it belongs (the small things into the cart, the counters back under the awning)
// till the cart stands complete. Then someone you can't make out walks up out of the rain: a 3D character dark as a
// shadow (小黑). They ask if you're open; you brew them the first cup (brew3d.js, no result card), they drink, and
// after a moment the one thing they say (never a complaint: at most "...but warm"). The rain stops, and their colour
// comes back into them from the cup: the dark lifts off them while a watercolour bloom of their own colour spreads round
// them, the wet ground rings with it and a few flecks rise. Named only by their next line, they remember brewing coffee
// somewhere and ask to stay; the player names and dresses them in the paper doll (over the café) and they start as the
// partner (game.setStarter), standing where they stood.
// Who it is is picked at random from the cast before anything is shown, leaving out the player's own species (the
// puddle, prologue.js dressSelf, once that picks one). Skipped at any point, everything goes back where it belongs and
// they start anyway, undressed and with their own name. This cup is the colourist's gift, not one of the free fan
// pour-overs.
import { h } from '../util.js';
import { t } from '../i18n.js';
import { audio } from '../audio.js';
import { THREE, models, TILE } from '../models.js';
import { DIRS } from '../iso.js';
import { toonize } from '../pixelview.js';
import { portrait } from '../portrait.js';
import { roleLook } from '../looks.js';
import { UNIQUE_MODELS, starterRole } from '../data.js';
import { defaultName } from '../staff.js';
import { cartSpan } from '../cart.js';
import { collageStage } from './prologue.js';
import { openBrew3d } from './brew3d.js';
import { openPaperDoll } from './paperdoll.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
const SHADOW = new THREE.Color(0.012, 0.013, 0.017), WHITE = new THREE.Color(1, 1, 1);   // linear: 0.07 still showed a red shirt through
const WALK = 1.5;   // tiles a second

/** Who comes in out of the rain: anyone of the cast but the player's own species. */
export function pickPasserBy(game) {
  const own = game.state.self && game.state.self.model;   // TODO paper-doll self: set by the puddle (prologue.js dressSelf)
  const pool = UNIQUE_MODELS.filter((m) => m !== own);
  return pool[Math.floor(Math.random() * pool.length)];
}

/** The one thing they say about the cup, by brew.js's verdict: never a complaint, at most "...but warm". */
function tasteLine(verdict) {
  switch (verdict) {
    case 'bitter': return t('A little bitter. ...But warm.');
    case 'sour': return t('A little sour. ...But warm.');
    case 'uneven': return t('Strong, then weak. ...But warm.');
    default: return t('...It\'s warm.');
  }
}
/** A splash, a footstep, a soft knock: a burst of filtered noise, only when sound is on. */
function hiss(dur, o) { if (audio.enabled && audio.ctx && audio.ctx.state === 'running') try { audio.noise(dur, o); } catch { /* no sound */ } }

/**
 * The colour they are, read off their portrait: the hue most of its well-coloured pixels share (twelve bins round the
 * wheel, weighted by how strong each pixel's colour is), averaged over that bin; denim if it can't be read.
 */
function mainColour(canvas) {
  try {
    const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    const bins = Array.from({ length: 12 }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
    const step = 4 * Math.max(1, Math.floor(canvas.width * canvas.height / 6000));
    for (let i = 0; i < data.length; i += step) {
      if (data[i + 3] < 200) continue;
      const R = data[i], G = data[i + 1], B = data[i + 2], hi = Math.max(R, G, B), lo = Math.min(R, G, B), sat = (hi - lo) / (hi || 1);
      if (hi < 60 || sat < 0.3) continue;   // ink, white, greys: not their colour
      const d = hi - lo, hue = hi === R ? ((G - B) / d + 6) % 6 : hi === G ? (B - R) / d + 2 : (R - G) / d + 4;
      const bin = bins[Math.floor(hue * 2) % 12];
      bin.w += sat; bin.r += R * sat; bin.g += G * sat; bin.b += B * sat;
    }
    const top = bins.reduce((a, b) => (b.w > a.w ? b : a));
    return top.w < 4 ? '#3F5DAA' : `rgb(${Math.round(top.r / top.w)}, ${Math.round(top.g / top.w)}, ${Math.round(top.b / top.w)})`;
  } catch { return '#3F5DAA'; }
}

/**
 * Darken a character's view toward a shadow (k 0: dark as a silhouette, 1: as they are). Sprite cards take it as their
 * tint uniform (every card of them, ears too, sharing `tint`); a 3D model has its colours multiplied down.
 */
function shade(cv, tint, k) {
  if (!cv) return;
  tint.copy(SHADOW).lerp(WHITE, k);
  cv.root.traverse((o) => {
    if (!o.material) return;
    // a model's materials are shared with every other copy of it (the paper doll's too): darken copies of them
    if (!o.userData.ownMats) {
      o.userData.ownMats = true;
      o.material = Array.isArray(o.material) ? o.material.map((m) => (m.uniforms ? m : m.clone())) : o.material.uniforms ? o.material : o.material.clone();
    }
    for (const m of [].concat(o.material)) {
      if (m.uniforms && m.uniforms.tint) { if (m.uniforms.tint.value !== tint) m.uniforms.tint = { value: tint }; }
      else if (m.color) { if (!m.userData.base) m.userData.base = m.color.clone(); m.color.copy(m.userData.base).multiply(tint); }
    }
  });
}

/** Someone walking up to the cart, moved by the opening itself (the café is held): drawn like a passer-by. */
class Visitor {
  constructor(look, x, y) {
    this.look = look; this.x = x; this.y = y; this.dir = 1;
    this.pose = {}; this.phase = 0; this.seed = 3; this.moving = false; this.hop = 0; this.done = false;
  }
  update() { /* the opening moves them, not the street */ }
  computePose(t) {
    Object.assign(this.pose, { t, phase: this.phase, moving: this.moving, mode: 'idle', seed: this.seed, lift: 0, alpha: 1, hop: this.hop, shake: false, held: null, expr: null });
    return this.pose;
  }
}

/** A sack of beans, made in code: burlap, tied at the top, the palette's label on the front. */
function beanSack() {
  const g = new THREE.Group(), lam = (c) => new THREE.MeshLambertMaterial({ color: c });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), lam('#a9845a')); body.scale.set(1, 1.25, 0.85); body.position.y = 0.5; g.add(body);
  const neck = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.32, 8), lam('#9a764e')); neck.position.y = 1.08; g.add(neck);
  const tie = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.035, 5, 10), lam('#3f5daa')); tie.rotation.x = Math.PI / 2; tie.position.y = 0.98; g.add(tie);
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), new THREE.MeshBasicMaterial({ color: '#fbf3e2' })); label.position.set(0, 0.55, 0.37); g.add(label);
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.08, 10), new THREE.MeshBasicMaterial({ color: '#3f5daa' })); dot.position.set(0, 0.55, 0.375); g.add(dot);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

/**
 * Play the opening over the café; resolves once the partner has started (watched, or skipped).
 * @param ui the UI (its HUD is kept out of the picture till the end)
 */
export async function playOpening(ui) {
  const game = ui.game, r = game.renderer, w = game.world, cam = game.camera;
  // the café's things are put in the scene on the renderer's first frames: wait for the counters to be there
  for (let i = 0; i < 120 && ![...r.furn.values()].some((v) => v.f.kind === 'cashier'); i++) await new Promise((res) => requestAnimationFrame(res));
  const model = pickPasserBy(game);
  const look0 = roleLook(starterRole(model), model);
  let name = '', coat = {};
  const span = cartSpan(w) || { x0: 5, x1: 6, y0: 0, y1: 0, back: 'n' };
  const out = { n: [0, 1], s: [0, -1], w: [1, 0], e: [-1, 0] }[span.back];   // the cart's front faces this way (tiles)
  const mid = { x: (span.x0 + span.x1 + 1) / 2, y: (span.y0 + span.y1 + 1) / 2 };
  const front = { x: mid.x + out[0] * 2.1, y: mid.y + out[1] * 2.1 };       // where a guest stands at the cart
  const cartTop = () => new THREE.Vector3(mid.x * TILE, 2.2, mid.y * TILE);

  // ---- the 2D layer over the café: the line, Skip, the rain, the hints, the colour coming back
  const rain = h('div.pr-rain.op-rain');
  const dim = h('i.op-dim');   // the rain's grey over the scene, lifted when it stops
  const count = h('div.op-count');
  const marks = h('div.op-marks');
  const paint = h('i.op-paint'), rings = h('div.op-rings', [0, 1, 2].map((i) => h('i', { style: { '--i': i } })));
  const flecks = h('div.op-flecks', [12, 30, 44, 58, 71, 84, 38, 64].map((x, i) => h('i', { style: { '--x': x + '%', '--i': i } })));
  const note = h('div.pr-note.op-note', h('div.pr-note-in',
    h('p', t('This cart is yours now.')),
    h('p', t('Its things blew about in the wind. Gather them up, and it will stand again.')),
    h('p.pr-note-sign', t('Brew it for whoever comes in out of the rain.'))));
  const stage = collageStage(game, [dim, rain, paint, rings, flecks, marks, count, note], '.over3d');
  const { root, wait, anim, done, say, guard, still } = stage;
  audio.setScene('night', true);
  const chrome = [ui.root, r.overlay];
  for (const el of chrome) el.style.visibility = 'hidden';

  // ---- the bare lot: the café's other things, staff and passers-by out of the picture; the counters scattered
  const views = [...r.furn.values()];
  const counters = views.filter((v) => v.f.kind === 'stove' || v.f.kind === 'cashier');
  const homes = new Map(counters.map((v) => [v, { base: v.base.clone(), pos: v.obj.position.clone(), rot: v.obj.rotation.clone() }]));
  // where things lie, in the cart's own frame: u along it (toward the lot's middle), v out from its front, in tiles
  const along = out[0] ? [0, 1] : [1, 0], inward = (along[0] ? mid.x : mid.y) > w.size / 2 ? -1 : 1;
  const lot = (u, v) => ({ x: clamp(mid.x + along[0] * u * inward + out[0] * v, 0.6, w.size - 0.6), y: clamp(mid.y + along[1] * u * inward + out[1] * v, 0.6, w.size - 0.6) });
  const LIE = [[2.9, 2.6, 0.5, 0.3], [0.3, 4.3, -0.8, -0.26]];
  const items = [];
  counters.forEach((v, i) => {
    const [u, vv, yaw, tip] = LIE[i % LIE.length];
    items.push({ v, big: true, ...lot(u, vv), yaw, tip, k: 0 });
  });
  const SMALL = [['m_grinder', 3.7, 1.1, 1.7], ['m_mug', -0.9, 2.7, 1.6], ['m_tray', 1.9, 4.9, 1.2], ['sack', 1.6, 1.4, 1.1]];
  for (const [id, u, vv, s] of SMALL) {
    const obj = id === 'sack' ? beanSack() : models.instance(id);
    if (!obj) continue;
    if (r.pixelArt) toonize(obj);
    obj.scale.setScalar(s);
    r.scene.add(obj);
    items.push({ obj, big: false, ...lot(u, vv), yaw: Math.random() * 6, tip: id === 'm_tray' ? 0.05 : 0.5, s, k: 0 });
  }
  /** Lay an item where it lies (k 0) or partway home (k 0..1, along an arc). */
  const place = (it) => {
    const lie = new THREE.Vector3(it.x * TILE, 0, it.y * TILE), k = ease(it.k), lift = Math.sin(it.k * Math.PI) * 2.4;
    if (it.big) {
      const home = homes.get(it.v), o = it.v.obj;
      const p = lie.clone().lerp(home.pos, k);
      it.v.base.x = p.x; o.position.set(p.x, p.y + lift + (1 - k) * 0.05, p.z);
      o.rotation.set(it.tip * (1 - k), home.rot.y + it.yaw * (1 - k), it.tip * 0.6 * (1 - k));
    } else {
      const p = lie.clone().lerp(cartTop(), k);
      it.obj.position.set(p.x, p.y + lift, p.z);
      it.obj.rotation.set(it.tip * (1 - k), it.yaw * (1 - k), 0);
      it.obj.scale.setScalar(it.s * (1 - 0.9 * clamp((it.k - 0.6) / 0.4, 0, 1)));
    }
  };
  items.forEach(place);
  const dressing = r.dressing || [];
  const staff = game.staff;
  const passers = game.ambient.splice(0);
  const visitor = new Visitor(look0, -2.15, w.size + 3);   // up the street on the lot's left, toward the cart
  const tint = new THREE.Color().copy(SHADOW);
  let tintK = 0;

  // ---- every frame while it plays: keep the lot bare, the visitor dark, the hints over what's left to pick up
  let raf = 0, last = performance.now(), walking = null;
  const markEls = new Map();
  const frame = () => {
    const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
    for (const v of r.furn.values()) if (!counters.includes(v)) v.obj.visible = false;   // (the renderer may rebuild a view)
    for (const o of dressing) o.visible = false;
    for (const a of staff) a.visible = false;
    for (const it of items) if (it.anim) { it.k = clamp(it.k + dt / it.anim.dur, 0, 1); place(it); if (it.k >= 1) { const f = it.anim.done; it.anim = null; f(); } }
    if (walking) walking(dt);
    shade(r.chars.get(visitor), tint, tintK);
    for (const it of items) {
      const el = markEls.get(it);
      if (!el) continue;
      const p = r.project(it.x, it.y, it.big ? 2.6 : 1.6);
      el.style.display = p && !it.got ? '' : 'none';
      if (p) el.style.transform = `translate(${p.x}px, ${p.y}px)`;
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  /** Walk the visitor to (x, y) in tiles, facing where they go; resolves on arrival. */
  const walkTo = (x, y) => new Promise((res) => {
    visitor.moving = true;
    walking = (dt) => {
      const dx = x - visitor.x, dy = y - visitor.y, d = Math.hypot(dx, dy), step = Math.min(d, WALK * dt);
      if (d > 1e-3) {
        visitor.x += (dx / d) * step; visitor.y += (dy / d) * step; visitor.phase += step * Math.PI * 1.6;
        let best = 0; DIRS.forEach((q, i) => { if (q.dx * dx + q.dy * dy > DIRS[best].dx * dx + DIRS[best].dy * dy) best = i; });
        visitor.dir = best;
        if (Math.floor(visitor.phase / Math.PI) !== Math.floor((visitor.phase - step * Math.PI * 1.6) / Math.PI)) hiss(0.06, { vol: 0.05, freq: 650, q: 0.7, type: 'lowpass' });
      }
      if (d - step < 1e-3) { visitor.moving = false; walking = null; res(); }
    };
  });
  /** Turn the visitor to face (x, y). */
  const face = (x, y) => { const dx = x - visitor.x, dy = y - visitor.y; let best = 0; DIRS.forEach((q, i) => { if (q.dx * dx + q.dy * dy > DIRS[best].dx * dx + DIRS[best].dy * dy) best = i; }); visitor.dir = best; };
  /** Tween something in real time (k 0..1), on this opening's frames. */
  const tween = (dur, fn) => new Promise((res) => {
    const t0 = performance.now();
    const step = () => { const k = still ? 1 : clamp((performance.now() - t0) / dur, 0, 1); fn(k); if (k < 1) requestAnimationFrame(step); else res(); };
    step();
  });

  /** Put the cart back together: every item home (the skip's way out, and the end of the gathering). */
  const assemble = () => { for (const it of items) { it.got = true; it.anim = null; it.k = 1; place(it); } };
  /** Everything as the café keeps it: the lot furnished again, the staff and HUD back, the opening's things gone. */
  const restore = () => {
    cancelAnimationFrame(raf);
    for (const it of items) if (!it.big) r.scene.remove(it.obj);
    for (const v of counters) { const home = homes.get(v); v.base.copy(home.base); v.obj.position.copy(home.pos); v.obj.rotation.copy(home.rot); }
    for (const v of r.furn.values()) v.obj.visible = true;
    for (const o of dressing) o.visible = true;
    for (const a of staff) a.visible = true;
    shade(r.chars.get(visitor), tint, 1);
    const i = game.ambient.indexOf(visitor);
    if (i >= 0) game.ambient.splice(i, 1);
    game.ambient.push(...passers.filter((p) => !p.done));
    for (const el of chrome) el.style.visibility = '';
    r.shadowDirty = true;
  };

  const story = async () => {
    await stage.begin();
    // the lot, framed whole: the bare cart in the middle, its things lying round it
    // (framed on the middle of the cart and its things, so a narrow screen has them all)
    const all = [...items, mid], cx = all.reduce((a, q) => a + q.x, 0) / all.length, cy = all.reduce((a, q) => a + q.y, 0) / all.length;
    cam.flyTo(cx * TILE, cy * TILE, { dist: cam.fitDist(w.size) * 0.9 });
    await wait(1600);
    // the colourist's note on the cart
    note.classList.add('on');
    await done(anim(note, [{ transform: 'translate(-50%, -50%) scale(.3) rotate(-14deg)', opacity: 0 }, { transform: 'translate(-50%, -50%) scale(1.03) rotate(-3deg)', opacity: 1, offset: 0.7 }, { transform: 'translate(-50%, -50%) rotate(-4deg)', opacity: 1 }], { duration: 650 }));
    await stage.beat();
    await done(anim(note, [{ transform: 'translate(-50%, -50%) rotate(-4deg)', opacity: 1 }, { transform: 'translate(-50%, 30%) scale(.4) rotate(-12deg)', opacity: 0 }], { duration: 500, easing: 'ease-in' }));
    note.classList.remove('on');
    // gather the things: tap each; the small ones go into the cart, the counters back under the awning, last of all
    const total = items.length;
    let got = 0;
    const tally = () => { count.textContent = t('Gather its things: {n} / {total}', { n: got, total }); };
    tally();
    count.classList.add('on');
    for (const it of items) { const el = h('i.op-mark'); marks.append(el); markEls.set(it, el); }
    await guard(new Promise((allIn) => {
      const pick = (e) => {
        if (e.target.closest('.pr-skip')) return;
        let best = null, bd = 64;
        for (const it of items) {
          if (it.got) continue;
          const p = r.project(it.x, it.y, it.big ? 1.2 : 0.6), q = r.project(it.x, it.y, it.big ? 2.6 : 1.6);
          const dd = Math.min(p ? Math.hypot(p.x - e.clientX, p.y - e.clientY) : 1e9, q ? Math.hypot(q.x - e.clientX, q.y - e.clientY) : 1e9);
          if (dd < bd) { bd = dd; best = it; }
        }
        if (!best) return;
        best.got = true;
        audio.play('pop');
        best.anim = { dur: best.big ? 0.9 : 0.75, done: () => {
          if (best.big) { best.v.f.bounce = 1; hiss(0.08, { vol: 0.08, freq: 300, q: 1 }); }
          got++; tally();
          if (got >= total) { root.removeEventListener('pointerdown', pick); allIn(); }
        } };
      };
      root.addEventListener('pointerdown', pick);
    }));
    count.classList.remove('on');
    marks.replaceChildren();
    // the cart stands complete
    audio.play('levelup');
    for (const it of items) if (it.big) it.v.f.bounce = 1;
    await wait(1400);
    // someone you can't make out, coming up the street out of the rain, to the cart
    game.ambient.push(visitor);
    cam.flyTo(((mid.x + front.x) / 2 - 1) * TILE, ((mid.y + front.y) / 2 + 0.5) * TILE, { dist: cam.fitDist(w.size) * 0.62 });
    await walkTo(-2.15, front.y + 0.8);
    await walkTo(front.x, front.y + 0.8);
    await walkTo(front.x, front.y);
    face(mid.x, mid.y);
    await wait(900);
    const DARK = t('Someone you can\'t make out');
    await say(t('...Still open?'), DARK);
    // the first cup, on the counter in 3D; no result card: it comes straight back here
    const cup = await guard(openBrew3d(game, { guest: DARK, handOff: true }));
    // they drink, and nothing is said for a moment
    await tween(1400, (k) => { visitor.hop = Math.sin(k * Math.PI) * 0.18; });
    visitor.hop = 0;
    await wait(1700);
    await say(tasteLine(cup.verdict), DARK);
    if (cup.verdict !== 'balanced') await say(t('(The recipe card is in the corner of the counter. The next cup will be better.)'));
    // the rain stops
    audio.setScene(null);
    anim(rain, [{ opacity: getComputedStyle(rain).opacity }, { opacity: 0 }], { duration: 2600, easing: 'ease-out' });
    anim(dim, [{ opacity: 1 }, { opacity: 0 }], { duration: 3200, easing: 'ease-in-out' });
    await wait(2200);
    // and their colour comes back into them from the cup: the dark lifts, a bloom of their colour round them, rings on
    // the wet ground at their feet, a few flecks rising
    const art = portrait(look0, 96, 96);
    root.style.setProperty('--hue', mainColour(art));
    const at = r.project(visitor.x, visitor.y, 1.3), foot = r.project(visitor.x, visitor.y, 0);
    if (at && foot) {
      const size = Math.max(160, (foot.y - at.y) * 3.2);
      for (const el of [paint, flecks]) Object.assign(el.style, { left: `${at.x - size / 2}px`, top: `${at.y - size / 2}px`, width: `${size}px`, height: `${size}px` });
      Object.assign(rings.style, { left: `${foot.x - size * 0.6}px`, top: `${foot.y - size * 0.2}px`, width: `${size * 1.2}px`, height: `${size * 0.4}px` });
    }
    hiss(0.05, { vol: 0.1, freq: 2700, q: 8 });   // the drop
    const SPREAD = { duration: 3600, easing: 'cubic-bezier(.5,.05,.35,1)' };
    const sz = (k) => `${k}% auto`;
    // (grown only as far as the box: the bloom's own ragged edge, never the box's)
    anim(paint, [{ maskSize: sz(3), webkitMaskSize: sz(3), opacity: 0.85 }, { opacity: 0.7, offset: 0.4 }, { maskSize: sz(100), webkitMaskSize: sz(100), opacity: 0 }], SPREAD);
    rings.classList.add('on'); flecks.classList.add('on');
    await tween(3200, (k) => { tintK = ease(k); });
    await wait(1200);
    // who it is: only their name on the line they say
    const WHO = defaultName(model);
    await say(t('I think... I used to brew coffee. Somewhere.'), WHO);
    await say(t('The rain\'s stopped. ...Can I stay?'), WHO);
    // the player names them and dresses them, over the café
    root.style.zIndex = '59';   // under the paper doll (60), the café still in sight round it
    const res = await guard(openPaperDoll(game, { look: look0, name: '', clear: true }));
    root.style.zIndex = '';
    if (res) {
      const { model: m, scale, ...d } = res.look;   // only the dress: the role sets the rest
      coat = d;
      name = res.name || '';
    }
  };

  return stage.run(story).then(() => {
    audio.setScene(null);
    assemble();
    const at = { x: Math.floor(visitor.x), y: Math.floor(visitor.y) };
    restore();
    game.setStarter(model, name, coat);
    // the partner stands where they stood
    const partner = game.staff.find((a) => a.look.model === model);
    if (partner && w.isWalkable(at.x, at.y)) partner.placeAt(at.x, at.y);
    cam.fit(w.size);
  });
}
