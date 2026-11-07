import plistlib
from pathlib import Path

root = Path(__file__).resolve().parents[1]
with (root / "Info.plist").open("rb") as source:
    info = plistlib.load(source)
assert info.get("CADisableMinimumFrameDurationOnPhone") is True, "ProMotion opt-in must be a Boolean true"

# Linux cannot execute UIKit. Guard the precise startup contract that caused
# build 15's device crash; this source check does not replace on-device launch QA.
refresh = (root / "Sources/Pic4Pick/AppRefreshPreference.swift").read_text(encoding="utf-8")
registration = refresh.index("UIUpdateLink(windowScene: scene, actionHandler:")
configuration = refresh.index("link.requiresContinuousUpdates = false")
assert registration < configuration, "Register a UIUpdateLink phase action before configuring updates"
assert "UIUpdateLink(windowScene: scene)" not in refresh, "Actionless scene link can assert on startup"
print("Display checks passed: ProMotion opt-in and update-link startup action registration.")
