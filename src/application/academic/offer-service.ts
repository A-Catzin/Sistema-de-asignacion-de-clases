import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  hoursToHundredths,
  isValidCareerCode,
  isValidProfileCode,
  isValidSubjectCode,
  normalizeCareerCode,
  normalizeProfileCode,
  normalizeSubjectCode,
  normalizeTextKey,
  uniqueValidProfileCodes,
  type Career,
  type SubjectWithRequirements,
  type TeacherProfile
} from "@/domain/academic/academic-offer";
import { buildAuditRecord } from "@/domain/audit/audit-catalog";
import {
  assertActiveActor,
  canManageUsersAndAdminCatalogs,
  canReadCareer,
  type ActorScope
} from "@/domain/auth/authorization-policy";
import { queueAuditEventInTransaction } from "@/infrastructure/audit/audit-store";
import { getAdminFirestore } from "@/infrastructure/firebase/admin";

export type OfferFailure = {
  ok: false;
  status: 400 | 401 | 403 | 404 | 409;
  reason: string;
  error: string;
};

const teacherProfileInputSchema = z.object({
  code: z.string().trim().min(1, "Escribe el código del perfil docente."),
  name: z
    .string()
    .trim()
    .min(2, "Escribe el nombre del perfil docente.")
    .max(120, "El nombre del perfil no puede superar 120 caracteres."),
  active: z.boolean().default(true)
});

const careerInputSchema = z.object({
  id: z.string().trim().min(1).optional(),
  code: z.string().trim().min(2, "Escribe el código de la carrera."),
  name: z
    .string()
    .trim()
    .min(2, "Escribe el nombre de la carrera.")
    .max(160, "El nombre de la carrera no puede superar 160 caracteres."),
  active: z.boolean().default(true)
});

const subjectInputSchema = z.object({
  id: z.string().trim().min(1).optional(),
  careerId: z.string().trim().min(1, "Selecciona una carrera."),
  code: z.string().trim().min(2, "Escribe la clave de la materia."),
  name: z
    .string()
    .trim()
    .min(2, "Escribe el nombre de la materia.")
    .max(160, "El nombre de la materia no puede superar 160 caracteres."),
  quarter: z.coerce
    .number()
    .int("El cuatrimestre debe ser entero.")
    .min(1, "El cuatrimestre mínimo es 1.")
    .max(12, "El cuatrimestre máximo es 12."),
  defaultHours: z.coerce
    .number()
    .positive("Las horas deben ser mayores a cero.")
    .max(99, "Las horas no pueden exceder 99."),
  active: z.boolean().default(true),
  requiredProfileCodes: z.array(z.string()).default([])
});

const defaultHoursPatchSchema = z.object({
  defaultHours: z.coerce
    .number()
    .positive("Las horas deben ser mayores a cero.")
    .max(99, "Las horas no pueden exceder 99.")
});

function authzFailure(reason: string): OfferFailure {
  return {
    ok: false,
    status: reason === "unauthenticated-or-inactive" ? 401 : 403,
    reason,
    error: "No tienes permiso para realizar esta operación."
  };
}

function subjectKey(careerId: string, quarter: number, normalizedName: string): string {
  return Buffer.from(JSON.stringify([careerId, quarter, normalizedName])).toString("base64url");
}

function subjectCodeKey(careerId: string, code: string): string {
  return Buffer.from(JSON.stringify([careerId, code])).toString("base64url");
}

export async function listTeacherProfiles(
  actor: ActorScope
): Promise<{ ok: true; profiles: TeacherProfile[] } | OfferFailure> {
  const authz = assertActiveActor(actor);
  if (!authz.ok) return authzFailure(authz.reason);

  const snapshot = await getAdminFirestore().collection("teacherProfiles").get();
  const profiles = snapshot.docs
    .map((doc) => doc.data() as TeacherProfile)
    .sort((a, b) => a.code.localeCompare(b.code));

  return { ok: true, profiles };
}

