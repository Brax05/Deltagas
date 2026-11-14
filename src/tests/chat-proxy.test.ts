import { describe, expect, it } from "vitest";
import { STATIC_FAQ_ITEMS } from "@/lib/chat/faq-dictionary";
import {
  executeChatPipeline,
  getChatMetricsSnapshot,
} from "@/lib/chat/pipeline";
import { InMemoryChatStore } from "@/lib/chat/redis-store";
import {
  normalizeAndHashQuestion,
  sanitizeChatMessage,
} from "@/lib/chat/security";

function buildChatRequest(params: {
  message: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  origin?: string;
  ip?: string;
  turnstileToken?: string;
  sessionId?: string;
}) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-forwarded-for": params.ip ?? "203.0.113.10",
  };
  if (params.origin) {
    headers.origin = params.origin;
  }

  return new Request("http://localhost:3000/api/chat", {
    method: "POST",
    headers,
    body: JSON.stringify({
      message: params.message,
      history: params.history ?? [],
      turnstileToken: params.turnstileToken ?? "",
      sessionId: params.sessionId ?? "sess-test-1",
    }),
  });
}

describe("Sistema de Chat IA Ultra Bajo Costo y Alta Escalabilidad", () => {
  it("valida CORS, Cloudflare Turnstile en producción y truncado estricto a 300 caracteres", async () => {
    const store = new InMemoryChatStore();

    // 1. CORS no autorizado bloqueado antes de tocar IA
    const corsRes = await executeChatPipeline(
      buildChatRequest({
        message: "hola",
        origin: "https://sitio-externo-no-autorizado.com",
      }),
      {
        store,
        env: { NODE_ENV: "development" } as NodeJS.ProcessEnv,
        logMetrics: false,
      },
    );
    expect(corsRes.status).toBe(403);
    expect("code" in corsRes.body && corsRes.body.code).toBe("CORS_FORBIDDEN");

    // 2. Turnstile falla si en producción Cloudflare responde success=false
    const fakeTurnstileFailFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ success: false }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });

    const botRes = await executeChatPipeline(
      buildChatRequest({
        message: "hola",
        origin: "https://deltagas.cl",
        turnstileToken: "bad-token",
      }),
      {
        store,
        env: {
          NODE_ENV: "production",
          CHAT_ALLOWED_ORIGINS: "https://deltagas.cl",
          TURNSTILE_SECRET_KEY: "secret-key",
        } as unknown as NodeJS.ProcessEnv,
        fetchImpl: fakeTurnstileFailFetch,
        logMetrics: false,
      },
    );
    expect(botRes.status).toBe(403);
    expect("code" in botRes.body && botRes.body.code).toBe("TURNSTILE_FAILED");

    // 3. Sanitización y truncado máximo 300 caracteres
    const longInput = `  ${"A".repeat(380)}\u0007\n `;
    const cleaned = sanitizeChatMessage(longInput);
    expect(cleaned.length).toBe(300);
    expect(cleaned).not.toContain("\u0007");
  });

  it("bloquea abuso con Rate Limiter (máx 5 mensajes/minuto y 20/día) sin invocar APIs de IA", async () => {
    const store = new InMemoryChatStore();
    let aiCalls = 0;

    const mockFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("api.groq.com")) {
        aiCalls++;
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: `Respuesta #${aiCalls}` } }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    const env = {
      NODE_ENV: "development",
      GROQ_API_KEY: "test-groq",
    } as unknown as NodeJS.ProcessEnv;

    let clockMs = 1_700_000_000_000;

    // 5 envíos seguidos dentro del mismo minuto: todos permitidos
    for (let i = 1; i <= 5; i++) {
      const res = await executeChatPipeline(
        buildChatRequest({
          message: `Pregunta única minuto ${i}`,
          ip: "198.51.100.7",
        }),
        {
          store,
          env,
          fetchImpl: mockFetch,
          nowMs: () => clockMs,
          logMetrics: false,
        },
      );
      expect(res.status).toBe(200);
    }

    expect(aiCalls).toBe(5);

    // 6° envío en el mismo minuto -> HTTP 429 sin tocar IA
    const blockedMinute = await executeChatPipeline(
      buildChatRequest({
        message: "Pregunta 6 en el mismo minuto",
        ip: "198.51.100.7",
      }),
      {
        store,
        env,
        fetchImpl: mockFetch,
        nowMs: () => clockMs,
        logMetrics: false,
      },
    );
    expect(blockedMinute.status).toBe(429);
    expect(
      "code" in blockedMinute.body && blockedMinute.body.code,
    ).toBe("RATE_LIMITED");
    expect(aiCalls).toBe(5);

    // Completar hasta 20 en el mismo día saltando de minuto en minuto
    for (let i = 6; i <= 20; i++) {
      clockMs += 90_000;
      const res = await executeChatPipeline(
        buildChatRequest({
          message: `Pregunta única día ${i}`,
          ip: "198.51.100.7",
        }),
        {
          store,
          env,
          fetchImpl: mockFetch,
          nowMs: () => clockMs,
          logMetrics: false,
        },
      );
      expect(res.status).toBe(200);
    }

    // 21° mensaje del mismo día -> bloqueado por tope diario (20/día)
    clockMs += 90_000;
    const blockedDay = await executeChatPipeline(
      buildChatRequest({
        message: "Pregunta 21 del día",
        ip: "198.51.100.7",
      }),
      {
        store,
        env,
        fetchImpl: mockFetch,
        nowMs: () => clockMs,
        logMetrics: false,
      },
    );
    expect(blockedDay.status).toBe(429);
    expect(aiCalls).toBe(20);
  });

  it("sirve preguntas repetidas desde caché SHA-256 en Redis a costo $0 y recorta contexto a últimos 4 turnos", async () => {
    const store = new InMemoryChatStore();
    let groqCalls = 0;
    const capturedPayloads: Array<{
      model: string;
      max_tokens: number;
      temperature: number;
      messages: Array<{ role: string; content: string }>;
    }> = [];

    const mockFetch: typeof fetch = async (input, init) => {
      if (String(input).includes("api.groq.com")) {
        groqCalls++;
        capturedPayloads.push(
          JSON.parse(String(init?.body)) as (typeof capturedPayloads)[number],
        );
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content:
                    "Según el Art. 70 · 70.1.3 del DS 66, no se permite instalar artefactos tipo A o B en baños ni dormitorios.",
                },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      throw new Error(`Unexpected URL: ${String(input)}`);
    };

    const env = {
      NODE_ENV: "development",
      GROQ_API_KEY: "test-groq",
    } as unknown as NodeJS.ProcessEnv;

    // 1a consulta inicial -> llama a Groq y guarda en caché
    const first = await executeChatPipeline(
      buildChatRequest({
        message: "¿Se puede instalar calefont en baño?",
        ip: "192.0.2.1",
      }),
      { store, env, fetchImpl: mockFetch, logMetrics: false },
    );
    expect(first.status).toBe(200);
    if ("provider" in first.body) {
      expect(first.body.provider).toBe("groq");
      expect(first.body.cached).toBe(false);
      expect(first.body.sources?.some((s) => s.ref.includes("70.1.3"))).toBe(
        true,
      );
    }
    expect(groqCalls).toBe(1);
    const firstSent = capturedPayloads[0];
    expect(firstSent?.max_tokens).toBe(250);
    expect(firstSent?.temperature).toBe(0.45);
    expect(firstSent?.model).toBe("llama-3.1-8b-instant");

    // 2a consulta equivalente (otro usuario, mayúsculas/sin signos/tildes) -> CACHÉ ($0)
    expect(normalizeAndHashQuestion("se puede instalar calefont en bano")).toBe(
      normalizeAndHashQuestion("¿Se puede instalar calefont en baño?"),
    );

    const second = await executeChatPipeline(
      buildChatRequest({
        message: "SE PUEDE INSTALAR CALEFONT EN BANO!!",
        ip: "192.0.2.2",
      }),
      { store, env, fetchImpl: mockFetch, logMetrics: false },
    );
    expect(second.status).toBe(200);
    if ("provider" in second.body) {
      expect(second.body.provider).toBe("cache");
      expect(second.body.cached).toBe(true);
    }
    expect(groqCalls).toBe(1);

    // 3a consulta con historial largo (8 mensajes) -> recorta a últimos 4 + system + actual = 6 mensajes
    const longHistory = Array.from({ length: 8 }, (_, idx) => ({
      role: (idx % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: `Mensaje histórico ${idx + 1}`,
    }));
    const followUp = await executeChatPipeline(
      buildChatRequest({
        message: "¿Y qué diámetro corresponde?",
        history: longHistory,
        ip: "192.0.2.3",
      }),
      { store, env, fetchImpl: mockFetch, logMetrics: false },
    );
    expect(followUp.status).toBe(200);
    expect(groqCalls).toBe(2);
    const followUpSent = capturedPayloads[1];
    expect(followUpSent?.messages.length).toBe(6);
    expect(followUpSent?.messages[1]?.content).toBe("Mensaje histórico 5");
    expect(followUpSent?.messages[4]?.content).toBe("Mensaje histórico 8");
  });

  it("activa respaldo amable y referencias DS 66 si Groq cae (429/503/timeout) sin envenenar caché", async () => {
    const store = new InMemoryChatStore();
    let groqAttempts = 0;

    // Paso A: Groq devuelve 429 -> devuelve mensaje "estamos trabajando para solucionarlo" + fuentes DS 66
    const rateLimitedFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("api.groq.com")) {
        groqAttempts++;
        return new Response("rate limited", { status: 429 });
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    const env = {
      NODE_ENV: "development",
      GROQ_API_KEY: "bad-or-exhausted-groq",
      NEXT_PUBLIC_CHAT_FALLBACK_CONTACT_URL: "https://wa.me/56900000000",
    } as unknown as NodeJS.ProcessEnv;

    const firstOutageRes = await executeChatPipeline(
      buildChatRequest({
        message: "¿Cómo funciona la prueba de hermeticidad?",
        ip: "198.51.100.55",
      }),
      { store, env, fetchImpl: rateLimitedFetch, logMetrics: false },
    );

    expect(firstOutageRes.status).toBe(200);
    expect(groqAttempts).toBe(1);
    if ("provider" in firstOutageRes.body) {
      expect(firstOutageRes.body.provider).toBe("fallback");
      expect(firstOutageRes.body.cached).toBe(false);
      expect(firstOutageRes.body.reply).toContain(
        "estamos trabajando para solucionarlo",
      );
      expect(firstOutageRes.body.sources?.length ?? 0).toBeGreaterThan(0);
      expect(firstOutageRes.body.reply).toContain("wa.me/56900000000");
    }

    // Paso B: Groq excede timeout -> misma pregunta NO quedó en caché tras fallo, vuelve a intentar Groq y entrega respaldo
    const timeoutFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("api.groq.com")) {
        groqAttempts++;
        throw new DOMException(
          "The operation was aborted due to timeout",
          "TimeoutError",
        );
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    const timeoutRes = await executeChatPipeline(
      buildChatRequest({
        message: "¿Cómo funciona la prueba de hermeticidad?",
        ip: "198.51.100.57",
      }),
      { store, env, fetchImpl: timeoutFetch, logMetrics: false },
    );
    expect(timeoutRes.status).toBe(200);
    expect(groqAttempts).toBe(2);
    if ("provider" in timeoutRes.body) {
      expect(timeoutRes.body.provider).toBe("fallback");
      expect(timeoutRes.body.cached).toBe(false);
    }

    // Paso C: Groq devuelve 503 -> mensaje amable con contacto
    const unavailableFetch: typeof fetch = async () =>
      new Response("upstream unavailable", { status: 503 });

    const fallbackRes = await executeChatPipeline(
      buildChatRequest({
        message: "¿Qué altura tiene la abertura inferior?",
        ip: "198.51.100.56",
      }),
      { store, env, fetchImpl: unavailableFetch, logMetrics: false },
    );

    expect(fallbackRes.status).toBe(200);
    if ("provider" in fallbackRes.body) {
      expect(fallbackRes.body.provider).toBe("fallback");
      expect(fallbackRes.body.fallbackContactUrl).toBe(
        "https://wa.me/56900000000",
      );
      expect(fallbackRes.body.reply).toContain("wa.me/56900000000");
    }

    const metrics = await getChatMetricsSnapshot(store);
    expect(metrics.counts.fallback).toBe(3);
    expect(metrics.counts.cache).toBe(0);
    expect(metrics.counts.groq).toBe(0);
    expect(metrics.percentages.fallback).toBe(100);
  });

  it("distingue entre llave GROQ_API_KEY no configurada y caída del servicio", async () => {
    const store = new InMemoryChatStore();
    const unconfiguredRes = await executeChatPipeline(
      buildChatRequest({
        message: "¿Qué ventilación requiere un artefacto tipo B?",
        ip: "198.51.100.77",
      }),
      {
        store,
        env: {
          NODE_ENV: "test",
          NEXT_PUBLIC_CHAT_FALLBACK_CONTACT_URL: "https://wa.me/56900000000",
        },
        logMetrics: false,
      },
    );

    expect(unconfiguredRes.status).toBe(200);
    if ("provider" in unconfiguredRes.body) {
      expect(unconfiguredRes.body.provider).toBe("fallback");
      expect(unconfiguredRes.body.reply).toContain("GROQ_API_KEY");
      expect(unconfiguredRes.body.reply).not.toContain(
        "estamos trabajando para solucionarlo",
      );
      expect(unconfiguredRes.body.reply).toContain("wa.me/56900000000");
    }
  });

  it("dispone de 4 preguntas rápidas estáticas costo cero ($0) en frontend con fuentes DS 66", () => {
    expect(STATIC_FAQ_ITEMS.length).toBe(4);
    for (const item of STATIC_FAQ_ITEMS) {
      expect(item.question.length).toBeGreaterThan(5);
      expect(item.answer.length).toBeGreaterThan(20);
      expect(item.sources.length).toBeGreaterThan(0);
    }
  });
});
