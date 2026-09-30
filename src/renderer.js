// Canvas 2D renderer: floor, walls + door, depth-sorted furniture and characters, overlays.
import { assets } from './assets.js';
import { toScreen, DIRS } from './iso.js';
import { DOOR_Y, World } from './world.js';
import { furnitureById, dishById } from './data.js';
import { drawDoll, emoteOffset } from './doll.js';
import { clamp, easeOutBack } from './util.js';
import { FONT } from './placeholder.js';

const EPS = 1e-3;

export class Renderer {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.game = game;
    this.dpr = 1;
    this.time = 0;
    this.hitList = [];
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(r.width * this.dpr);
    this.canvas.height = Math.round(r.height * this.dpr);
    this.game.camera.setViewport(r.width, r.height);
  }

  render(realDt) {
    this.time += realDt;
    const { ctx, game } = this;
    const cam = game.camera;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.drawBackground();
    ctx.setTransform(this.dpr * cam.zoom, 0, 0, this.dpr * cam.zoom, this.dpr * (cam.vw / 2 - cam.x * cam.zoom), this.dpr * (cam.vh / 2 - cam.y * cam.zoom));
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    this.drawFloor();
    if (game.build.active || game.debug.grid) this.drawGrid();
    if (game.debug.grid) this.drawPathDebug();
    this.drawWalls();
    this.drawTrash();
    this.drawSorted();
    this.drawBuildOverlay();
    this.drawOverlays();
    if (game.debug.assets) this.drawAssetOverlay();
  }

  drawBackground() {
    const { ctx, canvas } = this;
    const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
    g.addColorStop(0, '#f9e4c8'); g.addColorStop(1, '#f3cfb4');
    ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height);
    // soft polka dots
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    const s = 46 * this.dpr, off = (this.time * 6 * this.dpr) % s;
    for (let y = -s; y < canvas.height + s; y += s) for (let x = -s; x < canvas.width + s; x += s) {
      const ox = ((y / s) % 2) * s / 2;
      ctx.beginPath(); ctx.arc(x + ox + off, y + off * 0.5, 5 * this.dpr, 0, Math.PI * 2); ctx.fill();
    }
  }

  drawFloor() {
    const { ctx, game } = this; const w = game.world;
    // subtle drop shadow under the room
    const L = toScreen(0, w.size), R = toScreen(w.size, 0), B = toScreen(w.size, w.size), T = toScreen(0, 0);
    ctx.save();
    ctx.fillStyle = 'rgba(120,70,50,0.18)';
    ctx.beginPath(); ctx.moveTo(T.x, T.y + 10); ctx.lineTo(R.x + 10, R.y + 12); ctx.lineTo(B.x, B.y + 16); ctx.lineTo(L.x - 10, L.y + 12); ctx.closePath(); ctx.fill();
    // floor thickness edge (front sides of the room slab)
    ctx.fillStyle = '#c99873';
    ctx.beginPath(); ctx.moveTo(L.x, L.y); ctx.lineTo(B.x, B.y); ctx.lineTo(B.x, B.y + 12); ctx.lineTo(L.x, L.y + 12); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#b58462';
    ctx.beginPath(); ctx.moveTo(B.x, B.y); ctx.lineTo(R.x, R.y); ctx.lineTo(R.x, R.y + 12); ctx.lineTo(B.x, B.y + 12); ctx.closePath(); ctx.fill();
    ctx.restore();
    for (let x = 0; x < w.size; x++) for (let y = 0; y < w.size; y++) {
      const fl = w.floorOf(x, y);
      const c = toScreen(x + 0.5, y + 0.5);
      assets.draw(ctx, fl.asset, 'any', c.x, c.y, { tint: fl.tint });
    }
  }

  drawGrid() {
    const { ctx, game } = this; const w = game.world;
    ctx.save();
    ctx.strokeStyle = 'rgba(110,80,60,0.18)'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i <= w.size; i++) {
      let a = toScreen(i, 0), b = toScreen(i, w.size); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      a = toScreen(0, i); b = toScreen(w.size, i); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  tilePath(x, y, w = 1, h = 1, inset = 0) {
    const ctx = this.ctx;
    const a = toScreen(x + inset, y + inset), b = toScreen(x + w - inset, y + inset), c = toScreen(x + w - inset, y + h - inset), d = toScreen(x + inset, y + h - inset);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath();
  }

  drawPathDebug() {
    const { ctx, game } = this; const w = game.world;
    ctx.save();
    for (let x = 0; x < w.size; x++) for (let y = 0; y < w.size; y++) {
      this.tilePath(x, y, 1, 1, 0.06);
      ctx.fillStyle = w.isWalkable(x, y) ? 'rgba(120,200,140,0.22)' : 'rgba(230,90,90,0.28)';
      ctx.fill();
    }
    for (const a of game.agents) {
      const k = game.agentTiles.claims(a);
      for (const t of k) { this.tilePath(t.x, t.y, 1, 1, 0.3); ctx.fillStyle = 'rgba(90,120,220,0.35)'; ctx.fill(); }
      if (a.path && a.path.length) {
        ctx.strokeStyle = a.kind === 'customer' ? 'rgba(220,120,60,0.8)' : 'rgba(60,120,220,0.8)'; ctx.lineWidth = 3; ctx.setLineDash([6, 5]);
        ctx.beginPath(); const p0 = toScreen(a.x, a.y); ctx.moveTo(p0.x, p0.y);
        for (const t of a.path) { const p = toScreen(t.x + 0.5, t.y + 0.5); ctx.lineTo(p.x, p.y); }
        ctx.stroke(); ctx.setLineDash([]);
      }
    }
    ctx.restore();
  }

  drawWalls() {
    const { ctx, game } = this; const w = game.world;
    const wp = w.wall();
    const grid = assets.grid;
    for (let y = 0; y < w.size; y++) {
      const p = toScreen(0, y + 0.5);
      if (y === DOOR_Y) {
        assets.draw(ctx, 'door_frame', 'fl', p.x, p.y);
        const def = assets.def('door_leaf');
        const open = game.doorOpen || 0;
        const hinge = def.hingeX ?? 0;
        const sp = assets.sprite('door_leaf', 'fl');
        ctx.save();
        ctx.translate(p.x - sp.ax + hinge, p.y);
        ctx.scale(1 - open * 0.72, 1);
        ctx.translate(-(p.x - sp.ax + hinge), -p.y);
        assets.draw(ctx, 'door_leaf', 'fl', p.x, p.y);
        ctx.restore();
      } else assets.draw(ctx, wp.asset, 'fl', p.x, p.y, { tint: wp.tint });
    }
    const dark = grid.mirrorShade || '#e0d8d0';
    const tint = mulHex(wp.tint, dark);
    for (let x = 0; x < w.size; x++) {
      const p = toScreen(x + 0.5, 0);
      assets.draw(ctx, wp.asset, 'fr', p.x, p.y, { tint });
    }
  }

  drawTrash() {
    const { ctx, game } = this;
    for (const t of game.world.trash) {
      const p = toScreen(t.x + 0.5, t.y + 0.5);
      assets.draw(ctx, 'trash_pile', 'any', p.x, p.y, { tint: t.tint, rot: t.rot * 0.2 });
    }
  }

  // ---------------- depth-sorted pass ----------------
  drawSorted() {
    const { game } = this;
    const items = [];
    const hide = game.build.moving;
    for (const f of game.world.furniture) {
      if (f === hide) continue;
      const [w, h] = f.fp;
      const def = assets.def(furnitureById[f.type].asset);
      const c = toScreen(f.x + w / 2, f.y + h / 2);
      items.push({ kind: 'f', f, x0: f.x, y0: f.y, x1: f.x + w, y1: f.y + h, rect: [c.x - def.anchor[0], c.y - def.anchor[1], def.size[0], def.size[1]], depth: f.x + f.y + (w + h) / 2 });
    }
    for (const a of game.agents) {
      if (!a.visible) continue;
      const r = 0.3;
      let ax = a.x, ay = a.y;
      const it = { kind: 'a', a, x0: ax - r, y0: ay - r, x1: ax + r, y1: ay + r, depth: ax + ay };
      if (a.onTile) { // sitting / stepping into a furniture tile: share that tile's box, order by chair facing
        const f = a.onTile;
        it.x0 = f.x; it.y0 = f.y; it.x1 = f.x + f.fp[0]; it.y1 = f.y + f.fp[1];
        it.sameTile = f; it.frontOf = f.dir <= 1; // front-facing chair: draw character after the chair
      }
      const p = toScreen(ax, ay);
      it.rect = [p.x - 40, p.y - 140, 80, 150];
      items.push(it);
    }
    const order = sortDepth(items);
    this.hitList = [];
    for (const it of order) {
      if (it.kind === 'f') this.drawFurniture(it.f);
      else { this.drawAgent(it.a); this.hitList.push(it); }
    }
  }

  drawFurniture(f, o = {}) {
    const { ctx } = this;
    const cat = furnitureById[f.type];
    const [w, h] = f.fp;
    const c = toScreen(f.x + w / 2, f.y + h / 2);
    const def = assets.def(cat.asset);
    let rot = 0, jx = 0;
    if (f.broken) { jx = Math.sin(this.time * 30) * (Math.sin(this.time * 2) > 0.6 ? 1.5 : 0); }
    if (f.bounce) { const k = f.bounce; rot = 0; o.sy = 1 + Math.sin(k * Math.PI * 3) * 0.08 * k; }
    const facing = DIRS[f.dir].face;
    assets.draw(ctx, cat.asset, facing, c.x + jx, c.y, { tint: o.tint || cat.tint, alpha: o.alpha, sy: o.sy, rot });
    if (o.ghost) return;
    // things resting on surfaces
    if (f.kind === 'table' && f.seats) {
      const sh = def.surfaceHeight || 30;
      for (const s of f.seats) {
        const dx = s.chair.x - f.x, dy = s.chair.y - f.y;
        const put = (id, off, lat) => {
          const px = f.x + 0.5 + dx * off + dy * lat, py = f.y + 0.5 + dy * off - dx * lat;
          const p = toScreen(px, py);
          if (id === 'dirty_plate') assets.draw(ctx, id, 'any', p.x, p.y - sh);
          else assets.draw(ctx, id, 'any', p.x, p.y - sh, { scale: 0.62 });
        };
        if (s.dirty) put('dirty_plate', 0.2, 0);
        if (s.food) put(dishById[s.food.dish].asset, 0.18, s.drink ? 0.12 : 0);
        if (s.drink) put(dishById[s.drink.dish].asset, 0.2, -0.16);
      }
    }
    if ((f.kind === 'stove' || f.kind === 'bar') && (f.ready || f.cooking)) {
      const sh = def.surfaceHeight || 40;
      const item = f.ready || f.cooking;
      const p = toScreen(f.x + w / 2, f.y + h / 2);
      const wob = f.cooking && !f.ready ? Math.sin(this.time * 14) * 1.5 : 0;
      assets.draw(ctx, dishById[item.dish].asset, 'any', p.x, p.y - sh + wob, { scale: 0.6, alpha: f.ready ? 1 : 0.9 });
    }
  }

  agentScreen(a) {
    const p = toScreen(a.x, a.y);
    return p;
  }

  drawAgent(a) {
    const p = this.agentScreen(a);
    drawDoll(this.ctx, a.look, a.pose, DIRS[a.dir].face, p.x, p.y);
    if (this.game.selected === a) {
      const ctx = this.ctx;
      ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 3; ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.ellipse(p.x, p.y - (a.pose.lift || 0) + 1, 26, 11, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
  }

  // ---------------- overlays ----------------
  drawOverlays() {
    const { ctx, game } = this;
    // stove / bar progress bars and broken facility markers
    for (const f of game.world.furniture) {
      const [w, h] = f.fp;
      const def = assets.def(furnitureById[f.type].asset);
      const c = toScreen(f.x + w / 2, f.y + h / 2);
      const top = c.y - def.anchor[1] + 8;
      if (f.cooking && f.cookTotal > 0 && !f.ready) this.bar(c.x, top - 6, 56, clamp(f.cookT / f.cookTotal, 0, 1), '#8fd18a');
      if (f.ready) this.bubble(c.x, top + 4, 'emote_sparkle', 0.7, this.time);
      if (f.broken) {
        this.bubble(c.x, top + 2, 'emote_broken', 0.8, this.time);
        if (Math.random() < 0.08) game.fx.puff(c.x + (Math.random() - 0.5) * 30, c.y - def.anchor[1] * 0.6, '#b9b2ad');
      }
    }
    // characters: bubbles, patience, labels
    for (const a of game.agents) {
      if (!a.visible) continue;
      const p = this.agentScreen(a);
      const eo = emoteOffset(a.pose);
      const hx = p.x + eo[0], hy = p.y + eo[1] - (a.pose.hop > 0 && a.pose.hop < 1 ? Math.sin(a.pose.hop * Math.PI) * 13 : 0);
      if (a.bubble) {
        const age = this.time - a.bubble.t0;
        this.bubble(hx, hy, a.bubble.icon, easeOutBack(age / 0.28) * (a.bubble.scale || 1), this.time, a.bubble.icon2);
      }
      if (a.showPatience && a.patience != null) {
        const v = clamp(a.patience, 0, 1);
        this.bar(p.x, p.y + 8, 44, v, v > 0.5 ? '#8fd18a' : v > 0.25 ? '#f5c451' : '#ef6f6c', 7);
      }
      if (a.kind === 'staff' && a.energy != null && (a.energy < 25 || game.selected === a)) {
        this.bar(p.x, p.y + 8, 40, a.energy / 100, a.energy < 25 ? '#f59f5b' : '#7cc3f0', 6);
      }
      if (game.debug.labels) {
        ctx.save(); ctx.font = `800 12px ${FONT}`; ctx.textAlign = 'center';
        const txt = `${a.name}: ${a.stateLabel()}`;
        const tw = ctx.measureText(txt).width;
        ctx.fillStyle = 'rgba(40,30,25,0.75)'; ctx.fillRect(p.x - tw / 2 - 4, p.y + 14, tw + 8, 17);
        ctx.fillStyle = '#fff'; ctx.fillText(txt, p.x, p.y + 27); ctx.restore();
      }
    }
    game.fx.draw(ctx, this.time);
  }

  bar(x, y, w, v, color, h = 8) {
    const ctx = this.ctx;
    ctx.save();
    roundRect(ctx, x - w / 2 - 2, y - 2, w + 4, h + 4, (h + 4) / 2); ctx.fillStyle = 'rgba(90,60,45,0.85)'; ctx.fill();
    roundRect(ctx, x - w / 2, y, w, h, h / 2); ctx.fillStyle = '#fff7ea'; ctx.fill();
    if (v > 0) { roundRect(ctx, x - w / 2, y, Math.max(h, w * v), h, h / 2); ctx.fillStyle = color; ctx.fill(); }
    ctx.restore();
  }

  bubble(x, y, icon, s, t, icon2) {
    if (s <= 0.01) return;
    const ctx = this.ctx;
    const bob = Math.sin(t * 3) * 1.5;
    ctx.save();
    ctx.translate(x, y + bob);
    ctx.scale(s, s);
    const bsp = assets.sprite('ui_bubble', 'any');
    assets.draw(ctx, 'ui_bubble', 'any', 0, 0);
    const cy = -bsp.ay + (bsp.h - 14) / 2 + 1;
    if (icon2) {
      assets.drawIcon(ctx, icon, -10, cy, 30);
      assets.drawIcon(ctx, icon2, 13, cy + 4, 22);
    } else assets.drawIcon(ctx, icon, 0, cy, icon.startsWith('dish') || icon.startsWith('drink') ? 38 : 32);
    ctx.restore();
  }

  drawBuildOverlay() {
    const { ctx, game } = this;
    const b = game.build;
    if (!b.active) return;
    // selected item highlight
    if (b.selected && !b.moving) {
      const f = b.selected;
      ctx.save(); this.tilePath(f.x, f.y, f.fp[0], f.fp[1], 0.02);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.setLineDash([10, 6]); ctx.lineDashOffset = -this.time * 30; ctx.stroke(); ctx.restore();
    }
    const g = b.ghost;
    if (!g) return;
    ctx.save();
    const col = g.valid ? 'rgba(120,210,130,' : 'rgba(235,100,100,';
    if (g.kind === 'floor') {
      for (const t of g.tiles) { this.tilePath(t.x, t.y, 1, 1, 0.04); ctx.fillStyle = col + '0.35)'; ctx.fill(); }
      ctx.restore(); return;
    }
    for (const t of g.tiles) {
      this.tilePath(t.x, t.y, 1, 1, 0.03);
      ctx.fillStyle = col + '0.4)'; ctx.fill();
      ctx.strokeStyle = col + '0.95)'; ctx.lineWidth = 2.5; ctx.stroke();
    }
    for (const t of g.access || []) {
      const p = toScreen(t.x + 0.5, t.y + 0.5);
      ctx.fillStyle = t.ok ? 'rgba(255,255,255,0.8)' : 'rgba(235,100,100,0.85)';
      ctx.beginPath(); ctx.ellipse(p.x, p.y, 12, 6, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    if (g.type) {
      const f = { type: g.type, kind: furnitureById[g.type].kind, x: g.x, y: g.y, dir: g.dir, fp: World.footprint(g.type, g.dir) };
      this.drawFurniture(f, { alpha: 0.72, ghost: true });
    }
  }

  drawAssetOverlay() {
    const { ctx, game } = this;
    ctx.save();
    ctx.font = `800 11px ${FONT}`; ctx.textAlign = 'center';
    const tag = (x, y, text) => {
      const tw = ctx.measureText(text).width;
      ctx.fillStyle = 'rgba(220,60,90,0.85)'; roundRect(ctx, x - tw / 2 - 5, y - 11, tw + 10, 16, 8); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillText(text, x, y + 1);
    };
    for (const f of game.world.furniture) {
      const id = furnitureById[f.type].asset;
      if (!assets.isPlaceholder(id)) continue;
      const c = toScreen(f.x + f.fp[0] / 2, f.y + f.fp[1] / 2);
      tag(c.x, c.y - 10, 'PH ' + id);
    }
    for (const a of game.agents) {
      if (!a.visible) continue;
      const ids = ['char_body', 'char_head', 'hair_' + a.look.hair[0], 'top_' + a.look.top[0], 'bottom_' + a.look.bottom[0]].filter((i) => assets.isPlaceholder(i));
      if (ids.length) { const p = toScreen(a.x, a.y); tag(p.x, p.y + 24, `PH ×${ids.length} layers`); }
    }
    const fl = game.world.floorOf(0, 0).asset;
    if (assets.isPlaceholder(fl)) { const p = toScreen(0.5, 0.5); tag(p.x, p.y, 'PH ' + fl); }
    ctx.restore();
  }

  /** Topmost character under a view-space point. */
  pickAgent(vx, vy) {
    const w = this.game.camera.toWorld(vx, vy);
    for (let i = this.hitList.length - 1; i >= 0; i--) {
      const a = this.hitList[i].a;
      const p = this.agentScreen(a);
      const lift = a.pose.lift || 0;
      if (w.x > p.x - 26 && w.x < p.x + 26 && w.y > p.y - lift - 118 && w.y < p.y - lift + 6) return a;
    }
    return null;
  }
}

function mulHex(a, b) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (s) => Math.round((((pa >> s) & 255) * ((pb >> s) & 255)) / 255);
  return '#' + [16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('');
}

export function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// ---- isometric depth sort: topological order over screen-overlapping pairs ----
function behind(a, b) {
  if (a.x1 <= b.x0 + EPS) return true;
  if (b.x1 <= a.x0 + EPS) return false;
  if (a.y1 <= b.y0 + EPS) return true;
  if (b.y1 <= a.y0 + EPS) return false;
  // overlapping footprints: character sharing a furniture tile (sitting)
  if (a.kind === 'a' && b.kind === 'f' && a.sameTile === b.f) return !a.frontOf;
  if (b.kind === 'a' && a.kind === 'f' && b.sameTile === a.f) return b.frontOf;
  return a.depth < b.depth;
}
function overlap(r1, r2) {
  return r1[0] < r2[0] + r2[2] && r2[0] < r1[0] + r1[2] && r1[1] < r2[1] + r2[3] && r2[1] < r1[1] + r1[3];
}
export function sortDepth(items) {
  items.sort((a, b) => a.depth - b.depth);
  const n = items.length;
  const before = items.map(() => []);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (!overlap(items[i].rect, items[j].rect)) continue;
    if (behind(items[i], items[j])) before[j].push(i); else before[i].push(j);
  }
  const state = new Uint8Array(n); // 0 new, 1 visiting, 2 done
  const out = [];
  const visit = (i) => {
    if (state[i] === 2) return;
    if (state[i] === 1) return; // cycle: break it (fallback to depth order)
    state[i] = 1;
    for (const j of before[i]) visit(j);
    state[i] = 2;
    out.push(items[i]);
  };
  for (let i = 0; i < n; i++) visit(i);
  return out;
}
