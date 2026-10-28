# -*- coding: utf-8 -*-
"""Paper doll (紙娃娃) base — procedural toon puppet after design/paper_doll/turnaround_v1.png:
an espresso-haired barista with caramel tips, cream shirt, red ribbon, denim apron, dark shorts and tights,
chunky brown boots. About 3.2 heads tall; 98 sprite px on the café grid.

usage: blender -b -P doll_model.py -- [--out DIR]

Every part is its own object; OWN[name] says which rig pivot it rides on (doll_anim.py attaches them),
so a slot swap (another hairdo, another top) is just other objects on the same pivots.
Run directly it renders a model-check turnaround (front / f / side / b, toon + outline) into DIR.
"""
import json, math, os, sys
import bpy, bmesh
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import toonkit as T  # noqa: E402

ARGV = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
OUT = ARGV[ARGV.index("--out") + 1] if "--out" in ARGV else os.path.join(REPO, "design", "paper_doll", "toon", "model")
# --hair code (swept locks, default) | meshy (a sculpted hair part cut by meshy_hair.py, from --hair-src)
HAIR_MODE = ARGV[ARGV.index("--hair") + 1] if "--hair" in ARGV else "code"
HAIR_SRC = ARGV[ARGV.index("--hair-src") + 1] if "--hair-src" in ARGV else os.path.join(
    REPO, "design", "paper_doll", "toon", "meshy_hair", "hair.blend")

# ----------------------------------------------------------------- palette (sRGB hex)
SKIN = "F7DCC8"
HAIR = "6E4A3A"       # espresso
HAIR_TIP = "BE8054"   # caramel ombré
SHIRT = "FDEFDC"
SHIRT_D = "EED9BF"    # rolled cuffs
RIBBON = "D9704A"
DENIM = "43548A"      # the gpt sheet's apron denim (navy), darker than the UI's #3F5DAA
DENIM_D = "323F6E"
SHORTS = "282A3A"
TIGHTS = "2E2729"
BOOT = "8E5B3D"
BOOT_D = "6A4130"
SOLE = "3A2820"
PRINT = "E9DCC4"      # coffee-bean print on the bib
STITCH = "C98A55"     # top-stitching on the denim
LACE = "E0B98A"
FACE_INK = "2B1B17"

# warm materials (skin, cream shirt, hair) shade toward peach/umber instead of the cool blue shadow
WARM = [(0.00, (0.92, 0.79, 0.74)), (0.36, (0.98, 0.95, 0.93)), (0.74, (1.0, 1.0, 0.98))]

T.new_scene("Doll")
M = {k: T.toon_mat(k, v, ramp=WARM if k in ("skin", "hair", "hair_tip", "shirt", "shirt_d", "ribbon", "boot",
                                                "boot_d") else None)
     for k, v in (("skin", SKIN), ("hair", HAIR), ("hair_tip", HAIR_TIP), ("shirt", SHIRT),
                  ("shirt_d", SHIRT_D), ("ribbon", RIBBON), ("denim", DENIM),
                  ("denim_d", DENIM_D), ("shorts", SHORTS), ("tights", TIGHTS),
                  ("boot", BOOT), ("boot_d", BOOT_D), ("sole", SOLE))}
M_STITCH = T.flat_mat("stitch", STITCH)
# the face stays mostly lit (anime faces carry little shading); only its far edge drops into shadow
M["face"] = T.toon_mat("face", SKIN, ramp=[(0.00, (0.80, 0.80, 0.90)), (0.22, (0.96, 0.95, 0.97)),
                                            (0.62, (1.0, 0.99, 0.96))])
M_INK = T.flat_mat("face_ink", FACE_INK, stamp=True)
M_PRINT = T.flat_mat("print", PRINT)
xf, ellipsoid, capsule, sweep, bezier = T.xf, T.ellipsoid, T.capsule, T.sweep, T.bezier

OWN = {}   # object name -> pivot


def own(pivot, *objs):
    for o in objs:
        OWN[o.name] = pivot
    return objs[0] if len(objs) == 1 else objs


def along(a, b):
    """Rotation whose Z axis points from a to b."""
    return (Vector(b) - Vector(a)).to_track_quat("Z", "Y").to_matrix()


