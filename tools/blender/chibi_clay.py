"""Fox-eared barista as one 'clay' sculpt: every part is a signed distance field, parts melt together with
smooth unions (no glued-on primitives), the field is meshed with surface nets, then smoothed and decimated in
Blender. Colours are vertex colours (the part nearest the surface wins); the face is a painted texture projected
onto the head. Reference: design/chibi_creator/turnaround_v1.png.
    blender -b --factory-startup -t 8 --python chibi_clay.py -- <out_dir>
"""
import math, os, sys, time
import numpy as np
import bpy, bmesh
from mathutils import Vector, Matrix

out = os.path.abspath(sys.argv[sys.argv.index('--') + 1])
os.makedirs(out, exist_ok=True)
t0 = time.time()
MAX_TRIS = 40000
H = 0.0065                                    # voxel size (game units; the figure is ~1.95 tall)
LO, HI = np.array([-0.62, -0.42, 0.0]), np.array([0.66, 0.84, 1.98])
N = np.ceil((HI - LO) / H).astype(int) + 1
GX, GY, GZ = (LO[i] + H * np.arange(N[i], dtype=np.float32) for i in range(3))
print('grid', N, N.prod() / 1e6, 'M voxels')


def srgb(h):
    f = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return [f(int(h[i:i + 2], 16) / 255) for i in (1, 3, 5)]


PAL = {'none': '#000000', 'skin': '#fbe1d0', 'hair': '#b77b48', 'cream': '#f6e7cf', 'shirt': '#fbfaf6',
       'apron': '#4a3027', 'trim': '#e3a72f', 'pants': '#5a3a2b', 'cuff': '#8b6a55', 'shoe': '#5b3424',
       'sole': '#3a2219', 'ear_in': '#f0cdb0', 'nose': '#f4c9b4', 'hair_dk': '#9c6436'}
NAMES = list(PAL)
CID = {n: i for i, n in enumerate(NAMES)}


# ------------------------------------------------------------------ SDF primitives (broadcast over sub-grids)
def length(x, y, z):
    return np.sqrt(x * x + y * y + z * z)


def ellipsoid(c, r):
    c, r = np.array(c, np.float32), np.array(r, np.float32)
    def f(X, Y, Z):
        px, py, pz = (X - c[0]) / r[0], (Y - c[1]) / r[1], (Z - c[2]) / r[2]
        k0 = length(px, py, pz)
        k1 = length(px / r[0], py / r[1], pz / r[2])
        return k0 * (k0 - 1) / np.maximum(k1, 1e-6)
    return f, (c - r, c + r)


def roundcone(a, b, r1, r2):
    """Inigo Quilez's exact round cone: sphere r1 at a swept to sphere r2 at b."""
    a, b = np.array(a, np.float32), np.array(b, np.float32)
    ba = b - a
    l2 = float(ba @ ba); rr = r1 - r2; a2 = l2 - rr * rr; il2 = 1.0 / l2
    def f(X, Y, Z):
        px, py, pz = X - a[0], Y - a[1], Z - a[2]
        y = px * ba[0] + py * ba[1] + pz * ba[2]
        z = y - l2
        qx, qy, qz = px * l2 - ba[0] * y, py * l2 - ba[1] * y, pz * l2 - ba[2] * y
        x2 = qx * qx + qy * qy + qz * qz
        y2, z2 = y * y * l2, z * z * l2
        k = math.copysign(1, rr) * rr * rr * x2
        d_end = np.sqrt(x2 + z2) * il2 - r2
        d_start = np.sqrt(x2 + y2) * il2 - r1
        d_mid = (np.sqrt(np.maximum(x2 * a2 * il2, 0)) + y * rr) * il2 - r1
        return np.where(np.sign(z) * a2 * z2 > k, d_end, np.where(np.sign(y) * a2 * y2 < k, d_start, d_mid))
    m = max(r1, r2)
    return f, (np.minimum(a, b) - m, np.maximum(a, b) + m)


def chain(pts, radii):
    parts = [roundcone(pts[i], pts[i + 1], max(radii[i], 1e-3), max(radii[i + 1], 1e-3)) for i in range(len(pts) - 1)]
    def f(X, Y, Z):
        d = None
        for g, _ in parts:
            e = g(X, Y, Z)
            d = e if d is None else np.minimum(d, e)
        return d
    return f, (np.min([b[0] for _, b in parts], 0), np.max([b[1] for _, b in parts], 0))


def roundbox(c, half, r):
    c, half = np.array(c, np.float32), np.array(half, np.float32)
    def f(X, Y, Z):
        qx, qy, qz = np.abs(X - c[0]) - half[0] + r, np.abs(Y - c[1]) - half[1] + r, np.abs(Z - c[2]) - half[2] + r
        return length(np.maximum(qx, 0), np.maximum(qy, 0), np.maximum(qz, 0)) + np.minimum(np.maximum(qx, np.maximum(qy, qz)), 0) - r
    return f, (c - half, c + half)


