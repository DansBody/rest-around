// Small shared helpers.
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const choice = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const chance = (p) => Math.random() < p;
export const tileKey = (x, y) => x * 1000 + y;
export const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
export const manhattan = (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by);

export function easeOutBack(t) {
  const c1 = 1.70158, c3 = c1 + 1;
  t = clamp(t, 0, 1);
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
export const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);

let _uid = 1;
export const uid = () => _uid++;
export const bumpUid = (n) => { if (n >= _uid) _uid = n + 1; };

export function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// ---- colors ----
export function hexToRgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
}
/** f > 0 lightens toward white, f < 0 darkens toward black. */
export function shade(hex, f) {
  const c = hexToRgb(hex);
  return rgbToHex(c.map((v) => (f >= 0 ? v + (255 - v) * f : v * (1 + f))));
}
export function mix(a, b, t) {
  const ca = hexToRgb(a), cb = hexToRgb(b);
  return rgbToHex(ca.map((v, i) => lerp(v, cb[i], t)));
}

export function fmt(n) {
  n = Math.floor(n);
  return n >= 10000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1) + 'k' : String(n);
}
export function fmtTime(hours, h24 = false) {
  const h = Math.floor(hours), m = Math.floor((hours - h) * 60);
  if (h24) return `${h}:${String(m).padStart(2, '0')}`;
  const ampm = h >= 12 ? 'pm' : 'am';
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, '0')}${ampm}`;
}

// tiny DOM helper: h('div.card#id', {onclick}, children...)
export function h(sel, attrs, ...kids) {
  const m = sel.match(/^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i);
  const el = document.createElement(m[1] || 'div');
  for (const part of (m[2] || '').match(/[.#][\w-]+/g) || []) {
    if (part[0] === '.') el.classList.add(part.slice(1)); else el.id = part.slice(1);
  }
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; }   // custom properties need setProperty
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  const add = (k) => {
    if (k == null || k === false) return;
    if (Array.isArray(k)) k.forEach(add);
    else el.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
  };
  kids.forEach(add);
  return el;
}

// simple event bus
const listeners = new Map();
export const bus = {
  on(ev, fn) { if (!listeners.has(ev)) listeners.set(ev, new Set()); listeners.get(ev).add(fn); return () => listeners.get(ev).delete(fn); },
  emit(ev, data) { const s = listeners.get(ev); if (s) for (const fn of [...s]) fn(data); },
};
