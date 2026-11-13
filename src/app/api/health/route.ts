import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "deltagas",
    timestamp: new Date().toISOString(),
    capabilities: {
      supabaseConfigured: Boolean(
        process.env.NEXT_PUBLIC_SUPABASE_URL &&
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      ),
      visionConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
    },
  });
}
