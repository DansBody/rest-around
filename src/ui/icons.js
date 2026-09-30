// Vector UI glyphs in the spirit of SF Symbols (24×24, round strokes, a few multicolor fills).
// assets.iconEl() uses these for UI icons whose PNG is missing, so a hand-drawn PNG still wins.
const NS = 'http://www.w3.org/2000/svg';

function gearPath(cx, cy, r0, r1, teeth) {
  const pts = [];
  for (let i = 0; i < teeth * 4; i++) {
    const a = (i / (teeth * 4)) * Math.PI * 2 - Math.PI / 2;
    const r = i % 4 < 2 ? r1 : r0;
    pts.push(`${(cx + Math.cos(a) * r).toFixed(2)} ${(cy + Math.sin(a) * r).toFixed(2)}`);
  }
  return 'M' + pts.join('L') + 'Z';
}

const STAR = 'M12 2.9l2.75 5.6 6.15.9-4.45 4.35 1.05 6.1L12 16.95 6.5 19.85l1.05-6.1L3.1 9.4l6.15-.9z';

// each glyph: list of [tag, attrs]; `c` = currentColor stroke, fills are explicit
const G = {
  coin: [['circle', { cx: 12, cy: 12, r: 9, fill: 'url(#g-gold)', stroke: '#d98a00', 'stroke-width': 1.2 }], ['circle', { cx: 12, cy: 12, r: 6, fill: 'none', stroke: '#fff4c2', 'stroke-width': 1.4, opacity: 0.9 }], ['path', { d: 'M12 8.6v6.8', stroke: '#c77800', 'stroke-width': 1.8 }]],
  star: [['path', { d: STAR, fill: 'url(#g-gold)', stroke: '#e39b00', 'stroke-width': 1 }]],
  star_empty: [['path', { d: STAR, fill: 'rgba(120,120,135,.22)', stroke: 'rgba(90,90,105,.35)', 'stroke-width': 1 }]],
  points: [['path', { d: 'M7 14.6C4.4 14.1 3.5 11.8 4.4 10 5.2 8.3 7 7.8 8.3 8.3 8.8 6.2 10.3 5 12 5s3.2 1.2 3.7 3.3c1.3-.5 3.1 0 3.9 1.7.9 1.8 0 4.1-2.6 4.6V19H7z', fill: '#fff', stroke: '#ff8a3d', 'stroke-width': 1.6 }], ['path', { d: 'M7 16.3h10', stroke: '#ff8a3d', 'stroke-width': 1.6 }]],
  level: [['path', { d: 'M4.2 17.5 3 7.6l5 3.9 4-6 4 6 5-3.9-1.2 9.9z', fill: 'url(#g-violet)', stroke: '#7b4fe0', 'stroke-width': 1.2 }], ['path', { d: 'M4.6 20h14.8', stroke: '#7b4fe0', 'stroke-width': 1.8 }]],
  clock: [['circle', { cx: 12, cy: 12, r: 9, fill: 'rgba(255,255,255,.55)', stroke: 'c' }], ['path', { d: 'M12 7v5.2l3.4 2.1', stroke: 'c' }]],
  gift: [['path', { d: 'M5.2 12.5h13.6v7.3a1 1 0 0 1-1 1H6.2a1 1 0 0 1-1-1z', fill: '#ff6f9c' }], ['rect', { x: 3.6, y: 8.6, width: 16.8, height: 4, rx: 1, fill: '#ff8fb3' }], ['path', { d: 'M12 8.6v12.2', stroke: '#fff', 'stroke-width': 2 }], ['path', { d: 'M12 8.4C10.6 5 6.6 4.6 6.8 7c.2 1.6 3.2 1.6 5.2 1.4zm0 0c1.4-3.4 5.4-3.8 5.2-1.4-.2 1.6-3.2 1.6-5.2 1.4z', fill: 'none', stroke: '#ff4f86', 'stroke-width': 1.6 }]],
  energy: [['path', { d: 'M13.2 2.6 5 13.4h6.1l-1.3 8 8.2-10.8h-6.1z', fill: 'url(#g-gold)', stroke: '#e39b00', 'stroke-width': 1.1 }]],
  patience: [['path', { d: 'M7 3.5h10M7 20.5h10', stroke: 'c' }], ['path', { d: 'M8 3.5c0 4.6 8 5.3 8 8.5s-8 3.9-8 8.5M16 3.5c0 4.6-8 5.3-8 8.5s8 3.9 8 8.5', stroke: 'c', 'stroke-width': 1.5 }], ['path', { d: 'M9 19.8c.6-2 2-2.8 3-2.8s2.4.8 3 2.8z', fill: '#ffb340' }]],
  rotate: [['path', { d: 'M4.5 12a7.5 7.5 0 1 0 2.3-5.4', stroke: 'c' }], ['path', { d: 'M5.2 3.6v3.6h3.6', stroke: 'c' }]],
  rotate_r: [['path', { d: 'M19.5 12a7.5 7.5 0 1 1-2.3-5.4', stroke: 'c' }], ['path', { d: 'M18.8 3.6v3.6h-3.6', stroke: 'c' }]],
  move: [['path', { d: 'M12 3.5v17M3.5 12h17M9.5 6 12 3.5 14.5 6M9.5 18l2.5 2.5 2.5-2.5M6 9.5 3.5 12 6 14.5M18 9.5l2.5 2.5-2.5 2.5', stroke: 'c' }]],
  sell: [['path', { d: 'M3.5 12.3V4.5a1 1 0 0 1 1-1h7.8l8.2 8.2-8.8 8.8z', fill: 'rgba(52,199,89,.18)', stroke: 'c' }], ['circle', { cx: 8, cy: 8, r: 1.6, fill: 'currentColor' }]],
  lock: [['rect', { x: 5, y: 10.5, width: 14, height: 10, rx: 2.6, fill: 'rgba(120,120,135,.25)', stroke: 'c' }], ['path', { d: 'M8.2 10.5V8a3.8 3.8 0 0 1 7.6 0v2.5', stroke: 'c' }]],
  water: [['path', { d: 'M12 3.2s6.2 6.6 6.2 11.2a6.2 6.2 0 0 1-12.4 0C5.8 9.8 12 3.2 12 3.2z', fill: 'url(#g-sky)', stroke: '#2f8fdc', 'stroke-width': 1.1 }], ['path', { d: 'M9.3 14.6a2.8 2.8 0 0 0 2.4 2.7', stroke: '#fff', 'stroke-width': 1.5 }]],
  seed: [['path', { d: 'M12 20.5v-8.5', stroke: '#2f9e44' }], ['path', { d: 'M12 12.5c0-4.2-3-6.3-7.2-6.3 0 4.2 3 6.3 7.2 6.3z', fill: '#69d07a', stroke: '#2f9e44', 'stroke-width': 1.3 }], ['path', { d: 'M12 14.5c0-3.6 2.6-5.6 6.8-5.6 0 3.6-2.6 5.6-6.8 5.6z', fill: '#8fe09a', stroke: '#2f9e44', 'stroke-width': 1.3 }]],
  harvest: [['path', { d: 'M3.5 10.2h17l-2 9.3a1 1 0 0 1-1 .8H6.5a1 1 0 0 1-1-.8z', fill: '#f2c48d', stroke: '#b9793b', 'stroke-width': 1.3 }], ['path', { d: 'M8 10.2l3-6M16 10.2l-3-6', stroke: '#b9793b', 'stroke-width': 1.5 }], ['circle', { cx: 9, cy: 9, r: 2.2, fill: '#ff5f4a' }], ['circle', { cx: 14.2, cy: 8.6, r: 2, fill: '#ffa53d' }]],
  build: [['rect', { x: 9.8, y: 2.8, width: 10, height: 5.2, rx: 1.3, transform: 'rotate(45 14.8 5.4)', fill: 'currentColor', 'fill-opacity': 0.18, stroke: 'c' }], ['path', { d: 'M12.6 11.2 4.4 19.4', stroke: 'c', 'stroke-width': 2.6 }]],
  staff: [['circle', { cx: 9, cy: 8, r: 3.3, stroke: 'c' }], ['path', { d: 'M3.3 19.5c.6-3.5 2.9-5.4 5.7-5.4s5.1 1.9 5.7 5.4', stroke: 'c' }], ['circle', { cx: 16.6, cy: 9, r: 2.6, stroke: 'c' }], ['path', { d: 'M16 14c2.7-.3 4.6 1.4 5.1 4.5', stroke: 'c' }]],
  menu: [['path', { d: 'M6.5 3v5.2a2 2 0 0 0 2 2V21M10.5 3v5.2a2 2 0 0 1-2 2M8.5 3v4.2', stroke: 'c' }], ['path', { d: 'M17 21V3c-2.2 1.6-3.4 4.3-3.4 7.6H17', stroke: 'c' }]],
  garden: [['path', { d: 'M5 19C5 10.2 10.2 5 19 5c0 8.8-5.2 14-14 14z', fill: 'currentColor', 'fill-opacity': 0.14, stroke: 'c' }], ['path', { d: 'M5 19 13.5 10.5', stroke: 'c' }]],
  market: [['path', { d: 'M4.6 8.3h14.8l-1.1 11.3a1 1 0 0 1-1 .9H6.7a1 1 0 0 1-1-.9z', fill: 'currentColor', 'fill-opacity': 0.14, stroke: 'c' }], ['path', { d: 'M8.7 10.5V7.3a3.3 3.3 0 0 1 6.6 0v3.2', stroke: 'c' }]],
  settings: [['path', { d: gearPath(12, 12, 6.9, 9, 8), stroke: 'c', 'stroke-width': 1.6, fill: 'currentColor', 'fill-opacity': 0.12 }], ['circle', { cx: 12, cy: 12, r: 2.9, stroke: 'c', 'stroke-width': 1.6 }]],
  heart: [['path', { d: 'M12 20.2s-7.6-4.6-7.6-10.1A4.2 4.2 0 0 1 12 7.7a4.2 4.2 0 0 1 7.6 2.4c0 5.5-7.6 10.1-7.6 10.1z', fill: 'url(#g-rose)', stroke: '#e8385e', 'stroke-width': 1.1 }]],
  angry: [['circle', { cx: 12, cy: 12, r: 9, fill: 'url(#g-orange)', stroke: '#e0662a', 'stroke-width': 1.1 }], ['path', { d: 'M7.6 9.2l2.6 1.2M16.4 9.2l-2.6 1.2M8.6 16.4c1.9-1.8 4.9-1.8 6.8 0', stroke: '#7a2e0e', 'stroke-width': 1.6 }]],
  close: [['path', { d: 'M6.5 6.5l11 11M17.5 6.5l-11 11', stroke: 'c', 'stroke-width': 2 }]],
  back: [['path', { d: 'M15 4.5 7.5 12l7.5 7.5', stroke: 'c', 'stroke-width': 2 }]],
  forward: [['path', { d: 'M9 4.5l7.5 7.5L9 19.5', stroke: 'c', 'stroke-width': 2 }]],
  check: [['path', { d: 'M5 12.6l4.4 4.4L19 7.4', stroke: 'c', 'stroke-width': 2.2 }]],
  eye: [['path', { d: 'M2.5 12s3.6-6.5 9.5-6.5S21.5 12 21.5 12s-3.6 6.5-9.5 6.5S2.5 12 2.5 12z', stroke: 'c' }], ['circle', { cx: 12, cy: 12, r: 3, fill: 'currentColor' }]],
  save: [['path', { d: 'M12 3.5v10.5M7.8 10l4.2 4.2 4.2-4.2', stroke: 'c' }], ['path', { d: 'M4 14.5v4a1.5 1.5 0 0 0 1.5 1.5h13a1.5 1.5 0 0 0 1.5-1.5v-4', stroke: 'c' }]],
  recenter: [['circle', { cx: 12, cy: 12, r: 6.5, stroke: 'c' }], ['circle', { cx: 12, cy: 12, r: 2, fill: 'currentColor' }], ['path', { d: 'M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3', stroke: 'c' }]],
  fast: [['path', { d: 'M3.5 6.5 11 12l-7.5 5.5zM12 6.5l7.5 5.5-7.5 5.5z', fill: 'currentColor', stroke: 'c', 'stroke-width': 1.2 }]],
  bowl: [['path', { d: 'M3.5 11.2h17a8.5 8.5 0 0 1-17 0z', fill: 'currentColor', 'fill-opacity': 0.14, stroke: 'c' }], ['path', { d: 'M9 8c0-1.6 1.1-2 1.1-3.6M13.4 8c0-1.6 1.1-2 1.1-3.6', stroke: 'c' }]],
  sparkles: [['path', { d: 'M10 3.5c.7 4.2 2.3 5.8 6.5 6.5-4.2.7-5.8 2.3-6.5 6.5-.7-4.2-2.3-5.8-6.5-6.5 4.2-.7 5.8-2.3 6.5-6.5z', fill: 'url(#g-gold)', stroke: '#e39b00', 'stroke-width': 1 }], ['path', { d: 'M18 14.5c.35 2 1.1 2.8 3 3.1-1.9.35-2.65 1.1-3 3.1-.35-2-1.1-2.75-3-3.1 1.9-.3 2.65-1.1 3-3.1z', fill: 'url(#g-gold)' }]],
  dash: [['path', { d: 'M13.5 4.5h6M11 9h8.5M13 13.5h6.5', stroke: 'c', 'stroke-width': 1.8 }], ['path', { d: 'M8.6 3.5 3.8 11.6h4.4L6.9 20.5l6.8-10.2H9.3l2.2-6.8z', fill: 'currentColor', 'fill-opacity': 0.25, stroke: 'c', 'stroke-width': 1.5 }]],
  flame: [['path', { d: 'M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.8 3-5.6 3.6-9.3 2.4 1.4 3.4 3.6 3.2 5.9 1-.8 1.6-2 1.7-3.4 2.4 1.9 4.5 4.3 4.5 7.1 0 3.4-2.7 5.9-6.5 5.9z', fill: 'url(#g-orange)', stroke: '#e0662a', 'stroke-width': 1.2 }], ['path', { d: 'M12 20.5c-1.6 0-2.7-1.1-2.7-2.6 0-1.7 1.3-2.4 1.9-3.9 1.8 1 3.5 2.3 3.5 4 0 1.4-1.1 2.5-2.7 2.5z', fill: '#ffe27a' }]],
  whirl: [['path', { d: 'M4 8.5h10.5a3 3 0 1 0-3-3M3 12.5h15.5a3 3 0 1 1-3 3M5 16.5h6', stroke: 'c', 'stroke-width': 1.9 }]],
  juggle: [['circle', { cx: 6.5, cy: 15.5, r: 3, fill: '#c9a4ff', stroke: '#8a55e6', 'stroke-width': 1.2 }], ['circle', { cx: 17.5, cy: 15.5, r: 3, fill: '#ff9fb1', stroke: '#e0506f', 'stroke-width': 1.2 }], ['circle', { cx: 12, cy: 6, r: 3, fill: '#9fdcff', stroke: '#2f8fdc', 'stroke-width': 1.2 }], ['path', { d: 'M5 11.2C6 7.6 8 6 9.3 5.6M19 11.2C18 7.6 16 6 14.7 5.6', stroke: 'c', 'stroke-width': 1.3, 'stroke-dasharray': '1.5 2.2' }]],
  sad: [['circle', { cx: 12, cy: 12, r: 9, fill: 'url(#g-sky)', stroke: '#2f8fdc', 'stroke-width': 1.1 }], ['path', { d: 'M8.4 16.4c1.9-1.9 5.3-1.9 7.2 0', stroke: '#154a7a', 'stroke-width': 1.6 }], ['circle', { cx: 9, cy: 10.4, r: 1.1, fill: '#154a7a' }], ['circle', { cx: 15, cy: 10.4, r: 1.1, fill: '#154a7a' }], ['path', { d: 'M16.6 12.3s1.3 1.6 1.3 2.4a1.3 1.3 0 0 1-2.6 0c0-.8 1.3-2.4 1.3-2.4z', fill: '#fff' }]],
  zzz: [['path', { d: 'M4 13h6.5L4 20.5h6.5', stroke: '#5b7fd6', 'stroke-width': 2.2 }], ['path', { d: 'M12.5 7h5l-5 5.8h5', stroke: '#7d9be6', 'stroke-width': 1.9 }], ['path', { d: 'M17.5 2.5h3.5l-3.5 4h3.5', stroke: '#a5bbf0', 'stroke-width': 1.6 }]],
  note: [['path', { d: 'M9 17.5V5.5l10-2v12', stroke: '#8a55e6', 'stroke-width': 1.9 }], ['ellipse', { cx: 6.7, cy: 17.6, rx: 2.8, ry: 2.2, fill: '#b58cff', stroke: '#8a55e6', 'stroke-width': 1.2 }], ['ellipse', { cx: 16.7, cy: 15.6, rx: 2.8, ry: 2.2, fill: '#b58cff', stroke: '#8a55e6', 'stroke-width': 1.2 }]],
  broken: [['path', { d: gearPath(12, 12, 6.6, 8.8, 7), fill: '#c9d1da', stroke: '#6b7682', 'stroke-width': 1.3 }], ['circle', { cx: 12, cy: 12, r: 2.6, fill: '#fff', stroke: '#6b7682', 'stroke-width': 1.3 }], ['path', { d: 'M13.5 2.5l-2.4 5.2 2.8 1.2-3.3 5.6', stroke: '#ff4d4f', 'stroke-width': 1.8 }]],
  menucard: [['rect', { x: 4.5, y: 2.5, width: 15, height: 19, rx: 2.4, fill: '#fff8ec', stroke: '#c9772f', 'stroke-width': 1.3 }], ['path', { d: 'M4.5 5a2.4 2.4 0 0 1 2.4-2.5h10.2A2.4 2.4 0 0 1 19.5 5v2.5h-15z', fill: '#ff8a3d' }],
    ['path', { d: 'M8 11.2h8M8 14.2h8M8 17.2h5', stroke: '#c9a27a', 'stroke-width': 1.4 }], ['circle', { cx: 12, cy: 5.1, r: 1.1, fill: '#fff' }]],
  pause: [['rect', { x: 6.5, y: 5, width: 3.6, height: 14, rx: 1.2, fill: 'currentColor' }], ['rect', { x: 13.9, y: 5, width: 3.6, height: 14, rx: 1.2, fill: 'currentColor' }]],
};

