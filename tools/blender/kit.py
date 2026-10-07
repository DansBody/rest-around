"""Shared helpers for props modelled from code in Blender (run headless with --factory-startup).

    import sys, os; sys.path.insert(0, os.path.dirname(__file__)); from kit import Kit
    k = Kit({'body': '#c8463a', 'metal': '#cfd3d6'})      # material name -> colour (flat base colours, no textures)
    k.box((0, 0, 0.5), (1, 1, 1), 'body', bevel=0.05) ...
    k.finish('name', out_dir, max_tris=12000, max_bytes=1_000_000, variants={'name_silver': {'body': '#d9dde0'}})

Game units (1 floor tile = 2), resting on the floor at the origin, front = Blender -Y (glTF +Z).
finish() joins everything into one mesh, smooths by angle, checks the budget (aborts and writes nothing when over),
exports a glTF (+ .bin) per variant (each a recolour of the same mesh), saves a compressed .blend and previews.
"""
import math, os, sys
import bpy, bmesh
from mathutils import Vector, Matrix


def T(x, y, z): return Matrix.Translation((x, y, z))
def RX(a): return Matrix.Rotation(math.radians(a), 4, 'X')
def RY(a): return Matrix.Rotation(math.radians(a), 4, 'Y')
def RZ(a): return Matrix.Rotation(math.radians(a), 4, 'Z')


def srgb_to_linear(hex_):
    f = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (*(f(int(hex_[i:i + 2], 16) / 255) for i in (1, 3, 5)), 1)


