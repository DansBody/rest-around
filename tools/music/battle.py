# -*- coding: utf-8 -*-
"""Refillit's battle music: hip-hop rock in the vein of Persona 3's battle theme, on the café's pipeline
(cafe.py's Song on orch.Score, FluidSynth + GeneralUser GS). There are no voices: the rapped verse is a
piano line that keeps a rapper's flow (few pitches, syncopated 16ths), and the sung hook is an overdriven
guitar lead, joined by the café's tenor sax the second time round.

  battle  E minor, 128 bpm, 52 bars: riff · verse · pre · hook · riff · verse' · pre · hook' · break
The loop starts on the full riff, so a fight opens at full tilt; the break winds down and builds back into it.

All melodies, riffs and progressions are original.

usage: python tools/music/battle.py [track ...] [--stems]
"""
import os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import orch  # noqa: E402
from cafe import Song, chord, form, parse, stems  # noqa: E402
from common import export, finish  # noqa: E402

PROG = {"riff": parse("Em9 | Em9 | Em9 | Em9"),
        "verse": parse("Em9 | Em9 | Cmaj9 | B7#9 | Em9 | Em9 | Cmaj9 | B7#9"),
        "pre": parse("Am9 | Am9 | Cmaj9 | B7sus B7#9"),
        "hook": parse("Cmaj9 | D13 | Bm9 | Em9 | Am9 | D13 | Gmaj9 | B7#9"),
        "break": parse("Em9 | Em9 | Em9 | B7#9")}
FORM = form(["riff", "verse", "pre", "hook", "riff'", "verse'", "pre'", "hook'", "break"], PROG)

# the riff: power chords, doubled an octave down by the bass
RIFF = ["E2:.75 E2:.25 R:.25 E2:.25 G2:.5 A2:.5 R:.25 A2:.25 Bb2:.25 B2:.75",
        "E2:.75 E2:.25 R:.25 E2:.25 D3:.5 C3:.5 R:.25 B2:.75 G2:.5"]
# the rapped verse, on piano
FLOW = ["R:.5 E4:.25 E4:.25 G4:.25 E4:.25 R:.25 E4:.25 A4:.5 G4:.25 E4:.25 D4:.5 E4:.5",
        "R:.25 B4:.25 B4:.25 A4:.25 G4:.5 E4:.25 G4:.25 R:.5 A4:.25 B4:.25 D5:.5 B4:.5",
        "R:.5 G4:.25 G4:.25 E4:.25 G4:.25 R:.25 B4:.25 C5:.5 B4:.25 G4:.25 E4:.5 G4:.5",
        "F#4:.5 R:.25 F#4:.25 A4:.25 F#4:.25 D#4:.5 B3:.25 D#4:.25 F#4:.25 A4:.25 B4:1",
        "R:.5 E4:.25 G4:.25 B4:.25 G4:.25 R:.25 E4:.25 B4:.5 A4:.25 G4:.25 E4:.5 G4:.5",
        "R:.25 B4:.25 B4:.25 A4:.25 G4:.5 E4:.25 G4:.25 R:.5 A4:.25 B4:.25 D5:.5 B4:.5",
        "R:.25 E5:.25 E5:.25 D5:.25 C5:.5 B4:.25 G4:.25 R:.5 E4:.25 G4:.25 C5:.5 B4:.5",
        "A4:.5 R:.25 F#4:.25 A4:.25 B4:.25 D#5:.5 R:.5 F#4:.25 A4:.25 B4:1"]
PRE = ["A4:.5 A4:.5 R:.25 A4:.25 C5:.5 E5:.5 D5:.25 C5:.25 A4:1",
       "R:.5 G4:.5 A4:.5 C5:.5 E5:.5 G5:.5 E5:1",
       "E5:.5 E5:.5 R:.25 D5:.25 E5:.5 G5:.5 B5:.5 G5:.5 E5:.5",
       "F#5:.5 F#5:.5 F#5:.5 E5:.5 D#5:.5 F#5:.5 A5:.5 B5:.5"]
# the sung hook, on overdriven guitar
HOOK = ["R:.5 G5:.5 B5:1 A5:.5 G5:.5 E5:1", "F#5:1.5 E5:.5 D5:.5 E5:.5 F#5:1",
        "R:.5 F#5:.5 A5:.5 B5:1.5 A5:.5 F#5:.5", "G5:2 R:.5 E5:.5 G5:.5 A5:.5",
        "R:.5 A5:.5 C6:1 B5:.5 A5:.5 G5:1", "F#5:1 A5:.5 F#5:.5 E5:.5 D5:.5 E5:1",
        "R:.5 D5:.5 G5:.5 B5:.5 D6:1.5 B5:.5", "A5:1 G5:.5 F#5:.5 D#5:2"]

