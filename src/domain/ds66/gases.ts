import type { GasConfigId, GasFamily } from "@/domain/types";

export interface GasSpecification {
  id: GasConfigId;
  family: GasFamily;
  label: string;
  regionLabel: string;
  /** Poder Calorífico Superior (Mcal/m³) - DS 66 Tabla VI */
  pcsMcalPerM3: number;
  /** Poder Calorífico Superior (MJ/m³) - DS 66 Tabla VI */
  pcsMjPerM3: number;
  /** Densidad relativa (aire = 1) - DS 66 Tabla VI */
  relativeDensity: number;
  /** Viscosidad (cP) - DS 66 Tabla VI */
  viscosityCp: number;
  /** Presión de servicio en Pa - Tabla de presiones de servicio */
  servicePressurePa: number;
  /** Presión de servicio en mbar */
  servicePressureMbar: number;
  /** Pérdida máxima admisible en Pa - DS 66 Tabla VIII */
  maxPressureDropPa: number;
  /** Factor F para la fórmula de control Pole modificada (Sección 5.1.10) */
  poleFactorF: number;
  /** Densidad relativa > 1 (más denso que el aire -> abertura inferior <= 15 cm) */
  heavierThanAir: boolean;
}

export const GAS_SPECIFICATIONS: Record<GasConfigId, GasSpecification> = {
  GLP: {
    id: "GLP",
    family: "GLP",
    label: "Gas Licuado de Petróleo (GLP)",
    regionLabel: "Todas las regiones (Iª – XIIª)",
    pcsMcalPerM3: 28.6,
    pcsMjPerM3: 119.7,
    relativeDensity: 2.0,
    viscosityCp: 0.008,
    servicePressurePa: 2800,
    servicePressureMbar: 28,
    maxPressureDropPa: 150,
    poleFactorF: 0.0017621,
    heavierThanAir: true,
  },
  GN_V_RM: {
    id: "GN_V_RM",
    family: "GN",
    label: "Gas Natural (V y RM)",
    regionLabel: "Valparaíso (Vª) y Metropolitana",
    pcsMcalPerM3: 9.0,
    pcsMjPerM3: 37.54,
    relativeDensity: 0.87,
    viscosityCp: 0.012,
    servicePressurePa: 1800,
    servicePressureMbar: 18,
    maxPressureDropPa: 120,
    poleFactorF: 0.0011916,
    heavierThanAir: false,
  },
  GN_VIII: {
    id: "GN_VIII",
    family: "GN",
    label: "Gas Natural (VIII Región)",
    regionLabel: "Biobío (VIIIª)",
    pcsMcalPerM3: 9.7,
    pcsMjPerM3: 40.56,
    relativeDensity: 0.89,
    viscosityCp: 0.012,
    servicePressurePa: 1800,
    servicePressureMbar: 18,
    maxPressureDropPa: 120,
    poleFactorF: 0.0011916,
    heavierThanAir: false,
  },
  GN_XII: {
    id: "GN_XII",
    family: "GN",
    label: "Gas Natural (XII Región)",
    regionLabel: "Magallanes (XIIª)",
    pcsMcalPerM3: 9.5,
    pcsMjPerM3: 39.73,
    relativeDensity: 0.88,
    viscosityCp: 0.012,
    servicePressurePa: 1800,
    servicePressureMbar: 18,
    maxPressureDropPa: 120,
    poleFactorF: 0.0011916,
    heavierThanAir: false,
  },
};

export function getGasSpec(gasType: GasConfigId): GasSpecification {
  return GAS_SPECIFICATIONS[gasType];
}

export function getGasFamily(gasType: GasConfigId): GasFamily {
  return GAS_SPECIFICATIONS[gasType].family;
}
