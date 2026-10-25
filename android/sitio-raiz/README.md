# Sitio raíz de jagsantander.github.io

Contenido del repositorio `jagsantander.github.io`. Android solo acepta `assetlinks.json` en la raíz del dominio
(`https://jagsantander.github.io/.well-known/assetlinks.json`), no dentro de `/MisFinanzas/`. Con ese archivo, la app
Android abre MisFinanzas a pantalla completa, sin la barra de dirección.

- `.well-known/assetlinks.json`: paquete `cl.misfinanzas.app` y huella SHA-256 de la llave `android/keystore/misfinanzas-release.jks`.
  Si algún día cambias la llave (o publicas en Google Play con firma de Google), agrega la nueva huella a la lista.
- `.nojekyll`: sin él, GitHub Pages ignora las carpetas que empiezan con punto, como `.well-known`.
- `index.html`: redirige `https://jagsantander.github.io/` a la app.