export async function upsertTeacherProfile(
  actor: ActorScope,
  rawInput: unknown,
  correlationId: string = randomUUID()
): Promise<{ ok: true; created: boolean; profile: TeacherProfile } | OfferFailure> {
  const authz = canManageUsersAndAdminCatalogs(actor);
  if (!authz.ok) return authzFailure(authz.reason);

  const parsed = teacherProfileInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      reason: "validation-error",
      error: parsed.error.issues.map((issue) => issue.message).join(" ")
    };
  }

  if (!isValidProfileCode(parsed.data.code)) {
    return {
      ok: false,
      status: 400,
      reason: "invalid-profile-code",
      error: "El código de perfil solo admite letras, números y guion bajo."
    };
  }

  const code = normalizeProfileCode(parsed.data.code);
  const db = getAdminFirestore();
  const profileRef = db.collection("teacherProfiles").doc(code);

  return db.runTransaction(async (tx) => {
    const existingSnap = await tx.get(profileRef);
    const previous = existingSnap.exists ? (existingSnap.data() as TeacherProfile) : null;
    const nowIso = new Date().toISOString();

    const profile: TeacherProfile = {
      code,
      name: parsed.data.name,
      active: parsed.data.active,
      createdAtIso: previous?.createdAtIso ?? nowIso,
      updatedAtIso: nowIso
    };

    tx.set(profileRef, profile);
    queueAuditEventInTransaction(
      tx,
      buildAuditRecord({
        id: randomUUID(),
        eventType: "teacher_profile.upsert",
        entityType: "teacher_profile",
        entityId: code,
        actorUid: actor!.uid,
        actorRole: actor!.role,
        correlationId,
        occurredAtIso: nowIso,
        before: previous ? { ...previous } : null,
        after: { ...profile }
      })
    );

    return { ok: true as const, created: !previous, profile };
  });
}

export async function listCareers(
  actor: ActorScope
): Promise<{ ok: true; careers: Career[] } | OfferFailure> {
  const authz = assertActiveActor(actor);
  if (!authz.ok) return authzFailure(authz.reason);

  if (actor!.role === "coordinator" && actor!.careerIds.length === 0) {
    return { ok: true, careers: [] };
  }

  const snapshot = await getAdminFirestore().collection("careers").get();
  const allowedSet = new Set(actor!.careerIds);
  const careers = snapshot.docs
    .map((doc) => doc.data() as Career)
    .filter((career) => actor!.role === "admin" || allowedSet.has(career.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { ok: true, careers };
}

export async function upsertCareer(
  actor: ActorScope,
  rawInput: unknown,
  correlationId: string = randomUUID()
): Promise<{ ok: true; created: boolean; career: Career } | OfferFailure> {
  const authz = canManageUsersAndAdminCatalogs(actor);
  if (!authz.ok) return authzFailure(authz.reason);

  const parsed = careerInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      reason: "validation-error",
      error: parsed.error.issues.map((issue) => issue.message).join(" ")
    };
  }

  if (!isValidCareerCode(parsed.data.code)) {
    return {
      ok: false,
      status: 400,
      reason: "invalid-career-code",
      error: "El código de carrera debe tener 2 a 24 caracteres alfanuméricos, guion o guion bajo."
    };
  }

  const code = normalizeCareerCode(parsed.data.code);
  const normalizedName = normalizeTextKey(parsed.data.name);
  const careerId = parsed.data.id ?? randomUUID();
  const db = getAdminFirestore();
  const careerRef = db.collection("careers").doc(careerId);
  const codeRef = db.collection("careerCodes").doc(code);

  return db.runTransaction(async (tx) => {
    const existingCareerSnap = parsed.data.id ? await tx.get(careerRef) : null;
    if (parsed.data.id && !existingCareerSnap?.exists) {
      return {
        ok: false as const,
        status: 404 as const,
        reason: "career-not-found",
        error: "La carrera seleccionada no existe."
      };
    }

    const codeLockSnap = await tx.get(codeRef);
    if (codeLockSnap.exists && codeLockSnap.data()?.careerId !== careerId) {
      return {
        ok: false as const,
        status: 409 as const,
        reason: "career-code-exists",
        error: "Ya existe otra carrera registrada con ese código."
      };
    }

    const previous = existingCareerSnap?.exists ? (existingCareerSnap.data() as Career) : null;
    const nowIso = new Date().toISOString();
    const career: Career = {
      id: careerId,
      code,
      name: parsed.data.name,
      normalizedName,
      active: parsed.data.active,
      createdAtIso: previous?.createdAtIso ?? nowIso,
      updatedAtIso: nowIso
    };

    if (previous && previous.code !== code) {
      tx.delete(db.collection("careerCodes").doc(previous.code));
    }
    tx.set(codeRef, { careerId });
    tx.set(careerRef, career);
    queueAuditEventInTransaction(
      tx,
      buildAuditRecord({
        id: randomUUID(),
        eventType: "career.upsert",
        entityType: "career",
        entityId: careerId,
        actorUid: actor!.uid,
        actorRole: actor!.role,
        correlationId,
        occurredAtIso: nowIso,
        before: previous ? { ...previous } : null,
        after: { ...career }
      })
    );

    return { ok: true as const, created: !previous, career };
  });
}

