"""Cut the till off the Meshy café counter and patch the countertop under it.

    python tools/strip_till.py            # counter.gltf -> counter_plain.gltf (+ .bin, shares the texture)

The till sits on the left of the top (x -0.82..-0.31, z -0.65..0.15). Every triangle with a corner
above the countertop inside that patch goes; the hole left in the top is closed with a flat fan at
countertop height, textured from the nearest wood texel so it reads as the same surface.
"""
import json
from pathlib import Path

import numpy as np

DIR = Path(__file__).resolve().parent.parent / 'assets' / 'models' / 'cafe'
TOP = 0.712                                  # countertop height of counter.gltf
X0, X1, Z0, Z1 = -0.84, -0.29, -0.67, 0.17   # till footprint (a little loose)

g = json.loads((DIR / 'counter.gltf').read_text())
raw = (DIR / 'counter.bin').read_bytes()
def acc(i, dt, n):
    a, bv = g['accessors'][i], g['bufferViews'][g['accessors'][i]['bufferView']]
    return np.frombuffer(raw, dt, a['count'] * n, bv.get('byteOffset', 0) + a.get('byteOffset', 0)).reshape(-1, n).copy()
P, N, UV, I = acc(0, np.float32, 3), acc(1, np.float32, 3), acc(2, np.float32, 2), acc(3, np.uint16, 1).reshape(-1, 3)

inside = (P[:, 0] > X0) & (P[:, 0] < X1) & (P[:, 2] > Z0) & (P[:, 2] < Z1)
high = inside & (P[:, 1] > TOP + 0.01)
tri = I[~high[I].any(axis=1)]
# the countertop faces inside the patch go too; the patch is rebuilt flat
flat_in = (inside[tri].all(axis=1)) & (np.abs(P[tri][:, :, 1] - TOP) < 0.02).all(axis=1)
tri = tri[~flat_in]

# hole = the ring of countertop vertices around the till: the top-level vertices on the patch's edge
ring = np.where(inside & (np.abs(P[:, 1] - TOP) < 0.02) & np.isin(np.arange(len(P)), tri.ravel()))[0]
c = P[ring][:, [0, 2]].mean(axis=0)
ring = ring[np.argsort(np.arctan2(P[ring, 2] - c[1], P[ring, 0] - c[0]))]
# wood texel: uv of the countertop vertex nearest the centre but outside the patch
top_out = np.where(~inside & (np.abs(P[:, 1] - TOP) < 0.01) & (N[:, 1] > 0.9))[0]
uv_c = UV[top_out[np.argmin(np.linalg.norm(P[top_out][:, [0, 2]] - c, axis=1))]]

base = len(P)
newP = [[c[0], TOP, c[1]]] + [[P[k, 0], TOP, P[k, 2]] for k in ring]
P = np.vstack([P, np.array(newP, np.float32)])
N = np.vstack([N, np.tile([0, 1, 0], (len(newP), 1)).astype(np.float32)])
UV = np.vstack([UV, np.tile(uv_c, (len(newP), 1)).astype(np.float32)])
fan = [[base, base + 1 + (i + 1) % len(ring), base + 1 + i] for i in range(len(ring))]   # CCW seen from above
I = np.vstack([tri, np.array(fan, np.uint16)]).astype(np.uint16)

# drop unused vertices
used = np.unique(I)
remap = np.full(len(P), -1, np.int64); remap[used] = np.arange(len(used))
P, N, UV, I = P[used], N[used], UV[used], remap[I].astype(np.uint16)

blobs = [P.tobytes(), N.tobytes(), UV.tobytes(), I.tobytes()]
off, views = 0, []
for b, tgt in zip(blobs, [34962, 34962, 34962, 34963]):
    views.append({'buffer': 0, 'byteOffset': off, 'byteLength': len(b), 'target': tgt}); off += len(b)
    off += (-off) % 4
binary = b''.join(b + b'\0' * ((-len(b)) % 4) for b in blobs)
g['bufferViews'] = views
g['buffers'] = [{'uri': 'counter_plain.bin', 'byteLength': len(binary)}]
g['accessors'][0].update(count=len(P), min=P.min(axis=0).tolist(), max=P.max(axis=0).tolist())
for k in (1, 2): g['accessors'][k]['count'] = len(P)
g['accessors'][3]['count'] = I.size
g['nodes'][0]['name'] = g['meshes'][0]['name'] = 'counter_plain'
(DIR / 'counter_plain.bin').write_bytes(binary)
(DIR / 'counter_plain.gltf').write_text(json.dumps(g, separators=(',', ':')))
print(f'{len(P)} verts, {len(I)} tris, ring {len(ring)}, top max y {P[:, 1].max():.3f}')
