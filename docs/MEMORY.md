# Memoria activa del proyecto

![Estado: preimplementación](https://img.shields.io/badge/estado-preimplementación-blue) ![Firebase: no implementado](https://img.shields.io/badge/Firebase-no_implementado-lightgrey)

## Project Memory Status

| Campo | Estado al cierre de esta entrega |
|---|---|
| Última actualización | 2026-11-11 |
| Versión documental | 1.1.0 |
| Fase actual | Descubrimiento y definición de arquitectura |
| Estado general | Firestore confirmado; diseño y prueba de integridad/costos pendientes |
| Progreso del plan por tareas | 2/30 = 6,7%; documentación y selección de base, no esfuerzo |
| Implementación destino | 0%; ninguna funcionalidad Firebase comprobada |
| Sprint activo | No se encontró sprint formal ni responsables/fechas asignados |
| Fuente de progreso | [TASKS](TASKS.md): 2 Completed, 0 In Progress, 28 Not Started |

## Decisiones confirmadas por el usuario

- **Base:** Firestore, reemplazando la preferencia inicial SQL por incompatibilidad de SQL Connect con presupuesto permanente $0.
- **Datos e identidad:** empezar con datos/cuentas nuevos; no importar registros, historial ni credenciales anteriores.
- **Alcance:** terminar el proyecto completo, sin plan de entregas MVP; módulos/fases sirven solo para ordenar trabajo.
- **Reglas:** conservar las del sistema anterior, incluidas las excepciones operativas documentadas y sus permisos.
- **Presupuesto:** $0 mensuales. Blaze admisible dentro de cuotas sin costo; no autorización para cargos ni garantía de suficiencia. Hosting, backend y controles de consumo aún deben validarse.

## Current Status

### Qué está disponible

- Paquete `/Migracion` con cuatro documentos de contexto, reglas, reutilización y transición.
- Instantánea anterior: Next.js/React/TypeScript/Tailwind, Supabase Auth/PostgreSQL, pantallas y acciones por dominio.
- 27 migraciones SQL y 21 tablas en tipos generados; reglas importantes también en funciones, RLS y triggers.
- 17 archivos de pruebas de referencia; parte necesita Supabase. No equivalen a pruebas de Firebase.
- Suite actual: [PRD](PRD.md), [ARCHITECTURE](ARCHITECTURE.md), [DESIGN](DESIGN.md), [RULES](RULES.md), [TASKS](TASKS.md) y este archivo.

### Qué está funcionando y qué no se puede afirmar

Se verificó la existencia y se inspeccionaron archivos; **no se ejecutó la aplicación anterior**. La raíz no tiene `package.json`, configuración Firebase ni pipeline de aplicación. No hay evidencia de acceso operativo, build verde, tests aprobados, base desplegada, proyecto Firebase conectado ni usuarios migrados.

La presente entrega no cambió código de negocio ni realizó importación, instalación de dependencias, commit, push, publicación o corte. El README raíz se dejó intacto y no se usó para especificar el producto.

### Método y evidencia de revisión

Se leyeron los cuatro documentos de transición, dependencias/configuración y evidencia representativa de dominio, permisos, asignaciones, modelos, CSS y pruebas. Una exploración independiente del código ayudó a contrastar fuentes. CodeGraph se inicializó, pero la exploración no devolvió código relevante; se usaron lecturas de archivos como fallback. Esto no equivale a auditar exhaustivamente cada rama ni demostrar comportamiento en ejecución.

Se contrastaron las capacidades relevantes de Firebase con documentación oficial y Context7 el 2026-11-11; enlaces en ARCHITECTURE. No se hicieron consultas a infraestructura institucional ni se usaron credenciales remotas.

## In Progress / Current Sprint

No hay implementación activa confirmada. Prioridad recomendada para la próxima sesión:

| Orden | Tareas | Resultado esperado |
|---|---|---|
| 1 | T01–T03 | Especificar casos del alcance completo, reglas preservadas, consumo esperado y privacidad |
| 2 | T04 | Completada: Firestore confirmado y SQL Connect descartado para el alcance actual |
| 3 | T05 | Demostrar asignaciones consistentes bajo concurrencia y activación idempotente |
| 4 | T06 | Crear el proyecto ejecutable solo después de validar diseño |

**Siguiente trabajo:** diseñar consultas, colecciones, índices y límites de transacción Firestore; demostrar exclusión concurrente y validar hosting/consumo con objetivo $0 antes de desplegar. No se necesita otra selección de base ni un plan de importación del origen.

## Known Issues & Technical Debt

| ID | Hallazgo | Impacto | Tratamiento / tarea |
|---|---|---|---|
| K01 | No existe aplicación destino en raíz | No hay comandos de ejecución ni verificación Firebase | Crear base reproducible en T06 |
| K02 | Firestore elegido, esquema aún propuesto | Falta cerrar consultas, índices, permisos y transacciones | Diseñar y probar T05; elección T04 completada |
| K03 | UI, actions, sesión y queries están acopladas a Supabase | Copiar pantallas no las vuelve compatibles con Firebase | Adaptación por dominio; reemplazar clientes y RPC |
| K04 | Integridad depende de SQL, candado y unicidad parcial | Validación solo en cliente permitiría carreras y datos inconsistentes | Portar contrato, no sintaxis; T05/T17 |
| K05 | `scripts/`, semilla y entorno completo no incluidos | Algunos scripts npm apuntan a archivos ausentes; pruebas no autocontenidas | No prometer ejecución independiente; T06/T22–T25 |
| K06 | Tipos SQL y validaciones UUID son del origen | Identidades nuevas requieren contratos propios, no tipos SQL copiados | DTO e IDs nuevos; T05/T23–T24; sin mapeo de registros anteriores |
| K07 | Aliases visuales `line-subtle` / `muted-foreground` incompletos | Clases pueden no generar estilos esperados | Revisar CSS compilado y corregir con prueba en T20 |
| K08 | Documentación de exclusiones no coincide totalmente con archivos presentes | Existe hoja de cálculo en `referencia/assets/`; contenido no inspeccionado ni clasificado | No publicar/importar; revisar con autorización en T03 |
| K09 | `/Migracion` está ignorado por Git | Enlaces locales pueden faltar en otros clones; incorporar todo puede filtrar material | Mantener exclusión hasta revisar privacidad/distribución |
| K10 | Fuente JetBrains Mono solo declarada; auditoría visual no ejecutada | Tipografía efectiva y accesibilidad sin comprobar | Fallback explícito y revisión visual en T20/T26 |
| K11 | Presupuesto $0, pero sin consumo, calendario ni SLO medidos | No se puede prometer gratuidad/capacidad/fecha; Blaze puede facturar excedentes | T02/T05/T26/T27; controles y costos por servicio |
| K12 | Reglas anteriores confirmadas; estado heredado `active` requiere interpretación | Una «limpieza» técnica puede alterar comportamiento autorizado | T03/T15; conservar excepciones y documentar estados |
| K13 | Cuentas nuevas sin bootstrap implementado | Aprovisionamiento inicial podría abrir escalamiento si es inseguro | T09/T23; no se migrarán hashes ni contraseñas anteriores |

No se reproducen defectos de runtime en esta entrega: los hallazgos estáticos son riesgos o discrepancias, no resultados de pruebas fallidas inventadas.

## Architectural Decisions Log — ADR simplificado

| ADR | Estado / origen | Decisión o propuesta | Razonamiento y consecuencias |
|---|---|---|---|
| ADR-001 | Confirmado por el usuario | Reconstruir en Firebase con Firestore y datos nuevos | No se migra información del origen; el hosting concreto sigue pendiente |
| ADR-002 | Instrucción del usuario | Usar `/Migracion` y código como evidencia; ignorar README raíz | Evita especificar el proyecto nuevo con descripción anterior |
| ADR-003 | Confirmado por el usuario | Elegir Firestore y descartar SQL Connect para este alcance | Objetivo $0: la cuota gratis de SQL Connect no cubre Cloud SQL después de la prueba; reimplementar garantías SQL en Firestore |
| ADR-004 | Propuesta técnica | Conservar Next.js/React/TypeScript con monolito modular | Reutiliza interfaz y tipado; requiere adaptadores, pruebas y versión compatible |
| ADR-005 | Requisito de paridad / diseño pendiente | Autorización por sesión, cuenta activa, rol y ámbito en servidor | Sustituye el conjunto de controles del origen; Admin no queda protegido por Rules |
| ADR-006 | Propuesta técnica | Probar unidad transaccional antes de migrar módulos | Evita construir sobre un diseño que admita cruces concurrentes o duplicación de cohortes |
| ADR-007 | Preservada por el usuario | Permitir reducción de horas planeadas bajo horas asignadas y borrado físico autorizado de grupos | Confirmó usar reglas anteriores; [AUDIT_DECISIONS](../Migracion/referencia/documentacion/AUDIT_DECISIONS.md); no retirar ni ampliar permisos |
| ADR-008 | Propuesta de continuidad | Preservar identidad visual y reutilizar UI selectivamente | Reduce cambios simultáneos; no implica que componentes estén desacoplados o accesibles ya |
| ADR-009 | Confirmado por el usuario | Datos e identidades nuevos, sin convivencia sincronizada | Retira importación, traslado de hashes y conciliación con producción anterior; requiere captura inicial y bootstrap seguros |
| ADR-010 | Límite de alcance | No crear portal docente/estudiantil ni Storage por inferencia | No hay necesidad confirmada ni implementación demostrada |
| ADR-011 | Confirmado por el usuario | Alcance completo sin entregas MVP | Las fases organizan dependencias, no reducen funcionalidades del sistema anterior |
| ADR-012 | Restricción del usuario | Presupuesto mensual $0; Blaze solo dentro de uso gratuito | Medir todos los servicios; alertas no son tope. No crear recursos ni activar cargos por inferencia |

Para aceptar una propuesta: registrar fecha, responsable y evidencia; revisar documentos afectados y abrir/actualizar tareas. Esta tabla no sustituye una aprobación institucional.

## Registro de aclaraciones de alcance

Aclaraciones del usuario conservadas literalmente (2026-11-11):

> 1. Comenzamos con datos nuevos
> 2. Cualquiera no trabajamos por entrega si no hasta el termino del proyecto.
> 3. Usaremos las del sistema anterior
> 4. Tendra que ser todo en el plan gratuiti de firebase
> 5. Eso no se

Posteriormente permitió el otro plan («A ya vi si puedo usar el otro plan»), precisó presupuesto («0 nos apegaremos a los limites que nos da creo que si son suficientes para este tipo de proyectos») y aceptó reemplazar SQL por Firestore («Pues si»). Esto cambia la restricción de plan, no el presupuesto: Blaze es admisible pero no se autorizan cargos. El punto 5 recibió una explicación de la prueba de integridad; no constituye implementación ni aprobación de resultados.

## Verificación de esta entrega

| Comprobación | Resultado / alcance |
|---|---|
| Archivos solicitados | Seis Markdown en `docs/` |
| Estructura documental | Secciones solicitadas, metadata, badges y tablas; lectura estructural |
| Referencias locales | Revisadas contra archivos presentes; `/Migracion` puede faltar fuera de este workspace |
| Coherencia de estado | 2 tareas completadas de 30; selección de base separada de implementación |
| Runtime / build / tests | No ejecutados: no se creó aplicación ni se instalaron dependencias |
| Firebase / seguridad / carga / restauración | Pendientes de implementación y entornos autorizados; no se declara PASS |
| Publicación y producción | No realizadas ni autorizadas por esta entrega |

## Guía de recuperación de contexto

1. Leer PRD y este archivo; luego TASKS y decisiones pendientes de ARCHITECTURE.
2. Confirmar cambios de workspace y evidencia real antes de retomar estados.
3. Si empieza implementación, validar T01–T05; no asumir que documentos propuestos equivalen a decisiones aceptadas.
4. Actualizar TASKS y MEMORY con pruebas observadas y fecha, manteniendo separados progreso documental e implementación.

Esta memoria versionable vive en el repositorio. La escritura a memoria externa Engram encontró un rechazo de contexto de proyecto en esta sesión; no se considera persistida allí. La suite local sigue siendo la referencia recuperable.
