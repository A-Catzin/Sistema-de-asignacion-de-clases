import { AlertCircle, CheckCircle2, Database, KeyRound, Server, ShieldCheck } from "lucide-react";
import {
  getLocalEnvironmentStatus,
  type EmulatorProbeStatus
} from "@/infrastructure/firebase/health";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function statusMeta(status: EmulatorProbeStatus) {
  if (status === "connected") {
    return {
      label: "Conectado",
      badgeClass:
        "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
      Icon: CheckCircle2
    };
  }
  if (status === "unreachable") {
    return {
      label: "No disponible",
      badgeClass:
        "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300",
      Icon: AlertCircle
    };
  }
  return {
    label: "Sin configurar",
    badgeClass:
      "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
    Icon: AlertCircle
  };
}

export default async function HomePage() {
  const envStatus = await getLocalEnvironmentStatus();
  const authBadge = statusMeta(envStatus.emulators.auth.status);
  const firestoreBadge = statusMeta(envStatus.emulators.firestore.status);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="rounded-xl border border-line bg-card p-6 shadow-subtle">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex items-center rounded-md border border-line-subtle bg-brandSoft px-2.5 py-1 text-xs font-semibold text-brand">
            D1 · Base local ejecutable
          </span>
          <span className="font-mono text-xs text-muted-foreground">
            Proyecto: {envStatus.projectId}
          </span>
        </div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-ink">
          Sistema de Asignación de Clases
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-muted">
          Entorno local reproducible sobre Next.js, TypeScript y emuladores de Firebase (Auth y
          Cloud Firestore), sin datos institucionales ni credenciales remotas.
        </p>
      </header>

      <section aria-labelledby="environment-status-heading" className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 id="environment-status-heading" className="text-lg font-semibold text-ink">
            Estado del entorno local
          </h2>
          <a
            href="/api/health"
            className="focus-ring rounded-md border border-line bg-panel px-3 py-1.5 text-xs font-medium text-ink hover:bg-brandSoft"
          >
            Ver JSON de salud
          </a>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <article className="rounded-xl border border-line bg-card p-5 shadow-subtle">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <KeyRound className="h-5 w-5 text-brand" aria-hidden="true" />
                <div>
                  <h3 className="text-sm font-semibold text-ink">Emulador de Firebase Auth</h3>
                  <p className="font-mono text-xs text-muted-foreground">
                    {envStatus.emulators.auth.host ?? "Variable FIREBASE_AUTH_EMULATOR_HOST no definida"}
                  </p>
                </div>
              </div>
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold",
                  authBadge.badgeClass
                )}
              >
                <authBadge.Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {authBadge.label}
              </span>
            </div>
          </article>

          <article className="rounded-xl border border-line bg-card p-5 shadow-subtle">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Database className="h-5 w-5 text-brand" aria-hidden="true" />
                <div>
                  <h3 className="text-sm font-semibold text-ink">Emulador de Cloud Firestore</h3>
                  <p className="font-mono text-xs text-muted-foreground">
                    {envStatus.emulators.firestore.host ?? "Variable FIRESTORE_EMULATOR_HOST no definida"}
                  </p>
                </div>
              </div>
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold",
                  firestoreBadge.badgeClass
                )}
              >
                <firestoreBadge.Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {firestoreBadge.label}
              </span>
            </div>
          </article>

          <article className="rounded-xl border border-line bg-card p-5 shadow-subtle">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="h-5 w-5 text-brand" aria-hidden="true" />
                <div>
                  <h3 className="text-sm font-semibold text-ink">Reglas de acceso directo</h3>
                  <p className="text-xs text-muted-foreground">
                    Política en <span className="font-mono">firestore.rules</span>
                  </p>
                </div>
              </div>
              <span className="inline-flex items-center rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300">
                Denegado por defecto
              </span>
            </div>
          </article>

          <article className="rounded-xl border border-line bg-card p-5 shadow-subtle">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Server className="h-5 w-5 text-brand" aria-hidden="true" />
                <div>
                  <h3 className="text-sm font-semibold text-ink">Separación Cliente / Servidor</h3>
                  <p className="text-xs text-muted-foreground">
                    SDK Admin aislado con <span className="font-mono">server-only</span>
                  </p>
                </div>
              </div>
              <span className="inline-flex items-center rounded-md border border-line-subtle bg-panel px-2 py-0.5 text-xs font-semibold text-ink">
                Activo
              </span>
            </div>
          </article>
        </div>
      </section>

      <section className="rounded-xl border border-line-subtle bg-panel p-5">
        <h2 className="text-sm font-semibold text-ink">Siguiente fase del plan</h2>
        <p className="mt-1 text-sm text-muted">
          Siguiente fase: <strong>T07–T08</strong> (autenticación Firebase y sesión segura de
          servidor). Para operar esta vista con los emuladores activos, ejecuta{" "}
          <code className="rounded bg-card px-1.5 py-0.5 font-mono text-xs text-ink">
            npm run emulators:start
          </code>{" "}
          y{" "}
          <code className="rounded bg-card px-1.5 py-0.5 font-mono text-xs text-ink">
            npm run dev
          </code>
          .
        </p>
      </section>
    </main>
  );
}
