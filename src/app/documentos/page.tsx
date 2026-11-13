"use client";

import React, { useEffect, useState } from "react";
import {
  Camera,
  CheckCircle2,
  ClipboardList,
  AlertTriangle,
  Sparkles,
  FileCheck,
  Plus,
} from "lucide-react";
import { inspectAndCompressDatasheetImage, type ImageQualityReport } from "@/lib/media/image-qc";
import {
  loadDailyChecklistDraft,
  loadDraftProject,
  saveDailyChecklistDraft,
  saveDraftProject,
} from "@/lib/storage/draft";
import { MCAL_H_TO_KW } from "@/domain/ds66/appliances";
import type { Appliance, ApplianceClass, ProjectData } from "@/domain/types";

const FIELD_TASKS = [
  {
    id: "trazado",
    label: "Medí longitudes reales, quiebres y diámetros de cañería Cobre Tipo L",
    requiredDocs: [
      "Diagrama unifilar/ortogonal a escala con identificación de tramos (T1, T2...)",
      "Memoria de cálculo de pérdidas de presión (Tablas 1/5 y Fórmula de Pole)",
    ],
  },
  {
    id: "placas",
    label: "Fotografié / anoté placas técnicas de los artefactos a instalar",
    requiredDocs: [
      "Registro de potencia nominal (Mcal/h o kW), marca, modelo y serie confirmados",
    ],
  },
  {
    id: "recintos",
    label: "Verifiqué dimensiones de recintos, celosías superiores e inferiores",
    requiredDocs: [
      "Cálculo de volumen bruto mínimo (Tabla XX o f.8 para estufas)",
      "Dimensionamiento de aberturas de ventilación (Tablas XXI y XXII)",
    ],
  },
  {
    id: "hermeticidad",
    label: "Ejecuté prueba de hermeticidad con manómetro calibrado",
    requiredDocs: [
      "Hoja de prueba de hermeticidad (Art. 78.3.5: volumen interno, presiones inicial/final y duración)",
    ],
  },
  {
    id: "cilindros",
    label: "Definí ubicación y dotación de equipo de cilindros GLP (si aplica)",
    requiredDocs: [
      "Memoria de razón de vaporización / consumo diario (Tablas XVI, XVII y XVIII)",
    ],
  },
] as const;

