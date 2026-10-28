// Refillit OS motion, after the Persona / Metaphor menus (design/art-direction/PLAN.md, UI 轉場): no cross-fades,
// every change is carried by one big shape, and the shapes are the café's own: a torn denim sheet, coffee poured in,
// a loaf out of the oven, latte art, falling beans, steam, a coral ink iris for events. The title slides in last and the rows come in one frame apart.
// Closing: the window tears into horizontal slices that slide apart. Web Animations only, nothing per frame in JS.
// Also the collage around the screen edges (style in os.css).
import { h } from '../util.js';

const FRAME = 1000 / 30;   // one frame of the reference video
// openings play at twice the reference's pace (the user wants time to see them): about a second each
const PACE = 2, F = FRAME * PACE;
const quiet = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const EASE = 'cubic-bezier(.62,.02,.34,1)';
const OUT = 'cubic-bezier(.2,.8,.3,1)', IN = 'cubic-bezier(.6,0,.8,.3)';

/** Opening `win` (its rows in `body`) with one of the café's openings, each carried by one big shape:
 *  'paper' a torn denim sheet sweeps across and the window drops in behind it;
 *  'pour'  coffee (ink, with a peach crema line) is poured in from a grey kettle until it fills the window, then drains
 *          away downwards and leaves the window behind;
 *  'oven'  a grey loaf comes up out of the window's foot and the window rises behind it like dough, then the loaf slides off;
 *  'latte' a real latte (grey photo) swirls open over the window, then its foam heart opens onto the window and the
 *          view dives into it;
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
  if (title) title.animate([{ translate: '-40px 0' }, { translate: '3px 0', offset: 0.7 }, { translate: '0 0' }], { duration: 8 * FRAME, delay: 9 * F, easing: 'ease-out', fill: 'backwards' });
  // rows a frame and a half apart once the window is mostly there, from the left, a little past their place and back
  [...(body || win).children].slice(0, 14).forEach((row, i) => row.animate(
    [{ transform: 'translateX(-110%)' }, { transform: 'translateX(5px)', offset: 0.75 }, { transform: 'none' }],
    { duration: 9 * FRAME, delay: 8 * F + i * 1.5 * FRAME, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'backwards' }));
  return done;
}

// The pictures the openings and the edge collage draw (os.css backgrounds, the latte <image>) and the faces their text
// uses. The browser only fetches a CSS background or a font when something first needs it, so the first few openings
// played with pieces missing; main.js fetches and decodes them all behind the loading bar instead.
const PICTURES = ['bean', 'bread', 'bust', 'coffee', 'hand_cup', 'ink_coral', 'kettle', 'latte', 'moka', 'paper_denim', 'steam']
  .map((n) => `assets/ui/collage/${n}.webp`);
const FACES = ['Refillit Pixel', 'Refillit LCD', 'Refillit Type', 'Refillit Display'];
const kept = [];   // decoded images held on to, so the browser keeps them ready
/** Fetch and decode everything the openings use. Never fails: a piece that will not load just loads later, as before. */
export function preloadTransitions() {
  const pics = PICTURES.map((src) => {
    const img = new Image();
    img.src = src;
    kept.push(img);
    return img.decode().catch(() => {});
  });
  const faces = document.fonts ? FACES.map((f) => document.fonts.load(`16px "${f}"`).catch(() => {})) : [];
  return Promise.all([...pics, ...faces]);
}

const px = (b) => ({ left: b.left + 'px', top: b.top + 'px', width: b.width + 'px', height: b.height + 'px' });
const gone = (an, el) => an.finished.catch(() => {}).then(() => el.remove());
let uid = 0;
// the foam heart in latte.webp, as fractions of the photo: the point the heart path is drawn round, and its width
const LATTE = { x: 0.502, y: 0.515, w: 0.53 };

