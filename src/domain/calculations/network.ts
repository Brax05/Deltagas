import { getGasSpec } from "@/domain/ds66/gases";
import { getCopperPipeSpec } from "@/domain/ds66/pipes";
import {
  calculateFormulaPressureDropPa,
  lookupPartialPressureDropFromTable,
  type PressureTableLookupResult,
} from "@/domain/ds66/pressure-tables";
import { mcalHToKw } from "@/domain/ds66/appliances";
import type { Appliance, GasConfigId, Segment } from "@/domain/types";

export interface SegmentCalculation {
  segmentId: string;
  fromPointId: string;
  toPointId: string;
  realLengthMeters: number;
  equivalentLengthMeters: number;
  calculationLengthMeters: number;
  downstreamPowerMcalH: number;
  downstreamPowerKw: number;
  volumetricFlowM3H: number;
  innerDiameterMm: number;
  innerDiameterCm: number;
  pipeVolumeM3: number;
  pipeVolumeLiters: number;
  tableLookup: PressureTableLookupResult;
  partialDropTablePa: number | null;
  partialDropFormulaPa: number;
  accumulatedDropTablePa: number | null;
  accumulatedDropFormulaPa: number;
  pressureAtEndPa: number | null;
  /** Cumple el propio tramo acumulado contra el límite (150/120 Pa). */
  ownPressureCompliant: boolean;
  /** Todos los artefactos que cuelgan de este tramo cumplen. */
  subtreeCompliant: boolean;
  hasEnoughData: boolean;
}

export interface ApplianceCalculation {
  applianceId: string;
  name: string;
  segmentId: string;
  powerMcalPerUnit: number;
  quantity: number;
  totalPowerMcalH: number;
  totalPowerKw: number;
  volumetricFlowM3H: number;
  accumulatedDropTablePa: number | null;
  accumulatedDropFormulaPa: number;
  deliveryPressurePa: number | null;
  deliveryPressureMbar: number | null;
  compliant: boolean;
}

export interface NetworkCalculationResult {
  gasType: GasConfigId;
  servicePressurePa: number;
  maxAllowedDropPa: number;
  pcsMcalPerM3: number;
  totalPowerMcalH: number;
  totalPowerKw: number;
  totalFlowM3H: number;
  totalLengthMeters: number;
  totalPipeVolumeM3: number;
  totalPipeVolumeLiters: number;
  weightedInnerDiameterMm: number;
  segments: Record<string, SegmentCalculation>;
  orderedSegmentIds: string[];
  appliances: Record<string, ApplianceCalculation>;
  criticalApplianceId: string | null;
  criticalPathSegmentIds: string[];
  maxAccumulatedDropPa: number | null;
  allCompliant: boolean;
  hasOutOfRangeSegments: boolean;
}

export function getSegmentRealLengthMeters(segment: Segment): number {
  const totalCm = segment.parts.reduce((acc, part) => acc + part.lengthCm, 0);
  return totalCm / 100;
}

