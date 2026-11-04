#!/usr/bin/env bash
set -euo pipefail
if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "La compilación iOS necesita macOS con Xcode. Usa el workflow manual de GitHub Actions."
  exit 1
fi
PULSO_IOS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PULSO_REPO_ROOT="$(cd "$PULSO_IOS_ROOT/../.." && pwd)"
PULSO_OUTPUT="$PULSO_REPO_ROOT/native/build"
PULSO_BUNDLE_ID="${PULSO_BUNDLE_ID:-dev.pulso.screen}"
if [[ ! "$PULSO_BUNDLE_ID" =~ ^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$ ]]; then
  echo "El identificador de la app no es válido."
  exit 1
fi
command -v xcodegen >/dev/null || { echo "Falta XcodeGen. Instálalo con brew install xcodegen."; exit 1; }
xcodegen generate --spec "$PULSO_IOS_ROOT/project.json" --project "$PULSO_IOS_ROOT"
mkdir -p "$PULSO_IOS_ROOT/PulsoScreen.xcodeproj/project.xcworkspace/xcshareddata/swiftpm"
cp "$PULSO_IOS_ROOT/Package.resolved" "$PULSO_IOS_ROOT/PulsoScreen.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved"
mkdir -p "$PULSO_OUTPUT"
xcodebuild -resolvePackageDependencies \
  -project "$PULSO_IOS_ROOT/PulsoScreen.xcodeproj" -scheme PulsoScreen \
  -onlyUsePackageVersionsFromResolvedFile
xcodebuild archive \
  -project "$PULSO_IOS_ROOT/PulsoScreen.xcodeproj" -scheme PulsoScreen \
  -configuration Release -destination 'generic/platform=iOS' \
  -archivePath "$PULSO_OUTPUT/PulsoScreen.xcarchive" \
  -disableAutomaticPackageResolution \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY= DEVELOPMENT_TEAM= \
  "PULSO_BUNDLE_ID=$PULSO_BUNDLE_ID"
PULSO_APP="$PULSO_OUTPUT/PulsoScreen.xcarchive/Products/Applications/PulsoScreen.app"
[[ -d "$PULSO_APP/PlugIns/PulsoBroadcast.appex" ]] || { echo "Falta la extensión de transmisión."; exit 1; }
[[ -d "$PULSO_APP/PlugIns/PulsoSetup.appex" ]] || { echo "Falta la extensión de configuración."; exit 1; }
PULSO_PACKAGE="$(mktemp -d "$PULSO_OUTPUT/package.XXXXXX")"
trap 'rm -rf "$PULSO_PACKAGE"' EXIT
mkdir -p "$PULSO_PACKAGE/Payload"
ditto "$PULSO_APP" "$PULSO_PACKAGE/Payload/PulsoScreen.app"
(cd "$PULSO_PACKAGE" && zip -qr "$PULSO_OUTPUT/PulsoScreen-unsigned.ipa" Payload)
(cd "$PULSO_OUTPUT" && shasum -a 256 PulsoScreen-unsigned.ipa > SHA256SUMS.txt)
echo "IPA sin firmar generado. Debe firmarse localmente antes de instalarlo en el iPhone."
