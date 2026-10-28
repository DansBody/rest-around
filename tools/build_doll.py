"""Write the paper-doll base (紙娃娃) as the game's skinned glTF: the slots tools/doll/model.js builds in three.js,
skinned to one skeleton, with the painted face texture and the game's clips. Run by tools/doll/export.mjs:

    node tools/doll/export.mjs                      # model.js in headless Chrome -> doll_parts.json -> this
    python tools/build_doll.py design/paper_doll/build/doll_parts.json

Writes assets/models/characters/Doll.gltf + .bin + doll_face.png. Every slot is its own mesh node (Doll_body,
Doll_face, Doll_hair, Doll_top, Doll_apron, Doll_bottom, Doll_legwear, Doll_shoes) on the same skin, so the game
can hide or swap one and tint it (the colour is in COLOR_0, the material stays white; the face is the head with
its painted texture). Bones carry translations only (no rest rotation), like tools/build_character.py, so the
clips and code-posed moves use the same axes: the plush rig's names plus elbows, knees, feet and a neck
(forearm_*, shin_*, foot_*, neck).
"""
import base64, io, json, math, sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_character as bc

OUT = Path(__file__).resolve().parent.parent / 'assets' / 'models' / 'characters'
NAME = 'Doll'
PARTS = ['body', 'face', 'hair', 'top', 'apron', 'bottom', 'legwear', 'shoes']
GLOW = 0.18              # the face's self-glow, as the plush cast's (build_character.GLOW): it keeps its colour in shade

# which bones may move each slot (the rest get no weight), and how thick each bone's flesh is: a vertex's weight
# falls with its distance to the bone's segment measured in these radii, so the thin arm doesn't steal the torso
ALLOWED = {
    'body': None, 'face': ['head'], 'hair': ['head'],
    'top': ['hips', 'chest', 'neck', 'arm_l', 'arm_r', 'forearm_l', 'forearm_r'],
    'apron': ['hips', 'chest'], 'bottom': ['hips', 'leg_l', 'leg_r'],
    'legwear': ['hips', 'leg_l', 'leg_r', 'shin_l', 'shin_r', 'foot_l', 'foot_r'],
    'shoes': ['shin_l', 'shin_r', 'foot_l', 'foot_r'],
}
RADIUS = {'hips': 0.22, 'chest': 0.17, 'neck': 0.06, 'head': 0.25, 'arm': 0.065, 'forearm': 0.045, 'hand': 0.04,
          'leg': 0.12, 'shin': 0.078, 'foot': 0.07}
POWER = 6


# ------------------------------------------------------------------ skinning
def segments(rest):
    """Each bone's segment (glTF coords): from its joint to its child's, or a set length for the end bones."""
    R = {n: rest[i] for i, n in enumerate(BONE_NAMES)}
    seg = {'hips': (np.array([0, 0.98, 0]), np.array([0, 1.32, 0])), 'chest': (np.array([0, 1.32, 0]), np.array([0, 1.9, 0])),
           'neck': (R['neck'], R['head']), 'head': (R['head'], R['head'] + np.array([0, 0.55, 0]))}
    for s in ('l', 'r'):
        seg['arm_' + s] = (R['arm_' + s], R['forearm_' + s])
        seg['forearm_' + s] = (R['forearm_' + s], R['hand_' + s])
        d = R['hand_' + s] - R['forearm_' + s]
        seg['hand_' + s] = (R['hand_' + s], R['hand_' + s] + d / np.linalg.norm(d) * 0.14)
        seg['leg_' + s] = (R['leg_' + s], R['shin_' + s])
        seg['shin_' + s] = (R['shin_' + s], R['foot_' + s])
        seg['foot_' + s] = (R['foot_' + s], R['foot_' + s] + np.array([0, -0.12, 0.22]))
    return {k: (np.asarray(a, np.float32), np.asarray(b, np.float32)) for k, (a, b) in seg.items()}


def seg_dist(P, a, b):
    ab = b - a
    t = np.clip(((P - a) @ ab) / float(ab @ ab), 0, 1)
    return np.linalg.norm(P - (a + t[:, None] * ab), axis=1)


def weights(P, allowed, seg):
    names = [n for n in seg if allowed is None or n in allowed]
    W = np.zeros((len(P), len(BONE_NAMES)), np.float32)
    for n in names:
        r = RADIUS[n.split('_')[0]]
        d = seg_dist(P, *seg[n]) / r
        W[:, BI[n]] = 1.0 / np.maximum(d, 0.05) ** POWER
    idx = np.argsort(-W, axis=1)[:, :4]
    w = np.take_along_axis(W, idx, axis=1)
    w /= np.maximum(w.sum(axis=1, keepdims=True), 1e-12)
    w[w < 0.01] = 0
    w /= w.sum(axis=1, keepdims=True)
    return idx.astype(np.uint8), w.astype(np.float32)


