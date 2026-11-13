import { ALL_DIRECTIONS } from "@/domain/diagram/geometry";
import { GAS_SPECIFICATIONS } from "@/domain/ds66/gases";
import { COPPER_PIPE_BY_NOMINAL } from "@/domain/ds66/pipes";
import { DEFAULT_ROOM_HEIGHT_METERS } from "@/domain/ds66/rooms";
import { createExamReferenceProject } from "@/domain/fixtures/exam-reference";
import type {
  Appliance,
  CopperNominalDiameter,
  Direction,
  GasConfigId,
  InstallerProfile,
  ProjectData,
  Room,
  Segment,
} from "@/domain/types";

const VALID_DIRECTIONS = new Set<string>(ALL_DIRECTIONS);

const DRAFT_PROJECT_KEY = "deltagas-ds66-draft-project-v1";
const LEGACY_DRAFT_PROJECT_KEY = "redgas-ds66-draft-project-v1";
const DRAFT_INSTALLER_KEY = "deltagas-ds66-installer-profile-v1";
const LEGACY_DRAFT_INSTALLER_KEY = "redgas-ds66-installer-profile-v1";
const DRAFT_DAILY_LOG_KEY = "deltagas-ds66-daily-log-v1";
const LEGACY_DRAFT_DAILY_LOG_KEY = "redgas-ds66-daily-log-v1";

function readStorageWithLegacy(key: string, legacyKey: string): string | null {
  return window.localStorage.getItem(key) ?? window.localStorage.getItem(legacyKey);
}

export interface DailyChecklistDraft {
  selectedTasks: string[];
  notes: string;
  updatedAt: string;
}

export function createEmptyProject(): ProjectData {
  return {
    id: `proyecto-${Date.now()}`,
    name: "Nuevo proyecto de red de gas (DS 66)",
    gasType: "GLP",
    client: {
      ownerName: "",
      ownerRut: "",
      address: "",
      commune: "Santiago",
    },
    segments: [],
    appliances: [],
    rooms: [
      {
        id: "recinto-cocina",
        name: "Cocina",
        lengthMeters: 3.5,
        widthMeters: 3.0,
        heightMeters: DEFAULT_ROOM_HEIGHT_METERS,
        ventilationType: "directa",
      },
    ],
    hermeticity: {
      date: new Date().toISOString().slice(0, 10),
      installationType: "nueva",
      initialPressureMbar: 50,
      finalPressureMbar: 50,
      durationMinutes: null,
      manometer: {
        brand: "",
        model: "",
        range: "0 - 100 mbar",
        graduation: "0,5 mbar",
      },
    },
    cylinders: {
      builtAreaM2: 70,
      commune: "Santiago",
      designTempC: 0,
      cylinderTypeKg: 45,
      consumptionMode: "intermitente",
      calculationMethod: "vaporizacion",
    },
    updatedAt: new Date().toISOString(),
  };
}

function finitePositive(val: unknown, fallback: number, min = 0.01): number {
  return typeof val === "number" && Number.isFinite(val) && val >= min
    ? val
    : fallback;
}

