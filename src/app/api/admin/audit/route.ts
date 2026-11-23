import { NextResponse, type NextRequest } from "next/server";
import { AUDIT_ENTITY_TYPES, type AuditEntityType } from "@/domain/audit/audit-catalog";
import { listAuditEventsForAdmin } from "@/infrastructure/audit/audit-store";
import { requireActiveAdmin } from "@/lib/auth/server-scope";
import { noStoreHeaders } from "@/lib/auth/session-cookie";

export const dynamic = "force-dynamic";

const entityTypeSet = new Set<string>(AUDIT_ENTITY_TYPES);

export async function GET(request: NextRequest) {
  const admin = await requireActiveAdmin();
  if (!admin.ok) {
    return NextResponse.json(
      { ok: false, reason: admin.reason, error: "No autorizado." },
      { status: admin.status, headers: noStoreHeaders }
    );
  }

  const rawEntityType = request.nextUrl.searchParams.get("entityType") ?? undefined;
  if (rawEntityType && !entityTypeSet.has(rawEntityType)) {
    return NextResponse.json(
      { ok: false, error: "Tipo de entidad inválido." },
      { status: 400, headers: noStoreHeaders }
    );
  }

  const entityId = request.nextUrl.searchParams.get("entityId")?.trim() || undefined;
  const rawLimit = request.nextUrl.searchParams.get("limit");
  const parsedLimit = rawLimit ? Number(rawLimit) : undefined;
  const limit = parsedLimit !== undefined && Number.isFinite(parsedLimit) ? parsedLimit : undefined;

  const result = await listAuditEventsForAdmin(admin.actor, {
    entityType: rawEntityType as AuditEntityType | undefined,
    entityId,
    limit
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, reason: result.reason, error: result.error },
      { status: result.status, headers: noStoreHeaders }
    );
  }

  return NextResponse.json({ ok: true, events: result.events }, { status: 200, headers: noStoreHeaders });
}
