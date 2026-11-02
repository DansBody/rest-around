// The prologue (opening-premise, design/prologue/OPENING_PLAN.md): a newcomer steps off the last bus into a city with no
// colour. Under the street lamp stands an old cart under a canvas sheet, and beside it a figure (the city's first
// colourist, never named here) who brewed the last cup of colour on it. Drinking it brings the street's colour back,
// faded; a puddle shows the newcomer to themselves; the colourist says "Refill it." and leaves a palette: a centre
// well with a little colour left and eight empty wells, one per street lot (street.js, palette.js). It pulls the sheet
// off the cart (bare: its things are scattered round the lot, opening.js), leaves a note with the recipe and walks off
// into the rain; a paintbrush takes the centre well's last colour to the cart, brushes the awning and the body blue
// again and signs the board with the name. Then the opening on the lot (opening.js) and the tour.
// Staged in 2D over the café as Refillit OS collage: the grey halftone street, real objects as stickers, the colourist
// as the one denim cut-out. All of it black and white until the cup is drunk; then the street fills in with faded
// colour, but the cart stays grey till the centre well reaches it. A tap moves the story on (and finishes a line still
// typing); Skip ends it at once. Seen once per browser (localStorage): a reload before there is a partner goes
// straight to the opening, and Reset game (panels.js) forgets it, so a new café starts with the story again.
import { h } from '../util.js';
import { t } from '../i18n.js';
import { audio } from '../audio.js';
import { RECIPE } from './brew.js';

const SEEN = 'refillit.prologue';
export function prologueSeen() { try { return localStorage.getItem(SEEN) === '1'; } catch { return false; } }
export function markSeen() { try { localStorage.setItem(SEEN, '1'); } catch { /* private mode: it just plays again */ } }
/** A reset café starts from the story again. */
export function forgetPrologue() { try { localStorage.removeItem(SEEN); } catch { /* nothing kept */ } }

const quiet = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const OUT = 'cubic-bezier(.2,.8,.3,1)', IN = 'cubic-bezier(.6,0,.8,.3)';
const TYPE_MS = 45;   // per character of a line
const STOP = Symbol('skipped');

/** The note the colourist leaves on the counter: the first recipe (brew.js RECIPE: the hand brew's card says the same). */
export function noteSticker() {
  return h('div.pr-note', h('div.pr-note-in',
    h('p.pr-note-row', h('b', t('Beans')), h('span', `${RECIPE.dose} g`)),
    h('p.pr-note-row', h('b', t('Water')), h('span', `${RECIPE.water} g`)),
    h('p', t('Bloom first: a splash of water, wait for the bubbles to settle, then pour the rest in slow circles.')),
    h('p.pr-note-sign', t('Brew it for whoever comes in out of the rain.'))));
}

/**
 * The newcomer, seen for the first time in the puddle: pick who they are and how they look.
 * TODO paper-doll: open the paper-doll screen here (it replaces panels.js coatPicker) and resolve with the look
 * picked, so the reflection can show it. Until it exists nothing is picked and the reflection stays a blur of colour.
 * @returns {Promise<object|null>} the look picked, or null
 */
async function dressSelf(game) { void game; return null; }

/**
 * The collage stage the prologue is played on, and the opening's lines over the café (opening.js, '.over3d'): a full-screen #prologue over the café
 * with the line at the foot, Skip and (when nothing has unlocked sound yet) Tap to begin. Its helpers throw STOP once
 * Skip is pressed, so a story written with them simply stops there.
 * @param pieces  what to put on the stage, back to front (the line and Skip go on top)
 * @param cls     the stage's own classes ('.bw' starts it black and white)
 */
