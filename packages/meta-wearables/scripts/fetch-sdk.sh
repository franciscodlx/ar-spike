#!/usr/bin/env bash
# Downloads the Meta Wearables DAT xcframeworks this module vendors into ios/Frameworks.
# Binaries are Meta's (not committed); re-run after a clean clone or when bumping SDK_VERSION.
set -euo pipefail

SDK_VERSION="${SDK_VERSION:-1.1.0}"
FRAMEWORKS=(MWDATCore MWDATCamera MWDATMockDevice)
DEST="$(cd "$(dirname "$0")/.." && pwd)/ios/Frameworks"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

git clone --quiet --depth 1 --branch "$SDK_VERSION" --filter=blob:none --sparse \
  https://github.com/meta/meta-wearables-dat-ios.git "$TMP/sdk"
paths=()
for f in "${FRAMEWORKS[@]}"; do paths+=("$f.xcframework"); done
git -C "$TMP/sdk" sparse-checkout set --no-cone "${paths[@]/#//}"

rm -rf "$DEST"
mkdir -p "$DEST"
for f in "${FRAMEWORKS[@]}"; do
  cp -R "$TMP/sdk/$f.xcframework" "$DEST/"
done
echo "$SDK_VERSION" > "$DEST/VERSION"
echo "Meta Wearables DAT $SDK_VERSION -> $DEST"
