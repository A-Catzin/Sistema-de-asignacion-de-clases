import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import type { ActorContext } from './authz-policy.ts';
import { createLocalCycleActivationStore, type CycleSeedData } from './firestore-cycle-activation.ts';

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
  teacherIds: [],
};

function sampleSeed(): CycleSeedData {
  return {
    activeCycleId: 'cycle-2026-1',
    cycles: [
      { id: 'cycle-2026-0', code: '2026-0', name: '2026-0', status: 'finalized', active: false },
      { id: 'cycle-2026-1', code: '2026-1', name: '2026-1', status: 'active', active: true },
      { id: 'cycle-2026-2', code: '2026-2', name: '2026-2', status: 'draft', active: false },
    ],
    subjects: [
      { id: 'sub-q1-a', careerId: 'career-1', name: 'Math I', quarter: 1, defaultHoursHundredths: 500, active: true },
      { id: 'sub-q2-a', careerId: 'career-1', name: 'Math II', quarter: 2, defaultHoursHundredths: 400, active: true },
      { id: 'sub-q2-b', careerId: 'career-1', name: 'Ethics', quarter: 2, defaultHoursHundredths: 300, active: true },
      { id: 'sub-q2-off', careerId: 'career-1', name: 'Legacy', quarter: 2, defaultHoursHundredths: 300, active: false },
    ],
    cohorts: [
      {
        id: 'cohort-advance',
        name: 'ING-2026',
        careerId: 'career-1',
        modality: 'presencial',
        shift: 'matutino',
        status: 'active',
        currentQuarter: 1,
      },
      {
        id: 'cohort-final',
        name: 'ING-2025',
        careerId: 'career-1',
        modality: 'presencial',
        shift: 'matutino',
        status: 'active',
        currentQuarter: 2,
      },
      {
        id: 'cohort-no-initial',
        name: 'ING-NEW',
        careerId: 'career-1',
        modality: 'presencial',
        shift: 'matutino',
        status: 'active',
        currentQuarter: 1,
      },
    ],
    groups: [
      {
        id: 'group-init-1',
        academicCycleId: 'cycle-2026-1',
        careerId: 'career-1',
        cohortGroupId: 'cohort-advance',
        quarter: 1,
        modality: 'presencial',
        shift: 'matutino',
        name: 'ING-2026 Q1',
        classroomId: 'room-101',
        status: 'final',
      },
      {
        id: 'group-init-2',
        academicCycleId: 'cycle-2026-1',
        careerId: 'career-1',
        cohortGroupId: 'cohort-final',
        quarter: 2,
        modality: 'presencial',
        shift: 'matutino',
        name: 'ING-2025 Q2',
        classroomId: 'room-102',
        status: 'final',
      },
    ],
    groupSubjects: [
      { id: 'gs-1', groupId: 'group-init-1', subjectId: 'sub-q1-a', hoursPerWeekHundredths: 500, status: 'active' },
      { id: 'gs-2', groupId: 'group-init-2', subjectId: 'sub-q2-a', hoursPerWeekHundredths: 400, status: 'active' },
    ],
  };
}

test('AC27/AC30: rejects non-admin, inactive admin, and finalized cycles with zero writes', async () => {
  const store = createLocalCycleActivationStore(host, randomUUID());
  await store.seed(sampleSeed());
  const baselineWrites = store.stats().writes;

  assert.deepEqual(await store.activateCycle(coordinator, 'cycle-2026-2'), {
    ok: false,
    reason: 'forbidden-role',
  });
  assert.deepEqual(await store.activateCycle({ ...admin, active: false }, 'cycle-2026-2'), {
    ok: false,
    reason: 'unauthenticated-or-inactive',
  });
  assert.deepEqual(await store.activateCycle(admin, 'cycle-2026-0'), {
    ok: false,
    reason: 'cycle-not-activatable',
  });
  assert.equal(store.stats().writes, baselineWrites);
  assert.deepEqual(await store.listAuditEvents(), []);
});

