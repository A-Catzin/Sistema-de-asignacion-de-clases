import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { buildAuditRecord } from "@/domain/audit/audit-catalog";
import { canManageUsersAndAdminCatalogs, type ActorScope } from "@/domain/auth/authorization-policy";
import { queueAuditEventInBatch } from "@/infrastructure/audit/audit-store";
import { getAdminAuth, getAdminFirestore } from "@/infrastructure/firebase/admin";
import type { UserRole } from "@/lib/auth/session-policy";

export const createManagedUserSchema = z.object({
  email: z.string().trim().toLowerCase().email("Ingresa un correo válido."),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres."),
  displayName: z
    .string()
    .trim()
    .min(2, "El nombre debe tener al menos 2 caracteres.")
    .max(160, "El nombre no puede superar 160 caracteres."),
  role: z.enum(["admin", "coordinator"]),
  active: z.boolean().default(true)
});

export const updateManagedUserSchema = z.object({
  email: z.string().trim().toLowerCase().email("Ingresa un correo válido."),
  displayName: z
    .string()
    .trim()
    .min(2, "El nombre debe tener al menos 2 caracteres.")
    .max(160, "El nombre no puede superar 160 caracteres."),
  role: z.enum(["admin", "coordinator"]),
  active: z.boolean(),
  password: z
    .string()
    .optional()
    .transform((value) => (value ? value : undefined))
    .refine((value) => value === undefined || value.length >= 8, {
      message: "La contraseña debe tener al menos 8 caracteres."
    })
});

export const replaceScopeSchema = z.object({
  careerIds: z.array(z.string().trim().min(1)),
  teacherIds: z.array(z.string().trim().min(1))
});

export type ManagedUserSummary = Readonly<{
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  active: boolean;
  coordinatorActive?: boolean;
  careerIds: readonly string[];
  teacherIds: readonly string[];
}>;

export type ProvisioningFailure = {
  ok: false;
  status: 400 | 401 | 403 | 404 | 409;
  reason: string;
  error: string;
};

export function normalizeKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function mapAdminAuthWriteError(error: unknown): ProvisioningFailure {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : "";
  if (code === "auth/email-already-exists") {
    return {
      ok: false,
      status: 409,
      reason: "email-already-exists",
      error: "Ya existe una cuenta registrada con ese correo."
    };
  }
  return {
    ok: false,
    status: 400,
    reason: "auth-provisioning-failed",
    error: "No se pudo guardar el usuario en autenticación."
  };
}

function authzFailure(reason: string): ProvisioningFailure {
  return {
    ok: false,
    status: reason === "unauthenticated-or-inactive" ? 401 : 403,
    reason,
    error: "No tienes permiso para administrar cuentas."
  };
}

async function createAuthAndProfileRecord(
  input: z.infer<typeof createManagedUserSchema>,
  auditOptions: Readonly<{
    correlationId: string;
    actor?: { uid: string; role: UserRole };
    eventType: "user.provision" | "user.bootstrap";
  }>
): Promise<{ ok: true; user: ManagedUserSummary } | ProvisioningFailure> {
  const adminAuth = getAdminAuth();
  const db = getAdminFirestore();

  let createdUid: string;
  try {
    const authUser = await adminAuth.createUser({
      email: input.email,
      password: input.password,
      displayName: input.displayName,
      emailVerified: true,
      disabled: !input.active
    });
    createdUid = authUser.uid;
  } catch (error) {
    return mapAdminAuthWriteError(error);
  }

  const nowIso = new Date().toISOString();
  const batch = db.batch();

  batch.set(db.collection("userProfiles").doc(createdUid), {
    email: input.email,
    displayName: input.displayName,
    role: input.role,
    active: input.active,
    coordinatorActive: input.role === "coordinator" ? input.active : false,
    privilegesUpdatedAtMs: 0,
    createdAtIso: nowIso,
    updatedAtIso: nowIso
  });

  if (input.role === "coordinator") {
    batch.set(db.collection("coordinators").doc(createdUid), {
      profileId: createdUid,
      name: input.displayName,
      normalizedName: normalizeKey(input.displayName),
      active: input.active,
      createdAtIso: nowIso,
      updatedAtIso: nowIso
    });
  }

  queueAuditEventInBatch(
    batch,
    buildAuditRecord({
      id: randomUUID(),
      eventType: auditOptions.eventType,
      entityType: "user_profile",
      entityId: createdUid,
      actorUid: auditOptions.actor?.uid ?? createdUid,
      actorRole: auditOptions.actor?.role ?? input.role,
      correlationId: auditOptions.correlationId,
      occurredAtIso: nowIso,
      before: null,
      after: {
        email: input.email,
        displayName: input.displayName,
        role: input.role,
        active: input.active
      }
    })
  );

  try {
    await batch.commit();
  } catch {
    await adminAuth.deleteUser(createdUid).catch(() => undefined);
    return {
      ok: false,
      status: 400,
      reason: "profile-write-failed",
      error: "No se pudo guardar el perfil del usuario; la cuenta fue revertida."
    };
  }

  return {
    ok: true,
    user: {
      uid: createdUid,
      email: input.email,
      displayName: input.displayName,
      role: input.role,
      active: input.active,
      coordinatorActive: input.role === "coordinator" ? input.active : false,
      careerIds: [],
      teacherIds: []
    }
  };
}

