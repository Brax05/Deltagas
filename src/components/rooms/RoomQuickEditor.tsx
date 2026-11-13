"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  DoorOpen,
  Pencil,
  Plus,
  Trash2,
  Unlink,
  X,
} from "lucide-react";
import { evaluateRooms, type RoomEvaluation } from "@/domain/calculations/rooms";
import { parseDecimalMeters } from "@/domain/diagram";
import { DEFAULT_ROOM_HEIGHT_METERS } from "@/domain/ds66/rooms";
import type { Appliance, GasConfigId, Room } from "@/domain/types";
import {
  ApplianceForm,
  applianceDraftToInput,
  createApplianceDraftFromAppliance,
  type ApplianceDraft,
} from "@/components/network/ApplianceForm";

interface RoomQuickEditorProps {
  gasType: GasConfigId;
  appliance: Appliance;
  rooms: Room[];
  roomEvaluations: RoomEvaluation[];
  onUpdateAppliance?: (appliance: Appliance) => void;
  onDeleteAppliance?: (applianceId: string) => void;
  onUpdateRoom: (room: Room) => void;
  onCreateAndAssignRoom: (applianceId: string, room: Room) => void;
  onAssignApplianceRoom: (
    applianceId: string,
    roomId: string | undefined
  ) => void;
  onClose?: () => void;
}

/**
 * Editor compacto de artefacto y recinto (largo, ancho, alto y ventilación).
 * Permite modificar o borrar el artefacto, o ajustar/crear su cuadro de recinto en vivo.
 */
