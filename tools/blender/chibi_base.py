"""Character-creator prototype: one chibi base body (~2.3 heads tall, vinyl-toy proportions) with swappable
hair / ears / outfit parts and free colours, modelled from code. Builds a lineup of a few presets side by side.
    blender -b --factory-startup -t 2 --python chibi_base.py -- <out_dir>
"""
import math, os, sys
sys.path.insert(0, os.path.dirname(__file__))
import bmesh
from mathutils import Vector, Matrix
from kit import Kit, T, RZ

out = os.path.abspath(sys.argv[sys.argv.index('--') + 1])

HEAD_C = Vector((0, 0, 1.2))          # head centre; body below, ~50% of the height is head
HR, HS = 0.4, Vector((1.08, 0.96, 0.95))   # head radius and ellipsoid scale

PRESETS = [
    dict(hair='twintail', ears=None, outfit='dress', skin='#fbe3d6', hairc='#7b4fc9', top='#5b3fa8', bottom='#e8d9ff',
         shoe='#3b2b66', eye='#8a5cf0'),
    dict(hair='spiky', ears=None, outfit='shorts', skin='#f6d8c4', hairc='#eceaf4', top='#2f4f9e', bottom='#f2f2f2',
         shoe='#2a2a3a', eye='#c0392b'),
    dict(hair='bob', ears='cat', outfit='dress', skin='#fde8dc', hairc='#f4f1ea', top='#f2c230', bottom='#ffffff',
         shoe='#e0a526', eye='#3e8ed0'),
    dict(hair='long', ears=None, outfit='pants', skin='#f3d3bd', hairc='#4fb3d9', top='#d94f8a', bottom='#3a3d6b',
         shoe='#ffffff', eye='#2fa38a'),
]


def ell(k, c, size, m, M=Matrix(), seg=16, rings=10):
    """Ellipsoid with half-extents `size` in a local frame M, centred at local c."""
    g = bmesh.ops.create_uvsphere(k.bm, u_segments=seg, v_segments=rings, radius=1)
    for v in g['verts']:
        v.co = M @ (Vector(c) + Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2])))
    k._tag({f for v in g['verts'] for f in v.link_faces}, m)


def on_head(x, z, lift=0.0, back=False):
    """Frame sitting on the head ellipsoid at local (x, z): Y = outward normal. Returns a Matrix."""
    a, b, c = HR * HS.x, HR * HS.y, HR * HS.z
    s = max(0.0, 1 - (x / a) ** 2 - (z / c) ** 2)
    y = (1 if back else -1) * b * math.sqrt(s)
    n = Vector((x / a ** 2, y / b ** 2, z / c ** 2)).normalized()
    up = (Vector((0, 0, 1)) - n * n.z).normalized()
    side = n.cross(up)
    p = HEAD_C + Vector((x, y, z)) + n * lift
    M = Matrix((side, n, up)).transposed().to_4x4()
    M.translation = p
    return M


def face(k, P, pre):
    for sx in (-1, 1):
        x = 0.155 * sx
        ell(k, (0, 0, 0), (0.07, 0.03, 0.095), pre + 'eyedark', on_head(x, -0.07, 0.0))
        ell(k, (0, 0, -0.012), (0.052, 0.03, 0.068), pre + 'eye', on_head(x, -0.08, 0.008))
        ell(k, (0, 0, 0), (0.026, 0.03, 0.032), pre + 'white', on_head(x - 0.02 * sx, -0.035, 0.014))
        ell(k, (0, 0, 0), (0.012, 0.03, 0.012), pre + 'white', on_head(x + 0.025 * sx, -0.11, 0.014))
        ell(k, (0, 0, 0), (0.06, 0.02, 0.03), pre + 'blush', on_head(0.25 * sx, -0.17, 0.0))
        ell(k, (0, 0, 0), (0.04, 0.02, 0.009), pre + 'eyedark', on_head(x, 0.075, 0.0))   # brow
    ell(k, (0, 0, 0), (0.025, 0.02, 0.012), pre + 'eyedark', on_head(0, -0.2, 0.0))       # mouth


