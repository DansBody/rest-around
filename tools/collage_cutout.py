# Refillit OS collage: turn a photo on a white background into a grey halftone cut-out with a white sticker edge
# (assets/ui/collage/*.webp). Sources were generated with gpt-image-bridge (b/w studio photos on white).
#   python tools/collage_cutout.py hand_cup.png assets/ui/collage/hand_cup.webp 420 246 7 5
#   python tools/collage_cutout.py bust.png assets/ui/collage/bust.webp 440 244 7 5
#   python tools/collage_cutout.py moka.png assets/ui/collage/moka.webp 300 240 6 4
import sys
import numpy as np
from PIL import Image, ImageFilter, ImageOps

src, dst, W = sys.argv[1], sys.argv[2], int(sys.argv[3])
thr = int(sys.argv[4]) if len(sys.argv) > 4 else 246
edge = int(sys.argv[5]) if len(sys.argv) > 5 else 7
dot = int(sys.argv[6]) if len(sys.argv) > 6 else 5

im = Image.open(src).convert('L')
im = im.resize((W, round(im.height * W / im.width)), Image.LANCZOS)
g = np.asarray(im).astype(np.float32)

# background = near-white pixels connected to the border (flood fill on a padded mask)
bgc = g >= thr
from collections import deque
h, w = bgc.shape
seen = np.zeros_like(bgc)
q = deque()
for x in range(w):
    for y in (0, h - 1):
        if bgc[y, x] and not seen[y, x]: seen[y, x] = True; q.append((y, x))
for y in range(h):
    for x in (0, w - 1):
        if bgc[y, x] and not seen[y, x]: seen[y, x] = True; q.append((y, x))
while q:
    y, x = q.popleft()
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        ny, nx = y + dy, x + dx
        if 0 <= ny < h and 0 <= nx < w and bgc[ny, nx] and not seen[ny, nx]:
            seen[ny, nx] = True; q.append((ny, nx))
obj = Image.fromarray(((~seen) * 255).astype(np.uint8))
obj = obj.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))   # close, open
m = np.asarray(obj) > 127

# tone: stretch to the object's own range, a touch darker so plaster still prints
vals = g[m]
lo, hi = np.percentile(vals, 2), np.percentile(vals, 99.5)
t = np.clip((g - lo) / max(1, hi - lo), 0, 1) ** 1.35
# halftone screen at 45°: dots grow with darkness
yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
u = (xx + yy) / np.sqrt(2) / dot; v = (xx - yy) / np.sqrt(2) / dot
d = np.sqrt((u - np.round(u)) ** 2 + (v - np.round(v)) ** 2)   # 0 at a dot centre .. ~0.7
r = np.sqrt(np.clip(1 - t, 0, 1)) * 0.62
screen = (d < r).astype(np.float32)
rng = np.random.default_rng(7)
grain = rng.normal(0, 0.035, (h, w)).astype(np.float32)
tone = np.clip(t * 0.78 + 0.16 + grain, 0, 1)            # the photo, flattened and grainy
out = tone * (1 - 0.55 * screen)                            # dots printed over it
grey = (out * 255).astype(np.uint8)

# white sticker edge round the object
edge_m = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(edge * 2 + 1)).filter(ImageFilter.GaussianBlur(0.8))
alpha = np.asarray(edge_m)
rgb = np.where(m[..., None], np.repeat(grey[..., None], 3, 2), 255).astype(np.uint8)
res = Image.fromarray(np.dstack([rgb, alpha]), 'RGBA')
bb = res.getbbox(); res = res.crop(bb)
res.save(dst, 'WEBP', quality=82, method=6)
print(dst, res.size)
