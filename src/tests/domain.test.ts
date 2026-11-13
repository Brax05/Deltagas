import { describe, expect, it } from "vitest";
import {
  calculateFormulaPressureDropPa,
  lookupPartialPressureDropFromTable,
} from "@/domain/ds66/pressure-tables";
import {
  calculateNetwork,
  evaluateGlpCylinders,
  evaluateHermeticity,
  evaluateRooms,
  generateNetworkSuggestions,
} from "@/domain/calculations";
import {
  applyAddSegment,
  applyAdjustLastPartLengthCm,
  applyDeleteSegmentWithSubtree,
  createInitialHistory,
  evaluateDirectionsFromPoint,
  redoNetworkHistory,
  undoNetworkHistory,
  validateDiagram,
} from "@/domain/diagram";
import { createExamReferenceProject } from "@/domain/fixtures/exam-reference";
import { sanitizeProjectData } from "@/lib/storage/draft";
import type { Appliance, Segment } from "@/domain/types";

describe("DS 66 Tablas 1/5 y Fórmula de Pole (Sección 5.1)", () => {
  it("reproduce el ejemplo normativo: GN, 1\", 41 Mcal/h, 8 m -> 24 Pa (3 Pa/m)", () => {
    const lookup = lookupPartialPressureDropFromTable({
      gasFamily: "GN",
      nominalDiameter: "1",
      realLengthMeters: 8,
      powerMcalH: 41,
    });

    expect(lookup.tableName).toBe("Tabla 5 (GN)");
    expect(lookup.referenceLengthMeters).toBe(8);
    expect(lookup.gradientPaPerMeter).toBe(3);
    expect(lookup.partialDropPa).toBe(24);
    expect(lookup.powerOutOfRange).toBe(false);

    const polePa = calculateFormulaPressureDropPa({
      gasFamily: "GN",
      nominalDiameter: "1",
      lengthMeters: 8,
      powerMcalH: 41,
    });

    expect(polePa).toBeGreaterThan(22);
    expect(polePa).toBeLessThan(26);
  });
});

