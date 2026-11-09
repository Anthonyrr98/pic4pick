#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
configuration="${2:-debug}"
if [[ "$configuration" != debug && "$configuration" != release ]]; then
    echo 'Configuration must be debug or release.' >&2
    exit 2
fi
if [[ -f "$HOME/.local/share/swiftly/env.sh" ]]; then
    source "$HOME/.local/share/swiftly/env.sh"
fi
expected_environment=staging
if [[ "$configuration" == release ]]; then expected_environment=production; fi
python3 -c 'import json,sys; assert json.load(open("Sources/Pic4Pick/Resources/ClientConfig.json"))["environment"] == sys.argv[1], "Run prepare.mjs with the matching environment first."' "$expected_environment"
mkdir -p .build/checks
swiftc Sources/Pic4Pick/DiskImageCache.swift Tests/DiskImageCacheChecks.swift -o .build/checks/disk-image-cache-checks
.build/checks/disk-image-cache-checks
swiftc Sources/Pic4Pick/Photo.swift Tests/PhotoChecks.swift -o .build/checks/photo-checks
.build/checks/photo-checks
swiftc Sources/Pic4Pick/Photo.swift Sources/Pic4Pick/PanelSnapPolicy.swift Sources/Pic4Pick/ExploreDiscoveryModel.swift Tests/ExploreDiscoveryChecks.swift -o .build/checks/explore-discovery-checks
.build/checks/explore-discovery-checks
swiftc Sources/Pic4Pick/PanelSnapPolicy.swift Sources/Pic4Pick/PhotoViewerLayout.swift Tests/PhotoViewerLayoutChecks.swift -o .build/checks/photo-viewer-layout-checks
.build/checks/photo-viewer-layout-checks
swiftc Sources/Pic4Pick/PhotoPanelPanPolicy.swift Tests/PhotoPanelPanChecks.swift -o .build/checks/photo-panel-pan-checks
.build/checks/photo-panel-pan-checks
swiftc Sources/Pic4Pick/PhotoTransitionMath.swift Tests/PhotoTransitionChecks.swift -o .build/checks/photo-transition-checks
.build/checks/photo-transition-checks
swiftc Sources/Pic4Pick/SpatialMath.swift Tests/SpatialChecks.swift -o .build/checks/spatial-checks
.build/checks/spatial-checks
swiftc Sources/Pic4Pick/FilmDevelopmentHistory.swift Tests/FilmDevelopmentChecks.swift -o .build/checks/film-development-checks
.build/checks/film-development-checks
swiftc Sources/Pic4Pick/CategoryIndicatorLayout.swift Tests/CategoryIndicatorChecks.swift -o .build/checks/category-indicator-checks
.build/checks/category-indicator-checks
swiftc Sources/Pic4Pick/DisplayRefreshPolicy.swift Tests/CategoryRefreshChecks.swift -o .build/checks/category-refresh-checks
.build/checks/category-refresh-checks
python3 scripts/check-display-config.py
python3 scripts/check-liquid-glass.py
swiftc Sources/Pic4Pick/AppSection.swift Tests/AppNavigationChecks.swift -o .build/checks/app-navigation-checks
.build/checks/app-navigation-checks
python3 scripts/check-bottom-navigation.py
swiftc Sources/Pic4Pick/PhotoPresentationPolicy.swift Tests/PhotoPresentationChecks.swift -o .build/checks/photo-presentation-checks
.build/checks/photo-presentation-checks
case "${1:-build}" in
    install)
        source /mnt/g/Ai/xcode/apple-relay.env
        xtool dev run --usb --configuration "$configuration"
        ;;
    ipa)
        xtool dev build --sign --ipa --configuration "$configuration"
        ;;
    build)
        xtool dev build --configuration "$configuration"
        ;;
    *)
        echo 'Usage: bash scripts/build.sh [build|install|ipa] [debug|release]' >&2
        exit 2
        ;;
esac
