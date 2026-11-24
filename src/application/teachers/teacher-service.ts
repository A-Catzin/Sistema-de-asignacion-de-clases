import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  isValidProfileCode,
  normalizeTextKey,
  uniqueValidProfileCodes
} from "@/domain/academic/academic-offer";
import { buildAuditRecord } from "@/domain/audit/audit-catalog";
import {
  assertActiveActor,
  canManageUsersAndAdminCatalogs,
  canUpdateTeacher,
  type ActorScope
} from "@/domain/auth/authorization-policy";
import {
  canSetTeacherMaxHours,
  computeTeacherLoadSummary,
  teacherMaxHoursToHundredths,
  type AssignedCoordinatorSummary,
  type AssignmentLoadInput,
  type TeacherSummary
} from "@/domain/teachers/teacher-catalog";
import { queueAuditEventInTransaction } from "@/infrastructure/audit/audit-store";
import { getAdminFirestore } from "@/infrastructure/firebase/admin";

export type TeacherFailure = {
  ok: false;
  status: 400 | 401 | 403 | 404 | 409;
  reason: string;
  error: string;
};

export type CoordinatorOption = Readonly<{
  id: string;
  name: string;
  active: boolean;
}>;

type StoredTeacherDoc = Readonly<{
  id: string;
  name: string;
  normalizedName: string;
  email: string | null;
  notes: string | null;
  maxHoursHundredths: number;
  active: boolean;
  responsibleCoordinatorId: string | null;
  createdAtIso: string;
  updatedAtIso: string;
}>;

