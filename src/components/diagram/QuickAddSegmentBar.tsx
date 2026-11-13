"use client";

import React, { useEffect, useState } from "react";
import { AlertTriangle, Check, X } from "lucide-react";
import { APPLIANCE_CATALOG_TABLA_V } from "@/domain/ds66/appliances";
import { COPPER_TYPE_L_PIPES } from "@/domain/ds66/pipes";
import { DEFAULT_ROOM_HEIGHT_METERS } from "@/domain/ds66/rooms";
import { directionLabelEs, parseDecimalMeters } from "@/domain/diagram";
import type { CopperNominalDiameter, Direction } from "@/domain/types";

export interface QuickAddDraft {
  fromPointId: string;
  toPointId: string;
  direction: Direction;
  lengthMeters: number;
  lengthCmExtra: number;
  nominalDiameter: CopperNominalDiameter;
  includeAppliance: boolean;
  catalogId: string;
  applianceName: string;
  powerMcalPerHour: number;
  roomLengthMeters: number;
  roomWidthMeters: number;
  roomHeightMeters: number;
}

export function createInitialQuickAddDraft(params: {
  fromPointId: string;
  toPointId: string;
  direction: Direction;
  totalCm?: number;
  nominalDiameter?: CopperNominalDiameter;
}): QuickAddDraft {
  const safeTotalCm = Math.max(10, Math.round((params.totalCm ?? 400) / 10) * 10);
  return {
    fromPointId: params.fromPointId,
    toPointId: params.toPointId,
    direction: params.direction,
    lengthMeters: Math.floor(safeTotalCm / 100),
    lengthCmExtra: safeTotalCm % 100,
    nominalDiameter: params.nominalDiameter ?? "1/2",
    includeAppliance: false,
    catalogId: "custom",
    applianceName: "Artefacto",
    powerMcalPerHour: 8,
    roomLengthMeters: 3.5,
    roomWidthMeters: 3.0,
    roomHeightMeters: DEFAULT_ROOM_HEIGHT_METERS,
  };
}

interface QuickAddSegmentBarProps {
  draft: QuickAddDraft;
  conflictMessage: string | null;
  onChange: (next: QuickAddDraft) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function QuickAddSegmentBar({
  draft,
  conflictMessage,
  onChange,
  onConfirm,
  onCancel,
}: QuickAddSegmentBarProps) {
  const [metersInput, setMetersInput] = useState(String(draft.lengthMeters));

  useEffect(() => {
    setMetersInput(String(draft.lengthMeters));
  }, [draft.fromPointId, draft.direction, draft.toPointId]);

  useEffect(() => {
    const parsed = parseDecimalMeters(metersInput, 0, 50);
    if (parsed !== draft.lengthMeters) {
      setMetersInput(String(draft.lengthMeters));
    }
    // Sincroniza si lengthMeters cambia externamente sin pisar "1," o "1." mientras escribe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.lengthMeters]);

  const totalCm = Math.max(
    10,
    Math.round((draft.lengthMeters * 100 + draft.lengthCmExtra) / 10) * 10
  );

  const roomVolumeM3 =
    draft.roomLengthMeters * draft.roomWidthMeters * draft.roomHeightMeters;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!conflictMessage) onConfirm();
      }}
      className="no-print border-t border-pizarra-action/40 bg-pizarra-secondary px-3 py-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-status-ok-text animate-pulse" />
          <span className="text-xs font-bold text-pizarra-text">
            Nuevo tramo automático: {draft.fromPointId} → {draft.toPointId} (
            {directionLabelEs(draft.direction)})
          </span>
          <span className="rounded border border-status-ok-border bg-status-ok-bg px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-status-ok-text">
            +{(totalCm / 100).toFixed(2)} m · Saltos 10 cm
          </span>
        </div>

        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1 rounded-md border border-pizarra-border-control bg-pizarra-control px-2 py-1 text-[11px] font-semibold text-pizarra-text-control hover:bg-pizarra-control-hover"
        >
          <X className="h-3 w-3" />
          Cancelar
        </button>
      </div>

