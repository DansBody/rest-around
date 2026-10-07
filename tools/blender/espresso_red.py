"""The café's two-group espresso machine (red, plus the stainless recolour), modelled from code to replace the Meshy one,
after the reference sheet design/espresso_red/concept_sheet.png (gpt-image-bridge, from a render of the old model).
    blender -b --factory-startup -t 2 --python tools/blender/espresso_red.py -- <out_dir>
Writes espresso_machine.gltf and espresso_machine_silver.gltf (+ .bin) at the old model's size (about 1.13 wide,
1.3 tall), so the stations and their manifest `steam` points keep working. Front = Blender -Y (glTF +Z).
Proportions are read off the sheet's front view: 1 px there = S units here.
"""
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import Kit, T, RX, RY
from mathutils import Vector

out = sys.argv[sys.argv.index('--') + 1]
S = 0.00233
z = lambda py: (790 - py) * S          # sheet pixel row -> height
x = lambda px: (px - 297.5) * S        # sheet pixel column -> across

k = Kit({
    'body': '#d0261b', 'metal': '#c7cbcf', 'metal_dark': '#8f969c', 'black': '#1e1e22', 'bay': '#28282d',
    'porcelain': '#f6f1e8', 'dial': '#bcc1c6', 'dial_rim': '#e6e8ea', 'needle': '#e8503a', 'light': '#fbfbf7',
})

W, FRONT, BACK = 0.565, -0.36, 0.40       # half width, front and back faces of the body
TOP = z(310)                              # top of the red body (1.12)
BAY_TOP, BASE_TOP = z(487), 0.175         # the brewing bay runs between the base band and the upper body

# ---- base: black plinth, red band, the silver drip tray sticking out in front
k.box((0, 0.0, 0.035), (2 * W - 0.06, BACK - FRONT + 0.0, 0.07), 'black', bevel=0.02)
k.box((0, -0.02, (0.07 + BASE_TOP) / 2), (2 * W, BACK - FRONT + 0.09, BASE_TOP - 0.07), 'body', bevel=0.035, segs=3)
TRAY_TOP = z(635)
k.box((0, -0.29, (BASE_TOP + TRAY_TOP) / 2), (2 * W - 0.04, 0.32, TRAY_TOP - BASE_TOP), 'metal', bevel=0.03, segs=3)
for i in range(4):   # four dark slots in the middle of the tray top
    k.box((-0.21 + 0.14 * i, -0.3, TRAY_TOP - 0.004), (0.11, 0.13, 0.02), 'black', bevel=0.012)
for sx in (-1, 1):   # ribbed ends
    for j in range(4):
        k.box((sx * 0.43, -0.37 + 0.045 * j, TRAY_TOP + 0.002), (0.14, 0.018, 0.012), 'metal_dark', bevel=0.005)

# ---- the body: ONE rounded red block with the brewing bay cut out of its front (no seam between parts), and a
# dark lining on the bay's back wall, ceiling and sides
PIL, BAY_BACK = 0.086, -0.09
B0 = BASE_TOP - 0.02
k.carved_box((0, (FRONT + BACK) / 2, (B0 + TOP) / 2), (2 * W, BACK - FRONT, TOP - B0), 'body', bevel=0.07,
             cuts=[((0, (FRONT - 0.1 + BAY_BACK) / 2, (BASE_TOP + BAY_TOP) / 2 - 0.05),
                    (2 * (W - PIL), BAY_BACK - FRONT + 0.1, BAY_TOP - BASE_TOP + 0.1), 0.03)], segs=4)
IN = 0.004
bw, bh = 2 * (W - PIL) - 2 * IN, BAY_TOP - BASE_TOP
k.box((0, BAY_BACK - IN / 2, BASE_TOP + bh / 2), (bw, 0.006, bh), 'bay')                       # back wall
k.box((0, (FRONT + BAY_BACK) / 2, BAY_TOP - IN), (bw, BAY_BACK - FRONT, 0.006), 'bay')          # ceiling
for sx in (-1, 1):
    k.box((sx * (W - PIL - IN), (FRONT + BAY_BACK) / 2 + 0.01, BASE_TOP + bh / 2), (0.006, BAY_BACK - FRONT - 0.02, bh), 'bay')

# ---- the "eyes": two dials (grey ring, light rim, black pupil, a red mark) and the little light between them
DZ = z(412)
face = lambda xx, zz: T(xx, FRONT, zz) @ RX(90)    # local +Z points out of the front
for dx in (x(178), -x(178)):
    k.lathe([(0.1, 0.0), (0.102, 0.012), (0.097, 0.03), (0.088, 0.036), (0.06, 0.036)], 'dial_rim', face(dx, DZ), seg=36)
    k.lathe([(0.06, 0.036), (0.05, 0.04)], 'dial', face(dx, DZ), seg=36)
    k.lathe([(0.05, 0.03), (0.05, 0.05), (0.04, 0.062), (0.02, 0.068), (0, 0.069)], 'black', face(dx, DZ), seg=28)
    k.box((dx, FRONT - 0.069, DZ + 0.03), (0.01, 0.006, 0.022), 'needle')
