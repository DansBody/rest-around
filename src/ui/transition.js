// Refillit OS motion, after the Persona / Metaphor menus (design/art-direction/PLAN.md, UI 轉場): no cross-fades,
// every change is carried by one big shape, and the shapes are the café's own: a torn denim sheet, coffee poured in,
// a loaf out of the oven, latte art, falling beans, steam, a coral ink iris for events. The title slides in last and the rows come in one frame apart.
// Closing: the window tears into horizontal slices that slide apart. Web Animations only, nothing per frame in JS.
// Also the collage around the screen edges (style in os.css).
import { h } from '../util.js';

const FRAME = 1000 / 30;   // one frame of the reference video
const quiet = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const EASE = 'cubic-bezier(.62,.02,.34,1)';
const OUT = 'cubic-bezier(.2,.8,.3,1)', IN = 'cubic-bezier(.6,0,.8,.3)';

/** A ragged edge for the torn paper: a polygon down the right side and back up the left, `n` teeth each. */
function torn(n = 14) {
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push(`${92 + Math.random() * 8}% ${(i / n) * 100}%`);
  for (let i = n; i >= 0; i--) pts.push(`${Math.random() * 8}% ${(i / n) * 100}%`);
  return `polygon(${pts.join(',')})`;
}

/** Opening `win` (its rows in `body`) with one of the café's openings, each carried by one big shape:
 *  'paper' a torn denim sheet sweeps across and the window drops in behind it;
 *  'pour'  coffee (ink, with a peach crema line) is poured in from a grey kettle until it fills the window, then drains
 *          away downwards and leaves the window behind;
 *  'oven'  a grey loaf comes up out of the window's foot and the window rises behind it like dough, then the loaf slides off;
 *  'latte' an espresso spreads over the window, a foam heart is poured into it and opens up onto the window;
 *  'beans' a curtain of grey coffee beans rains down through the window, which is there above the curtain;
 *  'steam' puffs of steam roll up over the window and drift apart.
 *  The title slides in last and the rows come in one frame apart, whatever the opening. */
export function wipeIn(win, body, kind = 'paper') {
  for (const a of win.getAnimations()) a.cancel();
  if (quiet() || !win.isConnected) return Promise.resolve();
  const host = win.parentNode, hr = host.getBoundingClientRect(), r = win.getBoundingClientRect();
  if (!r.width) return Promise.resolve();
  const box = { left: r.left - hr.left, top: r.top - hr.top, width: r.width, height: r.height };
  const done = (OPENINGS[kind] || OPENINGS.paper)(win, host, box);
  const title = win.querySelector('.panel-head h2');
  if (title) title.animate([{ translate: '-40px 0' }, { translate: '3px 0', offset: 0.7 }, { translate: '0 0' }], { duration: 6 * FRAME, delay: 9 * FRAME, easing: 'ease-out', fill: 'backwards' });
  // rows one frame apart, from the left, a little past their place and back
  [...(body || win).children].slice(0, 14).forEach((row, i) => row.animate(
    [{ transform: 'translateX(-110%)' }, { transform: 'translateX(5px)', offset: 0.75 }, { transform: 'none' }],
    { duration: 6 * FRAME, delay: (7 + i) * FRAME, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'backwards' }));
  return done;
}

const px = (b) => ({ left: b.left + 'px', top: b.top + 'px', width: b.width + 'px', height: b.height + 'px' });
const gone = (an, el) => an.finished.catch(() => {}).then(() => el.remove());
let uid = 0;