def local(prim, M, scale_min):
    """Evaluate prim in a local frame: M maps world -> local (4x4); scale_min corrects the distance."""
    g, (blo, bhi) = prim
    Mi = M.inverted()
    corners = [Mi @ Vector((x, y, z)) for x in (blo[0], bhi[0]) for y in (blo[1], bhi[1]) for z in (blo[2], bhi[2])]
    lo = np.array([min(c[i] for c in corners) for i in range(3)], np.float32)
    hi = np.array([max(c[i] for c in corners) for i in range(3)], np.float32)
    m = np.array(M, np.float32)
    def f(X, Y, Z):
        lx = m[0, 0] * X + m[0, 1] * Y + m[0, 2] * Z + m[0, 3]
        ly = m[1, 0] * X + m[1, 1] * Y + m[1, 2] * Z + m[1, 3]
        lz = m[2, 0] * X + m[2, 1] * Y + m[2, 2] * Z + m[2, 3]
        return g(lx, ly, lz) * scale_min
    return f, (lo, hi)


def squash(prim, sx, sy):
    """Elliptic cross-section around the Z axis (torso, hips): x/sx, y/sy."""
    return local(prim, Matrix.Diagonal((1 / sx, 1 / sy, 1, 1)), min(sx, sy))


def panel(z0, z1, r0, r1, ang, thick, sx=1.12, sy=0.85, round_=0.004):
    """Curved slab hugging an elliptic body: radius r0->r1 from z0 to z1, +-ang degrees round the front."""
    def f(X, Y, Z):
        x, y = X / sx, Y / sy
        rho = np.sqrt(x * x + y * y)
        t = np.clip((Z - z0) / (z1 - z0), 0, 1)
        r = r0 + (r1 - r0) * t + thick / 2
        d_shell = np.abs(rho - r) - (thick / 2 - round_)
        a = np.arctan2(x, -y)
        d_ang = (np.abs(a) - math.radians(ang)) * rho
        d_z = np.maximum(z0 - Z, Z - z1)
        q = np.maximum(d_shell, np.maximum(d_ang, d_z) + round_)
        return q * min(sx, sy) - round_
    R = max(r0, r1) + thick
    return f, (np.array([-R * sx, -R * sy, z0]), np.array([R * sx, R * sy * 0.3, z1]))


def bez(p0, p1, p2, n):
    p0, p1, p2 = (np.array(p, np.float32) for p in (p0, p1, p2))
    return [(1 - t) ** 2 * p0 + 2 * (1 - t) * t * p1 + t * t * p2 for t in np.linspace(0, 1, n)]


def lock(p0, p1, p2, r0, n=8, prof=(0.85, 1, 1, 0.97, 0.88, 0.72, 0.48, 0.12)):
    pts = bez(p0, p1, p2, n)
    return chain(pts, [r0 * prof[min(round(i * (len(prof) - 1) / (n - 1)), len(prof) - 1)] for i in range(n)])


# ------------------------------------------------------------------ fields
def smin(a, b, k):
    if k <= 0:
        return np.minimum(a, b)
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1)
    return b * (1 - h) + a * h - k * h * (1 - h)


class Field:
    def __init__(self):
        self.d = np.full(N, 1.0, np.float32)
        self.id = np.zeros(N, np.uint8)

    def _slice(self, bbox, pad):
        lo = np.clip(np.floor((np.array(bbox[0]) - pad - LO) / H).astype(int), 0, N - 1)
        hi = np.clip(np.ceil((np.array(bbox[1]) + pad - LO) / H).astype(int) + 1, 1, N)
        return tuple(slice(lo[i], hi[i]) for i in range(3))

    def add(self, prim, colour, k=0.0, cut=False):
        g, bbox = prim
        sl = self._slice(bbox, k + 4 * H)
        X, Y, Z = GX[sl[0]][:, None, None], GY[sl[1]][None, :, None], GZ[sl[2]][None, None, :]
        e = np.broadcast_to(g(X, Y, Z), self.d[sl].shape).astype(np.float32)
        old = self.d[sl]
        if cut:                                      # smooth subtraction
            self.d[sl] = -smin(-old, e, k)
            return
        idv = self.id[sl]
        idv[e < old] = CID[colour]
        self.d[sl] = smin(old, e, k)

    def merge(self, other, k):
        win = other.d < self.d
        self.id[win] = other.id[win]
        self.d = smin(self.d, other.d, k)


C = np.array([0, 0.03, 1.31], np.float32)       # skull centre
SK = np.array([0.30, 0.29, 0.32], np.float32)