k.ball((x(293), FRONT - 0.012, z(405)), 0.019, 'light', seg=12, rings=8)

# ---- cup warmer on top: black tray, two rows of three white cups with handles
k.box((0, 0.02, TOP + 0.024), (2 * (W - 0.06), 0.7, 0.048), 'black', bevel=0.015)
k.box((0, 0.02, TOP + 0.05), (2 * (W - 0.08), 0.66, 0.006), 'metal_dark')
CUP_Z, CUP_R, CUP_H = TOP + 0.053, 0.1, 0.13
for row, cy in enumerate((-0.15, 0.17)):
    for cx in (-0.3, 0.0, 0.3):
        cx += 0.02 if row else 0
        M = T(cx, cy, CUP_Z)
        k.lathe([(0, 0), (CUP_R * 0.72, 0), (CUP_R * 0.8, 0.01), (CUP_R * 0.95, CUP_H * 0.55), (CUP_R, CUP_H), (CUP_R * 0.9, CUP_H),
                 (CUP_R * 0.86, CUP_H * 0.6), (0, CUP_H * 0.5)], 'porcelain', M, seg=24)
        k.tube([Vector((cx + CUP_R * 0.9 + 0.035 * math.sin(math.pi * t / 6), cy, CUP_Z + CUP_H * 0.3 + 0.04 * (1 - math.cos(math.pi * t / 6))))
                for t in range(7)], 0.013, 'porcelain', sides=8)

# ---- two group heads, each with a black portafilter, a handle reaching out and two little spouts
GY = -0.2
for gx in (-0.26, 0.26):
    k.lathe([(0.13, BAY_TOP + 0.01), (0.13, BAY_TOP - 0.02), (0.12, BAY_TOP - 0.035), (0.1, BAY_TOP - 0.06),
             (0.085, BAY_TOP - 0.1), (0.082, BAY_TOP - 0.115)], 'metal', T(gx, GY, 0), seg=28)
    PB = BAY_TOP - 0.115
    k.lathe([(0.084, PB), (0.084, PB - 0.04), (0.07, PB - 0.055), (0, PB - 0.056)], 'black', T(gx, GY, 0), seg=24)
    for sx in (-0.025, 0.025):
        k.lathe([(0.016, PB - 0.05), (0.012, PB - 0.09), (0, PB - 0.09)], 'metal', T(gx + sx, GY, 0), seg=10)
    hz = PB - 0.025
    k.tube([Vector((gx, GY - 0.07, hz)), Vector((gx, GY - 0.2, hz - 0.03)), Vector((gx, GY - 0.3, hz - 0.07))],
           lambda i: (0.022, 0.03, 0.032)[i], 'black', sides=12)
    k.ball((gx, GY - 0.31, hz - 0.075), 0.038, 'black', seg=12, rings=8)

# ---- steam wand in the right of the bay, with its knob on the right side
k.tube([Vector((0.43, GY - 0.02, BAY_TOP + 0.02)), Vector((0.43, GY - 0.05, BAY_TOP - 0.05)), Vector((0.44, GY - 0.09, BAY_TOP - 0.1)),
        Vector((0.45, GY - 0.11, BAY_TOP - 0.18)), Vector((0.45, GY - 0.11, 0.47))], 0.017, 'metal', sides=10)
k.lathe([(0.022, 0), (0.022, -0.06), (0.016, -0.07), (0, -0.07)], 'black', T(0.45, GY - 0.11, 0.47), seg=12)
side = lambda yy, zz: T(W, yy, zz) @ RY(90)          # local +Z points out of the right side
k.lathe([(0.055, 0), (0.055, 0.02), (0.045, 0.028), (0, 0.028)], 'metal', side(-0.22, z(390)), seg=24)
k.lathe([(0.03, 0.028), (0.032, 0.06), (0.026, 0.075), (0, 0.078)], 'black', side(-0.22, z(390)), seg=16)
# vent on the right side panel: a dark plate with four slits
k.box((W + 0.004, 0.15, z(415)), (0.012, 0.22, 0.19), 'black', bevel=0.02)
for j in range(4):
    k.box((W + 0.01, 0.075 + 0.05 * j, z(415)), (0.008, 0.022, 0.14), 'bay', bevel=0.008)

k.finish('espresso_machine', out, max_tris=12000, max_bytes=1_000_000,
         variants={'espresso_machine_silver': {'body': '#cfd4d8', 'metal': '#9ea5ab', 'metal_dark': '#7c838a'}},
         previews=[('front.png', (0, 0, 0.65), -25, 15, 3.6), ('side.png', (0, 0, 0.65), 70, 12, 3.6)])
print('[espresso_machine] done')
