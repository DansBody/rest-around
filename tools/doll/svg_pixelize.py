"""Vote the SVG doll's 8x frames (design/y2k-preview, composition DollSvg*) back down to sprite pixels.

    python tools/doll/svg_pixelize.py <frames_dir> <out_dir> [--scale 8] [--palette <sheet.png>]

Each SCALE x SCALE block becomes one pixel: clear unless most of it is covered, else the commonest palette colour
among its covered pixels (the vector edges are anti-aliased; the pixel layers inside are already exact). The figure's
outer rim is redrawn in the ink. Writes <out_dir>/sheet.png with the frames side by side, a gap between them, and
pieces.json, the same shape as a tools/doll/pixelparts.py cut, so tools/doll/assemble.py takes it as a strip.
"""
import json, sys
from pathlib import Path

import numpy as np
from PIL import Image

INK = np.array([0x1F, 0x2A, 0x4A])


def main():
    src, out = Path(sys.argv[1]), Path(sys.argv[2])
    args = sys.argv[3:]
    S = int(args[args.index('--scale') + 1]) if '--scale' in args else 8
    files = sorted(src.glob('*.png'), key=lambda p: int(''.join(ch for ch in p.stem if ch.isdigit()) or 0))
    frames = [np.array(Image.open(f).convert('RGBA')) for f in files]
    if '--palette' in args:
        ref = np.array(Image.open(args[args.index('--palette') + 1]).convert('RGBA'))
        pal = np.unique(ref[ref[..., 3] > 0][:, :3], axis=0).astype(np.int32)
    else:
        pal = np.zeros((0, 3), np.int32)
    # the vector shapes' own colours join the palette (their flat, fully covered pixels)
    solid = np.concatenate([f[f[..., 3] == 255][:, :3] for f in frames]).astype(np.int32)
    u, cnt = np.unique(solid, axis=0, return_counts=True)
    pal = np.unique(np.concatenate([pal, u[cnt > 200], INK[None]]), axis=0)
    cells = []
    for f in frames:
        H, W = f.shape[0] // S, f.shape[1] // S
        blk = f[:H * S, :W * S].reshape(H, S, W, S, 4).transpose(0, 2, 1, 3, 4).reshape(H, W, S * S, 4)
        cover = (blk[..., 3] > 128).sum(-1) > S * S // 2
        rgb = blk[..., :3].astype(np.int32)
        idx = ((rgb[..., None, :] - pal[None, None, None]) ** 2).sum(-1).argmin(-1)          # (H, W, S*S)
        idx = np.where(blk[..., 3] > 128, idx, -1)
        out_c = np.zeros((H, W, 4), np.uint8)
        for y, x in zip(*np.where(cover)):
            v = idx[y, x][idx[y, x] >= 0]
            out_c[y, x, :3] = pal[np.bincount(v).argmax()]
            out_c[y, x, 3] = 255
        pad = np.pad(cover, 1)
        rim = cover & ~(pad[:-2, 1:-1] & pad[2:, 1:-1] & pad[1:-1, :-2] & pad[1:-1, 2:])
        out_c[rim, :3] = INK
        cells.append(out_c)
    # side by side, cropped to the figure, 4 px apart
    crops = []
    for c in cells:
        ys, xs = np.where(c[..., 3] > 0)
        crops.append(c[:, xs.min():xs.max() + 1])
    Wt = sum(c.shape[1] + 4 for c in crops)
    sheet = np.zeros((cells[0].shape[0], Wt, 4), np.uint8)
    pieces, x = [], 0
    for k, c in enumerate(crops, 1):
        sheet[:, x:x + c.shape[1]] = c
        ys = np.where(c[..., 3].any(1))[0]
        pieces.append({'n': k, 'box': [x, int(ys[0]), c.shape[1], int(ys[-1] - ys[0] + 1)], 'px': int((c[..., 3] > 0).sum())})
        x += c.shape[1] + 4
    out.mkdir(parents=True, exist_ok=True)
    Image.fromarray(sheet, 'RGBA').save(out / 'sheet.png')
    (out / 'pieces.json').write_text(json.dumps({'cell': S, 'size': [Wt, sheet.shape[0]], 'pieces': pieces}, indent=1))
    print(f'{len(cells)} frames -> {out} ({len(pal)} palette colours)')


if __name__ == '__main__':
    main()
