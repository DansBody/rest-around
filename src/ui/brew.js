// Hand brewing at the cart (opening-premise): every cup in the cart stage is a pour-over the player makes, in the
// prologue's real-photo collage (a scale, the colourist's bag of beans, a top-down grinder and dripper, a hand with a
// gooseneck kettle, a takeaway cup). Four steps, about twenty-five seconds, one finger:
//   dose   hold to tip the bag: beans pour onto the scale, faster the longer you hold, and the last few are still
//          falling when you let go, so stop a little short of the dose; a scoop takes a few back out;
//   grind  draw circles round the grinder: it turns with the finger, three turns grind a dose;
//   bloom  hold to pour a little, into the bloom band of the gauge; the grounds swell and bubble, wait till they settle;
//   pour   hold, and keep the stream on a glowing dot that circles the ring (between the middle and the paper; it only
//          moves while you pour), up to Full on the gauge, without running over.
// The scale reads the water in grams from then on. The result is how much colour comes back into the guest (0-100)
// and why it fell short (sour, bitter, uneven, with the one thing that cost the most), which
// the cart turns into the tip and the colour the guest walks off in. A tap-free prototype opener: debug menu, ?brew.
import { h } from '../util.js';
import { t } from '../i18n.js';
import { audio } from '../audio.js';