def surf(x, z, lift=0.0):
    s = max(0.0, 1 - (x / SK[0]) ** 2 - (z / SK[2]) ** 2)
    y = -SK[1] * math.sqrt(s)
    n = np.array([x / SK[0] ** 2, y / SK[1] ** 2, z / SK[2] ** 2]); n /= np.linalg.norm(n)
    return C + np.array([x, y, z]) + n * lift


def V(*a):
    return np.array(a, np.float32)


body, apron, hair = Field(), Field(), Field()

# --- head and body: one soft piece
body.add(ellipsoid(C, SK), 'skin')
for s in (-1, 1):
    body.add(ellipsoid(C + V(0.12 * s, -0.09, -0.15), (0.15, 0.15, 0.13)), 'skin', k=0.06)       # chubby cheeks
    body.add(ellipsoid(C + V(0.29 * s, 0.03, -0.05), (0.04, 0.05, 0.07)), 'skin', k=0.02)        # ears under hair
body.add(ellipsoid(surf(0, -0.1), (0.022, 0.02, 0.017)), 'nose', k=0.012)
body.add(roundcone((0, 0.04, 0.92), (0, 0.05, 1.06), 0.07, 0.07), 'skin', k=0.03)
body.add(squash(roundcone((0, 0, 0.7), (0, 0, 0.93), 0.165, 0.15), 1.12, 0.85), 'shirt', k=0.03)
for s in (-1, 1):
    body.add(ellipsoid((0.075 * s, -0.125, 0.955), (0.07, 0.03, 0.04)), 'shirt', k=0.01)          # collar points
    sh, el, wr = V(0.18 * s, 0, 0.91), V(0.3 * s, -0.01, 0.8), V(0.39 * s, -0.03, 0.67)
    body.add(roundcone(sh, el, 0.085, 0.08), 'shirt', k=0.045)
    body.add(roundcone(el - (el - sh) * 0.15, wr, 0.05, 0.045), 'skin', k=0.012)
    d = (wr - el) / np.linalg.norm(wr - el)
    side = np.cross(V(0, -1, 0), d); side /= np.linalg.norm(side)
    palm = wr + d * 0.05
    body.add(ellipsoid(palm, (0.05, 0.034, 0.05)), 'skin', k=0.02)
    for j in range(4):
        b0 = palm + d * 0.03 + side * (0.026 * (j - 1.5))
        body.add(roundcone(b0, b0 + d * (0.05 - 0.007 * abs(j - 1.5)) + side * 0.006 * (j - 1.5), 0.015, 0.012), 'skin', k=0.01)
    body.add(roundcone(palm + V(0, -0.02, 0.01), palm + V(0, -0.06, 0) + d * 0.02, 0.016, 0.013), 'skin', k=0.01)
# trousers, cuffs, shoes
body.add(squash(ellipsoid((0, 0, 0.6), (0.17, 0.16, 0.14)), 1.1, 0.9), 'pants', k=0.03)
for s in (-1, 1):
    body.add(roundcone((0.105 * s, 0, 0.56), (0.165 * s, -0.01, 0.22), 0.105, 0.11), 'pants', k=0.04)
    body.add(roundcone((0.165 * s, -0.01, 0.17), (0.165 * s, -0.01, 0.245), 0.122, 0.124), 'cuff', k=0.008)
    body.add(ellipsoid((0.17 * s, -0.04, 0.1), (0.105, 0.15, 0.085)), 'shoe', k=0.02)
    body.add(roundbox((0.17 * s, -0.04, 0.03), (0.112, 0.158, 0.03), 0.025), 'sole', k=0.01)
    for j in range(2):
        body.add(roundcone((0.135 * s, -0.12 + 0.04 * j, 0.152 - 0.012 * j), (0.205 * s, -0.12 + 0.04 * j, 0.152 - 0.012 * j),
                           0.011, 0.011), 'trim', k=0.004)
# tail: brown with a cream tip, melted into the hips
tail = bez((0.04, 0.16, 0.56), (0.3, 0.75, 0.38), (0.22, 0.42, 1.0), 11)
tr = [0.05, 0.11, 0.16, 0.19, 0.2, 0.2, 0.19, 0.17, 0.14, 0.09, 0.0]
body.add(chain(tail[:8], tr[:8]), 'hair', k=0.05)
body.add(chain(tail[6:], [r * 1.05 for r in tr[6:]]), 'cream', k=0.02)
for i in range(5):                                   # cream flames licking back toward the base
    a = tail[6] + (tail[6] - tail[5]) * 0.0
    ang = 2 * math.pi * i / 5
    t = (tail[7] - tail[5]); t /= np.linalg.norm(t)
    u = np.cross(t, V(0, 0, 1)); u /= np.linalg.norm(u); w = np.cross(t, u)
    off = (u * math.cos(ang) + w * math.sin(ang)) * 0.17
    body.add(roundcone(tail[7] + off, tail[5] + off * 1.05, 0.045, 0.0), 'cream', k=0.01)

