import Link from "next/link";
import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { listTeacherProfiles } from "@/application/academic/offer-service";
import {
  listCoordinatorOptions,
  listTeachers
} from "@/application/teachers/teacher-service";
import { TeachersPanel } from "@/features/teachers/teachers-panel";
import { getCurrentActorScope } from "@/lib/auth/server-scope";

export const dynamic = "force-dynamic";

export default async function TeachersPage() {
  const scope = await getCurrentActorScope();
  if (!scope.ok) {
    if (scope.status === 401 && scope.reason === "missing-session") {
      redirect("/login");
    }
    redirect("/api/auth/clear");
  }

  const [teachersResult, profilesResult, coordinatorsResult] = await Promise.all([
    listTeachers(scope.actor),
    listTeacherProfiles(scope.actor),
    scope.actor.role === "admin"
      ? listCoordinatorOptions(scope.actor)
      : Promise.resolve({ ok: true as const, coordinators: [] })
  ]);

  const initialTeachers = teachersResult.ok ? teachersResult.teachers : [];
  const initialProfiles = profilesResult.ok ? profilesResult.profiles : [];
  const coordinators = coordinatorsResult.ok ? coordinatorsResult.coordinators : [];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-card p-6 shadow-subtle">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 rounded-md border border-line-subtle bg-brandSoft px-2.5 py-0.5 text-xs font-semibold text-brand">
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
            Docentes y carga · T13
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            Docentes, perfiles disponibles y control de carga
          </h1>
        </div>
        <Link
          href="/dashboard"
          className="focus-ring rounded-md border border-line bg-panel px-3 py-2 text-xs font-semibold text-ink hover:bg-brandSoft"
        >
          Volver al panel
        </Link>
      </header>

      <TeachersPanel
        actorRole={scope.actor.role}
        coordinators={coordinators}
        initialProfiles={initialProfiles}
        initialTeachers={initialTeachers}
      />
    </main>
  );
}
