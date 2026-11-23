"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ManagedUserSummary } from "@/application/users/provisioning";

export function UserManagementPanel({
  initialUsers,
  currentAdminUid
}: Readonly<{
  initialUsers: readonly ManagedUserSummary[];
  currentAdminUid: string;
}>) {
  const router = useRouter();
  const [users, setUsers] = useState<ManagedUserSummary[]>([...initialUsers]);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  async function reloadUsers() {
    const response = await fetch("/api/admin/users", { cache: "no-store" });
    if (response.ok) {
      const data = (await response.json()) as { users: ManagedUserSummary[] };
      setUsers(data.users);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-line bg-card p-6 shadow-subtle">
        <h2 className="text-base font-semibold text-ink">Aprovisionar cuenta nueva</h2>
        <p className="mt-1 text-sm text-muted">
          Solo administración puede crear cuentas y asignar su rol inicial.
        </p>

        <form
          className="mt-4 grid gap-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            const formElement = event.currentTarget;
            const form = new FormData(formElement);
            setFeedback(null);

            startTransition(async () => {
              const response = await fetch("/api/admin/users", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "X-Requested-With": "XMLHttpRequest"
                },
                body: JSON.stringify({
                  email: String(form.get("email") ?? ""),
                  displayName: String(form.get("displayName") ?? ""),
                  password: String(form.get("password") ?? ""),
                  role: String(form.get("role") ?? "coordinator"),
                  active: true
                })
              });

              const payload = (await response.json().catch(() => null)) as {
                error?: string;
              } | null;

              if (!response.ok) {
                setFeedback({
                  kind: "error",
                  text: payload?.error ?? "No se pudo crear la cuenta."
                });
                return;
              }

              formElement.reset();
              await reloadUsers();
              router.refresh();
              setFeedback({ kind: "success", text: "Cuenta creada y habilitada correctamente." });
            });
          }}
        >
          <label className="block text-sm font-semibold text-ink">
            Nombre completo
            <Input className="mt-1" name="displayName" required type="text" />
          </label>
          <label className="block text-sm font-semibold text-ink">
            Correo institucional
            <Input className="mt-1" name="email" required type="email" />
          </label>
          <label className="block text-sm font-semibold text-ink">
            Contraseña temporal
            <Input className="mt-1" minLength={8} name="password" required type="password" />
          </label>
          <label className="block text-sm font-semibold text-ink">
            Rol
            <select
              name="role"
              defaultValue="coordinator"
              className="focus-ring mt-1 flex min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
            >
              <option value="coordinator">Coordinador</option>
              <option value="admin">Administrador</option>
            </select>
          </label>
          <div className="sm:col-span-2">
            <Button disabled={isPending} type="submit">
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              {isPending ? "Guardando cuenta..." : "Crear cuenta"}
            </Button>
          </div>
        </form>

        {feedback ? (
          <div
            role={feedback.kind === "error" ? "alert" : "status"}
            className={
              feedback.kind === "error"
                ? "mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
                : "mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
            }
          >
            {feedback.text}
          </div>
        ) : null}
      </section>

      <section className="rounded-xl border border-line bg-card p-6 shadow-subtle">
        <h2 className="text-base font-semibold text-ink">Cuentas registradas ({users.length})</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase text-muted-foreground">
                <th className="py-2 pr-4">Nombre</th>
                <th className="py-2 pr-4">Correo</th>
                <th className="py-2 pr-4">Rol</th>
                <th className="py-2 pr-4">Estado</th>
                <th className="py-2">Acción</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const isSelf = user.uid === currentAdminUid;
                return (
                  <tr key={user.uid} className="border-b border-line-subtle last:border-b-0">
                    <td className="py-3 pr-4 font-medium text-ink">{user.displayName}</td>
                    <td className="py-3 pr-4 font-mono text-xs text-muted">{user.email}</td>
                    <td className="py-3 pr-4">
                      {user.role === "admin" ? "Administrador" : "Coordinador"}
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className={
                          user.active
                            ? "inline-flex rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                            : "inline-flex rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
                        }
                      >
                        {user.active ? "Activa" : "Inactiva"}
                      </span>
                    </td>
                    <td className="py-3">
                      <Button
                        variant="secondary"
                        disabled={isPending || isSelf}
                        onClick={() => {
                          setFeedback(null);
                          startTransition(async () => {
                            const response = await fetch(`/api/admin/users/${user.uid}`, {
                              method: "PATCH",
                              headers: {
                                "Content-Type": "application/json",
                                "X-Requested-With": "XMLHttpRequest"
                              },
                              body: JSON.stringify({
                                email: user.email,
                                displayName: user.displayName,
                                role: user.role,
                                active: !user.active
                              })
                            });
                            const payload = (await response.json().catch(() => null)) as {
                              error?: string;
                            } | null;
                            if (!response.ok) {
                              setFeedback({
                                kind: "error",
                                text: payload?.error ?? "No se pudo actualizar la cuenta."
                              });
                              return;
                            }
                            await reloadUsers();
                            router.refresh();
                            setFeedback({
                              kind: "success",
                              text: "Estado de cuenta actualizado."
                            });
                          });
                        }}
                      >
                        {isSelf ? "Cuenta actual" : user.active ? "Desactivar" : "Reactivar"}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
