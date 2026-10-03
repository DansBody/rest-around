// UI images rendered from the 3D models: character portraits, build-shop thumbnails and food icons.
import { THREE, models, renderIcon } from './models.js';
import { CharacterView } from './charview.js';
import { assets } from './assets.js';
import { ICON_GLYPHS, glyphDataURL } from './ui/icons.js';

const cache = new Map();
function copy(c, w, h) {
  const n = document.createElement('canvas');
  n.width = c.width; n.height = c.height;
  n.style.width = w + 'px'; n.style.height = h + 'px';
  n.getContext('2d').drawImage(c, 0, 0);
  return n;
}

/** Idle-pose character portrait (square; w/h are the box it should fit). */
export function portrait(look, w = 64, h = 80, cls = 'portrait') {
  w = h = Math.min(w, h);
  const key = 'p|' + JSON.stringify(look);
  let c = cache.get(key);
  if (!c) {
    const scene = new THREE.Scene();
    const cv = new CharacterView(scene, { look, x: 0, y: 0, dir: 1, pose: {} });
    if (cv.inst.mixer) cv.inst.mixer.update(0.5);
    cv.root.position.set(0, 0, 0); cv.root.rotation.y = 0.35;
    c = renderIcon(cv.root, 192, { pitch: 0.22, pad: 0.5 });
    cache.set(key, c);
  }
  const out = copy(c, w, h);
  out.className = cls;
  out.style.objectFit = 'contain';
  return out;
}

/** Thumbnail for a build-shop item: a 3D model (tinted) or a surface texture swatch. */
export function thumb(assetId, tint, w = 72, h = 64) {
  const key = 't|' + assetId + '|' + (tint || '');
  let c = cache.get(key);
  if (!c) {
    if (models.def(assetId)) c = renderIcon(models.instance(assetId, tint), 160, { pad: 0.6 });
    else {
      c = document.createElement('canvas'); c.width = 160; c.height = 140;
      const sp = assets.sprite(assetId, 'any');
      if (sp) {
        const g = c.getContext('2d');
        const img = tint && sp.def.tintable ? assets.tinted(sp, tint) : sp.img;
        // show the swatch as a little isometric tile
        g.translate(80, 70); g.scale(1, 0.5); g.rotate(Math.PI / 4);
        g.drawImage(img, -55, -55, 110, 110);
        g.strokeStyle = 'rgba(110,80,60,0.5)'; g.lineWidth = 3; g.strokeRect(-55, -55, 110, 110);
      }
    }
    cache.set(key, c);
  }
  return copy(c, w, h);
}

/** In-world bubbles and floating icons draw 2D sprites: use the vector glyphs for them too. */
export async function bakeGlyphIcons() {
  await Promise.all(Object.entries(ICON_GLYPHS).map(([id, name]) => new Promise((resolve) => {
    const def = assets.def(id);
    if (!def || !assets.isPlaceholder(id)) return resolve();
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      c.getContext('2d').drawImage(img, 0, 0, 128, 128);
      assets.override(id, c, true); // still a "placeholder": DOM icons keep using the crisp SVG
      resolve();
    };
    img.onerror = () => resolve();
    img.src = glyphDataURL(name);
  })));
}

/** Food/ingredient icons: render from the model of the same id unless a real PNG was provided. */
export function bakeModelIcons() {
  for (const def of assets.manifest.assets) {
    if (!def.model || !models.def(def.model)) continue;
    if (!assets.isPlaceholder(def.id)) continue; // a hand-made PNG wins
    const c = renderIcon(models.instance(def.model), 128, { pad: 0.58 });
    assets.override(def.id, c, models.isPlaceholder(def.model));
  }
}
