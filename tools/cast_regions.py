"""Region maps for recolouring the original cast (design/cast/CAST.md).

Each cast model was made with flat colour regions: fur, light (muzzle, belly) and shirt. This writes, per model,
assets/models/characters/cast_<name>_regions.png at the texture's size: red = fur, green = shirt, blue = light, each
the share (0-255) of that texel that takes the player's colour. A texel belongs to the region whose reference colour it
is nearest (fading out with distance, so eyes, nose, blush and markings stay), and the shirt only counts between the
feet and the neck (the bear's pink shirt is the colour of its blush). The model's triangles are drawn in UV space to
know each texel's height. It also writes the measured reference colours into the manifest entry (`recolor`) and the
map's path (`regions`); bake.html and models.js read both.

    python tools/cast_regions.py            # every cast model
    python tools/cast_regions.py hamster    # one
"""
import json, sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

import build_character as bc

ROOT = Path(__file__).resolve().parent.parent
CHARS = ROOT / 'assets' / 'models' / 'characters'
MANIFEST = ROOT / 'assets' / 'manifest.json'
MESHY = ROOT / 'design' / 'cast' / 'meshy'
# cast model -> (manifest id, guesses of the fur / light / shirt colours in its texture; None = no shirt)
CAST = {
    'hamster': ('mochalatte', '#f4a042', '#fcfaf2', '#1e4880'),
    'fox': ('cheetie', '#e87828', '#f8f8e8', '#e8c888'),
    'sheep': ('heehee', '#f8f8e8', '#e8b898', '#b85858'),        # fur = the wool, light = the face
    'rabbit': ('bbaekko', '#a8b868', '#f8f8d8', '#d8b878'),      # shirt = the apron
    'calico': ('oritokki', '#f88838', '#f8f8f8', '#5888c8'),     # fur = the orange patches, light = the white coat
    'dog': ('tata', '#c88858', '#f8f8f8', '#f8e858'),
    'penguin': ('rj', '#482818', '#f8f8f8', None),
    'raccoon': ('chimmy', '#888898', '#f8f8f8', '#f8c848'),
    'bear': ('bboogyuli', '#78a8e8', '#f8f8d8', '#f898a8'),
    'owl': ('bamgeut', '#687898', '#f8f8d8', '#98e8b8'),
}
NEAR, FAR = 40, 75   # colour distance where a texel starts / stops belonging to a region


def rgb(h): return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], np.float32)


def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def height_map(P, UV, IDX, n):
    """Each texel's model height (source units), from the triangles drawn in UV space; gaps take the nearest."""
    hy = np.full((n, n), np.nan, np.float32)
    uv = UV * n - 0.5   # glTF UVs: v down from the top, like image rows
    for a, b, c in IDX.reshape(-1, 3):
        t = uv[[a, b, c]]
        x0, y0 = np.floor(t.min(0)).astype(int); x1, y1 = np.ceil(t.max(0)).astype(int)
        x0, y0, x1, y1 = max(x0, 0), max(y0, 0), min(x1, n - 1), min(y1, n - 1)
        if x1 < x0 or y1 < y0: continue
        X, Y = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
        d = (t[1, 1] - t[2, 1]) * (t[0, 0] - t[2, 0]) + (t[2, 0] - t[1, 0]) * (t[0, 1] - t[2, 1])
        if abs(d) < 1e-12: continue
        l0 = ((t[1, 1] - t[2, 1]) * (X - t[2, 0]) + (t[2, 0] - t[1, 0]) * (Y - t[2, 1])) / d
        l1 = ((t[2, 1] - t[0, 1]) * (X - t[2, 0]) + (t[0, 0] - t[2, 0]) * (Y - t[2, 1])) / d
        l2 = 1 - l0 - l1
        inside = (l0 >= -0.02) & (l1 >= -0.02) & (l2 >= -0.02)
        hy[Y[inside], X[inside]] = (l0 * P[a, 1] + l1 * P[b, 1] + l2 * P[c, 1])[inside]
    gap = np.isnan(hy)
    if gap.any():
        idx = ndimage.distance_transform_edt(gap, return_distances=False, return_indices=True)
        hy = hy[tuple(idx)]
    return hy


def refine(px, guess):
    """The mean of the texels near a guessed colour (the texture's real flat colour)."""
    sel = np.linalg.norm(px - guess, axis=1) < NEAR
    return px[sel].mean(0) if sel.sum() > 50 else guess


def build(name):
    mid, *guess = CAST[name]
    C = bc.CHARACTERS['cast_' + name]
    P, N, UV, IDX, _ = bc.read_glb(MESHY / f'{name}_remesh.glb')
    P = P - np.array([(P[:, 0].min() + P[:, 0].max()) / 2, P[:, 1].min(), (P[:, 2].min() + P[:, 2].max()) / 2], np.float32)
    tex = np.asarray(Image.open(CHARS / f'cast_{name}_texture.jpg').convert('RGB')).astype(np.float32)
    n = tex.shape[0]
    px = tex.reshape(-1, 3)
    refs = [refine(px, rgb(g)) if g else None for g in guess]          # fur, light, shirt
    live = [r for r in refs if r is not None]
    dist = np.stack([np.linalg.norm(px - r, axis=1) for r in live], 1)
    near = dist.argmin(1)
    w = np.zeros((len(px), 3), np.float32)                              # fur, light, shirt
    for k, j in zip([k for k in range(3) if refs[k] is not None], range(len(live))):
        w[:, k] = (near == j) * (1 - smooth(NEAR, FAR, dist[:, j]))
    if refs[2] is not None:   # the shirt sits on the body: between the feet and just under the neck
        neck = dict((b[0], b[2]) for b in C['bones'])['head'][1]
        hy = height_map(P, UV, IDX, n).reshape(-1)
        w[:, 2] *= 1 - smooth(neck + 0.02, neck + 0.08, hy)
    out = np.stack([w[:, 0], w[:, 2], w[:, 1]], 1).reshape(n, n, 3)     # red fur, green shirt, blue light
    path = CHARS / f'cast_{name}_regions.png'
    Image.fromarray((out * 255).round().astype(np.uint8), 'RGB').save(path, optimize=True)
    recolor = {k: [int(round(v)) for v in r] for k, r in zip(('fur', 'light', 'shirt'), refs) if r is not None}
    share = {k: round(float((w[:, i] > 0.5).mean()), 3) for i, k in enumerate(('fur', 'light', 'shirt'))}
    print(f'{name} ({mid}): {recolor}  texels {share}  -> {path.name}')
    return mid, recolor, 'models/characters/' + path.name


def main():
    names = sys.argv[1:] or list(CAST)
    done = {mid: (rec, reg) for mid, rec, reg in map(build, names)}
    lines = MANIFEST.read_text(encoding='utf-8').split('\n')
    for i, l in enumerate(lines):
        s = l.strip()
        if not s.startswith('{"id":'): continue
        e = json.loads(s.rstrip(','))
        if e['id'] not in done: continue
        e['recolor'], e['regions'] = done[e['id']]
        e['spriteColors'] = 16   # 3 key regions x 3 shades leave 7 colours for eyes, blush, markings
        lines[i] = l[:len(l) - len(l.lstrip())] + json.dumps(e, ensure_ascii=False, separators=(',', ':')) + (',' if s.endswith(',') else '')
    MANIFEST.write_text('\n'.join(lines), encoding='utf-8')
    json.loads(MANIFEST.read_text(encoding='utf-8'))


if __name__ == '__main__':
    main()
