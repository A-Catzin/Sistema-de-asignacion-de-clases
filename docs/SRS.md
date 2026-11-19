# SRS — Especificación de requisitos de software

## Sistema de asignación de clases

| Campo | Valor |
|---|---|
| Versión | 1.0.0 |
| Fecha de consolidación | 2026-11-19 |
| Base documental | Documentación y decisiones disponibles, principalmente al 2026-11-12 |
| Estado | Borrador consolidado para validación; no es aprobación institucional |
| Finalidad | Conservar el contexto, objetivo, alcance, requisitos y pendientes del proyecto |
| Implementación destino | Preimplementación; ninguna funcionalidad Firebase comprobada |

Este documento reúne lo que se sabe del producto sin ampliar su alcance. Los requisitos describen lo que el sistema debe ofrecer, **no lo que ya está construido**. No declara conformidad con una norma externa de SRS ni sustituye las pruebas de aceptación.

## 1. Resumen y objetivo

### 1.1 Objetivo general

Centralizar la planeación y asignación de clases de la institución, relacionando carreras, materias, perfiles docentes, docentes, grupos, aulas, ciclos y horarios para registrar asignaciones consistentes, autorizadas y trazables; administrar el avance de cohortes y facilitar la consulta de horarios y reportes.

La nueva etapa reconstruirá las capacidades del sistema anterior en Firebase con Firestore, conservando sus reglas y excepciones aceptadas. Se iniciará con cuentas y datos nuevos, sin importar información histórica. El objetivo económico es operar con **$0 mensuales**, sujeto a diseño, medición y validación de todos los servicios.

### 1.2 Problema que se busca resolver

La coordinación de recursos y cambios académicos puede generar cruces de horario, sobrecarga docente, acceso a carreras ajenas, duplicación de grupos o pérdida de historial. El sistema debe evitar esos resultados en la operación real, incluidas solicitudes simultáneas, y no únicamente mediante validaciones visuales.

Este diagnóstico se apoya en documentación y código de referencia; no existe un estudio institucional de tiempos, costos o frecuencia de errores que permita prometer ahorros cuantificados.

### 1.3 Objetivos específicos

- Mantener catálogos y relaciones académicas válidas.
- Controlar acceso por identidad, cuenta activa, rol y ámbito autorizado.
- Registrar, editar y cancelar asignaciones sin conflictos ni exceso de carga.
- Conservar historial, auditoría y referencias necesarias para trazabilidad.
- Gestionar grupos, ciclos y avance de cohortes sin duplicación por reintentos.
- Ofrecer horarios, paneles, reportes y exportaciones coherentes con los datos confirmados.
- Comprobar integridad, recuperación, aceptación operativa y viabilidad económica antes de producción.

## 2. Fuentes y estado de las afirmaciones

| Clasificación | Significado |
|---|---|
| Confirmado | Decisión expresa del usuario registrada en la documentación vigente |
| Paridad | Regla observada en la referencia que debe conservarse; aún no probada en Firebase |
| Requisito destino | Comportamiento requerido para la nueva etapa; no necesariamente demostrado por el origen |
| Propuesto | Alternativa técnica o meta pendiente de aceptación y comprobación |
| Pendiente | Información, política o decisión todavía no resuelta |

Fuentes de esta consolidación:

| Fuente | Uso |
|---|---|
| [PRD](PRD.md) | Objetivo, alcance F01–F12, usuarios y metas propuestas |
| [ACCEPTANCE](ACCEPTANCE.md) | Escenarios AC01–AC40 y evidencia estática de reglas |
| [MEMORY](MEMORY.md) | Decisiones confirmadas, estado y continuidad |
| [ARCHITECTURE](ARCHITECTURE.md) | Restricciones, propuestas de diseño y riesgos |
| [DESIGN](DESIGN.md) | Continuidad visual, interacción y accesibilidad previstas |
| [RULES](RULES.md) | Disciplina de desarrollo, seguridad y verificación |
| [TASKS](TASKS.md) | Dependencias y estado del plan T00–T29 |

El paquete local `Migracion/` contiene documentación y una instantánea del sistema anterior. Está ignorado por Git, puede no existir en otros clones y no debe publicarse sin clasificación y autorización. El README raíz es heredado: no es la especificación de esta etapa. No se inspeccionó producción ni se ejecutó la aplicación anterior para elaborar esta consolidación.