# ----------------------------------------------------------------- head
HEAD_C = Vector((0, 0, 3.0))
FACE_R = (0.48, 0.44, 0.50)


def face_shape(co):
    # anime chin: the lower half narrows and comes a little forward, cheeks stay soft
    if co.z < 0:
        t = -co.z / FACE_R[2]
        co.x *= 1 - 0.30 * t * t
        co.y *= 1 - 0.12 * t * t
        co.y -= 0.04 * t
    return co


face = own("neck", ellipsoid("face", M["face"], FACE_R, xf(HEAD_C), deform=face_shape, seg=48, rings=24))
own("neck", capsule("neck", M["skin"], (0, 0.02, 2.30), (0, 0.02, 2.62), 0.075, 0.075))


def face_y(x, z):
    """Front surface depth of the face at (x, z) (negative y), for laying hair on it."""
    u = (z - HEAD_C.z) / FACE_R[2]
    v = x / FACE_R[0]
    return -FACE_R[1] * math.sqrt(max(0.0, 1 - u * u - v * v))


# hair cap: covers the skull; its front-lower part is tucked inside the face so a hairline shows
# taller, rounder crown after the paint-over (design/paper_doll/toon/views/paintover_v1.png)
CAP_C = Vector((0, 0.05, 3.16))
CAP_R = (0.56, 0.53, 0.66)


def cap_shape(co):
    if co.y < -0.12 and co.z < 0.14:
        co *= 0.80
    return co


own("neck", ellipsoid("hair_cap", M["hair"], CAP_R, xf(CAP_C), deform=cap_shape, seg=40, rings=20))

lock_w = lambda w: (lambda t: w * (0.75 + 0.45 * math.sin(math.pi * min(1.0, t * 1.1))) * (1 - 0.55 * t))
lock_t = lambda h: (lambda t: h * (1 - 0.4 * t))

# bangs: fall from the crown over the forehead, ending at the brows (the eyes stay clear)
for i, (x0, ze, dx) in enumerate(((-0.36, 3.10, -0.06), (-0.19, 3.04, -0.03), (-0.01, 3.08, 0.02),
                                  (0.17, 3.03, 0.04), (0.34, 3.11, 0.07))):
    ye = face_y(x0 + dx, ze) - 0.07
    sp = bezier((x0 * 0.4, -0.22, 3.72), (x0 * 0.9, -0.66, 3.56), (x0 + dx, ye - 0.04, 3.22), (x0 + dx, ye, ze))
    own("neck", sweep(f"hair_bang{i}", M["hair"], sp, Vector((1, 0, 0)), lock_w(0.12), lock_t(0.05)))

# side locks past the cheeks: wide at the jaw, tips flicking out (or tucking in) like the sheet's wavy bob
for side, s in (("L", 1), ("R", -1)):
    for i, (y0, ze, out, flick) in enumerate(((-0.24, 2.66, 0.56, 0.10), (-0.10, 2.52, 0.70, 0.16),
                                              (0.06, 2.58, 0.74, -0.06), (0.18, 2.48, 0.70, 0.14))):
        sp = bezier((s * 0.44, y0, 3.50), (s * 0.78, y0 - 0.06, 3.22), (s * 0.78, y0 - 0.02, 2.94),
                    (s * (out - 0.06), y0 + 0.02, ze + 0.12), (s * (out + flick), y0 + 0.04, ze))
        own(f"hair_{side}", sweep(f"hair_side{side}{i}", M["hair"], sp, Vector((0, 1, 0)), lock_w(0.15),
                                  lock_t(0.09), tip_mat=M["hair_tip"], tip_from=0.64))

