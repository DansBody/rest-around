"""Build one of the game's own characters from a Meshy GLB: a light skinned glTF with hand-made clips.

Meshy's auto-rigger only handles humanoids (it rejects these chibi plush proportions), so this
script adds a small plush-toy skeleton itself (hips, legs, chest, arms, head, ears, and wings where
the character has them), skins the mesh with smooth region weights, mends the source model's known
flaws and bakes the animations the game asks for (see the manifest's `animations` map on each
character). Every character is a CHARACTERS entry below.

    python tools/build_character.py <character id> <meshy-remesh.glb>

Writes models/characters/<Name>.gltf + .bin + <id>_texture.jpg (kept external, see ASSETS.md).
"""
import io, json, math, struct, sys
from pathlib import Path

import numpy as np
from PIL import Image

OUT = Path(__file__).resolve().parent.parent / 'assets' / 'models' / 'characters'
TEX_SIZE = 1024
FPS = 30
ROUGHNESS = 0.55   # KayKit characters use 0.5
GLOW = 0.18        # emissive share of the base colour, lifts the shaded side
SEAT = 0.55        # chair seat height in game units
# House standard so the cast reads as one family: face width (across the cheeks, below the ears)
# as a share of the figure's height. 0.67 sits between Mocha Latte's natural 0.74 and Bbaekko's
# 0.61; each head is widened or narrowed to it on build (the body below the neck is untouched).
FACE_WIDTH = 0.67

