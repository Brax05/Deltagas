import { mcalHToKw } from "@/domain/ds66/appliances";
import { getGasSpec } from "@/domain/ds66/gases";
import {
  getMinVentilationAreaCm2,
  getMinVolumeStoveFormulaF8,
  getMinVolumeTablaXX,
} from "@/domain/ds66/rooms";
import type { Appliance, GasConfigId, Room } from "@/domain/types";

export interface RoomEvaluation {
  roomId: string;
  roomName: string;
  assignedAppliances: Array<{
    id: string;
    name: string;
    powerMcalH: number;
    powerKw: number;
    isStove: boolean;
  }>;
  totalPowerMcalH: number;
  totalPowerKw: number;
  realVolumeM3: number;
  minVolumeTablaXXM3: number;
  hasStoves: boolean;
  minVolumeStoveF8M3: number | null;
  requiredVolumeM3: number;
  volumeRuleApplied: "Tabla XX" | "Fórmula f.8 (estufas)" | "Sin artefactos";
  volumeCompliant: boolean;
  ventilationType: "directa" | "indirecta";
  requiredVentilationAreaCm2: number;
  openingsCount: 1 | 2;
  areaPerOpeningCm2: number;
  lowerOpeningPlacement: string;
  upperOpeningPlacement: string;
  overallCompliant: boolean;
  recommendation: string;
}

export function evaluateRooms(params: {
  gasType: GasConfigId;
  rooms: Room[];
  appliances: Appliance[];
}): RoomEvaluation[] {
  const gas = getGasSpec(params.gasType);

  return params.rooms.map((room) => {
    const roomAppliances = params.appliances.filter((a) => a.roomId === room.id);
    const assignedAppliances = roomAppliances.map((app) => {
      const totalMcal = app.powerMcalPerHour * app.quantity;
      return {
        id: app.id,
        name: app.name,
        powerMcalH: totalMcal,
        powerKw: mcalHToKw(totalMcal),
        isStove: app.applianceClass === "estufa",
      };
    });

    const totalPowerMcalH = assignedAppliances.reduce(
      (sum, a) => sum + a.powerMcalH,
      0
    );
    const totalPowerKw = assignedAppliances.reduce((sum, a) => sum + a.powerKw, 0);
    const realVolumeM3 = room.lengthMeters * room.widthMeters * room.heightMeters;
    const minVolumeTablaXXM3 = getMinVolumeTablaXX(totalPowerKw);
    const hasStoves = assignedAppliances.some((a) => a.isStove);
    const minVolumeStoveF8M3 = hasStoves
      ? getMinVolumeStoveFormulaF8(totalPowerKw)
      : null;

    const requiredVolumeM3 =
      minVolumeStoveF8M3 !== null
        ? Math.max(minVolumeTablaXXM3, minVolumeStoveF8M3)
        : minVolumeTablaXXM3;

    const volumeRuleApplied =
      totalPowerKw <= 0
        ? "Sin artefactos"
        : minVolumeStoveF8M3 !== null && minVolumeStoveF8M3 >= minVolumeTablaXXM3
          ? "Fórmula f.8 (estufas)"
          : "Tabla XX";

    const volumeCompliant = realVolumeM3 >= requiredVolumeM3 - 1e-6;
    const requiredVentilationAreaCm2 = getMinVentilationAreaCm2(
      totalPowerKw,
      room.ventilationType
    );
    const openingsCount: 1 | 2 = totalPowerKw > 16 ? 2 : 1;
    const areaPerOpeningCm2 = requiredVentilationAreaCm2 / openingsCount;

    const lowerOpeningPlacement = gas.heavierThanAir
      ? "GLP (más denso que aire): abertura inferior hasta 15 cm del suelo"
      : "GN (menos denso que aire): abertura inferior hasta 50 cm del suelo";

    const upperOpeningPlacement =
      "Abertura superior: borde inferior ≥ 1,80 m del suelo o ≤ 40 cm del techo";

    const overallCompliant = volumeCompliant;
    const recommendation =
      totalPowerKw <= 0
        ? "Sin artefactos asignados en este recinto."
        : overallCompliant
          ? `Cumple volumen (${realVolumeM3.toFixed(1)} ≥ ${requiredVolumeM3.toFixed(1)} m³). Proveer ${openingsCount === 2 ? "2 aberturas de al menos " + Math.ceil(areaPerOpeningCm2) + " cm² c/u" : "abertura de al menos " + Math.ceil(requiredVentilationAreaCm2) + " cm²"}.`
          : `No cumple volumen (faltan ${(requiredVolumeM3 - realVolumeM3).toFixed(1)} m³). Ajustar: usar artefacto de menor potencia, reubicarlo o ampliar el recinto.`;

    return {
      roomId: room.id,
      roomName: room.name,
      assignedAppliances,
      totalPowerMcalH,
      totalPowerKw,
      realVolumeM3,
      minVolumeTablaXXM3,
      hasStoves,
      minVolumeStoveF8M3,
      requiredVolumeM3,
      volumeRuleApplied,
      volumeCompliant,
      ventilationType: room.ventilationType,
      requiredVentilationAreaCm2,
      openingsCount,
      areaPerOpeningCm2,
      lowerOpeningPlacement,
      upperOpeningPlacement,
      overallCompliant,
      recommendation,
    };
  });
}