export function collageStage(game, pieces, cls = '') {
  const still = quiet();
  const who = h('b.pr-who');
  const text = h('span.pr-text');
  const more = h('i.pr-more', '▼');
  const line = h('div.pr-line', who, text, more);
  const nudge = h('i.pr-nudge', '▼');   // a beat with no words: just this, asking for the tap
  const skip = h('button.pr-skip', t('Skip'));
  // the browser only plays sound after a tap: when nothing has had one yet, the story starts with one
  const start = audio.ctx && audio.ctx.state === 'running' ? null : h('div.pr-start', h('span', t('Tap to begin')));
  const root = h('div#prologue' + cls, pieces, line, nudge, skip, start);
  document.body.appendChild(root);
  const held = game.hold;
  game.hold = true;

  let skipped = false, wake = null, onSkip;
  const skipP = new Promise((res) => { onSkip = res; });
  const guard = (p) => Promise.race([p, skipP]).then((v) => { if (skipped) throw STOP; return v; });
  const tap = () => guard(new Promise((res) => { wake = res; }));
  const wait = (ms) => guard(new Promise((res) => setTimeout(res, still ? Math.min(ms, 200) : ms)));
  const anim = (el, frames, o) => el.animate(frames, { fill: 'both', easing: OUT, ...o, duration: still ? 1 : o.duration, delay: still ? 0 : o.delay || 0 });
  const done = (a) => guard(a.finished);
  root.addEventListener('pointerdown', () => audio.unlock());   // a tap is what lets the browser play the rain
  root.addEventListener('click', (e) => { if (e.target === skip) return; if (wake) { const w = wake; wake = null; w(); } });
  skip.addEventListener('click', () => { skipped = true; onSkip(); });
  /** Where an element's point (fractions of its box) is on the screen. */
  const at = (el, fx = 0.5, fy = 0.5) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width * fx, y: r.top + r.height * fy }; };

  /** A line at the foot: who says it (null: narration), typed out; a tap finishes it, the next tap moves on. */
  async function say(words, speaker = null) {
    who.textContent = speaker || '';
    line.classList.toggle('narr', !speaker);
    line.classList.add('show');
    more.style.visibility = 'hidden';
    const chars = [...words];
    let n = still ? chars.length : 0, typing;
    text.textContent = chars.slice(0, n).join('');
    const full = () => { clearInterval(typing); n = chars.length; text.textContent = words; };
    if (n < chars.length) {
      const typed = new Promise((res) => {
        typing = setInterval(() => { n++; text.textContent = chars.slice(0, n).join(''); if (n >= chars.length) { clearInterval(typing); res(); } }, TYPE_MS);
      });
      await Promise.race([typed, tap()]).finally(full);
    }
    more.style.visibility = 'visible';
    await tap();
    line.classList.remove('show');
  }
  /** A moment with no words: the picture holds till a tap (after a while a ▼ in the corner asks for it). */
  async function beat() {
    const show = setTimeout(() => nudge.classList.add('on'), still ? 0 : 1400);
    try { await tap(); } finally { clearTimeout(show); nudge.classList.remove('on'); }
  }
  /** The tap that lets the rain play, if one is needed. */
  async function begin() {
    if (!start) return;
    await tap();
    await guard(start.animate([{ opacity: 1 }, { opacity: 0 }], { duration: still ? 1 : 500, fill: 'forwards' }).finished);
    start.remove();
  }
  /** Run `story` on the stage; once it is over (or skipped) the stage fades out and the game goes on. */
  function run(story) {
    return story().catch((e) => { if (e !== STOP) console.warn('Story', e); }).then(async () => {
      game.hold = held;
      const a = root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: still ? 1 : 500, fill: 'forwards' });
      await a.finished.catch(() => {});
      root.remove();
    });
  }
  return { root, still, guard, tap, wait, anim, done, at, say, beat, begin, run, get skipped() { return skipped; } };
}

/**
 * Someone walks off down the street into the rain: a few steps away from us, smaller and fainter with each one, toward
 * where the street meets the dark (fx, fy of the screen), till the rain has them; then the street lamp flickers once.
 */
export async function walkAway(stage, el, street, fx = 0.43, fy = 0.5) {
  const r = el.getBoundingClientRect(), root = stage.root.getBoundingClientRect();
  const dx = root.width * fx - (r.left + r.width / 2), dy = root.height * fy - r.bottom;
  el.style.transformOrigin = '50% 100%';
  const at = (k, bob = 0) => `translate(${dx * k}px, ${dy * k - bob}px) scale(${1 - 0.86 * k})`;
  // a turn (the cut-out flips through its edge to show it going), then steps that bob and shrink
  await stage.done(stage.anim(el, [{ transform: 'none' }, { transform: 'scaleX(.06)', offset: 0.5 }, { transform: 'scaleX(-1)' }], { duration: 420, easing: 'ease-in-out' }));
  const steps = [];
  for (let i = 0; i <= 10; i++) { const k = i / 10, e = 1 - (1 - k) * (1 - k); steps.push({ transform: `${at(e, i % 2 ? 6 * (1 - k) : 0)} scaleX(-1)`, opacity: 1 - 0.95 * k ** 1.6, filter: `blur(${(k * 1.6).toFixed(2)}px)`, offset: k }); }
  await stage.done(stage.anim(el, steps, { duration: 3600, easing: 'linear' }));
  el.style.visibility = 'hidden';
  await stage.done(stage.anim(street, [{ filter: 'brightness(1)' }, { filter: 'brightness(.72)', offset: 0.18 }, { filter: 'brightness(1.04)', offset: 0.32 }, { filter: 'brightness(.85)', offset: 0.45 }, { filter: 'brightness(1)' }], { duration: 700, easing: 'steps(6, end)' }));
}