# ------------------------------------------------------------------ characters
# All measurements are in source units: the model centred on x/z with its feet at y = 0, front
# facing +Z (so the character's left is +X).
#   bones   name, parent, rest position. hips/legs/chest/arms/hands/head/ears are expected; wing_l/r
#           are optional.
#   skin    edges (lo, hi) of the soft regions each bone takes: legs below `leg`, arms beyond
#           `arm_x` between `arm_y` (rise) and `arm_top` (fall), head above `head`, ears above
#           `ear_y` and beyond `ear_x`, wings behind `wing_z` within `wing_y`.
#   face    height band (y0, y1) across the cheeks, below the ears, where the face width is
#           measured for FACE_WIDTH.
#   repairs flaws of the source model as boxes. smooth: Laplacian passes that iron out a groove.
#           clean: passes of surrounding colour a mark is compared with, tol: how far a texel may
#           stray from it. arm: repaint as plain arm in the colour sampled at `arm_tip`.
#   keep    triangles (by mean colour) the clean-up leaves alone and keeps out of local colours.
#   recolor / decals  see paint_texture.
#   tail    optional `tail` bone (needs tail_z/x/y skin bands); one_arm: only arm_l is skinned;
#           face_width: override FACE_WIDTH (0 = leave the head's shape alone).
CHARACTERS = {
    'mochalatte': {
        'name': 'MochaLatte',
        # Meshy gpt-image-2 image-to-image 01a0f6bd-ac78-7396-abea-21e288d03bb8 (smooth vinyl
        # front/side/back views of the plush) -> multi-image-to-3d 01a0f6bf-79ff-76e9-b1bf-382def49f54a,
        # remesh 01a0f6c1-2cc1-701e-b42f-21dbee991632
        'scale': 1.1,       # 1.9 units tall; ~2.1 sits nicely next to the KayKit cast
        'bones': [
            ('root', None, (0, 0, 0)), ('hips', 'root', (0, 0.42, 0)),
            ('leg_l', 'hips', (0.22, 0.42, 0)), ('leg_r', 'hips', (-0.22, 0.42, 0)),
            ('chest', 'hips', (0, 0.56, 0)),
            ('arm_l', 'chest', (0.5, 0.64, 0)), ('hand_l', 'arm_l', (0.68, 0.55, 0.05)),
            ('arm_r', 'chest', (-0.5, 0.64, 0)), ('hand_r', 'arm_r', (-0.68, 0.55, 0.05)),
            ('head', 'chest', (0, 0.8, 0)),
            ('ear_l', 'head', (0.5, 1.45, 0)), ('ear_r', 'head', (-0.5, 1.45, 0)),
        ],
        'skin': {'leg': (0.32, 0.46), 'arm_x': (0.5, 0.57), 'arm_y': (0.42, 0.48), 'arm_top': (0.74, 0.8),
                 'head': (0.76, 0.86), 'chest': (0.44, 0.58), 'ear_y': (1.36, 1.46), 'ear_x': (0.38, 0.48)},
        'face': (0.9, 1.3),
        'repairs': [],
    },
    'bbaekko': {
        'name': 'Bbaekko',
        # Meshy image-to-image 01a0f69b-ac6a-7492-bf89-11a0e094e9ec (smooth vinyl front/side/back
        # views of the plush) -> multi-image-to-3d 01a0f69c-9084-77e7-aed9-e4776d0cebc3,
        # remesh 01a0f69e-d78b-713a-b1aa-3c50e91a2e22
        'scale': 1.1,
        'bones': [
            ('root', None, (0, 0, 0)), ('hips', 'root', (0, 0.42, 0)),
            ('leg_l', 'hips', (0.2, 0.42, 0)), ('leg_r', 'hips', (-0.2, 0.42, 0)),
            ('chest', 'hips', (0, 0.58, 0)),
            ('arm_l', 'chest', (0.42, 0.7, 0)), ('hand_l', 'arm_l', (0.64, 0.58, 0.05)),
            ('arm_r', 'chest', (-0.42, 0.7, 0)), ('hand_r', 'arm_r', (-0.64, 0.58, 0.05)),
            ('wing_l', 'chest', (0.1, 0.72, -0.42)), ('wing_r', 'chest', (-0.1, 0.72, -0.42)),
            ('head', 'chest', (0, 0.88, 0)),
            ('ear_l', 'head', (0.42, 1.6, 0)), ('ear_r', 'head', (-0.42, 1.6, 0)),
        ],
        'skin': {'leg': (0.32, 0.46), 'arm_x': (0.41, 0.5), 'arm_y': (0.42, 0.48), 'arm_top': (0.78, 0.84),
                 'head': (0.84, 0.95), 'chest': (0.44, 0.58), 'ear_y': (1.5, 1.62), 'ear_x': (0.2, 0.32),
                 'wing_z': (-0.38, -0.45), 'wing_y': (0.52, 0.58, 0.86, 0.92)},
        'face': (1.0, 1.4),
        'repairs': [],
    },
    'heehee': {
        'name': 'HeeHee',
        # Meshy gpt-image-2 image-to-image 01a0f6c7-a982-70ea-b261-6c861de2ddf5 (smooth vinyl
        # front/side/back views of the plush) -> multi-image-to-3d 01a0f6c9-eb8c-77f9-8d1b-839903eb3c19,
        # remesh 01a0f6cb-dd93-72eb-9bbc-cd55d4993509
        'scale': 1.1,
        'bones': [
            ('root', None, (0, 0, 0)), ('hips', 'root', (0, 0.38, 0)),
            ('leg_l', 'hips', (0.2, 0.38, 0)), ('leg_r', 'hips', (-0.2, 0.38, 0)),
            ('chest', 'hips', (0, 0.56, 0)),
            ('arm_l', 'chest', (0.46, 0.55, 0)), ('hand_l', 'arm_l', (0.6, 0.45, 0.05)),
            ('arm_r', 'chest', (-0.46, 0.55, 0)), ('hand_r', 'arm_r', (-0.6, 0.45, 0.05)),
            ('head', 'chest', (0, 0.9, 0)),
            ('ear_l', 'head', (0.42, 1.62, 0)), ('ear_r', 'head', (-0.42, 1.62, 0)),
        ],
        # the petal collar (y 0.55-0.85) overhangs the arms, so the arms stop below it
        'skin': {'leg': (0.28, 0.42), 'arm_x': (0.47, 0.54), 'arm_y': (0.36, 0.42), 'arm_top': (0.54, 0.6),
                 'head': (0.86, 0.96), 'chest': (0.42, 0.56), 'ear_y': (1.52, 1.62), 'ear_x': (0.25, 0.35)},
        'face': (1.05, 1.4),
        'repairs': [],
    },
    'cheetie': {
        'name': 'Cheetie',
        # Meshy gpt-image-2 image-to-image 01a0f74f-2829-70a5-a274-cae8b3edb7b5 (smooth vinyl
        # front/side/back views of the plush) -> multi-image-to-3d 01a0f751-8381-775f-9a49-faed13e53a5d,
        # remesh 01a0f755-899c-7312-82df-b9a7466d6500
        'scale': 1.1,
        'bones': [
            ('root', None, (0, 0, 0)), ('hips', 'root', (0, 0.3, 0)),
            ('leg_l', 'hips', (0.23, 0.3, 0)), ('leg_r', 'hips', (-0.23, 0.3, 0)),
            ('chest', 'hips', (0, 0.5, 0)),
            ('arm_l', 'chest', (0.5, 0.72, 0)), ('hand_l', 'arm_l', (0.68, 0.76, 0.05)),
            ('arm_r', 'chest', (-0.5, 0.72, 0)), ('hand_r', 'arm_r', (-0.68, 0.76, 0.05)),
            ('tail', 'hips', (0, 0.34, -0.3)),
            ('head', 'chest', (0, 0.98, 0)),
            ('ear_l', 'head', (0.5, 1.7, 0)), ('ear_r', 'head', (-0.5, 1.7, 0)),
        ],
        # the tail (z < -0.3, y 0.15-0.7) is skinned before the legs so its lower curl isn't pulled along
        'skin': {'leg': (0.14, 0.3), 'arm_x': (0.47, 0.55), 'arm_y': (0.5, 0.6), 'arm_top': (0.88, 0.96),
                 'head': (0.96, 1.06), 'chest': (0.36, 0.5), 'ear_y': (1.6, 1.7), 'ear_x': (0.4, 0.5),
                 'tail_z': (-0.3, -0.42), 'tail_x': (0.34, 0.27), 'tail_y': (0.08, 0.15, 0.68, 0.75)},
        'face': (1.1, 1.45),
        'repairs': [],
        # Meshy turned the tail's yellow bow brown (the same brown as the spots), so repaint it by region
        'recolor': [{'from': (132, 78, 20), 'to': (246, 200, 40), 'tol': 0.07,
                     'where': lambda x, y, z: ((y > 0.46) & (y < 0.76) & (z > -0.52) & (z < -0.33) & (np.abs(x) < 0.27)).astype(np.float32)}],
    },
    'oritokki': {
        'name': 'Oritokki',
        # Meshy gpt-image-2 image-to-image 01a0f767-3041-76bf-880a-2e7030aa7c9b (smooth vinyl
        # front/side/back views of the plush) -> multi-image-to-3d 01a0f768-fa41-75e1-b4f5-9e1c223abdd8,
        # remesh 01a0f76b-0eca-7369-b0f8-8f3c109418f9
        'scale': 1.0,       # a 1.5 wide ball: the house 1.1 would crowd the chairs
        # a fluffy ball with one little hand (on +x): no cheek band to standardise, and only arm_l is skinned
        # (hand_r still exists so the clips can pose both arms; the game holds props in hand_l)
        'face_width': 0, 'one_arm': True,
        'bones': [
            ('root', None, (0, 0, 0)), ('hips', 'root', (0, 0.3, 0)),
            ('leg_l', 'hips', (0.26, 0.25, 0.05)), ('leg_r', 'hips', (-0.26, 0.25, 0.05)),
            ('chest', 'hips', (0, 0.55, 0)),
            ('arm_l', 'chest', (0.6, 0.56, 0)), ('hand_l', 'arm_l', (0.7, 0.54, 0.02)),
            ('arm_r', 'chest', (-0.6, 0.56, 0)), ('hand_r', 'arm_r', (-0.7, 0.54, 0.02)),
            ('tail', 'hips', (0, 0.5, -0.3)),
            ('head', 'chest', (0, 0.8, 0)),
            ('ear_l', 'head', (0.35, 1.35, 0)), ('ear_r', 'head', (-0.35, 1.35, 0)),
        ],
        # the ears (y > 1.2) are two fans that meet at x = 0; the pompom tail sits at the back (y 0.4-0.6)
        'skin': {'leg': (0.1, 0.28), 'arm_x': (0.6, 0.65), 'arm_y': (0.42, 0.48), 'arm_top': (0.62, 0.7),
                 'head': (0.7, 1.0), 'chest': (0.4, 0.6), 'ear_y': (1.2, 1.38), 'ear_x': (0.1, 0.3),
                 'tail_z': (-0.5, -0.54), 'tail_x': (0.16, 0.11), 'tail_y': (0.3, 0.4, 0.6, 0.7)},
        'face': (0.7, 1.0),
        'repairs': [],
    },
    'tata': {
        'name': 'TATA',
        # User-made gpt-image three-view reference -> Meshy 7 multi-image-to-3d
        # 01a0fd3c-2642-71c5-a909-2f5f2904f24c, remesh 01a0fd40-1b00-77bb-8bb5-f789a3657f64.
        # Source remesh is 1.9 units tall. Preserve the heart silhouette as one rigid head;
        # its two lobes are not ears and must not receive the ear animation weights.
        'scale': 1.1, 'face_width': 0, 'smooth_normals': True,
        # Meshy's tightly packed UV islands bleed neighbouring colours through mipmaps,
        # producing pale hairlines on the heart and blue suit. Use bilinear sampling instead.
        'texture_mipmaps': False,
        'texture_size': 2048, 'texture_subsampling': 0,
        'bones': [
            ('root', None, (0, 0, 0)), ('hips', 'root', (0, 0.24, 0)),
            ('leg_l', 'hips', (0.15, 0.24, 0.03)), ('leg_r', 'hips', (-0.15, 0.24, 0.03)),
            ('chest', 'hips', (0, 0.45, 0)),
            ('arm_l', 'chest', (0.31, 0.6, 0)), ('hand_l', 'arm_l', (0.425, 0.29, 0.04)),
            ('arm_r', 'chest', (-0.31, 0.6, 0)), ('hand_r', 'arm_r', (-0.425, 0.29, 0.04)),
            ('head', 'chest', (0, 0.73, 0)),
            ('ear_l', 'head', (0.42, 1.75, 0)), ('ear_r', 'head', (-0.42, 1.75, 0)),
        ],
        'skin': {'leg': (0.16, 0.28), 'arm_x': (0.3, 0.37), 'arm_y': (0.2, 0.25),
                 'arm_top': (0.61, 0.69), 'head': (0.68, 0.75), 'chest': (0.28, 0.45),
                 'ear_y': (2.0, 2.1), 'ear_x': (0.3, 0.4)},
        'face': (0.9, 1.5),
        # Clean Meshy's pale seams on the red head while protecting the eyes and yellow muzzle.
        'keep': lambda c: (c.max(1) < 100) | ((c[:, 1] > 100) & (c[:, 1] > 1.5 * c[:, 2]) & (c[:, 0] < 1.7 * c[:, 1])),
        'repairs': [{'box': lambda x, y, z: y > 0.74, 'clean': 6, 'tol': 18}],
    },
    'rj': {
        'name': 'RJ',
        # User-supplied three views -> Meshy 7 multi-image-to-3d
        # 01a0fd6f-ced5-70cd-9c87-70012936fc1d, remesh 01a0fd72-6056-7647-81e2-dab44b689952.
        'scale': 1.1, 'smooth_normals': True,
        'texture_size': 2048, 'texture_subsampling': 0, 'texture_mipmaps': False,
        'texture_clamp': True,  # atlas islands touch its borders; never sample the opposite edge
        'bones': [
            ('root', None, (0, 0, 0)), ('hips', 'root', (0, 0.29, 0)),
            ('leg_l', 'hips', (0.13, 0.29, 0.04)), ('leg_r', 'hips', (-0.13, 0.29, 0.04)),
            ('chest', 'hips', (0, 0.65, 0)),
            ('arm_l', 'chest', (0.39, 0.84, 0)), ('hand_l', 'arm_l', (0.51, 0.56, 0.07)),
            ('arm_r', 'chest', (-0.39, 0.84, 0)), ('hand_r', 'arm_r', (-0.51, 0.56, 0.07)),
            ('head', 'chest', (0, 0.99, 0)),
            ('ear_l', 'head', (0.39, 1.77, -0.03)), ('ear_r', 'head', (-0.39, 1.77, -0.03)),
        ],
        'skin': {'leg': (0.23, 0.31), 'arm_x': (0.38, 0.45), 'arm_y': (0.45, 0.51),
                 'arm_top': (0.84, 0.92), 'head': (0.96, 1.03), 'chest': (0.31, 0.56),
                 'ear_y': (1.72, 1.79), 'ear_x': (0.34, 0.39)},
        'face': (1.15, 1.5),
        # Remove stray atlas colours on the cream surface, keeping facial features,
        # cheeks, the scarf and shoes (including a margin around their edges).
        'keep': lambda c: (c.max(1) < 170) | (np.ptp(c, axis=1) > 55),
        'repairs': [{'box': lambda x, y, z: y > 0.14, 'clean': 4, 'tol': 20}],
    },
    'chimmy': {
        'name': 'Chimmy',
        # Fan-made BT21 CHIMMY for the user's own testing. gpt-image-bridge three views (with the
        # figure photo attached as reference) -> Meshy 7 multi-image-to-3d
        # 01a0ff78-75f7-743d-9252-f589faba1a8d, remesh 01a0ff7e-b75b-7259-b0e5-f387a69db782.
        # The floppy ears hang beside the head and stick out past it, so the face-width standard
        # (which measures the widest point of the cheek band) would squash the head: keep its shape.
        'scale': 1.1, 'face_width': 0, 'smooth_normals': True,
        'texture_size': 2048, 'texture_subsampling': 0, 'texture_mipmaps': False,
        'bones': [
            ('root', None, (0, 0, 0)), ('hips', 'root', (0, 0.3, 0)),
            ('leg_l', 'hips', (0.17, 0.3, 0)), ('leg_r', 'hips', (-0.17, 0.3, 0)),
            ('chest', 'hips', (0, 0.55, 0)),
            ('arm_l', 'chest', (0.42, 0.66, 0)), ('hand_l', 'arm_l', (0.54, 0.42, 0.02)),
            ('arm_r', 'chest', (-0.42, 0.66, 0)), ('hand_r', 'arm_r', (-0.54, 0.42, 0.02)),
            ('head', 'chest', (0, 0.74, 0)),
            ('ear_l', 'head', (0.56, 1.6, 0)), ('ear_r', 'head', (-0.56, 1.6, 0)),
        ],
        'skin': {'leg': (0.2, 0.32), 'arm_x': (0.38, 0.45), 'arm_y': (0.3, 0.36),
                 'arm_top': (0.66, 0.74), 'head': (0.7, 0.8), 'chest': (0.32, 0.55),
                 'ear_y': (0.95, 1.1), 'ear_x': (0.58, 0.64)},
        'face': (0.95, 1.4),
        'repairs': [],
    },
    'bboogyuli': {
        'name': 'Bboogyuli',
        # Fan-made tangerine mascot for the user's own testing. gpt-image-bridge three views (with the
        # artwork attached as reference, tool removed from its hand) -> Meshy 7 multi-image-to-3d
        # 01a0ff8a-cd09-76f1-81ed-9b33207eb9c8, remesh 01a0ff8c-b0dc-7339-8d4c-cd1b09b86beb.
        # A round tangerine head on a small body: no cheek band to standardise, and no ears (the leaf
        # stem stays on the head bone; ear_y sits above the model so the ear bones take nothing).
        'scale': 1.1, 'face_width': 0, 'smooth_normals': True,
        'texture_size': 2048, 'texture_subsampling': 0, 'texture_mipmaps': False,
        'bones': [
            ('root', None, (0, 0, 0)), ('hips', 'root', (0, 0.22, 0)),
            ('leg_l', 'hips', (0.15, 0.22, 0)), ('leg_r', 'hips', (-0.15, 0.22, 0)),
            ('chest', 'hips', (0, 0.4, 0)),
            ('arm_l', 'chest', (0.33, 0.45, 0)), ('hand_l', 'arm_l', (0.48, 0.3, 0.03)),
            ('arm_r', 'chest', (-0.33, 0.45, 0)), ('hand_r', 'arm_r', (-0.48, 0.3, 0.03)),
            ('head', 'chest', (0, 0.55, 0)),
            ('ear_l', 'head', (0.3, 1.7, 0)), ('ear_r', 'head', (-0.3, 1.7, 0)),
        ],
        'skin': {'leg': (0.12, 0.22), 'arm_x': (0.32, 0.38), 'arm_y': (0.2, 0.25),
                 'arm_top': (0.46, 0.52), 'head': (0.5, 0.6), 'chest': (0.22, 0.4),
                 'ear_y': (2.0, 2.1), 'ear_x': (0.3, 0.4)},
        'face': (0.8, 1.3),
        'repairs': [],
    },
    'bamgeut': {
        'name': 'Bamgeut',
        # Fan-made fluffy cloud-headed bear for the user's own testing. gpt-image-bridge three views (the
        # artwork attached as reference, arms lowered to the cast's rest pose) -> Meshy 7
        # multi-image-to-3d 01a0ffce-9110-70c1-80f7-47c63237de42, remesh 01a0ffd0-b57e-748a-bdcf-151f9a5e34e9.
        # The little bear ears sit inside the cloud of fluff, so they stay on the head bone (ear_y above the
        # model): bending them would tear the puffs around them. face_width 0 keeps the cloud's shape.
        'scale': 1.1, 'face_width': 0, 'smooth_normals': True,
        'texture_size': 2048, 'texture_subsampling': 0, 'texture_mipmaps': False,
        'bones': [
            ('root', None, (0, 0, 0)), ('hips', 'root', (0, 0.2, 0)),
            ('leg_l', 'hips', (0.15, 0.2, 0)), ('leg_r', 'hips', (-0.15, 0.2, 0)),
            ('chest', 'hips', (0, 0.4, 0)),
            ('arm_l', 'chest', (0.36, 0.58, 0)), ('hand_l', 'arm_l', (0.5, 0.3, 0.03)),
            ('arm_r', 'chest', (-0.36, 0.58, 0)), ('hand_r', 'arm_r', (-0.5, 0.3, 0.03)),
            ('head', 'chest', (0, 0.65, 0)),
            ('ear_l', 'head', (0.42, 1.55, 0)), ('ear_r', 'head', (-0.42, 1.55, 0)),
        ],
        'skin': {'leg': (0.12, 0.22), 'arm_x': (0.33, 0.4), 'arm_y': (0.18, 0.24),
                 'arm_top': (0.56, 0.62), 'head': (0.6, 0.7), 'chest': (0.2, 0.4),
                 'ear_y': (2.0, 2.1), 'ear_x': (0.3, 0.4)},
        'face': (0.8, 1.3),
        'repairs': [],
    },
    'guest_b': {
        'name': 'GuestB',
        # the guests' standard chibi body: a plain earless cream animal in a grey tee, recoloured per
        # guest in the game (ears and hats come as accessories on the ear/head bones).
        # gpt-image-2 front/side/back views (made outside Meshy) -> multi-image-to-3d
        # 01a0fa74-7f42-7103-85de-52a46c30f563, remesh 01a0fa76-6525-70c1-9a69-7371c20488ce
        'scale': 1.1,
        'bones': [
            ('root', None, (0, 0, 0)), ('hips', 'root', (0, 0.3, 0)),
            ('leg_l', 'hips', (0.18, 0.3, 0)), ('leg_r', 'hips', (-0.18, 0.3, 0)),
            ('chest', 'hips', (0, 0.55, 0)),
            ('arm_l', 'chest', (0.42, 0.78, 0)), ('hand_l', 'arm_l', (0.54, 0.55, 0.05)),
            ('arm_r', 'chest', (-0.42, 0.78, 0)), ('hand_r', 'arm_r', (-0.54, 0.55, 0.05)),
            ('head', 'chest', (0, 0.88, 0)),
            # no ears on the mesh: the bones are where ear accessories hang (ear_y is above the head)
            ('ear_l', 'head', (0.38, 1.72, 0)), ('ear_r', 'head', (-0.38, 1.72, 0)),
        ],
        'skin': {'leg': (0.18, 0.32), 'arm_x': (0.4, 0.46), 'arm_y': (0.44, 0.5), 'arm_top': (0.78, 0.86),
                 'head': (0.84, 0.94), 'chest': (0.4, 0.55), 'ear_y': (2.0, 2.1), 'ear_x': (0.3, 0.4)},
        'face': (1.0, 1.35),
        'repairs': [],
    },
}
C = None   # the character being built (set by build)
BONES, BI = [], {}

