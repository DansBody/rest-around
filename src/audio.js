// Synthesized sound effects and a little lo-fi café loop (WebAudio, no files). Unlocks on the first user gesture.
const BEAT = 60 / 74, BAR = BEAT * 4;
const mhz = (m) => 440 * Math.pow(2, (m - 69) / 12);
// Cmaj9 · Am9 · Dm9 · G13 — warm electric-piano voicings
const CHORDS = [[48, 52, 55, 59, 62], [45, 48, 52, 55, 59], [50, 53, 57, 60, 64], [43, 47, 53, 57, 64]];
const BASS = [36, 33, 38, 31];
const PENTA = [72, 74, 76, 79, 81, 84, 86];

class Audio {
  constructor() { this.ctx = null; this.enabled = true; this.volume = 0.7; this.last = {}; this.musicEnabled = true; this.musicTimer = null; this.music = null; }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume * 0.5;
      this.master.connect(this.ctx.destination);
      if (this.musicEnabled) this.startMusic();
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

  // ---------------- café music ----------------
  setMusic(on) { this.musicEnabled = on; if (on) this.startMusic(); else this.stopMusic(); }
  startMusic() {
    if (!this.ctx || !this.enabled || !this.musicEnabled || this.musicTimer) return;
    const c = this.ctx;
    this.music = c.createGain();
    this.music.gain.setValueAtTime(0.0001, c.currentTime);
    this.music.gain.linearRampToValueAtTime(0.5, c.currentTime + 5);
    this.music.connect(this.master);
    this.bar = 0; this.nextBar = c.currentTime + 0.4;
    this.musicTimer = setInterval(() => this.scheduleMusic(), 400);
    this.scheduleMusic();
  }
  stopMusic() {
    clearInterval(this.musicTimer); this.musicTimer = null;
    const m = this.music; this.music = null;
    if (m) { m.gain.cancelScheduledValues(0); m.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.25); setTimeout(() => m.disconnect(), 1500); }
  }
  scheduleMusic() {
    const c = this.ctx;
    if (!c || !this.music) return;
    while (this.nextBar < c.currentTime + 1.5) { this.playBar(this.bar++, this.nextBar); this.nextBar += BAR; }
  }
  /** One bar: chord stabs, bass, a soft beat, vinyl crackle and a sparse pentatonic melody. */
  playBar(n, t0) {
    const idx = n % 4, chord = CHORDS[idx];
    const hit = (t, vol, dur) => chord.forEach((m, i) => this.voice(t + i * 0.014, mhz(m), dur, vol));
    hit(t0, 0.05, BEAT * 3.2);
    hit(t0 + BEAT * 1.5, 0.032, BEAT * 1.2);
    if (n % 2) hit(t0 + BEAT * 3.5, 0.03, BEAT * 1.2);
    this.voice(t0, mhz(BASS[idx]), BEAT * 1.6, 0.17, 'triangle', 500);
    this.voice(t0 + BEAT * 2, mhz(BASS[idx] + (idx === 3 ? 0 : 7)), BEAT * 1.2, 0.12, 'triangle', 500);
    // beat
    this.kick(t0); this.kick(t0 + BEAT * 2.5);
    this.snare(t0 + BEAT); this.snare(t0 + BEAT * 3);
    for (let i = 0; i < 8; i++) this.hat(t0 + i * BEAT / 2 + (i % 2 ? BEAT * 0.09 : 0), i % 2 ? 0.026 : 0.04);
    for (let i = 0; i < 7; i++) this.click(t0 + Math.random() * BAR);
    // melody
    let p = (n * 3) % PENTA.length;
    for (let i = 0; i < 8; i++) {
      if (Math.random() > 0.34) continue;
      p = Math.max(0, Math.min(PENTA.length - 1, p + Math.floor(Math.random() * 5) - 2));
      const t = t0 + i * BEAT / 2 + (i % 2 ? BEAT * 0.09 : 0), f = mhz(PENTA[p]);
      this.voice(t, f, 1.3, 0.05, 'triangle', 3200);
      this.voice(t + BEAT * 0.75, f, 1.0, 0.016, 'triangle', 2400);
    }
  }
  voice(t, f, dur, vol, type = 'sine', lp = 2400) {
    const c = this.ctx, o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain(), g2 = c.createGain(), fl = c.createBiquadFilter();
    o.type = type; o.frequency.value = f; o.detune.value = (Math.random() - 0.5) * 9;
    o2.type = 'sine'; o2.frequency.value = f * 2.01; g2.gain.value = 0.2;
    fl.type = 'lowpass'; fl.frequency.value = lp;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol * 0.4), t + Math.min(0.3, dur * 0.4));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(fl); fl.connect(this.music);
    o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }
  kick(t) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.16);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.3, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g); g.connect(this.music); o.start(t); o.stop(t + 0.25);
  }
  hush(t, dur, vol, freq, type, q = 0.7) {
    const c = this.ctx, len = Math.max(1, Math.floor(c.sampleRate * dur)), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.music); src.start(t);
  }
  snare(t) { this.hush(t, 0.16, 0.1, 1700, 'bandpass', 0.8); }
  hat(t, vol) { this.hush(t, 0.05, vol, 7500, 'highpass', 0.5); }
  click(t) { this.hush(t, 0.012, 0.045, 2600, 'bandpass', 1.2); }

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
      case 'charge': T(330, 0.85, { type: 'triangle', vol: 0.09, slide: 520, attack: 0.5 }); T(495, 0.85, { vol: 0.05, slide: 780, attack: 0.5 }); break;
      case 'ability': this.noise(0.35, { vol: 0.12, freq: 1200, q: 0.8 }); [784, 988, 1175, 1568].forEach((f, i) => T(f, 0.3, { type: 'triangle', vol: 0.12, at: 0.04 + i * 0.05 })); break;
      case 'fanfare': [523, 659, 784, 659, 784, 1047].forEach((f, i) => T(f, 0.25, { type: 'triangle', vol: 0.15, at: i * 0.12 })); break;
      case 'open': T(660, 0.08, { vol: 0.12 }); T(990, 0.1, { vol: 0.1, at: 0.06 }); break;
      case 'close': T(990, 0.08, { vol: 0.1 }); T(660, 0.1, { vol: 0.1, at: 0.06 }); break;
    }
  }
}
export const audio = new Audio();
