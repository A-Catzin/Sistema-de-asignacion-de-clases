import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import type { ActorContext } from './authz-policy.ts';
import { createLocalResourceAssignmentStore, type StoredAssignment } from './firestore-assignment.ts';

const host = process.env.FIRESTORE_EMULATOR_HOST ?? '';

const admin: ActorContext = {
  uid: 'admin-1',
  active: true,
  role: 'admin',
  careerIds: [],
  teacherIds: [],
};

const coordinator: ActorContext = {
  uid: 'coord-1',
  active: true,
  role: 'coordinator',
  coordinatorActive: true,
  careerIds: ['career-1'],
  teacherIds: ['teacher-1'],
};

const baseAssignment = {
  id: 'assign-1',
  cycleId: 'cycle-1',
  status: 'active',
  teacherId: 'teacher-1',
  groupId: 'group-1',
  groupSubjectId: 'gs-1',
  blockId: 'block-1',
  classroomId: 'room-1',
  groupClassroomId: 'room-1',
  assignedHoursHundredths: 200,
  slot: { day: 1, startMinute: 540, endMinute: 660, module: 0 },
} as const satisfies StoredAssignment;

test('AC02/AC04/AC23: unauthorized or closed-group assignment mutations persist zero records and zero audit events', async () => {
  const store = createLocalResourceAssignmentStore(host, randomUUID());

  assert.deepEqual(
    await store.add(baseAssignment, 600, {
      actor: null,
      careerId: 'career-1',
      groupStatus: 'draft',
      correlationId: 'corr-unauth',
    }),
    { ok: false, reason: 'unauthenticated-or-inactive' },
  );

  assert.deepEqual(
    await store.add(baseAssignment, 600, {
      actor: { ...coordinator, active: false },
      careerId: 'career-1',
      groupStatus: 'draft',
      correlationId: 'corr-inactive',
    }),
    { ok: false, reason: 'unauthenticated-or-inactive' },
  );

  assert.deepEqual(
    await store.add(baseAssignment, 600, {
      actor: { ...coordinator, coordinatorActive: false },
      careerId: 'career-1',
      groupStatus: 'draft',
      correlationId: 'corr-inactive-coord',
    }),
    { ok: false, reason: 'forbidden-scope' },
  );

  assert.deepEqual(
    await store.add(baseAssignment, 600, {
      actor: coordinator,
      careerId: 'career-other',
      groupStatus: 'draft',
      correlationId: 'corr-wrong-career',
    }),
    { ok: false, reason: 'forbidden-scope' },
  );

  assert.deepEqual(
    await store.add({ ...baseAssignment, teacherId: 'teacher-other' }, 600, {
      actor: coordinator,
      careerId: 'career-1',
      groupStatus: 'draft',
      correlationId: 'corr-wrong-teacher',
    }),
    { ok: false, reason: 'forbidden-scope' },
  );

  assert.deepEqual(
    await store.add(baseAssignment, 600, {
      actor: admin,
      careerId: 'career-1',
      groupStatus: 'final',
      correlationId: 'corr-final',
    }),
    { ok: false, reason: 'group-closed' },
  );

  assert.equal(await store.get(baseAssignment.id), null);
  assert.deepEqual(await store.listAuditEvents(), []);
  assert.equal(store.stats().writes, 0);
});

test('AC19/AC37: confirmed add, edit, and cancel commit one atomic audit event each; rejections and idempotent retries emit none', async () => {
  const store = createLocalResourceAssignmentStore(host, randomUUID());

  const addResult = await store.add(baseAssignment, 600, {
    actor: coordinator,
    careerId: 'career-1',
    groupStatus: 'draft',
    correlationId: 'corr-add-1',
    timestampIso: '2026-11-23T12:00:00.000Z',
  });
  assert.equal(addResult.ok, true);

  // Rejected business rule (hours exceed teacher max) must persist zero additional audit events.
  const rejectedEdit = await store.edit(
    baseAssignment.id,
    { ...baseAssignment, assignedHoursHundredths: 700 },
    600,
    {
      actor: coordinator,
      careerId: 'career-1',
      groupStatus: 'review',
      correlationId: 'corr-edit-rejected',
      timestampIso: '2026-11-23T12:01:00.000Z',
    },
  );
  assert.deepEqual(rejectedEdit, { ok: false, reason: 'teacher-load-exceeded' });

  const editedDraft = { ...baseAssignment, assignedHoursHundredths: 300, blockId: 'block-2' };
  const editResult = await store.edit(baseAssignment.id, editedDraft, 600, {
    actor: coordinator,
    careerId: 'career-1',
    groupStatus: 'review',
    correlationId: 'corr-edit-1',
    timestampIso: '2026-11-23T12:02:00.000Z',
  });
  assert.equal(editResult.ok, true);

  const cancelResult = await store.cancel(baseAssignment.id, {
    actor: coordinator,
    careerId: 'career-1',
    groupStatus: 'review',
    correlationId: 'corr-cancel-1',
    timestampIso: '2026-11-23T12:03:00.000Z',
  });
  assert.deepEqual(cancelResult, { ok: true });

  // Repeating cancel is idempotent and must emit zero additional audit events.
  const repeatCancel = await store.cancel(baseAssignment.id, {
    actor: coordinator,
    careerId: 'career-1',
    groupStatus: 'review',
    correlationId: 'corr-cancel-2',
    timestampIso: '2026-11-23T12:04:00.000Z',
  });
  assert.deepEqual(repeatCancel, { ok: true });

  const events = (await store.listAuditEvents()).sort((a, b) => a.timestampIso.localeCompare(b.timestampIso));
  assert.equal(events.length, 3);
  assert.deepEqual(
    events.map((event) => ({
      action: event.action,
      correlationId: event.correlationId,
      actorUid: event.actorUid,
      actorRole: event.actorRole,
    })),
    [
      { action: 'assignment.add', correlationId: 'corr-add-1', actorUid: 'coord-1', actorRole: 'coordinator' },
      { action: 'assignment.edit', correlationId: 'corr-edit-1', actorUid: 'coord-1', actorRole: 'coordinator' },
      { action: 'assignment.cancel', correlationId: 'corr-cancel-1', actorUid: 'coord-1', actorRole: 'coordinator' },
    ],
  );
  assert.equal(events[0].before, null);
  assert.equal(events[0].after.assignedHoursHundredths, 200);
  assert.equal(events[1].before?.assignedHoursHundredths, 200);
  assert.equal(events[1].after.assignedHoursHundredths, 300);
  assert.equal(events[2].before?.status, 'active');
  assert.equal(events[2].after.status, 'cancelled');
});