# ------------------------------------------------------------------ read the Meshy GLB
def read_glb(path):
    f = Path(path).read_bytes()
    jlen = struct.unpack('<I', f[12:16])[0]
    j = json.loads(f[20:20 + jlen])
    blob = f[20 + jlen + 8:]

    def view(i):
        bv = j['bufferViews'][i]
        o = bv.get('byteOffset', 0)
        return blob[o:o + bv['byteLength']]

    def acc(i):
        a = j['accessors'][i]
        n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
        dt = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8}[a['componentType']]
        bv = j['bufferViews'][a['bufferView']]
        o = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
        arr = np.frombuffer(blob, dt, a['count'] * n, o)
        return arr.reshape(-1, n) if n > 1 else arr

    prim = j['meshes'][0]['primitives'][0]
    at = prim['attributes']
    mat = j['materials'][prim['material']]
    tex = j['textures'][mat['pbrMetallicRoughness']['baseColorTexture']['index']]
    img = Image.open(io.BytesIO(view(j['images'][tex['source']]['bufferView']))).convert('RGB')
    return (acc(at['POSITION']).astype(np.float32), acc(at['NORMAL']).astype(np.float32),
            acc(at['TEXCOORD_0']).astype(np.float32), acc(prim['indices']).astype(np.uint32), img)