**Regla de lectura:** una propuesta de arquitectura no cambia una decisión confirmada ni una regla de paridad. Las discrepancias identificadas se registran en la sección 12 y no se resuelven por suposición.

## 3. Alcance y restricciones confirmadas

### 3.1 Alcance incluido

El proyecto comprende el sistema completo F01–F12: identidad, permisos, catálogos, carga docente, recursos horarios, grupos, asignaciones, cohortes, consultas, reportes, auditoría, recuperación e inicialización segura. Las fases ordenan dependencias técnicas; **no son entregas MVP ni exclusiones de módulos**.

### 3.2 Decisiones confirmadas

| ID | Decisión / restricción |
|---|---|
| DC-01 | Usar Firebase con Firestore como persistencia seleccionada; SQL Connect queda descartado para este alcance. |
| DC-02 | Iniciar con cuentas, catálogos y datos nuevos; no importar registros, historial, cuentas ni hashes del origen. |
| DC-03 | Conservar las reglas anteriores y sus excepciones aceptadas; cambiar una regla exige decisión de negocio. |
| DC-04 | Completar todo el alcance acordado, sin plan de entregas MVP. |
| DC-05 | Objetivo presupuestario de $0 mensuales. Blaze es admisible dentro de uso sin costo, sin autorización para incurrir en cargos. |
| DC-06 | Dimensionar con una estimación de hasta aproximadamente 50 administradores/coordinadores simultáneos, no como límite implementado ni total de cuentas. |

### 3.3 Fuera del alcance actual

No están comprometidos portal docente o estudiantil, registro público de usuarios, optimización automática de horarios, aplicación móvil nativa, notificaciones, analítica predictiva ni módulo de expedientes/archivos. La existencia de un campo de URL no autoriza crear almacenamiento documental.

Tampoco se incluye importación de producción anterior, sincronización entre sistemas ni retiro del sistema anterior por inferencia. El despliegue y la creación de recursos requieren autorización específica de destino, operación y sesión; redactar este SRS no la concede.

## 4. Actores y permisos

| Actor | Responsabilidad | Límite |
|---|---|---|
| Administrador (`admin`) | Accesos, configuración global, ciclos, catálogos y operaciones administrativas | Está sujeto a reglas y permisos por operación; no puede omitir invariantes |
| Coordinador (`coordinator`) | Planeación de carreras y docentes autorizados, grupos, asignaciones y consultas | Cuenta y vínculos activos; ámbito de carrera/docente y condiciones de turno/modalidad aplicables |
| Docente | Entidad académica con perfiles, carga y asignaciones | No implica cuenta de acceso ni portal independiente |
| Persona sin sesión o con cuenta inactiva | Ninguna operación protegida | Debe recibir denegación sin exposición de datos ni mutación |

La matriz detallada de altas, modificaciones, bajas y excepciones por recurso sigue pendiente de validación. No se debe interpretar un rol como permiso universal de CRUD.

## 5. Características principales y requisitos funcionales

Los identificadores RF son propios de este SRS; F y AC conservan los identificadores del PRD y de la matriz de aceptación. Todos los requisitos de esta sección están pendientes de implementación/verificación en el destino. Cuando se indique un detalle pendiente, no debe darse por aprobado.

### 5.1 Identidad y autorización

| ID | Requisito | Trazabilidad |
|---|---|---|
| RF-01 | Permitir inicio y cierre de sesión con identidad válida y cuenta activa; aplicar expiración y revocación conforme a una política todavía por definir. | F01; AC01 |
| RF-02 | Aprovisionar y asignar privilegios únicamente por operaciones administrativas autorizadas. Los metadatos enviados por una cuenta nueva no pueden conceder rol administrador. | F01; AC03 |
| RF-03 | Verificar identidad, actividad, rol y ámbito en cada lectura o mutación protegida, incluidos endpoints y CSV. Denegar acceso directo no autorizado aunque el usuario altere la interfaz. | F02; AC02, AC04, AC35 |
| RF-04 | Limitar al coordinador a carreras y docentes vinculados o bajo su responsabilidad; denegar vínculos ajenos e inactivos y aplicar condiciones de turno/modalidad pertinentes. | F02; AC04, AC09 |

### 5.2 Catálogos, docentes y recursos