# back mass in two layers so strands overlap (their ink edges read as hair texture): an inner layer of long
# locks bulging out at the jaw and an outer layer of shorter ones in between; lengths, waves and tip flicks vary
# so the hem is ragged, not a lampshade. Caramel tips.
N_BACK = 10
BACK_LOCKS = []     # (angle, spine, object) for the strand lines
for layer, (r_mid, r_add, dz, w) in enumerate(((0.80, 0.00, 0.00, 0.21), (0.88, 0.07, 0.16, 0.18))):
    for i in range(N_BACK):
        th = math.radians(-24 + 228 * (i + 0.5 * layer) / (N_BACK - 1))      # 90 = straight back (+Y)
        c, s_ = math.cos(th), math.sin(th)
        back = max(0.0, s_)                                  # longer at the back, shorter at the sides
        k = i * 2.9 + layer * 1.7
        ze = 2.74 - 0.28 * back + 0.08 * math.sin(k) + dz
        flick = (0.12 + 0.05 * math.sin(k * 1.3)) * (1 if (i + layer) % 3 else -0.6)    # out, sometimes in
        tw = 0.10 * math.sin(k * 0.7)
        r1 = r_mid + 0.04 * math.sin(k * 1.9)
        at = lambda r, a, z: Vector((r * math.cos(a), r * math.sin(a) + 0.05, z))
        sp0 = bezier(at(0.24, th, 3.82), at(0.70 + r_add, th, 3.64), at(r1, th, 3.06),
                     at(r1 - 0.06, th + tw, ze + 0.16), at(r1 - 0.04 + flick, th + tw * 1.5, ze))
        side = Vector((-s_, c, 0))

        def sp(t, sp0=sp0, side=side, ph=k):
            return sp0(t) + side * (0.05 * math.sin(t * math.pi * 2.4 + ph) * t)
        BACK_LOCKS.append((th, sp, own("hair_back", sweep(f"hair_back{layer}_{i}", M["hair"], sp, side, lock_w(w),
                                                          lock_t(0.16), tip_mat=M["hair_tip"], tip_from=0.66))))


def hair_strands(locks, ts, prefix):
    """Strand lines down the seams between neighbouring locks. The locks sit at almost one depth, so their hulls
    can't ink them; instead each seam is sampled into stamp points on the hair surface (found by casting in from
    outside), and sheet.py stamps one dark pixel at each projected point (hidden ones are skipped), so the lines
    follow the hair in every pose like the face does."""
    for mod in T.HULLS:                     # cast against the hair, not the (inside-out) outline shells
        mod.show_viewport = False
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    locks = sorted(locks, key=lambda l: l[0])
    for j, ((_, a, owner), (_, b, _)) in enumerate(zip(locks, locks[1:])):
        if j % 2:                           # every other seam, each its own length, so it isn't a comb
            continue
        t0, t1 = 0.30 + 0.08 * math.sin(j * 2.1), 0.58 + 0.10 * math.sin(j * 1.3 + 1)
        for k, t in enumerate(t for t in ts if t0 <= t <= t1):
            mid = (a(t) + b(t)) / 2
            out = Vector((mid.x, mid.y - 0.05, 0)).normalized()
            hit, loc, n, *_ = T.SC.ray_cast(dg, mid + out * 1.0, -out)
            if hit:
                T.STAMP_PTS[f"{prefix}{j}_{k}"] = (loc, n)
                T.STAMP_OWNER[f"{prefix}{j}_{k}"] = owner.name
    for mod in T.HULLS:
        mod.show_viewport = True


hair_strands(BACK_LOCKS, [0.22 + 0.025 * k for k in range(26)], "strand_")

# ahoge: one springy curl on top
own("ahoge", sweep("hair_ahoge", M["hair"], bezier((0, -0.02, 3.72), (0.02, -0.10, 4.17), (0.26, -0.02, 4.20),
                                                    (0.16, 0.06, 4.02)), Vector((0, 1, 0)),
                   lambda t: 0.055 * (1 - 0.5 * t), lambda t: 0.035))



def meshy_hair(path):
    """Swap the swept locks for a sculpted hair part (meshy_hair.py output, already placed on this head): the back
    mass below the crown rides hair_back so it still lags the body, the rest rides the head."""
    for name in [n for n in OWN if n.startswith(("hair_bang", "hair_side", "hair_back"))]:
        bpy.data.objects.remove(bpy.data.objects[name])
        del OWN[name]
    for k in [k for k in T.STAMP_PTS if k.startswith("strand_")]:
        del T.STAMP_PTS[k], T.STAMP_OWNER[k]
    T.HULLS[:] = [m for m in T.HULLS if m.id_data.name in bpy.data.objects]
    with bpy.data.libraries.load(path) as (src, dst):
        dst.meshes = ["hair_meshy"]
    me = dst.meshes[0]
    parts = {"hair_meshy": bmesh.new(), "hair_meshy_back": bmesh.new()}
    for key, bm in parts.items():
        bm.from_mesh(me)
        back = lambda c: c.y > 0.10 and c.z < 3.35
        drop = [f for f in bm.faces if back(f.calc_center_median()) != (key == "hair_meshy_back")]
        bmesh.ops.delete(bm, geom=drop, context="FACES")
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
        own("hair_back" if key == "hair_meshy_back" else "neck", T.new_obj(key, bm, [M["hair"], M["hair_tip"]]))
    bpy.data.meshes.remove(me)


