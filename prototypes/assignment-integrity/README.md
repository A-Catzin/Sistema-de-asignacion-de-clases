# T05 · Vertical técnica de integridad, permisos, auditoría y activación de ciclos

Desde la raíz, con Node.js 22.23.2 (versión comprobada):

```sh
node prototypes/assignment-integrity/assignment-policy.test.ts
node prototypes/assignment-integrity/authz-policy.test.ts
```

La suite pura cubre 8 pruebas de reglas de asignación (`assignment-policy.test.ts`) y 4 pruebas de autorización por actor, ámbito y estado de grupo (`authz-policy.test.ts`). Las horas se expresan en centésimas enteras para no redondear al sumar (`150` equivale a `1,50 h`).

## Pruebas de integración en el emulador de Firestore

Con el emulador oficial de Firestore (comprobado con `cloud-firestore-emulator-v1.21.0.jar` y Java 21), ejecutar en dos terminales desde la raíz:

```sh
java -jar ~/.cache/firebase/emulators/cloud-firestore-emulator-v1.21.0.jar --host 127.0.0.1 --port 18080 --project_id demo-assignment-integrity
```

```sh
FIRESTORE_EMULATOR_HOST=127.0.0.1:18080 node prototypes/assignment-integrity/firestore-assignment.test.ts
FIRESTORE_EMULATOR_HOST=127.0.0.1:18080 node prototypes/assignment-integrity/firestore-authz-audit.test.ts
FIRESTORE_EMULATOR_HOST=127.0.0.1:18080 node prototypes/assignment-integrity/firestore-cycle-activation.test.ts
FIRESTORE_EMULATOR_HOST=127.0.0.1:18080 node prototypes/assignment-integrity/measure-t05.ts
```

Usar un emulador dedicado: el adaptador compartido (`local-firestore.ts`) solo admite direcciones de bucle local, usa un proyecto `demo-` fijo y exige `Bearer owner` únicamente para operar el emulador local (no sustituye reglas de seguridad ni sesiones de producción).

## Cobertura verificada en el emulador (26 pruebas)

1. **`firestore-assignment.test.ts` (20 pruebas):** alta, edición y cancelación con instantánea global y con el modelo separado por recurso (`teacher`, `group` —que absorbe la unicidad materia–bloque AC16— y `classroom` con proyecciones mínimas por tipo de guarda). Comprueba exclusión concurrente entre ciclos (AC21), tope de carga docente (AC18), aula efectiva heredada (AC13/AC17), unicidad activa materia–bloque y reuso tras cancelar (AC16), preservación de historial (AC20), edición sin conflicto consigo misma (AC19) y verificación directa del formato mínimo persistido.
2. **`firestore-authz-audit.test.ts` (2 pruebas):** denegación previa a escritura ante actor nulo, cuenta inactiva, coordinador inactivo, carrera ajena, docente no vinculado o grupo `final`/`archived` (cero escrituras y cero eventos de auditoría); registro atómico de `AuditEvent` en el mismo commit para altas, ediciones y cancelaciones confirmadas, sin duplicados ante reintentos idempotentes de cancelación (AC02, AC04, AC19, AC23, AC37).
3. **`firestore-cycle-activation.test.ts` (4 pruebas):** activación de ciclo reservada a `admin` activo (AC30), rechazo de ciclos finalizados, cierre del ciclo activo anterior, avance por cohorte en transacciones acotadas (creación de grupo borrador, `groupSubjects`, historial `cohortSubjectHistory`, cierre de cohorte en último cuatrimestre y omisión de cohorte sin grupo inicial según AC28), idempotencia ante reintentos y solicitudes paralelas, y recuperación limpia tras fallo parcial entre cohortes (AC27, AC28, AC30, AC37).

## Mediciones observadas en emulador (`measure-t05.ts`)

Los tiempos locales de emulador no representan latencia de red ni costos de producción; las proyecciones T02 usan el ejemplo entre semana de 13 bloques por grupo y excluyen lecturas de catálogo, navegación, ediciones y cancelaciones:

- **Operaciones por acción (3 guardas mínimas + registro + auditoría atómica):**
  - Alta: **4 lecturas, 5 escrituras, 1 commit** (`record` + `teacher` + `group` + `classroom` + `auditEvent`).
  - Edición sobre los mismos recursos: **4 lecturas, 5 escrituras, 1 commit**.
  - Edición moviendo docente, grupo y aula: **7 lecturas, 8 escrituras, 1 commit**.
  - Cancelación: **4 lecturas, 5 escrituras, 1 commit**.
  - Activación de ciclo (1 ciclo + 1 cohorte de 5 materias): 15 lecturas (4 listados), 13 escrituras, 2 commits.
- **Contención observada:** 6 y 20 escrituras simultáneas sobre recursos disjuntos completaron 6/6 y 20/20 con 0 abortos (24 lecturas / 30 escrituras y 80 lecturas / 100 escrituras); 6 escrituras simultáneas sobre la misma aula y horario confirmaron exactamente 1 alta y rechazaron 5 por `classroom-overlap` (5 commits abortados, 44 lecturas, 5 escrituras confirmadas y cero reservas residuales).
- **Tamaño de guardas mínimas frente al límite de 1 MiB (1 048 576 B) de Firestore:**
  - Registro completo de referencia: ~305 B/entrada (aula de 390 asignaciones = 123 627 B; ~8,78 ciclos hasta 1 MiB).
  - Proyección mínima por guarda:
    - `teacher`: **111 B/entrada** (25 asignaciones = **2 777 B**).
    - `group`: **129 B/entrada** (13 bloques = **1 630 B**).
    - `classroom`: **81 B/entrada** (390 asignaciones en 1 ciclo = **32 033 B**; **12 787 entradas / ~32,78 ciclos** hasta 1 MiB si las asignaciones anteriores siguen `active` por RN-04).
- **Margen frente a cuota gratuita diaria (50 000 lecturas / 20 000 escrituras):**
  - Para 1 000 grupos activos × 13 bloques = 13 000 altas: 65 000 escrituras totales (**13 000/día** en 5 días, **9 286/día** en 7 días) y 52 000 lecturas (**10 400/día** en 5 días).
  - Para 1 300 grupos activos × 13 bloques = 16 900 altas: 84 500 escrituras totales (**16 900/día** en 5 días, **12 072/día** en 7 días) y 67 600 lecturas (**13 520/día** en 5 días), dentro del límite gratuito de 20 000 escrituras/día y 50 000 lecturas/día para altas puras (ediciones, cancelaciones y navegación deben seguir midiéndose en T26).
