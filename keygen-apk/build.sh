#!/usr/bin/env bash
# Construye la APK de CRANKZ Keygen sin Gradle: aapt2 + javac + d8 + apksigner.
# Requisitos: JDK 17+ y Android SDK con "platforms;android-35" y "build-tools;35.0.0".
#   ANDROID_HOME=/ruta/al/sdk ./build.sh      → build/crankz-keygen.apk
# Firma: keygen-apk/crankz.keystore (se crea la primera vez; fuera del repo, guárdala
# para poder instalar versiones nuevas encima). Contraseña: variable KS_PASS (por defecto "crankz").
set -euo pipefail
cd "$(dirname "$0")"
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-/opt/android-sdk}}"
BT="$SDK/build-tools/35.0.0"; JAR="$SDK/platforms/android-35/android.jar"
KS=crankz.keystore; KS_PASS="${KS_PASS:-crankz}"
rm -rf build && mkdir -p build/res build/classes build/assets/keygen build/dex

cp ../web/keygen/index.html ../web/keygen/PressStart2P.ttf build/assets/keygen/
"$BT/aapt2" compile --dir res -o build/res/res.zip
"$BT/aapt2" link -o build/unsigned.apk -I "$JAR" --manifest AndroidManifest.xml \
  -A build/assets build/res/res.zip --min-sdk-version 24 --target-sdk-version 35
javac -source 8 -target 8 -bootclasspath "$JAR" -d build/classes -Xlint:-options $(find src -name '*.java')
"$BT/d8" --release --min-api 24 --lib "$JAR" --output build/dex $(find build/classes -name '*.class')
(cd build/dex && zip -q ../unsigned.apk classes.dex)
"$BT/zipalign" -f -p 4 build/unsigned.apk build/aligned.apk
[ -f "$KS" ] || keytool -genkeypair -keystore "$KS" -alias crankz -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass "$KS_PASS" -keypass "$KS_PASS" -dname "CN=CRANKZ, O=dvgamelab, C=ES"
"$BT/apksigner" sign --ks "$KS" --ks-pass "pass:$KS_PASS" --out build/crankz-keygen.apk build/aligned.apk
"$BT/apksigner" verify build/crankz-keygen.apk && echo "OK → keygen-apk/build/crankz-keygen.apk"
