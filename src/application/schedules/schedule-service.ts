import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { normalizeTextKey } from "@/domain/academic/academic-offer";
import { buildAuditRecord } from "@/domain/audit/audit-catalog";
import {
  assertActiveActor,
  canManageUsersAndAdminCatalogs,
  validateModalityShift,
  type ActorScope,
  type Modality,
  type Shift
} from "@/domain/auth/authorization-policy";
import {
  blocksConflictInTemplate,
  buildDefaultBlockLabel,
  isValidModuleForModality,
  isValidTemplateCode,
  normalizeTemplateCode,
  parseHhMmToMinutes,
  type Classroom,
  type ScheduleBlock,
  type ScheduleModule,
  type ScheduleTemplate,
  type Weekday
} from "@/domain/schedules/schedule-catalog";
import { queueAuditEventInTransaction } from "@/infrastructure/audit/audit-store";
import { getAdminFirestore } from "@/infrastructure/firebase/admin";

export type ScheduleFailure = {
  ok: false;
  status: 400 | 401 | 403 | 404 | 409;
  reason: string;
  error: string;
};

const modalityEnum = z.enum([
  "escolarizado",
  "modular",
  "virtual_modular",
  "maestrias",
  "sabatino"
]);
const shiftEnum = z.enum(["matutino", "vespertino"]);
const hhmmSchema = z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Usa formato HH:MM.");

const classroomInputSchema = z.object({
  id: z.string().trim().min(1).optional(),
  name: z
    .string()
    .trim()
    .min(2, "Escribe el nombre del aula.")
    .max(100, "El nombre del aula no puede superar 100 caracteres."),
  kind: z
    .string()
    .trim()
    .max(60, "El tipo de aula no puede superar 60 caracteres.")
    .optional()
    .or(z.literal(""))
    .nullable(),
  capacity: z.preprocess(
    (val) => (val === "" || val === null || val === undefined ? null : val),
    z.coerce
      .number()
      .int("La capacidad debe ser un número entero.")
      .min(0, "La capacidad no puede ser negativa.")
      .max(5000, "La capacidad no puede superar 5000.")
      .nullable()
  ),
  active: z.boolean().default(true)
});

const templateInputSchema = z.object({
  id: z.string().trim().min(1).optional(),
  code: z.string().trim().min(2, "Escribe el código de la plantilla."),
  label: z
    .string()
    .trim()
    .min(2, "Escribe la descripción de la plantilla.")
    .max(120, "La descripción no puede superar 120 caracteres."),
  modality: modalityEnum,
  shift: shiftEnum,
  startsAt: hhmmSchema,
  endsAt: hhmmSchema,
  active: z.boolean().default(true)
});

const scheduleBlockInputSchema = z.object({
  id: z.string().trim().min(1).optional(),
  templateId: z.string().trim().min(1, "Selecciona una plantilla horaria."),
  dayOfWeek: z.coerce
    .number()
    .int("El día debe ser entero.")
    .min(1, "El día mínimo es Lunes (1).")
    .max(6, "El día máximo es Sábado (6)."),
  startsAt: hhmmSchema,
  endsAt: hhmmSchema,
  module: z.coerce
    .number()
    .int("El módulo debe ser entero.")
    .min(0, "Módulo inválido.")
    .max(2, "Módulo inválido.")
    .default(0),
  label: z.string().trim().max(120).optional().or(z.literal("")),
  position: z.coerce.number().int().min(0).max(10000).optional(),
  active: z.boolean().default(true),
  isCustom: z.boolean().default(false)
});

const blockActivePatchSchema = z.object({
  active: z.boolean()
});

function authzFailure(reason: string): ScheduleFailure {
  return {
    ok: false,
    status: reason === "unauthenticated-or-inactive" ? 401 : 403,
    reason,
    error: "No tienes permiso para realizar esta operación sobre recursos horarios."
  };
}

