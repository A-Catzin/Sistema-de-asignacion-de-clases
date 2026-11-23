import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldAlert, Users } from "lucide-react";
import { listManagedUsers } from "@/application/users/provisioning";
import { canManageUsersAndAdminCatalogs } from "@/domain/auth/authorization-policy";
import { UserManagementPanel } from "@/features/users/user-management-panel";
import { getCurrentActorScope } from "@/lib/auth/server-scope";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const scope = await getCurrentActorScope();
  if (!scope.ok) {
    if (scope.status === 401 && scope.reason === "missing-session") {
      redirect("/login");
    }
    redirect("/api/auth/clear");
  }

  const adminCheck = canManageUsersAndAdminCatalogs(scope.actor);
  if (!adminCheck.ok) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-4 py-10">
        <section className="rounded-xl border border-red-200 bg-card p-6 shadow-subtle dark:border-red-800">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 text-destructive" aria-hidden="true" />
            <div className="space-y-2">
              <h1 className="text-lg font-bold text-ink">Acceso restringido</h1>
              <p className="text-sm text-muted">
                Solo las cuentas activas con rol de administrador pueden aprovisionar usuarios y
                modificar permisos.
              </p>
              <Link
                href="/dashboard"
                className="focus-ring inline-flex rounded-md border border-line bg-panel px-3 py-1.5 text-xs font-semibold text-ink hover:bg-brandSoft"
              >
                Volver al panel principal
              </Link>
            </div>
          </div>
        </section>
      </main>
    );
  }

  const listResult = await listManagedUsers(scope.actor);
  const initialUsers = listResult.ok ? listResult.users : [];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-card p-6 shadow-subtle">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 rounded-md border border-line-subtle bg-brandSoft px-2.5 py-0.5 text-xs font-semibold text-brand">
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
            Administración · T09–T10
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            Aprovisionamiento y control de cuentas
          </h1>
        </div>
        <Link
          href="/dashboard"
          className="focus-ring rounded-md border border-line bg-panel px-3 py-2 text-xs font-semibold text-ink hover:bg-brandSoft"
        >
          Volver al panel
        </Link>
      </header>

      <UserManagementPanel initialUsers={initialUsers} currentAdminUid={scope.actor.uid} />
    </main>
  );
}