RIFF_D = {"kick": "X..X..X...X.X...", "snare": "....X.......X...", "hat": "x.x.x.x.x.x.x.x."}
VERSE_D = {"kick": "X.....x.x.X.....", "snare": "....X..o.o..X..o", "hat": "xoxoxoxoxoxoxoxo"}
VERSE_D2 = {"kick": "X.....x...X..x..", "snare": "....X..o....X.oo", "hat": "xoxoxoxoxoxoxox.", "ohat": "..............x."}
HOOK_D = {"kick": "X.....x.X.X.....", "snare": "....X.......X...", "hat": "x...x...x...x...",
          "ohat": "..x...x...x...x.", "tamb": "....x.......x..."}
FILL_D = {"kick": "X.....x.........", "snare": "....X...xoxoXxXX", "hat": "x.x.x.x........."}
BUILD_D = {"kick": "X...X...X...X...", "snare": "x.x.x.x.xxxxXXXX"}

CHUG = "X..x..x...x.x..."      # palm-muted power chords under the verse, on the riff's accents
DRIVE = "X.x.x.x.x.X.x.x."     # open power chords under the hook
VBASS = "r..r..8.r..r5.8a"     # 16th grid: r root · 8 octave · 5 fifth · a a half step into the next root
HBASS = "r.r.r.r8r.r.r.5a"


def root(sym, low):
    pc, _ = chord(sym)
    return low + (pc - low) % 12


def power(s, bar, beat, beats, p, vel, mute):
    """One power chord (root, fifth, octave) on both rhythm guitars, the right one a hair late."""
    for part, late in (("gtrL", 0.0), ("gtrR", 0.009)):
        a = s.t(bar, beat) + late + s.hum(3)
        d = beats * s.beat * (0.55 if mute else 0.92)
        for q in (0, 7, 12):
            s.s.note(part, a, max(0.04, d), p + q, vel * (0.92 if q else 1.0) + s.rng.uniform(-4, 4))


def riff(s, bar, toks, vel=104):
    b = 0.0
    for tok in toks.split():
        nm, d = tok.split(":")
        d = float(d)
        if nm != "R":
            p = orch.midi_num(nm)
            power(s, bar, b, d, p, vel, mute=d < 0.5)
            s.note("bass", bar, b, d * 0.9, p - 12, 100, ms=3)
        b += d


def grid(s, bar, pattern, sym, nxt, vel=96):
    """Bass on a 16th grid, each note held until the next one."""
    r, n = root(sym, 28), root(nxt, 28)
    deg = {"r": r, "8": r + 12, "5": r + 7, "a": n - 1 if n > r else n + 1}
    hits = [i for i, c in enumerate(pattern) if c != "."]
    for j, i in enumerate(hits):
        gap = ((hits[j + 1] if j + 1 < len(hits) else 16) - i) / 4
        s.note("bass", bar, i / 4, gap * 0.85, deg[pattern[i]], vel * (1.0 if i % 4 == 0 else 0.85), ms=3)


def strum(s, bar, pattern, sym, vel, mute):
    p = root(sym, 40)
    for i, c in enumerate(pattern):
        if c != ".":
            power(s, bar, i / 4, 0.5 if not mute else 0.25, p, vel * (1.0 if c == "X" else 0.8), mute)