# --- apron (its own layer, barely blended so the edges stay crisp)
apron.add(panel(0.36, 0.7, 0.26, 0.205, 62, 0.024), 'apron')
apron.add(panel(0.7, 0.92, 0.152, 0.142, 38, 0.056), 'apron')          # bib: solid on the chest, no gap to collapse
apron.add(panel(0.345, 0.375, 0.262, 0.257, 63, 0.03), 'trim')
for s in (-1, 1):
    ang0 = 61 * s
    apron.add(local(panel(0.36, 0.7, 0.262, 0.207, 1.6, 0.03), Matrix.Rotation(math.radians(ang0), 4, 'Z'), 1.0), 'trim')
    apron.add(chain([V(0.1 * s, -0.17, 0.915), V(0.12 * s, -0.12, 1.0), V(0.12 * s, 0.05, 1.0), V(0.1 * s, 0.16, 0.86),
                     V(0.08 * s, 0.16, 0.7)], [0.016] * 5), 'apron', k=0.01)
    apron.add(ellipsoid((0.1 * s, -0.176, 0.905), (0.022, 0.014, 0.022)), 'trim', k=0.004)
    apron.add(local(ellipsoid((0, 0, 0), (0.065, 0.022, 0.04)), Matrix.Rotation(math.radians(15 * s), 4, 'Y')
                    @ Matrix.Translation((-0.075 * s, -0.2, -0.71)), 1.0), 'trim', k=0.008)           # bow loops
    apron.add(chain([V(0.02 * s, 0.2, 0.69), V(0.05 * s, 0.215, 0.6), V(0.06 * s, 0.21, 0.52)], [0.02, 0.017, 0.012]), 'trim', k=0.008)
tie = []
for i in range(41):
    a = 2 * math.pi * i / 40
    f = min(1.0, max(0.0, (math.cos(a) - math.cos(math.radians(75))) / (math.cos(math.radians(50)) - math.cos(math.radians(75)))))
    r = 0.168 + (0.226 - 0.168) * f
    tie.append(V(r * 1.12 * math.sin(a), -r * 0.85 * math.cos(a), 0.7))
apron.add(chain(tie, [0.02] * len(tie)), 'trim', k=0.004)
apron.add(ellipsoid((0, 0.18, 0.7), (0.04, 0.03, 0.035)), 'trim', k=0.006)
apron.add(panel(0.76, 0.84, 0.2, 0.198, 10, 0.012), 'trim')                                    # chest pocket
apron.add(local(panel(0.46, 0.57, 0.262, 0.25, 11, 0.014), Matrix.Rotation(math.radians(-25), 4, 'Z'), 1.0), 'apron')

# --- hair: one big soft mass carved open for the face, chunky locks melted on top
hair.add(ellipsoid(C + V(0, 0.05, 0.05), (0.39, 0.39, 0.37)), 'hair')
hair.add(ellipsoid((0, -0.33, 1.13), (0.27, 0.3, 0.235)), 'hair', k=0.05, cut=True)
hair.add(ellipsoid(C + V(0, 0.2, -0.3), (0.2, 0.15, 0.2)), 'hair', k=0.08, cut=True)               # nape, off the neck
for x, tipx, tipz, col in [(-0.21, -0.27, 0.0, 'hair'), (-0.11, -0.15, 0.05, 'cream'), (-0.01, -0.04, -0.06, 'hair'),
                           (0.08, 0.07, 0.04, 'hair'), (0.17, 0.2, 0.04, 'hair'), (0.25, 0.29, -0.02, 'cream')]:
    hair.add(lock(C + V(x * 0.5, -0.16, 0.33), surf(x * 1.05, 0.19, 0.07), surf(tipx, tipz, 0.0), 0.07), col, k=0.03)
for s in (-1, 1):
    for y0, tipz, flare, col in [(-0.15, -0.25, 0.03, 'hair'), (-0.07, -0.29, 0.07, 'hair'), (0.02, -0.3, 0.1, 'hair'),
                                 (0.1, -0.26, 0.11, 'hair')]:
        hair.add(lock(C + V(0.28 * s, y0, 0.16), C + V(0.4 * s, y0 - 0.02, -0.04), C + V((0.37 + flare) * s, y0 + 0.02, tipz),
                      0.075), col, k=0.03)
for i in range(6):
    x = (i - 2.5) / 2.5
    hair.add(lock(C + V(x * 0.22, 0.24, 0.24), C + V(x * 0.36, 0.43, -0.06), C + V(x * 0.46, 0.34, -0.37), 0.085), 'hair', k=0.03)
    hair.add(lock(C + V(x * 0.22, 0.2, 0.3), C + V(x * 0.38, 0.44, 0.06), C + V(x * 0.47, 0.4, -0.24), 0.1), 'hair', k=0.03)