if HAIR_MODE == "meshy":
    meshy_hair(HAIR_SRC)

# face features are stamped as pixel shapes at their projected spots (sheet.py FACE), never rendered
for side, x in (("R", -0.19), ("L", 0.19)):
    T.stamp_point(f"eye_{side}", face, x, 2.91, face)
    T.stamp_point(f"blush_{side}", face, x * 1.55, 2.78, face)
T.stamp_point("mouth", face, 0.0, 2.69, face)

# ----------------------------------------------------------------- torso
own("chest", T.lathe("shirt", M["shirt"], [
    (1.48, 0.00, 0.00), (1.48, 0.27, 0.21), (1.62, 0.28, 0.21), (1.85, 0.30, 0.22), (2.05, 0.32, 0.23),
    (2.20, 0.34, 0.22), (2.30, 0.30, 0.20), (2.38, 0.16, 0.13), (2.42, 0.00, 0.00)]))
for side, s in (("L", 1), ("R", -1)):
    own("chest", ellipsoid(f"collar_{side}", M["shirt"], (0.085, 0.035, 0.05),
                           xf((s * 0.075, -0.13, 2.37), (math.radians(-25), 0, math.radians(s * 30)))))
    own("chest", ellipsoid(f"ribbon_loop{side}", M["ribbon"], (0.065, 0.028, 0.042),
                           xf((s * 0.07, -0.19, 2.32), (0, math.radians(s * 15), 0))))
own("chest", ellipsoid("ribbon_knot", M["ribbon"], (0.032, 0.03, 0.035), xf((0, -0.205, 2.32))))
own("chest", ellipsoid("waistband", M["denim_d"], (0.315, 0.245, 0.05), xf((0, 0, 1.61))))

bib = own("chest", T.panel("apron_bib", M["denim"], [(2.08, 0.345, 0.255), (1.85, 0.325, 0.245),
                                                       (1.62, 0.305, 0.235)], -math.pi / 2 - 0.85, -math.pi / 2 + 0.85))
for i, x in enumerate((-0.045, 0.045)):     # coffee-bean print
    own("chest", T.decal(f"print_bean{i}", M_PRINT, bib, x, 1.92, (0.035, 0.012, 0.055), spin=0.4 * (1 - 2 * i),
                         lift=0.02))
for side, s in (("L", 1), ("R", -1)):       # straps over the shoulders to the back of the waist
    sp = bezier((s * 0.20, -0.25, 2.04), (s * 0.23, -0.24, 2.42), (s * 0.22, 0.02, 2.52),
                (s * 0.21, 0.26, 2.30), (s * 0.13, 0.25, 1.66))
    own("chest", sweep(f"apron_strap{side}", M["denim"], sp, Vector((1, 0, 0)), lambda t: 0.05, lambda t: 0.022))

SKIRT = [(1.63, 0.315, 0.245), (1.45, 0.37, 0.30), (1.28, 0.42, 0.35), (1.15, 0.45, 0.38)]
FRONT = -math.pi / 2
skirt = own("skirt", T.panel("apron_skirt", M["denim"], SKIRT, FRONT - 2.25, FRONT + 2.25))
own("skirt", ellipsoid("apron_bowknot", M["denim_d"], (0.05, 0.04, 0.05), xf((0, 0.27, 1.61))))
for side, s in (("L", 1), ("R", -1)):
    own("skirt", ellipsoid(f"apron_bow{side}", M["denim"], (0.10, 0.035, 0.065),
                           xf((s * 0.11, 0.28, 1.63), (0, math.radians(s * -20), 0))))
    own("skirt", sweep(f"apron_tail{side}", M["denim"], bezier((s * 0.03, 0.29, 1.58), (s * 0.08, 0.33, 1.45),
                                                                 (s * 0.10, 0.32, 1.30)),
                       Vector((1, 0, 0)), lambda t: 0.055, lambda t: 0.02))