function classroomNameKey(normalizedName: string): string {
  return Buffer.from(JSON.stringify([normalizedName])).toString("base64url");
}

function blockSlotKey(
  templateId: string,
  dayOfWeek: number,
  startMinute: number,
  endMinute: number,
  moduleValue: number,
  ownerScope: string
): string {
  return Buffer.from(
    JSON.stringify([templateId, dayOfWeek, startMinute, endMinute, moduleValue, ownerScope])
  ).toString("base64url");
}

export async function listClassrooms(
  actor: ActorScope,
  options?: Readonly<{ includeInactive?: boolean }>
): Promise<{ ok: true; classrooms: Classroom[] } | ScheduleFailure> {
  const authz = assertActiveActor(actor);
  if (!authz.ok) return authzFailure(authz.reason);

  const includeInactive = options?.includeInactive ?? true;
  const snapshot = await getAdminFirestore().collection("classrooms").get();
  const classrooms = snapshot.docs
    .map((doc) => doc.data() as Classroom)
    .filter((room) => includeInactive || room.active)
    .sort((a, b) => a.name.localeCompare(b.name));

  return { ok: true, classrooms };
}

export async function upsertClassroom(
  actor: ActorScope,
  rawInput: unknown,
  correlationId: string = randomUUID()
): Promise<{ ok: true; created: boolean; classroom: Classroom } | ScheduleFailure> {
  const authz = canManageUsersAndAdminCatalogs(actor);
  if (!authz.ok) return authzFailure(authz.reason);

  const parsed = classroomInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      reason: "validation-error",
      error: parsed.error.issues.map((issue) => issue.message).join(" ")
    };
  }

  const normalizedName = normalizeTextKey(parsed.data.name);
  const classroomId = parsed.data.id ?? randomUUID();
  const newNameLockId = classroomNameKey(normalizedName);
  const db = getAdminFirestore();
  const classroomRef = db.collection("classrooms").doc(classroomId);
  const newNameLockRef = db.collection("classroomNames").doc(newNameLockId);

  return db.runTransaction(async (tx) => {
    const existingSnap = parsed.data.id ? await tx.get(classroomRef) : null;
    if (parsed.data.id && !existingSnap?.exists) {
      return {
        ok: false as const,
        status: 404 as const,
        reason: "classroom-not-found",
        error: "El aula seleccionada no existe."
      };
    }

    const nameLockSnap = await tx.get(newNameLockRef);
    if (nameLockSnap.exists && nameLockSnap.data()?.classroomId !== classroomId) {
      return {
        ok: false as const,
        status: 409 as const,
        reason: "classroom-already-exists",
        error: "Ya existe otra aula registrada con ese nombre."
      };
    }

    const previous = existingSnap?.exists ? (existingSnap.data() as Classroom) : null;
    const nowIso = new Date().toISOString();
    const classroom: Classroom = {
      id: classroomId,
      name: parsed.data.name,
      normalizedName,
      kind: parsed.data.kind?.trim() || null,
      capacity: parsed.data.capacity,
      active: parsed.data.active,
      createdAtIso: previous?.createdAtIso ?? nowIso,
      updatedAtIso: nowIso
    };

    if (previous) {
      const oldLockId = classroomNameKey(previous.normalizedName);
      if (oldLockId !== newNameLockId) {
        tx.delete(db.collection("classroomNames").doc(oldLockId));
      }
    }

    tx.set(newNameLockRef, { classroomId });
    tx.set(classroomRef, classroom);
    queueAuditEventInTransaction(
      tx,
      buildAuditRecord({
        id: randomUUID(),
        eventType: "classroom.upsert",
        entityType: "classroom",
        entityId: classroomId,
        actorUid: actor!.uid,
        actorRole: actor!.role,
        correlationId,
        occurredAtIso: nowIso,
        before: previous ? { ...previous } : null,
        after: { ...classroom }
      })
    );

    return { ok: true as const, created: !previous, classroom };
  });
}

