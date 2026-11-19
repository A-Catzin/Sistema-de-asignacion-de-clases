# Matriz de aceptación del sistema completo

Fecha: 2026-11-12. Preparación de T01; ningún caso se declara ejecutado o aprobado.
Objetivo: conservar las reglas del origen y convertir los requisitos F01–F12 del [PRD](PRD.md) en comprobaciones observables para el destino Firestore.

## Cómo utilizarla

- **Paridad:** regla observada estáticamente en SQL o acciones de referencia; falta demostrarla en el destino.
- **Destino:** requisito ya documentado en el PRD, no necesariamente demostrado por el origen.
- **Pendiente:** decisión o comprobación aún no resuelta; no constituye autorización para cambiar reglas.
- Todos los casos están **sin ejecutar**. T01 sigue `In Progress`: preparar la matriz no equivale a aceptación institucional, a T05 aprobado ni a una aplicación implementada.

Las pruebas futuras deben entrar por el caso de uso o endpoint público, con fixtures sintéticos y estado aislado. Comprobar respuesta y estado persistido, incluido historial/auditoría cuando corresponda. Una mutación rechazada no debe dejar asignaciones, reservas o carga parcialmente modificadas. No usar datos ni cuentas anteriores.

## 1. Identidad, permisos y catálogos

| Caso | Función / actor | Escenario y resultado esperado | Base |
|---|---|---|---|
| AC01 | F01 / admin, coordinator | Cuenta activa con identidad válida inicia sesión; cierre, expiración y revocación impiden reutilizar la sesión según la política de sesión que se implemente. | Destino: PRD F01, T07–T08 |
| AC02 | F01–F02 / sin sesión o cuenta inactiva | Solicitar directamente una lectura o mutación protegida se deniega; ocultar botones no cuenta como control. No persistir cambios rechazados. | Destino: PRD F01–F02 |
| AC03 | F01 / cuenta nueva | Enviar metadatos de rol `admin` no concede privilegios. Solo la operación administrativa autorizada puede habilitar y asignar rol; el bootstrap inicial se comprueba aparte. | Paridad: [S03]; destino: T09 |
| AC04 | F02 / coordinator | Permitir acceso a la carrera autorizada y a docentes vinculados. Una carrera no se comparte entre coordinadores. Con un docente vinculado a dos coordinadores de carreras distintas, cada uno puede consultar el docente sin obtener acceso al detalle de grupos ni asignaciones de la otra carrera. Denegar vínculos ajenos e inactivos. | Ámbitos confirmados por el usuario; paridad: [S02], [S03] |
| AC05 | F03 / actor autorizado | Con varios perfiles requeridos basta una coincidencia del docente; sin requisitos no rechazar por perfil. Sin coincidencias rechazar la asignación. | Paridad: [S01], líneas 70–87 |
| AC06 | F03 / actor autorizado | Un perfil requerido específico de la materia del grupo sustituye los requisitos generales para validar esa asignación. No exigir simultáneamente ambos conjuntos. | Paridad: [S01], líneas 70–87 |
| AC07 | F03 / admin, coordinator | Consultar y mantener carreras, materias, perfiles y relaciones dentro del permiso de cada operación; rechazar referencias inexistentes o ajenas. La matriz detallada de altas, cambios y bajas se contrasta por operación antes de implementar T12. | Destino: PRD F02–F03; detalle pendiente |
| AC08 | F04 / actor autorizado | No asignar docente inactivo ni materia del grupo inactiva; un rechazo no altera carga ni asignación anterior. | Paridad: [S01], líneas 30–38 y 62–67 |
| AC09 | F05 / admin, coordinator | Bloque y plantilla activos y compatibles con modalidad/turno; coordinador no usa bloque personalizado de otro usuario. Preservar referencias históricas a catálogos inactivos. | Paridad: [S01], líneas 41–59; destino: PRD F05 |
| AC10 | F05 / actor autorizado | Origen: módulo `0` significa sin módulo; sabatino/virtual_modular usan `1` o `2`, demás modalidades `0`. No reinterpretar automáticamente `0` como `null`; documentar el contrato destino antes de persistirlo. | Paridad: [S04], [S05]; representación destino pendiente |

## 2. Asignaciones, carga y concurrencia

Para AC11–AC16 usar bloques del mismo día y módulos comparables, salvo cuando el caso indique lo contrario. Una aceptación individual supone que las demás validaciones también se satisfacen.

