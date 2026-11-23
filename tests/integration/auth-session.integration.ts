import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const authEmulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099";
const firestoreEmulatorHost = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
const projectId = process.env.FIREBASE_PROJECT_ID ?? "demo-sistema-asignacion";

if (!/^(?:127\.0\.0\.1|localhost|\[::1\]):[1-9]\d{0,4}$/.test(authEmulatorHost)) {
  throw new Error("FIREBASE_AUTH_EMULATOR_HOST must be loopback.");
}
if (!/^(?:127\.0\.0\.1|localhost|\[::1\]):[1-9]\d{0,4}$/.test(firestoreEmulatorHost)) {
  throw new Error("FIRESTORE_EMULATOR_HOST must be loopback.");
}

const app = getApps().length > 0 ? getApps()[0] : initializeApp({ projectId });
const adminAuth = getAuth(app);
const adminDb = getFirestore(app);

async function signInWithEmulatorPassword(email: string, password: string): Promise<string> {
  const response = await fetch(
    `http://${authEmulatorHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-local-api-key`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true })
    }
  );
  assert.equal(response.status, 200);
  const payload = (await response.json()) as { idToken: string };
  assert.ok(payload.idToken);
  return payload.idToken;
}

function extractSessionCookie(response: Response): { cookiePair: string; rawHeader: string } {
  const setCookies = response.headers.getSetCookie();
  const match = setCookies.find((entry) => entry.startsWith("__session="));
  assert.ok(match, "Expected __session Set-Cookie header");
  const cookiePair = match.split(";")[0];
  return { cookiePair, rawHeader: match };
}

