"""Sprite bake, pixel half (design/art-direction/PLAN.md, step 2): SUPER× frames from tools/sprites/bake.html -> one
atlas + JSON for the game (src/spriteview.js). Run through tools/sprites/bake.mjs; by hand:

  python tools/sprites/pixelize.py <frames dir> <out dir> <id>

Same method as design/y2k-preview/tools/pixelize.py (after the Dan RPG): one k-means palette for the whole character,
each sprite pixel the majority vote of palette indices in its SUPER×SUPER block (no invented in-between colours),
alpha by coverage, then a 1-px ink outline and no white edge. Writes <out>/<id>.png (indexed: transparent + palette +
ink), <out>/<id>.json (grid, frame rects per clip and direction, frame rate, anchors), and a 4× <id>_preview.png
next to the frames dir (not shipped).

A character's manifest entry can name `spriteKeep`, colours the palette must have (small details such as eyes that
k-means would otherwise fold into the fur). A recoloured body (the guests: frames come with a mask render) gets key
slots instead of colours for its fur and shirt: STEPS shades of light each, written in the PNG as marker colours
(fur 255,0,b; shirt 0,255,b) that the game swaps for the guest's own colours times the light in the JSON's `keys`.
Its ears (one ear per image) go in a band under the frames, listed under `ears` with the ear bone's point in each.
"""
import json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
S = json.load(open(os.path.join(HERE, "schedule.json"), encoding="utf8"))
SUPER, CANVAS, COLS = S["super"], S["canvas"], S["cols"]
HEIGHT = S.get("height", CANVAS)   # cells are CANVAS wide, HEIGHT tall
INK = tuple(int(S["ink"][i:i + 2], 16) for i in (1, 3, 5))
STEPS = 3          # shades of light per key region
KEY = 128          # the grey bake.html paints the key regions in (sRGB)
MARK_B = [0, 128, 255][:STEPS]
LUMA = np.array([0.299, 0.587, 0.114])


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


def nearest(px, pal):
    return ((px[:, None, :] - pal[None]) ** 2).sum(-1).argmin(-1)


def classes(mask, light=False):
    """Per pixel of a mask render: 0 other, 1 fur, 2 shirt and, with `light` (the cast's region maps), 3 light."""
    cl = np.zeros(mask.shape[:2], np.int64)
    cl[(mask[..., 0] > 127) & (mask[..., 0] >= mask[..., 1])] = 1
    cl[(mask[..., 1] > 127) & (mask[..., 1] > mask[..., 0])] = 2
    if light:
        cl[(mask[..., 2] > 127) & (mask[..., 2] > mask[..., 0]) & (mask[..., 2] > mask[..., 1])] = 3
    return cl


def indices(rgba, regions, cl=None):
    """SUPER× palette indices (1-based) of a frame; `regions` is [(palette, first index)] for other, fur, shirt."""
    idx = np.zeros(rgba.shape[:2], np.int64)
    opaque = rgba[..., 3] > 127
    for r, (pal, first) in enumerate(regions):
        sel = opaque if cl is None else opaque & (cl == r)
        if sel.any():
            idx[sel] = nearest(rgba[sel][:, :3].astype(np.float32), pal) + first
    return idx


