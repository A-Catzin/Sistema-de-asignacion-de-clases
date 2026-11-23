import "server-only";

import type { Query, Transaction, WriteBatch } from "firebase-admin/firestore";
import { canManageUsersAndAdminCatalogs, type ActorScope } from "@/domain/auth/authorization-policy";
import type { AuditEntityType, AuditRecord } from "@/domain/audit/audit-catalog";
import { getAdminFirestore } from "@/infrastructure/firebase/admin";

export function queueAuditEventInBatch(batch: WriteBatch, record: AuditRecord): void {
  const ref = getAdminFirestore().collection("auditEvents").doc(record.id);
  batch.create(ref, record);
}

export function queueAuditEventInTransaction(tx: Transaction, record: AuditRecord): void {
  const ref = getAdminFirestore().collection("auditEvents").doc(record.id);
  tx.create(ref, record);
}

export async function listAuditEventsForAdmin(
  actor: ActorScope,
  filter?: Readonly<{
    entityType?: AuditEntityType;
    entityId?: string;
    limit?: number;
  }>
): Promise<
  | { ok: true; events: AuditRecord[] }
  | { ok: false; status: 401 | 403; reason: string; error: string }
> {
  const authz = canManageUsersAndAdminCatalogs(actor);
  if (!authz.ok) {
    return {
      ok: false,
      status: authz.reason === "unauthenticated-or-inactive" ? 401 : 403,
      reason: authz.reason,
      error: "No tienes permiso para consultar la auditoría."
    };
  }

  const clampedLimit = Math.min(200, Math.max(1, Math.trunc(filter?.limit ?? 50)));
  let query: Query = getAdminFirestore().collection("auditEvents");

  if (filter?.entityType) {
    query = query.where("entityType", "==", filter.entityType);
  }
  if (filter?.entityId) {
    query = query.where("entityId", "==", filter.entityId);
  }

  const hasFilters = Boolean(filter?.entityType || filter?.entityId);
  const snapshot = hasFilters
    ? await query.get()
    : await query.orderBy("occurredAtIso", "desc").limit(clampedLimit).get();

  const events = snapshot.docs
    .map((doc) => doc.data() as AuditRecord)
    .sort((a, b) => b.occurredAtIso.localeCompare(a.occurredAtIso))
    .slice(0, clampedLimit);

  return { ok: true, events };
}
