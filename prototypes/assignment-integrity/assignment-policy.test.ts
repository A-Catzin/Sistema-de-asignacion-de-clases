import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkAssignment, type AssignmentDraft, type AssignmentSnapshot } from './assignment-policy.ts';

const draft: AssignmentDraft = {
  teacherId: 'teacher-a', groupId: 'group-a', classroomId: 'room-a',
  groupClassroomId: 'room-b', assignedHoursHundredths: 150,
  slot: { day: 1, startMinute: 540, endMinute: 600, module: 0 },
};

const saved: AssignmentSnapshot = {
  ...draft, id: 'assignment-1', status: 'active', cycleId: 'previous-cycle',
  groupId: 'group-b', classroomId: 'room-c',
  slot: { ...draft.slot, startMinute: 570, endMinute: 630 },
};

const allowed = { ok: true, effectiveClassroomId: 'room-a' };

test('AC11: rejects a teacher overlap, including across cycles', () => {
  assert.deepEqual(checkAssignment(draft, [saved], 1000), { ok: false, reason: 'teacher-overlap' });
});

test('AC12: rejects a group overlap even with another teacher', () => {
  assert.deepEqual(checkAssignment(draft, [{ ...saved, groupId: draft.groupId, teacherId: 'teacher-b' }], 1000),
    { ok: false, reason: 'group-overlap' });
});

test('AC13 and AC17: checks the effective classroom on both sides and prefers the explicit room', () => {
  const existing = { ...saved, teacherId: 'teacher-b', classroomId: null, groupClassroomId: 'room-b' };
  assert.deepEqual(checkAssignment(draft, [existing], 1000), allowed);
  assert.deepEqual(checkAssignment({ ...draft, classroomId: null }, [existing], 1000),
    { ok: false, reason: 'classroom-overlap' });
  assert.deepEqual(checkAssignment({ ...draft, classroomId: null }, [], 1000),
    { ok: true, effectiveClassroomId: 'room-b' });
});

test('AC14: touching endpoints and different days do not overlap', () => {
  for (const slot of [{ ...saved.slot, startMinute: 600 }, { ...saved.slot, day: 2 }]) {
    assert.deepEqual(checkAssignment(draft, [{ ...saved, slot }], 1000), allowed);
  }
});

test('AC15: distinct positive modules coexist; equal or unmodular slots conflict', () => {
  const modular: AssignmentDraft = { ...draft, slot: { ...draft.slot, module: 1 } };
  assert.deepEqual(checkAssignment(modular, [{ ...saved, slot: { ...saved.slot, module: 2 } }], 1000), allowed);
  for (const module of [0, 1] as const) {
    assert.deepEqual(checkAssignment(modular, [{ ...saved, slot: { ...saved.slot, module } }], 1000),
      { ok: false, reason: 'teacher-overlap' });
  }
});

test('AC18: counts active hours across cycles exactly and rejects excess or invalid duration', () => {
  const prior = { ...saved, assignedHoursHundredths: 20, slot: { ...saved.slot, day: 2 } };
  const candidate = { ...draft, assignedHoursHundredths: 10 };
  assert.deepEqual(checkAssignment(candidate, [prior], 30), allowed);
  assert.deepEqual(checkAssignment(candidate, [prior], 29), { ok: false, reason: 'teacher-load-exceeded' });
  for (const assignedHoursHundredths of [0, -1, 1.5, 9901]) {
    assert.deepEqual(checkAssignment({ ...candidate, assignedHoursHundredths }, [], 10000),
      { ok: false, reason: 'invalid-assigned-hours' });
  }
});

test('AC19: editing excludes only its previous assignment from load and conflicts', () => {
  assert.deepEqual(checkAssignment(draft, [saved], 150, saved.id), allowed);
  const another = { ...saved, id: 'assignment-2' };
  assert.deepEqual(checkAssignment(draft, [saved, another], 300, saved.id),
    { ok: false, reason: 'teacher-overlap' });
});

test('AC20: a cancelled snapshot consumes neither hours nor room', () => {
  assert.deepEqual(checkAssignment(draft, [{ ...saved, status: 'cancelled', classroomId: 'room-a' }], 150), allowed);
});
