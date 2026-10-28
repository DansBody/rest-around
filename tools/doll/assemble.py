"""Put a pixel paper doll together from its cut-out parts and write a game sprite sheet (GBA style: the parts are
pixel art drawn once, the motion is parts moving by whole pixels, no rotation).

    python tools/doll/assemble.py <spec.json> <sprite_id> [--cell 112]

<spec.json> names each direction's parts folder from the repo root (and, under "strips", clips drawn whole:
{"Walk": {"parts": <pixelparts cut of a strip>, "seconds": 0.8}} replace the assembled ones), {"f": {"parts": "design/paper_doll/pixel/front_v1"},
"b": {"parts": ...}}; each folder holds its names.json.

Each parts folder is what tools/doll/pixelparts.py wrote (sheet.png, pieces.json). names.json maps roles to piece numbers
and, for the parts of the standing figure, a rough spot in the assembled figure ("full") read off by eye:

    {"full": 1, "head": [2, 2, 0], "torso": [3, 13, 44], "armNear": [4, 9, 50], ..., "legBent": 8,
     "armFwd": 11, "armBack": 10}

Template matching within a few pixels of that spot gives each part's rest offset (a free search across the whole
figure gets fooled by what covers the part); clips are built from those offsets (CLIPS below). Writes assets/sprites/<id>/<id>.png (+ .json in the baked sheets' format,
on the 64x96 doll grid) so SpriteView plays it like any baked sheet; clips it lacks fall back to Idle.
"""
import json, sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2]
GRID = {'canvas': 64, 'ppu': 24, 'ground': 90, 'elev': 18, 'turn': 0.5, 'height': 96}
INK = (0x1F, 0x2A, 0x4A)
COLS = 16

# draw order, back to front (the far limbs behind the near ones and the torso, the near arm over it, the head on top)
ORDER = ['legFar', 'armFar', 'legNear', 'torso', 'armNear', 'head']


def piece(sheet, p):
    x, y, w, h = p['box']
    return sheet[y:y + h, x:x + w].copy()


def match(full, part, gx, gy, r=5):
    """Offset of part near (gx, gy) inside full where the most of its opaque pixels agree in colour."""
    H, W = full.shape[:2]; h, w = part.shape[:2]
    m = part[..., 3] > 0
    best = (-1, gx, gy)
    for y in range(gy - r, gy + r + 1):
        for x in range(gx - r, gx + r + 1):
            y0, x0 = max(0, y), max(0, x); y1, x1 = min(H, y + h), min(W, x + w)
            sub = full[y0:y1, x0:x1]; pm = m[y0 - y:y1 - y, x0 - x:x1 - x]; pp = part[y0 - y:y1 - y, x0 - x:x1 - x]
            ok = (np.abs(sub[..., :3].astype(int) - pp[..., :3].astype(int)).sum(-1) < 40) & pm & (sub[..., 3] > 0)
            sc = int(ok.sum())
            if sc > best[0]: best = (sc, x, y)
    return best[1], best[2], best[0] / max(1, int(m.sum()))


def stamp(canvas, part, x, y):
    h, w = part.shape[:2]
    for yy in range(h):
        for xx in range(w):
            if part[yy, xx, 3] and 0 <= y + yy < canvas.shape[0] and 0 <= x + xx < canvas.shape[1]:
                canvas[y + yy, x + xx] = part[yy, xx]


# ------------------------------------------------------------------ poses
# A frame says, per role, how that part is posed; the body bob moves the torso, head and arms together.
#   legs: ('stand', lift) | ('move', dx, lift): the straight leg moved whole | ('squash', k, dx): the knee up, the
#         boot k pixels higher | ('shear', dx, lift): the straight leg slanted so the foot sits dx pixels forward (+x: she
#         faces right) of the hip, the boot moved whole | ('bent', lift): the bent-knee leg (the passing pose).
#         In the 3/4 view 'forward' is toward the camera too: a foot ahead sits lower on screen (lift < 0), one
#         behind higher, which is what keeps the two legs apart where they cross.
#   arms: ('stand',) | ('alt', 'armFwd' | 'armBack') hung from the same shoulder
# The far leg and arm are drawn a shade darker and behind the torso, GBA style, so the two sides read apart.
def idle():
    up, down = {}, {'bob': 1}
    return 2.4, [up, up, {'headOnly': 1}, {'headOnly': 1}, down, down, down, down]


