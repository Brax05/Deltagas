"use client";

import React, { useMemo, useState } from "react";
import {
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  ArrowDownLeft,
  ArrowUpLeft,
  Sparkles,
  CornerDownRight,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { APPLIANCE_CATALOG_TABLA_V } from "@/domain/ds66/appliances";
import { GAS_SPECIFICATIONS } from "@/domain/ds66/gases";
import { COPPER_TYPE_L_PIPES } from "@/domain/ds66/pipes";
import type { NetworkCalculationResult } from "@/domain/calculations/network";
import type { RoomEvaluation } from "@/domain/calculations/rooms";
import {
  ALL_DIRECTIONS,
  evaluateDirectionsFromPoint,
  getNextPointLabel,
  getNextSegmentId,
  getSubtreeImpact,
  directionLabelEs,
} from "@/domain/diagram";
import type {
  Appliance,
  CopperNominalDiameter,
  Direction,
  GasConfigId,
  Room,
  Segment,
} from "@/domain/types";
import { RoomQuickEditor } from "@/components/rooms/RoomQuickEditor";

interface NetworkPanelProps {
  gasType: GasConfigId;
  segments: Segment[];
  appliances: Appliance[];
  rooms: Room[];
  roomEvaluations: RoomEvaluation[];
  calculation: NetworkCalculationResult;
  selectedSegmentId: string | null;
  onChangeGasType: (gasType: GasConfigId) => void;
  onLoadExamExample: () => void;
  onSelectSegment: (segmentId: string | null) => void;
  onAddSegmentWithAppliance: (params: {
    segment: Segment;
    appliance?: Omit<Appliance, "id" | "segmentId"> & { id?: string };
  }) => void;
  onAdjustLengthCm: (segmentId: string, deltaCm: number) => void;
  onSetSingleLengthCm: (segmentId: string, partIndex: number, lengthCm: number) => void;
  onChangeDiameter: (segmentId: string, diameter: CopperNominalDiameter) => void;
  onAddBend: (segmentId: string, direction: Direction, lengthCm: number) => void;
  onAddApplianceToSegment: (
    segmentId: string,
    appliance: Omit<Appliance, "id" | "segmentId">
  ) => void;
  onUpdateRoom: (room: Room) => void;
  onCreateAndAssignRoom: (applianceId: string, room: Room) => void;
  onAssignApplianceRoom: (
    applianceId: string,
    roomId: string | undefined
  ) => void;
  onDeleteSegmentWithSubtree: (segmentId: string) => void;
}

export function NetworkPanel({
  gasType,
  segments,
  appliances,
  rooms,
  roomEvaluations,
  calculation,
  selectedSegmentId,
  onChangeGasType,
  onLoadExamExample,
  onSelectSegment,
  onAddSegmentWithAppliance,
  onAdjustLengthCm,
  onSetSingleLengthCm,
  onChangeDiameter,
  onAddBend,
  onAddApplianceToSegment,
  onUpdateRoom,
  onCreateAndAssignRoom,
  onAssignApplianceRoom,
  onDeleteSegmentWithSubtree,
}: NetworkPanelProps) {
  const [wizardOpen, setWizardOpen] = useState(false);

  // Estado del asistente de una sola tarjeta (Sección 5.3)
  const availableOriginPoints = useMemo(() => {
    const pts = new Set<string>(["S"]);
    for (const s of segments) {
      pts.add(s.fromPointId);
      pts.add(s.toPointId);
    }
    return Array.from(pts);
  }, [segments]);

  const defaultOrigin =
    availableOriginPoints[availableOriginPoints.length - 1] ?? "S";
  const [fromPointId, setFromPointId] = useState<string>(defaultOrigin);
  const [direction, setDirection] = useState<Direction>("right");
  const [lengthMeters, setLengthMeters] = useState<number>(6);
  const [lengthCmExtra, setLengthCmExtra] = useState<number>(0);
  const [diameter, setDiameter] = useState<CopperNominalDiameter>("1/2");
  const [hasAppliance, setHasAppliance] = useState(false);
  const [catalogId, setCatalogId] = useState<string>("custom");
  const [appName, setAppName] = useState("Artefacto");
  const [appPowerMcalH, setAppPowerMcalH] = useState<number>(8);
  const [appQuantity, setAppQuantity] = useState<number>(1);
  const [appRoomId, setAppRoomId] = useState<string>("");

  // Estado para agregar quiebre o artefacto en tramo seleccionado
  const [bendDir, setBendDir] = useState<Direction>("right");
  const [bendLengthM, setBendLengthM] = useState<number>(3);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [editingPanelAppId, setEditingPanelAppId] = useState<string | null>(null);

  const effectiveOrigin = availableOriginPoints.includes(fromPointId)
    ? fromPointId
    : defaultOrigin;

  const dirStatus = useMemo(
    () =>
      evaluateDirectionsFromPoint({
        segments,
        fromPointId: effectiveOrigin,
        candidateLengthCm: Math.max(10, Math.round(lengthMeters * 100 + lengthCmExtra)),
      }),
    [segments, effectiveOrigin, lengthMeters, lengthCmExtra]
  );

  const selectedSegment = segments.find((s) => s.id === selectedSegmentId) ?? null;
  const selectedSegCalc = selectedSegment
    ? calculation.segments[selectedSegment.id]
    : undefined;
  const selectedSegApps = selectedSegment
    ? appliances.filter((a) => a.segmentId === selectedSegment.id)
    : [];

  const handleWizardSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const totalCm = Math.max(10, Math.round(lengthMeters * 100 + lengthCmExtra));
    const chosenOption = dirStatus.options.find((o) => o.direction === direction);
    const finalDir =
      chosenOption?.available
        ? direction
        : dirStatus.recommendedDirection ?? direction;

    const newSegId = getNextSegmentId(segments);
    const newToPoint = getNextPointLabel(segments);

    const seg: Segment = {
      id: newSegId,
      fromPointId: effectiveOrigin,
      toPointId: newToPoint,
      parts: [{ direction: finalDir, lengthCm: totalCm }],
      nominalDiameter: diameter,
    };

    const catItem = APPLIANCE_CATALOG_TABLA_V.find((c) => c.id === catalogId);

    onAddSegmentWithAppliance({
      segment: seg,
      appliance: hasAppliance
        ? {
            name: catItem ? catItem.name : appName,
            catalogId: catItem?.id,
            applianceClass: catItem?.applianceClass ?? "otro",
            circuitType: catItem?.defaultCircuitType ?? "A",
            powerMcalPerHour: catItem ? catItem.powerMcalPerHour : appPowerMcalH,
            quantity: appQuantity,
            roomId: appRoomId || undefined,
          }
        : undefined,
    });

    setWizardOpen(false);
    setFromPointId(newToPoint);
  };

  return (
    <div className="space-y-3">
      {/* Selector de gas y botón caso de examen */}
      <div className="rounded-xl border border-pizarra-border bg-pizarra-surface p-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-[190px] flex-1">
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-pizarra-subtext">
              Tipo de gas y PCS (Tabla VI)
            </label>
            <select
              value={gasType}
              onChange={(e) => onChangeGasType(e.target.value as GasConfigId)}
              className="mt-1 w-full rounded-lg border border-pizarra-border-control bg-pizarra-control px-2.5 py-1.5 text-sm font-medium text-pizarra-text"
            >
              {Object.values(GAS_SPECIFICATIONS).map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label} · {g.pcsMcalPerM3} Mcal/m³ (máx {g.maxPressureDropPa} Pa)
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={onLoadExamExample}
            className="mt-4 rounded-lg border border-pizarra-border-control bg-pizarra-control px-3 py-1.5 text-xs font-semibold text-pizarra-text-control transition-colors hover:bg-pizarra-control-hover"
          >
            Cargar ejemplo del examen
          </button>
        </div>
      </div>

      {/* Panel del tramo seleccionado (Sección 9.5) */}
      {selectedSegment && (
        <div className="rounded-xl border border-pizarra-action bg-pizarra-surface p-3 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-pizarra-text">
                Tramo {selectedSegment.id} ({selectedSegment.fromPointId} →{" "}
                {selectedSegment.toPointId})
              </h3>
              <p className="text-xs tabular-nums text-pizarra-subtext">
                Potencia aguas abajo:{" "}
                <strong className="text-pizarra-text">
                  {selectedSegCalc?.downstreamPowerMcalH.toFixed(1) ?? 0} Mcal/h
                </strong>
              </p>
            </div>
            <button
              type="button"
              onClick={() => onSelectSegment(null)}
              className="text-xs font-semibold text-pizarra-subtext hover:text-pizarra-text"
            >
              Cerrar
            </button>
          </div>

          {/* Estado en vivo del tramo */}
          {selectedSegCalc && (
            <div
              className={`mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-semibold tabular-nums ${
                selectedSegCalc.subtreeCompliant
                  ? "border-status-ok-border bg-status-ok-bg text-status-ok-text"
                  : "border-status-error-border bg-status-error-bg text-status-error-text"
              }`}
            >
              <span className="flex items-center gap-1">
                {selectedSegCalc.subtreeCompliant ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-status-ok-text" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 text-status-error-text" />
                )}
                ΔP parcial: {selectedSegCalc.partialDropTablePa ?? "Fuera"} Pa · Acum:{" "}
                {selectedSegCalc.accumulatedDropTablePa ?? "—"} Pa
              </span>
              <span>
                Presión final: {selectedSegCalc.pressureAtEndPa ?? "—"} Pa
              </span>
            </div>
          )}

          {/* Largo por partes y ajuste fino cm / 10 cm */}
          <div className="mt-3 space-y-2">
            {selectedSegment.parts.map((part, idx) => (
              <div
                key={`${selectedSegment.id}-part-${idx}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-pizarra-border bg-pizarra-secondary p-2"
              >
                <span className="text-xs font-semibold text-pizarra-text">
                  Parte {idx + 1}: {directionLabelEs(part.direction)}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onAdjustLengthCm(selectedSegment.id, -10)}
                    className="rounded border border-pizarra-border-control bg-pizarra-control px-1.5 py-0.5 text-[11px] font-semibold text-pizarra-text-control hover:bg-pizarra-control-hover"
                  >
                    -10 cm
                  </button>
                  <button
                    type="button"
                    onClick={() => onAdjustLengthCm(selectedSegment.id, -1)}
                    className="rounded border border-pizarra-border-control bg-pizarra-control px-1.5 py-0.5 text-[11px] font-semibold text-pizarra-text-control hover:bg-pizarra-control-hover"
                  >
                    -1
                  </button>
                  <input
                    type="number"
                    min={10}
                    max={5000}
                    step={1}
                    value={part.lengthCm}
                    onChange={(e) =>
                      onSetSingleLengthCm(
                        selectedSegment.id,
                        idx,
                        Number(e.target.value) || 100
                      )
                    }
                    className="w-20 rounded border border-pizarra-border-control bg-pizarra-control px-1.5 py-0.5 text-center text-xs font-bold tabular-nums text-pizarra-text"
                  />
                  <span className="text-[11px] font-medium text-pizarra-subtext">cm</span>
                  <button
                    type="button"
                    onClick={() => onAdjustLengthCm(selectedSegment.id, 1)}
                    className="rounded border border-pizarra-border-control bg-pizarra-control px-1.5 py-0.5 text-[11px] font-semibold text-pizarra-text-control hover:bg-pizarra-control-hover"
                  >
                    +1
                  </button>
                  <button
                    type="button"
                    onClick={() => onAdjustLengthCm(selectedSegment.id, 10)}
                    className="rounded border border-pizarra-border-control bg-pizarra-control px-1.5 py-0.5 text-[11px] font-semibold text-pizarra-text-control hover:bg-pizarra-control-hover"
                  >
                    +10 cm
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Diámetro nominal cobre L */}
          <div className="mt-3">
            <div className="flex items-center justify-between gap-2">
              <label className="block text-[11px] font-semibold text-pizarra-subtext">
                Diámetro nominal
              </label>
              <span className="rounded border border-pizarra-copper-border bg-pizarra-copper-bg px-1.5 py-0.5 text-[10px] font-semibold text-pizarra-copper">
                Cobre Tipo &ldquo;L&rdquo;
              </span>
            </div>
            <select
              value={selectedSegment.nominalDiameter}
              onChange={(e) =>
                onChangeDiameter(
                  selectedSegment.id,
                  e.target.value as CopperNominalDiameter
                )
              }
              className="mt-1 w-full rounded-lg border border-pizarra-border-control bg-pizarra-control px-2.5 py-1.5 text-sm font-medium text-pizarra-text"
            >
              {COPPER_TYPE_L_PIPES.map((p) => (
                <option key={p.nominal} value={p.nominal}>
                  {p.label} (Di = {p.innerDiameterMm} mm)
                </option>
              ))}
            </select>
          </div>

          {/* Agregar quiebre */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-pizarra-border pt-2.5">
            <CornerDownRight className="h-3.5 w-3.5 text-pizarra-subtext" />
            <span className="text-xs font-semibold text-pizarra-subtext">Quiebre:</span>
            <select
              value={bendDir}
              onChange={(e) => setBendDir(e.target.value as Direction)}
              className="rounded border border-pizarra-border-control bg-pizarra-control px-2 py-1 text-xs text-pizarra-text"
            >
              {ALL_DIRECTIONS.map((dir) => (
                <option key={dir} value={dir}>
                  {directionLabelEs(dir)}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={0.5}
              step={0.5}
              value={bendLengthM}
              onChange={(e) => setBendLengthM(Number(e.target.value) || 1)}
              className="w-16 rounded border border-pizarra-border-control bg-pizarra-control px-2 py-1 text-xs tabular-nums text-pizarra-text"
            />
            <span className="text-xs text-pizarra-subtext">m</span>
            <button
              type="button"
              onClick={() =>
                onAddBend(selectedSegment.id, bendDir, Math.round(bendLengthM * 100))
              }
              className="rounded border border-pizarra-border-control bg-pizarra-control px-2.5 py-1 text-xs font-semibold text-pizarra-text-control transition-colors hover:bg-pizarra-control-hover"
            >
              + Quiebre
            </button>
          </div>

          {/* Artefactos al final del tramo */}
          <div className="mt-3 border-t border-pizarra-border pt-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-pizarra-text">
                Artefactos en {selectedSegment.toPointId} ({selectedSegApps.length})
              </span>
              <button
                type="button"
                onClick={() =>
                  onAddApplianceToSegment(selectedSegment.id, {
                    name: `Artefacto ${selectedSegment.toPointId}`,
                    applianceClass: "estufa",
                    circuitType: "A",
                    powerMcalPerHour: 3,
                    quantity: 1,
                  })
                }
                className="text-xs font-semibold text-pizarra-link hover:underline"
              >
                + Agregar artefacto
              </button>
            </div>
            {selectedSegApps.length > 0 && (
              <ul className="mt-1.5 space-y-1.5">
                {selectedSegApps.map((a) => {
                  const assignedRoom = rooms.find((r) => r.id === a.roomId) ?? null;
                  const roomEval = assignedRoom
                    ? roomEvaluations.find((e) => e.roomId === assignedRoom.id) ?? null
                    : null;
                  const isInsufficient = Boolean(
                    roomEval && roomEval.totalPowerKw > 0 && !roomEval.volumeCompliant
                  );
                  const isExpanded = editingPanelAppId === a.id;

                  return (
                    <li
                      key={a.id}
                      className="overflow-hidden rounded-lg border border-pizarra-border bg-pizarra-secondary text-xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-1.5 px-2.5 py-1.5">
                        <div>
                          <span className="font-medium text-pizarra-text">
                            {a.name}
                          </span>
                          <span className="ml-1.5 font-semibold tabular-nums text-pizarra-subtext">
                            ({a.powerMcalPerHour * a.quantity} Mcal/h)
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            setEditingPanelAppId(isExpanded ? null : a.id)
                          }
                          className={`rounded border px-2 py-0.5 text-[11px] font-semibold tabular-nums transition-colors ${
                            !assignedRoom
                              ? "border-pizarra-border-control bg-pizarra-control text-pizarra-link hover:bg-pizarra-control-hover"
                              : isInsufficient
                                ? "animate-badge-error border-status-error-border bg-status-error-bg text-status-error-text"
                                : "border-status-ok-border bg-status-ok-bg text-status-ok-text"
                          }`}
                        >
                          {!assignedRoom
                            ? "+ Tamaño recinto"
                            : isInsufficient
                              ? `${assignedRoom.lengthMeters}×${assignedRoom.widthMeters}×${assignedRoom.heightMeters} m · Insuficiente`
                              : `${assignedRoom.lengthMeters}×${assignedRoom.widthMeters}×${assignedRoom.heightMeters} m · OK`}
                        </button>
                      </div>

                      {isExpanded && (
                        <RoomQuickEditor
                          gasType={gasType}
                          appliance={a}
                          rooms={rooms}
                          roomEvaluations={roomEvaluations}
                          onUpdateRoom={onUpdateRoom}
                          onCreateAndAssignRoom={onCreateAndAssignRoom}
                          onAssignApplianceRoom={onAssignApplianceRoom}
                          onClose={() => setEditingPanelAppId(null)}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Borrar con confirmación de subárbol */}
          <div className="mt-3 border-t border-pizarra-border pt-2.5">
            {deleteConfirmId === selectedSegment.id ? (
              <div className="rounded-lg border border-status-error-border bg-status-error-bg p-2.5 text-xs text-status-error-text">
                {(() => {
                  const impact = getSubtreeImpact({
                    segments,
                    appliances,
                    segmentId: selectedSegment.id,
                  });
                  return (
                    <>
                      <p className="font-semibold">
                        Se eliminará: {impact.segmentIdsToRemove.join(", ")}
                        {impact.applianceIdsToRemove.length > 0
                          ? ` y artefactos (${impact.applianceIdsToRemove.join(", ")})`
                          : ""}
                        .
                      </p>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            onDeleteSegmentWithSubtree(selectedSegment.id);
                            setDeleteConfirmId(null);
                          }}
                          className="rounded bg-[#B91C1C] px-2.5 py-1 font-semibold text-[#F8FAFC] hover:bg-[#991B1B]"
                        >
                          Confirmar borrado
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmId(null)}
                          className="rounded border border-pizarra-border-control bg-pizarra-control px-2.5 py-1 font-semibold text-pizarra-text-control hover:bg-pizarra-control-hover"
                        >
                          Cancelar
                        </button>
                      </div>
                    </>
                  );
                })()}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setDeleteConfirmId(selectedSegment.id)}
                className="flex items-center gap-1 text-xs font-semibold text-status-error-text hover:underline"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Borrar tramo
              </button>
            )}
          </div>
        </div>
      )}

      {/* Botón y asistente de una sola tarjeta "+ Agregar tramo" (Sección 5.3) */}
      {!wizardOpen ? (
        <button
          type="button"
          onClick={() => {
            setFromPointId(defaultOrigin);
            setWizardOpen(true);
          }}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-pizarra-action px-4 py-2.5 text-sm font-semibold text-pizarra-action-text shadow-sm transition-colors hover:bg-pizarra-action-hover"
        >
          <Plus className="h-4 w-4" />
          Agregar tramo
        </button>
      ) : (
        <form
          onSubmit={handleWizardSubmit}
          className="space-y-3 rounded-xl border border-pizarra-border bg-pizarra-surface p-3.5 shadow-sm"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-pizarra-text">Nuevo tramo</h3>
            <button
              type="button"
              onClick={() => setWizardOpen(false)}
              className="text-xs font-medium text-pizarra-subtext hover:text-pizarra-text"
            >
              Cancelar
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-semibold text-pizarra-subtext">
                Punto de origen
              </label>
              <select
                value={effectiveOrigin}
                onChange={(e) => setFromPointId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-pizarra-border-control bg-pizarra-control px-2 py-1.5 text-sm text-pizarra-text"
              >
                {availableOriginPoints.map((pt) => (
                  <option key={pt} value={pt}>
                    {pt === "S" ? "S (Regulador 0)" : pt}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-pizarra-subtext">
                Diámetro nominal
              </label>
              <select
                value={diameter}
                onChange={(e) =>
                  setDiameter(e.target.value as CopperNominalDiameter)
                }
                className="mt-1 w-full rounded-lg border border-pizarra-border-control bg-pizarra-control px-2 py-1.5 text-sm text-pizarra-text"
              >
                {COPPER_TYPE_L_PIPES.map((p) => (
                  <option key={p.nominal} value={p.nominal}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Rosa de 8 direcciones (cardinales y diagonales) + Automático */}
          <div>
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold text-pizarra-subtext">
                Dirección (cardinal o diagonal)
              </label>
              {dirStatus.recommendedDirection && (
                <button
                  type="button"
                  onClick={() => setDirection(dirStatus.recommendedDirection!)}
                  className="flex items-center gap-1 text-[11px] font-semibold text-pizarra-link hover:underline"
                >
                  <Sparkles className="h-3 w-3" />
                  Automático ({directionLabelEs(dirStatus.recommendedDirection)})
                </button>
              )}
            </div>
            <div className="mt-1 grid grid-cols-3 gap-1.5">
              {(
                [
                  { dir: "up-left", icon: ArrowUpLeft, label: "Diag ↖" },
                  { dir: "up", icon: ArrowUp, label: "Arriba" },
                  { dir: "up-right", icon: ArrowUpRight, label: "Diag ↗" },
                  { dir: "left", icon: ArrowLeft, label: "Izq" },
                  null,
                  { dir: "right", icon: ArrowRight, label: "Der" },
                  { dir: "down-left", icon: ArrowDownLeft, label: "Diag ↙" },
                  { dir: "down", icon: ArrowDown, label: "Abajo" },
                  { dir: "down-right", icon: ArrowDownRight, label: "Diag ↘" },
                ] as const
              ).map((entry, idx) => {
                if (!entry) {
                  return (
                    <button
                      key={`pad-auto-${idx}`}
                      type="button"
                      disabled={!dirStatus.recommendedDirection}
                      onClick={() => {
                        if (dirStatus.recommendedDirection) {
                          setDirection(dirStatus.recommendedDirection);
                        }
                      }}
                      title={
                        dirStatus.recommendedDirection
                          ? `Automático (${directionLabelEs(dirStatus.recommendedDirection)})`
                          : "Sin dirección libre"
                      }
                      className="flex flex-col items-center justify-center rounded-lg border border-pizarra-border-control bg-pizarra-secondary px-1.5 py-1.5 text-[10px] font-semibold text-pizarra-link transition-colors hover:bg-pizarra-control-hover disabled:text-pizarra-muted disabled:opacity-60"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>Auto</span>
                    </button>
                  );
                }

                const { dir, icon: Icon, label } = entry;
                const st = dirStatus.options.find((o) => o.direction === dir);
                const disabled = !st?.available;
                const active = direction === dir && !disabled;
                return (
                  <button
                    key={dir}
                    type="button"
                    disabled={disabled}
                    title={st?.reason ?? label}
                    onClick={() => setDirection(dir)}
                    className={`flex flex-col items-center rounded-lg border px-2 py-1.5 text-[11px] font-medium transition-colors ${
                      disabled
                        ? "cursor-not-allowed border-pizarra-border bg-pizarra-secondary text-pizarra-muted"
                        : active
                          ? "border-pizarra-action bg-pizarra-action text-pizarra-action-text"
                          : "border-pizarra-border-control bg-pizarra-control text-pizarra-text-control hover:bg-pizarra-control-hover"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Longitud real m y cm */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-semibold text-pizarra-subtext">
                Metros (m)
              </label>
              <input
                type="number"
                min={0}
                max={50}
                value={lengthMeters}
                onChange={(e) => setLengthMeters(Number(e.target.value) || 0)}
                className="mt-1 w-full rounded-lg border border-pizarra-border-control bg-pizarra-control px-2.5 py-1.5 text-sm text-pizarra-text tabular-nums"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-pizarra-subtext">
                Centímetros (cm)
              </label>
              <input
                type="number"
                min={0}
                max={99}
                value={lengthCmExtra}
                onChange={(e) => setLengthCmExtra(Number(e.target.value) || 0)}
                className="mt-1 w-full rounded-lg border border-pizarra-border-control bg-pizarra-control px-2.5 py-1.5 text-sm text-pizarra-text tabular-nums"
              />
            </div>
          </div>

          {/* Artefacto al final */}
          <div className="rounded-lg border border-pizarra-border bg-pizarra-secondary p-2.5">
            <label className="flex items-center gap-2 text-xs font-semibold text-pizarra-text">
              <input
                type="checkbox"
                checked={hasAppliance}
                onChange={(e) => setHasAppliance(e.target.checked)}
                className="accent-pizarra-action"
              />
              Sí, agregar artefacto al final del tramo
            </label>

            {hasAppliance && (
              <div className="mt-2 space-y-2">
                <select
                  value={catalogId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setCatalogId(id);
                    const found = APPLIANCE_CATALOG_TABLA_V.find((c) => c.id === id);
                    if (found) {
                      setAppName(found.name);
                      setAppPowerMcalH(found.powerMcalPerHour);
                    }
                  }}
                  className="w-full rounded border border-pizarra-border-control bg-pizarra-control px-2 py-1 text-xs text-pizarra-text"
                >
                  <option value="custom">Potencia manual (Mcal/h)</option>
                  {APPLIANCE_CATALOG_TABLA_V.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} — {item.powerMcalPerHour} Mcal/h
                    </option>
                  ))}
                </select>

                <div className="grid grid-cols-3 gap-1.5">
                  <input
                    type="text"
                    value={appName}
                    onChange={(e) => setAppName(e.target.value)}
                    placeholder="Nombre"
                    className="col-span-2 rounded border border-pizarra-border-control bg-pizarra-control px-2 py-1 text-xs text-pizarra-text placeholder:text-pizarra-muted"
                  />
                  <input
                    type="number"
                    step={0.1}
                    min={0.5}
                    value={appPowerMcalH}
                    onChange={(e) => setAppPowerMcalH(Number(e.target.value) || 1)}
                    placeholder="Mcal/h"
                    className="rounded border border-pizarra-border-control bg-pizarra-control px-2 py-1 text-xs text-pizarra-text tabular-nums placeholder:text-pizarra-muted"
                  />
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={appQuantity}
                    onChange={(e) => setAppQuantity(Number(e.target.value) || 1)}
                    className="rounded border border-pizarra-border-control bg-pizarra-control px-2 py-1 text-xs text-pizarra-text tabular-nums"
                  />
                  <select
                    value={appRoomId}
                    onChange={(e) => setAppRoomId(e.target.value)}
                    className="rounded border border-pizarra-border-control bg-pizarra-control px-2 py-1 text-xs text-pizarra-text"
                  >
                    <option value="">Sin recinto</option>
                    {rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          <button
            type="submit"
            className="w-full rounded-lg bg-pizarra-action py-2 text-sm font-semibold text-pizarra-action-text transition-colors hover:bg-pizarra-action-hover"
          >
            Confirmar tramo
          </button>
        </form>
      )}

      {/* Lista compacta de tramos confirmados (Sección 5.3) */}
      <div className="overflow-hidden rounded-xl border border-pizarra-border bg-pizarra-surface shadow-sm">
        <div className="border-b border-pizarra-border bg-pizarra-secondary px-3 py-2 text-xs font-semibold text-pizarra-text">
          Tramos confirmados ({segments.length})
        </div>
        <div className="max-h-72 divide-y divide-pizarra-border overflow-y-auto">
          {segments.map((seg) => {
            const calc = calculation.segments[seg.id];
            const totalM = seg.parts.reduce((a, b) => a + b.lengthCm, 0) / 100;
            const dirsLabel = seg.parts
              .map((p) => directionLabelEs(p.direction))
              .join("+");
            const active = selectedSegmentId === seg.id;
            const ok = calc?.subtreeCompliant ?? false;

            return (
              <button
                key={seg.id}
                type="button"
                onClick={() => onSelectSegment(seg.id)}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs transition ${
                  active ? "bg-pizarra-secondary" : "hover:bg-pizarra-control"
                }`}
              >
                <span className="font-medium text-pizarra-text tabular-nums">
                  {seg.id} · {seg.fromPointId} → {seg.toPointId} · {dirsLabel} ·{" "}
                  {totalM} m · {seg.nominalDiameter}&quot;
                </span>
                <span
                  className={`ml-2 shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
                    !calc?.hasEnoughData
                      ? "border-status-warn-border bg-status-warn-bg text-status-warn-text"
                      : ok
                        ? "border-status-ok-border bg-status-ok-bg text-status-ok-text"
                        : "border-status-error-border bg-status-error-bg text-status-error-text"
                  }`}
                >
                  {calc?.accumulatedDropTablePa !== null &&
                  calc?.accumulatedDropTablePa !== undefined
                    ? `${calc.accumulatedDropTablePa} Pa`
                    : "Pend."}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
