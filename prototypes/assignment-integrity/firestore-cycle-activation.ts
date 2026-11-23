import { authorizeCycleActivation, type ActorContext, type AuthzDecision } from './authz-policy.ts';
import { createLocalFirestore, encodeKey, type ConditionalWrite } from './local-firestore.ts';

export type AcademicCycle = Readonly<{
  id: string;
  code: string;
  name: string;
  status: 'draft' | 'active' | 'finalized';
  active: boolean;
}>;

export type Cohort = Readonly<{
  id: string;
  name: string;
  careerId: string;
  modality: string;
  shift: string;
  status: 'active' | 'completed' | 'archived';
  currentQuarter: number;
}>;

export type Subject = Readonly<{
  id: string;
  careerId: string;
  name: string;
  quarter: number;
  defaultHoursHundredths: number;
  active: boolean;
}>;

export type CohortGroup = Readonly<{
  id: string;
  academicCycleId: string;
  careerId: string;
  cohortGroupId: string | null;
  quarter: number;
  modality: string;
  shift: string;
  name: string;
  classroomId: string | null;
  status: 'draft' | 'review' | 'final' | 'archived';
}>;

export type GroupSubject = Readonly<{
  id: string;
  groupId: string;
  subjectId: string;
  hoursPerWeekHundredths: number;
  status: 'active';
}>;

export type CohortSubjectHistory = Readonly<{
  id: string;
  cohortGroupId: string;
  subjectId: string;
  quarter: number;
  groupId: string | null;
}>;

export type CycleAuditEvent = Readonly<{
  id: string;
  correlationId: string;
  action: 'cycle.activate' | 'cohort.advance' | 'cohort.complete';
  entityType: 'cycle' | 'cohort';
  entityId: string;
  actorUid: string;
  actorRole: 'admin';
  timestampIso: string;
  before: unknown;
  after: unknown;
}>;

export type CycleSeedData = Readonly<{
  cycles?: readonly AcademicCycle[];
  activeCycleId?: string | null;
  cohorts?: readonly Cohort[];
  subjects?: readonly Subject[];
  groups?: readonly CohortGroup[];
  groupSubjects?: readonly GroupSubject[];
  history?: readonly CohortSubjectHistory[];
}>;

export type GeneratedGroupSummary = Readonly<{
  cohortId: string;
  groupId: string;
  quarter: number;
  subjectCount: number;
  groupName: string;
}>;

export type CycleActivationResult =
  | Exclude<AuthzDecision, { ok: true }>
  | { ok: false; reason: 'cycle-not-found' | 'cycle-not-activatable' }
  | {
      ok: false;
      reason:
        | 'cohort-quarter-mismatch'
        | 'career-has-no-active-subjects'
        | 'next-quarter-has-no-active-subjects';
      cohortId: string;
    }
  | {
      ok: true;
      status: 'activated';
      cycleId: string;
      generatedCount: number;
      completedCount: number;
      skippedCount: number;
      pendingInitialCount: number;
      generatedGroups: readonly GeneratedGroupSummary[];
    };

type CycleLock = Readonly<{ activeCycleId: string | null }>;

const attemptLimit = 8;

