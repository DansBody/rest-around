// Asset pipeline: loads assets/manifest.json, probes every PNG it lists, and generates a placeholder
// for anything missing. Dropping a correctly named PNG into assets/ replaces its placeholder on the
// next reload — no code changes. All sizes, anchors and offsets come from the manifest.
import { makePlaceholder } from './placeholder.js';
import { configureIso } from './iso.js';

const BASE = 'assets/';

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth > 0 ? img : null);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

class AssetStore {
  constructor() {
    this.manifest = null;
    this.defs = new Map();     // id -> manifest entry
    this.images = new Map();   // `${id}|${dir}` -> { img, flipImg, placeholder }
    this.tintCache = new Map();
    this.urlCache = new Map();
    this.warned = new Set();
  }

  get grid() { return this.manifest.grid; }
  get rig() { return this.manifest.characterRig; }

  async load(onProgress) {
    const res = await fetch(BASE + 'manifest.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('Could not load assets/manifest.json (' + res.status + ')');
    this.manifest = await res.json();
    configureIso(this.manifest.grid);
    const jobs = [];
    for (const def of this.manifest.assets) {
      this.defs.set(def.id, def);
      for (const dir of def.directions) jobs.push([def, dir]);
    }
    let done = 0;
    const fontJob = this.loadFont();
    await Promise.all(jobs.map(async ([def, dir]) => {
      const file = def.file.replace('{dir}', dir);
      const img = await loadImage(BASE + file + '?v=' + (this.manifest.version || 1));
      const cat = this.manifest.categoryColors[def.category] || '#e8dccb';
      const grid = this.manifest.grid;
      let rec;
      if (img) rec = { img, flipImg: img, placeholder: false, file };
      else rec = { img: makePlaceholder(def, dir, grid, cat, false), flipImg: null, placeholder: true, file, cat };
      if (rec.placeholder) {
        // lazily-built flipped-label version for mirrored drawing
        Object.defineProperty(rec, 'flipImg', { configurable: true, get: () => { const c = makePlaceholder(def, dir, grid, cat, true); Object.defineProperty(rec, 'flipImg', { value: c }); return c; } });
      }
      this.images.set(def.id + '|' + dir, rec);
      done++;
      if (onProgress) onProgress(done / jobs.length);
    }));
    await fontJob;
  }

  async loadFont() {
    const f = this.manifest.font;
    if (!f || !f.file || typeof FontFace === 'undefined') return;
    try {
      const res = await fetch(BASE + f.file, { method: 'HEAD' });
      if (!res.ok) return;
      const face = new FontFace(f.family, `url(${BASE + f.file})`);
      await face.load();
      document.fonts.add(face);
      document.documentElement.style.setProperty('--font', `'${f.family}', ${f.fallback}`);
    } catch { /* keep fallback font */ }
  }

  def(id) {
    const d = this.defs.get(id);
    if (!d && !this.warned.has(id)) { this.warned.add(id); console.warn('Unknown asset id', id); }
    return d;
  }

  /** Resolve an asset + facing (fl/fr/bl/br/any) to a drawable record. */
  sprite(id, facing = 'fl') {
    const def = this.def(id);
    if (!def) return null;
    let key, flip = false;
    if (def.directions[0] === 'any') key = 'any';
    else {
      const base = facing && facing[0] === 'b' ? 'bl' : 'fl';
      key = def.directions.includes(base) ? base : def.directions[0];
      flip = facing === 'fr' || facing === 'br';
    }
    const rec = this.images.get(id + '|' + key);
    if (!rec) return null;
    return { def, key, flip, rec, img: flip ? rec.flipImg : rec.img, w: def.size[0], h: def.size[1], ax: def.anchor ? def.anchor[0] : def.size[0] / 2, ay: def.anchor ? def.anchor[1] : def.size[1] / 2 };
  }

  isPlaceholder(id) {
    const def = this.defs.get(id);
    if (!def) return true;
    return def.directions.some((d) => this.images.get(id + '|' + d)?.placeholder);
  }
  placeholderIds() { return [...this.defs.keys()].filter((id) => this.isPlaceholder(id)); }

  /** Multiply-tint an image, preserving its alpha. Cached per image+color. */
  tinted(sp, tint) {
    const k = sp.def.id + '|' + sp.key + '|' + (sp.flip ? 1 : 0) + '|' + tint;
    let c = this.tintCache.get(k);
    if (!c) {
      c = document.createElement('canvas');
      c.width = sp.w; c.height = sp.h;
      const g = c.getContext('2d');
      g.drawImage(sp.img, 0, 0, sp.w, sp.h);
      g.globalCompositeOperation = 'multiply';
      g.fillStyle = tint; g.fillRect(0, 0, sp.w, sp.h);
      g.globalCompositeOperation = 'destination-in';
      g.drawImage(sp.img, 0, 0, sp.w, sp.h);
      this.tintCache.set(k, c);
    }
    return c;
  }

  /**
   * Draw a sprite with its manifest anchor at (x, y). Opts: tint, alpha, sx, sy, rot, facing.
   * heightOffset from the manifest lifts the sprite.
   */
  draw(ctx, id, facing, x, y, o = {}) {
    const sp = this.sprite(id, facing);
    if (!sp) return null;
    const img = o.tint && sp.def.tintable !== false ? this.tinted(sp, o.tint) : sp.img;
    const sx = o.sx ?? o.scale ?? 1, sy = o.sy ?? o.scale ?? 1;
    ctx.save();
    if (o.alpha != null) ctx.globalAlpha *= o.alpha;
    ctx.translate(x, y - (sp.def.heightOffset || 0) * sy);
    if (o.rot) ctx.rotate(o.rot);
    ctx.scale(sp.flip ? -sx : sx, sy);
    ctx.drawImage(img, -sp.ax, -sp.ay, sp.w, sp.h);
    ctx.restore();
    return sp;
  }

  /** Draw an icon centered on (x, y) scaled to fit `size` pixels. */
  drawIcon(ctx, id, x, y, size, o = {}) {
    const sp = this.sprite(id, 'any');
    if (!sp) return;
    const s = size / Math.max(sp.w, sp.h);
    ctx.save();
    if (o.alpha != null) ctx.globalAlpha *= o.alpha;
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.drawImage(o.tint ? this.tinted(sp, o.tint) : sp.img, -sp.w / 2, -sp.h / 2, sp.w, sp.h);
    ctx.restore();
  }

  /** Data URL for DOM use (icons, 9-slice frames). */
  url(id, tint) {
    const k = id + '|' + (tint || '');
    if (this.urlCache.has(k)) return this.urlCache.get(k);
    const sp = this.sprite(id, 'fl');
    if (!sp) return '';
    const c = document.createElement('canvas');
    c.width = sp.w; c.height = sp.h;
    c.getContext('2d').drawImage(tint ? this.tinted(sp, tint) : sp.img, 0, 0, sp.w, sp.h);
    const u = c.toDataURL();
    this.urlCache.set(k, u);
    return u;
  }

  /** <img> element for an icon (title = asset id so placeholders are identifiable). */
  iconEl(id, size = 24, cls = 'ico', tint) {
    const img = new Image();
    img.src = this.url(id, tint);
    const d = this.defs.get(id);
    const [w, h] = d ? d.size : [1, 1];
    // fit inside a size×size box keeping the manifest aspect ratio
    img.width = Math.round(w >= h ? size : (size * w) / h); img.height = Math.round(w >= h ? (size * h) / w : size);
    img.className = cls;
    img.draggable = false;
    img.alt = '';
    if (this.isPlaceholder(id)) img.title = id + ' (placeholder)';
    return img;
  }
}

export const assets = new AssetStore();
