"""Coffee cane, modelled from code. Run headless:
    blender -b --factory-startup -t 2 --python tools/blender/coffee_cane.py -- <out_dir>
then  python tools/build_accessory.py cane_coffee <out_dir>/coffee_cane.gltf --slot hand
The grip (where the hand holds it) is the origin, the tip is 1 below it, the hook curls to the front (-Y).
Hard budget: aborts (writes nothing) if the mesh goes over MAX_TRIS or the glTF over MAX_BYTES.
"""
import math, os, sys
import bpy, bmesh
from mathutils import Vector

MAX_TRIS = 4000
MAX_BYTES = 300_000
out = os.path.abspath(sys.argv[sys.argv.index('--') + 1])
os.makedirs(out, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)


def mat(name, hex_):
    m = bpy.data.materials.new(name)
    srgb = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    m.diffuse_color = (*(srgb(int(hex_[i:i + 2], 16) / 255) for i in (1, 3, 5)), 1)
    if m.node_tree is None:   # Blender < 5 makes node-less materials; the glTF exporter reads the node colour
        m.use_nodes = True
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = m.diffuse_color
    return m


ESPRESSO = mat('espresso', '#5a3420')
MILK = mat('milk', '#f3e2c4')
GOLD = mat('gold', '#f2c230')      # the UI's one yellow accent
TIP = mat('tip', '#2f2a28')
BEAN = mat('bean', '#4a2a18')
MATS = [ESPRESSO, MILK, GOLD, TIP, BEAN]


def frames(path):
    """Tangent + two normals per path point (parallel transport, so the tube doesn't twist)."""
    out, n = [], None
    for i, p in enumerate(path):
        t = (path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]).normalized()
        if n is None:
            n = t.orthogonal().normalized()
        n = (n - t * n.dot(t)).normalized()
        out.append((t, n, t.cross(n)))
    return out


def tube(bm, path, radius, mat_of, sides=12, caps=True):
    """Sweep a circle along `path`. mat_of(ring_index, side_index) -> material slot. radius may be a function of i."""
    rings = []
    for i, (p, (t, n, b)) in enumerate(zip(path, frames(path))):
        r = radius(i) if callable(radius) else radius
        rings.append([bm.verts.new(p + (n * math.cos(a) + b * math.sin(a)) * r)
                      for a in (2 * math.pi * k / sides for k in range(sides))])
    for i in range(len(rings) - 1):
        for k in range(sides):
            f = bm.faces.new((rings[i][k], rings[i][(k + 1) % sides], rings[i + 1][(k + 1) % sides], rings[i + 1][k]))
            f.material_index = mat_of(i, k)
    if caps:
        bm.faces.new(rings[0][::-1]).material_index = mat_of(0, 0)
        bm.faces.new(rings[-1]).material_index = mat_of(len(rings) - 2, 0)


R = 0.085            # shaft radius (chunky, like the plush characters)
HOOK = 0.19          # hook radius
SIDES = 12
bm = bmesh.new()

# the path: tip (z=-1) straight up past the grip, then a half-circle curling forward and a little way down
key = [Vector((0, 0, -0.96)), Vector((0, 0, 0.08))]
c = Vector((0, -HOOK, 0.08))
key += [c + Vector((0, HOOK * math.cos(a), HOOK * math.sin(a))) for a in (math.pi * k / 24 for k in range(1, 25))]
key += [Vector((0, -2 * HOOK, 0.0))]
# resampled at even steps along its length, three rings to a band, so the espresso / milk bands come out clean
BAND = 0.16
step = BAND / 3
acc, path = [0], []
for a, b in zip(key, key[1:]):
    acc.append(acc[-1] + (b - a).length)
L = acc[-1]
n = round(L / step)
for i in range(n + 1):
    d = L * i / n
    j = max(k for k in range(len(acc) - 1) if acc[k] <= d + 1e-9) if d < L else len(acc) - 2
    path.append(key[j].lerp(key[j + 1], (d - acc[j]) / (acc[j + 1] - acc[j])))


