import {
  CHAT_DEFAULT_CACHE_TTL_SECONDS,
  CHAT_DEFAULT_TIMEOUT_MS,
  CHAT_RATE_LIMIT_DAY_MAX,
  CHAT_RATE_LIMIT_MINUTE_MAX,
  chatRequestSchema,
  type ChatErrorPayload,
  type ChatMetricsSnapshot,
  type ChatResponsePayload,
  type ChatSourceCitation,
} from "@/lib/chat/contracts";
import { retrieveDs66Grounding } from "@/lib/chat/ds66-grounding";
import {
  buildOptimizedPrompt,
  callGroqPrimary,
} from "@/lib/chat/providers";
import { getDefaultChatStore, type ChatStore } from "@/lib/chat/redis-store";
import {
  buildCorsHeaders,
  extractVisitorKey,
  normalizeAndHashQuestion,
  sanitizeChatMessage,
  validateCorsOrigin,
  verifyTurnstileToken,
} from "@/lib/chat/security";

interface CachedChatValue {
  reply: string;
  model?: string;
  sources?: ChatSourceCitation[];
}

export interface ChatPipelineDependencies {
  store?: ChatStore;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  nowMs?: () => number;
  logMetrics?: boolean;
}

export interface ChatPipelineHttpResult {
  status: number;
  headers: Record<string, string>;
  body: ChatResponsePayload | ChatErrorPayload;
}

const METRIC_KEYS = {
  cache: "metrics:chat:cache",
  groq: "metrics:chat:groq",
  fallback: "metrics:chat:fallback",
  rateLimited: "metrics:chat:rate_limited",
} as const;

export async function getChatMetricsSnapshot(
  store: ChatStore,
): Promise<ChatMetricsSnapshot> {
  const [cacheRaw, groqRaw, fallbackRaw, rlRaw] = await Promise.all([
    store.get(METRIC_KEYS.cache),
    store.get(METRIC_KEYS.groq),
    store.get(METRIC_KEYS.fallback),
    store.get(METRIC_KEYS.rateLimited),
  ]);

  const cache = Number.parseInt(cacheRaw ?? "0", 10) || 0;
  const groq = Number.parseInt(groqRaw ?? "0", 10) || 0;
  const fallback = Number.parseInt(fallbackRaw ?? "0", 10) || 0;
  const rateLimited = Number.parseInt(rlRaw ?? "0", 10) || 0;

  const total = cache + groq + fallback;
  const pct = (value: number) =>
    total > 0 ? Number(((value / total) * 100).toFixed(1)) : 0;

  return {
    total,
    counts: { cache, groq, fallback, rateLimited },
    percentages: {
      cache: pct(cache),
      groq: pct(groq),
      fallback: pct(fallback),
    },
  };
}