export function calculateNetwork(params: {
  gasType: GasConfigId;
  segments: Segment[];
  appliances: Appliance[];
}): NetworkCalculationResult {
  const gas = getGasSpec(params.gasType);
  const segmentsById = new Map<string, Segment>();
  const childrenByFromPoint = new Map<string, Segment[]>();
  const appliancesBySegment = new Map<string, Appliance[]>();

  for (const seg of params.segments) {
    segmentsById.set(seg.id, seg);
    const list = childrenByFromPoint.get(seg.fromPointId) ?? [];
    list.push(seg);
    childrenByFromPoint.set(seg.fromPointId, list);
  }

  for (const app of params.appliances) {
    const list = appliancesBySegment.get(app.segmentId) ?? [];
    list.push(app);
    appliancesBySegment.set(app.segmentId, list);
  }

  // Orden topológico desde el regulador "S" (BFS)
  const orderedSegmentIds: string[] = [];
  const parentSegmentBySegment = new Map<string, string | null>();
  const visited = new Set<string>();
  const queue: Array<{ segment: Segment; parentId: string | null }> = (
    childrenByFromPoint.get("S") ?? []
  ).map((segment) => ({ segment, parentId: null }));

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current.segment.id)) continue;
    visited.add(current.segment.id);
    orderedSegmentIds.push(current.segment.id);
    parentSegmentBySegment.set(current.segment.id, current.parentId);

    const children = childrenByFromPoint.get(current.segment.toPointId) ?? [];
    for (const child of children) {
      queue.push({ segment: child, parentId: current.segment.id });
    }
  }

  // Paso 1: potencia aguas abajo recorriendo desde las hojas hacia S (post-orden)
  const downstreamPowerBySeg = new Map<string, number>();
  for (let i = orderedSegmentIds.length - 1; i >= 0; i--) {
    const segId = orderedSegmentIds[i]!;
    const seg = segmentsById.get(segId)!;

    const ownPower = (appliancesBySegment.get(segId) ?? []).reduce(
      (sum, app) => sum + app.powerMcalPerHour * app.quantity,
      0
    );
    const childPower = (childrenByFromPoint.get(seg.toPointId) ?? []).reduce(
      (sum, child) => sum + (downstreamPowerBySeg.get(child.id) ?? 0),
      0
    );
    downstreamPowerBySeg.set(segId, ownPower + childPower);
  }

  // Pasos 2–9: cálculo de cada tramo en orden topológico
  const segmentResults: Record<string, SegmentCalculation> = {};
  let totalLengthMeters = 0;
  let totalPipeVolumeM3 = 0;
  let weightedDiameterNumerator = 0;
  let hasOutOfRangeSegments = false;

  for (const segId of orderedSegmentIds) {
    const seg = segmentsById.get(segId)!;
    const pipe = getCopperPipeSpec(seg.nominalDiameter);
    const realLengthMeters = getSegmentRealLengthMeters(seg);
    const equivalentLengthMeters = seg.equivalentLengthMeters ?? 0;
    const calculationLengthMeters = realLengthMeters + equivalentLengthMeters;
    const downstreamPowerMcalH = downstreamPowerBySeg.get(segId) ?? 0;
    const downstreamPowerKw = mcalHToKw(downstreamPowerMcalH);
    const volumetricFlowM3H =
      gas.pcsMcalPerM3 > 0 ? downstreamPowerMcalH / gas.pcsMcalPerM3 : 0;

    const innerDiameterMeters = pipe.innerDiameterMm / 1000;
    const pipeVolumeM3 =
      ((Math.PI * Math.pow(innerDiameterMeters, 2)) / 4) * realLengthMeters;
    const pipeVolumeLiters = pipeVolumeM3 * 1000;

    totalLengthMeters += realLengthMeters;
    totalPipeVolumeM3 += pipeVolumeM3;
    weightedDiameterNumerator += pipe.innerDiameterMm * realLengthMeters;

    const tableLookup = lookupPartialPressureDropFromTable({
      gasFamily: gas.family,
      nominalDiameter: seg.nominalDiameter,
      realLengthMeters: calculationLengthMeters,
      powerMcalH: downstreamPowerMcalH,
    });

    const partialDropFormulaPa = calculateFormulaPressureDropPa({
      gasFamily: gas.family,
      nominalDiameter: seg.nominalDiameter,
      lengthMeters: calculationLengthMeters,
      powerMcalH: downstreamPowerMcalH,
    });

    const parentId = parentSegmentBySegment.get(segId) ?? null;
    const parentAccTable = parentId
      ? segmentResults[parentId]?.accumulatedDropTablePa ?? null
      : 0;
    const parentAccFormula = parentId
      ? segmentResults[parentId]?.accumulatedDropFormulaPa ?? 0
      : 0;

    const partialDropTablePa = tableLookup.partialDropPa;
    if (tableLookup.powerOutOfRange || tableLookup.lengthOutOfRange) {
      hasOutOfRangeSegments = true;
    }

    const accumulatedDropTablePa =
      parentAccTable !== null && partialDropTablePa !== null
        ? parentAccTable + partialDropTablePa
        : null;
    const accumulatedDropFormulaPa = parentAccFormula + partialDropFormulaPa;
    const pressureAtEndPa =
      accumulatedDropTablePa !== null
        ? gas.servicePressurePa - accumulatedDropTablePa
        : null;

    const hasEnoughData = realLengthMeters > 0 && downstreamPowerMcalH > 0;
    const ownPressureCompliant =
      accumulatedDropTablePa !== null &&
      accumulatedDropTablePa <= gas.maxPressureDropPa;

    segmentResults[segId] = {
      segmentId: seg.id,
      fromPointId: seg.fromPointId,
      toPointId: seg.toPointId,
      realLengthMeters,
      equivalentLengthMeters,
      calculationLengthMeters,
      downstreamPowerMcalH,
      downstreamPowerKw,
      volumetricFlowM3H,
      innerDiameterMm: pipe.innerDiameterMm,
      innerDiameterCm: pipe.innerDiameterCm,
      pipeVolumeM3,
      pipeVolumeLiters,
      tableLookup,
      partialDropTablePa,
      partialDropFormulaPa,
      accumulatedDropTablePa,
      accumulatedDropFormulaPa,
      pressureAtEndPa,
      ownPressureCompliant,
      subtreeCompliant: ownPressureCompliant,
      hasEnoughData,
    };
  }

  // Evaluar cumplimiento del subárbol desde las hojas hacia S
  for (let i = orderedSegmentIds.length - 1; i >= 0; i--) {
    const segId = orderedSegmentIds[i]!;
    const seg = segmentsById.get(segId)!;
    const res = segmentResults[segId]!;
    const children = childrenByFromPoint.get(seg.toPointId) ?? [];
    const childrenOk = children.every(
      (child) => segmentResults[child.id]?.subtreeCompliant ?? true
    );
    res.subtreeCompliant = res.ownPressureCompliant && childrenOk;
  }

  // Evaluar artefactos y ruta crítica
  const applianceResults: Record<string, ApplianceCalculation> = {};
  let totalPowerMcalH = 0;
  let criticalApplianceId: string | null = null;
  let maxAccumulatedDropPa: number | null = null;
  let maxFormulaDropPa = -1;

  for (const app of params.appliances) {
    const segRes = segmentResults[app.segmentId];
    const totalAppPowerMcalH = app.powerMcalPerHour * app.quantity;
    totalPowerMcalH += totalAppPowerMcalH;

    const accTable = segRes?.accumulatedDropTablePa ?? null;
    const accFormula = segRes?.accumulatedDropFormulaPa ?? 0;
    const deliveryPressurePa =
      accTable !== null ? gas.servicePressurePa - accTable : null;

    const compliant =
      accTable !== null &&
      accTable <= gas.maxPressureDropPa &&
      !(segRes?.tableLookup.powerOutOfRange ?? true);

    applianceResults[app.id] = {
      applianceId: app.id,
      name: app.name,
      segmentId: app.segmentId,
      powerMcalPerUnit: app.powerMcalPerHour,
      quantity: app.quantity,
      totalPowerMcalH: totalAppPowerMcalH,
      totalPowerKw: mcalHToKw(totalAppPowerMcalH),
      volumetricFlowM3H:
        gas.pcsMcalPerM3 > 0 ? totalAppPowerMcalH / gas.pcsMcalPerM3 : 0,
      accumulatedDropTablePa: accTable,
      accumulatedDropFormulaPa: accFormula,
      deliveryPressurePa,
      deliveryPressureMbar:
        deliveryPressurePa !== null ? deliveryPressurePa / 100 : null,
      compliant,
    };

    if (accTable !== null) {
      if (maxAccumulatedDropPa === null || accTable > maxAccumulatedDropPa) {
        maxAccumulatedDropPa = accTable;
        criticalApplianceId = app.id;
      }
    } else if (accFormula > maxFormulaDropPa && maxAccumulatedDropPa === null) {
      maxFormulaDropPa = accFormula;
      criticalApplianceId = app.id;
    }
  }

  // Reconstruir ruta crítica desde el artefacto crítico hacia S
  const criticalPathSegmentIds: string[] = [];
  if (criticalApplianceId) {
    let cursor: string | null =
      applianceResults[criticalApplianceId]?.segmentId ?? null;
    while (cursor) {
      criticalPathSegmentIds.unshift(cursor);
      cursor = parentSegmentBySegment.get(cursor) ?? null;
    }
  }

  const allAppliancesCompliant =
    params.appliances.length > 0 &&
    Object.values(applianceResults).every((a) => a.compliant);

  return {
    gasType: params.gasType,
    servicePressurePa: gas.servicePressurePa,
    maxAllowedDropPa: gas.maxPressureDropPa,
    pcsMcalPerM3: gas.pcsMcalPerM3,
    totalPowerMcalH,
    totalPowerKw: mcalHToKw(totalPowerMcalH),
    totalFlowM3H: gas.pcsMcalPerM3 > 0 ? totalPowerMcalH / gas.pcsMcalPerM3 : 0,
    totalLengthMeters,
    totalPipeVolumeM3,
    totalPipeVolumeLiters: totalPipeVolumeM3 * 1000,
    weightedInnerDiameterMm:
      totalLengthMeters > 0 ? weightedDiameterNumerator / totalLengthMeters : 0,
    segments: segmentResults,
    orderedSegmentIds,
    appliances: applianceResults,
    criticalApplianceId,
    criticalPathSegmentIds,
    maxAccumulatedDropPa,
    allCompliant: allAppliancesCompliant && !hasOutOfRangeSegments,
    hasOutOfRangeSegments,
  };
}
