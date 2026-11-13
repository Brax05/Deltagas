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
import { COPPER_PIPE_BY_NOMINAL } from "@/domain/ds66/pipes";
import type { NetworkCalculationResult } from "@/domain/calculations/network";
import type { RoomEvaluation } from "@/domain/calculations/rooms";
import {
  directionVector,
  evaluateDirectionsFromPoint,
  type DiagramValidationResult,
} from "@/domain/diagram";
import type {
  Appliance,
  Direction,
  GasConfigId,
  Point,
  Room,
  Segment,
} from "@/domain/types";
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
  onLoadExamExample?: () => void;
  onSelectSegment: (segmentId: string | null) => void;
  onSelectPoint: (pointId: string | null) => void;
  onQuickAddFromPoint: (fromPointId: string, direction: Direction) => void;
  onAdjustSegmentLengthCm: (segmentId: string, deltaCm: number) => void;
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
  onLoadExamExample,
  onSelectSegment,
  onSelectPoint,
  onQuickAddFromPoint,
  onAdjustSegmentLengthCm,
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

  const [editingApplianceId, setEditingApplianceId] = useState<string | null>(
    null
  );

  useEffect(() => {
    if (viewResetKey === undefined) return;
    setViewTransform({ zoom: 1, pan: { x: 0, y: 0 } });
    setEditingApplianceId(null);
  }, [viewResetKey]);
  const [panning, setPanning] = useState<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const [dragState, setDragState] = useState<{
    segmentId: string;
    direction: Direction;
    startClientX: number;
    startClientY: number;
    lastAppliedSteps: number;
  } | null>(null);

  const { layout } = validation;

  // Ubicación y dimensiones visuales de recintos asociados a artefactos
  const roomPlacements = useMemo(() => {
    const segById = new Map(segments.map((s) => [s.id, s]));
    const roomsById = new Map(rooms.map((r) => [r.id, r]));
    const evalByRoomId = new Map(roomEvaluations.map((e) => [e.roomId, e]));
    const byRoom = new Map<
      string,
      { room: Room; pts: Point[]; primaryApp: Appliance }
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

    return Array.from(byRoom.values()).map(({ room, pts, primaryApp }) => {
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
        cxM,
        cyM,
        widthPx,
        heightPx,
        minXM: cxM - halfWM,
        maxXM: cxM + halfWM,
        minYM: cyM - halfHM,
        maxYM: cyM + halfHM,
      };
    });
  }, [appliances, segments, rooms, roomEvaluations, layout.points]);

  // Mapear coordenadas reales (m) -> coordenadas SVG (y invertido)
  const worldBox = useMemo(() => {
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
    const segById = new Map(segments.map((s) => [s.id, s]));
    for (const app of appliances) {
      const seg = segById.get(app.segmentId);
      if (!seg) continue;
      const list = map.get(seg.toPointId) ?? [];
      list.push(app);
      map.set(seg.toPointId, list);
    }
    return map;
  }, [appliances, segments]);

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

  const handleSvgPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.target === svgRef.current) {
      onSelectSegment(null);
      onSelectPoint(null);
      setEditingApplianceId(null);
      setPanning({
        startX: e.clientX,
        startY: e.clientY,
        origX: pan.x,
        origY: pan.y,
      });
    }
  };

  const handleSvgPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (dragState) {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const scaleScreenToWorld = (worldBox.w / zoom) / rect.width;
      const dxMeters =
        ((e.clientX - dragState.startClientX) * scaleScreenToWorld) /
        PX_PER_METER;
      const dyMeters =
        (-(e.clientY - dragState.startClientY) * scaleScreenToWorld) /
        PX_PER_METER;

      const vec = directionVector(dragState.direction);
      const projectedMeters = dxMeters * vec.dx + dyMeters * vec.dy;

      // Estirar de a 10 cm (Sección 9.5)
      const totalSteps = Math.round(projectedMeters / 0.1);
      const deltaSteps = totalSteps - dragState.lastAppliedSteps;
      if (deltaSteps !== 0) {
        onAdjustSegmentLengthCm(dragState.segmentId, deltaSteps * 10);
        setDragState({ ...dragState, lastAppliedSteps: totalSteps });
      }
      return;
    }

    if (panning) {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const scale = (worldBox.w / zoom) / rect.width;
      setPan({
        x: panning.origX + (e.clientX - panning.startX) * scale,
        y: panning.origY + (e.clientY - panning.startY) * scale,
      });
    }
  };

  const handleSvgPointerUp = () => {
    setPanning(null);
    setDragState(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!selectedSegmentId) return;
    const seg = segments.find((s) => s.id === selectedSegmentId);
    const lastDir = seg?.parts[seg.parts.length - 1]?.direction;
    if (!lastDir) return;

    const vec = directionVector(lastDir);
    const stepCm = e.shiftKey ? 10 : 1;
    let delta = 0;
    if (e.key === "ArrowRight") delta = Math.sign(vec.dx) * stepCm;
    if (e.key === "ArrowLeft") delta = -Math.sign(vec.dx) * stepCm;
    if (e.key === "ArrowUp") delta = Math.sign(vec.dy) * stepCm;
    if (e.key === "ArrowDown") delta = -Math.sign(vec.dy) * stepCm;

    if (delta !== 0) {
      e.preventDefault();
      onAdjustSegmentLengthCm(selectedSegmentId, delta);
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
              editingAppliance && editingAppliance.roomId === rp.room.id
            );
            const hasLoad = Boolean(ev && ev.totalPowerKw > 0);
            const fillColor = isInsufficient
              ? "var(--status-error-bg)"
              : hasLoad
                ? "var(--status-ok-bg)"
                : "var(--bg-secondary)";
            const strokeColor = isSelectedRoom
              ? "var(--accent-primary)"
              : isInsufficient
                ? "var(--status-error-text)"
                : hasLoad
                  ? "var(--status-ok-border)"
                  : "var(--border-control)";
            const labelColor = isInsufficient
              ? "var(--status-error-text)"
              : hasLoad
                ? "var(--status-ok-text)"
                : "var(--text-secondary)";

            return (
              <g
                key={`room-box-${rp.room.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingApplianceId(rp.primaryApp.id);
                  onSelectSegment(rp.primaryApp.segmentId);
                  onSelectPoint(null);
                }}
                className="cursor-pointer"
              >
                <title>
                  {`${rp.room.name}: ${rp.room.lengthMeters}×${rp.room.widthMeters}×${rp.room.heightMeters} m` +
                    (ev
                      ? ` · Vol ${ev.realVolumeM3.toFixed(1)} m³ / Mín ${ev.requiredVolumeM3.toFixed(1)} m³ (${ev.volumeCompliant ? "Cumple" : "NO CUMPLE"})`
                      : "")}
                </title>
                <rect
                  x={rx}
                  y={ry}
                  width={rp.widthPx}
                  height={rp.heightPx}
                  rx={4}
                  fill={fillColor}
                  fillOpacity={isInsufficient ? 0.55 : 0.42}
                  stroke={strokeColor}
                  strokeWidth={isSelectedRoom ? 2.5 : isInsufficient ? 2.2 : 1.4}
                  className={isInsufficient ? "animate-recinto-error" : undefined}
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
                  fill={isInsufficient ? "var(--status-error-text)" : "var(--accent-copper)"}
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
                  fill={isInsufficient ? "var(--status-error-text)" : "var(--accent-copper)"}
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
          {segments.map((seg) => {
            const segSpans = layout.spans.filter((sp) => sp.segmentId === seg.id);
            if (segSpans.length === 0) return null;

            const segCalc = calculation.segments[seg.id];
            const isSelected = selectedSegmentId === seg.id;
            const isBlocking = blockingSegmentId === seg.id;
            const pipeSpec = COPPER_PIPE_BY_NOMINAL[seg.nominalDiameter];

            let strokeColor = "var(--text-secondary)";
            if (isBlocking) {
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

            const totalMeters = segSpans.reduce((a, b) => a + b.lengthMeters, 0);
            const lastSpan = segSpans[segSpans.length - 1]!;
            const endSvg = toSvg(lastSpan.x2, lastSpan.y2);

            return (
              <g
                key={seg.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectSegment(seg.id);
                  onSelectPoint(null);
                }}
                className="cursor-pointer"
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
                {isSelected && (
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
                  strokeWidth={pipeSpec.diagramStrokePx}
                  strokeLinecap="round"
                  strokeLinejoin="round"
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
                  const labelText =
                    segSpans.length > 1
                      ? `${seg.id} · ${sp.lengthMeters} m`
                      : `${seg.id} · ${totalMeters} m · ${pipeSpec.label}`;
                  return (
                    <text
                      key={`${seg.id}-lbl-${idx}`}
                      x={lx}
                      y={ly}
                      textAnchor={anchor}
                      dominantBaseline="middle"
                      fontSize={10}
                      fontWeight={isSelected ? 700 : 600}
                      fill={
                        isSelected ? "var(--accent-link)" : "var(--text-primary)"
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
                {isSelected && (
                  <circle
                    cx={endSvg.x}
                    cy={endSvg.y}
                    r={9}
                    fill="var(--accent-primary)"
                    fillOpacity={0.22}
                    stroke="var(--accent-primary)"
                    strokeWidth={2}
                    className="cursor-move"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setDragState({
                        segmentId: seg.id,
                        direction: lastSpan.direction,
                        startClientX: e.clientX,
                        startClientY: e.clientY,
                        lastAppliedSteps: 0,
                      });
                    }}
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

            if (pt.isRegulator) {
              return (
                <g
                  key={pt.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectPoint(pt.id);
                    onSelectSegment(null);
                  }}
                  className="cursor-pointer"
                >
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={12}
                    fill="var(--accent-primary)"
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

              return (
                <g
                  key={pt.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingApplianceId(firstApp.id);
                    onSelectSegment(firstApp.segmentId);
                    onSelectPoint(pt.id);
                  }}
                  className="cursor-pointer"
                >
                  <title>
                    {`${ptApps.map((a) => a.name).join(", ")} · Presionar para editar tamaño de recinto`}
                  </title>
                  <line
                    x1={pos.x}
                    y1={pos.y}
                    x2={boxX}
                    y2={boxY}
                    stroke="var(--border-control)"
                    strokeWidth={1}
                  />
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={isEditingThisPoint ? 6.5 : 5}
                    fill={statusFill}
                    stroke={
                      isEditingThisPoint ? "var(--accent-primary)" : statusText
                    }
                    strokeWidth={2}
                  />
                  <g transform={`translate(${boxX}, ${boxY - 16})`}>
                    <rect
                      x={0}
                      y={0}
                      width={126}
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
                      {ptApps.map((a) => a.id).join("+")} · {totalMcal} Mcal/h
                    </text>
                    <rect
                      x={7}
                      y={15}
                      width={113}
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
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectPoint(pt.id);
                  onSelectSegment(null);
                }}
                className="cursor-pointer"
              >
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={isSelectedPt ? 7 : 4.5}
                  fill={isSelectedPt ? "var(--accent-primary)" : "var(--text-primary)"}
                  stroke="var(--bg-surface)"
                  strokeWidth={1.5}
                />
                <text
                  x={pos.x}
                  y={pos.y - 12}
                  textAnchor="middle"
                  fontSize={10.5}
                  fontWeight={700}
                  fill="var(--text-primary)"
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
          {selectedPointId &&
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

              return (
                <g
                  key={`port-${opt.direction}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onQuickAddFromPoint(selectedPointId, opt.direction);
                  }}
                  className="cursor-pointer"
                >
                  <title>{`Agregar tramo hacia ${opt.label}`}</title>
                  <circle
                    cx={bx}
                    cy={by}
                    r={8.5}
                    fill="var(--accent-primary)"
                    stroke="var(--bg-surface)"
                    strokeWidth={1.5}
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
        </svg>

        {segments.length === 0 && (
          <div className="no-print absolute inset-x-4 top-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-pizarra-border bg-pizarra-surface/95 px-3 py-2 text-xs shadow-sm">
            <span className="text-pizarra-subtext">
              Sin tramos cargados. Toca el regulador <strong>S</strong> o usa{" "}
              <strong>+ Agregar tramo</strong>.
            </span>
            {onLoadExamExample && (
              <button
                type="button"
                onClick={onLoadExamExample}
                className="rounded-md bg-pizarra-action px-2.5 py-1 text-xs font-semibold text-pizarra-action-text hover:bg-pizarra-action-hover"
              >
                Cargar ejemplo del examen
              </button>
            )}
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

      {editingAppliance && (
        <div className="no-print">
          <RoomQuickEditor
            gasType={gasType}
            appliance={editingAppliance}
            rooms={rooms}
            roomEvaluations={roomEvaluations}
            onUpdateRoom={onUpdateRoom}
            onCreateAndAssignRoom={onCreateAndAssignRoom}
            onAssignApplianceRoom={onAssignApplianceRoom}
            onClose={() => setEditingApplianceId(null)}
          />
        </div>
      )}

      <div className="no-print border-t border-pizarra-border bg-pizarra-secondary px-3 py-1.5 text-[11px] text-pizarra-subtext">
        Presiona cualquier cuadro de recinto o artefacto para editar alto, largo y ancho (parpadea en rojo si no cumple el mínimo DS 66) · Toca un tramo para ajustar diámetro/largo o quiebres · Rueda del ratón para hacer zoom y arrastra el fondo para mover.
      </div>
    </div>
  );
}
