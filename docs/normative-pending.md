# Pendientes de definición normativa y de producto (Sección 19)

Estado inicial respecto a los puntos listados en la Sección 19 del documento de diseño v2:

| Tema | Estado en la estructura inicial | Qué falta confirmar |
| --- | --- | --- |
| Tablas 1 y 5 impresas ("PDF de tablas") | Implementadas en `src/domain/ds66/pressure-tables.ts` derivadas de la fórmula de Pole modificada con los factores exactos de la Sección 5.1 (`F`, `K`, `D`, ejemplo `1", 41 Mcal/h, 8 m → 24 Pa`). | Reemplazar/validar contra el PDF impreso de Tablas 1 y 5 si hubiera diferencias puntuales de redondeo en celdas. |
| Tiempo de prueba de hermeticidad (Módulo 3) | Campo de ingreso manual; se muestra además como referencia informativa la fórmula DS 66 Art. 78.3.5 (`V × 214`, mín. 15 min, máx. 60 min). | Confirmar si se adopta la fórmula Art. 78.3.5 u otra regla del curso/examen. |
| Método de cálculo de cilindros (Módulo 4) | Por defecto usa Razón de Vaporización (Tabla XVIII); incluye soporte para Consumo Diario (Tabla XVII, `f.7`). | Confirmar cuál exige la memoria / examen. |
| Volumen mínimo `Pt > 16 kW` (Tabla XX) | Confirmado en XML oficial del DS 66 (BCN): `Pm - 8` (m³), y fórmula `f.8` `V = Pt / 0,093` (mín. 15 m³) para estufas. | Listo (ya verificado contra DS 66 oficial). |
| Altura de recinto por defecto (Módulo 2) | Propone `2,4 m` editables por recinto. | Confirmar si el valor por defecto definitivo es `2,4 m`. |
| Longitudes equivalentes de accesorios | Campo opcional `equivalentLengthMeters` en cada `Segment` (por defecto `0`, nunca se dibuja en el plano). | Definir si se agregan tablas de codos/tees/válvulas o se deja opcional. |
| Solución de referencia del examen | Fixture completo cargado en `src/domain/fixtures/exam-reference.ts` con diámetros provisorios. | Validar valores esperados finales contra pauta oficial del examen. |
| Informes y formularios SEC (Módulo 7) | Flujo guiado *"¿qué hiciste hoy?"* y estructura propia sin sellos SEC. | Confirmar campos obligatorios exactos por cada tipo de trámite. |
| Regiones/planes de Vercel y Supabase + Cobro | `.env.example`, `next.config.ts` y `supabase/migrations/0001_initial_schema.sql` listos. | Definir plan, región (`sa-east-1` / `gru1`) y modelo de cobro antes de Fase F. |
