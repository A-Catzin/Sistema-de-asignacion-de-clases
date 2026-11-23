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

async function createHttpSessionCookie(email: string, password: string): Promise<string> {
  const idToken = await signInWithEmulatorPassword(email, password);
  const res = await fetch(`${baseUrl}/api/auth/session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      Origin: baseUrl
    },
    body: JSON.stringify({ idToken })
  });
  assert.equal(res.status, 200);
  const setCookie = res.headers.getSetCookie().find((entry) => entry.startsWith("__session="));
  assert.ok(setCookie);
  return setCookie.split(";")[0];
}

test("T09/T10: administrative user provisioning, bootstrap lock, scope replacement, CSRF, and revocation", async () => {
  const runId = randomUUID().slice(0, 8);
  const password = "TempPassword123!";
  const selfSignupEmail = `self-${runId}@institucion.test`;
  const adminEmail = `admin-${runId}@institucion.test`;
  const coordEmail = `coord-${runId}@institucion.test`;

  const [selfSignupUser, adminUser] = await Promise.all([
    adminAuth.createUser({ email: selfSignupEmail, password, displayName: "Autoregistro" }),
    adminAuth.createUser({ email: adminEmail, password, displayName: "Admin Principal" })
  ]);

  await adminDb.collection("userProfiles").doc(adminUser.uid).set({
    email: adminEmail,
    displayName: "Admin Principal",
    role: "admin",
    active: true
  });

  // 1. Unprovisioned account cannot mint a session or access /api/admin/users.
  const selfToken = await signInWithEmulatorPassword(selfSignupEmail, password);
  const selfSessionAttempt = await fetch(`${baseUrl}/api/auth/session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      Origin: baseUrl
    },
    body: JSON.stringify({ idToken: selfToken })
  });
  assert.equal(selfSessionAttempt.status, 403);
  assert.equal((await fetch(`${baseUrl}/api/admin/users`)).status, 401);

  // 2. One-time bootstrap lock document rejects duplicate creation atomically (AC03/AC38).
  const bootstrapRef = adminDb.collection("systemBootstrap").doc(`lock-${runId}`);
  await bootstrapRef.create({ status: "completed", adminUid: adminUser.uid });
  await assert.rejects(() => bootstrapRef.create({ status: "escalated" }));

  // 3. Active admin signs in and provisions a coordinator via POST /api/admin/users.
  const adminCookie = await createHttpSessionCookie(adminEmail, password);
  const provCorrelation = `corr-prov-${runId}`;
  const scopeCorrelation = `corr-scope-${runId}`;
  const deactivateCorrelation = `corr-deact-${runId}`;

  const createCoordRes = await fetch(`${baseUrl}/api/admin/users`, {
    method: "POST",
    headers: {
      Cookie: adminCookie,
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      "X-Correlation-Id": provCorrelation,
      Origin: baseUrl
    },
    body: JSON.stringify({
      email: coordEmail,
      displayName: "Coordinación Ingeniería",
      password,
      role: "coordinator",
      active: true
    })
  });
  assert.equal(createCoordRes.status, 201);
  const createdPayload = (await createCoordRes.json()) as {
    ok: boolean;
    user: { uid: string; role: string; active: boolean };
  };
  assert.equal(createdPayload.ok, true);
  const coordUid = createdPayload.user.uid;
  assert.equal(createdPayload.user.role, "coordinator");

  const coordRecordSnap = await adminDb.collection("coordinators").doc(coordUid).get();
  assert.equal(coordRecordSnap.exists, true);
  assert.equal(coordRecordSnap.data()?.normalizedName, "COORDINACION INGENIERIA");

  // 4. Provisioned coordinator logs in, gets 403 on admin APIs, and sees "Acceso restringido" on /admin.
  const coordCookie = await createHttpSessionCookie(coordEmail, password);

  const coordListUsers = await fetch(`${baseUrl}/api/admin/users`, {
    headers: { Cookie: coordCookie }
  });
  assert.equal(coordListUsers.status, 403);

  const coordAuditAttempt = await fetch(`${baseUrl}/api/admin/audit`, {
    headers: { Cookie: coordCookie }
  });
  assert.equal(coordAuditAttempt.status, 403);

  const coordCreateAttempt = await fetch(`${baseUrl}/api/admin/users`, {
    method: "POST",
    headers: {
      Cookie: coordCookie,
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      Origin: baseUrl
    },
    body: JSON.stringify({
      email: `escalate-${runId}@institucion.test`,
      displayName: "Escalado",
      password,
      role: "admin",
      active: true
    })
  });
  assert.equal(coordCreateAttempt.status, 403);

  const coordAdminPage = await fetch(`${baseUrl}/admin`, {
    headers: { Cookie: coordCookie },
    redirect: "manual"
  });
  assert.equal(coordAdminPage.status, 200);
  const coordAdminHtml = await coordAdminPage.text();
  assert.ok(coordAdminHtml.includes("Acceso restringido"));
  assert.ok(!coordAdminHtml.includes(adminEmail));

  // 5. Cross-origin CSRF on admin endpoints is rejected with zero mutations.
  const csrfPost = await fetch(`${baseUrl}/api/admin/users`, {
    method: "POST",
    headers: {
      Cookie: adminCookie,
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      Origin: "https://evil.example"
    },
    body: JSON.stringify({
      email: `csrf-${runId}@institucion.test`,
      displayName: "Bloqueado",
      password,
      role: "coordinator",
      active: true
    })
  });
  assert.equal(csrfPost.status, 403);

  const csrfPatch = await fetch(`${baseUrl}/api/admin/users/${coordUid}`, {
    method: "PATCH",
    headers: {
      Cookie: adminCookie,
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      Origin: "https://evil.example"
    },
    body: JSON.stringify({
      email: coordEmail,
      displayName: "Coordinación Ingeniería",
      role: "coordinator",
      active: false
    })
  });
  assert.equal(csrfPatch.status, 403);

  // 6. Admin replaces coordinator career/teacher scope via PUT /api/admin/coordinators/[uid]/scope.
  const scopeRes = await fetch(`${baseUrl}/api/admin/coordinators/${coordUid}/scope`, {
    method: "PUT",
    headers: {
      Cookie: adminCookie,
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      "X-Correlation-Id": scopeCorrelation,
      Origin: baseUrl
    },
    body: JSON.stringify({
      careerIds: ["career-isc", "career-isc"],
      teacherIds: ["teacher-1"]
    })
  });
  assert.equal(scopeRes.status, 200);
  const scopePayload = (await scopeRes.json()) as {
    ok: boolean;
    scope: { careerIds: string[]; teacherIds: string[] };
  };
  assert.deepEqual(scopePayload.scope.careerIds, ["career-isc"]);
  assert.deepEqual(scopePayload.scope.teacherIds, ["teacher-1"]);

  // 7. Admin deactivates coordinator; existing coordinator cookie is rejected immediately.
  const deactivateRes = await fetch(`${baseUrl}/api/admin/users/${coordUid}`, {
    method: "PATCH",
    headers: {
      Cookie: adminCookie,
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      "X-Correlation-Id": deactivateCorrelation,
      Origin: baseUrl
    },
    body: JSON.stringify({
      email: coordEmail,
      displayName: "Coordinación Ingeniería",
      role: "coordinator",
      active: false
    })
  });
  assert.equal(deactivateRes.status, 200);

  const coordPostDeactivate = await fetch(`${baseUrl}/api/auth/session`, {
    headers: { Cookie: coordCookie }
  });
  assert.equal(coordPostDeactivate.status, 401);

  const updatedCoordSnap = await adminDb.collection("coordinators").doc(coordUid).get();
  assert.equal(updatedCoordSnap.data()?.active, false);

  // 8. Admin cannot lock out or demote themselves.
  const selfLockout = await fetch(`${baseUrl}/api/admin/users/${adminUser.uid}`, {
    method: "PATCH",
    headers: {
      Cookie: adminCookie,
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      Origin: baseUrl
    },
    body: JSON.stringify({
      email: adminEmail,
      displayName: "Admin Principal",
      role: "admin",
      active: false
    })
  });
  assert.equal(selfLockout.status, 400);
  assert.equal(
    (
      await fetch(`${baseUrl}/api/auth/session`, {
        headers: { Cookie: adminCookie }
      })
    ).status,
    200
  );

  // 9. T11 Durable audit: unauthorized/coordinator denied; admin reads correlated events without secrets or phantom rejects.
  assert.equal((await fetch(`${baseUrl}/api/admin/audit`)).status, 401);
  assert.equal(
    (await fetch(`${baseUrl}/api/admin/audit`, { headers: { Cookie: coordCookie } })).status,
    401
  );

  const auditRes = await fetch(`${baseUrl}/api/admin/audit?entityId=${coordUid}`, {
    headers: { Cookie: adminCookie }
  });
  assert.equal(auditRes.status, 200);
  const auditPayload = (await auditRes.json()) as {
    ok: boolean;
    events: Array<{
      id: string;
      eventType: string;
      actorUid: string;
      actorRole: string;
      correlationId: string;
      before: Record<string, unknown> | null;
      after: Record<string, unknown> | null;
    }>;
  };
  assert.equal(auditPayload.ok, true);
  assert.equal(auditPayload.events.length, 3);

  const byType = new Map(auditPayload.events.map((event) => [event.eventType, event]));
  assert.equal(byType.get("user.provision")?.correlationId, provCorrelation);
  assert.equal(byType.get("user.provision")?.actorUid, adminUser.uid);
  assert.equal(byType.get("user.provision")?.before, null);
  assert.equal(byType.get("coordinator.scope.replace")?.correlationId, scopeCorrelation);
  assert.deepEqual(byType.get("coordinator.scope.replace")?.after, {
    careerIds: ["career-isc"],
    teacherIds: ["teacher-1"]
  });
  assert.equal(byType.get("user.update")?.correlationId, deactivateCorrelation);
  assert.equal(byType.get("user.update")?.before?.active, true);
  assert.equal(byType.get("user.update")?.after?.active, false);
  assert.equal(JSON.stringify(auditPayload.events).includes(password), false);

  const adminSelfAuditRes = await fetch(`${baseUrl}/api/admin/audit?entityId=${adminUser.uid}`, {
    headers: { Cookie: adminCookie }
  });
  assert.equal(adminSelfAuditRes.status, 200);
  assert.equal(((await adminSelfAuditRes.json()) as { events: unknown[] }).events.length, 0);

  await Promise.all([
    ...auditPayload.events.map((event) => adminDb.collection("auditEvents").doc(event.id).delete()),
    adminAuth.deleteUsers([selfSignupUser.uid, adminUser.uid, coordUid]),
    adminDb.collection("userProfiles").doc(adminUser.uid).delete(),
    adminDb.collection("userProfiles").doc(coordUid).delete(),
    adminDb.collection("coordinators").doc(coordUid).delete(),
    adminDb.collection("coordinatorCareers").doc(`${coordUid}__career-isc`).delete(),
    adminDb.collection("coordinatorTeachers").doc(`${coordUid}__teacher-1`).delete(),
    bootstrapRef.delete()
  ]);
});
