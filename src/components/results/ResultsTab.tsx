"use client";

import React, { useMemo, useState } from "react";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Sparkles,
  Printer,
  ShieldCheck,
  FileCheck2,
  Gauge,
  Cylinder,
  ClipboardCheck,
} from "lucide-react";
import type { NetworkCalculationResult } from "@/domain/calculations/network";
import type { NetworkSuggestionsResult } from "@/domain/calculations/suggestions";
import type { HermeticityEvaluation } from "@/domain/calculations/hermeticity";
import type { CylindersEvaluation } from "@/domain/calculations/cylinders";
import type { RoomEvaluation } from "@/domain/calculations/rooms";
import { getGasSpec } from "@/domain/ds66/gases";
import {
  CHILE_COMMUNE_TEMPS,
  TABLA_XVII_DAILY_CONSUMPTION_KWH,
  type DesignTempC,
} from "@/domain/ds66/cylinders";
import type {
  Appliance,
  CopperNominalDiameter,
  GlpCylindersInput,
  HermeticityTestInput,
  ProjectData,
  Segment,
} from "@/domain/types";

interface ResultsTabProps {
  project: ProjectData;
  calculation: NetworkCalculationResult;
  suggestions: NetworkSuggestionsResult;
  hermeticityEval: HermeticityEvaluation;
  cylindersEval: CylindersEvaluation;
  roomEvaluations: RoomEvaluation[];
  diagramValid: boolean;
  onSelectSegmentAndGoRed: (segmentId: string) => void;
  onApplyDiameterChange: (
    segmentId: string,
    diameter: CopperNominalDiameter
  ) => void;
  onApplyAllDiameterSuggestions: () => void;
  onUpdateProjectMeta: (patch: {
    name?: string;
    client?: ProjectData["client"];
  }) => void;
  onUpdateHermeticity: (next: HermeticityTestInput) => void;
  onUpdateCylinders: (next: GlpCylindersInput) => void;
}

interface SnapshotState {
  loading: boolean;
  error: string | null;
  issuedAt: string | null;
  integritySha256: string | null;
}

