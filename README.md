# DeltaGas

Aplicación web de apoyo técnico para el cálculo hidráulico, trazado geométrico a escala, verificación de recintos y preparación documental de redes interiores de gas en baja presión en Chile (**DS 66**), optimizada para lectura en gabinete y uso *mobile-first* en terreno.

> **Nota normativa:** DeltaGas apoya, pero **no reemplaza**, al instalador de gas autorizado. La aplicación no incluye sellos ni logos de la SEC y cada cálculo muestra su trazabilidad normativa para revisión y firma profesional.

---

## Características principales

- **Memoria de cálculo de red (Cobre Tipo L):** cálculo de potencia instalada y acumulada aguas arriba, pérdida de presión en Pa por tramo y acumulada desde el regulador para **GN** y **GLP** mediante Tablas 1/5 y Fórmula de Pole modificada, detección de rutas críticas y sugerencias automáticas de diámetro cuando se excede el límite normativo.
- **Diagrama 2D interactivo a escala real (metros):**
  - Trazado ortogonal y diagonal (8 direcciones) partiendo desde el regulador (`S`).
  - Detección automática de colisiones, cruces entre tramos y devoluciones.
  - Edición directa en el plano (selección de tramos, ajuste de largo, adición de quiebres y deshacer/rehacer).
  - Navegación fluida: **zoom con la rueda del ratón centrado en el cursor** (`30%` a `500%`), botones de acercar/alejar/ajustar a pantalla y desplazamiento arrastrando el fondo.
  - Representación en planta de recintos vinculados a artefactos con edición rápida de **alto, largo y ancho** y alerta visual (rojo parpadeante) cuando no cumplen el volumen mínimo DS 66.
- **Verificación de recintos, hermeticidad y cilindros GLP:**
  - Evaluación de volumen bruto mínimo (Tabla XX y fórmula `f.8` para estufas) y aberturas de ventilación (Tablas XXI y XXII).
  - Hoja referencial para prueba de hermeticidad (Art. 78.3.5) y cálculo de dotación de cilindros GLP (Tablas XVII y XVIII).
- **Diagramas de ejemplo y respaldo local:** inicia con un lienzo limpio listo para trazar y permite cargar desde **Diagramas de ejemplo** el **Ejemplo 1** (red GLP de 5 tramos y 39 Mcal/h) o el **Ejemplo 2** (caso de referencia del examen DS 66 - Arica), manteniendo guardado automático en navegador (`localStorage`) con saneamiento de borradores, además de rutas listas para integrar **Supabase** (Auth, Postgres con RLS y Storage).
- **Sistema visual "Ingeniería Pizarra" + Modo Oscuro:** paleta sobria de alto contraste (neutros fríos en modo claro y pizarra nocturna en modo oscuro mediante el botón flotante inferior derecho).

---

## Organización del proyecto