# ------------------------------------------------------------------ clips: the plush clips, adapted to long limbs
ARM_DOWN = 0.38          # the sheet's A-pose holds the arms ~36 degrees out; the clips bring them closer


def doll_pose(name, q, p):
    q = dict(q)
    lx, _, lz = q.get('arm_l', (0, 0, 0)); rx, _, rz = q.get('arm_r', (0, 0, 0))
    q['arm_l'], q['arm_r'] = (lx, 0, lz - ARM_DOWN), (rx, 0, rz + ARM_DOWN)
    S = bc.S
    bend = lambda k: (k, 0, 0)          # rot x > 0 swings a lower limb back: knees bend, elbows don't hyperextend
    if name in ('Walk', 'Carry'):
        q['shin_l'] = bend(0.75 * max(0.0, S(p, 1, 0.1)))
        q['shin_r'] = bend(0.75 * max(0.0, -S(p, 1, 0.1)))
        q['foot_l'] = bend(-0.3 * max(0.0, S(p, 1, 0.1)))
        q['foot_r'] = bend(-0.3 * max(0.0, -S(p, 1, 0.1)))
    if name in ('Sit', 'Eat', 'Wait'):
        for s in ('l', 'r'):
            q['shin_' + s] = bend(-q['leg_' + s][0])           # shins hang straight down from the seat
        hx, hy, hz = q['hips@p']
        q['hips@p'] = (hx, hy + 0.06, hz)
    if name == 'Nap':                   # sitting on the floor: the long thighs put the hip joint higher than the plush's
        hx, hy, hz = q['hips@p']
        q['hips@p'] = (hx, hy + 0.12, hz)
    elbow = {'Carry': (-0.55, -0.55), 'Work': (-0.7, -0.7), 'Shake': (-0.9, -1.1), 'Sweep': (-0.35, -0.35),
             'Repair': (-0.3, -0.5), 'Eat': (-0.3, -1.3), 'Pickup': (-0.3, -0.3), 'Talk': (-0.6, -0.2)}.get(name)
    if elbow:
        q['forearm_l'], q['forearm_r'] = (elbow[0], 0, 0), (elbow[1], 0, 0)
    return q


def clips():
    for cname, (fn, T) in bc.CLIPS.items():
        yield cname, (lambda p, fn=fn, cname=cname: doll_pose(cname, fn(p), p)), T


