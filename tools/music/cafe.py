# -*- coding: utf-8 -*-
"""Refillit's café music: acid-jazz / neo-soul loops with a tenor-sax lead, written as MIDI (orch.py) and
rendered through FluidSynth + GeneralUser GS (the pipeline of miffy-adventure's game/audio/music.py).

  cafe_day    D minor, 76 bpm, 48 bars: intro · A · A' · B (bridge) · C (Rhodes solo) · A'' · outro
  cafe_night  C minor, 68 bpm, 40 bars, brushes, fretless bass and synthesized rain
  cafe_day2   G dorian, 84 bpm, 48 bars, a busier afternoon groove with a Rhodes solo
  cafe_day3   A minor, 72 bpm, 40 bars, vibraphone first, then the sax
  cafe_night2 F minor, 64 bpm, 32 bars, last call in the rain
The game rotates the day tracks while the café is open and the night tracks after closing.

All melodies and progressions are original. 16ths swing a little (SW of a beat on the off-16ths).
Loops are rendered two passes long and the second pass is kept, so the reverb tail of the first is
already in its start; the last 40 ms crossfade into the end of pass one (FluidSynth starts notes on
64-sample blocks, so a straight cut clicks). The file gets PAD seconds of wrap-around on each side.

usage: python tools/music/cafe.py [track ...] [--stems]
"""
import os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import orch  # noqa: E402
from common import BUILD, PAD, SR, export, finish, loudness  # noqa: E402

# rootless electric-piano voicings (intervals above the root)
QUAL = {"m9": [3, 7, 10, 14], "m11": [3, 10, 14, 17], "maj9": [4, 7, 11, 14], "maj7": [4, 7, 11, 16],
        "9": [4, 10, 14, 19], "13": [4, 10, 14, 21], "7b9": [4, 10, 13, 19], "7#9": [4, 10, 15, 19],
        "m7b5": [3, 6, 10, 17], "7sus": [5, 10, 14, 19]}


def chord(sym):
    root = sym[:2] if len(sym) > 1 and sym[1] in "#b" else sym[:1]
    return orch.NOTE[root], QUAL[sym[len(root):]]


