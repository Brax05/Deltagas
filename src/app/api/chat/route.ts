import { NextResponse } from "next/server";
import { CHAT_DEFAULT_CACHE_TTL_SECONDS } from "@/lib/chat/contracts";
import {
  executeChatPipeline,
  getChatMetricsSnapshot,
} from "@/lib/chat/pipeline";
import { getDefaultChatStore } from "@/lib/chat/redis-store";
import { buildCorsHeaders, validateCorsOrigin } from "@/lib/chat/security";

export async function OPTIONS(request: Request) {
  const cors = validateCorsOrigin(request);
  if (!cors.allowed) {
    return NextResponse.json(
      { error: "Origen no autorizado.", code: "CORS_FORBIDDEN" },
      { status: 403 },
    );
  }
  return new NextResponse(null, {
    status: 204,
    headers: buildCorsHeaders(cors.origin),
  });
}

export async function GET(request: Request) {
  const cors = validateCorsOrigin(request);
  if (!cors.allowed) {
    return NextResponse.json(
      { error: "Origen no autorizado.", code: "CORS_FORBIDDEN" },
      { status: 403 },
    );
  }

  const store = getDefaultChatStore();
  const metrics = await getChatMetricsSnapshot(store);

  return NextResponse.json(
    {
      status: "ok",
      storeBackend: store.backend,
      cacheTtlSeconds: CHAT_DEFAULT_CACHE_TTL_SECONDS,
      turnstileRequired:
        process.env.NODE_ENV === "production" ||
        Boolean(process.env.TURNSTILE_SECRET_KEY?.trim()),
      metrics,
    },
    { headers: buildCorsHeaders(cors.origin) },
  );
}

export async function POST(request: Request) {
  const result = await executeChatPipeline(request);
  return NextResponse.json(result.body, {
    status: result.status,
    headers: result.headers,
  });
}