export function ResultsTab({
  project,
  calculation,
  suggestions,
  hermeticityEval,
  cylindersEval,
  roomEvaluations,
  diagramValid,
  onSelectSegmentAndGoRed,
  onApplyDiameterChange,
  onApplyAllDiameterSuggestions,
  onUpdateProjectMeta,
  onUpdateHermeticity,
  onUpdateCylinders,
}: ResultsTabProps) {
  const gas = getGasSpec(project.gasType);
  const [snapshot, setSnapshot] = useState<SnapshotState>({
    loading: false,
    error: null,
    issuedAt: null,
    integritySha256: null,
  });

  const [checks, setChecks] = useState({
    powerChecked: false,
    poleChecked: false,
    roomsChecked: false,
    fieldChecked: false,
  });

  const orderedSegments = useMemo(() => {
    const byId = new Map<string, Segment>(
      project.segments.map((s) => [s.id, s])
    );
    const ordered: Segment[] = [];
    for (const id of calculation.orderedSegmentIds) {
      const seg = byId.get(id);
      if (seg) ordered.push(seg);
    }
    for (const seg of project.segments) {
      if (!calculation.orderedSegmentIds.includes(seg.id)) {
        ordered.push(seg);
      }
    }
    return ordered;
  }, [project.segments, calculation.orderedSegmentIds]);

  const appliancesBySeg = useMemo(() => {
    const map = new Map<string, Appliance[]>();
    for (const app of project.appliances) {
      const list = map.get(app.segmentId) ?? [];
      list.push(app);
      map.set(app.segmentId, list);
    }
    return map;
  }, [project.appliances]);

  const criticalSet = useMemo(
    () => new Set(calculation.criticalPathSegmentIds),
    [calculation.criticalPathSegmentIds]
  );

  const criticalApp = calculation.criticalApplianceId
    ? calculation.appliances[calculation.criticalApplianceId]
    : null;

  const handleFreezeSnapshot = async () => {
    setSnapshot({
      loading: true,
      error: null,
      issuedAt: null,
      integritySha256: null,
    });
    try {
      const res = await fetch("/api/reports/pdf", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(project),
      });
      const json = (await res.json()) as {
        error?: string;
        issuedAt?: string;
        integritySha256?: string;
      };
      if (!res.ok) {
        setSnapshot({
          loading: false,
          error: json.error ?? "No se pudo verificar la memoria en el servidor.",
          issuedAt: null,
          integritySha256: null,
        });
        return;
      }
      setSnapshot({
        loading: false,
        error: null,
        issuedAt: json.issuedAt ?? null,
        integritySha256: json.integritySha256 ?? null,
      });
    } catch {
      setSnapshot({
        loading: false,
        error: "Error de conexión al verificar la memoria en el servidor.",
        issuedAt: null,
        integritySha256: null,
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* Aviso normativo permanente (Sección 1 y 16) */}
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-pizarra-border bg-pizarra-surface p-3.5 text-xs text-pizarra-text shadow-sm">
        <div className="flex items-start gap-2.5">
          <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-status-warn-border bg-status-warn-bg">
            <ShieldCheck className="h-3.5 w-3.5 text-status-warn-text" />
          </div>
          <div>
            <p className="font-semibold text-pizarra-text">
              DeltaGas · Memoria de cálculo de apoyo técnico (DS 66 · Chile) — Sin sellos ni logos SEC
            </p>
            <p className="mt-0.5 text-pizarra-subtext">
              Las cifras provienen de las Tablas 1 y 5, Tabla VI y Fórmula de control Pole modificada.
              Debe ser revisada y firmada por un instalador de gas autorizado ante la SEC.
            </p>
          </div>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleFreezeSnapshot}
            disabled={snapshot.loading || project.segments.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-pizarra-action px-3 py-1.5 text-xs font-semibold text-pizarra-action-text transition-colors hover:bg-pizarra-action-hover disabled:opacity-50"
          >
            <FileCheck2 className="h-3.5 w-3.5" />
            {snapshot.loading
              ? "Verificando..."
              : "Verificar servidor (SHA-256)"}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-pizarra-border-control bg-pizarra-control px-3 py-1.5 text-xs font-semibold text-pizarra-text-control transition-colors hover:bg-pizarra-control-hover"
          >
            <Printer className="h-3.5 w-3.5" />
            Imprimir / PDF
          </button>
        </div>
      </div>

      {snapshot.error && (
        <div className="rounded-xl border border-status-error-border bg-status-error-bg p-3 text-xs text-status-error-text shadow-sm">
          <strong>Validación de servidor:</strong> {snapshot.error}
        </div>
      )}

      {snapshot.integritySha256 && (
        <div className="rounded-xl border border-status-ok-border bg-status-ok-bg p-3 text-xs text-status-ok-text shadow-sm">
          <p className="font-semibold">
            Versión congelada y verificada en servidor ({snapshot.issuedAt})
          </p>
          <p className="mt-1 break-all font-mono text-[11px] text-status-ok-text tabular-nums">
            SHA-256: {snapshot.integritySha256}
          </p>
        </div>
      )}

      {/* Tarjetas resumen de red */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-pizarra-border bg-pizarra-surface p-3 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-pizarra-subtext">
            Potencia total instalada
          </p>
          <p className="mt-1 text-lg font-bold text-pizarra-text tabular-nums">
            {calculation.totalPowerMcalH.toFixed(2)} Mcal/h
          </p>
          <p className="text-xs text-pizarra-subtext tabular-nums">
            {calculation.totalPowerKw.toFixed(2)} kW · {calculation.totalFlowM3H.toFixed(3)} m³/h
          </p>
        </div>

        <div className="rounded-xl border border-pizarra-border bg-pizarra-surface p-3 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-pizarra-subtext">
            Presión y límite DS 66
          </p>
          <p className="mt-1 text-lg font-bold text-pizarra-text tabular-nums">
            {calculation.servicePressurePa} Pa
          </p>
          <p className="text-xs text-pizarra-subtext tabular-nums">
            {gas.label} · máx ΔP {calculation.maxAllowedDropPa} Pa
          </p>
        </div>

        <div className="rounded-xl border border-pizarra-border bg-pizarra-surface p-3 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-pizarra-subtext">
            Mayor caída / Punto crítico
          </p>
          <p className="mt-1 text-lg font-bold text-pizarra-text tabular-nums">
            {calculation.maxAccumulatedDropPa !== null
              ? `${calculation.maxAccumulatedDropPa} Pa`
              : "—"}
          </p>
          <p className="text-xs text-pizarra-subtext">
            {criticalApp
              ? `${criticalApp.name} (${calculation.criticalPathSegmentIds.join(" → ")})`
              : "Agrega artefactos"}
          </p>
        </div>

        <div className="rounded-xl border border-pizarra-border bg-pizarra-surface p-3 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-pizarra-subtext">
            Estado normativo red
          </p>
          <div className="mt-1.5">
            {calculation.allCompliant &&
            !calculation.hasOutOfRangeSegments &&
            diagramValid ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-status-ok-border bg-status-ok-bg px-2.5 py-0.5 text-xs font-bold text-status-ok-text">
                <CheckCircle2 className="h-4 w-4 text-status-ok-text" />
                Cumple ΔP
              </span>
            ) : !diagramValid || calculation.hasOutOfRangeSegments ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-status-warn-border bg-status-warn-bg px-2.5 py-0.5 text-xs font-bold text-status-warn-text">
                <AlertTriangle className="h-4 w-4 text-status-warn-text" />
                {!diagramValid ? "Trazado con conflicto" : "Fuera de rango tabla"}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-status-error-border bg-status-error-bg px-2.5 py-0.5 text-xs font-bold text-status-error-text">
                <XCircle className="h-4 w-4 text-status-error-text" />
                Excede pérdida máx.
              </span>
            )}
          </div>
          <p className="mt-1.5 text-xs text-pizarra-subtext tabular-nums">
            Volumen red: {calculation.totalPipeVolumeLiters.toFixed(2)} L (
            {calculation.totalLengthMeters.toFixed(2)} m)
          </p>
        </div>
      </div>

      {/* Sugerencias automáticas cuando la red NO cumple (Sección 5.2) */}
      {(!calculation.allCompliant || calculation.hasOutOfRangeSegments) && (
        <div className="rounded-xl border border-status-warn-border bg-pizarra-surface p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-status-warn-border bg-status-warn-bg text-status-warn-text">
                <Sparkles className="h-3.5 w-3.5" />
              </span>
              <h2 className="text-sm font-bold text-pizarra-text">
                Sugerencias automáticas de corrección (DS 66 Tabla VIII)
              </h2>
            </div>
            {suggestions.diameterChanges.length > 0 && (
              <button
                type="button"
                onClick={onApplyAllDiameterSuggestions}
                className="no-print rounded-lg bg-pizarra-action px-3 py-1.5 text-xs font-semibold text-pizarra-action-text transition-colors hover:bg-pizarra-action-hover"
              >
                Aplicar todos los diámetros sugeridos (
                {suggestions.resultingCompliant ? "cumple red" : "mejora parcial"})
              </button>
            )}
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-pizarra-border bg-pizarra-secondary p-3">
              <h3 className="text-xs font-bold uppercase tracking-wide text-pizarra-text">
                1. Aumentar diámetro por tramo
              </h3>
              {suggestions.diameterChanges.length === 0 ? (
                <p className="mt-1 text-xs text-pizarra-subtext">
                  No se encontraron aumentos de diámetro adicionales aplicables.
                </p>
              ) : (
                <ul className="mt-2 space-y-1.5 text-xs">
                  {suggestions.diameterChanges.map((ch) => (
                    <li
                      key={`${ch.segmentId}-${ch.toDiameter}`}
                      className="flex items-center justify-between gap-2 rounded border border-pizarra-border bg-pizarra-surface px-2 py-1 text-pizarra-text tabular-nums"
                    >
                      <span>
                        <span className="mr-1.5 inline-block rounded border border-status-warn-border bg-status-warn-bg px-1 py-0.5 text-[10px] font-bold text-status-warn-text">
                          {ch.segmentId}
                        </span>
                        {ch.fromDiameter}&quot; → {ch.toDiameter}&quot; (
                        {ch.partialDropBeforePa ?? "Fuera"} →{" "}
                        {ch.partialDropAfterPa ?? "—"} Pa)
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          onApplyDiameterChange(ch.segmentId, ch.toDiameter)
                        }
                        className="no-print shrink-0 rounded border border-pizarra-border-control bg-pizarra-control px-2 py-0.5 text-[11px] font-semibold text-pizarra-text-control transition-colors hover:bg-pizarra-control-hover"
                      >
                        Aplicar
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-lg border border-pizarra-border bg-pizarra-secondary p-3">
              <h3 className="text-xs font-bold uppercase tracking-wide text-pizarra-text">
                2. Artefacto de menor consumo
              </h3>
              {suggestions.smallerAppliances.length === 0 ? (
                <p className="mt-1 text-xs text-pizarra-subtext">
                  Sin alternativas de menor potencia registradas para los artefactos críticos.
                </p>
              ) : (
                <ul className="mt-2 space-y-1.5 text-xs">
                  {suggestions.smallerAppliances.map((item) => (
                    <li
                      key={item.failingApplianceId}
                      className="rounded border border-pizarra-border bg-pizarra-surface p-2 tabular-nums"
                    >
                      <p className="font-semibold text-pizarra-text">
                        {item.failingApplianceName} ({item.currentPowerMcalH} Mcal/h)
                      </p>
                      <p className="mt-0.5 text-pizarra-subtext">
                        Alternativas:{" "}
                        {item.alternatives
                          .map((a) => `${a.name} (${a.powerMcalPerHour} Mcal/h)`)
                          .join(" · ")}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-lg border border-pizarra-border bg-pizarra-secondary p-3">
              <h3 className="text-xs font-bold uppercase tracking-wide text-pizarra-text">
                3. Capacidad por recinto
              </h3>
              {suggestions.roomRedistribution.length === 0 ? (
                <p className="mt-1 text-xs text-pizarra-subtext">
                  Agrega recintos en la pestaña Recintos para evaluar redistribución.
                </p>
              ) : (
                <ul className="mt-2 space-y-1.5 text-xs">
                  {suggestions.roomRedistribution.map((r) => (
                    <li
                      key={r.roomId}
                      className="rounded border border-pizarra-border bg-pizarra-surface p-2"
                    >
                      <span className="font-semibold text-pizarra-text">
                        {r.roomName}:
                      </span>{" "}
                      <span className="text-pizarra-subtext">{r.summary}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tabla completa de memoria de cálculo por tramo (Módulo 1) */}
      <div className="overflow-hidden rounded-xl border border-pizarra-border bg-pizarra-surface shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-pizarra-border px-4 py-3">
          <div>
            <h2 className="flex flex-wrap items-center gap-2 text-sm font-bold text-pizarra-text">
              <span>Memoria de cálculo por tramo</span>
              <span className="rounded border border-pizarra-copper-border bg-pizarra-copper-bg px-2 py-0.5 text-[11px] font-semibold text-pizarra-copper">
                Cobre Tipo L · Baja presión
              </span>
            </h2>
            <p className="mt-0.5 text-xs text-pizarra-subtext">
              Incluye fila y columna consultadas en {gas.family === "GLP" ? "Tabla 1 (GLP)" : "Tabla 5 (GN)"} y verificación analítica con fórmula Pole modificada.
            </p>
          </div>
          <span className="text-xs font-medium text-pizarra-subtext tabular-nums">
            PCS: {calculation.pcsMcalPerM3} Mcal/m³
          </span>
        </div>

        {orderedSegments.length === 0 ? (
          <p className="p-4 text-xs text-pizarra-subtext">
            No hay tramos ingresados en la red todavía.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-pizarra-border text-xs tabular-nums">
              <thead className="bg-pizarra-secondary text-left text-[11px] font-semibold uppercase tracking-wide text-pizarra-subtext">
                <tr>
                  <th className="px-3 py-2.5">Tramo</th>
                  <th className="px-3 py-2.5">Long. (m)</th>
                  <th className="px-3 py-2.5">Potencia</th>
                  <th className="px-3 py-2.5">Caudal</th>
                  <th className="px-3 py-2.5">Diám. L</th>
                  <th className="px-3 py-2.5">Vol. tubería</th>
                  <th className="px-3 py-2.5">Tabla DS 66</th>
                  <th className="px-3 py-2.5">ΔP Tabla</th>
                  <th className="px-3 py-2.5">ΔP Pole</th>
                  <th className="px-3 py-2.5">ΔP Acum.</th>
                  <th className="px-3 py-2.5">Presión fin</th>
                  <th className="px-3 py-2.5">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pizarra-border bg-pizarra-surface">
                {orderedSegments.map((seg) => {
                  const calc = calculation.segments[seg.id];
                  const segApps = appliancesBySeg.get(seg.id) ?? [];
                  const isCritical = criticalSet.has(seg.id);

                  if (!calc) return null;

                  const isWarningState =
                    !calc.hasEnoughData ||
                    calc.tableLookup.lengthOutOfRange ||
                    calc.tableLookup.powerOutOfRange;
                  const resultCellBorder = isWarningState
                    ? "border-l-4 border-l-status-warn-border"
                    : calc.subtreeCompliant
                      ? "border-l-4 border-l-status-ok-border"
                      : "border-l-4 border-l-status-error-border";

                  return (
                    <tr
                      key={seg.id}
                      className="transition-colors hover:bg-pizarra-control"
                    >
                      <td className="px-3 py-2 align-top">
                        <button
                          type="button"
                          onClick={() => onSelectSegmentAndGoRed(seg.id)}
                          className="font-bold text-pizarra-link underline decoration-pizarra-border-control hover:opacity-80"
                        >
                          {seg.id} ({seg.fromPointId}→{seg.toPointId})
                        </button>
                        {isCritical && (
                          <span className="ml-1.5 inline-block rounded border border-status-warn-border bg-status-warn-bg px-1.5 py-0.5 text-[10px] font-semibold text-status-warn-text">
                            Ruta crítica
                          </span>
                        )}
                        {segApps.length > 0 && (
                          <div className="mt-0.5 text-[11px] text-pizarra-subtext">
                            {segApps
                              .map((a) => `${a.name} ×${a.quantity}`)
                              .join(", ")}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top whitespace-nowrap">
                        <div className="font-medium text-pizarra-text">
                          {calc.calculationLengthMeters.toFixed(2)} m
                        </div>
                        <div className="text-[11px] text-pizarra-subtext">
                          Real {calc.realLengthMeters.toFixed(2)} + eq{" "}
                          {calc.equivalentLengthMeters.toFixed(2)}
                        </div>
                      </td>
                      <td className="px-3 py-2 align-top whitespace-nowrap">
                        <div className="font-medium text-pizarra-text">
                          {calc.downstreamPowerMcalH.toFixed(2)} Mcal/h
                        </div>
                        <div className="text-[11px] text-pizarra-subtext">
                          {calc.downstreamPowerKw.toFixed(2)} kW
                        </div>
                      </td>
                      <td className="px-3 py-2 align-top whitespace-nowrap text-pizarra-text">
                        {calc.volumetricFlowM3H.toFixed(3)} m³/h
                      </td>
                      <td className="px-3 py-2 align-top whitespace-nowrap">
                        <div className="font-medium text-pizarra-text">
                          {seg.nominalDiameter}&quot;
                        </div>
                        <div className="text-[11px] text-pizarra-subtext">
                          Ø int {calc.innerDiameterMm.toFixed(2)} mm
                        </div>
                      </td>
                      <td className="px-3 py-2 align-top whitespace-nowrap">
                        <div className="font-medium text-pizarra-text">
                          {calc.pipeVolumeLiters.toFixed(3)} L
                        </div>
                        <div className="text-[11px] text-pizarra-subtext">
                          {calc.pipeVolumeM3.toFixed(5)} m³
                        </div>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <div className="font-medium text-pizarra-text">
                          {calc.tableLookup.rowLabel} × {calc.tableLookup.columnLabel}
                        </div>
                        <div className="text-[11px] text-pizarra-subtext">
                          {calc.tableLookup.tableName}
                          {calc.tableLookup.referencePowerMcalH !== null
                            ? ` (cap. ${calc.tableLookup.referencePowerMcalH} Mcal/h)`
                            : ""}
                        </div>
                      </td>
                      <td className="px-3 py-2 align-top whitespace-nowrap font-semibold text-pizarra-text">
                        {calc.partialDropTablePa !== null
                          ? `${calc.partialDropTablePa.toFixed(1)} Pa`
                          : "Fuera"}
                      </td>
                      <td className="px-3 py-2 align-top whitespace-nowrap text-pizarra-subtext">
                        {calc.partialDropFormulaPa.toFixed(1)} Pa
                      </td>
                      <td className="px-3 py-2 align-top whitespace-nowrap font-semibold text-pizarra-text">
                        {calc.accumulatedDropTablePa !== null
                          ? `${calc.accumulatedDropTablePa.toFixed(1)} Pa`
                          : "—"}
                        <div className="text-[11px] font-normal text-pizarra-subtext">
                          Pole: {calc.accumulatedDropFormulaPa.toFixed(1)} Pa
                        </div>
                      </td>
                      <td className="px-3 py-2 align-top whitespace-nowrap font-medium text-pizarra-text">
                        {calc.pressureAtEndPa !== null
                          ? `${calc.pressureAtEndPa.toFixed(1)} Pa`
                          : "—"}
                      </td>
                      <td
                        className={`px-3 py-2 align-top whitespace-nowrap ${resultCellBorder}`}
                      >
                        {!calc.hasEnoughData ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-status-warn-border bg-status-warn-bg px-2 py-0.5 text-[11px] font-semibold text-status-warn-text">
                            Sin carga
                          </span>
                        ) : calc.tableLookup.lengthOutOfRange ||
                          calc.tableLookup.powerOutOfRange ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-status-warn-border bg-status-warn-bg px-2 py-0.5 text-[11px] font-semibold text-status-warn-text">
                            <AlertTriangle className="h-3 w-3 text-status-warn-text" />
                            Fuera tabla
                          </span>
                        ) : calc.subtreeCompliant ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-status-ok-border bg-status-ok-bg px-2 py-0.5 text-[11px] font-semibold text-status-ok-text">
                            <CheckCircle2 className="h-3 w-3 text-status-ok-text" />
                            Cumple
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-status-error-border bg-status-error-bg px-2 py-0.5 text-[11px] font-semibold text-status-error-text">
                            <XCircle className="h-3 w-3 text-status-error-text" />
                            Excede
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-pizarra-secondary text-xs font-bold text-pizarra-text">
                <tr>
                  <td className="px-3 py-2">Total instalación</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {calculation.totalLengthMeters.toFixed(2)} m
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {calculation.totalPowerMcalH.toFixed(2)} Mcal/h
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {calculation.totalFlowM3H.toFixed(3)} m³/h
                  </td>
                  <td className="px-3 py-2 text-pizarra-subtext">
                    Ø pond. {calculation.weightedInnerDiameterMm.toFixed(2)} mm
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {calculation.totalPipeVolumeLiters.toFixed(2)} L{" "}
                    <span className="font-normal text-pizarra-subtext">
                      ({calculation.totalPipeVolumeM3.toFixed(4)} m³)
                    </span>
                  </td>
                  <td colSpan={6} className="px-3 py-2 text-right font-medium text-pizarra-subtext">
                    Mayor ΔP:{" "}
                    <strong className="text-pizarra-text">
                      {calculation.maxAccumulatedDropPa !== null
                        ? `${calculation.maxAccumulatedDropPa.toFixed(1)} Pa`
                        : "—"}
                    </strong>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Tabla de consumo y presión de llegada por artefacto */}
      {Object.keys(calculation.appliances).length > 0 && (
        <div className="overflow-hidden rounded-xl border border-pizarra-border bg-pizarra-surface shadow-sm">
          <div className="border-b border-pizarra-border px-4 py-2.5">
            <h3 className="text-sm font-bold text-pizarra-text">
              Consumo de gas y presión de entrega en artefactos ({Object.keys(calculation.appliances).length})
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-pizarra-border text-xs tabular-nums">
              <thead className="bg-pizarra-secondary text-left text-[11px] font-semibold uppercase tracking-wide text-pizarra-subtext">
                <tr>
                  <th className="px-3 py-2.5">Artefacto</th>
                  <th className="px-3 py-2.5">Tramo</th>
                  <th className="px-3 py-2.5">Potencia</th>
                  <th className="px-3 py-2.5">Consumo gas</th>
                  <th className="px-3 py-2.5">ΔP Tabla</th>
                  <th className="px-3 py-2.5">ΔP Pole</th>
                  <th className="px-3 py-2.5">Presión llegada</th>
                  <th className="px-3 py-2.5">Cumplimiento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pizarra-border bg-pizarra-surface">
                {Object.values(calculation.appliances).map((app) => (
                  <tr
                    key={app.applianceId}
                    className="transition-colors hover:bg-pizarra-control"
                  >
                    <td className="px-3 py-2 font-medium text-pizarra-text">
                      {app.name} (×{app.quantity})
                      {app.applianceId === calculation.criticalApplianceId && (
                        <span className="ml-1.5 rounded border border-status-warn-border bg-status-warn-bg px-1.5 py-0.5 text-[10px] font-semibold text-status-warn-text">
                          Más desfavorable
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-medium text-pizarra-subtext">{app.segmentId}</td>
                    <td className="px-3 py-2 text-pizarra-text">
                      {app.totalPowerMcalH.toFixed(2)} Mcal/h{" "}
                      <span className="text-pizarra-subtext">
                        ({app.totalPowerKw.toFixed(2)} kW)
                      </span>
                    </td>
                    <td className="px-3 py-2 font-medium text-pizarra-text">
                      {app.volumetricFlowM3H.toFixed(3)} m³/h
                    </td>
                    <td className="px-3 py-2 font-semibold text-pizarra-text">
                      {app.accumulatedDropTablePa !== null
                        ? `${app.accumulatedDropTablePa.toFixed(1)} Pa`
                        : "Fuera"}
                    </td>
                    <td className="px-3 py-2 text-pizarra-subtext">
                      {app.accumulatedDropFormulaPa.toFixed(1)} Pa
                    </td>
                    <td className="px-3 py-2 text-pizarra-text">
                      {app.deliveryPressurePa !== null
                        ? `${app.deliveryPressurePa.toFixed(1)} Pa (${app.deliveryPressureMbar?.toFixed(2)} mbar)`
                        : "—"}
                    </td>
                    <td
                      className={`px-3 py-2 border-l-4 ${
                        app.compliant
                          ? "border-l-status-ok-border"
                          : "border-l-status-error-border"
                      }`}
                    >
                      {app.compliant ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-status-ok-border bg-status-ok-bg px-2 py-0.5 text-[11px] font-semibold text-status-ok-text">
                          <CheckCircle2 className="h-3 w-3 text-status-ok-text" />
                          Cumple (&le; {calculation.maxAllowedDropPa} Pa)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full border border-status-error-border bg-status-error-bg px-2 py-0.5 text-[11px] font-semibold text-status-error-text">
                          <XCircle className="h-3 w-3 text-status-error-text" />
                          No cumple
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-pizarra-secondary text-xs font-bold text-pizarra-text">
                <tr>
                  <td colSpan={2} className="px-3 py-2">
                    Total consumo de la casa
                  </td>
                  <td className="px-3 py-2">
                    {calculation.totalPowerMcalH.toFixed(2)} Mcal/h{" "}
                    <span className="font-normal text-pizarra-subtext">
                      ({calculation.totalPowerKw.toFixed(2)} kW)
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {calculation.totalFlowM3H.toFixed(3)} m³/h
                  </td>
                  <td colSpan={4} className="px-3 py-2 text-right font-normal text-pizarra-subtext">
                    PCS aplicado: {calculation.pcsMcalPerM3} Mcal/m³
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Resumen de volumen real/mínimo de recintos y ventilaciones (Módulo 2) */}
      {roomEvaluations.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-pizarra-border bg-pizarra-surface shadow-sm">
          <div className="border-b border-pizarra-border px-4 py-2.5">
            <h3 className="text-sm font-bold text-pizarra-text">
              Volumen de recintos y superficie de ventilaciones (DS 66 · Tabla XX, f.8 y Tabla XXI)
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-pizarra-border text-xs tabular-nums">
              <thead className="bg-pizarra-secondary text-left text-[11px] font-semibold uppercase tracking-wide text-pizarra-subtext">
                <tr>
                  <th className="px-3 py-2.5">Recinto (L × A × H)</th>
                  <th className="px-3 py-2.5">Artefactos</th>
                  <th className="px-3 py-2.5">Volumen real</th>
                  <th className="px-3 py-2.5">Volumen mínimo</th>
                  <th className="px-3 py-2.5">Regla DS 66</th>
                  <th className="px-3 py-2.5">Ventilación libre</th>
                  <th className="px-3 py-2.5">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pizarra-border bg-pizarra-surface">
                {roomEvaluations.map((ev) => {
                  const roomObj = project.rooms.find((r) => r.id === ev.roomId);
                  const dimsText = roomObj
                    ? `${roomObj.lengthMeters}×${roomObj.widthMeters}×${roomObj.heightMeters} m`
                    : "—";
                  const fail = ev.totalPowerKw > 0 && !ev.volumeCompliant;
                  return (
                    <tr
                      key={ev.roomId}
                      className="transition-colors hover:bg-pizarra-control"
                    >
                      <td className="px-3 py-2 font-medium text-pizarra-text">
                        <div>{ev.roomName}</div>
                        <div className="text-[11px] font-normal text-pizarra-subtext">
                          {dimsText}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-pizarra-text">
                        {ev.assignedAppliances.length > 0
                          ? ev.assignedAppliances.map((a) => a.name).join(", ")
                          : "Sin artefactos"}
                      </td>
                      <td className="px-3 py-2 font-semibold text-pizarra-text">
                        {ev.realVolumeM3.toFixed(2)} m³
                      </td>
                      <td className="px-3 py-2 font-semibold text-pizarra-text">
                        {ev.requiredVolumeM3.toFixed(2)} m³
                      </td>
                      <td className="px-3 py-2 text-pizarra-subtext">
                        {ev.volumeRuleApplied}
                      </td>
                      <td className="px-3 py-2 text-pizarra-text">
                        <div className="font-semibold">
                          {ev.requiredVentilationAreaCm2} cm² ({ev.ventilationType})
                        </div>
                        <div className="text-[11px] text-pizarra-subtext">
                          {ev.openingsCount === 2
                            ? `2 × ${ev.areaPerOpeningCm2} cm²`
                            : `1 × ${ev.areaPerOpeningCm2} cm²`}
                        </div>
                      </td>
                      <td
                        className={`px-3 py-2 border-l-4 ${
                          fail
                            ? "border-l-status-error-border"
                            : "border-l-status-ok-border"
                        }`}
                      >
                        {fail ? (
                          <span className="animate-badge-error inline-flex items-center gap-1 rounded-full border border-status-error-border bg-status-error-bg px-2 py-0.5 text-[11px] font-semibold text-status-error-text">
                            <XCircle className="h-3 w-3 text-status-error-text" />
                            Insuficiente
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-status-ok-border bg-status-ok-bg px-2 py-0.5 text-[11px] font-semibold text-status-ok-text">
                            <CheckCircle2 className="h-3 w-3 text-status-ok-text" />
                            Cumple
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Módulos 3 y 4 en grilla responsiva */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Módulo 3: Hoja de prueba de hermeticidad */}
        <section className="rounded-xl border border-pizarra-border bg-pizarra-surface p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Gauge className="h-4 w-4 text-pizarra-subtext" />
              <h2 className="text-sm font-bold text-pizarra-text">
                DS 66 Art. 78.3.5 · Hoja de prueba de hermeticidad
              </h2>
            </div>
            <span
              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                hermeticityEval.passed === null
                  ? "border-status-warn-border bg-status-warn-bg text-status-warn-text"
                  : hermeticityEval.passed
                    ? "border-status-ok-border bg-status-ok-bg text-status-ok-text"
                    : "border-status-error-border bg-status-error-bg text-status-error-text"
              }`}
            >
              {hermeticityEval.statusLabel}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg border border-pizarra-border bg-pizarra-secondary p-2.5 text-xs tabular-nums sm:grid-cols-4">
            <div>
              <span className="text-pizarra-subtext">Long. total</span>
              <p className="font-bold text-pizarra-text">
                {hermeticityEval.totalLengthMeters.toFixed(2)} m
              </p>
            </div>
            <div>
              <span className="text-pizarra-subtext">Ø int. pond.</span>
              <p className="font-bold text-pizarra-text">
                {hermeticityEval.weightedInnerDiameterMm.toFixed(2)} mm
              </p>
            </div>
            <div>
              <span className="text-pizarra-subtext">Volumen red</span>
              <p className="font-bold text-pizarra-text">
                {hermeticityEval.totalVolumeLiters.toFixed(2)} L
              </p>
              <p className="text-[10px] text-pizarra-subtext">
                {hermeticityEval.totalVolumeM3.toFixed(4)} m³
              </p>
            </div>
            <div>
              <span className="text-pizarra-subtext">Ref. Art. 78.3.5</span>
              <p className="font-bold text-pizarra-text">
                {hermeticityEval.referenceDurationMinutesArt78} min
              </p>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2.5 text-xs sm:grid-cols-3">
            <label className="block">
              <span className="font-medium text-pizarra-subtext">Fecha prueba</span>
              <input
                type="date"
                value={project.hermeticity.date}
                onChange={(e) =>
                  onUpdateHermeticity({
                    ...project.hermeticity,
                    date: e.target.value,
                  })
                }
                className="mt-1 w-full rounded-lg border border-pizarra-border-control bg-pizarra-control px-2 py-1.5 text-pizarra-text tabular-nums"
              />
            </label>

            <label className="block">
              <span className="font-medium text-pizarra-subtext">Tipo instalación</span>
              <select
                value={project.hermeticity.installationType}
                onChange={(e) =>
                  onUpdateHermeticity({
                    ...project.hermeticity,
                    installationType: e.target
                      .value as HermeticityTestInput["installationType"],
                  })
                }
                className="mt-1 w-full rounded-lg border border-pizarra-border-control bg-pizarra-control px-2 py-1.5 text-pizarra-text"
              >
                <option value="nueva">Nueva</option>
                <option value="modificacion">Modificación</option>
                <option value="existente">Existente</option>
              </select>
            </label>

            <label className="block">
              <span className="font-medium text-pizarra-subtext">
                Tiempo real (min)
              </span>
              <input
                type="number"
                min={1}
                placeholder={`Ref. ${hermeticityEval.referenceDurationMinutesArt78}`}
                value={project.hermeticity.durationMinutes ?? ""}
                onChange={(e) =>
                  onUpdateHermeticity({
                    ...project.hermeticity,
                    durationMinutes: e.target.value
                      ? Number(e.target.value)
                      : null,
                  })
                }
                className="mt-1 w-full rounded-lg border border-pizarra-border-control bg-pizarra-control px-2 py-1.5 text-pizarra-text tabular-nums placeholder:text-pizarra-muted"
              />
            </label>

            <label className="block">
              <span className="font-medium text-pizarra-subtext">
                Presión inicial (mbar)
              </span>
              <input
                type="number"
                step="0.5"
                value={project.hermeticity.initialPressureMbar}
                onChange={(e) =>
                  onUpdateHermeticity({
                    ...project.hermeticity,
                    initialPressureMbar: Number(e.target.value),
                  })
                }
                className="mt-1 w-full rounded-lg border border-pizarra-border-control bg-pizarra-control px-2 py-1.5 text-pizarra-text tabular-nums"
              />
            </label>

            <label className="block">
              <span className="font-medium text-pizarra-subtext">
                Presión final (mbar)
              </span>
              <input
                type="number"
                step="0.5"
                value={project.hermeticity.finalPressureMbar}
                onChange={(e) =>
                  onUpdateHermeticity({
                    ...project.hermeticity,
                    finalPressureMbar: Number(e.target.value),
                  })
                }
                className="mt-1 w-full rounded-lg border border-pizarra-border-control bg-pizarra-control px-2 py-1.5 text-pizarra-text tabular-nums"
              />
            </label>

            <div className="flex flex-col justify-end">
              <span className="font-medium text-pizarra-subtext">Variación registrada</span>
              <p className="mt-1 rounded-lg border border-pizarra-border bg-pizarra-secondary px-2 py-1.5 font-bold text-pizarra-text tabular-nums">
                {hermeticityEval.pressureVariationMbar > 0 ? "+" : ""}
                {hermeticityEval.pressureVariationMbar} mbar
              </p>
            </div>
          </div>

          <div className="mt-2.5 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <input
              type="text"
              placeholder="Marca manómetro"
              value={project.hermeticity.manometer.brand}
              onChange={(e) =>
                onUpdateHermeticity({
                  ...project.hermeticity,
                  manometer: {
                    ...project.hermeticity.manometer,
                    brand: e.target.value,
                  },
                })
              }
              className="rounded-lg border border-pizarra-border-control bg-pizarra-control px-2 py-1.5 text-pizarra-text placeholder:text-pizarra-muted"
            />
            <input
              type="text"
              placeholder="Modelo"
              value={project.hermeticity.manometer.model}
              onChange={(e) =>
                onUpdateHermeticity({
                  ...project.hermeticity,
                  manometer: {
                    ...project.hermeticity.manometer,
                    model: e.target.value,
                  },
                })
              }
              className="rounded-lg border border-pizarra-border-control bg-pizarra-control px-2 py-1.5 text-pizarra-text placeholder:text-pizarra-muted"
            />
            <input
              type="text"
              placeholder="Rango"
              value={project.hermeticity.manometer.range}
              onChange={(e) =>
                onUpdateHermeticity({
                  ...project.hermeticity,
                  manometer: {
                    ...project.hermeticity.manometer,
                    range: e.target.value,
                  },
                })
              }
              className="rounded-lg border border-pizarra-border-control bg-pizarra-control px-2 py-1.5 text-pizarra-text placeholder:text-pizarra-muted"
            />
            <input
              type="text"
              placeholder="Graduación"
              value={project.hermeticity.manometer.graduation}
              onChange={(e) =>
                onUpdateHermeticity({
                  ...project.hermeticity,
                  manometer: {
                    ...project.hermeticity.manometer,
                    graduation: e.target.value,
                  },
                })
              }
              className="rounded-lg border border-pizarra-border-control bg-pizarra-control px-2 py-1.5 text-pizarra-text placeholder:text-pizarra-muted"
            />
          </div>
        </section>

        {/* Módulo 4: Calculadora de cilindros GLP */}
        <section className="rounded-xl border border-pizarra-border bg-pizarra-surface p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Cylinder className="h-4 w-4 text-pizarra-subtext" />
              <h2 className="text-sm font-bold text-pizarra-text">
                DS 66 Art. 61 · Cilindros GLP (Tablas XVI, XVII y XVIII)
              </h2>
            </div>
            <span
              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tabular-nums ${
                gas.family === "GLP"
                  ? "border-pizarra-border-control bg-pizarra-secondary text-pizarra-link"
                  : "border-pizarra-border bg-pizarra-secondary text-pizarra-subtext"
              }`}
            >
              {gas.family === "GLP"
                ? `${cylindersEval.requiredCylinders} cilindro(s) × ${project.cylinders.cylinderTypeKg} kg`
                : "Solo referencia (red actual es GN)"}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2.5 text-xs sm:grid-cols-3">
            <label className="block">
              <span className="font-medium text-pizarra-subtext">
                Sup. construida (m²)
              </span>
              <input
                type="number"
                min={1}
                value={project.cylinders.builtAreaM2}
                onChange={(e) =>
                  onUpdateCylinders({
                    ...project.cylinders,
                    builtAreaM2: Math.max(1, Number(e.target.value) || 1),
                  })
                }
                className="mt-1 w-full rounded-lg border border-pizarra-border-control bg-pizarra-control px-2 py-1.5 text-pizarra-text tabular-nums"
              />
            </label>

            <label className="block">
              <span className="font-medium text-pizarra-subtext">Comuna / Ciudad</span>
              <select
                value={project.cylinders.commune}
                onChange={(e) => {
                  const found = CHILE_COMMUNE_TEMPS.find(
                    (c) => c.commune === e.target.value
                  );
                  onUpdateCylinders({
                    ...project.cylinders,
                    commune: e.target.value,
                    designTempC: found
                      ? found.designTempC
                      : project.cylinders.designTempC,
                  });
                }}
                className="mt-1 w-full rounded-lg border border-pizarra-border-control bg-pizarra-control px-2 py-1.5 text-pizarra-text"
              >
                {CHILE_COMMUNE_TEMPS.map((c) => (
                  <option key={c.commune} value={c.commune}>
                    {c.commune} ({c.designTempC} °C)
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="font-medium text-pizarra-subtext">
                Temp. cálculo (°C)
              </span>
              <select
                value={project.cylinders.designTempC}
                onChange={(e) =>
                  onUpdateCylinders({
                    ...project.cylinders,
                    designTempC: Number(e.target.value) as DesignTempC,
                  })
                }
                className="mt-1 w-full rounded-lg border border-pizarra-border-control bg-pizarra-control px-2 py-1.5 text-pizarra-text tabular-nums"
              >
                {[15, 10, 5, 0, -5, -10, -15, -20].map((t) => (
                  <option key={t} value={t}>
                    {t} °C
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="font-medium text-pizarra-subtext">Cilindro (kg)</span>
              <select
                value={project.cylinders.cylinderTypeKg}
                onChange={(e) =>
                  onUpdateCylinders({
                    ...project.cylinders,
                    cylinderTypeKg: Number(e.target.value) as 45 | 15,
                  })
                }
                className="mt-1 w-full rounded-lg border border-pizarra-border-control bg-pizarra-control px-2 py-1.5 text-pizarra-text"
              >
                <option value={45}>Tipo 45 kg</option>
                <option value={15}>Tipo 15 kg</option>
              </select>
            </label>

            <label className="block">
              <span className="font-medium text-pizarra-subtext">Régimen uso</span>
              <select
                value={project.cylinders.consumptionMode}
                onChange={(e) =>
                  onUpdateCylinders({
                    ...project.cylinders,
                    consumptionMode: e.target.value as "intermitente" | "continuo",
                  })
                }
                className="mt-1 w-full rounded-lg border border-pizarra-border-control bg-pizarra-control px-2 py-1.5 text-pizarra-text"
              >
                <option value="intermitente">Intermitente</option>
                <option value="continuo">Continuo</option>
              </select>
            </label>

            <label className="block">
              <span className="font-medium text-pizarra-subtext">Método cálculo</span>
              <select
                value={project.cylinders.calculationMethod}
                onChange={(e) =>
                  onUpdateCylinders({
                    ...project.cylinders,
                    calculationMethod: e.target.value as
                      | "vaporizacion"
                      | "consumo_diario",
                  })
                }
                className="mt-1 w-full rounded-lg border border-pizarra-border-control bg-pizarra-control px-2 py-1.5 text-pizarra-text"
              >
                <option value="vaporizacion">Razón vaporización (Tabla XVIII)</option>
                <option value="consumo_diario">Consumo diario (Tabla XVII)</option>
              </select>
            </label>
          </div>

          {project.cylinders.calculationMethod === "consumo_diario" && (
            <label className="mt-2.5 block text-xs">
              <span className="font-medium text-pizarra-subtext">
                Combinación de artefactos (Tabla XVII)
              </span>
              <select
                value={
                  project.cylinders.tablaXviiProfileKey ??
                  "estufa_calefon_cocina"
                }
                onChange={(e) =>
                  onUpdateCylinders({
                    ...project.cylinders,
                    tablaXviiProfileKey: e.target.value,
                  })
                }
                className="mt-1 w-full rounded-lg border border-pizarra-border-control bg-pizarra-control px-2 py-1.5 text-pizarra-text"
              >
                {Object.values(TABLA_XVII_DAILY_CONSUMPTION_KWH).map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="mt-3 rounded-lg border border-pizarra-border bg-pizarra-secondary p-3 text-xs tabular-nums">
            <div className="flex flex-wrap justify-between gap-2 text-pizarra-subtext">
              <span>
                Nivel consumo (Tabla XVI):{" "}
                <strong className="text-pizarra-text">
                  {cylindersEval.consumptionLevel}
                </strong>
              </span>
              <span>
                Rv (Tabla XVIII):{" "}
                <strong className="text-pizarra-text">
                  {cylindersEval.vaporizationRateKw} kW/cil
                </strong>
              </span>
            </div>
            <p className="mt-1.5 font-mono text-[11px] text-pizarra-text">
              {cylindersEval.formulaDescription}
            </p>
          </div>
        </section>
      </div>

      {/* Datos del proyecto y cliente + Lista de verificación humana (Sección 16) */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-pizarra-border bg-pizarra-surface p-4 shadow-sm">
          <h2 className="text-sm font-bold text-pizarra-text">
            Identificación del proyecto / cliente (para informe PDF)
          </h2>
          <div className="mt-3 grid grid-cols-1 gap-2.5 text-xs sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="font-medium text-pizarra-subtext">
                Nombre del proyecto
              </span>
              <input
                type="text"
                value={project.name}
                onChange={(e) => onUpdateProjectMeta({ name: e.target.value })}
                className="mt-1 w-full rounded-lg border border-pizarra-border-control bg-pizarra-control px-2.5 py-1.5 text-pizarra-text"
              />
            </label>
            <label className="block">
              <span className="font-medium text-pizarra-subtext">Propietario</span>
              <input
                type="text"
                value={project.client.ownerName}
                onChange={(e) =>
                  onUpdateProjectMeta({
                    client: { ...project.client, ownerName: e.target.value },
                  })
                }
                className="mt-1 w-full rounded-lg border border-pizarra-border-control bg-pizarra-control px-2.5 py-1.5 text-pizarra-text"
              />
            </label>
            <label className="block">
              <span className="font-medium text-pizarra-subtext">RUT (opcional)</span>
              <input
                type="text"
                value={project.client.ownerRut ?? ""}
                onChange={(e) =>
                  onUpdateProjectMeta({
                    client: { ...project.client, ownerRut: e.target.value },
                  })
                }
                className="mt-1 w-full rounded-lg border border-pizarra-border-control bg-pizarra-control px-2.5 py-1.5 text-pizarra-text"
              />
            </label>
            <label className="block">
              <span className="font-medium text-pizarra-subtext">Dirección</span>
              <input
                type="text"
                value={project.client.address}
                onChange={(e) =>
                  onUpdateProjectMeta({
                    client: { ...project.client, address: e.target.value },
                  })
                }
                className="mt-1 w-full rounded-lg border border-pizarra-border-control bg-pizarra-control px-2.5 py-1.5 text-pizarra-text"
              />
            </label>
            <label className="block">
              <span className="font-medium text-pizarra-subtext">Comuna</span>
              <input
                type="text"
                value={project.client.commune}
                onChange={(e) =>
                  onUpdateProjectMeta({
                    client: { ...project.client, commune: e.target.value },
                  })
                }
                className="mt-1 w-full rounded-lg border border-pizarra-border-control bg-pizarra-control px-2.5 py-1.5 text-pizarra-text"
              />
            </label>
          </div>
        </section>

        <section className="rounded-xl border border-pizarra-border bg-pizarra-surface p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-pizarra-subtext" />
            <h2 className="text-sm font-bold text-pizarra-text">
              Verificación humana antes de firmar (DS 66 Art. 4)
            </h2>
          </div>
          <p className="mt-1 text-xs text-pizarra-subtext">
            Confirma manualmente estos 4 puntos contra tus placas técnicas y planos físicos antes de emitir la carpeta final:
          </p>
          <div className="mt-3 space-y-2 text-xs">
            {[
              {
                key: "powerChecked" as const,
                label:
                  "Potencia total instalada contrastada con placas técnicas reales de cada artefacto.",
              },
              {
                key: "poleChecked" as const,
                label:
                  "Caída de presión acumulada en ruta crítica verificada contra Tabla 1/5 y control Pole.",
              },
              {
                key: "roomsChecked" as const,
                label:
                  "Volúmenes mínimos (Tabla XX / f.8) y ubicación de celosías (Tabla XXII) cotejados en obra.",
              },
              {
                key: "fieldChecked" as const,
                label:
                  "Prueba de hermeticidad (Art. 78) y dotación de cilindros GLP confirmadas por instalador autorizado.",
              },
            ].map((item) => (
              <label
                key={item.key}
                className="flex cursor-pointer items-start gap-2 rounded-lg border border-pizarra-border bg-pizarra-secondary p-2.5 transition-colors hover:bg-pizarra-control-hover"
              >
                <input
                  type="checkbox"
                  checked={checks[item.key]}
                  onChange={(e) =>
                    setChecks((prev) => ({
                      ...prev,
                      [item.key]: e.target.checked,
                    }))
                  }
                  className="mt-0.5 rounded border-pizarra-border-control accent-pizarra-action"
                />
                <span className="text-pizarra-text">{item.label}</span>
              </label>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