| Caso | Función / actor | Escenario y resultado esperado | Base |
|---|---|---|---|
| AC11 | F07 / actor autorizado | Mismo docente, grupos distintos e intervalos 09:00–10:00 y 09:30–10:30: rechazar el cruce y conservar la primera asignación. | Paridad: [S01], líneas 112–125 |
| AC12 | F07 / actor autorizado | Mismo grupo y docentes distintos en intervalos solapados: rechazar; cambiar de materia no evita la exclusión del grupo. | Paridad: [S01], líneas 127–141 |
| AC13 | F07 / actor autorizado | Misma aula efectiva y distintos docentes/grupos en intervalos solapados: rechazar. Comprobar también aula heredada del grupo. | Paridad: [S01], líneas 143–158 |
| AC14 | F07 / actor autorizado | 09:00–10:00 y 10:00–11:00 no se solapan; horarios iguales en días diferentes tampoco. No rechazarlos por cruce si el resto de reglas se cumple. | Paridad: [S01], comparación estricta de extremos |
| AC15 | F07 / actor autorizado | Módulos positivos distintos `1`/`2` permiten coexistencia por horario. Mismo módulo, o `0` frente a `1`/`2`, conserva comprobación de cruce para docente, grupo y aula. | Paridad: [S01], líneas 122, 138 y 156 |
| AC16 | F07 / actor autorizado | Dos asignaciones activas de la misma materia del grupo y bloque no pueden coexistir, aunque los docentes sean diferentes. Tras cancelar, la combinación vuelve a estar disponible. | Paridad: [S01], índice y líneas 161–169 |
| AC17 | F07 / actor autorizado | Aula explícita prevalece; si falta, usar y persistir el aula del grupo. Aplicar la misma resolución al buscar conflictos. El requisito de aula al finalizar depende de modalidad, no se generaliza aquí. | Paridad: [S01], líneas 99 y 143–174 |
| AC18 | F04, F07 / actor autorizado | Sumar horas manuales de todas las asignaciones activas del docente, sin particionar por ciclo. Llegar exactamente al máximo se permite; superarlo se rechaza. La acción pública exige horas positivas y como máximo 99. | Paridad: [S01], líneas 89–109; [S06], líneas 10–15 y 75–80 |
| AC19 | F04, F07 / actor autorizado | Un coordinador puede cambiar el docente asignado en un grupo en borrador o revisión de su carrera, sujeto a permisos y validaciones de la asignación. La edición excluye la carga y ocupación previas del cálculo; si falla, conserva los valores anteriores sin dejar reservas nuevas. | Permiso del coordinador confirmado por el usuario; paridad: [S01]; atomicidad destino: T05/T17 |
| AC20 | F07 / actor autorizado | Cancelar cambia estado a `cancelled`, conserva historia y libera carga/ocupación activa. Crear una asignación posterior compatible debe ser posible. No sustituir cancelación por borrado. | Paridad: [S06], líneas 137–166 |
| AC21 | F04, F07 / solicitudes simultáneas autorizadas | Dos altas individualmente válidas pero incompatibles entre sí por docente, grupo, aula, combinación única o carga disponible: solo una confirma. Probar también ediciones incompatibles. En carrera cancelación/alta, el resultado debe equivaler a un orden válido, sin liberar dos veces ni dejar reservas obsoletas. Verificar asignaciones, carga y auditoría sin residuos parciales. | Destino: PRD F04/F07, T05/T17; pendiente de prueba real |
| AC22 | F04, F06 / coordinator | Un coordinador puede reducir horas planeadas por debajo de las horas ya asignadas en su carrera, sujeto al estado del grupo. El permiso no habilita edición de otra carrera ni omite la comprobación de horas al finalizar (AC25). | Permiso del coordinador confirmado por el usuario; excepción preservada: [S07], líneas 406–412; [S08] |

Los conflictos del validador SQL vigente tampoco se filtran por ciclo. Conservar ese comportamiento de referencia al diseñar Firestore; acotarlo a un ciclo sería una decisión de negocio nueva, no una optimización transparente.

## 3. Grupos, ciclos, cohortes e historial