describe("Caso de referencia de examen (Sección 17)", () => {
  const exam = createExamReferenceProject();

  it("acumula potencias aguas arriba correctamente (44,5 Mcal/h en T1)", () => {
    const result = calculateNetwork({
      gasType: exam.gasType,
      segments: exam.segments,
      appliances: exam.appliances,
    });

    expect(result.totalPowerMcalH).toBeCloseTo(44.5, 4);
    expect(result.totalPowerKw).toBeCloseTo(44.5 * 1.163, 3);
    expect(result.servicePressurePa).toBe(2800);
    expect(result.maxAllowedDropPa).toBe(150);

    expect(result.segments["T1"]?.downstreamPowerMcalH).toBeCloseTo(44.5, 4);
    expect(result.segments["T3"]?.downstreamPowerMcalH).toBeCloseTo(42.5, 4);
    expect(result.segments["T4"]?.downstreamPowerMcalH).toBeCloseTo(23, 4);
    expect(result.segments["T7"]?.downstreamPowerMcalH).toBeCloseTo(19.5, 4);
    expect(result.segments["T9"]?.downstreamPowerMcalH).toBeCloseTo(16.5, 4);
    expect(result.segments["T11"]?.realLengthMeters).toBeCloseTo(11, 4);
    expect(result.totalPipeVolumeLiters).toBeGreaterThan(0);
  });

  it("evalúa recintos por Tabla XX, fórmula f.8 para estufas y alturas Tabla XXII", () => {
    const evals = evaluateRooms({
      gasType: exam.gasType,
      rooms: exam.rooms,
      appliances: exam.appliances,
    });

    const e1 = evals.find((r) => r.roomId === "room-E1");
    const e2 = evals.find((r) => r.roomId === "room-E2");
    const e3 = evals.find((r) => r.roomId === "room-E3");
    const co = evals.find((r) => r.roomId === "room-Co");

    expect(e1?.volumeRuleApplied).toBe("Fórmula f.8 (estufas)");
    expect(e1?.requiredVolumeM3).toBeCloseTo((2 * 1.163) / 0.093, 2);
    // Recinto E1: 3 * 3 * 2.4 = 21.6 m³ < ~25.01 m³ -> no cumple volumen
    expect(e1?.volumeCompliant).toBe(false);
    expect(e1?.lowerOpeningPlacement).toContain("15 cm");

    expect(e2?.volumeCompliant).toBe(true);
    expect(e3?.volumeCompliant).toBe(true);
    expect(co?.volumeRuleApplied).toBe("Tabla XX");
    expect(co?.requiredVolumeM3).toBe(8);
    expect(co?.volumeCompliant).toBe(true);

    // En GN la abertura inferior pasa a <= 50 cm del suelo
    const gnEvals = evaluateRooms({
      gasType: "GN_V_RM",
      rooms: exam.rooms,
      appliances: exam.appliances,
    });
    expect(gnEvals[0]?.lowerOpeningPlacement).toContain("50 cm");
  });

  it("calcula dotación de cilindros GLP para Arica (180 m², 10 °C, 45 kg)", () => {
    const net = calculateNetwork({
      gasType: exam.gasType,
      segments: exam.segments,
      appliances: exam.appliances,
    });

    const cyl = evaluateGlpCylinders({
      totalInstalledPowerKw: net.totalPowerKw,
      input: exam.cylinders,
    });

    expect(cyl.consumptionLevel).toBe("Alto");
    expect(cyl.vaporizationRateKw).toBe(41);
    expect(cyl.requiredCylinders).toBe(2);
  });

  it("calcula hoja de prueba de hermeticidad (Art. 78.3.5)", () => {
    const net = calculateNetwork({
      gasType: exam.gasType,
      segments: exam.segments,
      appliances: exam.appliances,
    });

    const hermOk = evaluateHermeticity({
      networkResult: net,
      input: exam.hermeticity,
    });
    expect(hermOk.pressureVariationMbar).toBe(0);
    expect(hermOk.referenceDurationMinutesArt78).toBe(15);
    expect(hermOk.passed).toBe(true);

    const hermFail = evaluateHermeticity({
      networkResult: net,
      input: { ...exam.hermeticity, finalPressureMbar: 82 },
    });
    expect(hermFail.pressureVariationMbar).toBe(-2);
    expect(hermFail.passed).toBe(false);
  });
});

describe("Sugerencias ante no cumplimiento (Sección 5.2)", () => {
  it("propone aumento de diámetro hasta cumplir límite de presión", () => {
    const segments: Segment[] = [
      {
        id: "T1",
        fromPointId: "S",
        toPointId: "A",
        parts: [{ direction: "right", lengthCm: 1800 }],
        nominalDiameter: "1/2",
      },
    ];
    const appliances: Appliance[] = [
      {
        id: "A1",
        name: "Calefón 26 Mcal/h",
        segmentId: "T1",
        applianceClass: "calefon",
        circuitType: "A",
        powerMcalPerHour: 26,
        quantity: 1,
      },
    ];

    const initial = calculateNetwork({
      gasType: "GN_V_RM",
      segments,
      appliances,
    });
    expect(initial.allCompliant).toBe(false);

    const sug = generateNetworkSuggestions({
      gasType: "GN_V_RM",
      segments,
      appliances,
      rooms: [],
    });

    expect(sug.diameterChanges.length).toBeGreaterThan(0);
    expect(sug.resultingCompliant).toBe(true);
    expect(sug.smallerAppliances.length).toBeGreaterThan(0);
  });
});

