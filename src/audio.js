// Synthesized sound effects (WebAudio, no files). Unlocks on the first user gesture.
class Audio {
  constructor() { this.ctx = null; this.enabled = true; this.volume = 0.7; this.last = {}; }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume * 0.5;
      this.master.connect(this.ctx.destination);
    } catch { this.ctx = null; }
  }
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v * 0.5; }

  tone(freq, dur, { type = 'sine', vol = 0.3, at = 0, slide = 0, attack = 0.005 } = {}) {
    const c = this.ctx, t = c.currentTime + at;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  noise(dur, { vol = 0.2, at = 0, freq = 1200, q = 0.8, type = 'bandpass' } = {}) {
    const c = this.ctx, t = c.currentTime + at;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  }

  play(name) {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
    // rate-limit identical sounds (16x speed would otherwise be a wall of noise)
    const now = this.ctx.currentTime;
    if (this.last[name] && now - this.last[name] < 0.07) return;
    this.last[name] = now;
    const T = (...a) => this.tone(...a);
    switch (name) {
      case 'coin': T(988, 0.08, { type: 'square', vol: 0.08 }); T(1319, 0.18, { type: 'square', vol: 0.08, at: 0.07 }); break;
      case 'pop': T(520, 0.09, { vol: 0.18, slide: 380 }); break;
      case 'order': T(660, 0.08, { type: 'triangle', vol: 0.18 }); T(880, 0.1, { type: 'triangle', vol: 0.18, at: 0.08 }); break;
      case 'serve': T(784, 0.1, { type: 'triangle', vol: 0.2 }); T(1047, 0.16, { type: 'triangle', vol: 0.18, at: 0.07 }); break;
      case 'ding': T(1568, 0.5, { vol: 0.16 }); T(2093, 0.4, { vol: 0.07, at: 0.01 }); break;
      case 'sizzle': this.noise(0.35, { vol: 0.08, freq: 4000, q: 0.5, type: 'highpass' }); break;
      case 'shake': for (let i = 0; i < 4; i++) this.noise(0.06, { vol: 0.12, at: i * 0.09, freq: 3000, q: 2 }); break;
      case 'sweep': this.noise(0.25, { vol: 0.12, freq: 1800, q: 0.7 }); this.noise(0.25, { vol: 0.1, at: 0.28, freq: 1500, q: 0.7 }); break;
      case 'repair': for (let i = 0; i < 3; i++) T(320, 0.06, { type: 'square', vol: 0.07, at: i * 0.16 }); break;
      case 'door': T(1175, 0.25, { vol: 0.1 }); T(1480, 0.35, { vol: 0.08, at: 0.12 }); break;
      case 'angry': T(220, 0.25, { type: 'sawtooth', vol: 0.07, slide: -90 }); T(180, 0.3, { type: 'sawtooth', vol: 0.06, at: 0.2, slide: -60 }); break;
      case 'break': this.noise(0.3, { vol: 0.25, freq: 600, q: 0.6 }); T(150, 0.3, { type: 'square', vol: 0.08, slide: -80 }); break;
      case 'place': T(180, 0.12, { type: 'triangle', vol: 0.3, slide: -60 }); this.noise(0.08, { vol: 0.1, freq: 900 }); break;
      case 'tap': T(700, 0.05, { type: 'triangle', vol: 0.12 }); break;
      case 'click': T(900, 0.04, { type: 'triangle', vol: 0.12 }); break;
      case 'error': T(200, 0.14, { type: 'square', vol: 0.07 }); T(160, 0.18, { type: 'square', vol: 0.07, at: 0.12 }); break;
      case 'water': this.noise(0.5, { vol: 0.1, freq: 2500, q: 1.5 }); break;
      case 'eat': T(400, 0.06, { vol: 0.15 }); T(460, 0.06, { vol: 0.15, at: 0.1 }); break;
      case 'yawn': T(500, 0.6, { type: 'triangle', vol: 0.1, slide: -250, attack: 0.1 }); break;
      case 'levelup': [523, 659, 784, 1047].forEach((f, i) => T(f, 0.22, { type: 'triangle', vol: 0.16, at: i * 0.09 })); break;
      case 'fanfare': [523, 659, 784, 659, 784, 1047].forEach((f, i) => T(f, 0.25, { type: 'triangle', vol: 0.15, at: i * 0.12 })); break;
      case 'open': T(660, 0.08, { vol: 0.12 }); T(990, 0.1, { vol: 0.1, at: 0.06 }); break;
      case 'close': T(990, 0.08, { vol: 0.1 }); T(660, 0.1, { vol: 0.1, at: 0.06 }); break;
    }
  }
}
export const audio = new Audio();