| ID | Requisito | Trazabilidad |
|---|---|---|
| RF-05 | Consultar y mantener carreras, materias, perfiles y sus relaciones con referencias válidas y permisos por operación. La matriz detallada de mantenimiento permanece pendiente. | F03; AC07 |
| RF-06 | Validar compatibilidad docente: basta coincidir con alguno de los perfiles requeridos; sin requisitos no se rechaza por perfil. Un requisito específico de materia del grupo sustituye al general para esa asignación. | F03; AC05–AC06 |
| RF-07 | Gestionar docentes, perfiles disponibles, responsable y carga máxima. No asignar docentes ni materias de grupo inactivos. | F04; AC04, AC08, AC18 |
| RF-08 | Gestionar aulas, plantillas y bloques de horario con modalidad, turno, día, intervalo, actividad y módulo; preservar referencias históricas a recursos inactivos. | F05; AC09–AC10 |
| RF-09 | Validar bloque y plantilla activos y compatibles; impedir al coordinador usar bloques personalizados de otro usuario. | F05; AC09 |

### 5.3 Grupos y ciclos

| ID | Requisito | Trazabilidad |
|---|---|---|
| RF-10 | Gestionar grupos y sus materias por ciclo. Crear grupo o cambiar su ciclo requiere ciclo activo; el estado del ciclo y su indicador de actividad deben ser coherentes. | F06; AC27 |
| RF-11 | Aplicar restricciones de mutación para grupos `final` y `archived`. El valor heredado `active` requiere un contrato explícito antes de normalizarse. | F06; AC23 |
| RF-12 | Permitir al coordinador la transición `draft` ↔ `review` dentro de su ámbito; reservar a administración cambios generales del grupo, finalización/archivo y borrado de materia según la regla de referencia. | F06; AC24 |
| RF-13 | Para finalizar un grupo, exigir materias completas, sin horas faltantes ni excedidas, y aula salvo modalidad `virtual_modular`. Si falla, conservar el estado previo. | F06; AC25 |
| RF-14 | Conservar la excepción de reducir horas planeadas por debajo de las ya asignadas con permisos válidos; no añadir una prohibición nueva. | F04, F06; AC22 |
| RF-15 | Permitir borrado físico de grupo solo al administrador y nunca cuando esté ligado a una cohorte activa; comprobar resultado y auditoría sin extender la excepción a otros borrados. | F06; AC26 |

### 5.4 Asignaciones, carga y conflictos

| ID | Requisito | Trazabilidad |
|---|---|---|
| RF-16 | Crear y editar asignaciones de materia del grupo, docente, bloque, horas y aula efectiva, después de validar permisos, estados, referencias, perfiles, carga y conflictos. | F07; AC05–AC21 |
| RF-17 | Rechazar intervalos solapados que compartan docente, grupo o aula efectiva cuando sus módulos sean comparables. Comparar intervalos reales, no solo identificadores de bloque. | F07; AC11–AC15 |
| RF-18 | Impedir dos asignaciones activas de la misma materia del grupo y bloque, aunque tengan docentes distintos; liberar esa combinación al cancelar. | F07; AC16 |
| RF-19 | Usar el aula explícita o, si falta, resolver y persistir el aula del grupo; aplicar la misma resolución para detectar cruces. | F07; AC13, AC17 |
| RF-20 | Sumar las horas manuales de todas las asignaciones activas del docente sin partición por ciclo; permitir igualdad al máximo y rechazar exceso. La entrada pública exige horas positivas y como máximo 99. | F04, F07; AC18 |
| RF-21 | Al editar, excluir la carga y ocupación de la propia asignación anterior. Un rechazo debe conservar sus valores previos sin efectos parciales. | F04, F07; AC19 |
| RF-22 | Cancelar mediante estado `cancelled`, conservar historial y liberar carga y ocupación; no reemplazar la cancelación por borrado. | F07; AC20 |
| RF-23 | Bajo altas o ediciones simultáneas incompatibles por docente, grupo, aula, unicidad o carga, permitir solo una confirmación. Una carrera entre cancelación y alta debe equivaler a un orden válido, sin doble liberación ni reservas obsoletas. | F04, F07; AC21 |

### 5.5 Cohortes e historial

