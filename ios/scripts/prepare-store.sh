#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
environment="${1:?Pass staging or production}"
if [[ $# -ge 2 ]]; then
    node scripts/prepare.mjs "$environment" "$2"
else
    node scripts/prepare.mjs "$environment"
fi
python3 - <<'PY'
import json
import pathlib
import plistlib

root = pathlib.Path('.store-generated')
assets = root / 'Assets.xcassets'
icon = assets / 'AppIcon.appiconset'
icon.mkdir(parents=True, exist_ok=True)
info = {'author': 'xcode', 'version': 1}
(assets / 'Contents.json').write_text(json.dumps({'info': info}))
(icon / 'Contents.json').write_text(json.dumps({
    'info': info,
    'images': [{'filename': 'AppIcon.png', 'idiom': 'universal', 'platform': 'ios', 'size': '1024x1024'}],
}))
with open('Info.plist', 'rb') as file:
    plist = plistlib.load(file)
plist.update({
    'CFBundleIdentifier': '$(PRODUCT_BUNDLE_IDENTIFIER)',
    'CFBundleExecutable': '$(EXECUTABLE_NAME)',
    'CFBundleInfoDictionaryVersion': '6.0',
    'CFBundlePackageType': 'APPL',
    'CFBundleDevelopmentRegion': 'zh_CN',
    'LSRequiresIPhoneOS': True,
})
plist.pop('UIRequiresFullScreen', None)
plist['UISupportedInterfaceOrientations~ipad'] = [
    'UIInterfaceOrientationPortrait', 'UIInterfaceOrientationPortraitUpsideDown',
    'UIInterfaceOrientationLandscapeLeft', 'UIInterfaceOrientationLandscapeRight',
]
with (root / 'Info.plist').open('wb') as file:
    plistlib.dump(plist, file)
PY
sips -z 1024 1024 Resources/AppIcon.png --out .store-generated/Assets.xcassets/AppIcon.appiconset/AppIcon.png
xcodegen generate --spec project.yml
