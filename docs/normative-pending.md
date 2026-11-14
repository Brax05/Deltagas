# Trazabilidad Normativa — Decreto Supremo N° 66 (DS 66)

Resumen de criterios técnicos implementados según el **Decreto Supremo N° 66 (2007)** de Chile:

| Ámbito del DS 66 | Implementación en el código | Referencia DS 66 |
| --- | --- | --- |
| Pérdida de presión en baja presión y control por fórmula | `src/domain/ds66/pressure-tables.ts` (Tablas 1 y 5 + fórmula de Pole modificada con factores `F`, `K` y `D`) | DS 66 Art. 46 · Tablas VIII y IX |
| Potencia nominal de artefactos de uso común | `src/domain/ds66/appliances.ts` | DS 66 Art. 46 · Tabla V |
| Familias de gases, PCS y presión de servicio | `src/domain/ds66/gases.ts` | DS 66 Art. 43 y 46 · Tabla VI y VIII |
| Volumen mínimo de recintos y ventilaciones | `src/domain/ds66/rooms.ts` y `src/domain/calculations/rooms.ts` (`Pm - 8` m³ para `Pt > 16 kW` y fórmula `f.8` `V = Pt / 0,093` mín. 15 m³ para estufas) | DS 66 Art. 70 · Tablas XX, XXI y XXII |
| Tiempo y verificación de prueba de hermeticidad | `src/domain/calculations/hermeticity.ts` (ingreso manual + referencia `V × 214`, mín. 15 min, máx. 60 min) | DS 66 Art. 78.3.5 |
| Dotación y vaporización de cilindros GLP | `src/domain/ds66/cylinders.ts` y `src/domain/calculations/cylinders.ts` (Razón de Vaporización Tabla XVIII y Consumo Diario Tabla XVII `f.7`) | DS 66 Art. 61 · Tablas XVI, XVII y XVIII |
| Ejemplos residenciales demostrativos | `src/domain/fixtures/residential-basic.ts` y `src/domain/fixtures/residential-extended.ts` | DS 66 Art. 46, 61, 70 y 78 |
| Informes y respaldos técnicos | Flujo guiado en `/documentos` y `/api/reports/pdf` con estructura propia sin sellos ni logos de la SEC | DS 66 Art. 4 |
