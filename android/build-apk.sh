#!/usr/bin/env bash
# Compila y firma la APK de MisFinanzas (Trusted Web Activity).
#   ./build-apk.sh https://misfinanzas.tudominio.cl [versionName] [versionCode]
# Requiere JAVA_HOME (JDK 17) y ANDROID_HOME (platform 36 + build-tools 36.0.0).
# La primera vez crea la clave de firma en keystore/ y keystore.properties. ¡RESPÁLDALAS!
# Sin esa misma clave no podrás publicar actualizaciones de la app.
set -euo pipefail
cd "$(dirname "$0")"
URL="${1:?Uso: ./build-apk.sh https://tu-dominio [versionName] [versionCode]}"
VERSION_NAME="${2:-1.0.0}"
VERSION_CODE="${3:-1}"
[[ "$URL" == https://* ]] || { echo "La URL debe empezar con https://"; exit 1; }

if [[ ! -f keystore.properties ]]; then
  mkdir -p keystore
  PASS="$(openssl rand -hex 20)"
  keytool -genkeypair -v -keystore keystore/misfinanzas-release.jks -alias misfinanzas \
    -keyalg RSA -keysize 3072 -validity 10000 -storepass "$PASS" -keypass "$PASS" \
    -dname "CN=MisFinanzas, O=MisFinanzas, C=CL" >/dev/null 2>&1
  printf "storeFile=keystore/misfinanzas-release.jks\nstorePassword=%s\nkeyAlias=misfinanzas\nkeyPassword=%s\n" "$PASS" "$PASS" > keystore.properties
  chmod 600 keystore.properties keystore/misfinanzas-release.jks
  echo "Clave de firma creada en android/keystore/ (respáldala junto con keystore.properties)."
fi

gradle --no-daemon -q assembleRelease -PtwaUrl="$URL" -PversionName="$VERSION_NAME" -PversionCode="$VERSION_CODE"

mkdir -p ../dist
OUT="../dist/MisFinanzas-${VERSION_NAME}.apk"
cp app/build/outputs/apk/release/app-release.apk "$OUT"
# Copia con nombre fijo para la descarga pública (se publica junto a la app en /descargas/MiSaldo.apk).
mkdir -p ../public/descargas
cp "$OUT" ../public/descargas/MiSaldo.apk
apksigner verify --print-certs "$OUT" | grep -i "SHA-256" | head -1
SHA=$(keytool -list -v -keystore keystore/misfinanzas-release.jks -alias misfinanzas -storepass "$(grep storePassword keystore.properties | cut -d= -f2)" | grep "SHA256:" | awk '{print $2}')
echo
echo "APK lista: dist/MisFinanzas-${VERSION_NAME}.apk  (apunta a $URL)"
echo "Configura en el servidor web:"
echo "  ANDROID_PACKAGE_NAME=cl.misfinanzas.app"
echo "  ANDROID_CERT_SHA256=$SHA"
