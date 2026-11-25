# Plan de desarrollo y transición

![Estado: preparación](https://img.shields.io/badge/estado-preparación-blue) ![Migración implementada: 0%](https://img.shields.io/badge/migración_implementada-0%25-lightgrey)

| Métrica | Valor al 2026-11-23 |
|---|---|
| Versión documental | 1.3.0 |
| Total de tareas | 30 |
| Completed | 15 |
| In Progress | 0 |
| Not Started | 15 |
| Avance por conteo del plan completo | 15/30 = 50,0% |
| Implementación de aplicación destino | Fases 0–2 y T12–T14 (oferta académica, docentes/carga y recursos horarios) verificadas localmente; siguiente: T15 (ciclos, grupos y materias del grupo) |

Los entregables terminados son **Fases 0–2 completas (T00–T11) y T12–T14 de Fase 3 (oferta académica, docentes/carga y recursos horarios)**. El porcentaje no representa esfuerzo ni funcionalidades migradas a la app Web final. Las funciones de referencia no cuentan como tareas Firebase terminadas. Se trabaja hasta terminar el proyecto completo; las fases no son entregas MVP. Se inicia con datos nuevos y reglas anteriores. Presupuesto objetivo: $0; Blaze permitido sin autorización de cargos.

**Estados permitidos:** `Completed`, `In Progress`, `Not Started`. Cambiar un estado requiere evidencia; estar bloqueada no significa estar en progreso. Registrar el bloqueo en Notas. Prioridades Alta/Media/Baja son propuestas y deben validarse institucionalmente.

Fuentes: [PRD](PRD.md), [arquitectura](ARCHITECTURE.md), [plan de origen](../Migracion/04_PLAN_TRANSICION.md). Cada tarea incluye su dependencia en notas. Los criterios de aceptación de fases son controles de salida, no capacidades ya implementadas.

Para revisar avances ejecutables, consultar el [plan de MVP interno y demostraciones](MVP.md). Agrupa estas tareas sin reemplazar sus estados ni convertir los hitos en lanzamientos a producción.

## Fase 0 — Base documental y definición

| ID | Tarea | Prioridad | Estado | Notas / Entregable |
|---|---|---|---|---|
| T00 | Analizar referencia y crear suite modular | Alta | Completed | Seis documentos en `docs/`; distinción observado/propuesto/pendiente, enlaces y consistencia estructural revisados. Sin pruebas de runtime |
| T01 | Validar casos de aceptación del alcance completo | Alta | Completed | Dep. T00. [Matriz de 40 casos](ACCEPTANCE.md) y matriz confirmada por operación y rol, incluida la consulta general de solo lectura de horarios definidos (`final`/`archived`) para todo usuario autenticado, incorporando `Clave` en materias (sin `Créditos`). La ejecución en la aplicación destino queda en T06–T26 y UAT en T26/T29. |
| T02 | Acordar restricciones y responsables | Alta | Completed | Dep. T01. Presupuesto $0, zona horaria de Cancún, ~30 usuarios totales (6 habituales simultáneos, picos 10–20) y 1 000–1 300 grupos activos por ciclo en ventanas pico de ~1 semana (noviembre, febrero/marzo y agosto/septiembre). Navegadores: Chrome/Edge actuales en computadora (prioritario) y Chrome/Safari en celular. Respaldo compatible con $0: exportación diaria en semanas pico y semanal el resto del ciclo (RPO ≤ 24 h; recuperación mismo día hábil, a ensayar en T28). Sin fechas fijas; el solicitante validará el MVP interno y designará la aprobación formal de producción antes de T29. |
| T03 | Especificar reglas preservadas y revisar privacidad del paquete | Alta | Completed | Dep. T01. Reglas y excepciones confirmadas (AC04, AC22, AC26, AC31) más consulta general de solo lectura de horarios `final`/`archived` para usuarios autenticados (aislamiento estricto en `draft`/`review`). Contratos limpios por iniciar con datos nuevos: estados de grupo `draft|review|final|archived` (sin `active` heredado), módulos `0|1|2` con fechas específicas por ciclo más opción para casos especiales (PD-06), y materias con `Clave` única por carrera (sin `Créditos`). Paquete `/Migracion` y su hoja de cálculo permanecen excluidos de Git, sin importación ni publicación. |

**Salida:** alcance completo confirmado, detalles operativos cuantificables y excepciones documentadas. No publicar contenidos de `/Migracion` para conseguir esta aprobación.

## Fase 1 — Arquitectura, Setup & Environment

| ID | Tarea | Prioridad | Estado | Notas / Entregable |
|---|---|---|---|---|
| T04 | Seleccionar persistencia dentro de Firebase | Alta | Completed | El usuario aceptó Firestore tras confirmar presupuesto $0. SQL Connect descartado por costo recurrente de Cloud SQL; ADR-003 actualizado. Esquema y pruebas siguen en T05 |
| T05 | Probar vertical crítica de integridad | Alta | Completed | Dep. T01–T04 cerradas. [Prototipo local](../prototypes/assignment-integrity/README.md) con 12 pruebas puras (8 de dominio + 4 de autorización) y 26 del emulador aprobadas (20 de integridad con 3 guardas de proyección mínima + 2 de permisos/auditoría atómica + 4 de activación de ciclos e idempotencia ante reintentos, concurrencia y fallo parcial, cubriendo D0/AC21/AC30). Medido con `measure-t05.ts`: 4 lecturas / 5 escrituras por alta con aula y auditoría; 6 y 20 escrituras disjuntas sin abortos y 6 en conflicto sobre la misma aula con 1 ganadora; ~16 900 escrituras/día proyectadas para 1 300 grupos × 13 bloques en 5 días (<20 000 gratuitas); proyección mínima de aula en 81 B/entrada (~32,0 KB por 390 bloques, ~32,78 ciclos hasta 1 MiB). |
| T06 | Crear aplicación y entorno reproducible | Alta | Completed | Dep. T05 aprobado. `package.json`/`package-lock.json` raíz, Next.js 16/TypeScript strict, Tailwind con tokens `muted-foreground` y `line-subtle` (K07), SDK Web/Admin separados (`server-only`), `firebase.json` + `firestore.rules` (`allow read, write: if false;`), variables locales de emulador sin secretos documentadas en [LOCAL_DEV](LOCAL_DEV.md). Verificado: `typecheck`, `lint`, `vitest` (5/5), `next build` y arranque vivo D1 conectado a emuladores Auth (`127.0.0.1:9099`) y Firestore (`127.0.0.1:8080`) con `/api/health` y `/` en HTTP 200. |

**Salida:** diseño probado, instalación y entorno local documentados. Ningún recurso remoto se crea sin autorización de destino, operación y sesión.

## Fase 2 — Auth, permisos y auditoría

| ID | Tarea | Prioridad | Estado | Notas / Entregable |
|---|---|---|---|---|
| T07 | Implementar autenticación Firebase | Alta | Completed | Dep. T06. Inicio/cierre de sesión en `/login` y `/dashboard` (`src/features/auth/`); SDK Web en memoria (`src/infrastructure/firebase/client.ts`) separado del SDK Admin (`server-only`); verificación de `idToken` fresco y perfil activo en `userProfiles/{uid}` sin autoaprovisionamiento. Verificado con `typecheck`, `lint`, `vitest` (11/11) y prueba viva contra Auth Emulator (`npm run test:auth:emulator`). |
| T08 | Implementar sesión segura de servidor | Alta | Completed | Dep. T07. Cookie `__session` (`HttpOnly`, `SameSite=Lax`, `Secure` fuera de loopback, persistente 5 días) en `/api/auth/session`, política CSRF (`X-Requested-With`, `Sec-Fetch-Site`, `Origin`/`Host`), limpieza segura de cookies vencidas vía `/api/auth/clear` (sin logout-CSRF) con aviso informativo en `/login`, comprobación `checkRevoked: true`, revocación al salir e invalidación inmediata por cuenta inactiva o `privilegesUpdatedAtMs`. Verificadas 6 pruebas unitarias (`tests/unit/auth-session.test.ts`) y batería viva en emulador (`tests/integration/auth-session.integration.ts`: sin sesión, cookie vencida/forjada con limpieza en `/api/auth/clear`, protección contra logout-CSRF, CSRF en POST/DELETE, sin perfil/inactivo, sesión válida, desactivación y cambio de privilegios en curso, y rechazo tras revocación). |
| T09 | Implementar aprovisionamiento administrativo | Alta | Completed | Dep. T08. Servicio de aprovisionamiento (`src/application/users/provisioning.ts`), rutas protegidas `/api/admin/users`, `/api/admin/users/[uid]`, `/api/admin/coordinators/[uid]/scope` y panel `/admin`. Solo administrador activo crea/actualiza cuentas, reemplaza ámbito `coordinatorCareers`/`coordinatorTeachers`, revoca tokens al cambiar privilegios, evita autobloqueo de administrador y bloquea bootstrap duplicado (`systemBootstrap/initialAdmin`); cuenta nueva sin aprovisionamiento queda denegada. Verificado con `typecheck`, `lint`, `vitest` (18/18), `next build` y prueba viva `npm run test:provisioning:emulator`. |
| T10 | Implementar política por rol y ámbito | Alta | Completed | Dep. T08–T09. Política pura completa de la matriz T01/T03 (`src/domain/auth/authorization-policy.ts`) + cargador de ámbito en servidor (`src/lib/auth/server-scope.ts`) y denegación directa por `requireActiveAdmin` y `/admin`: cubre `admin` vs `coordinator`, carreras/docentes vinculados, bloques personalizados propios, modalidad/turno, grupos `draft`/`review` aislados vs consulta general de solo lectura en `final`/`archived`, excepciones AC22/AC26 y cierre total de mutaciones en grupos finalizados/archivados. Verificadas 7 pruebas unitarias (`tests/unit/authorization-policy.test.ts`) y denegaciones reales en `tests/integration/provisioning-and-scope.integration.ts`. |
| T11 | Implementar auditoría duradera | Alta | Completed | Dep. T10. Catálogo tipado (`src/domain/audit/audit-catalog.ts`) con sanitización recursiva de secretos/contraseñas/tokens, repositorio inmutable `batch.create`/`tx.create` (`src/infrastructure/audit/audit-store.ts`), atomicidad integrada en mutaciones de aprovisionamiento (`user.provision`, `user.update`, `user.bootstrap`, `coordinator.scope.replace`) con reversión ante fallo y endpoint `GET /api/admin/audit` restringido a `admin` activo. Verificado con `typecheck`, `lint`, `vitest` (21/21, incl. `tests/unit/audit-catalog.test.ts`), `next build` y `npm run test:provisioning:emulator` (correlación, actor humano, transiciones before/after, cero secretos y cero eventos fantasma ante rechazos). |

**Salida:** pruebas positivas/negativas para admin/coordinator y accesos sin sesión/inactivos/ajenos. No considerar Rules suficientes para operaciones Admin.

## Fase 3 — Catálogos y planeación base

| ID | Tarea | Prioridad | Estado | Notas / Entregable |
|---|---|---|---|---|
| T12 | Migrar oferta académica y requisitos | Alta | Completed | Dep. T10–T11. Dominio puro de oferta, `Clave` de materia normalizada y compatibilidad AC05/AC06 (`src/domain/academic/academic-offer.ts`), servicio transaccional con llaves únicas (`careerCodes`, `subjectCodes` por carrera, `subjectKeys`) y auditoría atómica (`src/application/academic/offer-service.ts`), rutas `/api/academic/{profiles,careers,subjects,subjects/[id]}` y vista `/carreras` con `Clave` (sin `Créditos`). Validación relacional de carreras/perfiles, filtros por ámbito para coordinador y ajuste de horas base permitido en su carrera. Verificado con `typecheck`, `lint`, `vitest` (25/25, incl. `tests/unit/academic-offer.test.ts`), `next build` y `npm run test:academic:emulator`. |
| T13 | Migrar docentes y control de carga | Alta | Completed | Dep. T12. Dominio puro de docentes, tope `maxHours` ≥ horas activas y desglose por coordinador sin filtrar grupos ajenos AC18/RN-04/AC31 (`src/domain/teachers/teacher-catalog.ts`), servicio transaccional con `teacherNames`, `teacherAvailableProfiles`, `coordinatorTeachers` y auditoría atómica (`src/application/teachers/teacher-service.ts`), rutas `/api/teachers` y `/api/teachers/[id]` y vista `/docentes` sin campo de expedientes. Verificado con `typecheck`, `lint`, `vitest` (29/29, incl. `tests/unit/teachers.test.ts`), `next build` y `npm run test:teachers:emulator`. |
| T14 | Migrar aulas, plantillas y bloques | Alta | Completed | Dep. T12. Dominio puro de intervalos, módulos `0|1|2`, coexistencia RN-02 y resolución de fechas de módulo con sobrescritura para casos especiales PD-06 (`src/domain/schedules/schedule-catalog.ts`), servicio transaccional con preservación histórica de inactivos RN-05 y aislamiento de bloques personalizados por creador AC09 (`src/application/schedules/schedule-service.ts`), rutas `/api/schedules/{classrooms,classrooms/[id],templates,blocks,blocks/[id]}` y vista `/aulas`. Verificado con `typecheck`, `lint`, `vitest` (34/34, incl. `tests/unit/schedules.test.ts`), `next build` y `npm run test:schedules:emulator`. |
| T15 | Migrar ciclos, grupos y materias del grupo | Alta | Not Started | Dep. T12–T14. Fechas específicas predeterminadas de módulos 1 y 2 en el ciclo más opción de fecha especial; estados `draft|review|final|archived` (sin `active` heredado); preservar `Clave` en materias del grupo y excepciones T03 |

**Salida:** entidades consultables/editables por usuarios autorizados y relaciones consistentes. Este bloque no incluye todavía avance automático de cohortes.

## Fase 4 — Asignaciones, concurrencia y cohortes

| ID | Tarea | Prioridad | Estado | Notas / Entregable |
|---|---|---|---|---|
| T16 | Implementar alta, edición y cancelación de asignaciones | Alta | Not Started | Dep. T15. Perfiles compatibles, carga, aula efectiva, estados, unicidad activa y opción de fecha especial para casos particulares de módulo; cancelación conserva historia |
| T17 | Probar y endurecer exclusión concurrente | Alta | Not Started | Dep. T16. Dos solicitudes incompatibles: solo una confirma; casos docente/grupo/aula, edición/cancelación, bloques solapados y módulos; verificar persistencia y auditoría |
| T18 | Migrar cohortes e historial | Alta | Not Started | Dep. T15. Alcance/carrera/cuatrimestre, historia manual y materias cursadas; evitar incompatibilidad con materias activas |
| T19 | Implementar activación y avance idempotente | Alta | Not Started | Dep. T17–T18. Repetir activación sin duplicados; recuperación de fallo parcial y límites de transacción documentados |

**Salida:** paridad de las reglas enumeradas en [PRD §5](PRD.md#5-core-features--alcance-completo-y-ampliaciones-no-comprometidas) con evidencia de servidor/persistencia, no solo validación de formulario.

## Fase 5 — Interfaz, horarios y reportes

| ID | Tarea | Prioridad | Estado | Notas / Entregable |
|---|---|---|---|---|
| T20 | Adaptar navegación, paneles y horarios | Media | Not Started | Dep. T16, T18–T19. Reusar primitivas y tokens; vista general de solo lectura de horarios definidos (`final`/`archived`) de toda la universidad por grupo y día incluyendo `Clave` de materia y fechas de módulo aplicables (sin `Créditos`), tema claro/oscuro, estados de carga/error/vacío y accesibilidad; corregir aliases CSS con prueba |
| T21 | Migrar reportes, CSV y datos incompletos | Alta | Not Started | Dep. T20. Filtros por ámbito; paridad de conteos; autorización de endpoint; revisar escape y tratamiento seguro de contenido exportado |

**Salida:** aceptación de recorridos reales y exportaciones consistentes; UI no presenta acceso indebido ni confirma cambios rechazados.

## Fase 6 — Inicialización de datos y cuentas nuevos

| ID | Tarea | Prioridad | Estado | Notas / Entregable |
|---|---|---|---|---|
| T22 | Definir datos iniciales nuevos | Alta | Not Started | Dep. T01–T03. Catálogos necesarios, responsables de captura, volúmenes estimados y validaciones. No consultar producción anterior ni importar registros/historial |
| T23 | Preparar cuentas nuevas y administrador inicial | Alta | Not Started | Dep. T09, T22. Bootstrap controlado, roles y activación; probar que no pueda repetirse para escalar privilegios. Sin traslado de hashes/cuentas ni secretos en fixtures |
| T24 | Ensayar inicialización limpia y captura de datos | Alta | Not Started | Dep. T19, T21–T23. Fixtures sintéticos y captura autorizada de catálogos nuevos; referencias válidas, reintentos sin duplicados y reinicio de pruebas aislado. Sin migración de datos anteriores |

**Salida:** cuentas nuevas y catálogos iniciales coherentes con captura segura. No se requiere exportación, conciliación origen-destino, traslado de contraseñas ni convivencia con el sistema anterior.

## Fase 7 — Testing, Deployment y corte

| ID | Tarea | Prioridad | Estado | Notas / Entregable |
|---|---|---|---|---|
| T25 | Consolidar suites y calidad automatizada | Alta | Not Started | Dep. T06; cierre tras T24. Unitarias, integración, permisos, concurrencia y E2E adaptadas; lint, tipos, build; CI con fixtures seguros y sin producción |
| T26 | Validar carga, costo y aceptación institucional | Alta | Not Started | Dep. T24–T25. Medir p95 y operaciones; comprobar objetivo $0 y margen de cuotas de todos los servicios; no declarar costo cero garantizado; UAT por responsables; auditoría de accesibilidad pertinente |
| T27 | Preparar despliegue y observabilidad | Alta | Not Started | Dep. T04, T06, T10, T25. Validar hosting/ejecución compatibles con arquitectura y objetivo $0, incluyendo builds/artefactos/logs; región, IAM, secretos y controles de consumo. Si no es viable, resolver antes de desplegar; autorización remota explícita |
| T28 | Ensayar restauración y reversión | Alta | Not Started | Dep. T24, T27. Runbook para nuevos datos con responsables, RPO/RTO y criterios; recuperación ensayada compatible con objetivo $0. No asumir gratuitos backup/PITR/restauración nativos de Firestore |
| T29 | Ejecutar puesta en marcha y estabilización autorizadas | Alta | Not Started | Dep. T26–T28. Aprobación explícita, datos/cuentas nuevos, recuperación probada, controles de consumo y monitoreo. No hay corte ni retiro de origen dentro de este alcance |

**Salida:** todas las puertas de aceptación del proyecto completo aprobadas con evidencia y responsable. La publicación ni los cargos están autorizados por la creación de estos documentos.

## Ruta crítica y trabajo inmediato

`T01–T03 + T04 confirmado → T05 → T06 → T07–T11 → dominios → integridad/cohortes → inicialización nueva → aceptación/recuperación → T29`.

T22 puede adelantarse con responsables de captura y no requiere esperar toda la UI; no implica acceso al origen. T25 debe crecer con cada módulo, no empezar al final; el estado global seguirá pendiente hasta configurar el entorno. T27 puede prepararse antes de UAT, pero no habilita el corte por sí sola.

**Siguiente acción recomendada:** iniciar **T15** (migrar ciclos escolares con fechas predeterminadas de módulos 1 y 2, grupos `draft|review|final|archived` y materias del grupo con excepciones T03).

## Criterio de actualización

**Dimensionamiento de T02:** el ejemplo de horario entre semana contiene 5 materias y 13 bloques semanales. En sabatino se reportaron grupos con 2 o 3 materias, con variación. Los módulos 1 y 2 usan las mismas fechas específicas predeterminadas a nivel del ciclo escolar, con una opción para registrar fechas personalizadas en casos especiales; véase [SRS](SRS.md), PD-06.

- Una tarea solo pasa a Completed cuando tiene entregable y checks observados; registrar referencia de cambio y resultado en notas.
- Actualizar los cuatro conteos y los porcentajes cuando cambie un estado.
- Si cambia alcance, editar PRD y dependencias antes de estimar fechas.
- Conservar una única fuente de progreso aquí; MEMORY resume y enlaza, no mantiene un segundo backlog contradictorio.
- Este plan no asigna horas, fechas ni compromete funciones futuras sin validación de T01/T02.
