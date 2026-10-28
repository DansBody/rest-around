# -*- coding: utf-8 -*-
"""Toon puppet toolkit for the paper doll's 3D -> pixel-sprite pipeline (runs inside Blender).

Ported from 丹的大冒險 (miffy-adventure/game/dan3d/toonkit.py) and changed to the café's sprite grid:
a 64x112 cell, 24 sprite px per unit, feet on row 106, camera 18 deg above the horizon, two facings
f (3/4 front, turned 0.5 rad toward screen-right) and b (3/4 back), ink #1F2A4A.

  new_scene(name)            reset Blender, create the character root empty
  toon_mat / flat_mat        materials; every colour they can output is tracked for the palette
  ellipsoid / lathe / panel / sweep / decal    procedural parts
  stamp_point(...)           a face feature that sprites stamp as a crisp pixel shape
  Rig                        pivot-empty puppet rig (parts parented rigidly to pivots)
  render_anims(...)          render posed frames on the fixed sprite grid + write metadata

Axes: a character faces -Y, up is +Z, its LEFT is +X. Feet stand on z = 0.
Module state (SC, ROOT, ...) is reset by new_scene(); always use it as `T.ROOT`.
"""
import json, math, os
import bpy, bmesh
from mathutils import Vector, Matrix, Euler

# toon ramp: luminance thresholds -> multiplier (two tones + a highlight, cool blue shadows)
RAMP = [(0.00, (0.70, 0.72, 0.86)), (0.36, (0.93, 0.92, 0.95)), (0.74, (1.0, 0.98, 0.93))]
OUTLINE_W = 0.014
INK_W = 0.05        # hull width of inked parts: about one sprite px, so it survives the majority vote
LINE = "1F2A4A"

# Fixed pixel grid (tools/sprites/schedule.json "doll" grid at the 98-px size): SUPER source px per sprite px.
SUPER = 10
PPU = 24
CANVAS_W, CANVAS_H = 64, 112
GROUND_ROW = 106
ELEV = 18.0
VIEWS = {"f": 0.5, "b": math.pi - 0.5}     # root yaw per facing (+ turns the face toward screen-right)

SC = COL = ROOT = M_LINE = None
HULLS = []          # outline (inverted hull) modifiers
INKED = []          # hulls kept in the sprite source: inner ink lines (hair strands, jaw, arm over body)
FEATURES = []       # small flat details forced through the feature pass (apron print etc.)
STAMPED = []        # modelled face parts hidden in sprite sources (stamped instead)
STAMP_PTS = {}      # name -> (rest point, rest normal)
STAMP_OWNER = {}    # name -> object whose transform the point follows
PALETTE = []        # (kind, hex, flags) for every material


