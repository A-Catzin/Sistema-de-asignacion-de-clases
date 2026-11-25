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

test("T14: classrooms, schedule templates, base/custom blocks, module 0|1|2 rules, inactive preservation, and atomic audit", async () => {
  const runId = randomUUID().slice(0, 8);
  const password = "TempPassword123!";
  const adminEmail = `sch-admin-${runId}@institucion.test`;
  const coordAEmail = `sch-ca-${runId}@institucion.test`;
  const coordBEmail = `sch-cb-${runId}@institucion.test`;

  const [adminUser, coordAUser, coordBUser] = await Promise.all([
    adminAuth.createUser({ email: adminEmail, password, displayName: "Admin Horarios" }),
    adminAuth.createUser({ email: coordAEmail, password, displayName: "Coord A" }),
    adminAuth.createUser({ email: coordBEmail, password, displayName: "Coord B" })
  ]);

  await Promise.all([
    adminDb.collection("userProfiles").doc(adminUser.uid).set({
      email: adminEmail,
      displayName: "Admin Horarios",
      role: "admin",
      active: true,
      privilegesUpdatedAtMs: 0
    }),
    adminDb.collection("userProfiles").doc(coordAUser.uid).set({
      email: coordAEmail,
      displayName: "Coord A",
      role: "coordinator",
      active: true,
      coordinatorActive: true,
      privilegesUpdatedAtMs: 0
    }),
    adminDb.collection("userProfiles").doc(coordBUser.uid).set({
      email: coordBEmail,
      displayName: "Coord B",
      role: "coordinator",
      active: true,
      coordinatorActive: true,
      privilegesUpdatedAtMs: 0
    }),
    adminDb.collection("coordinators").doc(coordAUser.uid).set({
      profileId: coordAUser.uid,
      name: "Coord A",
      normalizedName: "COORD A",
      active: true
    }),
    adminDb.collection("coordinators").doc(coordBUser.uid).set({
      profileId: coordBUser.uid,
      name: "Coord B",
      normalizedName: "COORD B",
      active: true
    })
  ]);

  // 1. Unauthenticated access denied (401).
  assert.equal((await fetch(`${baseUrl}/api/schedules/classrooms`)).status, 401);
  assert.equal((await fetch(`${baseUrl}/api/schedules/templates`)).status, 401);
  assert.equal((await fetch(`${baseUrl}/api/schedules/blocks`)).status, 401);

  const adminCookie = await createSessionCookie(adminEmail, password);
  const coordACookie = await createSessionCookie(coordAEmail, password);
  const coordBCookie = await createSessionCookie(coordBEmail, password);

  // 2. Classrooms: CSRF rejected, coordinator denied creation, admin creates & deactivates preserving record.
  const csrfRoom = await fetch(`${baseUrl}/api/schedules/classrooms`, {
    method: "POST",
    headers: { Cookie: adminCookie, "Content-Type": "application/json" },
    body: JSON.stringify({ name: `Aula ${runId}` })
  });
  assert.equal(csrfRoom.status, 403);

  const coordCreateRoom = await fetch(`${baseUrl}/api/schedules/classrooms`, {
    method: "POST",
    headers: {
      Cookie: coordACookie,
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      Origin: baseUrl
    },
    body: JSON.stringify({ name: `Aula Prohibida ${runId}` })
  });
  assert.equal(coordCreateRoom.status, 403);

  const roomCorr = `corr-room-${runId}`;
  const createRoomRes = await fetch(`${baseUrl}/api/schedules/classrooms`, {
    method: "POST",
    headers: {
      Cookie: adminCookie,
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      "X-Correlation-Id": roomCorr,
      Origin: baseUrl
    },
    body: JSON.stringify({
      name: `Laboratorio Redes ${runId}`,
      kind: "Laboratorio",
      capacity: 32,
      active: true
    })
  });
  assert.equal(createRoomRes.status, 201);
  const classroom = ((await createRoomRes.json()) as { classroom: { id: string } }).classroom;

  // Duplicate classroom name -> 409.
  const dupRoomRes = await fetch(`${baseUrl}/api/schedules/classrooms`, {
    method: "POST",
    headers: {
      Cookie: adminCookie,
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      Origin: baseUrl
    },
    body: JSON.stringify({ name: `  laboratorio redes ${runId}  ` })
  });
  assert.equal(dupRoomRes.status, 409);

  // Deactivate classroom -> record preserved in full catalog (RN-05) and excluded when onlyActive=true.
  const deactivateRoomRes = await fetch(`${baseUrl}/api/schedules/classrooms/${classroom.id}`, {
    method: "PATCH",
    headers: {
      Cookie: adminCookie,
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      Origin: baseUrl
    },
    body: JSON.stringify({
      name: `Laboratorio Redes ${runId}`,
      kind: "Laboratorio",
      capacity: 32,
      active: false
    })
  });
  assert.equal(deactivateRoomRes.status, 200);

  const allRoomsRes = await fetch(`${baseUrl}/api/schedules/classrooms`, {
    headers: { Cookie: coordACookie }
  });
  const allRooms = ((await allRoomsRes.json()) as { classrooms: Array<{ id: string; active: boolean }> })
    .classrooms;
  assert.equal(allRooms.find((r) => r.id === classroom.id)?.active, false);

  const activeRoomsRes = await fetch(`${baseUrl}/api/schedules/classrooms?onlyActive=true`, {
    headers: { Cookie: coordACookie }
  });
  const activeRooms = ((await activeRoomsRes.json()) as { classrooms: Array<{ id: string }> }).classrooms;
  assert.equal(activeRooms.some((r) => r.id === classroom.id), false);

  // 3. Schedule templates: invalid modality+shift (400); valid sabatino-matutino template (201).
  // Note: templateModalityShifts is unique per (modality, shift), so we clean up at the end.
  const badModalityShiftRes = await fetch(`${baseUrl}/api/schedules/templates`, {
    method: "POST",
    headers: {
      Cookie: adminCookie,
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      Origin: baseUrl
    },
    body: JSON.stringify({
      code: `virt-vesp-${runId}`,
      label: "Inválida",
      modality: "virtual_modular",
      shift: "vespertino",
      startsAt: "14:00",
      endsAt: "19:00"
    })
  });
  assert.equal(badModalityShiftRes.status, 400);

  const sabTemplateCode = `sab-mat-${runId}`;
  const sabTemplateRes = await fetch(`${baseUrl}/api/schedules/templates`, {
    method: "POST",
    headers: {
      Cookie: adminCookie,
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      Origin: baseUrl
    },
    body: JSON.stringify({
      code: sabTemplateCode,
      label: `Sabatino matutino ${runId}`,
      modality: "sabatino",
      shift: "matutino",
      startsAt: "08:00",
      endsAt: "13:00",
      active: true
    })
  });
  assert.equal(sabTemplateRes.status, 201);
  const sabTemplate = ((await sabTemplateRes.json()) as { template: { id: string } }).template;

  // 4. Base blocks: sabatino with module 0 rejected (400 AC10); M1 and M2 at 08:00-09:30 coexist (201 RN-02).
  const invalidModZeroRes = await fetch(`${baseUrl}/api/schedules/blocks`, {
    method: "POST",
    headers: {
      Cookie: adminCookie,
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      Origin: baseUrl
    },
    body: JSON.stringify({
      templateId: sabTemplate.id,
      dayOfWeek: 6,
      startsAt: "08:00",
      endsAt: "09:30",
      module: 0,
      isCustom: false
    })
  });
  assert.equal(invalidModZeroRes.status, 400);

  const baseM1Res = await fetch(`${baseUrl}/api/schedules/blocks`, {
    method: "POST",
    headers: {
      Cookie: adminCookie,
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      Origin: baseUrl
    },
    body: JSON.stringify({
      templateId: sabTemplate.id,
      dayOfWeek: 6,
      startsAt: "08:00",
      endsAt: "09:30",
      module: 1,
      isCustom: false
    })
  });
  assert.equal(baseM1Res.status, 201);
  const baseM1Block = ((await baseM1Res.json()) as { block: { id: string } }).block;

  const baseM2Res = await fetch(`${baseUrl}/api/schedules/blocks`, {
    method: "POST",
    headers: {
      Cookie: adminCookie,
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      Origin: baseUrl
    },
    body: JSON.stringify({
      templateId: sabTemplate.id,
      dayOfWeek: 6,
      startsAt: "08:00",
      endsAt: "09:30",
      module: 2,
      isCustom: false
    })
  });
  assert.equal(baseM2Res.status, 201);
  const baseM2Block = ((await baseM2Res.json()) as { block: { id: string } }).block;

  // 5. Coordinator custom blocks (AC09):
  // - Cannot create base block (403)
  // - Out of template window 13:00-14:00 rejected (400)
  // - Overlapping M1 09:00-10:30 rejected (409)
  // - Valid non-overlapping M1 10:00-11:30 created (201)
  // - Coordinator B cannot see or toggle Coordinator A's custom block!
  const coordBaseDenied = await fetch(`${baseUrl}/api/schedules/blocks`, {
    method: "POST",
    headers: {
      Cookie: coordACookie,
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      Origin: baseUrl
    },
    body: JSON.stringify({
      templateId: sabTemplate.id,
      dayOfWeek: 6,
      startsAt: "10:00",
      endsAt: "11:30",
      module: 1,
      isCustom: false
    })
  });
  assert.equal(coordBaseDenied.status, 403);

  const outOfWindowRes = await fetch(`${baseUrl}/api/schedules/blocks`, {
    method: "POST",
    headers: {
      Cookie: coordACookie,
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      Origin: baseUrl
    },
    body: JSON.stringify({
      templateId: sabTemplate.id,
      dayOfWeek: 6,
      startsAt: "12:00",
      endsAt: "13:30",
      module: 1,
      isCustom: true
    })
  });
  assert.equal(outOfWindowRes.status, 400);

  const overlapCustomRes = await fetch(`${baseUrl}/api/schedules/blocks`, {
    method: "POST",
    headers: {
      Cookie: coordACookie,
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      Origin: baseUrl
    },
    body: JSON.stringify({
      templateId: sabTemplate.id,
      dayOfWeek: 6,
      startsAt: "09:00",
      endsAt: "10:30",
      module: 1,
      isCustom: true
    })
  });
  assert.equal(overlapCustomRes.status, 409);

  const customARes = await fetch(`${baseUrl}/api/schedules/blocks`, {
    method: "POST",
    headers: {
      Cookie: coordACookie,
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      Origin: baseUrl
    },
    body: JSON.stringify({
      templateId: sabTemplate.id,
      dayOfWeek: 6,
      startsAt: "10:00",
      endsAt: "11:30",
      module: 1,
      isCustom: true
    })
  });
  assert.equal(customARes.status, 201);
  const customABlock = ((await customARes.json()) as { block: { id: string; createdByUid: string } })
    .block;
  assert.equal(customABlock.createdByUid, coordAUser.uid);

  // Coordinator B sees base blocks [baseM1, baseM2] ONLY, NOT customABlock.
  const coordBBlocksRes = await fetch(
    `${baseUrl}/api/schedules/blocks?templateId=${sabTemplate.id}`,
    { headers: { Cookie: coordBCookie } }
  );
  assert.equal(coordBBlocksRes.status, 200);
  const coordBBlocks = ((await coordBBlocksRes.json()) as { blocks: Array<{ id: string }> }).blocks;
  assert.deepEqual(
    coordBBlocks.map((b) => b.id).sort(),
    [baseM1Block.id, baseM2Block.id].sort()
  );

  // Coordinator B cannot toggle Coordinator A's custom block (403).
  const coordBToggleDenied = await fetch(`${baseUrl}/api/schedules/blocks/${customABlock.id}`, {
    method: "PATCH",
    headers: {
      Cookie: coordBCookie,
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      Origin: baseUrl
    },
    body: JSON.stringify({ active: false })
  });
  assert.equal(coordBToggleDenied.status, 403);

  // Coordinator A can deactivate their own custom block (200), preserving historical doc.
  const coordAToggleOk = await fetch(`${baseUrl}/api/schedules/blocks/${customABlock.id}`, {
    method: "PATCH",
    headers: {
      Cookie: coordACookie,
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      Origin: baseUrl
    },
    body: JSON.stringify({ active: false })
  });
  assert.equal(coordAToggleOk.status, 200);

  // 6. Verify atomic audit records recorded for classroom.
  const roomAuditRes = await fetch(`${baseUrl}/api/admin/audit?entityId=${classroom.id}`, {
    headers: { Cookie: adminCookie }
  });
  assert.equal(roomAuditRes.status, 200);
  const roomAudits = ((await roomAuditRes.json()) as {
    events: Array<{ correlationId: string }>;
  }).events;
  assert.equal(roomAudits.length, 2);
  assert.ok(roomAudits.some((e) => e.correlationId === roomCorr));

  // Cleanup synthetic docs & users.
  const [auditToDelete, roomNamesSnap, slotLocksSnap] = await Promise.all([
    adminDb
      .collection("auditEvents")
      .where("entityId", "in", [
        classroom.id,
        sabTemplate.id,
        baseM1Block.id,
        baseM2Block.id,
        customABlock.id
      ])
      .get(),
    adminDb.collection("classroomNames").where("classroomId", "==", classroom.id).get(),
    adminDb
      .collection("scheduleBlockSlots")
      .where("blockId", "in", [baseM1Block.id, baseM2Block.id, customABlock.id])
      .get()
  ]);

  await Promise.all([
    ...auditToDelete.docs.map((doc) => doc.ref.delete()),
    ...roomNamesSnap.docs.map((doc) => doc.ref.delete()),
    ...slotLocksSnap.docs.map((doc) => doc.ref.delete()),
    adminAuth.deleteUsers([adminUser.uid, coordAUser.uid, coordBUser.uid]),
    adminDb.collection("userProfiles").doc(adminUser.uid).delete(),
    adminDb.collection("userProfiles").doc(coordAUser.uid).delete(),
    adminDb.collection("userProfiles").doc(coordBUser.uid).delete(),
    adminDb.collection("coordinators").doc(coordAUser.uid).delete(),
    adminDb.collection("coordinators").doc(coordBUser.uid).delete(),
    adminDb.collection("classrooms").doc(classroom.id).delete(),
    adminDb.collection("scheduleTemplates").doc(sabTemplate.id).delete(),
    adminDb.collection("templateCodes").doc(sabTemplateCode).delete(),
    adminDb.collection("templateModalityShifts").doc("sabatino__matutino").delete(),
    adminDb.collection("scheduleBlocks").doc(baseM1Block.id).delete(),
    adminDb.collection("scheduleBlocks").doc(baseM2Block.id).delete(),
    adminDb.collection("scheduleBlocks").doc(customABlock.id).delete()
  ]);
});
