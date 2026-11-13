import { createExamReferenceProject } from "@/domain/fixtures/exam-reference";
import { createModule4Part2ExampleProject } from "@/domain/fixtures/module4-example";
import type { ProjectData } from "@/domain/types";

export interface DiagramExampleDefinition {
  id: string;
  title: string;
  badge: string;
  description: string;
  createProject: () => ProjectData;
}

export const DIAGRAM_EXAMPLES: readonly DiagramExampleDefinition[] = [
  {
    id: "modulo-4-parte-2-1-glp",
    title: "Ejemplo 1",
    badge: "5 tramos · 3 artefactos",
    description:
      "Red GLP con tramos 1-2 (10 m), 2-3 (2 m), 2-4 (5 m), 4-5 (2 m) y 4-6 (7 m), y artefactos en orden de tabla: Calefón 26, Cocina 8 y Estufa 5 Mcal/h.",
    createProject: () => ({
      ...createModule4Part2ExampleProject(),
      updatedAt: new Date().toISOString(),
    }),
  },
  {
    id: "examen-arica-ds66",
    title: "Ejemplo 2",
    badge: "Escala real · 11 tramos · 6 artefactos",
    description:
      "Red GLP en Cobre Tipo L (44,5 Mcal/h) con tramos ortogonales y diagonales, 6 artefactos, recintos evaluados y prueba de hermeticidad.",
    createProject: () => ({
      ...createExamReferenceProject(),
      updatedAt: new Date().toISOString(),
    }),
  },
];

export function getDefaultExampleDiagram(): ProjectData {
  return DIAGRAM_EXAMPLES[0]!.createProject();
}
