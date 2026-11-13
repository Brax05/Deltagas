import type { NetworkCalculationResult } from "@/domain/calculations/network";
import type { HermeticityTestInput } from "@/domain/types";

export interface HermeticityEvaluation {
  totalLengthMeters: number;
  weightedInnerDiameterMm: number;
  totalVolumeM3: number;
  totalVolumeLiters: number;
  initialPressureMbar: number;
  finalPressureMbar: number;
  pressureVariationMbar: number;
  manualDurationMinutes: number | null;
  /** Referencia DS 66 Art. 78.3.5 (f.11): V(m3) * 214, mín 15 min, máx 60 min */
  referenceDurationMinutesArt78: number;
  passed: boolean | null;
  statusLabel: string;
}

export function evaluateHermeticity(params: {
  networkResult: NetworkCalculationResult;
  input: HermeticityTestInput;
}): HermeticityEvaluation {
  const { networkResult, input } = params;
  const pressureVariationMbar =
    Number((input.finalPressureMbar - input.initialPressureMbar).toFixed(2));

  const referenceDurationMinutesArt78 = Math.min(
    60,
    Math.max(15, Math.ceil(networkResult.totalPipeVolumeM3 * 214))
  );

  let passed: boolean | null = null;
  let statusLabel = "Pendiente de completar tiempo de prueba";

  if (input.durationMinutes !== null && input.durationMinutes > 0) {
    passed = Math.abs(pressureVariationMbar) < 1e-6;
    statusLabel = passed
      ? "Aprobada (sin variación de presión)"
      : `Rechazada (variación de ${pressureVariationMbar > 0 ? "+" : ""}${pressureVariationMbar} mbar)`;
  }

  return {
    totalLengthMeters: networkResult.totalLengthMeters,
    weightedInnerDiameterMm: networkResult.weightedInnerDiameterMm,
    totalVolumeM3: networkResult.totalPipeVolumeM3,
    totalVolumeLiters: networkResult.totalPipeVolumeLiters,
    initialPressureMbar: input.initialPressureMbar,
    finalPressureMbar: input.finalPressureMbar,
    pressureVariationMbar,
    manualDurationMinutes: input.durationMinutes,
    referenceDurationMinutesArt78,
    passed,
    statusLabel,
  };
}