| Caso | Función / actor | Escenario y resultado esperado | Base |
|---|---|---|---|
| AC23 | F06 / admin, coordinator | Grupos `final`/`archived` restringen mutaciones de materias y asignaciones. Contrastar excepciones administrativas concretas antes de implementarlas. El guard de aplicación admite `draft`, `review` y `active` heredado; no normalizar este último silenciosamente. | Paridad: [S09], [S10]; mapeo de `active` pendiente |
| AC24 | F06 / coordinator | Permitir transición `draft` ↔ `review` en su ámbito; denegar cambios generales del grupo, finalizar/archivar y borrar materia reservados a administración. | Paridad: [S01], líneas 183–244 |
| AC25 | F06 / admin | Finalizar exige materias completas, sin horas faltantes o excedidas, y aula salvo `virtual_modular`. Ante incumplimiento conservar estado anterior. | Paridad: [S07], líneas 214–231 |
| AC26 | F06 / admin, coordinator | Borrado físico de grupo solo para admin; coordinador denegado. Incluso admin no borra grupo ligado a cohorte activa. En el caso permitido comprobar el resultado y auditoría; no generalizar esta excepción a otros borrados. | Paridad: [S07], líneas 418–446; [S02], política de borrado |
| AC27 | F06 / actor autorizado | Crear grupo o cambiarle ciclo requiere ciclo activo; estado del ciclo y su indicador `active` no pueden divergir. | Paridad: [S11] |
| AC28 | F08 / actor autorizado | Grupo inicial de cohorte exige cohorte activa y misma carrera/modalidad/turno; rechazar materias ya cursadas añadidas de nuevo. Cohorte sin grupo inicial no se inicializa por inferencia. | Paridad: [S12], [S13] |
| AC29 | F08 / actor autorizado | Corrección manual de historial solo afecta entradas sin grupo; conserva histórico vinculado, exige carrera compatible y cuatrimestre anterior, deduplica y audita altas/bajas. | Paridad: [S14] |
| AC30 | F08 / admin | Activar ciclo conserva avance de cohortes elegibles y cierre del activo anterior. Repetición, solicitudes paralelas y fallo intermedio no duplican grupo/cohorte/ciclo ni historial; comprobar creados, omitidos y pendientes. Denegar activación a no administrador. | Paridad funcional: [S12]; atomicidad/idempotencia destino: T05/T19 |

## 4. Interfaz, reportes, auditoría e inicialización

| Caso | Función / actor | Escenario y resultado esperado | Base |
|---|---|---|---|
| AC31 | F04, F09 / admin, coordinator | Paneles y carga docente reflejan asignaciones activas y cambios confirmados; no contar canceladas ni mostrar éxito tras rechazo del servidor. Si un docente autorizado tiene 6 horas activas en la carrera del coordinador y 4 en otra, mostrar 10 horas totales y desglosar 6 y 4 horas con el coordinador correspondiente, sin permitir consultar grupos ni asignaciones individuales ajenas. | Destino: PRD F04/F09, T20; carga total y desglose por coordinador confirmados por el usuario |
| AC32 | F09 / admin, coordinator | Consultar horarios de grupo, docente y aula dentro del ámbito autorizado; navegación coherente con permisos y estados de carga, error y vacío. Mantener temas y accesibilidad previstos en T20. | Destino: PRD F09, T20 |
| AC33 | F10 / actor autorizado | Reporte y CSV incluyen asignaciones activas, respetan filtro de grupo, ámbito y orden de referencia; conciliar filas y conteos con la vista. Mantener las diez columnas de referencia al adaptar T21. | Paridad: [S15], líneas 28–120 |
| AC34 | F10 / actor autorizado | Exportar comillas, separadores y saltos de línea sin romper celdas; neutralizar fórmulas y prefijos peligrosos según el escape de referencia. No usar datos personales reales en fixtures. | Paridad: [S16]; destino: T21 |
| AC35 | F02, F10 / sin sesión, inactivo o ámbito ajeno | Petición directa al endpoint CSV protegido debe denegarse sin revelar datos. El origen sin sesión devuelve encabezados: no usar ese resultado como prueba de denegación ni copiarlo como requisito. | Destino: PRD F02/F10; divergencia observada: [S15], [S17] |
| AC36 | F10 / actor autorizado | Consulta de datos incompletos respeta ámbito y concilia sus indicadores con el estado académico; precisar cada indicador del origen antes de implementar T21. | Destino: PRD F10; detalle pendiente |
| AC37 | F11 / actor autorizado | Cambios relevantes registran actor real, fecha, evento y datos anteriores/nuevos pertinentes. Asignaciones, grupos e historial no pierden auditoría por usar operaciones administrativas. Comprobar atomicidad con la mutación correspondiente. | Paridad: [S02], [S03], [S14]; destino: T11 |
| AC38 | F12 / administrador inicial autorizado | Instancia vacía usa cuentas y catálogos nuevos; bootstrap no puede repetirse para obtener privilegios. Captura y reintentos conservan referencias válidas sin duplicados; no importar datos, cuentas ni hashes del origen. | Destino: PRD F12, T22–T24 |
| AC39 | F11–F12 / responsable autorizado | Ensayar restauración/reversión en estado aislado y comprobar recuperación de relaciones y acceso. RPO/RTO, responsables y mecanismo compatible con presupuesto siguen pendientes; no usar producción como ensayo. | Destino: PRD F11/F12, T28 |
| AC40 | Transversal / 6 usuarios simultáneos habituales, picos poco frecuentes de 10–20, unos 30 usuarios totales y 1 000–1 300 grupos activos por ciclo | Medir carga de consultas y mutaciones de recorridos representativos, p95 y operaciones de cada servicio con datos sintéticos del orden de volumen estimado y una ventana de trabajo concentrado de aproximadamente una semana por período de mayor actividad. No convertir las estimaciones en lecturas mensuales ni afirmar costo $0 sin medición y cuotas verificadas. | Estimación actualizada por el usuario; PRD §3–4, T02/T26 |

