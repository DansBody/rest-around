"""The cast's signature accessories (design/cast/accessories/accessory_sheet_v1.png), modelled from code. Run headless:
    blender -b --factory-startup -t 2 --python tools/blender/signatures.py -- <out_dir> [name ...]
then build each one into the wardrobe (tools/build_signatures.sh does both):
    python tools/build_accessory.py sig_<name> <out_dir>/sig_<name>.gltf --slot head|neck
Flat base colours, no textures; each item aborts (writes nothing) past its triangle / byte budget. Shapes are chunky on
purpose: the characters are about 54 px tall in the café, so thin parts and small details vanish. Sizes are free here
(build_accessory scales every item to width 1 and the wardrobe fits it to the head): only the proportions count.
The rings (sweatband, goggles strap, headscarf, nightcap cuff) are ovals DEPTH times as deep as wide, like the cast's
heads (about 0.86-0.9, measured from the Cast*.gltf head vertices), so they hug the head at the height they sit.
"""
import math, os, sys
import bmesh
from mathutils import Vector, Matrix

sys.path.insert(0, os.path.dirname(__file__))
from kit import Kit, T, RX, RY, RZ  # noqa: E402

args = sys.argv[sys.argv.index('--') + 1:]
out = os.path.abspath(args[0])
only = set(args[1:])
MAX_TRIS, MAX_BYTES = 2500, 150_000


def S(x, y, z): return Matrix.Diagonal((x, y, z, 1))


def blob(k, M, m, seg=12, rings=8):
    """A unit sphere moved by M (any affine: squash, turn, place)."""
    g = bmesh.ops.create_uvsphere(k.bm, u_segments=seg, v_segments=rings, radius=1)
    for v in g['verts']:
        v.co = M @ v.co
    k._tag({f for v in g['verts'] for f in v.link_faces}, m)


def ring(k, rc, h, t, depth, mat_of, seg=36, z0=0.0, sides=10):
    """An oval band round the vertical axis: centre-line radius rc (y squashed by depth), height h, half-thickness t,
    a rounded cross-section; mat_of(segment) picks each segment's material (stripes). Bottom at z0."""
    bm, rings_ = k.bm, []
    sec = []
    for i in range(sides):   # a rounded rectangle (superellipse) across the band
        a = 2 * math.pi * i / sides
        c, s = math.cos(a), math.sin(a)
        sec.append((t * math.copysign(abs(c) ** 0.6, c), h / 2 * math.copysign(abs(s) ** 0.6, s)))
    for j in range(seg):
        a = 2 * math.pi * j / seg
        rings_.append([bm.verts.new(((rc + dr) * math.cos(a), (rc + dr) * math.sin(a) * depth, z0 + h / 2 + dz)) for dr, dz in sec])
    for j in range(seg):
        A, B = rings_[j], rings_[(j + 1) % seg]
        fs = [bm.faces.new((A[i], A[(i + 1) % sides], B[(i + 1) % sides], B[i])) for i in range(sides)]
        k._tag(fs, mat_of(j))


def tube(k, path, radius, mat_of, sides=10, caps=True):
    """A circle swept along path; radius(i) or a number; mat_of(i) picks each band's material."""
    bm, rr = k.bm, []
    path = [Vector(p) for p in path]
    for i, (p, (t, n, b)) in enumerate(zip(path, Kit.frames(path))):
        r = radius(i) if callable(radius) else radius
        rr.append([bm.verts.new(p + (n * math.cos(a) + b * math.sin(a)) * r) for a in (2 * math.pi * q / sides for q in range(sides))])
    for i in range(len(rr) - 1):
        fs = [bm.faces.new((rr[i][q], rr[i][(q + 1) % sides], rr[i + 1][(q + 1) % sides], rr[i + 1][q])) for q in range(sides)]
        k._tag(fs, mat_of(i))
    if caps:
        k._tag([bm.faces.new(rr[0][::-1])], mat_of(0))
        k._tag([bm.faces.new(rr[-1])], mat_of(len(rr) - 2))


def shots(target, d):
    return [('front', target, 0, 8, d), ('three_q', target, -40, 28, d), ('side', target, 90, 8, d)]


