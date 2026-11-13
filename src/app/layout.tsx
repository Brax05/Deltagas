import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppHeader } from "@/components/workspace/AppHeader";
import { ThemeToggle } from "@/components/workspace/ThemeToggle";

export const metadata: Metadata = {
  title: "DeltaGas — Apoyo al Cálculo de Redes de Gas (DS 66)",
  description:
    "Herramienta de apoyo técnico para memoria de cálculo, diagrama a escala, recintos y prueba de hermeticidad en baja presión según DS 66 (Chile).",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("deltagas-theme")||localStorage.getItem("redgas-theme");if(t==="dark"){document.documentElement.classList.add("dark");}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-pizarra-app text-pizarra-text antialiased transition-colors duration-150">
        <AppHeader />
        <main className="mx-auto w-full max-w-7xl px-3 pt-4 pb-20 sm:px-6">
          {children}
        </main>
        <ThemeToggle />
      </body>
    </html>
  );
}