class Kit:
    def __init__(self, colours, seg=32):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        self.colours = dict(colours)
        self.names = list(colours)
        self.mats = [self._mat(n, c) for n, c in colours.items()]
        self.bm = bmesh.new()
        self.seg = seg

    @staticmethod
    def _mat(name, hex_):
        m = bpy.data.materials.new(name)
        m.diffuse_color = srgb_to_linear(hex_)
        if m.node_tree is None:
            m.use_nodes = True
        bsdf = m.node_tree.nodes['Principled BSDF']
        bsdf.inputs['Base Color'].default_value = m.diffuse_color
        bsdf.inputs['Roughness'].default_value = 0.5
        return m

    def _tag(self, faces, m):
        i = self.names.index(m)
        for f in faces:
            f.material_index = i

    def place(self, verts, M):
        for v in verts:
            v.co = M @ v.co

    # ------------------------------------------------------------------ primitives
    def lathe(self, profile, m, M=Matrix(), seg=None, cap=False):
        """Spin a (radius, z) polyline about local Z, then move it by M. Radius 0 -> a pole."""
        seg = seg or self.seg
        bm, rings = self.bm, []
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
        self._tag(faces, m)
        self.place([v for r in rings for v in r], M)

    @staticmethod
    def frames(path):
        out, n = [], None
        for i in range(len(path)):
            t = (path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]).normalized()
            n = t.orthogonal().normalized() if n is None else (n - t * n.dot(t)).normalized()
            out.append((t, n, t.cross(n)))
        return out

    def tube(self, path, r, m, sides=10):
        """Sweep a circle (radius r, or r(i)) along a list of Vectors, capped at both ends."""
        bm, rings = self.bm, []
        path = [Vector(p) for p in path]
        for i, (p, (t, n, b)) in enumerate(zip(path, self.frames(path))):
            rr = r(i) if callable(r) else r
            rings.append([bm.verts.new(p + (n * math.cos(a) + b * math.sin(a)) * rr) for a in (2 * math.pi * k / sides for k in range(sides))])
        faces = [bm.faces.new((rings[i][k], rings[i][(k + 1) % sides], rings[i + 1][(k + 1) % sides], rings[i + 1][k]))
                 for i in range(len(rings) - 1) for k in range(sides)]
        faces += [bm.faces.new(rings[0][::-1]), bm.faces.new(rings[-1])]
        self._tag(faces, m)

    def ball(self, c, r, m, sx=1, sy=1, sz=1, seg=12, rings=8):
        g = bmesh.ops.create_uvsphere(self.bm, u_segments=seg, v_segments=rings, radius=1)
        for v in g['verts']:
            v.co = Vector(c) + Vector((v.co.x * r * sx, v.co.y * r * sy, v.co.z * r * sz))
        self._tag({f for v in g['verts'] for f in v.link_faces}, m)

    def box(self, c, size, m, bevel=0.0, segs=2, M=None):
        """A box centred on c with full extents `size`, edges rounded by `bevel`; optionally moved by M afterwards."""
        g = bmesh.ops.create_cube(self.bm, size=1)
        vs = g['verts']
        for v in vs:
            v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
        faces = {f for v in vs for f in v.link_faces}
        self._tag(faces, m)
        if bevel:
            edges = list({e for v in vs for e in v.link_edges})
            res = bmesh.ops.bevel(self.bm, geom=edges + vs, offset=min(bevel, min(size) * 0.49), segments=segs,
                                  affect='EDGES', profile=0.5)
            self._tag(res['faces'], m)   # the bevel's new faces come out with material 0
            vs = list({v for f in list(faces) + res['faces'] if f.is_valid for v in f.verts})
        self.place(vs, (M or Matrix()) @ T(*c))
        return vs

    def carved_box(self, c, size, m, bevel, cuts, segs=3):
        """One rounded box with boxes cut out of it (exact boolean), e.g. a body shell with a recess, so there's
        no seam where separate blocks would meet. cuts: [(centre, size, bevel)]."""
        def solid(name, cc, ss, bv):
            bm = bmesh.new()
            g = bmesh.ops.create_cube(bm, size=1)
            for v in g['verts']:
                v.co = Vector((v.co.x * ss[0] + cc[0], v.co.y * ss[1] + cc[1], v.co.z * ss[2] + cc[2]))
            if bv:
                bmesh.ops.bevel(bm, geom=list(bm.edges) + list(bm.verts), offset=min(bv, min(ss) * 0.49), segments=segs,
                                affect='EDGES', profile=0.5)
            me = bpy.data.meshes.new(name)
            bm.to_mesh(me); bm.free()
            ob = bpy.data.objects.new(name, me)
            bpy.context.collection.objects.link(ob)
            return ob
        body = solid('carve_body', c, size, bevel)
        for i, (cc, ss, bv) in enumerate(cuts):
            cutter = solid(f'carve_cut{i}', cc, ss, bv)
            mod = body.modifiers.new('cut', 'BOOLEAN')
            mod.operation = 'DIFFERENCE'; mod.solver = 'EXACT'; mod.object = cutter
            bpy.context.view_layer.objects.active = body
            bpy.ops.object.modifier_apply(modifier=mod.name)
            bpy.data.objects.remove(cutter)
        tmp = bmesh.new(); tmp.from_mesh(body.data)
        bmesh.ops.triangulate(tmp, faces=[f for f in tmp.faces if len(f.verts) > 4])   # boolean n-gons -> tris
        me = bpy.data.meshes.new('carve_tmp'); tmp.to_mesh(me); tmp.free()
        n0 = len(self.bm.faces)
        self.bm.from_mesh(me)
        self.bm.faces.ensure_lookup_table()
        self._tag([self.bm.faces[i] for i in range(n0, len(self.bm.faces))], m)
        bpy.data.objects.remove(body)
        bpy.data.meshes.remove(me)

    # ------------------------------------------------------------------ output
    def finish(self, name, out, max_tris=12000, max_bytes=1_000_000, variants=None, smooth_angle=40, previews=()):
        """Join, smooth, check the budget and export `name` (+ recoloured variants). previews: (file, target, yaw, pitch, dist)."""
        out = os.path.abspath(out)
        os.makedirs(out, exist_ok=True)
        bm = self.bm
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        for m in self.mats:
            me.materials.append(m)
        ob = bpy.data.objects.new(name, me)
        bpy.context.collection.objects.link(ob)
        bpy.context.view_layer.objects.active = ob
        ob.select_set(True)
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(smooth_angle))
        bpy.ops.object.convert(target='MESH')
        me.calc_loop_triangles()
        tris = len(me.loop_triangles)
        print(f'[{name}] triangles: {tris}')
        if tris > max_tris:
            sys.exit(f'[{name}] over budget: {tris} > {max_tris} triangles, nothing written')
        written = []
        for vname, recolour in [(name, {})] + list((variants or {}).items()):
            for mname, c in {**self.colours, **recolour}.items():
                m = self.mats[self.names.index(mname)]
                m.diffuse_color = srgb_to_linear(c)
                m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = m.diffuse_color
            gl = os.path.join(out, vname + '.gltf')
            bpy.ops.export_scene.gltf(filepath=gl, export_format='GLTF_SEPARATE', use_selection=True, export_apply=True,
                                      export_texcoords=False, export_animations=False, export_skins=False)
            size = os.path.getsize(gl) + os.path.getsize(gl[:-5] + '.bin')
            print(f'[{name}] {vname}: {size} bytes')
            if size > max_bytes:
                for p in written + [gl]:
                    for q in (p, p[:-5] + '.bin'):
                        if os.path.exists(q): os.remove(q)
                sys.exit(f'[{name}] over budget: {size} > {max_bytes} bytes, deleted')
            written.append(gl)
            if previews:
                self.render(out, vname, previews)
        for mname, c in self.colours.items():   # back to the base colours for the .blend
            m = self.mats[self.names.index(mname)]
            m.diffuse_color = srgb_to_linear(c)
            m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = m.diffuse_color
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, name + '.blend'), compress=True)
        return ob

    def render(self, out, prefix, shots, res=640):
        scene = bpy.context.scene
        scene.render.engine = 'BLENDER_WORKBENCH'
        scene.display.shading.light = 'STUDIO'
        scene.display.shading.color_type = 'MATERIAL'
        scene.display.shading.show_cavity = True
        scene.render.resolution_x = scene.render.resolution_y = res
        if not scene.world:
            scene.world = bpy.data.worlds.new('w')
        scene.world.color = (0.92, 0.9, 0.86)
        cam = scene.camera
        if not cam:
            cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
            cam.data.lens = 60
            scene.collection.objects.link(cam)
            scene.camera = cam
        for fname, target, yaw, pitch, d in shots:
            target = Vector(target)
            y, p = math.radians(yaw), math.radians(pitch)
            cam.location = target + Vector((d * math.cos(p) * math.sin(y), -d * math.cos(p) * math.cos(y), d * math.sin(p)))
            cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
            scene.render.filepath = os.path.join(out, f'{prefix}_{fname}')
            bpy.ops.render.render(write_still=True)