      <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-12 sm:items-end">
        {/* Medida en m (acepta 1,5 o 1.5) y cm */}
        <div className="sm:col-span-5">
          <label className="block text-[11px] font-semibold text-pizarra-subtext">
            Medida / Largo
          </label>
          <div className="mt-1 flex items-center gap-1.5">
            <div className="flex flex-1 items-center gap-1">
              <input
                type="text"
                inputMode="decimal"
                aria-label="Metros del nuevo tramo"
                value={metersInput}
                onChange={(e) => {
                  const raw = e.target.value;
                  setMetersInput(raw);
                  if (!raw.trim()) {
                    onChange({ ...draft, lengthMeters: 0 });
                    return;
                  }
                  const parsed = parseDecimalMeters(raw, 0, 50);
                  if (parsed !== null) {
                    const hasFraction =
                      raw.includes(",") ||
                      raw.includes(".") ||
                      !Number.isInteger(parsed);
                    onChange({
                      ...draft,
                      lengthMeters: parsed,
                      lengthCmExtra: hasFraction ? 0 : draft.lengthCmExtra,
                    });
                  }
                }}
                className="w-full rounded-lg border border-pizarra-border-control bg-pizarra-surface px-2 py-1.5 text-xs font-semibold tabular-nums text-pizarra-text"
              />
              <span className="text-[11px] font-semibold text-pizarra-subtext">m</span>
            </div>
            <div className="flex flex-1 items-center gap-1">
              <input
                type="number"
                aria-label="Centímetros adicionales del nuevo tramo"
                min={0}
                max={90}
                step={10}
                value={draft.lengthCmExtra}
                onChange={(e) => {
                  const raw = Math.max(0, Math.min(90, Number(e.target.value) || 0));
                  onChange({
                    ...draft,
                    lengthCmExtra: Math.round(raw / 10) * 10,
                  });
                }}
                className="w-full rounded-lg border border-pizarra-border-control bg-pizarra-surface px-2 py-1.5 text-xs font-semibold tabular-nums text-pizarra-text"
              />
              <span className="text-[11px] font-semibold text-pizarra-subtext">cm</span>
            </div>
          </div>
        </div>

        {/* Diámetro nominal */}
        <div className="sm:col-span-3">
          <label className="block text-[11px] font-semibold text-pizarra-subtext">
            Diámetro (Cobre L)
          </label>
          <select
            aria-label="Diámetro nominal del nuevo tramo"
            value={draft.nominalDiameter}
            onChange={(e) =>
              onChange({
                ...draft,
                nominalDiameter: e.target.value as CopperNominalDiameter,
              })
            }
            className="mt-1 w-full rounded-lg border border-pizarra-border-control bg-pizarra-surface px-2.5 py-1.5 text-xs font-semibold text-pizarra-text"
          >
            {COPPER_TYPE_L_PIPES.map((p) => (
              <option key={p.nominal} value={p.nominal}>
                {p.label} (Di {p.innerDiameterMm} mm)
              </option>
            ))}
          </select>
        </div>

