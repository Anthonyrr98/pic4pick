#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
team="${PIC4PICK_DEVELOPMENT_TEAM:?Set the App Store Connect team ID}"
number="${PIC4PICK_BUILD_NUMBER:?Set a unique numeric App Store Connect build number}"
output="${1:?Pass an absolute output directory}"
[[ "$output" = /* && "$number" =~ ^[1-9][0-9]*$ && "$team" =~ ^[A-Z0-9]{10}$ ]]
[[ "$(xcodebuild -version | awk 'NR==1 {split($2,v,"."); print v[1]}')" -ge 26 ]]
[[ "$(xcrun --sdk iphoneos --show-sdk-version | cut -d. -f1)" -ge 26 ]]
[[ -z "$(git status --porcelain)" ]] || { echo 'Commit the release source before archiving.' >&2; exit 2; }
mkdir -p "$output"
[[ ! -e "$output/Pic4Pick.xcarchive" && ! -e "$output/export" ]]
bash scripts/prepare-store.sh production "${2:-}"
python3 - "$number" <<'PY'
import json, plistlib, sys
from urllib.parse import urlsplit

with open('Sources/Pic4Pick/Resources/ClientConfig.json') as file:
    config = json.load(file)
assert config['environment'] == 'production'
for key in ('apiBaseURL', 'supabaseURL', 'websiteURL', 'mediaBaseURL'):
    host = urlsplit(config[key]).hostname or ''
    assert host and host not in {'localhost', 'example.com', 'example.net', 'example.org'}, key
    assert not host.endswith(('.invalid', '.test', '.example', '.localhost')), key
assert not config['publicKey'].endswith('_fixture'), 'Replace the fixture key before archiving'
path = '.store-generated/Info.plist'
with open(path, 'rb') as file:
    data = plistlib.load(file)
data['CFBundleVersion'] = sys.argv[1]
with open(path, 'wb') as file:
    plistlib.dump(data, file)
PY

xcodebuild -project Pic4Pick.xcodeproj -scheme Pic4Pick -configuration Release \
    -destination 'generic/platform=iOS' -archivePath "$output/Pic4Pick.xcarchive" \
    DEVELOPMENT_TEAM="$team" archive

python3 - "$output/ExportOptions.plist" "$team" <<'PY'
import plistlib, sys
with open(sys.argv[1], 'wb') as file:
    plistlib.dump({'method': 'app-store-connect', 'destination': 'export',
                   'signingStyle': 'automatic', 'teamID': sys.argv[2],
                   'manageAppVersionAndBuildNumber': False}, file)
PY
xcodebuild -exportArchive -archivePath "$output/Pic4Pick.xcarchive" \
    -exportOptionsPlist "$output/ExportOptions.plist" -exportPath "$output/export"

ipa="$(find "$output/export" -maxdepth 1 -name '*.ipa' -print)"
[[ -f "$ipa" ]]
verify_dir="$(mktemp -d)"
trap 'rm -rf -- "$verify_dir"' EXIT
unzip -q "$ipa" -d "$verify_dir"
apps=("$verify_dir"/Payload/*.app)
[[ ${#apps[@]} -eq 1 && -d "${apps[0]}" ]]
app="${apps[0]}"
codesign --verify --deep --strict "$app"
codesign --display --verbose=4 "$app" > "$output/signature.txt" 2>&1
grep -q '^Authority=Apple Distribution:' "$output/signature.txt"
codesign -d --entitlements :- "$app" > "$verify_dir/entitlements.plist"
security cms -D -i "$app/embedded.mobileprovision" > "$verify_dir/profile.plist"
python3 - "$app" "$verify_dir" "$team" "$number" <<'PY'
import pathlib, plistlib, sys
app, verification = map(pathlib.Path, sys.argv[1:3])
team, number = sys.argv[3:]
def load(path):
    return plistlib.loads(path.read_bytes())
info = load(app / 'Info.plist')
manifest = load(app / 'PrivacyInfo.xcprivacy')
profile = load(verification / 'profile.plist')
signed = load(verification / 'entitlements.plist')
bundle = 'com.rlzhao.pic4pick'
assert info['CFBundleIdentifier'] == bundle and info['CFBundleVersion'] == number
assert int(info['DTSDKName'].removeprefix('iphoneos').split('.')[0]) >= 26
assert int(info['DTXcode']) >= 2600
assert manifest['NSPrivacyAccessedAPITypes'] and info['CFBundleIcons']
assert (app / 'Assets.car').is_file()
assert 'ProvisionedDevices' not in profile and not profile.get('ProvisionsAllDevices')
assert team in profile['TeamIdentifier'] and signed['com.apple.developer.team-identifier'] == team
for entitlements in (profile['Entitlements'], signed):
    assert not entitlements.get('get-task-allow')
    assert entitlements['application-identifier'].split('.', 1)[1] == bundle
assert signed['application-identifier'] == profile['Entitlements']['application-identifier']
print('Distribution profile UUID:', profile['UUID'])
print('App version:', info['CFBundleShortVersionString'], 'build:', number)
PY
xcrun vtool -show-build "$app/Pic4Pick" | tee "$output/macho-build.txt"
awk '$1 == "sdk" && int($2) >= 26 { found = 1 } END { exit !found }' "$output/macho-build.txt"
xcrun dwarfdump --uuid "$app/Pic4Pick" | awk '{print $2, $3}' | sort > "$output/executable-uuids.txt"
xcrun dwarfdump --uuid "$output/Pic4Pick.xcarchive/dSYMs/Pic4Pick.app.dSYM" \
    | awk '{print $2, $3}' | sort | diff - "$output/executable-uuids.txt"
{
    git rev-parse HEAD
    xcodebuild -version
    shasum -a 256 Sources/Pic4Pick/Resources/ClientConfig.json "$ipa"
} > "$output/rc.txt"