def walk():
    # after the reference walk the user picked (design/paper_doll/pixel/README): the feet don't slide, they lift: one
    # foot stays planted while the other knee comes up (the shin shortens, the boot rises) and comes down; 8 frames of
    # 0.1 s, the body low on each contact and high when a foot is up, swaying a pixel over the planted foot, the arms
    # swinging against the legs. In the 3/4 view the foot ahead also sits a pixel lower (nearer the camera).
    M = lambda dx, lift=0: ('move', dx, lift)
    U = lambda k, dx=0: ('squash', k, dx)
    up = lambda dx=0: {'bob': -1, 'sway': dx}
    return 0.8, [
        {'legNear': M(1, -1), 'legFar': M(-1, 1), 'armNear': ('alt', 'armBack'), 'armFar': ('alt', 'armFwd'), 'bob': 1},  # contact
        {'legNear': M(0, 0), 'legFar': U(3), 'sway': -1},                                                               # far knee up
        {'legNear': M(0, 0), 'legFar': U(6, 1), **up(-1)},                                                             # highest
        {'legNear': M(0, 0), 'legFar': U(3, 1), 'sway': -1},                                                           # coming down
        {'legNear': M(-1, 1), 'legFar': M(1, -1), 'armNear': ('alt', 'armFwd'), 'armFar': ('alt', 'armBack'), 'bob': 1},  # contact
        {'legNear': U(3), 'legFar': M(0, 0), 'sway': 1},                                                               # near knee up
        {'legNear': U(6, 1), 'legFar': M(0, 0), **up(1)},
        {'legNear': U(3, 1), 'legFar': M(0, 0), 'sway': 1},
    ]


CLIPS = {'Idle': idle, 'Walk': walk}


def top_centre(img):
    """x of the middle of a part's top rows (where it hangs from: hip or shoulder)."""
    ys, xs = np.where(img[:3, :, 3] > 0)
    return xs.mean() if len(xs) else img.shape[1] / 2


def shear(leg, dx):
    """The straight leg slanted: rows above the boot slide 0..dx, the boot slides dx whole. Returns (img, x shift)."""
    h, w = leg.shape[:2]
    rgb = leg[..., :3].astype(int)
    brown = (leg[..., 3] > 0) & (rgb[..., 0] > 90) & (rgb[..., 0] > rgb[..., 2] + 25)
    rows = np.where(brown.sum(1) >= 3)[0]
    boot = int(rows[0]) if len(rows) else h * 2 // 3
    lo = min(0, dx)
    out = np.zeros((h, w + abs(dx), 4), np.uint8)
    for y in range(h):
        sx = round(dx * min(1, y / max(1, boot))) - lo
        out[y, sx:sx + w] = np.where(leg[y, :, 3:] > 0, leg[y], out[y, sx:sx + w])
    return out, lo


def boot_top(leg):
    rgb = leg[..., :3].astype(int)
    brown = (leg[..., 3] > 0) & (rgb[..., 0] > 90) & (rgb[..., 0] > rgb[..., 2] + 25)
    rows = np.where(brown.sum(1) >= 3)[0]
    return int(rows[0]) if len(rows) else leg.shape[0] * 2 // 3


