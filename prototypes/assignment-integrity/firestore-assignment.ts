import { checkAssignment, effectiveClassroom, type AssignmentDraft, type AssignmentSnapshot } from './assignment-policy.ts';
import { authorizeAssignmentMutation, type ActorContext, type GroupStatus } from './authz-policy.ts';
import { createLocalFirestore, encodeKey } from './local-firestore.ts';

type SubjectBlock = Readonly<{ groupSubjectId: string; blockId: string }>;
type LocalDraft = AssignmentDraft & SubjectBlock;
export type StoredAssignment = AssignmentSnapshot & SubjectBlock;
type ActiveAssignment = StoredAssignment & { status: 'active' };
type Change<Result> = { result: Result; next?: StoredAssignment[] };
type AssignmentUnavailable = { ok: false; reason: 'assignment-not-active' };
type WriteResult = ReturnType<typeof checkAssignment> | { ok: false; reason: 'subject-block-taken' };
type EditResult = WriteResult | AssignmentUnavailable;
type CancelResult = { ok: true } | AssignmentUnavailable;

export type AuditEvent = Readonly<{
  id: string;
  correlationId: string;
  action: 'assignment.add' | 'assignment.edit' | 'assignment.cancel';
  entityType: 'assignment';
  entityId: string;
  actorUid: string;
  actorRole: 'admin' | 'coordinator';
  timestampIso: string;
  before: StoredAssignment | null;
  after: StoredAssignment;
}>;

export type AssignmentMutationContext = Readonly<{
  actor: ActorContext;
  careerId: string;
  groupStatus: GroupStatus;
  correlationId: string;
  timestampIso?: string;
}>;

const attemptLimit = 8;

function checkWrite(
  draft: LocalDraft,
  assignments: readonly StoredAssignment[],
  teacherMaxHoursHundredths: number,
  editingId?: string,
): WriteResult {
  if (
    assignments.some(
      (item) =>
        item.status === 'active' &&
        item.id !== editingId &&
        item.groupSubjectId === draft.groupSubjectId &&
        item.blockId === draft.blockId,
    )
  ) {
    return { ok: false, reason: 'subject-block-taken' };
  }
  return checkAssignment(draft, assignments, teacherMaxHoursHundredths, editingId);
}

export function createLocalAssignmentStore(host: string, scenarioId: string) {
  const { name, read, commit } = createLocalFirestore(host, scenarioId);

  async function mutate<Result>(plan: (assignments: StoredAssignment[]) => Change<Result>): Promise<Result> {
    for (let attempt = 0; attempt < attemptLimit; attempt++) {
      const snapshot = await read<StoredAssignment[]>(name);
      const assignments = snapshot?.value ?? [];
      const { result, next } = plan(assignments);
      if (next === undefined) return result;

      // Compare-and-swap ensures the validated snapshot is still current at commit.
      if (await commit([{ name, value: next, updateTime: snapshot?.updateTime ?? null }])) return result;
    }
    throw new Error('Emulator assignment snapshot changed too many times.');
  }

  function add(assignment: ActiveAssignment, teacherMaxHoursHundredths: number) {
    return mutate((assignments) => {
      const result = checkWrite(assignment, assignments, teacherMaxHoursHundredths);
      if (!result.ok) return { result };
      const stored = { ...assignment, classroomId: result.effectiveClassroomId };
      return { result, next: [...assignments, stored] };
    });
  }

  function edit(id: string, draft: LocalDraft, teacherMaxHoursHundredths: number) {
    return mutate<EditResult>((assignments) => {
      const index = assignments.findIndex((item) => item.id === id);
      const existing = assignments[index];
      if (existing?.status !== 'active') return { result: { ok: false, reason: 'assignment-not-active' } };
      const result = checkWrite(draft, assignments, teacherMaxHoursHundredths, id);
      if (!result.ok) return { result };
      const next = assignments.slice();
      next[index] = {
        ...draft,
        id,
        cycleId: existing.cycleId,
        status: 'active',
        classroomId: result.effectiveClassroomId,
      };
      return { result, next };
    });
  }

  function cancel(id: string) {
    return mutate<CancelResult>((assignments) => {
      const index = assignments.findIndex((item) => item.id === id);
      if (index < 0) return { result: { ok: false, reason: 'assignment-not-active' } };
      const result = { ok: true } as const;
      if (assignments[index].status === 'cancelled') return { result };
      const next = assignments.slice();
      next[index] = { ...next[index], status: 'cancelled' };
      return { result, next };
    });
  }

  return { add, edit, cancel, list: async () => (await read<StoredAssignment[]>(name))?.value ?? [] };
}

export type TeacherGuardEntry = Readonly<{
  id: string;
  assignedHoursHundredths: number;
  slot: AssignmentDraft['slot'];
}>;

export type GroupGuardEntry = Readonly<{
  id: string;
  groupSubjectId: string;
  blockId: string;
  slot: AssignmentDraft['slot'];
}>;

