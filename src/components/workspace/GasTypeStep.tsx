"use client";

import { Check } from "lucide-react";
import { GAS_SPECIFICATIONS } from "@/domain/ds66/gases";
import type { GasConfigId } from "@/domain/types";

interface GasTypeStepProps {
  gasType: GasConfigId;
  onChangeGasType: (gasType: GasConfigId) => void;
}

/** Paso 1: elección del tipo de gas con tarjetas seleccionables (reemplaza el desplegable). */
export function GasTypeStep({ gasType, onChangeGasType }: GasTypeStepProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Tipo de gas"
      className="grid gap-3 sm:grid-cols-2"
    >
      {Object.values(GAS_SPECIFICATIONS).map((spec) => {
        const selected = spec.id === gasType;
        return (
          <button
            key={spec.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChangeGasType(spec.id)}
            className={`rounded-2xl border bg-pizarra-surface p-4 text-left shadow-sm transition-colors ${
              selected
                ? "border-pizarra-action ring-2 ring-pizarra-action"
                : "border-pizarra-border hover:bg-pizarra-control-hover"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-pizarra-text">
                  {spec.label}
                </h3>
                <p className="text-xs text-pizarra-subtext">{spec.regionLabel}</p>
              </div>
              <span
                aria-hidden="true"
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                  selected
                    ? "border-pizarra-action bg-pizarra-action text-pizarra-action-text"
                    : "border-pizarra-border bg-pizarra-secondary text-transparent"
                }`}
              >
                <Check className="h-3.5 w-3.5" />
              </span>
            </div>

            <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-lg bg-pizarra-secondary px-2 py-1.5">
                <dt className="text-[11px] text-pizarra-subtext">PCS</dt>
                <dd className="font-bold tabular-nums text-pizarra-text">
                  {spec.pcsMcalPerM3} Mcal/m³
                </dd>
              </div>
              <div className="rounded-lg bg-pizarra-secondary px-2 py-1.5">
                <dt className="text-[11px] text-pizarra-subtext">Presión</dt>
                <dd className="font-bold tabular-nums text-pizarra-text">
                  {spec.servicePressureMbar} mbar
                </dd>
              </div>
              <div className="rounded-lg bg-pizarra-secondary px-2 py-1.5">
                <dt className="text-[11px] text-pizarra-subtext">Pérdida máx.</dt>
                <dd className="font-bold tabular-nums text-pizarra-text">
                  {spec.maxPressureDropPa} Pa
                </dd>
              </div>
            </dl>
          </button>
        );
      })}
    </div>
  );
}
