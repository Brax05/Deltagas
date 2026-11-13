import { validateDiagram } from "@/domain/diagram/collisions";
import { ALL_DIRECTIONS, directionLabelEs } from "@/domain/diagram/geometry";
import type { CopperNominalDiameter, Direction, Segment } from "@/domain/types";

export interface DirectionOptionStatus {
  direction: Direction;
  label: string;
  available: boolean;
  reason: string | null;
  blockingSegmentId?: string;
  /** Máxima longitud en cm (múltiplo de 10 cm) libre antes de colisión en esta dirección. */
  maxLengthCm?: number;
  /** Longitud sugerida (en cm) para prellenar un tramo rápido sin conflicto. */
  suggestedLengthCm?: number;
}

const ORDERED_DIRECTIONS: readonly Direction[] = ALL_DIRECTIONS;

const CARDINAL_FIRST: readonly Direction[] = [
  "right",
  "down",
  "up",
  "left",
  "down-right",
  "up-right",
  "down-left",
  "up-left",
];

const STRUCTURAL_CONFLICTS = new Set([
  "MULTIPLE_REGULATOR_EXITS",
  "SIDE_ALREADY_USED",
  "BACKTRACK_FORBIDDEN",
]);

const SUGGESTED_PRESETS_CM = [400, 300, 200, 150, 100, 50] as const;

function pickSuggestedLengthCm(maxValidCm: number): number {
  const preset = SUGGESTED_PRESETS_CM.find((p) => p <= maxValidCm);
  if (preset !== undefined) return preset;
  return Math.max(10, Math.floor(maxValidCm / 10) * 10);
}

/**
 * Evalúa las 8 direcciones (cardinales y diagonales) desde un punto para mostrar
 * opciones válidas, detectar longitudes máximas libres sin falsos bloqueos y sugerir "Automático".
 */
export function evaluateDirectionsFromPoint(params: {
  segments: Segment[];
  fromPointId: string;
  candidateLengthCm?: number;
  candidateSegmentId?: string;
  candidateToPointId?: string;
  candidateDiameter?: CopperNominalDiameter;
}): {
  options: DirectionOptionStatus[];
  recommendedDirection: Direction | null;
} {
  const hasExplicitLength = params.candidateLengthCm !== undefined;
  const probeLengthCm = hasExplicitLength
    ? Math.max(10, Math.round(params.candidateLengthCm!))
    : 500;
  const candidateId = params.candidateSegmentId ?? "__PROBE_SEG__";
  const candidateTo = params.candidateToPointId ?? "__PROBE_PT__";
  const diameter = params.candidateDiameter ?? "1/2";

  const probeDirection = (dir: Direction, lengthCm: number) => {
    const testSeg: Segment = {
      id: candidateId,
      fromPointId: params.fromPointId,
      toPointId: candidateTo,
      parts: [{ direction: dir, lengthCm }],
      nominalDiameter: diameter,
    };
    const res = validateDiagram([...params.segments, testSeg]);
    return (
      res.conflicts.find(
        (c) => c.segmentId === candidateId || c.blockingSegmentId === candidateId
      ) ?? null
    );
  };

  const findMaxClearLengthCm = (dir: Direction, ceilingCm: number): number => {
    const maxSteps = Math.floor(ceilingCm / 10);
    if (maxSteps < 1) return 0;
    if (probeDirection(dir, 10) !== null) return 0;

    let lo = 1;
    let hi = maxSteps;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (probeDirection(dir, mid * 10) === null) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return lo * 10;
  };

  const incomingSeg = params.segments.find(
    (s) => s.toPointId === params.fromPointId
  );
  const incomingDir =
    incomingSeg?.parts[incomingSeg.parts.length - 1]?.direction ?? null;

  // Preferencia de "Automático": seguir recto si se puede; sino priorizar cardinales y luego diagonales
  const preferredOrder: Direction[] =
    params.fromPointId === "S"
      ? [...CARDINAL_FIRST]
      : incomingDir
        ? [
            incomingDir,
            ...CARDINAL_FIRST.filter((d) => d !== incomingDir),
          ]
        : [...CARDINAL_FIRST];

  const options: DirectionOptionStatus[] = ORDERED_DIRECTIONS.map((dir) => {
    const myConflict = probeDirection(dir, probeLengthCm);

    if (!myConflict) {
      return {
        direction: dir,
        label: directionLabelEs(dir),
        available: true,
        reason: null,
        suggestedLengthCm: hasExplicitLength ? probeLengthCm : 400,
      };
    }

    if (STRUCTURAL_CONFLICTS.has(myConflict.code)) {
      return {
        direction: dir,
        label: directionLabelEs(dir),
        available: false,
        reason: myConflict.message,
        blockingSegmentId: myConflict.blockingSegmentId,
      };
    }

    // Conflicto geométrico (cruce / superposición / colisión de punto): verificar si cabe un tramo más corto
    const maxValidCm = findMaxClearLengthCm(dir, probeLengthCm - 10);

    if (!hasExplicitLength && maxValidCm >= 10) {
      return {
        direction: dir,
        label: directionLabelEs(dir),
        available: true,
        reason: null,
        blockingSegmentId: myConflict.blockingSegmentId,
        maxLengthCm: maxValidCm,
        suggestedLengthCm: pickSuggestedLengthCm(maxValidCm),
      };
    }

    const hintSuffix =
      maxValidCm >= 10
        ? ` (máx. ${(maxValidCm / 100).toFixed(2)} m disponible)`
        : "";

    return {
      direction: dir,
      label: directionLabelEs(dir),
      available: false,
      reason: `${myConflict.message}${hintSuffix}`,
      blockingSegmentId: myConflict.blockingSegmentId,
      maxLengthCm: maxValidCm,
    };
  });

  const recommended =
    preferredOrder.find(
      (dir) => options.find((o) => o.direction === dir)?.available
    ) ?? null;

  return {
    options,
    recommendedDirection: recommended,
  };
}
