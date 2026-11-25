"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, CalendarClock, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  MODALITIES,
  SHIFTS,
  WEEKDAYS,
  modalityUsesModules,
  type Classroom,
  type ScheduleBlock,
  type ScheduleTemplate
} from "@/domain/schedules/schedule-catalog";
import type { UserRole } from "@/lib/auth/session-policy";

export function ScheduleResourcesPanel({
  actorUid,
  actorRole,
  initialClassrooms,
  initialTemplates,
  initialBlocks
}: Readonly<{
  actorUid: string;
  actorRole: UserRole;
  initialClassrooms: readonly Classroom[];
  initialTemplates: readonly ScheduleTemplate[];
  initialBlocks: readonly ScheduleBlock[];
}>) {
  const router = useRouter();
  const [classrooms, setClassrooms] = useState<Classroom[]>([...initialClassrooms]);
  const [templates, setTemplates] = useState<ScheduleTemplate[]>([...initialTemplates]);
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([...initialBlocks]);
  const [selectedTemplateFilter, setSelectedTemplateFilter] = useState<string>("all");
  const [blockFormTemplateId, setBlockFormTemplateId] = useState<string>(
    initialTemplates.find((tpl) => tpl.active)?.id ?? ""
  );
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const isAdmin = actorRole === "admin";
  const templateById = new Map(templates.map((tpl) => [tpl.id, tpl]));
  const selectedFormTemplate = templateById.get(blockFormTemplateId) ?? null;
  const formUsesModules = selectedFormTemplate
    ? modalityUsesModules(selectedFormTemplate.modality)
    : false;

  const visibleBlocks =
    selectedTemplateFilter === "all"
      ? blocks
      : blocks.filter((block) => block.templateId === selectedTemplateFilter);

  async function refreshAll(message?: string) {
    const [roomsRes, tplRes, blocksRes] = await Promise.all([
      fetch("/api/schedules/classrooms", { cache: "no-store" }),
      fetch("/api/schedules/templates", { cache: "no-store" }),
      fetch("/api/schedules/blocks", { cache: "no-store" })
    ]);
    if (roomsRes.ok) {
      const data = (await roomsRes.json()) as { classrooms: Classroom[] };
      setClassrooms(data.classrooms);
    }
    if (tplRes.ok) {
      const data = (await tplRes.json()) as { templates: ScheduleTemplate[] };
      setTemplates(data.templates);
      if (!blockFormTemplateId && data.templates.length > 0) {
        setBlockFormTemplateId(data.templates[0].id);
      }
    }
    if (blocksRes.ok) {
      const data = (await blocksRes.json()) as { blocks: ScheduleBlock[] };
      setBlocks(data.blocks);
    }
    router.refresh();
    if (message) {
      setFeedback({ kind: "success", text: message });
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
              <Building2 className="h-4 w-4 text-brand" aria-hidden="true" />
              <h2 className="text-base font-semibold text-ink">Nueva aula</h2>
            </div>
            <form
              className="mt-4 grid gap-3 sm:grid-cols-3"
              onSubmit={(event) => {
                event.preventDefault();
                const formElement = event.currentTarget;
                const form = new FormData(formElement);
                setFeedback(null);

                startTransition(async () => {
                  const res = await fetch("/api/schedules/classrooms", {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      "X-Requested-With": "XMLHttpRequest"
                    },
                    body: JSON.stringify({
                      name: String(form.get("name") ?? ""),
                      kind: String(form.get("kind") ?? ""),
                      capacity: form.get("capacity"),
                      active: true
                    })
                  });
                  const payload = (await res.json().catch(() => null)) as { error?: string } | null;
                  if (!res.ok) {
                    setFeedback({
                      kind: "error",
                      text: payload?.error ?? "No se pudo guardar el aula."
                    });
                    return;
                  }
                  formElement.reset();
                  await refreshAll("Aula registrada correctamente.");
                });
              }}
            >
              <label className="block text-sm font-semibold text-ink">
                Nombre
                <Input className="mt-1" name="name" placeholder="Aula A-101" required type="text" />
              </label>
              <label className="block text-sm font-semibold text-ink">
                Tipo (opcional)
                <Input className="mt-1" name="kind" placeholder="Laboratorio / General" type="text" />
              </label>
              <label className="block text-sm font-semibold text-ink">
                Capacidad
                <Input className="mt-1" max={5000} min={0} name="capacity" placeholder="35" type="number" />
              </label>
              <div className="sm:col-span-3">
                <Button disabled={isPending} type="submit">
                  Guardar aula
                </Button>
              </div>
            </form>
          </section>

          <section className="rounded-xl border border-line bg-card p-6 shadow-subtle">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-brand" aria-hidden="true" />
              <h2 className="text-base font-semibold text-ink">Nueva plantilla horaria</h2>
            </div>
            <form
              className="mt-4 grid gap-3 sm:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                const formElement = event.currentTarget;
                const form = new FormData(formElement);
                setFeedback(null);

                startTransition(async () => {
                  const res = await fetch("/api/schedules/templates", {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      "X-Requested-With": "XMLHttpRequest"
                    },
                    body: JSON.stringify({
                      code: String(form.get("code") ?? ""),
                      label: String(form.get("label") ?? ""),
                      modality: String(form.get("modality") ?? "escolarizado"),
                      shift: String(form.get("shift") ?? "matutino"),
                      startsAt: String(form.get("startsAt") ?? "07:00"),
                      endsAt: String(form.get("endsAt") ?? "14:00"),
                      active: true
                    })
                  });
                  const payload = (await res.json().catch(() => null)) as { error?: string } | null;
                  if (!res.ok) {
                    setFeedback({
                      kind: "error",
                      text: payload?.error ?? "No se pudo guardar la plantilla."
                    });
                    return;
                  }
                  formElement.reset();
                  await refreshAll("Plantilla horaria guardada.");
                });
              }}
            >
              <label className="block text-sm font-semibold text-ink">
                Código
                <Input
                  className="mt-1"
                  name="code"
                  placeholder="sabatino-matutino"
                  required
                  type="text"
                />
              </label>
              <label className="block text-sm font-semibold text-ink">
                Descripción
                <Input
                  className="mt-1"
                  name="label"
                  placeholder="Sabatino matutino"
                  required
                  type="text"
                />
              </label>
              <label className="block text-sm font-semibold text-ink">
                Modalidad
                <select
                  name="modality"
                  defaultValue="escolarizado"
                  className="focus-ring mt-1 flex min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                >
                  {MODALITIES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-semibold text-ink">
                Turno
                <select
                  name="shift"
                  defaultValue="matutino"
                  className="focus-ring mt-1 flex min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                >
                  {SHIFTS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-semibold text-ink">
                Hora inicio
                <Input className="mt-1" defaultValue="08:00" name="startsAt" required type="time" />
              </label>
              <label className="block text-sm font-semibold text-ink">
                Hora fin
                <Input className="mt-1" defaultValue="13:00" name="endsAt" required type="time" />
              </label>
              <div className="sm:col-span-2">
                <Button disabled={isPending} type="submit">
                  Guardar plantilla
                </Button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      <section className="rounded-xl border border-line bg-card p-6 shadow-subtle">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-brand" aria-hidden="true" />
          <h2 className="text-base font-semibold text-ink">
            {isAdmin ? "Registrar bloque horario (base o personalizado)" : "Registrar bloque personalizado propio"}
          </h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Sabatino y virtual modular requieren Módulo 1 o Módulo 2; las demás modalidades usan módulo 0.
        </p>

        <form
          className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6"
          onSubmit={(event) => {
            event.preventDefault();
            const formElement = event.currentTarget;
            const form = new FormData(formElement);
            setFeedback(null);

            startTransition(async () => {
              const isCustom = !isAdmin || form.get("blockType") === "custom";
              const res = await fetch("/api/schedules/blocks", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "X-Requested-With": "XMLHttpRequest"
                },
                body: JSON.stringify({
                  templateId: blockFormTemplateId,
                  dayOfWeek: Number(form.get("dayOfWeek") ?? 1),
                  startsAt: String(form.get("startsAt") ?? "08:00"),
                  endsAt: String(form.get("endsAt") ?? "09:30"),
                  module: formUsesModules ? Number(form.get("module") ?? 1) : 0,
                  isCustom,
                  active: true
                })
              });
              const payload = (await res.json().catch(() => null)) as { error?: string } | null;
              if (!res.ok) {
                setFeedback({
                  kind: "error",
                  text: payload?.error ?? "No se pudo guardar el bloque horario."
                });
                return;
              }
              await refreshAll("Bloque horario registrado.");
            });
          }}
        >
          <label className="block text-sm font-semibold text-ink lg:col-span-2">
            Plantilla
            <select
              required
              value={blockFormTemplateId}
              onChange={(event) => setBlockFormTemplateId(event.target.value)}
              className="focus-ring mt-1 flex min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
            >
              <option value="" disabled>
                Selecciona una plantilla
              </option>
              {templates
                .filter((tpl) => tpl.active)
                .map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.label} ({tpl.startsAt}–{tpl.endsAt})
                  </option>
                ))}
            </select>
          </label>

          <label className="block text-sm font-semibold text-ink">
            Día
            <select
              name="dayOfWeek"
              defaultValue={formUsesModules ? 6 : 1}
              className="focus-ring mt-1 flex min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
            >
              {WEEKDAYS.map((day) => (
                <option key={day.value} value={day.value}>
                  {day.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-semibold text-ink">
            Inicio
            <Input className="mt-1" defaultValue="08:00" name="startsAt" required type="time" />
          </label>

          <label className="block text-sm font-semibold text-ink">
            Fin
            <Input className="mt-1" defaultValue="09:30" name="endsAt" required type="time" />
          </label>

          {formUsesModules ? (
            <label className="block text-sm font-semibold text-ink">
              Módulo
              <select
                name="module"
                defaultValue={1}
                className="focus-ring mt-1 flex min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
              >
                <option value={1}>Módulo 1</option>
                <option value={2}>Módulo 2</option>
              </select>
            </label>
          ) : (
            <div className="block text-sm font-semibold text-ink">
              Módulo
              <p className="mt-2 font-mono text-xs text-muted-foreground">0 (sin módulo)</p>
            </div>
          )}

          {isAdmin ? (
            <label className="block text-sm font-semibold text-ink lg:col-span-2">
              Alcance del bloque
              <select
                name="blockType"
                defaultValue="base"
                className="focus-ring mt-1 flex min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
              >
                <option value="base">Bloque base institucional</option>
                <option value="custom">Bloque personalizado</option>
              </select>
            </label>
          ) : null}

          <div className="flex items-end sm:col-span-2 lg:col-span-4">
            <Button disabled={isPending || !blockFormTemplateId} type="submit">
              Guardar bloque
            </Button>
          </div>
        </form>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-line bg-card p-6 shadow-subtle">
          <h2 className="text-base font-semibold text-ink">Aulas ({classrooms.length})</h2>
          <p className="text-xs text-muted-foreground">
            Desactivar un aula conserva las referencias históricas de grupos y asignaciones.
          </p>
          {classrooms.length === 0 ? (
            <p className="mt-4 rounded-md border border-line-subtle bg-panel px-4 py-3 text-sm text-muted">
              No hay aulas registradas.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs uppercase text-muted-foreground">
                    <th className="py-2 pr-3">Aula</th>
                    <th className="py-2 pr-3">Tipo / Cap.</th>
                    <th className="py-2 pr-3">Estado</th>
                    {isAdmin ? <th className="py-2">Acción</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {classrooms.map((room) => (
                    <tr key={room.id} className="border-b border-line-subtle last:border-b-0">
                      <td className="py-2.5 pr-3 font-medium text-ink">{room.name}</td>
                      <td className="py-2.5 pr-3 text-xs text-muted">
                        {room.kind ?? "General"}
                        {room.capacity !== null ? ` · ${room.capacity} lugares` : ""}
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-xs">
                        {room.active ? "Activa" : "Inactiva"}
                      </td>
                      {isAdmin ? (
                        <td className="py-2.5">
                          <Button
                            disabled={isPending}
                            type="button"
                            variant="secondary"
                            onClick={() => {
                              startTransition(async () => {
                                const res = await fetch(`/api/schedules/classrooms/${room.id}`, {
                                  method: "PATCH",
                                  headers: {
                                    "Content-Type": "application/json",
                                    "X-Requested-With": "XMLHttpRequest"
                                  },
                                  body: JSON.stringify({
                                    name: room.name,
                                    kind: room.kind ?? "",
                                    capacity: room.capacity,
                                    active: !room.active
                                  })
                                });
                                if (res.ok) {
                                  await refreshAll(
                                    room.active ? "Aula desactivada." : "Aula reactivada."
                                  );
                                }
                              });
                            }}
                          >
                            {room.active ? "Desactivar" : "Reactivar"}
                          </Button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-line bg-card p-6 shadow-subtle">
          <h2 className="text-base font-semibold text-ink">
            Plantillas horarias ({templates.length})
          </h2>
          <p className="text-xs text-muted-foreground">
            Ventanas autorizadas por combinación única de modalidad y turno.
          </p>
          {templates.length === 0 ? (
            <p className="mt-4 rounded-md border border-line-subtle bg-panel px-4 py-3 text-sm text-muted">
              No hay plantillas registradas.
            </p>
          ) : (
            <ul className="mt-4 space-y-2">
              {templates.map((tpl) => (
                <li
                  key={tpl.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line-subtle bg-panel px-3 py-2 text-xs"
                >
                  <div>
                    <span className="font-semibold text-ink">{tpl.label}</span>{" "}
                    <span className="font-mono text-muted-foreground">
                      ({tpl.code} · {tpl.startsAt}–{tpl.endsAt})
                    </span>
                  </div>
                  <span className="font-mono text-ink">
                    {tpl.active ? "Activa" : "Inactiva"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="rounded-xl border border-line bg-card p-6 shadow-subtle">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-ink">
              Bloques horarios autorizados ({visibleBlocks.length})
            </h2>
            <p className="text-xs text-muted-foreground">
              {isAdmin
                ? "Incluye bloques base y personalizados de todos los usuarios."
                : "Incluye bloques base institucionales y únicamente tus bloques personalizados."}
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs font-semibold text-ink">
            Plantilla:
            <select
              value={selectedTemplateFilter}
              onChange={(event) => setSelectedTemplateFilter(event.target.value)}
              className="focus-ring rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground"
            >
              <option value="all">Todas ({templates.length})</option>
              {templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {visibleBlocks.length === 0 ? (
          <p className="mt-4 rounded-md border border-line-subtle bg-panel px-4 py-3 text-sm text-muted">
            No hay bloques horarios registrados para este filtro.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-3">Etiqueta</th>
                  <th className="py-2 pr-3">Plantilla</th>
                  <th className="py-2 pr-3">Módulo</th>
                  <th className="py-2 pr-3">Origen</th>
                  <th className="py-2 pr-3">Estado</th>
                  <th className="py-2">Acción</th>
                </tr>
              </thead>
              <tbody>
                {visibleBlocks.map((block) => {
                  const canToggle =
                    isAdmin || (block.isCustom && block.createdByUid === actorUid);
                  return (
                    <tr key={block.id} className="border-b border-line-subtle last:border-b-0">
                      <td className="py-2.5 pr-3 font-mono text-xs font-semibold text-ink">
                        {block.label}
                      </td>
                      <td className="py-2.5 pr-3 text-xs text-muted">
                        {templateById.get(block.templateId)?.label ?? block.templateId}
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-xs text-ink">
                        {block.module === 0 ? "0 (sin módulo)" : `Módulo ${block.module}`}
                      </td>
                      <td className="py-2.5 pr-3 text-xs text-muted">
                        {block.isCustom ? "Personalizado" : "Base"}
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-xs">
                        {block.active ? "Activo" : "Inactivo"}
                      </td>
                      <td className="py-2.5">
                        {canToggle ? (
                          <Button
                            disabled={isPending}
                            type="button"
                            variant="secondary"
                            onClick={() => {
                              startTransition(async () => {
                                const res = await fetch(`/api/schedules/blocks/${block.id}`, {
                                  method: "PATCH",
                                  headers: {
                                    "Content-Type": "application/json",
                                    "X-Requested-With": "XMLHttpRequest"
                                  },
                                  body: JSON.stringify({ active: !block.active })
                                });
                                if (res.ok) {
                                  await refreshAll(
                                    block.active ? "Bloque desactivado." : "Bloque reactivado."
                                  );
                                }
                              });
                            }}
                          >
                            {block.active ? "Desactivar" : "Reactivar"}
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">Solo lectura</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