const upsertTeacherInputSchema = z.object({
  id: z.string().trim().min(1).optional(),
  name: z
    .string()
    .trim()
    .min(2, "Escribe el nombre del docente.")
    .max(160, "El nombre del docente no puede superar 160 caracteres."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Escribe un correo electrónico válido.")
    .optional()
    .or(z.literal(""))
    .nullable(),
  notes: z
    .string()
    .trim()
    .max(500, "Las notas no pueden superar 500 caracteres.")
    .optional()
    .or(z.literal(""))
    .nullable(),
  maxHours: z.coerce
    .number()
    .min(0, "Las horas máximas no pueden ser negativas.")
    .max(99, "Las horas máximas no pueden exceder 99.")
    .default(20),
  active: z.boolean().default(true),
  responsibleCoordinatorId: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .nullable(),
  coordinatorIds: z.array(z.string().trim().min(1)).optional(),
  availableProfileCodes: z.array(z.string()).default([])
});

const operationalTeacherPatchSchema = z
  .object({
    maxHours: z.coerce
      .number()
      .min(0, "Las horas máximas no pueden ser negativas.")
      .max(99, "Las horas máximas no pueden exceder 99.")
      .optional(),
    availableProfileCodes: z.array(z.string()).optional()
  })
  .refine((data) => data.maxHours !== undefined || data.availableProfileCodes !== undefined, {
    message: "Indica las horas máximas o los perfiles disponibles a actualizar."
  });

function authzFailure(reason: string): TeacherFailure {
  return {
    ok: false,
    status: reason === "unauthenticated-or-inactive" ? 401 : 403,
    reason,
    error: "No tienes permiso para realizar esta operación sobre docentes."
  };
}

function teacherNameKey(normalizedName: string): string {
  return Buffer.from(JSON.stringify([normalizedName])).toString("base64url");
}

function sumActiveTeacherAssignmentHours(docs: ReadonlyArray<{ data: () => Record<string, unknown> }>): number {
  let sum = 0;
  for (const doc of docs) {
    const data = doc.data();
    if (data.status === "active") {
      const hours = Number(data.assignedHoursHundredths ?? 0);
      if (Number.isFinite(hours) && hours > 0) {
        sum += hours;
      }
    }
  }
  return sum;
}

export async function listCoordinatorOptions(
  actor: ActorScope
): Promise<{ ok: true; coordinators: CoordinatorOption[] } | TeacherFailure> {
  const authz = canManageUsersAndAdminCatalogs(actor);
  if (!authz.ok) return authzFailure(authz.reason);

  const snapshot = await getAdminFirestore().collection("coordinators").get();
  const coordinators: CoordinatorOption[] = snapshot.docs
    .map((doc) => {
      const data = doc.data() as { name?: unknown; active?: unknown };
      return {
        id: doc.id,
        name: String(data.name ?? doc.id),
        active: data.active === true
      };
    })
    .filter((item) => item.active)
    .sort((a, b) => a.name.localeCompare(b.name));

  return { ok: true, coordinators };
}

export async function listTeachers(
  actor: ActorScope
): Promise<{ ok: true; teachers: TeacherSummary[] } | TeacherFailure> {
  const authz = assertActiveActor(actor);
  if (!authz.ok) return authzFailure(authz.reason);

  if (actor!.role === "coordinator" && actor!.teacherIds.length === 0) {
    return { ok: true, teachers: [] };
  }

  const db = getAdminFirestore();
  const [
    teachersSnap,
    profilesSnap,
    coordTeachersSnap,
    coordinatorsSnap,
    coordCareersSnap,
    groupsSnap,
    activeAssignmentsSnap
  ] = await Promise.all([
    db.collection("teachers").get(),
    db.collection("teacherAvailableProfiles").get(),
    db.collection("coordinatorTeachers").get(),
    db.collection("coordinators").get(),
    db.collection("coordinatorCareers").get(),
    db.collection("groups").get(),
    db.collection("assignments").where("status", "==", "active").get()
  ]);

  const allowedTeacherIds = new Set(actor!.teacherIds);
  const visibleTeacherDocs = teachersSnap.docs
    .map((doc) => doc.data() as StoredTeacherDoc)
    .filter((teacher) => actor!.role === "admin" || allowedTeacherIds.has(teacher.id));

  if (visibleTeacherDocs.length === 0) {
    return { ok: true, teachers: [] };
  }

  const visibleIdSet = new Set(visibleTeacherDocs.map((item) => item.id));

  const profilesByTeacher = new Map<string, string[]>();
  for (const doc of profilesSnap.docs) {
    const data = doc.data() as { teacherId?: unknown; profileCode?: unknown };
    if (typeof data.teacherId !== "string" || typeof data.profileCode !== "string") continue;
    if (!visibleIdSet.has(data.teacherId)) continue;
    const list = profilesByTeacher.get(data.teacherId) ?? [];
    list.push(data.profileCode);
    profilesByTeacher.set(data.teacherId, list);
  }

  const coordinatorMetaById = new Map<string, { name: string; active: boolean }>();
  const coordinatorNameById = new Map<string, string>();
  for (const doc of coordinatorsSnap.docs) {
    const data = doc.data() as { name?: unknown; active?: unknown };
    const name = String(data.name ?? doc.id);
    coordinatorMetaById.set(doc.id, { name, active: data.active === true });
    coordinatorNameById.set(doc.id, name);
  }

  const coordIdsByTeacher = new Map<string, Set<string>>();
  for (const doc of coordTeachersSnap.docs) {
    const data = doc.data() as { coordinatorId?: unknown; teacherId?: unknown };
    if (typeof data.coordinatorId !== "string" || typeof data.teacherId !== "string") continue;
    if (!visibleIdSet.has(data.teacherId)) continue;
    const set = coordIdsByTeacher.get(data.teacherId) ?? new Set<string>();
    set.add(data.coordinatorId);
    coordIdsByTeacher.set(data.teacherId, set);
  }

  const careerCoordinatorByCareerId = new Map<string, string>();
  for (const doc of coordCareersSnap.docs) {
    const data = doc.data() as { coordinatorId?: unknown; careerId?: unknown };
    if (typeof data.coordinatorId === "string" && typeof data.careerId === "string") {
      careerCoordinatorByCareerId.set(data.careerId, data.coordinatorId);
    }
  }

  const groupCareerByGroupId = new Map<string, string>();
  for (const doc of groupsSnap.docs) {
    const data = doc.data() as { careerId?: unknown };
    if (typeof data.careerId === "string" && data.careerId) {
      groupCareerByGroupId.set(doc.id, data.careerId);
    }
  }

  const activeAssignments: AssignmentLoadInput[] = [];
  for (const doc of activeAssignmentsSnap.docs) {
    const data = doc.data() as {
      teacherId?: unknown;
      status?: unknown;
      assignedHoursHundredths?: unknown;
      careerId?: unknown;
      groupId?: unknown;
      cycleId?: unknown;
    };
    if (typeof data.teacherId !== "string" || !visibleIdSet.has(data.teacherId)) continue;
    activeAssignments.push({
      teacherId: data.teacherId,
      status: String(data.status ?? ""),
      assignedHoursHundredths: Number(data.assignedHoursHundredths ?? 0),
      careerId: typeof data.careerId === "string" ? data.careerId : null,
      groupId: typeof data.groupId === "string" ? data.groupId : null,
      cycleId: typeof data.cycleId === "string" ? data.cycleId : null
    });
  }

  const viewerCoordinatorId = actor!.role === "coordinator" ? (actor!.coordinatorId ?? actor!.uid) : null;

  const teachers: TeacherSummary[] = visibleTeacherDocs
    .map((teacher) => {
      const coordSet = new Set(coordIdsByTeacher.get(teacher.id) ?? []);
      if (teacher.responsibleCoordinatorId) {
        coordSet.add(teacher.responsibleCoordinatorId);
      }

      const coordinators: AssignedCoordinatorSummary[] = [...coordSet]
        .map((coordId) => {
          const meta = coordinatorMetaById.get(coordId);
          return {
            id: coordId,
            name: meta?.name ?? coordId,
            active: meta?.active ?? false,
            isResponsible: teacher.responsibleCoordinatorId === coordId
          };
        })
        .sort((a, b) => Number(b.isResponsible) - Number(a.isResponsible) || a.name.localeCompare(b.name));

      const load = computeTeacherLoadSummary({
        teacherId: teacher.id,
        assignments: activeAssignments,
        groupCareerByGroupId,
        careerCoordinatorByCareerId,
        coordinatorNameById,
        viewerCoordinatorId
      });

      return {
        ...teacher,
        assignedHoursHundredths: load.assignedHoursHundredths,
        availableHoursHundredths: Math.max(0, teacher.maxHoursHundredths - load.assignedHoursHundredths),
        availableProfileCodes: [...new Set(profilesByTeacher.get(teacher.id) ?? [])].sort(),
        coordinators,
        loadBreakdown: load.loadBreakdown
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return { ok: true, teachers };
}

export async function upsertTeacher(
  actor: ActorScope,
  rawInput: unknown,
  correlationId: string = randomUUID()
): Promise<{ ok: true; created: boolean; teacher: TeacherSummary } | TeacherFailure> {
  const authz = canManageUsersAndAdminCatalogs(actor);
  if (!authz.ok) return authzFailure(authz.reason);

  const parsed = upsertTeacherInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      reason: "validation-error",
      error: parsed.error.issues.map((issue) => issue.message).join(" ")
    };
  }

  for (const rawCode of parsed.data.availableProfileCodes) {
    if (rawCode.trim() && !isValidProfileCode(rawCode)) {
      return {
        ok: false,
        status: 400,
        reason: "invalid-profile-code",
        error: "Uno o más códigos de perfil disponibles no tienen formato válido."
      };
    }
  }

  const availableProfileCodes = uniqueValidProfileCodes(parsed.data.availableProfileCodes).sort();
  const normalizedName = normalizeTextKey(parsed.data.name);
  const maxHoursHundredths = teacherMaxHoursToHundredths(parsed.data.maxHours);
  const responsibleCoordinatorId = parsed.data.responsibleCoordinatorId?.trim() || null;
  const hasExplicitCoordinatorLinks = parsed.data.coordinatorIds !== undefined;
  const requestedCoordinatorSet = new Set(parsed.data.coordinatorIds ?? []);
  if (responsibleCoordinatorId) {
    requestedCoordinatorSet.add(responsibleCoordinatorId);
  }

  const teacherId = parsed.data.id ?? randomUUID();
  const newNameLockId = teacherNameKey(normalizedName);
  const db = getAdminFirestore();
  const teacherRef = db.collection("teachers").doc(teacherId);
  const newNameLockRef = db.collection("teacherNames").doc(newNameLockId);

  const txResult = await db.runTransaction(async (tx) => {
    const existingTeacherSnap = parsed.data.id ? await tx.get(teacherRef) : null;
    if (parsed.data.id && !existingTeacherSnap?.exists) {
      return {
        ok: false as const,
        status: 404 as const,
        reason: "teacher-not-found",
        error: "El docente seleccionado no existe."
      };
    }

    const nameLockSnap = await tx.get(newNameLockRef);
    if (nameLockSnap.exists && nameLockSnap.data()?.teacherId !== teacherId) {
      return {
        ok: false as const,
        status: 409 as const,
        reason: "teacher-already-exists",
        error: "Ya existe otro docente registrado con ese nombre."
      };
    }

    const profileSnaps = await Promise.all(
      availableProfileCodes.map((code) => tx.get(db.collection("teacherProfiles").doc(code)))
    );
    if (profileSnaps.some((snap) => !snap.exists)) {
      return {
        ok: false as const,
        status: 400 as const,
        reason: "profile-not-found",
        error: "Uno o más perfiles seleccionados no existen."
      };
    }

    const [existingProfilesSnap, existingCoordLinksSnap, teacherAssignmentsSnap] = await Promise.all([
      parsed.data.id
        ? tx.get(db.collection("teacherAvailableProfiles").where("teacherId", "==", teacherId))
        : Promise.resolve(null),
      parsed.data.id
        ? tx.get(db.collection("coordinatorTeachers").where("teacherId", "==", teacherId))
        : Promise.resolve(null),
      tx.get(db.collection("assignments").where("teacherId", "==", teacherId))
    ]);

    const previousCoordIds = existingCoordLinksSnap
      ? existingCoordLinksSnap.docs
          .map((doc) => String(doc.data().coordinatorId ?? ""))
          .filter(Boolean)
          .sort()
      : [];

    const effectiveCoordIdSet = hasExplicitCoordinatorLinks
      ? requestedCoordinatorSet
      : new Set([...previousCoordIds, ...(responsibleCoordinatorId ? [responsibleCoordinatorId] : [])]);
    const effectiveCoordinatorIds = [...effectiveCoordIdSet].sort();

    const coordSnaps = await Promise.all(
      effectiveCoordinatorIds.map((coordId) => tx.get(db.collection("coordinators").doc(coordId)))
    );
    if (coordSnaps.some((snap) => !snap.exists || snap.data()?.active !== true)) {
      return {
        ok: false as const,
        status: 400 as const,
        reason: "coordinator-not-found",
        error: "Uno o más coordinadores seleccionados no existen o están inactivos."
      };
    }

    const activeAssignedHoursHundredths = sumActiveTeacherAssignmentHours(teacherAssignmentsSnap.docs);
    if (!canSetTeacherMaxHours(maxHoursHundredths, activeAssignedHoursHundredths)) {
      return {
        ok: false as const,
        status: 409 as const,
        reason: "max-hours-below-assigned",
        error: "Las horas máximas no pueden quedar por debajo de las horas activas ya asignadas."
      };
    }

    const previousTeacher = existingTeacherSnap?.exists
      ? (existingTeacherSnap.data() as StoredTeacherDoc)
      : null;
    const previousProfiles = existingProfilesSnap
      ? existingProfilesSnap.docs
          .map((doc) => String(doc.data().profileCode ?? ""))
          .filter(Boolean)
          .sort()
      : [];

    const nowIso = new Date().toISOString();
    const storedTeacher: StoredTeacherDoc = {
      id: teacherId,
      name: parsed.data.name,
      normalizedName,
      email: parsed.data.email?.trim() || null,
      notes: parsed.data.notes?.trim() || null,
      maxHoursHundredths,
      active: parsed.data.active,
      responsibleCoordinatorId,
      createdAtIso: previousTeacher?.createdAtIso ?? nowIso,
      updatedAtIso: nowIso
    };

    if (previousTeacher) {
      const oldNameLockId = teacherNameKey(previousTeacher.normalizedName);
      if (oldNameLockId !== newNameLockId) {
        tx.delete(db.collection("teacherNames").doc(oldNameLockId));
      }
    }

    tx.set(newNameLockRef, { teacherId });
    tx.set(teacherRef, storedTeacher);

    const nextProfileSet = new Set(availableProfileCodes);
    const prevProfileSet = new Set(previousProfiles);
    for (const doc of existingProfilesSnap?.docs ?? []) {
      const code = String(doc.data().profileCode ?? "");
      if (!nextProfileSet.has(code)) {
        tx.delete(doc.ref);
      }
    }
    for (const code of availableProfileCodes) {
      if (!prevProfileSet.has(code)) {
        tx.create(db.collection("teacherAvailableProfiles").doc(`${teacherId}__${code}`), {
          teacherId,
          profileCode: code,
          createdAtIso: nowIso
        });
      }
    }

    const nextCoordSet = new Set(effectiveCoordinatorIds);
    const prevCoordSet = new Set(previousCoordIds);
    for (const doc of existingCoordLinksSnap?.docs ?? []) {
      const coordId = String(doc.data().coordinatorId ?? "");
      if (!nextCoordSet.has(coordId)) {
        tx.delete(doc.ref);
      }
    }
    for (const coordId of effectiveCoordinatorIds) {
      if (!prevCoordSet.has(coordId)) {
        tx.set(db.collection("coordinatorTeachers").doc(`${coordId}__${teacherId}`), {
          coordinatorId: coordId,
          teacherId,
          createdAtIso: nowIso
        });
      }
    }

    queueAuditEventInTransaction(
      tx,
      buildAuditRecord({
        id: randomUUID(),
        eventType: "teacher.upsert",
        entityType: "teacher",
        entityId: teacherId,
        actorUid: actor!.uid,
        actorRole: actor!.role,
        correlationId,
        occurredAtIso: nowIso,
        before: previousTeacher
          ? {
              ...previousTeacher,
              availableProfileCodes: previousProfiles,
              coordinatorIds: previousCoordIds
            }
          : null,
        after: {
          ...storedTeacher,
          availableProfileCodes,
          coordinatorIds: effectiveCoordinatorIds
        }
      })
    );

    return { ok: true as const, created: !previousTeacher, teacherId };
  });

  if (!txResult.ok) return txResult;

  const refreshed = await listTeachers(actor);
  if (!refreshed.ok) return refreshed;
  const saved = refreshed.teachers.find((item) => item.id === txResult.teacherId);
  if (!saved) {
    return {
      ok: false,
      status: 404,
      reason: "teacher-not-found",
      error: "No se pudo recuperar el docente guardado."
    };
  }

  return { ok: true, created: txResult.created, teacher: saved };
}

export async function updateTeacherOperationalFields(
  actor: ActorScope,
  teacherId: string,
  rawInput: unknown,
  correlationId: string = randomUUID()
): Promise<{ ok: true; teacher: TeacherSummary } | TeacherFailure> {
  const authz = canUpdateTeacher(actor, { teacherId, changesGeneralFields: false });
  if (!authz.ok) return authzFailure(authz.reason);

  const parsed = operationalTeacherPatchSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      reason: "validation-error",
      error: parsed.error.issues.map((issue) => issue.message).join(" ")
    };
  }

  let nextProfileCodes: string[] | undefined;
  if (parsed.data.availableProfileCodes !== undefined) {
    for (const rawCode of parsed.data.availableProfileCodes) {
      if (rawCode.trim() && !isValidProfileCode(rawCode)) {
        return {
          ok: false,
          status: 400,
          reason: "invalid-profile-code",
          error: "Uno o más códigos de perfil disponibles no tienen formato válido."
        };
      }
    }
    nextProfileCodes = uniqueValidProfileCodes(parsed.data.availableProfileCodes).sort();
  }

  const nextMaxHoursHundredths =
    parsed.data.maxHours !== undefined
      ? teacherMaxHoursToHundredths(parsed.data.maxHours)
      : undefined;

  const db = getAdminFirestore();
  const teacherRef = db.collection("teachers").doc(teacherId);

  const txResult = await db.runTransaction(async (tx) => {
    const teacherSnap = await tx.get(teacherRef);
    if (!teacherSnap.exists) {
      return {
        ok: false as const,
        status: 404 as const,
        reason: "teacher-not-found",
        error: "El docente seleccionado no existe."
      };
    }

    const profileSnaps = nextProfileCodes
      ? await Promise.all(
          nextProfileCodes.map((code) => tx.get(db.collection("teacherProfiles").doc(code)))
        )
      : [];
    if (profileSnaps.some((snap) => !snap.exists)) {
      return {
        ok: false as const,
        status: 400 as const,
        reason: "profile-not-found",
        error: "Uno o más perfiles seleccionados no existen."
      };
    }

    const [existingProfilesSnap, teacherAssignmentsSnap] = await Promise.all([
      tx.get(db.collection("teacherAvailableProfiles").where("teacherId", "==", teacherId)),
      tx.get(db.collection("assignments").where("teacherId", "==", teacherId))
    ]);

    const previousTeacher = teacherSnap.data() as StoredTeacherDoc;
    const previousProfiles = existingProfilesSnap.docs
      .map((doc) => String(doc.data().profileCode ?? ""))
      .filter(Boolean)
      .sort();

    const effectiveMaxHoursHundredths = nextMaxHoursHundredths ?? previousTeacher.maxHoursHundredths;
    if (nextMaxHoursHundredths !== undefined) {
      const activeAssignedHoursHundredths = sumActiveTeacherAssignmentHours(
        teacherAssignmentsSnap.docs
      );
      if (!canSetTeacherMaxHours(effectiveMaxHoursHundredths, activeAssignedHoursHundredths)) {
        return {
          ok: false as const,
          status: 409 as const,
          reason: "max-hours-below-assigned",
          error: "Las horas máximas no pueden quedar por debajo de las horas activas ya asignadas."
        };
      }
    }

    const nowIso = new Date().toISOString();
    const updatedTeacher: StoredTeacherDoc = {
      ...previousTeacher,
      maxHoursHundredths: effectiveMaxHoursHundredths,
      updatedAtIso: nowIso
    };

    tx.set(teacherRef, updatedTeacher);

    const finalProfiles = nextProfileCodes ?? previousProfiles;
    if (nextProfileCodes !== undefined) {
      const nextSet = new Set(nextProfileCodes);
      const prevSet = new Set(previousProfiles);
      for (const doc of existingProfilesSnap.docs) {
        const code = String(doc.data().profileCode ?? "");
        if (!nextSet.has(code)) {
          tx.delete(doc.ref);
        }
      }
      for (const code of nextProfileCodes) {
        if (!prevSet.has(code)) {
          tx.create(db.collection("teacherAvailableProfiles").doc(`${teacherId}__${code}`), {
            teacherId,
            profileCode: code,
            createdAtIso: nowIso
          });
        }
      }
    }

    const eventType =
      nextMaxHoursHundredths === undefined && nextProfileCodes !== undefined
        ? "teacher.profiles.replace"
        : "teacher.upsert";

    queueAuditEventInTransaction(
      tx,
      buildAuditRecord({
        id: randomUUID(),
        eventType,
        entityType: "teacher",
        entityId: teacherId,
        actorUid: actor!.uid,
        actorRole: actor!.role,
        correlationId,
        occurredAtIso: nowIso,
        before: {
          ...previousTeacher,
          availableProfileCodes: previousProfiles
        },
        after: {
          ...updatedTeacher,
          availableProfileCodes: finalProfiles
        }
      })
    );

    return { ok: true as const };
  });

  if (!txResult.ok) return txResult;

  const refreshed = await listTeachers(actor);
  if (!refreshed.ok) return refreshed;
  const saved = refreshed.teachers.find((item) => item.id === teacherId);
  if (!saved) {
    return {
      ok: false,
      status: 404,
      reason: "teacher-not-found",
      error: "No se pudo recuperar el docente actualizado."
    };
  }

  return { ok: true, teacher: saved };
}
