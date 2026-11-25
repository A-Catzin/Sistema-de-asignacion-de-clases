import { NextResponse, type NextRequest } from "next/server";
import {
  setScheduleBlockActive,
  upsertBaseScheduleBlock
} from "@/application/schedules/schedule-service";
import { getCurrentActorScope } from "@/lib/auth/server-scope";
import { checkRequestCsrf, noStoreHeaders } from "@/lib/auth/session-cookie";

export const dynamic = "force-dynamic";

const fullBlockFields = new Set([
  "templateId",
  "dayOfWeek",
  "startsAt",
  "endsAt",
  "module",
  "label",
  "position"
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
  const touchesFullFields = Object.keys(bodyObj).some((key) => fullBlockFields.has(key));
  const { id } = await context.params;
  const correlationId = request.headers.get("x-correlation-id") ?? undefined;

  if (touchesFullFields) {
    if (scope.actor.role !== "admin") {
      return NextResponse.json(
        {
          ok: false,
          reason: "forbidden-role",
          error: "Solo el administrador puede editar definiciones de bloques base."
        },
        { status: 403, headers: noStoreHeaders }
      );
    }

    const updated = await upsertBaseScheduleBlock(
      scope.actor,
      { ...bodyObj, id },
      correlationId
    );
    if (!updated.ok) {
      return NextResponse.json(
        { ok: false, reason: updated.reason, error: updated.error },
        { status: updated.status, headers: noStoreHeaders }
      );
    }
    return NextResponse.json(
      { ok: true, block: updated.block },
      { status: 200, headers: noStoreHeaders }
    );
  }

  const toggled = await setScheduleBlockActive(scope.actor, id, bodyObj, correlationId);
  if (!toggled.ok) {
    return NextResponse.json(
      { ok: false, reason: toggled.reason, error: toggled.error },
      { status: toggled.status, headers: noStoreHeaders }
    );
  }

  return NextResponse.json(
    { ok: true, block: toggled.block },
    { status: 200, headers: noStoreHeaders }
  );
}
