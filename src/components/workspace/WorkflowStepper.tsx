"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Calculator,
  Check,
  DoorOpen,
  FileText,
  Flame,
  GitBranch,
  type LucideIcon,
} from "lucide-react";

export type WorkflowStepId = "gas" | "red" | "recintos" | "resultados";
export type StepStatus = "pending" | "ok" | "warn";

/** Orden fijo del flujo guiado de trabajo (el paso 5 es la página /documentos). */
export const WORKFLOW_ORDER: readonly WorkflowStepId[] = [
  "gas",
  "red",
  "recintos",
  "resultados",
];

const TOTAL_STEPS = WORKFLOW_ORDER.length + 1;

interface StepDefinition {
  title: string;
  shortTitle: string;
  tinyTitle: string;
  hint: string;
  icon: LucideIcon;
}

const STEP_DEFINITIONS: Record<WorkflowStepId, StepDefinition> = {
  gas: {
    title: "Tipo de gas",
    shortTitle: "Gas",
    tinyTitle: "Gas",
    hint: "Elige el gas de la instalación. Define el PCS, la presión de servicio y la pérdida máxima admisible (Tablas VI y VIII del DS 66).",
    icon: Flame,
  },
  red: {
    title: "Trazar red",
    shortTitle: "Red",
    tinyTitle: "Red",
    hint: "Toca el regulador S o usa «Agregar tramo» para dibujar la red. El cálculo se actualiza en vivo.",
    icon: GitBranch,
  },
  recintos: {
    title: "Recintos",
    shortTitle: "Recintos",
    tinyTitle: "Recintos",
    hint: "Registra los recintos donde van los artefactos y revisa su ventilación según el DS 66.",
    icon: DoorOpen,
  },
  resultados: {
    title: "Resultados",
    shortTitle: "Resultados",
    tinyTitle: "Result.",
    hint: "Revisa diámetros, pérdida de presión, hermeticidad y cilindros GLP antes de generar la memoria.",
    icon: Calculator,
  },
};

export interface WorkflowStepState {
  status: StepStatus;
  subtitle: string;
}

interface WorkflowStepperProps {
  activeStep: WorkflowStepId;
  steps: Record<WorkflowStepId, WorkflowStepState>;
  onSelectStep: (step: WorkflowStepId) => void;
}

function StepBadge({
  index,
  status,
  active,
}: {
  index: number;
  status: StepStatus;
  active: boolean;
}) {
  const base =
    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold tabular-nums";

  if (active) {
    return (
      <span
        className={`${base} border-pizarra-action bg-pizarra-action text-pizarra-action-text`}
      >
        {index}
      </span>
    );
  }
  if (status === "ok") {
    return (
      <span
        className={`${base} border-status-ok-border bg-status-ok-bg text-status-ok-text`}
      >
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
    );
  }
  if (status === "warn") {
    return (
      <span
        className={`${base} border-status-error-border bg-status-error-bg text-status-error-text`}
      >
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
    );
  }
  return (
    <span
      className={`${base} border-pizarra-border bg-pizarra-secondary text-pizarra-subtext`}
    >
      {index}
    </span>
  );
}

const STEP_BUTTON_CLASS =
  "flex w-full min-w-0 flex-col items-center gap-1 rounded-xl px-0.5 py-2 text-center transition-colors sm:flex-row sm:gap-2.5 sm:px-3 sm:text-left";

