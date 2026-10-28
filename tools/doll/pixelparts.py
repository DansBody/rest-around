"""Turn a gpt-image 'pixel art' parts sheet into real pixels and cut it into parts.

    python tools/doll/pixelparts.py <sheet.png> <out_dir> [--colors 22] [--height 72] [--palette <other view>/sheet.png]

gpt-image paints pixel art on a grid that is only roughly regular (and sometimes blurs an edge), so this finds the
cell size from the colour edges, then cuts the sheet into its pieces (inked blobs) and fits the grid's phase to each
piece on its own (the drift across a sheet is a few pixels), takes each cell's majority colour on a k-means palette
and drops the white round it. Writes:

    <out_dir>/sheet.png      the clean sprite-pixel sheet (1 px = 1 sprite px), transparent background
    <out_dir>/labels.png     the same ×6 with every piece boxed and numbered, to name them by eye
    <out_dir>/pieces.json    per piece: number, box [x, y, w, h] in sprite px, pixel count
"""
import json, sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

INK = (0x1F, 0x2A, 0x4A)   # the game's outline colour (tools/sprites/pixelize.py)


def find_grid(rgb, lo=5.0, hi=16.0):
    """The cell size and offset whose cell borders line up best with the colour edges: the edge profile per
    column (row) autocorrelates at the cell size, then each axis takes the phase that puts the most edge on borders."""
    g = rgb.astype(np.float32)
    def profile(ax):
        p = np.abs(np.diff(g, axis=ax)).sum(-1).sum(0 if ax == 1 else 1)
        return p - p.mean()
    px, py = profile(1), profile(0)
    def period(p):
        ac = np.correlate(p, p, 'full')[len(p) - 1:]
        lags = np.arange(int(lo), int(hi) + 1)
        return int(lags[np.argmax(ac[lags])])
    def fit(p, s0):
        best = None
        for s in np.arange(s0 - 0.6, s0 + 0.61, 0.02):
            for o in np.arange(0, s, 0.25):
                pos = np.arange(o, len(p) - 1, s).astype(int)
                e = p[pos].sum() / len(pos)
                if best is None or e > best[0]: best = (e, s, o)
        return best
    s0 = (period(px) + period(py)) / 2
    ex, sx, ox = fit(px, s0); ey, sy, oy = fit(py, s0)
    s = (sx + sy) / 2
    return 0.0, s, (ox + 1) % s, (oy + 1) % s     # +1: diff() puts the edge between pixel i and i+1


def tallest(im, s, ox, oy):
    """Height in cells of the tallest non-white column run (the assembled figure)."""
    ink = im.min(-1) < 235
    rows = np.where(ink.any(1))[0]
    best = 0
    for x in range(0, im.shape[1], 4):
        ys = np.where(ink[:, x])[0]
        if len(ys): best = max(best, ys.max() - ys.min())
    return best / s


def kmeans(X, k, iters=20, seed=0):
    rng = np.random.default_rng(seed)
    C = X[rng.choice(len(X), k, replace=False)].astype(np.float32)
    for _ in range(iters):
        d = ((X[:, None, :] - C[None]) ** 2).sum(-1)
        a = d.argmin(1)
        for j in range(k):
            m = a == j
            if m.any(): C[j] = X[m].mean(0)
    return C


def fit_offset(crop, s):
    """The grid phase (x, y) that puts the most colour edge on cell borders inside one piece."""
    g = crop.astype(np.float32)
    out = []
    for ax in (1, 0):
        p = np.abs(np.diff(g, axis=ax)).sum(-1).sum(0 if ax == 1 else 1)
        best = max(((p[np.arange(o, len(p) - 1, s).astype(int)].mean(), o) for o in np.arange(0, s, 0.25)))
        out.append((best[1] + 1) % s)
    return out


def sample_piece(crop, s, ox, oy, pal):
    """Majority colour (palette index) per cell over a 3x3 of samples in its middle; white cells outside = clear."""
    xs = np.arange(ox - s, crop.shape[1], s); ys = np.arange(oy - s, crop.shape[0], s)
    xs, ys = xs[(xs >= 0) & (xs + s <= crop.shape[1])], ys[(ys >= 0) & (ys + s <= crop.shape[0])]
    k = np.array([0.3, 0.5, 0.7])
    cx = (xs[None, :] + s * k[:, None]).astype(int); cy = (ys[None, :] + s * k[:, None]).astype(int)
    smp = crop[cy[:, None, :, None], cx[None, :, None, :]].reshape(9, len(ys), len(xs), 3).astype(np.float32)
    d = ((smp.reshape(-1, 1, 3) - pal[None]) ** 2).sum(-1).argmin(1).reshape(9, len(ys), len(xs))
    votes = np.zeros((len(pal), len(ys), len(xs)), np.int32)
    for i in range(9): np.add.at(votes, (d[i], *np.indices((len(ys), len(xs)))), 1)
    idx = votes.argmax(0)
    bg = len(pal) - 1
    idx[(smp.min(-1) >= 235).sum(0) >= 5] = bg     # white by brightness: a borrowed palette may hold a near-white cream
    lab, _ = ndimage.label(idx == bg)
    edge = set(lab[0]) | set(lab[-1]) | set(lab[:, 0]) | set(lab[:, -1])
    outside = np.isin(lab, [e for e in edge if e])
    rgba = np.zeros(idx.shape + (4,), np.uint8)
    rgba[..., :3] = pal[idx].round().astype(np.uint8)
    rgba[..., 3] = np.where(outside, 0, 255)
    blobs, nb = ndimage.label(rgba[..., 3] > 0, structure=np.ones((3, 3)))
    if nb > 1:                                            # specks the resampling leaves round a piece
        keep = np.argmax(np.bincount(blobs.ravel())[1:]) + 1
        rgba[blobs != keep, 3] = 0
    # a clean 1-px outline: every opaque cell touching the clear outside is ink (mends the breaks resampling leaves)
    solid = rgba[..., 3] > 0
    pad = np.pad(solid, 1)
    rim = solid & ~(pad[:-2, 1:-1] & pad[2:, 1:-1] & pad[1:-1, :-2] & pad[1:-1, 2:])
    rgba[rim, :3] = INK
    ys_, xs_ = np.where(rgba[..., 3] > 0)
    return rgba[ys_.min():ys_.max() + 1, xs_.min():xs_.max() + 1], (xs[xs_.min()], ys[ys_.min()])