/** Manifest icon ids that have a vector fallback. */
export const ICON_GLYPHS = {
  icon_coin: 'coin', icon_star: 'star', icon_star_empty: 'star_empty', icon_points: 'points', icon_level: 'level',
  icon_clock: 'clock', icon_gift: 'gift', icon_energy: 'energy', icon_patience: 'patience', icon_rotate: 'rotate',
  icon_move: 'move', icon_sell: 'sell', icon_lock: 'lock', icon_water: 'water', icon_seed: 'seed', icon_harvest: 'harvest',
  tool_build: 'build', tool_staff: 'staff', tool_menu: 'menu', tool_garden: 'garden', tool_market: 'market', tool_settings: 'settings',
  emote_heart: 'heart', emote_angry: 'angry', emote_sad: 'sad', emote_zzz: 'zzz', emote_wait: 'patience',
  emote_sparkle: 'sparkles', emote_note: 'note', emote_broken: 'broken', emote_menu: 'menucard',
};

const GRADS = { 'g-gold': ['#ffe27a', '#ffb31f'], 'g-violet': ['#d7b8ff', '#9a6bff'], 'g-sky': ['#9fdcff', '#3fa5f0'], 'g-rose': ['#ff9fb1', '#ff4f74'], 'g-orange': ['#ffc07a', '#ff8a3d'] };

