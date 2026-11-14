# Arquitectura del Proyecto — Apoyo al Cálculo de Redes de Gas (DS 66)

Este proyecto implementa la aplicación web de apoyo técnico para el cálculo de redes interiores de gas en baja presión bajo el **Decreto Supremo N° 66 (DS 66)** de Chile con **Next.js (App Router + TypeScript)**, **Tailwind CSS v4**, **Vitest** y preparación completa para **Supabase (Auth, Postgres con RLS y Storage privado)** y **Vercel**.

## Principio rector
- La aplicación **apoya, no reemplaza** al instalador autorizado.
- Se rige exclusivamente por el **Decreto Supremo N° 66 (2007)** (Reglamento de Instalaciones Interiores y Medidores de Gas).
- Cada resultado muestra su trazabilidad normativa (fila y columna de tabla DS 66, fórmula de control de Pole modificada, ruta crítica).
- **No se incluyen sellos ni logos de la SEC**; los informes emitidos no constituyen documentos oficiales por sí solos.

## Estructura de carpetas

- `src/domain/`: Motor puro e independiente de framework.
  - `types.ts`: Modelo compartido único (`Point`, `Segment`, `SegmentPart`, `Appliance`, `Room`, `ProjectData`).
  - `ds66/`: Tablas, constantes y corpus del DS 66 (Tablas V, VI, VIII, IX, XVI, XVII, XVIII, XX, XXI, XXII y Tablas 1/5 de pérdida de presión + fórmula de control).
  - `calculations/`: Motores de cálculo para red, sugerencias, recintos/ventilación, prueba de hermeticidad (Art. 78.3.5) y cilindros GLP (Art. 61).
  - `diagram/`: Motor geométrico 2D a escala real en metros, reglas anti-choque/cruces, ayuda de direcciones y editor con deshacer/rehacer.
  - `validation/`: Esquemas `zod` compartidos entre cliente y rutas de servidor.
  - `fixtures/`: Casos de ejemplo residenciales basados exclusivamente en el DS 66 (`residential-basic.ts`, `residential-extended.ts`, `examples.ts`).
- `src/app/`: Pantallas (App Router) y funciones de servidor (`/api/*`).
  - `/` (`Proyecto`): Flujo guiado en 5 pasos (*Tipo de gas*, *Trazar red*, *Recintos*, *Resultados*, *Documentos*).
  - `/documentos`: Flujo guiado *"¿Qué hiciste hoy?"* y lectura asistida de fichas técnicas.
  - `/cuenta`: Cuenta, perfil de instalador, clientes, privacidad, exportación y borrado.
  - `/api/chat`: Proxy de asistente IA regido estrictamente por el DS 66 con caché, rate-limit y Cloudflare Turnstile.
  - `/api/appliances/extract`: Endpoint servidor para lectura con visión (clave API solo en servidor).
  - `/api/reports/pdf`: Endpoint servidor para emitir versiones congeladas con hash `SHA-256`.
- `src/components/`: Componentes modulares por dominio.
- `src/lib/`: Adaptadores de infraestructura (`chat/`, `storage/`, `supabase/`, `media/image-qc.ts`).
- `supabase/migrations/`: Esquema SQL completo con Row Level Security (RLS) y bucket privado.
- `src/tests/`: Suite automatizada con Vitest.