| ID | Requisito | Trazabilidad |
|---|---|---|
| RF-24 | Vincular el grupo inicial solo a una cohorte activa de igual carrera, modalidad y turno. No inicializar por inferencia una cohorte sin grupo inicial ni volver a añadir materias cursadas. | F08; AC28 |
| RF-25 | Permitir correcciones manuales únicamente en entradas de historial sin grupo; preservar las vinculadas, exigir carrera compatible y cuatrimestre anterior, deduplicar y auditar altas/bajas. | F08; AC29 |
| RF-26 | Activar ciclos solo por administrador, cerrar el activo anterior y procesar avance de cohortes elegibles. Reintentos, concurrencia y fallos intermedios no deben duplicar grupos ni historial; informar creados, omitidos y pendientes. | F08; AC30 |

### 5.6 Consulta, reportes, auditoría e inicio limpio

| ID | Requisito | Trazabilidad |
|---|---|---|
| RF-27 | Mostrar paneles y carga con asignaciones activas y cambios confirmados; excluir canceladas y no mostrar éxito tras un rechazo. | F04, F09; AC31 |
| RF-28 | Consultar horarios por grupo, docente y aula dentro del ámbito autorizado, mostrando módulo, intervalo y recursos pertinentes. | F09; AC32; DESIGN |
| RF-29 | Exportar reportes y CSV de asignaciones activas con filtros, ámbito, orden y diez columnas de referencia; conciliar filas y conteos con las vistas. Detallar el contrato exacto durante T21. | F10; AC33 |
| RF-30 | Escapar comillas, separadores y saltos de línea y neutralizar contenido interpretable como fórmulas conforme al contrato de exportación de referencia. | F10; AC34 |
| RF-31 | Presentar datos incompletos e indicadores coherentes con el estado académico y el ámbito; el catálogo exacto de indicadores permanece pendiente. | F10; AC36 |
| RF-32 | Registrar cambios relevantes con actor real, fecha, evento y valores anteriores/nuevos pertinentes; mantener coherencia entre mutación y auditoría, incluidas operaciones administrativas. Catálogo y retención pendientes. | F11; AC37 |
| RF-33 | Inicializar instancia con cuentas y catálogos nuevos y administrador inicial controlado. El bootstrap no puede repetirse para escalar privilegios; captura y reintentos no deben crear referencias inválidas ni duplicados. | F12; AC38 |
| RF-34 | Disponer de un procedimiento de restauración/reversión probado en estado aislado, con recuperación de relaciones y acceso. Mecanismo, responsables y RPO/RTO pendientes de acuerdo y presupuesto. | F11–F12; AC39 |

## 6. Reglas de negocio críticas

| ID | Regla y ejemplo verificable | Fuente |
|---|---|---|
| RN-01 | 09:00–10:00 y 09:30–10:30 se solapan; 09:00–10:00 y 10:00–11:00 no. Igual horario en días diferentes tampoco constituye cruce. | AC11–AC14 |
| RN-02 | Módulos positivos distintos `1`/`2` permiten coexistencia horaria; mismo módulo o ausencia de módulo mantienen la comprobación para docente, grupo y aula. | AC15 |
| RN-03 | En el origen, ausencia de módulo es `0`; sabatino/`virtual_modular` utilizan `1` o `2`, otras modalidades `0`. La representación destino sigue pendiente y no puede cambiar el significado. | AC10 |
| RN-04 | Ni carga ni conflictos del validador de referencia se particionan por ciclo. Limitar la exclusión a un ciclo sería un cambio de negocio, no una optimización transparente. | AC18; nota posterior a AC22 |
| RN-05 | Inactividad de catálogos no elimina referencias históricas; cancelar asignaciones tampoco elimina historial. | AC09, AC20 |
| RN-06 | La excepción de reducir horas planeadas no elimina la validación de completitud al finalizar grupos. | AC22, AC25 |
| RN-07 | Toda mutación rechazada deja intacto el estado previo: asignaciones, carga, reservas e historial no pueden quedar parcialmente modificados. | Introducción de ACCEPTANCE; AC19, AC21 |

## 7. Requisitos no funcionales y de operación