def cap(k, pre, theta=100, tilt=(0, 0.45, 1), grow=1.07):
    """Hair shell over the top/back of the head, open toward the face, with thickness."""
    prof = [(math.sin(math.radians(a)), math.cos(math.radians(a))) for a in range(0, theta + 1, 6)]
    prof += [(0.92 * r, 0.92 * z) for r, z in reversed(prof)]
    prof[0], prof[-1] = (0, 1), (0, 0.92)
    R = Vector((0, 0, 1)).rotation_difference(Vector(tilt).normalized()).to_matrix().to_4x4()
    S = Matrix.Diagonal((*(HS * HR * grow), 1))
    k.lathe(prof, pre + 'hair', T(*HEAD_C) @ S @ R)


def bangs(k, pre, n=5, span=0.3, z=0.17, h=0.13):
    for i in range(n):
        x = (i / (n - 1) - 0.5) * 2 * span
        ell(k, (0, 0, 0), (0.085, 0.05, h), pre + 'hair', on_head(x, z - abs(x) * 0.25, 0.02) @ Matrix.Rotation(-x * 0.9, 4, 'Y'))


def hair(k, P, pre):
    style = P['hair']
    if style == 'twintail':
        cap(k, pre); bangs(k, pre)
        for s in (-1, 1):
            base = HEAD_C + Vector((0.4 * s, 0.08, 0.16))
            path = [base + Vector((s * dx, 0.02 * i, dz)) for i, (dx, dz) in
                    enumerate([(0, 0), (0.1, -0.08), (0.17, -0.25), (0.16, -0.45), (0.1, -0.62), (0.05, -0.72)])]
            k.tube(path, lambda i: [0.1, 0.13, 0.13, 0.11, 0.07, 0.025][i], pre + 'hair', sides=12)
            ell(k, base, (0.06, 0.06, 0.06), pre + 'top')
    elif style == 'spiky':
        cap(k, pre, theta=95); bangs(k, pre, n=4, span=0.26, h=0.11)
        for yaw, pitch, L in [(0, 10, 0.3), (40, 25, 0.26), (-40, 25, 0.26), (80, 40, 0.24), (-80, 40, 0.24),
                              (150, 35, 0.24), (-150, 35, 0.24), (180, 55, 0.22)]:
            d = Vector((math.sin(math.radians(yaw)) * math.sin(math.radians(pitch)),
                        math.cos(math.radians(yaw)) * math.sin(math.radians(pitch)) * -1 * -1,
                        math.cos(math.radians(pitch))))
            Rm = Vector((0, 0, 1)).rotation_difference(d).to_matrix().to_4x4()
            k.lathe([(0.13, 0), (0.1, L * 0.5), (0, L)], pre + 'hair', T(*(HEAD_C + d * 0.3)) @ Rm, seg=10)
    elif style == 'bob':
        cap(k, pre, theta=112, grow=1.09); bangs(k, pre, n=6, span=0.32, h=0.14)
        for s in (-1, 1):
            ell(k, (0.36 * s, 0.05, -0.1), (0.1, 0.18, 0.2), pre + 'hair', T(*HEAD_C))
    elif style == 'long':
        cap(k, pre, theta=108); bangs(k, pre, n=5, span=0.3)
        ell(k, (0, 0.22, -0.32), (0.4, 0.2, 0.42), pre + 'hair', T(*HEAD_C))
        ell(k, HEAD_C + Vector((0, 0.15, 0.4)), (0.15, 0.15, 0.13), pre + 'hair')   # bun
        ell(k, HEAD_C + Vector((0, 0.1, 0.33)), (0.16, 0.08, 0.04), pre + 'top')    # bun tie
    if P['ears'] == 'cat':
        for s in (-1, 1):
            Rm = Matrix.Rotation(math.radians(-24 * s), 4, 'Y') @ Matrix.Rotation(math.radians(8), 4, 'X')
            k.lathe([(0.12, 0), (0.07, 0.11), (0, 0.2)], pre + 'hair', T(*(HEAD_C + Vector((0.24 * s, 0.03, 0.3)))) @ Rm, seg=12)
            k.lathe([(0.065, 0), (0.035, 0.08), (0, 0.13)], pre + 'blush',
                    T(*(HEAD_C + Vector((0.25 * s, -0.035, 0.31)))) @ Rm, seg=10)


