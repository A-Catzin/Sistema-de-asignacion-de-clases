import type { UserRole } from "@/lib/auth/session-policy";

export type AuditEventType =
  | "user.provision"
  | "user.update"
  | "user.bootstrap"
  | "coordinator.scope.replace"
  | "career.upsert"
  | "subject.upsert"
  | "subject.requirements.replace"
  | "teacher_profile.upsert"
  | "teacher.upsert"
  | "teacher.profiles.replace"
  | "classroom.upsert"
  | "schedule_block.upsert"
  | "cycle.upsert"
  | "cycle.activate"
  | "group.create"
  | "group.update"
  | "group.status.change"
  | "group.delete"
  | "group_subject.upsert"
  | "group_subject.delete"
  | "assignment.create"
  | "assignment.update"
  | "assignment.cancel"
  | "cohort.create"
  | "cohort.advance"
  | "cohort.complete"
  | "cohort.history.manual_change";

export const AUDIT_ENTITY_TYPES = [
  "user_profile",
  "coordinator_scope",
  "career",
  "subject",
  "teacher_profile",
  "teacher",
  "classroom",
  "schedule_block",
  "academic_cycle",
  "group",
  "group_subject",
  "assignment",
  "cohort",
  "cohort_history"
] as const;

export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

export type AuditRecord = Readonly<{
  id: string;
  eventType: AuditEventType;
  entityType: AuditEntityType;
  entityId: string;
  actorUid: string;
  actorRole: UserRole;
  correlationId: string;
  occurredAtIso: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}>;

const SENSITIVE_KEY_PATTERN = /password|secret|token|cookie|privatekey/i;

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }
  if (value !== null && typeof value === "object") {
    const clean: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        continue;
      }
      clean[key] = sanitizeValue(entry);
    }
    return clean;
  }
  return value;
}

export function sanitizeAuditSnapshot(
  value: Record<string, unknown> | null
): Record<string, unknown> | null {
  if (value === null) {
    return null;
  }
  return sanitizeValue(value) as Record<string, unknown>;
}

export function buildAuditRecord(input: {
  id: string;
  eventType: AuditEventType;
  entityType: AuditEntityType;
  entityId: string;
  actorUid: string;
  actorRole: UserRole;
  correlationId: string;
  occurredAtIso?: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}): AuditRecord {
  for (const [label, value] of [
    ["id", input.id],
    ["entityId", input.entityId],
    ["actorUid", input.actorUid],
    ["correlationId", input.correlationId]
  ] as const) {
    if (!value.trim()) {
      throw new Error(`Audit record requires a non-empty ${label}.`);
    }
  }

  return {
    id: input.id,
    eventType: input.eventType,
    entityType: input.entityType,
    entityId: input.entityId,
    actorUid: input.actorUid,
    actorRole: input.actorRole,
    correlationId: input.correlationId,
    occurredAtIso: input.occurredAtIso ?? new Date().toISOString(),
    before: sanitizeAuditSnapshot(input.before),
    after: sanitizeAuditSnapshot(input.after)
  };
}