| ID | Requisito / objetivo | Estado y comprobación |
|---|---|---|
| RNF-01 Seguridad | Autorización efectiva en servidor, privilegios mínimos y separación de credenciales privilegiadas del cliente; sin secretos en repositorio, bundles o logs. | Requisito destino; pruebas negativas por sesión, actividad, rol y ámbito |
| RNF-02 Sesión | Proteger la sesión frente a uso indebido y cambios de privilegios; contemplar cookies seguras, CSRF, expiración y revocación. | Política y mecanismo concretos pendientes; T07–T10 |
| RNF-03 Consistencia | Mantener invariantes de asignación y avance de cohortes ante concurrencia, reintentos y fallo parcial. | Requisito destino; AC21 y AC30 con persistencia aislada |
| RNF-04 Rendimiento | Medir latencia p95 y consumo por flujo con una carga representativa de unas 50 personas simultáneas. | Estimación de uso confirmada; umbrales/SLO no acordados; AC40 |
| RNF-05 Costo | Validar objetivo $0 sobre base, hosting, ejecución, builds, logs y recuperación antes de habilitarlos. | Restricción confirmada; sin garantía de gratuidad ni autorización de cargos |
| RNF-06 Usabilidad | Navegación por rol y estados de carga, vacío, permiso insuficiente, datos parciales, validación, envío y error recuperable. Preservar entradas ante fallo y permitir recuperar estado después de conflicto. | Requisito de experiencia previsto; AC31–AC32 y DESIGN |
| RNF-07 Accesibilidad | Prever teclado, foco visible, etiquetas, errores asociados, estados textuales, contraste y reducción de movimiento. | WCAG 2.2 AA es objetivo propuesto, no certificación ni criterio institucional aprobado |
| RNF-08 Presentación | Mantener temas claro/oscuro y continuidad visual; verificar tablas y horarios en pantallas pequeñas sin asumir rediseño completo. | Continuidad prevista; dispositivos, resoluciones y compatibilidad pendientes |
| RNF-09 Privacidad | Restringir auditoría/exportaciones y clasificar datos y activos antes de distribuirlos. Usar fixtures sintéticos, no datos personales reales, en pruebas. | Clasificación, retención y responsables pendientes; T03 |
| RNF-10 Recuperación | Ensayar recuperación de datos, relaciones y acceso antes de producción. | Al menos un ensayo completo es meta propuesta; RPO/RTO y mecanismo pendientes |
| RNF-11 Mantenibilidad | Mantener reglas de dominio verificables y separadas de presentación/persistencia; validar entradas y disponer de entorno y runners reproducibles. | Orientación de diseño/desarrollo; estructura concreta propuesta, no aprobada |

No se fijan porcentajes de disponibilidad, tiempos de respuesta, navegadores soportados ni límites de volumen sin acuerdo. Las cuotas o precios externos no se reproducen aquí como valores vigentes: deben verificarse al evaluar infraestructura. Los detalles técnicos sobre SDK, Rules y transacciones corresponden a ARCHITECTURE/RULES y requieren verificación durante la implementación.

## 8. Información y relaciones del dominio

| Conjunto | Información / relaciones necesarias |
|---|---|
| Identidad y ámbito | Cuenta, perfil, rol, actividad, carreras y docentes autorizados |
| Oferta académica | Carreras, materias, perfiles requeridos y requisitos específicos de materia del grupo |
| Docentes | Actividad, perfiles disponibles, responsable, máximo de horas y carga activa |
| Recursos horarios | Aulas, plantillas, bloques, día, intervalo, modalidad, turno y módulo |
| Planeación | Ciclos, grupos, estados, aula del grupo y materias con horas planeadas |
| Asignaciones | Materia del grupo, docente, bloque, horas manuales, aula efectiva y estado |
| Seguimiento | Cohortes, grupos asociados e historial de materias, distinguiendo entradas manuales |
| Trazabilidad | Actor, fecha, evento, entidad, correlación y valores pertinentes |

Es un modelo conceptual, no un esquema Firestore aprobado. Colecciones, tipos, IDs, índices, formatos horarios, precisión de horas, límites y transformaciones siguen pendientes de diseño. No se trasladan IDs ni registros anteriores.

## 9. Interfaces y arquitectura: límites de lo acordado