function sanitizeSegments(rawSegments: unknown): Segment[] {
  if (!Array.isArray(rawSegments)) return [];
  const valid: Segment[] = [];
  for (const item of rawSegments) {
    if (!item || typeof item !== "object") continue;
    const seg = item as Partial<Segment>;
    if (
      typeof seg.id !== "string" ||
      !seg.id.trim() ||
      typeof seg.fromPointId !== "string" ||
      typeof seg.toPointId !== "string" ||
      !Array.isArray(seg.parts)
    ) {
      continue;
    }
    const parts = seg.parts
      .filter(
        (p): p is { direction: Direction; lengthCm: number } =>
          Boolean(p) &&
          typeof p.direction === "string" &&
          VALID_DIRECTIONS.has(p.direction) &&
          typeof p.lengthCm === "number" &&
          Number.isFinite(p.lengthCm) &&
          p.lengthCm > 0
      )
      .map((p) => ({
        direction: p.direction,
        lengthCm: Math.max(10, Math.round(p.lengthCm)),
      }));
    if (parts.length === 0) continue;

    const nominalDiameter: CopperNominalDiameter =
      typeof seg.nominalDiameter === "string" &&
      seg.nominalDiameter in COPPER_PIPE_BY_NOMINAL
        ? (seg.nominalDiameter as CopperNominalDiameter)
        : "1/2";

    valid.push({
      id: seg.id,
      fromPointId: seg.fromPointId,
      toPointId: seg.toPointId,
      parts,
      nominalDiameter,
      ...(typeof seg.equivalentLengthMeters === "number" &&
      Number.isFinite(seg.equivalentLengthMeters)
        ? { equivalentLengthMeters: seg.equivalentLengthMeters }
        : {}),
    });
  }
  return valid;
}

function sanitizeRooms(rawRooms: unknown): Room[] {
  if (!Array.isArray(rawRooms)) return [];
  const valid: Room[] = [];
  for (const item of rawRooms) {
    if (!item || typeof item !== "object") continue;
    const room = item as Partial<Room>;
    if (typeof room.id !== "string" || !room.id.trim()) continue;
    valid.push({
      id: room.id,
      name:
        typeof room.name === "string" && room.name.trim()
          ? room.name
          : "Recinto",
      lengthMeters: finitePositive(room.lengthMeters, 3, 0.5),
      widthMeters: finitePositive(room.widthMeters, 3, 0.5),
      heightMeters: finitePositive(
        room.heightMeters,
        DEFAULT_ROOM_HEIGHT_METERS,
        1.5
      ),
      ventilationType:
        room.ventilationType === "indirecta" ? "indirecta" : "directa",
    });
  }
  return valid;
}

function sanitizeAppliances(rawApps: unknown): Appliance[] {
  if (!Array.isArray(rawApps)) return [];
  const valid: Appliance[] = [];
  for (const item of rawApps) {
    if (!item || typeof item !== "object") continue;
    const app = item as Partial<Appliance>;
    if (
      typeof app.id !== "string" ||
      typeof app.segmentId !== "string" ||
      typeof app.powerMcalPerHour !== "number" ||
      !Number.isFinite(app.powerMcalPerHour)
    ) {
      continue;
    }
    valid.push({
      id: app.id,
      name: typeof app.name === "string" && app.name.trim() ? app.name : app.id,
      segmentId: app.segmentId,
      catalogId: app.catalogId,
      applianceClass: app.applianceClass ?? "otro",
      circuitType:
        app.circuitType === "B" || app.circuitType === "C"
          ? app.circuitType
          : "A",
      powerMcalPerHour: Math.max(0.1, app.powerMcalPerHour),
      quantity: finitePositive(app.quantity, 1, 1),
      roomId: typeof app.roomId === "string" ? app.roomId : undefined,
      labelOffsetMeters: app.labelOffsetMeters,
      datasheet: app.datasheet,
    });
  }
  return valid;
}

