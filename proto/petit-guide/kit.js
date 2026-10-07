// Le Petit Guide — the shared kit: the hands-on steps, sound, particles, and making one drink (cook).
// Used by game.js (a single critic) and run.js (the roguelite night). Standalone: only the 3D bar uses the game's code.
//   萃取 shot   — hold, release when the shot glass reaches the golden band
//   打奶泡 steam — hold to heat; slide the finger to keep the wand in the drifting sweet spot
//   拉花 art     — hold to pour a white circle to the guide ring, then swipe down through it
//   加水 water   — hold to pour hot water; the finger's height sets the flow, too fast breaks the crema
// Every step takes `M`, the modifiers from the run's cards (band widths, speed, the sweet-spot marks, a tulip).

export const phone = document.getElementById('phone');
export const h = (tag, attrs = {}, ...kids) => {
  if (attrs == null || typeof attrs !== 'object' || attrs.nodeType || Array.isArray(attrs)) { kids.unshift(attrs); attrs = {}; }
  const [name, ...cls] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (cls.length) el.className = cls.join(' ');
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(c));
  return el;
};
export const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, k) => a + (b - a) * k;
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export const ART = (n) => new URL(`./art/${n}.png`, import.meta.url).href;
/** requestAnimationFrame, with a timer as a fallback when the page isn't being painted (a hidden tab or pane). */
export const nextFrame = (cb) => {
  let done = false;
  const go = () => { if (!done) { done = true; cancelAnimationFrame(id); clearTimeout(tm); cb(performance.now()); } };
  const id = requestAnimationFrame(go), tm = setTimeout(go, 60);
};
export const vibrate = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch {} };

// ------------------------------------------------------------------ sound (synthesized, no files)
export const sfx = (() => {
  let ac = null, noiseBuf = null;
  const ctx = () => {
    if (!ac) {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  };
  const tone = (f, dur = 0.12, type = 'sine', vol = 0.15, delay = 0) => {
    const a = ctx(), o = a.createOscillator(), g = a.createGain(), t = a.currentTime + delay;
    o.type = type; o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
  };
  /** A looping filtered noise (steam hiss, pouring); returns { set(vol, freq), stop() }. */
  const loop = (freq, q = 1, type = 'bandpass') => {
    const a = ctx(), s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    s.buffer = noiseBuf; s.loop = true; f.type = type; f.frequency.value = freq; f.Q.value = q; g.gain.value = 0;
    s.connect(f).connect(g).connect(a.destination); s.start();
    return {
      set(vol, fr) { g.gain.setTargetAtTime(vol, a.currentTime, 0.05); if (fr) f.frequency.setTargetAtTime(fr, a.currentTime, 0.08); },
      stop() { g.gain.setTargetAtTime(0, a.currentTime, 0.05); setTimeout(() => s.stop(), 300); },
    };
  };
  return {
    unlock: ctx,
    tap: () => tone(660, 0.06, 'triangle', 0.1),
    perfect: () => { tone(784, 0.12, 'triangle', 0.14); tone(1046, 0.18, 'triangle', 0.14, 0.09); tone(1318, 0.3, 'triangle', 0.12, 0.18); },
    good: () => { tone(660, 0.12, 'triangle', 0.13); tone(880, 0.2, 'triangle', 0.12, 0.09); },
    miss: () => { tone(330, 0.16, 'sawtooth', 0.07); tone(247, 0.26, 'sawtooth', 0.07, 0.12); },
    bean: (i) => tone(880 + i * 220, 0.18, 'triangle', 0.13),
    pause: () => { tone(1200, 0.4, 'sine', 0.08); tone(600, 0.6, 'sine', 0.08, 0.05); },
    tick: () => tone(1760, 0.05, 'square', 0.04),
    fanfare: () => [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.28, 'triangle', 0.12, i * 0.08)),
    whoosh: () => {
      const a = ctx(), s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(), t = a.currentTime;
      s.buffer = noiseBuf; f.type = 'bandpass'; f.Q.value = 1.2;
      f.frequency.setValueAtTime(700, t); f.frequency.exponentialRampToValueAtTime(3200, t + 0.22);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.25, t + 0.04); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      s.connect(f).connect(g).connect(a.destination); s.start(t); s.stop(t + 0.32);
    },
    loop,
  };
})();

// ------------------------------------------------------------------ the critic's mood today
export const PREFS = [
  { line: '一杯經典的拿鐵就好。讓我看看你的基本功。', tags: ['經典'], shot: 0.62, temp: 62, size: 0.56 },
  { line: '我喜歡熱一點的拿鐵，入口要暖。', tags: ['奶泡熱一點'], shot: 0.62, temp: 68, size: 0.56 },
  { line: '濃縮請萃取得飽滿一些，我不怕苦。', tags: ['濃縮飽滿'], shot: 0.74, temp: 62, size: 0.56 },
  { line: '愛心要大大的！拉花是一杯咖啡的笑容。', tags: ['大愛心'], shot: 0.62, temp: 62, size: 0.7 },
  { line: '奶泡溫一點就好，太燙會蓋過牛奶的甜。', tags: ['奶泡溫一點', '小愛心'], shot: 0.56, temp: 56, size: 0.46 },
];

/** Modifiers a run's cards change; a single critic uses these as they are. */
export const MODS = () => ({ band: 1, speed: 1, shotBand: 1, steamBand: 1, steamDrift: 1, artBand: 1, waterBand: 1, sweet: false, tulip: false });

