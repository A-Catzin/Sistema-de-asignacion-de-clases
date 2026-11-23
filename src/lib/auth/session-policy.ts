export const SESSION_COOKIE_NAME = "__session";
export const SESSION_DURATION_DAYS = 5;
export const SESSION_DURATION_MS = SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000;
export const SESSION_DURATION_SECONDS = SESSION_DURATION_DAYS * 24 * 60 * 60;
export const MAX_ID_TOKEN_AGE_SECONDS = 300;

export type UserRole = "admin" | "coordinator";

export type UserProfileRecord = Readonly<{
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  active: boolean;
  coordinatorActive?: boolean;
  privilegesUpdatedAtMs?: number;
  createdAtIso?: string;
  updatedAtIso?: string;
}>;

export type AuthenticatedUser = Readonly<{
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
}>;

export type SessionFailureReason =
  | "missing-session"
  | "invalid-session"
  | "session-expired"
  | "session-revoked"
  | "stale-id-token"
  | "profile-not-found"
  | "account-inactive"
  | "privileges-changed";

export type CsrfDecision =
  | { ok: true }
  | { ok: false; reason: "missing-csrf-header" | "cross-site-request" | "origin-mismatch" };

export function validateCsrfHeaders(input: {
  origin: string | null;
  host: string | null;
  secFetchSite: string | null;
  requestedWith: string | null;
}): CsrfDecision {
  if (input.requestedWith !== "XMLHttpRequest") {
    return { ok: false, reason: "missing-csrf-header" };
  }

  if (
    input.secFetchSite &&
    input.secFetchSite !== "same-origin" &&
    input.secFetchSite !== "none"
  ) {
    return { ok: false, reason: "cross-site-request" };
  }

  if (input.origin !== null) {
    if (!input.host) {
      return { ok: false, reason: "origin-mismatch" };
    }
    try {
      const originHost = new URL(input.origin).host;
      if (originHost.toLowerCase() !== input.host.toLowerCase()) {
        return { ok: false, reason: "origin-mismatch" };
      }
    } catch {
      return { ok: false, reason: "origin-mismatch" };
    }
  }

  return { ok: true };
}

export function shouldUseSecureCookie(input: {
  protocol: string;
  host: string | null;
  nodeEnv: string | undefined;
}): boolean {
  if (input.protocol === "https:") {
    return true;
  }
  const host = input.host?.toLowerCase() ?? "";
  if (
    host.startsWith("127.0.0.1") ||
    host.startsWith("localhost") ||
    host.startsWith("[::1]")
  ) {
    return false;
  }
  return input.nodeEnv === "production";
}

export function isIdTokenFresh(
  authTimeSeconds: number,
  nowSeconds = Math.floor(Date.now() / 1000)
): boolean {
  return (
    authTimeSeconds > 0 &&
    nowSeconds - authTimeSeconds <= MAX_ID_TOKEN_AGE_SECONDS &&
    authTimeSeconds <= nowSeconds + 60
  );
}

export type SessionNotice = "session-expired" | "privileges-changed" | "account-inactive";

export function toLoginNotice(reason: SessionFailureReason): SessionNotice | null {
  if (reason === "session-expired" || reason === "session-revoked" || reason === "invalid-session") {
    return "session-expired";
  }
  if (reason === "privileges-changed") {
    return "privileges-changed";
  }
  if (reason === "account-inactive" || reason === "profile-not-found") {
    return "account-inactive";
  }
  return null;
}

export function evaluateProfileForSession(
  profile: UserProfileRecord | null,
  tokenIatSeconds: number
):
  | { ok: true; user: AuthenticatedUser }
  | { ok: false; reason: "profile-not-found" | "account-inactive" | "privileges-changed" } {
  if (!profile) {
    return { ok: false, reason: "profile-not-found" };
  }
  if (!profile.active) {
    return { ok: false, reason: "account-inactive" };
  }
  if (profile.role === "coordinator" && profile.coordinatorActive === false) {
    return { ok: false, reason: "account-inactive" };
  }
  if (
    typeof profile.privilegesUpdatedAtMs === "number" &&
    tokenIatSeconds * 1000 < profile.privilegesUpdatedAtMs
  ) {
    return { ok: false, reason: "privileges-changed" };
  }

  return {
    ok: true,
    user: {
      uid: profile.uid,
      email: profile.email,
      displayName: profile.displayName,
      role: profile.role
    }
  };
}
