"""LIFE OS contrast probe, part 2: contrast of each text against the pixels behind it.
usage: python scripts/contrast-measure.py screenshot.png boxes.json window_width_css_px
boxes.json comes from scripts/contrast-probe.js. Needs Pillow (pip install pillow).
The background under a text is the median of the screenshot pixels in its box (plus 4 px),
so a text on its own small fill (a badge) is better checked against that fill directly."""
import json, sys, statistics
from PIL import Image

img = Image.open(sys.argv[1]).convert("RGB")
boxes = json.load(open(sys.argv[2], encoding="utf-8"))
scale = img.width / float(sys.argv[3])

def lin(c):
    c /= 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def lum(rgb):
    r, g, b = (lin(v) for v in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b

rows = []
for t, x, y, w, h, fs, bold, col, mutedish in boxes:
    if x < 0 or w < 6:
        continue
    pad = 4
    x0, y0 = max(0, int((x - pad) * scale)), max(0, int((y - pad) * scale))
    x1, y1 = min(img.width, int((x + w + pad) * scale)), min(img.height, int((y + h + pad) * scale))
    if x1 - x0 < 3 or y1 - y0 < 3:
        continue
    px = [img.getpixel((i, j)) for i in range(x0, x1) for j in range(y0, y1)]
    bg = tuple(statistics.median(p[k] for p in px) for k in range(3))
    r, g, b, a = (int(v) for v in col.split(","))
    a /= 255
    fg = tuple(a * c + (1 - a) * bgc for c, bgc in zip((r, g, b), bg))
    L1, L2 = lum(fg), lum(bg)
    ratio = (max(L1, L2) + 0.05) / (min(L1, L2) + 0.05)
    large = fs >= 24 or (bold and fs >= 18.66)
    need = 3 if large else 4.5
    rows.append((ratio, need, t, fs, mutedish))

rows.sort()
fails = [r for r in rows if r[0] < r[1]]
muted = [r for r in rows if r[4]]
print(f"texts {len(rows)}  below AA {len(fails)}  ({len([r for r in fails if r[4]])} of them secondary/muted)")
print(f"muted text: min {min(r[0] for r in muted):.2f}  median {statistics.median(r[0] for r in muted):.2f}" if muted else "")
for ratio, need, t, fs, m in rows[:14]:
    print(f"{ratio:5.2f} (needs {need})  {'muted ' if m else '      '}{fs:>5}px  {t}")
