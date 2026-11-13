# Arquitectura del Proyecto — Apoyo al Cálculo de Redes de Gas (DS 66)

Este proyecto implementa la estructura base del documento de diseño **v2** (12 de noviembre de 2026) con **Next.js (App Router + TypeScript)**, **Tailwind CSS v4**, **Vitest** y preparación completa para **Supabase (Auth, Postgres con RLS y Storage privado)** y **Vercel**.

## Principio rector
- La aplicación **apoya, no reemplaza** al instalador autorizado.
- Cada resultado muestra su trazabilidad (fila y columna de tabla, fórmula de control, ruta crítica).
- **No se incluyen sellos ni logos de la SEC**; los informes emitidos no constituyen documentos oficiales por sí solos.

## Estructura de carpetas

- `src/domain/`: Motor puro e independiente de framework.
  - `types.ts`: Modelo compartido único (`Point`, `Segment`, `SegmentPart`, `Appliance`, `Room`, `ProjectData`).
  - `ds66/`: Tablas y constantes oficiales del DS 66 (Tablas V, VI, VIII, IX, XVI, XVII, XVIII, XX, XXI, XXII y Tablas 1/5 de pérdida de presión + fórmula de control).
  - `calculations/`: Motores de cálculo para Módulos 1 a 4 (red, sugerencias, recintos/ventilación, prueba de hermeticidad, cilindros GLP).
  - `diagram/`: Motor geométrico 2D a escala real en metros (Módulo 5), reglas anti-choque/cruces (Sección 9.2), ayuda de direcciones (Sección 9.4) y editor con deshacer/rehacer (Sección 9.5).
  - `validation/`: Esquemas `zod` compartidos entre cliente y rutas de servidor.
  - `fixtures/exam-reference.ts`: Caso de referencia del examen final (Sección 17).
- `src/app/`: Pantallas (App Router) y funciones de servidor (`/api/*`).
  - `/` (`Red`, `Resultados`, `Recintos`): Flujo principal *mobile-first*.
  - `/documentos`: Flujo guiado *"¿Qué hiciste hoy?"* y lectura asistida de fichas técnicas (Módulos 7 y 12).
  - `/cuenta`: Cuenta, perfil de instalador, clientes, privacidad, exportación y borrado (Módulo 8).
  - `/api/appliances/extract`: Endpoint servidor para lectura con visión (clave API solo en servidor).
  - `/api/reports/pdf`: Endpoint servidor para emitir versiones congeladas con hash `SHA-256` (Sección 13.7).
- `src/components/`: Componentes modulares por dominio.
- `src/lib/`: Adaptadores de infraestructura (`supabase/`, `media/image-qc.ts`).
- `supabase/migrations/`: Esquema SQL completo con Row Level Security (RLS) y bucket privado.
- `src/tests/`: Suite automatizada con Vitest.