test("T07/T08: end-to-end Firebase Auth, server session cookies, CSRF, revocation, and privilege invalidation", async () => {
  const runId = randomUUID().slice(0, 8);
  const password = "TempPassword123!";
  const unprovisionedEmail = `unprov-${runId}@institucion.test`;
  const inactiveEmail = `inactive-${runId}@institucion.test`;
  const adminEmail = `admin-${runId}@institucion.test`;

  const [unprovisionedUser, inactiveUser, adminUser] = await Promise.all([
    adminAuth.createUser({ email: unprovisionedEmail, password, displayName: "Sin Perfil" }),
    adminAuth.createUser({ email: inactiveEmail, password, displayName: "Cuenta Inactiva" }),
    adminAuth.createUser({ email: adminEmail, password, displayName: "Admin Prueba" })
  ]);

  await Promise.all([
    adminDb.collection("userProfiles").doc(inactiveUser.uid).set({
      email: inactiveEmail,
      displayName: "Cuenta Inactiva",
      role: "admin",
      active: false
    }),
    adminDb.collection("userProfiles").doc(adminUser.uid).set({
      email: adminEmail,
      displayName: "Admin Prueba",
      role: "admin",
      active: true
    })
  ]);

  // 1. Unauthenticated requests are denied / redirected.
  const unauthApi = await fetch(`${baseUrl}/api/auth/session`);
  assert.equal(unauthApi.status, 401);

  const unauthDashboard = await fetch(`${baseUrl}/dashboard`, { redirect: "manual" });
  assert.equal(unauthDashboard.status, 307);
  assert.ok(unauthDashboard.headers.get("location")?.includes("/login"));

  // 2. Forged/stale session cookie is rejected by API and gracefully cleared by /dashboard -> /api/auth/clear -> /login.
  const forgedRes = await fetch(`${baseUrl}/api/auth/session`, {
    headers: { Cookie: "__session=forged.invalid.token" }
  });
  assert.equal(forgedRes.status, 401);

  const staleDashboard = await fetch(`${baseUrl}/dashboard`, {
    headers: { Cookie: "__session=forged.invalid.token" },
    redirect: "manual"
  });
  assert.equal(staleDashboard.status, 307);
  assert.ok(staleDashboard.headers.get("location")?.endsWith("/api/auth/clear"));

  const clearStale = await fetch(`${baseUrl}/api/auth/clear`, {
    headers: { Cookie: "__session=forged.invalid.token" },
    redirect: "manual"
  });
  assert.equal(clearStale.status, 307);
  assert.ok(clearStale.headers.get("location")?.endsWith("/login?notice=session-expired"));
  const clearedHeader = clearStale.headers.getSetCookie().find((entry) => entry.startsWith("__session="));
  assert.ok(clearedHeader && clearedHeader.includes("Max-Age=0"));

  const loginWithNotice = await fetch(`${baseUrl}/login?notice=session-expired`, {
    redirect: "manual"
  });
  assert.equal(loginWithNotice.status, 200);
  const loginNoticeHtml = await loginWithNotice.text();
  assert.ok(loginNoticeHtml.includes("Tu sesión venció o fue cerrada"));

  const [unprovToken, inactiveToken, adminToken] = await Promise.all([
    signInWithEmulatorPassword(unprovisionedEmail, password),
    signInWithEmulatorPassword(inactiveEmail, password),
    signInWithEmulatorPassword(adminEmail, password)
  ]);

  // 3. Cross-origin or missing-header CSRF attempts are blocked without setting cookies.
  const csrfNoHeader = await fetch(`${baseUrl}/api/auth/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: adminToken })
  });
  assert.equal(csrfNoHeader.status, 403);
  assert.equal(csrfNoHeader.headers.getSetCookie().length, 0);

  const csrfCrossOrigin = await fetch(`${baseUrl}/api/auth/session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      Origin: "https://evil.example"
    },
    body: JSON.stringify({ idToken: adminToken })
  });
  assert.equal(csrfCrossOrigin.status, 403);
  assert.equal(csrfCrossOrigin.headers.getSetCookie().length, 0);

  // 4. Unprovisioned and inactive accounts cannot obtain a session cookie.
  for (const deniedToken of [unprovToken, inactiveToken]) {
    const res = await fetch(`${baseUrl}/api/auth/session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
        Origin: baseUrl
      },
      body: JSON.stringify({ idToken: deniedToken })
    });
    assert.equal(res.status, 403);
    assert.equal(res.headers.getSetCookie().length, 0);
  }

  // 5. Active provisioned admin exchanges ID token for HttpOnly + SameSite=Lax cookie and accesses /dashboard.
  const loginRes = await fetch(`${baseUrl}/api/auth/session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      Origin: baseUrl
    },
    body: JSON.stringify({ idToken: adminToken })
  });
  assert.equal(loginRes.status, 200);
  const { cookiePair, rawHeader } = extractSessionCookie(loginRes);
  assert.ok(rawHeader.includes("HttpOnly"));
  assert.ok(rawHeader.toLowerCase().includes("samesite=lax"));

  const sessionCheck = await fetch(`${baseUrl}/api/auth/session`, {
    headers: { Cookie: cookiePair }
  });
  assert.equal(sessionCheck.status, 200);
  const sessionBody = (await sessionCheck.json()) as {
    authenticated: boolean;
    user: { uid: string; role: string };
  };
  assert.equal(sessionBody.authenticated, true);
  assert.equal(sessionBody.user.uid, adminUser.uid);
  assert.equal(sessionBody.user.role, "admin");

  const dashboardRes = await fetch(`${baseUrl}/dashboard`, {
    headers: { Cookie: cookiePair },
    redirect: "manual"
  });
  assert.equal(dashboardRes.status, 200);
  const dashboardHtml = await dashboardRes.text();
  assert.ok(dashboardHtml.includes("Admin Prueba"));

  // 6. CSRF on DELETE and /api/auth/clear do not revoke or clear an active session.
  const csrfDelete = await fetch(`${baseUrl}/api/auth/session`, {
    method: "DELETE",
    headers: {
      Cookie: cookiePair,
      "X-Requested-With": "XMLHttpRequest",
      Origin: "https://evil.example"
    }
  });
  assert.equal(csrfDelete.status, 403);

  const clearValidSession = await fetch(`${baseUrl}/api/auth/clear`, {
    headers: { Cookie: cookiePair },
    redirect: "manual"
  });
  assert.equal(clearValidSession.status, 307);
  assert.ok(clearValidSession.headers.get("location")?.endsWith("/dashboard"));
  assert.equal(clearValidSession.headers.getSetCookie().length, 0);

  const stillValid = await fetch(`${baseUrl}/api/auth/session`, {
    headers: { Cookie: cookiePair }
  });
  assert.equal(stillValid.status, 200);

  // 7. Mid-session deactivation and privilege-change invalidation take effect immediately.
  const profileRef = adminDb.collection("userProfiles").doc(adminUser.uid);
  await profileRef.update({ active: false });
  const deactivatedRes = await fetch(`${baseUrl}/api/auth/session`, {
    headers: { Cookie: cookiePair }
  });
  assert.equal(deactivatedRes.status, 401);
  assert.equal(((await deactivatedRes.json()) as { reason: string }).reason, "account-inactive");

  await profileRef.update({ active: true, privilegesUpdatedAtMs: Date.now() + 60_000 });
  const privChangedRes = await fetch(`${baseUrl}/api/auth/session`, {
    headers: { Cookie: cookiePair }
  });
  assert.equal(privChangedRes.status, 401);
  assert.equal(((await privChangedRes.json()) as { reason: string }).reason, "privileges-changed");

  await profileRef.update({ privilegesUpdatedAtMs: 0 });
  const restoredRes = await fetch(`${baseUrl}/api/auth/session`, {
    headers: { Cookie: cookiePair }
  });
  assert.equal(restoredRes.status, 200);

  // 8. Logout revokes refresh tokens; replaying the captured cookie is rejected.
  await new Promise((resolve) => setTimeout(resolve, 1100));
  const logoutRes = await fetch(`${baseUrl}/api/auth/session`, {
    method: "DELETE",
    headers: {
      Cookie: cookiePair,
      "X-Requested-With": "XMLHttpRequest",
      Origin: baseUrl
    }
  });
  assert.equal(logoutRes.status, 200);

  const replayRes = await fetch(`${baseUrl}/api/auth/session`, {
    headers: { Cookie: cookiePair }
  });
  assert.equal(replayRes.status, 401);
  assert.equal(((await replayRes.json()) as { reason: string }).reason, "session-revoked");

  await Promise.all([
    adminAuth.deleteUsers([unprovisionedUser.uid, inactiveUser.uid, adminUser.uid]),
    adminDb.collection("userProfiles").doc(inactiveUser.uid).delete(),
    adminDb.collection("userProfiles").doc(adminUser.uid).delete()
  ]);
});
