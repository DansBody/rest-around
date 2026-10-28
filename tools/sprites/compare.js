// Dev-only comparison (not loaded by the game): baked furniture sprites (node tools/sprites/bake.mjs <furniture type>)
// against the 3D furniture under the pixel pass, in the running game. From the console:
//   const cmp = await import('/tools/sprites/compare.js');
//   await cmp.setup(game, 'beside');   // a sprite copy of each baked piece two tiles in front of the 3D one
//   await cmp.setup(game, 'replace');  // the 3D pieces hidden, the sprites in their place
//   cmp.update(game) before every renderer.render; cmp.clear(game) removes it all.
// A card faces the camera square on (the sheet was baked at the game camera's pitch), moved toward the camera along
// the line of sight so its lower half stays above the floor, and sized so one sprite px is one scene px.
import { THREE, TILE } from '../../src/models.js';
import { DIR_YAW } from '../../src/charview.js';
import { SPRITE_LIGHT } from '../../src/spriteview.js';

const TOWARD = 2.2;   // world units the card stands out toward the camera
const sheets = new Map();
let cards = [];

async function sheet(type) {
  if (sheets.has(type)) return sheets.get(type);
  const dir = `assets/sprites/${type}/`;
  const r = await fetch(dir + type + '.json');
  if (!r.ok) { sheets.set(type, null); return null; }
  const meta = await r.json();
  const tex = await new THREE.TextureLoader().loadAsync(dir + meta.image);
  tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace;
  const s = { meta, tex };
  sheets.set(type, s);
  return s;
}

function card(s) {
  const G = s.meta.grid, H = G.height || G.canvas;
  const geo = new THREE.PlaneGeometry(G.canvas / G.ppu, H / G.ppu);
  geo.translate(0, H / 2 / G.ppu - (H - G.ground) / G.ppu, 0);   // the item's floor point at the local origin
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: s.tex }, rect: { value: new THREE.Vector4() }, light: SPRITE_LIGHT },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D map; uniform vec4 rect; uniform vec3 light; varying vec2 vUv;
      void main() { vec4 c = texture2D(map, rect.xy + vUv * rect.zw); if (c.a < 0.5) discard; gl_FragColor = vec4(c.rgb * light, 0.7); }`,
  });
  return new THREE.Mesh(geo, mat);
}

export async function setup(game, mode = 'beside') {
  clear(game);
  const r = game.renderer;
  for (const f of game.world.furniture) {
    const s = await sheet(f.type);
    if (!s) continue;
    const m = card(s);
    const [w, h] = f.fp;
    const at = new THREE.Vector3((f.x + w / 2) * TILE, 0, (f.y + h / 2 + (mode === 'beside' ? 2 : 0)) * TILE);
    if (mode === 'replace') { const v = r.furn.get(f.uid); if (v) v.obj.visible = false; }
    r.scene.add(m);
    cards.push({ m, s, f, at });
  }
  return cards.length;
}

const tmp = new THREE.Vector3(), fwd = new THREE.Vector3();
export function update(game) {
  const r = game.renderer, cam = r.cam, yaw = game.camera.yaw;
  if (!cam) return;
  cam.getWorldDirection(fwd);
  for (const c of cards) {
    const { meta } = c.s, G = meta.grid, H = G.height || G.canvas, W = meta.size[0], SH = meta.size[1];
    // which of the 4 baked views: the piece's turn from the camera, -45° - k·90°
    const rel = DIR_YAW[c.f.dir] - yaw;
    const k = (((Math.round((-rel - Math.PI / 4) / (Math.PI / 2)) % 4) + 4) % 4);
    const fr = meta.clips.Still.frames['r' + k][0];
    c.m.material.uniforms.rect.value.set(fr[0] / W, 1 - (fr[1] + fr[3]) / SH, fr[2] / W, fr[3] / SH);
    tmp.copy(cam.position).sub(c.at).normalize().multiplyScalar(TOWARD).add(c.at);
    c.m.position.copy(tmp);
    c.m.quaternion.copy(cam.quaternion);
    const depth = tmp.sub(cam.position).dot(fwd);
    const perPx = (2 * depth * Math.tan((cam.fov * Math.PI) / 360)) / r.gl.domElement.height;
    c.m.scale.setScalar(perPx * G.ppu);
    c.m.visible = r.pixelArt;
  }
}

export function clear(game) {
  const r = game.renderer;
  for (const c of cards) { r.scene.remove(c.m); c.m.geometry.dispose(); c.m.material.dispose(); }
  cards = [];
  for (const v of r.furn.values()) v.obj.visible = true;
}
