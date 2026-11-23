#!/usr/bin/env python3
"""Makes the sample whiteboard photo for the 08-upload-any-play clip (2026-11-22).

A believable phone photo of a whiteboard with three 5-on-5 flag plays drawn in marker (Smash, Mesh, Stick): player circles
with letters, routes with arrowheads, a line of scrimmage and a title over each play, a marker tray with markers and an
eraser, ghosts of erased marks, a little glare, a slight tilt and a soft vignette. Sample drawings only: no real people,
schools or logos. Output: /tmp/home-clips/08/Whiteboard plays.jpg (3200x1800) and the box of each play as fractions of the
photo (printed as JSON; the recorder uses the same numbers for its stand-in Play reader).

    python3 scripts/home-clips/rec/08-whiteboard.py
"""
import json
import math
import os
import random

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter

W, H = 3200, 1800
PAD = 220  # the scene is drawn on a larger canvas, tilted, then cropped to W x H
CW, CH = W + 2 * PAD, H + 2 * PAD
SS = 2  # ink is drawn at 2x and brought down
random.seed(8)
np.random.seed(8)

OUT_DIR = "/tmp/home-clips/08"
os.makedirs(OUT_DIR, exist_ok=True)

# ---------------------------------------------------------------- geometry of the board (in canvas pixels)
FRAME = 36
BX0, BY0, BX1, BY1 = PAD + 90, PAD + 100, PAD + W - 90, PAD + H - 230  # outer edge of the frame
SX0, SY0, SX1, SY1 = BX0 + FRAME, BY0 + FRAME, BX1 - FRAME, BY1 - FRAME  # the white surface

# three panels across the surface
PANEL_W = 0.285 * W
PANEL_H = 0.66 * H
PANEL_Y = PAD + 0.135 * H
PANEL_X = [PAD + 0.052 * W, PAD + 0.357 * W, PAD + 0.662 * W]


def panel_xy(i, fx, fy):
    return PANEL_X[i] + fx * PANEL_W, PANEL_Y + fy * PANEL_H


# ---------------------------------------------------------------- hand-drawn letters (unit box, y down)
def arc(cx, cy, rx, ry, a0, a1, n=18):
    return [(cx + rx * math.cos(math.radians(a0 + (a1 - a0) * k / n)), cy + ry * math.sin(math.radians(a0 + (a1 - a0) * k / n))) for k in range(n + 1)]


GLYPHS = {
    "X": [[(0.05, 0.0), (0.95, 1.0)], [(0.95, 0.0), (0.05, 1.0)]],
    "Y": [[(0.05, 0.0), (0.5, 0.5)], [(0.95, 0.0), (0.5, 0.5), (0.5, 1.0)]],
    "Z": [[(0.08, 0.02), (0.92, 0.02), (0.08, 0.98), (0.94, 0.98)]],
    "C": [arc(0.55, 0.5, 0.52, 0.5, 40, 320)],
    "Q": [arc(0.5, 0.5, 0.5, 0.5, 0, 360), [(0.6, 0.65), (0.98, 1.05)]],
    "S": [[(0.9, 0.14), (0.7, 0.02), (0.38, 0.0), (0.12, 0.14), (0.14, 0.34), (0.45, 0.48), (0.8, 0.62), (0.9, 0.82), (0.66, 0.98), (0.3, 1.0), (0.08, 0.86)]],
    "M": [[(0.0, 1.0), (0.05, 0.0), (0.5, 0.65), (0.95, 0.0), (1.0, 1.0)]],
    "A": [[(0.0, 1.0), (0.5, 0.0), (1.0, 1.0)], [(0.2, 0.65), (0.8, 0.65)]],
    "H": [[(0.05, 0.0), (0.05, 1.0)], [(0.95, 0.0), (0.95, 1.0)], [(0.05, 0.5), (0.95, 0.5)]],
    "E": [[(0.95, 0.02), (0.05, 0.02), (0.05, 0.98), (0.95, 0.98)], [(0.05, 0.5), (0.8, 0.5)]],
    "T": [[(0.0, 0.02), (1.0, 0.02)], [(0.5, 0.02), (0.5, 1.0)]],
    "I": [[(0.5, 0.0), (0.5, 1.0)]],
    "K": [[(0.1, 0.0), (0.1, 1.0)], [(0.95, 0.0), (0.1, 0.58)], [(0.35, 0.45), (0.98, 1.0)]],
}
WIDTH_OF = {"M": 1.15, "A": 1.0, "I": 0.2, "T": 0.9}


