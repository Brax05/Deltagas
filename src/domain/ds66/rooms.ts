/**
 * Reglas normativas DS 66 para recintos y ventilación:
 * - Tabla XX: Volumen bruto mínimo (<= 16 kW -> 8 m³; > 16 kW -> Pm - 8 m³)
 * - Fórmula (f.8): Estufas V = Pt / 0,093 (mínimo 15 m³ según art. 70.1)
 * - Tabla XXI: Superficie libre mínima de ventilación directa e indirecta
 * - Tabla XXII: División en dos aberturas (Pt > 16 kW) y altura según densidad del gas
 */
export const DEFAULT_ROOM_HEIGHT_METERS = 2.4;

export function getMinVolumeTablaXX(totalKw: number): number {
  if (totalKw <= 0) return 0;
  if (totalKw <= 16) return 8;
  return totalKw - 8;
}

export function getMinVolumeStoveFormulaF8(totalKw: number): number {
  if (totalKw <= 0) return 0;
  return Math.max(15, totalKw / 0.093);
}

export function getMinVentilationAreaCm2(
  totalKw: number,
  ventilationType: "directa" | "indirecta"
): number {
  if (totalKw <= 0) return 0;
  if (totalKw <= 25) {
    return ventilationType === "directa" ? 100 : 125;
  }
  return ventilationType === "directa" ? totalKw * 4 : totalKw * 5;
}
