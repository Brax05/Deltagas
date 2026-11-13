export type ConsumptionLevel = "Bajo" | "Medio" | "Alto";

export type DesignTempC = 15 | 10 | 5 | 0 | -5 | -10 | -15 | -20;

export interface CommuneDesignTemp {
  commune: string;
  region: string;
  designTempC: DesignTempC;
}

/**
 * Referencia de temperaturas de cálculo por comuna/ciudad en Chile (NCh 1079 / DS 66).
 * El usuario siempre puede ajustar manualmente la temperatura si su proyecto lo requiere.
 */
export const CHILE_COMMUNE_TEMPS: readonly CommuneDesignTemp[] = [
  { commune: "Arica", region: "Arica y Parinacota", designTempC: 10 },
  { commune: "Iquique", region: "Tarapacá", designTempC: 10 },
  { commune: "Antofagasta", region: "Antofagasta", designTempC: 10 },
  { commune: "Calama", region: "Antofagasta", designTempC: -5 },
  { commune: "Copiapó", region: "Atacama", designTempC: 5 },
  { commune: "La Serena", region: "Coquimbo", designTempC: 5 },
  { commune: "Valparaíso", region: "Valparaíso", designTempC: 5 },
  { commune: "Viña del Mar", region: "Valparaíso", designTempC: 5 },
  { commune: "Santiago", region: "Metropolitana", designTempC: 0 },
  { commune: "Rancagua", region: "O'Higgins", designTempC: 0 },
  { commune: "Talca", region: "Maule", designTempC: 0 },
  { commune: "Concepción", region: "Biobío", designTempC: 0 },
  { commune: "Temuco", region: "La Araucanía", designTempC: -5 },
  { commune: "Valdivia", region: "Los Ríos", designTempC: -5 },
  { commune: "Puerto Montt", region: "Los Lagos", designTempC: -5 },
  { commune: "Coyhaique", region: "Aysén", designTempC: -15 },
  { commune: "Punta Arenas", region: "Magallanes", designTempC: -10 },
] as const;

/**
 * DS 66 Tabla XVI: Clasificación de consumidores según superficie construida.
 */
export function getConsumptionLevelTablaXVI(builtAreaM2: number): ConsumptionLevel {
  if (builtAreaM2 < 50) return "Bajo";
  if (builtAreaM2 <= 75) return "Medio";
  return "Alto";
}

/**
 * DS 66 Tabla XVIII (extraída de imagen oficial de LeyChile):
 * Razón de Vaporización Rv (kW) por temperatura de cálculo, capacidad del cilindro y régimen.
 */
export const TABLA_XVIII_VAPORIZATION_KW: Record<
  DesignTempC,
  {
    kg45: { intermitente: number; continuo: number };
    kg15: { intermitente: number; continuo: number };
  }
> = {
  15: { kg45: { intermitente: 44, continuo: 38 }, kg15: { intermitente: 20, continuo: 17 } },
  10: { kg45: { intermitente: 41, continuo: 35 }, kg15: { intermitente: 19, continuo: 16 } },
  5: { kg45: { intermitente: 37, continuo: 31 }, kg15: { intermitente: 17, continuo: 14 } },
  0: { kg45: { intermitente: 34, continuo: 28 }, kg15: { intermitente: 16, continuo: 13 } },
  [-5]: { kg45: { intermitente: 30, continuo: 24 }, kg15: { intermitente: 15, continuo: 12 } },
  [-10]: { kg45: { intermitente: 28, continuo: 21 }, kg15: { intermitente: 14, continuo: 10 } },
  [-15]: { kg45: { intermitente: 23, continuo: 16 }, kg15: { intermitente: 12, continuo: 8 } },
  [-20]: { kg45: { intermitente: 17, continuo: 10 }, kg15: { intermitente: 9, continuo: 6 } },
};

export type TablaXviiTempCol = 10 | 5 | 0 | -5 | -10 | -15 | -20;

export interface TablaXviiEntry {
  key: string;
  label: string;
  byLevel: Partial<Record<ConsumptionLevel, Record<TablaXviiTempCol, number>>>;
}

/**
 * DS 66 Tabla XVII (extraída de imagen oficial de LeyChile):
 * Consumo diario Cd (kWh/día) según artefactos, nivel de consumo y temperatura de cálculo.
 */
