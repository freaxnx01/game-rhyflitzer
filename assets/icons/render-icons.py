#!/usr/bin/env python3
"""#1076: renders the app icons (web app manifest + apple-touch-icon) from the start screen's look.

A Bungee "R" in sun yellow, skewed like `.start h1`, with the same stacked shadow (signal, burnt, dark brown,
charcoal) and a warm glow, on the start screen's purple-to-orange gradient (`#overlay` over the charcoal body).
Colours are `--sun`, `--signal`, `--burnt`, `--charcoal` from index.html. Bungee is the game's title font (SIL OFL,
`Bungee-OFL.txt` beside this file).

    python3 assets/icons/render-icons.py        # writes icon-192.png, icon-512.png, icon-512-maskable.png,
                                                # apple-touch-icon-180.png next to this script

Needs Pillow only. Everything is drawn at 4x and downsampled, so edges stay clean at 48 px on a home screen.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).resolve().parent
FONT = HERE / "Bungee-Regular.ttf"

SUN = (255, 198, 26)
SIGNAL = (255, 122, 26)
BURNT = (194, 74, 0)
BROWN = (107, 36, 0)
CHARCOAL = (28, 31, 38)

# `#overlay`'s gradient composited over the charcoal body, pushed a little in saturation so it still reads
# as the purple-to-orange sunset at 48 px.
GRADIENT = [(0.00, (30, 20, 62)), (0.35, (92, 36, 76)), (0.62, (176, 68, 44)), (0.80, (214, 118, 48)),
            (1.00, (236, 160, 66))]

SKEW_DEG = 9.0


def lerp_colour(stops, t):
    for (t0, c0), (t1, c1) in zip(stops, stops[1:]):
        if t0 <= t <= t1:
            f = (t - t0) / (t1 - t0) if t1 > t0 else 0
            return tuple(round(a + (b - a) * f) for a, b in zip(c0, c1))
    return stops[-1][1]


def background(size):
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        c = lerp_colour(GRADIENT, y / (size - 1))
        for x in range(size):
            px[x, y] = c
    # the radial vignette of `#overlay`: transparent in the middle, dark towards the corners
    vignette = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(vignette)
    steps = 48
    for i in range(steps):
        r = size * (0.55 + 0.75 * (1 - i / steps))
        a = int(90 * (i / steps) ** 1.6)
        d.ellipse((size / 2 - r, size / 2 - r, size / 2 + r, size / 2 + r), fill=a)
    vignette = vignette.filter(ImageFilter.GaussianBlur(size * 0.04))
    dark = Image.new("RGB", (size, size), (10, 8, 20))
    return Image.composite(dark, img, vignette).convert("RGBA")


def letter_layer(size, glyph_height):
    """The skewed, shadowed, glowing R on a transparent layer of `size` x `size`."""
    font_size = int(glyph_height * 1.39)   # Bungee's cap height is ~0.72 em
    font = ImageFont.truetype(str(FONT), font_size)
    x0, y0, x1, y1 = font.getbbox("R")
    w, h = x1 - x0, y1 - y0
    step = round(glyph_height * 0.055)     # 4 px per step on a 72 px title -> 5.5 % of the cap height
    stroke = max(1, round(glyph_height * 0.025))
    pad = step * 4 + stroke * 2 + int(size * 0.12)
    layer = Image.new("RGBA", (w + pad * 2, h + pad * 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    origin = (pad - x0, pad - y0)
    for k, colour in ((4, CHARCOAL), (3, BROWN), (2, BURNT), (1, SIGNAL)):
        d.text((origin[0] + step * k, origin[1] + step * k), "R", font=font, fill=colour)
    d.text(origin, "R", font=font, fill=SUN, stroke_width=stroke, stroke_fill=CHARCOAL)
    layer = skew(layer, SKEW_DEG)
    glow = Image.new("RGBA", layer.size, (0, 0, 0, 0))
    mask = layer.split()[3].filter(ImageFilter.GaussianBlur(glyph_height * 0.12))
    glow.paste(SIGNAL + (150,), mask=mask)
    out = Image.alpha_composite(glow, layer)
    return out


def skew(img, degrees):
    import math
    shear = math.tan(math.radians(degrees))
    w, h = img.size
    extra = int(abs(shear) * h) + 2
    canvas = Image.new("RGBA", (w + extra, h), (0, 0, 0, 0))
    canvas.paste(img, (extra if shear > 0 else 0, 0))
    # x' = x + shear * (y - h/2)   -> italic-like lean to the right at the top
    return canvas.transform(canvas.size, Image.AFFINE, (1, shear, -shear * h / 2, 0, 1, 0), resample=Image.BICUBIC)


def compose(size, glyph_fraction, supersample=4):
    big = size * supersample
    img = background(big)
    letter = letter_layer(big, int(big * glyph_fraction))
    bbox = letter.split()[3].getbbox()
    trimmed = letter.crop(bbox)
    # centre on the glyph's visual mass: the shadow stack pulls the bbox down-right, so nudge back a little
    cx = (big - trimmed.width) // 2 - int(big * 0.01)
    cy = (big - trimmed.height) // 2 - int(big * 0.015)
    img.alpha_composite(trimmed, (cx, cy))
    return img.resize((size, size), Image.LANCZOS).convert("RGB")


def main():
    any_icon = compose(512, 0.53)
    any_icon.save(HERE / "icon-512.png", optimize=True)
    any_icon.resize((192, 192), Image.LANCZOS).save(HERE / "icon-192.png", optimize=True)
    # maskable: the safe zone is the central circle of 80 % diameter; the R must fit well inside it
    compose(512, 0.39).save(HERE / "icon-512-maskable.png", optimize=True)
    compose(180, 0.53).save(HERE / "apple-touch-icon-180.png", optimize=True)


if __name__ == "__main__":
    main()