describe("Diagrama ortogonal 2D, colisiones e historial (Módulo 5)", () => {
  it("valida sin cruces la red completa del caso de examen", () => {
    const exam = createExamReferenceProject();
    const validation = validateDiagram(exam.segments);
    expect(validation.valid).toBe(true);
    expect(validation.conflicts).toHaveLength(0);
  });

  it("rechaza segunda salida directa desde regulador S y devoluciones", () => {
    const twoFromS: Segment[] = [
      {
        id: "T1",
        fromPointId: "S",
        toPointId: "A",
        parts: [{ direction: "right", lengthCm: 400 }],
        nominalDiameter: "3/4",
      },
      {
        id: "T2",
        fromPointId: "S",
        toPointId: "B",
        parts: [{ direction: "down", lengthCm: 400 }],
        nominalDiameter: "3/4",
      },
    ];
    const resS = validateDiagram(twoFromS);
    expect(resS.valid).toBe(false);
    expect(resS.conflicts.some((c) => c.code === "MULTIPLE_REGULATOR_EXITS")).toBe(
      true
    );

    const backtrack: Segment[] = [
      {
        id: "T1",
        fromPointId: "S",
        toPointId: "A",
        parts: [{ direction: "right", lengthCm: 500 }],
        nominalDiameter: "3/4",
      },
      {
        id: "T2",
        fromPointId: "A",
        toPointId: "B",
        parts: [{ direction: "left", lengthCm: 200 }],
        nominalDiameter: "1/2",
      },
    ];
    const resBack = validateDiagram(backtrack);
    expect(resBack.valid).toBe(false);
    expect(resBack.conflicts.some((c) => c.code === "BACKTRACK_FORBIDDEN")).toBe(
      true
    );
  });

  it("detecta cruce real indicando tramo bloqueador y respeta undo/redo y desplazamiento rígido", () => {
    const base: Segment[] = [
      {
        id: "T1",
        fromPointId: "S",
        toPointId: "A",
        parts: [{ direction: "right", lengthCm: 1000 }],
        nominalDiameter: "3/4",
      },
      {
        id: "T2",
        fromPointId: "A",
        toPointId: "B",
        parts: [{ direction: "up", lengthCm: 400 }],
        nominalDiameter: "1/2",
      },
      {
        id: "T3",
        fromPointId: "B",
        toPointId: "C",
        parts: [{ direction: "left", lengthCm: 400 }],
        nominalDiameter: "1/2",
      },
    ];

    let hist = createInitialHistory({ segments: base, appliances: [] });

    // T4 baja desde C cruzando horizontalmente T1 en x=6, y=0
    const crossingSeg: Segment = {
      id: "T4",
      fromPointId: "C",
      toPointId: "D",
      parts: [{ direction: "down", lengthCm: 600 }],
      nominalDiameter: "1/2",
    };

    const rejected = applyAddSegment(hist, crossingSeg);
    expect(rejected.lastRejectionReason).toContain("Cruzaría el tramo T1");
    expect(rejected.blockingSegmentId).toBe("T1");
    expect(rejected.present.segments).toHaveLength(3);

    // Alargar T1 desplaza B y C en bloque sin perder la forma ortogonal
    hist = applyAdjustLastPartLengthCm(hist, "T1", 200);
    const layoutAfter = validateDiagram(hist.present.segments).layout;
    expect(layoutAfter.points["A"]?.xMeters).toBe(12);
    expect(layoutAfter.points["B"]?.xMeters).toBe(12);
    expect(layoutAfter.points["C"]?.xMeters).toBe(8);

    // Undo / Redo
    hist = undoNetworkHistory(hist);
    expect(
      validateDiagram(hist.present.segments).layout.points["A"]?.xMeters
    ).toBe(10);
    hist = redoNetworkHistory(hist);
    expect(
      validateDiagram(hist.present.segments).layout.points["A"]?.xMeters
    ).toBe(12);

    // Borrar T2 elimina también su subárbol T3
    hist = applyDeleteSegmentWithSubtree(hist, "T2");
    expect(hist.present.segments.map((s) => s.id)).toEqual(["T1"]);
  });

  it("soporta las 4 direcciones diagonales a escala real y detecta cruces/devoluciones diagonales", () => {
    const t1: Segment = {
      id: "T1",
      fromPointId: "S",
      toPointId: "A",
      parts: [{ direction: "right", lengthCm: 600 }],
      nominalDiameter: "1",
    };

    const dirEval = evaluateDirectionsFromPoint({
      segments: [t1],
      fromPointId: "A",
    });
    expect(dirEval.options).toHaveLength(8);
    expect(dirEval.options.find((o) => o.direction === "left")?.available).toBe(
      false
    );
    expect(
      dirEval.options.find((o) => o.direction === "up-right")?.available
    ).toBe(true);
    expect(
      dirEval.options.find((o) => o.direction === "down-right")?.available
    ).toBe(true);
    expect(
      dirEval.options.find((o) => o.direction === "down-left")?.available
    ).toBe(true);
    expect(
      dirEval.options.find((o) => o.direction === "up-left")?.available
    ).toBe(true);

    // Agregar tramo diagonal de 4 m a 45° conserva longitud euclidiana real = 4 m
    const t2Diag: Segment = {
      id: "T2",
      fromPointId: "A",
      toPointId: "B",
      parts: [{ direction: "up-right", lengthCm: 400 }],
      nominalDiameter: "1/2",
    };
    const validDiag = validateDiagram([t1, t2Diag]);
    expect(validDiag.valid).toBe(true);
    const ptA = validDiag.layout.points["A"]!;
    const ptB = validDiag.layout.points["B"]!;
    expect(
      Math.hypot(ptB.xMeters - ptA.xMeters, ptB.yMeters - ptA.yMeters)
    ).toBeCloseTo(4, 3);

    // No permite devolverse diagonalmente (down-left tras up-right)
    const diagBacktrack = validateDiagram([
      t1,
      t2Diag,
      {
        id: "T3",
        fromPointId: "B",
        toPointId: "C",
        parts: [{ direction: "down-left", lengthCm: 200 }],
        nominalDiameter: "1/2",
      },
    ]);
    expect(diagBacktrack.valid).toBe(false);
    expect(
      diagBacktrack.conflicts.some((c) => c.code === "BACKTRACK_FORBIDDEN")
    ).toBe(true);

    // Detecta cruce en X entre dos diagonales (T1 up-right y T3 down-right desde B)
    const diagCross = validateDiagram([
      {
        id: "T1",
        fromPointId: "S",
        toPointId: "A",
        parts: [{ direction: "up-right", lengthCm: 600 }],
        nominalDiameter: "3/4",
      },
      {
        id: "T2",
        fromPointId: "A",
        toPointId: "B",
        parts: [{ direction: "left", lengthCm: 400 }],
        nominalDiameter: "1/2",
      },
      {
        id: "T3",
        fromPointId: "B",
        toPointId: "C",
        parts: [{ direction: "down-right", lengthCm: 600 }],
        nominalDiameter: "1/2",
      },
    ]);
    expect(diagCross.valid).toBe(false);
    expect(diagCross.conflicts.some((c) => c.code === "CROSSING")).toBe(true);
    expect(diagCross.conflicts[0]?.message).toContain("Cruzaría el tramo T1");
  });
});

