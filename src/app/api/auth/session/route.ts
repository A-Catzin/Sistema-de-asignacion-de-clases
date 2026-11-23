import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  createSessionFromIdToken,
  revokeServerSession,
  verifyServerSessionCookie
} from "@/lib/auth/server-session";
import {
  checkRequestCsrf,
  clearSessionCookie,
  noStoreHeaders,
  setSessionCookie
} from "@/lib/auth/session-cookie";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-policy";

export const dynamic = "force-dynamic";

const createSessionBodySchema = z.object({
  idToken: z.string().min(1)
});

export async function GET(request: NextRequest) {
  const cookieValue = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifyServerSessionCookie(cookieValue);

  if (!session.ok) {
    const response = NextResponse.json(
      { authenticated: false, reason: session.reason },
      { status: 401, headers: noStoreHeaders }
    );
    if (cookieValue) {
      clearSessionCookie(response, request);
    }
    return response;
  }

  return NextResponse.json(
    { authenticated: true, user: session.user },
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Solicitud inválida." },
      { status: 400, headers: noStoreHeaders }
    );
  }

  const parsed = createSessionBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Credenciales de sesión incompletas." },
      { status: 400, headers: noStoreHeaders }
    );
  }

  const created = await createSessionFromIdToken(parsed.data.idToken);
  if (!created.ok) {
    const isForbiddenProfile =
      created.reason === "profile-not-found" ||
      created.reason === "account-inactive" ||
      created.reason === "privileges-changed";

    return NextResponse.json(
      {
        ok: false,
        reason: created.reason,
        error: isForbiddenProfile
          ? "Tu cuenta aún no está habilitada para ingresar. Solicita activación a administración."
          : "No fue posible verificar tu sesión. Inicia sesión nuevamente."
      },
      { status: isForbiddenProfile ? 403 : 401, headers: noStoreHeaders }
    );
  }

  const response = NextResponse.json(
    { ok: true, user: created.user },
    { status: 200, headers: noStoreHeaders }
  );

  setSessionCookie(response, request, created.sessionCookie);

  return response;
}

export async function DELETE(request: NextRequest) {
  const csrf = checkRequestCsrf(request);
  if (!csrf.ok) {
    return NextResponse.json(
      { ok: false, reason: csrf.reason, error: "Solicitud rechazada por validación de origen." },
      { status: 403, headers: noStoreHeaders }
    );
  }

  await revokeServerSession(request.cookies.get(SESSION_COOKIE_NAME)?.value);

  const response = NextResponse.json({ ok: true }, { status: 200, headers: noStoreHeaders });
  clearSessionCookie(response, request);
  return response;
}
