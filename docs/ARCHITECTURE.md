# Arquitectura — Transición al ecosistema Firebase

![Estado: diseño propuesto](https://img.shields.io/badge/estado-diseño_propuesto-yellow) ![Runtime Firebase: pendiente](https://img.shields.io/badge/runtime_Firebase-pendiente-lightgrey)

| Campo | Valor |
|---|---|
| Versión / fecha | 1.1.0 / 2026-11-11 |
| Alcance | Arquitectura observada y propuesta de destino; no despliegue implementado |
| Base elegida / validación pendiente | Firestore; falta validar modelo, integridad concurrente, hosting y operación con presupuesto $0 |
| Referencias | [PRD](PRD.md), [plan](TASKS.md), [memoria/ADR](MEMORY.md) |

**Convención:** «actual» se refiere a la instantánea anterior, no a una aplicación funcionando en esta raíz. No existe `package.json` raíz ni configuración Firebase. Las propuestas siguientes no autorizan un corte ni operaciones sobre producción.

## 1. High-Level Architecture

### 1.1 Sistema anterior observado

```text
Navegador / React
       | renderizado y formularios
Next.js App Router / Server Components / proxy.ts
       | Server Actions por dominio + GET /api/reportes/csv
Clientes Supabase SSR + comprobaciones de sesión/alcance
       | consultas relacionales y RPC
Supabase Auth       PostgreSQL
                    | RLS + constraints + funciones + triggers
                    + catálogos / asignaciones / cohortes / auditoría
```

El código valida entradas y permisos; la base también aplica integridad y autorización. En particular, `validate_assignment()` usa un candado transaccional y las asignaciones activas tienen un índice único parcial. Reemplazar únicamente el cliente de consultas no conserva el contrato.

### 1.2 Destino recomendado, todavía no implementado

```text
Navegador: UI React reutilizada gradualmente + Firebase Auth Web
       | HTTPS / identidad intercambiada por sesión del servidor
Next.js: Server Components + Server Actions + Route Handlers
       | autenticación + autorización + DTO validado
Casos de uso: asignación / ciclo / cohortes / catálogos / reportes
       | interfaces de repositorio + unidad de trabajo
Adaptador Firestore (base confirmada en T04)
       + documentos de dominio, índices y guardas transaccionales
       + diseño de consultas y costos pendiente de T05
       | auditoría y datos de negocio
Entorno: emuladores/pruebas aisladas → staging → producción autorizada
```

No se propone un microservicio por módulo. Mantener un monolito modular reduce superficie operativa; extraer funciones o procesos asíncronos solo con una necesidad medida. No se ha detectado un requisito de WebSockets. Actualización tras mutación y lecturas del servidor bastan como base; listeners en tiempo real serían una decisión posterior de costos y autorización.

## 2. Technology Stack

Versiones **declaradas** en [`package.json` de referencia](../Migracion/referencia/codigo/package.json), no verificadas mediante instalación. Las versiones del nuevo proyecto se fijarán con lockfile y comprobación de compatibilidad.

| Capa | Tecnología observada | Destino / propósito y justificación |
|---|---|---|
| Frontend | Next.js 16.2.11; React/DOM 19.2.7; TypeScript 6.0.3 | Propuesta: conservar App Router y tipado; reutilización incremental de pantallas |
| Backend | Server Actions, Route Handlers y RPC Supabase | Casos de uso de servidor con adaptadores; no importar SDK privilegiado en cliente |
| Database | PostgreSQL/Supabase; 27 migraciones; 21 tablas tipadas | Firestore elegido; reimplementar relaciones, consultas e invariantes; no importar datos anteriores |
| Auth | Supabase JS 2.110.8; SSR 0.12.3 | Firebase Authentication + SDK Admin en servidor; diseño de sesión y revocación pendiente |
| Storage | Activos locales `public/`; URL de expediente en entidad docente | Cloud Storage solo si se aprueba una necesidad de carga; no es funcionalidad confirmada |
| UI | Tailwind 3.4.19, clsx 2.1.1, lucide-react 1.17.0, sonner 2.0.7 | Conservar tokens/componentes compatibles; sin asumir Radix/shadcn instalados |
| Validación | Zod 4.4.3 | DTO y validadores puros en límites de entrada; no sustituye permisos |
| Deployment | Guías anteriores, sin configuración Firebase raíz | Hosting compatible con servidor Next.js por evaluar; no decidir región ni facturación sin validación |
| Tooling | ESLint 9.39.4; Vitest 4.1.8; Playwright 1.61.1; tsx 4.22.4 | Lint/tipos/unitarias; emuladores e integración de destino; CI nueva pendiente |
| Importación/medios | read-excel-file 9.0.10; sharp 0.35.3 | Reevaluar usos; el importador anterior y respaldos no vienen en `scripts/` |

### 2.1 Decisión de persistencia confirmada e historial de alternativas

| Criterio | Firestore | Firebase SQL Connect |
|---|---|---|
| Modelo | Documentos, referencias y duplicación deliberada | Relacional sobre Cloud SQL for PostgreSQL |
| Reutilización | Reescribir joins, RLS, triggers y garantías transaccionales | Mayor afinidad conceptual; no implica compatibilidad automática de SQL/RPC/RLS de Supabase |
| Riesgo principal | Contención, invariantes globales, consultas y costo por operación | Adaptación de esquema/operaciones y costo/operación de infraestructura relacional |
| Prueba exigida | Dos escrituras incompatibles no pueden ambas confirmar | Operaciones/autorización elegidas conservan invariantes y atomicidad |
| Estado | Elegido por el usuario para priorizar presupuesto $0 | Descartado para el alcance actual por costo recurrente de Cloud SQL |

**Decisión:** Firestore reemplaza la preferencia inicial por SQL. El motivo es el presupuesto mensual de $0: las operaciones gratuitas de SQL Connect no eliminan el costo recurrente de Cloud SQL tras la prueba. [Costos oficiales de SQL Connect](https://firebase.google.com/docs/sql-connect/pricing). La elección de producto está cerrada; el esquema de §5.2 sigue siendo propuesta hasta probar consultas e invariantes.

### 2.2 Presupuesto $0 y límites de diseño

Se admite Blaze únicamente con objetivo de operar dentro de cuotas sin costo. Esto **no equivale a autorización de cargos ni a garantía de costo cero**. No existe medición que pruebe suficiencia para este proyecto. Priorizar Emulator Suite para desarrollo y pruebas.

Referencia de cuota gratuita Firestore Standard: una base elegible por proyecto; 1 GiB de almacenamiento, 50.000 lecturas/día, 20.000 escrituras/día, 20.000 eliminaciones/día y 10 GiB de transferencia saliente/mes. Las cuotas diarias se renuevan alrededor de medianoche del Pacífico, no de la zona institucional. Verificar condiciones al implementar. [Cuotas oficiales](https://firebase.google.com/docs/firestore/quotas).

El presupuesto debe incluir hosting, ejecución de servidor, compilaciones, artefactos, logs y servicios auxiliares; no solo Firestore. Las alertas de presupuesto avisan, no detienen consumo. Firebase documenta spend caps para ciertos servicios, no para todos: no asumir que cubren Firestore. [Control de facturación](https://firebase.google.com/docs/projects/billing/avoid-surprise-bills).

TTL, PITR, backup, restauración y clonación nativos no incluyen uso gratuito. Definir recuperación viable y ensayada sin activar capacidades pagadas incidentalmente. Si el diseño no puede cumplir $0 con controles aceptables, informar el conflicto antes del despliegue; no degradar permisos ni integridad para ahorrar operaciones. El host y el uso de servidor Next.js permanecen por validar; no se declara gratuito un despliegue SSR solo por elegir Firestore.

## 3. Folder Structure

### 3.1 Árbol actual

```text
/
├── Migracion/                       # Paquete de contexto; ignorado por Git actualmente
│   ├── 01_CONTEXTO_Y_FUNCIONES.md    # Funciones y usuarios inferidos
│   ├── 02_REGLAS_Y_DATOS.md          # Invariantes, permisos y excepciones
│   ├── 03_INVENTARIO_REUTILIZACION.md
│   ├── 04_PLAN_TRANSICION.md
│   └── referencia/
│       ├── codigo/
│       │   ├── app/                 # Rutas, actions y endpoint CSV anteriores
│       │   ├── components/          # UI, formularios, tablas y horarios
│       │   ├── lib/                 # Supabase, validación, permisos y plantillas
│       │   ├── types/               # Tipos generados del SQL anterior
│       │   ├── tests/               # 17 archivos de prueba acoplados parcialmente al origen
│       │   └── public/              # Logos y cuadros de horario
│       ├── base-de-datos/migrations/ # 27 migraciones PostgreSQL de referencia
│       ├── documentacion/           # Análisis y decisiones anteriores
│       └── assets/                  # Imágenes y una hoja de cálculo; revisar privacidad
├── docs/                            # Esta suite y punto de entrada de la nueva etapa
├── .atl/                            # Registro local de habilidades; preexistente
└── README.md                        # Heredado; no usado como autoridad
```

El `.gitignore` contiene `/Migracion`: otras copias del repositorio pueden no disponer de estas fuentes. No retirar esa exclusión sin revisar datos y derechos. La inicialización de análisis creó `.codegraph/`, artefacto local de herramientas, no módulo de aplicación.

### 3.2 Estructura objetivo propuesta

```text
src/
├── app/                       # Composición de rutas, layouts, actions y handlers delgados
├── components/ui/             # Primitivas sin acceso a datos
├── features/<domain>/         # Componentes/formularios específicos del dominio
├── domain/<domain>/           # Entidades, reglas puras e invariantes
├── application/<domain>/      # Casos de uso y contratos de repositorio
├── infrastructure/firebase/   # SDK Web/Admin separados y adaptadores elegidos
├── lib/auth/                  # Sesión y política de acceso del servidor
└── lib/validation/            # DTO compartidos cuando exista reutilización real
tests/
├── unit/                      # Dominio y transformaciones
├── integration/               # Persistencia, permisos, concurrencia y auditoría
└── e2e/                       # Flujos de usuario
```

No crear carpetas vacías ni una interfaz por cada función. `firebase.json`, reglas e índices de Firestore deben incorporarse con configuración reproducible al implementar. El alias `@/*` del origen apunta a su raíz, no a `src`: actualizarlo explícitamente si se adopta este árbol.

## 4. Data Flow & Communication

### 4.1 Autenticación propuesta

1. El cliente obtiene identidad mediante Firebase Auth; no puede elegir rol ni activarse.
2. Un endpoint de sesión verifica el token y establece cookie segura con política CSRF.
3. Cada acción/consulta protegida verifica sesión, revocación pertinente, perfil activo y alcance.
4. La política de dominio decide permisos; redirección de rutas y navegación son solo UX.
5. El cierre elimina sesión local y aplica la política de invalidación acordada; cambios de rol deben invalidar privilegios obsoletos.

Las cookies de sesión son una capacidad documentada de [Firebase Authentication](https://firebase.google.com/docs/auth/admin/manage-cookies). Su implementación y duración no existen aún; definir `HttpOnly`, `Secure`, `SameSite`, expiración y protección CSRF en T08. No compartir caché privada entre usuarios.

### 4.2 Mutación crítica propuesta

`Formulario → Server Action → parseo Zod → identidad/ámbito → caso de uso → transacción → auditoría → resultado tipado → refresco de vista`.

La transacción debe comprobar el estado vigente de grupo, permisos relevantes, carga, perfiles, bloque y ocupación; confirmar asignación y auditoría juntas cuando sea viable. Revalidar las rutas afectadas después del commit, no antes. Rechazos dejan datos intactos; errores al cliente no exponen SQL, tokens ni detalles internos.

En Firestore, la función transaccional puede repetirse: no enviar correos, notificaciones ni mutar estado externo dentro del callback. Leer antes de escribir. Véase [transacciones oficiales](https://firebase.google.com/docs/firestore/manage-data/transactions).

### 4.3 Lecturas y reportes

- Consultas explícitamente filtradas por ámbito y ciclo, con paginación y proyección mínima.
- El CSV anterior es `GET /api/reportes/csv`; preservar propósito y filtros, revisar denegación explícita y seguridad de exportación en destino.
- Se inicia con datos nuevos; no habrá convivencia sincronizada, doble escritura ni importación del origen en el alcance confirmado.
- Cualquier proceso asíncrono debe tener estado observable, clave de idempotencia y recuperación. Activar un ciclo no puede dejar resultados parciales invisibles.

## 5. Database Schema & Models

### 5.1 Modelo relacional observado

Fuente: [`types/supabase.ts`](../Migracion/referencia/codigo/types/supabase.ts) y las [migraciones](../Migracion/referencia/base-de-datos/migrations). Los tipos facilitan lectura; la definición SQL más reciente gobierna constraints y excepciones.

| Dominio | Tablas | Campos/tipos y relaciones relevantes |
|---|---|---|
| Identidad | `users_profile`, `roles` | Identificador de identidad, rol y `active`; sesión Auth no equivale a permiso |
| Ámbito | `coordinators`, `coordinator_careers`, `coordinator_teachers` | Relaciones de coordinación con carreras/docentes; muchos a muchos |
| Oferta | `careers`, `subjects`, `class_requirements` | Materia por carrera/cuatrimestre; requisito enlaza materia y perfil |
| Docencia | `teachers`, `teacher_profiles`, `teacher_available_profiles` | `max_hours`, `assigned_hours`: number; `expediente_url`: string o null; perfiles disponibles |
| Ciclos | `academic_cycles` | `id`, `code`, `name`, `status`: string; `active`: boolean; fechas opcionales |
| Grupos | `groups`, `group_subjects` | Grupo → carrera/ciclo/cohorte/aula; grupo-materia → grupo/materia y horas planificadas |
| Horarios | `schedule_templates`, `schedule_blocks` | Bloques por plantilla, intervalos, modalidad/turno y módulo |
| Asignaciones | `assignments` | IDs de grupo-materia/docente/bloque; aula nullable; `duration_hours`: number; `status`: string |
| Seguimiento | `cohort_groups`, `cohort_subject_history` | Cohorte e historial; evitar incompatibilidad materia cursada/activa |
| Auditoría | `audit_logs` | Actor, operación, entidad y valores cuando corresponde; proteger lectura y retención |

IDs del origen se representan como strings UUID y fechas como strings en los tipos TS. Son referencia histórica: el destino tendrá identidades nuevas y contratos propios; no se requiere mapear registros anteriores. No copiar todos los `status: string` como ausencia de restricciones: existen reglas en SQL/acciones.

### 5.2 Modelo documental propuesto para Firestore elegido

| Colección propuesta | Identidad y forma | Consultas / control requerido |
|---|---|---|
| `userProfiles/{uid}` | Rol, activo y vínculos de ámbito; sin contraseñas | Perfil por UID; cambios solo por caso de uso autorizado |
| `careers`, `subjects`, `teachers`, `teacherProfiles`, `classrooms` | Documentos por ID nuevo estable | Catálogos filtrados; asociaciones acotadas o documentos de vínculo |
| `coordinatorCareers`, `coordinatorTeachers` | ID determinista por pareja | Unicidad y consultas por coordinador/recurso |
| `subjectRequirements`, `teacherAvailableProfiles` | Vínculos explícitos | Evitar arrays de crecimiento ilimitado |
| `academicCycles`, `groups`, `groupSubjects` | Referencias por ID y versión de esquema | Grupos por ciclo/carrera/estado; materias por grupo |
| `scheduleTemplates`, `scheduleBlocks` | Intervalos normalizados y módulo nullable | Modalidad/turno/activo; comparar intervalo real, no solo ID de bloque |
| `assignments` | Referencias, duración, estado, actor y timestamps | Por ciclo/docente/grupo/aula; cancelación libera reservas |
| `cohorts`, `cohortSubjectHistory` | Cohorte e historial separados | Consulta por cohorte/materia; unicidad e idempotencia |
| `auditEvents` | Evento inmutable con actor y operación correlacionada | Escritura servidor; lectura restringida; política de retención pendiente |
| `consistencyGuards`, `operationKeys` | Versiones de coordinación y solicitudes idempotentes | Propuesta para serializar invariantes; validar contención en T05 |

Esta es una hipótesis de adaptación, **no correspondencia automática tabla→colección**. La selección de nombres, campos, índices y desnormalización se cierra con consultas reales. Fechas de auditoría: timestamp de servidor; intervalos: representación y zona horaria acordadas; horas: unidad exacta definida para evitar acumulación inconsistente de decimales. No importar IDs, contraseñas ni historial anterior. Versionar el esquema y cualquier transformación futura de los nuevos datos.

### 5.3 Concurrencia e índices

Una consulta «no hay conflictos» seguida de `add()` no asegura exclusión. Todas las rutas de escritura que afecten una invariante deben leer y modificar los mismos documentos de consistencia dentro de la transacción, incluidos edición, cancelación y cambios de estado/carga/perfil relevantes.

Hipótesis inicial: guardas por ciclo y recurso con orden determinista; comparar intervalos y módulos dentro del conjunto protegido. Si se conserva temporalmente una guarda global, medir contención: favorece consistencia, limita paralelismo. No reemplazarla por reservas de IDs de bloque, porque dos bloques distintos pueden solaparse. Cualquier partición posterior debe probar su cobertura de cruces.

Índices candidatos a justificar por consulta: grupos `(cycleId, careerId, status)`; asignaciones `(cycleId, teacherId, status)` y equivalentes de grupo/aula; historial `(cohortId, subjectId)`; auditoría `(entityId, createdAt)`. No declararlos existentes ni garantizar soporte sin prueba. Evaluar volumen de lecturas, tamaño de agregados y límites vigentes antes de diseñar la activación masiva de ciclos.

## 6. Security & Scalability Considerations

| Área | Observado en origen | Requisito/propuesta para destino |
|---|---|---|
| Autorización | Helpers, RLS y funciones SQL | Política servidor por acción/recurso; negar por defecto; pruebas negativas |
| Privilegios | Acciones administrativas con cliente privilegiado | SDK Admin aislado; IAM mínimo; actor humano explícito en auditoría |
| Firestore Rules | No existen | Si no hay acceso directo, denegarlo; si lo hay, reglas específicas y pruebas |
| Validación | Zod, validadores puros, constraints y triggers | Validar entrada y estado persistido; controles atómicos |
| Secretos | Paquete declara excluir `.env` | Variables server-only y credenciales de servicio fuera de Git y del bundle cliente |
| CORS / CSRF | `allowedDevOrigins` y límite Actions 2 MB | No es CORS general; definir orígenes/cookies/CSRF por endpoint y host |
| Auditoría | Triggers y actor de escrituras privilegiadas | Evento duradero, correlación e integridad con la mutación; no confiar solo en logs de consola |
| Escala | SQL serializa asignaciones | Medir contención, paginar, limitar payloads, medir costo por operación |
| Historial | Cancelación y conservación de referencias | Desactivar catálogos sin romper consultas históricas |
| Datos personales | Paquete sin auditoría exhaustiva de privacidad | Inventario, clasificación, retención y autorización de exportación |

**Punto crítico:** las bibliotecas servidor de Firestore omiten Security Rules; necesitan IAM y autorización en aplicación. Por tanto, escribir Rules no protege automáticamente Server Actions que usan Admin. [Fuente oficial](https://firebase.google.com/docs/firestore/security/rules-conditions).

Separación de entornos, logs sin datos sensibles, alertas de fallos/costos y recuperación ensayada son requisitos de preparación, no capacidades actuales; su implementación debe respetar las cuotas y no activar servicios pagados sin decisión explícita. App Check puede evaluarse como defensa adicional, nunca como sustituto de identidad/rol.

## Evidencia técnica y límites

- [Acciones de asignación](../Migracion/referencia/codigo/app/(dashboard)/actions/asignaciones.ts), [guardas de grupo](../Migracion/referencia/codigo/app/(dashboard)/actions/group-guards.ts), [validación pura](../Migracion/referencia/codigo/lib/validations/assignments.ts).
- [Integridad y atomicidad SQL](../Migracion/referencia/base-de-datos/migrations/202607211400_integrity_and_atomicity_hardening.sql), [seguridad SQL](../Migracion/referencia/base-de-datos/migrations/202607211300_security_and_consistency_hardening.sql).
- Documentación Firebase consultada el 2026-11-11; verificar límites/precios/versiones al implementar. No se usaron credenciales, base activa ni mediciones de carga.
