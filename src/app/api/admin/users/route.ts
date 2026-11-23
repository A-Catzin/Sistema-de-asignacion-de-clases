import { NextResponse, type NextRequest } from "next/server";
import { createManagedUser, listManagedUsers } from "@/application/users/provisioning";
import { requireActiveAdmin } from "@/lib/auth/server-scope";
import { checkRequestCsrf, noStoreHeaders } from "@/lib/auth/session-cookie";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireActiveAdmin();
  if (!admin.ok) {
    return NextResponse.json(
      { ok: false, reason: admin.reason, error: "No autorizado." },
      { status: admin.status, headers: noStoreHeaders }
    );
  }

  const result = await listManagedUsers(admin.actor);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, reason: result.reason, error: result.error },
      { status: result.status, headers: noStoreHeaders }
    );
  }

  return NextResponse.json({ ok: true, users: result.users }, { status: 200, headers: noStoreHeaders });
}

export async function POST(request: NextRequest) {
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

  const correlationId = request.headers.get("x-correlation-id") ?? undefined;
  const created = await createManagedUser(admin.actor, body, correlationId);
  if (!created.ok) {
    return NextResponse.json(
      { ok: false, reason: created.reason, error: created.error },
      { status: created.status, headers: noStoreHeaders }
    );
  }

  return NextResponse.json({ ok: true, user: created.user }, { status: 201, headers: noStoreHeaders });
}