# ------------------------------------------------------------------ repairs
def weld(P):
    """Map each vertex to one id per distinct position (UV seams split vertices in the GLB)."""
    _, ids = np.unique(np.round(P, 5), axis=0, return_inverse=True)
    return ids.reshape(-1)


def mesh_graph(P, IDX):
    """Welded ids, welded positions, triangles in welded ids and the (both-way) edge list."""
    ids = weld(P)
    n = ids.max() + 1
    W = np.zeros((n, 3), np.float64)
    np.add.at(W, ids, P)
    W /= np.bincount(ids, minlength=n)[:, None]
    tri = ids[IDX.reshape(-1, 3)]
    e = np.concatenate([tri[:, [0, 1]], tri[:, [1, 2]], tri[:, [2, 0]]])
    e = np.unique(np.sort(e, axis=1), axis=0)
    return ids, W, tri, np.concatenate([e[:, 0], e[:, 1]]), np.concatenate([e[:, 1], e[:, 0]])


def neighbour_mean(W, a, b, n):
    s = np.zeros((n,) + W.shape[1:])
    np.add.at(s, a, W[b])
    return s / np.bincount(a, minlength=n).reshape((-1,) + (1,) * (W.ndim - 1))


def repair_geometry(P, IDX):
    """Locally smooth each repair box (with a soft falloff), then recompute smooth normals."""
    ids, W, tri, a, b = mesh_graph(P, IDX)
    n = len(W)
    for r in C['repairs']:
        w = r['box'](*W.T).astype(np.float64)
        for _ in range(4): w = np.maximum(w, 0.6 * neighbour_mean(w, a, b, n))  # feather the edge
        for _ in range(r.get('smooth', 0)):
            W += (0.5 * w)[:, None] * (neighbour_mean(W, a, b, n) - W)
    fn = np.cross(W[tri[:, 1]] - W[tri[:, 0]], W[tri[:, 2]] - W[tri[:, 0]])  # area-weighted
    N = np.zeros_like(W)
    for c in range(3): np.add.at(N, tri[:, c], fn)
    N /= np.linalg.norm(N, axis=1, keepdims=True) + 1e-12
    return W[ids].astype(np.float32), N[ids].astype(np.float32)


def texel_triangles(UV, IDX, size, P=None):
    """Which triangle each texel belongs to (-1 = unused), by rasterising the UV layout. With P,
    also each texel's 3D position on the surface."""
    tri_of = np.full((size, size), -1, np.int64)
    pos = np.zeros((size, size, 3), np.float32) if P is not None else None
    tris = IDX.reshape(-1, 3)
    T = UV[IDX.reshape(-1, 3)] * size - 0.5          # texel centres sit at integer coords
    for t, (a, b, c) in enumerate(T):
        x0, y0 = np.floor(np.minimum(np.minimum(a, b), c)).astype(int)
        x1, y1 = np.ceil(np.maximum(np.maximum(a, b), c)).astype(int)
        x0, y0, x1, y1 = max(x0, 0), max(y0, 0), min(x1, size - 1), min(y1, size - 1)
        if x1 < x0 or y1 < y0: continue
        gx, gy = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
        den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(den) < 1e-12: continue
        l1 = ((b[1] - c[1]) * (gx - c[0]) + (c[0] - b[0]) * (gy - c[1])) / den
        l2 = ((c[1] - a[1]) * (gx - c[0]) + (a[0] - c[0]) * (gy - c[1])) / den
        inside = (l1 >= -0.02) & (l2 >= -0.02) & (1 - l1 - l2 >= -0.02)
        tri_of[gy[inside], gx[inside]] = t
        if pos is not None:
            A, B, Cc = P[tris[t]]
            w1, w2 = l1[inside, None], l2[inside, None]
            pos[gy[inside], gx[inside]] = w1 * A + w2 * B + (1 - w1 - w2) * Cc
    return (tri_of, pos) if P is not None else tri_of