for yaw in range(-150, 181, 37):
    if abs(yaw) < 35:
        continue
    d = V(math.sin(math.radians(yaw)), -math.cos(math.radians(yaw)), 0)
    hair.add(lock(C + d * 0.18 + V(0, 0, 0.36), C + d * 0.36 + V(0, 0, 0.3), C + d * 0.47 + V(0, 0, 0.12), 0.085), 'hair', k=0.03)
crown = C + V(0, 0.04, 0.37)
hair.add(lock(crown, crown + V(0.02, -0.04, 0.12), crown + V(0.1, 0.0, 0.11), 0.028), 'hair', k=0.01)
hair.add(lock(crown, crown + V(-0.03, 0.0, 0.1), crown + V(-0.09, 0.05, 0.07), 0.024), 'hair', k=0.01)
for s in (-1, 1):                                    # fox ears: flattened cones, cream inner and fluff
    base = C + V(0.2 * s, 0.05, 0.29)
    R = Matrix.Rotation(math.radians(-22 * s), 4, 'Y') @ Matrix.Rotation(math.radians(6), 4, 'X')
    M = (Matrix.Translation(Vector(base.tolist())) @ R @ Matrix.Diagonal((1, 0.45, 1, 1))).inverted()
    hair.add(local(roundcone((0, 0, 0), (0, 0, 0.3), 0.115, 0.012), M, 0.45), 'hair', k=0.04)
    Mi = (Matrix.Translation(Vector(base.tolist())) @ R @ Matrix.Translation((0, -0.047, 0.03)) @ Matrix.Diagonal((1, 0.22, 1, 1))).inverted()
    hair.add(local(roundcone((0, 0, 0), (0, 0, 0.22), 0.07, 0.01), Mi, 0.22), 'ear_in', k=0.006)
    for j in range(3):
        p = np.array(base) + np.array(R.to_3x3() @ Vector((0.028 * (j - 1), -0.05, 0.02 + 0.035 * j)), np.float32)
        hair.add(ellipsoid(p, (0.035, 0.025, 0.045)), 'cream', k=0.015)

print(f'fields built in {time.time() - t0:.1f}s')
body.merge(apron, 0.004)
body.merge(hair, 0.008)
F, ID = body.d, body.id
del apron, hair


# ------------------------------------------------------------------ surface nets
def surface_nets(F):
    inside = F < 0
    nx, ny, nz = F.shape
    csum = np.zeros((nx - 1, ny - 1, nz - 1, 3), np.float32)
    ccnt = np.zeros((nx - 1, ny - 1, nz - 1), np.int32)
    quads = []
    for ax in range(3):
        sl0 = [slice(None)] * 3; sl1 = [slice(None)] * 3
        sl0[ax] = slice(0, -1); sl1[ax] = slice(1, None)
        f0, f1 = F[tuple(sl0)], F[tuple(sl1)]
        cross = inside[tuple(sl0)] != inside[tuple(sl1)]
        idx = np.argwhere(cross)
        a, b = f0[cross], f1[cross]
        t = a / (a - b)
        pts = idx.astype(np.float64)
        pts[:, ax] += t
        o1, o2 = [(1, 2), (2, 0), (0, 1)][ax]       # the two other axes, ordered so o1 x o2 = ax
        for d1 in (0, 1):
            for d2 in (0, 1):
                c = idx.copy()
                c[:, o1] -= d1; c[:, o2] -= d2
                ok = (c[:, o1] >= 0) & (c[:, o2] >= 0) & (c[:, o1] < F.shape[o1] - 1) & (c[:, o2] < F.shape[o2] - 1) & \
                     (c[:, ax] < F.shape[ax] - 1)
                np.add.at(csum, (c[ok, 0], c[ok, 1], c[ok, 2]), pts[ok])
                np.add.at(ccnt, (c[ok, 0], c[ok, 1], c[ok, 2]), 1)
        keep = (idx[:, o1] >= 1) & (idx[:, o2] >= 1) & (idx[:, o1] < F.shape[o1] - 1) & (idx[:, o2] < F.shape[o2] - 1) & \
               (idx[:, ax] < F.shape[ax] - 1)
        idx, flip = idx[keep], (a[keep] > 0)
        cells = []
        for d1, d2 in [(1, 1), (0, 1), (0, 0), (1, 0)]:
            c = idx.copy(); c[:, o1] -= d1; c[:, o2] -= d2
            cells.append(c)
        q = np.stack(cells, 1)                       # (n, 4, 3)
        q[flip] = q[flip][:, ::-1]
        quads.append(q)
    active = ccnt > 0
    vid = -np.ones(ccnt.shape, np.int64)
    vid[active] = np.arange(active.sum())
    verts = csum[active] / ccnt[active][:, None]
    cell_idx = np.argwhere(active)
    Q = np.concatenate(quads)
    faces = vid[Q[..., 0], Q[..., 1], Q[..., 2]]
    faces = faces[(faces >= 0).all(1)]
    return verts, faces, cell_idx