# ------------------------------------------------------------------ build
def build(src):
    global BONE_NAMES, BI
    D = json.loads(Path(src).read_text())
    BONE_NAMES = [n for n, _, _ in D['bones']]
    parents = [p for _, p, _ in D['bones']]
    BI = {n: i for i, n in enumerate(BONE_NAMES)}
    rest = np.array([v for _, _, v in D['bones']], np.float32)
    seg = segments(rest)

    # bc's pose functions read its globals: the scale and the hip height
    bc.C = {'scale': 1.0}
    bc.BONES_REST = [(n, tuple(rest[i])) for i, n in enumerate(BONE_NAMES)]

    b = bc.Bin()
    meshes, materials = [], []
    tris = 0
    for part in PARTS:
        d = D['parts'][part]
        P, N = np.array(d['P'], np.float32).reshape(-1, 3), np.array(d['N'], np.float32).reshape(-1, 3)
        F = np.array(d['F'], np.int64).reshape(-1, 3)
        N = N / np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-6)
        attrs = {}
        if part == 'face':
            attrs['TEXCOORD_0'] = b.add((np.array(d['UV'], np.float32).reshape(-1, 2) * [1, -1] + [0, 1]).astype(np.float32), 5126, 'VEC2', 34962)
        else:
            attrs['COLOR_0'] = b.add(np.array(d['C'], np.float32).reshape(-1, 3), 5126, 'VEC3', 34962)
        j, w = weights(P, ALLOWED[part], seg)
        attrs.update({'POSITION': b.add(P, 5126, 'VEC3', 34962, minmax=True), 'NORMAL': b.add(N.astype(np.float32), 5126, 'VEC3', 34962),
                      'JOINTS_0': b.add(j, 5121, 'VEC4', 34962), 'WEIGHTS_0': b.add(w, 5126, 'VEC4', 34962)})
        big = len(P) >= 65536
        ind = b.add(F.astype(np.uint32 if big else np.uint16).ravel(), 5125 if big else 5123, 'SCALAR', 34963)
        mat = {'name': 'Doll_' + part, 'pbrMetallicRoughness': {'baseColorFactor': [1, 1, 1, 1], 'metallicFactor': 0,
               'roughnessFactor': 0.62}}
        if part == 'face':
            mat['pbrMetallicRoughness']['baseColorTexture'] = {'index': 0}
            mat['emissiveTexture'], mat['emissiveFactor'] = {'index': 0}, [GLOW] * 3
        materials.append(mat)
        meshes.append({'name': 'Doll_' + part, 'primitives': [{'attributes': attrs, 'indices': ind, 'material': len(materials) - 1}]})
        tris += len(F)
        print(f'{part}: {len(P)} verts, {len(F)} tris')

    world = {n: rest[i] for i, n in enumerate(BONE_NAMES)}
    nodes = []
    for n, par in zip(BONE_NAMES, parents):
        local = world[n] - (world[par] if par else 0)
        nodes.append({'name': n, 'translation': [round(float(v), 5) for v in local]})
    for n, par in zip(BONE_NAMES, parents):
        if par: nodes[BI[par]].setdefault('children', []).append(BI[n])
    ibm = np.zeros((len(BONE_NAMES), 16), np.float32)
    for i, n in enumerate(BONE_NAMES):
        m = np.eye(4, dtype=np.float32); m[:3, 3] = -world[n]; ibm[i] = m.T.reshape(16)
    ibm_acc = b.add(ibm, 5126, 'MAT4')
    first = len(nodes)
    for i, part in enumerate(PARTS):
        nodes.append({'name': 'Doll_' + part, 'mesh': i, 'skin': 0})
    top = len(nodes)
    nodes.append({'name': NAME, 'children': [BI['root']] + list(range(first, top))})

    animations = []
    for cname, fn, T in clips():
        frames = max(2, round(T * bc.FPS)) + 1
        times = np.linspace(0, T, frames).astype(np.float32)
        poses = [fn(i / (frames - 1)) for i in range(frames)]
        tin = b.add(times, 5126, 'SCALAR', minmax=True)
        samplers, channels = [], []
        for k in sorted({k for q in poses for k in q if k.partition('@')[0] in BI}):
            bone, _, kind = k.partition('@')
            if kind == 'p':
                base = world[bone] - (world[parents[BI[bone]]] if parents[BI[bone]] else 0)
                out, path = np.array([base + np.array(q.get(k, (0, 0, 0)), np.float32) for q in poses], np.float32), 'translation'
            elif kind == 's':
                out, path = np.array([q.get(k, (1, 1, 1)) for q in poses], np.float32), 'scale'
            else:
                out, path = np.array([bc.quat(*q.get(k, (0, 0, 0))) for q in poses], np.float32), 'rotation'
            samplers.append({'input': tin, 'output': b.add(out, 5126, 'VEC4' if path == 'rotation' else 'VEC3'), 'interpolation': 'LINEAR'})
            channels.append({'sampler': len(samplers) - 1, 'target': {'node': BI[bone], 'path': path}})
        animations.append({'name': cname, 'samplers': samplers, 'channels': channels})

    OUT.mkdir(parents=True, exist_ok=True)
    Image.open(io.BytesIO(base64.b64decode(D['face'].split(',')[1]))).convert('RGB').save(OUT / 'doll_face.png', optimize=True)
    (OUT / f'{NAME}.bin').write_bytes(bytes(b.data))
    gltf = {
        'asset': {'version': '2.0', 'generator': 'tools/build_doll.py'},
        'scene': 0, 'scenes': [{'nodes': [top]}], 'nodes': nodes, 'meshes': meshes,
        'skins': [{'joints': list(range(len(BONE_NAMES))), 'inverseBindMatrices': ibm_acc, 'skeleton': BI['root']}],
        'materials': materials,
        'textures': [{'source': 0, 'sampler': 0}], 'samplers': [{'magFilter': 9729, 'minFilter': 9729, 'wrapS': 33071, 'wrapT': 33071}],
        'images': [{'uri': 'doll_face.png'}],
        'animations': animations,
        'buffers': [{'uri': f'{NAME}.bin', 'byteLength': len(b.data)}],
        'bufferViews': b.views, 'accessors': b.accs,
    }
    (OUT / f'{NAME}.gltf').write_text(json.dumps(gltf, separators=(',', ':')))
    print(f'{tris} tris')
    for f in (f'{NAME}.gltf', f'{NAME}.bin', 'doll_face.png'):
        print(f'{f}: {(OUT / f).stat().st_size / 1024:.0f} KB')


if __name__ == '__main__':
    if len(sys.argv) != 2: sys.exit(__doc__)
    build(sys.argv[1])
