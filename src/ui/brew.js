// Hand brewing at the cart (opening-premise): every cup in the cart stage is a pour-over the player makes, in the
// prologue's real-photo collage (a top-down grinder and dripper, a hand with a gooseneck kettle, a takeaway cup).
// Three steps, about twenty seconds, one finger:
//   grind  draw circles round the grinder: it turns with the finger, three turns grind a dose;
//   bloom  hold to pour a little, into the bloom band of the gauge; the grounds swell and bubble, wait till they settle;
//   pour   hold, and keep the stream on a glowing dot that circles the ring (between the middle and the paper; it only
//          moves while you pour), up to Full on the gauge, without running over.
// The result is how much colour comes back into the guest (0-100) and why it fell short (sour, bitter, uneven), which
// the cart turns into the tip and the colour the guest walks off in. A tap-free prototype opener: debug menu, ?brew.
import { h } from '../util.js';
import { t } from '../i18n.js';
import { audio } from '../audio.js';

const TURNS = 3;                       // grinder turns to a dose
const BLOOM = [0.12, 0.22];            // the bloom band on the water gauge (of a full cup)
const FULL = [0.86, 1];                // the cup's line
const SPILL = 1.08;                    // past this the dripper runs over
const FILL_S = 6.5;                    // seconds of pouring from empty to full
const SETTLE = [2.6, 7];               // seconds the bloom wants: less is sour, much more goes bitter
const RING = [0.28, 0.78];             // where the stream should land, as a fraction of the coffee bed's radius
const BED = 0.237;                     // the coffee bed's radius, of the stage's width (brew.css puts the dripper so)
const GUIDE = 0.53, LAP = 3.4, NEAR = 0.34;   // the dot: its circle (of BED), seconds a lap, how close counts (of BED)
const CUP_ML = 240;                    // what Full is, for the gauge's read-out
const quiet = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
/** A burst of noise (the grinder's crunch, the kettle's trickle), only when sound is on. */
function hiss(dur, o) { if (audio.enabled && audio.ctx && audio.ctx.state === 'running') try { audio.noise(dur, o); } catch { /* no sound */ } }

/** What the cup comes to, from what happened while it was made: { score, verdict, notes }. */
export function scoreBrew(r) {
  const pen = { sour: 0, bitter: 0, uneven: 0 };
  // bloom: too little or too much water, then too short a wait (sour) or far too long (bitter)
  const bl = r.bloom < BLOOM[0] ? (BLOOM[0] - r.bloom) / BLOOM[0] : r.bloom > BLOOM[1] ? (r.bloom - BLOOM[1]) / BLOOM[1] : 0;
  pen.sour += clamp(bl, 0, 1) * 12;
  if (r.wait < SETTLE[0]) pen.sour += (1 - r.wait / SETTLE[0]) * 22;
  else if (r.wait > SETTLE[1]) pen.bitter += clamp((r.wait - SETTLE[1]) / 8, 0, 1) * 12;
  // the pour: the stream off the circling dot (through the middle, onto the paper, or left behind)
  pen.uneven += (1 - r.inRing) * 40;
  // the water: short of the line is thin and sour, running over is bitter
  if (r.water < FULL[0]) pen.sour += clamp((FULL[0] - r.water) / 0.4, 0, 1) * 24;
  if (r.spilled) pen.bitter += 18;
  else if (r.water > FULL[1]) pen.bitter += clamp((r.water - FULL[1]) / (SPILL - FULL[1]), 0, 1) * 10;
  const lost = pen.sour + pen.bitter + pen.uneven;
  const score = Math.round(clamp(100 - lost, 5, 100));
  const worst = Object.entries(pen).sort((a, b) => b[1] - a[1])[0];
  return { score, verdict: score >= 88 || worst[1] < 6 ? 'balanced' : worst[0], pen };   // a good cup is just good
}

/**
 * Open the brew screen over the game. Resolves with { score, verdict } once the cup is handed over.
 * @param game  held while the cup is made
 * @param opts  { guest: a name to make it for }
 */
