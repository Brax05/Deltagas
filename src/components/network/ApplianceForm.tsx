"use client";

import React, { useEffect, useState } from "react";
import { Check, Trash2, X } from "lucide-react";
import { APPLIANCE_CATALOG_TABLA_V } from "@/domain/ds66/appliances";
import { parseDecimalMeters } from "@/domain/diagram";
import type { Appliance, ApplianceClass, Room } from "@/domain/types";

export const APPLIANCE_CLASS_OPTIONS: readonly {
  value: ApplianceClass;
  label: string;
}[] = [
  { value: "estufa", label: "Estufa" },
  { value: "cocina", label: "Cocina" },
  { value: "encimera", label: "Encimera" },
  { value: "horno", label: "Horno" },
  { value: "calefon", label: "Calefón" },
  { value: "caldera", label: "Caldera" },
  { value: "secadora", label: "Secadora" },
  { value: "otro", label: "Otro" },
] as const;

export const CIRCUIT_TYPE_OPTIONS: readonly {
  value: "A" | "B" | "C";
  label: string;
}[] = [
  { value: "A", label: "Tipo A (sin ducto)" },
  { value: "B", label: "Tipo B (tiro natural)" },
  { value: "C", label: "Tipo C (cámara estanca)" },
] as const;

export interface ApplianceDraft {
  catalogId: string;
  name: string;
  applianceClass: ApplianceClass;
  circuitType: "A" | "B" | "C";
  powerMcalPerHour: number;
  quantity: number;
  roomId?: string;
}

export function createDefaultApplianceDraft(pointLabel?: string): ApplianceDraft {
  const firstCatalog = APPLIANCE_CATALOG_TABLA_V[0];
  return {
    catalogId: firstCatalog ? firstCatalog.id : "custom",
    name: firstCatalog
      ? firstCatalog.name
      : pointLabel
        ? `Artefacto ${pointLabel}`
        : "Artefacto",
    applianceClass: firstCatalog?.applianceClass ?? "estufa",
    circuitType: firstCatalog?.defaultCircuitType ?? "A",
    powerMcalPerHour: firstCatalog?.powerMcalPerHour ?? 3,
    quantity: 1,
    roomId: undefined,
  };
}

export function createApplianceDraftFromAppliance(
  appliance: Appliance
): ApplianceDraft {
  return {
    catalogId: appliance.catalogId ?? "custom",
    name: appliance.name,
    applianceClass: appliance.applianceClass,
    circuitType: appliance.circuitType,
    powerMcalPerHour: appliance.powerMcalPerHour,
    quantity: appliance.quantity,
    roomId: appliance.roomId,
  };
}

export function applianceDraftToInput(
  draft: ApplianceDraft
): Omit<Appliance, "id" | "segmentId"> {
  return {
    name: draft.name.trim() || "Artefacto",
    catalogId: draft.catalogId === "custom" ? undefined : draft.catalogId,
    applianceClass: draft.applianceClass,
    circuitType: draft.circuitType,
    powerMcalPerHour: Math.max(0.1, Number(draft.powerMcalPerHour) || 1),
    quantity: Math.max(1, Math.min(20, Math.round(draft.quantity) || 1)),
    roomId: draft.roomId || undefined,
  };
}

interface ApplianceFormProps {
  draft: ApplianceDraft;
  rooms?: Room[];
  showRoomSelect?: boolean;
  submitLabel?: string;
  onChange: (next: ApplianceDraft) => void;
  onSubmit?: () => void;
  onCancel?: () => void;
  onDelete?: () => void;
}

/**
 * Formulario reutilizable para elegir, crear o editar un artefacto (catálogo DS 66 o manual).
 */