// ------------------------------------------------------------------ drawing helpers
function rr(g, x, y, w, hh, r) {
  r = Math.min(r, w / 2, hh / 2);
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + hh, r); g.arcTo(x + w, y + hh, x, y + hh, r);
  g.arcTo(x, y + hh, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function gauge(g, x, y0, y1, w, lo, hi, okLo, okHi, label) {
  // a vertical track from y1 (bottom, 0) to y0 (top, 1) with the ok band (light) and the perfect band (green)
  const Y = (v) => lerp(y1, y0, v);
  rr(g, x, y0, w, y1 - y0, w / 2); g.fillStyle = '#ecebe7'; g.fill();
  g.save(); rr(g, x, y0, w, y1 - y0, w / 2); g.clip();
  g.fillStyle = 'rgba(31,157,85,.22)'; g.fillRect(x, Y(okHi), w, Y(okLo) - Y(okHi));
  g.fillStyle = '#1f9d55'; g.fillRect(x, Y(hi), w, Y(lo) - Y(hi));
  g.restore();
  if (label) { g.fillStyle = '#85858b'; g.font = '700 11px Refillit Grotesk, sans-serif'; g.textAlign = 'center'; g.fillText(label, x + w / 2, y1 + 16); }
}
function marker(g, x, y, color = '#111', side = 'left') {
  g.fillStyle = color; g.beginPath();
  if (side === 'left') { g.moveTo(x, y); g.lineTo(x - 11, y - 7); g.lineTo(x - 11, y + 7); }
  else { g.moveTo(x, y); g.lineTo(x + 11, y - 7); g.lineTo(x + 11, y + 7); }
  g.closePath(); g.fill();
}
export const bandScore = (d, perfect, ok) => (d <= perfect ? 1 : clamp(1 - (d - perfect) / ok));

// ------------------------------------------------------------------ step 1: pull the shot
export function shotStep(pref, M = MODS()) {
  const S = {
    pref,
    id: 'shot', name: '萃取', title: '萃取濃縮咖啡',
    instr: '按住開始萃取', sub: '在金色油脂到達綠色區間時放開',
    level: 0, holding: false, started: false, done: false, score: 0, note: '', t: 0, drips: [],
    band: 0.045 * M.band * M.shotBand, ok: 0.16 * Math.sqrt(M.band * M.shotBand),
    down() { if (this.done) return; this.holding = true; this.started = true; this.hiss = sfx.loop(500, 0.6, 'lowpass'); this.hiss.set(0.18); },
    up() {
      if (!this.holding || this.done) return;
      this.holding = false; this.hiss && this.hiss.stop();
      this.finish();
    },
    finish() {
      this.done = true;
      const d = this.level - pref.shot;
      this.score = this.level >= 0.99 ? 0 : bandScore(Math.abs(d), this.band, this.ok);
      this.sweet = this.level < 0.99 && Math.abs(d) <= this.band * 0.35;
      this.note = this.level >= 0.99 ? '濃縮溢出來了' : this.score >= 0.9 ? '萃取完美，油脂金黃' : d < 0 ? '萃取不足，有點酸' : '萃取過度，有點苦';
    },
    update(dt) {
      this.t += dt;
      if (this.holding) {
        this.level += (0.2 + 0.42 * this.level) * dt;   // speeds up as the shot runs: a feel for the timing
        this.hiss && this.hiss.set(0.1 + 0.08 * Math.abs(Math.sin(this.t * 13)));   // a gurgle, not a hiss
        if (Math.random() < dt * 30) this.drips.push({ x: (Math.random() < 0.5 ? -1 : 1) * 9, y: 0, v: 0 });
        if (this.level >= 0.99) { this.level = 0.99; this.holding = false; this.hiss && this.hiss.stop(); this.finish(); }
      }
      for (const d of this.drips) { d.v += 900 * dt; d.y += d.v * dt; }
      this.drips = this.drips.filter((d) => d.y < 400);
    },
    draw(g, W, H) {
      const cx = W / 2 - 14;
      g.fillStyle = '#faf6f0'; g.fillRect(0, 0, W, H);
      // glass first (the machine sits a little above it, however tall the card is)
      const gw = 112, gh = clamp(H * 0.34, 150, 210), gb = Math.min(H - 38, H * 0.62 + gh / 2), gt = gb - gh;
      const top = gt + 8, fillH = (gb - 8 - top) * this.level;
      const m = Math.max(0, gt - 200);   // machine offset
      // machine
      g.fillStyle = '#2b2b2e'; rr(g, cx - 110, m - 30, 220, 92, 22); g.fill();
      g.fillStyle = '#3d3d42'; rr(g, cx - 40, m + 56, 80, 26, 10); g.fill();
      g.fillStyle = '#6b4226'; rr(g, cx - 150, m + 60, 116, 18, 9); g.fill();   // portafilter handle
      g.fillStyle = '#9a9aa2'; rr(g, cx - 18, m + 80, 36, 12, 4); g.fill();
      // drip tray under the glass
      g.fillStyle = '#d9d4cc'; rr(g, cx - 90, gb + 2, 180, 12, 6); g.fill();
      // streams
      if (this.holding) {
        g.strokeStyle = '#5b3313'; g.lineWidth = 3.2; g.lineCap = 'round';
        for (const s of [-9, 9]) {
          g.beginPath(); g.moveTo(cx + s, m + 92);
          g.quadraticCurveTo(cx + s + Math.sin(this.t * 20 + s) * 1.6, (m + 92 + gb - fillH) / 2, cx + s * 0.6, gb - 8 - fillH); g.stroke();
        }
      }
      // liquid
      g.save(); rr(g, cx - gw / 2 + 5, top, gw - 10, gb - 8 - top, 14); g.clip();
      if (fillH > 0) {
        const lv = gb - 8 - fillH;
        g.fillStyle = '#3b1f0f'; g.fillRect(cx - gw / 2, lv, gw, fillH + 4);
        const d = this.level - pref.shot;
        const crema = d < -0.1 ? '#e2c79d' : d < -0.035 ? '#d4a466' : d <= 0.035 ? '#c7843b' : d < 0.1 ? '#94531f' : '#5d3014';
        const ch = Math.max(6, fillH * 0.18);
        const grad = g.createLinearGradient(0, lv, 0, lv + ch);
        grad.addColorStop(0, crema); grad.addColorStop(1, '#3b1f0f');
        g.fillStyle = grad; g.fillRect(cx - gw / 2, lv, gw, ch);
        // a little shimmer while it runs
        if (this.holding) { g.fillStyle = 'rgba(255,240,210,.35)'; g.beginPath(); g.ellipse(cx + Math.sin(this.t * 7) * 18, lv + 3, 16, 2.5, 0, 0, 7); g.fill(); }
      }
      g.restore();
      // glass outline + shine
      g.strokeStyle = 'rgba(80,90,100,.35)'; g.lineWidth = 4; rr(g, cx - gw / 2, gt, gw, gh, 18); g.stroke();
      g.fillStyle = 'rgba(255,255,255,.55)'; rr(g, cx - gw / 2 + 12, gt + 14, 10, gh - 40, 5); g.fill();
      // band marks on the glass
      const Y = (v) => lerp(gb - 8, top, v);
      g.strokeStyle = 'rgba(31,157,85,.9)'; g.lineWidth = 2; g.setLineDash([6, 5]);
      for (const v of [pref.shot - this.band, pref.shot + this.band]) { g.beginPath(); g.moveTo(cx - gw / 2 + 4, Y(v)); g.lineTo(cx + gw / 2 - 4, Y(v)); g.stroke(); }
      g.setLineDash([]);
      if (M.sweet) { g.strokeStyle = '#f5a524'; g.lineWidth = 2; g.beginPath(); g.moveTo(cx - gw / 2 + 4, Y(pref.shot)); g.lineTo(cx + gw / 2 - 4, Y(pref.shot)); g.stroke(); }
      // gauge
      const gx = cx + gw / 2 + 34;
      gauge(g, gx, top, gb - 8, 16, pref.shot - this.band, pref.shot + this.band, pref.shot - this.ok * 0.5, pref.shot + this.ok * 0.5, '油脂');
      marker(g, gx - 3, Y(this.level));
      // seconds
      g.fillStyle = '#17171a'; g.textAlign = 'left'; g.font = '800 34px Refillit Grotesk, sans-serif';
      g.fillText(`${Math.round(this.level * 36)}s`, 18, H - 44);
      g.fillStyle = '#85858b'; g.font = '700 12px Refillit Grotesk, sans-serif'; g.fillText('萃取時間', 18, H - 24);
    },
  };
  return S;
}

// ------------------------------------------------------------------ step 2: steam the milk
export function steamStep(pref, M = MODS()) {
  const S = {
    pref,
    id: 'steam', name: '奶泡', title: '打奶泡',
    instr: '按住蒸氣，上下滑動手指', sub: `讓蒸氣管待在綠色區間，溫度到 ${pref.temp}°C 時放開`,
    temp: 6, depth: 0.5, zone: 0.5, zoneW: Math.min(0.3, 0.14 * M.band * M.steamBand), zt: 0,
    tempBand: 2.5 * M.band * M.steamBand, tempOk: 9 * Math.sqrt(M.band * M.steamBand), holding: false, done: false, score: 0, note: '', t: 0, inZone: 0, held: 0, foam: 0,
    bubbles: [], puffs: [], H: 1, phase: Math.random() * 6,
    toDepth(y) { return clamp((y - this.H * 0.18) / (this.H * 0.64)); },
    down(x, y) { if (this.done) return; this.holding = true; this.depth = this.toDepth(y); this.hiss = sfx.loop(2400, 0.7); this.hiss.set(0.12); },
    move(x, y) { if (this.holding) this.depth = this.toDepth(y); },
    up() { if (!this.holding || this.done) return; this.holding = false; this.hiss && this.hiss.stop(); this.finish(); },
    finish() {
      this.done = true;
      const tScore = this.temp >= 80 ? 0 : bandScore(Math.abs(this.temp - pref.temp), this.tempBand, this.tempOk);
      const tex = this.held > 0.4 ? clamp(this.inZone / this.held * 1.15) : 0;
      this.score = 0.55 * tScore + 0.45 * tex;
      this.sweet = this.temp < 80 && Math.abs(this.temp - pref.temp) <= this.tempBand * 0.4 && tex >= 0.85;
      const tn = this.temp >= 80 ? '牛奶燙焦了' : Math.abs(this.temp - pref.temp) <= this.tempBand ? '溫度剛好' : this.temp < pref.temp ? '溫度不夠' : '有點太燙';
      const xn = tex >= 0.8 ? '奶泡綿密' : tex >= 0.5 ? '奶泡還可以' : '奶泡太粗';
      this.note = `${tn}，${xn}`;
    },
    update(dt) {
      this.t += dt;
      if (this.holding) {
        this.held += dt;
        this.temp += 11.5 * dt;
        this.zt += dt * M.steamDrift;
        this.zone = clamp(0.5 + 0.3 * Math.sin(this.zt * 1.25 + this.phase) + 0.1 * Math.sin(this.zt * 2.9), 0.16, 0.84);
        const off = this.depth - this.zone;
        const ok = Math.abs(off) <= this.zoneW;
        if (ok && this.held > 0.25) this.inZone += dt;
        this.foam = clamp(this.foam + (ok ? 0.16 : 0.03) * dt);
        if (off < -this.zoneW && Math.random() < dt * 18) this.bubbles.push({ x: (Math.random() - 0.5) * 120, y: 0, r: 3 + Math.random() * 6, life: 1 });
        if (Math.random() < dt * 14) this.puffs.push({ x: 0, y: 0, vx: 30 + Math.random() * 40, vy: -60 - Math.random() * 50, life: 1 });
        this.hiss && this.hiss.set(ok ? 0.1 : 0.16, off < -this.zoneW ? 3800 : off > this.zoneW ? 900 : 2200);
        if (this.temp >= 80) { this.temp = 80; this.holding = false; this.hiss && this.hiss.stop(); this.finish(); }
      }
      for (const b of this.bubbles) { b.life -= dt * 1.4; b.y -= 10 * dt; }
      this.bubbles = this.bubbles.filter((b) => b.life > 0);
      for (const p of this.puffs) { p.life -= dt * 1.2; p.x += p.vx * dt; p.y += p.vy * dt; }
      this.puffs = this.puffs.filter((p) => p.life > 0);
    },
    draw(g, W, H) {
      this.H = H;
      g.fillStyle = '#f4f7fa'; g.fillRect(0, 0, W, H);
      const cx = W / 2 + 4, pt = H * 0.3, pb = H - 30, tw = 130, bw = 156;
      // milk level rises with the foam
      const surf = lerp(pb - (pb - pt) * 0.5, pt + 18, this.foam * 0.85);
      // pitcher body
      g.save();
      g.beginPath(); g.moveTo(cx - tw / 2, pt); g.lineTo(cx + tw / 2, pt); g.lineTo(cx + tw / 2 + 22, pt - 16); g.lineTo(cx + tw / 2 + 6, pt + 14);
      g.lineTo(cx + bw / 2, pb); g.lineTo(cx - bw / 2, pb); g.closePath();
      const metal = g.createLinearGradient(cx - bw / 2, 0, cx + bw / 2, 0);
      metal.addColorStop(0, '#b9bec6'); metal.addColorStop(0.35, '#eef1f4'); metal.addColorStop(0.6, '#c9ced5'); metal.addColorStop(1, '#9aa0a9');
      g.fillStyle = metal; g.fill();
      g.restore();
      // handle
      g.strokeStyle = '#a5abb4'; g.lineWidth = 12; g.lineCap = 'round';
      g.beginPath(); g.moveTo(cx - tw / 2 - 2, pt + 24); g.bezierCurveTo(cx - tw / 2 - 52, pt + 30, cx - bw / 2 - 48, pb - 50, cx - bw / 2 + 4, pb - 40); g.stroke();
      // milk seen through the open top (an ellipse) and the side cut-away
      g.save();
      g.beginPath(); g.moveTo(cx - tw / 2 + 8, pt + 4); g.lineTo(cx + tw / 2 - 8, pt + 4); g.lineTo(cx + bw / 2 - 10, pb - 8); g.lineTo(cx - bw / 2 + 10, pb - 8); g.closePath(); g.clip();
      g.fillStyle = 'rgba(255,255,255,.0)';
      const mg = g.createLinearGradient(0, surf, 0, pb);
      mg.addColorStop(0, `rgba(255,253,248,${0.55 + this.foam * 0.4})`); mg.addColorStop(1, 'rgba(240,236,228,.55)');
      g.fillStyle = mg; g.fillRect(0, surf, W, pb - surf);
      g.restore();
      // surface swirl
      g.fillStyle = '#fffdf8'; g.beginPath(); g.ellipse(cx, surf, lerp(tw, bw, (surf - pt) / (pb - pt)) / 2 - 10, 9, 0, 0, 7); g.fill();
      if (this.holding) {
        g.strokeStyle = 'rgba(200,190,175,.7)'; g.lineWidth = 1.5;
        for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(cx, surf, 18 + i * 14, 4 + i * 1.5, 0, this.t * 6 + i, this.t * 6 + i + 2.4); g.stroke(); }
      }
      for (const b of this.bubbles) { g.strokeStyle = `rgba(160,170,180,${b.life})`; g.lineWidth = 1.5; g.beginPath(); g.arc(cx + b.x, surf - 4 + b.y, b.r, 0, 7); g.stroke(); }
      // steam wand: from top-left into the milk, the tip at the chosen depth
      const tipY = lerp(surf - 26, pb - 22, this.depth);
      const tipX = cx + 14;
      g.strokeStyle = '#7c828b'; g.lineWidth = 9; g.lineCap = 'round';
      g.beginPath(); g.moveTo(cx - 120, -10); g.lineTo(cx - 30, 40); g.lineTo(tipX, tipY); g.stroke();
      g.strokeStyle = '#c3c8cf'; g.lineWidth = 3; g.beginPath(); g.moveTo(cx - 30, 40); g.lineTo(tipX, tipY); g.stroke();
      // puffs above the jug
      for (const p of this.puffs) { g.fillStyle = `rgba(255,255,255,${p.life * 0.8})`; g.beginPath(); g.arc(cx + 50 + p.x, pt - 10 + p.y, 10 + (1 - p.life) * 16, 0, 7); g.fill(); }
      // depth gauge (left): the zone drifts, the marker follows the finger
      const gx = 22, gt = H * 0.18, gb = H * 0.82;
      const Yd = (v) => lerp(gt, gb, v);
      rr(g, gx, gt, 16, gb - gt, 8); g.fillStyle = '#e4e8ee'; g.fill();
      const inZ = Math.abs(this.depth - this.zone) <= this.zoneW;
      g.fillStyle = this.holding ? (inZ ? '#1f9d55' : 'rgba(31,157,85,.45)') : 'rgba(31,157,85,.3)';
      rr(g, gx, Yd(this.zone - this.zoneW), 16, Yd(this.zone + this.zoneW) - Yd(this.zone - this.zoneW), 8); g.fill();
      marker(g, gx + 16 + 13, Yd(this.depth), '#111', 'right');
      g.fillStyle = '#85858b'; g.font = '700 11px Refillit Grotesk, sans-serif'; g.textAlign = 'center';
      g.fillText('淺', gx + 8, gt - 8); g.fillText('深', gx + 8, gb + 16);
      // thermometer (right)
      const tx = W - 40, tt = H * 0.16, tb = H * 0.8;
      const T = (c) => clamp((c - 0) / 85);
      gauge(g, tx, tt, tb, 16, T(pref.temp - this.tempBand), T(pref.temp + this.tempBand), T(pref.temp - this.tempOk), T(pref.temp + this.tempOk), '');
      if (M.sweet) { g.fillStyle = '#f5a524'; g.fillRect(tx - 4, lerp(tb, tt, T(pref.temp)) - 1.5, 24, 3); }
      g.fillStyle = this.temp > pref.temp + 9 ? '#e5484d' : '#e5484d';
      g.beginPath(); g.arc(tx + 8, tb + 14, 13, 0, 7); g.fill();
      g.fillStyle = 'rgba(229,72,77,.85)'; rr(g, tx + 4, lerp(tb, tt, T(this.temp)), 8, tb - lerp(tb, tt, T(this.temp)) + 6, 4); g.fill();
      marker(g, tx - 3, lerp(tb, tt, T(this.temp)));
      g.fillStyle = '#17171a'; g.textAlign = 'right'; g.font = '800 30px Refillit Grotesk, sans-serif';
      g.fillText(`${Math.round(this.temp)}°`, W - 64, 46);
      g.fillStyle = '#85858b'; g.font = '700 12px Refillit Grotesk, sans-serif'; g.fillText(`目標 ${pref.temp}°C`, W - 64, 64);
      // a hint while the wand is off the zone
      if (this.holding && !inZ) {
        g.fillStyle = 'rgba(17,17,26,.75)'; g.textAlign = 'left'; g.font = '800 13px Refillit Grotesk, sans-serif';
        g.fillText(this.depth < this.zone ? '太淺：大泡泡！往下' : '太深：沒有奶泡，往上', 50, H * 0.12);
      }
    },
  };
  return S;
}