- **Interfaz humana:** aplicación web administrativa con formularios, catálogos, paneles, horarios y reportes. No implica portales adicionales.
- **Intercambio:** exportación CSV autorizada; no existe compromiso de API pública externa ni integraciones adicionales.
- **Plataforma confirmada:** Firebase/Firestore. Hosting, región, runtime y configuración de ejecución pendientes.
- **Propuesta técnica:** conservar Next.js/React/TypeScript y organizar un monolito modular, separando UI, casos de uso, dominio y adaptadores. No equivale a una decisión final ni a un árbol ya creado.
- **Diseño por demostrar:** consultas, índices, documentos compartidos de consistencia e idempotencia. No basta comprobar ausencia de conflicto y después insertar sin coordinación.
- **Sin requisitos implícitos:** no se exigen microservicios, WebSockets, listeners permanentes ni almacenamiento de archivos por el mero cambio de plataforma.

## 10. Recorridos principales

1. **Preparación:** administración autorizada crea cuentas nuevas y catálogos válidos, configura recursos y ciclos.
2. **Planeación:** coordinación consulta su ámbito y prepara grupos/materias dentro de estados y permisos admitidos.
3. **Asignación:** el sistema valida compatibilidad, carga, intervalo, módulo y aula; confirma estado y auditoría o rechaza sin efectos parciales.
4. **Corrección:** edición recalcula excluyendo la asignación anterior; cancelación conserva historia y libera recursos.
5. **Consulta:** usuarios autorizados revisan horarios, carga, faltantes y reportes; CSV coincide con los datos permitidos.
6. **Avance académico:** administración activa un ciclo; se procesa el avance elegible de cohortes sin duplicar resultados ante repetición o fallo.
7. **Recuperación:** responsables autorizados ensayan restauración en estado aislado antes de operar en producción.

## 11. Aceptación y trazabilidad

### 11.1 Cobertura del alcance

| Función PRD | Requisitos SRS | Casos existentes | Plan |
|---|---|---|---|
| F01 Sesión y aprovisionamiento | RF-01–RF-02 | AC01, AC03 | T07–T09 |
| F02 Permisos | RF-03–RF-04 | AC02, AC04, AC35 | T10 |
| F03 Oferta y perfiles | RF-05–RF-06 | AC05–AC07 | T12 |
| F04 Docentes y carga | RF-07, RF-14, RF-20–RF-23, RF-27 | AC08, AC18–AC22, AC31 | T13, T15–T17 |
| F05 Recursos horarios | RF-08–RF-09 | AC09–AC10 | T14 |
| F06 Grupos y ciclos | RF-10–RF-15 | AC22–AC27 | T15 |
| F07 Asignaciones | RF-16–RF-23 | AC11–AC21 | T16–T17 |
| F08 Cohortes | RF-24–RF-26 | AC28–AC30 | T18–T19 |
| F09 Horarios y paneles | RF-27–RF-28 | AC31–AC32 | T20 |
| F10 Reportes y CSV | RF-29–RF-31, RF-03 | AC33–AC36 | T21 |
| F11 Auditoría y recuperación | RF-32, RF-34 | AC37, AC39 | T11, T28 |
| F12 Inicio limpio | RF-33–RF-34 | AC38–AC39 | T22–T24, T28–T29 |
| Transversal: carga y costo | RNF-04–RNF-05 | AC40 | T02, T26 |

### 11.2 Evidencia requerida antes de lanzamiento

La matriz AC01–AC40 está preparada, **sin ejecución ni aceptación institucional**. Cada prueba futura debe comprobar respuesta y estado persistido; una prueba de interfaz o un build correcto no demuestra permisos ni integridad concurrente.

El PRD propone: 100% de casos críticos y recorridos acordados aprobados; cero accesos indebidos aceptados, pares incompatibles activos, duplicados por reintento y referencias inválidas; auditoría completa del catálogo acordado; y ensayo de recuperación. Son metas de aceptación pendientes de validación institucional, no resultados actuales.

El cierre requiere responsables y decisiones abiertas resueltos, pruebas funcionales y de seguridad/concurrencia, validación de costo, recuperación y aceptación operativa. No hay fecha de lanzamiento acordada.

## 12. Pendientes y discrepancias que no deben perderse