export async function listSubjects(
  actor: ActorScope,
  filter?: Readonly<{ careerId?: string }>
): Promise<{ ok: true; subjects: SubjectWithRequirements[] } | OfferFailure> {
  const authz = assertActiveActor(actor);
  if (!authz.ok) return authzFailure(authz.reason);

  if (filter?.careerId) {
    const careerAuthz = canReadCareer(actor, filter.careerId);
    if (!careerAuthz.ok) return authzFailure(careerAuthz.reason);
  }

  if (actor!.role === "coordinator" && actor!.careerIds.length === 0) {
    return { ok: true, subjects: [] };
  }

  const db = getAdminFirestore();
  const subjectsQuery = filter?.careerId
    ? db.collection("subjects").where("careerId", "==", filter.careerId)
    : db.collection("subjects");

  const [subjectsSnap, reqsSnap] = await Promise.all([
    subjectsQuery.get(),
    db.collection("subjectRequirements").get()
  ]);

  const reqsBySubject = new Map<string, string[]>();
  for (const doc of reqsSnap.docs) {
    const data = doc.data() as { subjectId?: unknown; profileCode?: unknown };
    if (typeof data.subjectId !== "string" || typeof data.profileCode !== "string") continue;
    const list = reqsBySubject.get(data.subjectId) ?? [];
    list.push(data.profileCode);
    reqsBySubject.set(data.subjectId, list);
  }

  const allowedCareers = new Set(actor!.careerIds);
  const subjects: SubjectWithRequirements[] = subjectsSnap.docs
    .map((doc) => {
      const data = doc.data() as Omit<SubjectWithRequirements, "requiredProfileCodes">;
      return {
        ...data,
        requiredProfileCodes: [...new Set(reqsBySubject.get(data.id) ?? [])].sort()
      };
    })
    .filter((subject) => actor!.role === "admin" || allowedCareers.has(subject.careerId))
    .sort(
      (a, b) =>
        a.quarter - b.quarter || a.code.localeCompare(b.code) || a.name.localeCompare(b.name)
    );

  return { ok: true, subjects };
}

