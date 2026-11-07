"""Install or validate the supplied App icon without redrawing it (Pillow required)."""
import argparse
from pathlib import Path
import shutil
from PIL import Image

target = Path(__file__).resolve().parents[1] / "Resources" / "AppIcon.png"
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("source", nargs="?", type=Path, help="Replacement PNG; omitted validates current icon")
args = parser.parse_args()
source = args.source.resolve() if args.source else target
with Image.open(source) as image:
    if image.format != "PNG" or image.width != image.height or image.width < 1024:
        raise SystemExit("App icon must be a square PNG of at least 1024 pixels.")
    if image.mode not in ("RGB", "RGBA"):
        raise SystemExit("App icon must use RGB or opaque RGBA.")
    if image.mode == "RGBA" and image.getchannel("A").getextrema() != (255, 255):
        raise SystemExit("App icon must be opaque.")
    size = image.size
if source != target:
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, target)
print(f"Validated supplied icon: {target} ({size[0]} x {size[1]})")