def swap_boot(leg, donor):
    """The leg down to its ankle, then the donor's boot, lined up on the middle of the ankle."""
    a, b = boot_top(leg), boot_top(donor)
    mid = lambda img, y: np.where(img[y, :, 3] > 0)[0].mean()
    shift = round(mid(leg, a - 1) - mid(donor, b - 1))           # donor x -> leg x
    lo, hi = min(0, shift), max(leg.shape[1], donor.shape[1] + shift)
    h = a + donor.shape[0] - b
    out = np.zeros((h, hi - lo, 4), np.uint8)
    out[:a, -lo:-lo + leg.shape[1]] = leg[:a]
    boot = donor[b:]
    region = out[a:, shift - lo:shift - lo + donor.shape[1]]
    region[boot[..., 3] > 0] = boot[boot[..., 3] > 0]
    return out


def squash(leg, k):
    """The knee coming up, seen from the front: k rows of shin above the boot taken out, so the boot rises k pixels
    under a hip that stays put."""
    if k <= 0: return leg
    rgb = leg[..., :3].astype(int)
    brown = (leg[..., 3] > 0) & (rgb[..., 0] > 90) & (rgb[..., 0] > rgb[..., 2] + 25)
    rows = np.where(brown.sum(1) >= 3)[0]
    boot = int(rows[0]) if len(rows) else leg.shape[0] * 2 // 3
    cut = max(1, boot - k - 3)                       # just above the ankle, under the knee
    return np.concatenate([leg[:cut], leg[cut + k:]], 0)


def darken(img, ramp):
    out = img.copy()
    m = out[..., 3] > 0
    for y, x in zip(*np.where(m)):
        out[y, x, :3] = ramp.get(tuple(int(v) for v in out[y, x, :3]), out[y, x, :3])
    return out


def shade_ramp(colours, k=0.86):
    """Each colour -> the existing colour of the same hue nearest to it darkened by k (keeps the palette small and the
    cream sleeve cream, not tan); the ink stays."""
    cs = np.array([c for c in colours if c != INK], np.float32)
    lum, chroma = cs.sum(1), cs / np.maximum(cs.sum(1, keepdims=True), 1)
    ramp = {}
    for i, c in enumerate(cs):
        d = np.abs(lum - lum[i] * k) / 765 + 4 * np.abs(chroma - chroma[i]).sum(1) + (lum >= lum[i]) * 9
        ramp[tuple(int(v) for v in c)] = tuple(int(v) for v in cs[d.argmin()]) if d.min() < 9 else tuple(int(v) for v in c)
    return ramp


