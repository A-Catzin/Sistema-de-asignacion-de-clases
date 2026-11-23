import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck, UserCheck } from "lucide-react";
import { LogoutButton } from "@/features/auth/logout-button";
import { getCurrentServerSession } from "@/lib/auth/server-session";

export const dynamic = "force-dynamic";

const roleLabels = {
  admin: "Administrador",
  coordinator: "Coordinador"
} as const;

export default async function DashboardPage() {
  const session = await getCurrentServerSession();
  if (!session.ok) {
    if (session.reason === "missing-session") {
      redirect("/login");
    }
    redirect("/api/auth/clear");
  }

  const { user } = session;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-card p-6 shadow-subtle">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Sesión verificada
            </span>
            <span className="inline-flex items-center rounded-md border border-line-subtle bg-brandSoft px-2.5 py-0.5 text-xs font-semibold text-brand">
              {roleLabels[user.role]}
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Panel principal</h1>
          <p className="text-sm text-muted">
            {user.displayName} · <span className="font-mono text-xs">{user.email}</span>
          </p>
        </div>

        <LogoutButton />
      </header>

      <section className="rounded-xl border border-line bg-card p-6 shadow-subtle">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 text-brand" aria-hidden="true" />
          <div className="space-y-2">
            <h2 className="text-base font-semibold text-ink">
              Autenticación Firebase y sesión segura activas (T07–T08)
            </h2>
            <p className="text-sm text-muted">
              Tu identidad fue verificada en el servidor mediante cookie{" "}
              <code className="rounded bg-panel px-1.5 py-0.5 font-mono text-xs text-ink">
                HttpOnly
              </code>
              , protección CSRF y comprobación de cuenta activa en{" "}
              <code className="rounded bg-panel px-1.5 py-0.5 font-mono text-xs text-ink">
                userProfiles
              </code>
              .
            </p>
            <p className="text-sm text-muted">
              Siguiente etapa: <strong>T11</strong> (auditoría duradera) y luego catálogos base
              (<strong>T12–T15</strong>).
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              {user.role === "admin" ? (
                <Link
                  href="/admin"
                  className="focus-ring rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-brandDeep"
                >
                  Gestión de usuarios
                </Link>
              ) : null}
              <Link href="/" className="focus-ring rounded text-xs font-medium text-brand hover:underline">
                Ver estado del entorno local
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