export const TABLA_XVII_DAILY_CONSUMPTION_KWH: Record<string, TablaXviiEntry> = {
  estufa: {
    key: "estufa",
    label: "Estufa",
    byLevel: {
      Bajo: { 10: 1.7, 5: 3.5, 0: 7.0, [-5]: 10.5, [-10]: 14.0, [-15]: 17.4, [-20]: 20.9 },
      Medio: { 10: 3.5, 5: 10.5, 0: 20.9, [-5]: 31.4, [-10]: 41.9, [-15]: 52.3, [-20]: 62.8 },
      Alto: { 10: 3.5, 5: 14.0, 0: 27.9, [-5]: 41.9, [-10]: 55.8, [-15]: 69.8, [-20]: 83.7 },
    },
  },
  calefon: {
    key: "calefon",
    label: "Calefón",
    byLevel: {
      Bajo: { 10: 2.3, 5: 3.5, 0: 4.6, [-5]: 4.6, [-10]: 4.6, [-15]: 4.6, [-20]: 4.6 },
      Medio: { 10: 7.0, 5: 10.5, 0: 14.0, [-5]: 14.0, [-10]: 14.0, [-15]: 14.0, [-20]: 14.0 },
      Alto: { 10: 7.0, 5: 14.0, 0: 20.9, [-5]: 20.9, [-10]: 20.9, [-15]: 20.9, [-20]: 20.9 },
    },
  },
  cocina: {
    key: "cocina",
    label: "Cocina",
    byLevel: {
      Bajo: { 10: 3.5, 5: 4.6, 0: 5.8, [-5]: 5.8, [-10]: 5.8, [-15]: 5.8, [-20]: 5.8 },
      Medio: { 10: 4.6, 5: 5.8, 0: 7.0, [-5]: 7.0, [-10]: 7.0, [-15]: 7.0, [-20]: 7.0 },
      Alto: { 10: 7.0, 5: 8.1, 0: 9.3, [-5]: 9.3, [-10]: 9.3, [-15]: 9.3, [-20]: 9.3 },
    },
  },
  calefon_cocina: {
    key: "calefon_cocina",
    label: "Calefón y Cocina",
    byLevel: {
      Bajo: { 10: 5.8, 5: 8.1, 0: 10.5, [-5]: 10.5, [-10]: 10.5, [-15]: 10.5, [-20]: 10.5 },
      Medio: { 10: 11.6, 5: 16.3, 0: 20.9, [-5]: 20.9, [-10]: 20.9, [-15]: 20.9, [-20]: 20.9 },
      Alto: { 10: 14.0, 5: 25.7, 0: 30.2, [-5]: 30.2, [-10]: 30.2, [-15]: 30.2, [-20]: 30.2 },
    },
  },
  estufa_calefon_cocina: {
    key: "estufa_calefon_cocina",
    label: "Estufa, Calefón y Cocina",
    byLevel: {
      Bajo: { 10: 7.6, 5: 11.6, 0: 17.4, [-5]: 20.9, [-10]: 24.4, [-15]: 27.9, [-20]: 31.4 },
      Medio: { 10: 15.1, 5: 26.7, 0: 41.9, [-5]: 52.3, [-10]: 62.8, [-15]: 73.3, [-20]: 83.7 },
      Alto: { 10: 17.4, 5: 36.0, 0: 58.2, [-5]: 72.1, [-10]: 86.1, [-15]: 100.0, [-20]: 114.0 },
    },
  },
  "2_calefon_cocina": {
    key: "2_calefon_cocina",
    label: "2 Calefón y una Cocina",
    byLevel: {
      Medio: { 10: 15.1, 5: 21.5, 0: 27.9, [-5]: 27.9, [-10]: 27.9, [-15]: 27.9, [-20]: 27.9 },
      Alto: { 10: 17.4, 5: 29.1, 0: 40.7, [-5]: 40.7, [-10]: 40.7, [-15]: 40.7, [-20]: 40.7 },
    },
  },
  estufa_2_calefon_cocina: {
    key: "estufa_2_calefon_cocina",
    label: "Estufa, 2 Calefón y Cocina",
    byLevel: {
      Medio: { 10: 18.6, 5: 32.0, 0: 48.8, [-5]: 59.3, [-10]: 69.8, [-15]: 80.2, [-20]: 90.7 },
      Alto: { 10: 20.9, 5: 43.0, 0: 68.6, [-5]: 96.1, [-10]: 96.5, [-15]: 110.5, [-20]: 124.4 },
    },
  },
  "2_estufa_calefon_cocina": {
    key: "2_estufa_calefon_cocina",
    label: "2 Estufa, Calefón y Cocina",
    byLevel: {
      Medio: { 10: 16.9, 5: 32.0, 0: 52.3, [-5]: 68.0, [-10]: 83.7, [-15]: 99.4, [-20]: 108.2 },
      Alto: { 10: 19.2, 5: 43.0, 0: 72.1, [-5]: 93.0, [-10]: 114.0, [-15]: 134.9, [-20]: 155.8 },
    },
  },
  "2_estufa_2_calefon_cocina": {
    key: "2_estufa_2_calefon_cocina",
    label: "2 Estufa, 2 Calefón y Cocina",
    byLevel: {
      Medio: { 10: 20.4, 5: 37.2, 0: 59.3, [-5]: 75.0, [-10]: 90.7, [-15]: 106.4, [-20]: 115.1 },
      Alto: { 10: 22.7, 5: 50.0, 0: 82.6, [-5]: 103.5, [-10]: 124.4, [-15]: 145.4, [-20]: 166.3 },
    },
  },
};
