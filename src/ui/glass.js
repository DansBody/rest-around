// "Liquid glass": frosted panels whose rims bend the scene behind them like a lens.
// The frosted blur, tint and specular rim are plain CSS (style.css, .glass). On Chromium the rim
// refraction is added with an SVG displacement filter used as a backdrop-filter; other browsers
// keep the CSS blur. Each element gets a displacement map generated for its exact size.
const NS = 'http://www.w3.org/2000/svg';

export const glassFx = {
  supported: typeof navigator !== 'undefined' && !!(navigator.userAgentData && navigator.userAgentData.brands.some((b) => /Chromium/.test(b.brand))),
  enabled: true,
  svg: null,
  items: new Map(), // element -> { id, w, h, opts, filter }
  seq: 0,
  ro: null,

  init() {
    if (!this.supported || this.svg) return;
    this.svg = document.createElementNS(NS, 'svg');
    this.svg.setAttribute('width', '0'); this.svg.setAttribute('height', '0');
    this.svg.setAttribute('aria-hidden', 'true');
    this.svg.style.position = 'absolute';
    document.body.appendChild(this.svg);
    this.ro = new ResizeObserver((entries) => { for (const e of entries) this.refresh(e.target); });
  },

  /**
   * Give an element lens-edge refraction. opts: radius (px, default from CSS), bezel (px width of the
   * bending rim), strength (max displacement px), blur (frost, px), saturate.
   */
  attach(el, opts = {}) {
    this.init();
    if (!this.supported || this.items.has(el)) return;
    this.items.set(el, { id: 'lg' + this.seq++, w: 0, h: 0, opts, filter: null });
    this.ro.observe(el);
    this.refresh(el);
  },

  setEnabled(on) {
    this.enabled = on;
    for (const el of this.items.keys()) { const it = this.items.get(el); it.w = 0; this.refresh(el); }
  },

  refresh(el) {
    const it = this.items.get(el);
    if (!it) return;
    if (!this.enabled) { el.style.backdropFilter = ''; el.classList.remove('lg-on'); return; }
    const w = Math.round(el.offsetWidth), h = Math.round(el.offsetHeight);
    if (w < 8 || h < 8) return;
    if (Math.abs(w - it.w) < 2 && Math.abs(h - it.h) < 2 && it.filter) return;
    it.w = w; it.h = h;
    const o = it.opts;
    const cs = getComputedStyle(el);
    const radius = Math.min(o.radius ?? (parseFloat(cs.borderTopLeftRadius) || 20), w / 2, h / 2);
    const bezel = Math.min(o.bezel ?? 16, radius + 6, w / 2, h / 2);
    const url = displacementMap(w, h, radius, bezel);
    if (it.filter) it.filter.remove();
    const f = document.createElementNS(NS, 'filter');
    f.id = it.id;
    for (const [k, v] of Object.entries({ x: 0, y: 0, width: w, height: h, filterUnits: 'userSpaceOnUse', primitiveUnits: 'userSpaceOnUse', 'color-interpolation-filters': 'sRGB' })) f.setAttribute(k, v);
    f.innerHTML =
      `<feGaussianBlur in="SourceGraphic" stdDeviation="${o.blur ?? 6}" edgeMode="duplicate" result="b"/>` +
      `<feImage href="${url}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" result="m"/>` +
      `<feDisplacementMap in="b" in2="m" scale="${o.strength ?? 36}" xChannelSelector="R" yChannelSelector="G" result="d"/>` +
      `<feColorMatrix in="d" type="saturate" values="${o.saturate ?? 1.7}"/>`;
    this.svg.appendChild(f);
    it.filter = f;
    el.style.backdropFilter = `url(#${it.id})`;
    el.classList.add('lg-on');
  },
};

/** RG displacement map for a rounded rect: samples are pulled inward near the rim (lens edge). */
function displacementMap(w, h, r, bezel) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  const d = img.data;
  const hx = w / 2, hy = h / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // signed distance to the rounded rect (negative inside) and its outward normal
      const px = x + 0.5 - hx, py = y + 0.5 - hy;
      const qx = Math.abs(px) - (hx - r), qy = Math.abs(py) - (hy - r);
      let nx, ny, sd;
      if (qx > 0 && qy > 0) { const l = Math.hypot(qx, qy); sd = l - r; nx = qx / l; ny = qy / l; }
      else if (qx > qy) { sd = qx - r; nx = 1; ny = 0; } else { sd = qy - r; nx = 0; ny = 1; }
      nx *= Math.sign(px) || 1; ny *= Math.sign(py) || 1;
      const depth = -sd;
      let m = 0;
      if (depth < bezel) { const t = 1 - Math.max(0, depth) / bezel; m = t * t * (3 - 2 * t); }
      const i = (y * w + x) * 4;
      d[i] = 128 - nx * m * 127;
      d[i + 1] = 128 - ny * m * 127;
      d[i + 2] = 128; d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c.toDataURL();
}
