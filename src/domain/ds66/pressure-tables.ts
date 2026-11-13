import type { CopperNominalDiameter, GasFamily } from "@/domain/types";
import { getGasSpec } from "@/domain/ds66/gases";
import { COPPER_TYPE_L_PIPES, getCopperPipeSpec } from "@/domain/ds66/pipes";

/**
 * Filas de longitud de referencia según Sección 5.1.2:
 * 2 a 10 m de 1 en 1, 12 a 30 m de 2 en 2, y 35, 40, 45, 50 m.
 */
export const REFERENCE_LENGTH_ROWS_METERS: readonly number[] = [
  2, 3, 4, 5, 6, 7, 8, 9, 10,
  12, 14, 16, 18, 20, 22, 24, 26, 28, 30,
  35, 40, 45, 50,
] as const;

/**
 * Columnas estándar de ΔP por metro (Pa/m) de las Tablas 1 (GLP) y 5 (GN).
 * Nota: Si el usuario carga su PDF impreso oficial de "Tablas 1 y 5" con una grilla
 * de ΔP/m o redondeos específicos distintos, se sustituyen directamente en esta estructura.
 */
export const PRESSURE_GRADIENT_COLUMNS_PA_PER_M: readonly number[] = [
  0.5, 1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 75,
] as const;

export interface PressureTableLookupResult {
  tableName: "Tabla 1 (GLP)" | "Tabla 5 (GN)";
  referenceLengthMeters: number;
  lengthOutOfRange: boolean;
  gradientPaPerMeter: number | null;
  referencePowerMcalH: number | null;
  partialDropPa: number | null;
  powerOutOfRange: boolean;
  /** Coordenadas de trazabilidad para verificación manual (Sección 1 y 16). */
  rowLabel: string;
  columnLabel: string;
}

/**
 * Obtiene la longitud de referencia igual o inmediatamente superior en metros.
 */
export function getReferenceLengthMeters(realLengthMeters: number): {
  value: number;
  outOfRange: boolean;
} {
  for (const row of REFERENCE_LENGTH_ROWS_METERS) {
    if (row >= realLengthMeters - 1e-9) {
      return { value: row, outOfRange: false };
    }
  }
  return {
    value: REFERENCE_LENGTH_ROWS_METERS[REFERENCE_LENGTH_ROWS_METERS.length - 1]!,
    outOfRange: true,
  };
}

/**
 * Potencia máxima (Mcal/h) de la tabla inferior para un diámetro, gas y gradiente ΔP/m dado.
 * Derivada de P = F * K * sqrt(ΔP/L) * D^2.5 y redondeada al entero más cercano,
 * consistente con el ejemplo normativo: GN, 1", 41 Mcal/h, 8 m -> 24 Pa (3 Pa/m).
 */
export function computeTableCellPowerMcalH(
  gasFamily: GasFamily,
  nominalDiameter: CopperNominalDiameter,
  gradientPaPerMeter: number
): number {
  const poleF =
    gasFamily === "GLP"
      ? getGasSpec("GLP").poleFactorF
      : getGasSpec("GN_V_RM").poleFactorF;
  const pipe = getCopperPipeSpec(nominalDiameter);
  const rawPower =
    poleF *
    pipe.frictionFactorK *
    Math.sqrt(gradientPaPerMeter) *
    Math.pow(pipe.innerDiameterCm, 2.5);
  return Math.round(rawPower);
}

/**
 * Construye la tabla inferior completa (diámetro × ΔP/m -> Mcal/h) para GLP o GN.
 */
export function buildLowerPowerTable(
  gasFamily: GasFamily
): Record<CopperNominalDiameter, number[]> {
  const result = {} as Record<CopperNominalDiameter, number[]>;
  for (const pipe of COPPER_TYPE_L_PIPES) {
    result[pipe.nominal] = PRESSURE_GRADIENT_COLUMNS_PA_PER_M.map((grad) =>
      computeTableCellPowerMcalH(gasFamily, pipe.nominal, grad)
    );
  }
  return result;
}

const LOWER_POWER_TABLES: Record<GasFamily, Record<CopperNominalDiameter, number[]>> = {
  GLP: buildLowerPowerTable("GLP"),
  GN: buildLowerPowerTable("GN"),
};

/**
 * Lectura de pérdida parcial siguiendo los pasos 2, 3 y 4 de la Sección 5.1.
 */
export function lookupPartialPressureDropFromTable(params: {
  gasFamily: GasFamily;
  nominalDiameter: CopperNominalDiameter;
  realLengthMeters: number;
  powerMcalH: number;
}): PressureTableLookupResult {
  const tableName = params.gasFamily === "GLP" ? "Tabla 1 (GLP)" : "Tabla 5 (GN)";
  const refLen = getReferenceLengthMeters(params.realLengthMeters);

  if (params.powerMcalH <= 0) {
    return {
      tableName,
      referenceLengthMeters: refLen.value,
      lengthOutOfRange: refLen.outOfRange,
      gradientPaPerMeter: 0,
      referencePowerMcalH: 0,
      partialDropPa: 0,
      powerOutOfRange: false,
      rowLabel: `${refLen.value} m`,
      columnLabel: "0 Pa/m",
    };
  }

  const rowPowers = LOWER_POWER_TABLES[params.gasFamily][params.nominalDiameter];
  let matchedColIdx = -1;

  for (let i = 0; i < rowPowers.length; i++) {
    if (rowPowers[i]! >= params.powerMcalH - 1e-9) {
      matchedColIdx = i;
      break;
    }
  }

  if (matchedColIdx === -1) {
    return {
      tableName,
      referenceLengthMeters: refLen.value,
      lengthOutOfRange: refLen.outOfRange,
      gradientPaPerMeter: null,
      referencePowerMcalH: null,
      partialDropPa: null,
      powerOutOfRange: true,
      rowLabel: `${refLen.value} m`,
      columnLabel: "Fuera de tabla",
    };
  }

  const gradient = PRESSURE_GRADIENT_COLUMNS_PA_PER_M[matchedColIdx]!;
  const refPower = rowPowers[matchedColIdx]!;
  const partialDropPa = Math.round(refLen.value * gradient);

  return {
    tableName,
    referenceLengthMeters: refLen.value,
    lengthOutOfRange: refLen.outOfRange,
    gradientPaPerMeter: gradient,
    referencePowerMcalH: refPower,
    partialDropPa,
    powerOutOfRange: false,
    rowLabel: `${refLen.value} m`,
    columnLabel: `${gradient} Pa/m (≤ ${refPower} Mcal/h)`,
  };
}

/**
 * Control con fórmula (Sección 5.1.10):
 * ΔP = (L * P^2) / ((F * K)^2 * D^5)
 */
export function calculateFormulaPressureDropPa(params: {
  gasFamily: GasFamily;
  nominalDiameter: CopperNominalDiameter;
  lengthMeters: number;
  powerMcalH: number;
}): number {
  if (params.lengthMeters <= 0 || params.powerMcalH <= 0) return 0;
  const poleF =
    params.gasFamily === "GLP"
      ? getGasSpec("GLP").poleFactorF
      : getGasSpec("GN_V_RM").poleFactorF;
  const pipe = getCopperPipeSpec(params.nominalDiameter);
  const numerator = params.lengthMeters * Math.pow(params.powerMcalH, 2);
  const denominator =
    Math.pow(poleF * pipe.frictionFactorK, 2) * Math.pow(pipe.innerDiameterCm, 5);
  return numerator / denominator;
}
