import { APPLIANCE_CATALOG_TABLA_V } from "@/domain/ds66/appliances";
import { getNextLargerDiameter } from "@/domain/ds66/pipes";
import { calculateNetwork } from "@/domain/calculations/network";
import { evaluateRooms } from "@/domain/calculations/rooms";
import type {
  Appliance,
  CopperNominalDiameter,
  GasConfigId,
  Room,
  Segment,
} from "@/domain/types";

export interface DiameterChangeSuggestion {
  segmentId: string;
  fromDiameter: CopperNominalDiameter;
  toDiameter: CopperNominalDiameter;
  partialDropBeforePa: number | null;
  partialDropAfterPa: number | null;
}

export interface SmallerApplianceSuggestion {
  failingApplianceId: string;
  failingApplianceName: string;
  currentPowerMcalH: number;
  alternatives: Array<{
    catalogId: string;
    name: string;
    powerMcalPerHour: number;
  }>;
}

export interface RoomRedistributionSuggestion {
  roomId: string;
  roomName: string;
  status: "excede" | "con_holgura" | "justo";
  summary: string;
}

export interface NetworkSuggestionsResult {
  diameterChanges: DiameterChangeSuggestion[];
  resultingCompliant: boolean;
  smallerAppliances: SmallerApplianceSuggestion[];
  roomRedistribution: RoomRedistributionSuggestion[];
}

/**
 * Sugerencias cuando la red no cumple (Sección 5.2):
 * 1. Aumentar diámetro del tramo que más pérdida aporta, repitiendo hasta cumplir.
 * 2. Artefacto de menor consumo en el catálogo.
 * 3. Revisión de capacidad por recinto (Módulo 2).
 */
export function generateNetworkSuggestions(params: {
  gasType: GasConfigId;
  segments: Segment[];
  appliances: Appliance[];
  rooms: Room[];
}): NetworkSuggestionsResult {
  const initialCalc = calculateNetwork({
    gasType: params.gasType,
    segments: params.segments,
    appliances: params.appliances,
  });

  const diameterChanges: DiameterChangeSuggestion[] = [];
  const workingSegments: Segment[] = params.segments.map((s) => ({ ...s }));
  let workingCalc = initialCalc;
  let guard = 0;

  while (!workingCalc.allCompliant && guard < 40) {
    guard++;
    const failingPathIds = new Set<string>();
    for (const app of Object.values(workingCalc.appliances)) {
      if (!app.compliant) {
        let cur: string | undefined = app.segmentId;
        while (cur) {
          failingPathIds.add(cur);
          const segObj = workingSegments.find((s) => s.id === cur);
          if (!segObj || segObj.fromPointId === "S") break;
          cur = workingSegments.find((s) => s.toPointId === segObj.fromPointId)?.id;
        }
      }
    }

    // Buscar el tramo en rutas que fallan con mayor pérdida parcial (o fuera de tabla) que aún pueda subir diámetro
    let bestCandidate: {
      seg: Segment;
      nextDiameter: CopperNominalDiameter;
      score: number;
      beforePa: number | null;
    } | null = null;

    for (const segId of failingPathIds) {
      const seg = workingSegments.find((s) => s.id === segId);
      const segRes = workingCalc.segments[segId];
      if (!seg || !segRes) continue;
      const nextDiameter = getNextLargerDiameter(seg.nominalDiameter);
      if (!nextDiameter) continue;

      const score =
        segRes.partialDropTablePa !== null
          ? segRes.partialDropTablePa
          : 100000 + segRes.partialDropFormulaPa;

      if (!bestCandidate || score > bestCandidate.score) {
        bestCandidate = {
          seg,
          nextDiameter,
          score,
          beforePa: segRes.partialDropTablePa,
        };
      }
    }

    if (!bestCandidate) break;

    const prevDiameter = bestCandidate.seg.nominalDiameter;
    bestCandidate.seg.nominalDiameter = bestCandidate.nextDiameter;

    workingCalc = calculateNetwork({
      gasType: params.gasType,
      segments: workingSegments,
      appliances: params.appliances,
    });

    const afterPa = workingCalc.segments[bestCandidate.seg.id]?.partialDropTablePa ?? null;
    diameterChanges.push({
      segmentId: bestCandidate.seg.id,
      fromDiameter: prevDiameter,
      toDiameter: bestCandidate.nextDiameter,
      partialDropBeforePa: bestCandidate.beforePa,
      partialDropAfterPa: afterPa,
    });
  }

  // 2. Artefactos de menor consumo
  const smallerAppliances: SmallerApplianceSuggestion[] = [];
  if (!initialCalc.allCompliant) {
    for (const app of params.appliances) {
      const appRes = initialCalc.appliances[app.id];
      if (!appRes || appRes.compliant) continue;

      const candidates = APPLIANCE_CATALOG_TABLA_V.filter(
        (cat) =>
          cat.applianceClass === app.applianceClass &&
          cat.powerMcalPerHour < app.powerMcalPerHour
      ).sort((a, b) => b.powerMcalPerHour - a.powerMcalPerHour);

      const workingAlternatives: SmallerApplianceSuggestion["alternatives"] = [];
      for (const cand of candidates) {
        const modifiedAppliances = params.appliances.map((item) =>
          item.id === app.id
            ? { ...item, powerMcalPerHour: cand.powerMcalPerHour }
            : item
        );
        const testCalc = calculateNetwork({
          gasType: params.gasType,
          segments: params.segments,
          appliances: modifiedAppliances,
        });
        if (testCalc.appliances[app.id]?.compliant) {
          workingAlternatives.push({
            catalogId: cand.id,
            name: cand.name,
            powerMcalPerHour: cand.powerMcalPerHour,
          });
        }
      }

      if (workingAlternatives.length > 0) {
        smallerAppliances.push({
          failingApplianceId: app.id,
          failingApplianceName: app.name,
          currentPowerMcalH: app.powerMcalPerHour,
          alternatives: workingAlternatives,
        });
      }
    }
  }

  // 3. Revisión de recintos (Módulo 2)
  const roomEvals = evaluateRooms({
    gasType: params.gasType,
    rooms: params.rooms,
    appliances: params.appliances,
  });

  const roomRedistribution: RoomRedistributionSuggestion[] = roomEvals.map(
    (room) => {
      if (!room.overallCompliant) {
        return {
          roomId: room.roomId,
          roomName: room.roomName,
          status: "excede",
          summary: `No cumple (${room.realVolumeM3.toFixed(1)} m³ real vs ${room.requiredVolumeM3.toFixed(1)} m³ mínimo). Reducir artefactos o aumentar recinto.`,
        };
      }
      const margin = room.realVolumeM3 - room.requiredVolumeM3;
      if (margin >= 6) {
        return {
          roomId: room.roomId,
          roomName: room.roomName,
          status: "con_holgura",
          summary: `Tiene holgura de ${margin.toFixed(1)} m³ para recibir otro artefacto.`,
        };
      }
      return {
        roomId: room.roomId,
        roomName: room.roomName,
        status: "justo",
        summary: `Cumple con margen ajustado (${margin.toFixed(1)} m³).`,
      };
    }
  );

  return {
    diameterChanges,
    resultingCompliant: workingCalc.allCompliant,
    smallerAppliances,
    roomRedistribution,
  };
}