/**
 * Play the prologue over the game. Resolves when it is over (watched or skipped); the game is held meanwhile.
 * @param game the Game (held while the story plays)
 */
export function playPrologue(game) {
  const colour = h('i.pr-col');   // the same street in faded colour, under the halftone print
  const print = h('i.pr-ht');      // the grey halftone, which thins out as the colour comes in
  const paint = h('i.pr-paint');   // a real watercolour bloom spreading over it: the colour comes in where it has run
  const street = h('div.pr-street', colour, paint, print);
  const rain = h('div.pr-rain');
  // the old cart under the lamp: grey, under its sheet; the same photo in colour underneath, let in at the end
  const sign = h('i.pr-sign', { 'aria-label': 'Refillit' }, h('i.pr-letters'));   // the name, brushed on by hand once the colour reaches it
  const cartCol = h('i.pr-cart-col');
  const cover = h('i.pr-cover');
  const cart = h('div.pr-cart', h('i.pr-cart-grey'), cartCol, sign, cover);
  const tarp = h('div.pr-tarp');
  const figure = h('div.pr-figure');
  // the cup's steam: a real wisp of steam (a see-through halftone piece), a few copies rising in turn behind the arm
  const hand = h('div.pr-hand', h('div.pr-steam', [0, 1, 2].map((i) => h('i', { style: { '--i': i } }))), h('i.pr-arm'));
  // looking down: a shot of its own, nothing but the puddle; in it, rain rings, the lamp's shimmer and a blur of colour
  // that is you (the paper doll gives it a shape later)
  const self = h('i.pr-self');
  const puddle = h('div.pr-puddle', self, h('i.pr-sheen'), [0, 1, 2, 3, 4].map((i) => h('i.pr-ripple', { style: { '--i': i } })));
  const pal = h('div.pr-palette', h('i.pr-glow'));
  const brush = h('i.pr-brush');   // a real paintbrush: it takes the centre well's last colour to the cart
  const note = noteSticker();
  const title = h('div.pr-title');
  const stage = collageStage(game, [street, rain, cart, figure, tarp, hand, pal, note, title, brush, puddle], '.bw');   // black and white till the cup
  const { root, guard, wait, anim, done, at, say } = stage;
  audio.prefetch('night');   // the rainy set, decoded while the screen comes up
  audio.setScene('night', true);

  const story = async () => {
    const FIG = t('Someone under the lamp');
    await stage.begin();
    // 1. the last bus, rain, a grey street; the old cart under its sheet, under the lamp, from the first shot
    anim(street, [{ opacity: 0, transform: 'scale(1.18) translateX(-3%)' }, { opacity: 1, transform: 'scale(1.06) translateX(0)' }], { duration: 2600, easing: 'ease-out' });
    anim(cart, [{ opacity: 0, transform: 'translateX(-4%) scale(1.04)' }, { opacity: 1, transform: 'none' }], { duration: 2400, delay: 300, easing: 'ease-out' });
    anim(rain, [{ opacity: 0 }, { opacity: 1 }], { duration: 1800, delay: 400 });
    await wait(1400);
    title.textContent = t('This city has no colour.');
    anim(title, [{ transform: 'translate(-120%, 0) skewX(-8deg)' }, { transform: 'translate(4%, 0) skewX(-8deg)', offset: 0.75 }, { transform: 'translate(0, 0) skewX(-8deg)' }], { duration: 700 });
    await wait(700);
    await say(t('You came in on the last bus of the night. Everything here is the colour of rain.'));
    anim(title, [{ opacity: 1 }, { opacity: 0, transform: 'translate(0, -30px) skewX(-8deg)' }], { duration: 400, easing: IN });
    // 2. the figure under the lamp, beside the cart
    anim(street, [{ transform: 'scale(1.06)' }, { transform: 'scale(1.16) translateX(-6%)' }], { duration: 2400, easing: 'ease-in-out' });
    anim(figure, [{ opacity: 0, transform: 'translateX(30%) rotate(3deg)' }, { opacity: 1, transform: 'translateX(-2%) rotate(-1deg)', offset: 0.7 }, { opacity: 1, transform: 'none' }], { duration: 1100, delay: 900 });
    await wait(1900);
    await say(t('Oh. You can still see it, can\'t you? The colour.'), FIG);
    await say(t('Here. I brewed it on that old cart, the last cup I could make. Go on, while it\'s warm.'), FIG);
    // 3. the cup, held out, steaming
    anim(hand, [{ transform: 'translate(60%, -70%) rotate(8deg)' }, { transform: 'translate(-2%, 2%) rotate(-2deg)', offset: 0.8 }, { transform: 'none' }], { duration: 1200, easing: OUT });
    hand.classList.add('on');
    await wait(1300);
    await say(t('(Tap to drink.)'));
    // drinking: the cup comes up close, and a bloom of watercolour runs out from the middle of the view: where it has
    // spread, the street is in (faded) colour; the paint itself thins away as it goes. The cart stays grey.
    anim(hand, [{ transform: 'none', opacity: 1 }, { transform: 'translate(-10%, 10%) scale(2.2)', opacity: 0 }], { duration: 700, easing: IN });
    root.classList.add('drunk');
    root.classList.remove('bw');   // the colour comes in, and with it the colourist's own
    const RUN = { duration: 4500, delay: 350, easing: 'cubic-bezier(.5,.05,.35,1)' };   // a drop that gathers, runs, then slows
    const size = (k) => `${k}% auto`;
    const spread = anim(colour, [{ maskSize: size(3), webkitMaskSize: size(3) }, { maskSize: size(430), webkitMaskSize: size(430) }], RUN);
    anim(paint, [{ backgroundSize: size(3), opacity: 0.95 }, { opacity: 0.8, offset: 0.4 }, { backgroundSize: size(430), opacity: 0 }], RUN);
    anim(print, [{ opacity: 1 }, { opacity: 0.42 }], RUN);
    spread.finished.then(() => { spread.cancel(); colour.classList.add('full'); }).catch(() => {});   // no mask edge left over
    await wait(2200);
    await say(t('Warm, bitter, then sweet.'));
    // 4. looking down: the street tips away and the shot is the puddle alone, close up; in it, a blur of colour: you
    anim(street, [{ transform: 'scale(1.16) translateX(-6%)' }, { transform: 'scale(1.3) translate(-6%, -14%)' }], { duration: 900, easing: 'ease-in' });
    await wait(500);
    puddle.classList.add('on');
    await done(anim(puddle, [{ opacity: 0, transform: 'scale(1.14) translateY(-4%)' }, { opacity: 1, transform: 'none' }], { duration: 700 }));
    self.classList.add('on');
    await say(t('You look down. In a puddle at your feet, someone looks back at you: you, in colour.'));
    const look = await guard(dressSelf(game));   // TODO paper-doll: the reflection shows `look` once there is one
    if (look) self.classList.add('dressed');
    // and back up to the street, as it was (set back behind the puddle, so the cut is clean)
    anim(street, [{ transform: 'scale(1.16) translateX(-6%)' }, { transform: 'scale(1.16) translateX(-6%)' }], { duration: 1 });
    await done(anim(puddle, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(1.06) translateY(3%)' }], { duration: 600, easing: IN }));
    puddle.classList.remove('on');
    // 5. what happened to the colour; "Refill it." (the game's name: said as it is, in every language) and the palette
    await say(t('Every colour of mine was brewed, one cup at a time. Now my hands can\'t brew them any more.'), FIG);
    await say('Refill it.', FIG);
    anim(pal, [{ transform: 'translate(-50%, 120%) rotate(-30deg)' }, { transform: 'translate(-50%, -4%) rotate(4deg)', offset: 0.75 }, { transform: 'translate(-50%, 0) rotate(0)' }], { duration: 1000 });
    pal.classList.add('on');
    await wait(1100);
    await say(t('Eight corners to this street, and every one of them is still owed a cup. When they\'ve all had theirs, I\'ll come back.'), FIG);
    // the palette is yours now: it goes up in the corner, where you can keep an eye on its centre well
    {
      const r = pal.getBoundingClientRect(), k = Math.min(0.42, 130 / r.width);
      const dx = 16 + (r.width * k) / 2 - (r.left + r.width / 2), dy = 64 + (r.height * k) / 2 - (r.top + r.height / 2);
      await done(anim(pal, [{ transform: 'translate(-50%, 0) rotate(0)' }, { transform: `translate(calc(-50% + ${dx}px), ${dy}px) rotate(-8deg) scale(${k})` }], { duration: 800 }));
    }
    // 6. a pat on the old cart, and the sheet comes off: the cart itself, bare
    anim(figure, [{ transform: 'none' }, { transform: 'translateX(-9%) rotate(-5deg)', offset: 0.35 }, { transform: 'translateX(-6%) rotate(-3deg)', offset: 0.55 }, { transform: 'none' }], { duration: 1100, easing: 'ease-in-out' });
    await wait(380);
    for (let i = 0; i < 2; i++) await done(anim(cart, [{ transform: 'none' }, { transform: 'rotate(-0.8deg) translateY(-1%)' }, { transform: 'none' }], { duration: 220, easing: 'ease-out' }));
    await wait(350);
    tarp.classList.add('on');
    {
      const c = cart.getBoundingClientRect();
      Object.assign(tarp.style, { left: `${c.left + c.width * 0.08}px`, top: `${c.top - c.height * 0.02}px`, width: `${c.width * 0.98}px` });
    }
    cover.style.visibility = 'hidden';
    await done(anim(tarp, [{ transform: 'none', opacity: 1 }, { transform: 'translate(30%, -40%) rotate(14deg) scale(1.05)', opacity: 1, offset: 0.55 }, { transform: 'translate(90%, -110%) rotate(32deg) scale(.9)', opacity: 0 }], { duration: 1100, easing: 'cubic-bezier(.3,.1,.4,1)' }));
    tarp.classList.remove('on');
    await say(t('Its things are scattered about. Not many beans, but enough for a few cups.'), FIG);
    // 7. a note, left on the counter; then the colourist walks off into the rain
    note.classList.add('on');
    await done(anim(note, [{ transform: 'translate(-50%, -50%) scale(1.5) rotate(10deg)', opacity: 0 }, { transform: 'translate(-50%, -50%) scale(.96) rotate(-5deg)', opacity: 1, offset: 0.7 }, { transform: 'translate(-50%, -50%) rotate(-4deg)', opacity: 1 }], { duration: 600 }));
    await say(t('(They leave you a note, in a careful hand.)'));
    {
      const n = note.getBoundingClientRect(), to = at(cart, 0.3, 0.5), k = Math.min(0.24, 70 / n.width);
      const dx = to.x - (n.left + n.width / 2), dy = to.y - (n.top + n.height / 2);
      await done(anim(note, [{ transform: 'translate(-50%, -50%) rotate(-4deg)' }, { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(-14deg) scale(${k})` }], { duration: 700, easing: IN }));
    }
    await walkAway(stage, figure, street);
    // 8. a paintbrush takes the centre well's last colour to the cart: it dips into the well (which goes empty), and
    // brushes the awning stroke by stroke, then the body and the wheels, each stroke a real one (the colour comes in
    // where the paint has gone); the last gaps fill in, and it signs the board with the name, left to right
    pal.classList.add('centre');
    await say(t('The centre well still holds a little colour. Enough for one small café.'));
    {
      const BR = brush.getBoundingClientRect(), TIP = { x: 0.03 * BR.width, y: 0.97 * BR.height };   // the bristles' tip in the picture
      const tipAt = (q, rot = 0) => `translate(${q.x - TIP.x}px, ${q.y - TIP.y}px) rotate(${rot}deg)`;
      const C = cart.getBoundingClientRect(), R = root.getBoundingClientRect();
      const P = (fx, fy) => ({ x: C.left - R.left + C.width * fx, y: C.top - R.top + C.height * fy });
      const swish = (dur) => { if (audio.enabled && audio.ctx && audio.ctx.state === 'running') try { audio.noise(dur, { vol: 0.05, freq: 900, q: 0.6, type: 'lowpass' }); } catch { /* no sound */ } };
      // in from the top, to the well; a dip, a little stir, and up: the well is empty now
      const well = at(pal), off = { x: well.x + 60, y: -BR.height };
      brush.classList.add('on');
      await done(anim(brush, [{ transform: tipAt(off, 18) }, { transform: tipAt({ x: well.x, y: well.y - 24 }, 4) }], { duration: 700 }));
      await done(anim(brush, [{ transform: tipAt({ x: well.x, y: well.y - 24 }, 4) }, { transform: tipAt(well, 0), offset: 0.3 }, { transform: tipAt({ x: well.x - 5, y: well.y + 2 }, -6), offset: 0.5 },
        { transform: tipAt({ x: well.x + 5, y: well.y }, 6), offset: 0.7 }, { transform: tipAt({ x: well.x, y: well.y - 30 }, 2) }], { duration: 900, easing: 'ease-in-out' }));
      pal.classList.remove('centre'); pal.classList.add('spent');
      // the strokes: [stroke image, left, top, width, height] as fractions of the cart picture
      const STROKES = [[1, 0.1, 0.08, 0.9, 0.15], [3, 0.11, 0.17, 0.89, 0.14], [2, 0.12, 0.24, 0.88, 0.13], [4, -0.01, 0.43, 0.98, 0.24], [2, 0.03, 0.6, 0.94, 0.4]];
      let from = { x: well.x, y: well.y - 30 };
      for (const [n, fx, fy, fw, fh] of STROKES) {
        const a = P(fx - fw * 0.15, fy + fh / 2), b = P(fx + fw * 1.15, fy + fh / 2);
        await done(anim(brush, [{ transform: tipAt(from, 2) }, { transform: tipAt(a, -6) }], { duration: 380, easing: 'ease-in-out' }));
        const el = h('i.pr-stroke', { style: { left: fx * 100 + '%', top: fy * 100 + '%', width: fw * 100 + '%', height: fh * 100 + '%',
          backgroundSize: `${C.width}px ${C.height}px`, backgroundPosition: `${-fx * C.width}px ${-fy * C.height}px`, '--stroke': `url('assets/ui/collage/stroke_${n}.webp')` } });
        cart.insertBefore(el, sign);
        const STROKE = { duration: 680, easing: 'linear' };
        swish(0.6);
        anim(el, [{ maskPosition: '0 0, 100% 0', webkitMaskPosition: '0 0, 100% 0' }, { maskPosition: '0 0, 0 0', webkitMaskPosition: '0 0, 0 0' }], STROKE);
        const mid = P(fx + fw * 0.5, fy + fh * 0.42);
        await done(anim(brush, [{ transform: tipAt(a, -6) }, { transform: tipAt(mid, -10) }, { transform: tipAt(b, -4) }], STROKE));
        from = b;
      }
      // the last gaps (the poles, the handle) fill in on their own
      const fill = anim(cartCol, [{ opacity: 0 }, { opacity: 1 }], { duration: 900, easing: 'ease-in-out' });
      cartCol.classList.add('full');
      fill.finished.then(() => { fill.cancel(); for (const s2 of cart.querySelectorAll('.pr-stroke')) s2.remove(); }).catch(() => {});
      // and the name on the board, in one hand, left to right: the brush keeps to the letters as they go on
      const S = sign.getBoundingClientRect(), sx = S.left - R.left, sy = S.top - R.top + S.height * 0.55;
      const signAt = (k, bob) => ({ x: sx + S.width * (0.5 + (k - 0.5) * 0.62 * 1.3), y: sy - bob });
      await done(anim(brush, [{ transform: tipAt(from, -4) }, { transform: tipAt(signAt(0, 0), 4) }], { duration: 520, easing: 'ease-in-out' }));
      sign.classList.add('on');
      swish(1.6);
      const write = [];
      for (let i = 0; i <= 12; i++) write.push({ transform: tipAt(signAt(i / 12, i % 2 ? S.height * 0.5 : -S.height * 0.2), i % 2 ? -8 : 6) });
      await done(anim(brush, write, { duration: 1900, easing: 'cubic-bezier(.45, .1, .4, 1)' }));
      // done: it lifts away, out of the picture
      const end = signAt(1, 0);
      await done(anim(brush, [{ transform: tipAt(end, 6), opacity: 1 }, { transform: tipAt({ x: end.x + 140, y: end.y - 260 }, 24), opacity: 0 }], { duration: 700, easing: 'ease-in' }));
      brush.classList.remove('on');
    }
    await wait(900);
    await stage.beat();   // nothing to say: the awning is blue again and the name is on the board
    // the cart is open: into the café behind it, through the cart's own colour
    const c = at(cart, 0.55, 0.45);
    const dive = h('div.pr-dive');
    root.appendChild(dive);
    await done(anim(dive, [{ clipPath: `circle(0% at ${c.x}px ${c.y}px)` }, { clipPath: `circle(150% at ${c.x}px ${c.y}px)` }], { duration: 900, easing: IN }));
  };

  // (no renderer.popCart at the end: the cart is already standing, and popping up is kept for the Lv3 shop)
  // the rain keeps on: the opening (opening.js) comes straight after, on the same lot, and stops it
  return stage.run(story).then(() => { markSeen(); });
}
