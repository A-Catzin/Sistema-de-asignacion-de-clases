import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test, type TestContext } from 'node:test';
import * as stores from './firestore-assignment.ts';
import type { StoredAssignment } from './firestore-assignment.ts';
import { encodeKey } from './local-firestore.ts';

const { createLocalAssignmentStore } = stores;

const host = process.env.FIRESTORE_EMULATOR_HOST ?? '';
const assignment = {
  id: 'first', cycleId: 'cycle-a', status: 'active', teacherId: 'teacher-a',
  groupId: 'group-a', groupSubjectId: 'subject-a', blockId: 'block-1', classroomId: null, groupClassroomId: null,
  assignedHoursHundredths: 150, slot: { day: 1, startMinute: 540, endMinute: 600, module: 0 },
} as const satisfies StoredAssignment;

function synchronizeInitialReads(t: TestContext, readCount = 2, pathFilter = '') {
  const fetchFromEmulator = globalThis.fetch;
  let reads = 0;
  let completedReads = 0;
  const commits: Array<{ status: number; paths: string[] }> = [];
  let release!: () => void;
  const bothRead = new Promise<void>((resolve) => { release = resolve; });
  t.mock.method(globalThis, 'fetch', async (...args: Parameters<typeof fetch>) => {
    const firstRead = args[1]?.method === 'GET' && String(args[0]).includes(pathFilter) && ++reads <= readCount;
    const response = await fetchFromEmulator(...args);
    if (args[1]?.method === 'POST') {
      const body = JSON.parse(String(args[1].body)) as { writes: { update: { name: string } }[] };
      commits.push({ status: response.status, paths: body.writes.map((write) => write.update.name) });
    }
    if (firstRead) {
      // All initial HTTP reads must complete before either writer proceeds.
      if (++completedReads === readCount) release();
      await bothRead;
    }
    return response;
  });
  return commits;
}

test('AC21: competing overlaps commit only one assignment, across cycles', async (t) => {
  synchronizeInitialReads(t);
  const store = createLocalAssignmentStore(host, randomUUID());
  const other = { ...assignment, id: 'second', cycleId: 'cycle-b', groupId: 'group-b', groupSubjectId: 'subject-b' };
  const outcomes = await Promise.all([store.add(assignment, 1000), store.add(other, 1000)]);
  assert.equal(outcomes.filter((result) => result.ok).length, 1);
  assert.deepEqual(outcomes.find((result) => !result.ok), { ok: false, reason: 'teacher-overlap' });
  assert.deepEqual(await store.list(), [outcomes[0].ok ? assignment : other]);
});

test('AC21: competing non-overlapping writes still share the teacher load ceiling', async (t) => {
  synchronizeInitialReads(t);
  const store = createLocalAssignmentStore(host, randomUUID());
  const other = { ...assignment, id: 'second', blockId: 'block-2', slot: { ...assignment.slot, day: 2 } };
  const outcomes = await Promise.all([store.add(assignment, 150), store.add(other, 150)]);
  assert.equal(outcomes.filter((result) => result.ok).length, 1);
  assert.deepEqual(outcomes.find((result) => !result.ok), { ok: false, reason: 'teacher-load-exceeded' });
  assert.deepEqual(await store.list(), [outcomes[0].ok ? assignment : other]);
});

test('compatible writes both commit without losing either assignment', async (t) => {
  synchronizeInitialReads(t);
  const store = createLocalAssignmentStore(host, randomUUID());
  const other = { ...assignment, id: 'second', blockId: 'block-2', slot: { ...assignment.slot, day: 2 } };
  const outcomes = await Promise.all([store.add(assignment, 300), store.add(other, 300)]);
  assert.equal(outcomes.every((result) => result.ok), true);
  assert.deepEqual((await store.list()).sort((a, b) => a.id.localeCompare(b.id)), [assignment, other]);
});

test('the prototype refuses a non-loopback endpoint', () => {
  assert.throws(() => createLocalAssignmentStore('firestore.googleapis.com:443', 'demo'), /loopback/);
});