def jitter(points, amp, seed):
    """Makes a polyline look drawn by hand: a slow wobble along the stroke and a little noise."""
    rnd = random.Random(seed)
    out = []
    p1, p2, p3 = rnd.uniform(0, 6.28), rnd.uniform(0, 6.28), rnd.uniform(18, 40)
    for k, (x, y) in enumerate(points):
        out.append((x + amp * (math.sin(k / 6.0 + p1) * 0.8 + rnd.uniform(-0.5, 0.5)), y + amp * (math.cos(k / 7.0 + p2) * 0.8 + rnd.uniform(-0.5, 0.5))))
    return out


def resample(points, step=3.0):
    out = [points[0]]
    for (x0, y0), (x1, y1) in zip(points, points[1:]):
        d = math.hypot(x1 - x0, y1 - y0)
        n = max(1, int(d / step))
        for k in range(1, n + 1):
            out.append((x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n))
    return out


def smooth(points, passes=2):
    pts = points
    for _ in range(passes):
        nxt = [pts[0]]
        for a, b in zip(pts, pts[1:]):
            nxt.append((0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]))
            nxt.append((0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]))
        nxt.append(pts[-1])
        pts = nxt
    return pts


# ---------------------------------------------------------------- the ink layer
ink = Image.new("RGBA", (CW * SS, CH * SS), (0, 0, 0, 0))
idraw = ImageDraw.Draw(ink)
INK = {"black": (24, 26, 30), "blue": (28, 74, 168), "red": (196, 44, 44), "green": (24, 130, 70)}


