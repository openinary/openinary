"""Paint layered ridgelines: a clear sky with a low sun, then five ranges of
hills, each paler and bluer with distance, mist pooling in the valleys, film
grain on top. numpy + Pillow only, nothing licensed.

usage: python3 -I scripts/paint-skies.py public/skies 1920 1200
"""
import sys
import numpy as np
from PIL import Image, ImageFilter

OUT = sys.argv[1]
W = int(sys.argv[2]) if len(sys.argv) > 2 else 1920
H = int(sys.argv[3]) if len(sys.argv) > 3 else 1200


def hexrgb(h):
    h = h.lstrip("#")
    return np.array([int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)], np.float32)


def line(n, cell, rng):
    """Smooth 1D value noise in [0, 1]."""
    g = rng.random((1, int(n / cell) + 4)).astype(np.float32)
    a = np.asarray(Image.fromarray(g, mode="F").resize((int(g.shape[1] * cell), 1), Image.BICUBIC))[0]
    return a[:n]


def ridge(n, rng, base, octaves, sharp):
    """A skyline: fBm, folded into peaks when `sharp` is high."""
    out, amp, cell, tot = np.zeros(n, np.float32), 1.0, base, 0.0
    for _ in range(octaves):
        v = line(n, cell, rng)
        v = (1 - sharp) * v + sharp * (1 - np.abs(2 * v - 1))
        out += amp * v
        tot += amp
        amp *= 0.5
        cell /= 2.2
    return out / tot


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def paint(name, seed, top, horizon, sun, sun_pos, near, far, mist, glow=0.6, start=0.42):
    rng = np.random.default_rng(seed)
    ys = np.linspace(0, 1, H, dtype=np.float32)[:, None]
    xs = np.linspace(0, 1, W, dtype=np.float32)[None, :]
    yy = np.broadcast_to(ys, (H, W))

    # Sky: two stops, eased, plus a glow round the sun.
    t = smooth(0.0, 0.75, yy)[..., None]
    img = hexrgb(top) * (1 - t) + hexrgb(horizon) * t
    sx, sy = sun_pos
    d = np.sqrt(((xs - sx) * W / H) ** 2 + (ys - sy) ** 2)
    g = (np.exp(-d * 2.6) * glow + np.exp(-d * 14) * glow)[..., None]
    img = img + (hexrgb(sun) - img) * np.clip(g, 0, 1)

    # Ranges, back to front: lower, darker, rounder and taller as they come near.
    near, far, mist = hexrgb(near), hexrgb(far), hexrgb(mist)
    layers = 5
    for i in range(layers):
        k = i / (layers - 1)
        col = far * (1 - k) + near * k
        crest = start + 0.13 * i + 0.04 * rng.random()
        amp = 0.18 + 0.12 * k
        sky = ridge(W, rng, 700 - 300 * k, 6, 0.6 - 0.45 * k)
        top_y = crest - amp * sky  # in [0, 1] of height, per column
        depth = yy - top_y[None, :]
        inside = smooth(0.0, 1.5 / H, depth)[..., None]
        # Light on the crest facing the sun, mist pooling lower down.
        rim = np.exp(-np.clip(depth, 0, None) * 160)[..., None] * (0.18 - 0.1 * k)
        # Level with the valley floor, not the crest, so it lies flat instead of streaking.
        fog = smooth(crest - amp * 0.4, crest + 0.1, yy)[..., None] * (0.45 - 0.3 * k)
        shade = col + (hexrgb(sun) - col) * rim
        shade = shade + (mist - shade) * fog
        img = img * (1 - inside) + shade * inside
        # Air between this range and the next one forward.
        haze = smooth(top_y.min() - 0.05, top_y.max() + 0.12, yy)[..., None] * 0.06
        img = img + (mist - img) * haze

    img = img + rng.standard_normal((H, W, 1)).astype(np.float32) * 0.01
    img = np.clip(img, 0, 1)
    out = Image.fromarray((img * 255).astype(np.uint8), "RGB").filter(ImageFilter.GaussianBlur(0.7))
    out.save(f"{OUT}/{name}.webp", quality=80, method=6)
    print(name)


# Keep each top dark enough for a white heading (the pricing block sits on haze).
paint("dawn", 3, "#3a4f72", "#e7b48e", "#ffdcb4", (0.18, 0.5), "#2a2c3d", "#9c8fa0", "#e6c3ae", glow=0.7)
paint("clear", 11, "#3f6c9c", "#c3d7e4", "#f5f7f6", (0.78, 0.18), "#24384d", "#8aa3b8", "#d6e2ea", glow=0.35)
paint("haze", 21, "#3d4956", "#b9b5aa", "#efe6d6", (0.82, 0.4), "#262b31", "#7e858b", "#c9c3b8", glow=0.4, start=0.48)
paint("dusk", 7, "#1b2643", "#d99a7e", "#ffbd92", (0.72, 0.52), "#1a1b2b", "#6c5a73", "#c48b80", glow=0.8)
paint("ocean", 31, "#28527c", "#a6c4d6", "#eaf3f7", (0.25, 0.22), "#1b3347", "#6b8ea8", "#bdd2de", glow=0.4)