export async function listScheduleTemplates(
  actor: ActorScope,
  options?: Readonly<{ includeInactive?: boolean }>
): Promise<{ ok: true; templates: ScheduleTemplate[] } | ScheduleFailure> {
  const authz = assertActiveActor(actor);
  if (!authz.ok) return authzFailure(authz.reason);

  const includeInactive = options?.includeInactive ?? true;
  const snapshot = await getAdminFirestore().collection("scheduleTemplates").get();
  const templates = snapshot.docs
    .map((doc) => doc.data() as ScheduleTemplate)
    .filter((tpl) => includeInactive || tpl.active)
    .sort((a, b) => a.modality.localeCompare(b.modality) || a.shift.localeCompare(b.shift));

  return { ok: true, templates };
}

export async function upsertScheduleTemplate(
  actor: ActorScope,
  rawInput: unknown,
  correlationId: string = randomUUID()
): Promise<{ ok: true; created: boolean; template: ScheduleTemplate } | ScheduleFailure> {
  const authz = canManageUsersAndAdminCatalogs(actor);
  if (!authz.ok) return authzFailure(authz.reason);

  const parsed = templateInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      reason: "validation-error",
      error: parsed.error.issues.map((issue) => issue.message).join(" ")
    };
  }

  if (!isValidTemplateCode(parsed.data.code)) {
    return {
      ok: false,
      status: 400,
      reason: "invalid-template-code",
      error: "El código de plantilla debe usar letras, números, guion o guion bajo (2–48 caracteres)."
    };
  }

  if (!validateModalityShift(parsed.data.modality, parsed.data.shift)) {
    return {
      ok: false,
      status: 400,
      reason: "invalid-modality-shift",
      error: "La combinación de modalidad y turno no está permitida."
    };
  }

  const startMinute = parseHhMmToMinutes(parsed.data.startsAt);
  const endMinute = parseHhMmToMinutes(parsed.data.endsAt);
  if (endMinute <= startMinute) {
    return {
      ok: false,
      status: 400,
      reason: "invalid-time-range",
      error: "La hora final de la plantilla debe ser posterior a la hora inicial."
    };
  }

  const code = normalizeTemplateCode(parsed.data.code);
  const templateId = parsed.data.id ?? randomUUID();
  const modalityShiftKey = `${parsed.data.modality}__${parsed.data.shift}`;

  const db = getAdminFirestore();
  const templateRef = db.collection("scheduleTemplates").doc(templateId);
  const codeLockRef = db.collection("templateCodes").doc(code);
  const pairLockRef = db.collection("templateModalityShifts").doc(modalityShiftKey);

  return db.runTransaction(async (tx) => {
    const existingSnap = parsed.data.id ? await tx.get(templateRef) : null;
    if (parsed.data.id && !existingSnap?.exists) {
      return {
        ok: false as const,
        status: 404 as const,
        reason: "template-not-found",
        error: "La plantilla seleccionada no existe."
      };
    }

    const [codeLockSnap, pairLockSnap] = await Promise.all([
      tx.get(codeLockRef),
      tx.get(pairLockRef)
    ]);

    if (codeLockSnap.exists && codeLockSnap.data()?.templateId !== templateId) {
      return {
        ok: false as const,
        status: 409 as const,
        reason: "template-code-exists",
        error: "Ya existe otra plantilla registrada con ese código."
      };
    }
    if (pairLockSnap.exists && pairLockSnap.data()?.templateId !== templateId) {
      return {
        ok: false as const,
        status: 409 as const,
        reason: "template-modality-shift-exists",
        error: "Ya existe una plantilla registrada para esa modalidad y turno."
      };
    }

    const previous = existingSnap?.exists ? (existingSnap.data() as ScheduleTemplate) : null;
    const nowIso = new Date().toISOString();
    const template: ScheduleTemplate = {
      id: templateId,
      code,
      label: parsed.data.label,
      modality: parsed.data.modality as Modality,
      shift: parsed.data.shift as Shift,
      startsAt: parsed.data.startsAt,
      endsAt: parsed.data.endsAt,
      startMinute,
      endMinute,
      active: parsed.data.active,
      createdAtIso: previous?.createdAtIso ?? nowIso,
      updatedAtIso: nowIso
    };

    if (previous) {
      if (previous.code !== code) {
        tx.delete(db.collection("templateCodes").doc(previous.code));
      }
      const oldPairKey = `${previous.modality}__${previous.shift}`;
      if (oldPairKey !== modalityShiftKey) {
        tx.delete(db.collection("templateModalityShifts").doc(oldPairKey));
      }
    }

    tx.set(codeLockRef, { templateId });
    tx.set(pairLockRef, { templateId });
    tx.set(templateRef, template);

    queueAuditEventInTransaction(
      tx,
      buildAuditRecord({
        id: randomUUID(),
        eventType: "schedule_template.upsert",
        entityType: "schedule_template",
        entityId: templateId,
        actorUid: actor!.uid,
        actorRole: actor!.role,
        correlationId,
        occurredAtIso: nowIso,
        before: previous ? { ...previous } : null,
        after: { ...template }
      })
    );

    return { ok: true as const, created: !previous, template };
  });
}

