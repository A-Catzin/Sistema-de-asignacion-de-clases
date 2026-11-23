import { randomUUID } from 'node:crypto';
import type { ActorContext } from './authz-policy.ts';
import {
  createLocalResourceAssignmentStore,
  toClassroomGuardEntry,
  toGroupGuardEntry,
  toTeacherGuardEntry,
  type StoredAssignment,
} from './firestore-assignment.ts';
import { createLocalCycleActivationStore, type Subject } from './firestore-cycle-activation.ts';

const host = process.env.FIRESTORE_EMULATOR_HOST ?? '';
const firestoreDocLimitBytes = 1_048_576;
const firestoreFreeReadsPerDay = 50_000;
const firestoreFreeWritesPerDay = 20_000;

const admin: ActorContext = {
  uid: 'bench-admin',
  active: true,
  role: 'admin',
  careerIds: [],
  teacherIds: [],
};

function makeAssignment(index: number, overrides: Partial<StoredAssignment> = {}): StoredAssignment {
  const day = (index % 5) + 1;
  const startMinute = 420 + (index % 12) * 60;
  return {
    id: `assign-${index}`,
    cycleId: 'cycle-2026-1',
    status: 'active',
    teacherId: `teacher-${index}`,
    groupId: `group-${index}`,
    groupSubjectId: `gs-${index}`,
    blockId: `block-${index}`,
    classroomId: `room-${index}`,
    groupClassroomId: `room-${index}`,
    assignedHoursHundredths: 100,
    slot: { day, startMinute, endMinute: startMinute + 60, module: 0 },
    ...overrides,
  };
}

async function measurePerOperationCounts() {
  const store = createLocalResourceAssignmentStore(host, `bench-ops-${randomUUID()}`);
  const first = makeAssignment(1);

  const beforeAdd = store.stats();
  await store.add(first, 4000, {
    actor: admin,
    careerId: 'career-1',
    groupStatus: 'draft',
    correlationId: 'bench-add-1',
  });
  const afterAdd = store.stats();

  const beforeSameEdit = store.stats();
  await store.edit(
    first.id,
    { ...first, assignedHoursHundredths: 200 },
    4000,
    {
      actor: admin,
      careerId: 'career-1',
      groupStatus: 'draft',
      correlationId: 'bench-edit-same',
    },
  );
  const afterSameEdit = store.stats();

  const beforeMoveEdit = store.stats();
  await store.edit(
    first.id,
    {
      ...first,
      teacherId: 'teacher-moved',
      groupId: 'group-moved',
      groupSubjectId: 'gs-moved',
      blockId: 'block-moved',
      classroomId: 'room-moved',
      groupClassroomId: 'room-moved',
    },
    4000,
    {
      actor: admin,
      careerId: 'career-1',
      groupStatus: 'draft',
      correlationId: 'bench-edit-move',
    },
  );
  const afterMoveEdit = store.stats();

  const beforeCancel = store.stats();
  await store.cancel(first.id, {
    actor: admin,
    careerId: 'career-1',
    groupStatus: 'draft',
    correlationId: 'bench-cancel-1',
  });
  const afterCancel = store.stats();

  const cycleStore = createLocalCycleActivationStore(host, `bench-cycle-${randomUUID()}`);
  const subjects: Subject[] = Array.from({ length: 5 }, (_, idx) => ({
    id: `sub-q2-${idx}`,
    careerId: 'career-1',
    name: `Subject ${idx}`,
    quarter: 2,
    defaultHoursHundredths: 300,
    active: true,
  }));
  await cycleStore.seed({
    activeCycleId: 'cycle-1',
    cycles: [
      { id: 'cycle-1', code: '2026-1', name: '2026-1', status: 'active', active: true },
      { id: 'cycle-2', code: '2026-2', name: '2026-2', status: 'draft', active: false },
    ],
    subjects: [
      { id: 'sub-q1-0', careerId: 'career-1', name: 'Intro', quarter: 1, defaultHoursHundredths: 300, active: true },
      ...subjects,
    ],
    cohorts: [
      {
        id: 'cohort-1',
        name: 'ING-1',
        careerId: 'career-1',
        modality: 'presencial',
        shift: 'matutino',
        status: 'active',
        currentQuarter: 1,
      },
    ],
    groups: [
      {
        id: 'group-init',
        academicCycleId: 'cycle-1',
        careerId: 'career-1',
        cohortGroupId: 'cohort-1',
        quarter: 1,
        modality: 'presencial',
        shift: 'matutino',
        name: 'ING-1 Q1',
        classroomId: 'room-1',
        status: 'final',
      },
    ],
    groupSubjects: [
      { id: 'gs-init-0', groupId: 'group-init', subjectId: 'sub-q1-0', hoursPerWeekHundredths: 300, status: 'active' },
    ],
  });

  const beforeCycle = cycleStore.stats();
  await cycleStore.activateCycle(admin, 'cycle-2', { correlationId: 'bench-cycle' });
  const afterCycle = cycleStore.stats();

  return {
    addWithRoomAndAudit: {
      reads: afterAdd.reads - beforeAdd.reads,
      writes: afterAdd.writes - beforeAdd.writes,
      commits: afterAdd.commits - beforeAdd.commits,
    },
    editSameResourcesWithAudit: {
      reads: afterSameEdit.reads - beforeSameEdit.reads,
      writes: afterSameEdit.writes - beforeSameEdit.writes,
      commits: afterSameEdit.commits - beforeSameEdit.commits,
    },
    editMovedAllResourcesWithAudit: {
      reads: afterMoveEdit.reads - beforeMoveEdit.reads,
      writes: afterMoveEdit.writes - beforeMoveEdit.writes,
      commits: afterMoveEdit.commits - beforeMoveEdit.commits,
    },
    cancelWithAudit: {
      reads: afterCancel.reads - beforeCancel.reads,
      writes: afterCancel.writes - beforeCancel.writes,
      commits: afterCancel.commits - beforeCancel.commits,
    },
    activateCycleOneCohortFiveSubjects: {
      reads: afterCycle.reads - beforeCycle.reads,
      listCalls: afterCycle.listCalls - beforeCycle.listCalls,
      writes: afterCycle.writes - beforeCycle.writes,
      commits: afterCycle.commits - beforeCycle.commits,
    },
  };
}

