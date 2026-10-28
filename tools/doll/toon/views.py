# -*- coding: utf-8 -*-
"""Paper doll three-view (front / side / back) at eye level, hi-res, for painting over: the base image gpt-image
details in the turnaround sheet's style, and the multiview input for a Meshy retexture of these same parts.

usage: blender -b -P views.py -- [--hair code|meshy] [--out DIR] [--px 1024]
writes DIR/front.png side.png back.png (toon + thin outline, transparent) and DIR/blockout_sheet.png (grey, labelled
like design/paper_doll/turnaround_v1.png). Orthographic, same scale in all three, feet on one line.
"""
import math, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import doll_model as DM  # noqa: E402  (builds the doll)
import toonkit as T  # noqa: E402
import bpy  # noqa: E402

ARGV = DM.ARGV
OUT = ARGV[ARGV.index("--out") + 1] if "--out" in ARGV else os.path.join(DM.REPO, "design", "paper_doll", "toon", "views")
PX = int(ARGV[ARGV.index("--px") + 1]) if "--px" in ARGV else 1024
VIEWS = [("front", 0.0), ("side", math.pi / 2), ("back", math.pi)]
H_UNITS = 4.6                                  # frame height in model units (the doll is ~4.1 tall)

os.makedirs(OUT, exist_ok=True)
for mod in T.HULLS:                            # one even, thin line on every part (the sprite inks are for 98 px)
    mod.thickness = 0.010
    mod.show_render = True
cam = T.SC.camera
cam.data.ortho_scale = H_UNITS
cam.rotation_euler = (math.radians(90), 0, 0)
cam.location = (0, -20, H_UNITS / 2 - 0.15)
T.SC.render.resolution_x = int(PX * 0.62)
T.SC.render.resolution_y = PX
T.SC.eevee.taa_render_samples = 32
for name, yaw in VIEWS:
    T.ROOT.rotation_euler.z = yaw
    T.SC.render.filepath = os.path.join(OUT, name + ".png")
    bpy.ops.render.render(write_still=True)
print("VIEWS DONE", OUT)
# the labelled sheet is put together outside Blender (no Pillow in its Python)
subprocess.run(["python", os.path.join(HERE, "views_sheet.py"), OUT], check=True)