def prof_at(prof, z):
    """(rx, ry) of a lathe/panel profile at height z (linear between rows)."""
    rows = sorted(prof)
    for (z0, a0, b0), (z1, a1, b1) in zip(rows, rows[1:]):
        if z0 <= z <= z1:
            t = (z - z0) / (z1 - z0)
            return a0 + (a1 - a0) * t, b0 + (b1 - b0) * t
    return rows[0][1:] if z < rows[0][0] else rows[-1][1:]


def on_cloth(name, prof, z0, z1, a0, a1, mat, lift=0.012, seg=6, thick=0.006):
    """A thin patch lying on a cloth profile (pocket, a stitch dash)."""
    rows = [(z, *[r + lift for r in prof_at(prof, z)]) for z in (z0, (z0 + z1) / 2, z1)]
    return T.panel(name, mat, rows, a0, a1, thick=thick, seg=seg)


def stitches(name, prof, z, a0, a1, n, pivot, lift=0.016):
    """A dashed top-stitch line round a cloth profile at height z (feature pass, so it survives the vote)."""
    for i in range(n):
        u0, u1 = a0 + (a1 - a0) * i / n, a0 + (a1 - a0) * (i + 0.6) / n
        o = own(pivot, on_cloth(f"{name}{i}", prof, z - 0.016, z + 0.016, u0, u1, M_STITCH, lift=lift, seg=3))
        T.FEATURES.append(o)


def stitch_down(name, prof, z0, z1, a, n, pivot, lift=0.016, w=0.035):
    """A dashed vertical stitch at angle a from z0 to z1."""
    for i in range(n):
        u0, u1 = z0 + (z1 - z0) * i / n, z0 + (z1 - z0) * (i + 0.6) / n
        rx = prof_at(prof, (u0 + u1) / 2)[0]
        o = own(pivot, on_cloth(f"{name}{i}", prof, u0, u1, a - w / rx / 2, a + w / rx / 2, M_STITCH, lift=lift, seg=1))
        T.FEATURES.append(o)


stitches("stitch_hem", SKIRT, 1.19, FRONT - 2.1, FRONT + 2.1, 26, "skirt")
for side, s in (("L", 1), ("R", -1)):           # patch pockets, stitched round
    a0, a1 = FRONT + s * 0.28, FRONT + s * 0.78
    own("skirt", on_cloth(f"apron_pocket{side}", SKIRT, 1.25, 1.42, min(a0, a1), max(a0, a1), M["denim_d"]))
    stitches(f"stitch_pocket{side}", SKIRT, 1.40, min(a0, a1), max(a0, a1), 4, "skirt", lift=0.022)
    stitch_down(f"stitch_pocketside{side}", SKIRT, 1.26, 1.40, a1 - s * 0.04, 2, "skirt", lift=0.022)
BIB = [(2.08, 0.345, 0.255), (1.85, 0.325, 0.245), (1.62, 0.305, 0.235)]
stitches("stitch_bib", BIB, 2.035, FRONT - 0.78, FRONT + 0.78, 8, "chest", lift=0.01)

own("hips", T.lathe("shorts", M["shorts"], [
    (1.62, 0.00, 0.00), (1.62, 0.29, 0.22), (1.45, 0.34, 0.27), (1.26, 0.38, 0.30), (1.05, 0.40, 0.32),
    (1.05, 0.00, 0.00)]))
own("hips", ellipsoid("shorts_hem", M["shorts"], (0.405, 0.325, 0.035), xf((0, 0, 1.07))))

# ----------------------------------------------------------------- arms
for side, s in (("L", 1), ("R", -1)):
    sh, el, wr = Vector((s * 0.36, 0, 2.24)), Vector((s * 0.44, 0, 1.80)), Vector((s * 0.48, -0.03, 1.40))
    own(f"arm_{side}", capsule(f"sleeve_{side}", M["shirt"], sh, el, 0.105, 0.095))
    own(f"arm_{side}", ellipsoid(f"cuff_{side}", M["shirt_d"], (0.112, 0.112, 0.05), xf(sh.lerp(el, 0.9), along(sh, el))))
    own(f"forearm_{side}", capsule(f"forearm_{side}", M["skin"], el, wr, 0.06, 0.05))
    d = (wr - el).normalized()
    own(f"forearm_{side}", ellipsoid(f"hand_{side}", M["skin"], (0.055, 0.045, 0.085), xf(wr + d * 0.07, along(el, wr))))

