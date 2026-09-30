// Placeholder art generator. Every missing PNG gets a clean, readable stand-in drawn here at the
// exact size/anchor declared in the manifest. Shapes follow the same isometric angle and top-left
// lighting as the real art so the game is fully playable with placeholders only.
import { shade } from './util.js';

const OUT = '#6b4b3a';
const NEUTRAL = '#f3eee7'; // tintable placeholders are drawn light and neutral (tint = multiply)

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  return c;
}
function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function fillStroke(ctx, fill, stroke = OUT, lw = 2) {
  ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.lineJoin = 'round'; ctx.stroke(); }
}
function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); }
function ellipse(ctx, x, y, rx, ry) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2); }
function poly(ctx, pts) { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); }

// ---------------------------------------------------------------------------
// Tiny isometric box modeler used by furniture placeholders.
// Models are authored in a canonical frame where the item's FRONT faces +v (= "fl").
// For "bl" the model is rotated 90deg so the front faces -x.
function isoCtx(ctx, def, dir, grid) {
  const [ax, ay] = def.anchor;
  const hw = grid.tileW / 2, hh = grid.tileH / 2;
  const rot = dir === 'bl';
  const T = (u, v) => (rot ? [-v, u] : [u, v]);
  const P = (x, y, z) => [ax + (x - y) * hw, ay + (x + y) * hh - z];
  const boxes = [];
  return {
    P, T,
    box(u0, v0, u1, v1, z0, z1, color, extra = {}) {
      const a = T(u0, v0), b = T(u1, v1);
      boxes.push({ x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), y0: Math.min(a[1], b[1]), y1: Math.max(a[1], b[1]), z0, z1, color, cu: [u0, v0, u1, v1], ...extra });
    },
    render() {
      boxes.sort((p, q) => (p.x0 + p.x1 + p.y0 + p.y1) - (q.x0 + q.x1 + q.y0 + q.y1) || p.z0 - q.z0);
      for (const b of boxes) drawBox(ctx, P, b, T, rot);
    },
  };
}
function drawBox(ctx, P, b, T, rot) {
  const { x0, x1, y0, y1, z0, z1, color } = b;
  const top = [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)];
  const left = [P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), P(x0, y1, z0)]; // +y face (faces down-left, lit)
  const right = [P(x1, y0, z1), P(x1, y1, z1), P(x1, y1, z0), P(x1, y0, z0)]; // +x face (faces down-right, shade)
  const oc = shade(color, -0.45);
  poly(ctx, left); fillStroke(ctx, shade(color, -0.04), oc, 1.5);
  poly(ctx, right); fillStroke(ctx, shade(color, -0.2), oc, 1.5);
  poly(ctx, top); fillStroke(ctx, shade(color, 0.14), oc, 1.5);
  // decals on the canonical front face (+v). Visible only when not rotated (fl).
  if (b.front && !rot) {
    const [u0, , u1] = b.cu;
    const F = (s, t) => P(u0 + (u1 - u0) * s, y1, z0 + (z1 - z0) * t);
    b.front(ctx, F);
  }
  if (b.back && rot) {
    // canonical back (-v) becomes +x after rotation -> visible right face
    const [u0, , u1] = b.cu;
    const F = (s, t) => { const [x, y] = T(u0 + (u1 - u0) * s, b.cu[1]); return P(x, y, z0 + (z1 - z0) * t); };
    b.back(ctx, F);
  }
  if (b.onTop) {
    const TT = (u, v) => { const [x, y] = T(u, v); return P(x, y, z1); };
    b.onTop(ctx, TT);
  }
}
function faceQuad(ctx, F, s0, t0, s1, t1, fill, stroke = OUT) {
  poly(ctx, [F(s0, t1), F(s1, t1), F(s1, t0), F(s0, t0)]);
  fillStroke(ctx, fill, stroke, 1.5);
}
function topEllipse(ctx, TT, u, v, r, fill, stroke) {
  const [cx, cy] = TT(u, v);
  const [ex] = TT(u + r, v - r); // along screen x
  ellipse(ctx, cx, cy, Math.abs(ex - cx), Math.abs(ex - cx) / 2);
  fillStroke(ctx, fill, stroke, 1.5);
}

