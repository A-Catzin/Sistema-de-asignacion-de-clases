import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authorizeAssignmentMutation, authorizeCycleActivation, type ActorContext } from './authz-policy.ts';

const admin: ActorContext = {
  uid: 'admin-1',
  active: true,
  role: 'admin',
  careerIds: [],
  teacherIds: [],
};

const coordinatorA: ActorContext = {
  uid: 'coord-a',
  active: true,
  role: 'coordinator',
  coordinatorActive: true,
  careerIds: ['career-1'],
  teacherIds: ['teacher-shared', 'teacher-1'],
};

const coordinatorB: ActorContext = {
  uid: 'coord-b',
  active: true,
  role: 'coordinator',
  coordinatorActive: true,
  careerIds: ['career-2'],
  teacherIds: ['teacher-shared'],
};

test('AC02: rejects unauthenticated and inactive actors for assignments and cycle activation', () => {
  assert.deepEqual(authorizeCycleActivation(null), { ok: false, reason: 'unauthenticated-or-inactive' });
  assert.deepEqual(authorizeCycleActivation({ ...admin, active: false }), {
    ok: false,
    reason: 'unauthenticated-or-inactive',
  });
  assert.deepEqual(
    authorizeAssignmentMutation(null, {
      action: 'add',
      careerId: 'career-1',
      teacherId: 'teacher-1',
      groupStatus: 'draft',
    }),
    { ok: false, reason: 'unauthenticated-or-inactive' },
  );
  assert.deepEqual(
    authorizeAssignmentMutation(
      { ...coordinatorA, active: false },
      { action: 'add', careerId: 'career-1', teacherId: 'teacher-1', groupStatus: 'draft' },
    ),
    { ok: false, reason: 'unauthenticated-or-inactive' },
  );
});

test('AC30: only active admins can activate academic cycles', () => {
  assert.deepEqual(authorizeCycleActivation(admin), { ok: true });
  assert.deepEqual(authorizeCycleActivation(coordinatorA), { ok: false, reason: 'forbidden-role' });
});

test('AC04 and AC19: coordinator scope enforces active coordinator, career, and teacher links', () => {
  assert.deepEqual(
    authorizeAssignmentMutation(coordinatorA, {
      action: 'add',
      careerId: 'career-1',
      teacherId: 'teacher-shared',
      groupStatus: 'draft',
    }),
    { ok: true },
  );
  assert.deepEqual(
    authorizeAssignmentMutation(coordinatorA, {
      action: 'edit',
      careerId: 'career-1',
      teacherId: 'teacher-shared',
      groupStatus: 'review',
    }),
    { ok: true },
  );
  // Shared teacher does not grant coordinator B access to career 1.
  assert.deepEqual(
    authorizeAssignmentMutation(coordinatorB, {
      action: 'add',
      careerId: 'career-1',
      teacherId: 'teacher-shared',
      groupStatus: 'draft',
    }),
    { ok: false, reason: 'forbidden-scope' },
  );
  // Coordinator A cannot assign an unlinked teacher even inside career 1.
  assert.deepEqual(
    authorizeAssignmentMutation(coordinatorA, {
      action: 'add',
      careerId: 'career-1',
      teacherId: 'teacher-other',
      groupStatus: 'draft',
    }),
    { ok: false, reason: 'forbidden-scope' },
  );
  // Inactive coordinator record loses scope even if profile is active.
  assert.deepEqual(
    authorizeAssignmentMutation(
      { ...coordinatorA, coordinatorActive: false },
      { action: 'cancel', careerId: 'career-1', groupStatus: 'draft' },
    ),
    { ok: false, reason: 'forbidden-scope' },
  );
});

test('AC23: closed final/archived groups reject mutations; draft/review/legacy active allow authorized actors', () => {
  for (const groupStatus of ['final', 'archived'] as const) {
    assert.deepEqual(
      authorizeAssignmentMutation(admin, {
        action: 'add',
        careerId: 'career-1',
        teacherId: 'teacher-1',
        groupStatus,
      }),
      { ok: false, reason: 'group-closed' },
    );
  }
  for (const groupStatus of ['draft', 'review', 'active'] as const) {
    assert.deepEqual(
      authorizeAssignmentMutation(admin, {
        action: 'add',
        careerId: 'career-any',
        teacherId: 'teacher-any',
        groupStatus,
      }),
      { ok: true },
    );
  }
});