| ID | Pendiente / discrepancia | Impacto / siguiente resolución |
|---|---|---|
| PD-01 | Matriz de permisos por operación y excepciones administrativas | Completar T01/T03 sin ampliar permisos existentes |
| PD-02 | Frecuencias de lectura/escritura, duración de sesiones y volumen de datos | Dimensionar T02/T26; 50 personas no equivale a operaciones mensuales |
| PD-03 | Zona horaria institucional, calendario, unidades/precisión de horas y dispositivos | Definir contratos operativos; no inferirlos de la configuración del equipo |
| PD-04 | SLO, disponibilidad, responsables nominales, retención y RPO/RTO | Acordar aceptación y operación antes de producción |
| PD-05 | Modelo Firestore, consultas, índices, límites y coordinación transaccional | Probar integridad con persistencia aislada en T05 antes de T06 |
| PD-06 | Arquitectura propone módulo nullable; origen usa `0` | Mantener significado de RN-02/RN-03; cerrar contrato destino explícitamente |
| PD-07 | Arquitectura propone guardas por ciclo; reglas de carga/cruces no se particionan por ciclo | No aprobar partición que admita conflictos antes prohibidos; demostrar cobertura |
| PD-08 | Grupo `active` heredado frente a estados destino | Definir mapeo sin normalización silenciosa ni pérdida de restricciones |
| PD-09 | CSV anterior sin sesión devuelve encabezados | El destino debe denegar explícitamente; no confundir paridad observada con requisito de seguridad |
| PD-10 | Diez columnas/orden CSV e indicadores de datos incompletos | Precisar contrato de referencia durante T21 y fijarlo con pruebas |
| PD-11 | Hosting, región, ejecución, controles de consumo y recuperación dentro de $0 | Verificar alternativas/costos antes de habilitar servicios; no asumir gratuidad |
| PD-12 | Clasificación de activos de `Migracion/` y políticas de datos | No publicar paquete, hoja de cálculo ni credenciales por efecto de documentar |
| PD-13 | Arquitectura modular, versiones y objetivos de accesibilidad | Siguen propuestos; requieren validación técnica y aceptación cuando corresponda |

## 13. Estado actual y punto de retomada

Al consolidar este documento, el estado recuperado de TASKS/MEMORY es: **2 tareas terminadas de 30** (T00 y T04), T01 en preparación y 27 no iniciadas. El 6,7% expresa conteo del plan documental, no avance funcional ni esfuerzo. No hay aplicación destino ejecutable ni runner de aplicación en la raíz; la referencia anterior no cuenta como implementación Firebase.

Orden de continuidad registrado:

1. Completar T01–T03: aceptación, operación/consumo y clasificación/permisos pendientes.
2. Diseñar y probar T05: consultas, integridad concurrente, carga, auditoría y activación idempotente.
3. Crear aplicación y entorno reproducible en T06 tras validar el diseño.
4. Implementar identidad/permisos, dominios, asignaciones/cohortes, interfaz e inicialización nueva según dependencias de TASKS.
5. Verificar calidad, aceptación, presupuesto, recuperación y preparación de salida; solicitar autorización específica antes de recursos remotos o despliegue.

Este SRS es una consolidación documental: no completa T01, no aprueba T05 y no autoriza implementación, publicación ni gastos adicionales por sí mismo.

## 14. Glosario y mantenimiento

| Término | Significado en este proyecto |
|---|---|
| Ámbito | Carreras, docentes y condiciones sobre las que una cuenta puede operar |
| Perfil docente | Aptitud académica que se compara con requisitos de una materia; distinto del perfil de acceso |
| Materia del grupo | Relación de una materia con un grupo, sus horas y requisitos particulares |
| Aula efectiva | Aula explícita de la asignación o aula heredada del grupo |
| Módulo | Segmento académico usado para decidir comparabilidad horaria; no módulo de software |
| Cohorte | Conjunto académico que avanza entre ciclos con seguimiento de grupos y materias cursadas |
| Idempotencia | Repetir una operación sin duplicar sus efectos ya confirmados |
| Paridad | Conservación del comportamiento acordado del sistema anterior |
| RPO / RTO | Objetivos de pérdida admisible de datos y tiempo de recuperación, aún no acordados |

Ante una decisión nueva, actualizar el requisito RF/RNF/RN afectado, su trazabilidad y el pendiente correspondiente; registrar aprobación y evidencia en MEMORY y ajustar TASKS/ACCEPTANCE cuando aplique. Conservar identificadores para no perder referencias. No convertir una propuesta en confirmada ni una prueba redactada en aprobada sin evidencia.