export type ClassroomGuardEntry = Readonly<{
  id: string;
  slot: AssignmentDraft['slot'];
}>;

type GuardEntry = TeacherGuardEntry | GroupGuardEntry | ClassroomGuardEntry;
type GuardDescriptor = Readonly<{
  path: string;
  kind: 'teacher' | 'group' | 'classroom';
  resourceId: string;
}>;

export function toTeacherGuardEntry(assignment: StoredAssignment): TeacherGuardEntry {
  return {
    id: assignment.id,
    assignedHoursHundredths: assignment.assignedHoursHundredths,
    slot: assignment.slot,
  };
}

export function toGroupGuardEntry(assignment: StoredAssignment): GroupGuardEntry {
  return {
    id: assignment.id,
    groupSubjectId: assignment.groupSubjectId,
    blockId: assignment.blockId,
    slot: assignment.slot,
  };
}

export function toClassroomGuardEntry(assignment: StoredAssignment): ClassroomGuardEntry {
  return {
    id: assignment.id,
    slot: assignment.slot,
  };
}

export function createLocalResourceAssignmentStore(host: string, scenarioId: string) {
  const { name, read, list, commit, stats } = createLocalFirestore(host, scenarioId);
  const record = (id: string) => `${name}/records/${encodeKey([id])}`;

  function guardDescriptors(assignment: LocalDraft): GuardDescriptor[] {
    const descriptors: GuardDescriptor[] = [
      {
        kind: 'teacher',
        resourceId: assignment.teacherId,
        path: `${name}/guards/${encodeKey(['teacher', assignment.teacherId])}`,
      },
      {
        kind: 'group',
        resourceId: assignment.groupId,
        path: `${name}/guards/${encodeKey(['group', assignment.groupId])}`,
      },
    ];
    const room = effectiveClassroom(assignment);
    // Deliberately do not partition conflict or load guards by academic cycle.
    // Subject-block uniqueness (AC16) is enforced within the group guard.
    if (room !== null) {
      descriptors.push({
        kind: 'classroom',
        resourceId: room,
        path: `${name}/guards/${encodeKey(['classroom', room])}`,
      });
    }
    return descriptors;
  }

  function readGuards(descriptors: readonly GuardDescriptor[]) {
    return Promise.all(
      descriptors.map(async (descriptor) => ({
        descriptor,
        snapshot: await read<GuardEntry[]>(descriptor.path),
      })),
    );
  }

  function affectedAssignments(guards: Awaited<ReturnType<typeof readGuards>>): StoredAssignment[] {
    const affected = new Map<string, StoredAssignment>();
    for (const { descriptor, snapshot } of guards) {
      for (const entry of snapshot?.value ?? []) {
        const current = affected.get(entry.id) ?? {
          id: entry.id,
          cycleId: '',
          status: 'active' as const,
          teacherId: '',
          groupId: '',
          groupSubjectId: '',
          blockId: '',
          classroomId: null,
          groupClassroomId: null,
          assignedHoursHundredths: 0,
          slot: entry.slot,
        };
        if (descriptor.kind === 'teacher') {
          const teacherEntry = entry as TeacherGuardEntry;
          affected.set(entry.id, {
            ...current,
            teacherId: descriptor.resourceId,
            assignedHoursHundredths: teacherEntry.assignedHoursHundredths,
            slot: teacherEntry.slot,
          });
        } else if (descriptor.kind === 'group') {
          const groupEntry = entry as GroupGuardEntry;
          affected.set(entry.id, {
            ...current,
            groupId: descriptor.resourceId,
            groupSubjectId: groupEntry.groupSubjectId,
            blockId: groupEntry.blockId,
            slot: groupEntry.slot,
          });
        } else {
          affected.set(entry.id, {
            ...current,
            classroomId: descriptor.resourceId,
            slot: entry.slot,
          });
        }
      }
    }
    return [...affected.values()];
  }

  function projectGuardEntry(kind: GuardDescriptor['kind'], stored: StoredAssignment): GuardEntry {
    if (kind === 'teacher') return toTeacherGuardEntry(stored);
    if (kind === 'group') return toGroupGuardEntry(stored);
    return toClassroomGuardEntry(stored);
  }

  function guardWrites(
    guards: Awaited<ReturnType<typeof readGuards>>,
    stored: StoredAssignment,
    activePaths: Set<string>,
  ) {
    return guards.map(({ descriptor, snapshot }) => {
      const remaining = (snapshot?.value ?? []).filter((entry) => entry.id !== stored.id);
      if (activePaths.has(descriptor.path)) {
        remaining.push(projectGuardEntry(descriptor.kind, stored));
      }
      return { name: descriptor.path, value: remaining, updateTime: snapshot?.updateTime ?? null };
    });
  }

  function buildAuditWrite(
    action: AuditEvent['action'],
    entityId: string,
    before: StoredAssignment | null,
    after: StoredAssignment,
    context: AssignmentMutationContext,
  ) {
    if (!context.actor) {
      throw new Error('Cannot record an audit event without an authenticated actor.');
    }
    const eventId = `${action}:${entityId}:${context.correlationId}`;
    const event: AuditEvent = {
      id: eventId,
      correlationId: context.correlationId,
      action,
      entityType: 'assignment',
      entityId,
      actorUid: context.actor.uid,
      actorRole: context.actor.role,
      timestampIso: context.timestampIso ?? new Date().toISOString(),
      before,
      after,
    };
    return {
      name: `${name}/auditEvents/${encodeKey([eventId])}`,
      value: event,
      updateTime: null,
    };
  }

  async function add(
    assignment: ActiveAssignment,
    teacherMaxHoursHundredths: number,
    context?: AssignmentMutationContext,
  ) {
    if (context) {
      const authz = authorizeAssignmentMutation(context.actor, {
        action: 'add',
        careerId: context.careerId,
        teacherId: assignment.teacherId,
        groupStatus: context.groupStatus,
      });
      if (!authz.ok) return authz;
    }

    const descriptors = guardDescriptors(assignment);
    const activePaths = new Set(descriptors.map((descriptor) => descriptor.path));
    const recordPath = record(assignment.id);

    for (let attempt = 0; attempt < attemptLimit; attempt++) {
      const [existing, guards] = await Promise.all([read<StoredAssignment>(recordPath), readGuards(descriptors)]);
      if (existing) return { ok: false, reason: 'assignment-id-taken' } as const;
      const result = checkWrite(assignment, affectedAssignments(guards), teacherMaxHoursHundredths);
      if (!result.ok) return result;

      const stored = { ...assignment, classroomId: result.effectiveClassroomId };
      const writes = [
        ...guardWrites(guards, stored, activePaths),
        { name: recordPath, value: stored, updateTime: null },
      ];
      if (context) {
        writes.push(buildAuditWrite('assignment.add', assignment.id, null, stored, context));
      }
      if (await commit(writes)) return result;
    }
    throw new Error('Emulator assignment guards changed too many times.');
  }

  async function changeExisting(
    id: string,
    edit?: { draft: LocalDraft; teacherMaxHoursHundredths: number },
    context?: AssignmentMutationContext,
  ) {
    if (context) {
      const authz = authorizeAssignmentMutation(context.actor, {
        action: edit ? 'edit' : 'cancel',
        careerId: context.careerId,
        teacherId: edit?.draft.teacherId,
        groupStatus: context.groupStatus,
      });
      if (!authz.ok) return authz;
    }

    const recordPath = record(id);
    for (let attempt = 0; attempt < attemptLimit; attempt++) {
      const existing = await read<StoredAssignment>(recordPath);
      if (!existing || (edit && existing.value.status !== 'active')) {
        return { ok: false, reason: 'assignment-not-active' } as const;
      }
      if (existing.value.status === 'cancelled') return { ok: true } as const;

      const nextDescriptors = edit ? guardDescriptors(edit.draft) : [];
      const activePaths = new Set(nextDescriptors.map((descriptor) => descriptor.path));
      // An edit must release the old reservations and acquire the new ones in the same commit.
      const merged = new Map<string, GuardDescriptor>();
      for (const descriptor of [...guardDescriptors(existing.value), ...nextDescriptors]) {
        merged.set(descriptor.path, descriptor);
      }
      const guards = await readGuards([...merged.values()]);
      let stored: StoredAssignment = { ...existing.value, status: 'cancelled' };
      let result: EditResult | CancelResult = { ok: true };
      if (edit) {
        result = checkWrite(edit.draft, affectedAssignments(guards), edit.teacherMaxHoursHundredths, id);
        if (!result.ok) return result;
        stored = {
          ...edit.draft,
          id,
          cycleId: existing.value.cycleId,
          status: 'active',
          classroomId: result.effectiveClassroomId,
        };
      }
      const writes = [
        ...guardWrites(guards, stored, activePaths),
        { name: recordPath, value: stored, updateTime: existing.updateTime },
      ];
      if (context) {
        writes.push(
          buildAuditWrite(
            edit ? 'assignment.edit' : 'assignment.cancel',
            id,
            existing.value,
            stored,
            context,
          ),
        );
      }
      if (await commit(writes)) return result;
    }
    throw new Error('Emulator assignment guards changed too many times.');
  }

  return {
    add,
    edit: (
      id: string,
      draft: LocalDraft,
      teacherMaxHoursHundredths: number,
      context?: AssignmentMutationContext,
    ) => changeExisting(id, { draft, teacherMaxHoursHundredths }, context),
    cancel: (id: string, context?: AssignmentMutationContext) => changeExisting(id, undefined, context),
    get: async (id: string) => (await read<StoredAssignment>(record(id)))?.value ?? null,
    listAuditEvents: async () => (await list<AuditEvent>(`${name}/auditEvents`)).map((doc) => doc.value),
    stats,
  };
}