export async function listManagedUsers(
  actor: ActorScope
): Promise<{ ok: true; users: ManagedUserSummary[] } | ProvisioningFailure> {
  const authz = canManageUsersAndAdminCatalogs(actor);
  if (!authz.ok) return authzFailure(authz.reason);

  const db = getAdminFirestore();
  const [profilesSnap, careersSnap, teachersSnap] = await Promise.all([
    db.collection("userProfiles").get(),
    db.collection("coordinatorCareers").get(),
    db.collection("coordinatorTeachers").get()
  ]);

  const careersByCoord = new Map<string, string[]>();
  for (const doc of careersSnap.docs) {
    const coordinatorId = String(doc.data().coordinatorId ?? "");
    const careerId = String(doc.data().careerId ?? "");
    if (!coordinatorId || !careerId) continue;
    const list = careersByCoord.get(coordinatorId) ?? [];
    list.push(careerId);
    careersByCoord.set(coordinatorId, list);
  }

  const teachersByCoord = new Map<string, string[]>();
  for (const doc of teachersSnap.docs) {
    const coordinatorId = String(doc.data().coordinatorId ?? "");
    const teacherId = String(doc.data().teacherId ?? "");
    if (!coordinatorId || !teacherId) continue;
    const list = teachersByCoord.get(coordinatorId) ?? [];
    list.push(teacherId);
    teachersByCoord.set(coordinatorId, list);
  }

  const users: ManagedUserSummary[] = profilesSnap.docs
    .map((doc) => {
      const data = doc.data();
      const role: UserRole = data.role === "admin" ? "admin" : "coordinator";
      return {
        uid: doc.id,
        email: String(data.email ?? ""),
        displayName: String(data.displayName ?? ""),
        role,
        active: data.active === true,
        coordinatorActive: role === "coordinator" ? data.coordinatorActive === true : undefined,
        careerIds: careersByCoord.get(doc.id) ?? [],
        teacherIds: teachersByCoord.get(doc.id) ?? []
      };
    })
    .sort((a, b) => a.email.localeCompare(b.email));

  return { ok: true, users };
}

export async function createManagedUser(
  actor: ActorScope,
  rawInput: unknown,
  correlationId: string = randomUUID()
): Promise<{ ok: true; user: ManagedUserSummary } | ProvisioningFailure> {
  const authz = canManageUsersAndAdminCatalogs(actor);
  if (!authz.ok) return authzFailure(authz.reason);

  const parsed = createManagedUserSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      reason: "validation-error",
      error: parsed.error.issues.map((issue) => issue.message).join(" ")
    };
  }

  return createAuthAndProfileRecord(parsed.data, {
    correlationId,
    actor: { uid: actor!.uid, role: actor!.role },
    eventType: "user.provision"
  });
}