## Decisiones y evidencia pendientes

- **T01:** validar los recorridos y la matriz por operación/rol; los casos redactados no son UAT completada.
- **T02:** estimar frecuencia de consultas/cambios, duración de uso y volumen de datos; acordar zona horaria, calendario, dispositivos, responsables y objetivos de servicio/recuperación. No inferirlos de la zona horaria del equipo.
- **T03:** clasificar activos antes de distribuirlos y detallar permisos de excepciones. No se inspeccionó ni importó la hoja de cálculo de referencia.
- **T05:** definir representación destino de módulos/estados, consultas, coordinación compartida y límites transaccionales; probar AC11–AC21 y AC30 con persistencia real aislada. No basta una simulación en memoria para aprobar Firestore.

## Fuentes verificadas estáticamente

Los enlaces a `/Migracion` son referencias locales ignoradas por Git; pueden faltar en otros clones. Esta matriz no publica el paquete ni convierte su presencia en evidencia de ejecución.

[S01]: ../Migracion/referencia/base-de-datos/migrations/202607211400_integrity_and_atomicity_hardening.sql
[S02]: ../Migracion/referencia/base-de-datos/migrations/202606050001_initial_schema.sql
[S03]: ../Migracion/referencia/base-de-datos/migrations/202607211300_security_and_consistency_hardening.sql
[S04]: ../Migracion/referencia/base-de-datos/migrations/202606130003_modular_saturday_modules.sql
[S05]: ../Migracion/referencia/base-de-datos/migrations/202607231100_restore_saturday_modules.sql
[S06]: ../Migracion/referencia/codigo/app/(dashboard)/actions/asignaciones.ts
[S07]: ../Migracion/referencia/codigo/app/(dashboard)/actions/grupos.ts
[S08]: ../Migracion/referencia/documentacion/AUDIT_DECISIONS.md
[S09]: ../Migracion/referencia/base-de-datos/migrations/202607101220_block_closed_group_mutations.sql
[S10]: ../Migracion/referencia/codigo/app/(dashboard)/actions/group-guards.ts
[S11]: ../Migracion/referencia/base-de-datos/migrations/202607101210_sync_academic_cycle_status.sql
[S12]: ../Migracion/referencia/base-de-datos/migrations/202607211200_automate_cohort_cycle_groups.sql
[S13]: ../Migracion/referencia/base-de-datos/migrations/202607231110_harden_cohort_completed_subjects.sql
[S14]: ../Migracion/referencia/base-de-datos/migrations/202607231120_manage_cohort_manual_history.sql
[S15]: ../Migracion/referencia/codigo/lib/supabase/reports.ts
[S16]: ../Migracion/referencia/codigo/lib/csv.ts
[S17]: ../Migracion/referencia/codigo/app/api/reportes/csv/route.ts

## Verificación de esta preparación

Revisión documental de cobertura F01–F12, identificadores, fuentes locales, tablas y coherencia de estados. No se ejecutaron pruebas de aplicación: no existe runner destino en la raíz. No hubo instalación, acceso remoto ni despliegue. La cifra de usuarios y los hallazgos estáticos no aprueban rendimiento, seguridad ni gratuidad.
