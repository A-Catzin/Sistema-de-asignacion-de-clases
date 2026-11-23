import { NextResponse, type NextRequest } from "next/server";
import { verifyServerSessionCookie } from "@/lib/auth/server-session";
import { clearSessionCookie } from "@/lib/auth/session-cookie";
import {
  SESSION_COOKIE_NAME,
  toLoginNotice,
  type SessionNotice
} from "@/lib/auth/session-policy";

export const dynamic = "force-dynamic";

const allowedNotices = new Set<SessionNotice>([
  "session-expired",
  "privileges-changed",
  "account-inactive"
]);

export async function GET(request: NextRequest) {
  const cookieValue = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifyServerSessionCookie(cookieValue);

  if (session.ok) {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    dashboardUrl.search = "";
    return NextResponse.redirect(dashboardUrl, {
      status: 307,
      headers: { "Cache-Control": "no-store" }
    });
  }

  const queryNotice = request.nextUrl.searchParams.get("notice");
  const fallbackNotice = allowedNotices.has(queryNotice as SessionNotice)
    ? (queryNotice as SessionNotice)
    : null;
  const notice = toLoginNotice(session.reason) ?? fallbackNotice;

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = notice ? `?notice=${notice}` : "";

  const response = NextResponse.redirect(loginUrl, {
    status: 307,
    headers: { "Cache-Control": "no-store" }
  });
  clearSessionCookie(response, request);
  return response;
}