def bleed_edits(a, changed, used, px=4):
    """Carry repainted texels a few pixels out into the unused gutter round their island, so
    mipmaps don't pull the old colour back in. The rest of the gutter keeps Meshy's own padding:
    refilling it from whatever island is nearest drags foreign colours (muzzle white, shirt purple)
    into the UV seams as grey hairlines."""
    src = changed.copy()
    for _ in range(px):
        for shift in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            take = ~used & ~src & np.roll(src, shift, (0, 1))
            a[take] = np.roll(a, shift, (0, 1))[take]
            src |= take
    return a


def paint_texture(img, P, UV, IDX):
    """Colour corrections and decals, done on the 3D surface (each texel knows where it sits).
    recolor: texels close in hue to `from` are shifted to `to`, keeping their light and shade
             (`where` limits it to a region: a function of x, y, z returning a 0/1 mask).
    decals:  a flat front-facing drawing projected onto the body (x, y), e.g. a chest print; the
             model's own (garbled) print inside `erase` is painted over with the cloth colour first."""
    size = img.size[0]
    a = np.asarray(img, np.float32).copy()
    tri_of, pos = texel_triangles(UV, IDX, size, P)
    used = tri_of >= 0
    out = a[used]
    xyz = pos[used]
    for r in C.get('recolor', []):
        src, dst = np.array(r['from'], np.float32), np.array(r['to'], np.float32)
        chroma = lambda c: c / (c.sum(-1, keepdims=True) + 1e-6)
        near = np.linalg.norm(chroma(out) - chroma(src), axis=1)
        w = 1 - smooth(r.get('tol', 0.05) * 0.5, r.get('tol', 0.05), near)
        if 'where' in r: w = w * r['where'](*xyz.T)               # only inside this region of the body
        bright = (out.sum(1) / src.sum())[:, None]                # keep the texel's light/shade
        out = out * (1 - w[:, None]) + (dst * bright) * w[:, None]
    for d in C.get('decals', []):
        x, y, z = xyz.T
        er = d['erase'](x, y, z)
        lum = out @ np.array([0.3, 0.59, 0.11])
        cloth = np.median(out[er & (lum > 140)], axis=0)
        out[er & (np.linalg.norm(out - cloth, axis=1) > 35)] = cloth   # the print and its soft edges
        (cx, cy), half = d['center'], d['half']
        art = d['draw']()                                        # RGBA, square, covers center ± half
        n = art.size[0]
        ux = ((x - cx) / half + 1) / 2 * (n - 1)
        uy = (1 - ((y - cy) / half + 1) / 2) * (n - 1)
        on = (z > d.get('front', 0.2)) & (ux >= 0) & (ux <= n - 1) & (uy >= 0) & (uy <= n - 1)
        rgba = np.asarray(art, np.float32)
        px = rgba[np.round(uy[on]).astype(int), np.round(ux[on]).astype(int)]
        al = px[:, 3:4] / 255
        out[on] = out[on] * (1 - al) + px[:, :3] * al
    changed = np.zeros(used.shape, bool)
    changed[used] = (np.abs(out - a[used]) > 0.5).any(1)
    a[used] = out
    return Image.fromarray(bleed_edits(a, changed, used).clip(0, 255).astype(np.uint8))


def draw_cup(color=(92, 54, 34), n=512):
    """Coffee-cup outline like the plush's embroidered chest print, on a transparent square."""
    from PIL import ImageDraw
    k = 4                                                    # supersample, then shrink (smooth lines)
    im = Image.new('RGBA', (n * k, n * k), (0, 0, 0, 0))
    g = ImageDraw.Draw(im)
    s = lambda u, v: (n * k * (u + 1) / 2, n * k * (1 - (v + 1) / 2))   # canvas coords from [-1, 1]
    w = int(n * k * 0.05)
    col = color + (255,)
    # coffee surface and rim
    g.ellipse([*s(-0.62, 0.42), *s(0.38, 0.12)], fill=(150, 98, 62, 255), outline=col, width=w)
    # body: straight sides into a round bottom
    g.line([s(-0.62, 0.27), s(-0.5, -0.3)], fill=col, width=w)
    g.line([s(0.38, 0.27), s(0.26, -0.3)], fill=col, width=w)
    g.arc([*s(-0.5, -0.05), *s(0.26, -0.55)], 0, 180, fill=col, width=w)
    # handle
    g.arc([*s(0.22, 0.22), *s(0.72, -0.25)], 270, 90, fill=col, width=w)
    return im.resize((n, n), Image.LANCZOS)


def repair_texture(img, P, UV, IDX):
    """Paint over the texture flaws. The atlas is cut into many small islands, so the work is done
    per triangle on the 3D surface rather than with image filters."""
    size = img.size[0]
    a = np.asarray(img, np.float32).copy()
    tri_of = texel_triangles(UV, IDX, size)
    used = tri_of >= 0
    t = tri_of[used]
    nt = len(IDX) // 3
    ids, W, tri, ea, eb = mesh_graph(P, IDX)
    centre = W[tri].mean(1)                                  # triangle centroids (source units)
    col = np.zeros((nt, 3)); cnt = np.zeros(nt)              # mean colour per triangle
    np.add.at(col, t, a[used]); np.add.at(cnt, t, 1)
    have = cnt > 0
    col[have] /= cnt[have, None]
    lum = lambda c: c @ np.array([0.3, 0.59, 0.11])
    # features to leave alone (and a margin round them), also kept out of the local colours
    keep = have & C['keep'](col) if 'keep' in C else np.zeros(nt, bool)
    for _ in range(2):
        near = np.zeros(len(W), bool)
        for c in range(3): near[tri[keep, c]] = True
        keep = near[tri].any(1)
    plain = have & ~keep
    vsum = np.zeros((len(W), 3)); vcnt = np.zeros((len(W), 1))
    for c in range(3):
        np.add.at(vsum, tri[:, c], col * plain[:, None]); np.add.at(vcnt, tri[:, c], plain[:, None])

    def local(passes):
        """Colour of the surroundings, averaged over `passes` rings of the mesh."""
        s, w = vsum, vcnt
        for _ in range(passes):
            s = 0.5 * s + 0.5 * neighbour_mean(s, ea, eb, len(W))
            w = 0.5 * w + 0.5 * neighbour_mean(w, ea, eb, len(W))
        v = s / np.maximum(w, 1e-6)
        return v[tri].mean(1)

    out = a[used].copy()
    for r in C['repairs']:
        inside = r['box'](*centre.T)[t]
        if r.get('clean'):  # crease marks (dark lines, grey smudges): texels far off the local colour
            # even out the base colour (a paler patch takes the wider surroundings' tone, the fine
            # texture stays), then replace whatever still stands out (lines, specks)
            around, near = local(r['clean'])[t], local(1)[t]
            fix = inside & ~keep[t]
            patch = fix & (np.linalg.norm(around - near, axis=1) > 6)  # only where the tone is off
            out[patch] += (around - near)[patch]
            off = fix & (np.linalg.norm(out - around, axis=1) > r['tol'])
            out[off] = around[off]
        if r.get('arm'):    # the paw colour, with only a whisper of the old shading
            paw = np.median(col[have & C['arm_tip'](*centre.T)], axis=0)
            shade = np.clip(lum(out[inside]) / max(lum(paw), 1), 0.94, 1.04)
            out[inside] = paw * shade[:, None]
    changed = np.zeros(used.shape, bool)
    changed[used] = (out != a[used]).any(1)
    a[used] = out
    return Image.fromarray(bleed_edits(a, changed, used).clip(0, 255).astype(np.uint8))


