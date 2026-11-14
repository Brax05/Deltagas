import {
  CHAT_DEFAULT_TEMPERATURE,
  CHAT_DEFAULT_TIMEOUT_MS,
  CHAT_MAX_CONTEXT_TURNS,
  CHAT_MAX_OUTPUT_TOKENS,
  type ChatTurn,
} from "@/lib/chat/contracts";

export interface OptimizedPromptPayload {
  systemPrompt: string;
  recentHistory: ChatTurn[];
  userMessage: string;
}

/**
 * Construye un contexto compacto enviando únicamente:
 * - System Prompt breve y acotado (con grounding DS 66 si existe)
 * - Últimos 4 mensajes del intercambio (2 del usuario y 2 del asistente)
 */
export function buildOptimizedPrompt(params: {
  question: string;
  history: ChatTurn[];
  ds66Context?: string;
}): OptimizedPromptPayload {
  const basePrompt =
    "Eres el asistente técnico breve de DeltaGas (redes interiores de gas en baja presión según DS 66 Chile). Responde en español en máximo 3-4 frases claras. Si el contexto normativo incluye artículos, tablas o figuras, cita explícitamente su número exacto (ej. Art. 70 · 70.1.3, Tabla XX). Si algo no consta en el contexto ni aplica al DS 66, indícalo sin inventar artículos y recuerda confirmar con un instalador autorizado SEC.";

  const systemPrompt = params.ds66Context
    ? `${basePrompt}\n\nReferencia oficial DS 66 pertinente:\n${params.ds66Context}`
    : basePrompt;

  // Recorte estricto a últimos 4 mensajes (2 usuario + 2 asistente)
  const recentHistory = params.history
    .slice(-CHAT_MAX_CONTEXT_TURNS)
    .map((turn) => ({
      role: turn.role,
      content: turn.content.slice(0, 300).trim(),
    }));

  return {
    systemPrompt,
    recentHistory,
    userMessage: params.question,
  };
}

export class ProviderRequestError extends Error {
  constructor(
    public readonly provider: "groq",
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "ProviderRequestError";
  }
}

export async function callGroqPrimary(params: {
  prompt: OptimizedPromptPayload;
  apiKey: string;
  model?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<{ reply: string; model: string }> {
  const model = params.model?.trim() || "llama-3.1-8b-instant";
  const timeoutMs = params.timeoutMs ?? CHAT_DEFAULT_TIMEOUT_MS;
  const fetchFn = params.fetchImpl ?? fetch;

  const messages = [
    { role: "system", content: params.prompt.systemPrompt },
    ...params.prompt.recentHistory.map((m) => ({
      role: m.role,
      content: m.content,
    })),
    { role: "user", content: params.prompt.userMessage },
  ];

  const response = await fetchFn(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: CHAT_MAX_OUTPUT_TOKENS,
        temperature: CHAT_DEFAULT_TEMPERATURE,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    },
  );

  if (!response.ok) {
    throw new ProviderRequestError(
      "groq",
      response.status,
      `Groq HTTP ${response.status}`,
    );
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const reply = data.choices?.[0]?.message?.content?.trim();
  if (!reply) {
    throw new ProviderRequestError("groq", 502, "Groq returned empty reply");
  }

  return { reply, model };
}