describe("Persistencia y sanitización de borradores", () => {
  it("normaliza recintos sin dimensiones válidas y recupera proyectos con tramos válidos", () => {
    const valid = createExamReferenceProject();
    const withBrokenRoom = {
      ...valid,
      rooms: [
        {
          id: "r1",
          name: "Recinto antiguo",
          ventilationType: "directa",
        },
      ],
    };

    const sanitized = sanitizeProjectData(withBrokenRoom);
    expect(sanitized).not.toBeNull();
    expect(sanitized?.segments).toHaveLength(11);
    expect(sanitized?.rooms[0]?.lengthMeters).toBe(3);
    expect(sanitized?.rooms[0]?.widthMeters).toBe(3);
    expect(sanitized?.rooms[0]?.heightMeters).toBe(2.4);
  });

  it("descarta borradores de esquema antiguo incompatible o examen vacío", () => {
    const incompatible = {
      id: "old",
      gasType: "GLP",
      segments: [{ id: "T1", fromPointId: "S", toPointId: "A" }],
    };
    expect(sanitizeProjectData(incompatible)).toBeNull();

    const emptyExam = {
      id: "proyecto-examen-ds66",
      gasType: "GLP",
      segments: [],
    };
    expect(sanitizeProjectData(emptyExam)).toBeNull();
  });
});
