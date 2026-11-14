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
  applyUpdateSegmentParts,
  createInitialHistory,
  evaluateDirectionsFromPoint,
  parseDecimalMeters,
  redoNetworkHistory,
  snapVectorToDirectionAndStepCm,
  undoNetworkHistory,
  validateDiagram,
} from "@/domain/diagram";
import { createResidentialExtendedProject } from "@/domain/fixtures/residential-extended";
import {
  DIAGRAM_EXAMPLES,
  getDefaultExampleDiagram,
} from "@/domain/fixtures/examples";
import { resolveDraftProject, sanitizeProjectData } from "@/lib/storage/draft";
import type { Appliance, Segment } from "@/domain/types";

describe("DS 66 Tablas 1/5 y Fórmula de Pole (Art. 46)", () => {
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

describe("Red residencial ramificada DS 66 (Ejemplo 2)", () => {
  const refProject = createResidentialExtendedProject();

  it("acumula potencias aguas arriba correctamente (50 Mcal/h en T1)", () => {
    const result = calculateNetwork({
      gasType: refProject.gasType,
      segments: refProject.segments,
      appliances: refProject.appliances,
    });

    expect(result.totalPowerMcalH).toBeCloseTo(50, 4);
    expect(result.totalPowerKw).toBeCloseTo(50 * 1.163, 3);
    expect(result.servicePressurePa).toBe(2800);
    expect(result.maxAllowedDropPa).toBe(150);

    expect(result.segments["T1"]?.downstreamPowerMcalH).toBeCloseTo(50, 4);
    expect(result.segments["T3"]?.downstreamPowerMcalH).toBeCloseTo(47, 4);
    expect(result.segments["T4"]?.downstreamPowerMcalH).toBeCloseTo(23, 4);
    expect(result.segments["T7"]?.downstreamPowerMcalH).toBeCloseTo(24, 4);
    expect(result.segments["T9"]?.downstreamPowerMcalH).toBeCloseTo(19, 4);
    expect(result.segments["T11"]?.realLengthMeters).toBeCloseTo(9, 4);
    expect(result.totalPipeVolumeLiters).toBeGreaterThan(0);
  });

  it("evalúa recintos por Tabla XX, fórmula f.8 para estufas y alturas Tabla XXII", () => {
    const evals = evaluateRooms({
      gasType: refProject.gasType,
      rooms: refProject.rooms,
      appliances: refProject.appliances,
    });

    const e1 = evals.find((r) => r.roomId === "room-E1");
    const e2 = evals.find((r) => r.roomId === "room-E2");
    const e3 = evals.find((r) => r.roomId === "room-E3");
    const co = evals.find((r) => r.roomId === "room-Co");

    expect(e1?.volumeRuleApplied).toBe("Fórmula f.8 (estufas)");
    expect(e1?.requiredVolumeM3).toBeCloseTo((3 * 1.163) / 0.093, 2);
    // Recinto E1: 3 * 3 * 2.4 = 21.6 m³ < ~37.52 m³ -> no cumple volumen
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
      rooms: refProject.rooms,
      appliances: refProject.appliances,
    });
    expect(gnEvals[0]?.lowerOpeningPlacement).toContain("50 cm");
  });

  it("calcula dotación de cilindros GLP según DS 66 Tablas XVI y XVIII (Concepción, 160 m², 0 °C, 45 kg)", () => {
    const net = calculateNetwork({
      gasType: refProject.gasType,
      segments: refProject.segments,
      appliances: refProject.appliances,
    });

    const cyl = evaluateGlpCylinders({
      totalInstalledPowerKw: net.totalPowerKw,
      input: refProject.cylinders,
    });

    expect(cyl.consumptionLevel).toBe("Alto");
    expect(cyl.vaporizationRateKw).toBe(34);
    expect(cyl.requiredCylinders).toBe(2);
  });

  it("calcula hoja de prueba de hermeticidad (Art. 78.3.5)", () => {
    const net = calculateNetwork({
      gasType: refProject.gasType,
      segments: refProject.segments,
      appliances: refProject.appliances,
    });

    const hermOk = evaluateHermeticity({
      networkResult: net,
      input: refProject.hermeticity,
    });
    expect(hermOk.pressureVariationMbar).toBe(0);
    expect(hermOk.referenceDurationMinutesArt78).toBe(15);
    expect(hermOk.passed).toBe(true);

    const hermFail = evaluateHermeticity({
      networkResult: net,
      input: { ...refProject.hermeticity, finalPressureMbar: 82 },
    });
    expect(hermFail.pressureVariationMbar).toBe(-2);
    expect(hermFail.passed).toBe(false);
  });
});