def lin(hex_):
    c = [int(hex_[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c) + (1.0,)


def new_scene(root_name):
    global SC, COL, ROOT, M_LINE
    bpy.ops.wm.read_factory_settings(use_empty=True)
    SC = bpy.context.scene
    COL = SC.collection
    ROOT = bpy.data.objects.new(root_name, None)
    COL.objects.link(ROOT)
    for lst in (HULLS, INKED, FEATURES, STAMPED, PALETTE):
        lst.clear()
    STAMP_PTS.clear()
    STAMP_OWNER.clear()
    M_LINE = flat_mat("outline", LINE, backface_cull=True, track=False)
    return ROOT


# ----------------------------------------------------------------- materials
def toon_mat(name, hex_, ramp=None):
    """ramp: own thresholds for this material (e.g. a face that should stay mostly lit)."""
    ramp_ = ramp or RAMP
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    diff = nt.nodes.new("ShaderNodeBsdfDiffuse")
    diff.inputs["Color"].default_value = (1, 1, 1, 1)
    s2r = nt.nodes.new("ShaderNodeShaderToRGB")
    bw = nt.nodes.new("ShaderNodeRGBToBW")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = "CONSTANT"
    els = ramp.color_ramp.elements
    while len(els) < len(ramp_):
        els.new(0.5)
    for el, (pos, col) in zip(els, ramp_):
        el.position = pos
        el.color = col + (1.0,)
    mul = nt.nodes.new("ShaderNodeMix")
    mul.data_type = "RGBA"
    mul.blend_type = "MULTIPLY"
    mul.inputs["Factor"].default_value = 1.0
    mul.inputs[6].default_value = lin(hex_)          # A
    emit = nt.nodes.new("ShaderNodeEmission")
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    L = nt.links
    L.new(diff.outputs[0], s2r.inputs[0])
    L.new(s2r.outputs["Color"], bw.inputs[0])
    L.new(bw.outputs[0], ramp.inputs[0])
    L.new(ramp.outputs["Color"], mul.inputs[7])       # B
    L.new(mul.outputs[2], emit.inputs["Color"])
    L.new(emit.outputs[0], out.inputs["Surface"])
    m.diffuse_color = lin(hex_)
    PALETTE.append(("toon", hex_, {"ramp": ramp_}))
    return m


def flat_mat(name, hex_, backface_cull=False, stamp=False, track=True):
    """Unlit colour. stamp=True: this is the colour face stamps are drawn in."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    emit = nt.nodes.new("ShaderNodeEmission")
    emit.inputs["Color"].default_value = lin(hex_)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(emit.outputs[0], out.inputs["Surface"])
    m.use_backface_culling = backface_cull
    m.diffuse_color = lin(hex_)
    if track:
        PALETTE.append(("flat", hex_, {"stamp": stamp}))
    return m


def write_palette(path):
    """Every colour the renderer can output -> sRGB, for palette-locked pixelizing:
    {"colors": [[r,g,b]...], "feature": [idx of flat colours], "dark": idx of the stamp colour}."""
    to_s = lambda x: round(255 * (12.92 * x if x <= 0.0031308 else 1.055 * x ** (1 / 2.4) - 0.055))
    rgb = lambda h: [int(h[i:i + 2], 16) for i in (0, 2, 4)]
    colors, feature, dark = [rgb(LINE)], [], None
    for kind, h, flags in PALETTE:
        if kind == "flat":
            if flags.get("stamp"):
                dark = len(colors)
            feature.append(len(colors))
            colors.append(rgb(h))
    for kind, h, flags in PALETTE:
        if kind == "toon":
            c = lin(h)
            for _, m in flags["ramp"]:
                colors.append([to_s(min(1.0, c[k] * m[k])) for k in range(3)])
    with open(path, "w") as f:
        json.dump({"colors": colors, "feature": feature, "dark": dark if dark is not None else 0}, f)
    grid = {"canvas": CANVAS_W, "height": CANVAS_H, "ground": GROUND_ROW, "ppu": PPU, "elev": ELEV,
            "turn": VIEWS["f"], "super": SUPER}
    with open(os.path.join(os.path.dirname(path), "grid.json"), "w") as f:
        json.dump(grid, f)


# ----------------------------------------------------------------- mesh helpers
def new_obj(name, bm, mat, outline=True, smooth=True):
    """`mat` may be a list: faces pick one by their material_index."""
    mats = mat if isinstance(mat, (list, tuple)) else [mat]
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = smooth
    for m in mats:
        me.materials.append(m)
    o = bpy.data.objects.new(name, me)
    COL.objects.link(o)
    o.parent = ROOT
    if outline:   # inverted hull: flipped, back-face-culled shell drawn in the line colour
        me.materials.append(M_LINE)
        mod = o.modifiers.new("outline", "SOLIDIFY")
        mod.thickness = OUTLINE_W
        mod.offset = 1.0
        mod.use_flip_normals = True
        mod.use_rim = False
        mod.material_offset = len(mats)
        HULLS.append(mod)
    return o


def sphere_bm(radii, seg=48, rings=24, deform=None):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1.0)
    for v in bm.verts:
        co = Vector((v.co.x * radii[0], v.co.y * radii[1], v.co.z * radii[2]))
        v.co = deform(co) if deform else co
    return bm


def xf(loc, rot=(0, 0, 0)):
    """4x4 from location + euler (radians) or a 3x3 rotation matrix."""
    R = rot if isinstance(rot, Matrix) else Euler(rot).to_matrix()
    return Matrix.Translation(Vector(loc)) @ R.to_4x4()


def ellipsoid(name, mat, radii, M, outline=True, deform=None, seg=48, rings=24):
    bm = sphere_bm(radii, seg, rings, deform)
    bmesh.ops.transform(bm, matrix=M, verts=bm.verts)
    return new_obj(name, bm, mat, outline)


def capsule(name, mat, a, b, ra, rb, seg=24):
    """Tapered limb from point a (radius ra) to b (radius rb), round at both ends (joints overlap)."""
    a, b = Vector(a), Vector(b)
    d = b - a
    prof = []
    n = 6
    for i in range(n + 1):                                   # round cap at a
        t = math.pi / 2 * (1 - i / n)
        prof.append((-ra * math.sin(t), ra * math.cos(t)))
    for i in range(1, 6):
        s = i / 6
        prof.append((d.length * s, ra + (rb - ra) * s))
    for i in range(n + 1):                                   # round cap at b
        t = math.pi / 2 * i / n
        prof.append((d.length + rb * math.sin(t), rb * math.cos(t)))
    prof = [(z, r if r > 1e-6 else 0, r if r > 1e-6 else 0) for z, r in prof]     # exact poles
    o = lathe(name, mat, prof, seg=seg)
    o.data.transform(xf(a, d.to_track_quat("Z", "Y").to_matrix()))
    return o


def lathe(name, mat, prof, seg=48, outline=True, deform=None):
    """Surface of revolution with elliptical rings: prof = [(z, rx, ry), ...], rx=0 -> pole.
    `deform(co, angle)` may reshape each ring vertex."""
    bm = bmesh.new()
    rings = []
    for z, rx, ry in prof:
        if rx == 0:
            rings.append([bm.verts.new((0, 0, z))])
        else:
            row = []
            for i in range(seg):
                a = 2 * math.pi * i / seg
                co = Vector((rx * math.cos(a), ry * math.sin(a), z))
                row.append(bm.verts.new(deform(co, a) if deform else co))
            rings.append(row)
    for a, b in zip(rings, rings[1:]):
        for i in range(seg):
            j = (i + 1) % seg
            if len(a) == 1:
                bm.faces.new((a[0], b[j], b[i]))
            elif len(b) == 1:
                bm.faces.new((a[i], a[j], b[0]))
            else:
                bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return new_obj(name, bm, mat, outline)


def panel(name, mat, prof, a0, a1, thick=0.035, seg=32, deform=None):
    """An open slice of a lathe (cloth: apron bib, apron skirt) from angle a0 to a1 (radians; -pi/2 = the
    front, -Y), made solid with a Solidify modifier. prof = [(z, rx, ry), ...] top to bottom or bottom to top."""
    bm = bmesh.new()
    rows = []
    for z, rx, ry in prof:
        row = []
        for i in range(seg + 1):
            a = a0 + (a1 - a0) * i / seg
            co = Vector((rx * math.cos(a), ry * math.sin(a), z))
            row.append(bm.verts.new(deform(co, a) if deform else co))
        rows.append(row)
    for r0, r1 in zip(rows, rows[1:]):
        for i in range(seg):
            bm.faces.new((r0[i], r0[i + 1], r1[i + 1], r1[i]))
    bm.normal_update()
    for f in bm.faces:                                       # outward normals (thickness then grows inward)
        c = f.calc_center_median()
        if f.normal.dot(Vector((c.x, c.y, 0))) < 0:
            f.normal_flip()
    o = new_obj(name, bm, mat, outline=False)
    mod = o.modifiers.new("cloth", "SOLIDIFY")
    mod.thickness = thick
    mod.offset = -1.0
    return o


def surface(target, x, z):
    """Front (-Y facing) surface point + normal of `target` at (x, z), in world space."""
    mw = target.matrix_world
    inv = mw.inverted()
    o = inv @ Vector((x, -5.0, z))
    d = (inv.to_3x3() @ Vector((0, 1, 0))).normalized()
    for mod in target.modifiers:          # cast against the body, not the outline hull
        mod.show_viewport = False
    bpy.context.view_layer.update()
    ok, loc, n, _ = target.ray_cast(o, d)
    for mod in target.modifiers:
        mod.show_viewport = True
    assert ok, f"ray missed {target.name} at {x},{z}"
    return mw @ loc, (mw.to_3x3() @ n).normalized()


def decal(name, mat, target, x, z, radii, spin=0.0, lift=0.0, feature=True, stamped=False):
    """Flat ellipsoid sitting on target's front surface (apron print, buttons).
    feature: forced through the feature pass. stamped: hidden in sprite sources (a stamp replaces it)."""
    loc, n = surface(target, x, z)
    R = Vector((0, -1, 0)).rotation_difference(n).to_matrix() @ Matrix.Rotation(spin, 3, "Y")
    o = ellipsoid(name, mat, radii, xf(loc + n * lift, R), outline=False, seg=24, rings=12)
    if feature:
        FEATURES.append(o)
    if stamped:
        STAMPED.append(o)
    return o


def ink(*objs, w=INK_W):
    """Keep these parts' outline hulls in the sprite renders, at about one sprite px."""
    for o in objs:
        for mod in o.modifiers:
            if mod in HULLS:
                mod.thickness = w
                INKED.append(mod)


def stamp_point(name, target, x, z, owner):
    """Register a face feature the sprite pass stamps as a pixel shape (see sheet.FACE)."""
    STAMP_PTS[name] = surface(target, x, z)
    STAMP_OWNER[name] = owner.name


def sweep(name, mat, spine, frame_b, width, thick, rings=32, seg=16, tip_mat=None, tip_from=0.7):
    """A flat lock (hair, ribbon tail, strap): an elliptical cross-section swept along `spine(t)`, t in [0, 1].
    The section's wide axis follows `frame_b` (a vector, or a function of t). Both ends close smoothly.
    tip_mat: faces past t = tip_from take this material (ombré hair tips)."""
    bm = bmesh.new()
    rows = []
    fb = frame_b if callable(frame_b) else (lambda t: frame_b)
    for i in range(rings + 1):
        t = i / rings
        p = spine(t)
        T = (spine(min(1.0, t + 1e-3)) - spine(max(0.0, t - 1e-3))).normalized()
        B = fb(t)
        B = (B - T * B.dot(T)).normalized()
        N = B.cross(T).normalized()
        cap = math.sqrt(max(0.0, 1 - ((t - 0.80) / 0.20) ** 2)) if t > 0.80 else 1.0   # round tip
        root = math.sqrt(max(0.0, 1 - ((0.06 - t) / 0.06) ** 2)) if t < 0.06 else 1.0  # closed root
        w, th = width(t) * cap * root, thick(t) * cap * root
        if i in (0, rings):
            rows.append([bm.verts.new(p)])
            continue
        rows.append([bm.verts.new(p + B * (w * math.cos(a)) + N * (th * math.sin(a)))
                     for a in (2 * math.pi * k / seg for k in range(seg))])
    for r, (a, b) in enumerate(zip(rows, rows[1:])):
        tip = 1 if tip_mat is not None and r / rings >= tip_from else 0
        for k in range(seg):
            j = (k + 1) % seg
            if len(a) == 1:
                f = bm.faces.new((a[0], b[j], b[k]))
            elif len(b) == 1:
                f = bm.faces.new((a[k], a[j], b[0]))
            else:
                f = bm.faces.new((a[k], a[j], b[j], b[k]))
            f.material_index = tip
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return new_obj(name, bm, [mat, tip_mat] if tip_mat is not None else mat)


def bezier(*pts):
    """Spine through control points (any degree), t in [0, 1]."""
    P = [Vector(p) for p in pts]

    def f(t):
        Q = list(P)
        while len(Q) > 1:
            Q = [a.lerp(b, t) for a, b in zip(Q, Q[1:])]
        return Q[0]
    return f


# ----------------------------------------------------------------- camera / light
CAM_BACK = Vector((0.0, -math.cos(math.radians(ELEV)), math.sin(math.radians(ELEV))))   # toward the camera


def setup_render():
    SC.render.engine = "BLENDER_EEVEE"
    SC.render.film_transparent = True
    SC.view_settings.view_transform = "Standard"
    SC.view_settings.look = "None"
    SC.eevee.taa_render_samples = 16
    SC.render.image_settings.file_format = "PNG"
    SC.render.image_settings.color_mode = "RGBA"
    SC.render.resolution_x = CANVAS_W * SUPER
    SC.render.resolution_y = CANVAS_H * SUPER

    world = bpy.data.worlds.new("world")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.33, 0.33, 0.38, 1)
    SC.world = world

    sun_d = bpy.data.lights.new("sun", "SUN")
    sun_d.energy = 2.6
    sun_d.angle = math.radians(2)
    sun = bpy.data.objects.new("sun", sun_d)
    COL.objects.link(sun)
    d = Vector((-0.9, 1.0, -1.3)).normalized()       # from the upper front-right
    sun.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()

    cam_d = bpy.data.cameras.new("cam")
    cam_d.type = "ORTHO"
    cam_d.ortho_scale = max(CANVAS_W, CANVAS_H) / PPU
    cam = bpy.data.objects.new("cam", cam_d)
    COL.objects.link(cam)
    cam.rotation_euler = (math.radians(90 - ELEV), 0, 0)
    up = Vector((0.0, math.sin(math.radians(ELEV)), math.cos(math.radians(ELEV))))
    # world x=0 on the centre of column W/2, the ground point (0,0,0) on row GROUND_ROW
    cam.location = Vector((-0.5 / PPU, 0, 0)) + up * ((GROUND_ROW - CANVAS_H / 2) / PPU) + CAM_BACK * 20
    SC.camera = cam


def stamp_info():
    """Where each stamped feature lands on the sprite grid for the current pose:
    {name: {'px': [col, row] (float sprite px), 'facing': cos(angle to camera), 'hidden': bool}}."""
    from bpy_extras.object_utils import world_to_camera_view
    for mod in HULLS:                       # occlusion test against bodies, not outline shells
        mod.show_viewport = False
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    out = {}
    for name, (p0, n0) in STAMP_PTS.items():
        mw = bpy.data.objects[STAMP_OWNER[name]].matrix_world     # follows the part when posed
        p = mw @ p0
        n = (mw.to_3x3() @ n0).normalized()
        uv = world_to_camera_view(SC, SC.camera, p)
        hidden = SC.ray_cast(dg, p + n * 0.02 + CAM_BACK * 0.02, CAM_BACK)[0]   # anything in front?
        out[name] = {"px": [uv.x * CANVAS_W, (1 - uv.y) * CANVAS_H],
                     "facing": round(n.dot(CAM_BACK), 3), "hidden": bool(hidden),
                     "side": round(n.dot(SC.camera.matrix_world.to_3x3() @ Vector((1, 0, 0))), 3)}
    for mod in HULLS:
        mod.show_viewport = True
    return out


def render_frame(out_dir, key, toon=False):
    """Render the current pose: <key>_flat.png + <key>_feat.png (+ <key>_toon.png). Returns stamps."""
    stamps = stamp_info()
    for mod in HULLS:
        mod.show_render = mod in INKED
    for o in STAMPED:
        o.hide_render = True
    SC.render.filepath = os.path.join(out_dir, key + "_flat.png")
    bpy.ops.render.render(write_still=True)
    others = [o for o in COL.objects if o.type == "MESH" and o not in FEATURES and not o.hide_render]
    for o in others:                        # feature pass: decals only, everything else held out
        o.is_holdout = True
    SC.render.filepath = os.path.join(out_dir, key + "_feat.png")
    bpy.ops.render.render(write_still=True)
    for o in others:
        o.is_holdout = False
    for o in STAMPED:
        o.hide_render = False
    if toon:
        for mod in HULLS:
            mod.show_render = True
        SC.render.filepath = os.path.join(out_dir, key + "_toon.png")
        bpy.ops.render.render(write_still=True)
    for mod in HULLS:
        mod.show_render = True
    return stamps


def show(objs, on):
    for o in objs:
        o.hide_render = not on
        o.hide_viewport = not on


# ----------------------------------------------------------------- rig + animation
TAU = 2 * math.pi


def keys(table, f):
    """Piecewise-smoothstep interpolation of {frame: value} at frame f."""
    ks = sorted(table)
    if f <= ks[0]:
        return table[ks[0]]
    for a, b in zip(ks, ks[1:]):
        if f <= b:
            t = (f - a) / (b - a)
            t = t * t * (3 - 2 * t)
            return table[a] + (table[b] - table[a]) * t
    return table[ks[-1]]


class Rig:
    """Puppet rig: a hierarchy of pivot empties; mesh parts are parented rigidly to one pivot.
    pivots = {name: ((rest world xyz), parent_name)}, in creation order ("root" = character root)."""

    def __init__(self, pivots, yxz=()):
        self.pivots = pivots
        self.rest = {k: Vector(v[0]) for k, v in pivots.items()}
        self.rest["root"] = Vector((0, 0, 0))
        self.pv = {"root": ROOT}
        for name, (loc, parent) in pivots.items():
            e = bpy.data.objects.new("pv_" + name, None)
            COL.objects.link(e)
            e.parent = self.pv[parent]
            e.location = Vector(loc) - self.rest[parent]
            e.rotation_mode = "YXZ" if name in yxz else "XYZ"
            self.pv[name] = e

    def attach(self, obj, pivot):
        """Parent a mesh (geometry baked in rest world space) to a pivot without moving it."""
        obj.parent = self.pv[pivot]
        obj.matrix_parent_inverse = Matrix.Translation(-self.rest[pivot])

    def reset(self):
        for name, e in self.pv.items():
            if name == "root":
                continue
            e.location = self.rest[name] - self.rest[self.pivots[name][1]]
            e.rotation_euler = (0, 0, 0)
            e.scale = (1, 1, 1)

    def rot(self, name, x=0.0, y=0.0, z=0.0):
        """Degrees, in the parent's frame: +x tips the top forward (-Y), +y toward +X, +z turns left."""
        self.pv[name].rotation_euler = (math.radians(x), math.radians(y), math.radians(z))

    def move(self, name, dx=0.0, dy=0.0, dz=0.0):
        self.pv[name].location = self.rest[name] - self.rest[self.pivots[name][1]] + Vector((dx, dy, dz))

    def scale(self, name, sx, sy=None, sz=None):
        self.pv[name].scale = (sx, sx if sy is None else sy, sx if sz is None else sz)


def render_anims(out_dir, rig, anims, only=None):
    """anims = {name: {"pose": fn(f, n), "frames": n, "views": ["f", "b"]}}. Writes frames, stamps.json,
    anims.json, palette.json, grid.json into out_dir (merging with earlier runs when `only` is used)."""
    os.makedirs(out_dir, exist_ok=True)
    SC.eevee.taa_render_samples = 1        # sprites are majority-voted; AA only adds noise
    stamps = {}
    for anim, a in anims.items():
        if only and anim not in only:
            continue
        n = a["frames"]
        for view in a["views"]:
            ROOT.rotation_euler.z = VIEWS[view]
            for f in range(n):
                key = f"{anim}_{view}_{f:02d}"
                rig.reset()
                a["pose"](f, n)
                stamps[key] = render_frame(out_dir, key)
    ROOT.rotation_euler.z = 0
    rig.reset()

    def merge(fname, new):
        p = os.path.join(out_dir, fname)
        old = json.load(open(p)) if os.path.exists(p) else {}
        old.update(new)
        with open(p, "w") as fh:
            json.dump(old, fh)
    merge("stamps.json", stamps)
    merge("anims.json", {k: {"frames": v["frames"], "views": list(v["views"])} for k, v in anims.items()
                         if not only or k in only})
    write_palette(os.path.join(out_dir, "palette.json"))
