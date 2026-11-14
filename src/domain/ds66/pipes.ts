import type { CopperNominalDiameter } from "@/domain/types";

export interface CopperPipeSpec {
  nominal: CopperNominalDiameter;
  label: string;
  /** Diámetro exterior real (mm) según DS 66 Tabla IX */
  outerDiameterMm: number;
  /** Espesor de pared Tipo "L" (mm) */
  wallThicknessMm: number;
  /** Diámetro interior Di (mm) */
  innerDiameterMm: number;
  /** Diámetro interior Di (cm) */
  innerDiameterCm: number;
  /** Factor de fricción K (DS 66 Art. 46 / Tabla IX) */
  frictionFactorK: number;
  /** Grosor visual en px para el diagrama a escala */
  diagramStrokePx: number;
}

export const COPPER_TYPE_L_PIPES: readonly CopperPipeSpec[] = [
  {
    nominal: "3/8",
    label: '3/8"',
    outerDiameterMm: 12.7,
    wallThicknessMm: 0.89,
    innerDiameterMm: 10.92,
    innerDiameterCm: 1.092,
    frictionFactorK: 1800,
    diagramStrokePx: 2,
  },
  {
    nominal: "1/2",
    label: '1/2"',
    outerDiameterMm: 15.88,
    wallThicknessMm: 1.02,
    innerDiameterMm: 13.84,
    innerDiameterCm: 1.384,
    frictionFactorK: 1800,
    diagramStrokePx: 2.75,
  },
  {
    nominal: "3/4",
    label: '3/4"',
    outerDiameterMm: 22.22,
    wallThicknessMm: 1.14,
    innerDiameterMm: 19.94,
    innerDiameterCm: 1.994,
    frictionFactorK: 1800,
    diagramStrokePx: 3.5,
  },
  {
    nominal: "1",
    label: '1"',
    outerDiameterMm: 28.58,
    wallThicknessMm: 1.27,
    innerDiameterMm: 26.04,
    innerDiameterCm: 2.604,
    frictionFactorK: 1800,
    diagramStrokePx: 4.25,
  },
  {
    nominal: "1 1/4",
    label: '1 1/4"',
    outerDiameterMm: 34.92,
    wallThicknessMm: 1.4,
    innerDiameterMm: 32.12,
    innerDiameterCm: 3.212,
    frictionFactorK: 1980,
    diagramStrokePx: 5,
  },
  {
    nominal: "1 1/2",
    label: '1 1/2"',
    outerDiameterMm: 41.28,
    wallThicknessMm: 1.52,
    innerDiameterMm: 38.24,
    innerDiameterCm: 3.824,
    frictionFactorK: 1980,
    diagramStrokePx: 5.75,
  },
  {
    nominal: "2",
    label: '2"',
    outerDiameterMm: 53.98,
    wallThicknessMm: 1.78,
    innerDiameterMm: 50.42,
    innerDiameterCm: 5.042,
    frictionFactorK: 2160,
    diagramStrokePx: 6.5,
  },
  {
    nominal: "2 1/2",
    label: '2 1/2"',
    outerDiameterMm: 66.68,
    wallThicknessMm: 2.03,
    innerDiameterMm: 62.62,
    innerDiameterCm: 6.262,
    frictionFactorK: 2160,
    diagramStrokePx: 7.25,
  },
  {
    nominal: "3",
    label: '3"',
    outerDiameterMm: 79.38,
    wallThicknessMm: 2.29,
    innerDiameterMm: 74.8,
    innerDiameterCm: 7.48,
    frictionFactorK: 2340,
    diagramStrokePx: 8,
  },
  {
    nominal: "4",
    label: '4"',
    outerDiameterMm: 104.78,
    wallThicknessMm: 2.79,
    innerDiameterMm: 99.2,
    innerDiameterCm: 9.92,
    frictionFactorK: 2420,
    diagramStrokePx: 9,
  },
] as const;

export const COPPER_PIPE_BY_NOMINAL: Record<CopperNominalDiameter, CopperPipeSpec> =
  Object.fromEntries(
    COPPER_TYPE_L_PIPES.map((spec) => [spec.nominal, spec])
  ) as Record<CopperNominalDiameter, CopperPipeSpec>;

export function getCopperPipeSpec(nominal: CopperNominalDiameter): CopperPipeSpec {
  return COPPER_PIPE_BY_NOMINAL[nominal];
}

export function getNextLargerDiameter(
  nominal: CopperNominalDiameter
): CopperNominalDiameter | null {
  const index = COPPER_TYPE_L_PIPES.findIndex((p) => p.nominal === nominal);
  if (index === -1 || index >= COPPER_TYPE_L_PIPES.length - 1) {
    return null;
  }
  return COPPER_TYPE_L_PIPES[index + 1]!.nominal;
}
