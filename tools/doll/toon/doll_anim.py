# -*- coding: utf-8 -*-
"""Paper doll — puppet rig + procedural idle / walk, rendered on the café's 64x112 sprite grid.

usage: blender -b -P doll_anim.py -- [--out DIR] [--only idle,walk]
then:  python sheet.py DIR [--compare assets/sprites/doll_px/doll_px.png]

Same method as 丹的大冒險's dan_anim.py: every part rides rigidly on a pivot (no skin weights), and each
animation is a function pose(f, n) that sets pivot transforms from sines with phase lags, so the head,
hair, ahoge and apron follow the body a beat late. After posing, the whole doll is dropped so the lowest
boot point touches the ground, so the body bob comes out of the legs' geometry instead of being guessed.
"""
import math, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import doll_model as DM  # noqa: E402  (builds the model + camera/light)
import toonkit as T  # noqa: E402
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

ARGV = DM.ARGV
OUT = ARGV[ARGV.index("--out") + 1] if "--out" in ARGV else os.path.join(DM.REPO, "design", "paper_doll", "toon", "anim")
ONLY = ARGV[ARGV.index("--only") + 1].split(",") if "--only" in ARGV else None

# ----------------------------------------------------------------- rig
PIVOTS = {   # rest positions (model units), parent
    "ground":    ((0.0, 0.0, 0.0), "root"),
    "hips":      ((0.0, 0.0, 1.55), "ground"),
    "chest":     ((0.0, 0.0, 1.90), "hips"),
    "neck":      ((0.0, 0.0, 2.45), "chest"),
    "hair_back": (DM.head_pt((0.0, 0.12, 3.55)), "neck"),
    "hair_L":    (DM.head_pt((0.42, -0.06, 3.30)), "neck"),
    "hair_R":    (DM.head_pt((-0.42, -0.06, 3.30)), "neck"),
    "ahoge":     (DM.head_pt((0.0, -0.02, 3.72)), "neck"),
    "arm_L":     ((0.36, 0.0, 2.24), "chest"),
    "forearm_L": ((0.44, 0.0, 1.80), "arm_L"),
    "arm_R":     ((-0.36, 0.0, 2.24), "chest"),
    "forearm_R": ((-0.44, 0.0, 1.80), "arm_R"),
    "skirt":     ((0.0, 0.0, 1.62), "hips"),
    "leg_L":     ((0.16, 0.0, 1.45), "hips"),
    "shin_L":    ((0.16, 0.0, 0.93), "leg_L"),
    "foot_L":    ((0.16, 0.02, 0.40), "shin_L"),
    "leg_R":     ((-0.16, 0.0, 1.45), "hips"),
    "shin_R":    ((-0.16, 0.0, 0.93), "leg_R"),
    "foot_R":    ((-0.16, 0.02, 0.40), "shin_R"),
}
RIG = T.Rig(PIVOTS, yxz=("arm_L", "arm_R"))
rot, move, scale = RIG.rot, RIG.move, RIG.scale
for name, pivot in DM.OWN.items():
    RIG.attach(bpy.data.objects[name], pivot)
BOOTS = [bpy.data.objects[n] for n in DM.BOOTS]
TAU = T.TAU


def plant():
    """Drop (or lift) the whole doll so its lowest boot point sits on z = 0."""
    bpy.context.view_layer.update()
    low = min((o.matrix_world @ v.co).z for o in BOOTS for v in o.data.vertices)
    g = RIG.pv["ground"]
    g.location.z -= low / DM.SCALE


def both(name, x=0.0, y=0.0, z=0.0, mirror_y=True):
    """Same rotation on the L and R pivot (y and z mirrored, so 'outward' means outward on both sides)."""
    rot(name + "_L", x=x, y=y, z=z)
    rot(name + "_R", x=x, y=-y if mirror_y else y, z=-z)


# ----------------------------------------------------------------- idle: breathing
def pose_idle(f, n):
    p = TAU * f / n
    b = math.sin(p)                                   # +1 = exhaled (settled), -1 = inhaled (tall)
    sx, sz = 1 + 0.010 * b, 1 - 0.016 * b
    scale("ground", sx, sx, sz)
    scale("neck", 1 / sx, 1 / sx, 1 / sz)             # the head keeps its shape, only its height moves
    rot("chest", x=1.5 * b)
    rot("neck", x=-2.0 * math.sin(p - 0.7), z=1.5 * math.sin(p - 0.4))   # a beat late
    for s, side in ((1, "L"), (-1, "R")):
        rot(f"arm_{side}", x=-2 - 3 * math.sin(p - 0.5), y=-s * (2 + 1.5 * b))
        rot(f"forearm_{side}", x=-8 - 3 * math.sin(p - 0.9))
    rot("hair_back", x=-2.5 * math.sin(p - 1.2))
    both("hair", y=2.5 * math.sin(p - 1.0))
    rot("ahoge", x=9 * math.sin(p - 1.5), y=4 * math.sin(p - 1.8))
    rot("skirt", x=1.5 * math.sin(p - 1.0))
    plant()


# ----------------------------------------------------------------- walk
STRIDE, KNEE, ARM = 24, 46, 20


def pose_walk(f, n):
    p = TAU * f / n
    s, c = math.sin(p), math.cos(p)
    c2 = math.cos(2 * p)                              # +1 = passing (one foot up), -1 = contact
    # legs: thigh swing, the knee bends while the leg swings through, the foot stays level-ish
    for side, k in (("R", 1), ("L", -1)):
        thigh = -STRIDE * s * k                       # - = forward
        swing = max(0.0, c * k)                       # this leg is moving forward
        knee = 4 + KNEE * swing ** 1.3
        rot(f"leg_{side}", x=thigh - 10 * swing)      # lift the thigh a little as it swings through
        rot(f"shin_{side}", x=knee)
        rot(f"foot_{side}", x=-(thigh - 10 * swing + knee) * 0.75 + 8 * max(0.0, -s * k) * (1 - swing))
    move("hips", dz=0.025 * c2)
    rot("hips", x=4, y=-2.5 * s, z=6 * s)             # lean, drop toward the swinging side, twist with the step
    rot("chest", x=1, y=2.5 * s, z=-10 * s)           # shoulders counter-twist
    rot("neck", x=-2.5 * math.cos(2 * p - 0.6), y=0, z=5 * s)
    # arms: opposite the legs, a little late, the elbow bends more on the forward swing
    for side, k in (("R", 1), ("L", -1)):
        a = math.sin(p - 0.35) * k
        rot(f"arm_{side}", x=ARM * a, y=-(1 if side == "L" else -1) * 4)
        rot(f"forearm_{side}", x=-10 - 18 * max(0.0, -a))
    # secondary: hair, ahoge and apron lag the bob and the twist
    rot("hair_back", x=-5 * math.cos(2 * p - 1.3), z=-3 * math.sin(p - 0.9))
    both("hair", x=-4 * math.cos(2 * p - 1.2), y=3 * math.cos(2 * p - 1.4))
    rot("ahoge", x=12 * math.cos(2 * p - 1.7), y=6 * math.sin(p - 1.0))
    rot("skirt", x=-2.5 * math.cos(2 * p - 1.0), z=-4 * math.sin(p - 0.7))
    plant()


ANIMS = {
    "idle": {"pose": pose_idle, "frames": 8, "views": ["f", "b"]},
    "walk": {"pose": pose_walk, "frames": 8, "views": ["f", "b"]},
}

if __name__ == "__main__":
    T.render_anims(OUT, RIG, ANIMS, only=ONLY)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "doll_rig.blend"))
    print("ANIM DONE", OUT)
