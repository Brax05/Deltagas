import { validateDiagram } from "@/domain/diagram/collisions";
import { ALL_DIRECTIONS, directionLabelEs } from "@/domain/diagram/geometry";
import type { CopperNominalDiameter, Direction, Segment } from "@/domain/types";

export interface DirectionOptionStatus {
  direction: Direction;
  label: string;
  available: boolean;
  reason: string | null;
  blockingSegmentId?: string;
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

/**
 * Evalúa las 8 direcciones (cardinales y diagonales) desde un punto para mostrar
 * opciones válidas, deshabilitar las que chocarían con su motivo y sugerir "Automático".
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
  const lengthCm = params.candidateLengthCm ?? 500;
  const candidateId = params.candidateSegmentId ?? "__PROBE_SEG__";
  const candidateTo = params.candidateToPointId ?? "__PROBE_PT__";
  const diameter = params.candidateDiameter ?? "1/2";

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
    const testSeg: Segment = {
      id: candidateId,
      fromPointId: params.fromPointId,
      toPointId: candidateTo,
      parts: [{ direction: dir, lengthCm }],
      nominalDiameter: diameter,
    };

    const res = validateDiagram([...params.segments, testSeg]);
    const myConflict = res.conflicts.find(
      (c) => c.segmentId === candidateId || c.blockingSegmentId === candidateId
    );

    if (myConflict) {
      return {
        direction: dir,
        label: directionLabelEs(dir),
        available: false,
        reason: myConflict.message,
        blockingSegmentId: myConflict.blockingSegmentId,
      };
    }

    return {
      direction: dir,
      label: directionLabelEs(dir),
      available: true,
      reason: null,
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
