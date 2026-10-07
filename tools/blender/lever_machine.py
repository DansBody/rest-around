"""Vintage lever espresso machine (copper boiler, brass dome, two pull levers), modelled from code after the
reference sheet design/lever_machine/concept_sheet.png (gpt-image-bridge). Run headless:
    blender -b --factory-startup -t 2 --python tools/blender/lever_machine.py -- <out_dir> [--compare]
Game units (1 floor tile = 2), resting on the floor at the origin, front = Blender -Y (glTF +Z).
--compare also renders it next to the current red machine (assets/models/cafe/espresso_machine.gltf).
Hard budget: aborts (writes nothing) if the mesh goes over MAX_TRIS or the glTF over MAX_BYTES.
"""
import math, os, sys
import bpy, bmesh
from mathutils import Vector, Matrix

MAX_TRIS = 12000
MAX_BYTES = 1_000_000
args = sys.argv[sys.argv.index('--') + 1:]
out = os.path.abspath(args[0])
compare = '--compare' in args
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
os.makedirs(out, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
SEG = 32


def mat(name, hex_):
    m = bpy.data.materials.new(name)
    srgb = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    m.diffuse_color = (*(srgb(int(hex_[i:i + 2], 16) / 255) for i in (1, 3, 5)), 1)
    if m.node_tree is None:
        m.use_nodes = True
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = m.diffuse_color
    return m


COPPER = mat('copper', '#c8743f')
BRASS = mat('brass', '#e3b553')
ENAMEL = mat('enamel', '#f3e8d2')
DARK = mat('dark_metal', '#3b3532')
WOOD = mat('wood', '#6e3f24')
FACE = mat('gauge_face', '#fffaf0')
RED = mat('needle', '#c8463a')
GLASS = mat('glass', '#bfe0ea')
BADGE = mat('badge', '#f2c230')      # the UI's one yellow accent
MATS = [COPPER, BRASS, ENAMEL, DARK, WOOD, FACE, RED, GLASS, BADGE]
MI = {m.name: i for i, m in enumerate(MATS)}

bm = bmesh.new()


def tag(geom, m):
    for f in {f for v in geom for f in v.link_faces} if geom and isinstance(geom[0], bmesh.types.BMVert) else geom:
        f.material_index = MI[m.name]


def place(verts, M):
    for v in verts:
        v.co = M @ v.co


def lathe(profile, m, M=Matrix(), seg=SEG, cap=False):
    """Spin a (radius, z) polyline about local Z, then move it by M. Radius 0 -> a pole."""
    rings = []
    for r, z in profile:
        rings.append([bm.verts.new((0, 0, z))] if r == 0 else
                     [bm.verts.new((r * math.cos(2 * math.pi * i / seg), r * math.sin(2 * math.pi * i / seg), z)) for i in range(seg)])
    faces = []
    for a, b in zip(rings, rings[1:]):
        for i in range(seg):
            j = (i + 1) % seg
            if len(a) == 1: faces.append(bm.faces.new((a[0], b[i], b[j])))
            elif len(b) == 1: faces.append(bm.faces.new((a[i], b[0], a[j])))
            else: faces.append(bm.faces.new((a[i], b[i], b[j], a[j])))
    if cap and len(rings[-1]) > 1: faces.append(bm.faces.new(rings[-1]))
    if cap and len(rings[0]) > 1: faces.append(bm.faces.new(rings[0][::-1]))
    for f in faces: f.material_index = MI[m.name]
    place([v for r in rings for v in r], M)


def frames(path):
    out, n = [], None
    for i in range(len(path)):
        t = (path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]).normalized()
        n = t.orthogonal().normalized() if n is None else (n - t * n.dot(t)).normalized()
        out.append((t, n, t.cross(n)))
    return out


def tube(path, r, m, sides=10):
    rings = []
    for i, (p, (t, n, b)) in enumerate(zip(path, frames(path))):
        rr = r(i) if callable(r) else r
        rings.append([bm.verts.new(p + (n * math.cos(a) + b * math.sin(a)) * rr) for a in (2 * math.pi * k / sides for k in range(sides))])
    faces = [bm.faces.new((rings[i][k], rings[i][(k + 1) % sides], rings[i + 1][(k + 1) % sides], rings[i + 1][k]))
             for i in range(len(rings) - 1) for k in range(sides)]
    faces += [bm.faces.new(rings[0][::-1]), bm.faces.new(rings[-1])]
    for f in faces: f.material_index = MI[m.name]