const OPENINGS = {
  paper(win, host, b) {
    const W = b.width, PW = Math.max(110, Math.min(260, W * 0.6)), D = 13 * FRAME;
    const paper = h('div.tr-paper', { 'aria-hidden': 'true', style: { left: b.left + 'px', top: b.top - 14 + 'px', width: PW + 'px', height: b.height + 28 + 'px', clipPath: torn() } });
    host.appendChild(paper);
    const span = W + PW + 40, e0 = (PW + 20) / span, e1 = (W + PW + 20) / span;
    const sweep = paper.animate([{ transform: `translateX(${-PW - 20}px) rotate(-2deg)` }, { transform: `translateX(${W + 20}px) rotate(-2deg)` }], { duration: D, easing: EASE });
    // the window shows behind the paper's trailing edge (same easing, so the two stay in step)
    win.animate([{ clipPath: 'inset(-40px 100% -40px 0)' }, { clipPath: 'inset(-40px 100% -40px 0)', offset: e0 }, { clipPath: 'inset(-40px 0 -40px 0)', offset: e1 }, { clipPath: 'inset(-40px 0 -40px 0)' }],
      { duration: D, easing: EASE });
    win.animate([{ transform: 'translateY(-10px) rotate(-1.4deg) scale(1.025)' }, { transform: 'translateY(2px) rotate(.4deg)', offset: 0.6 }, { transform: 'none' }],
      { duration: 8 * FRAME, delay: 4 * FRAME, easing: 'cubic-bezier(.3,1.5,.5,1)', fill: 'backwards' });
    return gone(sweep, paper);
  },
  pour(win, host, b) {
    const D = 15 * FRAME, full = 0.5;   // filled at half time, drained by the end
    const cup = h('div.tr-pour', { 'aria-hidden': 'true', style: px(b) }, h('i.tr-coffee'));
    // the kettle's spout sits just over the window's middle; its stream (CSS) falls into the coffee
    const kw = Math.min(160, b.width * 0.42), kh = kw * 0.87;
    const kettle = h('i.tr-kettle', { 'aria-hidden': 'true', style: { left: b.left + b.width * 0.5 - kw * 0.03 + 'px', top: b.top - kh * 0.76 - 4 + 'px', width: kw + 'px', height: kh + 'px' } });
    const stream = h('i.tr-stream', { 'aria-hidden': 'true', style: { left: b.left + b.width * 0.5 + 'px', top: b.top - 6 + 'px', height: b.height + 6 + 'px' } });
    host.append(cup, stream, kettle);
    // the stream falls once the kettle is in place and is cut off from the top once the cup is full
    stream.animate([{ clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 100% 0)', offset: 0.14 }, { clipPath: 'inset(0 0 0 0)', offset: 0.24 }, { clipPath: 'inset(0 0 0 0)', offset: full },
      { clipPath: 'inset(100% 0 0 0)', offset: full + 0.1 }, { clipPath: 'inset(100% 0 0 0)' }], { duration: D });
    const coffee = cup.firstChild;
    // up with a slosh, a beat full, then away down
    // (easing per step, not over the whole run, so the offsets stay true to the clock the window and stream use)
    const fill = coffee.animate([{ transform: 'translateY(100%)' }, { transform: 'translateY(100%)', offset: 0.16, easing: 'cubic-bezier(.4,0,.6,1)' },
      { transform: 'translateY(-3%)', offset: full * 0.88, easing: 'ease-in-out' }, { transform: 'translateY(0)', offset: full },
      { transform: 'translateY(0)', offset: full + 0.06, easing: IN }, { transform: 'translateY(104%)' }], { duration: D });
    coffee.animate([{ backgroundPositionX: '0px' }, { backgroundPositionX: '-120px' }], { duration: D, easing: 'linear' });   // the crema line rolls
    kettle.animate([{ transform: 'translate(60px, -80px) rotate(14deg)', easing: OUT }, { transform: 'none', offset: 0.16 }, { transform: 'rotate(-2deg)', offset: full + 0.06, easing: IN },
      { transform: 'translate(70px, -110px) rotate(16deg)' }], { duration: D });
    // the window waits behind the full cup, then is simply there as the coffee drains off it
    win.animate([{ visibility: 'hidden' }, { visibility: 'hidden', offset: full }, { visibility: 'visible', offset: full }, { visibility: 'visible' }], { duration: D });
    gone(fill, cup); gone(fill, stream);
    return gone(fill, kettle);
  },
  oven(win, host, b) {
    const D = 14 * FRAME, w = Math.min(220, b.width * 0.62);
    const loaf = h('i.tr-bread', { 'aria-hidden': 'true', style: { left: b.left + (b.width - w) / 2 + 'px', top: b.top + b.height - w * 0.42 + 'px', width: w + 'px', height: w * 0.56 + 'px' } });
    host.appendChild(loaf);
    // the loaf comes up out of the window's foot, hops, then slides off to the right
    const pop = loaf.animate([{ transform: 'translateY(80px) scale(.5)', easing: OUT }, { transform: 'translateY(-26px) scale(1.06) rotate(-3deg)', offset: 0.3, easing: 'ease-in-out' },
      { transform: 'translateY(-14px) rotate(-2deg)', offset: 0.6, easing: IN }, { transform: `translate(${b.width * 0.8}px, 30px) rotate(14deg) scale(.8)` }], { duration: D });
    // the window proofs up from its foot behind the loaf: squat, over-risen, settled
    win.animate([{ transform: 'scale(.9, .04)', transformOrigin: '50% 100%' }, { transform: 'scale(.92, .04)', transformOrigin: '50% 100%', offset: 0.18, easing: OUT },
      { transform: 'scale(1.03, 1.08)', transformOrigin: '50% 100%', offset: 0.62, easing: 'ease-in-out' }, { transform: 'scale(1, 1)', transformOrigin: '50% 100%' }], { duration: D });
    return gone(pop, loaf);
  },
  latte(win, host, b) {
    // an espresso spreads over the window, a foam heart is poured into it, then the heart opens as a window onto the
    // panel and keeps growing until the coffee is gone; flecks of foam fly off its rim
    const D = 16 * FRAME, W = b.width, H = b.height, cx = W / 2, cy = H * 0.44, s = Math.min(W, H) * 0.42, id = 'tr-latte-' + (++uid);
    const R = Math.hypot(W, H), big = (R * 2.6) / s;   // heart scale that clears the whole window
    const HEART = 'M0 .42C-.62 .02-.58-.58 0-.26C.58-.58.62 .02 0 .42Z';
    const at = (k) => `translate(${cx}px, ${cy}px) scale(${k * s})`;   // k in heart sizes
    const flecks = Array.from({ length: 10 }, (_, i) => {
      const a = (i / 10) * Math.PI * 2 + Math.random() * 0.4;
      return `<circle class="fleck" cx="${cx}" cy="${cy}" r="${3 + Math.random() * 5}" data-dx="${Math.cos(a) * (s * 0.9 + Math.random() * s)}" data-dy="${Math.sin(a) * (s * 0.9 + Math.random() * s)}"/>`;
    }).join('');
    const svg = h('div.tr-latte', { 'aria-hidden': 'true', style: px(b), html:
      `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}">` +
      `<rect width="${W}" height="${H}" fill="#fff"/><path class="hole" d="${HEART}" fill="#000"/></mask></defs>` +
      `<rect class="espresso" width="${W}" height="${H}" mask="url(#${id})"/>` +
      // the foam is cut by the same heart-shaped hole (masked on a group, so the mask stays in the picture's space), so
      // once the hole opens the foam is only a rim round it
      `<g mask="url(#${id})"><path class="foam" d="${HEART}"/><path class="pull" pathLength="1" d="M${cx} ${cy - s * 0.5}L${cx} ${cy + s * 0.5}"/></g>${flecks}</svg>` });
    host.appendChild(svg);
    const q = (sel) => svg.querySelector(sel);
    const cup = q('.espresso').animate([{ clipPath: `circle(0px at ${cx}px ${cy}px)`, easing: OUT }, { clipPath: `circle(${R}px at ${cx}px ${cy}px)`, offset: 0.22 }, { clipPath: `circle(${R}px at ${cx}px ${cy}px)` }], { duration: D });
    // the pour: the foam swells in two pulses, the pull-through draws down it, then it opens with the hole
    q('.foam').animate([{ transform: at(0) }, { transform: at(0), offset: 0.16, easing: OUT }, { transform: at(0.55), offset: 0.3, easing: OUT }, { transform: at(1), offset: 0.44 },
      { transform: at(1), offset: 0.52, easing: IN }, { transform: at(big * 1.1) }], { duration: D });
    q('.pull').animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 1, offset: 0.4 }, { strokeDashoffset: 0, offset: 0.5 }, { strokeDashoffset: 0, offset: 0.55 }, { strokeDashoffset: -1 }], { duration: D });
    q('.hole').animate([{ transform: at(0) }, { transform: at(0), offset: 0.54, easing: IN }, { transform: at(big) }], { duration: D });
    for (const f of svg.querySelectorAll('.fleck')) {
      f.animate([{ transform: 'scale(0)' }, { transform: 'scale(0)', offset: 0.52, easing: OUT }, { transform: `translate(${f.dataset.dx}px, ${f.dataset.dy}px) scale(1)`, offset: 0.85 },
        { transform: `translate(${f.dataset.dx * 1.2}px, ${f.dataset.dy * 1.2}px) scale(0)` }], { duration: D });
    }
    win.animate([{ visibility: 'hidden' }, { visibility: 'hidden', offset: 0.22 }, { visibility: 'visible', offset: 0.22 }, { visibility: 'visible' }], { duration: D });
    return gone(cup, svg);
  },
  beans(win, host, b) {
    // a curtain of grey beans rains down through the window; the window is there above the curtain, the beans fall on out
    const D = 16 * FRAME, W = b.width, H = b.height, n = Math.round(W / 12), t0 = 0.08, t1 = 0.78;
    const rain = h('div.tr-beans', { 'aria-hidden': 'true', style: px(b) });
    host.appendChild(rain);
    const ends = [];
    for (let i = 0; i < n; i++) {
      const size = 24 + Math.random() * 20, x = Math.random() * (W - size * 0.4) - size * 0.3, off = -Math.random() * 90 - size, spin = (Math.random() - 0.5) * 540, r0 = Math.random() * 360;
      const bean = h('i.tr-bean', { style: { left: x + 'px', width: size * 0.82 + 'px', height: size + 'px' } });
      rain.appendChild(bean);
      // linear, like the reveal, so the curtain and the window's edge stay together; the beans keep going below
      ends.push(bean.animate([{ transform: `translateY(${off - 40}px) rotate(${r0}deg)` }, { transform: `translateY(${off - 40}px) rotate(${r0}deg)`, offset: t0 },
        { transform: `translateY(${H + 40 + off}px) rotate(${r0 + spin}deg)`, offset: t1 }, { transform: `translateY(${H + 140 + off}px) rotate(${r0 + spin * 1.3}deg)` }], { duration: D }));
    }
    win.animate([{ clipPath: 'inset(-60px -60px 100% -60px)' }, { clipPath: 'inset(-60px -60px 100% -60px)', offset: t0 + 0.05 }, { clipPath: 'inset(-60px -60px -60px -60px)', offset: t1 }, { clipPath: 'inset(-60px -60px -60px -60px)' }],
      { duration: D });
    return gone(ends[0], rain);
  },
  steam(win, host, b) {
    // puffs of steam roll up from the window's foot until they cover it, then drift apart upwards and shrink away
    const D = 16 * FRAME, W = b.width, H = b.height, c = W / 2.6, cols = 3, rows = Math.ceil(H / c) + 1, full = 0.46;
    const cloud = h('div.tr-steam', { 'aria-hidden': 'true', style: px(b) });
    host.appendChild(cloud);
    const all = [];
    for (let row = rows - 1; row >= 0; row--) {
      for (let col = 0; col < cols; col++) {
        const d = c * (1.3 + Math.random() * 0.3), gx = (col + 0.5) * (W / cols) + (Math.random() - 0.5) * 20, gy = row * c + (Math.random() - 0.5) * 20;
        const late = ((rows - 1 - row) / rows) * 0.12;   // the lower rows come first
        const puff = h('i.tr-puff', { style: { left: gx - d / 2 + 'px', top: gy - d / 2 + 'px', width: d + 'px', height: d + 'px' } });
        cloud.appendChild(puff);
        const from = `translate(${(W / 2 - gx) * 0.3}px, ${H - gy + d * 0.4}px) scale(.2)`, drift = `translate(${(gx - W / 2) * 0.7}px, ${-H * 0.45 - Math.random() * 60}px) scale(0)`;
        all.push(puff.animate([{ transform: from }, { transform: from, offset: late, easing: OUT }, { transform: 'translate(0, 0) scale(1)', offset: full },
          { transform: 'translate(0, -6px) scale(1.04)', offset: full + 0.06, easing: 'cubic-bezier(.4,0,.6,1)' }, { transform: drift }], { duration: D }));
      }
    }
    win.animate([{ visibility: 'hidden' }, { visibility: 'hidden', offset: full }, { visibility: 'visible', offset: full }, { visibility: 'visible' }], { duration: D });
    return gone(all[0], cloud);
  },
};

