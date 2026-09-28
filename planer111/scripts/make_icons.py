#!/usr/bin/env python3
"""Generate StudyFlow PWA icons with indigo->violet gradient and open-book mark."""
from PIL import Image, ImageDraw
import os

OUT = "/home/z/my-project/public/icons"
os.makedirs(OUT, exist_ok=True)

C1 = (99, 102, 241)   # #6366F1
C2 = (139, 92, 246)   # #8B5CF6
WHITE = (255, 255, 255)

def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

def make_gradient(size):
    img = Image.new("RGB", (size, size))
    d = ImageDraw.Draw(img)
    # diagonal gradient via lines
    for i in range(size * 2):
        t = i / (size * 2 - 1)
        col = lerp(C1, C2, t)
        d.line([(i - size, size), (i, 0)], fill=col, width=2)
    return img

def rounded(img, radius_ratio=0.22):
    size = img.size[0]
    r = int(size * radius_ratio)
    mask = Image.new("L", (size, size), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=255)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out

def draw_book(d, s):
    """Draw a stylized open-book mark centered in s x s canvas."""
    w = s * 0.52
    h = s * 0.36
    x0 = (s - w) / 2
    y0 = (s - h) / 2
    lw = max(int(s * 0.035), 3)
    cx = s / 2
    # left page
    d.polygon([
        (x0, y0 + h * 0.12),
        (cx - s*0.02, y0),
        (cx - s*0.02, y0 + h * 0.92),
        (x0, y0 + h),
    ], fill=WHITE)
    # right page
    d.polygon([
        (x0 + w, y0 + h * 0.12),
        (cx + s*0.02, y0),
        (cx + s*0.02, y0 + h * 0.92),
        (x0 + w, y0 + h),
    ], fill=WHITE)
    # spine
    d.line([(cx, y0), (cx, y0 + h * 0.92)], fill=(99, 102, 241), width=lw)
    # text lines
    la = (180, 180, 220)
    for i in range(3):
        yy = y0 + h * (0.28 + i * 0.18)
        d.line([(x0 + w*0.12, yy), (cx - s*0.06, yy)], fill=la, width=max(int(s*0.018), 2))
        d.line([(cx + s*0.06, yy), (x0 + w*0.88, yy)], fill=la, width=max(int(s*0.018), 2))

for size in (192, 512):
    base = make_gradient(size)
    d = ImageDraw.Draw(base)
    draw_book(d, size)
    icon = rounded(base)
    icon.save(f"{OUT}/icon-{size}.png")
    # maskable: full bleed gradient with smaller mark
    m = make_gradient(size)
    md = ImageDraw.Draw(m)
    draw_book(md, size * 0.78)
    m.convert("RGB").save(f"{OUT}/maskable-{size}.png")

# apple touch icon 180 (solid bg, no transparency)
base = make_gradient(180)
d = ImageDraw.Draw(base)
draw_book(d, 180)
base.convert("RGB").save(f"{OUT}/apple-touch-icon.png")

# favicon 32
base = make_gradient(64)
d = ImageDraw.Draw(base)
draw_book(d, 64)
icon = rounded(base, 0.28)
icon.save(f"{OUT}/favicon.png", sizes=[(32, 32)])

print("icons done:", os.listdir(OUT))