def battle(s, p):
    n = len(FORM)
    first = {}
    for i, (chords, sec) in enumerate(FORM):
        bar = i + 1
        first.setdefault(sec, bar)
        k = bar - first[sec]
        nxt = FORM[(i + 1) % n][0][0][0]
        sym = chords[0][0]
        base = sec.rstrip("'")
        if base == "riff":
            riff(s, bar, RIFF[k % 2])
            s.drums(bar, FILL_D if k == 3 else RIFF_D, vel=100)
            if k == 0:
                s.drums(bar, {"crash": "x..............."}, vel=90)
                s.s.note("hit", s.t(bar), 0.5, 64, 70)
        elif base == "verse":
            strum(s, bar, CHUG, sym, 74, mute=True)
            grid(s, bar, VBASS, sym, nxt)
            s.drums(bar, VERSE_D2 if k % 4 == 3 else VERSE_D, vel=96)
            s.mel("keys", bar, FLOW[k], 100 if sec == "verse" else 104, scoop=False, stacc=0.55)
            if sec == "verse'":                                       # the octave above joins the second time
                s.mel("keys", bar, FLOW[k], 70, octave=12, scoop=False, stacc=0.55)
            if k in (0, 4):
                s.drums(bar, {"crash": "x..............."}, vel=60)
        elif base == "pre":
            beat = 0.0
            for c, beats in chords:
                s.strings("str", bar, c, beat, beats, vel=60)
                beat += beats
            strum(s, bar, "x.x.x.x.x.x.x.x.", sym, 70 + 6 * k, mute=True)
            grid(s, bar, HBASS, sym, nxt)
            s.drums(bar, BUILD_D if k == 3 else VERSE_D, vel=96)
            s.mel("keys", bar, PRE[k], 104, scoop=False, stacc=0.55)
        elif base == "hook":
            beat = 0.0
            for c, beats in chords:
                s.strings("str", bar, c, beat, beats, vel=56)
                s.comp("keys", bar, c, beat, beats, "c", vel=70)
                s.stab("brass", bar, c, beat + 1.5, vel=72, dur=0.35)
                s.stab("brass", bar, c, beat + 3.5, vel=64, dur=0.25)
                beat += beats
            strum(s, bar, DRIVE, sym, 80, mute=False)
            grid(s, bar, HBASS, sym, nxt, vel=100)
            s.drums(bar, FILL_D if k == 7 else HOOK_D, vel=100)
            if k in (0, 4):
                s.drums(bar, {"crash": "x..............."}, vel=96)
            if k == 0:
                s.s.note("hit", s.t(bar), 0.5, 64, 80)
        else:                                                         # break: the riff thins out, then builds back
            if k < 2:
                riff(s, bar, RIFF[k], vel=92)
                s.drums(bar, {"hat": "x.x.x.x.x.x.x.x."}, vel=88)
            elif k == 2:
                riff(s, bar, RIFF[0], vel=98)
                s.drums(bar, {"kick": "X..X..X...X.X...", "hat": "x.x.x.x.x.x.x.x."}, vel=94)
            else:
                strum(s, bar, "x.x.x.x.xxxxXXXX", sym, 84, mute=True)
                s.note("bass", bar, 0, 3.8, root(sym, 28), 96)
                s.drums(bar, BUILD_D, vel=100)
    for j in range(8):
        s.mel("lead", first["hook"] + j, HOOK[j], 100)
        s.mel("lead", first["hook'"] + j, HOOK[j], 102)
        s.mel("sax", first["hook'"] + j, HOOK[j], 84, octave=-12)
    # the sax answers the piano at the ends of the second verse's phrases
    s.mel("sax", first["verse'"] + 3, "R:2 B4:.25 D5:.25 E5:.5 G5:1", 82, octave=-12)
    s.mel("sax", first["verse'"] + 7, "R:2.5 F#5:.25 A5:.25 B5:1", 84, octave=-12)
    for sec in ("pre", "pre'"):
        s.s.swell("str", s.t(first[sec]), s.t(first[sec] + 4), 50, 118)
    for sec in ("hook", "hook'"):
        s.s.swell("str", s.t(first[sec]), s.t(first[sec] + 1), 118, 96)


def make_battle():
    s = Song(128, FORM, swing=0.03, seed=53)
    s.part("gtrL", "distgtr", 96, 20, 20, 0)
    s.part("gtrR", "distgtr", 96, 108, 20, 0)
    s.part("bass", "pickbass", 120, 64, 8, 0)
    s.part("keys", "piano", 120, 70, 36, 10)
    s.part("lead", "overdrive", 86, 56, 60, 30)
    s.part("sax", "tenorsax", 104, 78, 60, 12)
    s.part("str", "strings", 120, 40, 70, 20)
    s.part("brass", "brass", 106, 84, 50, 10)
    s.part("hit", "orchhit", 80, 64, 70, 0)
    s.s.kit("standard", 110, 24)
    return s.render("battle", battle, tail=3.0)


TRACKS = {"battle": make_battle}

if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    for n in args or list(TRACKS):
        if "--stems" in sys.argv:
            print(n)
            stems(n, TRACKS)
            continue
        audio, loop = TRACKS[n]()
        print(n, export(n, audio, loop))
    if "--stems" not in sys.argv:
        finish()