export async function listScheduleBlocks(
  actor: ActorScope,
  filter?: Readonly<{ templateId?: string; includeInactive?: boolean }>
): Promise<{ ok: true; blocks: ScheduleBlock[] } | ScheduleFailure> {
  const authz = assertActiveActor(actor);
  if (!authz.ok) return authzFailure(authz.reason);

  const includeInactive = filter?.includeInactive ?? true;
  const db = getAdminFirestore();
  const query = filter?.templateId
    ? db.collection("scheduleBlocks").where("templateId", "==", filter.templateId)
    : db.collection("scheduleBlocks");

  const snapshot = await query.get();
  const blocks = snapshot.docs
    .map((doc) => doc.data() as ScheduleBlock)
    .filter((block) => {
      if (!includeInactive && !block.active) return false;
      if (block.isCustom && actor!.role !== "admin" && block.createdByUid !== actor!.uid) {
        return false;
      }
      return true;
    })
    .sort(
      (a, b) =>
        a.dayOfWeek - b.dayOfWeek ||
        a.module - b.module ||
        a.startMinute - b.startMinute ||
        a.position - b.position
    );

  return { ok: true, blocks };
}

export async function upsertBaseScheduleBlock(
  actor: ActorScope,
  rawInput: unknown,
  correlationId: string = randomUUID()
): Promise<{ ok: true; created: boolean; block: ScheduleBlock } | ScheduleFailure> {
  const authz = canManageUsersAndAdminCatalogs(actor);
  if (!authz.ok) return authzFailure(authz.reason);

  const parsed = scheduleBlockInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      reason: "validation-error",
      error: parsed.error.issues.map((issue) => issue.message).join(" ")
    };
  }

  const startMinute = parseHhMmToMinutes(parsed.data.startsAt);
  const endMinute = parseHhMmToMinutes(parsed.data.endsAt);
  if (endMinute <= startMinute) {
    return {
      ok: false,
      status: 400,
      reason: "invalid-time-range",
      error: "La hora final del bloque debe ser posterior a la hora inicial."
    };
  }

  const blockId = parsed.data.id ?? randomUUID();
  const db = getAdminFirestore();
  const templateRef = db.collection("scheduleTemplates").doc(parsed.data.templateId);
  const blockRef = db.collection("scheduleBlocks").doc(blockId);

  return db.runTransaction(async (tx) => {
    const [templateSnap, existingSnap, templateBlocksSnap] = await Promise.all([
      tx.get(templateRef),
      parsed.data.id ? tx.get(blockRef) : Promise.resolve(null),
      tx.get(db.collection("scheduleBlocks").where("templateId", "==", parsed.data.templateId))
    ]);

    if (!templateSnap.exists) {
      return {
        ok: false as const,
        status: 404 as const,
        reason: "template-not-found",
        error: "La plantilla horaria seleccionada no existe."
      };
    }
    if (parsed.data.id && !existingSnap?.exists) {
      return {
        ok: false as const,
        status: 404 as const,
        reason: "block-not-found",
        error: "El bloque horario seleccionado no existe."
      };
    }

    const template = templateSnap.data() as ScheduleTemplate;
    if (!isValidModuleForModality(template.modality, parsed.data.module)) {
      return {
        ok: false as const,
        status: 400 as const,
        reason: "invalid-module-for-modality",
        error:
          template.modality === "sabatino" || template.modality === "virtual_modular"
            ? "Los bloques sabatinos y virtuales modulares deben usar Módulo 1 o Módulo 2."
            : "Esta modalidad debe usar módulo 0."
      };
    }

    if (startMinute < template.startMinute || endMinute > template.endMinute) {
      return {
        ok: false as const,
        status: 400 as const,
        reason: "block-outside-template-window",
        error: `El bloque debe estar dentro del rango de la plantilla (${template.startsAt}–${template.endsAt}).`
      };
    }

    const moduleValue = parsed.data.module as ScheduleModule;
    const dayOfWeek = parsed.data.dayOfWeek as Weekday;
    const newSlotKey = blockSlotKey(
      template.id,
      dayOfWeek,
      startMinute,
      endMinute,
      moduleValue,
      "base"
    );
    const slotLockRef = db.collection("scheduleBlockSlots").doc(newSlotKey);
    const slotLockSnap = await tx.get(slotLockRef);

    if (slotLockSnap.exists && slotLockSnap.data()?.blockId !== blockId) {
      return {
        ok: false as const,
        status: 409 as const,
        reason: "block-already-exists",
        error: "Ya existe otro bloque base con ese día, horario y módulo en esta plantilla."
      };
    }

    if (parsed.data.active) {
      const conflictingBaseBlock = templateBlocksSnap.docs
        .map((doc) => doc.data() as ScheduleBlock)
        .some(
          (other) =>
            other.id !== blockId &&
            other.active &&
            !other.isCustom &&
            blocksConflictInTemplate(
              { dayOfWeek, startMinute, endMinute, module: moduleValue },
              other
            )
        );
      if (conflictingBaseBlock) {
        return {
          ok: false as const,
          status: 409 as const,
          reason: "block-overlap",
          error: "El bloque se traslapa con otro bloque base activo en el mismo día y módulo."
        };
      }
    }

    const previous = existingSnap?.exists ? (existingSnap.data() as ScheduleBlock) : null;
    const nowIso = new Date().toISOString();
    const label =
      parsed.data.label?.trim() ||
      buildDefaultBlockLabel({
        dayOfWeek,
        startsAt: parsed.data.startsAt,
        endsAt: parsed.data.endsAt,
        module: moduleValue,
        isCustom: false
      });

    const block: ScheduleBlock = {
      id: blockId,
      templateId: template.id,
      modality: template.modality,
      shift: template.shift,
      dayOfWeek,
      startsAt: parsed.data.startsAt,
      endsAt: parsed.data.endsAt,
      startMinute,
      endMinute,
      module: moduleValue,
      label,
      position: parsed.data.position ?? startMinute,
      active: parsed.data.active,
      isCustom: false,
      createdByUid: null,
      createdAtIso: previous?.createdAtIso ?? nowIso,
      updatedAtIso: nowIso
    };

    if (previous) {
      const oldSlotKey = blockSlotKey(
        previous.templateId,
        previous.dayOfWeek,
        previous.startMinute,
        previous.endMinute,
        previous.module,
        "base"
      );
      if (oldSlotKey !== newSlotKey) {
        tx.delete(db.collection("scheduleBlockSlots").doc(oldSlotKey));
      }
    }

    tx.set(slotLockRef, { blockId });
    tx.set(blockRef, block);

    queueAuditEventInTransaction(
      tx,
      buildAuditRecord({
        id: randomUUID(),
        eventType: "schedule_block.upsert",
        entityType: "schedule_block",
        entityId: blockId,
        actorUid: actor!.uid,
        actorRole: actor!.role,
        correlationId,
        occurredAtIso: nowIso,
        before: previous ? { ...previous } : null,
        after: { ...block }
      })
    );

    return { ok: true as const, created: !previous, block };
  });
}

