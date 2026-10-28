# -*- coding: utf-8 -*-
"""Cut the hair off a Meshy character and make it a paper-doll hair part (test: design/chibi_creator/meshy_fox).

usage: blender -b -P meshy_hair.py -- [--src model.glb] [--out hair.blend] [--faces 20000] [--scale 1.6]

Meshy gives one fused, textured mesh. Colour can't tell hair from skin (the caramel tips are skin-coloured), so the
cut is by place, in the source's coordinates (faces -Y, chin at z ~ 0, face front at y ~ -0.58):
  face window  the face skin, eyes and mouth below the bangs
  brows        dark faces just above that window (the doll's own face is stamped)
  fox ears     everything high and to the side
  collar       below the chin
What is left is the hair. Each face takes the doll's hair or hair-tip toon material from the texture's lightness
there (so Meshy's cream streaks survive as palette colours), the mesh is decimated, then scaled and moved onto
the doll head (doll_model.py, before its head grow): chin at z 2.50, face front at y -0.46.
Writes one object "hair_meshy" with material slots [hair, hair_tip] into --out for doll_model.py --hair meshy.
"""
import os, sys
import bpy, bmesh
import numpy as np
from mathutils import Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
ARGV = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
arg = lambda k, d: ARGV[ARGV.index(k) + 1] if k in ARGV else d
SRC = arg("--src", os.path.join(REPO, "design", "chibi_creator", "meshy_fox", "model.glb"))
OUT = arg("--out", os.path.join(REPO, "design", "paper_doll", "toon", "meshy_hair", "hair.blend"))
FACES = int(arg("--faces", "30000"))
S = float(arg("--scale", "1.6"))
FACE_Y = 0.30                      # source head centre depth (the face front sits at ~ -0.58)
TIP_LIGHT = 0.80                   # texture lightness above this -> hair-tip material (the cream lower half)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
o = [o for o in bpy.context.scene.objects if o.type == "MESH"][0]
me = o.data
me.transform(o.matrix_world)
o.matrix_world = Matrix.Identity(4)

# per-face texture colour (UV centroid lookup)
img = next(n.image for n in o.active_material.node_tree.nodes if n.type == "TEX_IMAGE")
W, H = img.size
pix = np.zeros(W * H * 4, np.float32)
img.pixels.foreach_get(pix)
pix = pix.reshape(H, W, 4)[..., :3]                       # bottom-up rows, linear floats
n = len(me.polygons)
cen = np.zeros(n * 3); me.polygons.foreach_get("center", cen); cen = cen.reshape(n, 3)
ls = np.zeros(n, np.int64); me.polygons.foreach_get("loop_start", ls)
uv = np.zeros(len(me.loops) * 2); me.uv_layers.active.data.foreach_get("uv", uv); uv = uv.reshape(-1, 2)
fuv = (uv[ls] + uv[ls + 1] + uv[ls + 2]) / 3
col = pix[np.clip((fuv[:, 1] % 1 * H).astype(int), 0, H - 1), np.clip((fuv[:, 0] % 1 * W).astype(int), 0, W - 1)]
light = col @ np.array([0.299, 0.587, 0.114])           # byte images read back as their stored sRGB values

x, y, z = cen.T
ax = np.abs(x)
cut = (z < 0.03)                                                        # collar, body
cut |= (ax < 0.30) & (z < 0.26) & (y < -0.15)                          # face window
cut |= (ax < 0.34) & (z < 0.38) & (y < -0.48) & (light < 0.35)         # brows, lashes above it
cut |= (ax > 0.17) & (z > 0.62)                                        # fox ears
cut |= (ax > 0.36) & (z > 0.50) & (light > 0.70)                       # ear fluff at the temples
print(f"faces {n}, cut {cut.sum()}, hair {n - cut.sum()}; hair lightness percentiles",
      np.percentile(light[~cut], [10, 25, 50, 75, 90]).round(2))

# ombré by height (a soft wave round the head) rather than per-face texture lightness, which speckles at 98 px
ang = np.arctan2(y + FACE_Y, x)
mi = (z < 0.14 + 0.035 * np.sin(ang * 5)).astype(np.int32)
me.materials.clear()
for name in ("hair", "hair_tip"):
    me.materials.append(bpy.data.materials.new(name))
me.polygons.foreach_set("material_index", mi)

bm = bmesh.new()
bm.from_mesh(me)
bm.faces.ensure_lookup_table()
bmesh.ops.delete(bm, geom=[bm.faces[i] for i in np.where(cut)[0]], context="FACES")
loose = [v for v in bm.verts if not v.link_faces]
bmesh.ops.delete(bm, geom=loose, context="VERTS")
bm.to_mesh(me)
bm.free()

dec = o.modifiers.new("dec", "DECIMATE")
dec.ratio = min(1.0, FACES / max(1, len(me.polygons)))
bpy.context.view_layer.objects.active = o
bpy.ops.object.modifier_apply(modifier="dec")
# drop specks the cut left behind (tiny islands), keep the hair
bm = bmesh.new()
bm.from_mesh(me)
islands, seen = [], set()
for f in bm.faces:
    if f.index in seen:
        continue
    stack, isl = [f], []
    seen.add(f.index)
    while stack:
        g = stack.pop()
        isl.append(g)
        for e in g.edges:
            for h in e.link_faces:
                if h.index not in seen:
                    seen.add(h.index)
                    stack.append(h)
    islands.append(isl)
small = [f for isl in islands if len(isl) < 60 for f in isl]
bmesh.ops.delete(bm, geom=small, context="FACES")
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
bm.to_mesh(me)
bm.free()

me.transform(Matrix.Translation((0, 0, 2.50)) @ Matrix.Scale(S, 4) @ Matrix.Translation((0, FACE_Y, 0)))
for p in me.polygons:
    p.use_smooth = True
me.uv_layers.remove(me.uv_layers[0])
o.name = me.name = "hair_meshy"
for ob in list(bpy.context.scene.objects):
    if ob is not o:
        bpy.data.objects.remove(ob)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT)
co = np.array([v.co for v in me.vertices])
print("HAIR DONE", OUT, len(me.polygons), "tris; bbox", co.min(0).round(2), co.max(0).round(2),
      "tip faces", sum(p.material_index for p in me.polygons))
