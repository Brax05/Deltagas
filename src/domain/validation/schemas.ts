import { z } from "zod";

export const gasConfigIdSchema = z.enum(["GLP", "GN_V_RM", "GN_VIII", "GN_XII"]);

export const directionSchema = z.enum([
  "up",
  "down",
  "left",
  "right",
  "up-right",
  "down-right",
  "down-left",
  "up-left",
]);

export const copperDiameterSchema = z.enum([
  "3/8",
  "1/2",
  "3/4",
  "1",
  "1 1/4",
  "1 1/2",
  "2",
  "2 1/2",
  "3",
  "4",
]);

export const segmentPartSchema = z.object({
  direction: directionSchema,
  /** Longitud real en centímetros (10 cm a 5000 cm = 50 m máx tabla). */
  lengthCm: z.number().int().min(10).max(5000),
});

export const segmentSchema = z.object({
  id: z.string().trim().min(1).max(32),
  fromPointId: z.string().trim().min(1).max(32),
  toPointId: z.string().trim().min(1).max(32),
  parts: z.array(segmentPartSchema).min(1).max(8),
  nominalDiameter: copperDiameterSchema,
  equivalentLengthMeters: z.number().min(0).max(50).optional(),
});

export const applianceSchema = z.object({
  id: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(80),
  segmentId: z.string().trim().min(1).max(32),
  catalogId: z.string().max(64).optional(),
  applianceClass: z.enum([
    "cocina",
    "encimera",
    "horno",
    "calefon",
    "estufa",
    "caldera",
    "secadora",
    "otro",
  ]),
  circuitType: z.enum(["A", "B", "C"]),
  powerMcalPerHour: z.number().positive().max(1000),
  quantity: z.number().int().min(1).max(50),
  roomId: z.string().max(64).optional(),
});

export const roomSchema = z.object({
  id: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(80),
  lengthMeters: z.number().positive().max(100),
  widthMeters: z.number().positive().max(100),
  heightMeters: z.number().min(1.5).max(15),
  ventilationType: z.enum(["directa", "indirecta"]),
});

export const projectPayloadSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(120),
  gasType: gasConfigIdSchema,
  segments: z.array(segmentSchema).min(1).max(200),
  appliances: z.array(applianceSchema).min(1).max(200),
  rooms: z.array(roomSchema).max(100),
});

export const datasheetExtractRequestSchema = z.object({
  imageBase64: z.string().min(100).max(6_000_000),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  consentAccepted: z.literal(true),
});