def pixelize(rgba, idx, n):
    """-> (HEIGHT, CANVAS) palette indices: 0 transparent, 1..n-1 the palette, by majority vote per block."""
    h, w = rgba.shape[:2]
    sw, sh = w // SUPER, h // SUPER
    blocks = idx.reshape(sh, SUPER, sw, SUPER).transpose(0, 2, 1, 3).reshape(sh * sw, -1)
    votes = np.bincount((np.arange(sh * sw)[:, None] * n + blocks).ravel(), minlength=sh * sw * n).reshape(sh * sw, n)
    out = (votes[:, 1:].argmax(-1) + 1).reshape(sh, sw)
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
    global CANVAS, HEIGHT, COLS
    if os.path.exists(os.path.join(src, "grid.json")):   # the grid bake.html used (furniture has its own)
        S.update(json.load(open(os.path.join(src, "grid.json"), encoding="utf8")))
        CANVAS, HEIGHT = S["canvas"], S["height"]
    cells = json.load(open(os.path.join(src, "cells.json"), encoding="utf8"))
    COLS = min(COLS, len(cells))   # a still (furniture) has only a few frames
    ears = json.load(open(os.path.join(src, "ears.json"), encoding="utf8")) if os.path.exists(os.path.join(src, "ears.json")) else []
    manifest = json.load(open(os.path.join(HERE, "..", "..", "assets", "manifest.json"), encoding="utf8"))
    mdef = next((m for m in manifest["models"] if m["id"] == cid), {})
    keyed = all("mask" in c for c in cells) and len(cells) > 0
    load = lambda f: np.array(Image.open(os.path.join(src, f)).convert("RGBA"))
    frames = [(load(f"cell_{i:04d}.png"), load(f"cell_{i:04d}_mask.png") if keyed else None) for i in range(len(cells))]
    earimgs = [(load(f"ear_{i:02d}.png"), load(f"ear_{i:02d}_mask.png")) for i in range(len(ears))]
    every = frames + earimgs

    # the key regions this body has: a manifest `recolor` names them (the cast may add light, or lack a shirt)
    light = "regions" in mdef
    active = [(r, k) for r, k in ((1, "fur"), (2, "shirt"), (3, "light")) if k in mdef.get("recolor", {})] if keyed else []
    lut = np.zeros(4, np.int64)               # mask class -> its region's place in `regions` (0: other)
    for j, (r, _) in enumerate(active):
        lut[r] = j + 1
    cls = lambda mk: lut[classes(mk, light)]

    def sample(region):
        parts = []
        for im, mk in every:
            sel = im[..., 3] > 200
            if mk is not None:
                sel &= cls(mk) == region
            parts.append(im[sel][::37 if region == 0 else 7, :3])
        return np.concatenate(parts).astype(np.float32)

    keep = np.array([[int(h[i:i + 2], 16) for i in (1, 3, 5)] for h in mdef.get("spriteKeep", [])], np.float32).reshape(-1, 3)
    n_other = mdef.get("spriteColors", S["colors"]) - STEPS * len(active) - len(keep)   # a busier outfit may ask for more
    other = np.concatenate([kmeans(sample(0), n_other), keep])
    other = other[np.argsort(other @ LUMA)]   # dark to light, so the sheet's palette reads in order
    regions = [(other, 1)]
    keys = {}
    MARK = {"fur": (255, 0), "shirt": (0, 255), "light": (128, 255)}   # marker colours (r, g, + MARK_B blue) of the key slots
    for j, (r, name) in enumerate(active):
        ramp = kmeans(sample(j + 1), STEPS)
        ramp = ramp[np.argsort(ramp @ LUMA)]
        regions.append((ramp, 1 + len(other) + j * STEPS))
        keys[name] = {"first": regions[-1][1], "mark": [[*MARK[name], b] for b in MARK_B],
                      "ramp": [[round(float(v) / KEY, 3) for v in c] for c in ramp]}
    n = 1 + sum(len(p) for p, _ in regions)   # transparent + every slot; the ink comes after
    ink = n

    rows = -(-len(cells) // COLS)
    atlas = np.zeros((rows * HEIGHT, COLS * CANVAS), np.uint8)
    clips = {}
    for i, (c, (im, mk)) in enumerate(zip(cells, frames)):
        idx = outline(pixelize(im, indices(im, regions, cls(mk) if keyed else None), n), ink)
        x, y = (i % COLS) * CANVAS, (i // COLS) * HEIGHT
        atlas[y:y + HEIGHT, x:x + CANVAS] = idx
        filled = np.nonzero((idx > 0).any(1))[0]
        a = dict(c["anchors"], top=int(filled[0]) if len(filled) else HEIGHT)
        e = clips.setdefault(c["clip"], {"n": c["n"], "duration": round(c["duration"], 3), "fps": round(c["n"] / c["duration"], 3), "frames": {}, "anchors": {}})
        e["frames"].setdefault(c["dir"], []).append([x, y, CANVAS, HEIGHT])
        e["anchors"].setdefault(c["dir"], []).append(a)

    # the ears: each cropped to itself and its outline, packed on shelves under the frames
    earmeta = {}
    if ears:
        crops = []
        for e, (im, mk) in zip(ears, earimgs):
            idx = outline(pixelize(im, indices(im, regions, cls(mk)), n), ink)
            ys, xs = np.nonzero(idx)
            y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
            crops.append((e, idx[y0:y1, x0:x1], x0, y0))
        band, sx, sy, shelf = [], 0, 0, 0
        for e, cr, x0, y0 in crops:
            h, w = cr.shape
            if sx + w > COLS * CANVAS:
                sx, sy, shelf = 0, sy + shelf, 0
            band.append((cr, sx, sy))
            earmeta.setdefault(e["style"], {}).setdefault(e["dir"], {})[e["side"]] = {
                "rect": [sx, rows * HEIGHT + sy, w, h], "anchor": [round(e["anchor"][0] - x0, 2), round(e["anchor"][1] - y0, 2)]}
            sx += w + 1
            shelf = max(shelf, h + 1)
        extra = np.zeros((sy + shelf, COLS * CANVAS), np.uint8)
        for cr, x, y in band:
            extra[y:y + cr.shape[0], x:x + cr.shape[1]] = cr
        atlas = np.concatenate([atlas, extra])

    os.makedirs(dst, exist_ok=True)
    colors = [(0, 0, 0)] + [tuple(int(round(v)) for v in p) for p in other]
    if keyed:
        colors += [tuple(m) for k in keys for m in keys[k]["mark"]]
    colors.append(INK)
    im = Image.fromarray(atlas, "P")
    im.putpalette([v for p in colors for v in p])
    im.info["transparency"] = 0
    png = os.path.join(dst, cid + ".png")
    im.save(png, optimize=True, transparency=0)
    meta = {
        "id": cid, "image": cid + ".png", "size": [atlas.shape[1], atlas.shape[0]],
        "grid": dict({k: S[k] for k in ("canvas", "ppu", "ground", "elev", "turn")}, height=HEIGHT), "dirs": S["dirs"],
        "palette": ["#%02x%02x%02x" % p for p in colors[1:]], "clips": clips,
    }
    if keyed:
        meta["keys"] = {k: {"mark": v["mark"], "ramp": v["ramp"]} for k, v in keys.items()}
    if earmeta:
        meta["ears"] = earmeta
    with open(os.path.join(dst, cid + ".json"), "w", encoding="utf8") as fh:
        json.dump(meta, fh, separators=(",", ":"))
    # the preview shows a recoloured body in its manifest reference colours
    shown = list(colors)
    if keyed:
        for name, k in keys.items():
            ref = mdef.get("recolor", {}).get(name, [200, 200, 200])
            for j, r in enumerate(k["ramp"]):
                shown[k["first"] + j] = tuple(int(min(255, ref[c] * r[c])) for c in range(3))
    prev = Image.fromarray(atlas, "P")
    prev.putpalette([v for p in shown for v in p])
    prev.info["transparency"] = 0
    big = prev.convert("RGBA").resize((atlas.shape[1] * 4, atlas.shape[0] * 4), Image.NEAREST)
    board = Image.new("RGBA", big.size, (244, 239, 230, 255))
    board.alpha_composite(big)
    board.convert("RGB").save(os.path.join(os.path.dirname(os.path.abspath(src)), cid + "_preview.png"))   # beside the frames, not shipped
    print(f"{cid}: {len(cells)} frames, {len(clips)} clips, {len(ears)} ears, {len(colors) - 2}+ink colours, {meta['size'][0]}x{meta['size'][1]}, {os.path.getsize(png) // 1024} KB")


if __name__ == "__main__":
    main()