export async function upsertSubjectWithRequirements(
  actor: ActorScope,
  rawInput: unknown,
  correlationId: string = randomUUID()
): Promise<{ ok: true; created: boolean; subject: SubjectWithRequirements } | OfferFailure> {
  const authz = canManageUsersAndAdminCatalogs(actor);
  if (!authz.ok) return authzFailure(authz.reason);

  const parsed = subjectInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      reason: "validation-error",
      error: parsed.error.issues.map((issue) => issue.message).join(" ")
    };
  }

  if (!isValidSubjectCode(parsed.data.code)) {
    return {
      ok: false,
      status: 400,
      reason: "invalid-subject-code",
      error: "La clave de materia debe tener 2 a 24 caracteres alfanuméricos, guion o guion bajo."
    };
  }

  for (const rawCode of parsed.data.requiredProfileCodes) {
    if (rawCode.trim() && !isValidProfileCode(rawCode)) {
      return {
        ok: false,
        status: 400,
        reason: "invalid-profile-code",
        error: "Uno o más códigos de perfil requeridos no tienen formato válido."
      };
    }
  }

  const code = normalizeSubjectCode(parsed.data.code);
  const requiredProfileCodes = uniqueValidProfileCodes(parsed.data.requiredProfileCodes).sort();
  const normalizedName = normalizeTextKey(parsed.data.name);
  const defaultHoursHundredths = hoursToHundredths(parsed.data.defaultHours);
  const subjectId = parsed.data.id ?? randomUUID();
  const newKey = subjectKey(parsed.data.careerId, parsed.data.quarter, normalizedName);
  const newCodeKey = subjectCodeKey(parsed.data.careerId, code);

  const db = getAdminFirestore();
  const careerRef = db.collection("careers").doc(parsed.data.careerId);
  const subjectRef = db.collection("subjects").doc(subjectId);
  const newKeyRef = db.collection("subjectKeys").doc(newKey);
  const newCodeRef = db.collection("subjectCodes").doc(newCodeKey);

  return db.runTransaction(async (tx) => {
    const careerSnap = await tx.get(careerRef);
    if (!careerSnap.exists) {
      return {
        ok: false as const,
        status: 404 as const,
        reason: "career-not-found",
        error: "La carrera seleccionada no existe."
      };
    }

    const profileSnaps = await Promise.all(
      requiredProfileCodes.map((profileCode) =>
        tx.get(db.collection("teacherProfiles").doc(profileCode))
      )
    );
    if (profileSnaps.some((snap) => !snap.exists)) {
      return {
        ok: false as const,
        status: 400 as const,
        reason: "profile-not-found",
        error: "Uno o más perfiles seleccionados no existen."
      };
    }

    const existingSubjectSnap = parsed.data.id ? await tx.get(subjectRef) : null;
    if (parsed.data.id && !existingSubjectSnap?.exists) {
      return {
        ok: false as const,
        status: 404 as const,
        reason: "subject-not-found",
        error: "La materia seleccionada no existe."
      };
    }

    const [newCodeSnap, newKeySnap] = await Promise.all([tx.get(newCodeRef), tx.get(newKeyRef)]);
    if (newCodeSnap.exists && newCodeSnap.data()?.subjectId !== subjectId) {
      return {
        ok: false as const,
        status: 409 as const,
        reason: "subject-code-exists",
        error: "Ya existe otra materia con esa clave en la carrera seleccionada."
      };
    }

    if (newKeySnap.exists && newKeySnap.data()?.subjectId !== subjectId) {
      return {
        ok: false as const,
        status: 409 as const,
        reason: "subject-already-exists",
        error: "Ya existe otra materia con ese nombre en el mismo cuatrimestre y carrera."
      };
    }

    const existingReqsSnap = parsed.data.id
      ? await tx.get(db.collection("subjectRequirements").where("subjectId", "==", subjectId))
      : null;

    const previousSubject = existingSubjectSnap?.exists
      ? (existingSubjectSnap.data() as Omit<SubjectWithRequirements, "requiredProfileCodes">)
      : null;
    const previousCodes = existingReqsSnap
      ? existingReqsSnap.docs
          .map((doc) => String(doc.data().profileCode ?? ""))
          .filter(Boolean)
          .sort()
      : [];

    const nowIso = new Date().toISOString();
    const storedSubject = {
      id: subjectId,
      careerId: parsed.data.careerId,
      code,
      quarter: parsed.data.quarter,
      name: parsed.data.name,
      normalizedName,
      defaultHoursHundredths,
      active: parsed.data.active,
      createdAtIso: previousSubject?.createdAtIso ?? nowIso,
      updatedAtIso: nowIso
    };

    if (previousSubject) {
      const oldCodeKey = subjectCodeKey(previousSubject.careerId, previousSubject.code);
      if (oldCodeKey !== newCodeKey) {
        tx.delete(db.collection("subjectCodes").doc(oldCodeKey));
      }

      const oldKey = subjectKey(
        previousSubject.careerId,
        previousSubject.quarter,
        previousSubject.normalizedName
      );
      if (oldKey !== newKey) {
        tx.delete(db.collection("subjectKeys").doc(oldKey));
      }
    }

    tx.set(newCodeRef, { subjectId, careerId: parsed.data.careerId, code });
    tx.set(newKeyRef, { subjectId });
    tx.set(subjectRef, storedSubject);

    const nextCodeSet = new Set(requiredProfileCodes);
    const prevCodeSet = new Set(previousCodes);

    for (const doc of existingReqsSnap?.docs ?? []) {
      const code = String(doc.data().profileCode ?? "");
      if (!nextCodeSet.has(code)) {
        tx.delete(doc.ref);
      }
    }
    for (const code of requiredProfileCodes) {
      if (!prevCodeSet.has(code)) {
        tx.create(db.collection("subjectRequirements").doc(`${subjectId}__${code}`), {
          subjectId,
          profileCode: code,
          createdAtIso: nowIso
        });
      }
    }

    const resultSubject: SubjectWithRequirements = {
      ...storedSubject,
      requiredProfileCodes
    };

    queueAuditEventInTransaction(
      tx,
      buildAuditRecord({
        id: randomUUID(),
        eventType: "subject.upsert",
        entityType: "subject",
        entityId: subjectId,
        actorUid: actor!.uid,
        actorRole: actor!.role,
        correlationId,
        occurredAtIso: nowIso,
        before: previousSubject ? { ...previousSubject, requiredProfileCodes: previousCodes } : null,
        after: { ...resultSubject }
      })
    );

    return { ok: true as const, created: !previousSubject, subject: resultSubject };
  });
}