def stripe(i, k):
    return (i // 3) % 2


tube(bm, path, R, stripe, SIDES)

# gold collar at the grip, rubber tip at the bottom (short fat tubes over the shaft)
tube(bm, [Vector((0, 0, z)) for z in (-0.16, -0.14, -0.06, -0.04)], lambda i: R * (1.25 if i in (1, 2) else 1.12),
     lambda i, k: 2, SIDES)
tube(bm, [Vector((0, 0, z)) for z in (-1.0, -0.99, -0.9, -0.885)], lambda i: R * (1.0 if i == 0 else 1.18),
     lambda i, k: 3, SIDES)

# a coffee bean capping the hook's end: an ellipsoid with a milky crease down its face
end, t_end = path[-1], (path[-1] - path[-2]).normalized()
bean_c = end + t_end * 0.07
bpy_bm = bmesh.ops.create_uvsphere(bm, u_segments=14, v_segments=8, radius=1)
for v in bpy_bm['verts']:
    x, y, z = v.co
    v.co = bean_c + Vector((x * 0.12, y * 0.1, z * 0.15))
for f in {f for v in bpy_bm['verts'] for f in v.link_faces}:
    f.material_index = 4
crease = []
for k in range(11):   # pressed onto the bean's front (-Y) face
    x, z = 0.022 * math.sin(2 * math.pi * k / 10), -0.11 + 0.22 * k / 10
    y = -0.1 * math.sqrt(max(0.0, 1 - (x / 0.12) ** 2 - (z / 0.15) ** 2))
    crease.append(bean_c + Vector((x, y, z)))
tube(bm, crease, lambda i: 0.013 * math.sin(math.pi * (0.15 + 0.7 * i / 10)), lambda i, k: 1, 6)

bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
me = bpy.data.meshes.new('coffee_cane')
bm.to_mesh(me)
bm.free()
for m in MATS:
    me.materials.append(m)
ob = bpy.data.objects.new('coffee_cane', me)
bpy.context.collection.objects.link(ob)
bpy.context.view_layer.objects.active = ob
ob.select_set(True)
bpy.ops.object.shade_smooth_by_angle(angle=math.radians(50))
bpy.ops.object.convert(target='MESH')
me.calc_loop_triangles()
tris = len(me.loop_triangles)
print(f'[coffee_cane] triangles: {tris}')
if tris > MAX_TRIS:
    sys.exit(f'[coffee_cane] over budget: {tris} > {MAX_TRIS} triangles, nothing written')

gl = os.path.join(out, 'coffee_cane.gltf')
bpy.ops.export_scene.gltf(filepath=gl, export_format='GLTF_SEPARATE', use_selection=True, export_apply=True,
                          export_texcoords=False, export_animations=False, export_skins=False)
size = os.path.getsize(gl) + os.path.getsize(gl[:-5] + '.bin')
print(f'[coffee_cane] gltf+bin bytes: {size}')
if size > MAX_BYTES:
    os.remove(gl); os.remove(gl[:-5] + '.bin')
    sys.exit(f'[coffee_cane] over budget: {size} > {MAX_BYTES} bytes, deleted')
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, 'coffee_cane.blend'), compress=True)

scene = bpy.context.scene
scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.color_type = 'MATERIAL'
scene.render.resolution_x = scene.render.resolution_y = 512
scene.world = bpy.data.worlds.new('w')
scene.world.color = (0.92, 0.9, 0.86)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
scene.collection.objects.link(cam)
scene.camera = cam
look = Vector((0, -0.1, -0.4))
for i, (yaw, pitch, d) in enumerate([(-60, 10, 2.6), (-20, 25, 1.0)]):
    y, p = math.radians(yaw), math.radians(pitch)
    tgt = look if i == 0 else Vector((0, -0.15, 0.05))
    cam.location = tgt + Vector((d * math.cos(p) * math.sin(y), -d * math.cos(p) * math.cos(y), d * math.sin(p)))
    cam.rotation_euler = (tgt - cam.location).to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = os.path.join(out, f'coffee_cane_preview{i}.png')
    bpy.ops.render.render(write_still=True)
print('[coffee_cane] done')
