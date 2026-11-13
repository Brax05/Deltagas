"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  GitBranch,
  Calculator,
  DoorOpen,
  FilePlus2,
  BookOpen,
  ChevronDown,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import {
  calculateNetwork,
  generateNetworkSuggestions,
  evaluateRooms,
  evaluateHermeticity,
  evaluateGlpCylinders,
} from "@/domain/calculations";
import {
  validateDiagram,
  createInitialHistory,
  applyAddSegment,
  applyUpdateSegmentParts,
  applyAddSegmentBend,
  applyChangeSegmentDiameter,
  applyDeleteSegmentWithSubtree,
  undoNetworkHistory,
  redoNetworkHistory,
  getNextPointLabel,
  getNextSegmentId,
  type NetworkHistoryState,
} from "@/domain/diagram";
import { DIAGRAM_EXAMPLES } from "@/domain/fixtures/examples";
import {
  createEmptyProject,
  loadDraftProject,
  saveDraftProject,
} from "@/lib/storage/draft";
import type {
  Appliance,
  CopperNominalDiameter,
  Direction,
  GasConfigId,
  GlpCylindersInput,
  HermeticityTestInput,
  ProjectData,
  Room,
  Segment,
} from "@/domain/types";
import { NetworkDiagram } from "@/components/diagram/NetworkDiagram";
import { NetworkPanel } from "@/components/network/NetworkPanel";
import { ResultsTab } from "@/components/results/ResultsTab";
import { RoomsTab } from "@/components/rooms/RoomsTab";

type WorkspaceTab = "red" | "resultados" | "recintos";

interface WorkspaceState {
  hydrated: boolean;
  viewResetKey: number;
  project: ProjectData;
  history: NetworkHistoryState;
  selectedSegmentId: string | null;
  selectedPointId: string | null;
}

function buildInitialWorkspace(): WorkspaceState {
  const initialEmpty = createEmptyProject({ deterministic: true });
  return {
    hydrated: false,
    viewResetKey: 0,
    project: initialEmpty,
    history: createInitialHistory({
      segments: initialEmpty.segments,
      appliances: initialEmpty.appliances,
    }),
    selectedSegmentId: null,
    selectedPointId: null,
  };
}