verts, faces, cells = surface_nets(F)
print(f'surface nets: {len(verts)} verts, {len(faces)} quads, {time.time() - t0:.1f}s')
# colour per vertex: the inside corner of its cell nearest the surface
best = np.full(len(cells), -1e9, np.float32); vcol = np.zeros(len(cells), np.uint8)
for dx in (0, 1):
    for dy in (0, 1):
        for dz in (0, 1):
            i, j, k = cells[:, 0] + dx, cells[:, 1] + dy, cells[:, 2] + dz
            d = F[i, j, k]
            take = (d < 0) & (d > best)
            best[take] = d[take]; vcol[take] = ID[i, j, k][take]
world = LO + verts * H

# ------------------------------------------------------------------ Blender: mesh, decimate, texture from the field
bpy.ops.wm.read_factory_settings(use_empty=True)
me = bpy.data.meshes.new('chibi_clay')
me.vertices.add(len(world)); me.vertices.foreach_set('co', world.astype(np.float32).ravel())
me.loops.add(faces.size); me.loops.foreach_set('vertex_index', faces.astype(np.int32).ravel())
me.polygons.add(len(faces))
me.polygons.foreach_set('loop_start', (np.arange(len(faces)) * 4).astype(np.int32))
me.polygons.foreach_set('loop_total', np.full(len(faces), 4, np.int32))
me.update(); me.validate()
lo = bpy.data.objects.new('chibi_clay', me)
bpy.context.collection.objects.link(lo)
bpy.context.view_layer.objects.active = lo; lo.select_set(True)
sm = lo.modifiers.new('smooth', 'LAPLACIANSMOOTH'); sm.iterations = 2; sm.lambda_factor = 0.4
dec = lo.modifiers.new('dec', 'DECIMATE'); dec.ratio = min(1.0, (MAX_TRIS * 0.85) / (2 * len(faces)))
bpy.ops.object.convert(target='MESH')
bpy.ops.object.shade_smooth()
lme = lo.data
lme.uv_layers.new(name='UVMap')
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.003)
bpy.ops.object.mode_set(mode='OBJECT')
print(f'low poly + UVs, {time.time() - t0:.1f}s')

# bake the low mesh's own position and normal into float maps (EMIT), then colour every texel from the field
TEX = 2048
scene = bpy.context.scene
scene.render.engine = 'CYCLES'; scene.cycles.device = 'CPU'; scene.cycles.samples = 1


def bake_attr(kind):
    img = bpy.data.images.new('bake_' + kind, TEX, TEX, alpha=True, float_buffer=True)
    m = bpy.data.materials.new('bake_' + kind); m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.type != 'OUTPUT_MATERIAL': nt.nodes.remove(n)
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    vm = nt.nodes.new('ShaderNodeVectorMath'); vm.operation = 'MULTIPLY_ADD'      # remap into 0..1
    if kind == 'pos':
        nt.links.new(geo.outputs['Position'], vm.inputs[0])
        vm.inputs[1].default_value = tuple(1 / (HI - LO)); vm.inputs[2].default_value = tuple(-LO / (HI - LO))
    else:
        nt.links.new(geo.outputs['Normal'], vm.inputs[0])
        vm.inputs[1].default_value = (0.5, 0.5, 0.5); vm.inputs[2].default_value = (0.5, 0.5, 0.5)
    em = nt.nodes.new('ShaderNodeEmission')
    nt.links.new(vm.outputs[0], em.inputs['Color'])
    nt.links.new(em.outputs[0], nt.nodes['Material Output'].inputs['Surface'])
    tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = img; nt.nodes.active = tn
    lme.materials.clear(); lme.materials.append(m)
    bpy.ops.object.bake(type='EMIT', margin=8)
    a = np.empty(TEX * TEX * 4, np.float32); img.pixels.foreach_get(a)
    return a.reshape(TEX, TEX, 4)


img_img = None
PM, NM = bake_attr('pos'), bake_attr('nrm')
cover = PM[..., 3] > 0.5
P = (PM[..., :3][cover] * (HI - LO) + LO).astype(np.float32)
Nrm = NM[..., :3][cover] * 2 - 1
print(f'position/normal maps baked, {cover.sum()} texels, {time.time() - t0:.1f}s')