# ----------------------------------------------------------------- legs + boots
flat_bottom = lambda co: Vector((co.x, co.y, co.z * 0.55 if co.z < 0 else co.z))
for side, s in (("L", 1), ("R", -1)):
    x = s * 0.16
    own(f"leg_{side}", capsule(f"thigh_{side}", M["tights"], (x, 0, 1.45), (x, 0, 0.93), 0.14, 0.115))
    own(f"shin_{side}", capsule(f"shin_{side}", M["tights"], (x, 0, 0.93), (x, 0.02, 0.42), 0.11, 0.085))
    own(f"foot_{side}", capsule(f"boot_shaft_{side}", M["boot"], (x, 0.02, 0.52), (x, 0.0, 0.18), 0.135, 0.145),
        ellipsoid(f"boot_cuff_{side}", M["boot_d"], (0.15, 0.15, 0.055), xf((x, 0.02, 0.54))),
        ellipsoid(f"boot_toe_{side}", M["boot"], (0.15, 0.25, 0.135), xf((x, -0.10, 0.15)), deform=flat_bottom),
        ellipsoid(f"boot_sole_{side}", M["sole"], (0.16, 0.27, 0.06), xf((x, -0.09, 0.055)), deform=flat_bottom))

# the head reads bigger in the chibi sheet than modelled: grow every head part about the neck base
HEAD_PIVOTS = ("neck", "hair_back", "hair_L", "hair_R", "ahoge")
HEAD_S, HEAD_BASE = 1.12, Vector((0, 0, 2.50))


def head_pt(p):
    """A rest point on the head after the head grow (doll_anim uses it for the hair pivots)."""
    return HEAD_BASE + (Vector(p) - HEAD_BASE) * HEAD_S


_grow = Matrix.Translation(HEAD_BASE) @ Matrix.Scale(HEAD_S, 4) @ Matrix.Translation(-HEAD_BASE)
for name, pv in OWN.items():
    if pv in HEAD_PIVOTS and name != "neck":
        bpy.data.objects[name].data.transform(_grow)
for k, (p, n) in list(T.STAMP_PTS.items()):
    T.STAMP_PTS[k] = (head_pt(p), n)

# boot laces: stamped like the face (a crisp criss-cross that follows the foot)
for side, s in (("L", 1), ("R", -1)):
    shaft = bpy.data.objects[f"boot_shaft_{side}"]
    T.stamp_point(f"lace_{side}", shaft, s * 0.16, 0.36, shaft)

# inner ink lines: hair strands, the jaw and hairline, arms and legs over the body, boots
T.ink(*[bpy.data.objects[n] for n in OWN if not n.startswith("hair_meshy") and n.startswith(("hair_", "face", "sleeve_", "forearm_", "hand_",
                                                             "thigh_", "shin_", "boot_shaft", "boot_toe",
                                                             "boot_cuff", "shorts_hem", "apron_bow", "apron_tail"))])
# the back mass is many locks at almost one depth: a heavier hull lets their edges survive as strand lines
T.ink(*[bpy.data.objects[n] for n in OWN if n.startswith(("hair_back", "hair_side"))], w=0.085)

SCALE = 1.0                      # modelled ~3.9 units tall; this lands the sprite at 98 px with the outline
T.ROOT.scale = (SCALE, SCALE, SCALE)
T.setup_render()

BOOTS = [n for n in OWN if n.startswith("boot_")]

if __name__ == "__main__":          # imported by doll_anim.py: build + render setup only
    os.makedirs(OUT, exist_ok=True)
    stamps = {}
    for name, ang in (("front", 0.0), ("f", T.VIEWS["f"]), ("side", math.pi / 2), ("b", T.VIEWS["b"])):
        T.ROOT.rotation_euler.z = ang
        stamps[name] = T.render_frame(OUT, name, toon=True)
    T.ROOT.rotation_euler.z = 0
    with open(os.path.join(OUT, "stamps.json"), "w") as f:
        json.dump(stamps, f, indent=1)
    T.write_palette(os.path.join(OUT, "palette.json"))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "doll.blend"))
    print("DOLL DONE", OUT)