const OPENINGS = {
  paper(win, host, b) {
    const W = b.width, PW = Math.max(110, Math.min(260, W * 0.6)), D = 13 * F;
    const paper = h('div.tr-paper', { 'aria-hidden': 'true', style: { left: b.left + 'px', top: b.top - 14 + 'px', width: PW + 'px', height: b.height + 28 + 'px' } });   // a real torn strip, dyed denim (os.css)
    host.appendChild(paper);
    const span = W + PW + 40, e0 = (PW + 20) / span, e1 = (W + PW + 20) / span;
    const sweep = paper.animate([{ transform: `translateX(${-PW - 20}px) rotate(-2deg)` }, { transform: `translateX(${W + 20}px) rotate(-2deg)` }], { duration: D, easing: EASE });
    // the window shows behind the paper's trailing edge (same easing, so the two stay in step)
    win.animate([{ clipPath: 'inset(-40px 100% -40px 0)' }, { clipPath: 'inset(-40px 100% -40px 0)', offset: e0 }, { clipPath: 'inset(-40px 0 -40px 0)', offset: e1 }, { clipPath: 'inset(-40px 0 -40px 0)' }],
      { duration: D, easing: EASE });
    win.animate([{ transform: 'translateY(-10px) rotate(-1.4deg) scale(1.025)' }, { transform: 'translateY(2px) rotate(.4deg)', offset: 0.6 }, { transform: 'none' }],
      { duration: 8 * F, delay: 4 * F, easing: 'cubic-bezier(.3,1.5,.5,1)', fill: 'backwards' });
    return gone(sweep, paper);
  },
  pour(win, host, b) {
    const D = 15 * F, full = 0.5;   // filled at half time, drained by the end
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
    coffee.animate([{ translate: '0 0' }, { translate: '-6px 0', offset: 0.3 }, { translate: '4px 0', offset: 0.6 }, { translate: '0 0' }], { duration: D, easing: 'ease-in-out' });   // a slosh
    kettle.animate([{ transform: 'translate(60px, -80px) rotate(14deg)', easing: OUT }, { transform: 'none', offset: 0.16 }, { transform: 'rotate(-2deg)', offset: full + 0.06, easing: IN },
      { transform: 'translate(70px, -110px) rotate(16deg)' }], { duration: D });
    // the window waits behind the full cup, then is simply there as the coffee drains off it
    win.animate([{ visibility: 'hidden' }, { visibility: 'hidden', offset: full }, { visibility: 'visible', offset: full }, { visibility: 'visible' }], { duration: D });
    gone(fill, cup); gone(fill, stream);
    return gone(fill, kettle);
  },
  oven(win, host, b) {
    const D = 14 * F, w = Math.min(220, b.width * 0.62);
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
    // a real latte (grey halftone photo, assets/ui/collage/latte.webp) swirls open over the window and holds a beat to
    // show its heart; then the heart itself opens onto the window and the view dives into it until the coffee is gone
    const D = 18 * F, W = b.width, H = b.height, id = 'tr-latte-' + (++uid);
    const P = Math.max(W, H) * 1.2, x0 = (W - P) / 2, y0 = H * 0.42 - P / 2;   // the photo, square, covering the window
    const hx = x0 + LATTE.x * P, hy = y0 + LATTE.y * P, hw = LATTE.w * P;      // its heart, in the window's pixels
    const R = Math.hypot(Math.max(hx, W - hx), Math.max(hy, H - hy)), sh = (hw / 1.2) * 0.9;   // the hole sits just inside the foam
    const big = (R * 2.4) / (hw * 0.9);
    const HEART = 'M0 .42C-.62 .02-.58-.58 0-.26C.58-.58.62 .02 0 .42Z';
    const svg = h('div.tr-latte', { 'aria-hidden': 'true', style: px(b), html:
      `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}">` +
      `<circle class="spread" cx="${hx}" cy="${hy}" r="${R}" fill="#fff"/><g class="zoom"><path class="hole" d="${HEART}" fill="#000"/></g></mask></defs>` +
      `<g mask="url(#${id})"><g class="zoom"><g class="swirl"><image href="assets/ui/collage/latte.webp" x="${x0}" y="${y0}" width="${P}" height="${P}"/></g></g></g></svg>` });
    host.appendChild(svg);
    for (const g of svg.querySelectorAll('.zoom, .swirl')) g.style.transformOrigin = `${hx}px ${hy}px`;
    const all = (sel, frames, timing) => [...svg.querySelectorAll(sel)].map((el) => el.animate(frames, { duration: D, ...timing }));
    // swirl open: the cup's surface spreads from the heart, turning as it comes
    const spread = all('.spread', [{ transform: 'scale(0)', easing: OUT }, { transform: 'scale(1)', offset: 0.3 }, { transform: 'scale(1)' }])[0];
    all('.swirl', [{ transform: 'rotate(-80deg) scale(1.25)', easing: OUT }, { transform: 'rotate(0) scale(1)', offset: 0.34 }, { transform: 'rotate(0) scale(1)' }]);
    // the beat to look at it, then the heart opens (the hole stays just inside the foam heart of the photo)
    const hole = (k) => `translate(${hx}px, ${hy}px) scale(${k * sh})`;
    all('.hole', [{ transform: hole(0) }, { transform: hole(0), offset: 0.56, easing: OUT }, { transform: hole(1), offset: 0.66 }, { transform: hole(1) }]);
    // and the view dives into the heart, the photo and its hole together
    all('.zoom', [{ transform: 'scale(1)' }, { transform: 'scale(1)', offset: 0.62, easing: IN }, { transform: `scale(${big})` }]);
    win.animate([{ visibility: 'hidden' }, { visibility: 'hidden', offset: 0.3 }, { visibility: 'visible', offset: 0.3 }, { visibility: 'visible' }], { duration: D });
    return gone(spread, svg);
  },
  beans(win, host, b) {
    // a curtain of grey beans rains down through the window; the window is there above the curtain, the beans fall on out
    const D = 16 * F, W = b.width, H = b.height, n = Math.round(W / 12), t0 = 0.08, t1 = 0.78;
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
    const D = 16 * F, W = b.width, H = b.height, c = W / 2.6, cols = 3, rows = Math.ceil(H / c) + 1, full = 0.46;
    const cloud = h('div.tr-steam', { 'aria-hidden': 'true', style: px(b) });
    host.appendChild(cloud);
    const all = [];
    for (let row = rows - 1; row >= 0; row--) {
      for (let col = 0; col < cols; col++) {
        const d = c * (1.7 + Math.random() * 0.4), gx = (col + 0.5) * (W / cols) + (Math.random() - 0.5) * 20, gy = row * c + (Math.random() - 0.5) * 20;
        const late = ((rows - 1 - row) / rows) * 0.12;   // the lower rows come first
        const puff = h('i.tr-puff', { style: { left: gx - d / 2 + 'px', top: gy - d / 2 + 'px', width: d + 'px', height: d + 'px', rotate: Math.random() * 360 + 'deg', scale: Math.random() < 0.5 ? '-1 1' : '1 1' } });
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
  const N = 4, D = 10 * FRAME, done = [];
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

/** An event (P3R's iris, in coral): a real ink blot, dyed coral, grows from (x, y) in `host` until it covers the screen, then a hole
 *  bursts open from the same point and throws the coral out as a ring. 14 frames. The hole needs `--hole` registered
 *  with @property (os.css); without it the coral simply drops away at the half. */
export function iris(host, x, y) {
  if (quiet() || !host.isConnected) return Promise.resolve();
  const r = host.getBoundingClientRect(), R = Math.hypot(Math.max(x, r.width - x), Math.max(y, r.height - y)) + 24;
  const at = `${Math.round(x)}px ${Math.round(y)}px`, D = 14 * F;
  const blot = h('i.tr-blot', { style: { left: x - R + 'px', top: y - R + 'px', width: 2 * R + 'px', height: 2 * R + 'px', rotate: Math.random() * 360 + 'deg' } });
  const el = h('div.tr-iris', { 'aria-hidden': 'true', style: { '--at': at } }, blot);
  host.appendChild(el);
  // the blot spreads past the screen's corners (its ragged rim and splatter lead the way)
  blot.animate([{ transform: 'scale(0)' }, { transform: 'scale(1.5)', offset: 0.45 }, { transform: 'scale(1.5)' }], { duration: D, easing: 'cubic-bezier(.55,0,.25,1)' });
  const out = el.animate([{ '--hole': '0px' }, { '--hole': '0px', offset: 0.5 }, { '--hole': `${R}px` }], { duration: D, easing: 'cubic-bezier(.5,0,.3,1)' });
  return out.finished.catch(() => {}).then(() => el.remove());
}

/** The alert window `el` slams out of (x, y): from a speck there, turned, to its place with a bounce. */
export function slamFrom(el, x, y) {
  if (quiet() || !el.isConnected) return;
  const r = el.getBoundingClientRect(), u = (el.closest('#ui') || document.body).getBoundingClientRect();
  const dx = x - (r.left - u.left + r.width / 2), dy = y - (r.top - u.top + r.height / 2);
  el.animate([{ transform: `translate(${dx}px, ${dy}px) scale(.2) rotate(-14deg)` }, { transform: 'translate(0, 0) scale(1.08) rotate(3deg)', offset: 0.7 }, { transform: 'none' }],
    { duration: 9 * F, delay: 6 * F, easing: 'cubic-bezier(.2,.9,.3,1.2)', fill: 'backwards' });
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