```text
.
├── docs/
│   ├── architecture.md               # Visión arquitectónica v2 del proyecto
│   └── normative-pending.md          # Matriz de definiciones normativas y de producto
├── src/
│   ├── app/                          # Rutas App Router, estilos y endpoints API
│   │   ├── (auth)/login/page.tsx     # Acceso y registro (Supabase Auth opcional)
│   │   ├── api/
│   │   │   ├── appliances/extract/   # Endpoint servidor para lectura de placas técnicas con visión
│   │   │   ├── health/               # Estado de servicio y capacidades configuradas
│   │   │   └── reports/pdf/          # Validación servidor y hash de integridad SHA-256
│   │   ├── cuenta/page.tsx           # Perfil de instalador, exportación y borrado local/cuenta
│   │   ├── documentos/page.tsx       # Checklist diario ("¿Qué hiciste hoy?") y control de fotos QC
│   │   ├── globals.css               # Variables CSS "Ingeniería Pizarra" (claro y .dark) + Tailwind v4
│   │   ├── layout.tsx                # Layout raíz, metadata DeltaGas e inicialización de tema
│   │   └── page.tsx                  # Entrada principal de la aplicación
│   ├── components/                   # Componentes de interfaz agrupados por dominio
│   │   ├── diagram/
│   │   │   ├── NetworkDiagram.tsx    # Lienzo SVG a escala, zoom con rueda, paneo, arrastre y recintos 2D
│   │   │   └── QuickAddSegmentBar.tsx # Barra rápida contextual para agregar tramos, artefactos y recintos
│   │   ├── network/
│   │   │   ├── ApplianceForm.tsx     # Formulario de creación/edición de artefactos con tabla DS 66
│   │   │   └── NetworkPanel.tsx      # Editor de tramos, diámetros, largos, quiebres y artefactos
│   │   ├── results/
│   │   │   └── ResultsTab.tsx        # Tabla de memoria de cálculo, ruta crítica, cilindros y hermeticidad
│   │   ├── rooms/
│   │   │   ├── RoomQuickEditor.tsx   # Modal/editor rápido de dimensiones de recinto desde el plano
│   │   │   └── RoomsTab.tsx          # Gestión detallada de recintos y ventilaciones DS 66
│   │   └── workspace/
│   │       ├── AppHeader.tsx         # Encabezado principal y navegación entre vistas
│   │       ├── GasWorkspace.tsx      # Estado unificado del proyecto, pestañas e historial undo/redo
│   │       └── ThemeToggle.tsx       # Botón flotante para alternar modo claro / oscuro
│   ├── domain/                       # Motor puro de cálculo e ingeniería (independiente de React/Next)
│   │   ├── calculations/
│   │   │   ├── cylinders.ts          # Dotación de cilindros GLP
│   │   │   ├── hermeticity.ts        # Referencia prueba de hermeticidad (Art. 78.3.5)
│   │   │   ├── index.ts              # Exportaciones del módulo de cálculos
│   │   │   ├── network.ts            # Potencias acumuladas y pérdidas de presión en la red
│   │   │   ├── rooms.ts              # Evaluación de recintos y ventilaciones
│   │   │   └── suggestions.ts        # Propuestas automáticas de aumento de diámetro
│   │   ├── diagram/
│   │   │   ├── auto-direction.ts     # Evaluación de direcciones disponibles desde un punto
│   │   │   ├── collisions.ts         # Validación de cruces, solapamientos y devoluciones
│   │   │   ├── editor.ts             # Acciones de edición de trazado con soporte de historial
│   │   │   ├── geometry.ts           # Proyección 2D en 8 direcciones (ortogonales + diagonales)
│   │   │   └── index.ts              # Exportaciones del motor geométrico
│   │   ├── ds66/                     # Tablas y constantes del Reglamento DS 66
│   │   │   ├── appliances.ts         # Factores de conversión (Mcal/h <-> kW) y clases de artefactos
│   │   │   ├── cylinders.ts          # Tablas XVII y XVIII de capacidad y vaporización GLP
│   │   │   ├── gases.ts              # Constantes de GN y GLP y límites de pérdida de presión
│   │   │   ├── index.ts              # Exportaciones normativas DS 66
│   │   │   ├── pipes.ts              # Diámetros y propiedades de cañería Cobre Tipo L
│   │   │   ├── pressure-tables.ts    # Tablas 1/5 y fórmula de Pole modificada
│   │   │   └── rooms.ts              # Tablas XX, XXI, XXII y altura por defecto de recintos
│   │   ├── fixtures/
│   │   │   ├── exam-reference.ts     # Ejemplo 2: caso completo de referencia (Examen DS 66 - Arica)
│   │   │   ├── examples.ts           # Catálogo de diagramas de ejemplo cargables desde la UI
│   │   │   └── module4-example.ts    # Ejemplo 1: red GLP de 5 tramos y 3 artefactos (39 Mcal/h)
│   │   ├── validation/
│   │   │   └── schemas.ts            # Esquemas Zod compartidos entre cliente y API
│   │   └── types.ts                  # Tipos base del dominio (Point, Segment, Appliance, Room, ProjectData)
│   ├── lib/                          # Adaptadores de almacenamiento local, media y Supabase
│   │   ├── media/image-qc.ts         # Control de nitidez/compresión de fotos en cliente
│   │   ├── storage/draft.ts          # Persistencia en localStorage y sanitización de borradores
│   │   └── supabase/                 # Clientes browser, server y admin (opcionales)
│   └── tests/
│       └── domain.test.ts            # Suite de pruebas unitarias con Vitest
├── supabase/
│   └── migrations/
│       └── 0001_initial_schema.sql   # Esquema Postgres inicial con políticas RLS
├── .env.example                      # Plantilla de variables de entorno (sin secretos reales)
├── .gitignore
├── LICENSE                           # Licencia GNU GPL v3.0
├── next.config.ts
├── package.json
├── postcss.config.mjs
├── tsconfig.json
└── vitest.config.ts
```

---

## Stack tecnológico

- **Framework:** Next.js `15.3.2` (App Router) + React `19`
- **Lenguaje:** TypeScript `5.8.2` (`strict` + `noUncheckedIndexedAccess`)
- **Estilos e iconos:** Tailwind CSS v4 (`@tailwindcss/postcss`) + `lucide-react`
- **Validación:** Zod `3.24.2`
- **Pruebas:** Vitest `3.0.8`
- **Backend / Persistencia opcional:** `@supabase/supabase-js` + `@supabase/ssr`

---

## Instalación y uso local

### 1. Requisitos previos
- Node.js 20+ (probado con Node v22) y `npm`.

### 2. Instalar dependencias
```bash
npm install
```

### 3. Variables de entorno (opcional para modo local)
La calculadora, el diagrama y el guardado local funcionan sin configurar Supabase ni APIs externas. Si deseas habilitar autenticación o extracción de placas por visión en servidor, copia la plantilla y completa tus credenciales en `.env.local` (**nunca subas `.env.local` al repositorio**):

```bash
cp .env.example .env.local
```

Variables principales definidas en [`.env.example`](.env.example):
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (solo servidor)
- `ANTHROPIC_API_KEY`, `VISION_MODEL`, `VISION_DAILY_USER_LIMIT` (solo servidor)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`

### 4. Ejecutar en desarrollo
```bash
npm run dev
```
Abre [http://localhost:3000](http://localhost:3000) en tu navegador.

---

## Scripts disponibles

| Comando | Descripción |
| --- | --- |
| `npm run dev` | Inicia el servidor de desarrollo de Next.js |
| `npm run build` | Compila la aplicación para producción |
| `npm start` | Sirve la build de producción |
| `npm test` | Ejecuta las pruebas unitarias con Vitest (`vitest run`) |
| `npm run test:watch` | Ejecuta Vitest en modo observación |
| `npm run typecheck` | Verifica tipos TypeScript sin emitir archivos (`tsc --noEmit`) |
| `npm run lint` | Ejecuta `next lint` |

---

## Documentación adicional

- [`docs/architecture.md`](docs/architecture.md): principios de diseño y arquitectura general.
- [`docs/normative-pending.md`](docs/normative-pending.md): estado de implementaciones y definiciones normativas pendientes del DS 66.

---

## Licencia

Distribuido bajo la licencia **GNU General Public License v3.0 (GPL-3.0)**. Consulta el archivo [`LICENSE`](LICENSE) para más detalles.
