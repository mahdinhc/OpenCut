#!/usr/bin/env bash
# Idempotent: safe to run locally and in CI.
# OpenCut keeps only its own native code (native/kotlin) in git. The Android project itself is
# generated from the official React Native template, so Gradle/AGP/Kotlin/NDK versions, the Gradle
# wrapper and autolinking are always the ones that RN version is tested with.
set -euo pipefail
cd "$(dirname "$0")/.."

RN_VERSION="${RN_VERSION:-0.76.9}"
PKG=com.opencut
PKG_DIR=android/app/src/main/java/com/opencut

# A leftover hand-made android/ folder (no Gradle wrapper) is replaced by a fresh template.
if [ -d android ] && [ ! -f android/gradlew ]; then
  echo ">> android/ has no gradlew - regenerating it"
  rm -rf android
fi

if [ ! -d android ]; then
  echo ">> Generating React Native $RN_VERSION scaffold"
  TMP="$(mktemp -d)"
  npx --yes @react-native-community/cli@latest init OpenCut \
      --version "$RN_VERSION" --package-name "$PKG" \
      --skip-install --skip-git-init --directory "$TMP/app"
  cp -rn "$TMP/app/." .          # never overwrites our own files (index.js, package.json, ...)
  rm -rf "$TMP" App.tsx __tests__
fi

if [ ! -d node_modules ]; then
  echo ">> npm install"
  npm install --no-audit --no-fund
fi

echo ">> Applying native overlay"
mkdir -p "$PKG_DIR"
cp -f native/kotlin/*.kt "$PKG_DIR/"
python3 scripts/patch_android.py

# Legacy bridge modules: OpenCut's native module and view manager use the old architecture API.
sed -i 's/^newArchEnabled=.*/newArchEnabled=false/' android/gradle.properties
sed -i 's/^org.gradle.jvmargs=.*/org.gradle.jvmargs=-Xmx4g -XX:MaxMetaspaceSize=1g/' android/gradle.properties
chmod +x android/gradlew
echo ">> Done. Build: cd android && ./gradlew assembleRelease"
