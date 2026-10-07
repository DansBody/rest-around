"""Latte cup hat, modelled from code. Run headless:
    blender -b --factory-startup -t 2 --python latte_hat.py -- <out_dir>
Hard budget: aborts (writes nothing) if the mesh goes over MAX_TRIS or the glb over MAX_BYTES.
"""
import math, os, sys
import bpy, bmesh

MAX_TRIS = 4000
MAX_BYTES = 300_000
SEG = 32
out = os.path.abspath(sys.argv[sys.argv.index('--') + 1])
os.makedirs(out, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)


def mat(name, hex_):
    m = bpy.data.materials.new(name)
    r, g, b = (int(hex_[i:i + 2], 16) / 255 for i in (1, 3, 5))
    srgb = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    m.diffuse_color = (srgb(r), srgb(g), srgb(b), 1)
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = m.diffuse_color
    bsdf.inputs['Roughness'].default_value = 0.6
    return m


PORCELAIN = mat('porcelain', '#fbf7ee')
BAND = mat('band', '#f2c230')      # the UI's one yellow accent
LATTE = mat('latte', '#b9824f')
FOAM = mat('foam', '#fdf3e1')


def lathe(name, profile, material, seg=SEG, cap_top=False):
    """Spin a (radius, z) polyline around Z. Points with radius 0 collapse to a single pole vertex."""
    bm = bmesh.new()
    rings = []
    for r, z in profile:
        if r == 0:
            rings.append([bm.verts.new((0, 0, z))])
        else:
            rings.append([bm.verts.new((r * math.cos(2 * math.pi * i / seg), r * math.sin(2 * math.pi * i / seg), z))
                          for i in range(seg)])
    for a, b in zip(rings, rings[1:]):
        for i in range(seg):
            j = (i + 1) % seg
            if len(a) == 1:
                bm.faces.new((a[0], b[i], b[j]))
            elif len(b) == 1:
                bm.faces.new((a[i], b[0], a[j]))
            else:
                bm.faces.new((a[i], b[i], b[j], a[j]))
    if cap_top and len(rings[-1]) > 1:
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    me.materials.append(material)
    return ob


# saucer = the brim; its top dips where the cup sits
saucer = lathe('saucer', [(0, 0.0), (0.45, 0.0), (0.78, 0.04), (0.98, 0.12), (1.0, 0.15), (0.96, 0.16),
                          (0.78, 0.1), (0.5, 0.07), (0, 0.07)], PORCELAIN)
# cup: outer wall up to a rolled rim, inner wall down to the coffee
cup = lathe('cup', [(0, 0.06), (0.4, 0.06), (0.45, 0.1), (0.5, 0.3), (0.57, 0.6), (0.62, 0.8), (0.63, 0.83),
                    (0.6, 0.85), (0.575, 0.82), (0.555, 0.7)], PORCELAIN)
band = lathe('band', [(0.536, 0.44), (0.558, 0.48), (0.568, 0.53), (0.55, 0.57)], BAND)
coffee = lathe('coffee', [(0, 0.725), (0.565, 0.72)], LATTE)

# handle: a torus in the XZ plane on +X, its inner half buried in the wall below the coffee
bpy.ops.mesh.primitive_torus_add(major_radius=0.17, minor_radius=0.05, major_segments=20, minor_segments=8,
                                 location=(0.66, 0, 0.43), rotation=(math.pi / 2, 0, 0))
handle = bpy.context.object
handle.name = 'handle'
handle.data.materials.append(PORCELAIN)

# latte-art heart, pointing to the front (Blender -Y, which the glTF exporter turns into +Z)
bm = bmesh.new()
n = 40
pts = []
for i in range(n):
    t = 2 * math.pi * i / n
    x = 16 * math.sin(t) ** 3
    y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
    pts.append((x * 0.021, y * 0.021 + 0.03))
top = [bm.verts.new((x, y, 0.735)) for x, y in pts]
bot = [bm.verts.new((x, y, 0.715)) for x, y in pts]
bm.faces.new(top)
bm.faces.new(bot[::-1])
for i in range(n):
    j = (i + 1) % n
    bm.faces.new((bot[i], bot[j], top[j], top[i]))
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
me = bpy.data.meshes.new('heart')
bm.to_mesh(me)
bm.free()
heart = bpy.data.objects.new('heart', me)
bpy.context.collection.objects.link(heart)
me.materials.append(FOAM)

# join, smooth by angle, check the budget
objs = [saucer, cup, band, coffee, handle, heart]
bpy.ops.object.select_all(action='DESELECT')
for o in objs:
    o.select_set(True)
bpy.context.view_layer.objects.active = cup
bpy.ops.object.join()
hat = bpy.context.object
hat.name = 'latte_hat'
bpy.ops.object.shade_smooth_by_angle(angle=math.radians(40))
bpy.ops.object.convert(target='MESH')
hat.data.calc_loop_triangles()
tris = len(hat.data.loop_triangles)
print(f'[latte_hat] triangles: {tris}')
if tris > MAX_TRIS:
    sys.exit(f'[latte_hat] over budget: {tris} > {MAX_TRIS} triangles, nothing written')

glb = os.path.join(out, 'latte_hat.gltf')
bpy.ops.export_scene.gltf(filepath=glb, export_format='GLTF_SEPARATE', use_selection=True, export_apply=True,
                          export_texcoords=False, export_animations=False, export_skins=False)
size = os.path.getsize(glb) + os.path.getsize(glb[:-5] + '.bin')
print(f'[latte_hat] gltf+bin bytes: {size}')
if size > MAX_BYTES:
    os.remove(glb); os.remove(glb[:-5] + '.bin')
    sys.exit(f'[latte_hat] glb over budget: {size} > {MAX_BYTES} bytes, deleted')
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, 'latte_hat.blend'), compress=True)

# small preview render (Workbench, 512 px) so the shape can be checked without opening Blender
scene = bpy.context.scene
scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.color_type = 'MATERIAL'
scene.display.shading.light = 'STUDIO'
scene.render.resolution_x = scene.render.resolution_y = 512
scene.render.film_transparent = False
world = bpy.data.worlds.new('w')
scene.world = world
world.color = (0.92, 0.9, 0.86)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
scene.collection.objects.link(cam)
scene.camera = cam
for i, (yaw, pitch) in enumerate([(-30, 28), (60, 55)]):
    d = 4.2
    y, p = math.radians(yaw), math.radians(pitch)
    cam.location = (d * math.cos(p) * math.sin(y), -d * math.cos(p) * math.cos(y), 0.4 + d * math.sin(p))
    direction = -cam.location.copy() + type(cam.location)((0, 0, 0.4))
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = os.path.join(out, f'latte_hat_preview{i}.png')
    bpy.ops.render.render(write_still=True)
print('[latte_hat] done')
