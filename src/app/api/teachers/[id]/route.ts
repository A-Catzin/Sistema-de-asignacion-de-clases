import { NextResponse, type NextRequest } from "next/server";
import {
  updateTeacherOperationalFields,
  upsertTeacher
} from "@/application/teachers/teacher-service";
import { canUpdateTeacher } from "@/domain/auth/authorization-policy";
import { getCurrentActorScope } from "@/lib/auth/server-scope";
import { checkRequestCsrf, noStoreHeaders } from "@/lib/auth/session-cookie";

export const dynamic = "force-dynamic";

const generalTeacherFields = new Set([
  "name",
  "email",
  "notes",
  "active",
  "responsibleCoordinatorId",
  "coordinatorIds"
]);

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

  const scope = await getCurrentActorScope();
  if (!scope.ok) {
    return NextResponse.json(
      { ok: false, reason: scope.reason, error: "No autorizado." },
      { status: scope.status, headers: noStoreHeaders }
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

  const bodyObj = body as Record<string, unknown>;
  const changesGeneralFields = Object.keys(bodyObj).some((key) => generalTeacherFields.has(key));
  const { id } = await context.params;
  const authz = canUpdateTeacher(scope.actor, { teacherId: id, changesGeneralFields });

  if (!authz.ok) {
    return NextResponse.json(
      {
        ok: false,
        reason: authz.reason,
        error: "No tienes permiso para modificar este docente."
      },
      { status: 403, headers: noStoreHeaders }
    );
  }

  const correlationId = request.headers.get("x-correlation-id") ?? undefined;
  const result =
    scope.actor.role === "admin" && changesGeneralFields
      ? await upsertTeacher(scope.actor, { ...bodyObj, id }, correlationId)
      : await updateTeacherOperationalFields(scope.actor, id, bodyObj, correlationId);

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, reason: result.reason, error: result.error },
      { status: result.status, headers: noStoreHeaders }
    );
  }

  return NextResponse.json(
    { ok: true, teacher: result.teacher },
    { status: 200, headers: noStoreHeaders }
  );
}