def ball(c, r, m, sx=1, sy=1, sz=1, seg=12, rings=8):
    g = bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1)
    for v in g['verts']:
        v.co = Vector(c) + Vector((v.co.x * r * sx, v.co.y * r * sy, v.co.z * r * sz))
    tag(g['verts'], m)


def box(c, size, m, bevel=0.0, segs=2):
    g = bmesh.ops.create_cube(bm, size=1)
    vs = g['verts']
    for v in vs:
        v.co = Vector(c) + Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    faces = list({f for v in vs for f in v.link_faces})
    for f in faces: f.material_index = MI[m.name]
    if bevel:
        edges = list({e for v in vs for e in v.link_edges})
        res = bmesh.ops.bevel(bm, geom=edges + vs, offset=bevel, segments=segs, affect='EDGES', profile=0.5)
        for f in res['faces']: f.material_index = MI[m.name]   # the bevel's new faces come out with material 0


def T(x, y, z): return Matrix.Translation((x, y, z))
def RX(a): return Matrix.Rotation(math.radians(a), 4, 'X')


# Proportions follow design/lever_machine/concept_sheet.png (front + side views; 1 px there ~ 0.002 units here).

# ---- base: a copper frame with cream enamel panels, brass ball feet, a yellow badge, a drip grate on top
for sx in (-1, 1):
    for sy in (-1, 1):
        ball((sx * 0.37, sy * 0.33, 0.05), 0.05, BRASS, seg=12, rings=6)
box((0, 0, 0.18), (0.92, 0.84, 0.24), COPPER, bevel=0.06, segs=4)
box((0, -0.425, 0.165), (0.76, 0.02, 0.13), ENAMEL, bevel=0.012)            # front panel
for sx in (-1, 1):
    box((sx * 0.465, 0, 0.165), (0.02, 0.68, 0.13), ENAMEL, bevel=0.012)    # side panels
box((0, -0.44, 0.165), (0.17, 0.016, 0.055), BADGE, bevel=0.01)
box((0, -0.29, 0.298), (0.8, 0.24, 0.012), DARK, bevel=0.006)               # the tray's dark frame
for k in range(17):                                                          # round brass bars, front to back
    x = -0.36 + 0.72 * k / 16
    tube([Vector((x, -0.395, 0.312)), Vector((x, -0.185, 0.312))], 0.011, BRASS, 6)
for x in (-0.38, 0.38):
    tube([Vector((x, -0.4, 0.312)), Vector((x, -0.18, 0.312))], 0.014, BRASS, 8)

# ---- the boiler: an upright copper drum, three riveted brass bands, a tall brass bell dome
BY = 0.06          # drum centre, a little back so the group heads sit over the grate
BR = 0.31
D = T(0, BY, 0)
lathe([(BR, 0.3), (BR, 0.97)], COPPER, D, seg=32)
for z0, z1 in ((0.3, 0.36), (0.6, 0.65), (0.935, 0.985)):
    lathe([(BR, z0), (BR + 0.012, z0 + 0.004), (BR + 0.016, z0 + 0.012), (BR + 0.016, z1 - 0.012), (BR + 0.012, z1 - 0.004), (BR, z1)],
          BRASS, D, seg=32)
    for k in range(18):
        a = 2 * math.pi * (k + 0.5) / 18
        ball((math.cos(a) * (BR + 0.018), BY + math.sin(a) * (BR + 0.018), (z0 + z1) / 2), 0.013, BRASS, seg=6, rings=4)
for k in range(12):      # a looser ring of rivets on the copper above the middle band
    a = 2 * math.pi * (k + 0.25) / 12
    ball((math.cos(a) * (BR + 0.004), BY + math.sin(a) * (BR + 0.004), 0.88), 0.011, BRASS, seg=6, rings=4)
dome = [(BR + 0.004, 0.985), (0.305, 1.03), (0.295, 1.08), (0.275, 1.13), (0.24, 1.18), (0.19, 1.22), (0.13, 1.25),
        (0.07, 1.265), (0.045, 1.27), (0.042, 1.29), (0.06, 1.3), (0.062, 1.315), (0.045, 1.325), (0.036, 1.33)]