export function createLocalCycleActivationStore(host: string, scenarioId: string) {
  const { name, read, list, commit, stats } = createLocalFirestore(host, scenarioId);

  const cyclePath = (id: string) => `${name}/cycles/${encodeKey([id])}`;
  const lockPath = `${name}/cycleLock/active`;
  const cohortPath = (id: string) => `${name}/cohorts/${encodeKey([id])}`;
  const subjectPath = (id: string) => `${name}/subjects/${encodeKey([id])}`;
  const groupPath = (id: string) => `${name}/groups/${encodeKey([id])}`;
  const cohortCycleGroupId = (cohortId: string, cycleId: string) => `cohort-cycle:${cohortId}:${cycleId}`;
  const groupSubjectPath = (groupId: string, subjectId: string) =>
    `${name}/groupSubjects/${encodeKey([groupId, subjectId])}`;
  const historyPath = (cohortId: string, subjectId: string) =>
    `${name}/cohortSubjectHistory/${encodeKey([cohortId, subjectId])}`;
  const auditPath = (eventId: string) => `${name}/auditEvents/${encodeKey([eventId])}`;

  async function seed(data: CycleSeedData) {
    const writes: ConditionalWrite[] = [];
    for (const cycle of data.cycles ?? []) {
      writes.push({ name: cyclePath(cycle.id), value: cycle, updateTime: null });
    }
    if (data.activeCycleId !== undefined) {
      writes.push({
        name: lockPath,
        value: { activeCycleId: data.activeCycleId } satisfies CycleLock,
        updateTime: null,
      });
    }
    for (const cohort of data.cohorts ?? []) {
      writes.push({ name: cohortPath(cohort.id), value: cohort, updateTime: null });
    }
    for (const subject of data.subjects ?? []) {
      writes.push({ name: subjectPath(subject.id), value: subject, updateTime: null });
    }
    for (const group of data.groups ?? []) {
      writes.push({ name: groupPath(group.id), value: group, updateTime: null });
    }
    for (const gs of data.groupSubjects ?? []) {
      writes.push({ name: groupSubjectPath(gs.groupId, gs.subjectId), value: gs, updateTime: null });
    }
    for (const entry of data.history ?? []) {
      writes.push({ name: historyPath(entry.cohortGroupId, entry.subjectId), value: entry, updateTime: null });
    }
    for (let i = 0; i < writes.length; i += 500) {
      const ok = await commit(writes.slice(i, i + 500));
      if (!ok) throw new Error('Seed commit failed due to pre-existing documents.');
    }
  }

  async function activateCycle(
    actor: ActorContext,
    targetCycleId: string,
    options?: Readonly<{
      correlationId?: string;
      timestampIso?: string;
      beforeCohortCommit?: (cohortId: string) => void | Promise<void>;
    }>,
  ): Promise<CycleActivationResult> {
    const authz = authorizeCycleActivation(actor);
    if (!authz.ok) return authz;
    if (!actor || actor.role !== 'admin') {
      return { ok: false, reason: 'forbidden-role' };
    }

    const correlationId = options?.correlationId ?? `activate-${targetCycleId}`;
    const timestampIso = options?.timestampIso ?? new Date().toISOString();

    // Phase A: atomically switch active cycle and close the previous active cycle.
    let phaseACompleted = false;
    for (let attempt = 0; attempt < attemptLimit; attempt++) {
      const [lockDoc, targetDoc] = await Promise.all([
        read<CycleLock>(lockPath),
        read<AcademicCycle>(cyclePath(targetCycleId)),
      ]);
      if (!targetDoc) return { ok: false, reason: 'cycle-not-found' };
      if (targetDoc.value.status === 'finalized') {
        return { ok: false, reason: 'cycle-not-activatable' };
      }
      if (targetDoc.value.status === 'active') {
        phaseACompleted = true;
        break;
      }

      const previousId = lockDoc?.value.activeCycleId ?? null;
      const previousDoc =
        previousId && previousId !== targetCycleId ? await read<AcademicCycle>(cyclePath(previousId)) : null;

      const writes: ConditionalWrite[] = [];
      if (previousDoc && previousDoc.value.status === 'active') {
        writes.push({
          name: cyclePath(previousDoc.value.id),
          value: { ...previousDoc.value, status: 'finalized', active: false } satisfies AcademicCycle,
          updateTime: previousDoc.updateTime,
        });
      }

      const activatedCycle: AcademicCycle = { ...targetDoc.value, status: 'active', active: true };
      writes.push({
        name: cyclePath(targetCycleId),
        value: activatedCycle,
        updateTime: targetDoc.updateTime,
      });
      writes.push({
        name: lockPath,
        value: { activeCycleId: targetCycleId } satisfies CycleLock,
        updateTime: lockDoc?.updateTime ?? null,
      });

      const cycleEventId = `cycle.activate:${targetCycleId}`;
      const cycleAudit: CycleAuditEvent = {
        id: cycleEventId,
        correlationId,
        action: 'cycle.activate',
        entityType: 'cycle',
        entityId: targetCycleId,
        actorUid: actor.uid,
        actorRole: 'admin',
        timestampIso,
        before: {
          previousActiveCycleId: previousDoc?.value.id ?? null,
          targetCycle: targetDoc.value,
        },
        after: {
          activeCycleId: targetCycleId,
          targetCycle: activatedCycle,
        },
      };
      writes.push({ name: auditPath(cycleEventId), value: cycleAudit, updateTime: null });

      if (await commit(writes)) {
        phaseACompleted = true;
        break;
      }
    }

    if (!phaseACompleted) {
      throw new Error('Emulator cycle activation conflicted too many times.');
    }

    // Phase B: idempotently advance each active cohort in its own bounded transaction.
    const [allCohorts, allSubjects] = await Promise.all([
      list<Cohort>(`${name}/cohorts`),
      list<Subject>(`${name}/subjects`),
    ]);

    const activeCohorts = allCohorts
      .map((doc) => doc.value)
      .filter((cohort) => cohort.status === 'active')
      .sort((a, b) => a.id.localeCompare(b.id));

    const subjectsByCareer = new Map<string, Subject[]>();
    for (const subjectDoc of allSubjects) {
      const subject = subjectDoc.value;
      if (!subject.active) continue;
      const listForCareer = subjectsByCareer.get(subject.careerId) ?? [];
      listForCareer.push(subject);
      subjectsByCareer.set(subject.careerId, listForCareer);
    }

    let generatedCount = 0;
    let completedCount = 0;
    let skippedCount = 0;
    let pendingInitialCount = 0;
    const generatedGroups: GeneratedGroupSummary[] = [];

    for (const cohortSummary of activeCohorts) {
      let resolved = false;
      for (let attempt = 0; attempt < attemptLimit; attempt++) {
        const targetGroupId = cohortCycleGroupId(cohortSummary.id, targetCycleId);
        const [cohortDoc, targetGroupDoc, allGroups] = await Promise.all([
          read<Cohort>(cohortPath(cohortSummary.id)),
          read<CohortGroup>(groupPath(targetGroupId)),
          list<CohortGroup>(`${name}/groups`),
        ]);

        if (!cohortDoc) break;
        const cohort = cohortDoc.value;
        if (cohort.status === 'completed' || targetGroupDoc !== null) {
          skippedCount += 1;
          resolved = true;
          break;
        }

        const cohortGroups = allGroups
          .map((doc) => doc.value)
          .filter((group) => group.cohortGroupId === cohort.id)
          .sort((a, b) => b.quarter - a.quarter || b.id.localeCompare(a.id));

        const latestGroup = cohortGroups[0];
        if (!latestGroup) {
          pendingInitialCount += 1;
          resolved = true;
          break;
        }

        if (latestGroup.quarter !== cohort.currentQuarter) {
          return { ok: false, reason: 'cohort-quarter-mismatch', cohortId: cohort.id };
        }

        const careerSubjects = subjectsByCareer.get(cohort.careerId) ?? [];
        if (careerSubjects.length === 0) {
          return { ok: false, reason: 'career-has-no-active-subjects', cohortId: cohort.id };
        }

        const lastCurriculumQuarter = Math.max(...careerSubjects.map((subject) => subject.quarter));

        if (cohort.currentQuarter >= lastCurriculumQuarter) {
          await options?.beforeCohortCommit?.(cohort.id);
          const completedCohort: Cohort = { ...cohort, status: 'completed' };
          const eventId = `cohort.complete:${cohort.id}:${targetCycleId}`;
          const audit: CycleAuditEvent = {
            id: eventId,
            correlationId,
            action: 'cohort.complete',
            entityType: 'cohort',
            entityId: cohort.id,
            actorUid: actor.uid,
            actorRole: 'admin',
            timestampIso,
            before: cohort,
            after: completedCohort,
          };
          const ok = await commit([
            { name: cohortPath(cohort.id), value: completedCohort, updateTime: cohortDoc.updateTime },
            { name: auditPath(eventId), value: audit, updateTime: null },
          ]);
          if (ok) {
            completedCount += 1;
            resolved = true;
            break;
          }
          continue;
        }

        const nextQuarter = cohort.currentQuarter + 1;
        const nextSubjects = careerSubjects
          .filter((subject) => subject.quarter === nextQuarter)
          .sort((a, b) => a.name.localeCompare(b.name));
        if (nextSubjects.length === 0) {
          return { ok: false, reason: 'next-quarter-has-no-active-subjects', cohortId: cohort.id };
        }

        const allGroupSubjects = await list<GroupSubject>(`${name}/groupSubjects`);
        const latestSubjects = allGroupSubjects
          .map((doc) => doc.value)
          .filter((gs) => gs.groupId === latestGroup.id && gs.status === 'active');

        const uniqueSubjectIds = [...new Set(latestSubjects.map((gs) => gs.subjectId))];
        const existingHistoryDocs = await Promise.all(
          uniqueSubjectIds.map((subjectId) => read<CohortSubjectHistory>(historyPath(cohort.id, subjectId))),
        );

        await options?.beforeCohortCommit?.(cohort.id);

        const writes: ConditionalWrite[] = [];
        uniqueSubjectIds.forEach((subjectId, idx) => {
          const entry: CohortSubjectHistory = {
            id: `${cohort.id}:${subjectId}`,
            cohortGroupId: cohort.id,
            subjectId,
            quarter: cohort.currentQuarter,
            groupId: latestGroup.id,
          };
          writes.push({
            name: historyPath(cohort.id, subjectId),
            value: entry,
            updateTime: existingHistoryDocs[idx]?.updateTime ?? null,
          });
        });

        const groupName = `${cohort.name} Q${nextQuarter}`;
        const newGroup: CohortGroup = {
          id: targetGroupId,
          academicCycleId: targetCycleId,
          careerId: cohort.careerId,
          cohortGroupId: cohort.id,
          quarter: nextQuarter,
          modality: cohort.modality,
          shift: cohort.shift,
          name: groupName,
          classroomId: latestGroup.classroomId,
          status: 'draft',
        };
        writes.push({ name: groupPath(targetGroupId), value: newGroup, updateTime: null });

        for (const subject of nextSubjects) {
          const gs: GroupSubject = {
            id: `${targetGroupId}:${subject.id}`,
            groupId: targetGroupId,
            subjectId: subject.id,
            hoursPerWeekHundredths: subject.defaultHoursHundredths,
            status: 'active',
          };
          writes.push({
            name: groupSubjectPath(targetGroupId, subject.id),
            value: gs,
            updateTime: null,
          });
        }

        const updatedCohort: Cohort = { ...cohort, currentQuarter: nextQuarter };
        writes.push({
          name: cohortPath(cohort.id),
          value: updatedCohort,
          updateTime: cohortDoc.updateTime,
        });

        const eventId = `cohort.advance:${cohort.id}:${targetCycleId}`;
        const audit: CycleAuditEvent = {
          id: eventId,
          correlationId,
          action: 'cohort.advance',
          entityType: 'cohort',
          entityId: cohort.id,
          actorUid: actor.uid,
          actorRole: 'admin',
          timestampIso,
          before: cohort,
          after: { cohort: updatedCohort, group: newGroup },
        };
        writes.push({ name: auditPath(eventId), value: audit, updateTime: null });

        if (await commit(writes)) {
          generatedCount += 1;
          generatedGroups.push({
            cohortId: cohort.id,
            groupId: targetGroupId,
            quarter: nextQuarter,
            subjectCount: nextSubjects.length,
            groupName,
          });
          resolved = true;
          break;
        }
      }

      if (!resolved) {
        throw new Error(`Cohort advancement conflicted too many times (${cohortSummary.id}).`);
      }
    }

    return {
      ok: true,
      status: 'activated',
      cycleId: targetCycleId,
      generatedCount,
      completedCount,
      skippedCount,
      pendingInitialCount,
      generatedGroups,
    };
  }

  return {
    seed,
    activateCycle,
    listCycles: async () => (await list<AcademicCycle>(`${name}/cycles`)).map((doc) => doc.value),
    listCohorts: async () => (await list<Cohort>(`${name}/cohorts`)).map((doc) => doc.value),
    listGroups: async () => (await list<CohortGroup>(`${name}/groups`)).map((doc) => doc.value),
    listGroupSubjects: async () => (await list<GroupSubject>(`${name}/groupSubjects`)).map((doc) => doc.value),
    listHistory: async () => (await list<CohortSubjectHistory>(`${name}/cohortSubjectHistory`)).map((doc) => doc.value),
    listAuditEvents: async () => (await list<CycleAuditEvent>(`${name}/auditEvents`)).map((doc) => doc.value),
    stats,
  };
}