export function RoomQuickEditor({
  gasType,
  appliance,
  rooms,
  roomEvaluations,
  onUpdateAppliance,
  onDeleteAppliance,
  onUpdateRoom,
  onCreateAndAssignRoom,
  onAssignApplianceRoom,
  onClose,
}: RoomQuickEditorProps) {
  const assignedRoom = rooms.find((r) => r.id === appliance.roomId) ?? null;
  const assignedEval = assignedRoom
    ? roomEvaluations.find((e) => e.roomId === assignedRoom.id) ?? null
    : null;

  const defaultRoomName = `Recinto ${
    !appliance.id.startsWith("app-") && appliance.id.length <= 6
      ? appliance.id
      : appliance.name
  }`;

  const [editingApplianceInfo, setEditingApplianceInfo] = useState(false);
  const [appDraft, setAppDraft] = useState<ApplianceDraft>(() =>
    createApplianceDraftFromAppliance(appliance)
  );
  const [draftName, setDraftName] = useState(defaultRoomName);
  const [draftLengthStr, setDraftLengthStr] = useState("3");
  const [draftWidthStr, setDraftWidthStr] = useState("3");
  const [draftHeightStr, setDraftHeightStr] = useState(
    String(DEFAULT_ROOM_HEIGHT_METERS)
  );
  const [draftVent, setDraftVent] = useState<"directa" | "indirecta">("directa");

  useEffect(() => {
    setAppDraft(createApplianceDraftFromAppliance(appliance));
    setEditingApplianceInfo(false);
  }, [appliance.id]);

  useEffect(() => {
    if (assignedRoom) {
      setDraftName(assignedRoom.name);
      setDraftLengthStr(String(assignedRoom.lengthMeters));
      setDraftWidthStr(String(assignedRoom.widthMeters));
      setDraftHeightStr(String(assignedRoom.heightMeters));
      setDraftVent(assignedRoom.ventilationType);
    } else {
      setDraftName(defaultRoomName);
      setDraftLengthStr("3");
      setDraftWidthStr("3");
      setDraftHeightStr(String(DEFAULT_ROOM_HEIGHT_METERS));
      setDraftVent("directa");
    }
  }, [assignedRoom, defaultRoomName]);

  const previewEval = useMemo(() => {
    if (assignedEval) return assignedEval;
    const len = parseDecimalMeters(draftLengthStr, 0.5, 50) ?? 3;
    const wid = parseDecimalMeters(draftWidthStr, 0.5, 50) ?? 3;
    const hei =
      parseDecimalMeters(draftHeightStr, 0.5, 50) ?? DEFAULT_ROOM_HEIGHT_METERS;
    const tempRoom: Room = {
      id: "__preview__",
      name: draftName.trim() || defaultRoomName,
      lengthMeters: len,
      widthMeters: wid,
      heightMeters: hei,
      ventilationType: draftVent,
    };
    return (
      evaluateRooms({
        gasType,
        rooms: [tempRoom],
        appliances: [{ ...appliance, roomId: "__preview__" }],
      })[0] ?? null
    );
  }, [
    assignedEval,
    draftLengthStr,
    draftWidthStr,
    draftHeightStr,
    draftName,
    defaultRoomName,
    draftVent,
    gasType,
    appliance,
  ]);

  const handleDimensionChange = (
    field: "lengthMeters" | "widthMeters" | "heightMeters",
    raw: string
  ) => {
    if (field === "lengthMeters") setDraftLengthStr(raw);
    if (field === "widthMeters") setDraftWidthStr(raw);
    if (field === "heightMeters") setDraftHeightStr(raw);

    if (!assignedRoom) return;
    const val = parseDecimalMeters(raw, 0.5, 50);
    if (val === null) return;
    if (field === "heightMeters" && val < 1.5) return;
    onUpdateRoom({ ...assignedRoom, [field]: Number(val.toFixed(2)) });
  };

  const handleCreateRoom = (e: React.FormEvent) => {
    e.preventDefault();
    const len = Number((parseDecimalMeters(draftLengthStr, 0.5, 50) ?? 3).toFixed(2));
    const wid = Number((parseDecimalMeters(draftWidthStr, 0.5, 50) ?? 3).toFixed(2));
    const hei = Number(
      Math.max(
        1.5,
        parseDecimalMeters(draftHeightStr, 0.5, 50) ?? DEFAULT_ROOM_HEIGHT_METERS
      ).toFixed(2)
    );
    const id = `room-${appliance.id.replace(/[^a-zA-Z0-9_-]/g, "")}-${Date.now().toString(36)}`;
    onCreateAndAssignRoom(appliance.id, {
      id,
      name: draftName.trim() || defaultRoomName,
      lengthMeters: len,
      widthMeters: wid,
      heightMeters: hei,
      ventilationType: draftVent,
    });
  };

  const isInsufficient = Boolean(
    previewEval &&
      previewEval.totalPowerKw > 0 &&
      !previewEval.volumeCompliant
  );

  return (
    <div
      className={`border-t px-3 py-3 text-xs ${
        isInsufficient
          ? "border-status-error-border bg-status-error-bg/40"
          : "border-pizarra-border bg-pizarra-secondary"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <DoorOpen className="h-4 w-4 text-pizarra-link" />
          <span className="font-bold text-pizarra-text">
            Recinto de {appliance.name}
          </span>
          {previewEval && (
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${
                isInsufficient
                  ? "animate-badge-error border-status-error-border bg-status-error-bg text-status-error-text"
                  : "border-status-ok-border bg-status-ok-bg text-status-ok-text"
              }`}
            >
              {isInsufficient ? (
                <>
                  <AlertTriangle className="h-3 w-3 text-status-error-text" />
                  Tamaño insuficiente ({previewEval.realVolumeM3.toFixed(1)} &lt;{" "}
                  {previewEval.requiredVolumeM3.toFixed(1)} m³)
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3 w-3 text-status-ok-text" />
                  Tamaño suficiente ({previewEval.realVolumeM3.toFixed(1)} &ge;{" "}
                  {previewEval.requiredVolumeM3.toFixed(1)} m³)
                </>
              )}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {onUpdateAppliance && (
            <button
              type="button"
              onClick={() => {
                setAppDraft(createApplianceDraftFromAppliance(appliance));
                setEditingApplianceInfo((prev) => !prev);
              }}
              className="inline-flex items-center gap-1 rounded border border-pizarra-border-control bg-pizarra-control px-2 py-1 text-[11px] font-semibold text-pizarra-link hover:bg-pizarra-control-hover"
              title="Modificar tipo, nombre, potencia o cantidad de este artefacto"
            >
              <Pencil className="h-3 w-3" />
              {editingApplianceInfo ? "Ocultar artefacto" : "Editar artefacto"}
            </button>
          )}
          {onDeleteAppliance && (
            <button
              type="button"
              onClick={() => {
                onDeleteAppliance(appliance.id);
                onClose?.();
              }}
              className="inline-flex items-center gap-1 rounded border border-status-error-border bg-status-error-bg px-2 py-1 text-[11px] font-semibold text-status-error-text hover:opacity-90"
              title="Borrar este artefacto del tramo"
            >
              <Trash2 className="h-3 w-3" />
              Borrar artefacto
            </button>
          )}
          {assignedRoom && (
            <button
              type="button"
              onClick={() => onAssignApplianceRoom(appliance.id, undefined)}
              className="inline-flex items-center gap-1 rounded border border-pizarra-border-control bg-pizarra-control px-2 py-1 text-[11px] font-semibold text-pizarra-text-control hover:bg-pizarra-control-hover"
              title="Quitar cuadro de recinto (dejar artefacto al exterior)"
            >
              <Unlink className="h-3 w-3" />
              Sin recinto
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-pizarra-subtext hover:bg-pizarra-control-hover hover:text-pizarra-text"
              title="Cerrar editor de recinto"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {editingApplianceInfo && onUpdateAppliance && (
        <div className="mt-2.5 rounded-lg border border-pizarra-border bg-pizarra-surface p-2.5">
          <ApplianceForm
            draft={appDraft}
            submitLabel="Guardar artefacto"
            onChange={setAppDraft}
            onSubmit={() => {
              onUpdateAppliance({
                ...appliance,
                ...applianceDraftToInput(appDraft),
                roomId: appliance.roomId,
              });
              setEditingApplianceInfo(false);
            }}
            onCancel={() => setEditingApplianceInfo(false)}
          />
        </div>
      )}

      <form
        onSubmit={handleCreateRoom}
        className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-6"
      >
        <label className="col-span-2 block">
          <span className="text-[11px] font-semibold text-pizarra-subtext">
            Nombre del recinto
          </span>
          <input
            type="text"
            value={draftName}
            onChange={(e) => {
              setDraftName(e.target.value);
              if (assignedRoom) {
                onUpdateRoom({ ...assignedRoom, name: e.target.value });
              }
            }}
            className="mt-0.5 w-full rounded-lg border border-pizarra-border-control bg-pizarra-surface px-2 py-1 text-xs font-semibold text-pizarra-text"
          />
        </label>

        <label className="block">
          <span className="text-[11px] font-semibold text-pizarra-subtext">
            Largo (m)
          </span>
          <input
            type="number"
            min={0.5}
            step="0.1"
            value={draftLengthStr}
            onChange={(e) => handleDimensionChange("lengthMeters", e.target.value)}
            className="mt-0.5 w-full rounded-lg border border-pizarra-border-control bg-pizarra-surface px-2 py-1 text-xs font-bold tabular-nums text-pizarra-text"
          />
        </label>

        <label className="block">
          <span className="text-[11px] font-semibold text-pizarra-subtext">
            Ancho (m)
          </span>
          <input
            type="number"
            min={0.5}
            step="0.1"
            value={draftWidthStr}
            onChange={(e) => handleDimensionChange("widthMeters", e.target.value)}
            className="mt-0.5 w-full rounded-lg border border-pizarra-border-control bg-pizarra-surface px-2 py-1 text-xs font-bold tabular-nums text-pizarra-text"
          />
        </label>

        <label className="block">
          <span className="text-[11px] font-semibold text-pizarra-subtext">
            Alto (m)
          </span>
          <input
            type="number"
            min={1.5}
            step="0.1"
            value={draftHeightStr}
            onChange={(e) => handleDimensionChange("heightMeters", e.target.value)}
            className="mt-0.5 w-full rounded-lg border border-pizarra-border-control bg-pizarra-surface px-2 py-1 text-xs font-bold tabular-nums text-pizarra-text"
          />
        </label>

        <label className="block">
          <span className="text-[11px] font-semibold text-pizarra-subtext">
            Ventilación
          </span>
          <select
            value={draftVent}
            onChange={(e) => {
              const v = e.target.value as "directa" | "indirecta";
              setDraftVent(v);
              if (assignedRoom) {
                onUpdateRoom({ ...assignedRoom, ventilationType: v });
              }
            }}
            className="mt-0.5 w-full rounded-lg border border-pizarra-border-control bg-pizarra-surface px-2 py-1 text-xs text-pizarra-text"
          >
            <option value="directa">Directa</option>
            <option value="indirecta">Indirecta</option>
          </select>
        </label>

        {!assignedRoom && (
          <div className="col-span-2 flex flex-wrap items-center gap-2 sm:col-span-6">
            <button
              type="submit"
              className="inline-flex items-center gap-1 rounded-lg bg-pizarra-action px-3 py-1.5 text-xs font-semibold text-pizarra-action-text hover:bg-pizarra-action-hover"
            >
              <Plus className="h-3.5 w-3.5" />
              Mostrar cuadro de recinto en plano
            </button>

            {rooms.length > 0 && (
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) {
                    onAssignApplianceRoom(appliance.id, e.target.value);
                  }
                }}
                className="rounded-lg border border-pizarra-border-control bg-pizarra-surface px-2.5 py-1.5 text-xs text-pizarra-text"
              >
                <option value="">O vincular a recinto existente...</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.lengthMeters}×{r.widthMeters}×{r.heightMeters} m)
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
      </form>

      {previewEval && (
        <div
          className={`mt-2 space-y-1 rounded-lg border px-2.5 py-1.5 text-[11px] tabular-nums ${
            isInsufficient
              ? "border-status-error-border bg-status-error-bg text-status-error-text"
              : "border-pizarra-border bg-pizarra-surface text-pizarra-subtext"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              <strong className={isInsufficient ? "text-status-error-text" : "text-pizarra-text"}>
                {previewEval.volumeRuleApplied}:
              </strong>{" "}
              Volumen real{" "}
              <strong className={isInsufficient ? "text-status-error-text" : "text-pizarra-text"}>
                {previewEval.realVolumeM3.toFixed(2)} m³
              </strong>{" "}
              · Mínimo exigido{" "}
              <strong className={isInsufficient ? "text-status-error-text" : "text-pizarra-text"}>
                {previewEval.requiredVolumeM3.toFixed(2)} m³
              </strong>
              {isInsufficient &&
                ` · Faltan ${(previewEval.requiredVolumeM3 - previewEval.realVolumeM3).toFixed(2)} m³`}
            </span>
            <span>
              Ventilación libre:{" "}
              <strong className={isInsufficient ? "text-status-error-text" : "text-pizarra-text"}>
                {previewEval.requiredVentilationAreaCm2} cm²
              </strong>{" "}
              ({previewEval.openingsCount === 2
                ? `2 × ${previewEval.areaPerOpeningCm2} cm²`
                : `1 × ${previewEval.areaPerOpeningCm2} cm²`}
              )
            </span>
          </div>
          <p className="text-[10px] opacity-85">
            Cálculo 3D: Largo × Ancho × Alto (si el plano solo indica largo y ancho, se toma alto estándar de{" "}
            {DEFAULT_ROOM_HEIGHT_METERS} m editable arriba).
          </p>
        </div>
      )}
    </div>
  );
}
