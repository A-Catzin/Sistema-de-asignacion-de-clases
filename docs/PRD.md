# PRD — Sistema de asignación de clases

![Estado: borrador para validación](https://img.shields.io/badge/estado-borrador_para_validación-yellow) ![Destino: Firestore](https://img.shields.io/badge/destino-Firestore-blue)

| Metadata | Valor |
|---|---|
| Versión documental | 1.1.0 |
| Fecha | 2026-11-11 |
| Autoría | Equipo de arquitectura y gestión técnica del proyecto |
| Estado | Base de trabajo; pendiente de aprobación institucional |
| Target launch | Proyecto completo sobre Firebase/Firestore; sin entregas MVP ni fecha acordada |
| Producto de referencia | `asignacion-clases` 0.1.0; no confundir con versión documental |
| Alcance de esta entrega | Documentación y planificación; no implementación de la migración |

## Lectura y autoridad

Esta suite sustituye al README raíz como punto de entrada para **la nueva etapa**, sin modificarlo. Leer después [ARCHITECTURE](ARCHITECTURE.md), [DESIGN](DESIGN.md), [RULES](RULES.md), [TASKS](TASKS.md) y [MEMORY](MEMORY.md).

- **Observado:** existe en archivos de referencia; no significa probado ni desplegado.
- **Requisito de paridad:** comportamiento del sistema anterior que se propone conservar.
- **Propuesto:** recomendación técnica o funcional pendiente de aprobación y prueba.
- **Pendiente:** requiere información o decisión externa; nunca se interpreta como terminado.

Fuentes principales: [contexto](../Migracion/01_CONTEXTO_Y_FUNCIONES.md), [reglas](../Migracion/02_REGLAS_Y_DATOS.md), [reutilización](../Migracion/03_INVENTARIO_REUTILIZACION.md), [transición](../Migracion/04_PLAN_TRANSICION.md). La documentación anterior se contrasta con código y SQL; no se inspeccionaron producción ni usuarios reales.

## 1. Product Overview

### Propósito y visión

Centralizar la planeación académica: relacionar carreras, materias, docentes, grupos, aulas y franjas horarias para construir asignaciones consistentes y rastreables. El producto también acompaña el avance de cohortes entre ciclos, consulta de horarios, revisión de datos incompletos y reportes.

La nueva etapa debe trasladar esas capacidades al ecosistema Firebase sin perder permisos ni integridad. **Firestore es la base elegida por el usuario**, priorizando presupuesto mensual de $0. Blaze se admite dentro de cuotas sin costo; no autoriza cargos ni garantiza que el consumo resulte gratuito. La decisión queda registrada en [ARCHITECTURE §2](ARCHITECTURE.md#2-technology-stack).

### Alcance completo y datos nuevos

El usuario confirmó trabajar hasta terminar el proyecto completo, no por entregas MVP. Las fases y prioridades organizan dependencias técnicas, no recortan módulos. Se conservarán las reglas del sistema anterior, incluidas sus excepciones aceptadas. Se comenzará con datos y cuentas nuevos: no se importarán registros, credenciales ni historial del sistema anterior. La validación pendiente se limita a detalles operativos y casos de aceptación, no reabre estas decisiones. La raíz actual no tiene aplicación instalable; las pantallas de referencia no cuentan como funcionalidades terminadas en Firebase.

No se incluyen por defecto: portal docente/estudiantil, optimización automática de horarios, app móvil nativa, autoservicio de registro público, notificaciones, analítica predictiva ni carga documental. Un campo `expediente_url` no demuestra un módulo de archivos.

## 2. Problem Statement

La asignación exige coordinar disponibilidad, perfiles docentes, horas, modalidades, aulas y estados académicos. La información distribuida y los cambios simultáneos pueden producir cruces, cargas excesivas, pérdida de historial o acceso fuera de la carrera autorizada.

| Necesidad | Riesgo que debe reducirse | Evidencia |
|---|---|---|
| Planificación consistente | Dos clases para el mismo recurso en intervalos incompatibles | Validadores de asignaciones y funciones SQL |
| Operación por coordinación | Acceso o edición de carreras ajenas | Helpers de permisos y políticas RLS |
| Seguimiento entre ciclos | Duplicación de grupos o materias ya cursadas | Migraciones de cohortes e historial |
| Trazabilidad | Cambios administrativos sin actor identificable | Triggers y acciones privilegiadas |
| Cambio de plataforma | Perder garantías que hoy viven en PostgreSQL | Migraciones de endurecimiento e integridad |

No hay mediciones de tiempos, costos ni incidencia de errores de la institución. El diagnóstico es una inferencia del dominio y del código, no un estudio de usuarios.

## 3. Goals & Success Metrics

Los siguientes son **criterios de aceptación propuestos**, no resultados actuales ni compromisos comerciales. Definir muestras, responsables y umbrales operativos en T01/T02.

| Objetivo | Indicador / fórmula | Meta propuesta y comprobación |
|---|---|---|
| Paridad crítica | Casos críticos aprobados / casos críticos acordados | 100% antes del corte; matriz funcional versionada |
| Autorización efectiva | Accesos indebidos aceptados en matriz negativa | 0; probar acciones y endpoints directamente por rol/carrera |
| Integridad concurrente | Pares incompatibles que quedan ambos activos | 0 en batería de concurrencia; revisar estado persistido |
| Idempotencia | Registros duplicados por reintento de activación | 0; comparar IDs e historial tras repetición |
| Inicio íntegro con datos nuevos | Referencias inválidas o cuentas privilegiadas creadas sin autorización | 0; inicialización repetible y creación administrativa probadas |
| Auditoría | Mutaciones críticas con actor/evento / total ejecutado | 100% del catálogo de eventos aprobado |
| Operación aceptada | Flujos críticos aceptados / flujos acordados | 100% con acta de responsables académicos |
| Rendimiento y costo | p95 por flujo; consumo de cada servicio y costo mensual estimado | Objetivo $0; medir cuotas y margen antes de habilitar servicios; SLO pendiente |
| Recuperabilidad | Ensayos de restauración y reversión satisfactorios | Al menos un ensayo completo; RPO/RTO acordados antes de producción |

Presupuesto confirmado: **$0 mensuales**. No se puede asegurar que las cuotas alcancen sin medir usuarios, volumen y operaciones, incluido hosting y ejecución del servidor. No contratar ni habilitar recursos facturables por inferencia.

No fijar fechas, disponibilidad, capacidad de usuarios ni ahorro porcentual sin línea base. La aceptación exige pruebas funcionales, seguridad, concurrencia y restauración, no solo una compilación correcta.

## 4. Target Users

| Arquetipo | Contexto / necesidades | Casos de uso | Alcance |
|---|---|---|---|
| Administrador (`admin`) | Personal institucional responsable de acceso y configuración global | Aprovisionar cuentas, ciclos, catálogos, aulas y operaciones administrativas | Según política de cada operación; no equivale a ausencia de validación |
| Coordinador (`coordinator`) | Personal académico que administra carreras y docentes vinculados | Preparar grupos, materias, asignaciones, horarios y reportes | Cuenta activa y relaciones autorizadas; evaluar turno/modalidad cuando corresponda |
| Docente como entidad | Persona a quien se asignan clases y carga | Ser seleccionado según perfiles y horas | No hay evidencia de cuenta o portal docente independiente |

Demografía, número de usuarios, conectividad, dispositivos y necesidades específicas de accesibilidad: **no disponibles**. No inferir edad, experiencia digital ni distribución geográfica a partir de activos institucionales.

### Recorrido operativo de referencia

1. Administración prepara perfiles activos, catálogos y ciclos.
2. Coordinación consulta su alcance y prepara grupos/materias.
3. El sistema valida y registra asignaciones de docente, horario y aula efectiva.
4. Usuarios autorizados consultan horarios, datos incompletos y exportaciones.
5. La activación de un ciclo procesa cohortes elegibles sin duplicar resultados.

## 5. Core Features — Alcance completo y ampliaciones no comprometidas

Prioridades de ejecución: **P0** condición de integridad/salida; **P1** paridad operativa; **P2** ampliación fuera del alcance actual, no una fase comprometida. Ningún elemento de esta tabla está implementado en Firebase por la presente entrega.

| ID | Funcionalidad | Prioridad / fase | Aceptación mínima | Plan |
|---|---|---|---|---|
| F01 | Sesión y aprovisionamiento administrado | P0 / proyecto completo | Sin privilegios por metadatos; usuario inactivo denegado; cierre y revocación probados | T07–T09 |
| F02 | Permisos por rol y ámbito | P0 / proyecto completo | Denegación directa de consulta/mutación ajena, no solo ocultar controles | T10 |
| F03 | Carreras, materias, requisitos y perfiles | P1 / proyecto completo | Relaciones válidas; compatibilidad con alguno de los perfiles requeridos | T12 |
| F04 | Docentes y carga | P0 / proyecto completo | Límite de carga preservado, incluida edición concurrente | T13, T15–T17 |
| F05 | Aulas, bloques, modalidades y turnos | P1 / proyecto completo | Selección válida; conservar referencias históricas inactivas | T14 |
| F06 | Grupos y materias por ciclo | P0 / proyecto completo | Estados editables/cerrados aplicados en servidor | T15 |
| F07 | Asignaciones y conflictos | P0 / proyecto completo | Rechazo de cruces docente/grupo/aula y exceso de carga; cancelación conserva historial | T16–T17 |
| F08 | Cohortes e historial | P0 / proyecto completo | Avance idempotente y exclusión de materias cursadas/activas incompatibles | T18–T19 |
| F09 | Horarios y paneles por rol | P1 / proyecto completo | Datos y navegación limitados al alcance real | T20 |
| F10 | Reportes, CSV y datos incompletos | P1 / proyecto completo | Exportación autorizada y conciliada con las vistas | T21 |
| F11 | Auditoría y recuperación | P0 / proyecto completo | Actor real, fecha y cambio relevantes; restauración ensayada | T11, T28 |
| F12 | Inicialización de datos y cuentas nuevos | P0 / proyecto completo | Catálogos nuevos validados, administrador inicial seguro y reinicialización de pruebas sin duplicados | T22–T24, T28–T29 |
| F13 | Notificaciones o analítica ampliada | P2 / posterior | Solo si existe necesidad aprobada; fuera del alcance completo acordado | Sin tarea comprometida |
| F14 | Portal docente/estudiantil u optimización automática | P2 / exploración | Descubrimiento y autorización de alcance antes de diseño | Sin tarea comprometida |

### Reglas de paridad no negociables sin decisión de negocio

- Los grupos `final`/`archived` restringen mutaciones; validar el valor heredado `active` antes de normalizar estados.
- Las coincidencias de horario dependen de intervalos y módulos: módulos positivos distintos pueden coexistir; sin módulo se compara contra ambos.
- Los perfiles requeridos se interpretan con la lógica existente, no como obligación de poseer todos.
- Cancelar asignaciones libera ocupación sin borrar su historia.
- Reducir horas planeadas por debajo de asignadas y borrar físicamente grupos con permisos fueron excepciones aceptadas en el sistema anterior. **Conservarlas por confirmación del usuario de usar las reglas anteriores**; documentar sus casos y permisos en T03. Véase [decisiones anteriores](../Migracion/referencia/documentacion/AUDIT_DECISIONS.md).

### Condiciones de lanzamiento

Aprobación de prioridades y decisiones abiertas; matriz de permisos y paridad verde; prueba concurrente; inicialización segura de datos nuevos; aceptación institucional; monitoreo; recuperación compatible con el presupuesto y responsable identificado. Fecha y responsables nominales permanecen pendientes; el presupuesto objetivo es $0. Los mecanismos nativos de backup/restauración de Firestore no deben suponerse gratuitos.