def stroke(points, color, width, seed=0, wobble=2.2, dash=None):
    pts = [(x * SS, y * SS) for x, y in points]
    pts = resample(pts, 4 * SS)
    pts = jitter(pts, wobble * SS, seed)
    pts = smooth(pts, 1)
    r = width * SS / 2
    col = INK[color] + (255,)
    k = 0
    for (x, y) in pts:
        if dash and (k // dash[0]) % 2 == 1:
            k += 1
            continue
        idraw.ellipse([x - r, y - r, x + r, y + r], fill=col)
        k += 1


def arrow_head(tip, frm, color, size=46, width=10, seed=0):
    size = min(size, 0.7 * math.hypot(tip[0] - frm[0], tip[1] - frm[1]))
    ang = math.atan2(tip[1] - frm[1], tip[0] - frm[0])
    for s, off in ((1, 0.5), (2, -0.5)):
        a = ang + math.pi + off + random.Random(seed + s).uniform(-0.08, 0.08)
        end = (tip[0] + size * math.cos(a), tip[1] + size * math.sin(a))
        stroke([tip, end], color, width, seed + s, wobble=0.8)


def draw_glyph(ch, x, y, h, color, seed, width=9):
    w = h * 0.62 * WIDTH_OF.get(ch, 1.0)
    for j, g in enumerate(GLYPHS[ch]):
        pts = [(x + gx * w, y + gy * h) for gx, gy in g]
        stroke(pts, color, width, seed + j, wobble=1.4)
    return w


def draw_word(word, x, y, h, color, seed, gap=0.22, width=10):
    for i, ch in enumerate(word):
        x += draw_glyph(ch, x, y, h, color, seed + i * 7, width) + h * gap
    return x


def word_width(word, h, gap=0.22):
    return sum(h * 0.62 * WIDTH_OF.get(c, 1.0) + h * gap for c in word) - h * gap


def player(i, fx, fy, letter, seed):
    cx, cy = panel_xy(i, fx, fy)
    r = 0.056 * PANEL_W
    circle = arc(cx, cy, r, r * 0.97, -90 + random.Random(seed).uniform(-20, 20), 270 + random.Random(seed).uniform(-4, 14), 40)
    stroke(circle, "black", 10, seed, wobble=1.8)
    h = r * 1.05
    w = h * 0.62 * WIDTH_OF.get(letter, 1.0)
    draw_glyph(letter, cx - w / 2, cy - h / 2, h, "black", seed + 3, width=8)
    return cx, cy, r


def route(i, pts, color, seed):
    xy = [panel_xy(i, fx, fy) for fx, fy in pts]
    stroke(xy, color, 10, seed, wobble=2.6)
    arrow_head(xy[-1], xy[-2], color, seed=seed)


# the three plays: board positions (fractions of the play's box) and each player's line
PLAYS = [
    {
        "title": "SMASH",
        "routes": {
            "X": ("red", [(0.14, 0.545), (0.14, 0.12)]),
            "Y": ("green", [(0.70, 0.595), (0.70, 0.38), (0.90, 0.28)]),
            "Z": ("blue", [(0.86, 0.545), (0.86, 0.38), (0.79, 0.45)]),
        },
    },
    {
        "title": "MESH",
        "routes": {
            "X": ("red", [(0.14, 0.545), (0.14, 0.5), (0.62, 0.465)]),
            "Y": ("green", [(0.70, 0.595), (0.70, 0.55), (0.30, 0.52)]),
            "Z": ("blue", [(0.86, 0.545), (0.86, 0.3), (0.95, 0.2)]),
        },
    },
    {
        "title": "STICK",
        "routes": {
            "X": ("red", [(0.14, 0.545), (0.14, 0.3), (0.34, 0.18)]),
            "Y": ("green", [(0.70, 0.595), (0.70, 0.36), (0.63, 0.43)]),
            "Z": ("blue", [(0.86, 0.545), (0.97, 0.5)]),
        },
    },
]
SPOTS = {"X": (0.14, 0.60), "C": (0.50, 0.60), "Y": (0.70, 0.65), "Z": (0.86, 0.60), "Q": (0.50, 0.77)}

for i, play in enumerate(PLAYS):
    s = 100 * (i + 1)
    # title, underlined
    th = 0.075 * PANEL_H
    tw = word_width(play["title"], th)
    tx = PANEL_X[i] + PANEL_W / 2 - tw / 2
    ty = PANEL_Y + 0.02 * PANEL_H
    draw_word(play["title"], tx, ty, th, "black", s, width=11)
    stroke([(tx - 10, ty + th + 26), (tx + tw * 0.5, ty + th + 22), (tx + tw + 14, ty + th + 28)], "black", 8, s + 5, wobble=2.0)
    # line of scrimmage
    lx0, ly = panel_xy(i, 0.04, 0.555)
    lx1, _ = panel_xy(i, 0.96, 0.555)
    stroke([(lx0, ly), ((lx0 + lx1) / 2, ly - 3), (lx1, ly + 2)], "black", 9, s + 9, wobble=2.4)
    # routes first, then the circles over them
    for letter, (color, pts) in play["routes"].items():
        route(i, pts, color, s + ord(letter))
    for letter, (fx, fy) in SPOTS.items():
        player(i, fx, fy, letter, s + ord(letter) * 3)

# panel dividers: two long marker lines
for i in (1, 2):
    x = PANEL_X[i] - 0.0235 * W
    stroke([(x, PANEL_Y + 0.04 * PANEL_H), (x + 6, PANEL_Y + 0.5 * PANEL_H), (x - 4, PANEL_Y + 0.98 * PANEL_H)], "black", 5, 77 + i, wobble=3.0, dash=(22, 11))

ink = ink.resize((CW, CH), Image.LANCZOS)

# ---------------------------------------------------------------- the board, the wall and the tray
def gradient(size, c0, c1, vertical=True):
    w, h = size
    t = np.linspace(0, 1, h if vertical else w)[:, None] if vertical else np.linspace(0, 1, w)[None, :]
    arr = np.zeros((h, w, 3), np.float32)
    for k in range(3):
        arr[..., k] = c0[k] + (c1[k] - c0[k]) * t
    return Image.fromarray(arr.clip(0, 255).astype(np.uint8))


scene = gradient((CW, CH), (203, 199, 190), (176, 172, 164))
noise = Image.fromarray((np.random.normal(128, 9, (CH, CW))).clip(0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2.2))
scene = ImageChops.blend(scene, Image.merge("RGB", [noise] * 3), 0.07)
sd = ImageDraw.Draw(scene)

# aluminium frame (light from the top left)
frame = gradient((BX1 - BX0, BY1 - BY0), (214, 216, 218), (150, 154, 158))
scene.paste(frame, (BX0, BY0))
sd.rectangle([BX0, BY0, BX1, BY1], outline=(120, 124, 128), width=3)
sd.rectangle([SX0 - 4, SY0 - 4, SX1 + 4, SY1 + 4], fill=(132, 136, 140))

# the white surface, lit unevenly
sw, sh = SX1 - SX0, SY1 - SY0
yy, xx = np.mgrid[0:sh, 0:sw].astype(np.float32)
light = 1.05 - 0.13 * (xx / sw) - 0.10 * (yy / sh)
light += 0.05 * np.exp(-(((xx - sw * 0.2) / (sw * 0.35)) ** 2 + ((yy - sh * 0.15) / (sh * 0.4)) ** 2))
surface = np.zeros((sh, sw, 3), np.float32)
base = np.array([242, 245, 244], np.float32)
for k in range(3):
    surface[..., k] = base[k] * light
surface += np.random.normal(0, 1.8, (sh, sw, 1))
surf = Image.fromarray(surface.clip(0, 255).astype(np.uint8))

# ghosts of erased marker and a few smears
ghost = Image.new("RGBA", (sw, sh), (0, 0, 0, 0))
gd = ImageDraw.Draw(ghost)
rnd = random.Random(5)
for _ in range(34):
    x, y = rnd.uniform(0, sw), rnd.uniform(0, sh)
    ang = rnd.uniform(-0.3, 0.3) + (math.pi / 2 if rnd.random() < 0.35 else 0)
    length = rnd.uniform(150, 620)
    col = rnd.choice([(80, 100, 150), (150, 80, 80), (90, 100, 100), (70, 70, 80)])
    gd.line([(x, y), (x + length * math.cos(ang), y + length * math.sin(ang))], fill=col + (rnd.randint(8, 22),), width=rnd.randint(8, 22))
for _ in range(10):
    x, y = rnd.uniform(0, sw), rnd.uniform(0, sh)
    gd.ellipse([x, y, x + rnd.uniform(160, 460), y + rnd.uniform(60, 150)], fill=(110, 118, 126, rnd.randint(8, 18)))
ghost = ghost.filter(ImageFilter.GaussianBlur(7))
surf = Image.alpha_composite(surf.convert("RGBA"), ghost).convert("RGB")
scene.paste(surf, (SX0, SY0))

# frame shadow on the surface (top and left edges)
shadow = Image.new("L", (sw, sh), 0)
shd = ImageDraw.Draw(shadow)
shd.rectangle([0, 0, sw, 26], fill=60)
shd.rectangle([0, 0, 22, sh], fill=44)
shadow = shadow.filter(ImageFilter.GaussianBlur(14))
dark = Image.new("RGB", (sw, sh), (70, 74, 80))
region = scene.crop((SX0, SY0, SX1, SY1))
region = Image.composite(dark, region, shadow.point(lambda v: int(v * 0.55)))
scene.paste(region, (SX0, SY0))

# marker tray
TY0, TY1 = BY1, BY1 + 78
tray = gradient((BX1 - BX0 - 120, TY1 - TY0), (190, 194, 198), (120, 124, 130))
scene.paste(tray, (BX0 + 60, TY0 - 4))
sd.rectangle([BX0 + 60, TY0 - 4, BX1 - 60, TY1], outline=(104, 108, 112), width=3)
sd.rectangle([BX0 + 60, TY0 + 52, BX1 - 60, TY1 - 2], fill=(100, 104, 110))
# markers lying in the tray
def marker(x, y, color, ang, length=330):
    layer = Image.new("RGBA", (length + 40, 70), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    ld.rounded_rectangle([10, 14, length, 52], radius=18, fill=(238, 238, 236, 255), outline=(150, 152, 154, 255), width=2)
    ld.rounded_rectangle([10, 14, 110, 52], radius=18, fill=color + (255,))
    ld.rounded_rectangle([length - 70, 14, length, 52], radius=16, fill=color + (255,))
    ld.rectangle([150, 26, 260, 40], fill=(205, 207, 210, 255))
    ld.line([(24, 22), (length - 18, 22)], fill=(255, 255, 255, 120), width=4)
    layer = layer.rotate(ang, expand=True, resample=Image.BICUBIC)
    scene.paste(layer, (int(x), int(y)), layer)
marker(BX0 + 330, TY0 - 30, (28, 74, 168), 2)
marker(BX0 + 700, TY0 - 26, (196, 44, 44), -3)
marker(BX0 + 1060, TY0 - 30, (24, 26, 30), 1)
marker(BX0 + 1430, TY0 - 24, (24, 130, 70), -2)
# eraser
sd.rounded_rectangle([BX1 - 560, TY0 - 36, BX1 - 330, TY0 + 40], radius=12, fill=(36, 74, 142), outline=(24, 40, 80), width=3)
sd.rounded_rectangle([BX1 - 560, TY0 + 6, BX1 - 330, TY0 + 40], radius=10, fill=(222, 222, 216))
scene = scene.convert("RGBA")

# a rubber-banded contact shadow under the tray
tsh = Image.new("RGBA", scene.size, (0, 0, 0, 0))
ImageDraw.Draw(tsh).rectangle([BX0 + 40, TY1, BX1 - 40, TY1 + 46], fill=(40, 40, 44, 90))
scene = Image.alpha_composite(scene, tsh.filter(ImageFilter.GaussianBlur(18)))

# the ink goes on the board only, a touch translucent with a dry-marker streak
mask = Image.new("L", scene.size, 0)
ImageDraw.Draw(mask).rectangle([SX0, SY0, SX1, SY1], fill=255)
alpha = ink.split()[3]
streak = Image.fromarray((np.random.normal(232, 14, (CH, CW))).clip(150, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.6))
alpha = ImageChops.multiply(alpha, streak)
alpha = ImageChops.multiply(alpha, mask)
ink.putalpha(alpha)
scene = Image.alpha_composite(scene, ink)

# soft glare across the upper right, washing the board a little
glare = np.zeros((CH, CW), np.float32)
gy, gx = np.mgrid[0:CH, 0:CW].astype(np.float32)
d = (gx * 0.55 + gy * 0.83 - (CW * 0.62 * 0.55 + CH * 0.18 * 0.83))
glare = 70 * np.exp(-(d / 380.0) ** 2)
glare_img = Image.fromarray(glare.clip(0, 255).astype(np.uint8))
white = Image.new("RGBA", scene.size, (255, 255, 255, 255))
white.putalpha(ImageChops.multiply(glare_img, mask))
scene = Image.alpha_composite(scene, white).convert("RGB")

# ---------------------------------------------------------------- the camera: tilt, keystone, vignette, softness
scene = scene.rotate(-0.9, resample=Image.BICUBIC, center=(CW / 2, CH / 2), fillcolor=(190, 186, 178))
coeffs = (1, 0.0006, -0.0006 * CH / 2, 0.0004, 1, -0.0004 * CW / 2, 1.1e-6, 1.6e-6)
scene = scene.transform((CW, CH), Image.PERSPECTIVE, coeffs, Image.BICUBIC, fillcolor=(190, 186, 178))
photo = scene.crop((PAD, PAD, PAD + W, PAD + H))
arr = np.asarray(photo).astype(np.float32)
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
vig = 1 - 0.30 * (((xx - W / 2) / (W * 0.62)) ** 2 + ((yy - H / 2) / (H * 0.66)) ** 2)
arr *= vig[..., None]
arr *= np.array([1.0, 0.99, 0.965], np.float32)  # warm room light
arr += np.random.normal(0, 2.2, arr.shape)
photo = Image.fromarray(arr.clip(0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.7))
path = os.path.join(OUT_DIR, "Whiteboard plays.jpg")
photo.save(path, quality=90, subsampling=0)

# the boxes of the three plays as fractions of the photo (the recorder's stand-in reader uses them)
boxes = []
for i in range(3):
    boxes.append({
        "x": round((PANEL_X[i] - PAD - 0.012 * W) / W, 4),
        "y": round((PANEL_Y - PAD - 0.01 * H) / H, 4),
        "w": round(PANEL_W / W + (0.005 if i < 2 else 0.016), 4),
        "h": round((PANEL_H + 0.02 * H) / H, 4),
        "title": PLAYS[i]["title"].title(),
    })
print(json.dumps(boxes))
print(path)