def body(k, P, pre):
    S = Matrix.Diagonal((1.15, 0.88, 1, 1))
    k.lathe([(0, 0.4), (0.17, 0.4), (0.19, 0.55), (0.21, 0.7), (0.19, 0.8), (0.12, 0.86), (0, 0.88)], pre + 'top', S)
    if P['outfit'] == 'dress':
        k.lathe([(0, 0.6), (0.2, 0.6), (0.27, 0.48), (0.32, 0.38), (0.31, 0.35), (0, 0.35)], pre + 'bottom', S)
        legc = pre + 'skin'
    elif P['outfit'] == 'shorts':
        k.lathe([(0, 0.56), (0.2, 0.56), (0.23, 0.42), (0.22, 0.36), (0, 0.36)], pre + 'bottom', S)
        legc = pre + 'skin'
    else:
        k.lathe([(0, 0.56), (0.2, 0.56), (0.22, 0.42), (0, 0.38)], pre + 'bottom', S)
        legc = pre + 'bottom'
    for s in (-1, 1):
        k.tube([Vector((0.1 * s, 0, 0.42)), Vector((0.1 * s, 0, 0.12))], 0.075, legc, sides=12)
        k.tube([Vector((0.1 * s, -0.01, 0.06)), Vector((0.1 * s, -0.01, 0.2))], 0.088, pre + 'shoe', sides=14)
        ell(k, (0.1 * s, -0.04, 0.065), (0.095, 0.13, 0.07), pre + 'shoe')
        sh, el, wr = Vector((0.2 * s, 0, 0.78)), Vector((0.29 * s, -0.01, 0.64)), Vector((0.33 * s, -0.03, 0.53))
        ell(k, sh, (0.075, 0.075, 0.075), pre + 'top')
        k.tube([sh, el], 0.068, pre + 'top', sides=12)
        k.tube([el, wr], 0.055, pre + 'skin', sides=12)
        ell(k, wr + Vector((0.01 * s, 0, -0.05)), (0.065, 0.06, 0.07), pre + 'skin')
    ell(k, HEAD_C, HS * HR, pre + 'skin', seg=32, rings=20)


colours = {}
for i, P in enumerate(PRESETS):
    pre = f'c{i}_'
    colours.update({pre + 'skin': P['skin'], pre + 'hair': P['hairc'], pre + 'top': P['top'], pre + 'bottom': P['bottom'],
                    pre + 'shoe': P['shoe'], pre + 'eye': P['eye'], pre + 'eyedark': '#2b2140', pre + 'white': '#ffffff',
                    pre + 'blush': '#f4a6a6'})
k = Kit(colours, seg=32)
for i, P in enumerate(PRESETS):
    pre = f'c{i}_'
    before = set(k.bm.verts)   # not a slice: bmesh reuses freed vertex slots, so new verts aren't all at the end
    body(k, P, pre); face(k, P, pre); hair(k, P, pre)
    new = [v for v in k.bm.verts if v not in before]
    dx = (i - (len(PRESETS) - 1) / 2) * 1.25
    for v in new:
        v.co.x += dx
    print(f'preset {i}: {len(new)} verts')

W = (len(PRESETS) - 1) * 1.25
k.finish('chibi_lineup', out, max_tris=60000, max_bytes=3_000_000, smooth_angle=60,
         previews=[('front.png', (0, 0, 0.85), 0, 4, 9.5), ('three_quarter.png', (0, 0, 0.85), 30, 10, 9.5),
                   ('close.png', (-W / 2, 0, 1.0), 20, 6, 3.4), ('back.png', (0, 0, 0.85), 180, 8, 9.5)])