# ---------------------------------------------------------------------------------------------- the items
def clock():
    """Hamster: a little brass twin-bell alarm clock on a hair clip, hands at XII (Time Pause)."""
    k = Kit({'brass': '#d4a440', 'face': '#fbf3df', 'ink': '#4a3324', 'clip': '#6b4a33'}, seg=24)
    cz = 0.42   # the clock's centre
    face_on = T(0, 0, cz) @ RX(90)   # local z -> front (-Y)
    k.lathe([(0, -0.1), (0.27, -0.1), (0.31, -0.06), (0.31, 0.06), (0.28, 0.1), (0.25, 0.1), (0.25, 0.08), (0, 0.08)], 'brass', face_on)
    k.lathe([(0, 0.085), (0.245, 0.085)], 'face', face_on)
    # hands: the long one at XII, the short one just before it
    k.box((0, -0.105, cz + 0.085), (0.045, 0.02, 0.19), 'ink', bevel=0.012)
    k.box((0, 0, 0), (0.04, 0.02, 0.13), 'ink', bevel=0.012, M=T(0, -0.11, cz) @ RY(-30) @ T(0, 0, 0.055))
    blob(k, T(0, -0.11, cz) @ S(0.035, 0.02, 0.035), 'ink', 8, 6)
    for sx in (-1, 1):   # bells, tipped outwards, and the stubby feet
        blob(k, T(sx * 0.18, 0, cz + 0.29) @ RY(sx * 35) @ S(0.13, 0.12, 0.09), 'brass')
        blob(k, T(sx * 0.17, 0, 0.12) @ S(0.06, 0.06, 0.07), 'ink', 8, 6)
    blob(k, T(0, 0, cz + 0.34) @ S(0.045, 0.045, 0.05), 'ink', 8, 6)   # the hammer between the bells
    k.box((0, 0, 0.04), (0.42, 0.26, 0.08), 'clip', bevel=0.035)      # the clip it stands on
    return k, 'head', shots((0, 0, 0.4), 2.6)


def sweatband():
    """Fox: a thick denim-blue terry sweatband (Sprint)."""
    k = Kit({'band': '#3f64b0'})
    ring(k, 0.5 - 0.07, 0.19, 0.07, 0.88, lambda j: 'band', seg=40)
    return k, 'head', shots((0, 0, 0.1), 2.4)


def rose():
    """Sheep: one big pink rose with two leaves, facing up (the wardrobe tips it to the front)."""
    k = Kit({'petal': '#f29aac', 'inner': '#e37590', 'leaf': '#6fae68'})
    blob(k, T(0, 0, 0.27) @ S(0.13, 0.13, 0.12), 'inner')
    # the rolled heart of the rose: a ridge spiralling in over the bud
    tube(k, [(0.13 * (1 - q / 24) * math.cos(q * 0.62), 0.13 * (1 - q / 24) * math.sin(q * 0.62), 0.36 + 0.03 * q / 24) for q in range(25)],
         lambda i: 0.032 - 0.0008 * i, lambda i: 'petal', sides=6)
    for i in range(5):   # inner petals, standing up round the bud
        a = 2 * math.pi * i / 5
        blob(k, T(0.13 * math.cos(a), 0.13 * math.sin(a), 0.22) @ RZ(math.degrees(a)) @ RY(-12) @ S(0.06, 0.15, 0.16), 'inner', 10, 7)
    for i in range(7):   # outer petals, lower and wider, opening out
        a = 2 * math.pi * (i + 0.5) / 7
        blob(k, T(0.24 * math.cos(a), 0.24 * math.sin(a), 0.13) @ RZ(math.degrees(a)) @ RY(-38) @ S(0.07, 0.17, 0.16), 'petal', 10, 7)
    for a in (200, 330):   # two leaves under it
        r = math.radians(a)
        blob(k, T(0.36 * math.cos(r), 0.36 * math.sin(r), 0.04) @ RZ(a) @ S(0.2, 0.1, 0.035), 'leaf', 10, 6)
    return k, 'head', shots((0, 0, 0.12), 2.2)


def goggles():
    """Calico: brass-rimmed goggles pushed up on a brown strap (spots trouble coming)."""
    k = Kit({'strap': '#6b4630', 'brass': '#d4a440', 'lens': '#2c3442', 'shine': '#9fb8d8'})
    D = 0.87
    ring(k, 0.5 - 0.05, 0.12, 0.05, D, lambda j: 'strap', seg=40)
    for sx in (-1, 1):   # two lenses on the front of the strap, looking forward and up
        M = T(sx * 0.17, -D * 0.5 - 0.02, 0.07) @ RX(90 - 35)
        k.lathe([(0, -0.02), (0.1, -0.02), (0.135, 0.0), (0.135, 0.07), (0.115, 0.09), (0.1, 0.075), (0, 0.075)], 'brass', M, seg=20)
        k.lathe([(0, 0.078), (0.1, 0.078)], 'lens', M, seg=20)
        blob(k, M @ T(-0.035, 0.035, 0.082) @ S(0.03, 0.02, 0.008), 'shine', 8, 4)
    k.box((0, -D * 0.5 - 0.03, 0.08), (0.1, 0.06, 0.05), 'brass', bevel=0.02)   # the bridge
    return k, 'head', shots((0, -0.2, 0.08), 2.4)


