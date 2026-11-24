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

async function createSessionCookie(email: string, password: string): Promise<string> {
  const tokenRes = await fetch(
    `http://${authEmulatorHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-local-api-key`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true })
    }
  );
  assert.equal(tokenRes.status, 200);
  const { idToken } = (await tokenRes.json()) as { idToken: string };
  const sessionRes = await fetch(`${baseUrl}/api/auth/session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      Origin: baseUrl
    },
    body: JSON.stringify({ idToken })
  });
  assert.equal(sessionRes.status, 200);
  const cookieHeader = sessionRes.headers
    .getSetCookie()
    .find((entry) => entry.startsWith("__session="));
  assert.ok(cookieHeader);
  return cookieHeader.split(";")[0];
}

test("T12: academic offer CRUD, relational validation, scope filtering, and atomic audit", async () => {
  const runId = randomUUID().slice(0, 8);
  const password = "TempPassword123!";
  const adminEmail = `acad-admin-${runId}@institucion.test`;
  const coordEmail = `acad-coord-${runId}@institucion.test`;

  const [adminUser, coordUser] = await Promise.all([
    adminAuth.createUser({ email: adminEmail, password, displayName: "Admin Oferta" }),
    adminAuth.createUser({ email: coordEmail, password, displayName: "Coord ISC" })
  ]);

  await Promise.all([
    adminDb.collection("userProfiles").doc(adminUser.uid).set({
      email: adminEmail,
      displayName: "Admin Oferta",
      role: "admin",
      active: true,
      privilegesUpdatedAtMs: 0
    }),
    adminDb.collection("userProfiles").doc(coordUser.uid).set({
      email: coordEmail,
      displayName: "Coord ISC",
      role: "coordinator",
      active: true,
      coordinatorActive: true,
      privilegesUpdatedAtMs: 0
    }),
    adminDb.collection("coordinators").doc(coordUser.uid).set({
      profileId: coordUser.uid,
      name: "Coord ISC",
      normalizedName: "COORD ISC",
      active: true
    })
  ]);

  // 1. Unauthenticated access is denied.
  assert.equal((await fetch(`${baseUrl}/api/academic/careers`)).status, 401);
  assert.equal((await fetch(`${baseUrl}/api/academic/subjects`)).status, 401);
  assert.equal((await fetch(`${baseUrl}/api/academic/profiles`)).status, 401);

  const adminCookie = await createSessionCookie(adminEmail, password);
  const coordCookie = await createSessionCookie(coordEmail, password);

  const profileA = `ING_${runId.toUpperCase()}`;
  const profileB = `MAT_${runId.toUpperCase()}`;

  // 2. CSRF rejected; admin creates two profiles and two careers.
  const csrfCreate = await fetch(`${baseUrl}/api/academic/profiles`, {
    method: "POST",
    headers: { Cookie: adminCookie, "Content-Type": "application/json" },
    body: JSON.stringify({ code: profileA, name: "Ingeniería" })
  });
  assert.equal(csrfCreate.status, 403);

  for (const [code, name] of [
    [profileA, "Ingeniería"],
    [profileB, "Matemáticas"]
  ]) {
    const res = await fetch(`${baseUrl}/api/academic/profiles`, {
      method: "POST",
      headers: {
        Cookie: adminCookie,
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
        Origin: baseUrl
      },
      body: JSON.stringify({ code, name, active: true })
    });
    assert.equal(res.status, 201);
  }

  const iscCode = `ISC_${runId.toUpperCase()}`;
  const admCode = `ADM_${runId.toUpperCase()}`;

  const iscRes = await fetch(`${baseUrl}/api/academic/careers`, {
    method: "POST",
    headers: {
      Cookie: adminCookie,
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      Origin: baseUrl
    },
    body: JSON.stringify({ code: iscCode, name: `Sistemas ${runId}`, active: true })
  });
  assert.equal(iscRes.status, 201);
  const iscCareer = ((await iscRes.json()) as { career: { id: string } }).career;

  const admRes = await fetch(`${baseUrl}/api/academic/careers`, {
    method: "POST",
    headers: {
      Cookie: adminCookie,
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      Origin: baseUrl
    },
    body: JSON.stringify({ code: admCode, name: `Administración ${runId}`, active: true })
  });
  assert.equal(admRes.status, 201);
  const admCareer = ((await admRes.json()) as { career: { id: string } }).career;

  // Duplicate career code -> 409.
  const dupCareer = await fetch(`${baseUrl}/api/academic/careers`, {
    method: "POST",
    headers: {
      Cookie: adminCookie,
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      Origin: baseUrl
    },
    body: JSON.stringify({ code: iscCode, name: `Otra ${runId}`, active: true })
  });
  assert.equal(dupCareer.status, 409);

  // Link coordinator ONLY to ISC career.
  await adminDb.collection("coordinatorCareers").doc(`${coordUser.uid}__${iscCareer.id}`).set({
    coordinatorId: coordUser.uid,
    careerId: iscCareer.id
  });

  // 3. Admin creates ISC and ADM subjects; checks relational integrity (404 career, 400 profile, 409 duplicate code/name).
  const iscSubInitialCode = `ISC06_${runId.toUpperCase()}`;
  const iscSubUpdatedCode = `ISC07_${runId.toUpperCase()}`;

  const missingCareerSub = await fetch(`${baseUrl}/api/academic/subjects`, {
    method: "POST",
    headers: {
      Cookie: adminCookie,
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      Origin: baseUrl
    },
    body: JSON.stringify({
      careerId: "missing-career",
      code: iscSubInitialCode,
      name: "Base de Datos",
      quarter: 3,
      defaultHours: 4,
      requiredProfileCodes: [profileA]
    })
  });
  assert.equal(missingCareerSub.status, 404);

  const missingProfileSub = await fetch(`${baseUrl}/api/academic/subjects`, {
    method: "POST",
    headers: {
      Cookie: adminCookie,
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      Origin: baseUrl
    },
    body: JSON.stringify({
      careerId: iscCareer.id,
      code: iscSubInitialCode,
      name: "Base de Datos",
      quarter: 3,
      defaultHours: 4,
      requiredProfileCodes: ["NO_EXISTE"]
    })
  });
  assert.equal(missingProfileSub.status, 400);

  const subCorr = `corr-sub-${runId}`;
  const iscSubRes = await fetch(`${baseUrl}/api/academic/subjects`, {
    method: "POST",
    headers: {
      Cookie: adminCookie,
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      "X-Correlation-Id": subCorr,
      Origin: baseUrl
    },
    body: JSON.stringify({
      careerId: iscCareer.id,
      code: `  ${iscSubInitialCode.toLowerCase()}  `,
      name: `Bases de Datos ${runId}`,
      quarter: 3,
      defaultHours: 4.5,
      requiredProfileCodes: [profileA, profileB]
    })
  });
  assert.equal(iscSubRes.status, 201);
  const iscSub = ((await iscSubRes.json()) as {
    subject: {
      id: string;
      code: string;
      defaultHoursHundredths: number;
      requiredProfileCodes: string[];
    };
  }).subject;
  assert.equal(iscSub.code, iscSubInitialCode);
  assert.equal(iscSub.defaultHoursHundredths, 450);
  assert.deepEqual(iscSub.requiredProfileCodes, [profileA, profileB].sort());

  // Duplicate subject code in same career -> 409.
  const dupCodeRes = await fetch(`${baseUrl}/api/academic/subjects`, {
    method: "POST",
    headers: {
      Cookie: adminCookie,
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      Origin: baseUrl
    },
    body: JSON.stringify({
      careerId: iscCareer.id,
      code: iscSubInitialCode,
      name: `Otra Materia ${runId}`,
      quarter: 5,
      defaultHours: 4,
      requiredProfileCodes: []
    })
  });
  assert.equal(dupCodeRes.status, 409);

  // Duplicate subject name in same career + quarter -> 409 even with a different code.
  const dupSubRes = await fetch(`${baseUrl}/api/academic/subjects`, {
    method: "POST",
    headers: {
      Cookie: adminCookie,
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      Origin: baseUrl
    },
    body: JSON.stringify({
      careerId: iscCareer.id,
      code: `ALT_${runId.toUpperCase()}`,
      name: `bases de datos ${runId}`,
      quarter: 3,
      defaultHours: 4,
      requiredProfileCodes: []
    })
  });
  assert.equal(dupSubRes.status, 409);

  // Same Clave in a DIFFERENT career is allowed (uniqueness is per career).
  const admSubRes = await fetch(`${baseUrl}/api/academic/subjects`, {
    method: "POST",
    headers: {
      Cookie: adminCookie,
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      Origin: baseUrl
    },
    body: JSON.stringify({
      careerId: admCareer.id,
      code: iscSubInitialCode,
      name: `Contabilidad ${runId}`,
      quarter: 1,
      defaultHours: 3,
      requiredProfileCodes: []
    })
  });
  assert.equal(admSubRes.status, 201);
  const admSub = ((await admSubRes.json()) as { subject: { id: string } }).subject;

  // 4. Coordinator sees ONLY ISC career & subjects and cannot mutate general catalogs or ADM subjects.
  const coordCareersRes = await fetch(`${baseUrl}/api/academic/careers`, {
    headers: { Cookie: coordCookie }
  });
  assert.equal(coordCareersRes.status, 200);
  const coordCareers = ((await coordCareersRes.json()) as { careers: Array<{ id: string }> })
    .careers;
  assert.deepEqual(
    coordCareers.map((c) => c.id),
    [iscCareer.id]
  );

  const coordSubjectsRes = await fetch(`${baseUrl}/api/academic/subjects`, {
    headers: { Cookie: coordCookie }
  });
  assert.equal(coordSubjectsRes.status, 200);
  const coordSubjects = ((await coordSubjectsRes.json()) as { subjects: Array<{ id: string }> })
    .subjects;
  assert.deepEqual(
    coordSubjects.map((s) => s.id),
    [iscSub.id]
  );

  const coordForeignFilter = await fetch(
    `${baseUrl}/api/academic/subjects?careerId=${admCareer.id}`,
    { headers: { Cookie: coordCookie } }
  );
  assert.equal(coordForeignFilter.status, 403);

  const coordCreateCareer = await fetch(`${baseUrl}/api/academic/careers`, {
    method: "POST",
    headers: {
      Cookie: coordCookie,
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      Origin: baseUrl
    },
    body: JSON.stringify({ code: `FORBID_${runId}`, name: "Prohibida" })
  });
  assert.equal(coordCreateCareer.status, 403);

  // 5. Coordinator updates defaultHours on ISC subject (200), but cannot alter name/requirements or ADM subject.
  const coordHoursRes = await fetch(`${baseUrl}/api/academic/subjects/${iscSub.id}`, {
    method: "PATCH",
    headers: {
      Cookie: coordCookie,
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      Origin: baseUrl
    },
    body: JSON.stringify({ defaultHours: 5 })
  });
  assert.equal(coordHoursRes.status, 200);
  assert.equal(
    ((await coordHoursRes.json()) as { subject: { defaultHoursHundredths: number } }).subject
      .defaultHoursHundredths,
    500
  );

  const coordNameAttempt = await fetch(`${baseUrl}/api/academic/subjects/${iscSub.id}`, {
    method: "PATCH",
    headers: {
      Cookie: coordCookie,
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      Origin: baseUrl
    },
    body: JSON.stringify({ name: "Nombre Alterado", defaultHours: 5 })
  });
  assert.equal(coordNameAttempt.status, 403);

  const coordCodeAttempt = await fetch(`${baseUrl}/api/academic/subjects/${iscSub.id}`, {
    method: "PATCH",
    headers: {
      Cookie: coordCookie,
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      Origin: baseUrl
    },
    body: JSON.stringify({ code: "HACK01", defaultHours: 5 })
  });
  assert.equal(coordCodeAttempt.status, 403);

  const coordAdmHoursAttempt = await fetch(`${baseUrl}/api/academic/subjects/${admSub.id}`, {
    method: "PATCH",
    headers: {
      Cookie: coordCookie,
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      Origin: baseUrl
    },
    body: JSON.stringify({ defaultHours: 6 })
  });
  assert.equal(coordAdmHoursAttempt.status, 403);

  // 6. Admin updates subject code + replaces requirements and verifies old lock/link cleanup + audit events.
  const adminUpdateReqRes = await fetch(`${baseUrl}/api/academic/subjects/${iscSub.id}`, {
    method: "PATCH",
    headers: {
      Cookie: adminCookie,
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      Origin: baseUrl
    },
    body: JSON.stringify({
      careerId: iscCareer.id,
      code: iscSubUpdatedCode,
      name: `Bases de Datos ${runId}`,
      quarter: 3,
      defaultHours: 5,
      requiredProfileCodes: [profileA]
    })
  });
  assert.equal(adminUpdateReqRes.status, 200);
  assert.equal(
    ((await adminUpdateReqRes.json()) as { subject: { code: string } }).subject.code,
    iscSubUpdatedCode
  );

  const oldCodeLockId = Buffer.from(JSON.stringify([iscCareer.id, iscSubInitialCode])).toString(
    "base64url"
  );
  const oldCodeLockSnap = await adminDb.collection("subjectCodes").doc(oldCodeLockId).get();
  assert.equal(oldCodeLockSnap.exists, false);

  const removedReqSnap = await adminDb
    .collection("subjectRequirements")
    .doc(`${iscSub.id}__${profileB}`)
    .get();
  assert.equal(removedReqSnap.exists, false);

  const subAuditRes = await fetch(`${baseUrl}/api/admin/audit?entityId=${iscSub.id}`, {
    headers: { Cookie: adminCookie }
  });
  assert.equal(subAuditRes.status, 200);
  const subAudits = ((await subAuditRes.json()) as {
    events: Array<{ id: string; correlationId: string; actorUid: string }>;
  }).events;
  assert.equal(subAudits.length, 3);
  assert.ok(subAudits.some((event) => event.correlationId === subCorr));

  // Cleanup synthetic docs & users.
  const auditToDelete = await adminDb
    .collection("auditEvents")
    .where("entityId", "in", [profileA, profileB, iscCareer.id, admCareer.id, iscSub.id, admSub.id])
    .get();

  const [keysSnap, codesSnap] = await Promise.all([
    adminDb
      .collection("subjectKeys")
      .where("subjectId", "in", [iscSub.id, admSub.id])
      .get(),
    adminDb
      .collection("subjectCodes")
      .where("subjectId", "in", [iscSub.id, admSub.id])
      .get()
  ]);

  await Promise.all([
    ...auditToDelete.docs.map((doc) => doc.ref.delete()),
    ...keysSnap.docs.map((doc) => doc.ref.delete()),
    ...codesSnap.docs.map((doc) => doc.ref.delete()),
    adminAuth.deleteUsers([adminUser.uid, coordUser.uid]),
    adminDb.collection("userProfiles").doc(adminUser.uid).delete(),
    adminDb.collection("userProfiles").doc(coordUser.uid).delete(),
    adminDb.collection("coordinators").doc(coordUser.uid).delete(),
    adminDb.collection("coordinatorCareers").doc(`${coordUser.uid}__${iscCareer.id}`).delete(),
    adminDb.collection("teacherProfiles").doc(profileA).delete(),
    adminDb.collection("teacherProfiles").doc(profileB).delete(),
    adminDb.collection("careers").doc(iscCareer.id).delete(),
    adminDb.collection("careers").doc(admCareer.id).delete(),
    adminDb.collection("careerCodes").doc(iscCode).delete(),
    adminDb.collection("careerCodes").doc(admCode).delete(),
    adminDb.collection("subjects").doc(iscSub.id).delete(),
    adminDb.collection("subjects").doc(admSub.id).delete(),
    adminDb.collection("subjectRequirements").doc(`${iscSub.id}__${profileA}`).delete()
  ]);
});
