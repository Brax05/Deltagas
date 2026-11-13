"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  UserCheck,
  Download,
  Trash2,
  Shield,
  LogIn,
  LogOut,
  CheckCircle2,
} from "lucide-react";
import {
  createEmptyInstallerProfile,
  createEmptyProject,
  loadDraftProject,
  loadInstallerProfileDraft,
  saveDraftProject,
  saveInstallerProfileDraft,
} from "@/lib/storage/draft";
import {
  createSupabaseBrowserClient,
  isSupabaseConfigured,
} from "@/lib/supabase/client";
import type { InstallerProfile } from "@/domain/types";

export default function CuentaPage() {
  const supabaseReady = isSupabaseConfigured();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<InstallerProfile>(() =>
    createEmptyInstallerProfile()
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setProfile(loadInstallerProfileDraft());
    if (!supabaseReady) return;

    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUserEmail(data.user.email ?? null);
        setUserId(data.user.id);
      }
    });
  }, [supabaseReady]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);
    setErrorMessage(null);
    saveInstallerProfileDraft(profile);

    if (supabaseReady && userId) {
      try {
        const supabase = createSupabaseBrowserClient();
        const { error } = await supabase.from("installer_profiles").upsert({
          user_id: userId,
          full_name: profile.fullName,
          rut: profile.rut,
          phone: profile.phone,
          email: profile.email,
          installer_class: profile.installerClass,
          sec_registration_number: profile.secRegistrationNumber,
          company_name: profile.companyName ?? null,
          updated_at: new Date().toISOString(),
        });
        if (error) {
          setErrorMessage(
            `Guardado localmente, pero falló la sincronización remota: ${error.message}`
          );
          return;
        }
        setStatusMessage("Perfil guardado en tu cuenta Supabase y en copia local.");
        return;
      } catch {
        setErrorMessage("Guardado localmente; error conectando con Supabase.");
        return;
      }
    }

    setStatusMessage(
      "Perfil guardado localmente en este navegador (sin sincronización remota)."
    );
  };

  const handleExportJson = () => {
    const draft = loadDraftProject();
    const bundle = {
      exportedAt: new Date().toISOString(),
      disclaimer:
        "Respaldo de proyecto DeltaGas (DS 66, sin sellos ni logos SEC). Ley 19.628.",
      installerProfile: profile,
      project: draft,
    };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `respaldo-${draft.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClearLocalData = () => {
    const fresh = createEmptyProject();
    saveDraftProject(fresh);
    const emptyProfile = createEmptyInstallerProfile();
    saveInstallerProfileDraft(emptyProfile);
    setProfile(emptyProfile);
    setStatusMessage("Borrador de proyecto y perfil local eliminados de este dispositivo.");
  };

  const handleSignOut = async () => {
    if (!supabaseReady) return;
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    setUserEmail(null);
    setUserId(null);
    setStatusMessage("Sesión cerrada correctamente.");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-pizarra-border bg-pizarra-surface p-4 shadow-sm">
        <div className="flex items-center gap-2.5">
          <UserCheck className="h-5 w-5 text-pizarra-link" />
          <div>
            <h1 className="text-base font-bold text-pizarra-text">
              Módulo 8 · Cuenta del instalador y privacidad
            </h1>
            <p className="text-xs text-pizarra-subtext">
              {supabaseReady
                ? userEmail
                  ? `Sesión activa: ${userEmail}`
                  : "Supabase configurado · Modo local hasta iniciar sesión"
                : "Modo local activo (sin variables Supabase configuradas)"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {supabaseReady && !userEmail && (
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 rounded-lg bg-pizarra-action px-3 py-1.5 text-xs font-semibold text-pizarra-action-text transition-colors hover:bg-pizarra-action-hover"
            >
              <LogIn className="h-3.5 w-3.5" />
              Iniciar sesión
            </Link>
          )}
          {supabaseReady && userEmail && (
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex items-center gap-1.5 rounded-lg border border-pizarra-border-control bg-pizarra-control px-3 py-1.5 text-xs font-semibold text-pizarra-text-control transition-colors hover:bg-pizarra-control-hover"
            >
              <LogOut className="h-3.5 w-3.5" />
              Cerrar sesión
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <form
          onSubmit={handleSaveProfile}
          className="rounded-xl border border-pizarra-border bg-pizarra-surface p-4 shadow-sm"
        >
          <h2 className="text-sm font-bold text-pizarra-text">
            Datos del instalador autorizado (para membrete propio)
          </h2>
          <p className="mt-0.5 text-xs text-pizarra-subtext">
            Estos datos identifican al profesional responsable en tus memorias e informes sin incluir sellos ni logos de la SEC.
          </p>

          <div className="mt-3 grid grid-cols-1 gap-2.5 text-xs sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="font-medium text-pizarra-subtext">Nombre completo</span>
              <input
                type="text"
                value={profile.fullName}
                onChange={(e) =>
                  setProfile({ ...profile, fullName: e.target.value })
                }
                className="mt-1 w-full rounded-lg border border-pizarra-border-control bg-pizarra-control px-2.5 py-1.5 text-pizarra-text"
              />
            </label>
            <label className="block">
              <span className="font-medium text-pizarra-subtext">RUT</span>
              <input
                type="text"
                placeholder="12.345.678-9"
                value={profile.rut}
                onChange={(e) => setProfile({ ...profile, rut: e.target.value })}
                className="mt-1 w-full rounded-lg border border-pizarra-border-control bg-pizarra-control px-2.5 py-1.5 text-pizarra-text tabular-nums placeholder:text-pizarra-muted"
              />
            </label>
            <label className="block">
              <span className="font-medium text-pizarra-subtext">Teléfono</span>
              <input
                type="text"
                value={profile.phone}
                onChange={(e) =>
                  setProfile({ ...profile, phone: e.target.value })
                }
                className="mt-1 w-full rounded-lg border border-pizarra-border-control bg-pizarra-control px-2.5 py-1.5 text-pizarra-text tabular-nums"
              />
            </label>
            <label className="block">
              <span className="font-medium text-pizarra-subtext">Correo</span>
              <input
                type="email"
                value={profile.email}
                onChange={(e) =>
                  setProfile({ ...profile, email: e.target.value })
                }
                className="mt-1 w-full rounded-lg border border-pizarra-border-control bg-pizarra-control px-2.5 py-1.5 text-pizarra-text"
              />
            </label>
            <label className="block">
              <span className="font-medium text-pizarra-subtext">
                Clase de instalador
              </span>
              <select
                value={profile.installerClass}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    installerClass: e.target
                      .value as InstallerProfile["installerClass"],
                  })
                }
                className="mt-1 w-full rounded-lg border border-pizarra-border-control bg-pizarra-control px-2.5 py-1.5 text-pizarra-text"
              >
                <option value="1">Clase 1</option>
                <option value="2">Clase 2</option>
                <option value="3">Clase 3</option>
                <option value="4">Clase 4</option>
              </select>
            </label>
            <label className="block">
              <span className="font-medium text-pizarra-subtext">
                N° inscripción SEC
              </span>
              <input
                type="text"
                value={profile.secRegistrationNumber}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    secRegistrationNumber: e.target.value,
                  })
                }
                className="mt-1 w-full rounded-lg border border-pizarra-border-control bg-pizarra-control px-2.5 py-1.5 text-pizarra-text tabular-nums"
              />
            </label>
            <label className="block">
              <span className="font-medium text-pizarra-subtext">
                Empresa (opcional)
              </span>
              <input
                type="text"
                value={profile.companyName ?? ""}
                onChange={(e) =>
                  setProfile({ ...profile, companyName: e.target.value })
                }
                className="mt-1 w-full rounded-lg border border-pizarra-border-control bg-pizarra-control px-2.5 py-1.5 text-pizarra-text"
              />
            </label>
          </div>

          <button
            type="submit"
            className="mt-4 rounded-lg bg-pizarra-action px-4 py-2 text-xs font-semibold text-pizarra-action-text transition-colors hover:bg-pizarra-action-hover"
          >
            Guardar perfil
          </button>

          {statusMessage && (
            <p className="mt-3 flex items-center gap-1.5 rounded-lg border border-status-ok-border bg-status-ok-bg p-2.5 text-xs font-medium text-status-ok-text shadow-sm">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-status-ok-text" />
              {statusMessage}
            </p>
          )}
          {errorMessage && (
            <p className="mt-3 rounded-lg border border-status-error-border bg-status-error-bg p-2.5 text-xs font-medium text-status-error-text shadow-sm">
              {errorMessage}
            </p>
          )}
        </form>

        {/* Privacidad, portabilidad y eliminación (Ley 19.628) */}
        <section className="rounded-xl border border-pizarra-border bg-pizarra-surface p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-pizarra-link" />
            <h2 className="text-sm font-bold text-pizarra-text">
              Privacidad, control de datos y portabilidad (Ley 19.628)
            </h2>
          </div>

          <ul className="mt-3 space-y-2 text-xs text-pizarra-subtext">
            <li>
              • Cada proyecto y archivo queda aislado por cuenta autenticada mediante Row Level Security (RLS) en Supabase y bucket privado para placas técnicas.
            </li>
            <li>
              • Las fotografías enviadas a lectura automática requieren confirmación explícita y nunca salen con claves del servidor expuestas al navegador.
            </li>
            <li>
              • Puedes exportar una copia completa en JSON de tu proyecto activo o limpiar el almacenamiento local en cualquier momento.
            </li>
          </ul>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleExportJson}
              className="inline-flex items-center gap-1.5 rounded-lg border border-pizarra-border-control bg-pizarra-control px-3 py-2 text-xs font-semibold text-pizarra-text-control transition-colors hover:bg-pizarra-control-hover"
            >
              <Download className="h-3.5 w-3.5" />
              Exportar respaldo JSON
            </button>
            <button
              type="button"
              onClick={handleClearLocalData}
              className="inline-flex items-center gap-1.5 rounded-lg border border-status-error-border bg-pizarra-control px-3 py-2 text-xs font-semibold text-status-error-text transition-colors hover:bg-status-error-bg"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Limpiar borrador local
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
