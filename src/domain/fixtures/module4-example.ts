import type { ProjectData } from "@/domain/types";

export const MODULE4_PART2_UPDATED_AT = "2026-11-13T00:00:00.000Z";

/**
 * Ejemplo de red — Módulo 4 · Parte 2.1 (Continuación Cálculo de Redes · Gas Licuado):
 * Tramos: 1-2 (10 m), 2-3 (2 m), 2-4 (5 m), 4-5 (2 m), 4-6 (7 m).
 * Artefactos en orden de la tabla PI (Total = 39 Mcal/h):
 *   1. 1 Calefón de 26 Mcal/h (punto 3, tramo 2-3)
 *   2. 1 Cocina de 8 Mcal/h (punto 5, tramo 4-5)
 *   3. 1 Estufa de 5 Mcal/h (punto 6, tramo 4-6)
 */
export function createModule4Part2ExampleProject(): ProjectData {
  return {
    id: "modulo-4-parte-2-1-glp",
    name: "Ejemplo 1 — Gas Licuado (39 Mcal/h)",
    gasType: "GLP",
    client: {
      ownerName: "Ejemplo Módulo 4 · Parte 2.1",
      address: "Cálculo de Redes — Gas Licuado",
      commune: "Santiago",
    },
    segments: [
      {
        id: "T1",
        fromPointId: "S",
        toPointId: "2",
        parts: [{ direction: "right", lengthCm: 1000 }],
        nominalDiameter: "3/4",
      },
      {
        id: "T2",
        fromPointId: "2",
        toPointId: "3",
        parts: [{ direction: "up", lengthCm: 200 }],
        nominalDiameter: "1/2",
      },
      {
        id: "T3",
        fromPointId: "2",
        toPointId: "4",
        parts: [{ direction: "right", lengthCm: 500 }],
        nominalDiameter: "1/2",
      },
      {
        id: "T4",
        fromPointId: "4",
        toPointId: "5",
        parts: [{ direction: "up", lengthCm: 200 }],
        nominalDiameter: "1/2",
      },
      {
        id: "T5",
        fromPointId: "4",
        toPointId: "6",
        parts: [{ direction: "right", lengthCm: 700 }],
        nominalDiameter: "1/2",
      },
    ],
    appliances: [
      {
        id: "mod4-calefon",
        name: "Calefón",
        segmentId: "T2",
        catalogId: "calefon-13",
        applianceClass: "calefon",
        circuitType: "B",
        powerMcalPerHour: 26,
        quantity: 1,
      },
      {
        id: "mod4-cocina",
        name: "Cocina",
        segmentId: "T4",
        catalogId: "cocina-completa",
        applianceClass: "cocina",
        circuitType: "A",
        powerMcalPerHour: 8,
        quantity: 1,
      },
      {
        id: "mod4-estufa",
        name: "Estufa",
        segmentId: "T5",
        catalogId: "estufa-mural-grande",
        applianceClass: "estufa",
        circuitType: "A",
        powerMcalPerHour: 5,
        quantity: 1,
      },
    ],
    rooms: [],
    hermeticity: {
      date: "2026-11-13",
      installationType: "nueva",
      initialPressureMbar: 50,
      finalPressureMbar: 50,
      durationMinutes: 15,
      manometer: {
        brand: "Referencia",
        model: "M-100",
        range: "0 - 100 mbar",
        graduation: "0,5 mbar",
      },
      notes: "Ejemplo Módulo 4 · Parte 2.1 — Gas Licuado (39 Mcal/h total).",
    },
    cylinders: {
      builtAreaM2: 70,
      commune: "Santiago",
      designTempC: 0,
      cylinderTypeKg: 45,
      consumptionMode: "intermitente",
      calculationMethod: "vaporizacion",
    },
    updatedAt: MODULE4_PART2_UPDATED_AT,
  };
}
