# Sistema de diseño y guías de interfaz

![Estado: extraído de referencia](https://img.shields.io/badge/estado-extraído_de_referencia-blue) ![Validación visual: pendiente](https://img.shields.io/badge/validación_visual-pendiente-yellow)

| Campo | Valor |
|---|---|
| Versión / fecha | 1.1.0 / 2026-11-11 |
| Superficie | Aplicación operativa de coordinación académica |
| Autoridad visual | CSS, configuración Tailwind y componentes anteriores |
| Alcance | Preservar identidad y patrones; no rediseño ni implementación de pantallas |

**Contexto confirmado:** Firestore, datos nuevos, alcance funcional completo y reglas anteriores; presupuesto objetivo $0. La elección de persistencia no autoriza un rediseño visual ni justifica retirar accesibilidad o feedback para reducir costos.

La interfaz de referencia utiliza azul institucional, superficies neutras, densidad moderada y temas claro/oscuro. Este documento captura código existente, no una revisión de pantallas renderizadas. Las mejoras de accesibilidad indicadas son criterios propuestos, no una certificación.

Fuentes: [globals.css](../Migracion/referencia/codigo/app/globals.css), [Tailwind](../Migracion/referencia/codigo/tailwind.config.ts), [layout](../Migracion/referencia/codigo/app/layout.tsx), [primitivas UI](../Migracion/referencia/codigo/components/ui), [shell](../Migracion/referencia/codigo/components/comic-shell.tsx).

## 1. Design Principles

| Principio | Aplicación |
|---|---|
| Claridad operativa | Priorizar ciclo, carrera, grupo, estado y errores de asignación por encima de decoración |
| Identidad institucional | Reutilizar azul y activos autorizados; no inferir derechos de publicación |
| Consistencia semántica | Mismo color y etiqueta para el mismo estado; no depender exclusivamente del color |
| Accesibilidad verificable | Navegación por teclado, foco visible, etiquetas y mensajes asociados; evaluar contraste |
| Adaptación responsiva | El shell ya contempla navegación móvil; tablas/horarios requieren comprobar desbordamiento |
| Seguridad comprensible | Comunicar por qué una acción se deniega; la UI no reemplaza controles de servidor |
| Continuidad | Mantener patrones familiares durante la migración; cambios visuales amplios fuera de alcance |

**Regla de estado visible:** una operación pendiente, rechazada o confirmada debe distinguirse con texto y comportamiento, no solo con un toast o cambio de tono. Objetivo de accesibilidad propuesto: WCAG 2.2 AA, sujeto a auditoría, sin afirmar conformidad actual.

## 2. Color Palette

### 2.1 Tokens existentes

Valores literales de `globals.css`; las clases provienen de la extensión Tailwind. Usar variables para que el cambio de tema no dependa de hexadecimales repetidos en componentes.

| Token | Rol | Claro | Oscuro | Uso Tailwind |
|---|---|---|---|---|
| `--brand` / `--primary` | Acción principal | `#1e3a5f` | `#60a5fa` | `bg-brand`, `bg-primary` |
| `--brand-deep` | Marca intensa / hover | `#0f172a` | `#93c5fd` | `bg-brandDeep` |
| `--brand-light` | Variante marca | `#3b5b82` | `#93c5fd` | `text-brandLight` |
| `--brand-soft` / `--accent` | Énfasis suave | `#e8eef4` | `#1e293b` | `bg-brandSoft`, `bg-accent` |
| `--secondary` | Acción secundaria | `#f1f5f9` | `#1e293b` | `bg-secondary` |
| `--background` | Fondo principal | `#ffffff` | `#0f172a` | `bg-background` |
| `--card` / `--panel-elevated` | Superficie elevada | `#ffffff` | `#1e293b` | `bg-card`; sin alias dedicado a panel-elevated |
| `--panel` | Fondo secundario | `#f1f5f9` | `#0f172a` | `bg-panel` |
| `--ink` / `--foreground` | Texto principal | `#0f172a` | `#f8fafc` | `text-ink`, `text-foreground` |
| `--muted` | Texto secundario | `#475569` | `#94a3b8` | `text-muted` |
| `--muted-foreground` | Texto atenuado | `#64748b` | `#94a3b8` | Variable existe; falta alias inspeccionado |
| `--line` / `--border` | Borde | `#cbd5e1` | `#334155` | `border-line`, `border-border` |
| `--line-subtle` | Borde suave | `#e2e8f0` | `#1e293b` | Variable existe; falta alias inspeccionado |
| `--input` | Borde de campo | `#e2e8f0` | `#334155` | `border-input` |
| `--destructive` | Acción destructiva / error | `#b91c1c` | `#f87171` | `bg-destructive` |
| `--ring` | Foco | `#1e3a5f` | `#60a5fa` | `ring-ring` |
| `--primary-foreground` | Texto sobre primary | `#ffffff` | `#0f172a` | `text-primary-foreground` |

### 2.2 Estados implementados con utilidades

No existen variables globales `--success` ni `--warning`. El componente [Badge](../Migracion/referencia/codigo/components/ui/badge.tsx) usa la paleta estándar Tailwind 3.

| Estado | Claro: fondo / texto / borde | Oscuro: fondo / texto / borde |
|---|---|---|
| Success | emerald-50 `#ecfdf5` / 700 `#047857` / 200 `#a7f3d0` | emerald-950 / 300 / 800 |
| Warning | amber-50 `#fffbeb` / 700 `#b45309` / 200 `#fde68a` | amber-950 / 300 / 800 |
| Info | blue-50 / 700 / 200 | blue-950 / 300 / 800 |
| Danger | red-50 / 700 / 200 | red-950 / 300 / 800 |

La insignia danger y el botón destructive no comparten exactamente la misma paleta. Documentar esta diferencia antes de unificarla; no cambiarla incidentalmente al migrar persistencia.

## 3. Typography

### 3.1 Familias declaradas

| Rol | Declaración | Límite de evidencia |
|---|---|---|
| Sans | system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif | Variable y alias `font-sans`; comprobar aplicación efectiva en navegador |
| Serif | Georgia, Times New Roman, serif | Disponible como `font-serif`, no tipografía principal obligatoria |
| Mono | JetBrains Mono, ui-monospace, monospace | No se encontró descarga de JetBrains Mono; puede usar fallback |

El layout no carga `next/font`. No documentar una fuente remota como instalada. `--tracking-normal: -0.01em` se aplica en `body`; inputs y botones heredan fuente.

### 3.2 Escala utilitaria de referencia

Tailwind no redefine tamaños ni line-heights. Esta escala describe sus utilidades, **no afirma que cada nivel ya tenga un rol global formalizado**.

| Clase | Tamaño / line-height | Uso recomendado para nuevas pantallas |
|---|---|---|
| `text-xs` | 12 / 16 px | Badges y metadatos secundarios legibles |
| `text-sm` | 14 / 20 px | Botones, inputs y tablas |
| `text-base` | 16 / 24 px | Texto y explicaciones |
| `text-lg` | 18 / 28 px | Encabezados de sección |
| `text-xl` | 20 / 28 px | Paneles principales |
| `text-2xl` | 24 / 32 px | Título de vista cuando el espacio lo permita |

Pesos: normal 400, medium 500, semibold 600 y bold 700 como utilidades disponibles; botón y badge usan semibold. No reducir información crítica por debajo de la escala de referencia para acomodar horarios.

## 4. UI Components Specification

| Componente / evidencia | Contrato visual observado | Guía de uso y verificación al reutilizar |
|---|---|---|
| `ui/button.tsx` | Variantes primary/secondary/ghost/danger; `min-h-10` 40px; `px-4 py-2`; texto small semibold; foco y disabled | Una acción principal por sección; botón danger para destructivas; explicitar carga y prevenir doble envío |
| `ui/input.tsx` | Altura mínima 40px, ancho completo, borde, fondo y texto semánticos | Label asociado y error por campo; no usar placeholder como única etiqueta |
| `ui/badge.tsx` | neutral/success/warning/info/danger/brand; texto 12px; borde tipo ring | Etiqueta textual de estado; no convertir insignias pasivas en acciones ambiguas |
| Cards / paneles | Fondos card/panel y sombras declaradas | Agrupar contenido relacionado; distinguir vacío, carga y error; no inventar variantes/API sin inspeccionar consumidor |
| `ui/confirm-dialog.tsx` | Foco inicial Cancelar, restauración, Escape, trap Tab, `aria-modal`, alerta de error | Confirmación de consecuencias; comprobar lectores de pantalla y foco con pruebas |
| Tablas/listados de dominio | Patrones reutilizados en componentes y páginas | Encabezados claros, filtros visibles, paginación; preservar navegación por teclado y datos al fallar |
| `components/schedule/` | Representación de horarios y plantillas | Mostrar módulo, intervalo, docente y aula; conflicto explicado por texto; validar scroll móvil |
| `ui/toaster.tsx` | Integración Sonner en layout | Feedback breve; errores críticos persistentes también junto a la operación |
| Shell / navegación | Sidebar de escritorio y encabezado móvil | Mostrar ubicación/rol/ciclo; navegación filtrada solo como complemento de permisos |

Los colores comentados como «shadcn» en Tailwind no prueban una instalación de shadcn/ui o Radix. Reutilizar componentes reales y `cn` de `lib/utils`; no agregar otra librería de UI por asociación de nombres.

### Estados que debe contemplar cada flujo migrado

Carga inicial, vacío, sin permiso, datos parciales, validación fallida, envío pendiente, confirmación y error recuperable. Probar que un error no deja un éxito aparente ni elimina datos ingresados. Para conflictos concurrentes, mostrar el rechazo real y permitir recargar estado; no confirmar optimistamente una asignación antes del commit.

## 5. Layout & Spacing

### Composición existente

- Sidebar: 256px (`w-64`) desde `lg`; cabecera alternativa en móvil.
- Contenido: `max-w-6xl`, aproximadamente 1152px; gutters observados de 16/24px y 32px desde `md` en zonas del shell.
- Breakpoints: defaults Tailwind 3, sin personalización en la configuración inspeccionada.
- El grid no tiene un sistema global de 12 columnas declarado. Definir columnas por tarea; evitar presentar uno como existente.

| Breakpoint | Ancho mínimo | Guía de comprobación |
|---|---|---|
| Base | 0 | Formularios utilizables, acciones sin superposición |
| `sm` | 640px | Reorganizar controles según espacio real |
| `md` | 768px | Revisar gutters y columnas de formularios |
| `lg` | 1024px | Sidebar y tablas de escritorio |
| `xl` | 1280px | Mantener ancho legible, no estirar formularios ilimitadamente |
| `2xl` | 1536px | Aprovechar espacio sin perder jerarquía |

### Escala y materialidad

| Propiedad | Existente | Aplicación |
|---|---|---|
| Espaciado | Utilidades estándar; ejemplos 4/8/12/16/24/32px | Ritmo propuesto basado en múltiplos de 4; no token global personalizado |
| Radio base | `--radius: .375rem` = 6px | Tailwind sm 2px, md 4px, lg 6px, xl 10px |
| Sombra `subtle` | `0 1px 2px rgb(15 23 42 / 0.06)` | Botón y elevación mínima |
| Sombra `panel` | `0 10px 30px rgb(15 23 42 / 0.08)` | Superficies elevadas cuando corresponda |
| Movimiento reducido | Media query `prefers-reduced-motion` | Preservar reducción de animación/transición al migrar |
| Tema | Clase `dark` desde preferencia/localStorage | Comprobar ambos temas; no introducir nuevo tema accidentalmente |

### Deuda visual y aceptación

`muted-foreground` y `line-subtle` existen como variables pero no como aliases de color en la extensión inspeccionada, aunque aparecen en clases. Revisar estilos compilados antes de copiar; no se corrigió código en esta entrega. Evaluar contraste, zoom, teclado, diálogos y targets táctiles; 40px es una medida observada, no una declaración de cumplimiento. Verificar activos institucionales antes de publicarlos.
