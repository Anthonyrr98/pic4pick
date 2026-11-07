from pathlib import Path
import re

# Structural guards only; final safe-area placement and tab visibility need iOS QA.
root = Path(__file__).resolve().parents[1]
source = (root / "Sources/Pic4Pick/Pic4PickApp.swift").read_text(encoding="utf-8")
navigation = source.split("struct RootView: View {", 1)[1].split("struct PhotoSelection:", 1)[0]
assert "TabView(" not in navigation and ".tabItem" not in navigation
assert "GalleryView(favoritesOnly: true)" not in navigation and "SettingsView()" not in navigation
assert navigation.count(".modifier(AppPageLayer(") == 2
assert ".overlay(alignment: .bottom)" in navigation and "FloatingBottomNavigation" in navigation
assert "if !keyboardVisible" in navigation
assert ".contentMargins(.bottom, CGFloat(BottomNavigationMetrics.contentClearance), for: .scrollContent)" in source
bar = (root / "Sources/Pic4Pick/FloatingBottomNavigation.swift").read_text(encoding="utf-8")
assert ".glassEffect(.regular.interactive(!reduceMotion), in: Capsule())" in bar
assert "ForEach(AppSection.allCases)" in bar
assert "ellipsis" not in bar and "SettingsView" not in bar
header = (root / "Sources/Pic4Pick/GalleryTopBar.swift").read_text(encoding="utf-8")
assert 'section("图库"' not in header and 'section("发现"' not in header
assert "private func section(" not in header and not re.search(r"\bselectedTab\s*=(?!=)", header)
assert "BrandMark(" in header and "brand-wordmark" in header
assert ".frame(minHeight: 44)" in header
assert "pic4pick.appearance" not in source and "AppearanceMenu" not in source
assert "Menu {" not in header and "circle.lefthalf.filled" not in header
print("Bottom navigation contract checks passed: two retained page layers, no duplicate header switch or manual appearance controls, branding and content clearance preserved.")
