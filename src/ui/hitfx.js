// Hit feel for the real-time battle (ui/battlert.js), after Blue Archive: every member attacks in their own way and
// the foe answers each blow. A shot travels (or the member dashes in), lands with a spark in the member's style, the
// foe flashes white and is knocked back by how hard it was hit; the screen (battlert.js) adds the hit-stop.
// Everything is DOM + Web Animations on the battle's effects layer, in the frame's 390×844 coordinates.
import { h } from '../util.js';
import { audio } from '../audio.js';

const INK = '#1F2A4A', DENIM = '#3F5DAA';

/** How each member attacks. lead: ms of wind-up before the shot leaves (a card's longer than a swing's);
 *  travel: ms in the air; dash: how far towards the foe the member runs in (0..1); sfx: the impact sound. */
export const STYLE = {
  mochalatte: { shot: 'bean', spark: 'splash', lead: [110, 200], travel: 260, dash: 0, sfx: 'bean' },
  cheetie: { shot: null, spark: 'claw', lead: [60, 150], travel: 150, dash: 0.62, sfx: 'claw' },
  heehee: { shot: null, spark: 'petals', lead: [90, 190], travel: 190, dash: 0.4, sfx: 'bash' },
  bbaekko: { shot: 'orb', spark: 'rune', lead: [120, 220], travel: 320, dash: 0, sfx: 'zap' },
};
const DEFAULT = STYLE.cheetie;
export const styleOf = (who) => STYLE[who] || DEFAULT;

const SVG = {
  bean: `<svg viewBox="0 0 12 9" width="15" height="11"><ellipse cx="6" cy="4.5" rx="5.2" ry="3.8" fill="#7A4A2A" stroke="${INK}" stroke-width="1.2"/><path d="M2.6 5 Q6 2.2 9.4 4.4" stroke="#C8894E" fill="none" stroke-width="1.2"/></svg>`,
  orb: `<svg viewBox="0 0 22 22" width="20" height="20"><circle cx="11" cy="11" r="9.5" fill="none" stroke="${INK}" stroke-width="1.4" stroke-dasharray="2.6 2.2"/><circle cx="11" cy="11" r="6" fill="#fff" stroke="${DENIM}" stroke-width="2.4"/><path d="M11 7.5v7M7.5 11h7" stroke="${DENIM}" stroke-width="1.4"/></svg>`,
};

const later = (ms) => new Promise((r) => setTimeout(r, ms));
function piece(layer, x, y, html, cls = '') {
  const el = h('div.hx' + (cls ? '.' + cls : ''), { style: { left: x + 'px', top: y + 'px' }, html });
  layer.appendChild(el);
  return el;
}
const gone = (anim, el) => anim.finished.then(() => el.remove(), () => el.remove());

/** The shot, from (x0, y0) to (x1, y1): a bean lobbed in an arc, or a wobbling spell orb. Resolves on arrival. */
export function shoot(layer, kind, [x0, y0], [x1, y1], ms, big) {
  if (!kind) return later(ms);
  const el = piece(layer, x0, y0, SVG[kind], 'shot');
  const s = big ? 1.7 : 1, frames = [];
  for (let i = 0; i <= 10; i++) {
    const k = i / 10, x = (x1 - x0) * k, y = (y1 - y0) * k;
    const lift = kind === 'bean' ? -Math.sin(Math.PI * k) * 46 : Math.sin(k * Math.PI * 3) * 7;
    frames.push({ transform: `translate(${x}px, ${y + lift}px) rotate(${kind === 'bean' ? k * 540 : k * 180}deg) scale(${s})` });
  }
  return gone(el.animate(frames, { duration: ms, easing: 'linear', fill: 'forwards' }), el);
}

/** A member running in at the foe and back (Cheetie, Hee Hee). */
export function dash(mateEl, [dx, dy], frac, ms) {
  if (!frac) return;
  mateEl.animate([{ translate: '0 0' }, { translate: `${dx * frac}px ${dy * frac}px`, offset: 0.4, easing: 'cubic-bezier(.3,0,.9,.6)' },
    { translate: `${dx * frac}px ${dy * frac}px`, offset: 0.55 }, { translate: '0 0' }], { duration: ms * 2.6, easing: 'ease-out' });
}

