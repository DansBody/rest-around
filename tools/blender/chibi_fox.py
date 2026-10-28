"""Fox-eared barista, modelled from code against design/chibi_creator/turnaround_v1.png (gpt-image sheet,
measured at 0.00217 game units per px, feet at y=936). Prototype for the character creator: hair is built
from swept locks, the face is a painted decal texture (eyes/brows/mouth/blush) so it can be swapped.
    blender -b --factory-startup -t 4 --python chibi_fox.py -- <out_dir>
"""
import math, os, sys
sys.path.insert(0, os.path.dirname(__file__))
import bpy, bmesh
from mathutils import Vector, Matrix
from kit import Kit, T, srgb_to_linear

out = os.path.abspath(sys.argv[sys.argv.index('--') + 1])
os.makedirs(out, exist_ok=True)
MAX_TRIS = 30000

C = Vector((0, 0.03, 1.31))            # skull centre
SK = Vector((0.30, 0.29, 0.32))        # skull half-extents (chin ~0.99, under the hair top ~1.63)

COL = {
    'skin': '#fbe1d0', 'hair': '#b77b48', 'cream': '#f6e7cf', 'shirt': '#fbfaf6', 'apron': '#4a3027',
    'trim': '#e3a72f', 'pants': '#5a3a2b', 'cuff': '#8b6a55', 'shoe': '#5b3424', 'sole': '#3a2219',
    'ear_in': '#f3d9bf', 'nose': '#f2c6b0',
}
k = Kit(COL, seg=28)


# ------------------------------------------------------------------ helpers
def ell(c, size, m, M=Matrix(), seg=16, rings=10):
    g = bmesh.ops.create_uvsphere(k.bm, u_segments=seg, v_segments=rings, radius=1)
    for v in g['verts']:
        v.co = M @ (Vector(c) + Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2])))
    k._tag({f for v in g['verts'] for f in v.link_faces}, m)


def at(c, R):
    """R applied about point c (for ell's M, which also moves its centre)."""
    return T(*c) @ R @ T(*(-Vector(c)))


def surf(x, z, lift=0.0, side=-1):
    """Point on the skull at local (x, z), front (side=-1) or back (+1), pushed out along the normal by lift."""
    s = max(0.0, 1 - (x / SK.x) ** 2 - (z / SK.z) ** 2)
    y = side * SK.y * math.sqrt(s)
    n = Vector((x / SK.x ** 2, y / SK.y ** 2, z / SK.z ** 2)).normalized()
    return C + Vector((x, y, z)) + n * lift, n


def bez(p0, p1, p2, n):
    return [(1 - t) ** 2 * p0 + 2 * (1 - t) * t * p1 + t * t * p2 for t in (i / (n - 1) for i in range(n))]


