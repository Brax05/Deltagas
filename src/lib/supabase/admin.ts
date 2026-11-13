import { createClient } from "@supabase/supabase-js";

/**
 * Cliente administrativo de Supabase (Service Role).
 * USO EXCLUSIVO EN EL SERVIDOR (Sección 13.3).
 */
export function createSupabaseAdminClient() {
  if (typeof window !== "undefined") {
    throw new Error("El cliente service_role nunca debe importarse en el navegador.");
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el servidor."
    );
  }

  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