/** The spark where it lands, in the member's style, plus an ink-edged star burst under it. */
export function spark(layer, kind, x, y, big, speed = 1) {
  const s = big ? 1.5 : 0.9, d = (ms) => ms / speed;
  const star = piece(layer, x, y, `<svg viewBox="-20 -20 40 40" width="${44 * s}" height="${44 * s}"><path d="M0-18 4-5 17-7 7 2 13 15 0 7-13 15-7 2-17-7-4-5z" fill="#fff" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/></svg>`, 'star');
  gone(star.animate([{ transform: 'translate(-50%,-50%) scale(.3) rotate(0deg)', opacity: 1 }, { transform: 'translate(-50%,-50%) scale(1.1) rotate(20deg)', opacity: 1, offset: 0.35 },
    { transform: 'translate(-50%,-50%) scale(1.2) rotate(28deg)', opacity: 0 }], { duration: d(big ? 300 : 200), easing: 'ease-out' }), star);
  const n = big ? 8 : 5;
  if (kind === 'claw') {   // three rakes across the foe
    for (let i = 0; i < 3; i++) {
      const c = piece(layer, x - 22 * s + i * 10 * s, y - 26 * s, '', 'claw');
      c.style.height = 52 * s + 'px';
      gone(c.animate([{ clipPath: 'inset(0 0 100% 0)', opacity: 1 }, { clipPath: 'inset(0 0 0 0)', opacity: 1, offset: 0.4 }, { clipPath: 'inset(100% 0 0 0)', opacity: 0.6 }],
        { duration: d(260), delay: d(i * 35), easing: 'ease-out', fill: 'both' }), c);
    }
  } else if (kind === 'rune') {   // a dashed rune ring opening out
    const r = piece(layer, x, y, `<svg viewBox="-30 -30 60 60" width="${70 * s}" height="${70 * s}"><circle r="22" fill="none" stroke="${DENIM}" stroke-width="3" stroke-dasharray="5 4"/><circle r="27" fill="none" stroke="${INK}" stroke-width="1.5"/></svg>`, 'ring');
    gone(r.animate([{ transform: 'translate(-50%,-50%) scale(.3) rotate(0deg)', opacity: 1 }, { transform: 'translate(-50%,-50%) scale(1.15) rotate(90deg)', opacity: 0 }],
      { duration: d(420), easing: 'ease-out' }), r);
  }
  for (let i = 0; i < n; i++) {   // the bits: coffee drops, petals, sparks
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.5, far = (big ? 46 : 28) * (0.7 + Math.random() * 0.5);
    const cls = kind === 'splash' ? 'drop' : kind === 'petals' ? 'petal' : kind === 'rune' ? 'mote' : 'chip';
    const p = piece(layer, x, y, '', cls);
    const fall = kind === 'splash' ? 26 : kind === 'petals' ? 14 : 0;
    gone(p.animate([{ transform: 'translate(-50%,-50%) scale(1) rotate(0deg)', opacity: 1 },
      { transform: `translate(calc(-50% + ${Math.cos(a) * far}px), calc(-50% + ${Math.sin(a) * far + fall}px)) scale(.5) rotate(${Math.random() * 360}deg)`, opacity: 0 }],
    { duration: d(380 + Math.random() * 160), easing: 'cubic-bezier(.2,.7,.4,1)' }), p);
  }
}

/** The foe's answer to a blow: a white flash and a knock back away from the team, bigger for harder hits. */
export function struck(body, n, { small = false, big = false, speed = 1 } = {}) {
  const kb = small ? 3 : Math.min(22, 5 + n * 0.9) * (big ? 1.4 : 1);
  body.animate([{ filter: 'brightness(0) invert(1)' }, { filter: 'brightness(0) invert(1)', offset: small ? 0.5 : 0.7 }, { filter: 'none' }],
    { duration: (small ? 70 : 120) / speed });
  body.animate([{ translate: '0 0', scale: '1 1' }, { translate: `${kb}px ${-kb * 0.35}px`, scale: small ? '1 1' : '1.06 .94', offset: 0.22 },
    { translate: `${kb * 0.15}px 0`, offset: 0.7 }, { translate: '0 0', scale: '1 1' }], { duration: (small ? 180 : 340) / speed, easing: 'ease-out' });
}

/** A member hit by a foe: a white flash (the screen knocks them back and they walk home). */
export function staggered(mateEl, speed = 1) {
  const c = mateEl.querySelector('canvas');
  if (c) c.animate([{ filter: 'brightness(0) invert(1)' }, { filter: 'none' }], { duration: 110 / speed });
}

/** A foe throwing itself at a member: it rushes (frac of the way, in an arc when hop), stops on contact, then
 *  backs off to its spot. Returns the ms until contact. */
export function rush(body, [dx, dy], { frac = 0.55, hop = false, speed = 1 } = {}) {
  const ms = (hop ? 260 : 170) / speed, x = dx * frac, y = dy * frac;
  const mid = hop ? [{ translate: `${x * 0.5}px ${y * 0.5 - 50}px`, offset: 0.2 }] : [];
  body.animate([{ translate: '0 0' }, ...mid, { translate: `${x}px ${y}px`, offset: 0.4, easing: 'ease-out' }, { translate: `${x}px ${y}px`, offset: 0.5 }, { translate: '0 0' }],
    { duration: ms / 0.4, easing: 'cubic-bezier(.5,0,.9,.6)' });
  return ms;
}

/** A blast that hits everyone: an ink ring rolling out from the foe across the stage. Returns the ms until it lands. */
export function shockwave(layer, x, y, speed = 1) {
  const r = piece(layer, x, y, `<svg viewBox="-50 -50 100 100" width="320" height="320"><circle r="44" fill="none" stroke="${INK}" stroke-width="3"/><circle r="38" fill="none" stroke="#E07A5F" stroke-width="2" stroke-dasharray="6 5"/></svg>`, 'ring');
  gone(r.animate([{ transform: 'translate(-50%,-50%) scale(.1)', opacity: 1 }, { transform: 'translate(-50%,-50%) scale(1.3)', opacity: 0 }], { duration: 420 / speed, easing: 'ease-out' }), r);
  return 160 / speed;
}

export const impactSound = (who, small) => audio.play(styleOf(who).sfx + (small ? '-s' : ''));
