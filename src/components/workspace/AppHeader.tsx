"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Flame, FileText, UserCheck, ShieldAlert } from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "Proyecto", icon: Flame },
  { href: "/documentos", label: "Documentos", icon: FileText },
  { href: "/cuenta", label: "Cuenta", icon: UserCheck },
];

export function AppHeader() {
  const pathname = usePathname();

  return (
    <header className="no-print sticky top-0 z-30 border-b border-pizarra-border bg-pizarra-surface shadow-sm">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-3 py-2.5 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-pizarra-action"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-pizarra-brand text-pizarra-action-text">
            <Flame className="h-5 w-5 text-pizarra-copper" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold tracking-tight text-pizarra-text sm:text-base">
                DeltaGas
              </span>
              <span className="inline-flex items-center gap-1 rounded border border-pizarra-copper-border bg-pizarra-copper-bg px-1.5 py-0.5 text-[11px] font-semibold text-pizarra-copper">
                Cobre Tipo L · Baja Presión
              </span>
            </div>
            <p className="hidden items-center gap-1 text-[11px] text-pizarra-subtext sm:flex">
              <ShieldAlert className="h-3 w-3 shrink-0 text-pizarra-subtext" />
              Apoyo técnico DS 66 sin sellos ni logos SEC · Debe ser verificado y firmado por un instalador autorizado
            </p>
          </div>
        </Link>

        <nav className="flex max-w-full min-w-0 items-center gap-1 sm:gap-1.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap transition sm:px-3 sm:text-sm ${
                  active
                    ? "bg-pizarra-action text-pizarra-action-text hover:bg-pizarra-action-hover"
                    : "border border-transparent text-pizarra-text-control hover:bg-pizarra-control-hover hover:text-pizarra-text"
                }`}
              >
                <Icon className="h-4 w-4 max-[359px]:hidden" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
