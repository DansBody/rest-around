"""Slim a downloaded glTF (e.g. a Sketchfab "glTF" zip) into a wearable accessory for the wardrobe.

    python tools/build_accessory.py <id> <scene.gltf> --slot head [--rot X,Y,Z] [--tex 256]

* The node hierarchy is flattened (Sketchfab wraps models in Z-up / scaled root nodes) and primitives
  are merged per material, so the result is one node with one primitive per material.
* `--rot X,Y,Z` turns the flattened model (degrees, applied X then Y then Z) until it faces +Z with +Y up.
* `--slot` sets where the origin goes, which is the point the wardrobe attaches to the character:
    head  bottom centre (a hat rests on the crown)        face  centre of the front (glasses on the face)
    neck  centre of the back (a bow tie on the chest)     back  centre of the front (a backpack's straps side)
  and the model is scaled so its width (x extent) is 1; the wardrobe fits it to each character.
    hand  the model's own origin is the grip, and it is scaled so it reaches 1 below that (a cane's tip on the floor).
* Only base colours are kept (texture and/or factor, plus alpha blending): the game shades with Lambert.
  Textures stay external (see ASSETS.md) and shrink to `--tex` px; PNG when they carry alpha, else JPG.

Writes assets/models/wear/<id>.gltf, <id>.bin and <id>_<n>.jpg|png.
"""
import argparse, base64, json, math, sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_character import Bin  # noqa: E402

OUT = Path(__file__).resolve().parent.parent / 'assets' / 'models' / 'wear'
COMP = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
SIZE = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def node_matrix(n):
    if 'matrix' in n:
        return np.array(n['matrix'], np.float64).reshape(4, 4).T   # glTF is column-major
    t = np.eye(4)
    if 'translation' in n: t[:3, 3] = n['translation']
    r = np.eye(4)
    if 'rotation' in n:
        x, y, z, w = n['rotation']
        r[:3, :3] = [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]]
    s = np.eye(4)
    if 'scale' in n: s[0, 0], s[1, 1], s[2, 2] = n['scale']
    return t @ r @ s


def rot_matrix(rx, ry, rz):
    def ax(a, i):
        c, s = math.cos(math.radians(a)), math.sin(math.radians(a))
        m = np.eye(3)
        j, k = [(1, 2), (2, 0), (0, 1)][i]
        m[j, j], m[j, k], m[k, j], m[k, k] = c, -s, s, c
        return m
    return ax(rz, 2) @ ax(ry, 1) @ ax(rx, 0)


class Gltf:
    def __init__(self, path):
        self.dir = Path(path).parent
        self.g = json.loads(Path(path).read_text(encoding='utf-8'))
        self.bufs = [self._load(b['uri']) for b in self.g['buffers']]

    def _load(self, uri):
        if uri.startswith('data:'):
            return base64.b64decode(uri.split(',', 1)[1])
        return (self.dir / uri).read_bytes()

    def accessor(self, i):
        a = self.g['accessors'][i]
        v = self.g['bufferViews'][a['bufferView']]
        dt, n = np.dtype(COMP[a['componentType']]), SIZE[a['type']]
        start = v.get('byteOffset', 0) + a.get('byteOffset', 0)
        stride = v.get('byteStride') or dt.itemsize * n
        raw = np.frombuffer(self.bufs[v['buffer']], np.uint8, count=stride * (a['count'] - 1) + dt.itemsize * n, offset=start)
        rows = np.lib.stride_tricks.as_strided(raw, (a['count'], dt.itemsize * n), (stride, 1))
        out = rows.copy().view(dt).reshape(a['count'], n).astype(np.float64)
        if a.get('normalized'):
            out /= np.iinfo(dt).max
        return out

    def image(self, tex_index):
        src = self.g['images'][self.g['textures'][tex_index]['source']]
        if 'uri' in src:
            return Image.open(self.dir / src['uri'])
        v = self.g['bufferViews'][src['bufferView']]
        from io import BytesIO
        o = v.get('byteOffset', 0)
        return Image.open(BytesIO(self.bufs[v['buffer']][o:o + v['byteLength']]))

    def material(self, i):
        """(texture image | None, rgba factor, alpha mode) for material i."""
        if i is None:
            return None, [1, 1, 1, 1], 'OPAQUE'
        m = self.g['materials'][i]
        pb = m.get('pbrMetallicRoughness', {})
        sg = m.get('extensions', {}).get('KHR_materials_pbrSpecularGlossiness', {})
        tex = pb.get('baseColorTexture', sg.get('diffuseTexture'))
        factor = pb.get('baseColorFactor', sg.get('diffuseFactor', [1, 1, 1, 1]))
        return (self.image(tex['index']) if tex else None), factor, m.get('alphaMode', 'OPAQUE')

    def primitives(self):
        """Every primitive in the default scene with its world transform applied: (material, P, N, UV, IDX)."""
        out = []
        def walk(ni, parent):
            n = self.g['nodes'][ni]
            w = parent @ node_matrix(n)
            if 'mesh' in n:
                nm = np.linalg.inv(w[:3, :3]).T
                for p in self.g['meshes'][n['mesh']]['primitives']:
                    if p.get('mode', 4) != 4:
                        continue
                    at = p['attributes']
                    P = self.accessor(at['POSITION'])
                    P = P @ w[:3, :3].T + w[:3, 3]
                    N = self.accessor(at['NORMAL']) @ nm.T if 'NORMAL' in at else None
                    UV = self.accessor(at['TEXCOORD_0']) if 'TEXCOORD_0' in at else np.zeros((len(P), 2))
                    IDX = self.accessor(p['indices']).astype(np.int64).ravel() if 'indices' in p else np.arange(len(P))
                    if np.linalg.det(w[:3, :3]) < 0:   # mirrored transform: flip winding
                        IDX = IDX.reshape(-1, 3)[:, ::-1].ravel()
                    out.append((p.get('material'), P, N, UV, IDX))
            for c in n.get('children', []):
                walk(c, w)
        scene = self.g['scenes'][self.g.get('scene', 0)]
        for ni in scene['nodes']:
            walk(ni, np.eye(4))
        return out