export async function updateSubjectDefaultHours(
  actor: ActorScope,
  subjectId: string,
  rawInput: unknown,
  correlationId: string = randomUUID()
): Promise<{ ok: true; subject: SubjectWithRequirements } | OfferFailure> {
  const authz = assertActiveActor(actor);
  if (!authz.ok) return authzFailure(authz.reason);

  const parsed = defaultHoursPatchSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      reason: "validation-error",
      error: parsed.error.issues.map((issue) => issue.message).join(" ")
    };
  }

  const defaultHoursHundredths = hoursToHundredths(parsed.data.defaultHours);
  const db = getAdminFirestore();
  const subjectRef = db.collection("subjects").doc(subjectId);

  return db.runTransaction(async (tx) => {
    const subjectSnap = await tx.get(subjectRef);
    if (!subjectSnap.exists) {
      return {
        ok: false as const,
        status: 404 as const,
        reason: "subject-not-found",
        error: "La materia seleccionada no existe."
      };
    }

    const previous = subjectSnap.data() as Omit<SubjectWithRequirements, "requiredProfileCodes">;
    const careerAuthz = canReadCareer(actor, previous.careerId);
    if (!careerAuthz.ok) return authzFailure(careerAuthz.reason);

    const reqsSnap = await tx.get(
      db.collection("subjectRequirements").where("subjectId", "==", subjectId)
    );
    const requiredProfileCodes = reqsSnap.docs
      .map((doc) => String(doc.data().profileCode ?? ""))
      .filter(Boolean)
      .sort();

    const nowIso = new Date().toISOString();
    const updated = {
      ...previous,
      defaultHoursHundredths,
      updatedAtIso: nowIso
    };

    tx.set(subjectRef, updated);
    queueAuditEventInTransaction(
      tx,
      buildAuditRecord({
        id: randomUUID(),
        eventType: "subject.upsert",
        entityType: "subject",
        entityId: subjectId,
        actorUid: actor!.uid,
        actorRole: actor!.role,
        correlationId,
        occurredAtIso: nowIso,
        before: { ...previous, requiredProfileCodes },
        after: { ...updated, requiredProfileCodes }
      })
    );

    return {
      ok: true as const,
      subject: { ...updated, requiredProfileCodes }
    };
  });
}
