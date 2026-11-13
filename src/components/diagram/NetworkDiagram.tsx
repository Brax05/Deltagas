"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Undo2,
  Redo2,
  Download,
  AlertTriangle,
} from "lucide-react";
import { APPLIANCE_CATALOG_TABLA_V } from "@/domain/ds66/appliances";
import { COPPER_PIPE_BY_NOMINAL } from "@/domain/ds66/pipes";
import type { NetworkCalculationResult } from "@/domain/calculations/network";
import type { RoomEvaluation } from "@/domain/calculations/rooms";
import {
  directionLabelEs,
  directionVector,
  evaluateDirectionsFromPoint,
  getNextPointLabel,
  getNextSegmentId,
  snapVectorToDirectionAndStepCm,
  validateDiagram,
  type DiagramValidationResult,
} from "@/domain/diagram";
import type {
  Appliance,
  CopperNominalDiameter,
  Direction,
  GasConfigId,
  Point,
  Room,
  Segment,
} from "@/domain/types";
import {
  QuickAddSegmentBar,
  createInitialQuickAddDraft,
  type QuickAddDraft,
} from "@/components/diagram/QuickAddSegmentBar";
import { RoomQuickEditor } from "@/components/rooms/RoomQuickEditor";

interface NetworkDiagramProps {
  gasType: GasConfigId;
  segments: Segment[];
  appliances: Appliance[];
  rooms: Room[];
  roomEvaluations: RoomEvaluation[];
  validation: DiagramValidationResult;
  calculation: NetworkCalculationResult;
  selectedSegmentId: string | null;
  selectedPointId: string | null;
  blockingSegmentId: string | null;
  rejectionReason: string | null;
  canUndo: boolean;
  canRedo: boolean;
  viewResetKey?: number;
  onSelectSegment: (segmentId: string | null) => void;
  onSelectPoint: (pointId: string | null) => void;
  onQuickAddFromPoint: (params: {
    fromPointId: string;
    direction: Direction;
    lengthCm: number;
    nominalDiameter: CopperNominalDiameter;
    appliance?: {
      catalogId: string;
      name: string;
      applianceClass: Appliance["applianceClass"];
      circuitType: Appliance["circuitType"];
      powerMcalPerHour: number;
      roomLengthMeters: number;
      roomWidthMeters: number;
      roomHeightMeters: number;
    };
  }) => void;
  onMoveSegmentLastPart: (
    segmentId: string,
    direction: Direction,
    lengthCm: number
  ) => void;
  onUpdateAppliance?: (appliance: Appliance) => void;
  onDeleteAppliance?: (applianceId: string) => void;
  onUpdateRoom: (room: Room) => void;
  onCreateAndAssignRoom: (applianceId: string, room: Room) => void;
  onAssignApplianceRoom: (
    applianceId: string,
    roomId: string | undefined
  ) => void;
  onUndo: () => void;
  onRedo: () => void;
}

const PX_PER_METER = 24;