lathe(dome, BRASS, D, seg=32)
# the tiny cup and saucer on the top
lathe([(0.036, 1.33), (0.07, 1.33), (0.078, 1.338), (0.062, 1.345), (0, 1.345)], ENAMEL, D, seg=24)
lathe([(0, 1.345), (0.03, 1.345), (0.044, 1.37), (0.048, 1.392), (0.042, 1.395), (0.038, 1.385)], ENAMEL, D, seg=24)
lathe([(0, 1.385), (0.039, 1.385)], WOOD, D, seg=24)
tube([Vector((0.045 + 0.017 * math.sin(math.pi * k / 8), BY, 1.368 + 0.015 * math.cos(math.pi * k / 8))) for k in range(9)], 0.005, ENAMEL, 6)

# ---- two chunky group heads, each with a portafilter, a hinge and a tall pull lever
for gx in (-0.16, 0.16):
    gy = -0.235
    tube([Vector((gx, gy + 0.12, 0.62)), Vector((gx, gy, 0.62))], 0.05, BRASS, 14)        # into the drum
    lathe([(0, 0.725), (0.035, 0.725), (0.058, 0.715), (0.066, 0.69), (0.068, 0.6), (0.078, 0.5), (0.088, 0.42),
           (0.09, 0.4), (0.082, 0.385), (0.06, 0.38)], BRASS, T(gx, gy, 0), seg=28)
    lathe([(0.068, 0.385), (0.07, 0.37), (0.066, 0.345), (0.05, 0.335), (0, 0.335)], DARK, T(gx, gy, 0), seg=20)
    for sx in (-0.022, 0.022):
        lathe([(0.01, 0.336), (0.008, 0.318), (0, 0.318)], DARK, T(gx + sx, gy, 0), seg=8)
    tube([Vector((gx, gy - 0.06, 0.36)), Vector((gx, gy - 0.1, 0.36))], 0.018, DARK, 8)
    tube([Vector((gx, gy - 0.1, 0.36)), Vector((gx, gy - 0.25, 0.365))], lambda i: 0.026 if i else 0.022, WOOD, 12)
    ball((gx, gy - 0.255, 0.365), 0.03, WOOD, seg=12, rings=8)
    # hinge: a knuckle on top of the housing, two cheeks and a pin
    box((gx, gy, 0.745), (0.06, 0.05, 0.04), BRASS, bevel=0.012)
    for cx in (-0.032, 0.032):
        box((gx + cx, gy - 0.005, 0.79), (0.014, 0.05, 0.08), BRASS, bevel=0.006)
    tube([Vector((gx - 0.045, gy - 0.01, 0.8)), Vector((gx + 0.045, gy - 0.01, 0.8))], 0.012, BRASS, 8)
    # the lever: up and a little forward, a big wooden grip on top
    tube([Vector((gx, gy - 0.01, 0.8)), Vector((gx, gy - 0.04, 0.93)), Vector((gx, gy - 0.075, 1.04))],
         lambda i: 0.019 - 0.002 * i, BRASS, 10)
    ball((gx, gy - 0.09, 1.1), 0.046, WOOD, sz=1.65, seg=14, rings=10)

# ---- pressure gauge between the levers, facing the front
GZ = 0.79
front_y = BY - BR
gm = T(0, front_y - 0.03, GZ) @ RX(90)
lathe([(0.035, 0.0), (0.035, 0.05)], BRASS, T(0, front_y + 0.02, GZ) @ RX(90), seg=16)
lathe([(0.082, 0.0), (0.098, 0.008), (0.102, 0.026), (0.09, 0.036), (0.08, 0.03)], BRASS, gm)
lathe([(0.08, 0.026), (0, 0.022)], FACE, gm)
fy = front_y - 0.03 - 0.025
for k in range(9):
    a = math.radians(-135 + 270 * k / 8)
    box((0.064 * math.sin(a), fy, GZ + 0.064 * math.cos(a)), (0.006, 0.004, 0.018), DARK)
needle = bmesh.ops.create_cube(bm, size=1)['verts']
for v in needle:
    v.co = Vector((v.co.x * 0.008, v.co.y * 0.004, v.co.z * 0.065 + 0.028))
    for f in v.link_faces:
        f.material_index = MI['needle']
place(needle, T(0, fy - 0.004, GZ) @ Matrix.Rotation(math.radians(-30), 4, 'Y'))
ball((0, fy - 0.006, GZ), 0.011, DARK, seg=8, rings=4)

# ---- a brass valve on each side of the drum
sxv = BR + 0.005
for sgn in (-1, 1):
    ball((sgn * sxv, BY - 0.07, GZ), 0.045, BRASS, sx=0.7, seg=14, rings=8)
