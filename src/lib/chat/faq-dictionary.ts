import type { ChatSourceCitation } from "@/lib/chat/contracts";

export interface StaticFaqItem {
  id: string;
  label: string;
  question: string;
  answer: string;
  sources: ChatSourceCitation[];
}

/**
 * Diccionario estático de costo cero ($0) ejecutado 100% en el navegador.
 * Evita peticiones al backend e inferencia IA para las consultas más repetidas.
 */
export const STATIC_FAQ_ITEMS: readonly StaticFaqItem[] = [
  {
    id: "faq-bano-dormitorio",
    label: "Calefón en baño o dormitorio",
    question: "¿Puedo instalar un calefón en baño o dormitorio?",
    answer:
      "No para artefactos tipo A o B: el DS 66 prohíbe instalar artefactos a gas tipo A o B en dormitorios, baños, duchas o recintos de aseo (Art. 70 · 70.1.3). Para recintos de baño/dormitorio solo aplican excepciones de circuito estanco (Tipo C) cumpliendo las condiciones del fabricante y normativa SEC vigente.",
    sources: [
      {
        ref: "Art. 70 · 70.1.3",
        title: "Recintos prohibidos para artefactos Tipo A o B",
        chapter: "CAPITULO IX DE LA INSTALACIÓN DE ARTEFACTOS A GAS",
        excerpt:
          "70.1.3 Los recintos destinados a dormitorio, baño, ducha, aseo o al almacenamiento o manipulación de solventes de pinturas, aceites y otras materias que emitan vapores inflamables, no deberán contar con artefactos a gas tipo A o B.",
      },
    ],
  },
  {
    id: "faq-ventilacion-rejillas",
    label: "Rejillas y ventilación (Tablas XXI/XXII)",
    question: "¿Cómo ubicar las rejillas de ventilación según el gas?",
    answer:
      "Según la Tabla XXII del DS 66: para GLP (más denso que el aire) la ventilación inferior debe quedar a <= 15 cm del suelo, y para Gas Natural (menos denso) a <= 50 cm del suelo. La abertura superior va a >= 1,80 m del suelo o <= 40 cm del techo. Con potencia total > 16 kW se divide en dos aberturas (Tabla XXI: mínimo 100 cm² directa o 125 cm² indirecta hasta 25 kW).",
    sources: [
      {
        ref: "Tablas XXI y XXII · Art. 70.2.2",
        title: "Superficie libre y alturas de aberturas de ventilación",
        chapter: "CAPITULO IX DE LA INSTALACIÓN DE ARTEFACTOS A GAS",
        excerpt:
          "GLP (> aire): abertura inferior <= 15 cm del suelo; GN (< aire): <= 50 cm. Superior >= 1,80 m del suelo o <= 40 cm del techo.",
      },
    ],
  },
  {
    id: "faq-hermeticidad",
    label: "Prueba de hermeticidad (Art. 78.3.5)",
    question: "¿Cuánto dura y cómo se verifica la prueba de hermeticidad?",
    answer:
      "De acuerdo al Art. 78 · 78.3.5 del DS 66 para baja presión, se ensaya la red con manómetro calibrado comparando presión inicial y final sin caídas ni fugas. DeltaGas calcula el tiempo referencial en Resultados usando V · 214 (mínimo 15 minutos y máximo 60 minutos según volumen interno de la tubería).",
    sources: [
      {
        ref: "Art. 78 · 78.3.5",
        title: "Ensayo de hermeticidad en redes interiores de baja presión",
        chapter: "CAPITULO XI DE LA PUESTA EN SERVICIO",
        excerpt:
          "Tiempo mínimo referencial V · 214 (acotado entre 15 y 60 minutos), verificando estanqueidad sin pérdida de presión entre lectura inicial y final.",
      },
    ],
  },
  {
    id: "faq-caida-presion",
    label: "Caída de presión y diámetro",
    question: "¿Cómo calcula DeltaGas la pérdida de presión en cobre?",
    answer:
      "DeltaGas usa las Tablas 1 (GLP, límite 150 Pa y presión de servicio 2.800 Pa) y Tabla 5 (GN, límite 120 Pa y presión de servicio 1.800 Pa) en Cobre Tipo L, junto con la Fórmula de control de Pole modificada con largo equivalente (+20% o +1,0 m mínimo para quiebres/accesorios según corresponda).",
    sources: [
      {
        ref: "Tablas 1 y 5 · Tabla VIII",
        title: "Pérdida máxima de presión en baja presión y Fórmula de Pole",
        chapter: "CAPITULO V PROYECTOS Y DIMENSIONAMIENTO",
        excerpt:
          "Límite máximo acumulado en baja presión: 150 Pa para GLP (servicio 28 mbar / 2.800 Pa) y 120 Pa para GN (servicio 18 mbar / 1.800 Pa).",
      },
    ],
  },
];