const DOSE = 15, DOSE_OK = 0.5;        // grams of beans for a cup (1:16), and how far off still counts as right
const BEAN_RATE = [4, 10], RAMP = 1.2; // g/s as the bag tips (from the press to RAMP seconds in)
const LAG = 0.15;                      // seconds of beans still in the air when you let go
const SCOOP = 0.6;                     // grams the scoop takes back out
const BOWL_MAX = 30;                   // grams the bowl holds
const TURNS = 3;                       // grinder turns to a dose
const BLOOM = [0.12, 0.22];            // the bloom band on the water gauge (of a full cup)
const FULL = [0.86, 1];                // the cup's line
const SPILL = 1.08;                    // past this the dripper runs over
const FILL_S = 6.5;                    // seconds of pouring from empty to full
const SETTLE = [2.6, 7];               // seconds the bloom wants: less is sour, much more goes bitter
const RING = [0.28, 0.78];             // where the stream should land, as a fraction of the coffee bed's radius
const BED = 0.237;                     // the coffee bed's radius, of the stage's width (brew.css puts the dripper so)
const BOWL = { x: 0.483, y: 0.496, r: 0.148 };   // the bowl on the scale, of the stage (brew.css puts the scale so)
const MOUTH = { x: 0.52, y: 0.32 };    // where beans leave the bag (brew.css puts the bag so)
const GUIDE = 0.53, LAP = 3.4, NEAR = 0.34;   // the dot: its circle (of BED), seconds a lap, how close counts (of BED)
const CUP_G = DOSE * 16;               // what Full is on the scale, in grams of water (240)
/** The bloom and the pour, shared with the 3D counter (ui/brew3d.js) so both score a cup the same way. */
export const POUR = { DOSE, BLOOM, FULL, SPILL, FILL_S, SETTLE, RING, GUIDE, LAP, NEAR, CUP_G };
export const DOSING = { DOSE_OK, BEAN_RATE, RAMP, LAG, SCOOP, BOWL_MAX, TURNS };
// The grind (the 3D counter sets it on the grinder's ring) and the brew's clock: from the first drop of the bloom to the
// last drip through the paper, in brew seconds (the counter's clock runs CLOCK times the real one while you pour).
// A finer grind holds the water back: each click finer drips STEP times longer, so the total lands in TIME at BEST.
const GRIND = { MIN: 1, MAX: 10, BEST: 6 };
const TIME = [150, 180];               // 2:30-3:00: faster is sour (too coarse), slower is bitter (too fine)
const CLOCK = 10;                      // brew seconds a real second, from the bloom to the end of the pour
const DRAW = 75, STEP = 1.42;         // brew seconds the last of the water takes to drip through at BEST, and per click
const POUR_END = 90;                   // where the clock usually stands as the pour ends (a 3.5 s bloom, then up to Full)
/** Brew seconds the water still standing in the cone takes to drip through, at this grind. */
export const drawdownS = (grind) => DRAW * STEP ** (GRIND.BEST - grind);
/** How fast the cone drains at this grind, of how fast it does at BEST. */
export const flowAt = (grind) => clamp(STEP ** (grind - GRIND.BEST), 0.25, 3);
export const GRINDING = { ...GRIND, TIME, CLOCK };
/** m:ss */
export const clock = (sec) => { const s = Math.max(0, Math.round(sec)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
/**
 * The recipe, as the card on the brew screen and the colourist's note in the prologue both give it. The lines are
 * English source strings; recipeText() fills them in, in the player's language.
 */
export const RECIPE = {
  dose: DOSE, water: CUP_G, grind: GRIND.BEST, time: TIME, bloom: Math.round((BLOOM[0] + BLOOM[1]) / 2 * CUP_G / 5) * 5,
  title: 'Recipe',
  lines: ['{dose} g of beans, ground at {grind}', '{water} g of water', 'Bloom first: about {bloom} g, and wait for the bubbles to settle',
    'Then pour in slow circles, and let it drip through in {time}'],
  quote: 'Don\'t hurry the water. Let it bloom, and the colour comes up on its own.',
  by: 'the colourist',
};
/** The recipe in the player's language: { title, lines, quote, by }. */
export function recipeText() {
  const v = { dose: RECIPE.dose, water: RECIPE.water, grind: RECIPE.grind, bloom: RECIPE.bloom, time: clock(TIME[0]) + '–' + clock(TIME[1]) };
  return { title: t(RECIPE.title), lines: RECIPE.lines.map((l) => t(l, v)), quote: t(RECIPE.quote), by: t(RECIPE.by) };
}
const quiet = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
/** A burst of noise (the grinder's crunch, the kettle's trickle), only when sound is on. */
function hiss(dur, o) { if (audio.enabled && audio.ctx && audio.ctx.state === 'running') try { audio.noise(dur, o); } catch { /* no sound */ } }

/** What each thing that can go wrong tastes like. */
const TASTE = { many: 'sour', few: 'bitter', bloom: 'sour', short: 'sour', long: 'bitter', uneven: 'uneven', thin: 'sour', over: 'bitter', coarse: 'sour', fine: 'bitter' };

/**
 * What the cup comes to, from what happened while it was made: { score, verdict, why, pen }.
 * r.time (brew seconds, bloom to last drip) or else r.grind scores the grind; without either (the sticker version) it isn't.
 */
export function scoreBrew(r) {
  const pen = { many: 0, few: 0, bloom: 0, short: 0, long: 0, uneven: 0, thin: 0, over: 0, coarse: 0, fine: 0 };
  // the grind, by how long the cup took to drip through: too fast is under-drawn (sour), too slow over-drawn (bitter)
  const time = r.time ?? (r.grind != null ? POUR_END + drawdownS(r.grind) : null);
  if (time != null && time < TIME[0]) pen.coarse += clamp((TIME[0] - time) / 45, 0, 1) * 30;
  else if (time != null && time > TIME[1]) pen.fine += clamp((time - TIME[1]) / 60, 0, 1) * 30;
  // the dose: too many beans for the water can't all be drawn out (sour), too few are drawn out too far (bitter, thin)
  const dose = r.dose ?? DOSE;
  if (dose > DOSE + DOSE_OK) pen.many += clamp((dose - DOSE - DOSE_OK) / 3, 0, 1) * 18;
  else if (dose < DOSE - DOSE_OK) pen.few += clamp((DOSE - DOSE_OK - dose) / 3, 0, 1) * 18;
  // bloom: too little or too much water, then too short a wait (sour) or far too long (bitter)
  const bl = r.bloom < BLOOM[0] ? (BLOOM[0] - r.bloom) / BLOOM[0] : r.bloom > BLOOM[1] ? (r.bloom - BLOOM[1]) / BLOOM[1] : 0;
  pen.bloom += clamp(bl, 0, 1) * 12;
  if (r.wait < SETTLE[0]) pen.short += (1 - r.wait / SETTLE[0]) * 22;
  else if (r.wait > SETTLE[1]) pen.long += clamp((r.wait - SETTLE[1]) / 8, 0, 1) * 12;
  // the pour: the stream off the circling dot (through the middle, onto the paper, or left behind)
  pen.uneven += (1 - r.inRing) * 40;
  // the water: short of the line is thin and sour, running over is bitter
  if (r.water < FULL[0]) pen.thin += clamp((FULL[0] - r.water) / 0.4, 0, 1) * 24;
  if (r.spilled) pen.over += 18;
  else if (r.water > FULL[1]) pen.over += clamp((r.water - FULL[1]) / (SPILL - FULL[1]), 0, 1) * 10;
  const lost = Object.values(pen).reduce((a, b) => a + b, 0);
  const score = Math.round(clamp(100 - lost, 5, 100));
  const worst = Object.entries(pen).sort((a, b) => b[1] - a[1])[0];
  const good = score >= 88 || worst[1] < 6;   // a good cup is just good
  return { score, verdict: good ? 'balanced' : TASTE[worst[0]], why: good ? 'balanced' : worst[0], pen };
}

/** What the guest says about the cup, by the one thing that cost it the most (scoreBrew's `why`). */
export function verdictLine(why, dose, time) {
  switch (why) {
    case 'fine': return t('Dripped for {time}: too bitter. Ground too fine; set the grind coarser next time.', { time: clock(time) });
    case 'coarse': return t('Dripped for {time}: too sour. Ground too coarse; set the grind finer next time.', { time: clock(time) });
    case 'many': return t('A bit sour: too many beans for the water ({g} g). Aim for {n} g.', { g: dose, n: DOSE });
    case 'few': return t('A bit bitter and thin: too few beans ({g} g). Aim for {n} g.', { g: dose, n: DOSE });
    case 'bloom': return t('A bit sour: the bloom took too little or too much water.');
    case 'short': return t('A bit sour: the bloom was cut short. Wait for the bubbles to settle.');
    case 'long': return t('A bit bitter: the bloom sat too long.');
    case 'uneven': return t('Uneven: the stream kept losing the dot. Follow it round, slow and steady.');
    case 'thin': return t('A bit sour: the cup was poured thin. Pour up to Full.');
    case 'over': return t('A bit bitter: the water ran over.');
    default: return t('Sweet and clear. Just right.');
  }
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
  // the dose: a scale with a bowl on it, the pile growing in the bowl, the bag tipping over it, grams in its window
  const scale = h('i.br-scale'), pile = h('i.br-pile'), lcd = h('b.br-lcd', '0.0'), bag = h('i.br-bag');
  const scoop = h('button.btn', { onclick: () => scoopOut() }, t('Scoop a little out'));
  const doseDone = h('button.btn.primary', { disabled: true, onclick: () => toGrind() }, t('Into the grinder'));
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
  const ml = h('b.br-ml', '0 g');
  const gauge = h('div.br-gauge', h('i.br-bloomband', { style: mark(...BLOOM) }, h('span.br-tag', t('Bloom'))),
    h('i.br-fullband', { style: mark(...FULL) }, h('span.br-tag', t('Full'))), h('i.br-level'), ml);
  const stage = h('div.br-stage', scale, pile, lcd, bag, grinder, ring, dripper, bedBox, guide, tip, stream, splash, kettle);
  const root = h('div#brew', h('div.br-head', step, say), h('div.br-body', stage, gauge), h('div.br-dosebtns', scoop, doseDone));
  document.body.appendChild(root);
  const held = game.hold;
  game.hold = true;
  audio.unlock();

  const level = gauge.querySelector('.br-level');
  const doneArc = ring.querySelector('.br-done');
  const r = { dose: 0, bloom: 0, wait: 0, water: 0, inRing: 1, spilled: false };
  let phase = 'dose', water = 0, finger = null, pouring = false, last = performance.now();
  let tipping = false, tipT = 0, poured = 0, dose = 0, beanT = 0;   // poured: out of the bag; dose: landed on the scale
  let turned = 0, lastAng = null, bloomAt = 0, ringT = 0, pourT = 0, sfxT = 0, gAng = -Math.PI / 2;

  const show = (n, text) => { step.textContent = n; say.textContent = text; };
  const at = (e) => { const b = stage.getBoundingClientRect(); return { x: (e.clientX - b.left) / b.width, y: (e.clientY - b.top) / b.height }; };
  const setLevel = () => {
    level.style.height = Math.min(water, 1.12) / 1.12 * 100 + '%';
    ml.textContent = Math.round(water * CUP_G) + ' g';
    pool.style.opacity = clamp((water - BLOOM[0]) / 0.5, 0, 0.92);
    pool.style.transform = `scale(${0.55 + 0.45 * clamp(water, 0, 1)})`;
    wet.style.opacity = clamp(water / BLOOM[0], 0, 1);
  };

  // ---------------- 1. dose
  show(t('1 / 4  Beans'), t('Hold to tip the bag onto the scale, {g} g. Let go a little early: the last beans are still falling.', { g: DOSE }));
  root.classList.add('dose');

  const setDose = () => {
    lcd.textContent = dose.toFixed(1);
    lcd.classList.toggle('ok', Math.abs(dose - DOSE) <= DOSE_OK);
    pile.style.opacity = clamp(dose / 1.5, 0, 1);
    pile.style.transform = `translate(-50%, -50%) scale(${0.3 + 0.7 * clamp(dose / DOSE, 0, 1.35)})`;
    doseDone.disabled = dose < 3;
  };
  /** One bean seen falling from the bag's mouth into the bowl (the grams are counted by the clock, not by these). */
  const dropBean = () => {
    if (still) return;
    const b = h('i.br-bean');
    stage.appendChild(b);
    const ox = (Math.random() - 0.5) * 0.05, ex = (Math.random() - 0.5) * BOWL.r, ey = (Math.random() - 0.5) * BOWL.r * 0.6;
    const spin = (Math.random() - 0.5) * 720;
    b.animate([
      { left: (MOUTH.x + ox) * 100 + '%', top: MOUTH.y * 100 + '%', rotate: '0deg' },
      { left: (BOWL.x + ex) * 100 + '%', top: (BOWL.y + ey) * 100 + '%', rotate: spin + 'deg' },
    ], { duration: LAG * 1000 * 2, easing: 'cubic-bezier(.45,0,.9,.6)' }).finished.catch(() => {}).then(() => b.remove());
  };
  /** The bag tips while held, faster the longer; what has left it lands LAG seconds later. */
  const doseFrame = (dt) => {
    if (phase !== 'dose') return;
    if (tipping) {
      tipT += dt;
      const rate = BEAN_RATE[0] + (BEAN_RATE[1] - BEAN_RATE[0]) * clamp(tipT / RAMP, 0, 1);
      const out = Math.min(rate * dt * (0.8 + 0.4 * Math.random()), BOWL_MAX - poured);   // in clumps, till the bowl is full
      poured += out;
      if ((beanT += out) > 0.45) { beanT = 0; dropBean(); }
      if ((sfxT += dt) > 0.09) { sfxT = 0; hiss(0.04, { vol: 0.05, freq: 3200, q: 3 }); }
    }
    if (poured - dose < 0.01) { dose = poured; return; }
    dose += (poured - dose) * (1 - Math.exp(-dt / LAG));   // at full tilt about 1.5 g is still in the air
    setDose();
  };
  const startTip = () => { tipping = true; tipT = 0; root.classList.add('tipping'); };
  const stopTip = () => { if (!tipping) return; tick(performance.now()); tipping = false; root.classList.remove('tipping'); };
  function scoopOut() {
    if (phase !== 'dose' || dose <= 0) return;
    poured = Math.max(0, poured - SCOOP); dose = Math.min(dose, poured);
    setDose();
    hiss(0.08, { vol: 0.05, freq: 1800, q: 1.5 });
  }
  function toGrind() {
    if (phase !== 'dose') return;
    tipping = false;
    dose = poured; r.dose = Math.round(dose * 10) / 10;
    setDose();
    phase = 'grind';
    root.classList.remove('dose', 'tipping'); root.classList.add('grind');
    audio.play('pop');
    show(t('2 / 4  Grind'), t('Draw circles round the grinder to turn it.'));
  }

  // ---------------- 2. grind
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
    show(t('3 / 4  Bloom'), t('Hold to pour a little, up to Bloom on the gauge, then let go.'));
  };
  /** The dot to follow, at its place on the circle. */
  const putGuide = () => { guide.style.left = (0.5 + Math.cos(gAng) * GUIDE * BED) * 100 + '%'; guide.style.top = (0.5 + Math.sin(gAng) * GUIDE * BED) * 100 + '%'; };
  putGuide();

  // ---------------- 3. bloom, 4. pour
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
      show(t('3 / 4  Bloom'), t('The grounds swell and bubble. Wait till the bubbles settle, then pour again.'));
      setTimeout(() => {
        if (phase !== 'settle' && phase !== 'pour') return;
        root.classList.add('settled', 'circling');   // the dot comes up: where to start the main pour
        if (phase === 'settle') show(t('3 / 4  Bloom'), t('The bubbles have settled. Put the stream on the glowing dot and pour again.'));
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
      show(t('4 / 4  Pour'), t('Keep the stream on the dot as it circles. Let go at Full.'));
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
    if (phase === 'dose') startTip();
    else if (phase === 'grind') { lastAng = null; grind(finger); } else startPour();
    place();
  });
  stage.addEventListener('pointermove', (e) => {
    if (!finger && e.pointerType !== 'mouse') return;
    const p = at(e);
    if (phase === 'dose') return;
    if (phase === 'grind') { if (e.buttons || e.pointerType !== 'mouse') grind(p); return; }
    finger = p; place();
  });
  const up = () => { stopTip(); if (phase === 'grind') lastAng = null; stopPour(); if (phase !== 'grind') finger = null; place(); };
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', up);

  // by the clock, not by frames: a phone that drops frames pours as much water in a second as one that doesn't
  let raf = 0;
  function tick(now) { const dt = Math.min(0.5, Math.max(0, (now - last) / 1000)); last = now; doseFrame(dt); pourFrame(dt); }
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
  function serve(res) {
    audio.play(res.score >= 80 ? 'levelup' : 'serve');
    const cup = h('div.br-cup', h('i.br-cup-glow', { style: { opacity: res.score / 100 } }), h('i.br-cup-img'));
    const card = h('div.br-result',
      cup,
      h('div.br-score', h('b', res.score), h('span', t('% colour back'))),
      h('div.br-verdict', verdictLine(res.why, r.dose)),
      h('button.btn.primary', { onclick: () => close(res) }, opts.guest ? t('Hand it to {name}', { name: opts.guest }) : t('Serve')));
    root.appendChild(card);
    root.classList.add('served');
  }
  function close(res) {
    game.hold = held;
    const a = root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: still ? 1 : 300, fill: 'forwards' });
    a.finished.catch(() => {}).then(() => root.remove());
    resolve({ score: res.score, verdict: res.verdict, why: res.why, dose: r.dose });
  }
  return result;
}
