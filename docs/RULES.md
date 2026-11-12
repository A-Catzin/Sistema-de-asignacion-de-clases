# Reglas de desarrollo e instrucciones para agentes

![Estado: propuesta normativa](https://img.shields.io/badge/estado-propuesta_normativa-blue) ![Aplicación: nueva etapa](https://img.shields.io/badge/aplicación-nueva_etapa-lightgrey)

| Campo | Valor |
|---|---|
| Versión / fecha | 1.1.0 / 2026-11-11 |
| Alcance | Código nuevo y adaptación autorizada; no modifica la referencia histórica |
| Estado | Guía de trabajo propuesta; distinguir reglas de controles automáticos ya existentes |

## Decisiones confirmadas

Firestore es la base seleccionada. Se inicia con datos/cuentas nuevos, sin importación de producción anterior. El alcance es el proyecto completo; las fases son organización técnica, no entregas MVP. Se preservan las reglas anteriores y sus excepciones aceptadas. Blaze es admisible con presupuesto objetivo $0, no autorización para cargos.

## 1. General Principles

1. **Reglas primero.** Preservar permisos, integridad, historial y excepciones acordadas antes de optimizar o modernizar.
2. **Responsabilidades claras.** UI presenta; casos de uso coordinan; dominio decide; adaptadores persisten. SOLID orienta límites, no exige una clase por función.
3. **DRY con evidencia.** Reutilizar validadores, permisos y helpers existentes cuando su contrato coincida; no duplicar reglas con variantes incompatibles.
4. **YAGNI.** No agregar microservicios, eventos, listeners ni abstracciones genéricas sin necesidad aprobada.
5. **Verificación honesta.** Diferenciar archivo existente, comportamiento implementado, prueba ejecutada y despliegue comprobado.
6. **Cambio acotado.** No corregir decisiones de negocio por preferencia técnica ni alterar datos/producción como efecto de documentar.

## 2. Technology & Coding Standards

### 2.1 TypeScript y framework

| Área | Base observada | Regla para nueva etapa |
|---|---|---|
| Tipado | `strict: true`, `allowJs: false`, ES2022 | Mantener strict; validar entradas externas como `unknown` antes de usarlas |
| `any` | ESLint anterior no lo prohíbe explícitamente | No introducir `any` como escape; definir DTO/uniones y justificar excepciones excepcionales en revisión |
| Imports | Alias `@/*` al directorio raíz de referencia | Imports de tipo explícitos; actualizar alias si se adopta `src/`; impedir import Admin en cliente |
| Nombres | Convenciones anteriores mixtas por módulo | Identificadores en inglés; camelCase en funciones/variables, PascalCase en tipos/componentes, archivos descriptivos y consistentes con su módulo |
| Next.js | App Router y acciones por dominio | Server Components por defecto; `use client` solo para interacción; actions/handlers delgados |
| Validación | Zod y reglas puras de asignación | DTO en cada frontera; autorización separada; revalidar estado dentro de transacción |
| Errores | Helpers y mensajes de dominio anteriores | Resultado tipado; mensaje seguro al usuario y correlación interna sin secretos |
| Estilo | Tailwind + `cn`; ESLint core-web-vitals | Reutilizar tokens; evitar hex aislados y dependencias de UI redundantes |

No copiar lockfile ni dependencias completas sin decidir runtime/compatibilidad. Las versiones observadas son referencia, no una recomendación de «última versión».

### 2.2 Datos, sesión y atomicidad

- Separar Firebase Web y Admin. Credenciales de servicio nunca en variables `NEXT_PUBLIC_*`, bundles, logs o fixtures.
- Verificar identidad, perfil activo y ámbito en cada lectura/mutación protegida, incluso CSV. No confiar en un rol enviado por formulario ni en claims obsoletos sin política de actualización.
- Los guards de rutas son UX; el control definitivo está en operación de servidor. Con Admin, Firestore Rules no se aplican: [documentación oficial](https://firebase.google.com/docs/firestore/security/rules-conditions).
- Sin acceso directo requerido, mantenerlo denegado; si se habilita, diseñar Rules y pruebas negativas. No usar `allow read, write: if true` para resolver errores.
- Mantener asignación, contadores/reservas e historial/auditoría coherentes. Ningún camino administrativo puede omitir las mismas invariantes.
- En Firestore, callbacks transaccionales sin efectos externos y lecturas antes de escrituras. [Referencia](https://firebase.google.com/docs/firestore/manage-data/transactions).
- Un cambio de formato persistido requiere versión, transformación verificable, conciliación y reversión; Firestore tampoco elimina la necesidad de migraciones.
- Definir unidades de carga y zona horaria; no reinterpretar decimales, intervalos ni módulos por conveniencia del SDK.

### 2.3 Presupuesto y datos nuevos

- Presupuesto mensual objetivo $0. Diseñar consultas paginadas, sin listeners indiscriminados, y medir consumo completo de Firestore, hosting, servidor, compilaciones y logs. No asegurar que alcanza por el tipo de proyecto.
- Desarrollo y pruebas con emuladores/fixtures sintéticos; no importar información ni cuentas del sistema anterior. El administrador inicial se aprovisiona de forma controlada y sin contraseñas en repositorio.
- No introducir SQL Connect/Cloud SQL, importación de hashes ni sincronización de origen en esta etapa. No activar backups/PITR/TTL nativos suponiendo uso gratuito.
- Las alertas de presupuesto no son un tope de gasto. Evaluar controles específicos por servicio antes de desplegar; si no se puede cumplir el presupuesto, reportar la limitación y no habilitar cargos por inferencia. [Referencia oficial](https://firebase.google.com/docs/projects/billing/avoid-surprise-bills).

### 2.4 Pruebas y comandos

**No hay runner de aplicación en la raíz.** Los siguientes comandos existen solo en [`Migracion/referencia/codigo/package.json`](../Migracion/referencia/codigo/package.json); no son instrucciones para afirmar que el destino está configurado.

| Comando anterior | Alcance / límite |
|---|---|
| `npm run lint` | ESLint del proyecto de referencia |
| `npm run typecheck` | TypeScript sin emitir |
| `npm test` | Lista explícita de seis archivos unitarios, no toda la carpeta |
| `npm run test:integration` | Integración anterior, requiere infraestructura Supabase |
| `npm run test:rls`, `test:audit`, `test:security` | Suites específicas del origen; sustituir infraestructura y contratos pertinentes |
| `npm run test:e2e` | Playwright; requiere variables/servicios del origen |
| `npm run build` | Compilación de referencia; no demuestra migración ni despliegue |

Los scripts backup/import/env/migrations apuntan a archivos `scripts/` ausentes. No ejecutarlos como procedimiento válido ni reconstruirlos contra producción por suposición. El nuevo proyecto debe declarar sus runners propios y documentarlos antes de usarlos.

Disciplina para cambios de comportamiento:

1. Reproducir la regla con prueba determinista y observar fallo antes del arreglo cuando haya runner aplicable.
2. Implementar lo mínimo y observar aprobación; refactorizar con pruebas verdes.
3. Probar salida, error y efecto persistido, no solo que la función no lanzó excepción.
4. Para permisos: sesión ausente, inactivo, carrera ajena y rol válido. Para consistencia: alta/edición/cancelación, solicitudes paralelas y reintento.
5. Ejecutar prueba focalizada y suite pertinente; registrar comandos/resultados y bloqueos reales.
6. Mantener fixtures sintéticos y emuladores/estado aislado; no usar información de personas reales.

Documentación pasiva no necesita una prueba RED artificial: revisar estructura, enlaces, fuentes, tablas y coherencia. «No ejecutado» nunca equivale a «aprobado».

## 3. Project Structure Rules

La estructura siguiente es propuesta; [ARCHITECTURE §3](ARCHITECTURE.md#3-folder-structure) distingue árbol actual y futuro.

| Tipo de archivo | Ubicación objetivo | Restricción |
|---|---|---|
| Ruta/layout/action/handler | `src/app/` | Adaptar transporte, no concentrar toda la lógica |
| Componente base | `src/components/ui/` | Sin consultas, sesión ni reglas de negocio |
| UI de módulo | `src/features/<domain>/` | No convertirse en librería global sin reutilización real |
| Regla/entidad pura | `src/domain/<domain>/` | Sin React, Firebase ni acceso de red |
| Caso de uso/puerto | `src/application/<domain>/` | Política y coordinación; no SDK concreto |
| Adaptador Firebase | `src/infrastructure/firebase/` | Separar cliente/servidor y mapeo de datos |
| Sesión/autorización | `src/lib/auth/` | Reutilizar política; no repartir condiciones contradictorias |
| DTO/esquema de entrada | Cerca del módulo o `src/lib/validation/` | Compartir solo cuando el contrato sea el mismo |
| Pruebas | `tests/unit`, `tests/integration`, `tests/e2e` | Casos del contrato y regresiones con fixtures seguros |
| Documentación | `docs/` | Mantener estado, decisiones y trazabilidad a fuentes |

`types/supabase.ts` es un mapa histórico, no un tipo universal de dominio nuevo. `Migracion/referencia/` permanece como consulta: implementar fuera de la instantánea. No crear un cajón de sastre `utils` para ocultar reglas de negocio.

## 4. What NOT to Do

| Restricción | Motivo |
|---|---|
| No usar el README raíz como especificación vigente | El usuario lo declara heredado y desactualizado |
| No confundir Firestore elegido con Firestore implementado | La decisión está confirmada, pero no hay configuración ni aplicación destino |
| No convertir tablas en colecciones mecánicamente | Consultas e invariantes necesitan rediseño |
| No trasladar validación SQL solo al cliente | Se perderían seguridad y exclusión concurrente |
| No asumir que una transacción sobre documentos disjuntos evita cruces | Las escrituras incompatibles deben coordinar el mismo estado |
| No borrar asignaciones para simular cancelación | Se debe preservar historia y liberar ocupación correctamente |
| No bloquear reducción de horas planeadas ni quitar borrado de grupos | Se confirmó conservar las reglas y excepciones anteriores, con sus permisos |
| No exponer secretos ni copiar semillas/credenciales | Contienen o pueden contener información de autenticación/personas |
| No publicar assets o la hoja de cálculo sin revisión | La exclusión documentada no coincide totalmente con contenido presente |
| No retirar `/Migracion` de `.gitignore` incidentalmente | Podría distribuir datos/activos no autorizados |
| No cambiar datos/esquema persistido sin plan de migración | Necesita evidencia, respaldo y reversión |
| No afirmar tests/build/deploy verdes sin ejecución observada | La existencia de scripts no es prueba funcional |
| No agregar atribución de IA o `Co-Authored-By` a commits | Convención explícita del proyecto |
| No hacer push, publicar, operar remoto ni cortar producción por autorización local | Requiere autorización específica de destino/operación/sesión |

## 5. AI Agent Rules

### Antes de tocar código

1. Leer instrucciones aplicables y esta suite: PRD → ARCHITECTURE → RULES → MEMORY → TASKS; leer DESIGN para UI.
2. Consultar `/Migracion` y las funciones/migraciones más recientes de la regla afectada. No usar memoria histórica como prueba del estado actual.
3. Inspeccionar `git status` y preservar cambios ajenos. Confirmar si se solicita análisis o implementación; una propuesta no autoriza escribir código.
4. Cargar skills pertinentes. Usar CodeGraph primero para preguntas estructurales si está disponible; si falla, documentar fallback a lectura de archivos.
5. Identificar decisión pendiente, superficie de cambio y pruebas; pedir una sola aclaración cuando sea indispensable y esperar respuesta.

### Durante y después

- Cambiar una unidad coherente con pruebas y documentación; no ampliar el producto por una recomendación de este documento.
- Reutilizar reglas/helpers existentes tras comprobar compatibilidad; preservar normalización de perfiles, estados, cancelación y ámbito.
- Respetar idioma del artefacto: documentación de esta suite en español profesional; identificadores y código nuevos en inglés, salvo convención inequívoca del módulo.
- Registrar decisiones nuevas como propuestas o aceptadas con evidencia. Actualizar TASKS y MEMORY cuando exista trabajo real y comprobado.
- Usar Conventional Commits cuando un commit esté autorizado. No hacer commits/push como efecto incidental de una revisión documental.
- Informar archivos modificados y checks fallidos, omitidos o pendientes. No inventar métricas, usuarios, fechas, autores ni aprobaciones.
- Si se delega, acotar lectura/escritura, transmitir fuentes y restricciones de privacidad, y verificar el resultado antes de integrarlo.

### Mantenimiento documental

| Cambio | Documentos que deben revisarse |
|---|---|
| Producto, roles o alcance | PRD, TASKS, MEMORY |
| Persistencia, auth, sesión o API | ARCHITECTURE, RULES, pruebas y ADR en MEMORY |
| Tokens/componentes | DESIGN; evidencia del código y comprobación visual |
| Tarea terminada/bloqueada | TASKS: conteos y evidencia; MEMORY: estado y siguiente paso |
| Decisión sobre excepciones | PRD, ARCHITECTURE y MEMORY, con aprobación institucional |
