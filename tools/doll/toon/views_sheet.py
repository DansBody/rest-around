# -*- coding: utf-8 -*-
"""Lay views.py's front / side / back renders out like design/paper_doll/turnaround_v1.png: grey ground,
guide lines, labels under each view. usage: python views_sheet.py DIR  ->  DIR/blockout_sheet.png"""
import os, sys
from PIL import Image, ImageDraw, ImageFont

d = sys.argv[1]
views = [Image.open(os.path.join(d, n + ".png")).convert("RGBA") for n in ("front", "side", "back")]
w, h = views[0].size
pad, label = 40, 70
sheet = Image.new("RGB", (w * 3 + pad * 2, h + label + pad), (163, 163, 166))
dr = ImageDraw.Draw(sheet)
ground = pad + h - int(h * 0.15 / 4.6)          # feet line (views.py puts z=0 at 0.15 units above the bottom)
dr.line((20, ground, sheet.width - 20, ground), fill=(110, 110, 114), width=3)
try:
    font = ImageFont.truetype("arial.ttf", 30)
except OSError:
    font = ImageFont.load_default()
for i, (im, name) in enumerate(zip(views, ("FRONT", "SIDE", "BACK"))):
    x = pad + i * w
    sheet.paste(im, (x, pad), im)
    tw = dr.textlength(name, font=font)
    dr.text((x + (w - tw) / 2, pad + h + 18), name, fill=(60, 62, 70), font=font)
sheet.save(os.path.join(d, "blockout_sheet.png"))
print(os.path.join(d, "blockout_sheet.png"))
