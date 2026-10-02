// Real-time 3D renderer (three.js). The simulation is unchanged: this module mirrors the world,
// furniture, agents and trash into a scene every frame, and draws speech bubbles, bars,
// name tags and floating numbers on a 2D overlay canvas projected from 3D positions.
import { THREE, models, TILE } from './models.js';
import { assets } from './assets.js';
import { CharacterView } from './charview.js';
import { AbilityFx } from './abilityfx.js';
import { DOOR_Y, World } from './world.js';
import { furnitureById, dishById, wallDecorById, wallLayout } from './data.js';
import { clamp, easeOutBack, lerp } from './util.js';
import { FONT, DISPLAY_FONT } from './placeholder.js';
import { t } from './i18n.js';

const DIR_YAW = [Math.PI / 2, 0, -Math.PI / 2, Math.PI];
const Y_UP = new THREE.Vector3(0, 1, 0);
const tmpV = new THREE.Vector3();

function lam(color, o = {}) { return new THREE.MeshLambertMaterial({ color, ...o }); }
/** A little painted sign (shop sign, OPEN plaque) as a texture. */
function signTexture(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function hexMix(a, b, t) { return new THREE.Color(a).lerp(new THREE.Color(b), clamp(t, 0, 1)); }

export class Renderer {
  constructor(glCanvas, overlay, game) {
    this.game = game;
    this.canvas = glCanvas;
    this.overlay = overlay;
    this.ctx = overlay.getContext('2d');
    this.time = 0;
    this.dpr = 1;
    // phones and tablets: fewer pixels and a cheaper, smaller shadow map keep them cool and smooth
    this.lowPower = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
    this.gl = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, powerPreference: this.lowPower ? 'low-power' : 'high-performance' });
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = this.lowPower ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(game.camera.fov, 1, 0.5, 500);
    this.env = assets.manifest.environment || {};
    this.texCache = new Map();
    this.furn = new Map();      // uid -> view
    this.chars = new Map();     // agent/walker -> CharacterView
    this.trash = new Map();
    this.lampLights = [];
    this.decoLights = [];
    this.raycaster = new THREE.Raycaster();
    this.setupLights();
    this.buildOutdoors();
    this.roomSize = 0;
    this.floorKey = '';
    this.buildGroup = new THREE.Group(); this.scene.add(this.buildGroup);
    this.abilityFx = new AbilityFx(this.scene);
    this.debugGroup = new THREE.Group(); this.scene.add(this.debugGroup);
  }

  // ------------------------------------------------------------------ setup
  tex(id, repeat = 1) {
    const k = id + '|' + repeat;
    if (this.texCache.has(k)) return this.texCache.get(k);
    const sp = assets.sprite(id, 'any');
    const t = new THREE.Texture(sp ? sp.img : undefined);
    t.needsUpdate = true;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    this.texCache.set(k, t);
    return t;
  }

  setupLights() {
    const s = this.scene;
    this.hemi = new THREE.HemisphereLight(0xfff6e8, 0xb7a58e, 1.35);
    s.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff1dc, 2.1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(this.lowPower ? 1024 : 2048, this.lowPower ? 1024 : 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 3;
    s.add(this.sun); s.add(this.sun.target);
    this.fill = new THREE.DirectionalLight(0xdfe8ff, 0.35);
    this.fill.position.set(40, 20, -10);
    s.add(this.fill);
    s.background = new THREE.Color(this.env.background || '#bfe3f2');
    s.fog = new THREE.Fog(s.background, 90, 190);
  }

  buildOutdoors() {
    const g = new THREE.Group();
    this.scene.add(g);
    // lawn
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), lam('#ffffff', { map: this.tex('tex_grass', 65) }));
    grass.rotation.x = -Math.PI / 2; grass.position.set(20, -0.02, 20); grass.receiveShadow = true;
    g.add(grass);
    // street behind the door-side wall: sidewalk (x -6..-2), road (-12..-6), far sidewalk (-14..-12)
    const strip = (x0, x1, texId, y, rep) => {
      const w = x1 - x0, L = 200;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, L), lam('#ffffff', { map: this.tex(texId, 1) }));
      m.material.map = m.material.map.clone(); m.material.map.needsUpdate = true; m.material.map.repeat.set(w / rep, L / rep);
      m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, y, 20); m.receiveShadow = true;
      g.add(m);
    };
    strip(-6, -2, 'tex_path', 0.01, 2);
    strip(-12, -6, 'tex_road', 0.005, 4);
    strip(-14, -12, 'tex_path', 0.01, 2);
    const curb = lam('#e9e2d6');
    for (const x of [-6, -12]) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.14, 200), curb); c.position.set(x, 0.07, 20); c.receiveShadow = true; g.add(c); }
    const dash = lam('#fbf8ef');
    for (let z = -80; z < 120; z += 4) { const d = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.02, 1.8), dash); d.position.set(-9, 0.02, z); g.add(d); }
    // door path
    const path = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), lam('#ffffff', { map: this.tex('tex_path', 1) }));
    path.rotation.x = -Math.PI / 2; path.position.set(-1, 0.012, (DOOR_Y + 0.5) * TILE); path.receiveShadow = true;
    g.add(path);
    // street lamps
    for (const z of [-4, 22]) g.add(this.streetLamp(-5.4, z));
    this.outdoorGroup = g;
    this.treeGroup = new THREE.Group(); g.add(this.treeGroup);
  }

  streetLamp(x, z) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 4, 8), lam('#6d6a7a')); pole.position.y = 2; pole.castShadow = true; g.add(pole);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 10), new THREE.MeshBasicMaterial({ color: '#fff4c8' })); head.position.y = 4.1; g.add(head);
    head.userData.streetLamp = true;
    g.position.set(x, 0, z);
    return g;
  }

  tree(x, z, s = 1, seed = 0) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * s, 0.3 * s, 1.6 * s, 7), lam('#a8744e'));
    trunk.position.y = 0.8 * s; trunk.castShadow = true; g.add(trunk);
    const greens = ['#7cc47a', '#8fd18a', '#6fb56d'];
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Mesh(new THREE.IcosahedronGeometry((1.1 - i * 0.18) * s, 0), lam(greens[(i + seed) % 3], { flatShading: true }));
      c.position.set(Math.sin(i * 2.1 + seed) * 0.35 * s, (1.9 + i * 0.75) * s, Math.cos(i * 2.1 + seed) * 0.35 * s);
      c.rotation.set(seed + i, i, seed); c.castShadow = true; g.add(c);
    }
    g.position.set(x, 0, z);
    return g;
  }

  buildRoom(n) {
    if (this.room) this.scene.remove(this.room);
    const room = new THREE.Group();
    this.room = room;
    this.scene.add(room);
    const W = n * TILE, H = assets.grid.wallHeight || 3, T = assets.grid.wallThickness || 0.24;
    // foundation slab
    const slab = new THREE.Mesh(new THREE.BoxGeometry(W + 0.6, 0.3, W + 0.6), lam(this.env.foundation || '#e9dcc6'));
    slab.position.set(W / 2, -0.15, W / 2); slab.receiveShadow = true; room.add(slab);
    this.floorGroup = new THREE.Group(); room.add(this.floorGroup);
    this.floorKey = '';
    // walls: 4 sides, each tile a segment (so the door can be a gap); front sides turn into low cutaways
    this.wallMat = lam('#ffffff', { map: this.tex('tex_wall_plain', 1) });
    const wain = lam(this.env.wainscot || '#e9dcc9'), cap = lam(this.env.wallCap || '#fffaf1');
    this.sides = [];
    const mkSide = (name, outward) => { const s = new THREE.Group(); s.userData = { name, outward, h: 1 }; room.add(s); this.sides.push(s); return s; };
    const seg = (side, cx, cz, alongX, len = TILE, y0 = 0, y1 = H, withWain = true) => {
      const w = alongX ? len : T, d = alongX ? T : len;
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, y1 - y0, d), this.wallMat);
      body.position.set(cx, (y0 + y1) / 2, cz); body.castShadow = true; body.receiveShadow = true; side.add(body);
      if (withWain && y0 === 0) { const wn = new THREE.Mesh(new THREE.BoxGeometry(w + (alongX ? 0 : 0.06), 0.7, d + (alongX ? 0.06 : 0)), wain); wn.position.set(cx, 0.35, cz); wn.receiveShadow = true; side.add(wn); }
      const c = new THREE.Mesh(new THREE.BoxGeometry(w + (alongX ? 0 : 0.1), 0.12, d + (alongX ? 0.1 : 0)), cap); c.position.set(cx, y1 + 0.06, cz); side.add(c);
    };
    const west = mkSide('west', { x: -1, z: 0 }), north = mkSide('north', { x: 0, z: -1 }), east = mkSide('east', { x: 1, z: 0 }), south = mkSide('south', { x: 0, z: 1 });
    for (let i = 0; i < n; i++) {
      const c = i * TILE + TILE / 2;
      if (i === DOOR_Y) {
        // doorway: two posts and a lintel
        seg(west, -T / 2, i * TILE + 0.2, false, 0.4);
        seg(west, -T / 2, i * TILE + TILE - 0.2, false, 0.4);
        seg(west, -T / 2, c, false, TILE - 0.8, 2.35, H, false);
      } else seg(west, -T / 2, c, false);
      seg(north, c, -T / 2, true);
      seg(east, W + T / 2, c, false);
      seg(south, c, W + T / 2, true);
    }
    // corner posts
    for (const [x, z] of [[-T / 2, -T / 2], [W + T / 2, -T / 2], [-T / 2, W + T / 2], [W + T / 2, W + T / 2]]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(T, H + 0.12, T), cap); p.position.set(x, (H + 0.12) / 2, z); p.castShadow = true;
      (x < 0 ? west : east).add(p);
    }
    // front door (hinged on the lintel side), swings inward
    this.door = new THREE.Group();
    const leaf = models.instance('m_door'); leaf.scale.setScalar(0.78);
    this.door.add(leaf);
    this.door.position.set(-T / 2, 0, DOOR_Y * TILE + 0.37);
    room.add(this.door);
    this.buildDressing(room, W, T);
    // trees around this room size
    this.treeGroup.clear();
    const trees = [[-17, -8, 1.3], [-17, 8, 1.1], [-16.5, 30, 1.4], [W + 9, -5, 1.2], [W + 12, W * 0.7, 1.4], [W + 7, W + 9, 1.1], [W * 0.3, W + 10, 1.3], [-3, W + 9, 1.0], [W * 0.7, -9, 1.25], [4, -10, 1.1]];
    trees.forEach(([x, z, s], i) => this.treeGroup.add(this.tree(x, z, s, i)));
    this.roomSize = n;
  }

  /** Café dressing that belongs to the building: OPEN plaque, shop sign, door mat, flower boxes outside. */
  buildDressing(room, W, T) {
    // wall decoration groups (one per wall, so each can hide with its wall's cut-away)
    this.decoSides = {};
    for (const side of this.sides) { const dg = new THREE.Group(); room.add(dg); this.decoSides[side.userData.name] = dg; side.userData.deco = dg; }
    this.wallKey = '';
    this.decoLights = [];

    // OPEN plaque, hanging on the inside of the door
    const openTex = signTexture(256, 144, (ctx, w, h) => {
      ctx.fillStyle = '#2f7d6b'; roundRect(ctx, 6, 6, w - 12, h - 12, 26); ctx.fill();
      ctx.lineWidth = 8; ctx.strokeStyle = '#f7ecd8'; ctx.stroke();
      ctx.fillStyle = '#f7ecd8'; ctx.font = `800 70px ${DISPLAY_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('OPEN', w / 2, h / 2 + 4);
    });
    const open = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.26), new THREE.MeshBasicMaterial({ map: openTex, transparent: true }));
    open.rotation.y = Math.PI; open.position.set(0.62, 1.55, -0.33);
    this.door.add(open);

    // shop sign above the doorway (both faces)
    const signTex = signTexture(512, 160, (ctx, w, h) => {
      ctx.fillStyle = '#6e4328'; roundRect(ctx, 4, 4, w - 8, h - 8, 30); ctx.fill();
      ctx.lineWidth = 7; ctx.strokeStyle = '#f0d3a2'; roundRect(ctx, 14, 14, w - 28, h - 28, 22); ctx.stroke();
      ctx.fillStyle = '#fbeed6'; ctx.font = `800 84px ${DISPLAY_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('Refillit', w / 2 - 22, h / 2 + 6);
      ctx.font = '700 64px sans-serif'; ctx.fillText('\u2615', w - 76, h / 2 + 4);
    });
    const sign = new THREE.Group();
    for (const [rot, off] of [[0, 0.05], [Math.PI, -0.05]]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 0.78), new THREE.MeshBasicMaterial({ map: signTex, transparent: true }));
      m.rotation.y = rot; m.position.z = off; sign.add(m);
    }
    sign.rotation.y = Math.PI / 2;      // faces ±x, i.e. the street and the room
    sign.position.set(-T / 2, 2.62, DOOR_Y * TILE + TILE / 2);
    room.add(sign);
    this.signMesh = sign;

    // door mat just inside the door (lies diagonal so its cup reads upright from the default camera)
    const matHolder = new THREE.Group();
    const matMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.4), lam('#ffffff', { map: this.tex('tex_doormat', 1), transparent: true }));
    matMesh.rotation.x = -Math.PI / 2; matMesh.receiveShadow = true;
    matHolder.add(matMesh); matHolder.rotation.y = Math.PI / 4; matHolder.position.set(1.7, 0.016, (DOOR_Y + 0.5) * TILE);
    room.add(matHolder);

    // flower boxes and a welcome sign outside
    const outside = (id, x, z, rot, sc = 1) => { const o = models.instance(id); o.position.set(x, 0, z); o.rotation.y = rot; o.scale.setScalar(sc); room.add(o); };
    outside('m_welcome_sign', -1.5, DOOR_Y * TILE - 0.9, -Math.PI / 2 + 0.25);
    outside('m_flower_box', -1.1, DOOR_Y * TILE + TILE + 1.4, -Math.PI / 2, 0.9);
    for (const f of [0.22, 0.52, 0.8]) outside('m_flower_box', W * f, W + 1.15, Math.PI, 0.95);
    for (const f of [0.28, 0.7]) outside('m_flower_box', W + 1.15, W * f, -Math.PI / 2, 0.95);
    outside('m_planter', W * 0.5, -1.2, 0, 1);
  }

  /** Put a wall piece's holder flat against `side`, `a` world units along it. */
  hangOn(holder, side, a, w, sz) {
    const W = this.game.world.size * TILE, d = sz.z / 2 + 0.04, y = w.y - sz.y / 2;
    holder.rotation.y = 0;
    if (side === 'north') holder.position.set(a, y, d);
    else if (side === 'west') { holder.position.set(d, y, a); holder.rotation.y = Math.PI / 2; }
    else if (side === 'east') { holder.position.set(W - d, y, a); holder.rotation.y = -Math.PI / 2; }
    else { holder.position.set(a, y, W - d); holder.rotation.y = Math.PI; }
  }
  /** Hang the owned wall decorations where the player put them (older saves fill the default slots). */
  syncWallDecor() {
    const g = this.game, b = g.build;
    const lifted = b.active && b.movingWall;   // the piece being moved is drawn as the ghost instead
    const owned = (g.state.wallDeco || []).filter((id) => wallDecorById[id] && id !== lifted);
    const layout = wallLayout(g.world.size, DOOR_Y, owned, g.state.wallPos);
    const key = g.world.size + '|' + owned.map((id) => layout[id] ? `${id}@${layout[id].side}${layout[id].a}` : id).join(',');
    if (key !== this.wallKey) {
      this.wallKey = key;
      for (const dg of Object.values(this.decoSides)) dg.clear();
      this.decoLights = [];
      for (const id of owned) {
        const w = wallDecorById[id], spot = layout[id];
        if (!spot) continue;
        const o = models.instance(w.asset, w.tint);
        o.traverse((m) => { if (m.isMesh) m.castShadow = false; });
        const sz = new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3());
        const holder = new THREE.Group();
        holder.add(o);
        if (w.light) { const L = new THREE.PointLight(0xffc98a, 0, 7, 1.5); L.position.set(0, sz.y * 0.6, 0.55); holder.add(L); this.decoLights.push(L); }
        this.hangOn(holder, spot.side, spot.a, w, sz);
        this.decoSides[spot.side].add(holder);
      }
    }
    const glow = 0.5 + this.lampOn * 3;
    for (const L of this.decoLights) L.intensity = glow;
  }

  /** Draw another café (a friend's while visiting, then yours again): drop every view of the old one; the next frame builds the new. */
  show(game) {
    if (game === this.game) return;
    for (const v of this.furn.values()) this.scene.remove(v.obj);
    this.furn.clear();
    for (const cv of this.chars.values()) cv.dispose(this.scene);
    this.chars.clear();
    for (const o of this.trash.values()) this.scene.remove(o);
    this.trash.clear();
    this.roomSize = 0;   // rebuilds the room, the walls' decorations and the floor
    this.game = game;
    game.renderer = this;
    this.resize();
  }

  // ------------------------------------------------------------------ per frame
  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(this.lowPower ? 1.5 : 2, window.devicePixelRatio || 1);
    this.gl.setPixelRatio(this.dpr);
    this.gl.setSize(r.width, r.height, false);
    this.overlay.width = Math.round(r.width * this.dpr);
    this.overlay.height = Math.round(r.height * this.dpr);
    this.cam.aspect = r.width / Math.max(1, r.height);
    this.cam.updateProjectionMatrix();
    this.game.camera.setViewport(r.width, r.height);
  }

  render(realDt) {
    const g = this.game;
    this.time += realDt;
    const c = g.camera;
    c.update(realDt);
    const p = c.position();
    this.cam.position.set(p.x, p.y, p.z);
    this.cam.lookAt(c.tx, 0.8, c.tz);
    this.cam.fov = c.fov; this.cam.updateProjectionMatrix();
    if (this.roomSize !== g.world.size) { this.buildRoom(g.world.size); g.camera.setRoom(g.world.size); }
    this.updateLighting(realDt);
    this.syncFloors();
    this.syncWalls(realDt);
    this.syncWallDecor();
    this.syncDoor();
    this.syncFurniture(realDt);
    this.syncTrash();
    this.syncCharacters(realDt);
    this.abilityFx.update(g, this.chars, this.time, realDt);
    this.syncBuild();
    this.syncDebug();
    this.gl.render(this.scene, this.cam);
    this.drawOverlay();
  }

  updateLighting() {
    const g = this.game, n = g.world.size * TILE;
    const hr = g.day.hour;
    // sun keeps a fixed "top-left" direction for the default view; colour/intensity follow the clock
    const t = clamp((hr - 8) / 14, 0, 1);
    const eve = clamp((hr - 17) / 3, 0, 1), night = clamp((hr - 20) / 2, 0, 1), morn = clamp((10 - hr) / 2, 0, 1);
    const sunCol = hexMix('#fff4e2', '#ffc58f', eve).lerp(new THREE.Color('#9fb0ff'), night).lerp(new THREE.Color('#ffe6c4'), morn);
    this.sun.color.copy(sunCol);
    this.sun.intensity = lerp(2.1, 1.3, eve) * lerp(1, 0.45, night);
    this.hemi.intensity = lerp(1.35, 1.0, eve) * lerp(1, 0.7, night);
    this.hemi.color.copy(hexMix('#fff6e8', '#ffd9b5', eve).lerp(new THREE.Color('#aab8ff'), night));
    const sky = hexMix(this.env.background || '#bfe3f2', '#f7c7a5', eve).lerp(new THREE.Color('#44507e'), night);
    this.scene.background.copy(sky); this.scene.fog.color.copy(sky);
    const cx = n / 2, cz = n / 2;
    this.sun.position.set(cx - 22, 34 - t * 6, cz + 12 - t * 16);
    this.sun.target.position.set(cx, 0, cz);
    const r = n / 2 + 16;
    const sc = this.sun.shadow.camera;
    if (sc.right !== r) { sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r; sc.near = 1; sc.far = 120; sc.updateProjectionMatrix(); }
    this.lampOn = clamp((hr - 17.5) / 1.5, 0, 1);
    this.outdoorGroup.traverse((o) => { if (o.userData.streetLamp) o.material.color.set(this.lampOn > 0.1 ? '#ffe9a8' : '#f4f0e6'); });
  }

  syncFloors() {
    const w = this.game.world;
    const key = w.size + ':' + w.floors.map((c) => c.join(',')).join(';');
    if (key === this.floorKey) return;
    this.floorKey = key;
    if (this.floorGeo) this.floorGeo.dispose();
    this.floorGroup.clear();
    const geo = this.floorGeo = new THREE.PlaneGeometry(TILE, TILE);
    const mats = new Map();
    for (let x = 0; x < w.size; x++) for (let y = 0; y < w.size; y++) {
      const fl = w.floorOf(x, y);
      let m = mats.get(fl.id);
      if (!m) { m = lam(fl.tint || '#ffffff', { map: this.tex(fl.asset, 1) }); mats.set(fl.id, m); }
      const t = new THREE.Mesh(geo, m);
      t.rotation.x = -Math.PI / 2; t.position.set(x * TILE + 1, 0.005, y * TILE + 1); t.receiveShadow = true;
      this.floorGroup.add(t);
    }
  }

  syncWalls(dt) {
    const wp = this.game.world.wall();
    if (this.wallTexId !== wp.asset) { this.wallMat.map = this.tex(wp.asset, 1); this.wallMat.needsUpdate = true; this.wallTexId = wp.asset; }
    this.wallMat.color.set(wp.tint || '#ffffff');
    const v = this.game.camera.viewDir();
    for (const s of this.sides) {
      const o = s.userData.outward;
      const front = o.x * v.x + o.z * v.z > 0.25; // wall stands between the camera and the room
      const target = front ? 0.16 : 1;
      s.userData.h += (target - s.userData.h) * Math.min(1, dt * 6);
      s.scale.y = s.userData.h;
      if (s.userData.deco) s.userData.deco.visible = s.userData.h > 0.92;
      if (s.userData.name === 'west') this.doorHidden = s.userData.h < 0.5;
    }
  }

  syncDoor() {
    const open = this.game.doorOpen || 0;
    this.door.rotation.y = -Math.PI / 2 + open * 1.35;
    this.door.visible = !this.doorHidden;
  }

  placeFurniture(obj, f) {
    const [w, h] = f.fp;
    obj.position.set((f.x + w / 2) * TILE, 0, (f.y + h / 2) * TILE);
    obj.rotation.y = DIR_YAW[f.dir];
  }

  syncFurniture(dt) {
    const g = this.game, world = g.world, hide = g.build.moving;
    const live = new Set();
    let lamps = 0;
    for (const f of world.furniture) {
      if (f === hide) continue;
      live.add(f.uid);
      const cat = furnitureById[f.type];
      const key = f.type + ':' + f.x + ':' + f.y + ':' + f.dir;
      let v = this.furn.get(f.uid);
      if (!v || v.key !== key) {
        if (v) this.scene.remove(v.obj);
        const obj = models.instance(cat.asset, cat.tint);
        this.placeFurniture(obj, f);
        this.scene.add(obj);
        v = { obj, key, f, items: new Map(), base: obj.position.clone() };
        this.furn.set(f.uid, v);
      }
      const o = v.obj;
      // placement bounce & broken wobble
      const b = f.bounce || 0;
      o.scale.set(1 + Math.sin(b * Math.PI * 3) * 0.06 * b, 1 - Math.sin(b * Math.PI * 3) * 0.08 * b, 1 + Math.sin(b * Math.PI * 3) * 0.06 * b);
      o.position.x = v.base.x + (f.broken ? Math.sin(this.time * 30) * (Math.sin(this.time * 2) > 0.6 ? 0.04 : 0) : 0);
      if (f.broken && Math.random() < dt * 3) g.fx.puff(g.at(f.x + f.fp[0] / 2, f.y + f.fp[1] / 2, 80), '#b9b2ad');
      const def = models.def(cat.asset) || {};
      // things resting on the surface
      const want = new Map();
      if (f.kind === 'table') want.set('plant', { id: 'm_table_plant', off: [0, 0], scale: 0.8 });
      if (f.kind === 'table' && f.seats) {
        // in tiles from the table's centre: the round table top is only 0.375 tiles across from the
        // middle, so each guest's things sit between the centre plant and the edge on their side
        const R = 0.225, SIDE = 0.085;
        for (const s of f.seats) {
          const dx = s.chair.x - f.x, dz = s.chair.y - f.y;
          if (s.dirty) want.set('d' + s.chair.uid, { id: 'm_plate_dirty', off: [dx * 0.2, dz * 0.2], scale: 0.55 });
          if (s.food) want.set('f' + s.chair.uid + s.food.dish, { dish: s.food.dish, off: [dx * R - dz * (s.drink ? SIDE : 0), dz * R + dx * (s.drink ? SIDE : 0)], scale: 0.42 });
          if (s.drink) want.set('k' + s.chair.uid + s.drink.dish, { dish: s.drink.dish, off: [dx * R + dz * SIDE, dz * R - dx * SIDE], scale: 0.42 });
        }
      }
      if (f.kind === 'stove') {
        if (f.cooking && !f.ready) want.set('pan', { id: def.cookProp || 'm_pan', off: [0, def.cookProp ? 0.3 : 0.1], scale: def.cookScale || 0.9, wob: true });
        if (f.ready) want.set('r' + f.ready.dish, { dish: f.ready.dish, off: [0, 0.1], scale: 0.55 });
      }
      if (f.kind === 'bar' && f.slots) {   // the pastry case shows what is really on each shelf (manifest `shelves`, model space)
        // one bake per shelf, shown as a little row of them (`shelfRow`: x offsets) so a shelf looks stocked
        f.slots.forEach((s, i) => {
          const at = s && s.dish && def.shelves && def.shelves[i];
          if (at) for (const [n, dx] of (def.shelfRow || [0]).entries()) want.set(`s${i}${n}${s.dish}`, { dish: s.dish, local: [at[0] + dx, at[1], at[2]], scale: def.shelfScale || 0.4 });
        });
      }
      for (const [k, it] of v.items) if (!want.has(k)) { o.remove(it); v.items.delete(k); }
      for (const [k, spec] of want) {
        let it = v.items.get(k);
        if (!it) {
          const id = spec.id || this.dishModel(spec.dish);
          it = models.instance(id);
          it.scale.setScalar(spec.scale);
          o.add(it);
          v.items.set(k, it);
        }
        // offsets are in world space; convert into the (rotated) furniture's local frame
        if (spec.local) { it.position.set(...spec.local); continue; }
        tmpV.set(spec.off[0] * TILE, 0, spec.off[1] * TILE).applyAxisAngle(Y_UP, -o.rotation.y);
        it.position.set(tmpV.x, (def.surfaceHeight || 1) + (spec.wob ? Math.abs(Math.sin(this.time * 10)) * 0.03 : 0), tmpV.z);
      }
      // steam: over the machine while it brews, over hot drinks on the tables
      v.steamT = (v.steamT || 0) - dt;
      if (v.steamT <= 0) {
        v.steamT = 0.3 + Math.random() * 0.25;
        const cx = f.x + f.fp[0] / 2, cy = f.y + f.fp[1] / 2;
        if (f.kind === 'stove' && f.cooking && !f.ready) g.fx.steam(g.at(cx, cy, 98));
        if (f.kind === 'table' && f.seats) {
          for (const s of f.seats) {
            const hot = s.food && dishById[s.food.dish] && ['coffee', 'tea'].includes(dishById[s.food.dish].cat);
            if (!hot || !s.customer || s.customer.state !== 'eating') continue;
            const dx = s.chair.x - f.x, dz = s.chair.y - f.y;
            g.fx.steam(g.at(cx + dx * 0.38, cy + dz * 0.38, 58));
          }
        }
      }
      // evening lamps
      if (def.light) {
        if (!v.light) { v.light = new THREE.PointLight(0xffd9a0, 0, 9, 1.6); v.light.position.set(...def.light); o.add(v.light); }
        v.light.intensity = lamps < 8 ? this.lampOn * 7 : 0;
        lamps++;
      }
      if (f.kind === 'arcade') o.traverse((m) => { if (m.userData && m.userData.glow) m.material.color.setHSL((this.time * 0.15) % 1, 0.6, f.broken ? 0.25 : 0.72); });
    }
    for (const [uid, v] of this.furn) if (!live.has(uid)) { this.scene.remove(v.obj); this.furn.delete(uid); }
  }

  dishModel(dishId) { return dishById[dishId] ? dishById[dishId].asset : 'm_plate'; }

  syncTrash() {
    const live = new Set();
    for (const t of this.game.world.trash) {
      live.add(t.uid);
      if (!this.trash.has(t.uid)) {
        const o = models.instance('m_trash');
        o.position.set((t.x + 0.5) * TILE + t.rot, 0, (t.y + 0.5) * TILE - t.rot * 0.5);
        o.rotation.y = t.rot * 6;
        this.scene.add(o);
        this.trash.set(t.uid, o);
      }
    }
    for (const [k, o] of this.trash) if (!live.has(k)) { this.scene.remove(o); this.trash.delete(k); }
  }

  refreshCharacter(a) { const cv = this.chars.get(a); if (cv) { cv.dispose(this.scene); this.chars.delete(a); } }

  syncCharacters(dt) {
    const g = this.game;
    const list = [...g.agents, ...g.ambient];
    const live = new Set(list);
    for (const a of list) {
      let cv = this.chars.get(a);
      if (!cv) { cv = new CharacterView(this.scene, a, assets.manifest); this.chars.set(a, cv); }
      if (!a.pose) a.pose = {};
      cv.root.visible = a.visible !== false;
      cv.update(dt, g);
    }
    for (const [a, cv] of this.chars) if (!live.has(a)) { cv.dispose(this.scene); this.chars.delete(a); }
  }

  // ------------------------------------------------------------------ build mode & debug visuals
  // Flat markers (tiles, dots) come from a pool with shared geometry/materials: nothing is
  // allocated per frame.
  markerMat(color, op) {
    const k = color + '|' + op;
    if (!this.markerMats) this.markerMats = new Map();
    let m = this.markerMats.get(k);
    if (!m) { m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false }); this.markerMats.set(k, m); }
    return m;
  }
  marker(group, kind, x, y, color, op, h, size) {
    const pool = group.userData.pool || (group.userData.pool = { tile: [], dot: [], used: { tile: 0, dot: 0 } });
    if (!this.markerGeo) this.markerGeo = { tile: new THREE.PlaneGeometry(1, 1), dot: new THREE.CircleGeometry(0.5, 16) };
    let m = pool[kind][pool.used[kind]];
    if (!m) { m = new THREE.Mesh(this.markerGeo[kind]); m.rotation.x = -Math.PI / 2; group.add(m); pool[kind].push(m); }
    pool.used[kind]++;
    m.visible = true;
    m.material = this.markerMat(color, op);
    m.scale.set(size, size, 1);
    m.position.set((x + 0.5) * TILE, h, (y + 0.5) * TILE);
    return m;
  }
  beginMarkers(group) {
    const pool = group.userData.pool;
    if (pool) { for (const k of ['tile', 'dot']) { for (const m of pool[k]) m.visible = false; pool.used[k] = 0; } }
  }

  syncBuild() {
    const b = this.game.build, grp = this.buildGroup;
    this.beginMarkers(grp);
    if (this.ghostObj) this.ghostObj.visible = false;
    if (this.wallGhost) this.wallGhost.visible = false;
    if (this.gridLines) this.gridLines.visible = false;
    if (!b.active) return;
    const n = this.game.world.size;
    if (!this.gridLines || this.gridN !== n) {
      if (this.gridLines) { grp.remove(this.gridLines); this.gridLines.geometry.dispose(); }
      const pts = [];
      for (let i = 0; i <= n; i++) { pts.push(i * TILE, 0.03, 0, i * TILE, 0.03, n * TILE, 0, 0.03, i * TILE, n * TILE, 0.03, i * TILE); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      this.gridLines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#6e4f3a', transparent: true, opacity: 0.3 }));
      this.gridN = n;
      grp.add(this.gridLines);
    }
    this.gridLines.visible = true;
    if (b.selected && !b.moving) {
      const f = b.selected, pulse = Math.round((0.35 + Math.sin(this.time * 5) * 0.15) * 20) / 20;
      for (let i = 0; i < f.fp[0]; i++) for (let j = 0; j < f.fp[1]; j++) this.marker(grp, 'tile', f.x + i, f.y + j, '#ffffff', pulse, 0.04, TILE - 0.12);
    }
    const gh = b.ghost;
    if (gh && gh.kind === 'wall') return this.syncWallGhost(grp, gh);
    if (!gh) return;
    const col = gh.valid ? '#78d282' : '#eb6464';
    for (const t of gh.tiles || []) this.marker(grp, 'tile', t.x, t.y, col, 0.45, 0.04, TILE - 0.12);
    for (const t of gh.access || []) this.marker(grp, 'dot', t.x, t.y, t.ok ? '#ffffff' : '#eb6464', 0.85, 0.05, 0.7);
    if (gh.type) {
      const cat = furnitureById[gh.type];
      const key = gh.type + '|' + gh.valid;
      if (this.ghostKey !== key) {
        if (this.ghostObj) grp.remove(this.ghostObj);
        this.ghostKey = key;
        this.ghostObj = models.instance(cat.asset, cat.tint);
        this.ghostObj.traverse((m) => { if (m.isMesh) { m.material = m.material.clone(); m.material.transparent = true; m.material.opacity = 0.7; m.material.color.lerp(new THREE.Color(col), 0.35); m.castShadow = false; } });
        grp.add(this.ghostObj);
      }
      this.ghostObj.visible = true;
      this.placeFurniture(this.ghostObj, { x: gh.x, y: gh.y, dir: gh.dir, fp: World.footprint(gh.type, gh.dir) });
    }
  }

  /** A see-through copy of the wall piece where it would hang, green when it fits and red when it doesn't. */
  syncWallGhost(grp, gh) {
    const w = wallDecorById[gh.id], col = gh.valid ? '#78d282' : '#eb6464';
    const key = gh.id + '|' + gh.valid;
    if (this.wallGhostKey !== key) {
      if (this.wallGhost) grp.remove(this.wallGhost);
      this.wallGhostKey = key;
      const o = models.instance(w.asset, w.tint);
      o.traverse((m) => { if (m.isMesh) { m.material = m.material.clone(); m.material.transparent = true; m.material.opacity = 0.75; m.material.color.lerp(new THREE.Color(col), 0.4); m.castShadow = false; } });
      this.wallGhostSize = new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3());
      this.wallGhost = new THREE.Group(); this.wallGhost.add(o);
      grp.add(this.wallGhost);
    }
    this.wallGhost.visible = true;
    this.hangOn(this.wallGhost, gh.side, gh.a, w, this.wallGhostSize);
  }

  /** Where the pointer meets the inside of a standing (not cut-away) wall: { side, a, y } or null. */
  pickWall(vx, vy) {
    const r = this.canvas.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2((vx / r.width) * 2 - 1, -(vy / r.height) * 2 + 1), this.cam);
    const { origin: o, direction: d } = this.raycaster.ray;
    const W = this.game.world.size * TILE, H = assets.grid.wallHeight || 3;
    let best = null;
    for (const s of this.sides || []) {
      if (s.userData.h < 0.92) continue;
      const n = s.userData.name;
      const alongX = n === 'north' || n === 'south', plane = n === 'north' || n === 'west' ? 0 : W;
      const dc = alongX ? d.z : d.x, oc = alongX ? o.z : o.x;
      if (Math.abs(dc) < 1e-6) continue;
      if ((plane === 0 && dc > 0) || (plane === W && dc < 0)) continue;   // only the inner face
      const t = (plane - oc) / dc;
      if (t <= 0 || (best && t >= best.t)) continue;
      const y = o.y + d.y * t, a = alongX ? o.x + d.x * t : o.z + d.z * t;
      if (y < 0.2 || y > H + 0.1 || a < 0 || a > W) continue;
      best = { t, side: n, a: Math.round(a * 4) / 4, y };
    }
    if (!best) return null;
    // a wall behind the floor point you're aiming at doesn't count
    const g = this.groundAt(vx, vy);
    if (g && g.x > 0.05 && g.x < W - 0.05 && g.z > 0.05 && g.z < W - 0.05) {
      const tg = Math.hypot(g.x - o.x, -o.y, g.z - o.z);
      if (tg < best.t) return null;
    }
    return { side: best.side, a: best.a, y: best.y };
  }
  /** The hung wall piece under the pointer (id), if any. */
  pickWallDecor(vx, vy) {
    const hit = this.pickWall(vx, vy);
    if (!hit || hit.y < 0.8) return null;
    const g = this.game, layout = wallLayout(g.world.size, DOOR_Y, g.state.wallDeco || [], g.state.wallPos);
    let best = null, bd = 1.0;
    for (const [id, p] of Object.entries(layout)) if (p.side === hit.side && Math.abs(p.a - hit.a) < bd) { bd = Math.abs(p.a - hit.a); best = id; }
    return best;
  }
  /** Screen position of a spot on a wall (for the floating build buttons). */
  wallScreen(side, a, y) {
    const W = this.game.world.size * TILE, v = new THREE.Vector3();
    if (side === 'north') v.set(a, y, 0.1); else if (side === 'south') v.set(a, y, W - 0.1);
    else if (side === 'west') v.set(0.1, y, a); else v.set(W - 0.1, y, a);
    return this.projectV(v);
  }

  syncDebug() {
    const g = this.game, grp = this.debugGroup;
    this.beginMarkers(grp);
    if (this.debugLines) { for (const l of this.debugLines) { grp.remove(l); l.geometry.dispose(); } }
    this.debugLines = [];
    if (!g.debug.grid) return;
    const w = g.world;
    for (let x = 0; x < w.size; x++) for (let y = 0; y < w.size; y++) this.marker(grp, 'tile', x, y, w.isWalkable(x, y) ? '#78c88c' : '#e65a5a', 0.3, 0.06, 1.8);
    if (!this.pathMats) this.pathMats = { customer: new THREE.LineBasicMaterial({ color: '#dc783c' }), staff: new THREE.LineBasicMaterial({ color: '#3c78dc' }) };
    for (const a of g.agents) {
      for (const t of g.agentTiles.claims(a)) this.marker(grp, 'tile', t.x, t.y, '#5a78dc', 0.45, 0.08, 0.8);
      if (a.path && a.path.length) {
        const pts = [new THREE.Vector3(a.x * TILE, 0.12, a.y * TILE), ...a.path.map((t) => new THREE.Vector3((t.x + 0.5) * TILE, 0.12, (t.y + 0.5) * TILE))];
        const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), this.pathMats[a.kind] || this.pathMats.staff);
        grp.add(l); this.debugLines.push(l);
      }
    }
  }

  // ------------------------------------------------------------------ overlay (2D, projected)
  /** Project a grid position (+ height in world units) to overlay pixels. */
  project(gx, gy, h = 0) {
    tmpV.set(gx * TILE, h, gy * TILE).project(this.cam);
    if (tmpV.z > 1) return null;
    return { x: (tmpV.x * 0.5 + 0.5) * this.overlay.width / this.dpr, y: (-tmpV.y * 0.5 + 0.5) * this.overlay.height / this.dpr, s: this.game.camera.zoom };
  }
  projectV(v) {
    tmpV.copy(v).project(this.cam);
    if (tmpV.z > 1) return null;
    return { x: (tmpV.x * 0.5 + 0.5) * this.overlay.width / this.dpr, y: (-tmpV.y * 0.5 + 0.5) * this.overlay.height / this.dpr, s: this.game.camera.zoom };
  }

  drawOverlay() {
    const { ctx, game } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const z = game.camera.zoom;
    // stoves & broken facilities
    for (const f of game.world.furniture) {
      const def = models.def(furnitureById[f.type].asset) || {};
      const top = (def.surfaceHeight || 1.2) + 1.1;
      const q = this.project(f.x + f.fp[0] / 2, f.y + f.fp[1] / 2, top);
      if (!q) continue;
      if (f.cooking && f.cookTotal > 0 && !f.ready) this.bar(q.x, q.y, 56 * z, clamp(f.cookT / f.cookTotal, 0, 1), '#8fd18a', 8 * z);
      if (f.ready || (f.slots && f.slots.some((s) => s && s.ticket))) this.bubble(q.x, q.y, 'emote_sparkle', 0.7 * z);
      if (f.broken) this.bubble(q.x, q.y - 4, 'emote_broken', 0.8 * z);
    }
    // characters
    const head = new THREE.Vector3();
    for (const a of game.agents) {
      if (!a.visible) continue;
      const cv = this.chars.get(a);
      if (!cv) continue;
      const q = this.projectV(cv.headTop(head));
      if (!q) continue;
      let y = q.y;
      if (a.kind === 'staff' && a.x >= 0) { this.nameTag(q.x, y, a.name, z); y -= 16 * z; }
      if (a.showPatience && a.patience != null) {
        const v = clamp(a.patience, 0, 1);
        this.bar(q.x, y - 2, 40 * z, v, game.timeStopT > 0 ? '#7fb5ff' : v > 0.5 ? '#34c759' : v > 0.25 ? '#ffb31f' : '#ff4d4f', 6 * z);
        y -= 10 * z;
      }
      if (a.kind === 'staff' && a.energy != null && (a.energy < 25 || game.selected === a)) {
        this.bar(q.x, y - 2, 40 * z, a.energy / 100, a.energy < 25 ? '#ff8a3d' : '#2f9bff', 6 * z);
        y -= 10 * z;
      }
      const tr = a.trouble && !a.trouble.over ? a.trouble : null;
      if (tr) {   // a troublemaker: a red tag, until someone trained is on it
        const text = tr.by ? t('{name} is on it!', { name: tr.by.name }) : tr.kind === 'rude' ? t('Rude guest!') : t('Not paying!');
        this.hint(q.x, y - 4 * z, tr.kind === 'rude' ? 'emote_angry' : 'icon_coin', text, z, !tr.by);
      } else if (a.bubble) {
        const age = this.time - a.bubble.t0;
        this.bubble(q.x, y, a.bubble.icon, easeOutBack(age / 0.28) * z, a.bubble.icon2);
      } else if (a.blocker) this.hint(q.x, y - 4 * z, a.blocker.icon, a.blocker.text, z);   // what this staff member is waiting on
      if (game.selected === a) {
        const f = this.project(a.x, a.y, 0);
        if (f) { ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 3; ctx.setLineDash([6, 4]); ctx.beginPath(); ctx.ellipse(f.x, f.y, 26 * z, 12 * z, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
      }
      if (game.debug.labels) {
        const f = this.project(a.x, a.y, 0);
        if (f) {
          ctx.save(); ctx.font = `800 12px ${FONT}`; ctx.textAlign = 'center';
          const txt = `${a.name}: ${a.stateLabel()}`, tw = ctx.measureText(txt).width;
          ctx.fillStyle = 'rgba(40,30,25,0.75)'; ctx.fillRect(f.x - tw / 2 - 4, f.y + 8, tw + 8, 17);
          ctx.fillStyle = '#fff'; ctx.fillText(txt, f.x, f.y + 21); ctx.restore();
        }
      }
    }
    this.abilityFx.drawOverlay(ctx, game, this.chars, (v) => this.projectV(v), z);
    game.fx.draw(ctx, (gx, gy, h) => this.project(gx, gy, h));
    if (game.debug.assets) this.drawAssetOverlay();
  }

  /** Amber pill over a head: an icon and a short "what's missing" line, gently bobbing (`alert`: red and pulsing). */
  hint(x, y, icon, text, z = 1, alert = false) {
    const ctx = this.ctx;
    const k = clamp(z, 0.85, 1.3) * (alert ? 1.08 + Math.sin(this.time * 9) * 0.06 : 1), bob = Math.sin(this.time * 3) * 1.5;
    const [bg, line, ink] = alert ? ['#e5484d', '#ffffff', '#ffffff'] : ['#fff4dc', '#f0a43a', '#6b3d0c'];
    ctx.save();
    ctx.font = `700 ${Math.round(12 * k)}px ${DISPLAY_FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const ic = 20 * k, pad = 8 * k, ph = 26 * k, tw = ctx.measureText(text).width, w = pad + ic + 5 * k + tw + pad * 1.2;
    const x0 = x - w / 2, y0 = y - ph + bob;
    ctx.shadowColor = 'rgba(16,24,40,0.28)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
    rr(ctx, x0, y0, w, ph, ph / 2); ctx.fillStyle = bg; ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.lineWidth = 2; ctx.strokeStyle = line; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 5 * k, y0 + ph - 1); ctx.lineTo(x, y0 + ph + 5 * k); ctx.lineTo(x + 5 * k, y0 + ph - 1); ctx.closePath();
    ctx.fillStyle = bg; ctx.fill();
    assets.drawIcon(ctx, icon, x0 + pad + ic / 2, y0 + ph / 2, ic);
    ctx.fillStyle = ink; ctx.fillText(text, x0 + pad + ic + 5 * k, y0 + ph / 2 + 0.5);
    ctx.restore();
  }

  bar(x, y, w, v, color, h = 8) {
    const ctx = this.ctx;
    ctx.save();
    ctx.shadowColor = 'rgba(16,24,40,0.25)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 1;
    rr(ctx, x - w / 2 - 2, y - 2, w + 4, h + 4, (h + 4) / 2); ctx.fillStyle = 'rgba(255,255,255,0.82)'; ctx.fill();
    ctx.shadowColor = 'transparent';
    if (v > 0) {
      rr(ctx, x - w / 2, y, Math.max(h, w * v), h, h / 2); ctx.fillStyle = color; ctx.fill();
      rr(ctx, x - w / 2 + 1, y + 1, Math.max(h, w * v) - 2, h * 0.4, h * 0.2); ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fill();
    }
    ctx.restore();
  }

  nameTag(x, y, name, z = 1) {
    const ctx = this.ctx;
    const k = clamp(z, 0.8, 1.3);
    ctx.save();
    ctx.font = `700 ${Math.round(11.5 * k)}px ${DISPLAY_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const tw = ctx.measureText(name).width, ph = 17 * k;
    ctx.shadowColor = 'rgba(16,24,40,0.25)'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 1;
    rr(ctx, x - tw / 2 - 7 * k, y - ph / 2, tw + 14 * k, ph, ph / 2); ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = '#1d1d1f'; ctx.fillText(name, x, y + 0.5);
    ctx.restore();
  }

  bubble(x, y, icon, s, icon2) {
    if (s <= 0.01) return;
    const ctx = this.ctx;
    const bob = Math.sin(this.time * 3) * 1.5;
    ctx.save();
    ctx.translate(x, y + bob);
    ctx.scale(s, s);
    const bsp = assets.sprite('ui_bubble', 'any');
    assets.draw(ctx, 'ui_bubble', 'any', 0, 0);
    const cy = -bsp.ay + (bsp.h - 14) / 2 + 1;
    if (icon2) { assets.drawIcon(ctx, icon, -10, cy, 30); assets.drawIcon(ctx, icon2, 13, cy + 4, 22); }
    else assets.drawIcon(ctx, icon, 0, cy, icon.startsWith('dish') || icon.startsWith('drink') ? 38 : 32);
    ctx.restore();
  }

  drawAssetOverlay() {
    const { ctx, game } = this;
    ctx.save();
    ctx.font = `800 11px ${FONT}`; ctx.textAlign = 'center';
    const tag = (q, text) => {
      if (!q) return;
      const tw = ctx.measureText(text).width;
      ctx.fillStyle = 'rgba(220,60,90,0.85)'; rr(ctx, q.x - tw / 2 - 5, q.y - 11, tw + 10, 16, 8); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillText(text, q.x, q.y + 1);
    };
    for (const f of game.world.furniture) {
      const id = furnitureById[f.type].asset;
      if (models.isPlaceholder(id)) tag(this.project(f.x + f.fp[0] / 2, f.y + f.fp[1] / 2, 1.5), 'PH ' + id);
    }
    const fl = game.world.floorOf(0, 0).asset;
    if (assets.isPlaceholder(fl)) tag(this.project(1, 1, 0), 'PH ' + fl);
    const wp = game.world.wall().asset;
    if (assets.isPlaceholder(wp)) tag(this.project(0, 2, 2.5), 'PH ' + wp);
    if (assets.isPlaceholder('tex_grass')) tag(this.project(-1, -1, 0), 'PH tex_grass');
    ctx.restore();
  }

  // ------------------------------------------------------------------ picking
  groundAt(vx, vy) {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2((vx / r.width) * 2 - 1, -(vy / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.cam);
    const ray = this.raycaster.ray;
    if (Math.abs(ray.direction.y) < 1e-6) return null;
    const t = -ray.origin.y / ray.direction.y;
    if (t < 0) return null;
    return { x: ray.origin.x + ray.direction.x * t, z: ray.origin.z + ray.direction.z * t };
  }
  pickTile(vx, vy) {
    const p = this.groundAt(vx, vy);
    if (!p) return { x: -99, y: -99 };
    return { x: Math.floor(p.x / TILE), y: Math.floor(p.z / TILE) };
  }
  panBetween(ax, ay, bx, by) {
    const a = this.groundAt(ax, ay), b = this.groundAt(bx, by);
    if (!a || !b) return;
    const c = this.game.camera;
    c.tx -= b.x - a.x; c.tz -= b.z - a.z; c.clamp();
  }
  pickAgent(vx, vy) {
    let best = null, bd = 1e9;
    const head = new THREE.Vector3();
    for (const a of this.game.agents) {
      if (!a.visible || a.x < 0) continue;
      const cv = this.chars.get(a);
      if (!cv) continue;
      const f = this.project(a.x, a.y, 0), h = this.projectV(cv.headTop(head));
      if (!f || !h) continue;
      const w = 22 * this.game.camera.zoom;
      if (vx > f.x - w && vx < f.x + w && vy > h.y && vy < f.y + 6) {
        const d = this.cam.position.distanceTo(cv.root.position);
        if (d < bd) { bd = d; best = a; }
      }
    }
    return best;
  }
}

export function roundRect(ctx, x, y, w, h, r) { rr(ctx, x, y, w, h, r); }
function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