test('AC19: a rejected edit preserves the original; a valid edit excludes its own hours', async () => {
  const store = createLocalAssignmentStore(host, randomUUID());
  const other = { ...assignment, id: 'second', blockId: 'block-2', slot: { ...assignment.slot, day: 2 } };
  await store.add(assignment, 300);
  await store.add(other, 300);
  const original = await store.list();
  assert.deepEqual(await store.edit(assignment.id, { ...assignment, groupSubjectId: 'subject-b', blockId: other.blockId, slot: other.slot }, 300),
    { ok: false, reason: 'teacher-overlap' });
  assert.deepEqual(await store.list(), original);
  const moved = { ...assignment, blockId: 'block-3', slot: { ...assignment.slot, day: 3 } };
  assert.equal((await store.edit(assignment.id, moved, 300)).ok, true);
  assert.deepEqual(await store.list(), [moved, other]);
});

test('AC20: cancellation retains history and releases hours and room only once', async () => {
  const store = createLocalAssignmentStore(host, randomUUID());
  const existing = { ...assignment, classroomId: 'room-a' };
  await store.add(existing, 150);
  assert.deepEqual(await store.cancel(existing.id), { ok: true });
  assert.deepEqual(await store.cancel(existing.id), { ok: true });
  assert.deepEqual(await store.edit(existing.id, existing, 150), { ok: false, reason: 'assignment-not-active' });
  const replacement = { ...existing, id: 'second' };
  assert.equal((await store.add(replacement, 150)).ok, true);
  assert.deepEqual(await store.list(), [{ ...existing, status: 'cancelled' }, replacement]);
});

test('AC21: competing edits on an existing snapshot persist only one move', async (t) => {
  const store = createLocalAssignmentStore(host, randomUUID());
  const other = { ...assignment, id: 'second', blockId: 'block-2', slot: { ...assignment.slot, day: 2 } };
  await store.add(assignment, 300);
  await store.add(other, 300);
  const slot = { ...assignment.slot, day: 3 };
  const firstMove = { ...assignment, blockId: 'block-3', slot };
  const secondMove = { ...other, groupSubjectId: 'subject-b', blockId: 'block-3', slot };
  synchronizeInitialReads(t);
  const [left, right] = await Promise.all([
    store.edit(assignment.id, firstMove, 300),
    store.edit(other.id, secondMove, 300),
  ]);
  assert.notEqual(left.ok, right.ok);
  assert.deepEqual(left.ok ? right : left, { ok: false, reason: 'teacher-overlap' });
  assert.deepEqual(await store.list(), left.ok ? [firstMove, other] : [assignment, secondMove]);
});

test('AC21: cancel racing an addition leaves the same state as a valid sequential order', async (t) => {
  const store = createLocalAssignmentStore(host, randomUUID());
  await store.add(assignment, 150);
  const replacement = { ...assignment, id: 'second', groupSubjectId: 'subject-b' };
  synchronizeInitialReads(t);
  const [cancelled, added] = await Promise.all([store.cancel(assignment.id), store.add(replacement, 150)]);
  assert.deepEqual(cancelled, { ok: true });
  if (!added.ok) assert.deepEqual(added, { ok: false, reason: 'teacher-load-exceeded' });
  const history = { ...assignment, status: 'cancelled' };
  assert.deepEqual(await store.list(), added.ok ? [history, replacement] : [history]);
  if (!added.ok) assert.equal((await store.add(replacement, 150)).ok, true);
  assert.deepEqual(await store.list(), [history, replacement]);
});

test('AC16: two teachers compete for one subject and block; cancellation makes it reusable', async (t) => {
  const store = createLocalAssignmentStore(host, randomUUID());
  const alternate = { ...assignment, id: 'second', teacherId: 'teacher-b' };
  synchronizeInitialReads(t);
  const [first, second] = await Promise.all([store.add(assignment, 300), store.add(alternate, 300)]);
  assert.notEqual(first.ok, second.ok);
  assert.deepEqual(first.ok ? second : first, { ok: false, reason: 'subject-block-taken' });
  const [winner, loser] = first.ok ? [assignment, alternate] : [alternate, assignment];
  assert.deepEqual(await store.list(), [winner]);
  assert.deepEqual(await store.cancel(winner.id), { ok: true });
  assert.equal((await store.add(loser, 300)).ok, true);
  assert.deepEqual(await store.list(), [{ ...winner, status: 'cancelled' }, loser]);
});