def build(pdir, names, away=False):
    """One direction's frames: {clip: (seconds, [(cell, anchors), ...])}. away: walking away from the camera (the
    back view), where the foot ahead sits higher on screen, not lower."""
    sheet = np.array(Image.open(pdir / 'sheet.png').convert('RGBA'))
    meta = json.loads((pdir / 'pieces.json').read_text())
    P = {p['n']: p for p in meta['pieces']}
    num = lambda v: v[0] if isinstance(v, list) else v
    parts = {role: piece(sheet, P[num(v)]) for role, v in names.items() if isinstance(v, (int, list)) and role != 'flip'}   # the rest are options
    for role in names.get('flip', []):          # a pose the sheet only drew the other way round
        parts[role] = parts[role][:, ::-1].copy()
    full = parts['full']
    # the front sheet's near leg leans its knee in toward the other one (knock-kneed: 內八); both legs can use the
    # far leg's straight drawing instead
    if names.get('legsStraight'):
        parts['legNear'] = parts['legFar'].copy()
    # standing legs whose boots face the camera take the boot of a leg that points the way she walks
    if names.get('bootFrom'):
        donor = parts[names['bootFrom']]
        for leg in ('legNear', 'legFar'):
            parts[leg] = swap_boot(parts[leg], donor)
    rest = {}
    for role in ORDER:
        x, y, sc = match(full, parts[role], *names[role][1:])
        rest[role] = (x, y)
        print(f'  {role}: at {x},{y} ({sc:.0%} of its pixels agree)')
    colours = {tuple(int(v) for v in c) for c in sheet[sheet[..., 3] > 0][:, :3]}
    ramp = shade_ramp(colours)
    # where the figure sits in the cell: centred, boot soles on the ground row
    fh, fw = full.shape[:2]
    ox, oy = (GRID['canvas'] - fw) // 2, GRID['ground'] - fh
    out = {}
    for cname, fn in CLIPS.items():
        dur, frames = fn()
        cells = []
        for fr in frames:
            cv = np.zeros((GRID['height'], GRID['canvas'], 4), np.uint8)
            for role in ORDER:
                img, (x, y) = parts[role], rest[role]
                spec = fr.get(role, ('stand', 0) if role.startswith('leg') else ('stand',))
                if role.startswith('leg'):
                    if spec[0] == 'squash':
                        img = squash(parts[role], spec[1]); x += spec[2]
                    elif spec[0] == 'move':
                        x += spec[1]; y -= -spec[2] if away else spec[2]
                    elif spec[0] == 'shear':
                        img, lo = shear(parts[role], spec[1]); x += lo; y -= spec[2]
                    elif spec[0] == 'bent':
                        b = parts['legBent']
                        x += round(top_centre(parts[role]) - top_centre(b)); y -= spec[1]; img = b
                    else:
                        y -= spec[1]
                elif role.startswith('arm') and spec[0] == 'alt':
                    a_ = parts[spec[1]]; x += round(top_centre(parts[role]) - top_centre(a_)); img = a_
                if role in ('torso', 'head', 'armNear', 'armFar'): y += fr.get('bob', 0); x += fr.get('sway', 0)
                if role == 'head': y += fr.get('headOnly', 0)
                if role.endswith('Far'): img = darken(img, ramp)
                stamp(cv, img, ox + x, oy + y)
            blobs, nb = ndimage.label(cv[..., 3] > 0, structure=np.ones((3, 3)))
            if nb > 1:                       # stray pixels a moved part leaves behind
                size = np.bincount(blobs.ravel()); size[0] = 0
                cv[(size[blobs] < 8) & (blobs > 0)] = 0
            hx, hy = rest['head']; hp = parts['head']
            top = int(np.where(cv[..., 3].any(1))[0][0])
            anchors = {'head': [ox + hx + hp.shape[1] / 2, oy + hy + hp.shape[0] * 0.9, 0.3], 'headY': 0.88,
                       'hand': [ox + rest['armNear'][0] + parts['armNear'].shape[1] / 2, oy + rest['armNear'][1] + parts['armNear'].shape[0], 0.55],
                       'tray': [ox + fw * 0.62, oy + rest['torso'][1] + parts['torso'].shape[0] * 0.45, 0.9], 'top': top}
            cells.append((cv, anchors))
        out[cname] = (dur, cells)
    return out


