"use client";

import React, { useEffect, useRef, useState } from "react";
import Script from "next/script";
import {
  AlertTriangle,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Loader2,
  MessageCircle,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  CHAT_MAX_MESSAGE_LENGTH,
  type ChatProviderKind,
  type ChatResponsePayload,
  type ChatSourceCitation,
  type ChatTurn,
} from "@/lib/chat/contracts";
import { STATIC_FAQ_ITEMS, type StaticFaqItem } from "@/lib/chat/faq-dictionary";

interface ChatBubbleMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  provider?: ChatProviderKind;
  model?: string;
  cached?: boolean;
  latencyMs?: number;
  sources?: ChatSourceCitation[];
  fallbackContactUrl?: string;
  createdAt: string;
}

interface TurnstileApi {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      size?: "invisible" | "compact" | "normal";
      execution?: "render" | "execute";
      callback?: (token: string) => void;
      "error-callback"?: () => void;
      "expired-callback"?: () => void;
    },
  ) => string;
  execute: (widgetId?: string) => void;
  reset: (widgetId?: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SESSION_MESSAGES_KEY = "deltagas-chat-session-v1";
const SESSION_ID_KEY = "deltagas-chat-session-id-v1";
const TURNSTILE_SITE_KEY =
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || "";

function getOrCreateSessionId(): string {
  try {
    const existing = window.sessionStorage.getItem(SESSION_ID_KEY);
    if (existing) return existing;
    const generated = `sess-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    window.sessionStorage.setItem(SESSION_ID_KEY, generated);
    return generated;
  } catch {
    return "sess-local";
  }
}

function getProviderBadgeLabel(msg: ChatBubbleMessage): string {
  switch (msg.provider) {
    case "faq":
      return "FAQ instantánea · $0";
    case "cache":
      return `Caché Redis · $0 (${msg.latencyMs ?? 1} ms)`;
    case "groq":
      return `Groq · ${msg.model ?? "llama-3.1-8b-instant"} (${msg.latencyMs ?? 0} ms)`;
    case "fallback":
      return "Modo respaldo";
    default:
      return "Asistente DS 66";
  }
}

export function FloatingAssistantWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatBubbleMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [expandedSources, setExpandedSources] = useState<Record<string, boolean>>({});
  const [rateRemaining, setRateRemaining] = useState<{
    minute: number;
    day: number;
  } | null>(null);

  // Cloudflare Turnstile state
  const [turnstileReady, setTurnstileReady] = useState(false);
  const turnstileContainerRef = useRef<HTMLDivElement | null>(null);
  const turnstileWidgetIdRef = useRef<string | null>(null);
  const turnstileTokenRef = useRef<string>("");
  const turnstilePendingResolverRef = useRef<((token: string) => void) | null>(
    null,
  );

  const listEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Restaurar historial desde sessionStorage al montar en navegador
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(SESSION_MESSAGES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ChatBubbleMessage[];
        if (Array.isArray(parsed)) {
          setMessages(parsed);
        }
      }
    } catch {
      // Ignorar errores de sessionStorage
    }
  }, []);

  // Persistir historial en sessionStorage ante cada cambio
  useEffect(() => {
    try {
      window.sessionStorage.setItem(
        SESSION_MESSAGES_KEY,
        JSON.stringify(messages),
      );
    } catch {
      // Ignorar cuota de almacenamiento si aplica
    }
  }, [messages]);

  useEffect(() => {
    if (isOpen && messages.length > 0) {
      listEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [isOpen, messages]);

  // Renderizar widget Cloudflare Turnstile invisible cuando exista SITE_KEY
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !isOpen || !turnstileReady) return;
    const api = window.turnstile;
    const container = turnstileContainerRef.current;
    if (!api || !container || turnstileWidgetIdRef.current) return;

    turnstileWidgetIdRef.current = api.render(container, {
      sitekey: TURNSTILE_SITE_KEY,
      size: "invisible",
      execution: "execute",
      callback: (token: string) => {
        turnstileTokenRef.current = token;
        if (turnstilePendingResolverRef.current) {
          turnstilePendingResolverRef.current(token);
          turnstilePendingResolverRef.current = null;
        }
      },
      "error-callback": () => {
        turnstileTokenRef.current = "";
        if (turnstilePendingResolverRef.current) {
          turnstilePendingResolverRef.current("");
          turnstilePendingResolverRef.current = null;
        }
      },
      "expired-callback": () => {
        turnstileTokenRef.current = "";
      },
    });
  }, [isOpen, turnstileReady]);

  async function resolveTurnstileToken(): Promise<string> {
    if (!TURNSTILE_SITE_KEY) return "";
    const api = window.turnstile;
    const widgetId = turnstileWidgetIdRef.current;
    if (!api || !widgetId) return turnstileTokenRef.current;

    if (turnstileTokenRef.current) {
      const token = turnstileTokenRef.current;
      turnstileTokenRef.current = "";
      return token;
    }

    return new Promise<string>((resolve) => {
      const timeout = window.setTimeout(() => {
        turnstilePendingResolverRef.current = null;
        resolve("");
      }, 4000);

      turnstilePendingResolverRef.current = (token: string) => {
        window.clearTimeout(timeout);
        turnstileTokenRef.current = "";
        resolve(token);
      };

      try {
        api.reset(widgetId);
        api.execute(widgetId);
      } catch {
        window.clearTimeout(timeout);
        turnstilePendingResolverRef.current = null;
        resolve("");
      }
    });
  }

  function handleStaticFaqClick(item: StaticFaqItem) {
    if (isSending) return;
    setErrorBanner(null);
    const nowIso = new Date().toISOString();
    const userMsg: ChatBubbleMessage = {
      id: `faq-u-${Date.now()}`,
      role: "user",
      content: item.question,
      createdAt: nowIso,
    };
    const botMsg: ChatBubbleMessage = {
      id: `faq-a-${Date.now() + 1}`,
      role: "assistant",
      content: item.answer,
      provider: "faq",
      cached: true,
      latencyMs: 0,
      sources: item.sources,
      createdAt: nowIso,
    };
    setMessages((prev) => [...prev, userMsg, botMsg]);
  }

  async function handleSendMessage(event: React.FormEvent) {
    event.preventDefault();
    const cleanText = inputValue
      .replace(/[\u0000-\u001F\u007F]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, CHAT_MAX_MESSAGE_LENGTH);

    if (!cleanText || isSending) return;

    setErrorBanner(null);
    setIsSending(true);

    // Solo enviamos últimos turnos previos reales de conversación (excluyendo respuestas FAQ estáticas del último paso si hubiera)
    const historyTurns: ChatTurn[] = messages.slice(-4).map((m) => ({
      role: m.role,
      content: m.content.slice(0, CHAT_MAX_MESSAGE_LENGTH),
    }));

    const userMsg: ChatBubbleMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: cleanText,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue("");

    try {
      const turnstileToken = await resolveTurnstileToken();
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: cleanText,
          history: historyTurns,
          turnstileToken,
          sessionId: getOrCreateSessionId(),
        }),
      });

      const data = (await response.json()) as Partial<ChatResponsePayload> & {
        error?: string;
        code?: string;
      };

      if (!response.ok || !data.reply) {
        setErrorBanner(
          data.error ?? "No se pudo completar la consulta en este momento.",
        );
        return;
      }

      if (data.rateLimitRemaining) {
        setRateRemaining(data.rateLimitRemaining);
      }

      const assistantMsg: ChatBubbleMessage = {
        id: `a-${Date.now()}`,
        role: "assistant",
        content: data.reply,
        provider: data.provider ?? "fallback",
        model: data.model,
        cached: Boolean(data.cached),
        latencyMs: data.latencyMs,
        sources: data.sources,
        fallbackContactUrl: data.fallbackContactUrl,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMsg]);

      if (TURNSTILE_SITE_KEY && window.turnstile && turnstileWidgetIdRef.current) {
        try {
          window.turnstile.reset(turnstileWidgetIdRef.current);
        } catch {
          // Ignorar error de reset
        }
      }
    } catch {
      setErrorBanner(
        "Error de red conectando con el asistente. Usa las preguntas rápidas o reintenta en unos segundos.",
      );
    } finally {
      setIsSending(false);
      window.setTimeout(() => inputRef.current?.focus(), 20);
    }
  }

  function handleClearHistory() {
    setMessages([]);
    setErrorBanner(null);
    setExpandedSources({});
    try {
      window.sessionStorage.removeItem(SESSION_MESSAGES_KEY);
    } catch {
      // Ignorar
    }
  }

  return (
    <>
      {TURNSTILE_SITE_KEY && (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          strategy="lazyOnload"
          onLoad={() => setTurnstileReady(true)}
        />
      )}

      {/* Contenedor invisible para Cloudflare Turnstile cuando aplica */}
      {TURNSTILE_SITE_KEY && (
        <div
          ref={turnstileContainerRef}
          className="pointer-events-none fixed bottom-0 right-0 h-0 w-0 overflow-hidden"
          aria-hidden="true"
        />
      )}

      {/* Ventana desplegable del chat */}
      {isOpen && (
        <section
          aria-label="Asistente IA DS 66"
          className="no-print fixed bottom-[8.25rem] right-3 z-40 flex h-[min(520px,calc(100dvh-10.5rem))] w-[min(390px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-pizarra-border bg-pizarra-surface text-pizarra-text shadow-2xl sm:bottom-36 sm:right-5 [@media(max-height:500px)]:bottom-3 [@media(max-height:500px)]:right-[4.5rem] [@media(max-height:500px)]:h-[calc(100dvh-1.5rem)] [@media(max-height:500px)]:max-h-[calc(100dvh-1.5rem)]"
        >
          {/* Header del chat */}
          <header className="flex items-center justify-between gap-2 border-b border-pizarra-border bg-pizarra-secondary px-3.5 py-2.5">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-pizarra-action text-pizarra-action-text">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-xs font-bold text-pizarra-text sm:text-sm">
                  Asistente DeltaGas · DS 66
                </h2>
                <p className="text-[11px] text-pizarra-subtext">
                  FAQ $0 · Caché · Groq + respaldo DS 66
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearHistory}
                  title="Limpiar historial de esta sesión"
                  aria-label="Limpiar historial de chat"
                  className="rounded-md border border-pizarra-border-control bg-pizarra-control p-1.5 text-pizarra-text-control hover:bg-pizarra-control-hover"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Cerrar asistente de chat"
                className="rounded-md border border-pizarra-border-control bg-pizarra-control p-1.5 text-pizarra-text-control hover:bg-pizarra-control-hover"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </header>

          {/* Barra superior de Preguntas Rápidas costo cero ($0 en navegador) */}
          <div className="border-b border-pizarra-border bg-pizarra-surface px-3 py-2">
            <div className="flex items-center justify-between text-[11px] text-pizarra-subtext">
              <span className="font-semibold text-pizarra-text">
                Preguntas frecuentes (respuesta instantánea $0)
              </span>
              {rateRemaining && (
                <span>
                  Cuota hoy: {rateRemaining.day}/20
                </span>
              )}
            </div>
            <div
              className={`mt-1.5 flex gap-1.5 ${
                messages.length === 0
                  ? "flex-wrap"
                  : "flex-nowrap overflow-x-auto pb-1"
              }`}
            >
              {STATIC_FAQ_ITEMS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  disabled={isSending}
                  onClick={() => handleStaticFaqClick(item)}
                  className="shrink-0 whitespace-nowrap rounded-full border border-pizarra-border-control bg-pizarra-control px-2.5 py-1 text-[11px] font-medium text-pizarra-text-control transition-colors hover:bg-pizarra-control-hover disabled:opacity-50"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Historial de mensajes */}
          <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3 text-xs">
            {messages.length === 0 ? (
              <div className="rounded-xl border border-pizarra-border bg-pizarra-secondary p-3 text-pizarra-subtext">
                <p className="font-semibold text-pizarra-text">
                  ¿En qué te ayudo con el DS 66 o tu trazado?
                </p>
                <p className="mt-1 leading-relaxed">
                  Toca una <strong>pregunta frecuente</strong> arriba para obtener la cita al
                  instante ($0 sin usar red), o escribe tu duda específica (máx.{" "}
                  {CHAT_MAX_MESSAGE_LENGTH} caracteres).
                </p>
              </div>
            ) : (
              messages.map((msg) => {
                const isUser = msg.role === "user";
                const srcOpen = Boolean(expandedSources[msg.id]);

                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${
                      isUser ? "items-end" : "items-start"
                    }`}
                  >
                    <div
                      className={`max-w-[90%] rounded-xl px-3 py-2 leading-relaxed ${
                        isUser
                          ? "bg-pizarra-action text-pizarra-action-text"
                          : "border border-pizarra-border bg-pizarra-secondary text-pizarra-text"
                      }`}
                    >
                      <p className="whitespace-pre-line">{msg.content}</p>

                      {!isUser && msg.fallbackContactUrl && (
                        <a
                          href={msg.fallbackContactUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1.5 inline-block text-[11px] font-semibold text-pizarra-link underline"
                        >
                          Abrir contacto directo
                        </a>
                      )}

                      {!isUser && msg.sources && msg.sources.length > 0 && (
                        <div className="mt-2 border-t border-pizarra-border pt-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedSources((prev) => ({
                                ...prev,
                                [msg.id]: !prev[msg.id],
                              }))
                            }
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-pizarra-link hover:underline"
                          >
                            <BookOpen className="h-3 w-3" />
                            <span>
                              Fuentes DS 66 ({msg.sources.map((s) => s.ref).join(", ")})
                            </span>
                            {srcOpen ? (
                              <ChevronUp className="h-3 w-3" />
                            ) : (
                              <ChevronDown className="h-3 w-3" />
                            )}
                          </button>

                          {srcOpen && (
                            <div className="mt-1.5 space-y-1.5">
                              {msg.sources.map((src) => (
                                <div
                                  key={src.ref}
                                  className="rounded-md border border-pizarra-border bg-pizarra-surface p-2 text-[11px]"
                                >
                                  <p className="font-semibold text-pizarra-text">
                                    {src.ref} · {src.title}
                                  </p>
                                  <p className="mt-0.5 text-pizarra-subtext">
                                    {src.excerpt}
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {!isUser && (
                      <span className="mt-0.5 px-1 text-[10px] text-pizarra-subtext">
                        {getProviderBadgeLabel(msg)}
                      </span>
                    )}
                  </div>
                );
              })
            )}

            {isSending && (
              <div className="flex items-center gap-2 rounded-xl border border-pizarra-border bg-pizarra-secondary px-3 py-2 text-xs text-pizarra-subtext">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Consultando asistente y validando DS 66...</span>
              </div>
            )}

            <div ref={listEndRef} />
          </div>

          {/* Aviso de límite o error controlado */}
          {errorBanner && (
            <div
              role="alert"
              className="mx-3 mb-2 flex items-start gap-2 rounded-lg border border-status-error-border bg-status-error-bg px-2.5 py-2 text-[11px] text-status-error-text"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{errorBanner}</span>
            </div>
          )}

          {/* Formulario de entrada con límite 300 chars */}
          <form
            onSubmit={handleSendMessage}
            className="border-t border-pizarra-border bg-pizarra-secondary p-2.5"
          >
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                maxLength={CHAT_MAX_MESSAGE_LENGTH}
                disabled={isSending}
                onChange={(e) =>
                  setInputValue(e.target.value.slice(0, CHAT_MAX_MESSAGE_LENGTH))
                }
                placeholder="Consulta DS 66 (máx. 300 caracteres)..."
                aria-label="Escribe tu consulta para el asistente IA"
                className="flex-1 rounded-lg border border-pizarra-border-control bg-pizarra-surface px-3 py-1.5 text-xs text-pizarra-text placeholder:text-pizarra-subtext focus:outline-none focus:ring-1 focus:ring-pizarra-action disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={isSending || !inputValue.trim()}
                aria-label="Enviar consulta"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-pizarra-action text-pizarra-action-text hover:bg-pizarra-action-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
            <div className="mt-1 flex items-center justify-between text-[10px] text-pizarra-subtext">
              <span className="inline-flex items-center gap-1">
                <ShieldCheck className="h-3 w-3" />
                {TURNSTILE_SITE_KEY
                  ? "Protegido con Turnstile · Contexto acotado"
                  : "Proxy con caché y límites anti-abuso"}
              </span>
              <span className="tabular-nums">
                {inputValue.length}/{CHAT_MAX_MESSAGE_LENGTH}
              </span>
            </div>
          </form>
        </section>
      )}

      {/* Burbuja flotante en esquina inferior derecha (encima de ThemeToggle) */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-label={isOpen ? "Ocultar chat asistente" : "Abrir asistente IA DS 66"}
        title="Asistente IA DS 66"
        className={`no-print fixed bottom-[4.5rem] right-4 z-40 flex h-12 items-center gap-2 rounded-full border border-pizarra-border-control bg-pizarra-action px-4 text-xs font-semibold text-pizarra-action-text shadow-lg transition hover:bg-pizarra-action-hover sm:bottom-20 sm:right-5 ${
          isOpen ? "[@media(max-height:500px)]:hidden" : ""
        }`}
      >
        <MessageCircle className="h-4 w-4" />
        <span className="hidden sm:inline">Asistente DS 66</span>
      </button>
    </>
  );
}