export function sanitizeProjectData(parsed: unknown): ProjectData | null {
  if (!parsed || typeof parsed !== "object") return null;
  const candidate = parsed as Partial<ProjectData>;
  if (
    typeof candidate.gasType !== "string" ||
    !(candidate.gasType in GAS_SPECIFICATIONS) ||
    !Array.isArray(candidate.segments)
  ) {
    return null;
  }

  const sanitizedSegments = sanitizeSegments(candidate.segments);
  // Si había tramos guardados pero ninguno sobrevivió al esquema actual, regenerar ejemplo válido
  if (candidate.segments.length > 0 && sanitizedSegments.length === 0) {
    return null;
  }
  // Si el proyecto de examen quedó sin tramos accidentalmente, restaurar ejemplo de examen
  if (
    candidate.id === "proyecto-examen-ds66" &&
    sanitizedSegments.length === 0
  ) {
    return null;
  }

  const defaults = createEmptyProject();
  return {
    id:
      typeof candidate.id === "string" && candidate.id.trim()
        ? candidate.id
        : defaults.id,
    name:
      typeof candidate.name === "string" && candidate.name.trim()
        ? candidate.name
        : defaults.name,
    gasType: candidate.gasType as GasConfigId,
    client: {
      ...defaults.client,
      ...(candidate.client && typeof candidate.client === "object"
        ? candidate.client
        : {}),
    },
    segments: sanitizedSegments,
    appliances: sanitizeAppliances(candidate.appliances),
    rooms: sanitizeRooms(candidate.rooms),
    hermeticity: {
      ...defaults.hermeticity,
      ...(candidate.hermeticity && typeof candidate.hermeticity === "object"
        ? candidate.hermeticity
        : {}),
      manometer: {
        ...defaults.hermeticity.manometer,
        ...(candidate.hermeticity?.manometer &&
        typeof candidate.hermeticity.manometer === "object"
          ? candidate.hermeticity.manometer
          : {}),
      },
    },
    cylinders: {
      ...defaults.cylinders,
      ...(candidate.cylinders && typeof candidate.cylinders === "object"
        ? candidate.cylinders
        : {}),
    },
    updatedAt:
      typeof candidate.updatedAt === "string"
        ? candidate.updatedAt
        : defaults.updatedAt,
  };
}

export function loadDraftProject(): ProjectData {
  if (typeof window === "undefined") {
    return createExamReferenceProject();
  }
  try {
    const raw = readStorageWithLegacy(DRAFT_PROJECT_KEY, LEGACY_DRAFT_PROJECT_KEY);
    if (!raw) return createExamReferenceProject();
    const parsed = JSON.parse(raw) as unknown;
    return sanitizeProjectData(parsed) ?? createExamReferenceProject();
  } catch {
    return createExamReferenceProject();
  }
}

export function saveDraftProject(project: ProjectData): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DRAFT_PROJECT_KEY, JSON.stringify(project));
  } catch {
    // Ignorar error si almacenamiento local está lleno
  }
}

export function createEmptyInstallerProfile(): InstallerProfile {
  return {
    fullName: "",
    rut: "",
    phone: "",
    email: "",
    installerClass: "3",
    secRegistrationNumber: "",
    companyName: "",
  };
}

export function loadInstallerProfileDraft(): InstallerProfile {
  if (typeof window === "undefined") {
    return createEmptyInstallerProfile();
  }
  try {
    const raw = readStorageWithLegacy(
      DRAFT_INSTALLER_KEY,
      LEGACY_DRAFT_INSTALLER_KEY
    );
    if (!raw) return createEmptyInstallerProfile();
    return {
      ...createEmptyInstallerProfile(),
      ...(JSON.parse(raw) as Partial<InstallerProfile>),
    };
  } catch {
    return createEmptyInstallerProfile();
  }
}

export function saveInstallerProfileDraft(profile: InstallerProfile): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DRAFT_INSTALLER_KEY, JSON.stringify(profile));
  } catch {
    // Ignorar error de cuota
  }
}

export function loadDailyChecklistDraft(): DailyChecklistDraft {
  if (typeof window === "undefined") {
    return { selectedTasks: [], notes: "", updatedAt: "" };
  }
  try {
    const raw = readStorageWithLegacy(
      DRAFT_DAILY_LOG_KEY,
      LEGACY_DRAFT_DAILY_LOG_KEY
    );
    if (!raw) return { selectedTasks: [], notes: "", updatedAt: "" };
    return JSON.parse(raw) as DailyChecklistDraft;
  } catch {
    return { selectedTasks: [], notes: "", updatedAt: "" };
  }
}

export function saveDailyChecklistDraft(draft: DailyChecklistDraft): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DRAFT_DAILY_LOG_KEY, JSON.stringify(draft));
  } catch {
    // Ignorar
  }
}