test('AC16: editing cannot take another active pair and does not conflict with itself', async () => {
  const store = createLocalAssignmentStore(host, randomUUID());
  const alternate = { ...assignment, id: 'second', teacherId: 'teacher-b', blockId: 'block-2',
    slot: { ...assignment.slot, day: 2 } };
  assert.equal((await store.add(assignment, 300)).ok, true);
  assert.equal((await store.add(alternate, 300)).ok, true);
  assert.equal((await store.edit(alternate.id, alternate, 300)).ok, true);
  assert.deepEqual(await store.edit(alternate.id, { ...alternate, blockId: assignment.blockId, slot: assignment.slot }, 300),
    { ok: false, reason: 'subject-block-taken' });
  assert.deepEqual(await store.list(), [assignment, alternate]);
});

const resourceDraft = { ...assignment, classroomId: 'room-a' };
const distinct = { ...resourceDraft, id: 'second', cycleId: 'cycle-b', teacherId: 'teacher-b',
  groupId: 'group-b', groupSubjectId: 'subject-b', blockId: 'block-2', classroomId: 'room-b' };

test('resource layout: independent writes both commit first try', async (t) => {
  const store = stores.createLocalResourceAssignmentStore(host, randomUUID());
  const commits = synchronizeInitialReads(t, 8);
  const outcomes = await Promise.all([store.add(resourceDraft, 300), store.add(distinct, 300)]);
  assert.equal(outcomes.every((result) => result.ok), true);
  assert.deepEqual(commits.map((commit) => commit.status), [200, 200]);
  assert.equal(commits[0].paths.some((path) => commits[1].paths.includes(path)), false);
  assert.deepEqual(await Promise.all([store.get(resourceDraft.id), store.get(distinct.id)]), [resourceDraft, distinct]);
});

for (const [resource, other, reason, max] of [
  ['teacher across cycles', { ...distinct, teacherId: resourceDraft.teacherId }, 'teacher-overlap', 300],
  ['teacher load across cycles', { ...distinct, teacherId: resourceDraft.teacherId,
    slot: { ...distinct.slot, day: 2 } }, 'teacher-load-exceeded', 150],
  ['group', { ...distinct, groupId: resourceDraft.groupId }, 'group-overlap', 300],
  ['inherited room', { ...distinct, classroomId: null, groupClassroomId: resourceDraft.classroomId }, 'classroom-overlap', 300],
  ['subject/block', { ...resourceDraft, id: distinct.id, teacherId: distinct.teacherId }, 'subject-block-taken', 300],
] as const) {
  test(`resource layout: competing writes sharing ${resource} keep one record and no losing reservations`, async (t) => {
    const store = stores.createLocalResourceAssignmentStore(host, randomUUID());
    const commits = synchronizeInitialReads(t, 8);
    const [first, second] = await Promise.all([store.add(resourceDraft, max), store.add(other, max)]);
    assert.notEqual(first.ok, second.ok);
    assert.deepEqual(first.ok ? second : first, { ok: false, reason });
    assert.equal(commits.length, 2);
    const committed = commits.find((commit) => commit.status === 200);
    const rejected = commits.find((commit) => commit.status !== 200);
    assert.ok(committed && rejected);
    const losingGuards = rejected.paths.filter((path) => path.includes('/guards/') && !committed.paths.includes(path));
    assert.ok(losingGuards.length > 0);
    const reads = await Promise.all(losingGuards.map((path) => fetch(`http://${host}/v1/${path}`, {
      headers: { authorization: 'Bearer owner' },
    })));
    assert.equal(reads.every((response) => response.status === 404), true);
    assert.equal(await store.get(first.ok ? other.id : resourceDraft.id), null);
    const winner = first.ok ? resourceDraft : other;
    assert.deepEqual(await store.get(winner.id), { ...winner, classroomId: winner.classroomId ?? winner.groupClassroomId });
    const compatibleRetry = { ...distinct, id: first.ok ? other.id : resourceDraft.id,
      teacherId: 'teacher-c', groupId: 'group-c', groupSubjectId: 'subject-c', classroomId: 'room-c' };
    assert.equal((await store.add(compatibleRetry, 300)).ok, true);
  });
}