export async function updateManagedUser(
  actor: ActorScope,
  targetUid: string,
  rawInput: unknown,
  correlationId: string = randomUUID()
): Promise<{ ok: true; user: ManagedUserSummary } | ProvisioningFailure> {
  const authz = canManageUsersAndAdminCatalogs(actor);
  if (!authz.ok) return authzFailure(authz.reason);

  const parsed = updateManagedUserSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      reason: "validation-error",
      error: parsed.error.issues.map((issue) => issue.message).join(" ")
    };
  }

  if (targetUid === actor!.uid && (!parsed.data.active || parsed.data.role !== "admin")) {
    return {
      ok: false,
      status: 400,
      reason: "cannot-lock-out-self",
      error: "No puedes desactivar ni quitar privilegios a tu propia cuenta de administrador."
    };
  }

  const db = getAdminFirestore();
  const adminAuth = getAdminAuth();
  const profileRef = db.collection("userProfiles").doc(targetUid);
  const coordRef = db.collection("coordinators").doc(targetUid);

  const [previousProfileSnap, previousCoordSnap] = await Promise.all([
    profileRef.get(),
    coordRef.get()
  ]);

  if (!previousProfileSnap.exists) {
    return {
      ok: false,
      status: 404,
      reason: "user-not-found",
      error: "No se encontró el perfil del usuario."
    };
  }

  const previousProfile = previousProfileSnap.data()!;
  const privilegesChanged =
    previousProfile.role !== parsed.data.role ||
    previousProfile.active !== parsed.data.active ||
    Boolean(parsed.data.password);
  const nowIso = new Date().toISOString();
  const nowMs = Date.now();
  const auditId = randomUUID();

  const batch = db.batch();
  batch.set(
    profileRef,
    {
      email: parsed.data.email,
      displayName: parsed.data.displayName,
      role: parsed.data.role,
      active: parsed.data.active,
      coordinatorActive: parsed.data.role === "coordinator" ? parsed.data.active : false,
      ...(privilegesChanged ? { privilegesUpdatedAtMs: nowMs } : {}),
      updatedAtIso: nowIso
    },
    { merge: true }
  );

  if (parsed.data.role === "coordinator") {
    batch.set(
      coordRef,
      {
        profileId: targetUid,
        name: parsed.data.displayName,
        normalizedName: normalizeKey(parsed.data.displayName),
        active: parsed.data.active,
        updatedAtIso: nowIso
      },
      { merge: true }
    );
  } else if (previousCoordSnap.exists) {
    batch.set(
      coordRef,
      {
        active: false,
        updatedAtIso: nowIso
      },
      { merge: true }
    );
  }

  queueAuditEventInBatch(
    batch,
    buildAuditRecord({
      id: auditId,
      eventType: "user.update",
      entityType: "user_profile",
      entityId: targetUid,
      actorUid: actor!.uid,
      actorRole: actor!.role,
      correlationId,
      occurredAtIso: nowIso,
      before: {
        email: previousProfile.email ?? null,
        displayName: previousProfile.displayName ?? null,
        role: previousProfile.role ?? null,
        active: previousProfile.active === true
      },
      after: {
        email: parsed.data.email,
        displayName: parsed.data.displayName,
        role: parsed.data.role,
        active: parsed.data.active,
        passwordChanged: Boolean(parsed.data.password)
      }
    })
  );

  await batch.commit();

  try {
    await adminAuth.updateUser(targetUid, {
      email: parsed.data.email,
      displayName: parsed.data.displayName,
      disabled: !parsed.data.active,
      ...(parsed.data.password ? { password: parsed.data.password } : {})
    });
  } catch (error) {
    const rollbackBatch = db.batch();
    rollbackBatch.set(profileRef, previousProfile);
    if (previousCoordSnap.exists) {
      rollbackBatch.set(coordRef, previousCoordSnap.data()!);
    } else {
      rollbackBatch.delete(coordRef);
    }
    rollbackBatch.delete(db.collection("auditEvents").doc(auditId));
    await rollbackBatch.commit().catch(() => undefined);
    return mapAdminAuthWriteError(error);
  }

  if (privilegesChanged) {
    await adminAuth.revokeRefreshTokens(targetUid);
  }

  return {
    ok: true,
    user: {
      uid: targetUid,
      email: parsed.data.email,
      displayName: parsed.data.displayName,
      role: parsed.data.role,
      active: parsed.data.active,
      coordinatorActive: parsed.data.role === "coordinator" ? parsed.data.active : false,
      careerIds: [],
      teacherIds: []
    }
  };
}

export async function replaceCoordinatorScope(
  actor: ActorScope,
  coordinatorUid: string,
  rawInput: unknown,
  correlationId: string = randomUUID()
): Promise<
  | { ok: true; scope: { coordinatorUid: string; careerIds: string[]; teacherIds: string[] } }
  | ProvisioningFailure
