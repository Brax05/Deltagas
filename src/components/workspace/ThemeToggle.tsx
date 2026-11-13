"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const STORAGE_KEY = "deltagas-theme";

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  const handleToggle = () => {
    const nextDark = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", nextDark);
    try {
      localStorage.setItem(STORAGE_KEY, nextDark ? "dark" : "light");
    } catch {
      // Ignorar si el almacenamiento local no está disponible
    }
    setIsDark(nextDark);
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      aria-pressed={isDark}
      aria-label={isDark ? "Cambiar a modo claro" : "Invertir colores a modo oscuro"}
      title={isDark ? "Cambiar a modo claro" : "Invertir a modo oscuro"}
      className="no-print fixed right-4 bottom-4 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-pizarra-border-control bg-pizarra-surface text-pizarra-text shadow-md transition-colors hover:bg-pizarra-control-hover sm:right-5 sm:bottom-5"
    >
      <Moon className="h-5 w-5 dark:hidden" />
      <Sun className="hidden h-5 w-5 text-status-warn-text dark:block" />
    </button>
  );
}
