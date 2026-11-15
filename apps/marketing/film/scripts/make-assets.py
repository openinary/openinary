# Builds public/media/* and public/grain.png (deterministic). Run: python3 scripts/make-assets.py
import os, shutil
import numpy as np
from PIL import Image

DEMO = os.path.join(os.path.dirname(__file__), "../../../cloud/web/public/demo")
OUT = os.path.join(os.path.dirname(__file__), "..", "public")
M = os.path.join(OUT, "media")
os.makedirs(M, exist_ok=True)

src = Image.open(f"{DEMO}/images/landscape/original.jpg").convert("RGB")
for w in (2400, 1000, 600):
    h = round(w * src.height / src.width)
    src.resize((w, h), Image.LANCZOS).save(f"{M}/hills-{w}.jpg", quality=92, subsampling=0, optimize=True)
for name, rel in [("portrait.webp", "images/portrait/w900.webp"), ("product-shoot.webp", "images/product/w900.webp"),
                  ("blossom-poster.webp", "videos/cherry-blossom/poster.webp"),
                  ("product-animation.webp", "videos/2d-animation/poster.webp")]:
    shutil.copyfile(f"{DEMO}/{rel}", f"{M}/{name}")
shutil.copyfile(f"{DEMO}/videos/cherry-blossom/720p.mp4", f"{M}/blossom.mp4")
# The film shows source 2.0 s to ~3.8 s at 60 fps: a motion-interpolated 60 fps copy of the first 6.5 s removes the
# 25 -> 60 frame-repeat judder (source frames coincide with output frames every 0.2 s, so 2.0 s is a true source frame).
import subprocess
subprocess.run(["ffmpeg", "-v", "error", "-y", "-t", "6.5", "-i", f"{M}/blossom.mp4", "-vf",
                "minterpolate=fps=60:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1", "-an", "-c:v", "libx264",
                "-crf", "12", "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart", f"{M}/blossom-60.mp4"], check=True)

# Grain: zero-mean luminance noise, sd 1.2 levels, feature ~1.5 px, tileable, static.
# Encoded for NORMAL blending over the ground (B): darkening pixels are black with alpha, lightening pixels are
# white with alpha. grain.png over the light ground (~250), grain-dark.png over the dark one (24).
rng = np.random.default_rng(1080)
n = rng.standard_normal((2048, 2048))
k = np.exp(-0.5 * (np.arange(-3, 4) / 0.7) ** 2); k /= k.sum()
for axis in (0, 1):
    n = sum(w * np.roll(n, s, axis=axis) for s, w in zip(range(-3, 4), k))
n = n / n.std() * 1.2  # levels
for name, B in (("grain.png", 250.0), ("grain-dark.png", 24.0)):
    rgba = np.zeros((2048, 2048, 4), np.uint8)
    neg = n < 0
    rgba[..., :3] = np.where(neg, 0, 255)[..., None]
    a = np.where(neg, -n / B, n / (255 - B))
    rgba[..., 3] = np.clip(np.round(a * 255), 0, 255).astype(np.uint8)
    Image.fromarray(rgba, "RGBA").save(os.path.join(OUT, name), optimize=True)

# verify: composite over 250 and report stats
alpha = rgba[..., 3] / 255.0
col = rgba[..., 0].astype(float)
res = B * (1 - alpha) + col * alpha
print("dark grain over #181818: mean %.3f sd %.3f min %.1f max %.1f" % (res.mean(), res.std(), res.min(), res.max()))
for f in sorted(os.listdir(M)):
    p = f"{M}/{f}"
    try:
        im = Image.open(p); print(f, im.size, os.path.getsize(p))
    except Exception:
        print(f, os.path.getsize(p))
