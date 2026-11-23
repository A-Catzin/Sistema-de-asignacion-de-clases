# Plan de desarrollo y transición

![Estado: preparación](https://img.shields.io/badge/estado-preparación-blue) ![Migración implementada: 0%](https://img.shields.io/badge/migración_implementada-0%25-lightgrey)

| Métrica | Valor al 2026-11-23 |
|---|---|
| Versión documental | 1.3.0 |
| Total de tareas | 30 |
| Completed | 6 |
| In Progress | 0 |
| Not Started | 24 |
| Avance por conteo del plan completo | 6/30 = 20,0% |
| Implementación de aplicación destino | Prototipo T05 verificado en emulador (38 pruebas); listo para crear aplicación base en T06 |

Los entregables terminados son **la Fase 0 completa (T00–T03), la selección de Firestore (T04) y la vertical técnica de integridad/autorización/ciclos (T05)**. El porcentaje no representa esfuerzo ni funcionalidades migradas a la app Web final. Las funciones de referencia no cuentan como tareas Firebase terminadas. Se trabaja hasta terminar el proyecto completo; las fases no son entregas MVP. Se inicia con datos nuevos y reglas anteriores. Presupuesto objetivo: $0; Blaze permitido sin autorización de cargos.

**Estados permitidos:** `Completed`, `In Progress`, `Not Started`. Cambiar un estado requiere evidencia; estar bloqueada no significa estar en progreso. Registrar el bloqueo en Notas. Prioridades Alta/Media/Baja son propuestas y deben validarse institucionalmente.

Fuentes: [PRD](PRD.md), [arquitectura](ARCHITECTURE.md), [plan de origen](../Migracion/04_PLAN_TRANSICION.md). Cada tarea incluye su dependencia en notas. Los criterios de aceptación de fases son controles de salida, no capacidades ya implementadas.

Para revisar avances ejecutables, consultar el [plan de MVP interno y demostraciones](MVP.md). Agrupa estas tareas sin reemplazar sus estados ni convertir los hitos en lanzamientos a producción.

## Fase 0 — Base documental y definición

| ID | Tarea | Prioridad | Estado | Notas / Entregable |
|---|---|---|---|---|
| T00 | Analizar referencia y crear suite modular | Alta | Completed | Seis documentos en `docs/`; distinción observado/propuesto/pendiente, enlaces y consistencia estructural revisados. Sin pruebas de runtime |
| T01 | Validar casos de aceptación del alcance completo | Alta | Completed | Dep. T00. [Matriz de 40 casos](ACCEPTANCE.md) y matriz confirmada por operación y rol, incluida la consulta general de solo lectura de horarios definidos (`final`/`archived`) para todo usuario autenticado sin agregar `Clave` ni `Créditos` a materias. La ejecución en la aplicación destino queda en T06–T26 y UAT en T26/T29. |
| T02 | Acordar restricciones y responsables | Alta | Completed | Dep. T01. Presupuesto $0, zona horaria de Cancún, ~30 usuarios totales (6 habituales simultáneos, picos 10–20) y 1 000–1 300 grupos activos por ciclo en ventanas pico de ~1 semana (noviembre, febrero/marzo y agosto/septiembre). Navegadores: Chrome/Edge actuales en computadora (prioritario) y Chrome/Safari en celular. Respaldo compatible con $0: exportación diaria en semanas pico y semanal el resto del ciclo (RPO ≤ 24 h; recuperación mismo día hábil, a ensayar en T28). Sin fechas fijas; el solicitante validará el MVP interno y designará la aprobación formal de producción antes de T29. |
| T03 | Especificar reglas preservadas y revisar privacidad del paquete | Alta | Completed | Dep. T01. Reglas y excepciones confirmadas (AC04, AC22, AC26, AC31) más consulta general de solo lectura de horarios `final`/`archived` para usuarios autenticados (aislamiento estricto en `draft`/`review`). Contratos limpios por iniciar con datos nuevos: estados de grupo `draft|review|final|archived` (sin `active` heredado), módulos `0|1|2` y materias sin `Clave`/`Créditos`. Paquete `/Migracion` y su hoja de cálculo permanecen excluidos de Git, sin importación ni publicación. |

**Salida:** alcance completo confirmado, detalles operativos cuantificables y excepciones documentadas. No publicar contenidos de `/Migracion` para conseguir esta aprobación.

## Fase 1 — Arquitectura, Setup & Environment

| ID | Tarea | Prioridad | Estado | Notas / Entregable |
|---|---|---|---|---|
| T04 | Seleccionar persistencia dentro de Firebase | Alta | Completed | El usuario aceptó Firestore tras confirmar presupuesto $0. SQL Connect descartado por costo recurrente de Cloud SQL; ADR-003 actualizado. Esquema y pruebas siguen en T05 |
| T05 | Probar vertical crítica de integridad | Alta | Completed | Dep. T01–T04 cerradas. [Prototipo local](../prototypes/assignment-integrity/README.md) con 12 pruebas puras (8 de dominio + 4 de autorización) y 26 del emulador aprobadas (20 de integridad con 3 guardas de proyección mínima + 2 de permisos/auditoría atómica + 4 de activación de ciclos e idempotencia ante reintentos, concurrencia y fallo parcial, cubriendo D0/AC21/AC30). Medido con `measure-t05.ts`: 4 lecturas / 5 escrituras por alta con aula y auditoría; 6 y 20 escrituras disjuntas sin abortos y 6 en conflicto sobre la misma aula con 1 ganadora; ~16 900 escrituras/día proyectadas para 1 300 grupos × 13 bloques en 5 días (<20 000 gratuitas); proyección mínima de aula en 81 B/entrada (~32,0 KB por 390 bloques, ~32,78 ciclos hasta 1 MiB). |
| T06 | Crear aplicación y entorno reproducible | Alta | Not Started | Dep. T05 aprobado. Manifest/lockfile raíz, Next/TS, variables de ejemplo sin secretos, adaptador elegido, emuladores y comandos; no copiar scripts faltantes |

**Salida:** diseño probado, instalación y entorno local documentados. Ningún recurso remoto se crea sin autorización de destino, operación y sesión.

## Fase 2 — Auth, permisos y auditoría

| ID | Tarea | Prioridad | Estado | Notas / Entregable |
|---|---|---|---|---|
| T07 | Implementar autenticación Firebase | Alta | Not Started | Dep. T06. Inicio/cierre de sesión; SDK Web/Admin separados; identidad verificada |
| T08 | Implementar sesión segura de servidor | Alta | Not Started | Dep. T07. Cookies, CSRF, expiración, revocación y política de cambios de privilegios; pruebas de sesiones inválidas |
| T09 | Implementar aprovisionamiento administrativo | Alta | Not Started | Dep. T08. Solo administrador autorizado asigna rol/activación; cuenta nueva no obtiene privilegios por metadatos |
| T10 | Implementar política por rol y ámbito | Alta | Not Started | Dep. T08–T09. Matriz de lectura/escritura para cuenta activa, carrera/docente y condiciones de turno; denegación directa y reglas/IAM pertinentes |
| T11 | Implementar auditoría duradera | Alta | Not Started | Dep. T10. Catálogo de eventos, actor humano, timestamps, correlación y permisos; atomicidad con mutaciones cuando corresponda |

**Salida:** pruebas positivas/negativas para admin/coordinator y accesos sin sesión/inactivos/ajenos. No considerar Rules suficientes para operaciones Admin.

## Fase 3 — Catálogos y planeación base

| ID | Tarea | Prioridad | Estado | Notas / Entregable |
|---|---|---|---|---|
| T12 | Migrar oferta académica y requisitos | Alta | Not Started | Dep. T10–T11. Carreras, materias, perfiles, vínculos y validación de relaciones; filtros por ámbito |
| T13 | Migrar docentes y control de carga | Alta | Not Started | Dep. T12. Perfiles disponibles, responsable, horas máximas y lectura de carga; no introducir carga de expedientes sin alcance |
| T14 | Migrar aulas, plantillas y bloques | Alta | Not Started | Dep. T12. Modalidad/turno, intervalos y módulos; catálogos inactivos conservan referencias históricas |
| T15 | Migrar ciclos, grupos y materias del grupo | Alta | Not Started | Dep. T12–T14. Estados editables y cerrados; revisar `active` heredado; preservar excepciones T03 |

**Salida:** entidades consultables/editables por usuarios autorizados y relaciones consistentes. Este bloque no incluye todavía avance automático de cohortes.

## Fase 4 — Asignaciones, concurrencia y cohortes

| ID | Tarea | Prioridad | Estado | Notas / Entregable |
|---|---|---|---|---|
| T16 | Implementar alta, edición y cancelación de asignaciones | Alta | Not Started | Dep. T15. Perfiles compatibles, carga, aula efectiva, estados y unicidad activa; cancelación conserva historia |
| T17 | Probar y endurecer exclusión concurrente | Alta | Not Started | Dep. T16. Dos solicitudes incompatibles: solo una confirma; casos docente/grupo/aula, edición/cancelación, bloques solapados y módulos; verificar persistencia y auditoría |
| T18 | Migrar cohortes e historial | Alta | Not Started | Dep. T15. Alcance/carrera/cuatrimestre, historia manual y materias cursadas; evitar incompatibilidad con materias activas |
| T19 | Implementar activación y avance idempotente | Alta | Not Started | Dep. T17–T18. Repetir activación sin duplicados; recuperación de fallo parcial y límites de transacción documentados |

**Salida:** paridad de las reglas enumeradas en [PRD §5](PRD.md#5-core-features--alcance-completo-y-ampliaciones-no-comprometidas) con evidencia de servidor/persistencia, no solo validación de formulario.

## Fase 5 — Interfaz, horarios y reportes

| ID | Tarea | Prioridad | Estado | Notas / Entregable |
|---|---|---|---|---|
| T20 | Adaptar navegación, paneles y horarios | Media | Not Started | Dep. T16, T18–T19. Reusar primitivas y tokens; vista general de solo lectura de horarios definidos (`final`/`archived`) de toda la universidad por grupo y día con los campos existentes (sin `Clave`/`Créditos`), tema claro/oscuro, estados de carga/error/vacío y accesibilidad; corregir aliases CSS con prueba |
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

**Siguiente acción recomendada:** iniciar **T06 (D1 · Primera demo local)** creando la aplicación base reproducible en Next.js/TypeScript con emuladores Firebase configurados localmente (sin crear recursos remotos ni copiar scripts faltantes).

## Criterio de actualización

**Dimensionamiento de T02:** el ejemplo de horario entre semana contiene 5 materias y 13 bloques semanales. En sabatino se reportaron grupos con 2 o 3 materias, con variación. Los módulos sabatinos 1 y 2 se definen por fechas específicas del mismo cuatrimestre; se difirió decidir si esas fechas son comunes o varían por carrera o grupo. Retomar esa decisión al diseñar el calendario de T14; véase [SRS](SRS.md), PD-06.

- Una tarea solo pasa a Completed cuando tiene entregable y checks observados; registrar referencia de cambio y resultado en notas.
- Actualizar los cuatro conteos y los porcentajes cuando cambie un estado.
- Si cambia alcance, editar PRD y dependencias antes de estimar fechas.
- Conservar una única fuente de progreso aquí; MEMORY resume y enlaza, no mantiene un segundo backlog contradictorio.
- Este plan no asigna horas, fechas ni compromete funciones futuras sin validación de T01/T02.
