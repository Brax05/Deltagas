import {
  computeDiagramLayout,
  oppositeDirection,
  type DiagramLayout,
  type OrthogonalSpan,
} from "@/domain/diagram/geometry";
import type { Appliance, Segment } from "@/domain/types";

export interface DiagramConflict {
  code:
    | "MULTIPLE_REGULATOR_EXITS"
    | "SIDE_ALREADY_USED"
    | "BACKTRACK_FORBIDDEN"
    | "CROSSING"
    | "OVERLAP"
    | "POINT_COLLISION"
    | "CYCLE_OR_DISCONNECTED";
  message: string;
  segmentId: string;
  blockingSegmentId?: string;
}

export interface DiagramReadabilityWarning {
  segmentA: string;
  segmentB: string;
  distanceMeters: number;
  message: string;
}

export interface DiagramValidationResult {
  valid: boolean;
  conflicts: DiagramConflict[];
  warnings: DiagramReadabilityWarning[];
  layout: DiagramLayout;
}

const EPS = 1e-4;
const MIN_READABILITY_SEPARATION_M = 0.6;

function spanMetrics(span: OrthogonalSpan) {
  const dx = span.x2 - span.x1;
  const dy = span.y2 - span.y1;
  const len = Math.hypot(dx, dy);
  return { dx, dy, len };
}

function pointOnSpanInterior(
  px: number,
  py: number,
  span: OrthogonalSpan
): boolean {
  const { dx, dy, len } = spanMetrics(span);
  if (len < EPS) return false;

  const rx = px - span.x1;
  const ry = py - span.y1;
  const projAlong = (rx * dx + ry * dy) / len;
  if (projAlong <= EPS || projAlong >= len - EPS) {
    return false;
  }

  const perpDist = Math.abs(rx * dy - ry * dx) / len;
  return perpDist < EPS;
}

function spansOverlapOrCross(
  a: OrthogonalSpan,
  b: OrthogonalSpan,
  segmentsById: Map<string, Segment>
): "cross" | "overlap" | null {
  const aMinX = Math.min(a.x1, a.x2);
  const aMaxX = Math.max(a.x1, a.x2);
  const aMinY = Math.min(a.y1, a.y2);
  const aMaxY = Math.max(a.y1, a.y2);
  const bMinX = Math.min(b.x1, b.x2);
  const bMaxX = Math.max(b.x1, b.x2);
  const bMinY = Math.min(b.y1, b.y2);
  const bMaxY = Math.max(b.y1, b.y2);

  if (
    aMaxX + EPS < bMinX ||
    bMaxX + EPS < aMinX ||
    aMaxY + EPS < bMinY ||
    bMaxY + EPS < aMinY
  ) {
    return null;
  }

  const segA = segmentsById.get(a.segmentId);
  const segB = segmentsById.get(b.segmentId);

  // Chequear si comparten legítimamente un vértice de conexión padre-hijo o partes contiguas
  const aStartsAtBEnd =
    a.segmentId !== b.segmentId &&
    a.partIndex === 0 &&
    segA?.fromPointId === segB?.toPointId &&
    b.partIndex === (segB?.parts.length ?? 1) - 1;
  const bStartsAtAEnd =
    a.segmentId !== b.segmentId &&
    b.partIndex === 0 &&
    segB?.fromPointId === segA?.toPointId &&
    a.partIndex === (segA?.parts.length ?? 1) - 1;
  const siblingStart =
    a.segmentId !== b.segmentId &&
    a.partIndex === 0 &&
    b.partIndex === 0 &&
    segA?.fromPointId === segB?.fromPointId;
  const consecutiveParts =
    a.segmentId === b.segmentId && Math.abs(a.partIndex - b.partIndex) === 1;

  const allowSharedEndpoint =
    aStartsAtBEnd || bStartsAtAEnd || siblingStart || consecutiveParts;

  const u = spanMetrics(a);
  const v = spanMetrics(b);
  if (u.len < EPS || v.len < EPS) return null;

  const crossUv = u.dx * v.dy - u.dy * v.dx;
  const crossNorm = Math.abs(crossUv) / (u.len * v.len);
  const wx = b.x1 - a.x1;
  const wy = b.y1 - a.y1;

  // Líneas paralelas o colineales (cardinales o diagonales en el mismo ángulo)
  if (crossNorm < 1e-3) {
    const lineDist = Math.abs(wx * u.dy - wy * u.dx) / u.len;
    if (lineDist >= EPS) return null;

    // Proyectar endpoints de B sobre el eje unitario de A
    const ux = u.dx / u.len;
    const uy = u.dy / u.len;
    const t0 = wx * ux + wy * uy;
    const t1 = (b.x2 - a.x1) * ux + (b.y2 - a.y1) * uy;
    const bProjMin = Math.min(t0, t1);
    const bProjMax = Math.max(t0, t1);
    const overlapLen = Math.min(u.len, bProjMax) - Math.max(0, bProjMin);

    if (overlapLen > EPS) return "overlap";
    if (
      !allowSharedEndpoint &&
      Math.abs(overlapLen) <= EPS &&
      Math.max(0, bProjMin) <= Math.min(u.len, bProjMax) + EPS
    ) {
      return "overlap";
    }
    return null;
  }

  // Líneas no paralelas: resolver p1 + s*u = q1 + t*v
  const s = (wx * v.dy - wy * v.dx) / crossUv;
  const t = (wx * u.dy - wy * u.dx) / crossUv;
  const tolS = EPS / u.len;
  const tolT = EPS / v.len;

  if (s < -tolS || s > 1 + tolS || t < -tolT || t > 1 + tolT) {
    return null;
  }

  // Si comparten legítimamente un extremo, permitir solo encuentro puntual en ambos extremos
  if (allowSharedEndpoint) {
    const strictInteriorA = s > tolS && s < 1 - tolS;
    const strictInteriorB = t > tolT && t < 1 - tolT;
    if (!strictInteriorA && !strictInteriorB) {
      return null;
    }
  }

  return "cross";
}

