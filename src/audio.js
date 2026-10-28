// Synthesized sound effects (WebAudio, no files) and the café's recorded music loops. Unlocks on the first user gesture.
const MUSIC = 'assets/audio/';
const TRACKS = { day: ['cafe_day', 'cafe_day2', 'cafe_day3'], night: ['cafe_night', 'cafe_night2'], battle: ['battle'] };
const MUSIC_GAIN = 0.5;
const NEXT_AHEAD = 15;   // seconds before a track's pass ends that the next one starts loading

class Audio {
  constructor() { this.ctx = null; this.enabled = true; this.volume = 0.7; this.last = {}; this.musicEnabled = true; this.musicTimer = null; this.music = null; this.moodNow = null; this.turn = {}; this.loading = false; this.musicTok = 0; this.mood = null; this.scene = null; }

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
  // Recorded loops (tools/music/cafe.py) in two playlists: the day's set while the café is open, the rainy one at
  // night. Each track plays through once, then the next one in its set takes over as it ends. Each MP3 carries a
  // little wrap-around on both ends, and assets/audio/music.json gives the loop points.
  setMusic(on) { this.musicEnabled = on; if (on) this.startMusic(); else this.stopMusic(); }
  startMusic() {
    if (!this.ctx || !this.enabled || !this.musicEnabled || this.musicTimer) return;
    this.musicTimer = setInterval(() => this.followMood(), 2000);
    this.followMood();
  }
  stopMusic() {
    clearInterval(this.musicTimer); this.musicTimer = null;
    this.moodNow = null; this.loading = false; this.musicTok++;
    if (this.music) this.fadeOut(this.music, 0.8);
    this.music = null;
  }
  /** Follows the café's mood (`audio.mood()`, set by main.js): a new mood crossfades to its own set, and near
   *  the end of a track's pass the next one in the set is loaded to come in as it ends. */
  followMood() {
    const mood = this.scene || (this.mood && this.mood()) || 'day', m = this.music;
    if (mood !== this.moodNow) { this.moodNow = mood; this.queueTrack(this.nextOf(mood), null); return; }
    if (TRACKS[mood].length > 1 && m && !this.loading && this.ctx.currentTime > m.endsAt - NEXT_AHEAD) this.queueTrack(this.nextOf(mood), m.endsAt);
  }
  /** A scene's own music over the café's mood (tools/music/battle.py while a battle is on); null hands back. */
  setScene(scene) { this.scene = scene; if (this.musicTimer) this.followMood(); }
  nextOf(mood) { const list = TRACKS[mood], i = this.turn[mood] || 0; this.turn[mood] = i + 1; return list[i % list.length]; }
  /** Starts `name` right away with a slow crossfade (a new mood, or the first track), or at `at`, as the track before ends. */
  queueTrack(name, at) {
    const tok = ++this.musicTok;   // a later change of mood, or a stop, wins over a load still under way
    this.loading = true;
    this.loadTrack(name).then(({ buf, loop }) => {
      if (tok !== this.musicTok || !this.musicTimer) return;
      this.loading = false;
      const c = this.ctx, now = c.currentTime, src = c.createBufferSource(), g = c.createGain();
      src.buffer = buf; src.loop = true; src.loopStart = loop[0]; src.loopEnd = loop[1];
      const next = at != null, t = next ? Math.max(now + 0.05, at - 0.5) : now + 0.05;
      const cut = !next && this.moodNow === 'battle';   // a fight cuts straight in, no slow café crossfade
      const [r0, r1] = cut ? [0, 0.1] : next ? [0, 2] : this.music ? [1.5, 5.5] : [0, 3];
      g.gain.setValueAtTime(0.0001, now);
      g.gain.setValueAtTime(0.0001, t + r0);
      g.gain.linearRampToValueAtTime(MUSIC_GAIN, t + r1);
      src.connect(g); g.connect(this.master);
      src.start(t, loop[0]);
      if (this.music) this.fadeOut(this.music, cut ? 0.6 : next ? 4 : 5, next ? t - 3.5 : now);   // the one before fades over its last bars
      this.music = { src, g, endsAt: t + loop[1] - loop[0] };
    }).catch((e) => { console.warn('Café music unavailable', e); });   // `loading` stays set: no retry every tick
  }
  fadeOut({ src, g }, sec, at = this.ctx.currentTime) {
    const t = this.ctx.currentTime, from = Math.max(t, at);
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.setValueAtTime(g.gain.value, from);
    g.gain.linearRampToValueAtTime(0.0001, from + sec);
    try { src.stop(from + sec + 0.1); } catch { /* already stopping */ }
    src.onended = () => g.disconnect();
  }
  /** Fetches and decodes one track (at 32 kHz: half the memory of a 48 kHz buffer, nothing audible lost). */
  async loadTrack(name) {
    this.musicMeta ||= fetch(MUSIC + 'music.json').then((r) => r.json());
    const [meta, bytes] = await Promise.all([this.musicMeta, fetch(MUSIC + name + '.mp3').then((r) => r.arrayBuffer())]);
    let dec = this.ctx;
    try { dec = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(2, 1, 32000); } catch { /* the live context decodes */ }
    const buf = await new Promise((res, rej) => { const p = dec.decodeAudioData(bytes, res, rej); if (p && p.then) p.then(res, rej); });
    return { buf, loop: meta[name].loop };
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
      case 'bat': this.noise(0.09, { vol: 0.32, freq: 2600, q: 0.9 }); T(1250, 0.07, { type: 'square', vol: 0.08 }); T(620, 0.12, { type: 'triangle', vol: 0.12, at: 0.02, slide: -200 }); break;
      case 'step': T(240, 0.035, { type: 'triangle', vol: 0.1, slide: -60 }); break;
      // battle impacts, one per member's way of attacking (ui/hitfx.js); '-s' is the quieter auto-attack version
      case 'bean': T(380, 0.08, { type: 'triangle', vol: 0.24, slide: -170 }); this.noise(0.13, { vol: 0.16, freq: 1700, q: 1.2 }); T(940, 0.05, { vol: 0.08, at: 0.02 }); break;
      case 'bean-s': T(420, 0.06, { type: 'triangle', vol: 0.11, slide: -150 }); this.noise(0.07, { vol: 0.06, freq: 1800, q: 1.2 }); break;
      case 'claw': this.noise(0.06, { vol: 0.24, freq: 5200, q: 1.4 }); this.noise(0.07, { vol: 0.22, at: 0.065, freq: 4300, q: 1.4 }); T(1400, 0.04, { type: 'square', vol: 0.05 }); break;
      case 'claw-s': this.noise(0.05, { vol: 0.1, freq: 5000, q: 1.4 }); break;
      case 'bash': T(110, 0.18, { vol: 0.5, slide: -50 }); this.noise(0.12, { vol: 0.2, freq: 420, q: 0.7, type: 'lowpass' }); T(1568, 0.28, { vol: 0.06, at: 0.04 }); break;
      case 'bash-s': T(130, 0.1, { vol: 0.24, slide: -40 }); this.noise(0.06, { vol: 0.08, freq: 420, q: 0.7, type: 'lowpass' }); break;
      case 'zap': T(520, 0.16, { vol: 0.17, slide: 900 }); T(1319, 0.22, { type: 'triangle', vol: 0.08, at: 0.05 }); this.noise(0.15, { vol: 0.06, at: 0.03, freq: 6000, type: 'highpass' }); break;
      case 'zap-s': T(620, 0.09, { vol: 0.08, slide: 600 }); break;
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
