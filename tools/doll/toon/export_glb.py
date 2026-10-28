# -*- coding: utf-8 -*-
"""Export the paper doll in its rest pose as one GLB (each part its own mesh) for a Meshy retexture.

usage: blender -b -P export_glb.py -- [--hair code|meshy] [--glb PATH]
Outline hulls are left out (they are a render trick); cloth Solidify is applied so the apron has its thickness.
"""
import os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import doll_model as DM  # noqa: E402
import toonkit as T  # noqa: E402
import bpy  # noqa: E402

ARGV = DM.ARGV
GLB = ARGV[ARGV.index("--glb") + 1] if "--glb" in ARGV else os.path.join(
    DM.REPO, "design", "paper_doll", "toon", "meshy_retex", "doll_blockout.glb")
os.makedirs(os.path.dirname(GLB), exist_ok=True)
for mod in T.HULLS:
    mod.show_viewport = False
    mod.show_render = False
T.ROOT.rotation_euler = (0, 0, 0)
for o in T.ROOT.children:                       # plain base colours (the toon node trees don't export)
    for m in getattr(o.data, "materials", []) or []:
        if m and m.use_nodes:
            bsdf = m.node_tree.nodes.new("ShaderNodeBsdfPrincipled")
            bsdf.inputs["Base Color"].default_value = m.diffuse_color
            m.node_tree.links.new(bsdf.outputs[0], m.node_tree.nodes["Material Output"].inputs["Surface"])
bpy.ops.export_scene.gltf(filepath=GLB, export_format="GLB", export_apply=True, use_selection=False,
                          export_cameras=False, export_lights=False)
print("GLB DONE", GLB, os.path.getsize(GLB))