export default function DocumentosPage() {
  const [project, setProject] = useState<ProjectData | null>(null);
  const [selectedTasks, setSelectedTasks] = useState<string[]>([
    "trazado",
    "placas",
  ]);
  const [fieldNotes, setFieldNotes] = useState("");

  // Estado captura / lectura placa técnica (Sección 12)
  const [qcReport, setQcReport] = useState<ImageQualityReport | null>(null);
  const [consentAI, setConsentAI] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractMessage, setExtractMessage] = useState<string | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);

  // Borrador editable para confirmación humana obligatoria
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [gasType, setGasType] = useState("GLP / GN");
  const [powerMcalH, setPowerMcalH] = useState<number>(8);
  const [applianceClass, setApplianceClass] =
    useState<ApplianceClass>("cocina");
  const [targetSegmentId, setTargetSegmentId] = useState("");
  const [targetRoomId, setTargetRoomId] = useState("");
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  useEffect(() => {
    const draft = loadDraftProject();
    setProject(draft);
    setTargetSegmentId(draft.segments[0]?.id ?? "");
    setTargetRoomId(draft.rooms[0]?.id ?? "");

    const daily = loadDailyChecklistDraft();
    if (daily.selectedTasks.length > 0) {
      setSelectedTasks(daily.selectedTasks);
    }
    setFieldNotes(daily.notes);
  }, []);

  const toggleTask = (id: string) => {
    const next = selectedTasks.includes(id)
      ? selectedTasks.filter((t) => t !== id)
      : [...selectedTasks, id];
    setSelectedTasks(next);
    saveDailyChecklistDraft({
      selectedTasks: next,
      notes: fieldNotes,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleNotesChange = (val: string) => {
    setFieldNotes(val);
    saveDailyChecklistDraft({
      selectedTasks,
      notes: val,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setExtractMessage(null);
    setExtractError(null);
    setSavedNotice(null);
    if (!file) return;

    try {
      const report = await inspectAndCompressDatasheetImage(file);
      setQcReport(report);
    } catch {
      setQcReport({
        accepted: false,
        reason: "No se pudo analizar la imagen seleccionada en el navegador.",
        width: 0,
        height: 0,
        meanLuminance: 0,
        sharpnessScore: 0,
      });
    }
  };

  const handleRunVisionExtract = async () => {
    if (!qcReport?.accepted || !qcReport.compressedDataUrl || !consentAI) return;
    setExtracting(true);
    setExtractError(null);
    setExtractMessage(null);

    try {
      const res = await fetch("/api/appliances/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          imageBase64: qcReport.compressedDataUrl,
          mimeType: "image/jpeg",
          consentAccepted: true,
        }),
      });
      const json = (await res.json()) as {
        readable?: boolean;
        message?: string;
        error?: string;
        extracted?: {
          brand?: string;
          model?: string;
          serialNumber?: string;
          nominalPowerMcalH?: number | null;
          nominalPowerKw?: number | null;
          gasType?: string;
        };
      };

      if (!res.ok) {
        setExtractError(
          json.error ??
            json.message ??
            "No fue posible extraer los datos automáticamente."
        );
        return;
      }

      const ext = json.extracted ?? {};
      if (ext.brand) setBrand(ext.brand);
      if (ext.model) setModel(ext.model);
      if (ext.serialNumber) setSerialNumber(ext.serialNumber);
      if (ext.gasType) setGasType(ext.gasType);
      if (typeof ext.nominalPowerMcalH === "number" && ext.nominalPowerMcalH > 0) {
        setPowerMcalH(ext.nominalPowerMcalH);
      } else if (typeof ext.nominalPowerKw === "number" && ext.nominalPowerKw > 0) {
        setPowerMcalH(Number((ext.nominalPowerKw / MCAL_H_TO_KW).toFixed(2)));
      }

      setExtractMessage(
        "Lectura completada. Revisa cada campo contra la placa física antes de confirmar."
      );
    } catch {
      setExtractError("Error de red al consultar el extractor de placas.");
    } finally {
      setExtracting(false);
    }
  };

  const handleConfirmAddAppliance = (e: React.FormEvent) => {
    e.preventDefault();
    if (!project) return;
    if (!targetSegmentId) {
      setExtractError(
        "El proyecto actual aún no tiene tramos creados. Crea al menos un tramo en 'Red y Cálculo' primero."
      );
      return;
    }

    const label = [brand.trim(), model.trim()].filter(Boolean).join(" ") || "Artefacto verificado";
    const newAppliance: Appliance = {
      id: `app-${Date.now()}`,
      name: label,
      segmentId: targetSegmentId,
      applianceClass,
      circuitType: "A",
      powerMcalPerHour: Math.max(0.5, Number(powerMcalH) || 1),
      quantity: 1,
      roomId: targetRoomId || undefined,
      datasheet: {
        brand: brand.trim() || undefined,
        model: model.trim() || undefined,
        serialNumber: serialNumber.trim() || undefined,
        nominalPowerMcalH: Number(powerMcalH) || undefined,
        gasType: gasType.trim() || undefined,
        confirmedByHuman: true,
        confirmedAt: new Date().toISOString(),
      },
    };

    const updatedProject: ProjectData = {
      ...project,
      appliances: [...project.appliances, newAppliance],
      updatedAt: new Date().toISOString(),
    };

    saveDraftProject(updatedProject);
    setProject(updatedProject);
    setSavedNotice(
      `Artefacto "${label}" confirmado y agregado al tramo ${targetSegmentId} del proyecto activo.`
    );
  };

  const selectedDocItems = FIELD_TASKS.filter((t) =>
    selectedTasks.includes(t.id)
  );

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-pizarra-border bg-pizarra-surface p-4 shadow-sm">
        <h1 className="text-base font-bold text-pizarra-text">
          Módulo 7 · Documentos de respaldo y lectura de placas técnicas
        </h1>
        <p className="mt-0.5 text-xs text-pizarra-subtext">
          Asistente guiado de terreno (&ldquo;¿Qué hiciste hoy?&rdquo;) y verificación de placas técnicas antes de incorporarlas a tu proyecto (sin sellos ni logos SEC).
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Flujo "¿Qué hiciste hoy?" */}
        <section className="rounded-xl border border-pizarra-border bg-pizarra-surface p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-pizarra-link" />
            <h2 className="text-sm font-bold text-pizarra-text">
              ¿Qué hiciste hoy en obra?
            </h2>
          </div>
          <p className="mt-1 text-xs text-pizarra-subtext">
            Marca tus avances para armar automáticamente la lista de respaldos técnicos a revisar antes de firmar:
          </p>

          <div className="mt-3 space-y-2">
            {FIELD_TASKS.map((task) => {
              const checked = selectedTasks.includes(task.id);
              return (
                <label
                  key={task.id}
                  className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 text-xs transition ${
                    checked
                      ? "border-pizarra-action bg-pizarra-secondary"
                      : "border-pizarra-border bg-pizarra-control hover:bg-pizarra-control-hover"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleTask(task.id)}
                    className="mt-0.5 rounded border-pizarra-border-control accent-pizarra-action"
                  />
                  <span className="font-medium text-pizarra-text">{task.label}</span>
                </label>
              );
            })}
          </div>

          <div className="mt-4 rounded-lg border border-pizarra-border bg-pizarra-secondary p-3 text-xs">
            <p className="flex items-center gap-1.5 font-bold text-pizarra-text">
              <FileCheck className="h-3.5 w-3.5 text-status-ok-text" />
              Antecedentes recomendados según tu registro de hoy:
            </p>
            {selectedDocItems.length === 0 ? (
              <p className="mt-1 text-pizarra-subtext">
                Selecciona al menos una actividad arriba.
              </p>
            ) : (
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-pizarra-subtext">
                {selectedDocItems.flatMap((t) =>
                  t.requiredDocs.map((doc) => <li key={doc}>{doc}</li>)
                )}
              </ul>
            )}
          </div>

          <label className="mt-3 block text-xs">
            <span className="font-medium text-pizarra-subtext">
              Bitácora rápida de terreno (guardado local)
            </span>
            <textarea
              rows={3}
              value={fieldNotes}
              onChange={(e) => handleNotesChange(e.target.value)}
              placeholder="Ej. Observaciones de ventilación, altura de medidor, cambio de diámetro..."
              className="mt-1 w-full rounded-lg border border-pizarra-border-control bg-pizarra-control px-2.5 py-2 text-pizarra-text placeholder:text-pizarra-muted"
            />
          </label>
        </section>

        {/* Sección 12: Foto y lectura asistida de placa técnica */}
        <section className="rounded-xl border border-pizarra-border bg-pizarra-surface p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <Camera className="h-4 w-4 text-pizarra-link" />
            <h2 className="text-sm font-bold text-pizarra-text">
              Captura y confirmación de placa técnica (Sección 12)
            </h2>
          </div>
          <p className="mt-1 text-xs text-pizarra-subtext">
            Control local de calidad (resolución, iluminación y nitidez Laplaciana) y compresión automática a JPEG &le; 1.600 px antes de leer o guardar.
          </p>

          <div className="mt-3">
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-pizarra-border-control bg-pizarra-control p-4 text-center text-xs transition-colors hover:border-pizarra-action">
              <Camera className="h-6 w-6 text-pizarra-link" />
              <span className="mt-1.5 font-semibold text-pizarra-text">
                Seleccionar o fotografiar placa / ficha técnica
              </span>
              <span className="mt-0.5 text-[11px] text-pizarra-subtext">
                Formatos JPEG, PNG o WebP
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
          </div>

          {qcReport &&
            (() => {
              const isLightWarning =
                !qcReport.accepted &&
                Boolean(
                  qcReport.reason?.includes("oscura") ||
                    qcReport.reason?.includes("exceso de luz")
                );
              const boxClass = qcReport.accepted
                ? "border-status-ok-border bg-status-ok-bg text-status-ok-text"
                : isLightWarning
                  ? "border-status-warn-border bg-status-warn-bg text-status-warn-text"
                  : "border-status-error-border bg-status-error-bg text-status-error-text";
              const detailBorderClass = qcReport.accepted
                ? "border-status-ok-border"
                : isLightWarning
                  ? "border-status-warn-border"
                  : "border-status-error-border";
              return (
                <div
                  className={`mt-3 rounded-lg border p-3 text-xs shadow-sm ${boxClass}`}
                >
                  <div className="flex items-center gap-1.5 font-bold">
                    {qcReport.accepted ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-status-ok-text" />
                    ) : (
                      <AlertTriangle
                        className={`h-4 w-4 shrink-0 ${
                          isLightWarning
                            ? "text-status-warn-text"
                            : "text-status-error-text"
                        }`}
                      />
                    )}
                    {qcReport.accepted
                      ? "Imagen nítida y apta tras control de calidad local"
                      : qcReport.reason}
                  </div>
                  {qcReport.width > 0 && (
                    <p className="mt-1 text-[11px] tabular-nums opacity-90">
                      Original: {qcReport.width}×{qcReport.height} px · Luminancia:{" "}
                      {qcReport.meanLuminance.toFixed(0)} · Nitidez:{" "}
                      {qcReport.sharpnessScore.toFixed(0)}
                      {qcReport.compressedSizeBytes
                        ? ` · JPEG optimizado: ${(qcReport.compressedSizeBytes / 1024).toFixed(0)} KB`
                        : ""}
                    </p>
                  )}

                  {qcReport.accepted && (
                    <div
                      className={`mt-2.5 space-y-2 border-t pt-2 ${detailBorderClass}`}
                    >
                      <label className="flex cursor-pointer items-start gap-2">
                        <input
                          type="checkbox"
                          checked={consentAI}
                          onChange={(e) => setConsentAI(e.target.checked)}
                          className="mt-0.5 rounded border-pizarra-border-control accent-pizarra-action"
                        />
                        <span className="text-pizarra-text">
                          Autorizo enviar esta imagen comprimida al servicio del servidor para extraer marca, modelo, serie y potencia nominal.
                        </span>
                      </label>
                      <button
                        type="button"
                        disabled={!consentAI || extracting}
                        onClick={handleRunVisionExtract}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-pizarra-action px-3 py-1.5 font-semibold text-pizarra-action-text transition-colors hover:bg-pizarra-action-hover disabled:opacity-50"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        {extracting
                          ? "Leyendo placa en servidor..."
                          : "Leer datos de la placa"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}

          {extractError && (
            <div className="mt-2 rounded-lg border border-status-warn-border bg-status-warn-bg p-2.5 text-xs font-medium text-status-warn-text shadow-sm">
              {extractError}
            </div>
          )}
          {extractMessage && (
            <div className="mt-2 rounded-lg border border-pizarra-border bg-pizarra-secondary p-2.5 text-xs font-medium text-pizarra-text shadow-sm">
              {extractMessage}
            </div>
          )}

          {/* Confirmación humana obligatoria */}
          <form
            onSubmit={handleConfirmAddAppliance}
            className="mt-4 space-y-2.5 border-t border-pizarra-border pt-3 text-xs"
          >
            <p className="font-bold text-pizarra-text">
              Confirmación manual e ingreso al proyecto activo
            </p>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="font-medium text-pizarra-subtext">Marca</span>
                <input
                  type="text"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  placeholder="Ej. Junkers / Splendid"
                  className="mt-1 w-full rounded-lg border border-pizarra-border-control bg-pizarra-control px-2 py-1.5 text-pizarra-text placeholder:text-pizarra-muted"
                />
              </label>
              <label className="block">
                <span className="font-medium text-pizarra-subtext">Modelo</span>
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="Ej. WR 10"
                  className="mt-1 w-full rounded-lg border border-pizarra-border-control bg-pizarra-control px-2 py-1.5 text-pizarra-text placeholder:text-pizarra-muted"
                />
              </label>
              <label className="block">
                <span className="font-medium text-pizarra-subtext">N° de serie</span>
                <input
                  type="text"
                  value={serialNumber}
                  onChange={(e) => setSerialNumber(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-pizarra-border-control bg-pizarra-control px-2 py-1.5 text-pizarra-text tabular-nums"
                />
              </label>
              <label className="block">
                <span className="font-medium text-pizarra-subtext">
                  Potencia (Mcal/h)
                </span>
                <input
                  type="number"
                  step="0.1"
                  min={0.5}
                  value={powerMcalH}
                  onChange={(e) => setPowerMcalH(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-pizarra-border-control bg-pizarra-control px-2 py-1.5 text-pizarra-text tabular-nums"
                />
              </label>
              <label className="block">
                <span className="font-medium text-pizarra-subtext">Clase</span>
                <select
                  value={applianceClass}
                  onChange={(e) =>
                    setApplianceClass(e.target.value as ApplianceClass)
                  }
                  className="mt-1 w-full rounded-lg border border-pizarra-border-control bg-pizarra-control px-2 py-1.5 text-pizarra-text"
                >
                  <option value="calefon">Calefón</option>
                  <option value="cocina">Cocina</option>
                  <option value="encimera">Encimera</option>
                  <option value="horno">Horno</option>
                  <option value="estufa">Estufa</option>
                  <option value="caldera">Caldera</option>
                  <option value="secadora">Secadora</option>
                  <option value="otro">Otro</option>
                </select>
              </label>
              <label className="block">
                <span className="font-medium text-pizarra-subtext">Gas placa</span>
                <input
                  type="text"
                  value={gasType}
                  onChange={(e) => setGasType(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-pizarra-border-control bg-pizarra-control px-2 py-1.5 text-pizarra-text"
                />
              </label>
              <label className="block">
                <span className="font-medium text-pizarra-subtext">
                  Tramo destino
                </span>
                <select
                  value={targetSegmentId}
                  onChange={(e) => setTargetSegmentId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-pizarra-border-control bg-pizarra-control px-2 py-1.5 text-pizarra-text"
                >
                  {project?.segments.length ? (
                    project.segments.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.id} ({s.fromPointId} → {s.toPointId})
                      </option>
                    ))
                  ) : (
                    <option value="">Sin tramos en el proyecto</option>
                  )}
                </select>
              </label>
              <label className="block">
                <span className="font-medium text-pizarra-subtext">Recinto</span>
                <select
                  value={targetRoomId}
                  onChange={(e) => setTargetRoomId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-pizarra-border-control bg-pizarra-control px-2 py-1.5 text-pizarra-text"
                >
                  <option value="">Sin recinto</option>
                  {project?.rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-lg bg-pizarra-action px-3 py-2 text-xs font-semibold text-pizarra-action-text transition-colors hover:bg-pizarra-action-hover"
            >
              <Plus className="h-3.5 w-3.5" />
              Confirmar datos de placa y agregar al proyecto
            </button>

            {savedNotice && (
              <p className="rounded-lg border border-status-ok-border bg-status-ok-bg p-2.5 font-medium text-status-ok-text shadow-sm">
                {savedNotice}
              </p>
            )}
          </form>
        </section>
      </div>
    </div>
  );
}
