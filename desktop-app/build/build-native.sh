#!/usr/bin/env bash
# Build the native macOS system-audio capture helper (ScreenCaptureKit) into
# resources/bin so electron-builder bundles it like ffmpeg / whisper-cli.
# Requires the Xcode command-line tools (swiftc). macOS only.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ "$(uname)" != "Darwin" ]]; then
  echo "build-native: skipping (not macOS)"; exit 0
fi
if ! command -v swiftc >/dev/null 2>&1; then
  echo "build-native: swiftc not found — install Xcode command-line tools" >&2; exit 1
fi

mkdir -p resources/bin
swiftc -O -target arm64-apple-macos13.0 \
  -framework ScreenCaptureKit -framework AVFoundation -framework CoreMedia \
  native/system-audio-capture.swift -o resources/bin/system-audio-capture
echo "build-native: built resources/bin/system-audio-capture"
