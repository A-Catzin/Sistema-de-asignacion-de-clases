"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, GraduationCap, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  hundredthsToHours,
  type Career,
  type SubjectWithRequirements,
  type TeacherProfile
} from "@/domain/academic/academic-offer";
import type { UserRole } from "@/lib/auth/session-policy";

export function AcademicOfferPanel({
  actorRole,
  initialProfiles,
  initialCareers,
  initialSubjects
}: Readonly<{
  actorRole: UserRole;
  initialProfiles: readonly TeacherProfile[];
  initialCareers: readonly Career[];
  initialSubjects: readonly SubjectWithRequirements[];
}>) {
  const router = useRouter();
  const [profiles, setProfiles] = useState<TeacherProfile[]>([...initialProfiles]);
  const [careers, setCareers] = useState<Career[]>([...initialCareers]);
  const [subjects, setSubjects] = useState<SubjectWithRequirements[]>([...initialSubjects]);
  const [selectedCareerId, setSelectedCareerId] = useState<string>("all");
  const [selectedProfileCodes, setSelectedProfileCodes] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const isAdmin = actorRole === "admin";
  const careerNameMap = new Map(careers.map((career) => [career.id, career.name]));

  const visibleSubjects =
    selectedCareerId === "all"
      ? subjects
      : subjects.filter((subject) => subject.careerId === selectedCareerId);

  async function refreshAll() {
    const [profilesRes, careersRes, subjectsRes] = await Promise.all([
      fetch("/api/academic/profiles", { cache: "no-store" }),
      fetch("/api/academic/careers", { cache: "no-store" }),
      fetch("/api/academic/subjects", { cache: "no-store" })
    ]);
    if (profilesRes.ok) {
      const data = (await profilesRes.json()) as { profiles: TeacherProfile[] };
      setProfiles(data.profiles);
    }
    if (careersRes.ok) {
      const data = (await careersRes.json()) as { careers: Career[] };
      setCareers(data.careers);
    }
    if (subjectsRes.ok) {
      const data = (await subjectsRes.json()) as { subjects: SubjectWithRequirements[] };
      setSubjects(data.subjects);
    }
  }

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
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-xl border border-line bg-card p-6 shadow-subtle">
            <div className="flex items-center gap-2">
              <Tag className="h-4 w-4 text-brand" aria-hidden="true" />
              <h2 className="text-base font-semibold text-ink">Nuevo perfil docente</h2>
            </div>
            <form
              className="mt-4 space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                const formElement = event.currentTarget;
                const form = new FormData(formElement);
                setFeedback(null);

                startTransition(async () => {
                  const res = await fetch("/api/academic/profiles", {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      "X-Requested-With": "XMLHttpRequest"
                    },
                    body: JSON.stringify({
                      code: String(form.get("code") ?? ""),
                      name: String(form.get("name") ?? ""),
                      active: true
                    })
                  });
                  const payload = (await res.json().catch(() => null)) as { error?: string } | null;
                  if (!res.ok) {
                    setFeedback({
                      kind: "error",
                      text: payload?.error ?? "No se pudo guardar el perfil."
                    });
                    return;
                  }
                  formElement.reset();
                  await refreshAll();
                  router.refresh();
                  setFeedback({ kind: "success", text: "Perfil docente guardado correctamente." });
                });
              }}
            >
              <label className="block text-sm font-semibold text-ink">
                Código del perfil
                <Input className="mt-1" name="code" placeholder="ING_SIS" required type="text" />
              </label>
              <label className="block text-sm font-semibold text-ink">
                Descripción
                <Input
                  className="mt-1"
                  name="name"
                  placeholder="Ingeniería en Sistemas"
                  required
                  type="text"
                />
              </label>
              <Button disabled={isPending} type="submit">
                Guardar perfil
              </Button>
            </form>
          </section>

          <section className="rounded-xl border border-line bg-card p-6 shadow-subtle">
            <div className="flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-brand" aria-hidden="true" />
              <h2 className="text-base font-semibold text-ink">Nueva carrera</h2>
            </div>
            <form
              className="mt-4 space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                const formElement = event.currentTarget;
                const form = new FormData(formElement);
                setFeedback(null);

                startTransition(async () => {
                  const res = await fetch("/api/academic/careers", {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      "X-Requested-With": "XMLHttpRequest"
                    },
                    body: JSON.stringify({
                      code: String(form.get("code") ?? ""),
                      name: String(form.get("name") ?? ""),
                      active: true
                    })
                  });
                  const payload = (await res.json().catch(() => null)) as { error?: string } | null;
                  if (!res.ok) {
                    setFeedback({
                      kind: "error",
                      text: payload?.error ?? "No se pudo guardar la carrera."
                    });
                    return;
                  }
                  formElement.reset();
                  await refreshAll();
                  router.refresh();
                  setFeedback({ kind: "success", text: "Carrera registrada correctamente." });
                });
              }}
            >
              <label className="block text-sm font-semibold text-ink">
                Código de carrera
                <Input className="mt-1" name="code" placeholder="ISC" required type="text" />
              </label>
              <label className="block text-sm font-semibold text-ink">
                Nombre de la carrera
                <Input
                  className="mt-1"
                  name="name"
                  placeholder="Ingeniería en Sistemas Computacionales"
                  required
                  type="text"
                />
              </label>
              <Button disabled={isPending} type="submit">
                Guardar carrera
              </Button>
            </form>
          </section>

          <section className="rounded-xl border border-line bg-card p-6 shadow-subtle lg:col-span-2">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-brand" aria-hidden="true" />
              <h2 className="text-base font-semibold text-ink">
                Nueva materia y perfiles requeridos
              </h2>
            </div>
            <form
              className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5"
              onSubmit={(event) => {
                event.preventDefault();
                const formElement = event.currentTarget;
                const form = new FormData(formElement);
                setFeedback(null);

                startTransition(async () => {
                  const res = await fetch("/api/academic/subjects", {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      "X-Requested-With": "XMLHttpRequest"
                    },
                    body: JSON.stringify({
                      careerId: String(form.get("careerId") ?? ""),
                      code: String(form.get("code") ?? ""),
                      name: String(form.get("name") ?? ""),
                      quarter: Number(form.get("quarter") ?? 1),
                      defaultHours: Number(form.get("defaultHours") ?? 4),
                      requiredProfileCodes: selectedProfileCodes,
                      active: true
                    })
                  });
                  const payload = (await res.json().catch(() => null)) as { error?: string } | null;
                  if (!res.ok) {
                    setFeedback({
                      kind: "error",
                      text: payload?.error ?? "No se pudo guardar la materia."
                    });
                    return;
                  }
                  formElement.reset();
                  setSelectedProfileCodes([]);
                  await refreshAll();
                  router.refresh();
                  setFeedback({ kind: "success", text: "Materia y requisitos guardados." });
                });
              }}
            >
              <label className="block text-sm font-semibold text-ink">
                Carrera
                <select
                  name="careerId"
                  required
                  defaultValue=""
                  className="focus-ring mt-1 flex min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                >
                  <option value="" disabled>
                    Selecciona una carrera
                  </option>
                  {careers.map((career) => (
                    <option key={career.id} value={career.id}>
                      {career.code} · {career.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-semibold text-ink">
                Clave
                <Input className="mt-1" name="code" placeholder="ISC06" required type="text" />
              </label>
              <label className="block text-sm font-semibold text-ink">
                Nombre de la materia
                <Input className="mt-1" name="name" required type="text" />
              </label>
              <label className="block text-sm font-semibold text-ink">
                Cuatrimestre (1–12)
                <Input className="mt-1" defaultValue={1} max={12} min={1} name="quarter" required type="number" />
              </label>
              <label className="block text-sm font-semibold text-ink">
                Horas semanales
                <Input
                  className="mt-1"
                  defaultValue={4}
                  max={99}
                  min={0.5}
                  name="defaultHours"
                  required
                  step="0.25"
                  type="number"
                />
              </label>

              <fieldset className="sm:col-span-2 lg:col-span-5">
                <legend className="text-sm font-semibold text-ink">
                  Perfiles docentes requeridos (basta coincidir con uno; vacío permite cualquiera)
                </legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {profiles.length === 0 ? (
                    <span className="text-xs text-muted-foreground">
                      Aún no hay perfiles docentes registrados.
                    </span>
                  ) : (
                    profiles.map((profile) => {
                      const checked = selectedProfileCodes.includes(profile.code);
                      return (
                        <label
                          key={profile.code}
                          className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-line bg-panel px-3 py-1.5 text-xs font-medium text-ink"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) => {
                              setSelectedProfileCodes((current) =>
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

              <div className="sm:col-span-2 lg:col-span-5">
                <Button disabled={isPending || careers.length === 0} type="submit">
                  Guardar materia
                </Button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      <section className="rounded-xl border border-line bg-card p-6 shadow-subtle">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-ink">
              Catálogo de materias ({visibleSubjects.length})
            </h2>
            <p className="text-xs text-muted-foreground">
              {isAdmin
                ? "Vista global de carreras y requisitos configurados."
                : "Vista filtrada exclusivamente a las carreras de tu ámbito."}
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs font-semibold text-ink">
            Filtrar carrera:
            <select
              value={selectedCareerId}
              onChange={(event) => setSelectedCareerId(event.target.value)}
              className="focus-ring rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground"
            >
              <option value="all">Todas las autorizadas ({careers.length})</option>
              {careers.map((career) => (
                <option key={career.id} value={career.id}>
                  {career.code} · {career.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {visibleSubjects.length === 0 ? (
          <p className="mt-4 rounded-md border border-line-subtle bg-panel px-4 py-3 text-sm text-muted">
            No hay materias registradas para el filtro actual.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-4">Cuatrimestre</th>
                  <th className="py-2 pr-4">Clave</th>
                  <th className="py-2 pr-4">Materia</th>
                  <th className="py-2 pr-4">Carrera</th>
                  <th className="py-2 pr-4">Horas base</th>
                  <th className="py-2">Perfiles requeridos</th>
                </tr>
              </thead>
              <tbody>
                {visibleSubjects.map((subject) => (
                  <tr key={subject.id} className="border-b border-line-subtle last:border-b-0">
                    <td className="py-3 pr-4 font-mono text-xs text-ink">Q{subject.quarter}</td>
                    <td className="py-3 pr-4 font-mono text-xs font-semibold text-ink">
                      {subject.code}
                    </td>
                    <td className="py-3 pr-4 font-medium text-ink">{subject.name}</td>
                    <td className="py-3 pr-4 text-muted">
                      {careerNameMap.get(subject.careerId) ?? subject.careerId}
                    </td>
                    <td className="py-3 pr-4 font-mono text-xs text-ink">
                      {hundredthsToHours(subject.defaultHoursHundredths)} h
                    </td>
                    <td className="py-3">
                      {subject.requiredProfileCodes.length === 0 ? (
                        <span className="text-xs text-muted-foreground">
                          Sin requisitos específicos
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {subject.requiredProfileCodes.map((code) => (
                            <span
                              key={code}
                              className="inline-flex rounded border border-line-subtle bg-brandSoft px-2 py-0.5 font-mono text-xs font-semibold text-brand"
                            >
                              {code}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