// ------------------------------------------------------------------ step 3: latte art (a heart)
function heartPoint(t) {
  // t from 0 (the cleft at the top) round to π (the tip at the bottom); normalized to roughly the unit circle
  const x = Math.pow(Math.sin(t), 3);
  const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 16;
  return [x * 1.05, (y + 0.08) * 1.02];
}
export function artStep(pref, M = MODS()) {
  const S = {
    pref,
    id: 'art', name: '拉花', title: M.tulip ? '拉一朵鬱金香' : '拉一顆愛心',
    tol: 0.06 * M.band * M.artBand, tolOk: 0.4 * Math.sqrt(M.band * M.artBand),
    instr: '按住倒入奶泡', sub: '白色圓圈長到虛線圈時放開',
    phase: 'pour', r: 0, holding: false, done: false, score: 0, note: '', t: 0, morph: 0,
    path: [], tilt: 0, shift: 0, flip: false, a: 0, b: 0, geo: null,
    down(x, y) {
      if (this.done) return;
      if (this.phase === 'pour') { this.holding = true; this.pour = sfx.loop(700, 0.8); this.pour.set(0.12); }
      else if (this.phase === 'swipe') { this.path = [[x, y]]; this.swiping = true; }
    },
    move(x, y) { if (this.swiping) this.path.push([x, y]); },
    up(x, y) {
      if (this.phase === 'pour' && this.holding) {
        this.holding = false; this.pour && this.pour.stop();
        this.a = this.r >= 0.97 ? 0 : bandScore(Math.abs(this.r - pref.size) / pref.size, this.tol, this.tolOk);
        if (this.r >= 0.97) { this.done = true; this.score = 0; this.note = '奶泡滿出來了'; return; }
        this.phase = 'swipe'; this.instr = '從上往下劃過圓圈'; this.sub = '直直地穿過正中間，拉出愛心的尖端';
        this.onInstr && this.onInstr();
      } else if (this.phase === 'swipe' && this.swiping) {
        this.swiping = false;
        const { cx, cy, R } = this.geo, rp = this.r * R;
        const p0 = this.path[0], p1 = this.path[this.path.length - 1];
        const dy = p1[1] - p0[1], dx = p1[0] - p0[0];
        if (Math.hypot(dx, dy) < rp * 0.9) { this.path = []; return; }   // a tap, not a swipe: try again
        sfx.whoosh();
        this.flip = dy < 0;
        const ang = Math.atan2(dx, Math.abs(dy));
        // how far from the middle the swipe ran, measured where it crosses the circle
        const inside = this.path.filter(([, y]) => Math.abs(y - cy) < rp);
        const xs = (inside.length ? inside : this.path).map(([x]) => x - cx);
        const avg = xs.reduce((s, v) => s + v, 0) / xs.length;
        const dev = xs.reduce((s, v) => s + Math.abs(v), 0) / xs.length;
        const through = Math.min(p0[1], p1[1]) < cy - rp * 0.5 && Math.max(p0[1], p1[1]) > cy + rp * 0.5;
        this.b = (0.5 * clamp(1 - Math.abs(ang) / 0.55) + 0.5 * clamp(1 - dev / (rp * 0.55))) * (through ? 1 : 0.55) * (this.flip ? 0.6 : 1);
        this.tilt = clamp(ang, -0.6, 0.6) * (this.flip ? -1 : 1);
        this.shift = clamp(avg / rp, -0.5, 0.5);
        this.phase = 'morph';
      }
    },
    finish() {
      this.done = true;
      this.score = 0.5 * this.a + 0.5 * this.b;
      this.sweet = Math.abs(this.r - pref.size) / pref.size <= this.tol * 0.4 && this.b >= 0.9;
      const shape = M.tulip ? '鬱金香' : '愛心';
      const sizeN = Math.abs(this.r - pref.size) / pref.size <= this.tol ? '大小剛好' : this.r < pref.size ? `${shape}小了點` : `${shape}太大了`;
      const lineN = this.flip ? `${shape}倒過來了` : this.b >= 0.85 ? '線條漂亮' : this.b >= 0.55 ? '有一點歪' : '歪得很明顯';
      this.note = `${sizeN}，${lineN}`;
    },
    update(dt) {
      this.t += dt;
      if (this.phase === 'pour' && this.holding) {
        this.r += (0.16 + 0.42 * this.r) * dt;
        if (this.r >= 0.97) { this.r = 0.97; this.up(); }
      }
      if (this.phase === 'morph') { this.morph = clamp(this.morph + dt / 0.55); if (this.morph >= 1 && !this.done) this.finish(); }
    },
    draw(g, W, H) {
      g.fillStyle = '#f3efe9'; g.fillRect(0, 0, W, H);
      const cx = W / 2, cy = H / 2 + 6, R = Math.min(W, H) * 0.3;
      this.geo = { cx, cy, R };
      // saucer, cup, handle
      g.fillStyle = 'rgba(0,0,0,.07)'; g.beginPath(); g.arc(cx + 6, cy + 10, R * 1.55, 0, 7); g.fill();
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(cx, cy, R * 1.55, 0, 7); g.fill();
      g.strokeStyle = '#ece7e0'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, R * 1.32, 0, 7); g.stroke();
      g.fillStyle = '#ffffff'; rr(g, cx + R * 1.05, cy - 16, R * 0.5, 32, 16); g.fill();
      g.strokeStyle = '#e6e0d8'; g.lineWidth = 2; rr(g, cx + R * 1.05, cy - 16, R * 0.5, 32, 16); g.stroke();
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(cx, cy, R * 1.16, 0, 7); g.fill();
      g.strokeStyle = '#e8e2da'; g.lineWidth = 3; g.stroke();
      // crema
      const cg = g.createRadialGradient(cx - R * 0.2, cy - R * 0.2, R * 0.1, cx, cy, R);
      cg.addColorStop(0, '#d29758'); cg.addColorStop(0.7, '#b06e33'); cg.addColorStop(1, '#7c4320');
      g.fillStyle = cg; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.fill();
      // guide ring
      if (this.phase === 'pour') {
        g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 2; g.setLineDash([7, 6]);
        g.beginPath(); g.arc(cx, cy, pref.size * R, 0, 7); g.stroke(); g.setLineDash([]);
        if (M.sweet) { g.strokeStyle = 'rgba(245,165,36,.9)'; g.lineWidth = 1.5; g.beginPath(); g.arc(cx, cy, pref.size * R, 0, 7); g.stroke(); }
      }
      // the milk: a circle, morphing into a heart after the swipe
      const k = this.phase === 'morph' || this.done ? easeOut(this.morph) : 0;
      if (this.r > 0) {
        const rp = this.r * R;
        g.save(); g.translate(cx + this.shift * rp * k * 0.6, cy); g.rotate(this.tilt * k); if (this.flip) g.scale(1, lerp(1, -1, k));
        g.beginPath();
        for (let i = 0; i <= 96; i++) {
          const t = (i / 96) * Math.PI * 2;
          const [hx, hy] = heartPoint(t);
          const x = lerp(Math.sin(t), hx, k) * rp, y = lerp(-Math.cos(t), hy, k) * rp;
          i ? g.lineTo(x, y) : g.moveTo(x, y);
        }
        g.closePath();
        g.fillStyle = '#fffaf2'; g.fill();
        g.strokeStyle = 'rgba(205,160,110,.55)'; g.lineWidth = 3; g.stroke();
        // a tulip: two more leaves stacked on top of the heart
        if (M.tulip && k > 0) {
          for (const [oy, s] of [[-1.22, 0.62], [-1.78, 0.42]]) {
            g.fillStyle = '#fffaf2'; g.beginPath(); g.ellipse(0, oy * rp * k, s * rp * k, s * rp * 0.55 * k, 0, 0, 7); g.fill();
            g.strokeStyle = 'rgba(176,110,51,.6)'; g.lineWidth = 2.5; g.beginPath(); g.ellipse(0, (oy + 0.12) * rp * k, s * rp * 0.8 * k, s * rp * 0.35 * k, 0, 0.15, Math.PI - 0.15); g.stroke();
          }
        }
        // the pull-through line
        if (k > 0) { g.strokeStyle = `rgba(176,110,51,${0.5 * k})`; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -rp * 0.3); g.lineTo(0, rp * 1.0); g.stroke(); }
        g.restore();
      }
      // pouring stream
      if (this.holding) {
        g.strokeStyle = '#fffaf2'; g.lineWidth = 7; g.lineCap = 'round';
        g.beginPath(); g.moveTo(cx + Math.sin(this.t * 9) * 2, -10); g.lineTo(cx, cy - 2); g.stroke();
      }
      // the swipe: a hint arrow, then the finger's trail
      if (this.phase === 'swipe') {
        const rp = this.r * R;
        if (!this.swiping) {
          const a = (this.t * 1.2) % 1;
          g.strokeStyle = 'rgba(17,17,26,.35)'; g.lineWidth = 3; g.setLineDash([8, 8]);
          g.beginPath(); g.moveTo(cx, cy - rp - 34); g.lineTo(cx, cy + rp + 34); g.stroke(); g.setLineDash([]);
          g.fillStyle = 'rgba(17,17,26,.55)'; g.beginPath(); g.arc(cx, lerp(cy - rp - 34, cy + rp + 34, a), 9, 0, 7); g.fill();
        }
        if (this.path.length > 1) {
          g.strokeStyle = 'rgba(255,250,242,.95)'; g.lineWidth = 6; g.lineCap = 'round'; g.lineJoin = 'round';
          g.beginPath(); this.path.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
        }
      }
    },
  };
  return S;
}
export const easeOut = (k) => 1 - (1 - k) * (1 - k);