def voicing(sym, low=52, high=63):
    pc, iv = chord(sym)
    base = pc + 12 * ((low - pc - iv[0]) // 12 + 1)
    while base + iv[0] > high:
        base -= 12
    while base + iv[0] < low:
        base += 12
    return [base + i for i in iv]


def bass_root(sym, low=31):
    pc, _ = chord(sym)
    return low + (pc - low) % 12


class Song:
    """Beat-based writing on top of orch.Score; bars are 1-based, `form` is one (chords, section) per bar
    with chords a list of (symbol, beats)."""

    def __init__(self, bpm, form, swing=0.05, seed=1):
        self.s = orch.Score()
        self.bpm, self.beat = bpm, 60.0 / bpm
        self.bar = 4 * self.beat
        self.form = form
        self.bars = len(form)
        self.length = self.bars * self.bar
        self.swing = swing
        self.off = 0.0
        self.rng = np.random.default_rng(seed)

    def part(self, name, inst, vol=100, pan=64, rev=50, chorus=10):
        self.s.part(name, inst, vol, pan, rev, chorus)

    def sw(self, beat):
        q = beat * 4
        return beat + (self.swing if abs(q - round(q)) < 1e-6 and round(q) % 2 else 0.0)

    def t(self, bar, beat=0.0):
        extra, b = divmod(beat, 4)
        return self.off + (bar - 1 + extra) * self.bar + self.sw(b) * self.beat

    def hum(self, ms=8):
        return self.rng.uniform(-ms, ms) / 1000

    def note(self, part, bar, beat, beats, pitch, vel=80, ms=6):
        a = self.t(bar, beat) + self.hum(ms)
        b = self.t(bar, beat + beats)
        self.s.note(part, max(0, a), max(0.03, b - a), pitch, vel + self.rng.uniform(-5, 5))

    # ---------------- lead line with scoops and late vibrato on long notes
    def mel(self, part, bar, notes, vel=88, octave=0, stacc=0.96, beat=0.0, scoop=True):
        b = beat
        for tok in notes.split():
            nm, d = tok.split(":")
            d = float(d)
            if nm != "R":
                p = orch.midi_num(nm) + octave
                a = self.t(bar, b) + self.hum(10)
                e = self.t(bar, b + d) - (1 - stacc) * self.beat * min(d, 1)
                long_ = d >= 1
                if scoop and long_:                      # slide up a quarter tone into long notes
                    self.s.bend(part, a - 0.005, -0.25)
                    for k in range(1, 6):
                        self.s.bend(part, a + 0.016 * k, -0.25 * (1 - k / 5))
                else:
                    self.s.bend(part, a - 0.005, 0)
                self.s.cc(part, a - 0.004, 1, 0)
                if d >= 1.5:                             # vibrato blooms on held notes
                    for k in range(6):
                        self.s.cc(part, a + (e - a) * (0.35 + 0.1 * k), 1, 12 * k)
                self.s.note(part, a, max(0.05, e - a), p, vel + (6 if long_ else 0) + self.rng.uniform(-6, 4))
            b += d
        return b

    # ---------------- accompaniment
    def comp(self, part, bar, sym, beat, beats, style, vel=62):
        """Electric-piano comping: rolled voicing on the chord, then a softer push or stab."""
        v = voicing(sym)
        if style == "pad":
            hits = [(0, beats - 0.1, 1.0)]
        elif beats >= 4:
            hits = {"a": [(0, 1.6, 1.0), (2.5, 1.3, 0.75)],
                    "b": [(0, 2.6, 1.0), (3.25, 0.5, 0.6)],
                    "c": [(0, 0.9, 1.0), (1.75, 0.5, 0.7), (2.75, 1.0, 0.8)]}[style]
        else:
            hits = [(0, 1.1, 1.0), (1.5, 0.4, 0.65)] if style != "b" else [(0, beats - 0.15, 1.0)]
        for h, d, k in hits:
            for i, p in enumerate(v):
                a = self.t(bar, beat + h) + 0.012 * i + self.hum(4)
                self.s.note(part, a, d * self.beat, p, vel * k + self.rng.uniform(-4, 4) - 3 * (i == 0))

    def strings(self, part, bar, sym, beat, beats, vel=48):
        for p in voicing(sym, 60, 70)[1:]:
            self.s.note(part, self.t(bar, beat) + 0.02, beats * self.beat - 0.04, p, vel)

    def stab(self, part, bar, sym, beat, vel=58, dur=0.3):
        v = voicing(sym, 62, 72)
        for i, p in enumerate(v[1:3]):
            self.s.note(part, self.t(bar, beat) + 0.008 * i, dur * self.beat, p, vel)

    def bass(self, part, bar, sym, nxt, beat, beats, style, vel=92, slide=False):
        r = bass_root(sym)
        n = bass_root(nxt)
        app = n - 1 if n > r else n + 1
        _, iv = chord(sym)
        fifth = r + (6 if iv[1] == 6 else 7)
        deg = {"r": r, "5": fifth, "8": r + 12, "7": r + 10 if iv[2] in (10,) else r + 10, "a": app}
        if beats >= 4:
            rh = {"groove": [(0, 1.4, "r"), (1.75, .25, "r"), (2.5, .75, "5"), (3.5, .25, "8"), (3.75, .25, "a")],
                  "walk": [(0, 1.5, "r"), (2, 0.75, "8"), (2.75, 0.5, "7"), (3.5, 0.5, "5")],
                  "long": [(0, 2.6, "r"), (2.75, 0.75, "5"), (3.5, .5, "a")],
                  "root": [(0, 3.8, "r")]}[style]
        else:
            rh = [(0, 1.0, "r"), (1.5, .25, "8"), (1.75, .25, "a")] if style != "root" else [(0, beats - .1, "r")]
        for i, (b, d, g) in enumerate(rh):
            a = self.t(bar, beat + b) + self.hum(5)
            if slide and i == 0:                         # fretless-style slide into the downbeat
                self.s.bend(part, a - 0.004, -0.5)
                for k in range(1, 7):
                    self.s.bend(part, a + 0.014 * k, -0.5 * (1 - k / 6))
            elif i == 1 or (not slide and i == 0):
                self.s.bend(part, a - 0.004, 0)
            self.s.note(part, a, d * self.beat * 0.95, deg[g], vel * (1 if b == 0 else 0.82) + self.rng.uniform(-5, 4))

    def drums(self, bar, pattern, vel=96):
        """One bar on a 16th grid: '.' rest, 'x' hit, 'X' accent, 'o' ghost (off-16ths swing)."""
        for name, row in pattern.items():
            for i, c in enumerate(row):
                if c == ".":
                    continue
                v = vel * {"x": 0.78, "X": 1.0, "o": 0.42}[c] + self.rng.uniform(-6, 6)
                self.s.drum(self.t(bar, i / 4) + self.hum(5), name, v)

    def render(self, name, compose, gain=0.55, tail=5.0, post=None):
        for p in range(2):
            self.off = p * self.length
            compose(self, p)
        self.off = 0.0
        end = 2 * self.length + tail
        self.s.note(list(self.s.parts)[0], end, 0.01, 0, 1)      # pad the MIDI so FluidSynth renders the tail
        audio = self.s.render(os.path.join(BUILD, name + "_raw.wav"), gain)
        L = int(round(self.length * SR))
        y = audio[:, L:2 * L].copy()
        xf = int(0.04 * SR)
        f = np.linspace(0, 1, xf)
        y[:, -xf:] = y[:, -xf:] * (1 - f) + audio[:, L - xf:L] * f
        if post:
            y = post(y)
        p = int(PAD * SR)
        return np.concatenate([y[:, -p:], y, y[:, :p]], axis=1), L / SR


def form(sections, prog):
    out = []
    for sec in sections:
        out += [(bar, sec) for bar in prog[sec.rstrip("'")]]
    return out


def parse(prog):
    """'Dm9 | Bbmaj7 A7#9 | ...' -> per bar a list of (symbol, beats)."""
    bars = []
    for b in prog.split("|"):
        syms = b.split()
        bars.append([(s, 4 / len(syms)) for s in syms])
    return bars


# ====================================================================== day: D minor, 76 bpm
DAY = {"intro": parse("Dm9 | Bbmaj7 A7#9 | Dm9 | Bbmaj7 A7#9"),
       "A": parse("Dm9 | Bbmaj7 A7#9 | Dm9 | Gm9 C9 | Fmaj9 | Bbmaj9 | Em7b5 | A7b9"),
       "B": parse("Gm9 | C13 | Fmaj9 | Dm9 | Gm9 | C13 | Bbmaj7 | A7sus A7b9"),
       "C": parse("Dm9 | Dm9 | Bbmaj7 | A7#9 | Dm9 | Dm9 | Bbmaj7 | A7#9"),
       "outro": parse("Dm9 | Bbmaj7 A7#9 | Dm9 | Bbmaj7 A7#9")}
DAY_FORM = form(["intro", "A", "A'", "B", "C", "A''", "outro"], DAY)
DAY_A = ["R:1.5 A4:.5 C5:.5 D5:.5 F5:.75 E5:.25", "D5:1.5 C5:.5 C#5:1 E5:.5 R:.5",
         "R:.5 A4:.25 C5:.25 D5:.5 E5:.5 F5:1 A5:.5 G5:.5", "F5:1 D5:.5 Bb4:.5 R:.5 E5:.75 D5:.25 E5:.5",
         "R:.5 C5:.5 E5:.5 G5:2 R:.5", "F5:.75 E5:.25 D5:.5 C5:.5 D5:2",
         "R:.5 Bb4:.5 D5:.5 G5:1 F5:.5 E5:.5 R:.5", "C#5:1.5 Bb4:.5 A4:1 R:1"]
DAY_A2 = ["R:1 A4:.5 C5:.5 D5:.5 F5:.5 A5:.5 G5:.5", "F5:1 D5:.5 F5:.5 E5:1.5 R:.5",
          "R:.5 D5:.25 E5:.25 F5:.5 A5:.5 C6:1 A5:.5 G5:.5", "A5:1 F5:.5 D5:.5 E5:.75 G5:.25 E5:.5 C5:.5",
          "A5:1.5 G5:.5 E5:2", "R:.5 F5:.5 D5:.5 C5:.5 D5:.5 F5:1.5",
          "G5:1 F5:.5 E5:.5 D5:.5 Bb4:1.5", "A4:2 R:2"]
DAY_B = ["R:.5 D5:.5 F5:.5 A5:.5 Bb5:1.5 A5:.5", "G5:1 E5:.5 D5:.5 E5:2",
         "R:.5 E5:.5 G5:.5 A5:.5 C6:1.5 A5:.5", "A5:1.5 F5:.5 E5:2",
         "R:.5 Bb5:.5 A5:.5 G5:.5 F5:.75 G5:.25 A5:1", "Bb5:.5 A5:.5 G5:.5 E5:.5 G5:2",
         "F5:1 D5:1 F5:.5 A5:.5 G5:1", "D5:1.5 E5:.5 C#5:1 R:1"]
DAY_SOLO = ["R:1 F5:.25 G5:.25 A5:.5 C6:.5 A5:.5 G5:1", "F5:.5 E5:.5 D5:1 R:2",
            "R:.5 D5:.5 F5:.5 A5:.5 C6:1 D6:1", "C6:.5 Bb5:.5 G5:.5 E5:.5 C#5:2",
            "R:.5 A5:.25 C6:.25 D6:1 C6:.5 A5:.5 G5:1", "F5:.75 G5:.25 F5:.5 D5:.5 R:2",
            "R:1 F5:.5 G5:.5 A5:.5 Bb5:.5 C6:1", "E5:1 C#5:1 R:2"]

BOOM = {"kick": "X.....x...x.....", "snare": "....X.......X...", "hat": "x.xox.xox.xox.xo"}
BOOM2 = {"kick": "X.....x..x..x...", "snare": "....X..o....X..o", "hat": "x.xox.xox.xox.x."}
FILL = {"kick": "X.....x.........", "snare": "....X.....o.X.oo", "hat": "x.xox.xox.x.....", "ohat": "............x..."}


def day(s, p):
    n = len(DAY_FORM)
    for i, (chords, sec) in enumerate(DAY_FORM):
        bar = i + 1
        nxt = DAY_FORM[(i + 1) % n][0][0][0]
        k = sum(1 for _, x in DAY_FORM[:i] if x == sec)            # bar within the section
        last = k == 7
        beat = 0.0
        for j, (sym, beats) in enumerate(chords):
            after = chords[j + 1][0] if j + 1 < len(chords) else nxt
            style = {"intro": "b", "outro": "b", "B": "a", "C": "c"}.get(sec, "a" if k % 2 == 0 else "c")
            s.comp("rhodes", bar, sym, beat, beats, style, vel=60 if sec in ("intro", "outro") else 64)
            if sec == "intro" and k < 2:
                pass                                              # bass waits two bars
            elif sec in ("B",):
                s.bass("bass", bar, sym, after, beat, beats, "long", slide=(k % 2 == 0 and j == 0))
            elif sec == "C":
                s.bass("bass", bar, sym, after, beat, beats, "walk" if k % 2 else "groove")
            elif sec in ("intro", "outro"):
                s.bass("bass", bar, sym, after, beat, beats, "root" if sec == "outro" and k == 3 else "long")
            else:
                s.bass("bass", bar, sym, after, beat, beats, "groove")
            if sec in ("B", "A''"):
                s.strings("str", bar, sym, beat, beats, vel=44 if sec == "A''" else 52)
            if sec in ("A'", "C", "outro"):                         # clean-guitar stabs on the 2& and 4
                s.stab("gtr", bar, sym, beat + (1.5 if beats >= 4 else 0.5), vel=66)
                if beats >= 4 and sec != "outro":
                    s.stab("gtr", bar, sym, beat + 3, vel=56, dur=0.2)
            beat += beats
        # drums
        if sec == "intro":
            s.drums(bar, {"rim": "....x.......x...", "hat": "x.xox.xox.xox.xo"} if k < 2 else
                    {"kick": "X.........x.....", "rim": "....x.......x...", "hat": "x.xox.xox.xox.xo"}, vel=88)
        elif sec == "outro":
            s.drums(bar, {"kick": "X.........x.....", "rim": "....x.......x...", "hat": "x.xox.xox.xox.xo"}, vel=84)
        elif last and sec != "C":
            s.drums(bar, FILL)
        elif sec == "C":
            s.drums(bar, dict(BOOM2, ride="x...x...x...x...") if k % 2 else BOOM, vel=92)
        else:
            s.drums(bar, BOOM2 if k % 4 == 3 else BOOM)
        if k == 0 and sec in ("A", "B", "A''"):
            s.drums(bar, {"crash": "x..............."}, vel=60)
    # leads
    for j in range(8):
        s.mel("sax", 5 + j, DAY_A[j], 88)
        s.mel("sax", 13 + j, DAY_A2[j], 90)
        s.mel("sax", 21 + j, DAY_B[j], 94)
        s.mel("solo", 29 + j, DAY_SOLO[j], 70, scoop=False, stacc=0.85)
        s.mel("sax", 37 + j, DAY_A[j], 90)
    s.s.swell("str", s.t(21), s.t(25), 70, 110)
    s.s.swell("str", s.t(27), s.t(29), 110, 60)
    s.s.swell("str", s.t(37), s.t(38), 60, 90)
    # guitar answers the sax at the ends of its phrases
    s.mel("gtr", 12, "R:2.5 A5:.25 C6:.25 D6:.5 R:.5", 60, scoop=False, stacc=0.6)
    s.mel("gtr", 20, "R:2 D6:.5 C6:.25 A5:.25 G5:.5 F5:.5", 58, scoop=False, stacc=0.6)
    s.mel("gtr", 44, "R:2.5 E5:.25 G5:.25 A5:1", 58, scoop=False, stacc=0.6)


def make_day():
    s = Song(76, DAY_FORM, swing=0.05, seed=7)
    s.part("rhodes", "rhodes", 104, 52, 56, 40)
    s.part("bass", "fingerbass", 92, 64, 12, 0)
    s.part("sax", "tenorsax", 100, 74, 64, 12)
    s.part("solo", "rhodes", 127, 82, 70, 50)
    s.part("gtr", "cleangtr", 100, 96, 50, 30)
    s.part("str", "slowstr", 110, 36, 90, 20)
    s.s.kit("standard", 100, 30)
    return s.render("cafe_day", day)


# ====================================================================== night: C minor, 68 bpm, rain
NIGHT = {"intro": parse("Cm9 | Abmaj9 | Fm9 | G7sus G7b9"),
         "A": parse("Cm9 | Abmaj9 | Fm9 Bb13 | Ebmaj9 | Abmaj9 | Dm7b5 G7b9 | Cm9 | G7sus G7#9"),
         "B": parse("Fm9 | Bb13 | Ebmaj9 | Cm9 | Fm9 | Bb13 | Abmaj7 | G7sus G7b9"),
         "outro": parse("Cm9 | Abmaj9 | Fm9 | G7sus G7b9")}
NIGHT_FORM = form(["intro", "A", "B", "A'", "A''", "outro"], NIGHT)
NIGHT_A = ["R:1 G4:.5 Bb4:.5 C5:1 D5:.5 Eb5:.5", "C5:2.5 Bb4:.5 G4:1",
           "Ab4:.5 G4:.5 F4:1 D5:.75 C5:.25 D5:1", "Bb4:3 R:1",
           "R:.5 C5:.5 Eb5:.5 G5:1.5 F5:.5 Eb5:.5", "D5:1 C5:.5 Ab4:.5 B4:1 Ab4:1",
           "G4:1.5 Eb4:.5 F4:.5 G4:1.5", "R:2 F4:.5 G4:.5 Bb4:.5 B4:.5"]
NIGHT_B = ["C5:1.5 Eb5:.5 G5:2", "F5:1 D5:.5 C5:.5 G4:2",
           "R:.5 Bb4:.5 D5:.5 F5:.5 G5:1.5 F5:.5", "Eb5:2 D5:1 R:1",
           "R:.5 Ab4:.5 C5:.5 Eb5:.5 F5:1 G5:.5 Ab5:.5", "G5:1.5 F5:.5 D5:2",
           "C5:1 Eb5:.5 G5:.5 F5:1 Eb5:1", "D5:2 B4:1 R:1"]
BRUSH = {"kick": "X.........x.....", "snare": "....x.......x...", "swirl": "x.......x.......",
         "hat": "..x...x...x...x."}


def night(s, p):
    n = len(NIGHT_FORM)
    for i, (chords, sec) in enumerate(NIGHT_FORM):
        bar = i + 1
        nxt = NIGHT_FORM[(i + 1) % n][0][0][0]
        k = sum(1 for _, x in NIGHT_FORM[:i] if x == sec)
        beat = 0.0
        for j, (sym, beats) in enumerate(chords):
            after = chords[j + 1][0] if j + 1 < len(chords) else nxt
            soft = sec in ("intro", "outro")
            s.comp("rhodes", bar, sym, beat, beats, "b" if soft or k % 2 else "a", vel=54 if soft else 58)
            if not (sec == "intro" and k < 2):
                s.bass("bass", bar, sym, after, beat, beats, "long" if sec != "outro" or k < 3 else "root",
                       vel=88, slide=(j == 0 and k % 2 == 0 and sec != "intro"))
            if sec in ("B", "A''"):
                s.strings("str", bar, sym, beat, beats, vel=46 if sec == "B" else 40)
            beat += beats
        if sec == "intro" and k < 2:
            continue
        s.drums(bar, BRUSH if sec not in ("intro", "outro") else {"swirl": BRUSH["swirl"], "snare": BRUSH["snare"]},
                vel=96)
    for j in range(8):
        s.mel("sax", 5 + j, NIGHT_A[j], 82)
        s.mel("sax", 13 + j, NIGHT_B[j], 86)
        s.mel("vibes", 21 + j, NIGHT_A[j], 66, octave=12, scoop=False, stacc=0.8)
        s.mel("sax", 29 + j, NIGHT_A[j], 84)
    s.s.swell("str", s.t(13), s.t(15), 64, 104)
    s.s.swell("str", s.t(19), s.t(21), 104, 70)


def rain(n, level):
    """A periodic rain bed `n` samples long (filtered in the frequency domain, so it loops by itself),
    with drips placed modulo the loop. Scaled to `level` LUFS."""
    rng = np.random.default_rng(42)
    f = np.fft.rfftfreq(n, 1 / SR)
    shape = np.where(f > 0, 1 / np.sqrt(np.maximum(f, 1) / 800), 0)              # pinkish hiss
    shape *= 1 / (1 + (250 / np.maximum(f, 1)) ** 2) / (1 + (f / 7500) ** 2)       # 250 Hz – 7.5 kHz band
    shape += 0.6 / (1 + ((f - 120) / 60) ** 2)                                      # distant low rumble
    out = np.zeros((2, n))
    t = np.arange(n) / SR
    L = n / SR
    for c in range(2):
        spec = np.fft.rfft(rng.standard_normal(n)) * shape
        bed = np.fft.irfft(spec, n)
        swell = 1 + 0.18 * np.sin(2 * np.pi * 3 * t / L + c) + 0.1 * np.sin(2 * np.pi * 11 * t / L + 2 * c)
        out[c] = bed / np.abs(bed).std() * swell
    # drips: short damped ticks on the window and the awning
    for _ in range(int(L * 9)):
        at = rng.integers(0, n)
        fr = rng.uniform(1800, 5200)
        m = int(SR * 0.03)
        tt = np.arange(m) / SR
        drip = np.sin(2 * np.pi * fr * tt * (1 + 0.6 * tt / 0.03)) * np.exp(-tt / 0.006) * rng.uniform(0.6, 2.2)
        pan = rng.uniform(0.15, 0.85)
        idx = (at + np.arange(m)) % n
        out[0, idx] += drip * (1 - pan)
        out[1, idx] += drip * pan
    return out * 10 ** ((level - loudness(out)) / 20)


def make_night():
    s = Song(68, NIGHT_FORM, swing=0.06, seed=11)
    s.part("rhodes", "rhodes", 104, 54, 70, 40)
    s.part("bass", "fretless", 92, 64, 20, 0)
    s.part("sax", "tenorsax", 98, 72, 80, 12)
    s.part("vibes", "vibes", 110, 84, 84, 20)
    s.part("str", "slowstr", 110, 40, 96, 20)
    s.s.kit("brush", 115, 50)

    def wet(y):
        return y + rain(y.shape[1], loudness(y) - 13)
    return s.render("cafe_night", night, post=wet)


# ====================================================================== more of the same set: a tune is data
# Each further track is a spec: progressions per section, the form, an arrangement per section and the leads.
# arr keys: comp (style or list cycled by bar), cv (comp velocity), bass (style or list), wait (bars before the
# bass), slide, strings (velocity), gtr (stabs), drums (pattern or list), dwait (bars before drums), fill,
# dv (drum velocity), crash, end_root (last bar of the section holds the root).

def tune(s, spec):
    F = spec["form"]
    n = len(F)
    first, size = {}, {}
    for i, (_, sec) in enumerate(F):
        first.setdefault(sec, i + 1)
        size[sec] = size.get(sec, 0) + 1
    pick = lambda v, k: v[k % len(v)] if isinstance(v, (list, tuple)) else v
    for i, (chords, sec) in enumerate(F):
        bar = i + 1
        k = bar - first[sec]
        last = k == size[sec] - 1
        arr = spec["arr"][sec]
        nxt = F[(i + 1) % n][0][0][0]
        beat = 0.0
        for j, (sym, beats) in enumerate(chords):
            after = chords[j + 1][0] if j + 1 < len(chords) else nxt
            s.comp("rhodes", bar, sym, beat, beats, pick(arr.get("comp", "a"), k), vel=arr.get("cv", 62))
            if k >= arr.get("wait", 0):
                style = "root" if last and arr.get("end_root") else pick(arr.get("bass", "groove"), k)
                s.bass("bass", bar, sym, after, beat, beats, style, vel=spec.get("bv", 92),
                       slide=arr.get("slide", False) and j == 0 and k % 2 == 0)
            if arr.get("strings"):
                s.strings("str", bar, sym, beat, beats, vel=arr["strings"])
            if arr.get("gtr"):
                s.stab("gtr", bar, sym, beat + (1.5 if beats >= 4 else 0.5), vel=66)
                if beats >= 4:
                    s.stab("gtr", bar, sym, beat + 3, vel=56, dur=0.2)
            beat += beats
        if k >= arr.get("dwait", 0) and arr.get("drums"):
            s.drums(bar, arr["fill"] if last and arr.get("fill") else pick(arr["drums"], k), vel=arr.get("dv", 92))
        if k == 0 and arr.get("crash"):
            s.drums(bar, {"crash": "x..............."}, vel=60)
    for sec, (part, mel, vel, octave, scoop, stacc) in spec["leads"].items():
        for j, m in enumerate(mel):
            s.mel(part, first[sec] + j, m, vel, octave=octave, scoop=scoop, stacc=stacc)
    for part, sec, j, notes, vel in spec.get("answers", []):          # short replies at phrase ends
        s.mel(part, first[sec] + j, notes, vel, scoop=False, stacc=0.6)
    for sec, v0, v1 in spec.get("swells", []):
        a, b = first[sec], first[sec] + size[sec]
        s.s.swell("str", s.t(a), s.t(a + 2), v0, v1)
        s.s.swell("str", s.t(b - 2), s.t(b), v1, v0)


def build(name, spec):
    s = Song(spec["bpm"], spec["form"], swing=spec["swing"], seed=spec["seed"])
    for p in spec["parts"]:
        s.part(*p)
    s.s.kit(*spec["kit"])
    post = (lambda y: y + rain(y.shape[1], loudness(y) - 13)) if spec.get("rain") else None
    return s.render(name, lambda song, p: tune(song, spec), post=post)


DAY_PARTS = [("rhodes", "rhodes", 104, 52, 56, 40), ("bass", "fingerbass", 92, 64, 12, 0),
             ("sax", "tenorsax", 100, 74, 64, 12), ("solo", "rhodes", 127, 82, 70, 50),
             ("vibes", "vibes", 110, 84, 70, 20), ("gtr", "cleangtr", 100, 96, 50, 30),
             ("str", "slowstr", 110, 36, 90, 20)]
NIGHT_PARTS = [("rhodes", "rhodes", 104, 54, 70, 40), ("bass", "fretless", 92, 64, 20, 0),
               ("sax", "tenorsax", 98, 72, 80, 12), ("vibes", "vibes", 110, 84, 84, 20),
               ("str", "slowstr", 110, 40, 96, 20)]
INTRO = {"comp": "b", "cv": 60, "bass": "long", "wait": 2, "dwait": 0,
         "drums": [{"rim": "....x.......x...", "hat": "x.xox.xox.xox.xo"}] * 2 +
                  [{"kick": "X.........x.....", "rim": "....x.......x...", "hat": "x.xox.xox.xox.xo"}] * 2}
OUTRO = {"comp": "b", "cv": 60, "bass": "long", "end_root": True,
         "drums": {"kick": "X.........x.....", "rim": "....x.......x...", "hat": "x.xox.xox.xox.xo"}, "dv": 84}

# ---------------------------------------------------------------- afternoon: G dorian, 84 bpm, a little busier
AFT = {"intro": parse("Gm9 | C9 | Gm9 | C9"),
       "A": parse("Gm9 | C9 | Gm9 | C9 | Ebmaj9 | D7#9 | Gm9 | Am7b5 D7b9"),
       "B": parse("Cm9 | F13 | Bbmaj9 | Ebmaj9 | Am7b5 | D7b9 | Gm9 | D7sus D7#9"),
       "C": parse("Gm9 | C9 | Gm9 | C9 | Ebmaj9 | D7#9 | Gm9 | D7#9"),
       "outro": parse("Gm9 | C9 | Gm9 | D7sus D7#9")}
AFT_A = ["R:.5 D5:.5 F5:.5 G5:.5 A5:.75 G5:.25 F5:1", "E5:1.5 D5:.5 C5:.5 Bb4:.5 C5:1",
         "R:.5 G4:.5 Bb4:.5 D5:.5 F5:1 E5:.5 D5:.5", "E5:2 G5:1 R:1",
         "R:.5 Bb4:.5 D5:.5 F5:.5 G5:1.5 F5:.5", "F5:1 D5:.5 C5:.5 A4:1.5 R:.5",
         "R:.5 Bb4:.25 C5:.25 D5:.5 F5:.5 A5:1 G5:1", "Eb5:1 C5:1 F#5:1.5 R:.5"]
AFT_A2 = ["R:.5 D5:.5 F5:.5 G5:.5 A5:.75 Bb5:.25 A5:1", "G5:1 E5:.5 D5:.5 E5:1.5 R:.5",
          "R:.5 Bb5:.5 A5:.5 G5:.5 F5:1 D5:1", "E5:.75 F5:.25 E5:.5 D5:.5 C5:2",
          "R:.5 G5:.5 Bb5:.5 D6:.5 C6:1 Bb5:1", "A5:1.5 F5:.5 C5:1 A4:1",
          "G4:2 R:.5 A4:.25 Bb4:.25 D5:1", "C5:1 Eb5:1 D5:2"]
AFT_B = ["R:.5 G5:.5 Eb5:.5 C5:.5 D5:2", "R:.5 A4:.5 C5:.5 Eb5:.5 D5:1.5 C5:.5",
         "D5:1.5 F5:.5 A5:2", "G5:1 F5:.5 D5:.5 Bb4:2",
         "R:.5 C5:.5 Eb5:.5 G5:.5 F5:1 Eb5:1", "D5:.5 Eb5:.5 F#5:.5 A5:.5 C6:2",
         "Bb5:1.5 A5:.5 G5:1 F5:1", "G5:1.5 F5:.5 F#5:1 R:1"]
AFT_SOLO = ["R:1 D5:.25 F5:.25 G5:.5 Bb5:.5 A5:.5 G5:1", "E5:.5 G5:.5 Bb5:1 A5:.5 G5:.5 E5:1",
            "R:.5 F5:.5 D5:.5 F5:.5 G5:2", "R:1 Bb5:.5 A5:.5 G5:.5 E5:.5 D5:1",
            "R:.5 Bb5:.25 C6:.25 D6:1 Bb5:.5 G5:.5 F5:1", "F5:.75 F#5:.25 A5:.5 C6:.5 R:2",
            "R:.5 A5:.5 Bb5:.5 A5:.5 G5:1 D5:1", "F#5:1 A5:1 R:2"]
GROOVE = {"kick": "X..x......x..x..", "snare": "....X.......X...", "hat": "x.xox.xox.xox.xo", "tamb": "....x.......x..."}
GROOVE2 = {"kick": "X..x......x.....", "snare": "....X..o....X..o", "hat": "x.xox.xox.xox.x.", "tamb": "....x.......x..."}
AFTERNOON = {
    "bpm": 84, "swing": 0.05, "seed": 23, "parts": DAY_PARTS, "kit": ("standard", 100, 30),
    "form": form(["intro", "A", "B", "A'", "C", "B'", "outro"], AFT),
    "arr": {"intro": INTRO, "outro": OUTRO,
            "A": {"comp": "c", "drums": [GROOVE, GROOVE, GROOVE, GROOVE2], "fill": FILL, "crash": True},
            "B": {"comp": "a", "bass": "walk", "strings": 50, "drums": GROOVE, "fill": FILL, "crash": True,
                  "slide": True},
            "A'": {"comp": "c", "gtr": True, "drums": [GROOVE, GROOVE2], "fill": FILL},
            "C": {"comp": "c", "bass": ["groove", "walk"], "gtr": True,
                  "drums": [GROOVE, dict(GROOVE2, ride="x...x...x...x...")], "dv": 92},
            "B'": {"comp": "a", "bass": "walk", "strings": 46, "gtr": True, "drums": GROOVE, "fill": FILL,
                   "crash": True}},
    "leads": {"A": ("sax", AFT_A, 88, 0, True, 0.96), "B": ("sax", AFT_B, 94, 0, True, 0.96),
              "A'": ("sax", AFT_A2, 90, 0, True, 0.96), "C": ("solo", AFT_SOLO, 70, 0, False, 0.85),
              "B'": ("sax", AFT_B, 92, 0, True, 0.96)},
    "answers": [("gtr", "A", 7, "R:2.5 G5:.25 A5:.25 D6:1", 58), ("gtr", "B'", 7, "R:2 D6:.5 C6:.25 A5:.25 G5:1", 58)],
    "swells": [("B", 70, 110), ("B'", 64, 100)],
}

# ---------------------------------------------------------------- morning: A minor, 72 bpm, vibes then sax
MOR = {"intro": parse("Am9 | Fmaj9 | Am9 | Fmaj9 E7#9"),
       "A": parse("Am9 | Dm9 G13 | Cmaj9 | Fmaj9 | Bm7b5 | E7b9 | Am9 | Fmaj9 E7#9"),
       "B": parse("Dm9 | G13 | Cmaj9 | Am9 | Dm9 | G13 | Fmaj9 | E7sus E7b9"),
       "outro": parse("Am9 | Fmaj9 | Am9 | Fmaj9 E7#9")}
MOR_A = ["R:1 E5:.5 G5:.5 A5:1 B5:.5 C6:.5", "A5:1 F5:.5 D5:.5 E5:.75 F5:.25 E5:.5 D5:.5",
         "E5:2 D5:.5 B4:.5 G4:1", "A4:1.5 C5:.5 E5:1 G5:1",
         "R:.5 F5:.5 D5:.5 B4:.5 A5:1.5 F5:.5", "G#5:1 F5:.5 E5:.5 D5:1 B4:1",
         "C5:1.5 B4:.5 A4:2", "R:1 A4:.5 C5:.5 G#4:.5 B4:.5 D5:1"]
MOR_A2 = ["R:.5 A4:.5 C5:.5 E5:.5 G5:1 E5:1", "F5:1.5 A5:.5 G5:1 F5:1",
          "E5:.75 D5:.25 E5:.5 G5:.5 B5:2", "A5:1 G5:.5 E5:.5 C5:2",
          "R:.5 B4:.5 D5:.5 F5:.5 A5:1 F5:1", "E5:1 G#5:1 B5:1.5 R:.5",
          "A5:1 C6:.5 B5:.5 A5:2", "R:2 E5:.5 D5:.5 B4:1"]
MOR_B = ["R:.5 A4:.5 D5:.5 F5:.5 E5:2", "D5:1 F5:.5 E5:.5 B4:2",
         "R:.5 G5:.5 E5:.5 D5:.5 E5:1 G5:1", "B5:1.5 A5:.5 E5:2",
         "R:.5 C6:.5 A5:.5 F5:.5 E5:1 D5:1", "E5:.75 F5:.25 E5:.5 D5:.5 B4:2",
         "C5:1 E5:.5 G5:.5 A5:2", "A5:1.5 G#5:.5 F5:1 R:1"]
SOFT = {"kick": "X.......x.x.....", "rim": "....x.......x...", "hat": "x.x.x.x.x.x.x.x.", "shaker": "xoxoxoxoxoxoxoxo"}
SOFT_SN = {"kick": "X.......x.x.....", "snare": "....x.......x...", "hat": "x.xox.xox.xox.xo", "shaker": "xoxoxoxoxoxoxoxo"}
MORNING = {
    "bpm": 72, "swing": 0.04, "seed": 31, "parts": DAY_PARTS, "kit": ("standard", 96, 36),
    "form": form(["intro", "A", "A'", "B", "A''", "outro"], MOR),
    "arr": {"intro": INTRO, "outro": OUTRO,
            "A": {"comp": ["a", "b"], "bass": "long", "drums": SOFT, "dv": 86},
            "A'": {"comp": "c", "drums": SOFT_SN, "fill": FILL, "crash": True},
            "B": {"comp": "a", "bass": "long", "strings": 52, "drums": SOFT_SN, "fill": FILL, "slide": True},
            "A''": {"comp": "c", "gtr": True, "strings": 40, "drums": [SOFT, SOFT_SN], "dv": 88}},
    "leads": {"A": ("vibes", MOR_A, 74, 0, False, 0.85), "A'": ("sax", MOR_A2, 88, 0, True, 0.96),
              "B": ("sax", MOR_B, 92, 0, True, 0.96), "A''": ("vibes", MOR_A, 76, 0, False, 0.85)},
    "answers": [("gtr", "A'", 7, "R:2 A5:.25 C6:.25 E6:.5 D6:1", 56)],
    "swells": [("B", 66, 108)],
}

# ---------------------------------------------------------------- last call: F minor, 64 bpm, rain
LAST = {"intro": parse("Fm9 | Dbmaj9 | Fm9 | C7sus C7b9"),
        "A": parse("Fm9 | Ebm9 Ab13 | Dbmaj9 | Gm7b5 C7#9 | Fm9 | Bbm9 | Dbmaj9 | C7sus C7b9"),
        "B": parse("Bbm9 | Bbm9 | Fm9 | Fm9 | Dbmaj9 | Gm7b5 | C7sus | C7b9"),
        "outro": parse("Fm9 | Dbmaj9 | Fm9 | C7sus C7b9")}
LAST_A = ["R:1 C5:.5 Eb5:.5 F5:1 G5:.5 Ab5:.5", "Gb5:1 F5:.5 Db5:.5 C5:1.5 R:.5",
          "R:.5 Ab4:.5 C5:.5 Eb5:.5 F5:2", "Db5:1 Bb4:1 E5:1 Eb5:1",
          "C5:1.5 Ab4:.5 G4:1 F4:1", "R:.5 F4:.5 Ab4:.5 Db5:.5 C5:2",
          "Eb5:1 F5:.5 Ab5:.5 G5:1 F5:1", "F5:1.5 E5:.5 Db5:1 R:1"]
LAST_B = ["R:.5 F5:.5 Ab5:.5 C6:.5 Bb5:2", "Ab5:1 F5:.5 Db5:.5 C5:2",
          "R:.5 Eb5:.5 F5:.5 Ab5:.5 G5:1.5 F5:.5", "Eb5:1 C5:1 R:2",
          "R:.5 Db5:.5 F5:.5 Ab5:.5 C6:2", "Bb5:1 Ab5:.5 F5:.5 Db5:2",
          "F5:1.5 G5:.5 Bb5:2", "Ab5:1 G5:.5 E5:.5 Db5:1 R:1"]
BRUSH2 = {"kick": "X.........x.....", "snare": "....x.......x...", "swirl": "x.......x.......",
          "hat": "..x...x...x...x."}
HUSH = {"swirl": "x.......x.......", "snare": "....x.......x..."}
LAST_CALL = {
    "bpm": 64, "swing": 0.06, "seed": 41, "parts": NIGHT_PARTS, "kit": ("brush", 115, 50), "rain": True,
    "bv": 88,
    "form": form(["intro", "A", "B", "A'", "outro"], LAST),
    "arr": {"intro": {"comp": "b", "cv": 54, "bass": "long", "wait": 2, "dwait": 2, "drums": HUSH, "dv": 96},
            "A": {"comp": ["a", "b"], "cv": 58, "bass": "long", "slide": True, "drums": BRUSH2, "dv": 96},
            "B": {"comp": ["b", "a"], "cv": 58, "bass": "long", "slide": True, "strings": 46, "drums": BRUSH2,
                  "dv": 96},
            "A'": {"comp": ["a", "b"], "cv": 58, "bass": "long", "strings": 38, "drums": BRUSH2, "dv": 96},
            "outro": {"comp": "b", "cv": 54, "bass": "long", "end_root": True, "drums": HUSH, "dv": 96}},
    "leads": {"A": ("sax", LAST_A, 82, 0, True, 0.96), "B": ("sax", LAST_B, 86, 0, True, 0.96),
              "A'": ("vibes", LAST_A, 58, 12, False, 0.8)},
    "swells": [("B", 64, 104)],
}

SPECS = {"cafe_day2": AFTERNOON, "cafe_day3": MORNING, "cafe_night2": LAST_CALL}
TRACKS = {"cafe_day": make_day, "cafe_night": make_night,
          **{k: (lambda k=k: build(k, SPECS[k])) for k in SPECS}}


def stems(name, tracks=None):
    """Render each part alone and print its loudness, as a stand-in for listening to the balance."""
    import copy, mido
    song = tracks or TRACKS
    built = {}

    class Grab(Exception):
        pass

    def catch(self, name_, compose, **kw):
        for p in range(2):
            self.off = p * self.length
            compose(self, p)
        built["s"] = self
        raise Grab()
    orig = Song.render
    Song.render = catch
    try:
        song[name]()
    except Grab:
        pass
    finally:
        Song.render = orig
    s = built["s"]
    chans = dict((ch, nm) for nm, ch in s.s.parts.items())
    chans[9] = "drums"
    for ch, nm in sorted(chans.items()):
        sc = copy.copy(s.s)
        sc.ev = [e for e in s.s.ev if not (e[2].type == "note_on" and e[2].channel != ch)]
        y = sc.render(os.path.join(BUILD, f"{name}_stem_{nm}.wav"), 0.55)
        print(f"  {nm:8s} {loudness(y):6.1f} LUFS  peak {np.abs(y).max():.3f}")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    names = args or list(TRACKS)
    for n in names:
        if "--stems" in sys.argv:
            print(n)
            stems(n)
            continue
        audio, loop = TRACKS[n]()
        print(n, export(n, audio, loop))
    if "--stems" not in sys.argv:
        finish()
