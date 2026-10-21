"""Sprite bake, pixel half (design/art-direction/PLAN.md, step 2): SUPER× frames from tools/sprites/bake.html -> one
atlas + JSON for the game (src/spriteview.js). Run through tools/sprites/bake.mjs; by hand:

  python tools/sprites/pixelize.py <frames dir> <out dir> <id>

Same method as design/y2k-preview/tools/pixelize.py (after the Dan RPG): one k-means palette for the whole character,
each sprite pixel the majority vote of palette indices in its SUPER×SUPER block (no invented in-between colours),
alpha by coverage, then a 1-px ink outline and no white edge. Writes <out>/<id>.png (indexed: transparent + palette +
ink), <out>/<id>.json (grid, frame rects per clip and direction, frame rate, anchors), and a 4× <id>_preview.png
next to the frames dir (not shipped).
"""
import json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
S = json.load(open(os.path.join(HERE, "schedule.json"), encoding="utf8"))
SUPER, CANVAS, COLS = S["super"], S["canvas"], S["cols"]
INK = tuple(int(S["ink"][i:i + 2], 16) for i in (1, 3, 5))


def kmeans(px, k, iters=18, seed=1):
    rng = np.random.default_rng(seed)
    c = px[rng.choice(len(px), k, replace=False)].astype(np.float32)
    for _ in range(iters):
        lab = ((px[:, None, :] - c[None]) ** 2).sum(-1).argmin(-1)
        for i in range(k):
            sel = px[lab == i]
            if len(sel):
                c[i] = sel.mean(0)
    return c


def pixelize(rgba, pal):
    """-> (CANVAS, CANVAS) palette indices: 0 transparent, 1..K the palette (K+1 is left for the ink)."""
    h, w = rgba.shape[:2]
    sw, sh = w // SUPER, h // SUPER
    K = len(pal)
    opaque = rgba[..., 3] > 127
    idx = np.full(rgba.shape[:2], K, np.int64)
    px = rgba[opaque][:, :3].astype(np.float32)
    idx[opaque] = ((px[:, None, :] - pal[None]) ** 2).sum(-1).argmin(-1)
    blocks = idx.reshape(sh, SUPER, sw, SUPER).transpose(0, 2, 1, 3).reshape(sh * sw, -1)
    votes = np.bincount((np.arange(sh * sw)[:, None] * (K + 1) + blocks).ravel(), minlength=sh * sw * (K + 1)).reshape(sh * sw, K + 1)
    out = (votes[:, :K].argmax(-1) + 1).reshape(sh, sw)
    cover = np.array(Image.fromarray(rgba[..., 3]).resize((sw, sh), Image.BOX))
    out[cover <= 110] = 0
    return out


def outline(idx, ink):
    m = idx > 0
    ring = ndimage.binary_dilation(m) & ~m
    idx = idx.copy()
    idx[ring] = ink
    return idx


def main():
    src, dst, cid = sys.argv[1], sys.argv[2], sys.argv[3]
    cells = json.load(open(os.path.join(src, "cells.json"), encoding="utf8"))
    files = [os.path.join(src, f"cell_{i:04d}.png") for i in range(len(cells))]
    load = lambda f: np.array(Image.open(f).convert("RGBA"))
    sample = np.concatenate([fr[fr[..., 3] > 200][::37, :3] for fr in map(load, files)]).astype(np.float32)
    pal = kmeans(sample, S["colors"])
    pal = pal[np.argsort(pal @ np.array([0.299, 0.587, 0.114]))]   # dark to light, so the sheet's palette reads in order
    K = len(pal)
    rows = -(-len(cells) // COLS)
    atlas = np.zeros((rows * CANVAS, COLS * CANVAS), np.uint8)
    clips = {}
    for i, (c, f) in enumerate(zip(cells, files)):
        idx = outline(pixelize(load(f), pal), K + 1)
        x, y = (i % COLS) * CANVAS, (i // COLS) * CANVAS
        atlas[y:y + CANVAS, x:x + CANVAS] = idx
        filled = np.nonzero((idx > 0).any(1))[0]
        a = dict(c["anchors"], top=int(filled[0]) if len(filled) else CANVAS)
        e = clips.setdefault(c["clip"], {"n": c["n"], "duration": round(c["duration"], 3), "fps": round(c["n"] / c["duration"], 3), "frames": {}, "anchors": {}})
        e["frames"].setdefault(c["dir"], []).append([x, y, CANVAS, CANVAS])
        e["anchors"].setdefault(c["dir"], []).append(a)
    os.makedirs(dst, exist_ok=True)
    colors = [(0, 0, 0)] + [tuple(int(round(v)) for v in p) for p in pal] + [INK]
    im = Image.fromarray(atlas, "P")
    im.putpalette([v for p in colors for v in p])
    im.info["transparency"] = 0
    png = os.path.join(dst, cid + ".png")
    im.save(png, optimize=True, transparency=0)
    meta = {
        "id": cid, "image": cid + ".png", "size": [COLS * CANVAS, rows * CANVAS],
        "grid": {k: S[k] for k in ("canvas", "ppu", "ground", "elev", "turn")}, "dirs": S["dirs"],
        "palette": ["#%02x%02x%02x" % p for p in colors[1:]], "clips": clips,
    }
    with open(os.path.join(dst, cid + ".json"), "w", encoding="utf8") as fh:
        json.dump(meta, fh, separators=(",", ":"))
    big = im.convert("RGBA").resize((COLS * CANVAS * 4, rows * CANVAS * 4), Image.NEAREST)
    board = Image.new("RGBA", big.size, (244, 239, 230, 255))
    board.alpha_composite(big)
    board.convert("RGB").save(os.path.join(os.path.dirname(os.path.abspath(src)), cid + "_preview.png"))   # beside the frames, not shipped
    print(f"{cid}: {len(cells)} frames, {len(clips)} clips, {K}+ink colours, {meta['size'][0]}x{meta['size'][1]}, {os.path.getsize(png) // 1024} KB")


if __name__ == "__main__":
    main()