/** Barra de pasos numerados 1 a 5 (el paso 5 abre la página Documentos). */
export function WorkflowStepper({
  activeStep,
  steps,
  onSelectStep,
}: WorkflowStepperProps) {
  return (
    <nav aria-label="Pasos del proyecto" className="no-print">
      <ol className="grid grid-cols-5 gap-1 rounded-2xl border border-pizarra-border bg-pizarra-surface p-1.5 shadow-sm">
        {WORKFLOW_ORDER.map((stepId, i) => {
          const def = STEP_DEFINITIONS[stepId];
          const state = steps[stepId];
          const active = stepId === activeStep;
          return (
            <li key={stepId} className="min-w-0">
              <button
                type="button"
                onClick={() => onSelectStep(stepId)}
                aria-current={active ? "step" : undefined}
                className={`${STEP_BUTTON_CLASS} ${
                  active
                    ? "bg-pizarra-secondary ring-1 ring-pizarra-action"
                    : "hover:bg-pizarra-control-hover"
                }`}
              >
                <StepBadge index={i + 1} status={state.status} active={active} />
                <span className="min-w-0 max-w-full">
                  <span
                    className={`block truncate text-[10px] font-semibold sm:text-sm ${
                      active ? "text-pizarra-text" : "text-pizarra-text-control"
                    }`}
                  >
                    <span className="min-[360px]:hidden">{def.tinyTitle}</span>
                    <span className="hidden min-[360px]:inline sm:hidden">
                      {def.shortTitle}
                    </span>
                    <span className="hidden sm:inline">{def.title}</span>
                  </span>
                  <span
                    className={`hidden truncate text-[11px] lg:block ${
                      state.status === "warn"
                        ? "font-semibold text-status-error-text"
                        : "text-pizarra-subtext"
                    }`}
                  >
                    {state.subtitle}
                  </span>
                </span>
              </button>
            </li>
          );
        })}

        <li className="min-w-0">
          <Link
            href="/documentos"
            className={`${STEP_BUTTON_CLASS} hover:bg-pizarra-control-hover`}
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-pizarra-border bg-pizarra-secondary text-xs font-bold tabular-nums text-pizarra-subtext">
              5
            </span>
            <span className="min-w-0 max-w-full">
              <span className="block truncate text-[10px] font-semibold text-pizarra-text-control sm:text-sm">
                <span className="sm:hidden">Docs</span>
                <span className="hidden sm:inline">Documentos</span>
              </span>
              <span className="hidden truncate text-[11px] text-pizarra-subtext lg:block">
                Memoria y descargas
              </span>
            </span>
          </Link>
        </li>
      </ol>
    </nav>
  );
}

interface StepIntroProps {
  activeStep: WorkflowStepId;
  onSelectStep: (step: WorkflowStepId) => void;
}

const PAGER_BUTTON_CLASS =
  "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors";

/** Encabezado del paso activo: qué hacer en este paso + navegación Anterior / Siguiente. */
export function StepIntro({ activeStep, onSelectStep }: StepIntroProps) {
  const index = WORKFLOW_ORDER.indexOf(activeStep);
  const def = STEP_DEFINITIONS[activeStep];
  const Icon = def.icon;
  const prev = index > 0 ? WORKFLOW_ORDER[index - 1] : null;
  const next = index < WORKFLOW_ORDER.length - 1 ? WORKFLOW_ORDER[index + 1] : null;

  return (
    <section
      aria-label={`Paso ${index + 1}: ${def.title}`}
      className="no-print flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-pizarra-border bg-pizarra-surface px-4 py-3 shadow-sm"
    >
      <div className="flex min-w-[220px] flex-1 items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-pizarra-action text-pizarra-action-text">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-pizarra-subtext">
            Paso {index + 1} de {TOTAL_STEPS}
          </p>
          <h2 className="text-base font-bold text-pizarra-text">{def.title}</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-pizarra-subtext">
            {def.hint}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {prev && (
          <button
            type="button"
            onClick={() => onSelectStep(prev)}
            className={`${PAGER_BUTTON_CLASS} border-pizarra-border-control bg-pizarra-control text-pizarra-text-control hover:bg-pizarra-control-hover`}
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            {STEP_DEFINITIONS[prev].title}
          </button>
        )}
        {next ? (
          <button
            type="button"
            onClick={() => onSelectStep(next)}
            className={`${PAGER_BUTTON_CLASS} border-pizarra-action bg-pizarra-action text-pizarra-action-text hover:bg-pizarra-action-hover`}
          >
            {STEP_DEFINITIONS[next].title}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : (
          <Link
            href="/documentos"
            className={`${PAGER_BUTTON_CLASS} border-pizarra-action bg-pizarra-action text-pizarra-action-text hover:bg-pizarra-action-hover`}
          >
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            Ir a Documentos
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        )}
      </div>
    </section>
  );
}
