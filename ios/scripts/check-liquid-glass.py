from pathlib import Path

# Source contract only: actual optical appearance and touch feedback require iOS.
root = Path(__file__).resolve().parents[1]
bar = (root / "Sources/Pic4Pick/GalleryFilterBar.swift").read_text(encoding="utf-8")
indicator = (root / "Sources/Pic4Pick/CategorySelectionIndicator.swift").read_text(encoding="utf-8")
assert "reduceTransparency || contrast == .increased" in bar
assert "if solidSurface { Capsule().fill(theme.surface) }" in bar
surface = bar.split("private var categorySurface:", 1)[1].split("private var categoryButtons:", 1)[0]
assert "Capsule().fill(.ultraThinMaterial)" in surface
assert ".mask" in surface and "color: .clear, location: 1" in surface
assert not any(edge in surface for edge in (".stroke", ".shadow", ".glassEffect"))
assert "CategoryPressStyle()" in bar
assert "highlightTint.withAlphaComponent(0.22)" in indicator
assert "pill.colors = [highlightTint.cgColor, highlightTint.cgColor]" in indicator
assert "pill.borderWidth = translucent ? 0 : 1" in indicator
assert "DisplayRefreshPreference.range" in indicator
print("Category material checks passed: feathered lower edge, accessibility fallback and high-refresh selection.")