def trilin(A, Q):
    g = (Q - LO) / H
    i = np.clip(np.floor(g).astype(np.int64), 0, N - 2)
    f = np.clip(g - i, 0, 1).astype(np.float32)
    out_ = np.zeros(len(Q), np.float32)
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (f[:, 0] if dx else 1 - f[:, 0]) * (f[:, 1] if dy else 1 - f[:, 1]) * (f[:, 2] if dz else 1 - f[:, 2])
                out_ += w * A[i[:, 0] + dx, i[:, 1] + dy, i[:, 2] + dz]
    return out_


Q = P.copy()
for _ in range(3):                                   # Newton steps onto the clay surface (F = 0)
    gr = np.stack([(trilin(F, Q + e) - trilin(F, Q - e)) / (2 * H) for e in np.eye(3, dtype=np.float32) * H], 1)
    gn = np.maximum((gr * gr).sum(1), 1e-6)
    Q -= (trilin(F, Q) / gn)[:, None] * gr
gr /= np.sqrt(gn)[:, None]
inner = Q - gr * (0.6 * H)
ii = np.clip(np.round((inner - LO) / H).astype(np.int64), 0, N - 1)
tid = ID[ii[:, 0], ii[:, 1], ii[:, 2]]
pal = np.array([srgb(PAL[n]) for n in NAMES], np.float32)
colr = pal[tid]
hz = Q[:, 2]                                        # two-tone hair: brown roots, cream ends
t = np.clip((1.17 - hz) / 0.13, 0, 1); t = t * t * (3 - 2 * t)
m = (tid == CID['hair']) & (hz > 0.93) & (Q[:, 1] < 0.36)
colr[m] = colr[m] * (1 - t[m, None]) + pal[CID['cream']] * t[m, None]


def paint_face_np(Nn=1024):
    img = np.zeros((Nn, Nn, 4), np.float32)
    img[..., :3] = srgb(PAL['skin']); img[..., 3] = 1
    X0, X1, Z0, Z1 = -0.24, 0.24, C[2] - 0.3, C[2] + 0.18
    xs = np.linspace(X0, X1, Nn)[None, :]; zs = np.linspace(Z1, Z0, Nn)[:, None]

    def over(mask, rgb, a=1.0):
        m = np.clip(mask, 0, 1)[..., None] * a
        img[..., :3] = img[..., :3] * (1 - m) + np.array(rgb, np.float32) * m

    def ellm(cx, cz, rx, rz, soft=0.004, rot=0.0):
        dx, dz = xs - cx, zs - cz
        c, s_ = math.cos(rot), math.sin(rot)
        u, v = dx * c + dz * s_, -dx * s_ + dz * c
        return (1 - np.sqrt((u / rx) ** 2 + (v / rz) ** 2)) * min(rx, rz) / soft + 0.5

    ez = 1.215
    for s in (-1, 1):
        ex = 0.112 * s
        over(ellm(0.2 * s, 1.13, 0.065, 0.034, soft=0.03), srgb('#f49a8f'), 0.5)                  # blush
        sclera = ellm(ex, ez, 0.064, 0.064, rot=-0.08 * s)
        over(sclera, srgb('#ffffff'))
        iris = np.clip(np.minimum(ellm(ex - 0.006 * s, ez - 0.004, 0.05, 0.06), sclera), 0, 1)
        g = np.clip((zs - (ez - 0.058)) / 0.115, 0, 1)
        col = np.array(srgb('#5a2a10')) * g[..., None] + np.array(srgb('#e8902a')) * (1 - g[..., None])
        img[..., :3] = img[..., :3] * (1 - iris[..., None]) + col * iris[..., None]
        over(np.minimum(ellm(ex - 0.006 * s, ez + 0.004, 0.024, 0.032), sclera), srgb('#2a120a'))   # pupil
        over(ellm(ex - 0.02 * s, ez + 0.024, 0.016, 0.018), srgb('#ffffff'))                     # highlights
        over(ellm(ex + 0.014 * s, ez - 0.03, 0.008, 0.008), srgb('#ffffff'))
        lid = np.minimum(ellm(ex, ez + 0.012, 0.074, 0.07, rot=-0.08 * s),
                         1 - np.clip(ellm(ex, ez - 0.004, 0.068, 0.066, rot=-0.08 * s), 0, 1))
        over(np.where(zs > ez + 0.01, lid, 0), srgb('#2b1a14'))                                  # thick upper lid
        over(ellm(ex + 0.066 * s, ez + 0.04, 0.02, 0.008, rot=0.45 * s), srgb('#2b1a14'))        # lash flick
        over(ellm(ex - 0.004 * s, ez + 0.105, 0.05, 0.011, rot=0.12 * s), srgb('#6b4330'))        # soft brow
    # gentle smile
    sm_ = np.minimum(ellm(0, 1.085, 0.03, 0.018), 1 - np.clip(ellm(0, 1.093, 0.028, 0.016), 0, 1)) * (zs < 1.087)
    over(sm_, srgb('#7a3b2e'))
    return img


