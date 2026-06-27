#!/usr/bin/env bash
# Regenerate every app icon from the brand assets in brand/.
#   - resources/icon.icns          (macOS app icon)
#   - resources/icon.ico           (Windows app icon)
#   - resources/Images/icon.png    (1024px colour icon, window/dock fallback)
#   - resources/Images/iconTemplate.png + @2x  (macOS menu-bar template, monochrome)
#
# Requires: imagemagick (magick) for the colour app icon, librsvg (rsvg-convert) for
# the monochrome menu-bar template, plus macOS iconutil.
#   brew install imagemagick librsvg
set -euo pipefail

cd "$(dirname "$0")/.."
SRC_APP="brand/recall-appicon.png"        # graphite recorder app icon (1024px)
SRC_TRAY="brand/recall-tray-template.svg" # monochrome menu-bar mark
OUT="resources"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

command -v magick >/dev/null       || { echo "need magick (brew install imagemagick)"; exit 1; }
command -v rsvg-convert >/dev/null || { echo "need rsvg-convert (brew install librsvg)"; exit 1; }

echo "→ colour app icon (1024)…"
magick "$SRC_APP" -resize 1024x1024 "$OUT/Images/icon.png"

echo "→ macOS .icns…"
ICONSET="$TMP/icon.iconset"; mkdir -p "$ICONSET"
for s in 16 32 64 128 256 512 1024; do
  magick "$SRC_APP" -resize "${s}x${s}" "$ICONSET/icon_${s}x${s}.png"
done
# Retina (@2x) slots expected by iconutil
cp "$ICONSET/icon_32x32.png"     "$ICONSET/icon_16x16@2x.png"
cp "$ICONSET/icon_64x64.png"     "$ICONSET/icon_32x32@2x.png"
cp "$ICONSET/icon_256x256.png"   "$ICONSET/icon_128x128@2x.png"
cp "$ICONSET/icon_512x512.png"   "$ICONSET/icon_256x256@2x.png"
cp "$ICONSET/icon_1024x1024.png" "$ICONSET/icon_512x512@2x.png"
rm -f "$ICONSET/icon_64x64.png" "$ICONSET/icon_1024x1024.png"
iconutil -c icns "$ICONSET" -o "$OUT/icon.icns"

echo "→ Windows .ico…"
magick "$SRC_APP" -define icon:auto-resize=256,128,64,48,32,16 "$OUT/icon.ico"

echo "→ macOS menu-bar template…"
rsvg-convert -w 16 -h 16 "$SRC_TRAY" -o "$OUT/Images/iconTemplate.png"
rsvg-convert -w 32 -h 32 "$SRC_TRAY" -o "$OUT/Images/iconTemplate@2x.png"

echo "✓ icons regenerated in $OUT/"
