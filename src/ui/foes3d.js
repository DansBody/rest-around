// Foes of the grey world built in code (no Meshy, no Blender) for the 3D cut-ins (ui/ultimate.js): each builder
// returns a THREE.Group standing on y = 0, facing +z, in its own colours — ultimate.js drains them to grey halftone
// and lets the colour back in. Textures are drawn on canvases at build time.
//   phone — Unread Pings: an old smartphone standing on its edge, a cracked glowing screen with × eyes and a stack of
//           notification cards, a "99+" badge on the corner, and little notification cards floating round it.
import { THREE } from '../models.js';

/** A canvas texture drawn by `paint(ctx, w, h)`. */
function canvasTex(w, h, paint) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  paint(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
/** A rounded-rectangle slab (w × h, d deep, corner radius r), centred on x and z, its bottom on y = 0. */
function slab(w, h, d, r) {
  const s = new THREE.Shape(), x = -w / 2, y = 0;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelThickness: d * 0.18, bevelSize: d * 0.18, bevelSegments: 2, curveSegments: 6 });
  g.translate(0, 0, -d / 2);
  return g;
}

const APPS = ['#8FD9C4', '#F6D66B', '#8EC9F0', '#F6CDBF', '#B9A6E0'];   // candy pastels for app icons
/** One notification card: an app icon and two lines of "text". */
function paintCard(ctx, x, y, w, h, i) {
  roundRect(ctx, x, y, w, h, h * 0.22);
  ctx.fillStyle = '#ffffff'; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = '#C9D4E8'; ctx.stroke();
  roundRect(ctx, x + h * 0.15, y + h * 0.18, h * 0.64, h * 0.64, h * 0.16);
  ctx.fillStyle = APPS[i % APPS.length]; ctx.fill();
  ctx.fillStyle = '#1F2A4A';
  ctx.fillRect(x + h * 0.95, y + h * 0.24, w * 0.46, h * 0.16);
  ctx.fillStyle = '#9AABC9';
  ctx.fillRect(x + h * 0.95, y + h * 0.56, w * 0.62 - (i % 2) * w * 0.18, h * 0.13);
}

export function makePhone() {
  const W = 0.64, H = 1.2, D = 0.11;
  const g = new THREE.Group();
  // the body: a lilac case with a dark bezel front
  const caseMat = new THREE.MeshLambertMaterial({ color: '#B9A6E0' });
  g.add(new THREE.Mesh(slab(W, H, D, 0.09), caseMat));
  const bezel = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.94, H * 0.95), new THREE.MeshLambertMaterial({ color: '#232838' }));
  bezel.position.set(0, H / 2, D / 2 + D * 0.19);
  g.add(bezel);
  // the screen: glowing, cracked, × eyes on top, a stack of notifications below
  const screenTex = canvasTex(256, 480, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#EAF4FF'); grad.addColorStop(1, '#CFE2FA');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
    for (const ex of [0.33, 0.67]) {   // the eyes
      ctx.beginPath(); ctx.arc(w * ex, h * 0.14, 30, 0, Math.PI * 2); ctx.fillStyle = '#1F2A4A'; ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 8; ctx.lineCap = 'square';
      ctx.beginPath(); ctx.moveTo(w * ex - 12, h * 0.14 - 12); ctx.lineTo(w * ex + 12, h * 0.14 + 12);
      ctx.moveTo(w * ex + 12, h * 0.14 - 12); ctx.lineTo(w * ex - 12, h * 0.14 + 12); ctx.stroke();
    }
    for (let i = 0; i < 5; i++) paintCard(ctx, 18, h * 0.27 + i * 66, w - 36, 54, i);
    // the cracks, spreading from a corner
    ctx.strokeStyle = 'rgba(31, 42, 74, .75)'; ctx.lineWidth = 3;
    const cracks = [[[210, 70], [150, 150], [168, 230], [120, 330]], [[150, 150], [70, 190], [30, 260]], [[168, 230], [230, 300], [250, 420]], [[150, 150], [110, 90], [60, 40]]];
    for (const pts of cracks) { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); }
  });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.84, H * 0.82),
    new THREE.MeshLambertMaterial({ map: screenTex, emissive: '#ffffff', emissiveMap: screenTex, emissiveIntensity: 0.55 }));
  screen.position.set(0, H / 2, D / 2 + D * 0.2);
  g.add(screen);
  // the home button, the earpiece, the side keys, the camera on the back
  const ink = new THREE.MeshLambertMaterial({ color: '#3A4058' });
  const home = new THREE.Mesh(new THREE.CircleGeometry(0.035, 16), ink);
  home.position.set(0, H * 0.05, D / 2 + D * 0.21);
  g.add(home);
  const ear = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.02), ink);
  ear.position.set(0, H * 0.955, D / 2 + D * 0.21);
  g.add(ear);
  for (const [y, len] of [[0.78, 0.12], [0.64, 0.08]]) {
    const key = new THREE.Mesh(new THREE.BoxGeometry(0.02, len, 0.04), caseMat);
    key.position.set(-W / 2 - D * 0.2, H * y, 0);
    g.add(key);
  }
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 16), ink);
  lens.rotation.x = Math.PI / 2;
  lens.position.set(W * 0.28, H * 0.88, -D / 2 - D * 0.2);
  g.add(lens);
  // the 99+ badge on the corner
  const badgeTex = canvasTex(128, 128, (ctx, w, h) => {
    ctx.beginPath(); ctx.arc(w / 2, h / 2, w / 2 - 4, 0, Math.PI * 2); ctx.fillStyle = '#E5664A'; ctx.fill();
    ctx.lineWidth = 8; ctx.strokeStyle = '#1F2A4A'; ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 44px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('99+', w / 2, h / 2 + 2);
  });
  const badge = new THREE.Mesh(new THREE.CircleGeometry(0.13, 24), new THREE.MeshLambertMaterial({ map: badgeTex, transparent: true, alphaTest: 0.5 }));
  badge.position.set(W / 2 - 0.02, H - 0.02, D / 2 + D * 0.3);
  badge.rotation.z = -0.25;
  g.add(badge);
  // pings floating round it (ultimate.js bobs them: userData.floaters)
  const floaters = [];
  for (let i = 0; i < 3; i++) {
    const tex = canvasTex(256, 96, (ctx, w, h) => paintCard(ctx, 6, 6, w - 12, h - 12, i + 1));
    const card = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.16), new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }));
    // clear of the body by a pixel or two, so the outline never joins them to it
    const home = new THREE.Vector3([-0.68, 0.7, -0.66][i], H * [0.8, 1.1, 0.34][i], [0.14, 0.05, 0.2][i]);
    card.position.copy(home);
    card.rotation.z = [0.25, -0.12, -0.3][i];
    card.userData.home = home;
    g.add(card);
    floaters.push(card);
  }
  g.userData.floaters = floaters;
  return g;
}