face = paint_face_np(1024)
X0, X1, Z0, Z1 = -0.24, 0.24, C[2] - 0.3, C[2] + 0.18
fm = (tid == CID['skin']) & (Q[:, 0] > X0) & (Q[:, 0] < X1) & (Q[:, 2] > Z0) & (Q[:, 2] < Z1) & (Q[:, 1] < -0.05) & (Nrm[:, 1] < -0.2)
u = np.clip(((Q[fm, 0] - X0) / (X1 - X0) * 1023), 0, 1023).astype(int)
v = np.clip(((Z1 - Q[fm, 2]) / (Z1 - Z0) * 1023), 0, 1023).astype(int)
colr[fm] = face[v, u, :3]
tex = np.zeros((TEX, TEX, 4), np.float32); tex[..., 3] = 1
tex[..., :3] = colr.mean(0)
tex[cover, :3] = colr
tex[..., :3] = np.where(tex[..., :3] <= 0.0031308, tex[..., :3] * 12.92, 1.055 * np.power(np.maximum(tex[..., :3], 0), 1 / 2.4) - 0.055)   # linear -> sRGB bytes
bake = bpy.data.images.new('chibi_clay_texture', TEX, TEX, alpha=False)
bake.pixels.foreach_set(tex.ravel())
texpath = os.path.join(out, 'chibi_clay_texture.jpg')
bake.filepath_raw = texpath; bake.file_format = 'JPEG'
scene.render.image_settings.file_format = 'JPEG'; scene.render.image_settings.quality = 90
try:
    bake.save(filepath=texpath, quality=90)       # plain save: save_render would tone-map through the view transform
except TypeError:
    bake.save()
bake.source = 'FILE'; bake.filepath = texpath; bake.reload()
mat = bpy.data.materials.new('chibi_clay'); mat.use_nodes = True
nt = mat.node_tree; b2 = nt.nodes['Principled BSDF']
tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = bake
nt.links.new(tn.outputs['Color'], b2.inputs['Base Color'])
b2.inputs['Roughness'].default_value = 0.42
lme.materials.clear(); lme.materials.append(mat)
print(f'texture from field, {time.time() - t0:.1f}s')

tris = sum(len(p.vertices) - 2 for p in lme.polygons)
print(f'[chibi_clay] triangles: {tris}')
if tris > MAX_TRIS:
    sys.exit(f'over budget: {tris} > {MAX_TRIS}')
gl = os.path.join(out, 'chibi_clay.gltf')
bpy.ops.export_scene.gltf(filepath=gl, export_format='GLTF_SEPARATE', use_selection=True, export_image_format='JPEG')
print('[chibi_clay] bytes', os.path.getsize(gl) + os.path.getsize(gl[:-5] + '.bin'))

for eng in ('BLENDER_EEVEE', 'BLENDER_EEVEE_NEXT'):
    try:
        scene.render.engine = eng; break
    except TypeError:
        pass
scene.render.resolution_x, scene.render.resolution_y = 640, 800
scene.view_settings.view_transform = 'Standard'
w = bpy.data.worlds.new('w'); scene.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.62, 0.64, 0.68, 1)
w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.45
for nm, loc, energy, size in [('key', (-2.5, -3.5, 3.5), 230, 2.5), ('fill', (3, -2.5, 1.5), 80, 3), ('rim', (1.5, 3.5, 3), 260, 1.5)]:
    L = bpy.data.objects.new(nm, bpy.data.lights.new(nm, 'AREA'))
    L.data.energy, L.data.size = energy, size
    L.location = loc
    L.rotation_euler = (Vector((0, 0, 0.9)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    scene.collection.objects.link(L)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
cam.data.ortho_scale = 2.25
scene.collection.objects.link(cam); scene.camera = cam
for fname, yaw, pitch, ortho, d, tz in [('front', 0, 0, True, 6, 0.95), ('side', -90, 0, True, 6, 0.95),
                                        ('back', 180, 0, True, 6, 0.95), ('three_quarter', 28, 8, False, 3.6, 0.93),
                                        ('closeup', 15, 4, False, 2.2, 1.25)]:
    cam.data.type = 'ORTHO' if ortho else 'PERSP'
    cam.data.lens = 50
    tgt = Vector((0, 0, tz))
    y, p_ = math.radians(yaw), math.radians(pitch)
    cam.location = tgt + Vector((d * math.cos(p_) * math.sin(y), -d * math.cos(p_) * math.cos(y), d * math.sin(p_)))
    cam.rotation_euler = (tgt - cam.location).to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = os.path.join(out, f'chibi_clay_{fname}')
    bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, 'chibi_clay.blend'), compress=True)
print(f'done {time.time() - t0:.1f}s')