def main():
    src, out = Path(sys.argv[1]), Path(sys.argv[2])
    args = sys.argv[3:]
    ncol = int(args[args.index('--colors') + 1]) if '--colors' in args else 22
    im = np.array(Image.open(src).convert('RGB'))
    _, s, ox, oy = find_grid(im)
    if '--height' in args:   # the grid finder can lock onto a finer beat: trust the asked height of the figure
        s0 = s
        s = s * tallest(im, s, ox, oy) / float(args[args.index('--height') + 1])
        print(f'grid {s0:.2f} px -> {s:.2f} px for the height asked')
    print(f'cell {s:.2f} px')
    # palette from every inked pixel; white last (the background)
    fg = im[im.min(-1) < 235].reshape(-1, 3).astype(np.float32)
    if '--palette' in args:   # another view of the same character: share its colours so one sheet holds both
        ref = np.array(Image.open(args[args.index('--palette') + 1]).convert('RGBA'))
        pal = np.unique(ref[ref[..., 3] > 0][:, :3], axis=0).astype(np.float32)
        pal = pal[np.abs(pal - INK).sum(1) > 0]          # the outline is put back by the rim pass
    else:
        pal = kmeans(fg[np.random.default_rng(1).choice(len(fg), min(len(fg), 60000), replace=False)], ncol)
    pal = np.vstack([pal, [[255, 255, 255]]])
    # pieces in image space: inked blobs (slightly grown so a piece's own gaps don't split it)
    mask = ndimage.binary_dilation(im.min(-1) < 235, iterations=max(1, int(s * 0.3)))
    lab, n = ndimage.label(mask)
    pieces, arrays = [], []
    for i, sl in enumerate(ndimage.find_objects(lab), 1):
        if (sl[0].stop - sl[0].start) < s * 6 or (sl[1].stop - sl[1].start) < s * 4: continue      # specks
        y0, y1 = max(0, sl[0].start - int(s)), min(im.shape[0], sl[0].stop + int(s))
        x0, x1 = max(0, sl[1].start - int(s)), min(im.shape[1], sl[1].stop + int(s))
        crop = im[y0:y1, x0:x1].copy()
        crop[lab[y0:y1, x0:x1] != i] = 255                                        # neighbours out
        px, py = fit_offset(crop, s)
        arr, (cx, cy) = sample_piece(crop, s, px, py, pal)
        arrays.append((arr, int(round((x0 + cx) / s)), int(round((y0 + cy) / s))))
    arrays.sort(key=lambda a: (a[2] // 25, a[1]))                                # rows, then left to right
    W = max(x + a.shape[1] for a, x, y in arrays) + 1; H = max(y + a.shape[0] for a, x, y in arrays) + 1
    sheet = np.zeros((H, W, 4), np.uint8)
    for k, (a, x, y) in enumerate(arrays, 1):
        m = a[..., 3] > 0
        sheet[y:y + a.shape[0], x:x + a.shape[1]][m] = a[m]
        pieces.append({'n': k, 'box': [x, y, a.shape[1], a.shape[0]], 'px': int(m.sum())})
    out.mkdir(parents=True, exist_ok=True)
    Image.fromarray(sheet, 'RGBA').save(out / 'sheet.png')
    (out / 'pieces.json').write_text(json.dumps({'cell': s, 'size': [W, H], 'pieces': pieces}, indent=1))
    S = 6
    big = Image.new('RGBA', (W * S, H * S), (235, 235, 235, 255))
    big.alpha_composite(Image.fromarray(sheet, 'RGBA').resize((W * S, H * S), Image.NEAREST))
    dr = ImageDraw.Draw(big)
    for p in pieces:
        x, y, w, h = p['box']
        dr.rectangle([x * S, y * S, (x + w) * S, (y + h) * S], outline=(255, 0, 0), width=2)
        dr.text((x * S + 3, y * S + 2), str(p['n']), fill=(255, 0, 0))
    big.save(out / 'labels.png')
    print(f'{W}x{H} sprite px, {len(pieces)} pieces:', [(p['n'], p['box']) for p in pieces])


if __name__ == '__main__':
    main()
