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

test("T13: teachers CRUD, profiles, responsible coordinator, maxHours floor, AC31 breakdown, and atomic audit", async () => {
  const runId = randomUUID().slice(0, 8);
  const password = "TempPassword123!";
  const adminEmail = `tch-admin-${runId}@institucion.test`;
  const coordIscEmail = `tch-cisc-${runId}@institucion.test`;
  const coordDerEmail = `tch-cder-${runId}@institucion.test`;

  const [adminUser, coordIscUser, coordDerUser] = await Promise.all([
    adminAuth.createUser({ email: adminEmail, password, displayName: "Admin Docentes" }),
    adminAuth.createUser({ email: coordIscEmail, password, displayName: `Coord Sistemas ${runId}` }),
    adminAuth.createUser({ email: coordDerEmail, password, displayName: `Coord Derecho ${runId}` })
  ]);

  const careerIscId = `career-isc-${runId}`;
  const careerDerId = `career-der-${runId}`;

  await Promise.all([
    adminDb.collection("userProfiles").doc(adminUser.uid).set({
      email: adminEmail,
      displayName: "Admin Docentes",
      role: "admin",
      active: true,
      privilegesUpdatedAtMs: 0
    }),
    adminDb.collection("userProfiles").doc(coordIscUser.uid).set({
      email: coordIscEmail,
      displayName: `Coord Sistemas ${runId}`,
      role: "coordinator",
      active: true,
      coordinatorActive: true,
      privilegesUpdatedAtMs: 0
    }),
    adminDb.collection("userProfiles").doc(coordDerUser.uid).set({
      email: coordDerEmail,
      displayName: `Coord Derecho ${runId}`,
      role: "coordinator",
      active: true,
      coordinatorActive: true,
      privilegesUpdatedAtMs: 0
    }),
    adminDb.collection("coordinators").doc(coordIscUser.uid).set({
      profileId: coordIscUser.uid,
      name: `Coord Sistemas ${runId}`,
      normalizedName: `COORD SISTEMAS ${runId.toUpperCase()}`,
      active: true
    }),
    adminDb.collection("coordinators").doc(coordDerUser.uid).set({
      profileId: coordDerUser.uid,
      name: `Coord Derecho ${runId}`,
      normalizedName: `COORD DERECHO ${runId.toUpperCase()}`,
      active: true
    }),
    adminDb.collection("careers").doc(careerIscId).set({
      id: careerIscId,
      code: `ISC_${runId.toUpperCase()}`,
      name: `Ingeniería Sistemas ${runId}`,
      normalizedName: `INGENIERIA SISTEMAS ${runId.toUpperCase()}`,
      active: true,
      createdAtIso: new Date().toISOString(),
      updatedAtIso: new Date().toISOString()
    }),
    adminDb.collection("careers").doc(careerDerId).set({
      id: careerDerId,
      code: `DER_${runId.toUpperCase()}`,
      name: `Licenciatura Derecho ${runId}`,
      normalizedName: `LICENCIATURA DERECHO ${runId.toUpperCase()}`,
      active: true,
      createdAtIso: new Date().toISOString(),
      updatedAtIso: new Date().toISOString()
    }),
    adminDb.collection("coordinatorCareers").doc(`${coordIscUser.uid}__${careerIscId}`).set({
      coordinatorId: coordIscUser.uid,
      careerId: careerIscId
    }),
    adminDb.collection("coordinatorCareers").doc(`${coordDerUser.uid}__${careerDerId}`).set({
      coordinatorId: coordDerUser.uid,
      careerId: careerDerId
    })
  ]);

  // 1. Unauthenticated access denied (401).
  assert.equal((await fetch(`${baseUrl}/api/teachers`)).status, 401);

  const adminCookie = await createSessionCookie(adminEmail, password);
  const coordIscCookie = await createSessionCookie(coordIscEmail, password);

  const profileA = `ING_${runId.toUpperCase()}`;
  const profileB = `RED_${runId.toUpperCase()}`;

  for (const [code, name] of [
    [profileA, "Ingeniería"],
    [profileB, "Redes"]
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

  // 2. CSRF rejected (403) and coordinator cannot create teachers (403).
  const csrfPost = await fetch(`${baseUrl}/api/teachers`, {
    method: "POST",
    headers: { Cookie: adminCookie, "Content-Type": "application/json" },
    body: JSON.stringify({ name: `Docente ${runId}`, maxHours: 12 })
  });
  assert.equal(csrfPost.status, 403);

  const coordCreateDenied = await fetch(`${baseUrl}/api/teachers`, {
    method: "POST",
    headers: {
      Cookie: coordIscCookie,
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      Origin: baseUrl
    },
    body: JSON.stringify({ name: `Docente Coord ${runId}`, maxHours: 10 })
  });
  assert.equal(coordCreateDenied.status, 403);

  // Missing profile -> 400.
  const badProfileRes = await fetch(`${baseUrl}/api/teachers`, {
    method: "POST",
    headers: {
      Cookie: adminCookie,
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      Origin: baseUrl
    },
    body: JSON.stringify({
      name: `Docente Inválido ${runId}`,
      maxHours: 12,
      availableProfileCodes: ["NO_EXISTE"]
    })
  });
  assert.equal(badProfileRes.status, 400);

  // 3. Admin creates a shared teacher (linked to BOTH coordinators) and a DER-only teacher.
  const createCorr = `corr-tch-${runId}`;
  const sharedRes = await fetch(`${baseUrl}/api/teachers`, {
    method: "POST",
    headers: {
      Cookie: adminCookie,
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      "X-Correlation-Id": createCorr,
      Origin: baseUrl
    },
    body: JSON.stringify({
      name: `Mtro. Compartido ${runId}`,
      email: `compartido.${runId}@institucion.test`,
      maxHours: 14,
      responsibleCoordinatorId: coordIscUser.uid,
      coordinatorIds: [coordDerUser.uid],
      availableProfileCodes: [profileA]
    })
  });
  assert.equal(sharedRes.status, 201);
  const sharedTeacher = ((await sharedRes.json()) as {
    teacher: {
      id: string;
      maxHoursHundredths: number;
      responsibleCoordinatorId: string | null;
      availableProfileCodes: string[];
      coordinators: Array<{ id: string; isResponsible: boolean }>;
    };
  }).teacher;
  assert.equal(sharedTeacher.maxHoursHundredths, 1400);
  assert.equal(sharedTeacher.responsibleCoordinatorId, coordIscUser.uid);
  assert.deepEqual(sharedTeacher.availableProfileCodes, [profileA]);
  assert.equal(sharedTeacher.coordinators.length, 2);

  // Duplicate teacher name -> 409.
  const dupTeacherRes = await fetch(`${baseUrl}/api/teachers`, {
    method: "POST",
    headers: {
      Cookie: adminCookie,
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      Origin: baseUrl
    },
    body: JSON.stringify({
      name: `  mtro. compartido ${runId}  `,
      maxHours: 10
    })
  });
  assert.equal(dupTeacherRes.status, 409);

  const derOnlyRes = await fetch(`${baseUrl}/api/teachers`, {
    method: "POST",
    headers: {
      Cookie: adminCookie,
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      Origin: baseUrl
    },
    body: JSON.stringify({
      name: `Lic. Exclusivo Derecho ${runId}`,
      maxHours: 10,
      responsibleCoordinatorId: coordDerUser.uid,
      availableProfileCodes: []
    })
  });
  assert.equal(derOnlyRes.status, 201);
  const derOnlyTeacher = ((await derOnlyRes.json()) as { teacher: { id: string } }).teacher;

  // 4. Seed cross-cycle active + cancelled assignments to test AC18, RN-04, and AC31 breakdown.
  const secretGroupIscId = `secret-grp-isc-${runId}`;
  const secretGroupDerId = `secret-grp-der-${runId}`;
  const asgIscActiveId = `asg-isc-act-${runId}`;
  const asgDerActiveId = `asg-der-act-${runId}`;
  const asgIscCancelledId = `asg-isc-can-${runId}`;

  await Promise.all([
    adminDb.collection("groups").doc(secretGroupIscId).set({
      id: secretGroupIscId,
      careerId: careerIscId,
      cycleId: "cycle-2026-1",
      status: "draft"
    }),
    adminDb.collection("groups").doc(secretGroupDerId).set({
      id: secretGroupDerId,
      careerId: careerDerId,
      cycleId: "cycle-2026-2",
      status: "draft"
    }),
    adminDb.collection("assignments").doc(asgIscActiveId).set({
      id: asgIscActiveId,
      teacherId: sharedTeacher.id,
      groupId: secretGroupIscId,
      cycleId: "cycle-2026-1",
      status: "active",
      assignedHoursHundredths: 600
    }),
    adminDb.collection("assignments").doc(asgDerActiveId).set({
      id: asgDerActiveId,
      teacherId: sharedTeacher.id,
      groupId: secretGroupDerId,
      cycleId: "cycle-2026-2",
      status: "active",
      assignedHoursHundredths: 400
    }),
    adminDb.collection("assignments").doc(asgIscCancelledId).set({
      id: asgIscCancelledId,
      teacherId: sharedTeacher.id,
      groupId: secretGroupIscId,
      cycleId: "cycle-2026-1",
      status: "cancelled",
      assignedHoursHundredths: 300
    })
  ]);

  // 5. Coordinator ISC lists teachers: sees ONLY sharedTeacher with 10h total (6h ISC + 4h DER) and zero foreign group/assignment IDs.
  const coordListRes = await fetch(`${baseUrl}/api/teachers`, {
    headers: { Cookie: coordIscCookie }
  });
  assert.equal(coordListRes.status, 200);
  const rawCoordListText = await coordListRes.text();
  assert.equal(rawCoordListText.includes(secretGroupDerId), false);
  assert.equal(rawCoordListText.includes(asgDerActiveId), false);

  const coordList = JSON.parse(rawCoordListText) as {
    teachers: Array<{
      id: string;
      assignedHoursHundredths: number;
      availableHoursHundredths: number;
      loadBreakdown: Array<{
        coordinatorId: string | null;
        coordinatorName: string;
        assignedHoursHundredths: number;
        isOwnScope: boolean;
      }>;
    }>;
  };
  assert.deepEqual(
    coordList.teachers.map((t) => t.id),
    [sharedTeacher.id]
  );
  assert.equal(coordList.teachers[0].assignedHoursHundredths, 1000);
  assert.equal(coordList.teachers[0].availableHoursHundredths, 400);
  assert.deepEqual(coordList.teachers[0].loadBreakdown, [
    {
      coordinatorId: coordIscUser.uid,
      coordinatorName: `Coord Sistemas ${runId}`,
      assignedHoursHundredths: 600,
      isOwnScope: true
    },
    {
      coordinatorId: coordDerUser.uid,
      coordinatorName: `Coord Derecho ${runId}`,
      assignedHoursHundredths: 400,
      isOwnScope: false
    }
  ]);

  // 6. Coordinator operational updates: maxHours < 10h rejected (409); maxHours = 10h + profiles [profileA, profileB] allowed (200).
  const belowAssignedRes = await fetch(`${baseUrl}/api/teachers/${sharedTeacher.id}`, {
    method: "PATCH",
    headers: {
      Cookie: coordIscCookie,
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      Origin: baseUrl
    },
    body: JSON.stringify({ maxHours: 9.5 })
  });
  assert.equal(belowAssignedRes.status, 409);

  const validOperationalRes = await fetch(`${baseUrl}/api/teachers/${sharedTeacher.id}`, {
    method: "PATCH",
    headers: {
      Cookie: coordIscCookie,
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      Origin: baseUrl
    },
    body: JSON.stringify({
      maxHours: 10,
      availableProfileCodes: [profileA, profileB]
    })
  });
  assert.equal(validOperationalRes.status, 200);
  const updatedByCoord = ((await validOperationalRes.json()) as {
    teacher: { maxHoursHundredths: number; availableHoursHundredths: number; availableProfileCodes: string[] };
  }).teacher;
  assert.equal(updatedByCoord.maxHoursHundredths, 1000);
  assert.equal(updatedByCoord.availableHoursHundredths, 0);
  assert.deepEqual(updatedByCoord.availableProfileCodes, [profileA, profileB].sort());

  // Coordinator cannot change general fields (403) or unlinked teacher (403).
  const coordRenameDenied = await fetch(`${baseUrl}/api/teachers/${sharedTeacher.id}`, {
    method: "PATCH",
    headers: {
      Cookie: coordIscCookie,
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      Origin: baseUrl
    },
    body: JSON.stringify({ name: "Nombre Alterado", maxHours: 10 })
  });
  assert.equal(coordRenameDenied.status, 403);

  const coordUnlinkedDenied = await fetch(`${baseUrl}/api/teachers/${derOnlyTeacher.id}`, {
    method: "PATCH",
    headers: {
      Cookie: coordIscCookie,
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      Origin: baseUrl
    },
    body: JSON.stringify({ maxHours: 12 })
  });
  assert.equal(coordUnlinkedDenied.status, 403);

  // 7. Verify atomic audit events recorded for sharedTeacher.
  const auditRes = await fetch(`${baseUrl}/api/admin/audit?entityId=${sharedTeacher.id}`, {
    headers: { Cookie: adminCookie }
  });
  assert.equal(auditRes.status, 200);
  const auditEvents = ((await auditRes.json()) as {
    events: Array<{ id: string; correlationId: string; actorUid: string }>;
  }).events;
  assert.equal(auditEvents.length, 2);
  assert.ok(auditEvents.some((event) => event.correlationId === createCorr));

  // Cleanup synthetic docs & users.
  const [auditToDelete, namesSnap, availProfilesSnap, coordTeacherSnap] = await Promise.all([
    adminDb
      .collection("auditEvents")
      .where("entityId", "in", [profileA, profileB, sharedTeacher.id, derOnlyTeacher.id])
      .get(),
    adminDb
      .collection("teacherNames")
      .where("teacherId", "in", [sharedTeacher.id, derOnlyTeacher.id])
      .get(),
    adminDb
      .collection("teacherAvailableProfiles")
      .where("teacherId", "in", [sharedTeacher.id, derOnlyTeacher.id])
      .get(),
    adminDb
      .collection("coordinatorTeachers")
      .where("teacherId", "in", [sharedTeacher.id, derOnlyTeacher.id])
      .get()
  ]);

  await Promise.all([
    ...auditToDelete.docs.map((doc) => doc.ref.delete()),
    ...namesSnap.docs.map((doc) => doc.ref.delete()),
    ...availProfilesSnap.docs.map((doc) => doc.ref.delete()),
    ...coordTeacherSnap.docs.map((doc) => doc.ref.delete()),
    adminAuth.deleteUsers([adminUser.uid, coordIscUser.uid, coordDerUser.uid]),
    adminDb.collection("userProfiles").doc(adminUser.uid).delete(),
    adminDb.collection("userProfiles").doc(coordIscUser.uid).delete(),
    adminDb.collection("userProfiles").doc(coordDerUser.uid).delete(),
    adminDb.collection("coordinators").doc(coordIscUser.uid).delete(),
    adminDb.collection("coordinators").doc(coordDerUser.uid).delete(),
    adminDb.collection("careers").doc(careerIscId).delete(),
    adminDb.collection("careers").doc(careerDerId).delete(),
    adminDb.collection("coordinatorCareers").doc(`${coordIscUser.uid}__${careerIscId}`).delete(),
    adminDb.collection("coordinatorCareers").doc(`${coordDerUser.uid}__${careerDerId}`).delete(),
    adminDb.collection("teacherProfiles").doc(profileA).delete(),
    adminDb.collection("teacherProfiles").doc(profileB).delete(),
    adminDb.collection("teachers").doc(sharedTeacher.id).delete(),
    adminDb.collection("teachers").doc(derOnlyTeacher.id).delete(),
    adminDb.collection("groups").doc(secretGroupIscId).delete(),
    adminDb.collection("groups").doc(secretGroupDerId).delete(),
    adminDb.collection("assignments").doc(asgIscActiveId).delete(),
    adminDb.collection("assignments").doc(asgDerActiveId).delete(),
    adminDb.collection("assignments").doc(asgIscCancelledId).delete()
  ]);
});
