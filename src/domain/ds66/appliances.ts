import type { ApplianceClass } from "@/domain/types";

export interface CatalogAppliance {
  id: string;
  name: string;
  applianceClass: ApplianceClass;
  powerMcalPerHour: number;
  powerKw: number;
  defaultCircuitType: "A" | "B" | "C";
  notes: string;
}

/** Factor oficial de conversión: 1 Mcal/h = 1,163 kW */
export const MCAL_H_TO_KW = 1.163;

export function mcalHToKw(mcalH: number): number {
  return mcalH * MCAL_H_TO_KW;
}

/**
 * Catálogo base según DS 66 Tabla V ("Potencia Aproximada de los Artefactos
 * Domésticos para Gas, de Uso Común") y potencias habituales en proyectos.
 */
export const APPLIANCE_CATALOG_TABLA_V: readonly CatalogAppliance[] = [
  {
    id: "estufa-mural-chica",
    name: "Estufa mural chica (Tabla V)",
    applianceClass: "estufa",
    powerMcalPerHour: 3,
    powerKw: 3.5,
    defaultCircuitType: "A",
    notes: "DS 66 Tabla V",
  },
  {
    id: "estufa-mural-grande",
    name: "Estufa mural grande (Tabla V)",
    applianceClass: "estufa",
    powerMcalPerHour: 5,
    powerKw: 5.8,
    defaultCircuitType: "A",
    notes: "DS 66 Tabla V",
  },
  {
    id: "estufa-2-mcal",
    name: "Estufa ambiental 2 Mcal/h",
    applianceClass: "estufa",
    powerMcalPerHour: 2,
    powerKw: 2.33,
    defaultCircuitType: "A",
    notes: "Uso residencial / caso examen",
  },
  {
    id: "estufa-ambiental-12",
    name: "Estufa ambiental (Tabla V)",
    applianceClass: "estufa",
    powerMcalPerHour: 12,
    powerKw: 14,
    defaultCircuitType: "A",
    notes: "DS 66 Tabla V",
  },
  {
    id: "encimera",
    name: "Encimera (Tabla V)",
    applianceClass: "encimera",
    powerMcalPerHour: 4,
    powerKw: 4.7,
    defaultCircuitType: "A",
    notes: "DS 66 Tabla V",
  },
  {
    id: "horno",
    name: "Horno doméstico (Tabla V)",
    applianceClass: "horno",
    powerMcalPerHour: 5,
    powerKw: 5.8,
    defaultCircuitType: "A",
    notes: "DS 66 Tabla V",
  },
  {
    id: "cocina-completa",
    name: "Cocina completa (Tabla V)",
    applianceClass: "cocina",
    powerMcalPerHour: 8,
    powerKw: 9.3,
    defaultCircuitType: "A",
    notes: "DS 66 Tabla V",
  },
  {
    id: "cocina-9-mcal",
    name: "Cocina 9 Mcal/h",
    applianceClass: "cocina",
    powerMcalPerHour: 9,
    powerKw: 10.47,
    defaultCircuitType: "A",
    notes: "Caso de referencia",
  },
  {
    id: "calefon-5",
    name: "Calefón 5 L/min (Tabla V)",
    applianceClass: "calefon",
    powerMcalPerHour: 11,
    powerKw: 13,
    defaultCircuitType: "B",
    notes: "DS 66 Tabla V",
  },
  {
    id: "calefon-10",
    name: "Calefón 10 L/min (Tabla V)",
    applianceClass: "calefon",
    powerMcalPerHour: 20,
    powerKw: 23,
    defaultCircuitType: "B",
    notes: "DS 66 Tabla V",
  },
  {
    id: "calefon-13",
    name: "Calefón 13 L/min (Tabla V)",
    applianceClass: "calefon",
    powerMcalPerHour: 26,
    powerKw: 30,
    defaultCircuitType: "B",
    notes: "DS 66 Tabla V",
  },
  {
    id: "calefon-16",
    name: "Calefón 16 L/min (Tabla V)",
    applianceClass: "calefon",
    powerMcalPerHour: 30,
    powerKw: 35,
    defaultCircuitType: "B",
    notes: "DS 66 Tabla V",
  },
  {
    id: "secadora-ropa",
    name: "Secadora de ropa a gas (Tabla V)",
    applianceClass: "secadora",
    powerMcalPerHour: 17,
    powerKw: 20,
    defaultCircuitType: "B",
    notes: "DS 66 Tabla V",
  },
] as const;
