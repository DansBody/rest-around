"""Re-bake a Meshy prop's texture onto a clean UV layout, so its seams stop showing as thin cracks.

    blender -b --factory-startup -t 2 --python tools/blender/rebake_texture.py -- <src.gltf> <out_dir> [<extra texture.jpg> ...] [--size 1024]

Meshy's atlases cut the model into hundreds of tiny UV islands packed edge to edge with no gutter, so texture
filtering (and the mip levels seen from afar) mixes in the neighbouring island's colour along every seam. This
merges the split vertices, unwraps fresh UVs (Smart UV Project, with margins), bakes the old texture across
(nearest-texel sampling, so islands don't bleed into each other) and extends each island's border into the gutter.
Extra textures (e.g. a recoloured variant on the same mesh) are baked onto the same new UVs.
Writes <out_dir>/<name>.glb per texture (the first is <src name>, extras keep their file names) for tools/build_prop.py.
"""
import math, os, sys
import bpy, bmesh

args = sys.argv[sys.argv.index('--') + 1:]
size = 1024
if '--size' in args:
    i = args.index('--size'); size = int(args[i + 1]); del args[i:i + 2]
src, out, extras = os.path.abspath(args[0]), os.path.abspath(args[1]), [os.path.abspath(a) for a in args[2:]]
os.makedirs(out, exist_ok=True)
MAX_VERTS = 40000

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
ob = [o for o in bpy.context.scene.objects if o.type == 'MESH'][0]
for o in bpy.context.scene.objects:
    o.select_set(o == ob)
bpy.context.view_layer.objects.active = ob
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
me = ob.data
old_uv = me.uv_layers[0].name

# merge the split vertices (UVs live on face corners, so the old layout survives), smooth shading by angle
bm = bmesh.new(); bm.from_mesh(me)
n0 = len(bm.verts)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
# close the slits Meshy leaves in the surface (they read as dark cracks); a patch takes its UVs from the faces round it
bnd = [e for e in bm.edges if e.is_boundary]
# (bmesh.ops.holes_fill skips them next to the non-manifold bits, so walk each closed loop of open edges by hand)
adj = {}
for e in bnd:
    for v in e.verts: adj.setdefault(v, []).append(e)
patch, used = [], set()
for start in list(adj):
    if start in used or len(adj[start]) != 2: continue
    loop, v, prev = [start], start, None
    while True:
        es = [e for e in adj[v] if e is not prev]
        if len(adj[v]) != 2 or not es: loop = None; break
        prev = es[0]; v = prev.other_vert(v)
        if v is start: break
        loop.append(v)
        if len(loop) > 16: loop = None; break
    if loop and len(loop) >= 3:
        used.update(loop)
        try: patch.append(bm.faces.new(loop))
        except ValueError: pass
if patch:
    patch = bmesh.ops.triangulate(bm, faces=patch)['faces']
    bmesh.ops.recalc_face_normals(bm, faces=patch)
    uvl0 = bm.loops.layers.uv[old_uv]
    own = set(patch)
    for f in patch:
        for l in f.loops:
            other = next((o for o in l.vert.link_loops if o.face not in own), None)
            if other: l[uvl0].uv = other[uvl0].uv
print(f'[rebake] verts {n0} -> {len(bm.verts)}, faces {len(bm.faces)}, open edges {len(bnd)} -> '
      f'{sum(1 for e in bm.edges if e.is_boundary)} ({len(patch)} patch faces)')
bm.to_mesh(me); bm.free()
if len(me.vertices) > MAX_VERTS:
    sys.exit(f'[rebake] {len(me.vertices)} verts is over the budget of {MAX_VERTS}, nothing written')
bpy.ops.object.shade_smooth_by_angle(angle=math.radians(60))   # only real box edges stay sharp, not the folds
# Meshy's remesh leaves thin folded slivers on flat panels, which crease the shading; weighting each face's
# say in the normals by its area lets the big flat faces decide, so panels light evenly
wn = ob.modifiers.new('weighted', 'WEIGHTED_NORMAL')
wn.mode = 'FACE_AREA'; wn.weight = 100; wn.keep_sharp = True
bpy.ops.object.modifier_apply(modifier=wn.name)