// ---------------------------------------------------------------------------
const SHAPES = {
  generic(ctx, def, dir, ph, color) {
    const [w, h] = def.size;
    rr(ctx, 3, 3, w - 6, h - 6, Math.min(w, h) / 4);
    fillStroke(ctx, color);
  },

  floor(ctx, def, dir, ph) {
    const [w, h] = def.size;
    const P = (u, v) => [w / 2 + (u - v) * w / 2, (u + v) * h / 2];
    poly(ctx, [P(0, 0), P(1, 0), P(1, 1), P(0, 1)]);
    ctx.fillStyle = NEUTRAL; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.strokeStyle = '#ddd3c6'; ctx.fillStyle = '#e6ded3'; ctx.lineWidth = 1.5;
    if (ph.pattern === 'planks') {
      for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(...P(0, i / 4)); ctx.lineTo(...P(1, i / 4)); ctx.stroke(); }
      for (let i = 0; i < 4; i++) { const s = (i * 0.37 + 0.2) % 1; ctx.beginPath(); ctx.moveTo(...P(s, i / 4)); ctx.lineTo(...P(s, (i + 1) / 4)); ctx.stroke(); }
    } else if (ph.pattern === 'checker') {
      for (const [a, b] of [[0, 0], [0.5, 0.5]]) { poly(ctx, [P(a, b), P(a + 0.5, b), P(a + 0.5, b + 0.5), P(a, b + 0.5)]); ctx.fill(); }
    } else {
      for (let i = 1; i < 6; i++) for (let j = 1; j < 6; j++) { const [x, y] = P(i / 6, j / 6); ellipse(ctx, x, y, 2, 1); ctx.fillStyle = '#e1d7ca'; ctx.fill(); }
    }
    ctx.restore();
    poly(ctx, [P(0, 0), P(1, 0), P(1, 1), P(0, 1)]);
    ctx.strokeStyle = 'rgba(150,130,110,0.35)'; ctx.lineWidth = 1; ctx.stroke();
  },

  wall(ctx, def, dir, ph) {
    ctx.save();
    ctx.transform(1, -0.5, 0, 1, 0, 32); // wall-plane coordinates: a = 0..64 along the wall, y = 0..192 down
    const H = def.size[1] - 32;
    ctx.fillStyle = NEUTRAL; ctx.fillRect(0, 0, 64, H);
    if (ph.pattern === 'stripe') {
      ctx.fillStyle = '#e8e1d7';
      for (let a = 4; a < 64; a += 16) ctx.fillRect(a, 0, 7, H - 70);
      ctx.fillStyle = '#e4dbcf'; ctx.fillRect(0, H - 70, 64, 56);
      ctx.strokeStyle = '#d3c8ba'; ctx.lineWidth = 1.5; ctx.strokeRect(6, H - 62, 52, 40);
    }
    ctx.fillStyle = '#d7ccbf'; ctx.fillRect(0, H - 14, 64, 14); // skirting
    ctx.fillStyle = '#e2d9cd'; ctx.fillRect(0, 0, 64, 8); // top trim
    ctx.strokeStyle = 'rgba(120,100,85,0.35)'; ctx.lineWidth = 1; ctx.strokeRect(0.5, 0.5, 63, H - 1);
    ctx.restore();
  },

  doorframe(ctx, def) {
    SHAPES.wall(ctx, def, 'fl', { pattern: 'plain' });
    ctx.save();
    ctx.transform(1, -0.5, 0, 1, 0, 32);
    const H = def.size[1] - 32;
    // tint the plain wall warm (door segment is not tinted by wallpaper)
    ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = '#f6e2c9'; ctx.fillRect(0, 0, 64, H); ctx.globalCompositeOperation = 'source-over';
    const arch = () => { ctx.beginPath(); ctx.moveTo(12, H); ctx.lineTo(12, 78); ctx.arc(32, 78, 20, Math.PI, 0); ctx.lineTo(52, H); ctx.closePath(); };
    arch(); ctx.fillStyle = '#b8875a'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(17, H); ctx.lineTo(17, 80); ctx.arc(32, 80, 15, Math.PI, 0); ctx.lineTo(47, H); ctx.closePath();
    ctx.fillStyle = '#4b3a34'; ctx.fill();
    rr(ctx, 18, 28, 28, 14, 5); fillStroke(ctx, '#fff4dc', '#8a6446', 1.5);
    ctx.restore();
  },

  doorleaf(ctx, def) {
    ctx.save();
    ctx.transform(1, -0.5, 0, 1, 0, 32);
    const H = def.size[1] - 32;
    ctx.beginPath(); ctx.moveTo(17, H); ctx.lineTo(17, 80); ctx.arc(32, 80, 15, Math.PI, 0); ctx.lineTo(47, H); ctx.closePath();
    fillStroke(ctx, '#d9a878', '#7a5438', 1.5);
    ctx.strokeStyle = '#b98758'; ctx.lineWidth = 1.2;
    ctx.strokeRect(21, 118, 22, 30); ctx.strokeRect(21, 152, 22, 22);
    circle(ctx, 32, 92, 7); fillStroke(ctx, '#cfe8f5', '#7a5438', 1.5);
    circle(ctx, 42, 140, 2.5); fillStroke(ctx, '#f2cf5b', '#8a6a2a', 1);
    ctx.restore();
  },

  table(ctx, def, dir, ph, color, grid) {
    const m = isoCtx(ctx, def, dir, grid), h = ph.h;
    m.box(-0.2, -0.2, 0.2, 0.2, 0, 4, shade(NEUTRAL, -0.12));
    m.box(-0.07, -0.07, 0.07, 0.07, 4, h - 7, shade(NEUTRAL, -0.08));
    m.box(-0.38, -0.38, 0.38, 0.38, h - 7, h, NEUTRAL);
    m.render();
  },

  chair(ctx, def, dir, ph, color, grid) {
    const m = isoCtx(ctx, def, dir, grid), h = ph.h;
    const leg = shade(NEUTRAL, -0.1);
    for (const [u, v] of [[-0.24, -0.24], [0.18, -0.24], [-0.24, 0.18], [0.18, 0.18]]) m.box(u, v, u + 0.06, v + 0.06, 0, h - 5, leg);
    m.box(-0.27, -0.27, 0.27, 0.27, h - 5, h + (ph.cushion ? 5 : 0), NEUTRAL);
    m.box(-0.27, -0.27, 0.27, -0.19, h, h + ph.back, ph.cushion ? shade(NEUTRAL, -0.03) : NEUTRAL);
    m.render();
  },

  stove(ctx, def, dir, ph, color, grid) {
    const m = isoCtx(ctx, def, dir, grid), h = ph.h;
    const base = ph.color || NEUTRAL;
    if (ph.hood) m.box(-0.4, -0.4, 0.4, -0.32, h, h + 34, shade(base, -0.05));
    m.box(-0.4, -0.38, 0.4, 0.38, 0, h, base, {
      front: (c, F) => {
        faceQuad(c, F, 0.18, 0.12, 0.82, 0.62, '#5d4a44');
        faceQuad(c, F, 0.26, 0.2, 0.74, 0.54, '#f3b36b', null);
        for (const s of [0.25, 0.5, 0.75]) { const [x, y] = F(s, 0.82); circle(c, x, y, 3); fillStroke(c, '#f6d36b', OUT, 1); }
      },
      onTop: (c, TT) => {
        const burners = ph.hood ? [[-0.2, -0.1], [0.18, -0.1], [-0.2, 0.2], [0.18, 0.2]] : [[-0.18, 0.02], [0.18, 0.02]];
        for (const [u, v] of burners) topEllipse(c, TT, u, v, 0.1, '#4a4040', '#2d2626');
      },
    });
    m.render();
  },

  counter(ctx, def, dir, ph, color, grid) {
    const m = isoCtx(ctx, def, dir, grid), h = ph.h;
    const bottle = ['#9fd3c7', '#f4a6b8', '#f7d98b'];
    m.box(-0.94, -0.4, 0.94, 0.4, 0, h - 7, shade(NEUTRAL, -0.06), {
      front: (c, F) => { for (let i = 0; i < 4; i++) faceQuad(c, F, 0.04 + i * 0.24, 0.15, 0.24 + i * 0.24, 0.85, shade(NEUTRAL, -0.12), '#b0a293'); },
    });
    m.box(-1, -0.46, 1, 0.46, h - 7, h, shade(NEUTRAL, 0.02));
    bottle.forEach((b, i) => m.box(-0.6 + i * 0.5, -0.38, -0.5 + i * 0.5, -0.28, h, h + 24, b));
    m.render();
  },

  toilet(ctx, def, dir, ph, color, grid) {
    const m = isoCtx(ctx, def, dir, grid);
    m.box(-0.3, -0.42, 0.3, -0.36, 0, 40, '#bcd6ec'); // little tiled splash-back
    m.box(-0.22, -0.36, 0.22, -0.16, 22, 58, '#fbfbff');
    m.box(-0.2, -0.16, 0.2, 0.26, 0, 24, '#fbfbff', { onTop: (c, TT) => topEllipse(c, TT, 0, 0.05, 0.15, '#dfeaf5', '#9fb6cc') });
    m.render();
  },

  arcade(ctx, def, dir, ph, color, grid) {
    const m = isoCtx(ctx, def, dir, grid), h = ph.h;
    m.box(-0.36, -0.32, 0.36, 0.3, 0, h, NEUTRAL, {
      front: (c, F) => {
        faceQuad(c, F, 0.12, 0.55, 0.88, 0.86, '#3d3350');
        faceQuad(c, F, 0.18, 0.6, 0.82, 0.82, '#7fd6f0', null);
        faceQuad(c, F, 0.08, 0.9, 0.92, 0.98, '#f4a6b8', null);
      },
      back: (c, F) => faceQuad(c, F, 0.2, 0.3, 0.8, 0.7, shade(NEUTRAL, -0.15), '#b0a293'),
    });
    m.box(-0.34, 0.3, 0.34, 0.46, 46, 58, shade(NEUTRAL, -0.05), {
      onTop: (c, TT) => { topEllipse(c, TT, -0.12, 0.38, 0.05, '#ef6f6c'); topEllipse(c, TT, 0.12, 0.38, 0.05, '#f7d45b'); },
    });
    m.render();
  },

  plant(ctx, def, dir, ph, color, grid) {
    const m = isoCtx(ctx, def, dir, grid);
    m.box(-0.18, -0.18, 0.18, 0.18, 0, 28, ph.tall ? '#d8c29b' : '#d98b5f');
    m.render();
    const [cx, cy] = m.P(0, 0, 28);
    const g = ['#6fb56d', '#86c77f', '#5a9f5d', '#9bd48f'];
    const n = ph.tall ? 9 : 7;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, r = ph.tall ? 20 : 18;
      const x = cx + Math.cos(a) * r * 0.9, y = cy - (ph.h - 28) * 0.55 + Math.sin(a) * r * 0.6 - (ph.tall ? (i % 3) * 14 : 0);
      ellipse(ctx, x, y, ph.tall ? 18 : 16, ph.tall ? 13 : 11); fillStroke(ctx, g[i % 4], '#3f7a45', 1.5);
    }
    circle(ctx, cx, cy - (ph.h - 28) * 0.6 - (ph.tall ? 16 : 0), 12); fillStroke(ctx, g[3], '#3f7a45', 1.5);
  },

  lamp(ctx, def, dir, ph, color, grid) {
    const m = isoCtx(ctx, def, dir, grid), h = ph.h;
    m.box(-0.14, -0.14, 0.14, 0.14, 0, 5, shade(NEUTRAL, -0.1));
    m.box(-0.025, -0.025, 0.025, 0.025, 5, h - 30, shade(NEUTRAL, -0.15));
    m.render();
    const [cx, cy] = m.P(0, 0, h - 30);
    const glow = ctx.createRadialGradient(cx, cy + 8, 2, cx, cy + 8, 46);
    glow.addColorStop(0, 'rgba(255,236,170,0.75)'); glow.addColorStop(1, 'rgba(255,236,170,0)');
    ctx.fillStyle = glow; ctx.fillRect(cx - 50, cy - 40, 100, 100);
    poly(ctx, [[cx - 14, cy - 34], [cx + 14, cy - 34], [cx + 24, cy + 2], [cx - 24, cy + 2]]);
    fillStroke(ctx, NEUTRAL);
    ellipse(ctx, cx, cy + 2, 24, 6); fillStroke(ctx, shade(NEUTRAL, -0.06));
  },

  plate(ctx, def, dir, ph) {
    const [w, h] = def.size;
    ellipse(ctx, w / 2, h * 0.6, w * 0.44, h * 0.3); fillStroke(ctx, '#fbfaf7', '#9c8c7c', 1.5);
    ellipse(ctx, w / 2, h * 0.58, w * 0.28, h * 0.17); ctx.strokeStyle = '#ddd4c8'; ctx.lineWidth = 1; ctx.stroke();
    if (ph.dirty) {
      ellipse(ctx, w * 0.42, h * 0.58, 7, 3); ctx.fillStyle = 'rgba(214,120,80,0.7)'; ctx.fill();
      for (const [x, y] of [[0.6, 0.5], [0.55, 0.68], [0.35, 0.7], [0.66, 0.62]]) { circle(ctx, w * x, h * y, 1.4); ctx.fillStyle = '#b68a5c'; ctx.fill(); }
      ctx.strokeStyle = '#9aa4ad'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(w * 0.62, h * 0.4); ctx.lineTo(w * 0.8, h * 0.72); ctx.stroke();
    }
  },

  trash(ctx, def) {
    const [w, h] = def.size;
    ellipse(ctx, w / 2, h * 0.68, w * 0.42, h * 0.22); ctx.fillStyle = 'rgba(90,70,60,0.18)'; ctx.fill();
    poly(ctx, [[w * 0.2, h * 0.62], [w * 0.3, h * 0.35], [w * 0.46, h * 0.42], [w * 0.5, h * 0.7], [w * 0.32, h * 0.8]]);
    fillStroke(ctx, NEUTRAL, '#8a7a6c', 1.5);
    rr(ctx, w * 0.52, h * 0.3, w * 0.2, h * 0.45, 3); fillStroke(ctx, shade(NEUTRAL, -0.08), '#8a7a6c', 1.5);
    for (const [x, y] of [[0.78, 0.7], [0.15, 0.82], [0.85, 0.55]]) { circle(ctx, w * x, h * y, 2); ctx.fillStyle = '#a8927e'; ctx.fill(); }
  },

  // ----- character layers (2D, drawn light/neutral where tintable) -----
  c_body(ctx) { rr(ctx, 5, 3, 30, 29, 11); fillStroke(ctx, NEUTRAL); },
  c_head(ctx, def) {
    for (const x of [6, 56]) { circle(ctx, x, 33, 6); fillStroke(ctx, shade(NEUTRAL, -0.04)); }
    circle(ctx, 31, 29, 26); fillStroke(ctx, NEUTRAL);
  },
  c_arm(ctx) { rr(ctx, 2.5, 0.5, 7, 17, 3.5); fillStroke(ctx, NEUTRAL, OUT, 1.5); circle(ctx, 6, 18, 4.5); fillStroke(ctx, NEUTRAL, OUT, 1.5); },
  c_leg(ctx) { rr(ctx, 3.5, 0.5, 7, 12, 3); fillStroke(ctx, shade(NEUTRAL, -0.05), OUT, 1.5); ellipse(ctx, 7, 13.5, 6, 3.8); fillStroke(ctx, NEUTRAL, OUT, 1.5); },
  c_face(ctx, def, dir, ph) {
    const e = ph.expr;
    ctx.lineCap = 'round'; ctx.strokeStyle = '#3d2a22'; ctx.fillStyle = '#3d2a22'; ctx.lineWidth = 2;
    ellipse(ctx, 6, 16, 4, 2.4); ctx.fillStyle = 'rgba(242,140,150,0.55)'; ctx.fill();
    ellipse(ctx, 32, 16, 4, 2.4); ctx.fill();
    ctx.fillStyle = '#3d2a22';
    const eyes = [11, 27];
    if (e === 'neutral' || e === 'angry') {
      for (const x of eyes) { ellipse(ctx, x, 10, 2.4, 3); ctx.fill(); circle(ctx, x + 0.8, 9, 0.9); ctx.fillStyle = '#fff'; ctx.fill(); ctx.fillStyle = '#3d2a22'; }
    } else if (e === 'happy' || e === 'eating') {
      for (const x of eyes) { ctx.beginPath(); ctx.arc(x, 11, 3.2, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
    } else if (e === 'sleepy') {
      for (const x of eyes) { ctx.beginPath(); ctx.arc(x, 9, 3.2, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke(); }
    }
    if (e === 'angry') {
      ctx.beginPath(); ctx.moveTo(7, 4); ctx.lineTo(14, 6.5); ctx.moveTo(31, 4); ctx.lineTo(24, 6.5); ctx.stroke();
      ctx.beginPath(); ctx.arc(19, 21, 4, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    } else if (e === 'happy') {
      ctx.beginPath(); ctx.moveTo(15, 15); ctx.quadraticCurveTo(19, 22, 23, 15); ctx.closePath(); ctx.fillStyle = '#b8434f'; ctx.fill(); ctx.stroke();
    } else if (e === 'sleepy') {
      circle(ctx, 19, 17, 1.8); ctx.stroke();
    } else if (e === 'eating') {
      ctx.beginPath(); ctx.moveTo(14, 17); ctx.quadraticCurveTo(16.5, 14, 19, 17); ctx.quadraticCurveTo(21.5, 20, 24, 17); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(19, 14, 3.5, Math.PI * 0.2, Math.PI * 0.8); ctx.stroke();
    }
  },
  c_hair(ctx, def, dir, ph) {
    const back = dir === 'bl', s = ph.style;
    const cx = 34, cy = 35, r = 29;
    ctx.save();
    if (s === 'bun') { circle(ctx, cx, 8, 10); fillStroke(ctx, NEUTRAL); }
    if (s === 'long') { rr(ctx, 4, 24, 60, 28, 10); fillStroke(ctx, shade(NEUTRAL, -0.04)); }
    ctx.beginPath();
    if (back) {
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
    } else {
      ctx.arc(cx, cy, r, Math.PI * 0.93, Math.PI * 2.07);
      // bangs: scalloped edge across the forehead
      const y = cy - 6;
      ctx.lineTo(cx + r - 2, y + 14);
      ctx.lineTo(cx + r - 9, y + 14);
      for (let i = 0; i < 4; i++) { const x0 = cx + 17 - i * 11; ctx.quadraticCurveTo(x0 - 5, y + 9, x0 - 11, y + 2); }
      ctx.lineTo(cx - r + 9, y + 14);
      ctx.lineTo(cx - r + 2, y + 14);
    }
    ctx.closePath();
    fillStroke(ctx, NEUTRAL);
    if (s === 'spiky') {
      for (let i = 0; i < 5; i++) { const x = 12 + i * 11; poly(ctx, [[x - 6, 14], [x, 1 + (i % 2) * 4], [x + 6, 14]]); fillStroke(ctx, NEUTRAL); }
    }
    if (s === 'bob' && !back) { for (const x of [5, 55]) { rr(ctx, x, 30, 8, 18, 4); fillStroke(ctx, NEUTRAL); } }
    // shine
    ctx.beginPath(); ctx.arc(cx - 8, cy - 14, 10, Math.PI * 1.1, Math.PI * 1.5); ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 3; ctx.stroke();
    ctx.restore();
  },
  c_top(ctx, def, dir, ph) {
    const back = dir === 'bl';
    rr(ctx, 4, 3, 38, 30, 11); fillStroke(ctx, NEUTRAL);
    ctx.strokeStyle = shade(NEUTRAL, -0.3); ctx.lineWidth = 1.5;
    if (!back) {
      if (ph.style === 'tee') { ctx.beginPath(); ctx.moveTo(16, 4); ctx.lineTo(23, 11); ctx.lineTo(30, 4); ctx.stroke(); }
      if (ph.style === 'jacket') {
        poly(ctx, [[15, 3.5], [23, 13], [31, 3.5]]); fillStroke(ctx, '#ffffff', shade(NEUTRAL, -0.3), 1.5);
        for (const y of [17, 25]) { circle(ctx, 23, y, 2); ctx.fillStyle = shade(NEUTRAL, -0.35); ctx.fill(); }
      }
      if (ph.style === 'hoodie') { rr(ctx, 13, 19, 20, 10, 4); ctx.stroke(); ctx.beginPath(); ctx.moveTo(19, 5); ctx.lineTo(19, 14); ctx.moveTo(27, 5); ctx.lineTo(27, 14); ctx.stroke(); }
    } else if (ph.style === 'hoodie') { rr(ctx, 12, 1, 22, 13, 6); fillStroke(ctx, shade(NEUTRAL, -0.05), shade(NEUTRAL, -0.3), 1.5); }
  },
  c_bottom(ctx, def, dir, ph) {
    if (ph.style === 'skirt') { poly(ctx, [[10, 1], [34, 1], [41, 15], [3, 15]]); fillStroke(ctx, NEUTRAL); }
    else { rr(ctx, 6, 1, 32, 14, 5); fillStroke(ctx, NEUTRAL); ctx.beginPath(); ctx.moveTo(22, 6); ctx.lineTo(22, 15); ctx.strokeStyle = shade(NEUTRAL, -0.3); ctx.lineWidth = 1.5; ctx.stroke(); }
  },
  c_hat(ctx, def, dir, ph) {
    const back = dir === 'bl';
    if (ph.style === 'chef') {
      for (const [x, y, r] of [[16, 16, 11], [40, 16, 11], [28, 11, 13]]) { circle(ctx, x, y, r); fillStroke(ctx, '#fdfcf8'); }
      rr(ctx, 12, 20, 32, 17, 4); fillStroke(ctx, '#fdfcf8');
      ctx.fillStyle = '#fdfcf8'; ctx.fillRect(13.5, 16, 29, 8);
    } else if (ph.style === 'cap') {
      if (back) { ellipse(ctx, 28, 36, 14, 4); fillStroke(ctx, shade(NEUTRAL, -0.05)); }
      ctx.beginPath(); ctx.arc(28, 38, 24, Math.PI, 0); ctx.closePath(); fillStroke(ctx, NEUTRAL);
      if (!back) { ellipse(ctx, 18, 37, 14, 3.5); fillStroke(ctx, shade(NEUTRAL, -0.05)); }
      circle(ctx, 28, 14, 3); fillStroke(ctx, NEUTRAL, OUT, 1.5);
    } else {
      poly(ctx, [[28, 30], [8, 18], [6, 36]]); fillStroke(ctx, NEUTRAL);
      poly(ctx, [[28, 30], [48, 18], [50, 36]]); fillStroke(ctx, NEUTRAL);
      circle(ctx, 28, 30, 6); fillStroke(ctx, shade(NEUTRAL, -0.05));
    }
  },
  h_tray(ctx, def) { const [w, h] = def.size; ellipse(ctx, w / 2, h / 2, w / 2 - 2, h / 2 - 2); fillStroke(ctx, '#dfe6ec', '#7d8a96'); ellipse(ctx, w / 2, h / 2 - 1, w / 2 - 8, h / 2 - 5); ctx.strokeStyle = '#f7fbff'; ctx.lineWidth = 1.5; ctx.stroke(); },
  h_broom(ctx, def) {
    rr(ctx, 9, 1, 4, 50, 2); fillStroke(ctx, '#c79a62', OUT, 1.5);
    poly(ctx, [[5, 50], [17, 50], [21, 74], [1, 74]]); fillStroke(ctx, '#f0d27a', OUT, 1.5);
    ctx.strokeStyle = '#c9a44f'; ctx.lineWidth = 1; for (let x = 5; x < 19; x += 4) { ctx.beginPath(); ctx.moveTo(x + 1, 54); ctx.lineTo(x, 72); ctx.stroke(); }
  },
  h_wrench(ctx) { rr(ctx, 7, 12, 6, 22, 3); fillStroke(ctx, '#aeb8c2'); ctx.beginPath(); ctx.arc(10, 9, 8, 0, Math.PI * 2); fillStroke(ctx, '#c4ccd4'); ctx.fillStyle = 'rgba(0,0,0,0)'; ctx.clearRect(7, 0, 6, 8); },
  h_shaker(ctx) { poly(ctx, [[4, 10], [16, 10], [14, 31], [6, 31]]); fillStroke(ctx, '#d6dfe8'); rr(ctx, 5, 3, 10, 8, 3); fillStroke(ctx, '#c1ccd8'); },

  // ----- food & icons -----
  dish(ctx, def, dir, ph) {
    const c = ph.color;
    if (ph.drink) {
      ellipse(ctx, 32, 57, 16, 5); ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fill();
      poly(ctx, [[18, 16], [46, 16], [42, 56], [22, 56]]); fillStroke(ctx, 'rgba(235,245,250,0.9)', '#7f97a6');
      poly(ctx, [[20, 26], [44, 26], [41.5, 54], [22.5, 54]]); fillStroke(ctx, c, null);
      ctx.strokeStyle = '#ef7b8e'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(36, 30); ctx.lineTo(42, 4); ctx.stroke();
      circle(ctx, 26, 24, 5); fillStroke(ctx, '#fff7c7', '#b8a655', 1.2);
    } else {
      ellipse(ctx, 32, 50, 28, 11); fillStroke(ctx, '#fbfaf7', '#9c8c7c');
      ellipse(ctx, 32, 38, 20, 14); fillStroke(ctx, c, shade(c, -0.45));
      ellipse(ctx, 27, 32, 7, 4); ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fill();
    }
  },
  ingredient(ctx, def, dir, ph) {
    const [w, h] = def.size;
    circle(ctx, w / 2, h / 2 + 2, w * 0.36); fillStroke(ctx, ph.color, shade(ph.color, -0.5));
    ellipse(ctx, w * 0.4, h * 0.42, 5, 3); ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fill();
    ellipse(ctx, w * 0.6, h * 0.16, 6, 3); fillStroke(ctx, '#7cbf6a', '#3f7a45', 1.2);
  },
  bubble(ctx, def) {
    const [w, h] = def.size;
    ctx.beginPath();
    rr(ctx, 2, 2, w - 4, h - 16, 18);
    fillStroke(ctx, '#fffdf8', '#8a6a55', 2.5);
    poly(ctx, [[w / 2 - 8, h - 15.5], [w / 2 + 8, h - 15.5], [w / 2, h - 2]]); fillStroke(ctx, '#fffdf8', null);
    ctx.beginPath(); ctx.moveTo(w / 2 - 8, h - 14); ctx.lineTo(w / 2, h - 2); ctx.lineTo(w / 2 + 8, h - 14); ctx.strokeStyle = '#8a6a55'; ctx.lineWidth = 2.5; ctx.stroke();
  },
  emote(ctx, def, dir, ph) { drawGlyph(ctx, ph.glyph, def.size[0], def.size[1]); },
  icon(ctx, def, dir, ph) { drawGlyph(ctx, ph.glyph, def.size[0], def.size[1]); },
  panel(ctx, def) {
    const [w, h] = def.size;
    rr(ctx, 3, 5, w - 6, h - 6, 26); ctx.fillStyle = 'rgba(80,50,30,0.25)'; ctx.fill();
    rr(ctx, 3, 3, w - 6, h - 8, 26); fillStroke(ctx, '#fff6e6', '#7b5238', 5);
    rr(ctx, 11, 11, w - 22, h - 24, 18); ctx.setLineDash([5, 4]); ctx.strokeStyle = '#e7c9a4'; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]);
  },
  button(ctx, def, dir, ph) {
    const [w, h] = def.size;
    rr(ctx, 2, 5, w - 4, h - 7, 14); fillStroke(ctx, shade(ph.color, -0.25), '#6e4a33', 3);
    rr(ctx, 2, 2, w - 4, h - 10, 14); fillStroke(ctx, ph.color, '#6e4a33', 3);
    rr(ctx, 9, 7, w - 18, 7, 4); ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill();
  },
  chip(ctx, def) {
    const [w, h] = def.size;
    rr(ctx, 2, 4, w - 4, h - 6, 20); ctx.fillStyle = 'rgba(80,50,30,0.25)'; ctx.fill();
    rr(ctx, 2, 2, w - 4, h - 7, 20); fillStroke(ctx, '#fff6e6', '#7b5238', 3.5);
  },
  logo(ctx, def, dir, ph) {
    const [w, h] = def.size;
    ctx.font = `900 ${Math.floor(h * 0.48)}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.lineWidth = 14; ctx.strokeStyle = '#6b4230'; ctx.strokeText(ph.text, w / 2, h / 2);
    ctx.fillStyle = '#fff1d6'; ctx.fillText(ph.text, w / 2, h / 2);
    ctx.fillStyle = '#f6a5b2'; ctx.fillText(ph.text, w / 2, h / 2 + 3); ctx.fillStyle = '#fff4df'; ctx.fillText(ph.text, w / 2, h / 2 - 1);
  },
  soil(ctx, def) {
    const [w, h] = def.size;
    poly(ctx, [[w / 2, 6], [w - 4, h / 2 + 2], [w / 2, h - 4], [4, h / 2 + 2]]); fillStroke(ctx, '#c79a62', '#6b4b3a', 2.5);
    poly(ctx, [[w / 2, 13], [w - 16, h / 2 + 2], [w / 2, h - 11], [16, h / 2 + 2]]); fillStroke(ctx, '#7a5438', '#5a3c28', 1.5);
    ctx.strokeStyle = '#5f412c'; ctx.lineWidth = 2;
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(w / 2 - 22 + i * 14, h / 2 - 8 + i * 7); ctx.lineTo(w / 2 + 22 + i * 14, h / 2 + 14 + i * 7 - 22 + 8); ctx.stroke(); }
  },
  sprout(ctx, def) {
    const [w, h] = def.size;
    ctx.strokeStyle = '#4f8f4c'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(w / 2, h - 6); ctx.lineTo(w / 2, h / 2); ctx.stroke();
    ellipse(ctx, w / 2 - 9, h / 2 - 2, 10, 5.5); fillStroke(ctx, '#86c77f', '#3f7a45', 1.5);
    ellipse(ctx, w / 2 + 9, h / 2 - 5, 10, 5.5); fillStroke(ctx, '#9bd48f', '#3f7a45', 1.5);
  },
};

export const FONT = "'Nunito','Varela Round','Trebuchet MS','Segoe UI',system-ui,sans-serif";

function star(ctx, cx, cy, r1, r2, n = 5) {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) { const r = i % 2 ? r2 : r1, a = -Math.PI / 2 + (i * Math.PI) / n; ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
  ctx.closePath();
}
function heart(ctx, cx, cy, s) {
  ctx.beginPath();
  ctx.moveTo(cx, cy + s * 0.9);
  ctx.bezierCurveTo(cx - s * 1.4, cy, cx - s * 0.9, cy - s * 1.1, cx, cy - s * 0.35);
  ctx.bezierCurveTo(cx + s * 0.9, cy - s * 1.1, cx + s * 1.4, cy, cx, cy + s * 0.9);
  ctx.closePath();
}

function drawGlyph(ctx, g, w, h) {
  const cx = w / 2, cy = h / 2, s = Math.min(w, h) / 40;
  ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  switch (g) {
    case 'coin': circle(ctx, 0, 0, 17); fillStroke(ctx, '#f7c948', '#9a6b17', 2.5); circle(ctx, 0, 0, 11.5); ctx.strokeStyle = '#d99a1e'; ctx.lineWidth = 2; ctx.stroke();
      ctx.font = `900 15px ${FONT}`; ctx.fillStyle = '#b07a12'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('R', 0, 1); break;
    case 'points': ellipse(ctx, 0, 10, 13, 5); fillStroke(ctx, '#fbe7a1', '#9a6b17', 2);
      for (const [x, y, r] of [[-8, -4, 8], [8, -4, 8], [0, -10, 10]]) { circle(ctx, x, y, r); fillStroke(ctx, '#ffd86b', '#9a6b17', 2); }
      ctx.fillStyle = '#ffd86b'; ctx.fillRect(-11, -4, 22, 12); ctx.strokeStyle = '#9a6b17'; ctx.lineWidth = 2; ctx.strokeRect(-11, 2, 22, 7); break;
    case 'star': star(ctx, 0, 1, 18, 8); fillStroke(ctx, '#ffd23f', '#a86b10', 2.5); break;
    case 'star_empty': star(ctx, 0, 1, 18, 8); fillStroke(ctx, '#e9dccb', '#b39c83', 2.5); break;
    case 'energy': poly(ctx, [[4, -18], [-10, 3], [-1, 3], [-4, 18], [11, -4], [2, -4]]); fillStroke(ctx, '#ffe066', '#b0801a', 2.5); break;
    case 'clock': circle(ctx, 0, 0, 16); fillStroke(ctx, '#fff8ea', '#7b5238', 2.5); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -10); ctx.moveTo(0, 0); ctx.lineTo(7, 4); ctx.strokeStyle = '#7b5238'; ctx.lineWidth = 2.5; ctx.stroke(); break;
    case 'gift': rr(ctx, -15, -6, 30, 22, 4); fillStroke(ctx, '#f4a6b8', '#8f4a5a', 2.5); rr(ctx, -17, -11, 34, 8, 3); fillStroke(ctx, '#f7bfcc', '#8f4a5a', 2.5);
      ctx.fillStyle = '#ffd86b'; ctx.fillRect(-3, -11, 6, 27); ellipse(ctx, -6, -15, 6, 4); fillStroke(ctx, '#ffd86b', '#a86b10', 2); ellipse(ctx, 6, -15, 6, 4); fillStroke(ctx, '#ffd86b', '#a86b10', 2); break;
    case 'patience': heart(ctx, 0, 0, 15); fillStroke(ctx, '#f4a6b8', '#8f4a5a', 2.5); break;
    case 'rotate': ctx.beginPath(); ctx.arc(0, 0, 12, -0.3, Math.PI * 1.5); ctx.strokeStyle = '#6b4b3a'; ctx.lineWidth = 5; ctx.stroke(); poly(ctx, [[3, -19], [3, -5], [13, -12]]); fillStroke(ctx, '#6b4b3a', null); break;
    case 'move': for (let i = 0; i < 4; i++) { ctx.save(); ctx.rotate((i * Math.PI) / 2); poly(ctx, [[0, -18], [-7, -9], [7, -9]]); fillStroke(ctx, '#6b4b3a', null); ctx.fillRect(-2, -10, 4, 10); ctx.restore(); } break;
    case 'sell': circle(ctx, 0, 0, 16); fillStroke(ctx, '#f7c948', '#9a6b17', 2.5); ctx.fillStyle = '#9a3b2b'; ctx.fillRect(-8, -2.5, 16, 5); break;
    case 'lock': rr(ctx, -12, -3, 24, 19, 4); fillStroke(ctx, '#f2c45a', '#8a6420', 2.5); ctx.beginPath(); ctx.arc(0, -4, 8, Math.PI, 0); ctx.strokeStyle = '#8a6420'; ctx.lineWidth = 4; ctx.stroke(); break;
    case 'water': rr(ctx, -14, -6, 22, 18, 5); fillStroke(ctx, '#a9cbe8', '#4e6f8c', 2.5); poly(ctx, [[8, -2], [18, -12], [20, -8], [10, 4]]); fillStroke(ctx, '#a9cbe8', '#4e6f8c', 2); circle(ctx, 18, 2, 2); ctx.fillStyle = '#6fa8dc'; ctx.fill(); break;
    case 'seed': rr(ctx, -12, -16, 24, 32, 3); fillStroke(ctx, '#f7df8c', '#8a6420', 2.5); circle(ctx, 0, 2, 7); fillStroke(ctx, '#86c77f', '#3f7a45', 2); break;
    case 'harvest': ellipse(ctx, 0, 6, 17, 11); fillStroke(ctx, '#d9a066', '#7a5438', 2.5); for (const [x, c] of [[-7, '#e85a4f'], [3, '#8fcf6a'], [9, '#f39a3c']]) { circle(ctx, x, -3, 6); fillStroke(ctx, c, '#5b4031', 1.5); } break;
    case 'level': circle(ctx, 0, -4, 13); fillStroke(ctx, '#a9cbe8', '#4e6f8c', 2.5); poly(ctx, [[-8, 6], [-12, 19], [-3, 14], [0, 19], [2, 7]]); fillStroke(ctx, '#f4a6b8', '#8f4a5a', 2); break;
    case 'build': ctx.rotate(-0.6); rr(ctx, -3, -4, 6, 24, 3); fillStroke(ctx, '#c79a62'); rr(ctx, -12, -16, 24, 12, 4); fillStroke(ctx, '#b8c5d1'); break;
    case 'staff': circle(ctx, 0, 4, 13); fillStroke(ctx, '#fbe3d0'); for (const [x, y, r] of [[-7, -12, 7], [7, -12, 7], [0, -16, 8]]) { circle(ctx, x, y, r); fillStroke(ctx, '#fff', OUT, 2); }
      circle(ctx, -4, 4, 1.8); ctx.fillStyle = '#3d2a22'; ctx.fill(); circle(ctx, 4, 4, 1.8); ctx.fill(); break;
    case 'menu': rr(ctx, -16, -14, 15, 28, 3); fillStroke(ctx, '#fff6e6'); rr(ctx, 1, -14, 15, 28, 3); fillStroke(ctx, '#fff6e6');
      ctx.strokeStyle = '#d9a066'; ctx.lineWidth = 2; for (const y of [-6, 0, 6]) { ctx.beginPath(); ctx.moveTo(-12, y); ctx.lineTo(-5, y); ctx.moveTo(5, y); ctx.lineTo(12, y); ctx.stroke(); } break;
    case 'garden': rr(ctx, -11, 2, 22, 15, 4); fillStroke(ctx, '#d98b5f'); ctx.strokeStyle = '#4f8f4c'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(0, -8); ctx.stroke();
      ellipse(ctx, -8, -10, 8, 5); fillStroke(ctx, '#86c77f', '#3f7a45', 2); ellipse(ctx, 8, -13, 8, 5); fillStroke(ctx, '#9bd48f', '#3f7a45', 2); break;
    case 'market': poly(ctx, [[-17, -2], [17, -2], [12, 16], [-12, 16]]); fillStroke(ctx, '#d9a066'); ctx.beginPath(); ctx.arc(0, -2, 12, Math.PI, 0); ctx.strokeStyle = OUT; ctx.lineWidth = 3; ctx.stroke();
      circle(ctx, -6, -4, 5); fillStroke(ctx, '#e85a4f', OUT, 1.5); circle(ctx, 5, -5, 5); fillStroke(ctx, '#8fcf6a', OUT, 1.5); break;
    case 'settings': star(ctx, 0, 0, 17, 12, 8); fillStroke(ctx, '#c9d3dc', '#56606b', 2.5); circle(ctx, 0, 0, 6); fillStroke(ctx, '#fff', '#56606b', 2.5); break;
    // emotes
    case 'heart': heart(ctx, 0, 1, 14); fillStroke(ctx, '#f58aa0', '#a8425a', 2.5); ellipse(ctx, -6, -5, 3, 2); ctx.fillStyle = '#fff'; ctx.fill(); break;
    case 'angry': ctx.strokeStyle = '#e0453a'; ctx.lineWidth = 5;
      for (let i = 0; i < 4; i++) { ctx.save(); ctx.rotate(i * Math.PI / 2 + Math.PI / 4); ctx.beginPath(); ctx.moveTo(-4, -14); ctx.quadraticCurveTo(0, -5, 4, -14); ctx.stroke(); ctx.restore(); } break;
    case 'sad': ctx.beginPath(); ctx.moveTo(0, -16); ctx.bezierCurveTo(10, -2, 12, 14, 0, 14); ctx.bezierCurveTo(-12, 14, -10, -2, 0, -16); fillStroke(ctx, '#8fc3ea', '#3f6f96', 2.5); break;
    case 'zzz': ctx.font = `900 16px ${FONT}`; ctx.fillStyle = '#5b86b8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('Z', -8, 8); ctx.font = `900 13px ${FONT}`; ctx.fillText('z', 3, 0); ctx.font = `900 10px ${FONT}`; ctx.fillText('z', 11, -8); break;
    case 'wait': poly(ctx, [[-10, -15], [10, -15], [0, 0]]); fillStroke(ctx, '#f7df8c', '#8a6420', 2); poly(ctx, [[-10, 15], [10, 15], [0, 0]]); fillStroke(ctx, '#f7df8c', '#8a6420', 2);
      ctx.fillStyle = '#8a6420'; ctx.fillRect(-12, -17, 24, 3); ctx.fillRect(-12, 14, 24, 3); break;
    case 'sparkle': star(ctx, -4, 2, 13, 4, 4); fillStroke(ctx, '#ffd86b', '#b0801a', 2); star(ctx, 10, -9, 7, 2, 4); fillStroke(ctx, '#ffe9a6', '#b0801a', 1.5); break;
    case 'note': ctx.fillStyle = '#7b6bb0'; ellipse(ctx, -6, 10, 7, 5); ctx.fill(); ctx.fillRect(-1, -15, 3.5, 25); poly(ctx, [[-1, -15], [12, -9], [12, -3], [2, -8]]); ctx.fill(); break;
    case 'broken': star(ctx, 0, 0, 16, 11, 8); fillStroke(ctx, '#b8c1c9', '#56606b', 2.5); circle(ctx, 0, 0, 5); fillStroke(ctx, '#fff', '#56606b', 2);
      ctx.strokeStyle = '#e0453a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-3, -18); ctx.lineTo(3, -6); ctx.lineTo(-2, 2); ctx.lineTo(4, 16); ctx.stroke(); break;
    default: // unknown glyph: soft circle with initial
      circle(ctx, 0, 0, 16); fillStroke(ctx, '#f6e3c3');
      ctx.font = `900 16px ${FONT}`; ctx.fillStyle = OUT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText((g || '?')[0].toUpperCase(), 0, 1);
  }
  ctx.restore();
}

function drawLabel(ctx, text, w, h, mirror) {
  let size = Math.min(12, Math.max(7, w / 11));
  ctx.font = `800 ${size}px ${FONT}`;
  while (ctx.measureText(text).width > w - 8 && size > 6) { size -= 1; ctx.font = `800 ${size}px ${FONT}`; }
  const tw = ctx.measureText(text).width;
  const y = h - size - 4;
  ctx.save();
  if (mirror) { ctx.translate(w, 0); ctx.scale(-1, 1); }
  ctx.globalAlpha = 0.85;
  rr(ctx, w / 2 - tw / 2 - 4, y - 2, tw + 8, size + 5, (size + 5) / 2);
  ctx.fillStyle = 'rgba(255,250,240,0.85)'; ctx.fill();
  ctx.fillStyle = '#6b4b3a'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(text, w / 2, y);
  ctx.restore();
}

const NO_LABEL = new Set(['panel', 'button', 'chip', 'logo', 'icon', 'wall', 'doorframe', 'doorleaf', 'bubble']); // walls/icons: id shown in the debug asset overlay / tooltip

/**
 * Build a placeholder canvas for a manifest entry.
 * @param mirrorText pre-mirror the label so it reads correctly when the sprite is drawn flipped.
 */
export function makePlaceholder(def, dir, grid, catColor, mirrorText = false) {
  const [w, h] = def.size;
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  const ph = def.placeholder || { shape: 'generic' };
  const fn = SHAPES[ph.shape] || SHAPES.generic;
  try { fn(ctx, def, dir, ph, ph.color || catColor, grid); } catch (e) { console.warn('placeholder failed', def.id, e); SHAPES.generic(ctx, def, dir, ph, catColor); }
  // Label with the asset id when there is room (tiny layers/icons are labeled via the debug asset overlay instead).
  if (w >= 56 && h >= 40 && !NO_LABEL.has(ph.shape) && !/^[ch]_/.test(ph.shape)) {
    ctx.save();
    if (ph.shape === 'floor') ctx.globalAlpha = 0.3;
    drawLabel(ctx, def.id + (dir !== 'any' ? `·${dir}` : ''), w, ph.shape === 'floor' ? h - 12 : h, mirrorText);
    ctx.restore();
  }
  return c;
}