test('AC28/AC30/AC37: activates cycle, advances eligible cohorts, completes final cohorts, skips uninitialized, and is idempotent on retry', async () => {
  const store = createLocalCycleActivationStore(host, randomUUID());
  await store.seed(sampleSeed());

  const first = await store.activateCycle(admin, 'cycle-2026-2', {
    correlationId: 'corr-1',
    timestampIso: '2026-11-23T12:10:00.000Z',
  });
  assert.deepEqual(first, {
    ok: true,
    status: 'activated',
    cycleId: 'cycle-2026-2',
    generatedCount: 1,
    completedCount: 1,
    skippedCount: 0,
    pendingInitialCount: 1,
    generatedGroups: [
      {
        cohortId: 'cohort-advance',
        groupId: 'cohort-cycle:cohort-advance:cycle-2026-2',
        quarter: 2,
        subjectCount: 2,
        groupName: 'ING-2026 Q2',
      },
    ],
  });

  const cycles = new Map((await store.listCycles()).map((c) => [c.id, c]));
  assert.equal(cycles.get('cycle-2026-1')?.status, 'finalized');
  assert.equal(cycles.get('cycle-2026-1')?.active, false);
  assert.equal(cycles.get('cycle-2026-2')?.status, 'active');
  assert.equal(cycles.get('cycle-2026-2')?.active, true);

  const cohorts = new Map((await store.listCohorts()).map((c) => [c.id, c]));
  assert.equal(cohorts.get('cohort-advance')?.currentQuarter, 2);
  assert.equal(cohorts.get('cohort-final')?.status, 'completed');
  assert.equal(cohorts.get('cohort-no-initial')?.status, 'active');

  const groups = await store.listGroups();
  assert.equal(groups.length, 3);
  const generated = groups.find((g) => g.id === 'cohort-cycle:cohort-advance:cycle-2026-2');
  assert.ok(generated);
  assert.equal(generated.classroomId, 'room-101');
  assert.equal(generated.status, 'draft');

  const generatedSubjects = (await store.listGroupSubjects()).filter((gs) => gs.groupId === generated.id);
  assert.deepEqual(
    generatedSubjects.map((gs) => gs.subjectId).sort(),
    ['sub-q2-a', 'sub-q2-b'],
  );

  const history = await store.listHistory();
  assert.deepEqual(history, [
    {
      id: 'cohort-advance:sub-q1-a',
      cohortGroupId: 'cohort-advance',
      subjectId: 'sub-q1-a',
      quarter: 1,
      groupId: 'group-init-1',
    },
  ]);

  // Retry must be completely idempotent: zero duplicates and zero new audit events.
  const retry = await store.activateCycle(admin, 'cycle-2026-2', {
    correlationId: 'corr-2',
    timestampIso: '2026-11-23T12:11:00.000Z',
  });
  assert.deepEqual(retry, {
    ok: true,
    status: 'activated',
    cycleId: 'cycle-2026-2',
    generatedCount: 0,
    completedCount: 0,
    skippedCount: 1,
    pendingInitialCount: 1,
    generatedGroups: [],
  });
  assert.equal((await store.listGroups()).length, 3);
  assert.equal((await store.listAuditEvents()).length, 3);
});

test('AC30/D0: parallel cycle activation requests produce no duplicate groups, history, or audit events', async () => {
  const store = createLocalCycleActivationStore(host, randomUUID());
  await store.seed(sampleSeed());

  const [left, right] = await Promise.all([
    store.activateCycle(admin, 'cycle-2026-2', {
      correlationId: 'parallel-1',
      timestampIso: '2026-11-23T12:20:00.000Z',
    }),
    store.activateCycle(admin, 'cycle-2026-2', {
      correlationId: 'parallel-2',
      timestampIso: '2026-11-23T12:20:00.000Z',
    }),
  ]);

  assert.equal(left.ok, true);
  assert.equal(right.ok, true);
  if (left.ok && right.ok) {
    assert.equal(left.generatedCount + right.generatedCount, 1);
    assert.equal(left.completedCount + right.completedCount, 1);
  }
  assert.equal((await store.listGroups()).length, 3);
  assert.equal((await store.listHistory()).length, 1);
  assert.equal((await store.listAuditEvents()).length, 3);
});

test('AC30: recovers cleanly after a partial failure mid-activation without duplicating completed cohorts', async () => {
  const store = createLocalCycleActivationStore(host, randomUUID());
  await store.seed(sampleSeed());

  // Sorted active cohort IDs: cohort-advance, cohort-final, cohort-no-initial.
  await assert.rejects(
    () =>
      store.activateCycle(admin, 'cycle-2026-2', {
        correlationId: 'partial-1',
        beforeCohortCommit(cohortId) {
          if (cohortId === 'cohort-final') {
            throw new Error('Simulated transient failure before second cohort commit');
          }
        },
      }),
    /Simulated transient failure/,
  );

  // First cohort persisted; second cohort stayed active.
  assert.equal((await store.listGroups()).length, 3);
  const midCohorts = new Map((await store.listCohorts()).map((c) => [c.id, c]));
  assert.equal(midCohorts.get('cohort-advance')?.currentQuarter, 2);
  assert.equal(midCohorts.get('cohort-final')?.status, 'active');

  const recovery = await store.activateCycle(admin, 'cycle-2026-2', {
    correlationId: 'partial-recovery',
  });
  assert.deepEqual(recovery, {
    ok: true,
    status: 'activated',
    cycleId: 'cycle-2026-2',
    generatedCount: 0,
    completedCount: 1,
    skippedCount: 1,
    pendingInitialCount: 1,
    generatedGroups: [],
  });
  assert.equal((await store.listGroups()).length, 3);
  assert.equal((await store.listAuditEvents()).length, 3);
});