// ------------------------------------------------------------------ step: top up with hot water (americano)
// Hold to pour from the gooseneck kettle; the finger's height sets the flow (high = fast). Fast fills quickly
// but a gush breaks up the crema, so the skill is to pour fast early and ease off near the line.
export function waterStep(pref, M = MODS()) {
  const S = {
    pref,
    id: 'water', name: '加水', title: '加熱水',
    instr: '按住倒熱水，手指越高水越快', sub: '水面到綠線時放開；太快會沖散油脂',
    level: 0.24, flow: 0.4, crema: 1, holding: false, done: false, score: 0, note: '', t: 0, H: 1,
    band: 0.03 * M.band * M.waterBand, ok: 0.15 * Math.sqrt(M.band * M.waterBand),
    toFlow(y) { return clamp(1 - (y - this.H * 0.16) / (this.H * 0.66)); },
    down(x, y) { if (this.done) return; this.holding = true; this.flow = this.toFlow(y); this.pour = sfx.loop(900, 0.7); this.pour.set(0.12); },
    move(x, y) { if (this.holding) this.flow = this.toFlow(y); },
    up() { if (!this.holding || this.done) return; this.holding = false; this.pour && this.pour.stop(); this.finish(); },
    finish() {
      this.done = true;
      const d = this.level - pref.water;
      const lv = this.level >= 0.99 ? 0 : bandScore(Math.abs(d), this.band, this.ok);
      this.score = this.level >= 0.99 ? 0 : 0.65 * lv + 0.35 * this.crema;
      this.sweet = this.level < 0.99 && Math.abs(d) <= this.band * 0.35 && this.crema >= 0.8;
      const ln = this.level >= 0.99 ? '水滿出來了' : Math.abs(d) <= this.band ? '濃淡剛好' : d < 0 ? '水太少，太濃了' : '水太多，太淡了';
      const cn = this.crema >= 0.8 ? '油脂完整' : this.crema >= 0.45 ? '油脂散了一些' : '油脂被沖散了';
      this.note = this.level >= 0.99 ? ln : `${ln}，${cn}`;
    },
    update(dt) {
      this.t += dt;
      if (this.holding) {
        this.level += (0.07 + 0.43 * this.flow) * dt;
        if (this.flow > 0.55) this.crema = clamp(this.crema - (this.flow - 0.55) * 1.2 * dt);
        this.pour && this.pour.set(0.06 + 0.14 * this.flow, 600 + 900 * this.flow);
        if (this.level >= 0.99) { this.level = 0.99; this.holding = false; this.pour && this.pour.stop(); this.finish(); }
      }
    },
    draw(g, W, H) {
      this.H = H;
      g.fillStyle = '#f6f2ec'; g.fillRect(0, 0, W, H);
      const cx = W / 2 + 10, gw = 128, gh = clamp(H * 0.44, 180, 260), gb = Math.min(H - 34, H * 0.6 + gh / 2), gt = gb - gh;
      const inner = gb - 10 - (gt + 10);
      const Y = (v) => gb - 10 - inner * v;
      // kettle (top left) and the stream
      const kx = cx - 70, ky = Math.max(30, gt - 110);   // kettle body centre, clear of the flow gauge on the left
      g.fillStyle = '#2f3136'; rr(g, kx - 42, ky - 26, 84, 60, 22); g.fill();
      g.fillStyle = '#4a4d55'; rr(g, kx - 24, ky - 38, 48, 16, 8); g.fill();
      g.strokeStyle = '#2f3136'; g.lineWidth = 7; g.lineCap = 'round';
      g.beginPath(); g.moveTo(kx + 30, ky + 22); g.bezierCurveTo(kx + 52, ky + 30, kx + 50, ky - 8, cx - 18, ky + 6); g.stroke();
      if (this.holding) {
        g.strokeStyle = 'rgba(190,215,235,.9)'; g.lineWidth = 2 + this.flow * 9;
        g.beginPath(); g.moveTo(cx - 16, ky + 8);
        g.quadraticCurveTo(cx - 6 + Math.sin(this.t * 25) * this.flow * 2, (ky + Y(this.level)) / 2, cx - 4, Y(this.level)); g.stroke();
      }
      // liquid: espresso at the bottom blending into the water, the crema on top
      g.save(); rr(g, cx - gw / 2 + 6, gt + 10, gw - 12, inner, 16); g.clip();
      const top = Y(this.level);
      const lg = g.createLinearGradient(0, top, 0, gb);
      lg.addColorStop(0, '#6b3a1a'); lg.addColorStop(1, '#3b1f0f');
      g.fillStyle = lg; g.fillRect(cx - gw / 2, top, gw, gb - top);
      const ch = 4 + 10 * this.crema;
      g.fillStyle = `rgba(199,132,59,${0.35 + 0.65 * this.crema})`; g.fillRect(cx - gw / 2, top, gw, ch);
      if (this.holding && this.flow > 0.55) {   // the gush churning the top
        g.fillStyle = 'rgba(255,240,220,.5)';
        for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(cx - 4 + Math.sin(this.t * 17 + i) * 14, top + 4, 3 + this.flow * 4, 0, 7); g.fill(); }
      }
      g.restore();
      // glass
      g.strokeStyle = 'rgba(80,90,100,.35)'; g.lineWidth = 4; rr(g, cx - gw / 2, gt, gw, gh, 20); g.stroke();
      g.fillStyle = 'rgba(255,255,255,.5)'; rr(g, cx - gw / 2 + 14, gt + 18, 10, gh - 50, 5); g.fill();
      g.strokeStyle = 'rgba(80,90,100,.3)'; g.lineWidth = 9; g.beginPath(); g.arc(cx + gw / 2 + 4, gt + gh * 0.45, 24, -1.2, 1.2); g.stroke();
      // the target line
      g.strokeStyle = 'rgba(31,157,85,.9)'; g.lineWidth = 2; g.setLineDash([6, 5]);
      for (const v of [pref.water - this.band, pref.water + this.band]) { g.beginPath(); g.moveTo(cx - gw / 2 + 6, Y(v)); g.lineTo(cx + gw / 2 - 6, Y(v)); g.stroke(); }
      g.setLineDash([]);
      if (M.sweet) { g.strokeStyle = '#f5a524'; g.lineWidth = 2; g.beginPath(); g.moveTo(cx - gw / 2 + 6, Y(pref.water)); g.lineTo(cx + gw / 2 - 6, Y(pref.water)); g.stroke(); }
      // the flow gauge (left): high = fast, the red part breaks the crema
      const fx0 = 22, ft = H * 0.16, fb = H * 0.82;
      const F = (v) => lerp(fb, ft, v);
      rr(g, fx0, ft, 16, fb - ft, 8); g.fillStyle = '#e8e4de'; g.fill();
      g.save(); rr(g, fx0, ft, 16, fb - ft, 8); g.clip(); g.fillStyle = 'rgba(229,72,77,.35)'; g.fillRect(fx0, ft, 16, F(0.55) - ft); g.restore();
      marker(g, fx0 + 16 + 13, F(this.flow), this.holding && this.flow > 0.55 ? '#e5484d' : '#111', 'right');
      g.fillStyle = '#85858b'; g.font = '700 11px Refillit Grotesk, sans-serif'; g.textAlign = 'center';
      g.fillText('快', fx0 + 8, ft - 8); g.fillText('慢', fx0 + 8, fb + 16);
      // crema meter (top right)
      g.fillStyle = '#17171a'; g.textAlign = 'right'; g.font = '800 26px Refillit Grotesk, sans-serif';
      g.fillText(`${Math.round(this.crema * 100)}%`, W - 18, 42);
      g.fillStyle = '#85858b'; g.font = '700 12px Refillit Grotesk, sans-serif'; g.fillText('油脂完整度', W - 18, 60);
    },
  };
  return S;
}

