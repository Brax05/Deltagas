"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock, AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  createSupabaseBrowserClient,
  isSupabaseConfigured,
} from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabaseReady = isSupabaseConfigured();

  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (!supabaseReady) {
      setError(
        "Supabase aún no está configurado en el servidor. Puedes usar toda la calculadora en modo local sin iniciar sesión."
      );
      return;
    }

    if (mode === "register" && password.length < 12) {
      setError(
        "La contraseña debe tener al menos 12 caracteres por seguridad."
      );
      return;
    }

    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      if (mode === "login") {
        const { error: signErr } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signErr) {
          setError(signErr.message);
          return;
        }
        router.push("/");
        router.refresh();
      } else {
        const { error: upErr } = await supabase.auth.signUp({
          email,
          password,
        });
        if (upErr) {
          setError(upErr.message);
          return;
        }
        setInfo(
          "Cuenta creada. Si la verificación por correo está activa en Supabase, revisa tu bandeja antes de iniciar sesión."
        );
      }
    } catch {
      setError("Error de conexión al autenticar.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md py-6">
      <div className="rounded-2xl border border-pizarra-border bg-pizarra-surface p-6 shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-pizarra-brand text-pizarra-action-text">
            <Lock className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-base font-bold text-pizarra-text">
              {mode === "login"
                ? "Iniciar sesión en DeltaGas"
                : "Crear cuenta de instalador"}
            </h1>
            <p className="text-xs text-pizarra-subtext">
              Respaldo privado por cuenta en Supabase
            </p>
          </div>
        </div>

        {!supabaseReady && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-status-warn-border bg-status-warn-bg p-3 text-xs text-status-warn-text shadow-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-status-warn-text" />
            <div>
              <p className="font-semibold text-status-warn-text">Variables de Supabase no detectadas</p>
              <p className="mt-0.5 text-status-warn-text">
                Mientras configuras <code>.env.local</code>, puedes trabajar en modo local directamente en{" "}
                <Link href="/" className="font-semibold text-pizarra-link underline hover:opacity-80">
                  Red y Cálculo
                </Link>
                .
              </p>
            </div>
          </div>
        )}

        <div className="mt-4 flex rounded-lg border border-pizarra-border bg-pizarra-secondary p-1 text-xs font-semibold">
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setError(null);
            }}
            className={`flex-1 rounded-md py-1.5 transition-colors ${
              mode === "login"
                ? "bg-pizarra-action text-pizarra-action-text shadow-sm"
                : "text-pizarra-subtext hover:text-pizarra-text"
            }`}
          >
            Ingresar
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("register");
              setError(null);
            }}
            className={`flex-1 rounded-md py-1.5 transition-colors ${
              mode === "register"
                ? "bg-pizarra-action text-pizarra-action-text shadow-sm"
                : "text-pizarra-subtext hover:text-pizarra-text"
            }`}
          >
            Registrarse
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3 text-xs">
          <label className="block">
            <span className="font-medium text-pizarra-subtext">Correo electrónico</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-pizarra-border-control bg-pizarra-control px-3 py-2 text-sm text-pizarra-text"
            />
          </label>

          <label className="block">
            <span className="font-medium text-pizarra-subtext">
              Contraseña {mode === "register" && "(mínimo 12 caracteres)"}
            </span>
            <input
              type="password"
              required
              minLength={mode === "register" ? 12 : 6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-pizarra-border-control bg-pizarra-control px-3 py-2 text-sm text-pizarra-text"
            />
          </label>

          {error && (
            <p className="rounded-lg border border-status-error-border bg-status-error-bg p-2.5 font-medium text-status-error-text shadow-sm">
              {error}
            </p>
          )}
          {info && (
            <p className="flex items-start gap-1.5 rounded-lg border border-status-ok-border bg-status-ok-bg p-2.5 font-medium text-status-ok-text shadow-sm">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-status-ok-text" />
              <span>{info}</span>
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-pizarra-action py-2.5 text-sm font-semibold text-pizarra-action-text transition-colors hover:bg-pizarra-action-hover disabled:opacity-50"
          >
            {loading
              ? "Procesando..."
              : mode === "login"
                ? "Entrar"
                : "Crear cuenta"}
          </button>
        </form>
      </div>
    </div>
  );
}