async function runConcurrencyScenario(concurrency: number, sharedRoom: boolean) {
  const store = createLocalResourceAssignmentStore(host, `bench-conc-${sharedRoom ? 'shared' : 'disjoint'}-${concurrency}-${randomUUID()}`);
  const start = performance.now();
  const outcomes = await Promise.all(
    Array.from({ length: concurrency }, (_, i) =>
      store.add(
        makeAssignment(i + 1, {
          classroomId: sharedRoom ? 'room-hot' : `room-${i + 1}`,
          groupClassroomId: sharedRoom ? 'room-hot' : `room-${i + 1}`,
          // Place shared-room requests on the exact same slot to stress conflict contention.
          slot: sharedRoom
            ? { day: 1, startMinute: 540, endMinute: 600, module: 0 }
            : { day: (i % 5) + 1, startMinute: 420 + (i % 8) * 60, endMinute: 480 + (i % 8) * 60, module: 0 },
        }),
        4000,
        {
          actor: admin,
          careerId: 'career-1',
          groupStatus: 'draft',
          correlationId: `conc-${i}`,
        },
      ),
    ),
  );
  const wallMs = Math.round((performance.now() - start) * 100) / 100;
  const stats = store.stats();
  return {
    concurrency,
    sharedRoom,
    succeeded: outcomes.filter((o) => o.ok).length,
    rejected: outcomes.filter((o) => !o.ok).length,
    commits: stats.commits,
    abortedCommits: stats.abortedCommits,
    reads: stats.reads,
    writes: stats.writes,
    wallMs,
  };
}

