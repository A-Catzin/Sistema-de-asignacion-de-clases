"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Users } from "lucide-react";
import type { CoordinatorOption } from "@/application/teachers/teacher-service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { hundredthsToHours, type TeacherProfile } from "@/domain/academic/academic-offer";
import type { TeacherSummary } from "@/domain/teachers/teacher-catalog";
import type { UserRole } from "@/lib/auth/session-policy";

function TeacherOperationalRow({
  teacher,
  isAdmin,
  profiles,
  coordinators,
  isPending,
  onMutated,
  onError
}: Readonly<{
  teacher: TeacherSummary;
  isAdmin: boolean;
  profiles: readonly TeacherProfile[];
  coordinators: readonly CoordinatorOption[];
  isPending: boolean;
  onMutated: (message: string) => Promise<void>;
  onError: (message: string) => void;
}>) {
  const [maxHoursInput, setMaxHoursInput] = useState<string>(
    String(hundredthsToHours(teacher.maxHoursHundredths))
  );
  const [selectedProfiles, setSelectedProfiles] = useState<string[]>([
    ...teacher.availableProfileCodes
  ]);
  const [responsibleCoordId, setResponsibleCoordId] = useState<string>(
    teacher.responsibleCoordinatorId ?? ""
  );
  const [savingRow, setSavingRow] = useState(false);

  const assignedHours = hundredthsToHours(teacher.assignedHoursHundredths);
  const maxHours = hundredthsToHours(teacher.maxHoursHundredths);
  const availableHours = hundredthsToHours(teacher.availableHoursHundredths);

  async function patchTeacher(payload: Record<string, unknown>, successMessage: string) {
    setSavingRow(true);
    try {
      const res = await fetch(`/api/teachers/${teacher.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest"
        },
        body: JSON.stringify(payload)
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        onError(body?.error ?? "No se pudo actualizar el docente.");
        return;
      }
      await onMutated(successMessage);
    } finally {
      setSavingRow(false);
    }
  }

  return (
    <tr className="border-b border-line-subtle align-top last:border-b-0">
      <td className="py-4 pr-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-ink">{teacher.name}</span>
            <span
              className={
                teacher.active
                  ? "inline-flex rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                  : "inline-flex rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
              }
            >
              {teacher.active ? "Activo" : "Inactivo"}
            </span>
          </div>
          {teacher.email ? (
            <p className="font-mono text-xs text-muted-foreground">{teacher.email}</p>
          ) : null}
          {isAdmin ? (
            <div className="pt-1">
              <Button
                disabled={isPending || savingRow}
                type="button"
                variant="secondary"
                onClick={() =>
                  void patchTeacher(
                    {
                      name: teacher.name,
                      email: teacher.email ?? "",
                      notes: teacher.notes ?? "",
                      maxHours,
                      active: !teacher.active,
                      responsibleCoordinatorId: teacher.responsibleCoordinatorId ?? "",
                      coordinatorIds: teacher.coordinators.map((item) => item.id),
                      availableProfileCodes: [...teacher.availableProfileCodes]
                    },
                    teacher.active ? "Docente desactivado." : "Docente reactivado."
                  )
                }
              >
                {teacher.active ? "Desactivar" : "Reactivar"}
              </Button>
            </div>
          ) : null}
        </div>
      </td>

      <td className="py-4 pr-4">
        <div className="space-y-2">
          {teacher.coordinators.length === 0 ? (
            <span className="text-xs text-muted-foreground">Sin coordinación asignada</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {teacher.coordinators.map((coord) => (
                <span
                  key={coord.id}
                  className="inline-flex items-center gap-1 rounded border border-line bg-panel px-2 py-0.5 text-xs text-ink"
                >
                  {coord.name}
                  {coord.isResponsible ? (
                    <span className="font-semibold text-brand">(Responsable)</span>
                  ) : null}
                </span>
              ))}
            </div>
          )}

          {isAdmin && coordinators.length > 0 ? (
            <div className="flex items-center gap-1.5">
              <select
                aria-label={`Coordinador responsable de ${teacher.name}`}
                value={responsibleCoordId}
                onChange={(event) => setResponsibleCoordId(event.target.value)}
                className="focus-ring rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground"
              >
                <option value="">Sin responsable</option>
                {coordinators.map((coord) => (
                  <option key={coord.id} value={coord.id}>
                    {coord.name}
                  </option>
                ))}
              </select>
              <Button
                disabled={isPending || savingRow}
                type="button"
                variant="secondary"
                onClick={() =>
                  void patchTeacher(
                    {
                      name: teacher.name,
                      email: teacher.email ?? "",
                      notes: teacher.notes ?? "",
                      maxHours,
                      active: teacher.active,
                      responsibleCoordinatorId: responsibleCoordId || null,
                      coordinatorIds: Array.from(
                        new Set([
                          ...teacher.coordinators.map((item) => item.id),
                          ...(responsibleCoordId ? [responsibleCoordId] : [])
                        ])
                      ),
                      availableProfileCodes: [...teacher.availableProfileCodes]
                    },
                    "Coordinador responsable actualizado."
                  )
                }
              >
                Asignar
              </Button>
            </div>
          ) : null}
        </div>
      </td>

      <td className="py-4 pr-4">
        <div className="space-y-1.5">
          <div className="font-mono text-xs font-semibold text-ink">
            {assignedHours} / {maxHours} h{" "}
            <span className="font-normal text-muted-foreground">({availableHours} h disp.)</span>
          </div>

          {teacher.loadBreakdown.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sin asignaciones activas</p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {teacher.loadBreakdown.map((bucket) => (
                <span
                  key={bucket.coordinatorId ?? "__unassigned__"}
                  className={
                    bucket.isOwnScope
                      ? "inline-flex rounded border border-line-subtle bg-brandSoft px-2 py-0.5 text-xs font-semibold text-brand"
                      : "inline-flex rounded border border-line bg-panel px-2 py-0.5 text-xs text-muted"
                  }
                >
                  {bucket.coordinatorName}: {hundredthsToHours(bucket.assignedHoursHundredths)} h
                </span>
              ))}
            </div>
          )}
        </div>
      </td>

      <td className="py-4">
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-ink">
              Tope (h):
              <Input
                className="h-8 w-20 text-xs"
                max={99}
                min={assignedHours}
                step="0.5"
                type="number"
                value={maxHoursInput}
                onChange={(event) => setMaxHoursInput(event.target.value)}
              />
            </label>
            <Button
              disabled={isPending || savingRow}
              type="button"
              onClick={() =>
                void patchTeacher(
                  {
                    maxHours: Number(maxHoursInput),
                    availableProfileCodes: selectedProfiles
                  },
                  "Horas máximas y perfiles disponibles guardados."
                )
              }
            >
              Guardar
            </Button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {profiles.length === 0 ? (
              <span className="text-xs text-muted-foreground">Sin catálogo de perfiles</span>
            ) : (
              profiles.map((profile) => {
                const checked = selectedProfiles.includes(profile.code);
                return (
                  <label
                    key={profile.code}
                    className="inline-flex cursor-pointer items-center gap-1 rounded border border-line bg-panel px-2 py-0.5 text-xs text-ink"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => {
                        setSelectedProfiles((current) =>
                          event.target.checked
                            ? [...current, profile.code]
                            : current.filter((item) => item !== profile.code)
                        );
                      }}
                    />
                    <span className="font-mono">{profile.code}</span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

export function TeachersPanel({
  actorRole,
  initialTeachers,
  initialProfiles,
  coordinators
}: Readonly<{
  actorRole: UserRole;
  initialTeachers: readonly TeacherSummary[];
  initialProfiles: readonly TeacherProfile[];
  coordinators: readonly CoordinatorOption[];
}>) {
  const router = useRouter();
  const [teachers, setTeachers] = useState<TeacherSummary[]>([...initialTeachers]);
  const [searchQuery, setSearchQuery] = useState("");
  const [newProfileCodes, setNewProfileCodes] = useState<string[]>([]);
  const [newCoordinatorIds, setNewCoordinatorIds] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const isAdmin = actorRole === "admin";

  async function refreshTeachers(message?: string) {
    const res = await fetch("/api/teachers", { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as { teachers: TeacherSummary[] };
      setTeachers(data.teachers);
    }
    router.refresh();
    if (message) {
      setFeedback({ kind: "success", text: message });
    }
  }

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const visibleTeachers = normalizedQuery
    ? teachers.filter(
        (teacher) =>
          teacher.name.toLowerCase().includes(normalizedQuery) ||
          teacher.availableProfileCodes.some((code) =>
            code.toLowerCase().includes(normalizedQuery)
          ) ||
          teacher.coordinators.some((coord) => coord.name.toLowerCase().includes(normalizedQuery))
      )
    : teachers;

  return (
    <div className="space-y-6">
      {feedback ? (
        <div
          role={feedback.kind === "error" ? "alert" : "status"}
          className={
            feedback.kind === "error"
              ? "rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
              : "rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
          }
        >
          {feedback.text}
        </div>
      ) : null}

      {isAdmin ? (
        <section className="rounded-xl border border-line bg-card p-6 shadow-subtle">
          <div className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-brand" aria-hidden="true" />
            <h2 className="text-base font-semibold text-ink">Registrar docente</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Define datos generales, horas máximas, coordinador responsable y perfiles disponibles.
          </p>

          <form
            className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
            onSubmit={(event) => {
              event.preventDefault();
              const formElement = event.currentTarget;
              const form = new FormData(formElement);
              setFeedback(null);

              startTransition(async () => {
                const responsibleCoordinatorId =
                  String(form.get("responsibleCoordinatorId") ?? "").trim() || null;
                const res = await fetch("/api/teachers", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "X-Requested-With": "XMLHttpRequest"
                  },
                  body: JSON.stringify({
                    name: String(form.get("name") ?? ""),
                    email: String(form.get("email") ?? ""),
                    maxHours: Number(form.get("maxHours") ?? 20),
                    responsibleCoordinatorId,
                    coordinatorIds: newCoordinatorIds,
                    availableProfileCodes: newProfileCodes,
                    active: true
                  })
                });
                const payload = (await res.json().catch(() => null)) as { error?: string } | null;
                if (!res.ok) {
                  setFeedback({
                    kind: "error",
                    text: payload?.error ?? "No se pudo registrar el docente."
                  });
                  return;
                }
                formElement.reset();
                setNewProfileCodes([]);
                setNewCoordinatorIds([]);
                await refreshTeachers("Docente registrado correctamente.");
              });
            }}
          >
            <label className="block text-sm font-semibold text-ink">
              Nombre completo
              <Input className="mt-1" name="name" placeholder="Dra. Ana Pérez" required type="text" />
            </label>
            <label className="block text-sm font-semibold text-ink">
              Correo (opcional)
              <Input className="mt-1" name="email" placeholder="ana@institucion.edu" type="email" />
            </label>
            <label className="block text-sm font-semibold text-ink">
              Horas máximas
              <Input
                className="mt-1"
                defaultValue={20}
                max={99}
                min={0}
                name="maxHours"
                required
                step="0.5"
                type="number"
              />
            </label>
            <label className="block text-sm font-semibold text-ink">
              Coordinador responsable
              <select
                name="responsibleCoordinatorId"
                defaultValue=""
                className="focus-ring mt-1 flex min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
              >
                <option value="">Sin responsable</option>
                {coordinators.map((coord) => (
                  <option key={coord.id} value={coord.id}>
                    {coord.name}
                  </option>
                ))}
              </select>
            </label>

            {coordinators.length > 0 ? (
              <fieldset className="sm:col-span-2 lg:col-span-4">
                <legend className="text-sm font-semibold text-ink">
                  Coordinaciones vinculadas (pueden compartir docente sin abrir grupos ajenos)
                </legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {coordinators.map((coord) => {
                    const checked = newCoordinatorIds.includes(coord.id);
                    return (
                      <label
                        key={coord.id}
                        className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-line bg-panel px-3 py-1.5 text-xs font-medium text-ink"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            setNewCoordinatorIds((current) =>
                              event.target.checked
                                ? [...current, coord.id]
                                : current.filter((id) => id !== coord.id)
                            );
                          }}
                        />
                        <span>{coord.name}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ) : null}

            <fieldset className="sm:col-span-2 lg:col-span-4">
              <legend className="text-sm font-semibold text-ink">Perfiles disponibles</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {initialProfiles.length === 0 ? (
                  <span className="text-xs text-muted-foreground">
                    Registra perfiles primero en Oferta académica.
                  </span>
                ) : (
                  initialProfiles.map((profile) => {
                    const checked = newProfileCodes.includes(profile.code);
                    return (
                      <label
                        key={profile.code}
                        className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-line bg-panel px-3 py-1.5 text-xs font-medium text-ink"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            setNewProfileCodes((current) =>
                              event.target.checked
                                ? [...current, profile.code]
                                : current.filter((code) => code !== profile.code)
                            );
                          }}
                        />
                        <span className="font-mono">{profile.code}</span>
                        <span className="text-muted-foreground">{profile.name}</span>
                      </label>
                    );
                  })
                )}
              </div>
            </fieldset>

            <div className="sm:col-span-2 lg:col-span-4">
              <Button disabled={isPending} type="submit">
                Guardar docente
              </Button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="rounded-xl border border-line bg-card p-6 shadow-subtle">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-brand" aria-hidden="true" />
            <div>
              <h2 className="text-base font-semibold text-ink">
                Docentes y carga activa ({visibleTeachers.length})
              </h2>
              <p className="text-xs text-muted-foreground">
                {isAdmin
                  ? "Control global de docentes, topes de horas y desglose por coordinación."
                  : "Docentes vinculados a tu coordinación con carga total activa y desglose por coordinador."}
              </p>
            </div>
          </div>

          <Input
            aria-label="Buscar docente, perfil o coordinador"
            className="w-full sm:w-64"
            placeholder="Buscar docente o perfil..."
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </div>

        {visibleTeachers.length === 0 ? (
          <p className="mt-4 rounded-md border border-line-subtle bg-panel px-4 py-3 text-sm text-muted">
            No hay docentes registrados dentro del filtro actual.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-4">Docente</th>
                  <th className="py-2 pr-4">Coordinaciones</th>
                  <th className="py-2 pr-4">Carga activa y desglose</th>
                  <th className="py-2">Tope y perfiles disponibles</th>
                </tr>
              </thead>
              <tbody>
                {visibleTeachers.map((teacher) => (
                  <TeacherOperationalRow
                    key={`${teacher.id}-${teacher.updatedAtIso}`}
                    coordinators={coordinators}
                    isAdmin={isAdmin}
                    isPending={isPending}
                    profiles={initialProfiles}
                    teacher={teacher}
                    onError={(message) => setFeedback({ kind: "error", text: message })}
                    onMutated={(message) => refreshTeachers(message)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
