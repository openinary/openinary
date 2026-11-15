# Contact sheet with frame numbers: python3 scripts/sheet.py OUT.png FIRST_FRAME STEP COLS img1 img2 ...
import sys
from PIL import Image, ImageDraw
out, first, step, cols = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4])
files = sys.argv[5:][::step]
ims = [Image.open(f).convert("RGB") for f in files]
w, h = ims[0].size
s = 480 / w
tw, th = 480, int(h * s)
rows = (len(ims) + cols - 1) // cols
sheet = Image.new("RGB", (cols * tw, rows * th), "white")
d = ImageDraw.Draw(sheet)
for i, im in enumerate(ims):
    x, y = (i % cols) * tw, (i // cols) * th
    sheet.paste(im.resize((tw, th), Image.LANCZOS), (x, y))
    d.rectangle((x + 4, y + 4, x + 64, y + 22), fill="black")
    d.text((x + 8, y + 7), f"f{first + i * step}", fill="white")
sheet.save(out)
