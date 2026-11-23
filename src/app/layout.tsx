import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sistema de Asignación de Clases",
  description: "Planeación académica y asignación de horarios sobre Firebase y Cloud Firestore."
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-background text-foreground antialiased">{children}</body>
    </html>
  );
}