/** Closing `win`: copies of it (same id for a moment, so they keep its look), each one horizontal slice, slide apart and close up. The window itself hides at once. */
export function wipeOut(win) {
  if (quiet() || !win.isConnected || !win.classList.contains('open')) return Promise.resolve();
  const host = win.parentNode, hr = host.getBoundingClientRect(), r = win.getBoundingClientRect();
  if (!r.width) return Promise.resolve();
  const N = 4, D = 7 * FRAME, done = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * 100, b = 100 - ((i + 1) / N) * 100, dx = (i % 2 ? 1 : -1) * (24 + Math.random() * 40);
    const s = win.cloneNode(true);
    s.classList.add('tr-slice');
    s.setAttribute('aria-hidden', 'true'); s.inert = true;
    Object.assign(s.style, { left: r.left - hr.left + 'px', top: r.top - hr.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    host.appendChild(s);
    const mid = `inset(${a + (100 - a - b) / 2}% 0 ${b + (100 - a - b) / 2}% 0)`;
    const an = s.animate([{ clipPath: `inset(${a}% 0 ${b}% 0)`, transform: 'none' }, { clipPath: `inset(${a}% 0 ${b}% 0)`, transform: `translateX(${dx * 0.6}px)`, offset: 0.4 }, { clipPath: mid, transform: `translateX(${dx}px)` }],
      { duration: D, delay: i * FRAME * 0.5, easing: 'steps(4, end)', fill: 'both' });
    done.push(an.finished.catch(() => {}).then(() => s.remove()));
  }
  return Promise.all(done);
}

/** An event (P3R's iris, in coral): an ink circle grows from (x, y) in `host` until it covers the screen, then a hole
 *  bursts open from the same point and throws the coral out as a ring. 14 frames. The hole needs `--hole` registered
 *  with @property (os.css); without it the coral simply drops away at the half. */
export function iris(host, x, y) {
  if (quiet() || !host.isConnected) return Promise.resolve();
  const r = host.getBoundingClientRect(), R = Math.hypot(Math.max(x, r.width - x), Math.max(y, r.height - y)) + 24;
  const at = `${Math.round(x)}px ${Math.round(y)}px`, D = 14 * FRAME;
  const el = h('div.tr-iris', { 'aria-hidden': 'true', style: { '--at': at } });
  host.appendChild(el);
  el.animate([{ clipPath: `circle(0px at ${at})` }, { clipPath: `circle(${R}px at ${at})`, offset: 0.45 }, { clipPath: `circle(${R}px at ${at})` }], { duration: D, easing: 'cubic-bezier(.55,0,.25,1)' });
  const out = el.animate([{ '--hole': '0px' }, { '--hole': '0px', offset: 0.5 }, { '--hole': `${R}px` }], { duration: D, easing: 'cubic-bezier(.5,0,.3,1)' });
  return out.finished.catch(() => {}).then(() => el.remove());
}

/** The alert window `el` slams out of (x, y): from a speck there, turned, to its place with a bounce. */
export function slamFrom(el, x, y) {
  if (quiet() || !el.isConnected) return;
  const r = el.getBoundingClientRect(), u = (el.closest('#ui') || document.body).getBoundingClientRect();
  const dx = x - (r.left - u.left + r.width / 2), dy = y - (r.top - u.top + r.height / 2);
  el.animate([{ transform: `translate(${dx}px, ${dy}px) scale(.2) rotate(-14deg)` }, { transform: 'translate(0, 0) scale(1.08) rotate(3deg)', offset: 0.7 }, { transform: 'none' }],
    { duration: 9 * FRAME, delay: 6 * FRAME, easing: 'cubic-bezier(.2,.9,.3,1.2)', fill: 'backwards' });
}

/** A Control Strip module pressed: its pixel icon hops. */
export function bump(btn) {
  const ic = btn && btn.querySelector('.pix');
  if (!ic || quiet()) return;
  ic.animate([{ transform: 'none' }, { transform: 'translateY(-4px)' }, { transform: 'translateY(1px)' }, { transform: 'none' }], { duration: 6 * FRAME, easing: 'steps(6, end)' });
}

const DOVE = '<svg viewBox="0 0 100 70" aria-hidden="true"><path d="M6 40 C18 33 29 33 37 37 C39 25 45 11 60 1 C58 15 56 25 52 35 C62 29 77 27 94 29 C82 38 67 44 55 46 C49 54 41 58 31 58 L18 67 L21 56 C14 54 8 48 6 40 Z"/></svg>';
const ORBITS = '<svg viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">'
  + '<ellipse cx="500" cy="420" rx="620" ry="240" transform="rotate(-24 500 420)"/>'
  + '<ellipse cx="840" cy="800" rx="360" ry="120" transform="rotate(-12 840 800)"/>'
  + '<circle cx="500" cy="520" r="690"/><line x1="0" y1="200" x2="1000" y2="620"/><line x1="1000" y1="140" x2="150" y2="1000"/></svg>';

/** The collage layer under the UI: a denim edge, orbit lines that only show near the sides, a peach disc, halftone, a
 *  dove, and the marble bust. Real things gone grey (halftone cut-outs, assets/ui/collage) sit between the windows, not
 *  loose on the screen: the bust here behind the Control Strip, the hand and the typed strip round Status and the moka
 *  pot behind the panel (both in ui.js, so they move with their windows). */
export function collage() {
  return h('div#collage', { 'aria-hidden': 'true' },
    h('i.cl-edge'), h('i.cl-bars'),
    h('div.cl-orbits', { html: ORBITS }),
    h('i.cl-disc'), h('i.cl-x'), h('i.cl-dots'),
    // the marble bust stands behind the Control Strip's far end, its plinth hidden by the strip, in front of the halftone
    h('i.cl-photo.p-bust'),
    h('span.cl-dove.d1', { html: DOVE }));
}
