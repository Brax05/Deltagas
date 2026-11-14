import rawCorpus from "@/domain/ds66/ds66-corpus.json";
import type { ChatSourceCitation } from "@/lib/chat/contracts";

interface RawChunk {
  id: string;
  ref: string;
  chapter: string;
  title: string;
  articleNumber: string;
  subRef: string;
  keywords: string;
  text: string;
}

const CHUNKS = (rawCorpus as { chunks: RawChunk[] }).chunks;

const STOPWORDS = new Set([
  "de",
  "la",
  "el",
  "los",
  "las",
  "en",
  "y",
  "o",
  "a",
  "para",
  "por",
  "con",
  "sin",
  "un",
  "una",
  "que",
  "como",
  "cual",
  "se",
  "su",
  "del",
  "al",
  "es",
  "son",
  "si",
  "no",
  "lo",
  "mas",
  "menos",
  "sobre",
  "entre",
  "puedo",
  "puede",
  "debe",
  "debo",
  "hay",
]);

const ARABIC_TO_ROMAN_TABLES: Record<string, string> = {
  "1": "i",
  "5": "v",
  "6": "vi",
  "8": "viii",
  "16": "xvi",
  "17": "xvii",
  "18": "xviii",
  "20": "xx",
  "21": "xxi",
  "22": "xxii",
};

const SYNONYMS: Record<string, string[]> = {
  calefont: ["calefon", "calentador"],
  calefon: ["calefont", "calentador"],
  bano: ["ducha", "aseo", "dormitorio", "70.1.3"],
  dormitorio: ["bano", "pieza", "habitacion", "70.1.3"],
  caneria: ["tuberia", "cobre", "tramo"],
  tuberia: ["caneria", "cobre"],
  balon: ["cilindro", "glp", "vaporizacion"],
  cilindro: ["balon", "glp", "xvii", "xviii"],
  rejilla: ["abertura", "celosia", "ventilacion", "xxi", "xxii"],
  ventilacion: ["abertura", "rejilla", "celosia", "xxi", "xxii"],
  estufa: ["calefactor", "f.8", "xx"],
  hermeticidad: ["fuga", "manometro", "prueba", "78.3.5"],
  fuga: ["hermeticidad", "escape", "78.3.5"],
  llave: ["valvula", "corte", "paso"],
};

function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\bds\s*66\b/g, "ds66")
    .replace(/\btabla\s+(\d+|[ivx]+)\b/g, (_, num: string) => {
      const roman = ARABIC_TO_ROMAN_TABLES[num];
      return roman ? `tabla_${num} tabla_${roman}` : `tabla_${num}`;
    });
}

function tokenize(norm: string): string[] {
  const raw =
    norm.match(/\d+(?:\.\d+)+|[a-z]+\.\d+|tabla_[a-z0-9]+|[a-z0-9]+/g) ?? [];
  return raw.filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

function detectRefs(normQuery: string): string[] {
  const refs = new Set<string>();
  for (const m of normQuery.matchAll(/\bart(?:iculo)?\.?\s*(\d+)\b/g)) {
    if (m[1]) refs.add(m[1]);
  }
  for (const m of normQuery.matchAll(/\b(\d+\.\d+(?:\.\d+)?)\b/g)) {
    if (m[1]) refs.add(m[1]);
  }
  for (const m of normQuery.matchAll(/\btabla_([ivx0-9]+)\b/g)) {
    if (m[1]) refs.add(`tabla_${m[1]}`);
  }
  if (/\bf\.?8\b/.test(normQuery)) refs.add("f.8");
  return Array.from(refs);
}

interface IndexedChunk {
  chunk: RawChunk;
  normHeader: string;
  normText: string;
  tokens: Set<string>;
}

let cachedDocs: IndexedChunk[] | null = null;

function getDocs(): IndexedChunk[] {
  if (cachedDocs) return cachedDocs;
  cachedDocs = CHUNKS.map((chunk) => {
    const normHeader = normalizeText(
      `${chunk.ref} ${chunk.title} ${chunk.keywords} ${chunk.chapter}`,
    );
    const normText = normalizeText(chunk.text);
    const tokens = new Set(tokenize(`${normHeader} ${normText}`));
    return { chunk, normHeader, normText, tokens };
  });
  return cachedDocs;
}

/**
 * Recupera hasta `limit` artículos/tablas DS 66 desde el servidor ($0) y
 * genera un contexto compacto (~1.600 caracteres max) para ahorrar tokens en Groq.
 */
export function retrieveDs66Grounding(
  question: string,
  limit = 3,
): {
  contextBlock: string;
  sources: ChatSourceCitation[];
} {
  const normQuery = normalizeText(question);
  const baseTerms = Array.from(new Set(tokenize(normQuery)));
  const refs = detectRefs(normQuery);

  if (baseTerms.length === 0 && refs.length === 0) {
    return { contextBlock: "", sources: [] };
  }

  const expanded: Array<{ term: string; weight: number }> = baseTerms.map(
    (term) => ({ term, weight: 1 }),
  );
  for (const term of baseTerms) {
    for (const syn of SYNONYMS[term] ?? []) {
      expanded.push({ term: syn, weight: 0.6 });
    }
  }

  const scored: Array<{ chunk: RawChunk; score: number }> = [];
  for (const doc of getDocs()) {
    let score = 0;

    for (const ref of refs) {
      if (normalizeText(doc.chunk.subRef) === ref) score += 16;
      else if (normalizeText(doc.chunk.articleNumber) === ref) score += 9;
      else if (doc.normHeader.includes(ref)) score += 7;
      else if (doc.normText.includes(ref)) score += 3;
    }

    for (const { term, weight } of expanded) {
      if (doc.normHeader.includes(term)) score += 2.6 * weight;
      else if (doc.tokens.has(term) || doc.normText.includes(term)) score += 1.2 * weight;
    }

    if (score >= 2) {
      scored.push({ chunk: doc.chunk, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const selected = scored.slice(0, limit).map((s) => s.chunk);

  if (selected.length === 0) {
    return { contextBlock: "", sources: [] };
  }

  const sources: ChatSourceCitation[] = selected.map((c) => ({
    ref: c.ref,
    title: c.title,
    chapter: c.chapter,
    excerpt:
      c.text.length > 260 ? `${c.text.slice(0, 257).trim()}...` : c.text,
  }));

  // Contexto compacto (<= 1.600 chars) para cuidar TPM/TPD de capa gratuita.
  const lines: string[] = [];
  let totalChars = 0;
  for (const item of selected) {
    const snippet =
      item.text.length > 480
        ? `${item.text.slice(0, 477).trim()}...`
        : item.text;
    const entry = `[${item.ref} | ${item.title}]: ${snippet}`;
    if (totalChars + entry.length > 1650 && lines.length > 0) break;
    lines.push(entry);
    totalChars += entry.length;
  }

  return {
    contextBlock: lines.join("\n"),
    sources,
  };
}
