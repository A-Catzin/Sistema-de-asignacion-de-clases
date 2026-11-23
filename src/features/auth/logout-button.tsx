"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="secondary"
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              const response = await fetch("/api/auth/session", {
                method: "DELETE",
                headers: {
                  "X-Requested-With": "XMLHttpRequest"
                }
              });

              if (!response.ok) {
                setError("No se pudo cerrar la sesión. Intenta nuevamente.");
                return;
              }

              router.replace("/login");
              router.refresh();
            } catch {
              setError("No se pudo cerrar la sesión. Intenta nuevamente.");
            }
          });
        }}
      >
        <LogOut className="h-4 w-4" aria-hidden="true" />
        {isPending ? "Cerrando sesión..." : "Cerrar sesión"}
      </Button>
      {error ? (
        <p className="text-xs text-red-700 dark:text-red-300" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
