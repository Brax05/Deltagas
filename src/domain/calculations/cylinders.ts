import {
  getConsumptionLevelTablaXVI,
  TABLA_XVII_DAILY_CONSUMPTION_KWH,
  TABLA_XVIII_VAPORIZATION_KW,
  type ConsumptionLevel,
  type TablaXviiTempCol,
} from "@/domain/ds66/cylinders";
import type { GlpCylindersInput } from "@/domain/types";

export interface CylindersEvaluation {
  consumptionLevel: ConsumptionLevel;
  totalInstalledPowerKw: number;
  designTempC: number;
  cylinderTypeKg: 45 | 15;
  methodUsed: "vaporizacion" | "consumo_diario";
  vaporizationRateKw: number;
  dailyConsumptionKwh: number | null;
  rawCylindersCount: number;
  requiredCylinders: number;
  formulaDescription: string;
}

export function evaluateGlpCylinders(params: {
  totalInstalledPowerKw: number;
  input: GlpCylindersInput;
}): CylindersEvaluation {
  const { totalInstalledPowerKw, input } = params;
  const consumptionLevel = getConsumptionLevelTablaXVI(input.builtAreaM2);
  const vaporTableRow = TABLA_XVIII_VAPORIZATION_KW[input.designTempC];
  const capGroup =
    input.cylinderTypeKg === 45 ? vaporTableRow.kg45 : vaporTableRow.kg15;
  const vaporizationRateKw =
    input.consumptionMode === "intermitente"
      ? capGroup.intermitente
      : capGroup.continuo;

  if (input.calculationMethod === "consumo_diario") {
    const profileKey = input.tablaXviiProfileKey ?? "estufa_calefon_cocina";
    const entry = TABLA_XVII_DAILY_CONSUMPTION_KWH[profileKey];
    const clampedTemp: TablaXviiTempCol =
      input.designTempC === 15 ? 10 : (input.designTempC as TablaXviiTempCol);
    const levelMap =
      entry?.byLevel[consumptionLevel] ??
      entry?.byLevel.Medio ??
      entry?.byLevel.Alto;
    const cd = levelMap?.[clampedTemp] ?? 17.4;
    const raw = (cd * 20) / (13.96 * input.cylinderTypeKg);
    return {
      consumptionLevel,
      totalInstalledPowerKw,
      designTempC: input.designTempC,
      cylinderTypeKg: input.cylinderTypeKg,
      methodUsed: "consumo_diario",
      vaporizationRateKw,
      dailyConsumptionKwh: cd,
      rawCylindersCount: raw,
      requiredCylinders: Math.max(1, Math.ceil(raw)),
      formulaDescription: `N = (${cd} kWh/día × 20) / (13,96 × ${input.cylinderTypeKg} kg) = ${raw.toFixed(2)} → ${Math.max(1, Math.ceil(raw))}`,
    };
  }

  const raw = vaporizationRateKw > 0 ? totalInstalledPowerKw / vaporizationRateKw : 0;
  const requiredCylinders = raw > 0 ? Math.ceil(raw) : 0;

  return {
    consumptionLevel,
    totalInstalledPowerKw,
    designTempC: input.designTempC,
    cylinderTypeKg: input.cylinderTypeKg,
    methodUsed: "vaporizacion",
    vaporizationRateKw,
    dailyConsumptionKwh: null,
    rawCylindersCount: raw,
    requiredCylinders,
    formulaDescription: `N = ${totalInstalledPowerKw.toFixed(2)} kW ÷ ${vaporizationRateKw} kW (Tabla XVIII) = ${raw.toFixed(2)} → ${requiredCylinders} cilindro(s) de ${input.cylinderTypeKg} kg`,
  };
}
