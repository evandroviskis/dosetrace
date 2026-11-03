#!/bin/bash
# Build do APK "DT Admin" sem Gradle: aapt2 + javac (JDK 17 do Homebrew) + d8 + zipalign + apksigner.
set -euo pipefail
cd "$(dirname "$0")"
SDK="$HOME/Library/Android/sdk"
BT="$SDK/build-tools/36.0.0"
JAVA_HOME="/opt/homebrew/opt/openjdk@17"
export PATH="$JAVA_HOME/bin:$BT:$PATH"
ANDROID_JAR="$SDK/platforms/android-36/android.jar"
rm -rf build && mkdir -p build/compiled build/gen build/classes build/dex

aapt2 compile --dir res -o build/compiled.zip
aapt2 link -o build/base.apk -I "$ANDROID_JAR" --manifest AndroidManifest.xml --java build/gen build/compiled.zip --auto-add-overlay
javac --release 11 -classpath "$ANDROID_JAR" -d build/classes $(find src build/gen -name '*.java')
d8 --release --min-api 30 --lib "$ANDROID_JAR" --output build/dex $(find build/classes -name '*.class')
cp build/base.apk build/unsigned.apk
( cd build/dex && zip -q ../unsigned.apk classes.dex )
zipalign -f -p 4 build/unsigned.apk build/aligned.apk

KS="$HOME/.dtadmin-release.keystore"   # chave de assinatura só deste Mac; fora do git e do Second Brain
if [ ! -f "$KS" ]; then
  echo "ERRO: chave de assinatura $KS não encontrada. Nunca gere outra: um APK com chave nova não instala por cima e o cadastro do aparelho se perde. Restaure a cópia do HD de chaves." >&2; exit 1
fi
apksigner sign --ks "$KS" --ks-key-alias dtadmin --ks-pass pass:dtadmin-local --key-pass pass:dtadmin-local \
  --out build/dtadmin.apk build/aligned.apk
apksigner verify build/dtadmin.apk && ls -la build/dtadmin.apk
