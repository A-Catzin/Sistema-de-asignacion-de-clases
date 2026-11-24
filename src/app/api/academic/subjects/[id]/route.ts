import { NextResponse, type NextRequest } from "next/server";
import {
  updateSubjectDefaultHours,
  upsertSubjectWithRequirements
} from "@/application/academic/offer-service";
import { getCurrentActorScope } from "@/lib/auth/server-scope";
import { checkRequestCsrf, noStoreHeaders } from "@/lib/auth/session-cookie";

export const dynamic = "force-dynamic";

const generalSubjectFields = new Set([
  "code",
  "name",
  "quarter",
  "careerId",
  "active",
  "requiredProfileCodes"
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
  const touchesGeneralFields = Object.keys(bodyObj).some((key) =>
    generalSubjectFields.has(key)
  );
  const { id } = await context.params;
  const correlationId = request.headers.get("x-correlation-id") ?? undefined;

  if (scope.actor.role !== "admin" && touchesGeneralFields) {
    return NextResponse.json(
      {
        ok: false,
        reason: "forbidden-role",
        error: "Solo el administrador puede modificar datos generales o requisitos de la materia."
      },
      { status: 403, headers: noStoreHeaders }
    );
  }

  const result =
    scope.actor.role === "admin" && touchesGeneralFields
      ? await upsertSubjectWithRequirements(scope.actor, { ...bodyObj, id }, correlationId)
      : await updateSubjectDefaultHours(scope.actor, id, bodyObj, correlationId);

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, reason: result.reason, error: result.error },
      { status: result.status, headers: noStoreHeaders }
    );
  }

  return NextResponse.json(
    { ok: true, subject: result.subject },
    { status: 200, headers: noStoreHeaders }
  );
}
