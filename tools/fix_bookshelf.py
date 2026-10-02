"""Repair a Meshy flaw in assets/models/cafe/bookshelf: one corner of the middle shelf's front lip was
pulled up the left post (y 1.25 instead of 0.86), so the lip fanned out into a dark slanted shard.

    python tools/fix_bookshelf.py

The corner (12 seam copies of one vertex) goes back down onto the lip; each copy takes the UV and
normal of the nearest other corner of its own triangles, so it samples the same wood as its face.
"""
import json
from pathlib import Path

import numpy as np

F = Path(__file__).resolve().parent.parent / 'assets' / 'models' / 'cafe' / 'bookshelf.gltf'
g = json.loads(F.read_text())
binp = F.parent / g['buffers'][0]['uri']
raw = bytearray(binp.read_bytes())
prim = g['meshes'][0]['primitives'][0]

def view(ai, n, dt=np.float32):
    a = g['accessors'][ai]; bv = g['bufferViews'][a['bufferView']]
    off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    return off, np.frombuffer(raw, dt, a['count'] * n, off).reshape(-1, n).copy()

po, P = view(prim['attributes']['POSITION'], 3)
no, N = view(prim['attributes']['NORMAL'], 3)
uo, UV = view(prim['attributes']['TEXCOORD_0'], 2)
it = g['accessors'][prim['indices']]['componentType']
_, I = view(prim['indices'], 1, np.uint16 if it == 5123 else np.uint32)
I = I.reshape(-1, 3)

bad = np.where(np.linalg.norm(P - [-0.665, 1.2456, 0.3205], axis=1) < 0.01)[0]
if not len(bad):
    raise SystemExit('already fixed')
P[bad] = [-0.66, 0.86, 0.32]
for v in bad:
    others = [o for tri in I[(I == v).any(axis=1)] for o in tri if o not in bad]
    if not others:
        continue
    o = min(others, key=lambda k: np.linalg.norm(P[k] - P[v]))
    UV[v], N[v] = UV[o], N[o]
for off, arr in ((po, P), (no, N), (uo, UV)):
    raw[off:off + arr.nbytes] = arr.tobytes()
binp.write_bytes(bytes(raw))
g['accessors'][prim['attributes']['POSITION']].update(min=P.min(axis=0).tolist(), max=P.max(axis=0).tolist())
F.write_text(json.dumps(g, separators=(',', ':')))
print(f'moved {len(bad)} seam copies of the stray corner back onto the shelf lip')