describe("Sugerencias ante no cumplimiento (DS 66 Tabla VIII)", () => {
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

describe("Diagrama ortogonal 2D, colisiones e historial", () => {
  it("valida sin cruces la red completa del ejemplo residencial ramificado", () => {
    const refProject = createResidentialExtendedProject();
    const validation = validateDiagram(refProject.segments);
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
    const valid = createResidentialExtendedProject();
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

  it("descarta borradores de esquema antiguo incompatible o ejemplo vacío", () => {
    const incompatible = {
      id: "old",
      gasType: "GLP",
      segments: [{ id: "T1", fromPointId: "S", toPointId: "A" }],
    };
    expect(sanitizeProjectData(incompatible)).toBeNull();

    const emptyPreset = {
      id: "ejemplo-residencial-glp-completo",
      gasType: "GLP",
      segments: [],
    };
    expect(sanitizeProjectData(emptyPreset)).toBeNull();
  });

  it("inicia vacío por defecto y conserva el diagrama de ejemplo cuando el usuario lo carga", () => {
    expect(DIAGRAM_EXAMPLES.map((ex) => ex.title)).toEqual([
      "Ejemplo 1",
      "Ejemplo 2",
    ]);
    expect(resolveDraftProject(null).segments).toHaveLength(0);

    const legacyAutoSeeded = createResidentialExtendedProject();
    expect(
      resolveDraftProject(JSON.stringify(legacyAutoSeeded), {
        fromLegacyStorage: true,
      }).segments
    ).toHaveLength(0);

    const loadedExample = getDefaultExampleDiagram();
    const restored = resolveDraftProject(JSON.stringify(loadedExample));
    expect(restored.id).toBe("ejemplo-residencial-glp-basico");
    expect(restored.gasType).toBe("GLP");
    expect(restored.segments).toHaveLength(5);
    expect(restored.appliances.map((a) => [a.name, a.powerMcalPerHour])).toEqual([
      ["Calefón 10 L/min", 20],
      ["Cocina completa", 8],
      ["Estufa mural chica", 3],
    ]);
    expect(validateDiagram(restored.segments).valid).toBe(true);
    const basicCalc = calculateNetwork({
      gasType: restored.gasType,
      segments: restored.segments,
      appliances: restored.appliances,
    });
    expect(basicCalc.totalPowerMcalH).toBe(31);
    expect(basicCalc.allCompliant).toBe(true);

    const extendedLoaded = DIAGRAM_EXAMPLES.find(
      (ex) => ex.id === "ejemplo-residencial-glp-completo"
    )?.createProject();
    expect(extendedLoaded).toBeDefined();
    const extendedRestored = resolveDraftProject(JSON.stringify(extendedLoaded));
    expect(extendedRestored.segments).toHaveLength(11);
    expect(extendedRestored.id).toBe("ejemplo-residencial-glp-completo");

    const customV1 = { ...extendedLoaded!, id: "mi-proyecto-1" };
    expect(
      resolveDraftProject(JSON.stringify(customV1), {
        fromLegacyStorage: true,
      }).segments
    ).toHaveLength(11);
  });
});

describe("Snapping direccional en saltos de 10 cm al arrastrar nodos", () => {
  it("cuantiza cualquier vector a la dirección más cercana (8 direcciones) en saltos de 10 cm", () => {
    // Hacia la derecha 2.34 m -> right, 230 cm
    const rightSnap = snapVectorToDirectionAndStepCm({
      dxMeters: 2.34,
      dyMeters: 0.12,
    });
    expect(rightSnap).toEqual({ direction: "right", lengthCm: 230 });

    // Diagonal arriba-derecha 3.0 m (proyección sobre u = (cos 45, sin 45) -> dist = 3.0 m -> 300 cm)
    const diagLen = 3 * Math.SQRT1_2;
    const diagSnap = snapVectorToDirectionAndStepCm({
      dxMeters: diagLen,
      dyMeters: diagLen,
    });
    expect(diagSnap).toEqual({ direction: "up-right", lengthCm: 300 });

    // Vector nulo usa dirección fallback y largo mínimo de 10 cm
    const minSnap = snapVectorToDirectionAndStepCm({
      dxMeters: 0,
      dyMeters: 0,
      fallbackDirection: "down",
    });
    expect(minSnap).toEqual({ direction: "down", lengthCm: 10 });
  });

  it("actualiza dirección y longitud en 10 cm en un único paso de historial al soltar nodo", () => {
    let hist = createInitialHistory({
      segments: [
        {
          id: "T1",
          fromPointId: "S",
          toPointId: "A",
          parts: [{ direction: "right", lengthCm: 400 }],
          nominalDiameter: "1/2",
        },
      ],
      appliances: [],
    });
    hist = applyUpdateSegmentParts(hist, "T1", [
      { direction: "up-right", lengthCm: 430 },
    ]);
    expect(hist.lastRejectionReason).toBeNull();
    expect(hist.present.segments[0]?.parts[0]).toEqual({
      direction: "up-right",
      lengthCm: 430,
    });
    expect(hist.past).toHaveLength(1);
    hist = undoNetworkHistory(hist);
    expect(hist.present.segments[0]?.parts[0]).toEqual({
      direction: "right",
      lengthCm: 400,
    });
  });
});

describe("Tramos cortos (1,5 m) cerca de tramos existentes y decimales con coma", () => {
  it("habilita direcciones donde cabe un tramo corto (1.5 m) aunque exista un tramo a 2.0 m", () => {
    // T1: S(0,0) -> A(0,4); T2: A(0,4) -> B(2,4); T3: B(2,4) -> C(2,2)
    // Desde C(2,2) hacia la izquierda hay 2.0 m hasta T1 en x = 0.
    const segments: Segment[] = [
      {
        id: "T1",
        fromPointId: "S",
        toPointId: "A",
        parts: [{ direction: "up", lengthCm: 400 }],
        nominalDiameter: "1/2",
      },
      {
        id: "T2",
        fromPointId: "A",
        toPointId: "B",
        parts: [{ direction: "right", lengthCm: 200 }],
        nominalDiameter: "1/2",
      },
      {
        id: "T3",
        fromPointId: "B",
        toPointId: "C",
        parts: [{ direction: "down", lengthCm: 200 }],
        nominalDiameter: "1/2",
      },
    ];

    // Sin largo fijo (puertos '+' del diagrama), "left" debe permanecer disponible
    const portEval = evaluateDirectionsFromPoint({
      segments,
      fromPointId: "C",
    });
    const leftPort = portEval.options.find((o) => o.direction === "left");
    expect(leftPort?.available).toBe(true);
    expect(leftPort?.maxLengthCm).toBe(190);
    expect(leftPort?.suggestedLengthCm).toBe(150);

    // Con largo explícito 150 cm (1.5 m), "left" debe estar habilitado y validar sin conflictos
    const shortEval = evaluateDirectionsFromPoint({
      segments,
      fromPointId: "C",
      candidateLengthCm: 150,
    });
    expect(shortEval.options.find((o) => o.direction === "left")?.available).toBe(
      true
    );

    const validShort = validateDiagram([
      ...segments,
      {
        id: "T4",
        fromPointId: "C",
        toPointId: "D",
        parts: [{ direction: "left", lengthCm: 150 }],
        nominalDiameter: "1/2",
      },
    ]);
    expect(validShort.valid).toBe(true);
  });

  it("parsea medidas con coma y punto decimal (ej. 1,5 y 1.5)", () => {
    expect(parseDecimalMeters("1,5")).toBe(1.5);
    expect(parseDecimalMeters("1.5")).toBe(1.5);
    expect(parseDecimalMeters(" 0,8 ")).toBe(0.8);
    expect(parseDecimalMeters("")).toBeNull();
    expect(parseDecimalMeters("abc")).toBeNull();
    expect(parseDecimalMeters("55", 0, 50)).toBeNull();
  });
});


