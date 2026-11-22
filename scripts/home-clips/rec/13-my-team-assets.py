"""Sample files for the My team clip (13-my-team.mjs): a roster spreadsheet of twelve made-up players with made-up parents,
and an original shield-and-"ST" logo (Sample Team). Run once: python3 scripts/home-clips/rec/13-my-team-assets.py"""
import csv, os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
POS = ["QB", "C", "X", "Y", "Z", "X", "Y", "Z", "QB", "C", "X", "Z"]
JERSEY = [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 21, 23]
rows = []
for i in range(12):
    n = i + 1
    rows.append([
        "Sample", f"Player {n}", JERSEY[i], POS[i], 2033 + (i % 3),
        f"Sample Dad {n}", f"615-555-01{n:02d}", f"sample.dad{n}@example.com",
        f"Sample Mom {n}", f"615-555-01{n + 20:02d}", f"sample.mom{n}@example.com",
    ])
with open(os.path.join(HERE, "13-my-team-roster.csv"), "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["FIRST", "LAST", "Jersey #", "POS", "GRAD YR", "DAD", "DAD CELL", "DAD EMAIL", "MOM", "MOM CELL", "MOM EMAIL"])
    w.writerows(rows)

# An original logo: a gold-rimmed green shield with "ST" and a cut across the middle. 256 px, transparent corners.
S = 4
W = 256 * S
im = Image.new("RGBA", (W, W), (0, 0, 0, 0))
d = ImageDraw.Draw(im)
def shield(pad, fill):
    l, t, r, b = pad, pad, W - pad, W - pad
    pts = [(l, t + 20 * S), (W / 2, t - 6 * S), (r, t + 20 * S), (r, W * 0.56), (W * 0.84, W * 0.80), (W / 2, b), (W * 0.16, W * 0.80), (l, W * 0.56)]
    d.polygon(pts, fill=fill)
shield(14 * S, (232, 184, 32, 255))
shield(30 * S, (31, 91, 58, 255))
d.polygon([(30 * S, 118 * S), (W / 2, 96 * S), (226 * S, 118 * S), (226 * S, 134 * S), (W / 2, 112 * S), (30 * S, 134 * S)], fill=(232, 184, 32, 255))
try:
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 96 * S)
except Exception:
    font = ImageFont.load_default()
tw = d.textlength("ST", font=font)
d.text(((W - tw) / 2, 128 * S), "ST", font=font, fill=(255, 255, 255, 255))
im.resize((256, 256), Image.LANCZOS).save(os.path.join(HERE, "13-my-team-logo.png"))
print("ok")