# ------------------------------------------------------------------ house standard
def standard_face(P, N):
    """Widen or narrow the head to FACE_WIDTH, fading in over the neck. Returns the new positions
    and normals and the warp itself (for the bone rest positions)."""
    fw = C.get('face_width', FACE_WIDTH)
    if not fw: return P, N, lambda Q: Q          # a body of its own shape keeps it
    y0, y1 = C['face']
    band = P[(P[:, 1] > y0) & (P[:, 1] < y1)]
    s = fw * P[:, 1].max() / (2 * np.abs(band[:, 0]).max())
    lo, hi = C['skin']['head']

    def factors(y):  # sideways s, front-to-back half as much, so the head stays round
        h = smooth(lo, hi, y)
        return 1 + (s - 1) * h, 1 + (s - 1) * h * 0.5

    def warp(Q):
        fx, fz = factors(Q[:, 1])
        return np.stack([Q[:, 0] * fx, Q[:, 1], Q[:, 2] * fz], 1).astype(np.float32)

    fx, fz = factors(P[:, 1])
    N = np.stack([N[:, 0] / fx, N[:, 1], N[:, 2] / fz], 1)    # normals take the inverse scale
    N /= np.linalg.norm(N, axis=1, keepdims=True)
    print(f'face width x{s:.3f}')
    return warp(P), N.astype(np.float32), warp


# ------------------------------------------------------------------ skinning
def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def skin_weights(P):
    """Soft region weights in source units. Returns joints (n,4) and weights (n,4)."""
    k = C['skin']
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    ax = np.abs(x)
    W = np.zeros((len(P), len(BONES)), np.float32)

    def side(w, bone):  # split a weight between the _l (+x) and _r bone
        W[:, BI[bone + '_l']] = w * (x > 0)
        W[:, BI[bone + '_r']] = w * (x <= 0)

    rem = np.ones(len(P), np.float32)
    if 'tail' in BI:   # behind the body (z), within the narrow tail (x) and its height band (y)
        y0, y1, y2, y3 = k['tail_y']
        tail = smooth(*k['tail_z'], z) * smooth(*k['tail_x'], ax) * smooth(y0, y1, y) * (1 - smooth(y2, y3, y))
        W[:, BI['tail']] = tail
        rem -= tail
    leg = rem * (1 - smooth(*k['leg'], y))
    left = smooth(-0.05, 0.05, x)
    W[:, BI['leg_l']] = leg * left
    W[:, BI['leg_r']] = leg * (1 - left)
    rem -= leg
    if 'wing_l' in BI:
        y0, y1, y2, y3 = k['wing_y']
        wing = rem * smooth(*k['wing_z'], z) * smooth(y0, y1, y) * (1 - smooth(y2, y3, y))
        side(wing, 'wing')
        rem -= wing
    arm = rem * smooth(*k['arm_x'], ax) * smooth(*k['arm_y'], y) * (1 - smooth(*k['arm_top'], y))
    if C.get('one_arm'): arm = arm * (x > 0)   # only the left (+x) arm has a hand
    side(arm, 'arm')
    rem -= arm
    head = rem * smooth(*k['head'], y)
    ear = head * smooth(*k['ear_y'], y) * smooth(*k['ear_x'], ax)
    side(ear, 'ear')
    W[:, BI['head']] = head - ear
    rem -= head
    chest = rem * smooth(*k['chest'], y)
    W[:, BI['chest']] = chest
    W[:, BI['hips']] = rem - chest
    # keep the 4 strongest influences per vertex
    idx = np.argsort(-W, axis=1)[:, :4]
    w = np.take_along_axis(W, idx, axis=1)
    w /= w.sum(axis=1, keepdims=True)
    return idx.astype(np.uint8), w.astype(np.float32)

# ------------------------------------------------------------------ animation
def quat(rx=0.0, ry=0.0, rz=0.0):
    """Euler XYZ (three.js default order) to quaternion [x, y, z, w]."""
    c1, c2, c3 = math.cos(rx / 2), math.cos(ry / 2), math.cos(rz / 2)
    s1, s2, s3 = math.sin(rx / 2), math.sin(ry / 2), math.sin(rz / 2)
    return [s1 * c2 * c3 + c1 * s2 * s3, c1 * s2 * c3 - s1 * c2 * s3,
            c1 * c2 * s3 + s1 * s2 * c3, c1 * c2 * c3 - s1 * s2 * s3]


TAU = math.pi * 2
S = lambda p, k=1, ph=0: math.sin(TAU * (k * p + ph))
BUMP = lambda p: math.sin(math.pi * p)  # 0 -> 1 -> 0 over a cycle


# Sign guide (front = +Z): rot x > 0 tips a bone forward (head nods, body bows), rot x < 0 swings a
# hanging arm/leg forward; rot z > 0 raises the left arm, rot z < 0 raises the right arm.
def arms(pose, lx=0.0, rx=0.0, lz=0.0, rz=0.0):
    pose['arm_l'] = (lx, 0, lz)
    pose['arm_r'] = (rx, 0, -rz)


def wings(pose, open_, flap=0.0, p=0.0, k=2):
    """Wing spread (rot y: the tips swing back and out) with an optional flutter."""
    a = open_ + flap * S(p, k)
    pose['wing_l'] = (0, a, 0)
    pose['wing_r'] = (0, -a, 0)


def tail(pose, p=0.0, sway=0.0, lift=0.0, k=1, ph=0.0):
    """Tail swing (rot y: sideways) and lift (rot x > 0 raises a tail that points backwards)."""
    pose['tail'] = (lift, sway * S(p, k, ph), 0)


def breathe(pose, p, k=1, amp=0.025):
    pose['chest@s'] = (1 + amp * S(p, k), 1 - amp * 0.6 * S(p, k), 1 + amp * S(p, k))


def idle(p):
    q = {'hips@p': (0, 0.012 * S(p), 0), 'head': (0.03 * S(p, 2), 0, 0.06 * S(p)),
         'ear_l': (0, 0, 0.08 * S(p, 2, 0.25)), 'ear_r': (0, 0, -0.08 * S(p, 2, 0.25))}
    arms(q, lz=0.06 + 0.05 * S(p), rz=0.06 + 0.05 * S(p, 1, 0.5))
    breathe(q, p)
    wings(q, 0.1, 0.08, p)
    tail(q, p, 0.3, 0.1)
    return q