# Meshy's texels along an island's border are often the wrong colour themselves (a 1-2 px rim of the neighbour),
# so the bake reads each face's old UVs pulled SHRINK px toward its centre: only the clean inside is sampled
SHRINK = 2.0
tex_w = max(1, next(n for n in ob.active_material.node_tree.nodes if n.type == 'TEX_IMAGE').image.size[0])
bm = bmesh.new(); bm.from_mesh(me)
uvl = bm.loops.layers.uv[old_uv]
for f in bm.faces:
    uvs = [l[uvl].uv for l in f.loops]
    cx = sum(u.x for u in uvs) / len(uvs); cy = sum(u.y for u in uvs) / len(uvs)
    for l in f.loops:
        u = l[uvl].uv
        dx, dy = u.x - cx, u.y - cy
        d = math.hypot(dx, dy)
        if d > 1e-9:
            k = max(0.0, d - min(SHRINK / tex_w, d * 0.45)) / d
            l[uvl].uv = (cx + dx * k, cy + dy * k)
bm.to_mesh(me); bm.free()

# fresh UVs with gutters between the islands
new_uv = me.uv_layers.new(name='baked')
me.uv_layers.active = new_uv
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.006, area_weight=0.0, correct_aspect=True, scale_to_bounds=True)
bpy.ops.object.mode_set(mode='OBJECT')

mat = ob.active_material
nt = mat.node_tree
src_tex = next(n for n in nt.nodes if n.type == 'TEX_IMAGE')
src_tex.interpolation = 'Closest'
uvn = nt.nodes.new('ShaderNodeUVMap'); uvn.uv_map = old_uv
nt.links.new(uvn.outputs['UV'], src_tex.inputs['Vector'])
bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
bsdf.inputs['Metallic'].default_value = 0
target = nt.nodes.new('ShaderNodeTexImage')
uvt = nt.nodes.new('ShaderNodeUVMap'); uvt.uv_map = 'baked'
nt.links.new(uvt.outputs['UV'], target.inputs['Vector'])

scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 1
scene.render.bake.use_pass_direct = False
scene.render.bake.use_pass_indirect = False
scene.render.bake.use_pass_color = True
scene.render.bake.margin = 12
scene.render.bake.margin_type = 'EXTEND'

jobs = [(os.path.splitext(os.path.basename(src))[0], src_tex.image)]
for e in extras:
    jobs.append((os.path.splitext(os.path.basename(e))[0], bpy.data.images.load(e)))
baked = []
for name, img in jobs:
    src_tex.image = img
    img.colorspace_settings.name = 'sRGB'
    tgt = bpy.data.images.new(name + '_baked', size, size)
    target.image = tgt
    for n in nt.nodes: n.select = False
    target.select = True; nt.nodes.active = target
    bpy.ops.object.bake(type='DIFFUSE')
    tgt.filepath_raw = os.path.join(out, name + '_baked.png'); tgt.file_format = 'PNG'; tgt.save()
    baked.append((name, tgt))
    print(f'[rebake] baked {name}')

# rewire the material to the baked texture on the new UVs, drop the old UVs, export one GLB per texture
for n in (uvn, src_tex):
    nt.nodes.remove(n)
nt.links.new(target.outputs['Color'], bsdf.inputs['Base Color'])
me.uv_layers.remove(me.uv_layers[old_uv])
for name, tgt in baked:
    target.image = tgt
    path = os.path.join(out, name + '.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True,
                              export_animations=False, export_skins=False, export_image_format='JPEG')
    print(f'[rebake] wrote {path} ({os.path.getsize(path)} bytes)')

# a flat-lit (texture only) check render of the first variant
target.image = baked[0][1]
scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.color_type = 'TEXTURE'
scene.display.shading.light = 'FLAT'
scene.render.resolution_x = scene.render.resolution_y = 900
scene.world = bpy.data.worlds.new('w'); scene.world.color = (0.9, 0.9, 0.9)
from mathutils import Vector
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); cam.data.lens = 50
scene.collection.objects.link(cam); scene.camera = cam
tgt_pt = Vector((0, 0, 0.65)); y, p, d = math.radians(-25), math.radians(15), 3.2
cam.location = tgt_pt + Vector((d * math.cos(p) * math.sin(y), -d * math.cos(p) * math.cos(y), d * math.sin(p)))
cam.rotation_euler = (tgt_pt - cam.location).to_track_quat('-Z', 'Y').to_euler()
scene.render.filepath = os.path.join(out, 'check_flat.png'); bpy.ops.render.render(write_still=True)
print('[rebake] done')
