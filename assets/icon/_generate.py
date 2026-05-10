"""Generate launcher icons (square padded + adaptive foreground) from top_image.jpg."""
from PIL import Image
from pathlib import Path

SRC = Path(__file__).resolve().parents[1] / "images" / "top_image.jpg"
OUT_DIR = Path(__file__).resolve().parent
CANVAS = 1024
SAFE_RATIO = 0.66  # adaptive icon safe zone inner area

img = Image.open(SRC).convert("RGB")
print(f"source: {img.size}")

# Sample background color from top-left corner (avg of 20x20 patch)
patch = img.crop((0, 0, 20, 20))
pixels = list(patch.getdata())
r = sum(p[0] for p in pixels) // len(pixels)
g = sum(p[1] for p in pixels) // len(pixels)
b = sum(p[2] for p in pixels) // len(pixels)
bg = (r, g, b)
hex_bg = f"#{r:02X}{g:02X}{b:02X}"
print(f"background color: {bg}  hex: {hex_bg}")

def fit_inside(im, target):
    """Scale im preserving aspect ratio so it fits inside target x target."""
    w, h = im.size
    scale = min(target / w, target / h)
    new_w, new_h = int(w * scale), int(h * scale)
    return im.resize((new_w, new_h), Image.LANCZOS)

# 1) Legacy / iOS icon: full square, image padded with bg color, no transparency
legacy = Image.new("RGB", (CANVAS, CANVAS), bg)
fitted = fit_inside(img, CANVAS)  # fits full image inside canvas
fx = (CANVAS - fitted.size[0]) // 2
fy = (CANVAS - fitted.size[1]) // 2
legacy.paste(fitted, (fx, fy))
legacy_path = OUT_DIR / "icon.png"
legacy.save(legacy_path, "PNG")
print(f"wrote {legacy_path}  ({legacy.size})")

# 2) Adaptive foreground: image scaled to inner safe zone (~66%), rest transparent
fg = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
inner = int(CANVAS * SAFE_RATIO)
fitted_fg = fit_inside(img, inner)
fx = (CANVAS - fitted_fg.size[0]) // 2
fy = (CANVAS - fitted_fg.size[1]) // 2
fg.paste(fitted_fg.convert("RGBA"), (fx, fy))
fg_path = OUT_DIR / "icon_foreground.png"
fg.save(fg_path, "PNG")
print(f"wrote {fg_path}  ({fg.size})")

print(f"\nUSE THIS in pubspec flutter_launcher_icons.adaptive_icon_background: \"{hex_bg}\"")