export function setScreen(...els) { phone.replaceChildren(...els); }

export function beanSvg(filled) {
  const c = filled ? '#7a4a22' : '#d9d6cf', s = filled ? '#f5d9a8' : '#efede8';
  return `<svg viewBox="0 0 48 48"><ellipse cx="24" cy="24" rx="15" ry="20" fill="${c}"/><path d="M24 6c-6 8 6 14 0 36" stroke="${s}" stroke-width="3.2" fill="none" stroke-linecap="round"/></svg>`;
}


// ------------------------------------------------------------------ juice: particles over the whole phone
export const fx = (() => {
  let cv = null, g = null, parts = [], running = false;
  const ensure = () => {
    if (cv && cv.isConnected) return;
    cv = h('canvas.fx'); phone.append(cv); g = cv.getContext('2d');
    const r = phone.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = r.width * dpr; cv.height = r.height * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  const loop = () => {
    if (!cv) return;
    const r = phone.getBoundingClientRect();
    g.clearRect(0, 0, r.width, r.height);
    for (const p of parts) {
      p.life -= 1 / 60 / p.dur; p.vy += p.grav / 60; p.x += p.vx / 60; p.y += p.vy / 60; p.rot += p.spin / 60;
      g.save(); g.globalAlpha = Math.max(0, Math.min(1, p.life * 2)); g.translate(p.x, p.y); g.rotate(p.rot);
      if (p.kind === 'bean') {
        g.fillStyle = '#7a4a22'; g.beginPath(); g.ellipse(0, 0, p.size * 0.7, p.size, 0, 0, 7); g.fill();
        g.strokeStyle = '#f5d9a8'; g.lineWidth = p.size * 0.18; g.beginPath(); g.moveTo(0, -p.size * 0.8); g.quadraticCurveTo(-p.size * 0.4, 0, 0, p.size * 0.8); g.stroke();
      } else if (p.kind === 'spark') {
        g.fillStyle = p.color; g.beginPath();
        for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2, rad = i % 2 ? p.size * 0.35 : p.size; g.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); }
        g.closePath(); g.fill();
      } else if (p.kind === 'confetti') {
        g.fillStyle = p.color; g.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      } else {
        g.fillStyle = p.color; g.beginPath(); g.arc(0, 0, p.size * (1.6 - p.life * 0.6), 0, 7); g.fill();
      }
      g.restore();
    }
    parts = parts.filter((p) => p.life > 0);
    if (parts.length) nextFrame(loop); else { running = false; g.clearRect(0, 0, r.width, r.height); }
  };
  const add = (p) => { parts.push(p); if (!running) { running = true; nextFrame(loop); } };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const SPARK = ['#ffc531', '#ffde7a', '#f5a524', '#ffffff'];
  const CONFETTI = ['#ffc531', '#ffde7a', '#e5484d', '#4f8cff', '#1f9d55', '#ffffff', '#f5a524'];
  return {
    /** A burst at (x, y) in phone coordinates. kind: 'perfect' | 'good' | 'miss' | 'confetti'. */
    burst(x, y, kind) {
      ensure();
      const n = { perfect: 26, good: 12, miss: 8, confetti: 90 }[kind] || 10;
      for (let i = 0; i < n; i++) {
        const a = rnd(0, Math.PI * 2), v = kind === 'confetti' ? rnd(200, 520) : rnd(90, 300);
        const k = kind === 'miss' ? 'puff' : kind === 'confetti' ? 'confetti' : i % 3 === 0 ? 'bean' : 'spark';
        const pal = kind === 'confetti' ? CONFETTI : SPARK;
        add({
          x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (kind === 'confetti' ? 300 : 120), grav: kind === 'miss' ? -40 : 700,
          rot: rnd(0, 6), spin: rnd(-8, 8), life: 1, dur: kind === 'confetti' ? rnd(1.4, 2.2) : rnd(0.6, 1.0), kind: k,
          size: k === 'bean' ? rnd(5, 8) : k === 'confetti' ? rnd(8, 12) : k === 'puff' ? rnd(6, 12) : rnd(5, 10),
          color: k === 'puff' ? 'rgba(120,120,128,.45)' : pal[Math.floor(rnd(0, pal.length))],
        });
      }
    },
  };
})();

