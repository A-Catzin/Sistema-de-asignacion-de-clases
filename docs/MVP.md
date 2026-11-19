# MVP interno y entregables de demostración

El MVP es una **versión interna para observar y probar el sistema**, no un lanzamiento a producción ni un recorte del alcance completo. El [SRS](SRS.md) define qué debe hacer el producto; [TASKS](TASKS.md) sigue siendo la única fuente del estado de implementación. Este documento agrupa tareas existentes en demostraciones verificables.

## Qué se podrá ver y cuándo

| Hito | Entregable | Demostración y criterio de salida | Tareas |
|---|---|---|---|
| D0 · Prueba técnica | Prototipo aislado, sin exigir interfaz | Intentar dos asignaciones incompatibles y comprobar que solo una queda registrada; repetir la activación de un ciclo sin duplicados. Revisar carga y efectos persistidos. | T05; AC21 y AC30 en [ACCEPTANCE](ACCEPTANCE.md) |
| D1 · Primera demo local | Aplicación base ejecutable; todavía no es el MVP | Arrancar la aplicación y los emuladores con comandos documentados y abrir la pantalla inicial. Sin datos institucionales. | T06 |
| D2 · Preparación académica | Acceso por rol y datos de planeación | Entrar con cuentas de prueba, preparar un grupo con materia, docente y bloque, y comprobar que un coordinador no accede a una carrera ajena. | T07–T15 |
| D3 · MVP interno | Flujo completo de asignación con un conjunto pequeño de datos sintéticos | Entrar, abrir un grupo del ámbito autorizado, asignar docente y bloque, y ver la asignación guardada en el grupo. Intentar un cruce, comprobar el rechazo y cancelar la asignación sin perder su historial. Verificar que la cancelación libera el horario y que dos solicitudes incompatibles no quedan activas. | T16–T17 y dependencias; AC11–AC21 en [ACCEPTANCE](ACCEPTANCE.md) |
| D4 · Operación ampliada | Cohortes, horarios, paneles y reportes | Demostrar avance de cohortes sin duplicados, consulta de horarios por ámbito y exportación CSV coherente con la vista. | T18–T21 |
| D5 · Preparación de salida | Sistema completo listo para evaluación institucional | Ensayar arranque con datos y cuentas nuevos, verificar carga, costo, recuperación y aceptación. La puesta en marcha T29 requiere autorización aparte. | T22–T29 |

El MVP no depende de terminar paneles, CSV ni la interfaz avanzada de cohortes. Esas capacidades siguen en el alcance completo. La consulta mínima del MVP solo necesita mostrar el resultado guardado, no sustituye la pantalla de horarios de T20.

## Dónde se revisará

- **Local, por defecto:** aplicación y emuladores, cuentas de prueba y datos sintéticos. Es la primera vía para observar el sistema y repetir las demostraciones sin depender de un entorno remoto.
- **Firebase, opcional:** entorno de demostración separado para compartir acceso. Solo se prepara cuando se hayan validado hosting, acceso y costo bajo el objetivo de $0, y exista autorización explícita para el destino, la operación y la cuenta o sesión. No utilizar producción ni datos anteriores para una demo.

## Cómo registrar una demo

En las notas de las tareas relacionadas, registrar la referencia del cambio, entorno, instrucciones de arranque, recorrido observado y resultado de los casos aplicables. Una demo está disponible cuando se puede repetir; mostrar una pantalla no demuestra que los datos se guarden ni que se respeten los permisos.

**Validación del MVP interno:** se probará principalmente en computadora y también en celular. El solicitante dará el visto bueno o comunicará los ajustes necesarios después de la junta de presentación. La junta no tiene fecha acordada y este visto bueno no autoriza el despliegue a producción.

**Punto de partida:** todavía no hay aplicación destino ejecutable. La primera prueba es D0 (T05, después de T01–T03); la primera pantalla se podrá revisar en D1 (T06). Este plan no inicia implementación ni despliegue.
