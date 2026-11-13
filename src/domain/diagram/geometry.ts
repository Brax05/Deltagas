import type { Direction, Point, Segment } from "@/domain/types";

export interface OrthogonalSpan {
  segmentId: string;
  partIndex: number;
  direction: Direction;
  lengthMeters: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface DiagramLayout {
  points: Record<string, Point>;
  spans: OrthogonalSpan[];
  /** Lado por el cual entra un tramo a cada punto (ocupado). */
  occupiedEntrySideByPoint: Record<string, Direction>;
  /** Lados ocupados por salidas desde cada punto. */
  occupiedExitSidesByPoint: Record<string, Direction[]>;
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    widthMeters: number;
    heightMeters: number;
  };
}

export const ALL_DIRECTIONS: readonly Direction[] = [
  "right",
  "down-right",
  "down",
  "down-left",
  "left",
  "up-left",
  "up",
  "up-right",
] as const;

export function oppositeDirection(dir: Direction): Direction {
  switch (dir) {
    case "right":
      return "left";
    case "left":
      return "right";
    case "up":
      return "down";
    case "down":
      return "up";
    case "up-right":
      return "down-left";
    case "down-left":
      return "up-right";
    case "down-right":
      return "up-left";
    case "up-left":
      return "down-right";
  }
}

export function directionVector(dir: Direction): { dx: number; dy: number } {
  switch (dir) {
    case "right":
      return { dx: 1, dy: 0 };
    case "left":
      return { dx: -1, dy: 0 };
    case "up":
      return { dx: 0, dy: 1 };
    case "down":
      return { dx: 0, dy: -1 };
    case "up-right":
      return { dx: Math.SQRT1_2, dy: Math.SQRT1_2 };
    case "down-right":
      return { dx: Math.SQRT1_2, dy: -Math.SQRT1_2 };
    case "down-left":
      return { dx: -Math.SQRT1_2, dy: -Math.SQRT1_2 };
    case "up-left":
      return { dx: -Math.SQRT1_2, dy: Math.SQRT1_2 };
  }
}

export function directionLabelEs(dir: Direction): string {
  switch (dir) {
    case "right":
      return "derecha";
    case "left":
      return "izquierda";
    case "up":
      return "arriba";
    case "down":
      return "abajo";
    case "up-right":
      return "diagonal ↗";
    case "down-right":
      return "diagonal ↘";
    case "down-left":
      return "diagonal ↙";
    case "up-left":
      return "diagonal ↖";
  }
}

export function computeDiagramLayout(segments: Segment[]): DiagramLayout {
  const points: Record<string, Point> = {
    S: { id: "S", label: "S", isRegulator: true, xMeters: 0, yMeters: 0 },
  };
  const spans: OrthogonalSpan[] = [];
  const occupiedEntrySideByPoint: Record<string, Direction> = {};
  const occupiedExitSidesByPoint: Record<string, Direction[]> = {};

  const childrenByFrom = new Map<string, Segment[]>();
  for (const seg of segments) {
    const list = childrenByFrom.get(seg.fromPointId) ?? [];
    list.push(seg);
    childrenByFrom.set(seg.fromPointId, list);
  }

  const visitedSegs = new Set<string>();
  const queue: Segment[] = [...(childrenByFrom.get("S") ?? [])];

  while (queue.length > 0) {
    const seg = queue.shift()!;
    if (visitedSegs.has(seg.id)) continue;
    visitedSegs.add(seg.id);

    const origin = points[seg.fromPointId];
    if (!origin) continue;

    let cx = origin.xMeters;
    let cy = origin.yMeters;

    if (seg.parts.length > 0) {
      const exits = occupiedExitSidesByPoint[seg.fromPointId] ?? [];
      exits.push(seg.parts[0]!.direction);
      occupiedExitSidesByPoint[seg.fromPointId] = exits;
    }

    seg.parts.forEach((part, partIndex) => {
      const lenM = part.lengthCm / 100;
      const vec = directionVector(part.direction);
      const nx = Number((cx + vec.dx * lenM).toFixed(4));
      const ny = Number((cy + vec.dy * lenM).toFixed(4));

      spans.push({
        segmentId: seg.id,
        partIndex,
        direction: part.direction,
        lengthMeters: lenM,
        x1: cx,
        y1: cy,
        x2: nx,
        y2: ny,
      });

      cx = nx;
      cy = ny;
    });

    const lastPart = seg.parts[seg.parts.length - 1];
    if (lastPart) {
      occupiedEntrySideByPoint[seg.toPointId] = oppositeDirection(
        lastPart.direction
      );
    }

    points[seg.toPointId] = {
      id: seg.toPointId,
      label: seg.toPointId,
      xMeters: cx,
      yMeters: cy,
    };

    const nextSegs = childrenByFrom.get(seg.toPointId) ?? [];
    for (const next of nextSegs) {
      queue.push(next);
    }
  }

  const allPoints = Object.values(points);
  let minX = 0;
  let maxX = 0;
  let minY = 0;
  let maxY = 0;

  for (const pt of allPoints) {
    if (pt.xMeters < minX) minX = pt.xMeters;
    if (pt.xMeters > maxX) maxX = pt.xMeters;
    if (pt.yMeters < minY) minY = pt.yMeters;
    if (pt.yMeters > maxY) maxY = pt.yMeters;
  }

  return {
    points,
    spans,
    occupiedEntrySideByPoint,
    occupiedExitSidesByPoint,
    bounds: {
      minX,
      maxX,
      minY,
      maxY,
      widthMeters: Math.max(1, maxX - minX),
      heightMeters: Math.max(1, maxY - minY),
    },
  };
}