export function ApplianceForm({
  draft,
  rooms = [],
  showRoomSelect = false,
  submitLabel,
  onChange,
  onSubmit,
  onCancel,
  onDelete,
}: ApplianceFormProps) {
  const [powerStr, setPowerStr] = useState(String(draft.powerMcalPerHour));

  useEffect(() => {
    const currentParsed = parseDecimalMeters(powerStr, 0.1, 500);
    if (currentParsed !== draft.powerMcalPerHour) {
      setPowerStr(String(draft.powerMcalPerHour));
    }
    // Sincroniza solo cuando cambia el valor numérico externo (ej. al elegir preset del catálogo)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.powerMcalPerHour]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" && onSubmit) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div onKeyDown={handleKeyDown} className="space-y-2 text-xs">
      <div>
        <label className="block text-[10px] font-semibold uppercase tracking-wide text-pizarra-subtext">
          Catálogo DS 66 (Tabla V) o personalizado
        </label>
        <select
          aria-label="Catálogo de artefacto"
          value={draft.catalogId}
          onChange={(e) => {
            const id = e.target.value;
            const found = APPLIANCE_CATALOG_TABLA_V.find((c) => c.id === id);
            if (found) {
              setPowerStr(String(found.powerMcalPerHour));
              onChange({
                ...draft,
                catalogId: found.id,
                name: found.name,
                applianceClass: found.applianceClass,
                circuitType: found.defaultCircuitType,
                powerMcalPerHour: found.powerMcalPerHour,
              });
            } else {
              onChange({ ...draft, catalogId: "custom" });
            }
          }}
          className="mt-0.5 w-full rounded border border-pizarra-border-control bg-pizarra-control px-2 py-1 text-xs text-pizarra-text"
        >
          <option value="custom">Personalizado (potencia manual)</option>
          {APPLIANCE_CATALOG_TABLA_V.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} — {item.powerMcalPerHour} Mcal/h
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        <div className="col-span-2">
          <label className="block text-[10px] font-semibold uppercase tracking-wide text-pizarra-subtext">
            Nombre del artefacto
          </label>
          <input
            type="text"
            aria-label="Nombre del artefacto"
            value={draft.name}
            onChange={(e) => onChange({ ...draft, name: e.target.value })}
            placeholder="Ej. Cocina / Calefón"
            className="mt-0.5 w-full rounded border border-pizarra-border-control bg-pizarra-control px-2 py-1 text-xs text-pizarra-text placeholder:text-pizarra-muted"
          />
        </div>

        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wide text-pizarra-subtext">
            Mcal/h
          </label>
          <input
            type="text"
            inputMode="decimal"
            aria-label="Potencia en Mcal/h"
            value={powerStr}
            onChange={(e) => {
              const raw = e.target.value;
              setPowerStr(raw);
              const parsed = parseDecimalMeters(raw, 0.1, 500);
              if (parsed !== null) {
                onChange({ ...draft, powerMcalPerHour: parsed });
              }
            }}
            placeholder="Mcal/h"
            className="mt-0.5 w-full rounded border border-pizarra-border-control bg-pizarra-control px-2 py-1 text-xs tabular-nums text-pizarra-text placeholder:text-pizarra-muted"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wide text-pizarra-subtext">
            Clase
          </label>
          <select
            aria-label="Clase de artefacto"
            value={draft.applianceClass}
            onChange={(e) =>
              onChange({
                ...draft,
                applianceClass: e.target.value as ApplianceClass,
              })
            }
            className="mt-0.5 w-full rounded border border-pizarra-border-control bg-pizarra-control px-2 py-1 text-xs text-pizarra-text"
          >
            {APPLIANCE_CLASS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wide text-pizarra-subtext">
            Circuito
          </label>
          <select
            aria-label="Tipo de circuito"
            value={draft.circuitType}
            onChange={(e) =>
              onChange({
                ...draft,
                circuitType: e.target.value as "A" | "B" | "C",
              })
            }
            className="mt-0.5 w-full rounded border border-pizarra-border-control bg-pizarra-control px-2 py-1 text-xs text-pizarra-text"
          >
            {CIRCUIT_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wide text-pizarra-subtext">
            Cantidad
          </label>
          <input
            type="number"
            aria-label="Cantidad de artefactos"
            min={1}
            max={20}
            value={draft.quantity}
            onChange={(e) =>
              onChange({
                ...draft,
                quantity: Math.max(
                  1,
                  Math.min(20, Math.round(Number(e.target.value)) || 1)
                ),
              })
            }
            className="mt-0.5 w-full rounded border border-pizarra-border-control bg-pizarra-control px-2 py-1 text-xs tabular-nums text-pizarra-text"
          />
        </div>
      </div>

      {showRoomSelect && (
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wide text-pizarra-subtext">
            Recinto (opcional)
          </label>
          <select
            aria-label="Recinto del artefacto"
            value={draft.roomId ?? ""}
            onChange={(e) =>
              onChange({ ...draft, roomId: e.target.value || undefined })
            }
            className="mt-0.5 w-full rounded border border-pizarra-border-control bg-pizarra-control px-2 py-1 text-xs text-pizarra-text"
          >
            <option value="">Sin recinto</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.lengthMeters}×{r.widthMeters}×{r.heightMeters} m)
              </option>
            ))}
          </select>
        </div>
      )}

      {(onSubmit || onCancel || onDelete) && (
        <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1">
          <div>
            {onDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="inline-flex items-center gap-1 rounded border border-status-error-border bg-status-error-bg px-2 py-1 text-[11px] font-semibold text-status-error-text hover:opacity-90"
              >
                <Trash2 className="h-3 w-3" />
                Borrar artefacto
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="inline-flex items-center gap-1 rounded border border-pizarra-border-control bg-pizarra-control px-2.5 py-1 text-[11px] font-semibold text-pizarra-text-control hover:bg-pizarra-control-hover"
              >
                <X className="h-3 w-3" />
                Cancelar
              </button>
            )}
            {onSubmit && (
              <button
                type="button"
                onClick={onSubmit}
                className="inline-flex items-center gap-1 rounded bg-pizarra-action px-2.5 py-1 text-[11px] font-semibold text-pizarra-action-text hover:bg-pizarra-action-hover"
              >
                <Check className="h-3 w-3" />
                {submitLabel ?? "Guardar"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
