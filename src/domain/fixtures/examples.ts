import { createResidentialBasicProject } from "@/domain/fixtures/residential-basic";
import { createResidentialExtendedProject } from "@/domain/fixtures/residential-extended";
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
    id: "ejemplo-residencial-glp-basico",
    title: "Ejemplo 1",
    badge: "5 tramos · 3 artefactos",
    description:
      "Red residencial GLP (31 Mcal/h) según DS 66 Tabla V con Calefón 10 L/min (20 Mcal/h), Cocina completa (8 Mcal/h) y Estufa mural chica (3 Mcal/h).",
    createProject: () => ({
      ...createResidentialBasicProject(),
      updatedAt: new Date().toISOString(),
    }),
  },
  {
    id: "ejemplo-residencial-glp-completo",
    title: "Ejemplo 2",
    badge: "Escala real · 11 tramos · 6 artefactos",
    description:
      "Red residencial GLP en Cobre Tipo L (50 Mcal/h) con tramos ortogonales y diagonales, 6 artefactos DS 66 Tabla V, evaluación de recintos y prueba de hermeticidad.",
    createProject: () => ({
      ...createResidentialExtendedProject(),
      updatedAt: new Date().toISOString(),
    }),
  },
];

export function getDefaultExampleDiagram(): ProjectData {
  return DIAGRAM_EXAMPLES[0]!.createProject();
}
