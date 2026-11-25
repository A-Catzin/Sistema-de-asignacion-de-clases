import { NextResponse, type NextRequest } from "next/server";
import {
  createCustomScheduleBlock,
  listScheduleBlocks,
  upsertBaseScheduleBlock
} from "@/application/schedules/schedule-service";
import { getCurrentActorScope } from "@/lib/auth/server-scope";
import { checkRequestCsrf, noStoreHeaders } from "@/lib/auth/session-cookie";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const scope = await getCurrentActorScope();
  if (!scope.ok) {
    return NextResponse.json(
      { ok: false, reason: scope.reason, error: "No autorizado." },
      { status: scope.status, headers: noStoreHeaders }
    );
  }

  const templateId = request.nextUrl.searchParams.get("templateId")?.trim() || undefined;
  const onlyActive = request.nextUrl.searchParams.get("onlyActive") === "true";
  const result = await listScheduleBlocks(scope.actor, {
    templateId,
    includeInactive: !onlyActive
  });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, reason: result.reason, error: result.error },
      { status: result.status, headers: noStoreHeaders }
    );
  }

  return NextResponse.json(
    { ok: true, blocks: result.blocks },
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
  const isCustom = bodyObj.isCustom === true;
  const correlationId = request.headers.get("x-correlation-id") ?? undefined;

  if (!isCustom) {
    if (scope.actor.role !== "admin") {
      return NextResponse.json(
        {
          ok: false,
          reason: "forbidden-role",
          error: "Solo el administrador puede crear bloques base."
        },
        { status: 403, headers: noStoreHeaders }
      );
    }

    const saved = await upsertBaseScheduleBlock(scope.actor, bodyObj, correlationId);
    if (!saved.ok) {
      return NextResponse.json(
        { ok: false, reason: saved.reason, error: saved.error },
        { status: saved.status, headers: noStoreHeaders }
      );
    }
    return NextResponse.json(
      { ok: true, block: saved.block },
      { status: saved.created ? 201 : 200, headers: noStoreHeaders }
    );
  }

  const savedCustom = await createCustomScheduleBlock(scope.actor, bodyObj, correlationId);
  if (!savedCustom.ok) {
    return NextResponse.json(
      { ok: false, reason: savedCustom.reason, error: savedCustom.error },
      { status: savedCustom.status, headers: noStoreHeaders }
    );
  }

  return NextResponse.json(
    { ok: true, block: savedCustom.block },
    { status: 201, headers: noStoreHeaders }
  );
}