        {/* Opcional artefacto / tamaño recinto + confirmar */}
        <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-4 sm:justify-end">
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] font-semibold text-pizarra-text">
            <input
              type="checkbox"
              checked={draft.includeAppliance}
              onChange={(e) =>
                onChange({ ...draft, includeAppliance: e.target.checked })
              }
              className="accent-pizarra-action"
            />
            + Artefacto / Tamaño recinto
          </label>

          <button
            type="submit"
            disabled={Boolean(conflictMessage)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-pizarra-action px-3 py-1.5 text-xs font-semibold text-pizarra-action-text shadow-sm transition-colors hover:bg-pizarra-action-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Check className="h-3.5 w-3.5" />
            Generar tramo
          </button>
        </div>
      </div>

      {draft.includeAppliance && (
        <div className="mt-2.5 grid grid-cols-1 gap-2 rounded-lg border border-pizarra-border bg-pizarra-surface p-2.5 sm:grid-cols-12">
          <div className="sm:col-span-4">
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-pizarra-subtext">
              Artefacto (Tabla V)
            </label>
            <select
              value={draft.catalogId}
              onChange={(e) => {
                const cid = e.target.value;
                const found = APPLIANCE_CATALOG_TABLA_V.find((a) => a.id === cid);
                onChange({
                  ...draft,
                  catalogId: cid,
                  applianceName: found ? found.name : draft.applianceName,
                  powerMcalPerHour: found
                    ? found.powerMcalPerHour
                    : draft.powerMcalPerHour,
                });
              }}
              className="mt-1 w-full rounded border border-pizarra-border-control bg-pizarra-control px-2 py-1 text-xs text-pizarra-text"
            >
              <option value="custom">Personalizado</option>
              {APPLIANCE_CATALOG_TABLA_V.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.powerMcalPerHour} Mcal/h)
                </option>
              ))}
            </select>
            <input
              type="text"
              aria-label="Nombre del artefacto rápido"
              value={draft.applianceName}
              onChange={(e) =>
                onChange({ ...draft, applianceName: e.target.value })
              }
              placeholder="Nombre (ej. Estufa)"
              className="mt-1.5 w-full rounded border border-pizarra-border-control bg-pizarra-control px-2 py-1 text-xs text-pizarra-text placeholder:text-pizarra-muted"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-pizarra-subtext">
              Potencia (Mcal/h)
            </label>
            <input
              type="number"
              min={0.5}
              step={0.5}
              value={draft.powerMcalPerHour}
              onChange={(e) =>
                onChange({
                  ...draft,
                  powerMcalPerHour: Math.max(0.5, Number(e.target.value) || 0.5),
                })
              }
              className="mt-1 w-full rounded border border-pizarra-border-control bg-pizarra-control px-2 py-1 text-xs tabular-nums text-pizarra-text"
            />
          </div>
          <div className="sm:col-span-6">
            <div className="flex items-center justify-between">
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-pizarra-subtext">
                Tamaño recinto (Largo × Ancho × Alto)
              </label>
              <span className="text-[10px] font-semibold tabular-nums text-pizarra-subtext">
                Vol: {roomVolumeM3.toFixed(1)} m³
              </span>
            </div>
            <div className="mt-1 grid grid-cols-3 gap-1.5">
              <input
                type="number"
                min={0.5}
                step={0.1}
                aria-label="Largo recinto en metros"
                value={draft.roomLengthMeters}
                onChange={(e) =>
                  onChange({
                    ...draft,
                    roomLengthMeters: Math.max(0.5, Number(e.target.value) || 0.5),
                  })
                }
                placeholder="Largo m"
                className="w-full rounded border border-pizarra-border-control bg-pizarra-control px-2 py-1 text-xs tabular-nums text-pizarra-text"
              />
              <input
                type="number"
                min={0.5}
                step={0.1}
                aria-label="Ancho recinto en metros"
                value={draft.roomWidthMeters}
                onChange={(e) =>
                  onChange({
                    ...draft,
                    roomWidthMeters: Math.max(0.5, Number(e.target.value) || 0.5),
                  })
                }
                placeholder="Ancho m"
                className="w-full rounded border border-pizarra-border-control bg-pizarra-control px-2 py-1 text-xs tabular-nums text-pizarra-text"
              />
              <input
                type="number"
                min={1.8}
                step={0.1}
                aria-label="Alto recinto en metros"
                value={draft.roomHeightMeters}
                onChange={(e) =>
                  onChange({
                    ...draft,
                    roomHeightMeters: Math.max(1.8, Number(e.target.value) || 1.8),
                  })
                }
                placeholder="Alto m"
                className="w-full rounded border border-pizarra-border-control bg-pizarra-control px-2 py-1 text-xs tabular-nums text-pizarra-text"
              />
            </div>
          </div>
        </div>
      )}

      {conflictMessage && (
        <p className="mt-2 flex items-center gap-1.5 rounded border border-status-error-border bg-status-error-bg px-2.5 py-1 text-[11px] font-semibold text-status-error-text">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {conflictMessage}
        </p>
      )}
    </form>
  );
}
