# -*- coding: utf-8 -*-
"""Render any GLB (e.g. a Meshy retexture of the doll) unlit, front / side / back at eye level, on the same frame as
views.py, to check its texture. usage: blender -b -P view_glb.py -- GLB OUT_DIR [--match REF_GLB]
--match: Meshy re-centres and rescales what it returns; scale/move GLB so its bounding box matches REF_GLB's
(the doll export), i.e. back onto the doll's own frame (feet on z = 0)."""
import math, os, sys
import bpy
from mathutils import Matrix, Vector

ARGV = sys.argv[sys.argv.index("--") + 1:]
GLB, OUT = ARGV[0], ARGV[1]
H_UNITS, PX = 4.6, 1024
REF = ARGV[ARGV.index("--match") + 1] if "--match" in ARGV else None
bpy.ops.wm.read_factory_settings(use_empty=True)


def bbox(objs):
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
    return Vector([min(p[i] for p in pts) for i in range(3)]), Vector([max(p[i] for p in pts) for i in range(3)])


if REF:
    bpy.ops.import_scene.gltf(filepath=REF)
    ref_box = bbox([o for o in bpy.context.scene.objects if o.type == "MESH"])
    for o in list(bpy.context.scene.objects):
        bpy.data.objects.remove(o)
bpy.ops.import_scene.gltf(filepath=GLB)
sc = bpy.context.scene
meshes = [o for o in sc.objects if o.type == "MESH"]
if REF:
    lo, hi = bbox(meshes)
    k = (ref_box[1].z - ref_box[0].z) / (hi.z - lo.z)
    foot = lambda a, b: (a + b) / 2 * Vector((1, 1, 0)) + Vector((0, 0, a.z))     # centre of the bottom face
    fit = Matrix.Translation(foot(*ref_box)) @ Matrix.Scale(k, 4) @ Matrix.Translation(-foot(lo, hi))
    for o in meshes:
        o.data.transform(fit @ o.matrix_world)
        o.matrix_world = Matrix.Identity(4)
        o.parent = None
    print("fit scale", round(k, 4))
for o in meshes:                                  # unlit: base colour straight to emission
    for m in o.data.materials:
        nt = m.node_tree
        tex = next((n for n in nt.nodes if n.type == "TEX_IMAGE"), None)
        emit = nt.nodes.new("ShaderNodeEmission")
        if tex:
            nt.links.new(tex.outputs["Color"], emit.inputs["Color"])
        out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
        nt.links.new(emit.outputs[0], out.inputs["Surface"])
root = bpy.data.objects.new("root", None)
sc.collection.objects.link(root)
for o in sc.objects:
    if o.parent is None and o is not root:
        o.parent = root
sc.render.engine = "BLENDER_EEVEE"
sc.render.film_transparent = True
sc.view_settings.view_transform = "Standard"
sc.render.resolution_x, sc.render.resolution_y = int(PX * 0.62), PX
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
cam.data.type = "ORTHO"
cam.data.ortho_scale = H_UNITS
cam.rotation_euler = (math.radians(90), 0, 0)
cam.location = (0, -20, H_UNITS / 2 - 0.15)
sc.collection.objects.link(cam)
sc.camera = cam
os.makedirs(OUT, exist_ok=True)
for name, yaw in (("front", 0.0), ("side", math.pi / 2), ("back", math.pi)):
    root.rotation_euler.z = yaw
    sc.render.filepath = os.path.join(OUT, name + ".png")
    bpy.ops.render.render(write_still=True)
print("GLB VIEWS DONE", OUT, [o.name for o in meshes][:12], len(meshes), "meshes")