def face_normals(P, IDX):
    N = np.zeros_like(P)
    t = IDX.reshape(-1, 3)
    fn = np.cross(P[t[:, 1]] - P[t[:, 0]], P[t[:, 2]] - P[t[:, 0]])
    for k in range(3):
        np.add.at(N, t[:, k], fn)
    return N


def build(name, src, slot, rot, tex_size):
    g = Gltf(src)
    groups = {}
    for mat, P, N, UV, IDX in g.primitives():
        if N is None:
            N = face_normals(P, IDX)
        groups.setdefault(mat, []).append((P, N, UV, IDX))
    R = rot_matrix(*rot)
    merged = []
    for mat, parts in groups.items():
        Ps, Ns, UVs, IDXs, base = [], [], [], [], 0
        for P, N, UV, IDX in parts:
            Ps.append(P @ R.T); Ns.append(N @ R.T); UVs.append(UV); IDXs.append(IDX + base); base += len(P)
        merged.append((mat, np.vstack(Ps), np.vstack(Ns), np.vstack(UVs), np.concatenate(IDXs)))

    allP = np.vstack([m[1] for m in merged])
    lo, hi = allP.min(axis=0), allP.max(axis=0)
    cx, cy, cz = (lo + hi) / 2
    origin = {'head': (cx, lo[1], cz), 'face': (cx, cy, hi[2]), 'neck': (cx, cy, lo[2]), 'back': (cx, cy, hi[2]), 'hand': (0, 0, 0)}[slot]
    scale = 1 / (-lo[1] if slot == 'hand' else hi[0] - lo[0])

    OUT.mkdir(parents=True, exist_ok=True)
    b = Bin()
    prims, materials, textures, images = [], [], [], []
    for k, (mat, P, N, UV, IDX) in enumerate(merged):
        P = (P - np.array(origin)) * scale
        N = N / np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-8)
        pos = b.add(P.astype(np.float32), 5126, 'VEC3', 34962, minmax=True)
        nrm = b.add(N.astype(np.float32), 5126, 'VEC3', 34962)
        attrs = {'POSITION': pos, 'NORMAL': nrm}
        img, factor, alpha = g.material(mat)
        pbr = {'baseColorFactor': [round(float(f), 4) for f in factor], 'metallicFactor': 0, 'roughnessFactor': 0.6}
        if img is not None:
            attrs['TEXCOORD_0'] = b.add(UV.astype(np.float32), 5126, 'VEC2', 34962)
            has_alpha = img.mode in ('RGBA', 'LA') or (img.mode == 'P' and 'transparency' in img.info)
            img = img.convert('RGBA' if has_alpha else 'RGB')
            if max(img.size) > tex_size:
                img = img.resize((tex_size, tex_size), Image.LANCZOS)
            fn = f'{name}_{len(images)}.' + ('png' if has_alpha else 'jpg')
            img.save(OUT / fn, **({'optimize': True} if has_alpha else {'quality': 88, 'optimize': True}))
            images.append({'uri': fn})
            textures.append({'source': len(images) - 1, 'sampler': 0})
            pbr['baseColorTexture'] = {'index': len(textures) - 1}
        small = len(P) < 65536
        ind = b.add(IDX.astype(np.uint16 if small else np.uint32), 5123 if small else 5125, 'SCALAR', 34963)
        m = {'name': f'{name}_{k}', 'pbrMetallicRoughness': pbr, 'doubleSided': True}
        if alpha != 'OPAQUE':
            m['alphaMode'] = alpha
        materials.append(m)
        prims.append({'attributes': attrs, 'indices': ind, 'material': len(materials) - 1})

    (OUT / f'{name}.bin').write_bytes(bytes(b.data))
    gltf = {
        'asset': {'version': '2.0', 'generator': 'tools/build_accessory.py'},
        'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [{'name': name, 'mesh': 0}],
        'meshes': [{'name': name, 'primitives': prims}],
        'materials': materials,
        'buffers': [{'uri': f'{name}.bin', 'byteLength': len(b.data)}],
        'bufferViews': b.views, 'accessors': b.accs,
    }
    if images:
        gltf.update(textures=textures, images=images, samplers=[{'magFilter': 9729, 'minFilter': 9987}])
    (OUT / f'{name}.gltf').write_text(json.dumps(gltf, separators=(',', ':')), encoding='utf-8')
    ext = (hi - lo) * scale
    tris = sum(len(m[4]) for m in merged) // 3
    print(f'{name}: {slot}, {tris} tris, {len(merged)} material(s), size {ext[0]:.2f} x {ext[1]:.2f} x {ext[2]:.2f} (w x h x d)')


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('name'), ap.add_argument('gltf')
    ap.add_argument('--slot', required=True, choices=['head', 'face', 'neck', 'back', 'hand'])
    ap.add_argument('--rot', default='0,0,0', help='X,Y,Z degrees to turn the model so it faces +Z, +Y up')
    ap.add_argument('--tex', type=int, default=256)
    a = ap.parse_args()
    build(a.name, a.gltf, a.slot, [float(v) for v in a.rot.split(',')], a.tex)
