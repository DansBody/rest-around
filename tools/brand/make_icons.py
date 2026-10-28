"""Render the app icons into assets/brand/.

    python tools/brand/make_icons.py

The big ones (512, 192, the 180 Apple touch icon) come from tools/brand/icon.html, rendered at 6x in headless
Chrome (or Edge; CHROME=<path> picks one) and scaled down; iOS and Android round the corners themselves, so the
square is filled edge to edge. The 32 and 48 favicons are too small for the window: they are the pixel cup drawn
pixel for pixel (2x and 3x) on denim.
"""
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'assets' / 'brand'
SCALE = 6

CUP = ['...s..s..s......', '....s..s..s.....', '...s..s..s......', '................',
       '.##########.....', '.#oooooooo#####.', '.#cccccccc#ooo#.', '.#cccccccc#o.o#.',
       '.#cccccccc#ooo#.', '.#cccccccc####..', '..#cccccc#......', '...######.......',
       '..##########....', '.############...']
COLOURS = {'#': (31, 42, 74), 'o': (255, 255, 255), 'c': (63, 93, 170), 's': (184, 203, 240)}
DENIM = (63, 93, 170)


def browser():
    for p in [os.environ.get('CHROME'), 'C:/Program Files/Google/Chrome/Application/chrome.exe',
              'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', shutil.which('google-chrome'), shutil.which('chromium')]:
        if p and Path(p).exists():
            return p
    raise SystemExit('No Chrome or Edge found: set CHROME=<path>')


def render_big():
    with tempfile.TemporaryDirectory() as tmp:
        shot = Path(tmp) / 'icon.png'
        # a window wider than Chrome's minimum; the icon sits in its top-left 180x180
        subprocess.run([browser(), '--headless=new', '--disable-gpu', '--hide-scrollbars', f'--user-data-dir={tmp}/p',
                        f'--force-device-scale-factor={SCALE}', '--window-size=500,400', '--virtual-time-budget=3000',
                        f'--screenshot={shot}', (ROOT / 'tools' / 'brand' / 'icon.html').as_uri()],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        big = Image.open(shot).convert('RGB').crop((0, 0, 180 * SCALE, 180 * SCALE))
    for name, size in [('icon-512.png', 512), ('icon-192.png', 192), ('apple-touch-icon.png', 180)]:
        big.resize((size, size), Image.LANCZOS).save(OUT / name, optimize=True)
        print('wrote', name)


def render_pixel(size, k):
    img = Image.new('RGB', (size, size), DENIM)
    ox, oy = (size - 16 * k) // 2, (size - 14 * k) // 2
    for y, row in enumerate(CUP):
        for x, ch in enumerate(row):
            if ch in COLOURS:
                img.paste(COLOURS[ch], (ox + x * k, oy + y * k, ox + (x + 1) * k, oy + (y + 1) * k))
    return img


if __name__ == '__main__':
    render_big()
    for size, k in [(32, 2), (48, 3)]:
        render_pixel(size, k).save(OUT / f'favicon-{size}.png', optimize=True)
        print(f'wrote favicon-{size}.png')