// ------------------------------------------------------------------ live reactions
export const LINES = {
  happy: ['Oh là là！', 'Très bien～', '嗯哼！', '就是這樣！'],
  neutral: ['嗯⋯', 'Hmm…', '讓我看看⋯'],
  grumpy: ['Non non non⋯', '唉呀⋯', 'Mon dieu⋯'],
};
/** What a step looks like from the outside right now: the critic's face, what the partner does, the band cue. */
export function cueOf(S) {
  const pref = S.pref;
  if (S.id === 'shot') {
    const band = S.holding && Math.abs(S.level - pref.shot) <= S.band;
    const over = S.level > pref.shot + S.ok * 0.5;
    return { band, mood: !S.started ? 'neutral' : over ? 'grumpy' : band ? 'happy' : 'neutral', act: S.holding ? 'work' : 'idle', steam: false };
  }
  if (S.id === 'steam') {
    const band = S.holding && Math.abs(S.temp - pref.temp) <= S.tempBand;
    const inZone = Math.abs(S.depth - S.zone) <= S.zoneW;
    return { band, mood: S.temp > pref.temp + S.tempOk ? 'grumpy' : S.holding && inZone && S.held > 0.4 ? 'happy' : 'neutral', act: S.holding ? 'steam' : 'idle', steam: S.holding };
  }
  if (S.id === 'water') {
    const band = S.holding && Math.abs(S.level - pref.water) <= S.band;
    return { band, mood: S.level > pref.water + S.ok * 0.5 || S.crema < 0.45 ? 'grumpy' : band ? 'happy' : 'neutral', act: S.holding ? 'work' : 'idle', steam: false };
  }
  const band = S.phase === 'pour' && S.holding && Math.abs(S.r - pref.size) / pref.size <= S.tol;
  return { band, mood: S.r > pref.size * 1.35 ? 'grumpy' : band ? 'happy' : 'neutral', act: S.holding ? 'work' : 'idle', steam: false };
}

