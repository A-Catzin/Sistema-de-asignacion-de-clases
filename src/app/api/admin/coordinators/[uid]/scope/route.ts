import { NextResponse, type NextRequest } from "next/server";
import { replaceCoordinatorScope } from "@/application/users/provisioning";
import { requireActiveAdmin } from "@/lib/auth/server-scope";
import { checkRequestCsrf, noStoreHeaders } from "@/lib/auth/session-cookie";

export const dynamic = "force-dynamic";

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ uid: string }> }
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

  const { uid } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Solicitud inválida." },
      { status: 400, headers: noStoreHeaders }
    );
  }

  const correlationId = request.headers.get("x-correlation-id") ?? undefined;
  const updated = await replaceCoordinatorScope(admin.actor, uid, body, correlationId);
  if (!updated.ok) {
    return NextResponse.json(
      { ok: false, reason: updated.reason, error: updated.error },
      { status: updated.status, headers: noStoreHeaders }
    );
  }

  return NextResponse.json({ ok: true, scope: updated.scope }, { status: 200, headers: noStoreHeaders });
}
