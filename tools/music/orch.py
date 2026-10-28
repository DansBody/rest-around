# -*- coding: utf-8 -*-
"""Score engine (from miffy-adventure's ep3/orch.py): write multi-part MIDI with mido, render it through
FluidSynth with the GeneralUser GS soundfont, and return a stereo float array ready to mix.

Times are in seconds; notes use the token syntax "C5:.5 E5+G5:1 R:.5" (chord with +, duration in beats).
FluidSynth and the 32 MB soundfont are not copied into this repo: they are read from the miffy-adventure
checkout, or from the paths in the FLUIDSYNTH / SOUNDFONT environment variables.
"""
import os, subprocess, wave
import numpy as np
import mido

MIFFY = os.path.join(os.path.expanduser("~"), "coding project", "miffy-adventure", "tools")
FS = os.environ.get("FLUIDSYNTH") or os.path.join(MIFFY, "fluidsynth", "fluidsynth-v2.6.1-win10-x64-cpp11", "bin",
                                                   "fluidsynth.exe")
SF2 = os.environ.get("SOUNDFONT") or os.path.join(MIFFY, "GeneralUser-GS.sf2")
SR = 44100
PPQ = 480
TPS = PPQ * 2  # ticks per second at the fixed 120 bpm MIDI tempo

# General MIDI programs we use
GM = {"piano": 0, "rhodes": 4, "fmpiano": 5, "vibes": 11, "organ": 16, "nylon": 24, "jazzgtr": 26,
      "cleangtr": 27, "mutedgtr": 28, "overdrive": 29, "distgtr": 30, "pickbass": 34, "slapbass": 36,
      "orchhit": 55, "brass": 61, "acbass": 32, "fingerbass": 33, "fretless": 35, "strings": 48,
      "slowstr": 49, "synthstr": 50, "choir": 52, "trumpet": 56, "mutetpt": 59, "horn": 60, "altosax": 65,
      "tenorsax": 66, "flute": 73, "pad": 89, "warmpad": 89, "fifths": 96}
# GS drum kits (program on channel 10)
KIT = {"standard": 0, "room": 8, "jazz": 32, "brush": 40}
NOTE = {"C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5, "F#": 6, "Gb": 6, "G": 7,
        "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11}
DRUM = {"kick": 36, "snare": 38, "rim": 37, "clap": 39, "swirl": 40, "hat": 42, "phat": 44, "ohat": 46,
        "crash": 49, "ride": 51, "bell": 53, "tom1": 50, "tom2": 47, "tom3": 43, "tamb": 54, "shaker": 82,
        "cabasa": 69, "tri": 81, "snap": 39}


def midi_num(n):
    return 12 * (int(n[-1]) + 1) + NOTE[n[:-1]]


class Score:
    def __init__(self):
        self.parts = {}   # name -> channel
        self.ev = []      # (tick, order, msg)
        self.next_ch = 0

    def part(self, name, inst, vol=100, pan=64, rev=50, chorus=10):
        ch = self.next_ch
        if ch == 9:
            ch += 1
        self.next_ch = ch + 1
        self.parts[name] = ch
        for cc, v in ((7, vol), (10, pan), (91, rev), (93, chorus)):
            self.ev.append((0, 0, mido.Message("control_change", channel=ch, control=cc, value=v)))
        self.ev.append((0, 1, mido.Message("program_change", channel=ch, program=GM[inst])))
        return name

    def kit(self, kit, vol=100, rev=40):
        for cc, v in ((7, vol), (91, rev)):
            self.ev.append((0, 0, mido.Message("control_change", channel=9, control=cc, value=v)))
        self.ev.append((0, 1, mido.Message("program_change", channel=9, program=KIT[kit])))

    def cc(self, name, t, control, value):
        self.ev.append((int(t * TPS), 0, mido.Message("control_change", channel=self.parts[name],
                                                      control=control, value=int(max(0, min(127, value))))))

    def bend(self, name, t, value):
        """Pitch wheel, -1..1 of the bend range (±2 semitones by default)."""
        self.ev.append((int(t * TPS), 0, mido.Message("pitchwheel", channel=self.parts[name],
                                                      pitch=int(max(-8192, min(8191, value * 8191))))))

    def swell(self, name, t0, t1, v0, v1, steps=24):
        """Expression (CC11) ramp — crescendo / diminuendo."""
        for i in range(steps + 1):
            f = i / steps
            self.cc(name, t0 + (t1 - t0) * f, 11, v0 + (v1 - v0) * f)

    def note(self, name, t, dur, pitch, vel=90):
        ch = self.parts[name]
        a, b = int(t * TPS), int((t + dur) * TPS)
        self.ev.append((a, 2, mido.Message("note_on", channel=ch, note=int(pitch), velocity=int(max(1, min(127, vel))))))
        self.ev.append((max(a + 1, b), 1, mido.Message("note_off", channel=ch, note=int(pitch), velocity=0)))

    def drum(self, t, kind, vel=100):
        a = int(t * TPS)
        self.ev.append((a, 2, mido.Message("note_on", channel=9, note=DRUM[kind], velocity=int(max(1, min(127, vel))))))
        self.ev.append((a + 60, 1, mido.Message("note_off", channel=9, note=DRUM[kind], velocity=0)))

    def write(self, path):
        mid = mido.MidiFile(ticks_per_beat=PPQ)
        tr = mido.MidiTrack()
        mid.tracks.append(tr)
        tr.append(mido.MetaMessage("set_tempo", tempo=500000, time=0))
        last = 0
        for tick, _, msg in sorted(((max(0, t), o, m) for t, o, m in self.ev), key=lambda e: (e[0], e[1])):
            tr.append(msg.copy(time=tick - last))
            last = tick
        mid.save(path)

    def render(self, path_wav, gain=0.5):
        mid = path_wav.replace(".wav", ".mid")
        self.write(mid)
        subprocess.run([FS, "-ni", "-q", "-g", str(gain), "-r", str(SR), "-F", path_wav, SF2, mid],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return load_wav(path_wav)


def load_wav(path):
    with wave.open(path, "rb") as w:
        n, ch, sw = w.getnframes(), w.getnchannels(), w.getsampwidth()
        raw = w.readframes(n)
    dt = np.int16 if sw == 2 else np.int32
    a = np.frombuffer(raw, dt).astype(np.float64) / (32768.0 if sw == 2 else 2 ** 31)
    return a.reshape(-1, ch).T if ch > 1 else np.vstack([a, a])
