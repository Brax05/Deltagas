import crypto from "node:crypto";
import { CHAT_MAX_MESSAGE_LENGTH } from "@/lib/chat/contracts";

/** Construye la lista blanca de orígenes permitidos desde variables de entorno y host actual. */
export function resolveAllowedOrigins(
  requestUrl: string,
  env: NodeJS.ProcessEnv = process.env,
): Set<string> {
  const allowed = new Set<string>();

  try {
    allowed.add(new URL(requestUrl).origin);
  } catch {
    // Ignorar URL malformada
  }

  const appUrl = env.NEXT_PUBLIC_APP_URL?.trim();
  if (appUrl) {
    try {
      allowed.add(new URL(appUrl).origin);
    } catch {
      // Ignorar URL inválida
    }
  }

  const csv = env.CHAT_ALLOWED_ORIGINS?.trim();
  if (csv) {
    for (const part of csv.split(",")) {
      const clean = part.trim();
      if (!clean) continue;
      try {
        allowed.add(new URL(clean).origin);
      } catch {
        // Ignorar entrada inválida
      }
    }
  }

  if (env.NODE_ENV !== "production") {
    allowed.add("http://localhost:3000");
    allowed.add("http://127.0.0.1:3000");
  }

  return allowed;
}

export function validateCorsOrigin(
  request: Request,
  env: NodeJS.ProcessEnv = process.env,
): { allowed: boolean; origin: string | null } {
  const originHeader = request.headers.get("origin")?.trim() || null;
  if (!originHeader) {
    // En peticiones same-origin o sin cabecera Origin explícita, verificar Referer si existe.
    const referer = request.headers.get("referer")?.trim();
    if (!referer) return { allowed: true, origin: null };
    try {
      const refOrigin = new URL(referer).origin;
      const allowedOrigins = resolveAllowedOrigins(request.url, env);
      return {
        allowed: allowedOrigins.has(refOrigin),
        origin: refOrigin,
      };
    } catch {
      return { allowed: false, origin: null };
    }
  }

  const allowedOrigins = resolveAllowedOrigins(request.url, env);
  return {
    allowed: allowedOrigins.has(originHeader),
    origin: originHeader,
  };
}

export function buildCorsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    Vary: "Origin",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

/** Sanitiza caracteres de control, normaliza espacios y trunca a 300 caracteres. */
export function sanitizeChatMessage(raw: string): string {
  return raw
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, CHAT_MAX_MESSAGE_LENGTH)
    .trim();
}

/** Normaliza pregunta inicial y genera SHA-256 determinístico para la caché Redis. */
export function normalizeAndHashQuestion(cleanMessage: string): string {
  const normalized = cleanMessage
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[¿?¡!.,;:()[\]{}"'`´°ºª\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return crypto.createHash("sha256").update(normalized, "utf8").digest("hex");
}

/** Extrae IP / identificador de sesión y devuelve un hash corto (privacidad Ley 19.628). */
export function extractVisitorKey(
  request: Request,
  sessionId?: string,
): { rawIp: string; hashedVisitorKey: string } {
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const rawIp =
    forwarded?.split(",")[0]?.trim() || realIp?.trim() || "127.0.0.1";
  const composite = `${rawIp}:${sessionId?.trim() || "anon"}`;
  const hashedVisitorKey = crypto
    .createHash("sha256")
    .update(composite, "utf8")
    .digest("hex")
    .slice(0, 24);
  return { rawIp, hashedVisitorKey };
}

export interface TurnstileVerificationResult {
  ok: boolean;
  statusCode?: 403 | 503;
  code?: "TURNSTILE_FAILED" | "TURNSTILE_NOT_CONFIGURED";
  reason?: string;
}

export async function verifyTurnstileToken(params: {
  token: string;
  remoteIp: string;
  secretKey?: string;
  isProduction?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<TurnstileVerificationResult> {
  const secret = params.secretKey?.trim();
  const isProd = params.isProduction ?? process.env.NODE_ENV === "production";

  if (!secret) {
    if (isProd) {
      return {
        ok: false,
        statusCode: 503,
        code: "TURNSTILE_NOT_CONFIGURED",
        reason: "Verificación anti-bot no configurada en servidor.",
      };
    }
    return { ok: true, reason: "dev-unconfigured" };
  }

  if (!params.token.trim()) {
    return {
      ok: false,
      statusCode: 403,
      code: "TURNSTILE_FAILED",
      reason: "Falta validación anti-bot de Cloudflare Turnstile.",
    };
  }

  try {
    const fetchFn = params.fetchImpl ?? fetch;
    const form = new URLSearchParams({
      secret,
      response: params.token.trim(),
      remoteip: params.remoteIp,
    });

    const response = await fetchFn(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
        signal: AbortSignal.timeout(4000),
      },
    );

    if (!response.ok) {
      return {
        ok: false,
        statusCode: 403,
        code: "TURNSTILE_FAILED",
        reason: "No se pudo verificar el token anti-bot.",
      };
    }

    const payload = (await response.json()) as { success?: boolean };
    if (payload.success !== true) {
      return {
        ok: false,
        statusCode: 403,
        code: "TURNSTILE_FAILED",
        reason: "Token Cloudflare Turnstile inválido o expirado.",
      };
    }

    return { ok: true };
  } catch {
    return {
      ok: false,
      statusCode: 403,
      code: "TURNSTILE_FAILED",
      reason: "Error conectando con validación Cloudflare Turnstile.",
    };
  }
}
