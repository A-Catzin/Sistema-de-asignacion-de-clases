import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  evaluateProfileForSession,
  isIdTokenFresh,
  MAX_ID_TOKEN_AGE_SECONDS,
  SESSION_DURATION_MS,
  shouldUseSecureCookie,
  toLoginNotice,
  validateCsrfHeaders,
  type UserProfileRecord
} from "../../src/lib/auth/session-policy";

const rootDir = path.resolve(__dirname, "../..");

const activeAdmin: UserProfileRecord = {
  uid: "admin-1",
  email: "admin@institucion.edu.mx",
  displayName: "Admin General",
  role: "admin",
  active: true
};

const activeCoordinator: UserProfileRecord = {
  uid: "coord-1",
  email: "coord@institucion.edu.mx",
  displayName: "Coordinación Sistemas",
  role: "coordinator",
  active: true,
  coordinatorActive: true
};

describe("T07/T08 auth session & CSRF policy", () => {
  it("validates CSRF headers for state-changing session requests", () => {
    expect(
      validateCsrfHeaders({
        origin: "http://127.0.0.1:3000",
        host: "127.0.0.1:3000",
        secFetchSite: "same-origin",
        requestedWith: "XMLHttpRequest"
      })
    ).toEqual({ ok: true });

    expect(
      validateCsrfHeaders({
        origin: "http://127.0.0.1:3000",
        host: "127.0.0.1:3000",
        secFetchSite: "same-origin",
        requestedWith: null
      })
    ).toEqual({ ok: false, reason: "missing-csrf-header" });

    expect(
      validateCsrfHeaders({
        origin: "http://127.0.0.1:3000",
        host: "127.0.0.1:3000",
        secFetchSite: "cross-site",
        requestedWith: "XMLHttpRequest"
      })
    ).toEqual({ ok: false, reason: "cross-site-request" });

    expect(
      validateCsrfHeaders({
        origin: "https://evil.example",
        host: "127.0.0.1:3000",
        secFetchSite: "same-origin",
        requestedWith: "XMLHttpRequest"
      })
    ).toEqual({ ok: false, reason: "origin-mismatch" });
  });

  it("computes secure cookie flag correctly across loopback HTTP and HTTPS/production", () => {
    expect(
      shouldUseSecureCookie({ protocol: "http:", host: "127.0.0.1:3100", nodeEnv: "production" })
    ).toBe(false);
    expect(
      shouldUseSecureCookie({ protocol: "http:", host: "localhost:3000", nodeEnv: "development" })
    ).toBe(false);
    expect(
      shouldUseSecureCookie({ protocol: "https:", host: "app.example.edu", nodeEnv: "production" })
    ).toBe(true);
    expect(
      shouldUseSecureCookie({ protocol: "http:", host: "app.example.edu", nodeEnv: "production" })
    ).toBe(true);
  });

  it("rejects stale ID tokens beyond the allowed auth_time window", () => {
    const now = 1_700_000_000;
    expect(isIdTokenFresh(now - 10, now)).toBe(true);
    expect(isIdTokenFresh(now - MAX_ID_TOKEN_AGE_SECONDS, now)).toBe(true);
    expect(isIdTokenFresh(now - MAX_ID_TOKEN_AGE_SECONDS - 1, now)).toBe(false);
    expect(isIdTokenFresh(0, now)).toBe(false);
  });

  it("enforces provisioned active profile and invalidates tokens issued before privilege updates", () => {
    expect(evaluateProfileForSession(null, 1_700_000)).toEqual({
      ok: false,
      reason: "profile-not-found"
    });
    expect(evaluateProfileForSession({ ...activeAdmin, active: false }, 1_700_000)).toEqual({
      ok: false,
      reason: "account-inactive"
    });
    expect(
      evaluateProfileForSession({ ...activeCoordinator, coordinatorActive: false }, 1_700_000)
    ).toEqual({
      ok: false,
      reason: "account-inactive"
    });
    expect(
      evaluateProfileForSession(
        { ...activeAdmin, privilegesUpdatedAtMs: 1_700_000_000 + 5_000 },
        1_700_000
      )
    ).toEqual({
      ok: false,
      reason: "privileges-changed"
    });

    expect(
      evaluateProfileForSession(
        { ...activeAdmin, privilegesUpdatedAtMs: 0 },
        1_700_000
      )
    ).toEqual({
      ok: true,
      user: {
        uid: activeAdmin.uid,
        email: activeAdmin.email,
        displayName: activeAdmin.displayName,
        role: "admin"
      }
    });

    expect(evaluateProfileForSession(activeAdmin, 1_700_000)).toEqual({
      ok: true,
      user: {
        uid: activeAdmin.uid,
        email: activeAdmin.email,
        displayName: activeAdmin.displayName,
        role: "admin"
      }
    });
  });

  it("uses 5-day persistent session lifetime and maps failure reasons to safe login notices", () => {
    expect(SESSION_DURATION_MS).toBe(5 * 24 * 60 * 60 * 1000);
    expect(toLoginNotice("session-expired")).toBe("session-expired");
    expect(toLoginNotice("session-revoked")).toBe("session-expired");
    expect(toLoginNotice("invalid-session")).toBe("session-expired");
    expect(toLoginNotice("privileges-changed")).toBe("privileges-changed");
    expect(toLoginNotice("account-inactive")).toBe("account-inactive");
    expect(toLoginNotice("missing-session")).toBeNull();
  });

  it("protects server-session.ts with server-only", () => {
    const source = readFileSync(
      path.join(rootDir, "src/lib/auth/server-session.ts"),
      "utf8"
    );
    expect(source.trimStart().startsWith('import "server-only";')).toBe(true);
  });
});