export function openBrew(game, opts = {}) {
  const still = quiet();
  const say = h('div.br-say');
  const step = h('div.br-step');
  const grinder = h('i.br-grinder');
  const ring = h('div.br-ring', { html: '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" class="br-track"/><circle cx="50" cy="50" r="46" class="br-done" pathLength="100"/></svg>' });
  // the dripper's photo, and over its coffee bed (centred on the stage, BED wide) the wet grounds, the pool of water,
  // the bloom's bubbles and the ring the stream should stay in
  const wet = h('i.br-wet'), pool = h('i.br-pool'), bubbles = h('i.br-bubbles'), band = h('i.br-band');
  const dripper = h('i.br-dripper');
  const bedBox = h('div.br-bed', wet, pool, bubbles, band);
  const kettle = h('i.br-kettle'), stream = h('i.br-stream'), splash = h('i.br-splash');
  const guide = h('i.br-guide'), tip = h('i.br-tip');   // the dot to follow, and what the stream is doing wrong
  const mark = (lo, hi) => ({ bottom: (lo / 1.12) * 100 + '%', height: ((hi - lo) / 1.12) * 100 + '%' });   // the gauge reads to 1.12
  const ml = h('b.br-ml', '0 ml');
  const gauge = h('div.br-gauge', h('i.br-bloomband', { style: mark(...BLOOM) }, h('span.br-tag', t('Bloom'))),
    h('i.br-fullband', { style: mark(...FULL) }, h('span.br-tag', t('Full'))), h('i.br-level'), ml);
  const stage = h('div.br-stage', grinder, ring, dripper, bedBox, guide, tip, stream, splash, kettle);
  const root = h('div#brew', h('div.br-head', step, say), h('div.br-body', stage, gauge));
  document.body.appendChild(root);
  const held = game.hold;
  game.hold = true;
  audio.unlock();

  const level = gauge.querySelector('.br-level');
  const doneArc = ring.querySelector('.br-done');
  const r = { bloom: 0, wait: 0, water: 0, inRing: 1, spilled: false };
  let phase = 'grind', water = 0, finger = null, pouring = false, last = performance.now();
  let turned = 0, lastAng = null, bloomAt = 0, ringT = 0, pourT = 0, sfxT = 0, gAng = -Math.PI / 2;

  const show = (n, text) => { step.textContent = n; say.textContent = text; };
  const at = (e) => { const b = stage.getBoundingClientRect(); return { x: (e.clientX - b.left) / b.width, y: (e.clientY - b.top) / b.height }; };
  const setLevel = () => {
    level.style.height = Math.min(water, 1.12) / 1.12 * 100 + '%';
    ml.textContent = Math.round(water * CUP_ML) + ' ml';
    pool.style.opacity = clamp((water - BLOOM[0]) / 0.5, 0, 0.92);
    pool.style.transform = `scale(${0.55 + 0.45 * clamp(water, 0, 1)})`;
    wet.style.opacity = clamp(water / BLOOM[0], 0, 1);
  };

  // ---------------- 1. grind
  show(t('1 / 3  Grind'), t('Draw circles round the grinder to turn it.'));
  root.classList.add('grind');

  const grind = (p) => {
    const ang = Math.atan2(p.y - 0.5, p.x - 0.5);
    if (lastAng != null) {
      let d = ang - lastAng;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      turned += Math.abs(d);
      grinder.style.rotate = (turned * 180 / Math.PI) + 'deg';
      doneArc.style.strokeDashoffset = 100 - clamp(turned / (TURNS * 2 * Math.PI), 0, 1) * 100;
      if ((sfxT += Math.abs(d)) > 0.5) { sfxT = 0; hiss(0.05, { vol: 0.08, freq: 2400, q: 2 }); }
    }
    lastAng = ang;
    if (turned >= TURNS * 2 * Math.PI) toBloom();
  };
  const toBloom = () => {
    phase = 'bloom';
    root.classList.remove('grind'); root.classList.add('pour');
    audio.play('pop');
    show(t('2 / 3  Bloom'), t('Hold to pour a little, up to Bloom on the gauge, then let go.'));
  };
  /** The dot to follow, at its place on the circle. */
  const putGuide = () => { guide.style.left = (0.5 + Math.cos(gAng) * GUIDE * BED) * 100 + '%'; guide.style.top = (0.5 + Math.sin(gAng) * GUIDE * BED) * 100 + '%'; };
  putGuide();

  // ---------------- 2. bloom, 3. pour
  const startPour = () => {   // from settle: the main pour starts
    if (phase !== 'bloom' && phase !== 'settle' && phase !== 'pour') return;
    tick(performance.now());   // the time before the press doesn't pour
    pouring = true;
  };
  const stopPour = () => {
    if (!pouring) return;
    tick(performance.now());   // the water poured since the last frame counts too
    pouring = false;
    if (phase === 'bloom' && water > 0.02) {
      r.bloom = water;
      phase = 'settle';
      bloomAt = performance.now();
      root.classList.add('blooming');
      show(t('2 / 3  Bloom'), t('The grounds swell and bubble. Wait till the bubbles settle, then pour again.'));
      setTimeout(() => {
        if (phase !== 'settle' && phase !== 'pour') return;
        root.classList.add('settled', 'circling');   // the dot comes up: where to start the main pour
        if (phase === 'settle') show(t('2 / 3  Bloom'), t('The bubbles have settled. Put the stream on the glowing dot and pour again.'));
      }, SETTLE[0] * 1000);
    } else if (phase === 'pour' && water >= FULL[0] * 0.5) finish();
  };
  const pourFrame = (dt) => {
    if (!pouring) return;
    if (phase === 'settle') {   // pouring again: the bloom is over, however long it had
      r.wait = (performance.now() - bloomAt) / 1000;
      phase = 'pour';
      root.classList.remove('blooming');
      root.classList.add('circling');
      show(t('3 / 3  Pour'), t('Keep the stream on the dot as it circles. Let go at Full.'));
    }
    water += dt / FILL_S;
    setLevel();
    if (phase === 'pour' && finger) {
      // the dot goes round while you pour; the stream should be on it (so: on the ring, and circling)
      gAng += (dt * 2 * Math.PI) / LAP;
      putGuide();
      const gx = 0.5 + Math.cos(gAng) * GUIDE * BED, gy = 0.5 + Math.sin(gAng) * GUIDE * BED;
      const near = Math.hypot(finger.x - gx, finger.y - gy) / BED <= NEAR;
      const d = Math.hypot(finger.x - 0.5, finger.y - 0.5) / BED;
      pourT += dt;
      if (near) ringT += dt;
      root.classList.toggle('near', near);
      root.classList.toggle('off', !near);
      tip.textContent = near ? '' : d < RING[0] ? t('Too close to the middle') : d > RING[1] ? t('That is the paper') : t('Follow the dot');
    }
    if ((sfxT += dt) > 0.12) { sfxT = 0; hiss(0.16, { vol: 0.05, freq: 700, q: 0.6, type: 'lowpass' }); }
    if (water >= SPILL) { r.spilled = true; root.classList.add('spilt'); finish(); }
  };

  /** The kettle over the finger (its spout a stream's length above it), the stream and the splash where it lands. */
  const place = () => {
    const p = finger || { x: 0.74, y: 0.3 };   // no finger: the kettle waits up to the right
    for (const el of [kettle, stream, splash]) { el.style.left = p.x * 100 + '%'; el.style.top = p.y * 100 + '%'; }
    root.classList.toggle('pouring', pouring);
  };
  place();

  stage.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try { stage.setPointerCapture(e.pointerId); } catch { /* gone */ }
    finger = at(e);
    if (phase === 'grind') { lastAng = null; grind(finger); } else startPour();
    place();
  });
  stage.addEventListener('pointermove', (e) => {
    if (!finger && e.pointerType !== 'mouse') return;
    const p = at(e);
    if (phase === 'grind') { if (e.buttons || e.pointerType !== 'mouse') grind(p); return; }
    finger = p; place();
  });
  const up = () => { if (phase === 'grind') lastAng = null; stopPour(); if (phase !== 'grind') finger = null; place(); };
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', up);

  // by the clock, not by frames: a phone that drops frames pours as much water in a second as one that doesn't
  let raf = 0;
  function tick(now) { const dt = Math.min(0.5, Math.max(0, (now - last) / 1000)); last = now; pourFrame(dt); }
  const loop = (now) => { tick(performance.now()); raf = requestAnimationFrame(loop); };
  raf = requestAnimationFrame(loop);

  // ---------------- the cup
  let resolve;
  const result = new Promise((res) => { resolve = res; });
  function finish() {
    if (phase === 'done') return;
    phase = 'done'; pouring = false;
    cancelAnimationFrame(raf);
    r.water = water;
    r.inRing = pourT ? ringT / pourT : 0;
    if (!r.wait) r.wait = (performance.now() - bloomAt) / 1000;
    const res = scoreBrew(r);
    root.classList.remove('pouring', 'near', 'off', 'circling');
    root.classList.add('drawdown');
    setTimeout(() => serve(res), still ? 0 : 1200);
  }
  const VERDICT = {
    balanced: () => t('Sweet and clear. Just right.'),
    sour: () => t('A bit sour: the bloom was cut short, or the cup was poured thin.'),
    bitter: () => t('A bit bitter: it sat too long, or the water ran over.'),
    uneven: () => t('Uneven: the stream kept losing the dot. Follow it round, slow and steady.'),
  };
  function serve(res) {
    audio.play(res.score >= 80 ? 'levelup' : 'serve');
    const cup = h('div.br-cup', h('i.br-cup-glow', { style: { opacity: res.score / 100 } }), h('i.br-cup-img'));
    const card = h('div.br-result',
      cup,
      h('div.br-score', h('b', res.score), h('span', t('% colour back'))),
      h('div.br-verdict', VERDICT[res.verdict]()),
      h('button.btn.primary', { onclick: () => close(res) }, opts.guest ? t('Hand it to {name}', { name: opts.guest }) : t('Serve')));
    root.appendChild(card);
    root.classList.add('served');
  }
  function close(res) {
    game.hold = held;
    const a = root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: still ? 1 : 300, fill: 'forwards' });
    a.finished.catch(() => {}).then(() => root.remove());
    resolve({ score: res.score, verdict: res.verdict });
  }
  return result;
}