def lock(p0, p1, p2, w, th, m, n=9, sides=10, prof=None, centre=None):
    """A swept hair lock: flattened (w wide, th thick) cross-section along a quadratic curve, pointed tip.
    The flat side faces away from `centre` (the head) so the lock lies on the hair volume."""
    centre = centre or C
    path = bez(Vector(p0), Vector(p1), Vector(p2), n)
    prof = prof or [0.8, 1, 1, 0.97, 0.9, 0.78, 0.6, 0.36, 0.0]
    bm, rings = k.bm, []
    for i, p in enumerate(path):
        t = (path[min(i + 1, n - 1)] - path[max(i - 1, 0)]).normalized()
        o = (p - centre).normalized()
        b = (o - t * o.dot(t)).normalized()
        nn = t.cross(b)
        f = prof[min(i * (len(prof) - 1) // (n - 1), len(prof) - 1)]
        if f <= 0:
            rings.append([bm.verts.new(p)])
            continue
        # lens-shaped section: thicker in the middle, thin at the edges
        rings.append([bm.verts.new(p + nn * math.cos(a) * w * f + b * math.sin(a) * th * f * (0.6 + 0.4 * abs(math.sin(a))))
                      for a in (2 * math.pi * j / sides for j in range(sides))])
    faces = [bm.faces.new(rings[0][::-1])]
    for a, b_ in zip(rings, rings[1:]):
        for j in range(sides):
            jj = (j + 1) % sides
            faces.append(bm.faces.new((a[j], a[jj], b_[0])) if len(b_) == 1 else bm.faces.new((a[j], a[jj], b_[jj], b_[j])))
    k._tag(faces, m)


def tube(path, radii, m, sides=12):
    k.tube([Vector(p) for p in path], lambda i: radii[i], m, sides=sides)


def cap(theta, tilt, grow, m):
    prof = [(math.sin(math.radians(a)), math.cos(math.radians(a))) for a in range(0, theta + 1, 6)]
    prof += [(0.9 * r, 0.9 * z) for r, z in reversed(prof)]
    prof[0], prof[-1] = (0, 1), (0, 0.9)
    R = Vector((0, 0, 1)).rotation_difference(Vector(tilt).normalized()).to_matrix().to_4x4()
    k.lathe(prof, m, T(*C) @ Matrix.Diagonal((*(SK * grow), 1)) @ R)


def ring(c, r, tube_r, m, sx=1.0, sy=1.0, seg=24):
    pts = [Vector((c[0] + r * sx * math.cos(2 * math.pi * i / seg), c[1] + r * sy * math.sin(2 * math.pi * i / seg), c[2]))
           for i in range(seg + 1)]
    k.tube(pts, tube_r, m, sides=8)


# ------------------------------------------------------------------ head
ell(C, SK, 'skin', seg=32, rings=20)
ell(C + Vector((0, 0.06, -0.24)), (0.12, 0.12, 0.1), 'skin')                       # neck plug
p, n = surf(0, -0.1, 0.0)
ell(p, (0.022, 0.02, 0.016), 'nose')
for s in (-1, 1):                                                                   # human ears hidden by hair
    ell(C + Vector((0.29 * s, 0.03, -0.06)), (0.04, 0.05, 0.07), 'skin')

# hair volume: a shell open toward the face, then locks laid over it
cap(98, (0, 0.5, 1), 1.07, 'hair')
crown = C + Vector((0, 0.06, 0.36))
# fringe: heavy swept locks from the crown over the forehead, the middle one dropping between the eyes
for x, tipx, tipz, w, m in [(-0.2, -0.27, 0.0, 0.12, 'hair'), (-0.1, -0.16, 0.05, 0.12, 'cream'),
                            (-0.01, -0.05, -0.06, 0.1, 'hair'), (0.08, 0.07, 0.04, 0.12, 'hair'),
                            (0.17, 0.2, 0.04, 0.12, 'hair'), (0.24, 0.29, -0.02, 0.11, 'cream')]:
    a, _ = surf(x * 0.5, 0.31, 0.06)
    b, _ = surf(x * 1.05, 0.2, 0.085)
    c, _ = surf(tipx, tipz, 0.015)
    lock(a, b, c, w, 0.05, m)
# side locks over the cheeks down to the jaw, cream underneath
for s in (-1, 1):
    for y0, tipz, flare, w, m in [(-0.16, -0.33, 0.12, 0.08, 'cream'), (-0.08, -0.36, 0.17, 0.085, 'hair'),
                                  (0.02, -0.32, 0.2, 0.09, 'cream'), (0.1, -0.26, 0.2, 0.09, 'hair')]:
        a = C + Vector((0.24 * s, y0, 0.22))
        b = C + Vector((0.36 * s, y0 - 0.03, 0.02))
        c = C + Vector(((0.3 + flare) * s, y0 + 0.02, tipz))
        lock(a, b, c, w * 1.35, 0.05, m, centre=C + Vector((0, 0, 0.1)))
# back locks: long layered fall over the back of the head, cream tips layer underneath
for i in range(5):
    x = (i - 2) / 2
    for lay, m, drop, out_ in [(0, 'cream', -0.38, 0.35), (1, 'hair', -0.3, 0.41)]:
        a = C + Vector((x * 0.12, 0.12, 0.33 - lay * 0.02))
        b = C + Vector((x * 0.3, out_, 0.08))
        c = C + Vector((x * 0.4, out_ - 0.08, drop - abs(x) * 0.04))
        lock(a, b, c, 0.14, 0.055, m, centre=C + Vector((0, 0, 0.05)))
# top volume: locks radiating from the crown, tips flicking outward
for yaw in range(-156, 181, 26):
    if abs(yaw) < 30:
        continue
    d = Vector((math.sin(math.radians(yaw)), -math.cos(math.radians(yaw)), 0))
    a = crown
    b = C + d * 0.32 + Vector((0, 0, 0.3))
    c = C + d * 0.44 + Vector((0, 0, 0.04))
    lock(a, b, c, 0.15, 0.06, 'hair')
lock(crown, crown + Vector((0.02, -0.04, 0.13)), crown + Vector((0.1, 0.0, 0.12)), 0.035, 0.02, 'hair')     # ahoge
lock(crown, crown + Vector((-0.03, -0.0, 0.11)), crown + Vector((-0.09, 0.05, 0.08)), 0.03, 0.018, 'hair')

# fox ears: flattened cones, cream inner face and fluff
for s in (-1, 1):
    base = C + Vector((0.2 * s, 0.05, 0.3))
    R = Matrix.Rotation(math.radians(-22 * s), 4, 'Y') @ Matrix.Rotation(math.radians(6), 4, 'X')
    k.lathe([(0.12, 0), (0.11, 0.1), (0.07, 0.24), (0.02, 0.33), (0, 0.36)], 'hair',
            T(*base) @ R @ Matrix.Diagonal((1, 0.42, 1, 1)), seg=16)
    k.lathe([(0.075, 0), (0.06, 0.1), (0.03, 0.2), (0, 0.27)], 'ear_in',
            T(*(base + Vector((0.0, -0.035, 0.02)))) @ R @ Matrix.Diagonal((1, 0.25, 1, 1)), seg=12)
    for j in range(3):
        ell(base + R.to_3x3() @ Vector((0.03 * (j - 1), -0.05, 0.03 + 0.04 * j)), (0.04, 0.025, 0.05), 'cream')

# ------------------------------------------------------------------ body
S = lambda sx, sy: Matrix.Diagonal((sx, sy, 1, 1))
k.lathe([(0, 0.66), (0.15, 0.66), (0.16, 0.74), (0.18, 0.86), (0.19, 0.93), (0.15, 0.98), (0.08, 1.0), (0, 1.0)],
        'shirt', S(1.12, 0.85))
for s in (-1, 1):                                                                   # collar points
    ell((0.07 * s, -0.135, 0.96), (0.065, 0.025, 0.035), 'shirt', at((0.07 * s, -0.135, 0.96), Matrix.Rotation(math.radians(25 * s), 4, 'Y')))
# trousers: hips + legs + rolled cuffs
k.lathe([(0, 0.72), (0.16, 0.72), (0.18, 0.6), (0.19, 0.48), (0, 0.44)], 'pants', S(1.1, 0.85))
for s in (-1, 1):
    tube([(0.11 * s, 0, 0.55), (0.14 * s, -0.01, 0.38), (0.165 * s, -0.01, 0.22)], [0.11, 0.115, 0.115], 'pants')
    k.lathe([(0.12, 0.15), (0.13, 0.17), (0.13, 0.23), (0.12, 0.25)], 'cuff', T(0.165 * s, -0.01, 0), seg=20)
    # chunky shoe: rounded upper, thick sole, yellow laces
    ell((0.17 * s, -0.04, 0.1), (0.11, 0.15, 0.08), 'shoe')
    k.box((0.17 * s, -0.04, 0.03), (0.22, 0.31, 0.06), 'sole', bevel=0.025)
    for j in range(2):
        tube([(0.13 * s, -0.12 + 0.04 * j, 0.15 - 0.012 * j), (0.21 * s, -0.12 + 0.04 * j, 0.15 - 0.012 * j)],
             [0.012, 0.012], 'trim', sides=6)
# apron: a curved panel round the front, waist tie with a bow at the back, bib with straps
def panel(z0, z1, r0, r1, a0, a1, m, thick=0.02, sx=1.12, sy=0.85, nz=6, na=12):
    bm, grid = k.bm, []
    for side in (0, 1):
        rows = []
        for iz in range(nz + 1):
            t = iz / nz
            z, r = z0 + (z1 - z0) * t, r0 + (r1 - r0) * t + side * thick
            rows.append([bm.verts.new((r * sx * math.sin(a), -r * sy * math.cos(a), z))
                         for a in (math.radians(a0 + (a1 - a0) * j / na) for j in range(na + 1))])
        grid.append(rows)
    I, O = grid
    faces = []
    for iz in range(nz):
        for j in range(na):
            faces.append(bm.faces.new((O[iz][j], O[iz][j + 1], O[iz + 1][j + 1], O[iz + 1][j])))
            faces.append(bm.faces.new((I[iz][j + 1], I[iz][j], I[iz + 1][j], I[iz + 1][j + 1])))
    for iz in range(nz):
        for j in (0, na):
            faces.append(bm.faces.new((I[iz][j], O[iz][j], O[iz + 1][j], I[iz + 1][j])))
    for iz in (0, nz):
        for j in range(na):
            faces.append(bm.faces.new((I[iz][j], I[iz][j + 1], O[iz][j + 1], O[iz][j])))
    k._tag(faces, m)


panel(0.36, 0.7, 0.26, 0.2, -62, 62, 'apron')                     # skirt, flaring toward the hem
panel(0.7, 0.92, 0.2, 0.195, -38, 38, 'apron', nz=4, na=8)          # bib
panel(0.345, 0.37, 0.27, 0.268, -63, 63, 'trim', thick=0.026)       # hem trim
for s in (-1, 1):
    panel(0.36, 0.7, 0.268, 0.208, 61 * s - 1.5, 61 * s + 1.5, 'trim', thick=0.026, na=1)   # side trims
    tube([(0.1 * s, -0.17, 0.92), (0.12 * s, -0.12, 1.0), (0.12 * s, 0.05, 1.0), (0.1 * s, 0.17, 0.86), (0.08 * s, 0.17, 0.7)],
         [0.018] * 5, 'apron', sides=6)                             # straps over the shoulders
    ell((0.1 * s, -0.175, 0.905), (0.022, 0.012, 0.022), 'trim')     # buttons
tie = []                                                             # waist tie: hugs the apron in front, the shirt behind
for i in range(41):
    ang = 2 * math.pi * i / 40
    f = min(1.0, max(0.0, (math.cos(ang) - math.cos(math.radians(75))) / (math.cos(math.radians(50)) - math.cos(math.radians(75)))))
    r = 0.172 + (0.222 - 0.172) * f
    tie.append(Vector((r * 1.12 * math.sin(ang), -r * 0.85 * math.cos(ang), 0.7)))
k.tube(tie, 0.02, 'trim', sides=8)            # waist tie
ell((0, 0.19, 0.7), (0.04, 0.03, 0.035), 'trim')                     # bow knot
for s in (-1, 1):
    ell((0.07 * s, 0.2, 0.71), (0.065, 0.02, 0.04), 'trim', at((0.07 * s, 0.2, 0.71), Matrix.Rotation(math.radians(-15 * s), 4, 'Y')))
    tube([(0.02 * s, 0.2, 0.69), (0.05 * s, 0.22, 0.6), (0.06 * s, 0.215, 0.52)], [0.02, 0.018, 0.016], 'trim', sides=6)
panel(0.76, 0.84, 0.198, 0.197, -10, 10, 'trim', thick=0.022, nz=1, na=3)      # chest pocket
panel(0.46, 0.56, 0.255, 0.24, 14, 36, 'apron', thick=0.03, nz=2, na=4)        # skirt pocket

# arms (A-pose ~30 deg): puffed short sleeve, forearm, hand with fingers
for s in (-1, 1):
    sh, el, wr = Vector((0.18 * s, 0, 0.92)), Vector((0.3 * s, -0.01, 0.8)), Vector((0.39 * s, -0.03, 0.67))
    ell(sh, (0.085, 0.08, 0.08), 'shirt')
    tube([sh, (sh + el) / 2, el], [0.08, 0.085, 0.078], 'shirt')
    tube([el, wr], [0.058, 0.05], 'skin')
    d = (wr - el).normalized()
    palm = wr + d * 0.05
    ell(palm, (0.05, 0.03, 0.055), 'skin', Matrix.Translation(palm) @ Vector((0, 0, 1)).rotation_difference(d).to_matrix().to_4x4()
        @ Matrix.Translation(-palm))
    side = Vector((0, -1, 0)).cross(d).normalized()
    for j in range(4):
        b0 = palm + d * 0.04 + side * (0.03 * (j - 1.5)) + Vector((0, -0.005, 0))
        tube([b0, b0 + d * (0.045 - 0.006 * abs(j - 1.5)) + side * 0.004 * (j - 1.5)], [0.014, 0.012], 'skin', sides=6)
    tube([palm + Vector((0, -0.03, 0)), palm + Vector((0, -0.065, 0.0)) + d * 0.02], [0.016, 0.013], 'skin', sides=6)

# tail: big curve behind the right hip, cream tip
tail = bez(Vector((0.05, 0.18, 0.56)), Vector((0.3, 0.75, 0.38)), Vector((0.22, 0.42, 1.0)), 11)
tr = [0.05, 0.11, 0.16, 0.19, 0.2, 0.2, 0.19, 0.17, 0.14, 0.09, 0.0]
tube(tail[:8], tr[:8], 'hair', sides=18)
tube(tail[6:], [r * 1.04 for r in tr[6:]], 'cream', sides=18)


# ------------------------------------------------------------------ face decal (painted texture)
def paint_face_np(N=1024):
    """RGBA face texture over x in [-0.24, 0.24], z in [C.z-0.3, C.z+0.18]."""
    import numpy as np
    img = np.zeros((N, N, 4), np.float32)
    X0, X1, Z0, Z1 = -0.24, 0.24, C.z - 0.3, C.z + 0.18
    xs = np.linspace(X0, X1, N)[None, :]
    zs = np.linspace(Z1, Z0, N)[:, None]

    def over(mask, rgb, a=1.0):
        m = np.clip(mask, 0, 1)[..., None] * a
        img[..., :3] = img[..., :3] * (1 - m) + np.array(rgb, np.float32) * m
        img[..., 3:] = img[..., 3:] * (1 - m) + m

    def lin(h):
        return srgb_to_linear(h)[:3]

    def ellm(cx, cz, rx, rz, soft=0.004, rot=0.0):
        dx, dz = xs - cx, zs - cz
        c, s_ = math.cos(rot), math.sin(rot)
        u, v = dx * c + dz * s_, -dx * s_ + dz * c
        d = np.sqrt((u / rx) ** 2 + (v / rz) ** 2)
        return (1 - d) * min(rx, rz) / soft + 0.5

    ez = 1.226
    for s in (-1, 1):
        ex = 0.112 * s
        over(ellm(0.27 * s, 1.15, 0.065, 0.032, soft=0.03), lin('#f49a8f'), 0.55)            # blush
        sclera = ellm(ex, ez, 0.066, 0.06, rot=-0.12 * s)
        over(sclera, lin('#ffffff'))
        iris = np.minimum(ellm(ex - 0.008 * s, ez - 0.004, 0.047, 0.058), sclera)
        g = np.clip((zs - (ez - 0.055)) / 0.11, 0, 1)                                         # dark top -> amber bottom
        top, bot = np.array(lin('#5a2a10')), np.array(lin('#e8902a'))
        col = top * g[..., None] + bot * (1 - g[..., None])
        m = np.clip(iris, 0, 1)[..., None]
        img[..., :3] = img[..., :3] * (1 - m) + col * m
        img[..., 3:] = np.maximum(img[..., 3:], m)
        over(np.minimum(ellm(ex - 0.008 * s, ez + 0.002, 0.022, 0.03), sclera), lin('#2a120a'))   # pupil
        over(ellm(ex - 0.022 * s, ez + 0.022, 0.014, 0.016), lin('#ffffff'))                  # highlights
        over(ellm(ex + 0.012 * s, ez - 0.03, 0.007, 0.007), lin('#ffffff'))
        # thick upper lid: band above the eye, swept out at the corner
        lid = np.minimum(ellm(ex, ez + 0.01, 0.075, 0.066, rot=-0.12 * s), 1 - np.clip(ellm(ex, ez - 0.006, 0.07, 0.062, rot=-0.12 * s), 0, 1))
        lid = np.where(zs > ez + 0.012 - 0.15 * (xs - ex) * s * 0.3, lid, 0)
        over(lid * 1.0, lin('#2b1a14'))
        over(ellm(ex + 0.068 * s, ez + 0.036, 0.022, 0.009, rot=0.5 * s), lin('#2b1a14'))     # lash flick
        over(ellm(ex, ez - 0.064, 0.04, 0.005, soft=0.006), lin('#c48b78'), 0.6)              # lower lid line
        over(ellm(ex - 0.006 * s, ez + 0.1, 0.062, 0.014, rot=0.3 * s), lin('#5b3524'))        # brow, angled
    # ":3"-ish smile
    for s in (-1, 1):
        over(np.minimum(ellm(0.018 * s, 1.07, 0.022, 0.014), 1 - np.clip(ellm(0.018 * s, 1.078, 0.02, 0.013), 0, 1))
             * (zs < 1.075), lin('#6b3328'))
    return img


def face_decal(name='face', res=1024):
    import numpy as np
    img = paint_face_np(res)
    im = bpy.data.images.new('face_tex', res, res, alpha=True)
    im.pixels.foreach_set(np.ascontiguousarray(img[::-1]).ravel())   # Blender rows go bottom-up
    im.filepath_raw = os.path.join(out, 'chibi_fox_face.png')
    im.file_format = 'PNG'
    im.save()
    X0, X1, Z0, Z1 = -0.24, 0.24, C.z - 0.3, C.z + 0.18
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new()
    NX, NZ = 24, 24
    vid = {}
    for iz in range(NZ + 1):
        for ix in range(NX + 1):
            x, z = X0 + (X1 - X0) * ix / NX, Z0 + (Z1 - Z0) * iz / NZ
            if (x / SK.x) ** 2 + ((z - C.z) / SK.z) ** 2 > 0.97:
                continue
            p, _ = surf(x, z - C.z, 0.0025)
            vid[ix, iz] = (bm.verts.new(p), ((x - X0) / (X1 - X0), (z - Z0) / (Z1 - Z0)))
    for iz in range(NZ):
        for ix in range(NX):
            q = [(ix, iz), (ix + 1, iz), (ix + 1, iz + 1), (ix, iz + 1)]
            if all(c in vid for c in q):
                f = bm.faces.new([vid[c][0] for c in q[::-1]])   # wind to face -Y (outward)
                for loop, c in zip(f.loops, q[::-1]):
                    loop[uv].uv = vid[c][1]
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    mat = bpy.data.materials.new('face')
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes['Principled BSDF']
    tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = im
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    nt.links.new(tex.outputs['Alpha'], bsdf.inputs['Alpha'])
    bsdf.inputs['Roughness'].default_value = 0.35
    for attr, val in (('surface_render_method', 'BLENDED'), ('blend_method', 'BLEND')):
        try: setattr(mat, attr, val)
        except Exception: pass
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    for p in me.polygons: p.use_smooth = True
    return ob


# ------------------------------------------------------------------ build, budget, export, render
bm = k.bm
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
me = bpy.data.meshes.new('chibi_fox')
bm.to_mesh(me); bm.free()
for m in k.mats:
    m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.38    # semi-gloss vinyl
    me.materials.append(m)
body = bpy.data.objects.new('chibi_fox', me)
bpy.context.collection.objects.link(body)
bpy.context.view_layer.objects.active = body
body.select_set(True)
bpy.ops.object.shade_smooth_by_angle(angle=math.radians(50))
bpy.ops.object.convert(target='MESH')
face = face_decal()
tris = sum(len(p.vertices) - 2 for o in (body, face) for p in o.data.polygons)
print(f'[chibi_fox] triangles: {tris}')
if tris > MAX_TRIS:
    sys.exit(f'over budget: {tris} > {MAX_TRIS}')
face.select_set(True)
gl = os.path.join(out, 'chibi_fox.gltf')
bpy.ops.export_scene.gltf(filepath=gl, export_format='GLTF_SEPARATE', use_selection=True, export_apply=True)
print('[chibi_fox] bytes', os.path.getsize(gl) + os.path.getsize(gl[:-5] + '.bin'))

scene = bpy.context.scene
for eng in ('BLENDER_EEVEE', 'BLENDER_EEVEE_NEXT'):
    try:
        scene.render.engine = eng; break
    except TypeError:
        pass
scene.render.resolution_x, scene.render.resolution_y = 640, 800
scene.view_settings.view_transform = 'Standard'
world = bpy.data.worlds.new('w'); scene.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.62, 0.64, 0.68, 1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.45
for nm, loc, energy, size in [('key', (-2.5, -3.5, 3.5), 230, 2.5), ('fill', (3, -2.5, 1.5), 80, 3), ('rim', (1.5, 3.5, 3), 260, 1.5)]:
    L = bpy.data.objects.new(nm, bpy.data.lights.new(nm, 'AREA'))
    L.data.energy, L.data.size = energy, size
    L.location = loc
    L.rotation_euler = (Vector((0, 0, 0.9)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    scene.collection.objects.link(L)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
cam.data.type = 'ORTHO'; cam.data.ortho_scale = 2.25
scene.collection.objects.link(cam); scene.camera = cam
for fname, yaw, pitch, ortho in [('front', 0, 0, True), ('side', -90, 0, True), ('back', 180, 0, True),
                                 ('three_quarter', 28, 8, False), ('closeup', 15, 4, False)]:
    cam.data.type = 'ORTHO' if ortho else 'PERSP'
    cam.data.lens = 50
    tgt = Vector((0, 0, 0.93 if fname != 'closeup' else 1.25))
    d = {'closeup': 2.2, 'three_quarter': 3.6}.get(fname, 6)
    y, p_ = math.radians(yaw), math.radians(pitch)
    cam.location = tgt + Vector((d * math.cos(p_) * math.sin(y), -d * math.cos(p_) * math.cos(y), d * math.sin(p_)))
    cam.rotation_euler = (tgt - cam.location).to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = os.path.join(out, f'chibi_fox_{fname}.png')
    bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, 'chibi_fox.blend'), compress=True)
