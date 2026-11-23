# Entorno local reproducible (T06 / D1)

Este documento describe cómo instalar y arrancar en local la aplicación base (Next.js/TypeScript) junto con los emuladores de Firebase Auth y Cloud Firestore, sin credenciales remotas ni datos institucionales.

## Requisitos previos

- **Node.js 22.x** (verificado con `v22.23.2`) y **npm 10.x**
- **Java 21** (requerido por los emuladores de Firebase)
- **Firebase CLI** (`firebase --version`, verificado con `15.24.0`)

Si aún no se descargó el emulador local de Firestore:

```sh
firebase setup:emulators:firestore
```

## Configuración inicial

1. Instalar dependencias desde la raíz del repositorio:

   ```sh
   npm install
   ```

2. Crear `.env.local` en la raíz (ignorado por Git; no guardar secretos en el repositorio) con los valores locales para emuladores:

   ```sh
   cat <<'EOF' > .env.local
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-sistema-asignacion
   NEXT_PUBLIC_FIREBASE_API_KEY=demo-local-api-key
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=demo-sistema-asignacion.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_APP_ID=1:000000000000:web:localdemo
   NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true
   NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099

   FIREBASE_PROJECT_ID=demo-sistema-asignacion
   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
   EOF
   ```

   Estas variables apuntan al proyecto sintético `demo-sistema-asignacion` y a direcciones loopback (`127.0.0.1:9099` para Auth y `127.0.0.1:8080` para Firestore).

## Arranque de D1 (primera demo local)

En dos terminales desde la raíz:

1. **Terminal 1 — Emuladores Firebase (Auth + Firestore + UI):**

   ```sh
   npm run emulators:start
   ```

   Puertos locales configurados en [firebase.json](../firebase.json):
   - Auth Emulator: `127.0.0.1:9099`
   - Firestore Emulator: `127.0.0.1:8080`
   - Emulator UI: `http://127.0.0.1:4000`

2. **Terminal 2 — Aplicación Next.js:**

   ```sh
   npm run dev
   ```

   Abrir `http://127.0.0.1:3000` para ver el tablero de estado del entorno local y `http://127.0.0.1:3000/api/health` para consultar el JSON de salud.

## Comandos de calidad y pruebas

```sh
npm run typecheck   # tsc --noEmit
npm run lint        # eslint .
npm test            # pruebas unitarias con Vitest (tests/unit/)
npm run build       # compilación de producción Next.js
```

Para las pruebas aisladas del prototipo de integridad/ciclos (`prototypes/assignment-integrity/`), consultar [README del prototipo](../prototypes/assignment-integrity/README.md).
