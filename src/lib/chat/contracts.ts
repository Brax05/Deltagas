import { z } from "zod";

export const CHAT_MAX_MESSAGE_LENGTH = 300;
export const CHAT_MAX_CONTEXT_TURNS = 4;
export const CHAT_MAX_OUTPUT_TOKENS = 250;
export const CHAT_DEFAULT_TEMPERATURE = 0.45;
export const CHAT_DEFAULT_TIMEOUT_MS = 5000;
export const CHAT_RATE_LIMIT_MINUTE_MAX = 5;
export const CHAT_RATE_LIMIT_DAY_MAX = 20;
export const CHAT_DEFAULT_CACHE_TTL_SECONDS = 48 * 60 * 60; // 48 horas (rango 24-72h)

export type ChatRole = "user" | "assistant";

export interface ChatTurn {
  role: ChatRole;
  content: string;
}

export interface ChatSourceCitation {
  ref: string;
  title: string;
  chapter: string;
  excerpt: string;
}

export type ChatProviderKind = "faq" | "cache" | "groq" | "fallback";

export interface ChatResponsePayload {
  reply: string;
  provider: ChatProviderKind;
  model?: string;
  cached: boolean;
  latencyMs: number;
  sources?: ChatSourceCitation[];
  rateLimitRemaining?: {
    minute: number;
    day: number;
  };
  fallbackContactUrl?: string;
}

export interface ChatErrorPayload {
  error: string;
  code:
    | "INVALID_REQUEST"
    | "CORS_FORBIDDEN"
    | "TURNSTILE_FAILED"
    | "TURNSTILE_NOT_CONFIGURED"
    | "RATE_LIMITED";
  retryAfterSeconds?: number;
}

export interface ChatMetricsSnapshot {
  total: number;
  counts: {
    cache: number;
    groq: number;
    fallback: number;
    rateLimited: number;
  };
  percentages: {
    cache: number;
    groq: number;
    fallback: number;
  };
}

export const chatTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(1200),
});

export const chatRequestSchema = z.object({
  message: z.string().trim().min(1, "Escribe una consulta antes de enviar."),
  history: z.array(chatTurnSchema).max(20).optional().default([]),
  turnstileToken: z.string().trim().max(2048).optional().default(""),
  sessionId: z.string().trim().max(128).optional(),
});

export type ChatRequestInput = z.infer<typeof chatRequestSchema>;
