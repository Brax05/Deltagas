import type { ProjectData } from "@/domain/types";

export const RESIDENTIAL_BASIC_UPDATED_AT = "2026-11-13T00:00:00.000Z";

/**
 * Ejemplo residencial básico según DS 66 (Art. 46 / Tabla V y Tabla 1 GLP):
 * Red interior GLP en Cobre Tipo L de 5 tramos y 3 artefactos domésticos de Tabla V (31 Mcal/h):
 *   1. Calefón 10 L/min — 20 Mcal/h (Tabla V)
 *   2. Cocina completa — 8 Mcal/h (Tabla V)
 *   3. Estufa mural chica — 3 Mcal/h (Tabla V)
 */
export function createResidentialBasicProject(): ProjectData {
  return {
    id: "ejemplo-residencial-glp-basico",
    name: "Ejemplo 1 — Vivienda unifamiliar GLP (DS 66)",
    gasType: "GLP",
    client: {
      ownerName: "Vivienda unifamiliar tipo A",
      address: "Red interior baja presión — GLP",
      commune: "Valparaíso",
    },
    segments: [
      {
        id: "T1",
        fromPointId: "S",
        toPointId: "2",
        parts: [{ direction: "right", lengthCm: 800 }],
        nominalDiameter: "3/4",
      },
      {
        id: "T2",
        fromPointId: "2",
        toPointId: "3",
        parts: [{ direction: "up", lengthCm: 300 }],
        nominalDiameter: "1/2",
      },
      {
        id: "T3",
        fromPointId: "2",
        toPointId: "4",
        parts: [{ direction: "right", lengthCm: 400 }],
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
        parts: [{ direction: "right", lengthCm: 600 }],
        nominalDiameter: "1/2",
      },
    ],
    appliances: [
      {
        id: "art-calefon",
        name: "Calefón 10 L/min",
        segmentId: "T2",
        catalogId: "calefon-10",
        applianceClass: "calefon",
        circuitType: "B",
        powerMcalPerHour: 20,
        quantity: 1,
      },
      {
        id: "art-cocina",
        name: "Cocina completa",
        segmentId: "T4",
        catalogId: "cocina-completa",
        applianceClass: "cocina",
        circuitType: "A",
        powerMcalPerHour: 8,
        quantity: 1,
      },
      {
        id: "art-estufa",
        name: "Estufa mural chica",
        segmentId: "T5",
        catalogId: "estufa-mural-chica",
        applianceClass: "estufa",
        circuitType: "A",
        powerMcalPerHour: 3,
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
      notes: "Valores referenciales según DS 66 Art. 78.3.5 (31 Mcal/h total).",
    },
    cylinders: {
      builtAreaM2: 70,
      commune: "Valparaíso",
      designTempC: 5,
      cylinderTypeKg: 45,
      consumptionMode: "intermitente",
      calculationMethod: "vaporizacion",
    },
    updatedAt: RESIDENTIAL_BASIC_UPDATED_AT,
  };
}