def walk(p, carry=False):
    roll = (0.08 if carry else 0.14) * S(p)
    q = {'hips@p': (0, 0.045 * (1 - math.cos(2 * TAU * p)) / 2, 0), 'hips': (0, 0, roll),
         'leg_l': (-0.55 * S(p), 0, -roll), 'leg_r': (0.55 * S(p), 0, -roll),
         'head': (0.04, 0, -0.7 * roll), 'ear_l': (0, 0, 0.18 * S(p, 1, -0.15)), 'ear_r': (0, 0, 0.18 * S(p, 1, -0.15))}
    if carry: arms(q, lx=-1.25, rx=-1.25, lz=-0.15, rz=-0.15)
    else: arms(q, lx=0.5 * S(p), rx=-0.5 * S(p), lz=0.15, rz=0.15)
    wings(q, 0.2, 0.18, p)
    tail(q, p, 0.35, 0.2, 1, -0.1)
    return q


def hip_y():
    return dict(BONES_REST)['hips'][1]


def sit(p, legswing=0.0):
    # raise the hips so the bottom (a little under the hip joint) rests on the seat
    q = {'hips@p': (0, SEAT / C['scale'] - (hip_y() - 0.1), 0.05), 'leg_l': (-1.35 + legswing * S(p), 0, 0.05),
         'leg_r': (-1.35 - legswing * S(p), 0, -0.05), 'head': (0.02 * S(p), 0, 0.05 * S(p, 1, 0.3))}
    arms(q, lx=-0.35, rx=-0.35, lz=0.2, rz=0.2)
    breathe(q, p)
    tail(q, p, 0.18, 0.5)
    return q


def eat(p):
    q = sit(p)
    b = max(0.0, S(p)) ** 0.7
    arms(q, lx=-0.35, rx=-0.35 - 1.3 * b, lz=0.2, rz=0.2 - 0.5 * b)
    q['head'] = (0.08 * b + 0.04 * max(0, S(p, 4)), 0, 0)
    return q


def wait(p):
    q = sit(p, legswing=0.3)
    q['head'] = (0, 0.25 * S(p, 1, 0.25), 0.08 * S(p))
    return q


def work(p):  # cooking / arcade: busy alternating paws in front
    q = {'hips@p': (0, 0.02 * abs(S(p, 2)), 0), 'chest': (0.12, 0.08 * S(p), 0), 'head': (0.15, 0, 0.05 * S(p))}
    arms(q, lx=-1.0 - 0.35 * S(p, 2), rx=-1.0 + 0.35 * S(p, 2), lz=-0.1, rz=-0.1)
    breathe(q, p, 2, 0.02)
    tail(q, p, 0.3, 0.15, 2)
    return q


def shake(p):  # bartender shaking a drink above the shoulder
    q = {'hips@p': (0, 0.02 * abs(S(p, 3)), 0), 'chest': (0, 0, 0.06 * S(p, 3)), 'head': (-0.05, 0, -0.08 * S(p, 3))}
    arms(q, lx=-1.6 + 0.25 * S(p, 3), rx=-2.3 + 0.35 * S(p, 3), lz=0.0, rz=-0.3)
    return q


def talk(p):
    q = {'head': (0.05 * S(p, 2), 0, 0.12 * S(p)), 'chest': (0, 0.06 * S(p), 0), 'ear_l': (0, 0, 0.1 * S(p, 2)), 'ear_r': (0, 0, -0.1 * S(p, 2))}
    arms(q, lx=-0.3, rx=-0.2, lz=1.5 + 0.35 * S(p, 2), rz=0.15)
    breathe(q, p)
    wings(q, 0.12, 0.1, p)
    tail(q, p, 0.4, 0.2, 2)
    return q


def sweep(p):
    q = {'hips': (0, 0.15 * S(p), 0), 'chest': (0.25, 0.4 * S(p), 0), 'head': (0.1, -0.3 * S(p), 0)}
    arms(q, lx=-0.8 - 0.2 * S(p), rx=-0.9 + 0.2 * S(p), lz=-0.3, rz=-0.3)
    return q


def repair(p):  # wind the wrench up slowly, bang it down fast
    if p < 0.6:
        a = p / 0.6
        arm = -0.7 - 1.6 * a * a * (3 - 2 * a)
    else:
        arm = -2.3 + 1.6 * min(1.0, (p - 0.6) * 10)
    hit = max(0.0, 1 - abs(p - 0.7) * 7)
    q = {'chest': (0.15 + 0.15 * hit, 0, 0), 'hips@p': (0, -0.03 * hit, 0), 'head': (0.2 + 0.05 * hit, 0, 0)}
    arms(q, lx=-0.6, rx=arm)
    return q


def nap(p):
    q = {'hips@p': (0, -(hip_y() - 0.1), 0), 'leg_l': (-1.45, 0, 0.12), 'leg_r': (-1.45, 0, -0.12),
         'chest': (0.15, 0, 0), 'head': (0.32 + 0.03 * S(p), 0, 0.22),
         'ear_l': (0.1, 0, -0.1), 'ear_r': (0.1, 0, 0.1)}
    arms(q, lx=-0.4, rx=-0.4, lz=0.05, rz=0.05)
    breathe(q, p, 1, 0.04)
    return q


def cheer(p):
    hop = BUMP(p)
    land = max(0.0, 1 - abs(p - 0.0) * 8) + max(0.0, 1 - abs(p - 1.0) * 8)
    q = {'hips@p': (0, 0.3 * hop * hop, 0), 'leg_l': (-0.25 * hop, 0, 0.15 * hop), 'leg_r': (-0.25 * hop, 0, -0.15 * hop),
         'head': (-0.12, 0, 0.1 * S(p, 2)), 'ear_l': (0, 0, -0.3 * hop), 'ear_r': (0, 0, 0.3 * hop),
         'chest@s': (1 + 0.06 * land, 1 - 0.08 * land, 1 + 0.06 * land)}
    arms(q, lz=2.3 + 0.3 * S(p, 2), rz=2.3 + 0.3 * S(p, 2, 0.5))
    wings(q, 0.4, 0.35, p, 4)
    tail(q, p, 0.5, 0.5 + 0.3 * hop, 4)
    return q


def hit(p):
    e = BUMP(p)
    q = {'hips': (-0.3 * e, 0, 0), 'head': (-0.25 * e, 0, 0.1 * e), 'hips@p': (0, 0, -0.08 * e),
         'ear_l': (0, 0, -0.35 * e), 'ear_r': (0, 0, 0.35 * e),
         'chest@s': (1 + 0.05 * e, 1 - 0.07 * e, 1 + 0.05 * e)}
    arms(q, lx=-0.4 * e, rx=-0.4 * e, lz=0.9 * e, rz=0.9 * e)
    wings(q, 0.5 * e)
    tail(q, p, 0.0, 0.7 * e)
    return q


def pickup(p):
    e = BUMP(p) ** 0.8
    q = {'chest': (0.75 * e, 0, 0), 'head': (0.15 * e, 0, 0), 'hips@p': (0, -0.05 * e, -0.05 * e)}
    arms(q, lx=-0.9 * e, rx=-0.9 * e, lz=-0.1 * e, rz=-0.1 * e)
    return q


CLIPS = {  # name: (pose fn, seconds per loop)
    'Idle': (idle, 2.4), 'Walk': (walk, 0.48), 'Carry': (lambda p: walk(p, True), 0.48),
    'Sit': (sit, 3.0), 'Eat': (eat, 1.4), 'Wait': (wait, 2.2),
    'Work': (work, 0.9), 'Shake': (shake, 0.6), 'Talk': (talk, 1.4), 'Sweep': (sweep, 1.0),
    'Repair': (repair, 0.7), 'Nap': (nap, 3.2), 'Cheer': (cheer, 0.8), 'Hit': (hit, 0.6), 'Pickup': (pickup, 1.2),
}

