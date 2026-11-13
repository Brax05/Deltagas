export type GasConfigId = "GLP" | "GN_V_RM" | "GN_VIII" | "GN_XII";
export type GasFamily = "GLP" | "GN";

export type Direction =
  | "up"
  | "down"
  | "left"
  | "right"
  | "up-right"
  | "down-right"
  | "down-left"
  | "up-left";

export type CopperNominalDiameter =
  | "3/8"
  | "1/2"
  | "3/4"
  | "1"
  | "1 1/4"
  | "1 1/2"
  | "2"
  | "2 1/2"
  | "3"
  | "4";

export interface Point {
  id: string;
  label: string;
  isRegulator?: boolean;
  /** Coordenada X calculada en metros desde el regulador S (0, 0). */
  xMeters: number;
  /** Coordenada Y calculada en metros desde el regulador S (0, 0); positivo hacia arriba. */
  yMeters: number;
}

export interface SegmentPart {
  direction: Direction;
  /** Longitud real en centímetros (entero >= 1). */
  lengthCm: number;
}

export interface Segment {
  id: string;
  fromPointId: string;
  toPointId: string;
  parts: SegmentPart[];
  nominalDiameter: CopperNominalDiameter;
  /** Longitud equivalente opcional de accesorios en metros (no se dibuja). */
  equivalentLengthMeters?: number;
}

export type ApplianceClass =
  | "cocina"
  | "encimera"
  | "horno"
  | "calefon"
  | "estufa"
  | "caldera"
  | "secadora"
  | "otro";

export interface ApplianceDatasheetMeta {
  storagePath?: string;
  brand?: string;
  model?: string;
  serialNumber?: string;
  nominalPowerMcalH?: number;
  gasType?: string;
  confirmedByHuman: boolean;
  confirmedAt?: string;
}

export interface Appliance {
  id: string;
  name: string;
  segmentId: string;
  catalogId?: string;
  applianceClass: ApplianceClass;
  /** Por defecto tipo A en Módulo 2 cuando no se especifica otro circuito. */
  circuitType: "A" | "B" | "C";
  /** Potencia nominal unitaria en Mcal/h. */
  powerMcalPerHour: number;
  quantity: number;
  roomId?: string;
  labelOffsetMeters?: { dx: number; dy: number };
  datasheet?: ApplianceDatasheetMeta;
}

export interface Room {
  id: string;
  name: string;
  lengthMeters: number;
  widthMeters: number;
  heightMeters: number;
  ventilationType: "directa" | "indirecta";
}

export interface HermeticityTestInput {
  date: string;
  installationType: "nueva" | "modificacion" | "existente";
  initialPressureMbar: number;
  finalPressureMbar: number;
  durationMinutes: number | null;
  manometer: {
    brand: string;
    model: string;
    range: string;
    graduation: string;
  };
  notes?: string;
}

export interface GlpCylindersInput {
  builtAreaM2: number;
  commune: string;
  designTempC: 15 | 10 | 5 | 0 | -5 | -10 | -15 | -20;
  cylinderTypeKg: 45 | 15;
  consumptionMode: "intermitente" | "continuo";
  calculationMethod: "vaporizacion" | "consumo_diario";
  tablaXviiProfileKey?: string;
}

export interface ClientInstallation {
  ownerName: string;
  ownerRut?: string;
  address: string;
  commune: string;
}

export interface InstallerProfile {
  fullName: string;
  rut: string;
  phone: string;
  email: string;
  installerClass: "1" | "2" | "3" | "4";
  secRegistrationNumber: string;
  companyName?: string;
  signatureStoragePath?: string;
}

export interface ProjectData {
  id: string;
  name: string;
  gasType: GasConfigId;
  client: ClientInstallation;
  segments: Segment[];
  appliances: Appliance[];
  rooms: Room[];
  hermeticity: HermeticityTestInput;
  cylinders: GlpCylindersInput;
  updatedAt: string;
}