> {
  const authz = canManageUsersAndAdminCatalogs(actor);
  if (!authz.ok) return authzFailure(authz.reason);

  const parsed = replaceScopeSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      reason: "validation-error",
      error: "Ámbito de coordinación inválido."
    };
  }

  const careerIds = [...new Set(parsed.data.careerIds)];
  const teacherIds = [...new Set(parsed.data.teacherIds)];
  const db = getAdminFirestore();
  const profileRef = db.collection("userProfiles").doc(coordinatorUid);
  const profileSnap = await profileRef.get();

  if (!profileSnap.exists) {
    return {
      ok: false,
      status: 404,
      reason: "user-not-found",
      error: "No se encontró el perfil del coordinador."
    };
  }
  if (profileSnap.data()?.role !== "coordinator") {
    return {
      ok: false,
      status: 400,
      reason: "not-a-coordinator",
      error: "Solo se puede asignar ámbito a usuarios con rol coordinador."
    };
  }

  const [existingCareers, existingTeachers] = await Promise.all([
    db.collection("coordinatorCareers").where("coordinatorId", "==", coordinatorUid).get(),
    db.collection("coordinatorTeachers").where("coordinatorId", "==", coordinatorUid).get()
  ]);

  const previousCareerIds = existingCareers.docs
    .map((doc) => String(doc.data().careerId ?? ""))
    .filter(Boolean);
  const previousTeacherIds = existingTeachers.docs
    .map((doc) => String(doc.data().teacherId ?? ""))
    .filter(Boolean);

  const nowIso = new Date().toISOString();
  const batch = db.batch();

  for (const doc of existingCareers.docs) batch.delete(doc.ref);
  for (const doc of existingTeachers.docs) batch.delete(doc.ref);

  for (const careerId of careerIds) {
    batch.set(db.collection("coordinatorCareers").doc(`${coordinatorUid}__${careerId}`), {
      coordinatorId: coordinatorUid,
      careerId,
      createdAtIso: nowIso
    });
  }
  for (const teacherId of teacherIds) {
    batch.set(db.collection("coordinatorTeachers").doc(`${coordinatorUid}__${teacherId}`), {
      coordinatorId: coordinatorUid,
      teacherId,
      createdAtIso: nowIso
    });
  }

  batch.set(
    profileRef,
    {
      privilegesUpdatedAtMs: Date.now(),
      updatedAtIso: nowIso
    },
    { merge: true }
  );

  queueAuditEventInBatch(
    batch,
    buildAuditRecord({
      id: randomUUID(),
      eventType: "coordinator.scope.replace",
      entityType: "coordinator_scope",
      entityId: coordinatorUid,
      actorUid: actor!.uid,
      actorRole: actor!.role,
      correlationId,
      occurredAtIso: nowIso,
      before: {
        careerIds: previousCareerIds,
        teacherIds: previousTeacherIds
      },
      after: {
        careerIds,
        teacherIds
      }
    })
  );

  await batch.commit();

  return {
    ok: true,
    scope: { coordinatorUid, careerIds, teacherIds }
  };
}

export async function bootstrapInitialAdmin(
  rawInput: unknown,
  correlationId: string = randomUUID()
): Promise<{ ok: true; user: ManagedUserSummary } | ProvisioningFailure> {
  const parsed = createManagedUserSchema
    .omit({ role: true, active: true })
    .safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      reason: "validation-error",
      error: parsed.error.issues.map((issue) => issue.message).join(" ")
    };
  }

  const db = getAdminFirestore();
  const lockRef = db.collection("systemBootstrap").doc("initialAdmin");

  try {
    await lockRef.create({
      status: "pending",
      createdAtIso: new Date().toISOString()
    });
  } catch {
    return {
      ok: false,
      status: 409,
      reason: "bootstrap-already-completed",
      error: "El administrador inicial ya fue configurado anteriormente."
    };
  }

  const result = await createAuthAndProfileRecord(
    {
      ...parsed.data,
      role: "admin",
      active: true
    },
    {
      correlationId,
      eventType: "user.bootstrap"
    }
  );

  if (!result.ok) {
    await lockRef.delete().catch(() => undefined);
    return result;
  }

  await lockRef.set({
    status: "completed",
    adminUid: result.user.uid,
    completedAtIso: new Date().toISOString()
  });

  return result;
}
