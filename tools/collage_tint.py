# Refillit OS collage: turn a photo into a tinted, see-through cut-out by its brightness, for the full-cover openings
# (assets/ui/collage/*.webp). collage_cutout.py is for objects on white; this one is for stuff that has no hard edge:
#   light  something bright on black (steam, a strip of paper): its brightness becomes its opacity
#   dark   something dark on white (an ink blot): its darkness becomes its opacity
# The colour is laid on flat, the photo's own shading kept as a light/dark modulation and a halftone dot screen.
#   python tools/collage_tint.py steam.png assets/ui/collage/steam.webp 360 light FFFFFF 4 0.06 0.42
#   python tools/collage_tint.py torn_paper.png (turned upright) assets/ui/collage/paper_denim.webp 600 light 3F5DAA 5 0.12 0.6
#   python tools/collage_tint.py ink.png assets/ui/collage/ink_coral.webp 512 dark E5664A 0 0.1 0.6
# usage: collage_tint.py in.png out.webp width light|dark RRGGBB dot_px [lo] [hi]
import sys
import numpy as np
from PIL import Image

src, dst, W, mode, hexc, dot = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4], sys.argv[5], int(sys.argv[6])
lo = float(sys.argv[7]) if len(sys.argv) > 7 else 0.1
hi = float(sys.argv[8]) if len(sys.argv) > 8 else 0.85

im = Image.open(src).convert('L')
im = im.resize((W, round(im.height * W / im.width)), Image.LANCZOS)
L = np.asarray(im).astype(np.float32) / 255
v = L if mode == 'light' else 1 - L
a = np.clip((v - lo) / (hi - lo), 0, 1)                    # opacity from brightness (or darkness)
# fade out towards the picture's own edges, so nothing ends on a straight cut when the piece is turned
hh, ww = a.shape
ey = np.minimum(np.arange(hh), np.arange(hh)[::-1]) / (0.08 * hh)
ex = np.minimum(np.arange(ww), np.arange(ww)[::-1]) / (0.08 * ww)
a *= np.clip(ey, 0, 1)[:, None] * np.clip(ex, 0, 1)[None, :]
tint = np.array([int(hexc[i:i + 2], 16) for i in (0, 2, 4)], np.float32) / 255

# the photo's own shading inside the shape (creases, folds), stretched over the shape's own range so it shows
inside = a > 0.5
p5, p95 = (np.percentile(v[inside], 5), np.percentile(v[inside], 95)) if inside.any() else (lo, hi)
vv = np.clip((v - p5) / max(1e-3, p95 - p5), 0, 1)
shade = 0.72 + 0.28 * vv
rgb = tint[None, None, :] * shade[..., None]
if dot > 0:   # halftone dots where the shape is thin or in shadow, a darker shade of the same colour
    h, w = L.shape
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    u = (xx + yy) / np.sqrt(2) / dot; q = (xx - yy) / np.sqrt(2) / dot
    d = np.sqrt((u - np.round(u)) ** 2 + (q - np.round(q)) ** 2)
    r = np.sqrt(np.clip(1 - np.minimum(a, vv), 0, 1)) * 0.55 + 0.1   # thin edges and shadowed folds print dots
    screen = (d < r) & (a > 0.05)
    dark = tint * 0.62 if tint.mean() < 0.9 else np.array([0.25, 0.36, 0.67], np.float32) * 0.9 + 0.1   # white gets denim dots
    rgb = np.where(screen[..., None], dark[None, None, :] * 0.6 + rgb * 0.4, rgb)
out = np.dstack([np.clip(rgb, 0, 1) * 255, a * 255]).astype(np.uint8)
res = Image.fromarray(out, 'RGBA')
bb = res.getbbox()
if bb: res = res.crop(bb)
res.save(dst, 'WEBP', quality=80, method=6)
print(dst, res.size)