# ------------------------------------------------------------------ glTF writer
class Bin:
    def __init__(self):
        self.data = bytearray()
        self.views, self.accs = [], []

    def add(self, arr, ctype, atype, target=None, minmax=False, normalized=False):
        while len(self.data) % 4: self.data.append(0)
        arr = np.ascontiguousarray(arr)
        view = {'buffer': 0, 'byteOffset': len(self.data), 'byteLength': arr.nbytes}
        if target: view['target'] = target
        self.data += arr.tobytes()
        self.views.append(view)
        a = {'bufferView': len(self.views) - 1, 'componentType': ctype, 'count': len(arr), 'type': atype}
        if normalized: a['normalized'] = True
        if minmax:
            m = arr.reshape(len(arr), -1)
            a['min'] = [float(v) for v in m.min(axis=0)]
            a['max'] = [float(v) for v in m.max(axis=0)]
        self.accs.append(a)
        return len(self.accs) - 1


def build(cid, src):
    global C, BONES, BI, BONES_REST
    C = CHARACTERS[cid]
    BONES = C['bones']
    BI = {b[0]: i for i, b in enumerate(BONES)}
    BONES_REST = [(n, p) for n, _, p in BONES]
    model, scale, tex_file = C['name'], C['scale'], f'{cid}_texture.jpg'

    P, N, UV, IDX, img = read_glb(src)
    # centre on x/z, feet on the floor
    P = P - np.array([(P[:, 0].min() + P[:, 0].max()) / 2, P[:, 1].min(), (P[:, 2].min() + P[:, 2].max()) / 2], np.float32)
    tex_size = C.get('texture_size', TEX_SIZE)
    img = img.resize((tex_size, tex_size), Image.LANCZOS)
    if C.get('recolor') or C.get('decals'):
        img = paint_texture(img, P, UV, IDX)
    if C['repairs']:
        img = repair_texture(img, P, UV, IDX)
        P, N = repair_geometry(P, IDX)
    elif C.get('smooth_normals'):
        P, N = repair_geometry(P, IDX)  # weld UV seams for shading, without changing the silhouette
    joints, weights = skin_weights(P)
    P, N, warp = standard_face(P, N)
    BONES = [(n, par, tuple(warp(np.array([pos], np.float32))[0])) for n, par, pos in BONES]
    P = P * scale
    b = Bin()
    pos = b.add(P, 5126, 'VEC3', 34962, minmax=True)
    nrm = b.add(N, 5126, 'VEC3', 34962)
    uv = b.add(UV, 5126, 'VEC2', 34962)
    jnt = b.add(joints, 5121, 'VEC4', 34962)
    wgt = b.add(weights, 5126, 'VEC4', 34962)
    ind = b.add(IDX.astype(np.uint16 if len(P) < 65536 else np.uint32), 5123 if len(P) < 65536 else 5125, 'SCALAR', 34963)

    world = {name: np.array(p, np.float32) * scale for name, _, p in BONES}
    nodes = []
    for name, parent, _ in BONES:
        local = world[name] - (world[parent] if parent else 0)
        nodes.append({'name': name, 'translation': [round(float(v), 5) for v in local]})
    for name, parent, _ in BONES:
        if parent: nodes[BI[parent]].setdefault('children', []).append(BI[name])
    ibm = np.zeros((len(BONES), 16), np.float32)
    for i, (name, _, _) in enumerate(BONES):
        m = np.eye(4, dtype=np.float32)
        m[:3, 3] = -world[name]
        ibm[i] = m.T.reshape(16)  # column-major
    ibm_acc = b.add(ibm, 5126, 'MAT4')

    mesh_node = len(nodes)
    nodes.append({'name': model + '_Body', 'mesh': 0, 'skin': 0})
    top = len(nodes)
    nodes.append({'name': model, 'children': [BI['root'], mesh_node]})

    animations = []
    for cname, (fn, T) in CLIPS.items():
        frames = max(2, round(T * FPS)) + 1
        times = np.linspace(0, T, frames).astype(np.float32)
        poses = [fn(i / (frames - 1)) for i in range(frames)]
        tin = b.add(times, 5126, 'SCALAR', minmax=True)
        samplers, channels = [], []
        keys = sorted({k for q in poses for k in q if k.partition('@')[0] in BI})
        for k in keys:
            bone, _, kind = k.partition('@')
            if kind == 'p':
                rest = world[bone] - world[BONES[BI[bone]][1]]
                out = np.array([rest + np.array(q.get(k, (0, 0, 0)), np.float32) * scale for q in poses], np.float32)
                path = 'translation'
            elif kind == 's':
                out = np.array([q.get(k, (1, 1, 1)) for q in poses], np.float32)
                path = 'scale'
            else:
                out = np.array([quat(*q.get(k, (0, 0, 0))) for q in poses], np.float32)
                path = 'rotation'
            samplers.append({'input': tin, 'output': b.add(out, 5126, 'VEC4' if path == 'rotation' else 'VEC3'), 'interpolation': 'LINEAR'})
            channels.append({'sampler': len(samplers) - 1, 'target': {'node': BI[bone], 'path': path}})
        animations.append({'name': cname, 'samplers': samplers, 'channels': channels})

    OUT.mkdir(parents=True, exist_ok=True)
    img.save(OUT / tex_file, quality=90, optimize=True, subsampling=C.get('texture_subsampling', 2))
    (OUT / f'{model}.bin').write_bytes(bytes(b.data))
    gltf = {
        'asset': {'version': '2.0', 'generator': 'tools/build_character.py'},
        'scene': 0, 'scenes': [{'nodes': [top]}], 'nodes': nodes,
        'meshes': [{'name': model, 'primitives': [{'attributes': {'POSITION': pos, 'NORMAL': nrm, 'TEXCOORD_0': uv, 'JOINTS_0': jnt, 'WEIGHTS_0': wgt}, 'indices': ind, 'material': 0}]}],
        'skins': [{'joints': list(range(len(BONES))), 'inverseBindMatrices': ibm_acc, 'skeleton': BI['root']}],
        # a soft vinyl sheen like the KayKit cast, plus a little self-glow so the face doesn't sink
        # into shade when the sun is behind the character
        'materials': [{'name': model, 'doubleSided': True,
                       'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}, 'metallicFactor': 0, 'roughnessFactor': ROUGHNESS},
                       'emissiveTexture': {'index': 0}, 'emissiveFactor': [GLOW] * 3}],
        'textures': [{'source': 0, 'sampler': 0}],
        'samplers': [{'magFilter': 9729, 'minFilter': 9987 if C.get('texture_mipmaps', True) else 9729,
                      **({'wrapS': 33071, 'wrapT': 33071} if C.get('texture_clamp') else {})}],
        'images': [{'uri': tex_file}],
        'animations': animations,
        'buffers': [{'uri': f'{model}.bin', 'byteLength': len(b.data)}],
        'bufferViews': b.views, 'accessors': b.accs,
    }
    (OUT / f'{model}.gltf').write_text(json.dumps(gltf, separators=(',', ':')))
    for f in (f'{model}.gltf', f'{model}.bin', tex_file):
        print(f'{f}: {(OUT / f).stat().st_size / 1024:.0f} KB')


if __name__ == '__main__':
    if len(sys.argv) != 3 or sys.argv[1] not in CHARACTERS: sys.exit(__doc__ + '\ncharacters: ' + ', '.join(CHARACTERS))
    build(sys.argv[1], sys.argv[2])