STRIPE_A, STRIPE_B = '#6c9be0', '#f5f8fc'


def headscarf():
    """Raccoon: a blue-and-white striped headscarf with a bow knotted on top at the front (washes cups)."""
    k = Kit({'blue': STRIPE_A, 'white': STRIPE_B})
    D = 0.86
    stripe = lambda j: 'blue' if (j // 2) % 2 == 0 else 'white'
    ring(k, 0.5 - 0.055, 0.17, 0.055, D, stripe, seg=40)
    front = Vector((0, -D * 0.5 + 0.03, 0.17))   # on the band's front, not in front of it
    for sx in (-1, 1):   # the bow's two loops, standing up from the knot like ears, leaning out
        pts = []
        for q in range(17):
            a = math.pi * 2 * q / 16
            u, w = 0.085 * math.sin(a), 0.13 * (1 - math.cos(a))   # across, along the loop
            pts.append(front + Vector((sx * (0.03 + 0.55 * w + 0.85 * u), -0.03, 0.05 + 0.85 * w - 0.55 * u)))
        tube(k, pts, lambda i: 0.045, lambda i: 'white' if i % 4 < 2 else 'blue', sides=8, caps=False)
    blob(k, T(*(front + Vector((0, -0.03, 0.06)))) @ S(0.06, 0.05, 0.06), 'blue', 10, 6)
    for sx in (-1, 1):   # two short tails hanging from the knot
        blob(k, T(*(front + Vector((sx * 0.07, -0.05, 0.0)))) @ RY(sx * 30) @ S(0.045, 0.025, 0.09), 'white', 8, 6)
    return k, 'head', shots((0, -0.2, 0.15), 2.4)


def bandana():
    """Dog: a denim-blue neckerchief with a white stitched edge, the point hanging down the chest (guards the café).
    Neck slot: the back of the item is its origin and goes on the front of the chest."""
    k = Kit({'denim': '#3f64b0', 'stitch': '#f5f1e6'})
    bm = k.bm
    rows, cols, depth, th = 7, 10, 0.62, 0.045
    curve = lambda x: 0.55 * x * x   # the sides wrap back round the body
    grid_f, grid_b = [], []
    for r in range(rows + 1):
        z = -depth * r / rows
        w = 0.5 * (1 - r / rows) + 0.015
        row_f, row_b = [], []
        for c in range(cols + 1):
            x = -w + 2 * w * c / cols
            y = curve(x) - 0.04 * (1 - r / rows)   # bulges out a little at the top, under the chin
            row_f.append(bm.verts.new((x, y - th, z)))
            row_b.append(bm.verts.new((x, y + th, z)))
        grid_f.append(row_f); grid_b.append(row_b)
    fs = []
    for r in range(rows):
        for c in range(cols):
            fs.append(bm.faces.new((grid_f[r][c], grid_f[r + 1][c], grid_f[r + 1][c + 1], grid_f[r][c + 1])))
            fs.append(bm.faces.new((grid_b[r][c + 1], grid_b[r + 1][c + 1], grid_b[r + 1][c], grid_b[r][c])))
    for r in range(rows):   # the side walls
        for c in (0, cols):
            fs.append(bm.faces.new((grid_f[r][c], grid_b[r][c], grid_b[r + 1][c], grid_f[r + 1][c])))
    for c in range(cols):   # top and the (very thin) bottom
        fs.append(bm.faces.new((grid_f[0][c + 1], grid_b[0][c + 1], grid_b[0][c], grid_f[0][c])))
        fs.append(bm.faces.new((grid_f[rows][c], grid_b[rows][c], grid_b[rows][c + 1], grid_f[rows][c + 1])))
    k._tag(fs, 'denim')
    for sx in (-1, 1):   # stitching along both lower edges, just inside them
        pts = []
        for q in range(9):
            r = q / 8
            z = -depth * (0.08 + 0.8 * r)
            w = 0.5 * (1 - (0.08 + 0.8 * r)) - 0.07
            x = sx * max(w, 0.0)
            pts.append((x, curve(x) - th - 0.012 - 0.04 * (1 - (0.08 + 0.8 * r)), z))
        tube(k, pts, 0.018, lambda i: 'stitch', sides=6)
    blob(k, T(0, -0.1, -0.03) @ S(0.11, 0.07, 0.085), 'denim')   # the knot under the chin
    for sx in (-1, 1):
        blob(k, T(sx * 0.12, -0.11, -0.07) @ RY(sx * 40) @ S(0.09, 0.04, 0.05), 'denim', 8, 6)
    return k, 'neck', shots((0, 0, -0.3), 2.2)


def icecube():
    """Penguin: an ice cube with a striped bendy straw stuck in it (cold drinks). Opaque: the sprite can't do glass."""
    k = Kit({'ice': '#bfe2f6', 'shine': '#f4fbff', 'blue': '#4d7fd0', 'white': '#f5f8fc'})
    k.box((0, 0, 0.22), (0.46, 0.46, 0.44), 'ice', bevel=0.09, segs=3)
    blob(k, T(-0.12, -0.235, 0.32) @ S(0.07, 0.015, 0.1), 'shine', 8, 6)   # a highlight on the front
    blob(k, T(0.14, -0.1, 0.445) @ S(0.08, 0.06, 0.012), 'shine', 8, 6)    # and on the top
    pts = [Vector((0.03, 0.02, 0.3 + 0.05 * i)) for i in range(7)]           # up out of the cube...
    c = Vector((0.03 + 0.12, 0.02, 0.6))
    pts += [c + Vector((-0.12 * math.cos(a), 0, 0.12 * math.sin(a))) for a in (math.pi / 2 * q / 6 for q in range(1, 7))]  # ...bending over
    pts += [c + Vector((0.05 * q, 0, 0.12)) for q in range(1, 4)]
    tube(k, pts, 0.045, lambda i: 'blue' if (i // 2) % 2 == 0 else 'white', sides=10)
    return k, 'head', shots((0.05, 0, 0.35), 2.4)


def bakercap():
    """Bear: a white baker's kerchief cap over the crown, knotted at the back on one side (bakes faster)."""
    k = Kit({'cloth': '#f6f3ec', 'shade': '#e4ddd0'})
    D, Hz, n = 0.88, 0.34, 10
    # one skin (the material is double-sided and the head fills it), from the hem up to the crown
    dome = [(0.5 * math.cos(math.pi / 2 * q / n), Hz * math.sin(math.pi / 2 * q / n)) for q in range(n)] + [(0, Hz)]
    k.lathe(dome, 'cloth', S(1, D, 1), seg=36)
    ring(k, 0.5 - 0.03, 0.07, 0.035, D, lambda j: 'shade', seg=36)   # the turned hem
    knot = Vector((0.4, 0.22, 0.1))   # on the right side, towards the back: it shows in the café's 3/4 view
    blob(k, T(*knot) @ S(0.12, 0.1, 0.1), 'cloth')
    for a, l in ((-40, 0.22), (20, 0.19)):   # two tails sticking out from the knot
        blob(k, T(*(knot + Vector((0.08, 0.04, -0.02)))) @ RZ(20) @ RY(a) @ T(l * 0.7, 0, 0) @ S(l, 0.04, 0.075), 'cloth', 10, 6)
    return k, 'head', shots((0, 0, 0.15), 2.4)


def nightcap():
    """Owl: a floppy denim sleeping cap with a crescent moon on the tip (the night shift)."""
    k = Kit({'cap': '#3e5ea8', 'cuff': '#5a7bc4', 'moon': '#f2c230'})
    D = 0.9
    ring(k, 0.5 - 0.075, 0.17, 0.075, D, lambda j: 'cuff', seg=40)
    # the cone: up from inside the cuff, flopping over to the right
    pts, n = [], 16
    for q in range(n + 1):
        s = q / n
        a = math.radians(105 * s ** 1.6)   # how far it has bent over
        pts.append(Vector((0.5 * math.sin(a) * s ** 0.5, 0, 0.08 + 0.85 * s - 0.4 * s ** 3)))
    rad = lambda i: 0.44 * (1 - i / (n + 1)) ** 1.15 + 0.03
    bm0 = len(k.bm.verts)
    tube(k, pts, rad, lambda i: 'cap', sides=20)
    k.bm.verts.ensure_lookup_table()
    for v in k.bm.verts[bm0:]:
        v.co.y *= D
    tip = pts[-1]
    moon = []   # a crescent: a tapered arc hanging off the tip
    for q in range(11):
        a = math.radians(-60 + 200 * q / 10)
        moon.append(tip + Vector((0.06 + 0.1 * math.cos(a), -0.02, -0.1 + 0.1 * math.sin(a))))
    tube(k, moon, lambda i: 0.012 + 0.045 * math.sin(math.pi * i / 10), lambda i: 'moon', sides=8)
    return k, 'head', shots((0.1, 0, 0.3), 2.6)


ITEMS = {'clock': clock, 'sweatband': sweatband, 'rose': rose, 'goggles': goggles, 'headscarf': headscarf,
         'bandana': bandana, 'icecube': icecube, 'bakercap': bakercap, 'nightcap': nightcap}
for name, make in ITEMS.items():
    if only and name not in only:
        continue
    k, slot, views = make()
    k.finish('sig_' + name, out, max_tris=MAX_TRIS, max_bytes=MAX_BYTES, previews=views)
    print(f'[sig_{name}] slot {slot}')
