import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarClock } from "lucide-react";
import {
  listClassrooms,
  listScheduleBlocks,
  listScheduleTemplates
} from "@/application/schedules/schedule-service";
import { ScheduleResourcesPanel } from "@/features/schedules/schedule-resources-panel";
import { getCurrentActorScope } from "@/lib/auth/server-scope";

export const dynamic = "force-dynamic";

export default async function ScheduleResourcesPage() {
  const scope = await getCurrentActorScope();
  if (!scope.ok) {
    if (scope.status === 401 && scope.reason === "missing-session") {
      redirect("/login");
    }
    redirect("/api/auth/clear");
  }

  const [classroomsResult, templatesResult, blocksResult] = await Promise.all([
    listClassrooms(scope.actor),
    listScheduleTemplates(scope.actor),
    listScheduleBlocks(scope.actor)
  ]);

  const initialClassrooms = classroomsResult.ok ? classroomsResult.classrooms : [];
  const initialTemplates = templatesResult.ok ? templatesResult.templates : [];
  const initialBlocks = blocksResult.ok ? blocksResult.blocks : [];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-card p-6 shadow-subtle">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 rounded-md border border-line-subtle bg-brandSoft px-2.5 py-0.5 text-xs font-semibold text-brand">
            <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
            Recursos horarios · T14
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            Aulas, plantillas y bloques horarios
          </h1>
        </div>
        <Link
          href="/dashboard"
          className="focus-ring rounded-md border border-line bg-panel px-3 py-2 text-xs font-semibold text-ink hover:bg-brandSoft"
        >
          Volver al panel
        </Link>
      </header>

      <ScheduleResourcesPanel
        actorRole={scope.actor.role}
        actorUid={scope.actor.uid}
        initialBlocks={initialBlocks}
        initialClassrooms={initialClassrooms}
        initialTemplates={initialTemplates}
      />
    </main>
  );
}
