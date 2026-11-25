import { NextResponse, type NextRequest } from "next/server";
import { upsertClassroom } from "@/application/schedules/schedule-service";
import { requireActiveAdmin } from "@/lib/auth/server-scope";
import { checkRequestCsrf, noStoreHeaders } from "@/lib/auth/session-cookie";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const csrf = checkRequestCsrf(request);
  if (!csrf.ok) {
    return NextResponse.json(
      { ok: false, reason: csrf.reason, error: "Solicitud rechazada por validación de origen." },
      { status: 403, headers: noStoreHeaders }
    );
  }

  const admin = await requireActiveAdmin();
  if (!admin.ok) {
    return NextResponse.json(
      { ok: false, reason: admin.reason, error: "No autorizado." },
      { status: admin.status, headers: noStoreHeaders }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Solicitud inválida." },
      { status: 400, headers: noStoreHeaders }
    );
  }

  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json(
      { ok: false, error: "Solicitud inválida." },
      { status: 400, headers: noStoreHeaders }
    );
  }

  const { id } = await context.params;
  const correlationId = request.headers.get("x-correlation-id") ?? undefined;
  const saved = await upsertClassroom(
    admin.actor,
    { ...(body as Record<string, unknown>), id },
    correlationId
  );

  if (!saved.ok) {
    return NextResponse.json(
      { ok: false, reason: saved.reason, error: saved.error },
      { status: saved.status, headers: noStoreHeaders }
    );
  }

  return NextResponse.json(
    { ok: true, classroom: saved.classroom },
    { status: 200, headers: noStoreHeaders }
  );
}
