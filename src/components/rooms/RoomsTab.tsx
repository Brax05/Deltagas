"use client";

import React, { useState } from "react";
import {
  CheckCircle2,
  XCircle,
  Plus,
  Trash2,
  Wind,
  Maximize,
} from "lucide-react";
import type { RoomEvaluation } from "@/domain/calculations/rooms";
import { DEFAULT_ROOM_HEIGHT_METERS } from "@/domain/ds66/rooms";
import { getGasSpec } from "@/domain/ds66/gases";
import type { Appliance, GasConfigId, Room } from "@/domain/types";

interface RoomsTabProps {
  gasType: GasConfigId;
  rooms: Room[];
  appliances: Appliance[];
  evaluations: RoomEvaluation[];
  onAddRoom: (room: Room) => void;
  onUpdateRoom: (room: Room) => void;
  onDeleteRoom: (roomId: string) => void;
  onAssignApplianceRoom: (
    applianceId: string,
    roomId: string | undefined
  ) => void;
}

export function RoomsTab({
  gasType,
  rooms,
  appliances,
  evaluations,
  onAddRoom,
  onUpdateRoom,
  onDeleteRoom,
  onAssignApplianceRoom,
}: RoomsTabProps) {
  const gas = getGasSpec(gasType);

  const [newName, setNewName] = useState("");
  const [newLength, setNewLength] = useState(3.5);
  const [newWidth, setNewWidth] = useState(3.0);
  const [newHeight, setNewHeight] = useState(DEFAULT_ROOM_HEIGHT_METERS);
  const [newVentType, setNewVentType] = useState<"directa" | "indirecta">(
    "directa"
  );

  const unassignedAppliances = appliances.filter(
    (app) => !app.roomId || !rooms.some((r) => r.id === app.roomId)
  );

  const handleCreateRoom = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newName.trim() || `Recinto ${rooms.length + 1}`;
    const id = `recinto-${Date.now()}`;
    onAddRoom({
      id,
      name: trimmed,
      lengthMeters: Math.max(0.5, Number(newLength) || 1),
      widthMeters: Math.max(0.5, Number(newWidth) || 1),
      heightMeters: Math.max(1.5, Number(newHeight) || DEFAULT_ROOM_HEIGHT_METERS),
      ventilationType: newVentType,
    });
    setNewName("");
  };

  return (
    <div className="space-y-4">
      {/* Encabezado normativo */}
      <div className="rounded-xl border border-pizarra-border bg-pizarra-surface p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-pizarra-text">
              DS 66 Art. 70 · Evaluación de recintos y ventilaciones
            </h2>
            <p className="mt-0.5 text-xs text-pizarra-subtext">
              Volumen bruto mínimo (Tabla XX y fórmula f.8 para estufas), superficie libre de ventilación (Tabla XXI) y altura de celosías (Tabla XXII ·{" "}
              {gas.heavierThanAir
                ? "GLP más denso que el aire: abertura inferior ≤ 15 cm"
                : "GN más liviano que el aire: abertura inferior ≤ 50 cm"}
              ).
            </p>
          </div>
          <span className="rounded-full border border-pizarra-border bg-pizarra-secondary px-3 py-1 text-xs font-semibold text-pizarra-text tabular-nums">
            {evaluations.filter((e) => e.overallCompliant).length} /{" "}
            {evaluations.length} recintos cumplen volumen
          </span>
        </div>
      </div>

      {/* Artefactos sin recinto asignado */}
      {unassignedAppliances.length > 0 && (
        <div className="rounded-xl border border-status-warn-border bg-status-warn-bg p-3.5 text-xs text-status-warn-text shadow-sm">
          <p className="font-semibold text-status-warn-text">
            Artefactos sin recinto asignado ({unassignedAppliances.length})
          </p>
          <p className="mt-0.5 text-status-warn-text">
            Asigna cada artefacto a un recinto para incluir su potencia en el cálculo de volumen (Tabla XX / f.8) y ventilación (Tabla XXI):
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {unassignedAppliances.map((app) => (
              <div
                key={app.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-pizarra-border bg-pizarra-surface px-2.5 py-1.5"
              >
                <span className="font-medium text-pizarra-text tabular-nums">
                  {app.name} ({(app.powerMcalPerHour * app.quantity).toFixed(1)} Mcal/h)
                </span>
                <select
                  value=""
                  onChange={(e) =>
                    onAssignApplianceRoom(
                      app.id,
                      e.target.value ? e.target.value : undefined
                    )
                  }
                  className="rounded border border-pizarra-border-control bg-pizarra-control px-2 py-1 text-xs text-pizarra-text"
                >
                  <option value="">Asignar a...</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tarjetas de recintos */}
      {rooms.length === 0 ? (
        <div className="rounded-xl border border-dashed border-pizarra-border-control bg-pizarra-surface p-6 text-center text-xs text-pizarra-subtext shadow-sm">
          Aún no hay recintos registrados. Agrega un recinto abajo para verificar volumen y ventilación según DS 66.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {rooms.map((room) => {
            const evalItem = evaluations.find((e) => e.roomId === room.id);
            const ok = evalItem?.volumeCompliant ?? true;

            return (
              <article
                key={room.id}
                className={`rounded-xl border border-pizarra-border bg-pizarra-surface p-4 shadow-sm ${
                  !ok ? "border-l-4 border-l-status-error-text" : ""
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex-1">
                    <input
                      type="text"
                      value={room.name}
                      onChange={(e) =>
                        onUpdateRoom({ ...room, name: e.target.value })
                      }
                      className="w-full rounded-lg border border-transparent bg-pizarra-secondary px-2 py-1 text-sm font-bold text-pizarra-text hover:border-pizarra-border-control focus:border-pizarra-action focus:bg-pizarra-control"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                        ok
                          ? "border-status-ok-border bg-status-ok-bg text-status-ok-text"
                          : "border-status-error-border bg-status-error-bg text-status-error-text"
                      }`}
                    >
                      {ok ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-status-ok-text" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-status-error-text" />
                      )}
                      {ok ? "Cumple volumen" : "Volumen insuficiente"}
                    </span>
                    <button
                      type="button"
                      onClick={() => onDeleteRoom(room.id)}
                      title="Eliminar recinto"
                      className="rounded-lg p-1.5 text-pizarra-muted transition-colors hover:bg-status-error-bg hover:text-status-error-text"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Dimensiones y tipo de ventilación */}
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                  <label className="block">
                    <span className="font-medium text-pizarra-subtext">Largo (m)</span>
                    <input
                      type="number"
                      min={0.5}
                      step="0.1"
                      value={room.lengthMeters}
                      onChange={(e) =>
                        onUpdateRoom({
                          ...room,
                          lengthMeters: Math.max(0.5, Number(e.target.value) || 0.5),
                        })
                      }
                      className="mt-1 w-full rounded-lg border border-pizarra-border-control bg-pizarra-control px-2 py-1 text-pizarra-text tabular-nums"
                    />
                  </label>
                  <label className="block">
                    <span className="font-medium text-pizarra-subtext">Ancho (m)</span>
                    <input
                      type="number"
                      min={0.5}
                      step="0.1"
                      value={room.widthMeters}
                      onChange={(e) =>
                        onUpdateRoom({
                          ...room,
                          widthMeters: Math.max(0.5, Number(e.target.value) || 0.5),
                        })
                      }
                      className="mt-1 w-full rounded-lg border border-pizarra-border-control bg-pizarra-control px-2 py-1 text-pizarra-text tabular-nums"
                    />
                  </label>
                  <label className="block">
                    <span className="font-medium text-pizarra-subtext">Alto (m)</span>
                    <input
                      type="number"
                      min={1.5}
                      step="0.1"
                      value={room.heightMeters}
                      onChange={(e) =>
                        onUpdateRoom({
                          ...room,
                          heightMeters: Math.max(1.5, Number(e.target.value) || 1.5),
                        })
                      }
                      className="mt-1 w-full rounded-lg border border-pizarra-border-control bg-pizarra-control px-2 py-1 text-pizarra-text tabular-nums"
                    />
                  </label>
                  <label className="block">
                    <span className="font-medium text-pizarra-subtext">Ventilación</span>
                    <select
                      value={room.ventilationType}
                      onChange={(e) =>
                        onUpdateRoom({
                          ...room,
                          ventilationType: e.target.value as
                            | "directa"
                            | "indirecta",
                        })
                      }
                      className="mt-1 w-full rounded-lg border border-pizarra-border-control bg-pizarra-control px-2 py-1 text-pizarra-text"
                    >
                      <option value="directa">Directa</option>
                      <option value="indirecta">Indirecta</option>
                    </select>
                  </label>
                </div>

                {/* Resultados volumen & ventilación */}
                {evalItem && (
                  <div className="mt-3 space-y-2 text-xs">
                    <div className="grid grid-cols-2 gap-2 rounded-lg border border-pizarra-border bg-pizarra-secondary p-2.5 tabular-nums sm:grid-cols-3">
                      <div>
                        <span className="flex items-center gap-1 text-pizarra-subtext">
                          <Maximize className="h-3 w-3" />
                          Volumen real
                        </span>
                        <p className="mt-0.5 font-bold text-pizarra-text">
                          {evalItem.realVolumeM3.toFixed(2)} m³
                        </p>
                      </div>
                      <div>
                        <span className="text-pizarra-subtext">
                          Mínimo ({evalItem.volumeRuleApplied})
                        </span>
                        <p className="mt-0.5 font-bold text-pizarra-text">
                          {evalItem.requiredVolumeM3.toFixed(2)} m³
                        </p>
                      </div>
                      <div className="col-span-2 sm:col-span-1">
                        <span className="text-pizarra-subtext">Potencia recinto</span>
                        <p className="mt-0.5 font-bold text-pizarra-text">
                          {evalItem.totalPowerMcalH.toFixed(2)} Mcal/h (
                          {evalItem.totalPowerKw.toFixed(2)} kW)
                        </p>
                      </div>
                    </div>

                    <div className="rounded-lg border border-pizarra-border bg-pizarra-control p-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="flex items-center gap-1 font-semibold text-pizarra-text tabular-nums">
                          <Wind className="h-3.5 w-3.5 text-pizarra-link" />
                          Ventilación libre requerida (Tabla XXI):{" "}
                          {evalItem.requiredVentilationAreaCm2} cm²
                        </span>
                        <span className="rounded border border-pizarra-border bg-pizarra-secondary px-2 py-0.5 text-[11px] font-medium text-pizarra-text tabular-nums">
                          {evalItem.openingsCount === 2
                            ? `2 aberturas × ${evalItem.areaPerOpeningCm2} cm²`
                            : `1 abertura de ${evalItem.areaPerOpeningCm2} cm²`}
                        </span>
                      </div>
                      <p className="mt-1 text-pizarra-subtext">
                        {evalItem.lowerOpeningPlacement}
                      </p>
                      <p className="text-pizarra-subtext">
                        {evalItem.upperOpeningPlacement}
                      </p>
                      <p className="mt-1 font-medium text-pizarra-text">
                        {evalItem.recommendation}
                      </p>
                    </div>

                    {/* Artefactos en el recinto */}
                    <div>
                      <p className="font-semibold text-pizarra-subtext">
                        Artefactos en este recinto ({evalItem.assignedAppliances.length})
                      </p>
                      {evalItem.assignedAppliances.length === 0 ? (
                        <p className="mt-0.5 text-pizarra-muted">
                          Sin artefactos asignados.
                        </p>
                      ) : (
                        <ul className="mt-1 space-y-1">
                          {evalItem.assignedAppliances.map((app) => (
                            <li
                              key={app.id}
                              className="flex items-center justify-between gap-2 rounded border border-pizarra-border bg-pizarra-secondary px-2 py-1 text-pizarra-text tabular-nums"
                            >
                              <span>
                                <strong>{app.name}</strong> ·{" "}
                                {app.powerMcalH.toFixed(1)} Mcal/h (
                                {app.powerKw.toFixed(2)} kW)
                                {app.isStove && (
                                  <span className="ml-1.5 rounded border border-status-warn-border bg-status-warn-bg px-1.5 py-0.5 text-[10px] font-semibold text-status-warn-text">
                                    Estufa (aplica f.8)
                                  </span>
                                )}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  onAssignApplianceRoom(app.id, undefined)
                                }
                                className="text-[11px] font-medium text-pizarra-subtext hover:text-status-error-text"
                              >
                                Quitar
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* Formulario para agregar nuevo recinto */}
      <form
        onSubmit={handleCreateRoom}
        className="rounded-xl border border-pizarra-border bg-pizarra-surface p-4 shadow-sm"
      >
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-pizarra-text">
          <Plus className="h-4 w-4 text-pizarra-link" />
          Agregar nuevo recinto
        </h3>
        <div className="mt-3 grid grid-cols-2 gap-2.5 text-xs sm:grid-cols-6">
          <label className="col-span-2 block">
            <span className="font-medium text-pizarra-subtext">Nombre</span>
            <input
              type="text"
              placeholder="Ej. Cocina, Loggia, Living..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-pizarra-border-control bg-pizarra-control px-2.5 py-1.5 text-pizarra-text placeholder:text-pizarra-muted"
            />
          </label>
          <label className="block">
            <span className="font-medium text-pizarra-subtext">Largo (m)</span>
            <input
              type="number"
              min={0.5}
              step="0.1"
              value={newLength}
              onChange={(e) => setNewLength(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-pizarra-border-control bg-pizarra-control px-2 py-1.5 text-pizarra-text tabular-nums"
            />
          </label>
          <label className="block">
            <span className="font-medium text-pizarra-subtext">Ancho (m)</span>
            <input
              type="number"
              min={0.5}
              step="0.1"
              value={newWidth}
              onChange={(e) => setNewWidth(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-pizarra-border-control bg-pizarra-control px-2 py-1.5 text-pizarra-text tabular-nums"
            />
          </label>
          <label className="block">
            <span className="font-medium text-pizarra-subtext">Alto (m)</span>
            <input
              type="number"
              min={1.5}
              step="0.1"
              value={newHeight}
              onChange={(e) => setNewHeight(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-pizarra-border-control bg-pizarra-control px-2 py-1.5 text-pizarra-text tabular-nums"
            />
          </label>
          <label className="block">
            <span className="font-medium text-pizarra-subtext">Ventilación</span>
            <select
              value={newVentType}
              onChange={(e) =>
                setNewVentType(e.target.value as "directa" | "indirecta")
              }
              className="mt-1 w-full rounded-lg border border-pizarra-border-control bg-pizarra-control px-2 py-1.5 text-pizarra-text"
            >
              <option value="directa">Directa</option>
              <option value="indirecta">Indirecta</option>
            </select>
          </label>
        </div>
        <button
          type="submit"
          className="mt-3 rounded-lg bg-pizarra-action px-4 py-2 text-xs font-semibold text-pizarra-action-text transition-colors hover:bg-pizarra-action-hover"
        >
          Agregar recinto
        </button>
      </form>
    </div>
  );
}
