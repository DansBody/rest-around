# -*- coding: utf-8 -*-
"""Blender renders -> pixel sprites for the toon paper doll (after 丹的大冒險's sprite_tools + anim_sheet).

usage:
  python sheet.py <model_dir>                  model check: pixel sprite + toon render per view -> turnaround.png
  python sheet.py <anim_dir> [--compare SHEET] [--also DIR=LABEL ...] [--label LABEL]
                                               strips (sprites/<anim>_<view>.png), a 64x112 sheet doll_toon.png
                                               + preview.gif; --compare puts the game sheet SHEET (.png beside
                                               its .json, e.g. assets/sprites/doll_px/doll_px.png) on the left

A frame = the *_flat.png render majority-voted down by SUPER onto the model palette (no invented colours),
*_feat.png details forced on top, face features stamped as fixed pixel shapes at their projected spots,
then a 1-px ink outline round the silhouette.
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage

SUPER = 10
INK = (0x1F, 0x2A, 0x4A)
INK_SHARE = 0.35    # a sprite px turns ink when this much of its block is inked hull


def load_palette(d):
    p = json.load(open(os.path.join(d, "palette.json")))
    p["colors"] = np.array(p["colors"], float)
    return p


def pixelize_grid(rgba, pal, feat=None, feat_idx=()):
    """Downscale a fixed-grid render by SUPER and snap to the model palette (majority vote per block)."""
    h, w = rgba.shape[:2]
    sw, sh = w // SUPER, h // SUPER
    K = len(pal)
    opaque = rgba[..., 3] > 127
    idx = np.full(rgba.shape[:2], K, np.int64)                             # transparent -> extra bin
    px = rgba[opaque][:, :3].astype(np.float32)
    idx[opaque] = ((px[:, None, :] - pal[None].astype(np.float32)) ** 2).sum(-1).argmin(-1)
    blocks = idx.reshape(sh, SUPER, sw, SUPER).transpose(0, 2, 1, 3).reshape(sh * sw, -1)
    votes = np.bincount((np.arange(sh * sw)[:, None] * (K + 1) + blocks).ravel(),
                        minlength=sh * sw * (K + 1)).reshape(sh * sw, K + 1)
    win = votes[:, :K].argmax(-1)
    win[votes[:, 0] >= INK_SHARE * SUPER * SUPER] = 0      # ink lines (palette 0) win with a minority share
    out = pal[win].reshape(sh, sw, 3).astype(np.uint8)
    sa = np.array(Image.fromarray(rgba[..., 3]).resize((sw, sh), Image.BOX)).astype(float)
    if feat is not None and len(feat_idx):
        fa = np.array(Image.fromarray(feat[..., 3]).resize((sw, sh), Image.BOX)).astype(float)
        prem = (feat[..., :3] * (feat[..., 3:4] / 255.0)).astype(np.uint8)
        fc = np.array(Image.fromarray(prem).resize((sw, sh), Image.BOX)).astype(float)
        fc = fc / np.maximum(fa[..., None] / 255, 0.01)
        fp = pal[list(feat_idx)]
        snap = fp[((fc[:, :, None, :] - fp[None, None]) ** 2).sum(-1).argmin(-1)].astype(np.uint8)
        hit = fa >= 0.30 * 255
        out[hit] = snap[hit]
    return np.dstack([out, np.where(sa > 110, 255, 0).astype(np.uint8)])


# ---------------------------------------------------------------- face stamps (GBA-style)
COL = {"K": (0x2B, 0x1B, 0x17), "B": (0x6E, 0x3B, 0x22), "A": (0xC7, 0x80, 0x3F), "W": (255, 255, 255),
       "M": (0x8A, 0x3B, 0x2E), "P": (0xEB, 0xA5, 0x8F),
       "L": (0xE0, 0xB9, 0x8A), "S": (0x3E, 0x28, 0x20)}
FACE = {   # (min facing, rows); rows are drawn with the outer corner on the right, mirrored for the other side
    "eye": [(0.55, ["KKKK", "BWBB", "BWBB", "BBBB", "AAAA", ".AA."]),
            (0.15, ["KKK", "WBB", "WBB", "BBB", "AAA", ".A."])],
    "mouth": [(0.40, ["MM"])],
    "blush": [(0.35, ["PP"])],
    "lace": [(0.30, ["L.", ".L", "L."])],
    "strand": [(0.05, ["S"])],
}


def stamp(a, info):
    for name, f in info.items():
        kind = name.split("_")[0]
        if f["hidden"] or kind not in FACE:
            continue
        rows = next((r for lim, r in FACE[kind] if f["facing"] > lim), None)
        if not rows:
            continue
        if f.get("side", 1) < 0:
            rows = [r[::-1] for r in rows]
        h, w = len(rows), len(rows[0])
        x0, y0 = round(f["px"][0] - w / 2), round(f["px"][1] - h / 2)
        for dy, row in enumerate(rows):
            for dx, ch in enumerate(row):
                y, x = y0 + dy, x0 + dx
                if ch != "." and 0 <= y < a.shape[0] and 0 <= x < a.shape[1] and a[y, x, 3]:
                    a[y, x, :3] = COL[ch]
    return a


def outline(a):
    """1-px ink ring round the silhouette. Inked parts already carry hull ink on their edge, so the ring is
    taken round the non-ink pixels and ink that touches none of them (a doubled edge) is dropped."""
    opaque = a[..., 3] > 0
    is_ink = opaque & (np.abs(a[..., :3].astype(int) - INK).sum(-1) < 8)
    body = opaque & ~is_ink
    near = ndimage.binary_dilation(body, structure=np.ones((3, 3), bool))
    a[is_ink & ~near] = 0
    ring = ndimage.binary_dilation(body) & ~body
    a[ring] = list(INK) + [255]
    return a


def sprite(d, key, stamps, pal):
    flat = np.array(Image.open(os.path.join(d, key + "_flat.png")).convert("RGBA"))
    feat = np.array(Image.open(os.path.join(d, key + "_feat.png")).convert("RGBA"))
    a = pixelize_grid(flat, pal["colors"], feat, pal["feature"])
    return Image.fromarray(outline(stamp(a, stamps)), "RGBA")


def font(size=16):
    try:
        return ImageFont.truetype("msjh.ttc", size)
    except OSError:
        return ImageFont.load_default()


# ---------------------------------------------------------------- model check
def turnaround(d):
    pal, stamps = load_palette(d), json.load(open(os.path.join(d, "stamps.json")))
    keys = list(stamps)
    S = 4
    cells = []
    for k in keys:
        spr = sprite(d, k, stamps[k], pal)
        toon = Image.open(os.path.join(d, k + "_toon.png")).convert("RGBA")
        toon = toon.resize((spr.width * S, spr.height * S), Image.LANCZOS)
        cells.append((k, spr.resize((spr.width * S, spr.height * S), Image.NEAREST), toon))
    w, h = cells[0][1].size
    im = Image.new("RGB", (w * 2 * len(cells), h + 30), (226, 226, 220))
    dr = ImageDraw.Draw(im)
    for i, (k, spr, toon) in enumerate(cells):
        im.paste(toon, (i * 2 * w, 30), toon)
        im.paste(spr, (i * 2 * w + w, 30), spr)
        dr.text((i * 2 * w + 8, 6), k, fill=(60, 60, 60), font=font())
    p = os.path.join(d, "turnaround.png")
    im.save(p)
    print(p)


# ---------------------------------------------------------------- animation sheet + GIF
TIMING = {"idle": 0.3, "walk": 0.1}          # seconds per frame (doll_px: Idle 2.4 s / 8, Walk 0.8 s / 8)
CLIP = {"idle": "Idle", "walk": "Walk"}


def anim_sheet(d, compare=None, also=(), label="toonkit 版"):
    """also: [(label, dir)] of other toon renders (their sprites/ strips) shown between the game sheet and this one."""
    pal, stamps = load_palette(d), json.load(open(os.path.join(d, "stamps.json")))
    meta = json.load(open(os.path.join(d, "anims.json")))
    grid = json.load(open(os.path.join(d, "grid.json")))
    W, H = grid["canvas"], grid["height"]
    os.makedirs(os.path.join(d, "sprites"), exist_ok=True)
    frames = {}
    for anim, m in meta.items():
        for view in m["views"]:
            seq = [sprite(d, f"{anim}_{view}_{f:02d}", stamps[f"{anim}_{view}_{f:02d}"], pal)
                   for f in range(m["frames"])]
            strip = Image.new("RGBA", (W * len(seq), H))
            for i, fr in enumerate(seq):
                strip.paste(fr, (W * i, 0))
            strip.save(os.path.join(d, "sprites", f"{anim}_{view}.png"))
            frames[(anim, view)] = seq
    # one sheet in doll_px's layout: a row per clip, f frames then b frames
    rows = [a for a in ("idle", "walk") if (a, "f") in frames]
    n = max(len(frames[(a, "f")]) for a in rows)
    sheet = Image.new("RGBA", (W * n * 2, H * len(rows)))
    for r, a in enumerate(rows):
        for j, v in enumerate(("f", "b")):
            for i, fr in enumerate(frames.get((a, v), [])):
                sheet.paste(fr, ((j * n + i) * W, r * H))
    sheet.save(os.path.join(d, "doll_toon.png"))

    # the comparison: game sheet (left) vs toon (right), both facings, idle + walk rows
    sets = []
    if compare:
        cj = json.load(open(os.path.splitext(compare)[0] + ".json"))
        cim = Image.open(compare).convert("RGBA")
        cmp = {}
        for a in rows:
            clip = cj["clips"][CLIP[a]]
            for v in ("f", "b"):
                cmp[(a, v)] = [cim.crop((x, y, x + w, y + h)) for x, y, w, h in clip["frames"][v]]
        sets.append(("gpt-image 版", cmp))
    for lab, od in also:
        sets.append((lab, {(a, v): [Image.open(os.path.join(od, "sprites", f"{a}_{v}.png")).crop((i * W, 0, i * W + W, H))
                                    for i in range(len(frames[(a, v)]))] for a in rows for v in ("f", "b")}))
    sets.append((label, frames))
    S, TICK = (4 if len(sets) <= 2 else 3), 0.1
    cw, ch = W * S, H * S
    LW, TH = 110, 56
    cols = [(s, v) for s in range(len(sets)) for v in ("f", "b")]
    im_w, im_h = LW + cw * len(cols), TH + ch * len(rows)
    ticks = int(round(max(TIMING[a] * len(frames[(a, "f")]) for a in rows) / TICK))
    ticks = int(np.lcm.reduce([int(round(TIMING[a] * len(frames[(a, 'f')]) / TICK)) for a in rows] + [ticks]))
    F = font(18)
    out = []
    for t in range(ticks):
        im = Image.new("RGB", (im_w, im_h), (232, 228, 218))
        dr = ImageDraw.Draw(im)
        for c, (s, v) in enumerate(cols):
            x = LW + c * cw
            if v == "f":
                dr.text((x + 8, 6), sets[s][0], fill=(40, 42, 74), font=F)
            dr.text((x + 8, 30), "正面 f" if v == "f" else "背面 b", fill=(90, 90, 90), font=font(14))
        for r, a in enumerate(rows):
            dr.text((8, TH + r * ch + ch // 2 - 10), a, fill=(60, 60, 60), font=F)
            per = int(round(TIMING[a] / TICK))
            for c, (s, v) in enumerate(cols):
                seq = sets[s][1].get((a, v))
                if not seq:
                    continue
                fr = seq[(t // per) % len(seq)]
                big = fr.resize((cw, ch), Image.NEAREST)
                x, y = LW + c * cw, TH + r * ch
                gy = y + grid["ground"] * S
                dr.ellipse((x + cw // 2 - 14 * S, gy - 2 * S, x + cw // 2 + 14 * S, gy + 2 * S), fill=(205, 200, 188))
                im.paste(big, (x, y), big)
        out.append(im)
    gif = os.path.join(d, "compare.gif" if compare else "preview.gif")
    out[0].save(gif, save_all=True, append_images=out[1:], duration=int(TICK * 1000), loop=0)
    out[0].save(os.path.splitext(gif)[0] + "_frame0.png")
    print(gif, len(out), "ticks")


if __name__ == "__main__":
    d = sys.argv[1]
    cmp = sys.argv[sys.argv.index("--compare") + 1] if "--compare" in sys.argv else None
    also = [tuple(reversed(a.split("=", 1))) for i, a in enumerate(sys.argv) if sys.argv[i - 1] == "--also"]
    lab = sys.argv[sys.argv.index("--label") + 1] if "--label" in sys.argv else "toonkit 版"
    if os.path.exists(os.path.join(d, "anims.json")):
        anim_sheet(d, cmp, also, lab)
    else:
        turnaround(d)