# steam wand (right): out sideways, then down to a black tip
tube([Vector((sxv + 0.02, BY - 0.07, GZ)), Vector((0.39, BY - 0.07, GZ)), Vector((0.41, BY - 0.07, GZ - 0.02)),
      Vector((0.415, BY - 0.07, GZ - 0.05)), Vector((0.415, BY - 0.07, 0.53))], 0.019, BRASS, 10)
lathe([(0.021, 0), (0.021, -0.035), (0.016, -0.045), (0, -0.045)], DARK, T(0.415, BY - 0.07, 0.53), seg=12)
# hot-water valve (left): a wooden handle sticking out, and a spout lower down
tube([Vector((-sxv - 0.02, BY - 0.07, GZ)), Vector((-0.42, BY - 0.07, GZ))], lambda i: 0.016 if i == 0 else 0.03, WOOD, 12)
ball((-0.43, BY - 0.07, GZ), 0.034, WOOD, sx=1.3, seg=12, rings=8)
tube([Vector((-BR + 0.02, BY - 0.12, 0.58)), Vector((-0.37, BY - 0.13, 0.58)), Vector((-0.39, BY - 0.135, 0.56)),
      Vector((-0.395, BY - 0.135, 0.5))], 0.022, BRASS, 10)

# ---- water sight glass on the back of the drum
for z0, z1 in ((0.38, 0.42), (0.84, 0.88)):
    lathe([(0.026, z0), (0.026, z1)], BRASS, T(-0.12, BY + BR + 0.02, 0), seg=10, cap=True)
lathe([(0.016, 0.42), (0.016, 0.84)], GLASS, T(-0.12, BY + BR + 0.02, 0), seg=10)

bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
me = bpy.data.meshes.new('lever_machine')
bm.to_mesh(me)
bm.free()
for m in MATS:
    me.materials.append(m)
ob = bpy.data.objects.new('lever_machine', me)
bpy.context.collection.objects.link(ob)
bpy.context.view_layer.objects.active = ob
ob.select_set(True)
bpy.ops.object.shade_smooth_by_angle(angle=math.radians(40))
bpy.ops.object.convert(target='MESH')
me.calc_loop_triangles()
tris = len(me.loop_triangles)
print(f'[lever_machine] triangles: {tris}')
if tris > MAX_TRIS:
    sys.exit(f'[lever_machine] over budget: {tris} > {MAX_TRIS} triangles, nothing written')
gl = os.path.join(out, 'lever_machine.gltf')
bpy.ops.export_scene.gltf(filepath=gl, export_format='GLTF_SEPARATE', use_selection=True, export_apply=True,
                          export_texcoords=False, export_animations=False, export_skins=False)
size = os.path.getsize(gl) + os.path.getsize(gl[:-5] + '.bin')
print(f'[lever_machine] gltf+bin bytes: {size}')
if size > MAX_BYTES:
    os.remove(gl); os.remove(gl[:-5] + '.bin')
    sys.exit(f'[lever_machine] over budget: {size} > {MAX_BYTES} bytes, deleted')
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, 'lever_machine.blend'), compress=True)

# ---- previews (Workbench, 640 px)
scene = bpy.context.scene
scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.light = 'STUDIO'
scene.display.shading.color_type = 'TEXTURE'
scene.display.shading.show_cavity = True
scene.render.resolution_x = scene.render.resolution_y = 640
scene.world = bpy.data.worlds.new('w')
scene.world.color = (0.92, 0.9, 0.86)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
cam.data.lens = 60
scene.collection.objects.link(cam)
scene.camera = cam


def shoot(name, target, yaw, pitch, d, res=(640, 640)):
    scene.render.resolution_x, scene.render.resolution_y = res
    y, p = math.radians(yaw), math.radians(pitch)
    cam.location = target + Vector((d * math.cos(p) * math.sin(y), -d * math.cos(p) * math.cos(y), d * math.sin(p)))
    cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = os.path.join(out, name)
    bpy.ops.render.render(write_still=True)


c = Vector((0, 0, 0.7))
shoot('lever_preview0.png', c, -30, 15, 4.2)
shoot('lever_preview1.png', c, 45, 30, 4.2)
shoot('lever_preview_detail.png', Vector((0, -0.3, 0.75)), -15, 10, 1.6)
if compare:
    bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, 'assets', 'models', 'cafe', 'espresso_machine.gltf'))
    for o in bpy.context.selected_objects:
        if o.parent is None:
            o.location.x -= 1.5
    ob.location.x += 0.15
    shoot('lever_compare.png', Vector((-0.65, 0, 0.7)), -20, 15, 6.0, (900, 600))
print('[lever_machine] done')
