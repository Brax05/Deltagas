import { getSubtreeImpact, validateDiagram } from "@/domain/diagram/collisions";
import type {
  Appliance,
  CopperNominalDiameter,
  Direction,
  Segment,
  SegmentPart,
} from "@/domain/types";

export interface NetworkEditSnapshot {
  segments: Segment[];
  appliances: Appliance[];
}

export interface NetworkHistoryState {
  past: NetworkEditSnapshot[];
  present: NetworkEditSnapshot;
  future: NetworkEditSnapshot[];
  lastRejectionReason: string | null;
  blockingSegmentId: string | null;
}

export function createInitialHistory(
  initial: NetworkEditSnapshot
): NetworkHistoryState {
  return {
    past: [],
    present: initial,
    future: [],
    lastRejectionReason: null,
    blockingSegmentId: null,
  };
}

export function getNextPointLabel(segments: Segment[]): string {
  const used = new Set<string>(["S"]);
  for (const s of segments) {
    used.add(s.fromPointId);
    used.add(s.toPointId);
  }
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (const ch of alphabet) {
    if (!used.has(ch)) return ch;
  }
  let idx = 1;
  while (used.has(`P${idx}`)) idx++;
  return `P${idx}`;
}

export function getNextSegmentId(segments: Segment[]): string {
  const used = new Set(segments.map((s) => s.id));
  let idx = 1;
  while (used.has(`T${idx}`)) idx++;
  return `T${idx}`;
}

function commitWithValidation(
  state: NetworkHistoryState,
  candidateSegments: Segment[],
  candidateAppliances: Appliance[] = state.present.appliances
): NetworkHistoryState {
  const validation = validateDiagram(candidateSegments);
  if (!validation.valid) {
    const first = validation.conflicts[0]!;
    return {
      ...state,
      lastRejectionReason: first.message,
      blockingSegmentId: first.blockingSegmentId ?? null,
    };
  }

  return {
    past: [...state.past.slice(-39), state.present],
    present: {
      segments: candidateSegments,
      appliances: candidateAppliances,
    },
    future: [],
    lastRejectionReason: null,
    blockingSegmentId: null,
  };
}

export function applyAddSegment(
  state: NetworkHistoryState,
  segment: Segment
): NetworkHistoryState {
  return commitWithValidation(state, [...state.present.segments, segment]);
}

export function applyUpdateSegmentParts(
  state: NetworkHistoryState,
  segmentId: string,
  parts: SegmentPart[]
): NetworkHistoryState {
  const sanitized = parts.map((p) => ({
    ...p,
    lengthCm: Math.max(10, Math.round(p.lengthCm)),
  }));
  const nextSegments = state.present.segments.map((s) =>
    s.id === segmentId ? { ...s, parts: sanitized } : s
  );
  return commitWithValidation(state, nextSegments);
}

export function applyAdjustLastPartLengthCm(
  state: NetworkHistoryState,
  segmentId: string,
  deltaCm: number
): NetworkHistoryState {
  const seg = state.present.segments.find((s) => s.id === segmentId);
  if (!seg || seg.parts.length === 0) return state;

  const nextParts = seg.parts.map((part, idx) =>
    idx === seg.parts.length - 1
      ? { ...part, lengthCm: Math.max(10, part.lengthCm + deltaCm) }
      : part
  );
  return applyUpdateSegmentParts(state, segmentId, nextParts);
}

export function applyAddSegmentBend(
  state: NetworkHistoryState,
  segmentId: string,
  direction: Direction,
  lengthCm: number
): NetworkHistoryState {
  const nextSegments = state.present.segments.map((s) =>
    s.id === segmentId
      ? {
          ...s,
          parts: [
            ...s.parts,
            { direction, lengthCm: Math.max(10, Math.round(lengthCm)) },
          ],
        }
      : s
  );
  return commitWithValidation(state, nextSegments);
}

export function applyChangeSegmentDiameter(
  state: NetworkHistoryState,
  segmentId: string,
  nominalDiameter: CopperNominalDiameter
): NetworkHistoryState {
  const nextSegments = state.present.segments.map((s) =>
    s.id === segmentId ? { ...s, nominalDiameter } : s
  );
  return {
    past: [...state.past.slice(-39), state.present],
    present: {
      segments: nextSegments,
      appliances: state.present.appliances,
    },
    future: [],
    lastRejectionReason: null,
    blockingSegmentId: null,
  };
}

export function applyDeleteSegmentWithSubtree(
  state: NetworkHistoryState,
  segmentId: string
): NetworkHistoryState {
  const impact = getSubtreeImpact({
    segments: state.present.segments,
    appliances: state.present.appliances,
    segmentId,
  });
  const segRemove = new Set(impact.segmentIdsToRemove);
  const appRemove = new Set(impact.applianceIdsToRemove);

  return {
    past: [...state.past.slice(-39), state.present],
    present: {
      segments: state.present.segments.filter((s) => !segRemove.has(s.id)),
      appliances: state.present.appliances.filter((a) => !appRemove.has(a.id)),
    },
    future: [],
    lastRejectionReason: null,
    blockingSegmentId: null,
  };
}

export function undoNetworkHistory(
  state: NetworkHistoryState
): NetworkHistoryState {
  if (state.past.length === 0) return state;
  const previous = state.past[state.past.length - 1]!;
  return {
    past: state.past.slice(0, -1),
    present: previous,
    future: [state.present, ...state.future],
    lastRejectionReason: null,
    blockingSegmentId: null,
  };
}

export function redoNetworkHistory(
  state: NetworkHistoryState
): NetworkHistoryState {
  if (state.future.length === 0) return state;
  const next = state.future[0]!;
  return {
    past: [...state.past, state.present],
    present: next,
    future: state.future.slice(1),
    lastRejectionReason: null,
    blockingSegmentId: null,
  };
}