export function NetworkDiagram({
  gasType,
  segments,
  appliances,
  rooms,
  roomEvaluations,
  validation,
  calculation,
  selectedSegmentId,
  selectedPointId,
  blockingSegmentId,
  rejectionReason,
  canUndo,
  canRedo,
  viewResetKey,
  onSelectSegment,
  onSelectPoint,
  onQuickAddFromPoint,
  onMoveSegmentLastPart,
  onUpdateAppliance,
  onDeleteAppliance,
  onUpdateRoom,
  onCreateAndAssignRoom,
  onAssignApplianceRoom,
  onUndo,
  onRedo,
}: NetworkDiagramProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const MIN_ZOOM = 0.3;
  const MAX_ZOOM = 5;
  const [viewTransform, setViewTransform] = useState({
    zoom: 1,
    pan: { x: 0, y: 0 },
  });
  const zoom = viewTransform.zoom;
  const pan = viewTransform.pan;
  const setZoom = (updater: number | ((z: number) => number)) => {
    setViewTransform((prev) => ({
      ...prev,
      zoom: typeof updater === "function" ? updater(prev.zoom) : updater,
    }));
  };
  const setPan = (nextPan: { x: number; y: number }) => {
    setViewTransform((prev) => ({ ...prev, pan: nextPan }));
  };

  type NodeDragState =
    | {
        mode: "move-node";
        pointId: string;
        segmentId: string;
        partIndex: number;
        anchorXM: number;
        anchorYM: number;
        originalDirection: Direction;
        originalLengthCm: number;
        targetDirection: Direction;
        targetLengthCm: number;
        pointerId: number;
        startClientX: number;
        startClientY: number;
        active: boolean;
      }
    | {
        mode: "new-from-regulator";
        pointId: "S";
        anchorXM: number;
        anchorYM: number;
        targetDirection: Direction;
        targetLengthCm: number;
        pointerId: number;
        startClientX: number;
        startClientY: number;
        active: boolean;
      };

  const [editingApplianceId, setEditingApplianceId] = useState<string | null>(
    null
  );
  const [quickAddDraft, setQuickAddDraft] = useState<QuickAddDraft | null>(
    null
  );
  const [nodeDrag, setNodeDrag] = useState<NodeDragState | null>(null);
  const nodeDragRef = useRef<NodeDragState | null>(null);
  nodeDragRef.current = nodeDrag;
  const holdTimerRef = useRef<number | null>(null);
  const suppressNextClickRef = useRef(false);
  const frozenWorldBoxRef = useRef<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  const [localHint, setLocalHint] = useState<string | null>(null);

  useEffect(() => {
    if (viewResetKey === undefined) return;
    setViewTransform({ zoom: 1, pan: { x: 0, y: 0 } });
    setEditingApplianceId(null);
    setQuickAddDraft(null);
    setNodeDrag(null);
    frozenWorldBoxRef.current = null;
    setLocalHint(null);
  }, [viewResetKey]);

  const [panning, setPanning] = useState<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  const previewInfo = useMemo(() => {
    if (nodeDrag?.active) {
      if (nodeDrag.mode === "move-node") {
        const previewSegments = segments.map((seg) => {
          if (seg.id !== nodeDrag.segmentId) return seg;
          return {
            ...seg,
            parts: seg.parts.map((part, idx) =>
              idx === nodeDrag.partIndex
                ? {
                    direction: nodeDrag.targetDirection,
                    lengthCm: nodeDrag.targetLengthCm,
                  }
                : part
            ),
          };
        });
        return {
          previewSegments,
          previewSegmentId: nodeDrag.segmentId,
          previewTargetPointId: nodeDrag.pointId,
          previewDeltaCm: nodeDrag.targetLengthCm - nodeDrag.originalLengthCm,
          previewNewLengthCm: nodeDrag.targetLengthCm,
          previewDirection: nodeDrag.targetDirection,
          isNewSegmentPreview: false,
        };
      }

      const candidateId = getNextSegmentId(segments);
      const candidateToPoint = getNextPointLabel(segments);
      const previewSegments: Segment[] = [
        ...segments,
        {
          id: candidateId,
          fromPointId: "S",
          toPointId: candidateToPoint,
          nominalDiameter: "1/2",
          parts: [
            {
              direction: nodeDrag.targetDirection,
              lengthCm: nodeDrag.targetLengthCm,
            },
          ],
        },
      ];
      return {
        previewSegments,
        previewSegmentId: candidateId,
        previewTargetPointId: candidateToPoint,
        previewDeltaCm: nodeDrag.targetLengthCm,
        previewNewLengthCm: nodeDrag.targetLengthCm,
        previewDirection: nodeDrag.targetDirection,
        isNewSegmentPreview: true,
      };
    }

    if (quickAddDraft) {
      const candidateId = getNextSegmentId(segments);
      const totalCm = Math.max(
        10,
        Math.round(
          (quickAddDraft.lengthMeters * 100 + quickAddDraft.lengthCmExtra) / 10
        ) * 10
      );
      const previewSegments: Segment[] = [
        ...segments,
        {
          id: candidateId,
          fromPointId: quickAddDraft.fromPointId,
          toPointId: quickAddDraft.toPointId,
          nominalDiameter: quickAddDraft.nominalDiameter,
          parts: [
            {
              direction: quickAddDraft.direction,
              lengthCm: totalCm,
            },
          ],
        },
      ];
      return {
        previewSegments,
        previewSegmentId: candidateId,
        previewTargetPointId: quickAddDraft.toPointId,
        previewDeltaCm: totalCm,
        previewNewLengthCm: totalCm,
        previewDirection: quickAddDraft.direction,
        isNewSegmentPreview: true,
      };
    }

    return null;
  }, [nodeDrag, quickAddDraft, segments]);

  const previewValidation = useMemo(() => {
    if (!previewInfo) return null;
    return validateDiagram(previewInfo.previewSegments);
  }, [previewInfo]);

  const activeSegments = previewInfo?.previewSegments ?? segments;
  const activeValidation = previewValidation ?? validation;
  const previewConflictMessage = previewValidation?.valid
    ? null
    : (previewValidation?.conflicts[0]?.message ??
      "El tramo en esa posición generaría un conflicto geométrico.");
  const previewSegmentId = previewInfo?.previewSegmentId ?? null;

  const { layout } = activeValidation;

  // Ubicación y dimensiones visuales de recintos asociados a artefactos
  const roomPlacements = useMemo(() => {
    const segById = new Map(activeSegments.map((s) => [s.id, s]));
    const roomsById = new Map(rooms.map((r) => [r.id, r]));
    const evalByRoomId = new Map(roomEvaluations.map((e) => [e.roomId, e]));
    const byRoom = new Map<
      string,
      {
        room: Room;
        pts: Point[];
        primaryApp: Appliance | null;
        isPreview?: boolean;
      }
    >();

    for (const app of appliances) {
      if (!app.roomId) continue;
      const room = roomsById.get(app.roomId);
      const seg = segById.get(app.segmentId);
      if (!room || !seg) continue;
      const pt = layout.points[seg.toPointId];
      if (!pt) continue;
      const existing = byRoom.get(room.id);
      if (existing) {
        existing.pts.push(pt);
      } else {
        byRoom.set(room.id, { room, pts: [pt], primaryApp: app });
      }
    }

    if (quickAddDraft?.includeAppliance) {
      const previewPt = layout.points[quickAddDraft.toPointId];
      if (previewPt) {
        const previewRoom: Room = {
          id: "__preview_room__",
          name: `Recinto (${quickAddDraft.applianceName || "Nuevo"})`,
          lengthMeters: Math.max(0.5, quickAddDraft.roomLengthMeters || 3.5),
          widthMeters: Math.max(0.5, quickAddDraft.roomWidthMeters || 3),
          heightMeters: Math.max(1, quickAddDraft.roomHeightMeters || 2.4),
          ventilationType: "directa",
        };
        byRoom.set("__preview_room__", {
          room: previewRoom,
          pts: [previewPt],
          primaryApp: null,
          isPreview: true,
        });
      }
    }

    return Array.from(byRoom.values()).map(
      ({ room, pts, primaryApp, isPreview }) => {
        const cxM = pts.reduce((s, p) => s + p.xMeters, 0) / pts.length;
        const cyM = pts.reduce((s, p) => s + p.yMeters, 0) / pts.length;
        const safeLength =
          Number.isFinite(room.lengthMeters) && room.lengthMeters > 0
            ? room.lengthMeters
            : 3;
        const safeWidth =
          Number.isFinite(room.widthMeters) && room.widthMeters > 0
            ? room.widthMeters
            : 3;
        const widthPx = Math.max(64, Math.min(360, safeLength * PX_PER_METER));
        const heightPx = Math.max(48, Math.min(280, safeWidth * PX_PER_METER));
        const halfWM = widthPx / PX_PER_METER / 2;
        const halfHM = heightPx / PX_PER_METER / 2;
        const evaluation = evalByRoomId.get(room.id) ?? null;
        return {
          room,
          primaryApp,
          evaluation,
          isPreview: Boolean(isPreview),
          cxM,
          cyM,
          widthPx,
          heightPx,
          minXM: cxM - halfWM,
          maxXM: cxM + halfWM,
          minYM: cyM - halfHM,
          maxYM: cyM + halfHM,
        };
      }
    );
  }, [
    appliances,
    activeSegments,
    rooms,
    roomEvaluations,
    layout.points,
    quickAddDraft,
  ]);

  // Mapear coordenadas reales (m) -> coordenadas SVG (y invertido)
  const computedWorldBox = useMemo(() => {
    let boundMinX = Number.isFinite(layout.bounds.minX) ? layout.bounds.minX : 0;
    let boundMaxX = Number.isFinite(layout.bounds.maxX) ? layout.bounds.maxX : 0;
    let boundMinY = Number.isFinite(layout.bounds.minY) ? layout.bounds.minY : 0;
    let boundMaxY = Number.isFinite(layout.bounds.maxY) ? layout.bounds.maxY : 0;

    for (const rp of roomPlacements) {
      if (Number.isFinite(rp.minXM)) boundMinX = Math.min(boundMinX, rp.minXM);
      if (Number.isFinite(rp.maxXM)) boundMaxX = Math.max(boundMaxX, rp.maxXM);
      if (Number.isFinite(rp.minYM)) boundMinY = Math.min(boundMinY, rp.minYM);
      if (Number.isFinite(rp.maxYM)) boundMaxY = Math.max(boundMaxY, rp.maxYM);
    }

    const padM = 7;
    const minX = (boundMinX - padM) * PX_PER_METER;
    const maxX = (boundMaxX + padM + 6) * PX_PER_METER;
    const minY = -(boundMaxY + padM) * PX_PER_METER;
    const maxY = -(boundMinY - padM) * PX_PER_METER;
    return {
      x: minX,
      y: minY,
      w: Math.max(420, maxX - minX),
      h: Math.max(320, maxY - minY),
    };
  }, [layout.bounds, roomPlacements]);

  const worldBox =
    nodeDrag?.active && frozenWorldBoxRef.current
      ? frozenWorldBoxRef.current
      : computedWorldBox;

  const worldBoxRef = useRef(worldBox);
  worldBoxRef.current = worldBox;

  useEffect(() => {
    const container = canvasRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      let deltaPx = e.deltaY;
      if (e.deltaMode === 1) deltaPx *= 16;
      if (e.deltaMode === 2) deltaPx *= 240;
      if (!Number.isFinite(deltaPx) || deltaPx === 0) return;

      e.preventDefault();

      const rawFactor = Math.exp(-deltaPx * 0.0018);
      const factor = Math.max(0.75, Math.min(1.35, rawFactor));
      const clientX = e.clientX;
      const clientY = e.clientY;
      const wb = worldBoxRef.current;
      const baseScale = Math.min(rect.width / wb.w, rect.height / wb.h);

      setViewTransform((prev) => {
        const nextZoom = Math.max(
          MIN_ZOOM,
          Math.min(MAX_ZOOM, Number((prev.zoom * factor).toFixed(3)))
        );
        if (nextZoom === prev.zoom) return prev;
        if (!Number.isFinite(baseScale) || baseScale <= 0) {
          return { ...prev, zoom: nextZoom };
        }
        const dxPx = clientX - (rect.left + rect.width / 2);
        const dyPx = clientY - (rect.top + rect.height / 2);
        const invDiff = 1 / nextZoom - 1 / prev.zoom;
        return {
          zoom: nextZoom,
          pan: {
            x: prev.pan.x + (dxPx / baseScale) * invDiff,
            y: prev.pan.y + (dyPx / baseScale) * invDiff,
          },
        };
      });
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, []);

  const viewBox = useMemo(() => {
    const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
    const safePanX = Number.isFinite(pan.x) ? pan.x : 0;
    const safePanY = Number.isFinite(pan.y) ? pan.y : 0;
    const vw = worldBox.w / safeZoom;
    const vh = worldBox.h / safeZoom;
    const cx = worldBox.x + worldBox.w / 2 - safePanX;
    const cy = worldBox.y + worldBox.h / 2 - safePanY;
    return `${cx - vw / 2} ${cy - vh / 2} ${vw} ${vh}`;
  }, [worldBox, zoom, pan]);

  const toSvg = (xMeters: number, yMeters: number) => ({
    x: xMeters * PX_PER_METER,
    y: -yMeters * PX_PER_METER,
  });

  const appliancesByPoint = useMemo(() => {
    const map = new Map<string, Appliance[]>();
    const segById = new Map(activeSegments.map((s) => [s.id, s]));
    for (const app of appliances) {
      const seg = segById.get(app.segmentId);
      if (!seg) continue;
      const list = map.get(seg.toPointId) ?? [];
      list.push(app);
      map.set(seg.toPointId, list);
    }
    return map;
  }, [appliances, activeSegments]);

  const selectedPointDirections = useMemo(() => {
    if (!selectedPointId) return null;
    return evaluateDirectionsFromPoint({
      segments,
      fromPointId: selectedPointId,
    });
  }, [segments, selectedPointId]);

  // Detectar etiquetas de artefactos cercanas (< 3.5 m de otro artefacto) para desplazar con línea guía (Sección 9.6)
  const closeApplianceOffsets = useMemo(() => {
    const offsets = new Map<string, { dx: number; dy: number }>();
    const pts = Array.from(appliancesByPoint.entries())
      .map(([ptId, list]) => ({
        ptId,
        pt: layout.points[ptId],
        apps: list,
      }))
      .filter((item): item is { ptId: string; pt: Point; apps: Appliance[] } =>
        Boolean(item.pt)
      );

    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i]!;
        const b = pts[j]!;
        const dist = Math.hypot(
          a.pt.xMeters - b.pt.xMeters,
          a.pt.yMeters - b.pt.yMeters
        );
        if (dist < 3.5) {
          // Desplazar hacia abajo-derecha el punto con menor Y para evitar choque
          const lower = a.pt.yMeters <= b.pt.yMeters ? a : b;
          offsets.set(lower.ptId, { dx: 44, dy: 26 });
        }
      }
    }
    return offsets;
  }, [appliancesByPoint, layout.points]);

  const editingAppliance = useMemo(
    () => appliances.find((a) => a.id === editingApplianceId) ?? null,
    [appliances, editingApplianceId]
  );

  const latestRef = useRef({
    segments,
    onMoveSegmentLastPart,
    onSelectSegment,
    onSelectPoint,
    zoom,
    pan,
  });
  latestRef.current = {
    segments,
    onMoveSegmentLastPart,
    onSelectSegment,
    onSelectPoint,
    zoom,
    pan,
  };

  useEffect(() => {
    return () => {
      if (holdTimerRef.current !== null) {
        window.clearTimeout(holdTimerRef.current);
      }
    };
  }, []);

  const clientToWorldMeters = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const ctm = svg.getScreenCTM();
    if (ctm) {
      const pt = svg.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      const svgPt = pt.matrixTransform(ctm.inverse());
      return {
        xMeters: svgPt.x / PX_PER_METER,
        yMeters: -svgPt.y / PX_PER_METER,
      };
    }
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const wb = worldBoxRef.current;
    const { zoom: z, pan: p } = latestRef.current;
    const vw = wb.w / z;
    const vh = wb.h / z;
    const cx = wb.x + wb.w / 2 - p.x;
    const cy = wb.y + wb.h / 2 - p.y;
    const svgX = cx - vw / 2 + ((clientX - rect.left) / rect.width) * vw;
    const svgY = cy - vh / 2 + ((clientY - rect.top) / rect.height) * vh;
    return {
      xMeters: svgX / PX_PER_METER,
      yMeters: -svgY / PX_PER_METER,
    };
  };

  const isDraggingNode = nodeDrag !== null;
  useEffect(() => {
    if (!isDraggingNode) return;

    const handleWindowPointerMove = (ev: PointerEvent) => {
      const cur = nodeDragRef.current;
      if (!cur || ev.pointerId !== cur.pointerId) return;

      const movedPx = Math.hypot(
        ev.clientX - cur.startClientX,
        ev.clientY - cur.startClientY
      );
      let nextActive = cur.active;

      if (!nextActive) {
        if (movedPx < 4) return;
        if (holdTimerRef.current !== null) {
          window.clearTimeout(holdTimerRef.current);
          holdTimerRef.current = null;
        }
        if (!frozenWorldBoxRef.current) {
          frozenWorldBoxRef.current = worldBoxRef.current;
        }
        setQuickAddDraft(null);
        setEditingApplianceId(null);
        if (cur.mode === "move-node") {
          latestRef.current.onSelectSegment(cur.segmentId);
          latestRef.current.onSelectPoint(cur.pointId);
        } else {
          latestRef.current.onSelectPoint("S");
          latestRef.current.onSelectSegment(null);
        }
        nextActive = true;
      }

      const worldM = clientToWorldMeters(ev.clientX, ev.clientY);
      if (!worldM) return;

      const dxMeters = worldM.xMeters - cur.anchorXM;
      const dyMeters = worldM.yMeters - cur.anchorYM;
      const fallbackDir =
        cur.mode === "move-node" ? cur.originalDirection : cur.targetDirection;
      const snapped = snapVectorToDirectionAndStepCm({
        dxMeters,
        dyMeters,
        stepCm: 10,
        minCm: 10,
        fallbackDirection: fallbackDir,
      });

      if (
        nextActive !== cur.active ||
        snapped.direction !== cur.targetDirection ||
        snapped.lengthCm !== cur.targetLengthCm
      ) {
        const nextDrag: NodeDragState = {
          ...cur,
          active: nextActive,
          targetDirection: snapped.direction,
          targetLengthCm: snapped.lengthCm,
        };
        nodeDragRef.current = nextDrag;
        setNodeDrag(nextDrag);
      }
    };

    const finishNodeDrag = (ev: PointerEvent, commit: boolean) => {
      const cur = nodeDragRef.current;
      if (!cur || ev.pointerId !== cur.pointerId) return;

      if (holdTimerRef.current !== null) {
        window.clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }

      nodeDragRef.current = null;
      setNodeDrag(null);
      frozenWorldBoxRef.current = null;

      if (!cur.active) return;

      suppressNextClickRef.current = true;
      window.setTimeout(() => {
        suppressNextClickRef.current = false;
      }, 100);

      if (!commit) return;

      if (cur.mode === "move-node") {
        if (
          cur.targetDirection !== cur.originalDirection ||
          cur.targetLengthCm !== cur.originalLengthCm
        ) {
          latestRef.current.onMoveSegmentLastPart(
            cur.segmentId,
            cur.targetDirection,
            cur.targetLengthCm
          );
        }
        return;
      }

      const movedPx = Math.hypot(
        ev.clientX - cur.startClientX,
        ev.clientY - cur.startClientY
      );
      if (movedPx >= 8) {
        setQuickAddDraft(
          createInitialQuickAddDraft({
            fromPointId: "S",
            toPointId: getNextPointLabel(latestRef.current.segments),
            direction: cur.targetDirection,
            totalCm: cur.targetLengthCm,
          })
        );
      }
    };

    const handleWindowPointerUp = (ev: PointerEvent) => finishNodeDrag(ev, true);
    const handleWindowPointerCancel = (ev: PointerEvent) =>
      finishNodeDrag(ev, false);

    window.addEventListener("pointermove", handleWindowPointerMove);
    window.addEventListener("pointerup", handleWindowPointerUp);
    window.addEventListener("pointercancel", handleWindowPointerCancel);
    return () => {
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", handleWindowPointerUp);
      window.removeEventListener("pointercancel", handleWindowPointerCancel);
    };
  }, [isDraggingNode]);

  const startNodePointerDown = (
    e: React.PointerEvent<SVGElement>,
    ptId: string,
    immediateActive = false
  ) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    e.stopPropagation();
    setLocalHint(null);

    const pt = validation.layout.points[ptId];
    if (!pt) return;

    if (ptId === "S") {
      if (segments.length > 0) {
        if (holdTimerRef.current !== null) {
          window.clearTimeout(holdTimerRef.current);
        }
        holdTimerRef.current = window.setTimeout(() => {
          setLocalHint(
            "El regulador S es el punto fijo de entrada; mantén presionado otro nodo (ej. A, B) para moverlo en saltos de 10 cm."
          );
        }, 260);
        window.addEventListener(
          "pointerup",
          () => {
            if (holdTimerRef.current !== null) {
              window.clearTimeout(holdTimerRef.current);
              holdTimerRef.current = null;
            }
          },
          { once: true }
        );
        return;
      }

      const initialRegDrag: NodeDragState = {
        mode: "new-from-regulator",
        pointId: "S",
        anchorXM: 0,
        anchorYM: 0,
        targetDirection: "right",
        targetLengthCm: 100,
        pointerId: e.pointerId,
        startClientX: e.clientX,
        startClientY: e.clientY,
        active: immediateActive,
      };
      if (holdTimerRef.current !== null) {
        window.clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }
      if (immediateActive) {
        frozenWorldBoxRef.current = worldBoxRef.current;
        setQuickAddDraft(null);
        setEditingApplianceId(null);
      } else {
        holdTimerRef.current = window.setTimeout(() => {
          const cur = nodeDragRef.current;
          if (!cur || cur.pointerId !== e.pointerId || cur.active) return;
          frozenWorldBoxRef.current = worldBoxRef.current;
          setQuickAddDraft(null);
          setEditingApplianceId(null);
          latestRef.current.onSelectPoint("S");
          latestRef.current.onSelectSegment(null);
          const next = { ...cur, active: true };
          nodeDragRef.current = next;
          setNodeDrag(next);
        }, 120);
      }
      nodeDragRef.current = initialRegDrag;
      setNodeDrag(initialRegDrag);
      return;
    }

    const ownerSeg = segments.find((s) => s.toPointId === ptId);
    if (!ownerSeg || ownerSeg.parts.length === 0) return;

    const partIndex = ownerSeg.parts.length - 1;
    const lastPart = ownerSeg.parts[partIndex]!;
    const vec = directionVector(lastPart.direction);
    const anchorXM = pt.xMeters - vec.dx * (lastPart.lengthCm / 100);
    const anchorYM = pt.yMeters - vec.dy * (lastPart.lengthCm / 100);

    const initialDrag: NodeDragState = {
      mode: "move-node",
      pointId: ptId,
      segmentId: ownerSeg.id,
      partIndex,
      anchorXM,
      anchorYM,
      originalDirection: lastPart.direction,
      originalLengthCm: lastPart.lengthCm,
      targetDirection: lastPart.direction,
      targetLengthCm: lastPart.lengthCm,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      active: immediateActive,
    };

    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }

    if (immediateActive) {
      frozenWorldBoxRef.current = worldBoxRef.current;
      setQuickAddDraft(null);
      setEditingApplianceId(null);
    } else {
      holdTimerRef.current = window.setTimeout(() => {
        const cur = nodeDragRef.current;
        if (!cur || cur.pointerId !== e.pointerId || cur.active) return;
        frozenWorldBoxRef.current = worldBoxRef.current;
        setQuickAddDraft(null);
        setEditingApplianceId(null);
        if (cur.mode === "move-node") {
          latestRef.current.onSelectSegment(cur.segmentId);
          latestRef.current.onSelectPoint(cur.pointId);
        }
        const next = { ...cur, active: true };
        nodeDragRef.current = next;
        setNodeDrag(next);
      }, 120);
    }

    nodeDragRef.current = initialDrag;
    setNodeDrag(initialDrag);
  };

  const handleSvgPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.target === svgRef.current) {
      onSelectSegment(null);
      onSelectPoint(null);
      setEditingApplianceId(null);
      setLocalHint(null);
      setPanning({
        startX: e.clientX,
        startY: e.clientY,
        origX: pan.x,
        origY: pan.y,
      });
    }
  };

  const handleSvgPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (panning) {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const scale = worldBox.w / zoom / rect.width;
      setPan({
        x: panning.origX + (e.clientX - panning.startX) * scale,
        y: panning.origY + (e.clientY - panning.startY) * scale,
      });
    }
  };

  const handleSvgPointerUp = () => {
    setPanning(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape" && quickAddDraft) {
      e.preventDefault();
      setQuickAddDraft(null);
      return;
    }
    if (!selectedSegmentId) return;
    const seg = segments.find((s) => s.id === selectedSegmentId);
    const lastPart = seg?.parts[seg.parts.length - 1];
    if (!lastPart) return;

    const vec = directionVector(lastPart.direction);
    const stepCm = e.shiftKey ? 10 : 1;
    let delta = 0;
    if (e.key === "ArrowRight") delta = Math.sign(vec.dx) * stepCm;
    if (e.key === "ArrowLeft") delta = -Math.sign(vec.dx) * stepCm;
    if (e.key === "ArrowUp") delta = Math.sign(vec.dy) * stepCm;
    if (e.key === "ArrowDown") delta = -Math.sign(vec.dy) * stepCm;

    if (delta !== 0) {
      e.preventDefault();
      const nextCm = Math.max(10, lastPart.lengthCm + delta);
      if (nextCm !== lastPart.lengthCm) {
        onMoveSegmentLastPart(selectedSegmentId, lastPart.direction, nextCm);
      }
    }
  };

  const exportDiagramSvg = () => {
    if (!svgRef.current) return;
    const computed = getComputedStyle(document.documentElement);
    const serializer = new XMLSerializer();
    let raw = serializer.serializeToString(svgRef.current);
    raw = raw.replace(/var\((--[a-zA-Z0-9-]+)\)/g, (_, name: string) => {
      const val = computed.getPropertyValue(name).trim();
      return val || "#0f172a";
    });
    const bg = computed.getPropertyValue("--bg-surface").trim() || "#f8fafc";
    raw = raw.replace(
      /(<svg\b[^>]*>)/,
      `$1<rect x="-50000" y="-50000" width="100000" height="100000" fill="${bg}"/>`
    );
    const blob = new Blob([raw], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "diagrama-red-ds66.svg";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="flex flex-col overflow-hidden rounded-xl border border-pizarra-border bg-pizarra-surface shadow-sm outline-none focus:ring-2 focus:ring-pizarra-action"
    >
      {/* Barra superior del diagrama */}
      <div className="no-print flex flex-wrap items-center justify-between gap-2 border-b border-pizarra-border bg-pizarra-secondary px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-pizarra-text sm:text-sm">
            Diagrama a escala real (Módulo 5)
          </span>
          <span className="rounded border border-pizarra-border bg-pizarra-surface px-2 py-0.5 text-[11px] font-semibold tabular-nums text-pizarra-subtext">
            {segments.length} tramos · {appliances.length} artefactos
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            title="Deshacer"
            className="rounded-lg p-1.5 text-pizarra-text-control hover:bg-pizarra-control-hover disabled:text-pizarra-muted disabled:hover:bg-transparent"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            title="Rehacer"
            className="rounded-lg p-1.5 text-pizarra-text-control hover:bg-pizarra-control-hover disabled:text-pizarra-muted disabled:hover:bg-transparent"
          >
            <Redo2 className="h-4 w-4" />
          </button>
          <div className="mx-1 h-4 w-px bg-pizarra-border-control" />
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(MAX_ZOOM, Number((z + 0.25).toFixed(2))))}
            title="Acercar"
            className="rounded-lg p-1.5 text-pizarra-text-control hover:bg-pizarra-control-hover"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(MIN_ZOOM, Number((z - 0.25).toFixed(2))))}
            title="Alejar"
            className="rounded-lg p-1.5 text-pizarra-text-control hover:bg-pizarra-control-hover"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setViewTransform({ zoom: 1, pan: { x: 0, y: 0 } })}
            title="Ajustar a pantalla"
            className="rounded-lg p-1.5 text-pizarra-text-control hover:bg-pizarra-control-hover"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={exportDiagramSvg}
            title="Exportar diagrama como SVG"
            className="ml-1 flex items-center gap-1 rounded-lg border border-pizarra-border-control bg-pizarra-control px-2.5 py-1 text-xs font-semibold text-pizarra-text-control transition-colors hover:bg-pizarra-control-hover"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Exportar</span>
          </button>
        </div>
      </div>

      {/* Avisos de colisión o proximidad */}
      {(rejectionReason || validation.warnings.length > 0) && (
        <div className="no-print space-y-1.5 border-b border-pizarra-border bg-pizarra-surface px-3 py-2 text-xs">
          {rejectionReason && (
            <p className="flex items-center gap-1.5 rounded-lg border border-status-error-border bg-status-error-bg px-2.5 py-1.5 font-semibold text-status-error-text">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-status-error-text" />
              Cambio bloqueado: {rejectionReason}
            </p>
          )}
          {validation.warnings.map((w) => (
            <p
              key={`${w.segmentA}-${w.segmentB}`}
              className="rounded-lg border border-status-warn-border bg-status-warn-bg px-2.5 py-1.5 font-medium text-status-warn-text"
            >
              Separación mínima: {w.message}
            </p>
          ))}
        </div>
      )}

      {/* Lienzo SVG a escala */}
      <div ref={canvasRef} className="relative h-[340px] w-full select-none bg-pizarra-surface sm:h-[480px]">
        <svg
          ref={svgRef}
          viewBox={viewBox}
          onPointerDown={handleSvgPointerDown}
          onPointerMove={handleSvgPointerMove}
          onPointerUp={handleSvgPointerUp}
          onPointerLeave={handleSvgPointerUp}
          className="h-full w-full touch-none cursor-grab active:cursor-grabbing"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern
              id="grid-5m"
              width={5 * PX_PER_METER}
              height={5 * PX_PER_METER}
              patternUnits="userSpaceOnUse"
            >
              <path
                d={`M ${5 * PX_PER_METER} 0 L 0 0 0 ${5 * PX_PER_METER}`}
                fill="none"
                stroke="var(--border-subtle)"
                strokeWidth="1"
              />
            </pattern>
          </defs>
          <rect
            x={worldBox.x - 1000}
            y={worldBox.y - 1000}
            width={worldBox.w + 2000}
            height={worldBox.h + 2000}
            fill="url(#grid-5m)"
            pointerEvents="none"
          />

          {/* Cuadros de recintos por artefacto (Largo × Ancho) con alerta parpadeante */}
          {roomPlacements.map((rp) => {
            const center = toSvg(rp.cxM, rp.cyM);
            const rx = center.x - rp.widthPx / 2;
            const ry = center.y - rp.heightPx / 2;
            const ev = rp.evaluation;
            const isInsufficient = Boolean(
              ev && ev.totalPowerKw > 0 && !ev.volumeCompliant
            );
            const isSelectedRoom = Boolean(
              !rp.isPreview &&
                editingAppliance &&
                editingAppliance.roomId === rp.room.id
            );
            const hasLoad = Boolean(ev && ev.totalPowerKw > 0);
            const fillColor = rp.isPreview
              ? "var(--status-ok-bg)"
              : isInsufficient
                ? "var(--status-error-bg)"
                : hasLoad
                  ? "var(--status-ok-bg)"
                  : "var(--bg-secondary)";
            const strokeColor = rp.isPreview
              ? "var(--status-ok-text)"
              : isSelectedRoom
                ? "var(--accent-primary)"
                : isInsufficient
                  ? "var(--status-error-text)"
                  : hasLoad
                    ? "var(--status-ok-border)"
                    : "var(--border-control)";
            const labelColor = rp.isPreview
              ? "var(--status-ok-text)"
              : isInsufficient
                ? "var(--status-error-text)"
                : hasLoad
                  ? "var(--status-ok-text)"
                  : "var(--text-secondary)";

            return (
              <g
                key={`room-box-${rp.room.id}`}
                onClick={(e) => {
                  if (rp.isPreview || !rp.primaryApp) return;
                  e.stopPropagation();
                  setEditingApplianceId(rp.primaryApp.id);
                  onSelectSegment(rp.primaryApp.segmentId);
                  onSelectPoint(null);
                }}
                className={rp.isPreview ? undefined : "cursor-pointer"}
              >
                <title>
                  {`${rp.room.name}: ${rp.room.lengthMeters}×${rp.room.widthMeters}×${rp.room.heightMeters} m` +
                    (ev
                      ? ` · Vol ${ev.realVolumeM3.toFixed(1)} m³ / Mín ${ev.requiredVolumeM3.toFixed(1)} m³ (${ev.volumeCompliant ? "Cumple" : "NO CUMPLE"})`
                      : rp.isPreview
                        ? ` · Vista previa ${(rp.room.lengthMeters * rp.room.widthMeters * rp.room.heightMeters).toFixed(1)} m³`
                        : "")}
                </title>
                <rect
                  x={rx}
                  y={ry}
                  width={rp.widthPx}
                  height={rp.heightPx}
                  rx={4}
                  fill={fillColor}
                  fillOpacity={rp.isPreview ? 0.35 : isInsufficient ? 0.55 : 0.42}
                  stroke={strokeColor}
                  strokeWidth={
                    rp.isPreview
                      ? 2
                      : isSelectedRoom
                        ? 2.5
                        : isInsufficient
                          ? 2.2
                          : 1.4
                  }
                  strokeDasharray={rp.isPreview ? "5 3" : undefined}
                  className={
                    rp.isPreview
                      ? "animate-segment-green"
                      : isInsufficient
                        ? "animate-recinto-error"
                        : undefined
                  }
                />
                {isSelectedRoom && (
                  <rect
                    x={rx - 3}
                    y={ry - 3}
                    width={rp.widthPx + 6}
                    height={rp.heightPx + 6}
                    rx={6}
                    fill="none"
                    stroke="var(--accent-primary)"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    pointerEvents="none"
                  />
                )}
                {/* Medidas del recinto (Largo arriba, Ancho izquierda) */}
                <text
                  x={rx + rp.widthPx / 2}
                  y={ry - 6}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={700}
                  fill={
                    rp.isPreview
                      ? "var(--status-ok-text)"
                      : isInsufficient
                        ? "var(--status-error-text)"
                        : "var(--accent-copper)"
                  }
                  paintOrder="stroke"
                  stroke="var(--bg-surface)"
                  strokeWidth={3}
                >
                  {rp.room.lengthMeters} m
                </text>
                <text
                  x={rx - 5}
                  y={ry + rp.heightPx / 2}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fontSize={10}
                  fontWeight={700}
                  fill={
                    rp.isPreview
                      ? "var(--status-ok-text)"
                      : isInsufficient
                        ? "var(--status-error-text)"
                        : "var(--accent-copper)"
                  }
                  paintOrder="stroke"
                  stroke="var(--bg-surface)"
                  strokeWidth={3}
                >
                  {rp.room.widthMeters} m
                </text>
                {/* Nombre y estado del volumen dentro del cuadrado */}
                <text
                  x={rx + 5}
                  y={ry + 11}
                  fontSize={8.5}
                  fontWeight={700}
                  fill={labelColor}
                  paintOrder="stroke"
                  stroke="var(--bg-surface)"
                  strokeWidth={2}
                >
                  {rp.room.name}
                </text>
                {rp.isPreview && (
                  <text
                    x={rx + rp.widthPx / 2}
                    y={ry + rp.heightPx - 6}
                    textAnchor="middle"
                    fontSize={8.2}
                    fontWeight={700}
                    fill="var(--status-ok-text)"
                    paintOrder="stroke"
                    stroke="var(--bg-surface)"
                    strokeWidth={2}
                  >
                    {`Vista previa ${(rp.room.lengthMeters * rp.room.widthMeters * rp.room.heightMeters).toFixed(1)} m³`}
                  </text>
                )}
                {ev && hasLoad && (
                  <text
                    x={rx + rp.widthPx / 2}
                    y={ry + rp.heightPx - 6}
                    textAnchor="middle"
                    fontSize={8.2}
                    fontWeight={700}
                    fill={labelColor}
                    className={isInsufficient ? "animate-badge-error" : undefined}
                    paintOrder="stroke"
                    stroke="var(--bg-surface)"
                    strokeWidth={2}
                  >
                    {isInsufficient
                      ? `⚠ ${ev.realVolumeM3.toFixed(1)} < ${ev.requiredVolumeM3.toFixed(1)} m³`
                      : `${ev.realVolumeM3.toFixed(1)}/${ev.requiredVolumeM3.toFixed(1)} m³ OK`}
                  </text>
                )}
              </g>
            );
          })}

          {/* Tramos cardinales y diagonales */}
          {activeSegments.map((seg) => {
            const segSpans = layout.spans.filter((sp) => sp.segmentId === seg.id);
            if (segSpans.length === 0) return null;

            const segCalc = calculation.segments[seg.id];
            const isPreviewSeg = previewSegmentId === seg.id;
            const hasPreviewConflict = Boolean(
              isPreviewSeg && previewConflictMessage
            );
            const isSelected = selectedSegmentId === seg.id;
            const isBlocking = blockingSegmentId === seg.id;
            const pipeSpec = COPPER_PIPE_BY_NOMINAL[seg.nominalDiameter];

            let strokeColor = "var(--text-secondary)";
            if (hasPreviewConflict) {
              strokeColor = "var(--status-error-text)";
            } else if (isPreviewSeg) {
              strokeColor = "var(--status-ok-text)";
            } else if (isBlocking) {
              strokeColor = "var(--status-error-text)";
            } else if (segCalc?.hasEnoughData) {
              strokeColor = segCalc.subtreeCompliant
                ? "var(--status-ok-text)"
                : "var(--status-error-text)";
            }

            const pointsAttr = [
              toSvg(segSpans[0]!.x1, segSpans[0]!.y1),
              ...segSpans.map((sp) => toSvg(sp.x2, sp.y2)),
            ]
              .map((p) => `${p.x},${p.y}`)
              .join(" ");

            const totalMeters = Number(
              segSpans.reduce((a, b) => a + b.lengthMeters, 0).toFixed(2)
            );
            const lastSpan = segSpans[segSpans.length - 1]!;
            const endSvg = toSvg(lastSpan.x2, lastSpan.y2);

            return (
              <g
                key={seg.id}
                onClick={(e) => {
                  e.stopPropagation();
                  if (isPreviewSeg || suppressNextClickRef.current) return;
                  onSelectSegment(seg.id);
                  onSelectPoint(null);
                }}
                className={isPreviewSeg ? undefined : "cursor-pointer"}
              >
                <title>{`${seg.id}: ${totalMeters} m · ${pipeSpec.label}`}</title>
                {/* Halo táctil transparente para seleccionar fácil en celular */}
                <polyline
                  points={pointsAttr}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={18}
                  strokeLinejoin="round"
                />
                {isSelected && !isPreviewSeg && (
                  <polyline
                    points={pointsAttr}
                    fill="none"
                    stroke="var(--accent-primary)"
                    strokeWidth={pipeSpec.diagramStrokePx + 5}
                    strokeOpacity={0.25}
                    strokeLinejoin="round"
                  />
                )}
                <polyline
                  points={pointsAttr}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={
                    isPreviewSeg
                      ? Math.max(3.5, pipeSpec.diagramStrokePx + 1.5)
                      : pipeSpec.diagramStrokePx
                  }
                  strokeDasharray={hasPreviewConflict ? "6 4" : undefined}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={
                    isPreviewSeg
                      ? hasPreviewConflict
                        ? "animate-recinto-error"
                        : "animate-segment-green"
                      : undefined
                  }
                />

                {/* Etiqueta de tramo y largo real + diámetro */}
                {segSpans.map((sp, idx) => {
                  const s1 = toSvg(sp.x1, sp.y1);
                  const s2 = toSvg(sp.x2, sp.y2);
                  const sx = (s1.x + s2.x) / 2;
                  const sy = (s1.y + s2.y) / 2;
                  const sdx = s2.x - s1.x;
                  const sdy = s2.y - s1.y;
                  const slen = Math.hypot(sdx, sdy) || 1;
                  let nx = -sdy / slen;
                  let ny = sdx / slen;
                  if (ny > 0.25 || (Math.abs(ny) <= 0.25 && nx < 0)) {
                    nx = -nx;
                    ny = -ny;
                  }
                  const lx = sx + nx * 11;
                  const ly = sy + ny * 11;
                  const anchor =
                    Math.abs(nx) < 0.35
                      ? "middle"
                      : nx > 0
                        ? "start"
                        : "end";
                  const spanMeters = Number(sp.lengthMeters.toFixed(2));
                  const labelText =
                    segSpans.length > 1
                      ? `${seg.id} · ${spanMeters} m`
                      : `${seg.id} · ${totalMeters} m · ${pipeSpec.label}`;
                  return (
                    <text
                      key={`${seg.id}-lbl-${idx}`}
                      x={lx}
                      y={ly}
                      textAnchor={anchor}
                      dominantBaseline="middle"
                      fontSize={10}
                      fontWeight={isSelected || isPreviewSeg ? 700 : 600}
                      fill={
                        hasPreviewConflict
                          ? "var(--status-error-text)"
                          : isPreviewSeg
                            ? "var(--status-ok-text)"
                            : isSelected
                              ? "var(--accent-link)"
                              : "var(--text-primary)"
                      }
                      paintOrder="stroke"
                      stroke="var(--bg-surface)"
                      strokeWidth={2.5}
                    >
                      {labelText}
                    </text>
                  );
                })}

                {/* Asa de estiramiento cuando el tramo está seleccionado (Sección 9.5) */}
                {isSelected && !isPreviewSeg && !nodeDrag?.active && (
                  <circle
                    cx={endSvg.x}
                    cy={endSvg.y}
                    r={9}
                    fill="var(--accent-primary)"
                    fillOpacity={0.22}
                    stroke="var(--accent-primary)"
                    strokeWidth={2}
                    className="cursor-move"
                    onPointerDown={(e) =>
                      startNodePointerDown(e, seg.toPointId, true)
                    }
                  />
                )}
              </g>
            );
          })}

          {/* Puntos (S, A, B...) y Artefactos */}
          {Object.values(layout.points).map((pt) => {
            const pos = toSvg(pt.xMeters, pt.yMeters);
            const ptApps = appliancesByPoint.get(pt.id) ?? [];
            const isSelectedPt = selectedPointId === pt.id;
            const hasAppliance = ptApps.length > 0;
            const isBeingDraggedPt = Boolean(
              nodeDrag?.active && nodeDrag.pointId === pt.id
            );
            const isPreviewTargetPt =
              Boolean(quickAddDraft && quickAddDraft.toPointId === pt.id) ||
              Boolean(
                nodeDrag?.active &&
                  nodeDrag.mode === "new-from-regulator" &&
                  pt.id === getNextPointLabel(segments)
              );

            if (pt.isRegulator) {
              return (
                <g
                  key={pt.id}
                  data-node-id={pt.id}
                  onPointerDown={(e) => startNodePointerDown(e, pt.id)}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (suppressNextClickRef.current) return;
                    onSelectPoint(pt.id);
                    onSelectSegment(null);
                  }}
                  className={
                    segments.length === 0
                      ? "cursor-grab active:cursor-grabbing"
                      : "cursor-pointer"
                  }
                >
                  <title>
                    {segments.length === 0
                      ? "Presiona para abrir puertos (+) o mantén presionado y arrastra para crear el primer tramo en saltos de 10 cm"
                      : "Regulador (0) · Presiona para abrir puertos (+)"}
                  </title>
                  {isBeingDraggedPt && (
                    <circle
                      cx={pos.x}
                      cy={pos.y}
                      r={17}
                      fill="none"
                      stroke="var(--status-ok-text)"
                      strokeWidth={2.5}
                      className="animate-segment-green"
                    />
                  )}
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={12}
                    fill={
                      isBeingDraggedPt
                        ? "var(--status-ok-text)"
                        : "var(--accent-primary)"
                    }
                    stroke="var(--bg-surface)"
                    strokeWidth={2}
                  />
                  <text
                    x={pos.x}
                    y={pos.y + 1}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={11}
                    fontWeight={700}
                    fill="var(--accent-primary-text)"
                  >
                    S
                  </text>
                  <text
                    x={pos.x}
                    y={pos.y + 22}
                    textAnchor="middle"
                    fontSize={9}
                    fontWeight={600}
                    fill="var(--text-secondary)"
                  >
                    Regulador (0)
                  </text>
                </g>
              );
            }

            if (hasAppliance) {
              const firstApp = ptApps[0]!;
              const appCalc = calculation.appliances[firstApp.id];
              const offset = closeApplianceOffsets.get(pt.id) ?? {
                dx: 16,
                dy: 0,
              };
              const boxX = pos.x + offset.dx;
              const boxY = pos.y + offset.dy;
              const appOk = ptApps.every(
                (a) => calculation.appliances[a.id]?.compliant
              );
              const totalMcal = ptApps.reduce(
                (s, a) => s + a.powerMcalPerHour * a.quantity,
                0
              );

              const deliveryPressurePa = appCalc?.deliveryPressurePa ?? null;
              const hasDeliveryPressure = deliveryPressurePa !== null;
              const statusFill = !hasDeliveryPressure
                ? "var(--status-warn-bg)"
                : appOk
                  ? "var(--status-ok-bg)"
                  : "var(--status-error-bg)";
              const statusStroke = !hasDeliveryPressure
                ? "var(--status-warn-border)"
                : appOk
                  ? "var(--status-ok-border)"
                  : "var(--status-error-border)";
              const statusText = !hasDeliveryPressure
                ? "var(--status-warn-text)"
                : appOk
                  ? "var(--status-ok-text)"
                  : "var(--status-error-text)";

              const hasRoomAssigned = ptApps.some(
                (a) => a.roomId && rooms.some((r) => r.id === a.roomId)
              );
              const isEditingThisPoint = Boolean(
                editingAppliance &&
                  ptApps.some((a) => a.id === editingAppliance.id)
              );
              const shortLabels = ptApps.map((a) => {
                if (!a.id.startsWith("app-") && a.id.length <= 6) {
                  return a.id;
                }
                const clean = (a.name || "Artefacto")
                  .replace(/\s*\([^)]*Mcal\/h\)\s*$/i, "")
                  .trim();
                return clean.length > 16 ? `${clean.slice(0, 15)}…` : clean;
              });
              const cardTitle = `${shortLabels.join(" + ")} · ${totalMcal} Mcal/h`;
              const cardWidth = Math.max(
                126,
                Math.min(188, Math.ceil(cardTitle.length * 5.6 + 18))
              );

              return (
                <g
                  key={pt.id}
                  data-node-id={pt.id}
                  onPointerDown={(e) => startNodePointerDown(e, pt.id)}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (suppressNextClickRef.current) return;
                    setEditingApplianceId(firstApp.id);
                    onSelectSegment(firstApp.segmentId);
                    onSelectPoint(pt.id);
                  }}
                  className={
                    isBeingDraggedPt ? "cursor-grabbing" : "cursor-pointer"
                  }
                >
                  <title>
                    {`${ptApps.map((a) => a.name).join(", ")} · Presiona para editar tamaño de recinto · Mantén presionado para mover en saltos de 10 cm`}
                  </title>
                  <line
                    x1={pos.x}
                    y1={pos.y}
                    x2={boxX}
                    y2={boxY}
                    stroke="var(--border-control)"
                    strokeWidth={1}
                  />
                  {isBeingDraggedPt && (
                    <circle
                      cx={pos.x}
                      cy={pos.y}
                      r={13}
                      fill="none"
                      stroke="var(--status-ok-text)"
                      strokeWidth={2.5}
                      className="animate-segment-green"
                    />
                  )}
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={isBeingDraggedPt ? 8 : isEditingThisPoint ? 6.5 : 5}
                    fill={
                      isBeingDraggedPt ? "var(--status-ok-text)" : statusFill
                    }
                    stroke={
                      isBeingDraggedPt
                        ? "var(--bg-surface)"
                        : isEditingThisPoint
                          ? "var(--accent-primary)"
                          : statusText
                    }
                    strokeWidth={isBeingDraggedPt ? 2.2 : 2}
                  />
                  <g transform={`translate(${boxX}, ${boxY - 16})`}>
                    <rect
                      x={0}
                      y={0}
                      width={cardWidth}
                      height={32}
                      rx={5}
                      fill="var(--bg-surface)"
                      stroke={
                        isEditingThisPoint
                          ? "var(--accent-primary)"
                          : "var(--border-base)"
                      }
                      strokeWidth={isEditingThisPoint ? 1.8 : 1}
                    />
                    <rect
                      x={0}
                      y={0}
                      width={4}
                      height={32}
                      rx={2}
                      fill={statusText}
                    />
                    <text
                      x={8}
                      y={11}
                      fontSize={9.5}
                      fontWeight={700}
                      fill="var(--text-primary)"
                    >
                      {cardTitle}
                    </text>
                    <rect
                      x={7}
                      y={15}
                      width={cardWidth - 13}
                      height={13}
                      rx={3.5}
                      fill={statusFill}
                      stroke={statusStroke}
                      strokeWidth={0.8}
                    />
                    <text
                      x={11}
                      y={24.5}
                      fontSize={8.5}
                      fontWeight={600}
                      fill={statusText}
                    >
                      {hasDeliveryPressure
                        ? `P=${deliveryPressurePa} Pa (${appOk ? "OK" : "Excede"})`
                        : "Sin cálculo"}
                    </text>
                    {!hasRoomAssigned && (
                      <g transform="translate(0, 34)">
                        <rect
                          x={0}
                          y={0}
                          width={58}
                          height={13}
                          rx={3.5}
                          fill="var(--bg-control)"
                          stroke="var(--border-control)"
                          strokeWidth={0.8}
                        />
                        <text
                          x={29}
                          y={9}
                          textAnchor="middle"
                          fontSize={7.8}
                          fontWeight={600}
                          fill="var(--accent-link)"
                        >
                          + Recinto
                        </text>
                      </g>
                    )}
                  </g>
                </g>
              );
            }

            return (
              <g
                key={pt.id}
                data-node-id={pt.id}
                onPointerDown={(e) => {
                  if (isPreviewTargetPt) return;
                  startNodePointerDown(e, pt.id);
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (isPreviewTargetPt || suppressNextClickRef.current) return;
                  onSelectPoint(pt.id);
                  onSelectSegment(null);
                }}
                className={
                  isPreviewTargetPt
                    ? undefined
                    : isBeingDraggedPt
                      ? "cursor-grabbing"
                      : "cursor-grab active:cursor-grabbing"
                }
              >
                <title>
                  {isPreviewTargetPt
                    ? `Nuevo punto destino ${pt.label} (vista previa)`
                    : `Nodo ${pt.label} · Toca para puertos (+) o mantén presionado y arrastra en saltos de 10 cm`}
                </title>
                {(isBeingDraggedPt || isPreviewTargetPt) && (
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={13}
                    fill="none"
                    stroke="var(--status-ok-text)"
                    strokeWidth={2.5}
                    className="animate-segment-green"
                  />
                )}
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={
                    isPreviewTargetPt || isBeingDraggedPt
                      ? 8
                      : isSelectedPt
                        ? 7
                        : 5
                  }
                  fill={
                    isPreviewTargetPt || isBeingDraggedPt
                      ? "var(--status-ok-text)"
                      : isSelectedPt
                        ? "var(--accent-primary)"
                        : "var(--text-primary)"
                  }
                  stroke="var(--bg-surface)"
                  strokeWidth={isPreviewTargetPt || isBeingDraggedPt ? 2.2 : 1.5}
                />
                <text
                  x={pos.x}
                  y={pos.y - 14}
                  textAnchor="middle"
                  fontSize={10.5}
                  fontWeight={700}
                  fill={
                    isPreviewTargetPt || isBeingDraggedPt
                      ? "var(--status-ok-text)"
                      : "var(--text-primary)"
                  }
                  paintOrder="stroke"
                  stroke="var(--bg-surface)"
                  strokeWidth={3}
                >
                  {pt.label}
                </text>
              </g>
            );
          })}

          {/* Botones "+" en las 8 direcciones libres (cardinales y diagonales) del punto seleccionado */}
          {!nodeDrag?.active &&
            selectedPointId &&
            layout.points[selectedPointId] &&
            selectedPointDirections &&
            selectedPointDirections.options.map((opt) => {
              const pt = layout.points[selectedPointId]!;
              const pos = toSvg(pt.xMeters, pt.yMeters);
              const vec = directionVector(opt.direction);
              const ringRadius = 33;
              const bx = pos.x + vec.dx * ringRadius;
              const by = pos.y - vec.dy * ringRadius;

              if (!opt.available) {
                return (
                  <g key={`port-${opt.direction}`} opacity={0.75}>
                    <title>{opt.reason ?? "Dirección no disponible"}</title>
                    <circle
                      cx={bx}
                      cy={by}
                      r={7.5}
                      fill="var(--bg-secondary)"
                      stroke="var(--border-control)"
                      strokeDasharray="2 2"
                    />
                    <text
                      x={bx}
                      y={by + 1}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={9.5}
                      fill="var(--text-muted)"
                    >
                      ×
                    </text>
                  </g>
                );
              }

              const isPortActive = Boolean(
                quickAddDraft &&
                  quickAddDraft.fromPointId === selectedPointId &&
                  quickAddDraft.direction === opt.direction
              );

              return (
                <g
                  key={`port-${opt.direction}`}
                  data-port-dir={opt.direction}
                  onClick={(e) => {
                    e.stopPropagation();
                    setLocalHint(null);
                    setEditingApplianceId(null);
                    setQuickAddDraft(
                      createInitialQuickAddDraft({
                        fromPointId: selectedPointId,
                        toPointId: getNextPointLabel(segments),
                        direction: opt.direction,
                        totalCm: opt.suggestedLengthCm,
                      })
                    );
                  }}
                  className="cursor-pointer"
                >
                  <title>
                    {opt.maxLengthCm
                      ? `Agregar tramo hacia ${opt.label} (hasta ${(opt.maxLengthCm / 100).toFixed(2)} m libre antes de otro tramo)`
                      : `Agregar tramo hacia ${opt.label} (solicita medida, diámetro y recinto)`}
                  </title>
                  <circle
                    cx={bx}
                    cy={by}
                    r={isPortActive ? 10 : 8.5}
                    fill={
                      isPortActive
                        ? "var(--status-ok-text)"
                        : "var(--accent-primary)"
                    }
                    stroke="var(--bg-surface)"
                    strokeWidth={1.5}
                    className={isPortActive ? "animate-segment-green" : undefined}
                  />
                  <text
                    x={bx}
                    y={by + 0.5}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={12}
                    fontWeight={700}
                    fill="var(--accent-primary-text)"
                  >
                    +
                  </text>
                </g>
              );
            })}
          {/* Etiqueta verde directamente arriba del nodo activo sumando/mostrando distancia en saltos de 10 cm */}
          {previewInfo &&
            (() => {
              const targetPt = layout.points[previewInfo.previewTargetPointId];
              if (!targetPt) return null;
              const targetPos = toSvg(targetPt.xMeters, targetPt.yMeters);
              const totalM = (previewInfo.previewNewLengthCm / 100).toFixed(2);
              const deltaM = (
                Math.abs(previewInfo.previewDeltaCm) / 100
              ).toFixed(2);
              let badgeText = "";
              if (previewConflictMessage) {
                badgeText = `⚠ ${previewConflictMessage}`;
              } else if (previewInfo.isNewSegmentPreview) {
                badgeText = `+${totalM} m · ${directionLabelEs(previewInfo.previewDirection)}`;
              } else if (previewInfo.previewDeltaCm === 0) {
                badgeText = `${totalM} m · Arrastra (±10 cm)`;
              } else {
                const sign = previewInfo.previewDeltaCm > 0 ? "+" : "-";
                badgeText = `${sign}${deltaM} m · Largo ${totalM} m`;
              }
              const badgeW = Math.max(132, badgeText.length * 6.4 + 18);
              return (
                <g
                  data-testid="node-distance-badge"
                  transform={`translate(${targetPos.x}, ${targetPos.y - 44})`}
                  pointerEvents="none"
                >
                  <rect
                    x={-badgeW / 2}
                    y={0}
                    width={badgeW}
                    height={22}
                    rx={6}
                    fill={
                      previewConflictMessage
                        ? "var(--status-error-bg)"
                        : "var(--status-ok-bg)"
                    }
                    stroke={
                      previewConflictMessage
                        ? "var(--status-error-text)"
                        : "var(--status-ok-text)"
                    }
                    strokeWidth={1.6}
                    className={
                      previewConflictMessage
                        ? "animate-recinto-error"
                        : "animate-segment-green"
                    }
                  />
                  <polygon
                    points="-5,22 5,22 0,28"
                    fill={
                      previewConflictMessage
                        ? "var(--status-error-text)"
                        : "var(--status-ok-text)"
                    }
                  />
                  <text
                    x={0}
                    y={14.5}
                    textAnchor="middle"
                    fontSize={10}
                    fontWeight={800}
                    fill={
                      previewConflictMessage
                        ? "var(--status-error-text)"
                        : "var(--status-ok-text)"
                    }
                  >
                    {badgeText}
                  </text>
                </g>
              );
            })()}
        </svg>

        {segments.length === 0 && !quickAddDraft && !nodeDrag?.active && (
          <div className="no-print absolute inset-x-4 top-4 rounded-lg border border-pizarra-border bg-pizarra-surface/95 px-3 py-2 text-xs shadow-sm">
            <span className="text-pizarra-subtext">
              Sin tramos cargados. Toca el regulador <strong>S</strong> para
              elegir un puerto <strong>+</strong>, mantén presionado{" "}
              <strong>S</strong> y arrastra en saltos de 10 cm, o usa{" "}
              <strong>+ Agregar tramo</strong>.
            </span>
          </div>
        )}

        {localHint && !nodeDrag?.active && (
          <div className="no-print absolute inset-x-4 top-3 flex items-center justify-between gap-2 rounded-lg border border-pizarra-border bg-pizarra-surface/95 px-3 py-2 text-xs text-pizarra-text shadow-sm">
            <span>{localHint}</span>
            <button
              type="button"
              onClick={() => setLocalHint(null)}
              className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-pizarra-subtext hover:bg-pizarra-control-hover"
            >
              Cerrar
            </button>
          </div>
        )}

        {/* Barra de escala visible de 5 m (Sección 9.3) */}
        <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg border border-pizarra-border bg-pizarra-surface/95 px-2.5 py-1.5 shadow-sm">
          <div className="flex items-center gap-2">
            <div
              className="h-1.5 border-x-2 border-b-2 border-pizarra-text"
              style={{ width: `${Math.max(24, Math.min(140, 5 * 4 * zoom))}px` }}
            />
            <span className="text-[11px] font-semibold text-pizarra-text tabular-nums">
              Escala: 5 m · Zoom {Math.round(zoom * 100)}%
            </span>
          </div>
        </div>
      </div>

      {quickAddDraft && (
        <QuickAddSegmentBar
          draft={quickAddDraft}
          conflictMessage={previewConflictMessage}
          onChange={setQuickAddDraft}
          onCancel={() => setQuickAddDraft(null)}
          onConfirm={() => {
            const totalCm = Math.max(
              10,
              Math.round(
                (quickAddDraft.lengthMeters * 100 +
                  quickAddDraft.lengthCmExtra) /
                  10
              ) * 10
            );
            const catalogSpec = APPLIANCE_CATALOG_TABLA_V.find(
              (c) => c.id === quickAddDraft.catalogId
            );
            onQuickAddFromPoint({
              fromPointId: quickAddDraft.fromPointId,
              direction: quickAddDraft.direction,
              lengthCm: totalCm,
              nominalDiameter: quickAddDraft.nominalDiameter,
              appliance: quickAddDraft.includeAppliance
                ? {
                    catalogId: quickAddDraft.catalogId,
                    name: quickAddDraft.applianceName.trim() || "Artefacto",
                    applianceClass: catalogSpec?.applianceClass ?? "otro",
                    circuitType: catalogSpec?.defaultCircuitType ?? "A",
                    powerMcalPerHour: Math.max(
                      0.5,
                      quickAddDraft.powerMcalPerHour || 8
                    ),
                    roomLengthMeters: Math.max(
                      0.5,
                      quickAddDraft.roomLengthMeters || 3.5
                    ),
                    roomWidthMeters: Math.max(
                      0.5,
                      quickAddDraft.roomWidthMeters || 3.0
                    ),
                    roomHeightMeters: Math.max(
                      1,
                      quickAddDraft.roomHeightMeters || 2.4
                    ),
                  }
                : undefined,
            });
            setQuickAddDraft(null);
          }}
        />
      )}

      {editingAppliance && (
        <div className="no-print">
          <RoomQuickEditor
            gasType={gasType}
            appliance={editingAppliance}
            rooms={rooms}
            roomEvaluations={roomEvaluations}
            onUpdateAppliance={onUpdateAppliance}
            onDeleteAppliance={onDeleteAppliance}
            onUpdateRoom={onUpdateRoom}
            onCreateAndAssignRoom={onCreateAndAssignRoom}
            onAssignApplianceRoom={onAssignApplianceRoom}
            onClose={() => setEditingApplianceId(null)}
          />
        </div>
      )}

      <div className="no-print border-t border-pizarra-border bg-pizarra-secondary px-3 py-1.5 text-[11px] text-pizarra-subtext">
        Toca un punto y su puerto (+) para ingresar medida, diámetro y recinto antes de generar · Mantén presionado cualquier nodo para moverlo manualmente en saltos de 10 cm (parpadea en verde mostrando el nuevo tamaño) · Rueda del ratón para hacer zoom.
      </div>
    </div>
  );
}
