import "server-only";

import { cookies } from "next/headers";
import { z } from "zod";
import { getAdminAuth, getAdminFirestore } from "@/infrastructure/firebase/admin";
import {
  evaluateProfileForSession,
  isIdTokenFresh,
  SESSION_COOKIE_NAME,
  SESSION_DURATION_MS,
  type AuthenticatedUser,
  type SessionFailureReason,
  type UserProfileRecord
} from "@/lib/auth/session-policy";

const userProfileSchema = z.object({
  email: z.string().min(1),
  displayName: z.string().min(1),
  role: z.enum(["admin", "coordinator"]),
  active: z.boolean(),
  coordinatorActive: z.boolean().optional(),
  privilegesUpdatedAtMs: z.number().optional(),
  createdAtIso: z.string().optional(),
  updatedAtIso: z.string().optional()
});

function mapFirebaseAuthError(error: unknown, kind: "id-token" | "session-cookie"): SessionFailureReason {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : "";

  if (kind === "id-token") {
    if (code === "auth/id-token-revoked") return "session-revoked";
    if (code === "auth/id-token-expired") return "session-expired";
    return "invalid-session";
  }

  if (code === "auth/session-cookie-revoked") return "session-revoked";
  if (code === "auth/session-cookie-expired") return "session-expired";
  return "invalid-session";
}

async function loadUserProfile(uid: string): Promise<UserProfileRecord | null> {
  const snapshot = await getAdminFirestore().collection("userProfiles").doc(uid).get();
  if (!snapshot.exists) {
    return null;
  }

  const parsed = userProfileSchema.safeParse(snapshot.data());
  if (!parsed.success) {
    return null;
  }

  return {
    uid,
    ...parsed.data
  };
}

export async function createSessionFromIdToken(
  idToken: string
): Promise<
  | { ok: true; sessionCookie: string; user: AuthenticatedUser }
  | { ok: false; reason: SessionFailureReason }
> {
  const adminAuth = getAdminAuth();
  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(idToken, true);
  } catch (error) {
    return { ok: false, reason: mapFirebaseAuthError(error, "id-token") };
  }

  if (!isIdTokenFresh(decoded.auth_time)) {
    return { ok: false, reason: "stale-id-token" };
  }

  const profile = await loadUserProfile(decoded.uid);
  const evaluation = evaluateProfileForSession(profile, decoded.iat);
  if (!evaluation.ok) {
    return evaluation;
  }

  const sessionCookie = await adminAuth.createSessionCookie(idToken, {
    expiresIn: SESSION_DURATION_MS
  });

  return {
    ok: true,
    sessionCookie,
    user: evaluation.user
  };
}

export async function verifyServerSessionCookie(
  cookieValue: string | undefined
): Promise<
  | { ok: true; user: AuthenticatedUser }
  | { ok: false; reason: SessionFailureReason }
> {
  if (!cookieValue) {
    return { ok: false, reason: "missing-session" };
  }

  const adminAuth = getAdminAuth();
  let decoded;
  try {
    decoded = await adminAuth.verifySessionCookie(cookieValue, true);
  } catch (error) {
    return { ok: false, reason: mapFirebaseAuthError(error, "session-cookie") };
  }

  const profile = await loadUserProfile(decoded.uid);
  return evaluateProfileForSession(profile, decoded.iat);
}

export async function getCurrentServerSession(): Promise<
  | { ok: true; user: AuthenticatedUser }
  | { ok: false; reason: SessionFailureReason }
> {
  const cookieStore = await cookies();
  return verifyServerSessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value);
}

export async function revokeServerSession(cookieValue: string | undefined): Promise<void> {
  if (!cookieValue) {
    return;
  }

  const adminAuth = getAdminAuth();
  try {
    const decoded = await adminAuth.verifySessionCookie(cookieValue, false);
    await adminAuth.revokeRefreshTokens(decoded.uid);
  } catch {
    // Clearing the local cookie still proceeds if the cookie is already invalid or expired.
  }
}
