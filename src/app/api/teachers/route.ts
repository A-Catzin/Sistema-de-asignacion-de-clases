import { NextResponse, type NextRequest } from "next/server";
import { listTeachers, upsertTeacher } from "@/application/teachers/teacher-service";
import { getCurrentActorScope, requireActiveAdmin } from "@/lib/auth/server-scope";
import { checkRequestCsrf, noStoreHeaders } from "@/lib/auth/session-cookie";

export const dynamic = "force-dynamic";

export async function GET() {
  const scope = await getCurrentActorScope();
  if (!scope.ok) {
    return NextResponse.json(
      { ok: false, reason: scope.reason, error: "No autorizado." },
      { status: scope.status, headers: noStoreHeaders }
    );
  }

  const result = await listTeachers(scope.actor);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, reason: result.reason, error: result.error },
      { status: result.status, headers: noStoreHeaders }
    );
  }

  return NextResponse.json(
    { ok: true, teachers: result.teachers },
    { status: 200, headers: noStoreHeaders }
  );
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
  const saved = await upsertTeacher(admin.actor, body, correlationId);
  if (!saved.ok) {
    return NextResponse.json(
      { ok: false, reason: saved.reason, error: saved.error },
      { status: saved.status, headers: noStoreHeaders }
    );
  }

  return NextResponse.json(
    { ok: true, teacher: saved.teacher },
    { status: saved.created ? 201 : 200, headers: noStoreHeaders }
  );
}