export async function createCustomScheduleBlock(
  actor: ActorScope,
  rawInput: unknown,
  correlationId: string = randomUUID()
): Promise<{ ok: true; block: ScheduleBlock } | ScheduleFailure> {
  const authz = assertActiveActor(actor);
  if (!authz.ok) return authzFailure(authz.reason);

  const parsed = scheduleBlockInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      reason: "validation-error",
      error: parsed.error.issues.map((issue) => issue.message).join(" ")
    };
  }

  const startMinute = parseHhMmToMinutes(parsed.data.startsAt);
  const endMinute = parseHhMmToMinutes(parsed.data.endsAt);
  if (endMinute <= startMinute) {
    return {
      ok: false,
      status: 400,
      reason: "invalid-time-range",
      error: "La hora final debe ser posterior a la hora inicial."
    };
  }

  const blockId = randomUUID();
  const db = getAdminFirestore();
  const templateRef = db.collection("scheduleTemplates").doc(parsed.data.templateId);
  const blockRef = db.collection("scheduleBlocks").doc(blockId);

  return db.runTransaction(async (tx) => {
    const [templateSnap, templateBlocksSnap] = await Promise.all([
      tx.get(templateRef),
      tx.get(db.collection("scheduleBlocks").where("templateId", "==", parsed.data.templateId))
    ]);

    if (!templateSnap.exists) {
      return {
        ok: false as const,
        status: 404 as const,
        reason: "template-not-found",
        error: "La plantilla horaria seleccionada no existe."
      };
    }

    const template = templateSnap.data() as ScheduleTemplate;
    if (!template.active) {
      return {
        ok: false as const,
        status: 409 as const,
        reason: "template-inactive",
        error: "No se pueden agregar bloques personalizados a una plantilla inactiva."
      };
    }

    if (!isValidModuleForModality(template.modality, parsed.data.module)) {
      return {
        ok: false as const,
        status: 400 as const,
        reason: "invalid-module-for-modality",
        error:
          template.modality === "sabatino" || template.modality === "virtual_modular"
            ? "Selecciona Módulo 1 o Módulo 2 para este bloque personalizado."
            : "Esta modalidad utiliza módulo 0."
      };
    }

    if (startMinute < template.startMinute || endMinute > template.endMinute) {
      return {
        ok: false as const,
        status: 400 as const,
        reason: "block-outside-template-window",
        error: `El bloque personalizado debe estar dentro del horario de la plantilla (${template.startsAt}–${template.endsAt}).`
      };
    }

    const moduleValue = parsed.data.module as ScheduleModule;
    const dayOfWeek = parsed.data.dayOfWeek as Weekday;
    const slotKey = blockSlotKey(
      template.id,
      dayOfWeek,
      startMinute,
      endMinute,
      moduleValue,
      actor!.uid
    );
    const slotLockRef = db.collection("scheduleBlockSlots").doc(slotKey);
    const slotLockSnap = await tx.get(slotLockRef);
    if (slotLockSnap.exists) {
      return {
        ok: false as const,
        status: 409 as const,
        reason: "block-already-exists",
        error: "Ya tienes un bloque personalizado registrado en ese día, horario y módulo."
      };
    }

    const hasConflict = templateBlocksSnap.docs
      .map((doc) => doc.data() as ScheduleBlock)
      .some(
        (other) =>
          other.active &&
          (!other.isCustom || other.createdByUid === actor!.uid) &&
          blocksConflictInTemplate(
            { dayOfWeek, startMinute, endMinute, module: moduleValue },
            other
          )
      );

    if (hasConflict) {
      return {
        ok: false as const,
        status: 409 as const,
        reason: "block-overlap",
        error: "Ya existe un bloque activo en ese día y módulo que se traslapa con el horario solicitado."
      };
    }

    const nowIso = new Date().toISOString();
    const label =
      parsed.data.label?.trim() ||
      buildDefaultBlockLabel({
        dayOfWeek,
        startsAt: parsed.data.startsAt,
        endsAt: parsed.data.endsAt,
        module: moduleValue,
        isCustom: true
      });

    const block: ScheduleBlock = {
      id: blockId,
      templateId: template.id,
      modality: template.modality,
      shift: template.shift,
      dayOfWeek,
      startsAt: parsed.data.startsAt,
      endsAt: parsed.data.endsAt,
      startMinute,
      endMinute,
      module: moduleValue,
      label,
      position: startMinute,
      active: true,
      isCustom: true,
      createdByUid: actor!.uid,
      createdAtIso: nowIso,
      updatedAtIso: nowIso
    };

    tx.set(slotLockRef, { blockId });
    tx.set(blockRef, block);

    queueAuditEventInTransaction(
      tx,
      buildAuditRecord({
        id: randomUUID(),
        eventType: "schedule_block.upsert",
        entityType: "schedule_block",
        entityId: blockId,
        actorUid: actor!.uid,
        actorRole: actor!.role,
        correlationId,
        occurredAtIso: nowIso,
        before: null,
        after: { ...block }
      })
    );

    return { ok: true as const, block };
  });
}