export function GasWorkspace() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("red");
  const [workspace, setWorkspace] = useState<WorkspaceState>(buildInitialWorkspace);
  const [examplesMenuOpen, setExamplesMenuOpen] = useState(false);
  const examplesMenuRef = useRef<HTMLDivElement | null>(null);

  const { hydrated, viewResetKey, project, history, selectedSegmentId, selectedPointId } =
    workspace;

  useEffect(() => {
    const saved = loadDraftProject();
    setWorkspace({
      hydrated: true,
      viewResetKey: 1,
      project: saved,
      history: createInitialHistory({
        segments: saved.segments,
        appliances: saved.appliances,
      }),
      selectedSegmentId: saved.segments[0]?.id ?? null,
      selectedPointId: null,
    });
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveDraftProject(project);
  }, [project, hydrated]);

  useEffect(() => {
    if (!examplesMenuOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (
        examplesMenuRef.current &&
        !examplesMenuRef.current.contains(e.target as Node)
      ) {
        setExamplesMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExamplesMenuOpen(false);
    };
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [examplesMenuOpen]);

  const updateProject = (updater: (prev: ProjectData) => ProjectData) => {
    setWorkspace((prev) => ({
      ...prev,
      project: updater(prev.project),
    }));
  };

  const commitHistory = (
    updater: (prev: NetworkHistoryState) => NetworkHistoryState
  ) => {
    setWorkspace((prev) => {
      const nextHistory = updater(prev.history);
      if (nextHistory === prev.history) return prev;
      const nextProject =
        nextHistory.present !== prev.history.present
          ? {
              ...prev.project,
              segments: nextHistory.present.segments,
              appliances: nextHistory.present.appliances,
              updatedAt: new Date().toISOString(),
            }
          : prev.project;
      return {
        ...prev,
        project: nextProject,
        history: nextHistory,
      };
    });
  };

  const calculation = useMemo(
    () =>
      calculateNetwork({
        gasType: project.gasType,
        segments: project.segments,
        appliances: project.appliances,
      }),
    [project.gasType, project.segments, project.appliances]
  );

  const diagramValidation = useMemo(
    () => validateDiagram(project.segments),
    [project.segments]
  );

  const roomEvaluations = useMemo(
    () =>
      evaluateRooms({
        gasType: project.gasType,
        rooms: project.rooms,
        appliances: project.appliances,
      }),
    [project.gasType, project.rooms, project.appliances]
  );

  const suggestions = useMemo(
    () =>
      generateNetworkSuggestions({
        gasType: project.gasType,
        segments: project.segments,
        appliances: project.appliances,
        rooms: project.rooms,
      }),
    [project.gasType, project.segments, project.appliances, project.rooms]
  );

  const hermeticityEval = useMemo(
    () =>
      evaluateHermeticity({
        networkResult: calculation,
        input: project.hermeticity,
      }),
    [calculation, project.hermeticity]
  );

  const cylindersEval = useMemo(
    () =>
      evaluateGlpCylinders({
        totalInstalledPowerKw: calculation.totalPowerKw,
        input: project.cylinders,
      }),
    [calculation.totalPowerKw, project.cylinders]
  );

  const handleLoadProject = (nextProj: ProjectData) => {
    setWorkspace((prev) => ({
      hydrated: prev.hydrated,
      viewResetKey: prev.viewResetKey + 1,
      project: nextProj,
      history: createInitialHistory({
        segments: nextProj.segments,
        appliances: nextProj.appliances,
      }),
      selectedSegmentId: nextProj.segments[0]?.id ?? null,
      selectedPointId: null,
    }));
  };

  const handleAddSegmentWithAppliance = (params: {
    segment: Segment;
    appliance?: Omit<Appliance, "id" | "segmentId"> & { id?: string };
  }) => {
    setWorkspace((prev) => {
      const nextBase = applyAddSegment(prev.history, params.segment);
      if (nextBase.lastRejectionReason !== null) {
        return { ...prev, history: nextBase };
      }

      const nextHistory: NetworkHistoryState = params.appliance
        ? {
            ...nextBase,
            present: {
              ...nextBase.present,
              appliances: [
                ...nextBase.present.appliances,
                {
                  ...params.appliance,
                  id:
                    params.appliance.id ??
                    `app-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                  segmentId: params.segment.id,
                },
              ],
            },
          }
        : nextBase;

      return {
        ...prev,
        history: nextHistory,
        project: {
          ...prev.project,
          segments: nextHistory.present.segments,
          appliances: nextHistory.present.appliances,
          updatedAt: new Date().toISOString(),
        },
        selectedSegmentId: params.segment.id,
        selectedPointId: params.segment.toPointId,
      };
    });
  };

  const handleQuickAddFromPoint = (params: {
    fromPointId: string;
    direction: Direction;
    lengthCm: number;
    nominalDiameter: CopperNominalDiameter;
    appliance?: {
      catalogId: string;
      name: string;
      applianceClass: Appliance["applianceClass"];
      circuitType: Appliance["circuitType"];
      powerMcalPerHour: number;
      roomLengthMeters: number;
      roomWidthMeters: number;
      roomHeightMeters: number;
    };
  }) => {
    setWorkspace((prev) => {
      const segId = getNextSegmentId(prev.history.present.segments);
      const toPointId = getNextPointLabel(prev.history.present.segments);
      const newSeg: Segment = {
        id: segId,
        fromPointId: params.fromPointId,
        toPointId,
        parts: [
          {
            direction: params.direction,
            lengthCm: Math.max(10, Math.round(params.lengthCm / 10) * 10),
          },
        ],
        nominalDiameter: params.nominalDiameter,
      };
      const nextBase = applyAddSegment(prev.history, newSeg);
      if (nextBase.lastRejectionReason !== null) {
        return { ...prev, history: nextBase };
      }

      let nextRooms = prev.project.rooms;
      let nextHistory = nextBase;

      if (params.appliance) {
        const roomId = `recinto-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
        const newRoom: Room = {
          id: roomId,
          name: `Recinto ${toPointId}`,
          lengthMeters: params.appliance.roomLengthMeters,
          widthMeters: params.appliance.roomWidthMeters,
          heightMeters: params.appliance.roomHeightMeters,
          ventilationType: "directa",
        };
        nextRooms = [...prev.project.rooms, newRoom];
        nextHistory = {
          ...nextBase,
          present: {
            ...nextBase.present,
            appliances: [
              ...nextBase.present.appliances,
              {
                id: `app-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                name: params.appliance.name,
                segmentId: segId,
                catalogId: params.appliance.catalogId,
                applianceClass: params.appliance.applianceClass,
                circuitType: params.appliance.circuitType,
                powerMcalPerHour: params.appliance.powerMcalPerHour,
                quantity: 1,
                roomId,
              },
            ],
          },
        };
      }

      return {
        ...prev,
        history: nextHistory,
        project: {
          ...prev.project,
          rooms: nextRooms,
          segments: nextHistory.present.segments,
          appliances: nextHistory.present.appliances,
          updatedAt: new Date().toISOString(),
        },
        selectedSegmentId: segId,
        selectedPointId: toPointId,
      };
    });
  };

  const handleMoveSegmentLastPart = (
    segmentId: string,
    direction: Direction,
    lengthCm: number
  ) => {
    const safeCm = Math.max(10, Math.round(lengthCm / 10) * 10);
    commitHistory((prev) => {
      const seg = prev.present.segments.find((s) => s.id === segmentId);
      if (!seg || seg.parts.length === 0) return prev;
      const nextParts = seg.parts.map((part, idx) =>
        idx === seg.parts.length - 1 ? { direction, lengthCm: safeCm } : part
      );
      return applyUpdateSegmentParts(prev, segmentId, nextParts);
    });
  };

  const handleSetSingleLengthCm = (
    segmentId: string,
    partIndex: number,
    lengthCm: number
  ) => {
    commitHistory((prev) => {
      const seg = prev.present.segments.find((s) => s.id === segmentId);
      if (!seg) return prev;
      const nextParts = seg.parts.map((part, idx) =>
        idx === partIndex ? { ...part, lengthCm } : part
      );
      return applyUpdateSegmentParts(prev, segmentId, nextParts);
    });
  };

  const handleAddApplianceToSegment = (
    segmentId: string,
    appliance: Omit<Appliance, "id" | "segmentId">
  ) => {
    const newApp: Appliance = {
      ...appliance,
      id: `app-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      segmentId,
    };

    commitHistory((prev) => ({
      past: [...prev.past.slice(-39), prev.present],
      present: {
        ...prev.present,
        appliances: [...prev.present.appliances, newApp],
      },
      future: [],
      lastRejectionReason: null,
      blockingSegmentId: null,
    }));
  };

  const handleUpdateAppliance = (updated: Appliance) => {
    commitHistory((prev) => ({
      past: [...prev.past.slice(-39), prev.present],
      present: {
        ...prev.present,
        appliances: prev.present.appliances.map((app) =>
          app.id === updated.id ? updated : app
        ),
      },
      future: [],
      lastRejectionReason: null,
      blockingSegmentId: null,
    }));
  };

  const handleDeleteAppliance = (applianceId: string) => {
    commitHistory((prev) => ({
      past: [...prev.past.slice(-39), prev.present],
      present: {
        ...prev.present,
        appliances: prev.present.appliances.filter(
          (app) => app.id !== applianceId
        ),
      },
      future: [],
      lastRejectionReason: null,
      blockingSegmentId: null,
    }));
  };

  const handleDeleteSegmentWithSubtree = (segmentId: string) => {
    setWorkspace((prev) => {
      const nextHistory = applyDeleteSegmentWithSubtree(prev.history, segmentId);
      return {
        ...prev,
        history: nextHistory,
        project: {
          ...prev.project,
          segments: nextHistory.present.segments,
          appliances: nextHistory.present.appliances,
          updatedAt: new Date().toISOString(),
        },
        selectedSegmentId:
          prev.selectedSegmentId === segmentId ? null : prev.selectedSegmentId,
      };
    });
  };

  const handleApplyAllDiameterSuggestions = () => {
    if (suggestions.diameterChanges.length === 0) return;
    const latestBySegment = new Map<string, CopperNominalDiameter>();
    for (const ch of suggestions.diameterChanges) {
      latestBySegment.set(ch.segmentId, ch.toDiameter);
    }

    commitHistory((prev) => ({
      past: [...prev.past.slice(-39), prev.present],
      present: {
        ...prev.present,
        segments: prev.present.segments.map((s) => {
          const upgraded = latestBySegment.get(s.id);
          return upgraded ? { ...s, nominalDiameter: upgraded } : s;
        }),
      },
      future: [],
      lastRejectionReason: null,
      blockingSegmentId: null,
    }));
  };

  const handleAssignApplianceRoom = (
    applianceId: string,
    roomId: string | undefined
  ) => {
    commitHistory((prev) => ({
      past: [...prev.past.slice(-39), prev.present],
      present: {
        ...prev.present,
        appliances: prev.present.appliances.map((app) =>
          app.id === applianceId ? { ...app, roomId } : app
        ),
      },
      future: [],
      lastRejectionReason: null,
      blockingSegmentId: null,
    }));
  };

  const handleAddRoom = (room: Room) => {
    updateProject((prev) => ({
      ...prev,
      rooms: [...prev.rooms, room],
      updatedAt: new Date().toISOString(),
    }));
  };

  const handleUpdateRoom = (room: Room) => {
    updateProject((prev) => ({
      ...prev,
      rooms: prev.rooms.map((r) => (r.id === room.id ? room : r)),
      updatedAt: new Date().toISOString(),
    }));
  };

  const handleCreateAndAssignRoom = (applianceId: string, room: Room) => {
    setWorkspace((prev) => {
      const nextAppliances = prev.history.present.appliances.map((app) =>
        app.id === applianceId ? { ...app, roomId: room.id } : app
      );
      const nextHistory: NetworkHistoryState = {
        past: [...prev.history.past.slice(-39), prev.history.present],
        present: {
          ...prev.history.present,
          appliances: nextAppliances,
        },
        future: [],
        lastRejectionReason: null,
        blockingSegmentId: null,
      };
      return {
        ...prev,
        history: nextHistory,
        project: {
          ...prev.project,
          rooms: [...prev.project.rooms, room],
          appliances: nextAppliances,
          updatedAt: new Date().toISOString(),
        },
      };
    });
  };

  const handleDeleteRoom = (roomId: string) => {
    setWorkspace((prev) => {
      const nextAppliances = prev.history.present.appliances.map((a) =>
        a.roomId === roomId ? { ...a, roomId: undefined } : a
      );
      return {
        ...prev,
        history: {
          ...prev.history,
          present: {
            ...prev.history.present,
            appliances: nextAppliances,
          },
        },
        project: {
          ...prev.project,
          rooms: prev.project.rooms.filter((r) => r.id !== roomId),
          appliances: nextAppliances,
          updatedAt: new Date().toISOString(),
        },
      };
    });
  };

  const setSelectedSegmentId = (segId: string | null) => {
    setWorkspace((prev) => ({ ...prev, selectedSegmentId: segId }));
  };

  const setSelectedPointId = (ptId: string | null) => {
    setWorkspace((prev) => ({ ...prev, selectedPointId: ptId }));
  };

  if (!hydrated) {
    return (
      <div className="rounded-xl border border-pizarra-border bg-pizarra-surface p-6 text-center text-xs font-medium text-pizarra-subtext shadow-sm">
        Cargando proyecto de red de gas...
      </div>
    );
  }

  const failingRoomsCount = roomEvaluations.filter(
    (r) => !r.overallCompliant
  ).length;

  return (
    <div className="space-y-4">
      {/* Barra superior de proyecto + 3 pestañas principales (Sección 9) */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3 rounded-xl border border-pizarra-border bg-pizarra-surface p-3 shadow-sm">
        <div className="min-w-[220px] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-sm font-bold text-pizarra-text sm:text-base">
              {project.name}
            </h1>
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                project.segments.length === 0
                  ? "border-pizarra-border bg-pizarra-secondary text-pizarra-subtext"
                  : calculation.allCompliant &&
                      !calculation.hasOutOfRangeSegments &&
                      diagramValidation.valid
                    ? "border-status-ok-border bg-status-ok-bg text-status-ok-text"
                    : "border-status-error-border bg-status-error-bg text-status-error-text"
              }`}
            >
              {project.segments.length === 0 ? (
                <>Listo para trazar</>
              ) : calculation.allCompliant &&
                !calculation.hasOutOfRangeSegments &&
                diagramValidation.valid ? (
                <>
                  <CheckCircle2 className="h-3 w-3 text-status-ok-text" />
                  Red cumple
                </>
              ) : (
                <>
                  <AlertTriangle className="h-3 w-3 text-status-error-text" />
                  Revisar red
                </>
              )}
            </span>
          </div>
          <p className="mt-0.5 text-xs tabular-nums text-pizarra-subtext">
            {project.segments.length} tramo(s) ·{" "}
            {calculation.totalPowerMcalH.toFixed(1)} Mcal/h (
            {calculation.totalPowerKw.toFixed(2)} kW) · Guardado automático local
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div ref={examplesMenuRef} className="relative">
            <button
              type="button"
              aria-expanded={examplesMenuOpen}
              aria-haspopup="menu"
              onClick={() => setExamplesMenuOpen((open) => !open)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-pizarra-border-control bg-pizarra-control px-2.5 py-1.5 text-xs font-semibold text-pizarra-text-control transition-colors hover:bg-pizarra-control-hover"
            >
              <BookOpen className="h-3.5 w-3.5 text-pizarra-link" />
              Diagramas de ejemplo
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${
                  examplesMenuOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {examplesMenuOpen && (
              <div
                role="menu"
                aria-label="Diagramas de ejemplo disponibles"
                className="absolute left-0 z-30 mt-1.5 w-80 max-w-[90vw] rounded-xl border border-pizarra-border bg-pizarra-surface p-2 shadow-md sm:right-0 sm:left-auto"
              >
                <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-pizarra-subtext">
                  Cargar diagrama a escala real
                </p>
                <div className="mt-1 space-y-1">
                  {DIAGRAM_EXAMPLES.map((example) => (
                    <button
                      key={example.id}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        handleLoadProject(example.createProject());
                        setActiveTab("red");
                        setExamplesMenuOpen(false);
                      }}
                      className="w-full rounded-lg border border-transparent p-2 text-left transition-colors hover:border-pizarra-border hover:bg-pizarra-secondary"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-pizarra-text">
                          {example.title}
                        </span>
                        <span className="shrink-0 rounded border border-pizarra-border bg-pizarra-control px-1.5 py-0.5 text-[10px] font-semibold text-pizarra-link">
                          {example.badge}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] leading-snug text-pizarra-subtext">
                        {example.description}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setExamplesMenuOpen(false);
              handleLoadProject(createEmptyProject());
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-pizarra-border-control bg-pizarra-control px-2.5 py-1.5 text-xs font-semibold text-pizarra-text-control transition-colors hover:bg-pizarra-control-hover"
          >
            <FilePlus2 className="h-3.5 w-3.5" />
            Nuevo vacío
          </button>

          <div
            role="tablist"
            aria-label="Secciones de cálculo"
            className="flex rounded-lg border border-pizarra-border bg-pizarra-secondary p-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "red"}
              onClick={() => setActiveTab("red")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition sm:text-sm ${
                activeTab === "red"
                  ? "bg-pizarra-action text-pizarra-action-text hover:bg-pizarra-action-hover"
                  : "text-pizarra-subtext hover:text-pizarra-text"
              }`}
            >
              <GitBranch className="h-3.5 w-3.5" />
              Red
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "resultados"}
              onClick={() => setActiveTab("resultados")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition sm:text-sm ${
                activeTab === "resultados"
                  ? "bg-pizarra-action text-pizarra-action-text hover:bg-pizarra-action-hover"
                  : "text-pizarra-subtext hover:text-pizarra-text"
              }`}
            >
              <Calculator className="h-3.5 w-3.5" />
              Resultados
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "recintos"}
              onClick={() => setActiveTab("recintos")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition sm:text-sm ${
                activeTab === "recintos"
                  ? "bg-pizarra-action text-pizarra-action-text hover:bg-pizarra-action-hover"
                  : "text-pizarra-subtext hover:text-pizarra-text"
              }`}
            >
              <DoorOpen className="h-3.5 w-3.5" />
              Recintos
              {failingRoomsCount > 0 && (
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                    activeTab === "recintos"
                      ? "bg-pizarra-surface text-pizarra-link"
                      : "animate-badge-error border border-status-error-border bg-status-error-bg text-status-error-text"
                  }`}
                >
                  {failingRoomsCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Pestaña 1: Red (móvil: dibujo arriba + panel abajo; escritorio: lado a lado) */}
      {activeTab === "red" && (
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-12 lg:items-start">
          <div className="lg:col-span-7 xl:col-span-8">
            <NetworkDiagram
              gasType={project.gasType}
              segments={project.segments}
              appliances={project.appliances}
              rooms={project.rooms}
              roomEvaluations={roomEvaluations}
              validation={diagramValidation}
              calculation={calculation}
              selectedSegmentId={selectedSegmentId}
              selectedPointId={selectedPointId}
              blockingSegmentId={history.blockingSegmentId}
              rejectionReason={history.lastRejectionReason}
              canUndo={history.past.length > 0}
              canRedo={history.future.length > 0}
              viewResetKey={viewResetKey}
              onSelectSegment={(segId) => {
                setWorkspace((prev) => {
                  const found = segId
                    ? prev.project.segments.find((s) => s.id === segId)
                    : null;
                  return {
                    ...prev,
                    selectedSegmentId: segId,
                    selectedPointId: found ? found.toPointId : prev.selectedPointId,
                  };
                });
              }}
              onSelectPoint={setSelectedPointId}
              onQuickAddFromPoint={handleQuickAddFromPoint}
              onMoveSegmentLastPart={handleMoveSegmentLastPart}
              onUpdateAppliance={handleUpdateAppliance}
              onDeleteAppliance={handleDeleteAppliance}
              onUpdateRoom={handleUpdateRoom}
              onCreateAndAssignRoom={handleCreateAndAssignRoom}
              onAssignApplianceRoom={handleAssignApplianceRoom}
              onUndo={() => commitHistory(undoNetworkHistory)}
              onRedo={() => commitHistory(redoNetworkHistory)}
            />
          </div>

          <div className="lg:col-span-5 xl:col-span-4">
            <NetworkPanel
              gasType={project.gasType}
              segments={project.segments}
              appliances={project.appliances}
              rooms={project.rooms}
              roomEvaluations={roomEvaluations}
              calculation={calculation}
              selectedSegmentId={selectedSegmentId}
              onChangeGasType={(gasType: GasConfigId) =>
                updateProject((prev) => ({
                  ...prev,
                  gasType,
                  updatedAt: new Date().toISOString(),
                }))
              }
              onSelectSegment={setSelectedSegmentId}
              onAddSegmentWithAppliance={handleAddSegmentWithAppliance}
              onSetSingleLengthCm={handleSetSingleLengthCm}
              onChangeDiameter={(segmentId, diameter) =>
                commitHistory((prev) =>
                  applyChangeSegmentDiameter(prev, segmentId, diameter)
                )
              }
              onAddBend={(segmentId, dir, lengthCm) =>
                commitHistory((prev) =>
                  applyAddSegmentBend(prev, segmentId, dir, lengthCm)
                )
              }
              onAddApplianceToSegment={handleAddApplianceToSegment}
              onUpdateAppliance={handleUpdateAppliance}
              onDeleteAppliance={handleDeleteAppliance}
              onDeleteSegmentWithSubtree={handleDeleteSegmentWithSubtree}
              onUpdateRoom={handleUpdateRoom}
              onCreateAndAssignRoom={handleCreateAndAssignRoom}
              onAssignApplianceRoom={handleAssignApplianceRoom}
            />
          </div>
        </div>
      )}

      {/* Pestaña 2: Resultados completos + Módulo 3 + Módulo 4 */}
      {activeTab === "resultados" && (
        <ResultsTab
          project={project}
          calculation={calculation}
          suggestions={suggestions}
          hermeticityEval={hermeticityEval}
          cylindersEval={cylindersEval}
          roomEvaluations={roomEvaluations}
          diagramValid={diagramValidation.valid}
          onSelectSegmentAndGoRed={(segmentId) => {
            setSelectedSegmentId(segmentId);
            setActiveTab("red");
          }}
          onApplyDiameterChange={(segmentId, diameter) =>
            commitHistory((prev) =>
              applyChangeSegmentDiameter(prev, segmentId, diameter)
            )
          }
          onApplyAllDiameterSuggestions={handleApplyAllDiameterSuggestions}
          onUpdateProjectMeta={(patch) =>
            updateProject((prev) => ({
              ...prev,
              ...patch,
              updatedAt: new Date().toISOString(),
            }))
          }
          onUpdateHermeticity={(next: HermeticityTestInput) =>
            updateProject((prev) => ({
              ...prev,
              hermeticity: next,
              updatedAt: new Date().toISOString(),
            }))
          }
          onUpdateCylinders={(next: GlpCylindersInput) =>
            updateProject((prev) => ({
              ...prev,
              cylinders: next,
              updatedAt: new Date().toISOString(),
            }))
          }
        />
      )}

      {/* Pestaña 3: Recintos (Módulo 2) */}
      {activeTab === "recintos" && (
        <RoomsTab
          gasType={project.gasType}
          rooms={project.rooms}
          appliances={project.appliances}
          evaluations={roomEvaluations}
          onAddRoom={handleAddRoom}
          onUpdateRoom={handleUpdateRoom}
          onDeleteRoom={handleDeleteRoom}
          onAssignApplianceRoom={handleAssignApplianceRoom}
        />
      )}
    </div>
  );
}
