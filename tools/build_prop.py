"""Slim a Meshy GLB into a static game prop: .gltf + .bin + one external JPG texture.

    python tools/build_prop.py <name> <meshy-remesh.glb> --fit W,D,H [--rot DEG] [--tex 512]

* `--fit W,D,H` scales the model uniformly until it fits inside that box (world units; 1 floor tile
  = 2 units), centres it on x/z and rests it on the floor.
* `--stretch X,Y,Z` squeezes or widens it afterwards (e.g. a counter that is too shallow for its tile).
* `--rot` turns it about +Y first (degrees) when Meshy's front doesn't face +Z.
* Textures stay external (see ASSETS.md) and shrink to `--tex` px (default 512); the PBR maps in
  the GLB are dropped because the game shades with a plain Lambert material.

Writes assets/models/cafe/<name>.gltf, <name>.bin and <name>_texture.jpg.
"""
import argparse, json, math, sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_character import Bin, read_glb  # noqa: E402

OUT = Path(__file__).resolve().parent.parent / 'assets' / 'models' / 'cafe'


def build(name, src, fit, rot, tex_size, stretch=(1, 1, 1)):
    P, N, UV, IDX, img = read_glb(src)
    if rot:
        c, s = math.cos(math.radians(rot)), math.sin(math.radians(rot))
        R = np.array([[c, 0, -s], [0, 1, 0], [s, 0, c]], np.float32)
        P, N = P @ R.T, N @ R.T
    lo, hi = P.min(axis=0), P.max(axis=0)
    ext = hi - lo
    scale = min(f / e for f, e in zip(fit, (ext[0], ext[2], ext[1])) if f)   # fit is W,D,H; the GLB is x,y(up),z
    P = (P - np.array([(lo[0] + hi[0]) / 2, lo[1], (lo[2] + hi[2]) / 2], np.float32)) * scale
    if tuple(stretch) != (1, 1, 1):   # non-uniform: stretch x,y,z after the fit (normals follow the inverse)
        sx = np.array(stretch, np.float32)
        P = P * sx
        N = N / sx
        N = N / np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-8)
    img = img.resize((tex_size, tex_size), Image.LANCZOS)

    b = Bin()
    pos = b.add(P.astype(np.float32), 5126, 'VEC3', 34962, minmax=True)
    nrm = b.add(N.astype(np.float32), 5126, 'VEC3', 34962)
    uv = b.add(UV.astype(np.float32), 5126, 'VEC2', 34962)
    small = len(P) < 65536
    ind = b.add(IDX.astype(np.uint16 if small else np.uint32), 5123 if small else 5125, 'SCALAR', 34963)

    OUT.mkdir(parents=True, exist_ok=True)
    tex_file = f'{name}_texture.jpg'
    img.save(OUT / tex_file, quality=88, optimize=True)
    (OUT / f'{name}.bin').write_bytes(bytes(b.data))
    gltf = {
        'asset': {'version': '2.0', 'generator': 'tools/build_prop.py'},
        'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [{'name': name, 'mesh': 0}],
        'meshes': [{'name': name, 'primitives': [{'attributes': {'POSITION': pos, 'NORMAL': nrm, 'TEXCOORD_0': uv}, 'indices': ind, 'material': 0}]}],
        'materials': [{'name': name, 'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}, 'metallicFactor': 0, 'roughnessFactor': 0.55}}],
        'textures': [{'source': 0, 'sampler': 0}],
        'samplers': [{'magFilter': 9729, 'minFilter': 9987}],
        'images': [{'uri': tex_file}],
        'buffers': [{'uri': f'{name}.bin', 'byteLength': len(b.data)}],
        'bufferViews': b.views, 'accessors': b.accs,
    }
    (OUT / f'{name}.gltf').write_text(json.dumps(gltf, separators=(',', ':')))
    print(f'{len(IDX) // 3} triangles, scale {scale:.3f}, size {np.round(P.max(axis=0) - P.min(axis=0), 2).tolist()}')
    for f in (f'{name}.gltf', f'{name}.bin', tex_file):
        print(f'{f}: {(OUT / f).stat().st_size / 1024:.0f} KB')


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('name'), ap.add_argument('glb')
    ap.add_argument('--fit', required=True, help='W,D,H max extents in world units (0 = unconstrained)')
    ap.add_argument('--rot', type=float, default=0)
    ap.add_argument('--tex', type=int, default=512)
    ap.add_argument('--stretch', default='1,1,1', help='X,Y,Z extra non-uniform scale after the fit')
    a = ap.parse_args()
    build(a.name, a.glb, [float(v) for v in a.fit.split(',')], a.rot, a.tex, [float(v) for v in a.stretch.split(',')])