test('resource layout: rejected edits leave old reservations in place; accepted edits move them', async () => {
  const store = stores.createLocalResourceAssignmentStore(host, randomUUID());
  await store.add(resourceDraft, 150);
  await store.add(distinct, 150);
  const moved = { ...resourceDraft, teacherId: 'teacher-c', classroomId: distinct.classroomId, blockId: 'block-3' };
  assert.deepEqual(await store.edit(resourceDraft.id, moved, 150), { ok: false, reason: 'classroom-overlap' });
  assert.deepEqual(await store.get(resourceDraft.id), resourceDraft);
  assert.deepEqual(await store.add({ ...resourceDraft, id: 'reuse' }, 150), { ok: false, reason: 'subject-block-taken' });
  const valid = { ...moved, classroomId: 'room-c', blockId: 'block-4', slot: { ...moved.slot, day: 2 } };
  assert.equal((await store.edit(resourceDraft.id, valid, 150)).ok, true);
  assert.deepEqual(await store.get(resourceDraft.id), valid);
  const reuse = { ...resourceDraft, id: 'reuse' };
  assert.equal((await store.add(reuse, 150)).ok, true);
  assert.deepEqual(await store.get(reuse.id), reuse);
});

test('resource layout: conflicting simultaneous edits move only one record into the new room', async (t) => {
  const store = stores.createLocalResourceAssignmentStore(host, randomUUID());
  await store.add(resourceDraft, 150);
  await store.add(distinct, 150);
  const left = { ...resourceDraft, classroomId: 'room-c' };
  const right = { ...distinct, classroomId: 'room-c' };
  const commits = synchronizeInitialReads(t, 8, '/guards/');
  const [a, b] = await Promise.all([store.edit(left.id, left, 150), store.edit(right.id, right, 150)]);
  assert.notEqual(a.ok, b.ok);
  assert.deepEqual(a.ok ? b : a, { ok: false, reason: 'classroom-overlap' });
  assert.equal(commits.filter((commit) => commit.status === 200).length, 1);
  assert.deepEqual(await Promise.all([store.get(left.id), store.get(right.id)]),
    a.ok ? [left, distinct] : [resourceDraft, right]);
});

test('resource layout: cancelling preserves history and frees reservations during a competing add', async (t) => {
  const store = stores.createLocalResourceAssignmentStore(host, randomUUID());
  await store.add(resourceDraft, 150);
  const replacement = { ...resourceDraft, id: 'replacement' };
  synchronizeInitialReads(t, 6, '/guards/');
  const [cancelled, added] = await Promise.all([store.cancel(resourceDraft.id), store.add(replacement, 150)]);
  assert.deepEqual(cancelled, { ok: true });
  const history = { ...resourceDraft, status: 'cancelled' };
  assert.deepEqual(await store.get(resourceDraft.id), history);
  assert.deepEqual(await store.get(replacement.id), added.ok ? replacement : null);
  if (!added.ok) {
    assert.deepEqual(added, { ok: false, reason: 'subject-block-taken' });
    assert.equal((await store.add(replacement, 150)).ok, true);
  }
  assert.deepEqual(await store.cancel(resourceDraft.id), { ok: true });
  assert.deepEqual(await store.edit(resourceDraft.id, resourceDraft, 150), { ok: false, reason: 'assignment-not-active' });
  assert.deepEqual(await store.get(replacement.id), replacement);
  assert.deepEqual(await store.get(resourceDraft.id), history);
});

test('resource layout: folds subject-block uniqueness into group guard and stores minimal projections', async () => {
  const scenarioId = randomUUID();
  const store = stores.createLocalResourceAssignmentStore(host, scenarioId);
  assert.equal((await store.add(resourceDraft, 300)).ok, true);
  assert.equal(store.stats().reads, 4);
  assert.equal(store.stats().writes, 4);

  assert.deepEqual(
    await store.add({ ...resourceDraft, id: 'dup-sb', teacherId: 'teacher-other' }, 300),
    { ok: false, reason: 'subject-block-taken' },
  );

  const roomGuardPath = `projects/demo-assignment-integrity/databases/(default)/documents/assignmentScenarios/${scenarioId}/guards/${encodeKey(['classroom', 'room-a'])}`;
  const response = await fetch(`http://${host}/v1/${roomGuardPath}`, {
    headers: { authorization: 'Bearer owner' },
  });
  assert.equal(response.status, 200);
  const doc = (await response.json()) as { fields: { data: { stringValue: string } } };
  assert.deepEqual(JSON.parse(doc.fields.data.stringValue), [
    { id: resourceDraft.id, slot: resourceDraft.slot },
  ]);
  assert.deepEqual(await store.get(resourceDraft.id), resourceDraft);
});
