import json
import sys
from pathlib import Path

environment, directory = sys.argv[1:]
resources = Path(directory)


def load_config(name):
    try:
        config = json.loads((resources / name).read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        sys.exit(f"Unable to load {name}. Run prepare.mjs for {environment} first. ({type(error).__name__})")
    if not isinstance(config, dict):
        sys.exit(f"Expected an object in {name}.")
    return config


if load_config("ClientConfig.json").get("environment") != environment:
    sys.exit(f"Run prepare.mjs for {environment} before building.")

if environment == "production":
    maps = load_config("PublicMapConfig.json")

    def configured(name):
        value = maps.get(name)
        return isinstance(value, str) and bool(value.strip())

    # The public map endpoint can select an AMap preset after the app ships.
    if not (configured("VITE_AMAP_WEB_KEY") or configured("VITE_AMAP_KEY")) or not configured("VITE_AMAP_SECURITY_JS_CODE"):
        sys.exit("Production builds require an AMap Web Key and security code. Set PIC4PICK_AMAP_WEB_KEY and PIC4PICK_AMAP_SECURITY_JS_CODE in the production config and rerun prepare.mjs.")
