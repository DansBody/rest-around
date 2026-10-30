// UI images rendered from the 3D models: character portraits, build-shop thumbnails and food icons. With the pixel look
// on (pixelview.js) a portrait is drawn as the café draws the character: toon light, the sprites' PPU, an ink outline.
import { THREE, models, renderIcon } from './models.js';
import { CharacterView } from './charview.js';
import { PPU, pixelLook, toonize, bakeLights, InkPass } from './pixelview.js';
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

// the pixel portraits' own renderer (tone mapped as the sprite bake, unlike renderIcon's)
let pxGl = null, pxInk = null;
const ELEV = (18 * Math.PI) / 180, TURN = 0.5;   // the sprite bake's view (tools/sprites/schedule.json: elev, turn)
/** A character in the pixel look, `ppu` pixels to a unit, on a transparent square just big enough. */
function pixelArt(look, ppu) {
  if (!pxGl) {
    pxGl = new THREE.WebGLRenderer({ antialias: false, alpha: true, preserveDrawingBuffer: true });
    pxGl.setClearColor(0x000000, 0);
    pxGl.outputColorSpace = THREE.SRGBColorSpace;
    pxGl.toneMapping = THREE.NeutralToneMapping;
    pxInk = new InkPass(pxGl);
  }
  const scene = new THREE.Scene();
  bakeLights(scene);
  const cv = new CharacterView(scene, { look, x: 0, y: 0, dir: 1, pose: {} }, { shadow: false });
  toonize(cv.root);
  if (cv.inst.mixer) cv.inst.mixer.update(0.5);
  cv.root.position.set(0, 0, 0); cv.root.rotation.y = TURN;
  cv.root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(cv.root), c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
  const n = Math.ceil(Math.max(s.x, s.y) * 1.08 * ppu) + 2, r = n / ppu / 2;
  const cam = new THREE.OrthographicCamera(-r, r, r, -r, 0.1, 40);
  cam.position.set(c.x, c.y + 10 * Math.sin(ELEV), c.z + 10 * Math.cos(ELEV));
  cam.lookAt(c);
  pxGl.setSize(n, n, false);
  pxInk.render(scene, cam, n, n);
  const out = document.createElement('canvas');
  out.width = out.height = n;
  out.getContext('2d').drawImage(pxGl.domElement, 0, 0);
  cv.dispose(scene);
  return out;
}
/** The pixel portrait for a box `size` CSS px across: the art blown up a whole number of times, past the screen's pixels. */
function pixelPortrait(look, size) {
  const dpr = window.devicePixelRatio || 1, want = size * dpr;
  // the café's PPU when the box has the room for it, fewer pixels to a unit (still crisp) on a small low-dpi box
  const ppu = Math.max(12, Math.min(PPU, Math.floor(want / 2.4)));
  const key = 'px|' + ppu + '|' + JSON.stringify(look);
  let art = cache.get(key);
  if (!art) cache.set(key, (art = pixelArt(look, ppu)));
  const k = Math.max(1, Math.ceil(want / art.width));
  const big = document.createElement('canvas');
  big.width = big.height = art.width * k;
  const g = big.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(art, 0, 0, big.width, big.height);
  return big;
}

/** Idle-pose character portrait (square; w/h are the box it should fit). */
export function portrait(look, w = 64, h = 80, cls = 'portrait') {
  w = h = Math.min(w, h);
  if (pixelLook.on) {
    const out = pixelPortrait(look, w);
    out.style.width = w + 'px'; out.style.height = h + 'px';
    out.className = cls;
    out.style.objectFit = 'contain';
    return out;
  }
  const key = 'p|' + JSON.stringify(look);
  let c = cache.get(key);
  if (!c) {
    const scene = new THREE.Scene();
    const cv = new CharacterView(scene, { look, x: 0, y: 0, dir: 1, pose: {} }, { shadow: false });
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
