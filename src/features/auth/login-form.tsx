"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getFirebaseClientAuth } from "@/infrastructure/firebase/client";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const email = String(form.get("email") ?? "").trim();
        const password = String(form.get("password") ?? "");
        setError(null);

        startTransition(async () => {
          try {
            const auth = await getFirebaseClientAuth();
            const credential = await signInWithEmailAndPassword(auth, email, password);
            const idToken = await credential.user.getIdToken(true);

            const response = await fetch("/api/auth/session", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Requested-With": "XMLHttpRequest"
              },
              body: JSON.stringify({ idToken })
            });

            await signOut(auth).catch(() => undefined);

            if (!response.ok) {
              const payload = (await response.json().catch(() => null)) as { error?: string } | null;
              setError(
                payload?.error ??
                  "No fue posible iniciar sesión. Verifica tu correo, contraseña o estado de cuenta."
              );
              return;
            }

            router.replace("/dashboard");
            router.refresh();
          } catch {
            setError(
              "No fue posible iniciar sesión. Verifica tu correo, contraseña o estado de cuenta."
            );
          }
        });
      }}
    >
      <label className="block text-sm font-semibold text-ink">
        Correo institucional
        <Input
          autoComplete="email"
          className="mt-1"
          name="email"
          placeholder="correo@institucion.edu.mx"
          required
          type="email"
        />
      </label>
      <label className="block text-sm font-semibold text-ink">
        Contraseña
        <Input
          autoComplete="current-password"
          className="mt-1"
          name="password"
          placeholder="Escribe tu contraseña"
          required
          type="password"
        />
      </label>
      {error ? (
        <div
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm leading-6 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
          role="alert"
        >
          {error}
        </div>
      ) : null}
      <Button className="w-full" disabled={isPending} type="submit">
        <LogIn className="h-4 w-4" aria-hidden="true" />
        {isPending ? "Validando acceso..." : "Entrar al sistema"}
      </Button>
    </form>
  );
}