function measureGuardSizing() {
  const sampleFull = makeAssignment(100);
  const sampleTeacher = toTeacherGuardEntry(sampleFull);
  const sampleGroup = toGroupGuardEntry(sampleFull);
  const sampleClassroom = toClassroomGuardEntry(sampleFull);

  const bytesPerFullEntry = Buffer.byteLength(JSON.stringify([sampleFull]), 'utf8') - 2;
  const bytesPerTeacherEntry = Buffer.byteLength(JSON.stringify([sampleTeacher]), 'utf8') - 2;
  const bytesPerGroupEntry = Buffer.byteLength(JSON.stringify([sampleGroup]), 'utf8') - 2;
  const bytesPerClassroomEntry = Buffer.byteLength(JSON.stringify([sampleClassroom]), 'utf8') - 2;

  const sampleSet = (count: number) =>
    Array.from({ length: count }, (_, idx) =>
      makeAssignment(idx + 1, {
        teacherId: `teacher-${idx % 40}`,
        groupId: `group-${Math.floor(idx / 13)}`,
        classroomId: 'room-shared-101',
        groupClassroomId: 'room-shared-101',
      }),
    );

  const group13FullBytes = Buffer.byteLength(JSON.stringify(sampleSet(13)), 'utf8');
  const group13MinimalBytes = Buffer.byteLength(JSON.stringify(sampleSet(13).map(toGroupGuardEntry)), 'utf8');
  const teacher25FullBytes = Buffer.byteLength(JSON.stringify(sampleSet(25)), 'utf8');
  const teacher25MinimalBytes = Buffer.byteLength(JSON.stringify(sampleSet(25).map(toTeacherGuardEntry)), 'utf8');
  const busyRoom390FullBytes = Buffer.byteLength(JSON.stringify(sampleSet(390)), 'utf8');
  const busyRoom390MinimalBytes = Buffer.byteLength(
    JSON.stringify(sampleSet(390).map(toClassroomGuardEntry)),
    'utf8',
  );

  // Include 1-byte comma per item; reserve 2 bytes for JSON array brackets.
  const maxFullEntriesBefore1MiB = Math.floor((firestoreDocLimitBytes - 2) / (bytesPerFullEntry + 1));
  const maxClassroomMinimalEntriesBefore1MiB = Math.floor(
    (firestoreDocLimitBytes - 2) / (bytesPerClassroomEntry + 1),
  );

  return {
    firestoreDocLimitBytes,
    bytesPerFullEntry,
    bytesPerTeacherEntry,
    bytesPerGroupEntry,
    bytesPerClassroomEntry,
    group13BlocksFullBytes: group13FullBytes,
    group13BlocksMinimalBytes: group13MinimalBytes,
    teacher25AssignmentsFullBytes: teacher25FullBytes,
    teacher25AssignmentsMinimalBytes: teacher25MinimalBytes,
    busyRoom390AssignmentsOneCycleFullBytes: busyRoom390FullBytes,
    busyRoom390AssignmentsOneCycleMinimalBytes: busyRoom390MinimalBytes,
    maxFullEntriesBefore1MiB,
    maxClassroomMinimalEntriesBefore1MiB,
    busyRoomCyclesBefore1MiBFull: Math.floor((maxFullEntriesBefore1MiB / 390) * 100) / 100,
    busyRoomCyclesBefore1MiBMinimal: Math.floor((maxClassroomMinimalEntriesBefore1MiB / 390) * 100) / 100,
  };
}

function projectT02PeakWindow(writesPerAdd: number, readsPerAdd: number) {
  const blocksPerWeekdayGroupExample = 13;
  const scenarios = [1000, 1300].map((activeGroups) => {
    const addsInCycle = activeGroups * blocksPerWeekdayGroupExample;
    const totalWrites = addsInCycle * writesPerAdd;
    const totalReads = addsInCycle * readsPerAdd;
    return {
      activeGroups,
      assumedAddsAt13BlocksPerGroup: addsInCycle,
      totalWrites,
      totalReads,
      avgWritesPerDayOver5Days: Math.ceil(totalWrites / 5),
      avgWritesPerDayOver7Days: Math.ceil(totalWrites / 7),
      avgReadsPerDayOver5Days: Math.ceil(totalReads / 5),
      avgReadsPerDayOver7Days: Math.ceil(totalReads / 7),
      freeWritesPerDayLimit: firestoreFreeWritesPerDay,
      freeReadsPerDayLimit: firestoreFreeReadsPerDay,
    };
  });
  return scenarios;
}

const perOperation = await measurePerOperationCounts();
const contention = [
  await runConcurrencyScenario(6, false),
  await runConcurrencyScenario(20, false),
  await runConcurrencyScenario(6, true),
];
const guardSizing = measureGuardSizing();
const peakProjection = projectT02PeakWindow(
  perOperation.addWithRoomAndAudit.writes,
  perOperation.addWithRoomAndAudit.reads,
);

console.log(
  JSON.stringify(
    {
      disclaimer:
        'Measured against local Firestore emulator on loopback. Emulator latency is not cloud latency; T02 projections use the 13-block weekday example and exclude catalog reads/UI browsing/edits/cancellations.',
      perOperation,
      contention,
      guardSizing,
      peakProjection,
    },
    null,
    2,
  ),
);