export async function setScheduleBlockActive(
  actor: ActorScope,
  blockId: string,
  rawInput: unknown,
  correlationId: string = randomUUID()
): Promise<{ ok: true; block: ScheduleBlock } | ScheduleFailure> {
  const authz = assertActiveActor(actor);
  if (!authz.ok) return authzFailure(authz.reason);

  const parsed = blockActivePatchSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      reason: "validation-error",
      error: "Indica el estado activo del bloque."
    };
  }

  const db = getAdminFirestore();
  const blockRef = db.collection("scheduleBlocks").doc(blockId);

  return db.runTransaction(async (tx) => {
    const blockSnap = await tx.get(blockRef);
    if (!blockSnap.exists) {
      return {
        ok: false as const,
        status: 404 as const,
        reason: "block-not-found",
        error: "El bloque horario seleccionado no existe."
      };
    }

    const previous = blockSnap.data() as ScheduleBlock;
    if (actor!.role !== "admin") {
      if (!previous.isCustom) {
        return {
          ok: false as const,
          status: 403 as const,
          reason: "forbidden-role",
          error: "Solo el administrador puede modificar bloques base."
        };
      }
      if (previous.createdByUid !== actor!.uid) {
        return {
          ok: false as const,
          status: 403 as const,
          reason: "forbidden-scope",
          error: "Solo puedes modificar bloques personalizados creados por tu usuario."
        };
      }
    }

    // Deactivating preserves historical references (RN-05) without deleting the record.
    const nowIso = new Date().toISOString();
    const updated: ScheduleBlock = {
      ...previous,
      active: parsed.data.active,
      updatedAtIso: nowIso
    };

    tx.set(blockRef, updated);
    queueAuditEventInTransaction(
      tx,
      buildAuditRecord({
        id: randomUUID(),
        eventType: "schedule_block.upsert",
        entityType: "schedule_block",
        entityId: blockId,
        actorUid: actor!.uid,
        actorRole: actor!.role,
        correlationId,
        occurredAtIso: nowIso,
        before: { ...previous },
        after: { ...updated }
      })
    );

    return { ok: true as const, block: updated };
  });
}