function parallelDistance(a: OrthogonalSpan, b: OrthogonalSpan): number | null {
  const u = spanMetrics(a);
  const v = spanMetrics(b);
  if (u.len < EPS || v.len < EPS) return null;

  const crossNorm = Math.abs(u.dx * v.dy - u.dy * v.dx) / (u.len * v.len);
  if (crossNorm >= 1e-3) return null;

  const ux = u.dx / u.len;
  const uy = u.dy / u.len;
  const t0 = (b.x1 - a.x1) * ux + (b.y1 - a.y1) * uy;
  const t1 = (b.x2 - a.x1) * ux + (b.y2 - a.y1) * uy;
  const overlap = Math.min(u.len, Math.max(t0, t1)) - Math.max(0, Math.min(t0, t1));
  if (overlap <= EPS) return null;

  return Math.abs((b.x1 - a.x1) * u.dy - (b.y1 - a.y1) * u.dx) / u.len;
}

export function validateDiagram(segments: Segment[]): DiagramValidationResult {
  const layout = computeDiagramLayout(segments);
  const conflicts: DiagramConflict[] = [];
  const warnings: DiagramReadabilityWarning[] = [];
  const segmentsById = new Map(segments.map((s) => [s.id, s]));

  // Regla 9.2.1: Un solo origen desde S
  const rootSegments = segments.filter((s) => s.fromPointId === "S");
  if (rootSegments.length > 1) {
    for (let i = 1; i < rootSegments.length; i++) {
      conflicts.push({
        code: "MULTIPLE_REGULATOR_EXITS",
        message: `Del regulador S solo puede salir un único tramo (${rootSegments[0]!.id} ya ocupa S).`,
        segmentId: rootSegments[i]!.id,
        blockingSegmentId: rootSegments[0]!.id,
      });
    }
  }

  // Reglas 9.2.2 y 9.2.3: Un lado, un tramo; no devolverse
  const usedSidesByPoint = new Map<
    string,
    Map<string, { kind: "entry" | "exit"; segmentId: string }>
  >();

  const registerSide = (
    pointId: string,
    side: string,
    kind: "entry" | "exit",
    segmentId: string
  ) => {
    const sideMap = usedSidesByPoint.get(pointId) ?? new Map();
    const existing = sideMap.get(side);
    if (existing) {
      if (existing.kind === "entry" && kind === "exit") {
        conflicts.push({
          code: "BACKTRACK_FORBIDDEN",
          message: `No puede devolverse desde el punto ${pointId} por el lado donde llegó ${existing.segmentId}.`,
          segmentId,
          blockingSegmentId: existing.segmentId,
        });
      } else {
        conflicts.push({
          code: "SIDE_ALREADY_USED",
          message: `El lado ${side} del punto ${pointId} ya está ocupado por ${existing.segmentId}.`,
          segmentId,
          blockingSegmentId: existing.segmentId,
        });
      }
    } else {
      sideMap.set(side, { kind, segmentId });
      usedSidesByPoint.set(pointId, sideMap);
    }
  };

  for (const seg of segments) {
    if (seg.parts.length === 0) continue;
    registerSide(seg.fromPointId, seg.parts[0]!.direction, "exit", seg.id);
    const lastDir = seg.parts[seg.parts.length - 1]!.direction;
    registerSide(seg.toPointId, oppositeDirection(lastDir), "entry", seg.id);

    // No devolverse dentro de un quiebre
    for (let i = 1; i < seg.parts.length; i++) {
      if (seg.parts[i]!.direction === oppositeDirection(seg.parts[i - 1]!.direction)) {
        conflicts.push({
          code: "BACKTRACK_FORBIDDEN",
          message: `En el quiebre de ${seg.id}, una parte no puede devolverse sobre la anterior.`,
          segmentId: seg.id,
          blockingSegmentId: seg.id,
        });
      }
    }
  }

  // Regla 9.2.4: Cero cruces y cero superposiciones
  const seenPairs = new Set<string>();
  for (let i = 0; i < layout.spans.length; i++) {
    for (let j = i + 1; j < layout.spans.length; j++) {
      const a = layout.spans[i]!;
      const b = layout.spans[j]!;
      const res = spansOverlapOrCross(a, b, segmentsById);
      if (res === "cross") {
        const key = `${a.segmentId}-${b.segmentId}-cross`;
        if (!seenPairs.has(key)) {
          seenPairs.add(key);
          conflicts.push({
            code: "CROSSING",
            message: `Cruzaría el tramo ${a.segmentId}`,
            segmentId: b.segmentId,
            blockingSegmentId: a.segmentId,
          });
        }
      } else if (res === "overlap") {
        const key = `${a.segmentId}-${b.segmentId}-overlap`;
        if (!seenPairs.has(key)) {
          seenPairs.add(key);
          conflicts.push({
            code: "OVERLAP",
            message: `Se montaría sobre el tramo ${a.segmentId}`,
            segmentId: b.segmentId,
            blockingSegmentId: a.segmentId,
          });
        }
      } else if (a.segmentId !== b.segmentId) {
        const dist = parallelDistance(a, b);
        if (dist !== null && dist > EPS && dist < MIN_READABILITY_SEPARATION_M) {
          const warnKey = [a.segmentId, b.segmentId].sort().join("-");
          if (!seenPairs.has(warnKey)) {
            seenPairs.add(warnKey);
            warnings.push({
              segmentA: a.segmentId,
              segmentB: b.segmentId,
              distanceMeters: dist,
              message: `${a.segmentId} y ${b.segmentId} quedan paralelos a ${dist.toFixed(2)} m; acércate con el zoom o prueba otra dirección.`,
            });
          }
        }
      }
    }
  }

  // Regla 9.2.4 (puntos sobre el interior de otro tramo o coordenadas duplicadas)
  const pointPositions = new Map<string, string>();
  for (const pt of Object.values(layout.points)) {
    const coordKey = `${pt.xMeters.toFixed(3)},${pt.yMeters.toFixed(3)}`;
    const existingPt = pointPositions.get(coordKey);
    if (existingPt && existingPt !== pt.id) {
      const ownerSeg = segments.find((s) => s.toPointId === pt.id);
      conflicts.push({
        code: "POINT_COLLISION",
        message: `Coincidiría en posición con el punto ${existingPt}`,
        segmentId: ownerSeg?.id ?? pt.id,
        blockingSegmentId: existingPt,
      });
    } else {
      pointPositions.set(coordKey, pt.id);
    }

    for (const span of layout.spans) {
      if (pointOnSpanInterior(pt.xMeters, pt.yMeters, span)) {
        const ownerSeg = segments.find((s) => s.toPointId === pt.id);
        conflicts.push({
          code: "POINT_COLLISION",
          message: `El punto ${pt.id} quedaría sobre el tramo ${span.segmentId}`,
          segmentId: ownerSeg?.id ?? pt.id,
          blockingSegmentId: span.segmentId,
        });
      }
    }
  }

  return {
    valid: conflicts.length === 0,
    conflicts,
    warnings,
    layout,
  };
}

/**
 * Regla 9.2.8: Lista todo lo que cuelga de un tramo antes de borrarlo.
 */
export function getSubtreeImpact(params: {
  segments: Segment[];
  appliances: Appliance[];
  segmentId: string;
}): {
  segmentIdsToRemove: string[];
  pointIdsToRemove: string[];
  applianceIdsToRemove: string[];
} {
  const target = params.segments.find((s) => s.id === params.segmentId);
  if (!target) {
    return {
      segmentIdsToRemove: [],
      pointIdsToRemove: [],
      applianceIdsToRemove: [],
    };
  }

  const segIds = new Set<string>([target.id]);
  const ptIds = new Set<string>([target.toPointId]);

  let added = true;
  while (added) {
    added = false;
    for (const seg of params.segments) {
      if (!segIds.has(seg.id) && ptIds.has(seg.fromPointId)) {
        segIds.add(seg.id);
        ptIds.add(seg.toPointId);
        added = true;
      }
    }
  }

  const appIds = params.appliances
    .filter((a) => segIds.has(a.segmentId))
    .map((a) => a.id);

  return {
    segmentIdsToRemove: Array.from(segIds),
    pointIdsToRemove: Array.from(ptIds),
    applianceIdsToRemove: appIds,
  };
}
