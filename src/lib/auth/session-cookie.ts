import type { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE_NAME,
  SESSION_DURATION_SECONDS,
  shouldUseSecureCookie
} from "@/lib/auth/session-policy";

export function isSecureSessionRequest(request: NextRequest): boolean {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const protocol = forwardedProto
    ? `${forwardedProto.split(",")[0].trim()}:`
    : request.nextUrl.protocol;

  return shouldUseSecureCookie({
    protocol,
    host: request.headers.get("host"),
    nodeEnv: process.env.NODE_ENV
  });
}

export function setSessionCookie(response: NextResponse, request: NextRequest, value: string) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
    secure: isSecureSessionRequest(request)
  });
}

export function clearSessionCookie(response: NextResponse, request: NextRequest) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    expires: new Date(0),
    secure: isSecureSessionRequest(request)
  });
}