/** Standalone SVG data URL for a glyph (gradients inlined), for drawing on canvases. */
export function glyphDataURL(name, color = '#3a3a44') {
  const el = glyph(name, 128);
  const ser = new XMLSerializer();
  const defs = '<defs>' + Object.entries(GRADS).map(([id, [a, b]]) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`).join('') + '</defs>';
  const inner = [...el.childNodes].map((n) => ser.serializeToString(n)).join('');
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="${NS}" viewBox="-1 -1 26 26" width="128" height="128" style="color:${color}" color="${color}">${defs}${inner}</svg>`);
}

let defsDone = false;
function ensureDefs() {
  if (defsDone || typeof document === 'undefined') return;
  defsDone = true;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
  svg.style.position = 'absolute';
  svg.setAttribute('aria-hidden', 'true');
  const grads = GRADS;
  const defs = document.createElementNS(NS, 'defs');
  for (const [id, [a, b]] of Object.entries(grads)) {
    const lg = document.createElementNS(NS, 'linearGradient');
    lg.id = id; lg.setAttribute('x1', '0'); lg.setAttribute('y1', '0'); lg.setAttribute('x2', '0'); lg.setAttribute('y2', '1');
    for (const [o, c] of [[0, a], [1, b]]) { const s = document.createElementNS(NS, 'stop'); s.setAttribute('offset', o); s.setAttribute('stop-color', c); lg.appendChild(s); }
    defs.appendChild(lg);
  }
  svg.appendChild(defs);
  document.body.appendChild(svg);
}

/** SVG element for a glyph name (see G). */
export function glyph(name, size = 22, cls = 'ico glyph') {
  ensureDefs();
  const parts = G[name];
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size); svg.setAttribute('height', size);
  svg.setAttribute('class', cls + ' g-' + name);
  svg.setAttribute('aria-hidden', 'true');
  for (const [tag, attrs] of parts || []) {
    const el = document.createElementNS(NS, tag);
    let stroked = false;
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'stroke' && v === 'c') { el.setAttribute('stroke', 'currentColor'); stroked = true; continue; }
      if (k === 'stroke') stroked = true;
      el.setAttribute(k, v);
    }
    if (stroked) {
      if (!attrs['stroke-width']) el.setAttribute('stroke-width', '1.8');
      el.setAttribute('stroke-linecap', 'round'); el.setAttribute('stroke-linejoin', 'round');
    }
    if (!attrs.fill) el.setAttribute('fill', 'none');
    svg.appendChild(el);
  }
  return svg;
}

/** Button label helper: glyph + optional text. */
export function gl(name, text, size = 18) {
  const f = document.createDocumentFragment();
  f.appendChild(glyph(name, size));
  if (text) f.appendChild(document.createTextNode(text));
  return f;
}
