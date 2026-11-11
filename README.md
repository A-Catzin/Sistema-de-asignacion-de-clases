# Sistema de asignación de clases

Aplicación web para apoyar a la coordinación académica en la administración de docentes, materias, grupos, aulas y horarios. Permite organizar ciclos y cohortes, registrar asignaciones y detectar conflictos de horarios, perfiles y carga docente.

## Funcionalidades

- Gestión de carreras, materias, docentes, coordinadores y aulas.
- Administración de ciclos académicos, grupos y cohortes.
- Asignación de docentes, horarios y aulas a materias de un grupo.
- Validación de perfiles, carga docente y conflictos de horario.
- Consulta de horarios, reportes, exportación CSV y datos incompletos.
- Acceso por roles de administrador y coordinador, con auditoría de cambios relevantes.

## Tecnologías

- **Aplicación:** Next.js, React y TypeScript.
- **Interfaz y validación:** Tailwind CSS y Zod.
- **Datos y autenticación:** Supabase Auth y PostgreSQL.
- **Pruebas:** Vitest y Playwright.

Las versiones exactas y los comandos disponibles están en [`package.json`](package.json).

## Requisitos

- Node.js y npm. El flujo de integración continua configura Node.js 20.
- Supabase CLI y un entorno compatible con los contenedores requeridos por Supabase local.
- Chromium para las pruebas E2E con Playwright.

## Inicio local

1. Instala las dependencias:

   ```bash
   npm ci
   ```

2. Inicia Supabase local:

   ```bash
   supabase start
   ```

3. Configura las variables locales a partir del estado de Supabase:

   ```bash
   npm run env:local
   ```

4. Inicia la aplicación:

   ```bash
   npm run dev
   ```

   Abre la dirección local indicada en la terminal. Para preparar o reconstruir la base y consultar los requisitos de las pruebas, revisa primero [`docs/TESTING.md`](docs/TESTING.md). **`supabase db reset` elimina y reconstruye los datos de la base local**: úsalo solo cuando sea seguro perderlos.

## Variables de entorno

La aplicación utiliza las siguientes variables en `.env.local`:

```text
NEXT_PUBLIC_SUPABASE_URL=<URL de Supabase>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<clave pública>
SUPABASE_SERVICE_ROLE_KEY=<clave secreta de servidor>
```

La clave `SUPABASE_SERVICE_ROLE_KEY` tiene privilegios elevados: debe mantenerse exclusivamente en entornos seguros de servidor y nunca la publiques en el repositorio ni en código cliente. Revise qué archivos incluye antes de compartir el proyecto; los datos importados y respaldos pueden contener información sensible.

## Comprobaciones

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Para integración y pruebas de navegador se necesita un entorno local preparado:

```bash
npm run test:integration
npm run test:e2e
```

Las pruebas de integración crean y eliminan datos temporales. La activación real de ciclos en E2E está deshabilitada por defecto porque puede avanzar cohortes existentes. Consulte las condiciones, la instalación de Chromium y las precauciones en [`docs/TESTING.md`](docs/TESTING.md).

## Estructura

```text
app/                  Rutas, páginas y acciones de servidor
components/           Componentes de interfaz, formularios y horarios
lib/                  Consultas, autenticación, validaciones y utilidades
supabase/migrations/  Esquema, permisos, funciones y auditoría PostgreSQL
tests/                Pruebas unitarias, integración y E2E
scripts/              Importación, respaldo y herramientas locales
docs/                 Arquitectura, pruebas y despliegue
MIgracion/            Material de referencia para una posible migración
```

## Documentación

- [Análisis del proyecto](docs/ANALISIS_PROYECTO.md): objetivo, arquitectura, modelo de datos, fortalezas y riesgos.
- [Arquitectura](docs/ARCHITECTURE.md): capas, reglas y entidades principales.
- [Pruebas y respaldos](docs/TESTING.md): preparación local y comandos de verificación.
- [Despliegue](docs/DEPLOYMENT.md): configuración documentada para Supabase Cloud y Vercel.
- [Decisiones de auditoría](docs/AUDIT_DECISIONS.md): riesgos operativos aceptados y controles.
- [Paquete de migración](MIgracion/README.md): contexto y recursos para evaluar un proyecto nuevo basado en este sistema.

> El sistema actual utiliza Supabase. El paquete de migración es material de referencia; no representa una migración a Firebase ya implementada.
