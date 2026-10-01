// Floating numbers and little particles (puffs, sparkles, crumbs, hearts). Each effect is anchored
// to a world position ({gx, gy, h}) and projected onto the 2D overlay every frame, so it stays
// glued to the scene while the camera pans, zooms and rotates. Runs on real time.
import { assets } from './assets.js';
import { DISPLAY_FONT } from './placeholder.js';

export class FX {
  constructor() { this.items = []; }

  push(o) { this.items.push({ age: 0, dx: 0, dy: 0, ...o }); }

  text(at, text, icon, color = '#fff') {
    const near = this.items.filter((i) => i.type === 'text' && Math.abs(i.at.gx - at.gx) < 0.3 && Math.abs(i.at.gy - at.gy) < 0.3 && i.age < 0.4).length;
    this.push({ type: 'text', at, stack: near * 26, text, icon, color, life: 1.6 });
  }
  /** Big popping headline (ability names). */
  title(at, text, color) { this.push({ type: 'title', at, text, color, life: 1.4 }); }
  /** Motes that fly inward to `at` (power gathering). */
  gather(at, color, n = 1) {
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, r = 38 + Math.random() * 26; this.push({ type: 'gather', at, ox: Math.cos(a) * r, oy: Math.sin(a) * r * 0.7, color, life: 0.45 + Math.random() * 0.2 }); }
  }
  puff(at, color = '#fff', n = 1) {
    for (let i = 0; i < n; i++) this.push({ type: 'puff', at, dx: (Math.random() - 0.5) * 16, vx: (Math.random() - 0.5) * 20, vy: -18 - Math.random() * 14, r: 5 + Math.random() * 5, color, life: 0.9 + Math.random() * 0.4 });
  }
  /** A soft curl of steam rising from a hot cup. */
  steam(at, n = 1) {
    for (let i = 0; i < n; i++) this.push({ type: 'steam', at, dx: (Math.random() - 0.5) * 8, vx: 0, vy: -15 - Math.random() * 8, r: 4 + Math.random() * 3, ph: Math.random() * 6.28, life: 1.5 + Math.random() * 0.5 });
  }
  sparkle(at, n = 6, color = '#ffe27a') {
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 50; this.push({ type: 'spark', at, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 30, color, life: 0.7 + Math.random() * 0.3 }); }
  }
  hearts(at, n = 3) {
    for (let i = 0; i < n; i++) this.push({ type: 'heart', at, dx: (Math.random() - 0.5) * 30, vx: (Math.random() - 0.5) * 12, vy: -30 - Math.random() * 20, age: -i * 0.12, life: 1.2 });
  }
  crumbs(at, color = '#d9a066') {
    for (let i = 0; i < 3; i++) this.push({ type: 'crumb', at, vx: (Math.random() - 0.5) * 40, vy: -40 - Math.random() * 20, color, life: 0.5 });
  }

  update(dt) {
    for (const p of this.items) {
      p.age += dt;
      if (p.age < 0 || p.type === 'text') continue;
      if (p.type === 'crumb' || p.type === 'spark') p.vy += 160 * dt;
      p.dx += (p.vx || 0) * dt; p.dy += (p.vy || 0) * dt;
    }
    this.items = this.items.filter((p) => p.age < p.life);
    if (this.items.length > 400) this.items.splice(0, this.items.length - 400);
  }

  /** project(gx, gy, h) -> {x, y, s} in overlay pixels (s = scale factor), or null when behind the camera. */
  draw(ctx, project) {
    for (const p of this.items) {
      if (p.age < 0) continue;
      const q = project(p.at.gx, p.at.gy, p.at.h);
      if (!q) continue;
      const k = p.age / p.life, s = q.s;
      ctx.save();
      if (p.type === 'title') {
        const pop = p.age < 0.16 ? 1.9 - (p.age / 0.16) * 1.0 : p.age < 0.3 ? 0.9 + ((p.age - 0.16) / 0.14) * 0.1 : 1;
        const rise = 30 * Math.min(1, k * 1.5);
        ctx.globalAlpha = k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
        ctx.translate(q.x, q.y - rise * s); ctx.scale(pop * s, pop * s);
        ctx.font = `800 30px ${DISPLAY_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        ctx.shadowColor = p.color; ctx.shadowBlur = 18;
        ctx.lineWidth = 8; ctx.strokeStyle = p.color; ctx.strokeText(p.text, 0, 0);
        ctx.shadowBlur = 0;
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.strokeText(p.text, 0, 0);
        ctx.fillStyle = '#ffffff'; ctx.fillText(p.text, 0, 0);
      } else if (p.type === 'gather') {
        const e = k * k;
        ctx.globalAlpha = Math.min(1, k * 3) * 0.9;
        ctx.fillStyle = p.color; ctx.shadowColor = p.color; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.arc(q.x + p.ox * (1 - e) * s, q.y + p.oy * (1 - e) * s, (2.2 + 1.8 * k) * s, 0, Math.PI * 2); ctx.fill();
      } else if (p.type === 'text') {
        const pop = p.age < 0.15 ? 0.6 + (p.age / 0.15) * 0.5 : p.age < 0.25 ? 1.1 - ((p.age - 0.15) / 0.1) * 0.1 : 1;
        const rise = 55 * (1 - Math.pow(1 - Math.min(1, k), 3));
        ctx.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
        ctx.translate(q.x, q.y - (rise + p.stack) * s); ctx.scale(pop * s, pop * s);
        ctx.font = `600 24px ${DISPLAY_FONT}`; ctx.textBaseline = 'middle';
        const tw = ctx.measureText(p.text).width, iw = p.icon ? 24 : 0, x0 = -(tw + iw) / 2;
        if (p.icon) assets.drawIcon(ctx, p.icon, x0 + 10, 0, 24);
        ctx.lineJoin = 'round'; ctx.lineWidth = 5; ctx.strokeStyle = '#5b3a28';
        ctx.strokeText(p.text, x0 + iw, 1); ctx.fillStyle = p.color; ctx.fillText(p.text, x0 + iw, 1);
      } else {
        const x = q.x + p.dx * s, y = q.y + p.dy * s;
        if (p.type === 'steam') { ctx.globalAlpha = 0.5 * Math.sin(Math.min(1, k) * Math.PI); ctx.fillStyle = '#fffaf0'; ctx.beginPath(); ctx.arc(x + Math.sin(p.age * 4 + p.ph) * 4 * s, y, p.r * (1 + k * 1.3) * s, 0, Math.PI * 2); ctx.fill(); }
        else if (p.type === 'puff') { ctx.globalAlpha = 0.55 * (1 - k); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(x, y, p.r * (1 + k) * s, 0, Math.PI * 2); ctx.fill(); }
        else if (p.type === 'spark') { ctx.globalAlpha = 1 - k; ctx.fillStyle = p.color; ctx.translate(x, y); ctx.rotate(p.age * 6); ctx.fillRect(-3 * s, -3 * s, 6 * s, 6 * s); }
        else if (p.type === 'heart') { ctx.globalAlpha = 1 - k; assets.drawIcon(ctx, 'emote_heart', x, y, 18 * s); }
        else if (p.type === 'crumb') { ctx.globalAlpha = 1 - k; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(x, y, 2.2 * s, 0, Math.PI * 2); ctx.fill(); }
      }
      ctx.restore();
    }
  }
}