function readPositiveInt(value: string | undefined, fallback: number): number {
  const n = value ? Number.parseInt(value, 10) : Number.NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function buildFallbackReply(params: {
  sources: ChatSourceCitation[];
  contactUrl?: string;
  groqConfigured: boolean;
}): string {
  const { sources, contactUrl, groqConfigured } = params;
  const contactPart = contactUrl
    ? ` Puedes escribirnos directo por contacto: ${contactUrl}.`
    : " Puedes usar el formulario o datos de contacto de tu instalador autorizado.";

  if (!groqConfigured) {
    if (sources.length > 0) {
      const refs = sources.map((s) => s.ref).join(", ");
      return `Aún no está configurada la llave GROQ_API_KEY en el servidor, pero según el DS 66 puedes revisar ${refs} en las referencias adjuntas (o usar las preguntas frecuentes rápidas $0 arriba).${contactPart}`;
    }

    return `Aún no está configurada la llave GROQ_API_KEY en el servidor. Mientras tanto puedes revisar las preguntas frecuentes rápidas ($0) arriba.${contactPart}`;
  }

  if (sources.length > 0) {
    const refs = sources.map((s) => s.ref).join(", ");
    return `Lo sentimos, en este momento el motor de IA no está disponible y estamos trabajando para solucionarlo. Mientras tanto, según el DS 66 puedes revisar ${refs} en las referencias adjuntas o usar las preguntas frecuentes rápidas ($0).${contactPart}`;
  }

  return `Lo sentimos, en este momento el motor de IA no está disponible y estamos trabajando para solucionarlo. Mientras tanto, puedes usar las preguntas frecuentes rápidas ($0) de arriba o verificar tu instalación con un profesional SEC.${contactPart}`;
}

/**
 * Pipeline estricto de 6 pasos en servidor:
 * 1. Validación de seguridad (CORS, Turnstile, sanitización/truncado 300 chars)
 * 2. Rate limiting por IP/sesión (máx 5/min y 20/día en Redis)
 * 3. Búsqueda en caché SHA-256 (solo primer mensaje sin historial)
 * 4. Optimización de contexto (system prompt conciso + últimos 4 mensajes)
 * 5. Enrutamiento a Groq (llama-3.1-8b-instant) y respaldo amable con citas DS 66 si cae
 * 6. Guardado en caché (TTL 24-72h) + métricas de ahorro
 */
export async function executeChatPipeline(
  request: Request,
  deps: ChatPipelineDependencies = {},
): Promise<ChatPipelineHttpResult> {
  const env = deps.env ?? process.env;
  const store = deps.store ?? getDefaultChatStore();
  const fetchImpl = deps.fetchImpl ?? fetch;
  const nowFn = deps.nowMs ?? (() => Date.now());
  const startMs = nowFn();

  // 1a. Validar CORS para dominio oficial
  const cors = validateCorsOrigin(request, env);
  const corsHeaders = buildCorsHeaders(cors.allowed ? cors.origin : null);
  if (!cors.allowed) {
    return {
      status: 403,
      headers: corsHeaders,
      body: {
        error: "Origen no autorizado para consultar el asistente.",
        code: "CORS_FORBIDDEN",
      },
    };
  }

  // Parseo de JSON de entrada
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return {
      status: 400,
      headers: corsHeaders,
      body: {
        error: "Cuerpo JSON inválido.",
        code: "INVALID_REQUEST",
      },
    };
  }

  const parsed = chatRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return {
      status: 400,
      headers: corsHeaders,
      body: {
        error:
          parsed.error.issues[0]?.message ?? "Ingresa un mensaje válido.",
        code: "INVALID_REQUEST",
      },
    };
  }

  const { rawIp, hashedVisitorKey } = extractVisitorKey(
    request,
    parsed.data.sessionId,
  );

  // 1b. Verificar token Cloudflare Turnstile
  const turnstileResult = await verifyTurnstileToken({
    token: parsed.data.turnstileToken,
    remoteIp: rawIp,
    secretKey: env.TURNSTILE_SECRET_KEY,
    isProduction: env.NODE_ENV === "production",
    fetchImpl,
  });

  if (!turnstileResult.ok) {
    return {
      status: turnstileResult.statusCode ?? 403,
      headers: corsHeaders,
      body: {
        error:
          turnstileResult.reason ?? "Falló la verificación anti-bot.",
        code: turnstileResult.code ?? "TURNSTILE_FAILED",
      },
    };
  }

  // 1c. Sanitizar y truncar entrada a máximo 300 caracteres
  const cleanMessage = sanitizeChatMessage(parsed.data.message);
  if (!cleanMessage) {
    return {
      status: 400,
      headers: corsHeaders,
      body: {
        error: "El mensaje quedó vacío tras sanitizar caracteres.",
        code: "INVALID_REQUEST",
      },
    };
  }

  // 2. Control de abuso (Rate Limiting: 5/min y 20/día en Redis)
  const limitPerMin = readPositiveInt(
    env.CHAT_RATE_LIMIT_PER_MIN,
    CHAT_RATE_LIMIT_MINUTE_MAX,
  );
  const limitPerDay = readPositiveInt(
    env.CHAT_RATE_LIMIT_PER_DAY,
    CHAT_RATE_LIMIT_DAY_MAX,
  );

  const currentNowMs = nowFn();
  const minuteBucket = Math.floor(currentNowMs / 60_000);
  const dayBucket = new Date(currentNowMs).toISOString().slice(0, 10);

  const minKey = `rl:chat:min:${hashedVisitorKey}:${minuteBucket}`;
  const dayKey = `rl:chat:day:${hashedVisitorKey}:${dayBucket}`;

  const minCount = await store.incrWithExpire(minKey, 65);
  if (minCount > limitPerMin) {
    await store.incr(METRIC_KEYS.rateLimited);
    return {
      status: 429,
      headers: {
        ...corsHeaders,
        "Retry-After": "60",
      },
      body: {
        error: `Enviaste demasiados mensajes seguidos (máx. ${limitPerMin} por minuto). Espera unos segundos antes de volver a consultar.`,
        code: "RATE_LIMITED",
        retryAfterSeconds: 60,
      },
    };
  }

  const dayCount = await store.incrWithExpire(dayKey, 90_000);
  if (dayCount > limitPerDay) {
    await store.incr(METRIC_KEYS.rateLimited);
    return {
      status: 429,
      headers: {
        ...corsHeaders,
        "Retry-After": "3600",
      },
      body: {
        error: `Alcanzaste el límite diario de ${limitPerDay} consultas IA por hoy. Usa las preguntas rápidas gratuitas o intenta mañana.`,
        code: "RATE_LIMITED",
        retryAfterSeconds: 3600,
      },
    };
  }

  const rateLimitRemaining = {
    minute: Math.max(0, limitPerMin - minCount),
    day: Math.max(0, limitPerDay - dayCount),
  };

  // 3. Búsqueda en Caché SHA-256 (solo primer mensaje sin historial previo)
  const isInitialQuestion = parsed.data.history.length === 0;
  const questionHash = normalizeAndHashQuestion(cleanMessage);
  const cacheKey = `cache:chat:v1:${questionHash}`;

  if (isInitialQuestion) {
    const cachedRaw = await store.get(cacheKey);
    if (cachedRaw) {
      try {
        const cachedData = JSON.parse(cachedRaw) as CachedChatValue;
        if (cachedData.reply) {
          await store.incr(METRIC_KEYS.cache);
          const latencyMs = Math.max(1, nowFn() - startMs);
          if (deps.logMetrics !== false) {
            const snap = await getChatMetricsSnapshot(store);
            console.info(
              `[chat-metrics] provider=cache cache=${snap.percentages.cache}% groq=${snap.percentages.groq}% backend=${store.backend} latencyMs=${latencyMs}`,
            );
          }
          return {
            status: 200,
            headers: corsHeaders,
            body: {
              reply: cachedData.reply,
              provider: "cache",
              model: cachedData.model,
              cached: true,
              latencyMs,
              sources: cachedData.sources,
              rateLimitRemaining,
            },
          };
        }
      } catch {
        // Ignorar entrada corrupta en caché y continuar con inferencia
      }
    }
  }

  // 4. Optimización de contexto + grounding compacto DS 66 ($0)
  const { contextBlock, sources } = retrieveDs66Grounding(cleanMessage, 3);
  const prompt = buildOptimizedPrompt({
    question: cleanMessage,
    history: parsed.data.history,
    ds66Context: contextBlock,
  });

  // 5. Enrutamiento a Groq (llama-3.1-8b-instant) -> Respaldo amable + citas DS 66
  const timeoutMs = readPositiveInt(
    env.CHAT_AI_TIMEOUT_MS,
    CHAT_DEFAULT_TIMEOUT_MS,
  );
  const groqKey = env.GROQ_API_KEY?.trim();
  const groqModel = env.GROQ_MODEL?.trim() || "llama-3.1-8b-instant";
  const fallbackContactUrl =
    env.NEXT_PUBLIC_CHAT_FALLBACK_CONTACT_URL?.trim() || undefined;

  let provider: "groq" | "fallback" = "fallback";
  let modelUsed: string | undefined;
  let reply = "";

  if (groqKey) {
    try {
      const groqRes = await callGroqPrimary({
        prompt,
        apiKey: groqKey,
        model: groqModel,
        timeoutMs,
        fetchImpl,
      });
      provider = "groq";
      modelUsed = groqRes.model;
      reply = groqRes.reply;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[chat-fallback] Groq falló (${msg}); activando respaldo local DS 66.`,
      );
    }
  }

  if (!reply) {
    provider = "fallback";
    reply = buildFallbackReply({
      sources,
      contactUrl: fallbackContactUrl,
      groqConfigured: Boolean(groqKey),
    });
  }

  // 6. Guardar en caché solo respuestas exitosas de IA en preguntas iniciales (TTL 24-72h)
  const rawTtl = readPositiveInt(
    env.CHAT_CACHE_TTL_SECONDS,
    CHAT_DEFAULT_CACHE_TTL_SECONDS,
  );
  const cacheTtlSeconds = Math.min(72 * 3600, Math.max(24 * 3600, rawTtl));

  if (isInitialQuestion && provider === "groq") {
    const valueToCache: CachedChatValue = {
      reply,
      model: modelUsed,
      sources,
    };
    await store.setEx(cacheKey, cacheTtlSeconds, JSON.stringify(valueToCache));
  }

  await store.incr(METRIC_KEYS[provider]);
  const latencyMs = Math.max(1, nowFn() - startMs);

  if (deps.logMetrics !== false) {
    const snap = await getChatMetricsSnapshot(store);
    console.info(
      `[chat-metrics] provider=${provider} cache=${snap.percentages.cache}% groq=${snap.percentages.groq}% backend=${store.backend} latencyMs=${latencyMs}`,
    );
  }

  return {
    status: 200,
    headers: corsHeaders,
    body: {
      reply,
      provider,
      model: modelUsed,
      cached: false,
      latencyMs,
      sources: sources.length > 0 ? sources : undefined,
      rateLimitRemaining,
      fallbackContactUrl:
        provider === "fallback" ? fallbackContactUrl : undefined,
    },
  };
}