def strip(pdir, seconds, anchors, n=8):
    """A clip drawn whole (tools/doll/pixelparts.py cut of a gpt-image strip of n frames, left to right): the strip is
    split at the emptiest columns between the frames (hair tips may touch the next frame), each frame keeps its own
    blobs, and is set in a cell with its soles on the ground row and its head over the same x as every other
    frame's (the head is the steady part of a walk; the feet move)."""
    sheet = np.array(Image.open(pdir / 'sheet.png').convert('RGBA'))
    solid = sheet[..., 3] > 0
    cols = np.where(solid.any(0))[0]
    x0, x1 = cols[0], cols[-1] + 1
    occ = solid.sum(0).astype(float)
    fw = (x1 - x0) / n
    cuts = [x0]
    for k in range(1, n):
        lo, hi = int(x0 + fw * (k - 0.3)), int(x0 + fw * (k + 0.3))
        cuts.append(lo + int(np.argmin(occ[lo:hi])))
    cuts.append(x1)
    cells = []
    for k in range(n):
        img = sheet[:, cuts[k]:cuts[k + 1]].copy()
        blobs, nb = ndimage.label(img[..., 3] > 0, structure=np.ones((3, 3)))
        size = np.bincount(blobs.ravel()); size[0] = 0
        img[(size[blobs] < 0.2 * size.max()) & (blobs > 0)] = 0        # the neighbour's hair tips over the cut
        ys, xs = np.where(img[..., 3] > 0)
        img = img[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
        h, w = img.shape[:2]
        hy, hx = np.where(img[:int(h * 0.35), :, 3] > 0)
        cv = np.zeros((GRID['height'], GRID['canvas'], 4), np.uint8)
        stamp(cv, img, round(GRID['canvas'] / 2 - hx.mean()), GRID['ground'] - h)
        cells.append((cv, dict(anchors, top=int(np.where(cv[..., 3].any(1))[0][0]))))
    print(f'  strip {pdir.name}: {len(cells)} frames, widths {[cuts[k + 1] - cuts[k] for k in range(n)]}')
    return seconds, cells


def main():
    spec, cid = json.loads(Path(sys.argv[1]).read_text()), sys.argv[2]
    if '--cell' in sys.argv:          # a taller figure than the doll grid's: same feet margin, taller cell
        h = int(sys.argv[sys.argv.index('--cell') + 1])
        GRID.update(height=h, ground=h - 6)
    dirs = {}
    for d in ('f', 'b'):
        if d not in spec: continue
        print(d)
        pdir = ROOT / spec[d]['parts']
        dirs[d] = build(pdir, json.loads((pdir / spec[d].get('names', 'names.json')).read_text()), away=d == 'b')
        for cname, st in spec[d].get('strips', {}).items():      # a clip drawn whole, frame by frame
            dirs[d][cname] = strip(ROOT / st['parts'], st.get('seconds', 0.8), dirs[d]['Idle'][1][0][1], st.get('frames', 8))
    clips, cells = {}, []
    for cname in CLIPS:
        dur, fcells = dirs['f'][cname]
        clips[cname] = {'n': len(fcells), 'duration': dur, 'fps': round(len(fcells) / dur, 3), 'frames': {}, 'anchors': {}}
        for d in ('f', 'b'):
            if d not in dirs:               # no back view yet: the front stands in for it
                clips[cname]['frames'][d], clips[cname]['anchors'][d] = clips[cname]['frames']['f'], clips[cname]['anchors']['f']
                continue
            clips[cname]['frames'][d], clips[cname]['anchors'][d] = [], []
            for cv, anchors in dirs[d][cname][1]:
                k = len(cells); cells.append(cv)
                clips[cname]['frames'][d].append([(k % COLS) * GRID['canvas'], (k // COLS) * GRID['height'], GRID['canvas'], GRID['height']])
                clips[cname]['anchors'][d].append(anchors)
    rows = (len(cells) + COLS - 1) // COLS
    atlas = np.zeros((rows * GRID['height'], COLS * GRID['canvas'], 4), np.uint8)
    for k, cv in enumerate(cells):
        x, y = (k % COLS) * GRID['canvas'], (k // COLS) * GRID['height']
        atlas[y:y + GRID['height'], x:x + GRID['canvas']] = cv
    # palette: every opaque colour, the ink last (SpriteView indexes the PNG by these)
    cols = sorted({tuple(int(v) for v in c) for c in atlas[atlas[..., 3] > 0][:, :3]} - {INK})
    palette = ['#%02x%02x%02x' % c for c in cols] + ['#%02x%02x%02x' % INK]
    if len(palette) > 31: sys.exit(f'{len(palette)} colours: the game takes 31 (cut the back view with --palette from the front)')
    out = ROOT / 'assets' / 'sprites' / cid
    out.mkdir(parents=True, exist_ok=True)
    Image.fromarray(atlas, 'RGBA').save(out / f'{cid}.png', optimize=True)
    (out / f'{cid}.json').write_text(json.dumps({'id': cid, 'image': f'{cid}.png', 'size': [atlas.shape[1], atlas.shape[0]], 'grid': GRID,
                                                 'dirs': ['f', 'b'], 'palette': palette, 'clips': clips}, separators=(',', ':')))
    print(f'{cid}: {len(cells)} frames, {len(palette)} colours -> {out}')


if __name__ == '__main__':
    main()