export const use3d = {
  get() { try { return localStorage.getItem('petitGuide.3d') !== '0'; } catch { return true; } },
  set(v) { try { localStorage.setItem('petitGuide.3d', v ? '1' : '0'); } catch {} },
};


// ------------------------------------------------------------------ making one drink
/**
 * The steps of one drink, one after another on the same card, with the 3D bar (or a little critic) reacting.
 * opts: steps (step objects), M (modifiers: speed etc.), slowCharges (Mocha's Time Pause uses), hud (an element
 * shown under the step bar), onStep(S, kind, streak) → { stop, tip } after each step (the run's hearts and tips).
 * Resolves { results, triple, aborted }.
 */
export async function cook({ steps, M = MODS(), slowCharges = 1, hud = null, onStep = null } = {}) {
  // the 3D bar, if it is on and loads; otherwise the critic's face sits beside the title
  let bar = null, Bar = null;
  if (use3d.get()) {
    setScreen(h('div.sheet.full.in', h('div.center', { style: 'margin:auto' }, h('h2', '準備吧台⋯'), h('div.dots', h('span'), h('span'), h('span')))));
    try { const m = await import('./stage3d.js'); await m.loadBar(); Bar = m.BarStage; } catch (e) { console.warn('3D bar unavailable', e); }
  }
  const stepBar = h('div.steps', steps.map(() => h('span')));
  const title = h('h2');
  const kicker = h('div.kicker');
  const canvas = h('canvas');
  const judge = h('div.judge');
  const tipPop = h('div.tippop');
  const say = h('div.say');
  const face = Bar ? null : h('img.face', { src: ART('critic_neutral'), alt: '' });
  const wrap = h('div.stagewrap', {}, canvas, judge, tipPop);
  const canvas3d = Bar ? h('canvas') : null;
  const strip = Bar ? h('div.bar3d', {}, canvas3d, say) : null;
  const instr = h('div.instr');
  let charges = slowCharges, slowUntil = 0;
  const go = h('span.go');
  const helper = h('button.helper', {},
    h('img', { src: ART('mocha'), alt: '' }),
    h('div', h('b', 'Mocha Latte'), h('span', '時間暫停：3 秒內一切變慢')),
    go);
  const showCharges = () => {
    go.textContent = charges > 0 ? (charges > 1 ? `使用（${charges}）` : '使用') : '已用完';
    helper.classList.toggle('used', charges <= 0);
  };
  showCharges();
  helper.addEventListener('click', () => {
    if (charges <= 0 || performance.now() < slowUntil) return;
    charges--; showCharges();
    slowUntil = performance.now() + 3000; wrap.classList.add('slow'); sfx.pause(); vibrate(20);
    if (bar) bar.setAct('cheer');
  });
  const sheet = h('div.sheet.full.in.cooking', h('div.row.head', h('div.grow', kicker, title), face, Bar ? null : say), stepBar, hud, strip, wrap, instr, slowCharges > 0 ? helper : null);
  setScreen(sheet);
  if (Bar) bar = new Bar(canvas3d, { neutral: ART('critic_neutral'), happy: ART('critic_happy'), grumpy: ART('critic_grumpy') });

  const g = canvas.getContext('2d');
  let W = 0, H = 0;
  const resize = () => {
    const r = wrap.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    W = r.width; H = r.height; canvas.width = W * dpr; canvas.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  window.addEventListener('resize', resize);

  // the critic's mood follows the step once it has held for a moment (no flicker), with a line now and then
  let mood = 'neutral', cand = 'neutral', candT = 0, lastLine = 0;
  const setMood = (m, now) => {
    if (m === mood) return;
    mood = m;
    if (bar) bar.setMood(m); else face.src = ART(`critic_${m}`);
    if (now - lastLine > 1600 || m === 'grumpy') {
      lastLine = now;
      const ls = LINES[m];
      say.textContent = ls[Math.floor(Math.random() * ls.length)];
      say.classList.remove('in'); void say.offsetWidth; say.classList.add('in');
      clearTimeout(say.t); say.t = setTimeout(() => say.classList.remove('in'), 1400);
    }
  };
  const center = () => {
    const pr = phone.getBoundingClientRect(), r = wrap.getBoundingClientRect();
    return [r.left - pr.left + r.width / 2, r.top - pr.top + r.height * 0.42];
  };

  // one loop for the whole drink: the current step, the band cue, the critic and the 3D bar
  let S = null, onDone = null, wasBand = false, last = performance.now(), alive = true;
  const frame = (now) => {
    if (!alive) return;
    const real = Math.min(0.05, (now - last) / 1000); last = now;
    let dt = real * M.speed;
    if (now < slowUntil) dt *= 0.33; else wrap.classList.remove('slow');
    try {
      if (S && !S.reported) {
        // a step can finish in its own update (an overflow) or in a pointer handler (the release), so the loop
        // looks for `done` whichever way it came
        if (!S.done) {
          S.update(dt);
          S.draw(g, W, H);
          const c = cueOf(S);
          if (c.band && !wasBand) { sfx.tick(); vibrate(8); }
          wasBand = c.band; wrap.classList.toggle('inband', c.band);
          if (c.mood !== cand) { cand = c.mood; candT = 0; } else candT += real;
          if (candT > 0.18) setMood(cand, now);
          if (bar) { if (bar.act !== 'cheer' && bar.act !== 'oops') bar.setAct(c.act); bar.setSteam(c.steam); }
        }
        if (S.done) {
          S.reported = true;
          wrap.classList.remove('inband'); wasBand = false; S.draw(g, W, H);
          if (bar) bar.setSteam(false);
          onDone && onDone();
        }
      }
      if (bar) bar.update(real);
    } catch (e) { console.error(e); }   // keep the loop alive whatever happens in one frame
    nextFrame(frame);
  };
  nextFrame(frame);

  const results = [];
  let streak = 0, aborted = false;
  for (let i = 0; i < steps.length; i++) {
    S = steps[i];
    [...stepBar.children].forEach((b, j) => { b.className = j < i ? 'done' : j === i ? 'on' : ''; });
    kicker.textContent = `第 ${i + 1} 步 / 共 ${steps.length} 步`;
    title.textContent = S.title;
    const showInstr = () => { instr.innerHTML = `${S.instr}<small>${S.sub}</small>`; };
    S.onInstr = showInstr; showInstr();
    // input
    const pt = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    let pid = null;
    wrap.onpointerdown = (e) => { if (pid !== null) return; pid = e.pointerId; try { wrap.setPointerCapture(pid); } catch {} S.down && S.down(...pt(e)); };
    wrap.onpointermove = (e) => { if (e.pointerId === pid) S.move && S.move(...pt(e)); };
    wrap.onpointerup = wrap.onpointercancel = (e) => { if (e.pointerId !== pid) return; pid = null; S.up && S.up(...pt(e)); };
    await new Promise((resolve) => { onDone = resolve; });
    wrap.onpointerdown = wrap.onpointermove = wrap.onpointerup = wrap.onpointercancel = null;
    // the verdict on this step: words, particles, the partner and the critic react
    const kind = S.score >= 0.85 ? 'perfect' : S.score >= 0.5 ? 'good' : 'miss';
    streak = kind === 'perfect' ? streak + 1 : 0;
    judge.className = `judge ${kind}`;
    judge.textContent = kind === 'perfect' ? (S.sweet && M.sweet ? '甜蜜點！' : streak > 1 ? `完美 ×${streak}` : '完美！') : kind === 'good' ? '不錯' : '可惜';
    const shown = {}; judge.shown = shown;
    setTimeout(() => { if (judge.shown === shown) judge.classList.add('in'); }, 16);
    sfx[kind](); vibrate(kind === 'perfect' ? [15, 40, 15] : 15);
    fx.burst(...center(), kind);
    if (kind === 'miss') { wrap.classList.remove('shake'); void wrap.offsetWidth; wrap.classList.add('shake'); }
    if (bar) { bar.setAct(kind === 'miss' ? 'oops' : 'cheer'); if (kind === 'perfect') bar.sparkle(); }
    cand = kind === 'miss' ? 'grumpy' : kind === 'perfect' ? 'happy' : 'neutral'; candT = 0; setMood(cand, performance.now() + 9999);
    instr.innerHTML = `${S.note}<small>&nbsp;</small>`;
    results.push({ id: S.id, name: S.name, score: S.score, note: S.note, kind, sweet: !!S.sweet });
    const res = onStep ? onStep(S, kind, streak) || {} : {};
    if (res.tip) {
      tipPop.textContent = res.tip; tipPop.classList.remove('in'); void tipPop.offsetWidth; tipPop.classList.add('in');
    }
    await wait(res.stop ? 1600 : 1300);
    judge.shown = null; judge.classList.remove('in');
    await wait(200);
    if (res.stop) { aborted = true; break; }
  }
  const triple = !aborted && results.length >= 2 && results.every((r) => r.kind === 'perfect');
  [...stepBar.children].forEach((b) => (b.className = 'done'));
  if (triple) {
    const banner = h('div.banner', h('small', '每一步都完美'), 'ALL PERFECT');
    phone.append(banner);
    requestAnimationFrame(() => banner.classList.add('in'));
    sfx.fanfare(); vibrate([20, 50, 20, 50, 40]);
    const pr = phone.getBoundingClientRect();
    fx.burst(pr.width / 2, pr.height * 0.35, 'confetti');
    await wait(1700);
    banner.remove();
  }
  // serve it: the cup goes over to the critic
  if (bar && !aborted) { instr.innerHTML = '端給評審<small>&nbsp;</small>'; bar.serve(); await wait(1500); }
  alive = false;
  window.removeEventListener('resize', resize);
  if (bar) bar.dispose();
  return { results, triple, aborted };
}
