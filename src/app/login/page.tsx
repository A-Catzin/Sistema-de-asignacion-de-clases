import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/features/auth/login-form";
import { getCurrentServerSession } from "@/lib/auth/server-session";
import type { SessionNotice } from "@/lib/auth/session-policy";

export const dynamic = "force-dynamic";

const noticeMessages: Record<SessionNotice, string> = {
  "session-expired": "Tu sesión venció o fue cerrada. Inicia sesión nuevamente para continuar.",
  "privileges-changed":
    "Tus permisos fueron actualizados. Inicia sesión nuevamente para aplicar los cambios.",
  "account-inactive": "Tu cuenta no está activa en este momento. Consulta con administración."
};

function resolveNotice(value: string | string[] | undefined): SessionNotice | null {
  if (typeof value !== "string") return null;
  if (value in noticeMessages) {
    return value as SessionNotice;
  }
  return null;
}

export default async function LoginPage({
  searchParams
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const session = await getCurrentServerSession();
  if (session.ok) {
    redirect("/dashboard");
  }

  const resolvedParams = await searchParams;
  const notice = resolveNotice(resolvedParams.notice);
  if (!notice && session.reason !== "missing-session") {
    redirect("/api/auth/clear");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-10">
      <section className="rounded-xl border border-line bg-card p-6 shadow-panel">
        <div className="mb-5 space-y-2">
          <span className="inline-flex items-center rounded-md border border-line-subtle bg-brandSoft px-2.5 py-1 text-xs font-semibold text-brand">
            Acceso institucional
          </span>
          <h1 className="text-xl font-bold tracking-tight text-ink">
            Sistema de Asignación de Clases
          </h1>
          <p className="text-sm text-muted">
            Inicia sesión con tu cuenta habilitada. Las cuentas nuevas requieren aprovisionamiento
            previo de administración.
          </p>
        </div>

        {notice ? (
          <div
            className="mb-4 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm leading-6 text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200"
            role="status"
          >
            {noticeMessages[notice]}
          </div>
        ) : null}

        <LoginForm />

        <div className="mt-5 border-t border-line-subtle pt-4 text-xs text-muted-foreground">
          <Link href="/" className="focus-ring rounded font-medium text-brand hover:underline">
            Volver al estado del entorno local
          </Link>
        </div>
      </section>
    </main>
  );
}
