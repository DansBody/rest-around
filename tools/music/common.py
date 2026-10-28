# -*- coding: utf-8 -*-
"""Output step for cafe.py (from miffy-adventure's game/audio/common.py): level to a loudness target,
limit, encode to MP3 into assets/audio/, and record loop points in assets/audio/music.json."""
import json, os, subprocess, wave
import numpy as np
import imageio_ffmpeg

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
BUILD = os.path.join(HERE, "build")
OUT = os.path.join(REPO, "assets", "audio")
META = os.path.join(OUT, "music.json")
SR = 44100
PAD = 0.25            # seconds of wrap-around on each side of a loop (see cafe.py)
FF = imageio_ffmpeg.get_ffmpeg_exe()
BITRATE = "112k"
LUFS = -18.0          # every BGM the same loudness, so switching day ↔ night never jumps
CEIL = 0.84           # -1.5 dBFS sample peak, so the decoded MP3 stays under -1 dBTP
os.makedirs(BUILD, exist_ok=True)
os.makedirs(OUT, exist_ok=True)

try:
    _meta = json.load(open(META, encoding="utf-8"))
except (OSError, ValueError):
    _meta = {}


def _biquad(b, a, x):
    from scipy.signal import lfilter
    return lfilter(b, a, x, axis=-1)


def loudness(x):
    """Integrated loudness (ITU-R BS.1770-4 / EBU R128, LUFS) of (channels, n) audio at SR."""
    x = np.atleast_2d(x)
    # K-weighting: high shelf (+4 dB above ~1.7 kHz), then the RLB high-pass at ~38 Hz
    K = np.tan(np.pi * 1681.974450955533 / SR)
    Vh = 10 ** (3.999843853973347 / 20); Vb = Vh ** 0.4996667741545416; Q = 0.7071752369554196
    a0 = 1 + K / Q + K * K
    y = _biquad([(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0],
                [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0], x)
    K = np.tan(np.pi * 38.13547087602444 / SR); Q = 0.5003270373238773
    a0 = 1 + K / Q + K * K
    y = _biquad([1, -2, 1], [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0], y)
    n, step = int(0.4 * SR), int(0.1 * SR)
    starts = range(0, max(1, y.shape[1] - n + 1), step)
    z = np.array([(y[:, s:s + n] ** 2).mean(1).sum() for s in starts])
    z = z[z > 10 ** ((-70 + 0.691) / 10)]                        # absolute gate
    if not len(z):
        return -70.0
    rel = -0.691 + 10 * np.log10(z.mean()) - 10                   # relative gate
    z = z[-0.691 + 10 * np.log10(z) > rel]
    return float(-0.691 + 10 * np.log10(z.mean()))


def limit(x, ceil=CEIL, knee=0.7):
    """Soft knee above `knee`, never exceeding `ceil`."""
    a = np.abs(x)
    over = a > knee
    y = x.copy()
    y[over] = np.sign(x[over]) * (knee + (ceil - knee) * np.tanh((a[over] - knee) / (ceil - knee)))
    return y


def write_wav(path, x):
    x = np.atleast_2d(x)
    pcm = (np.clip(x, -1, 1).T * 32767).astype(np.int16)
    with wave.open(path, "wb") as w:
        w.setnchannels(x.shape[0])
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def export(name, audio, loop, lufs=LUFS):
    """audio: (2, n) float with PAD of wrap-around on each side of a `loop`-second period."""
    src = np.atleast_2d(np.asarray(audio, np.float64))
    for _ in range(3):                                 # the limiter shaves a little: re-aim a couple of times
        x = limit(src * 10 ** ((lufs - loudness(src)) / 20))
        miss = lufs - loudness(x)
        if abs(miss) < 0.1:
            break
        src = src * 10 ** (miss / 20)
    wav = os.path.join(BUILD, f"{name}.wav")
    write_wav(wav, x)
    mp3 = os.path.join(OUT, f"{name}.mp3")
    subprocess.run([FF, "-y", "-loglevel", "error", "-i", wav, "-c:a", "libmp3lame", "-b:a", BITRATE, mp3],
                   check=True)
    _meta[name] = {"dur": round(x.shape[1] / SR, 4), "loop": [PAD, round(PAD + loop, 5)]}
    return dict(_meta[name], kb=os.path.getsize(mp3) // 1024, peak=round(float(np.abs(x).max()), 3),
                lufs=round(loudness(x), 1))


def finish():
    with open(META, "w", encoding="utf-8") as f:
        json.dump(dict(sorted(_meta.items())), f, ensure_ascii=False, indent=1)
