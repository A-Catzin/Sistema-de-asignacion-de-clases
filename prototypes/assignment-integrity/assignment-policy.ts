type ScheduleSlot = Readonly<{
  day: number;
  startMinute: number;
  endMinute: number;
  module: 0 | 1 | 2;
}>;

export type AssignmentDraft = Readonly<{
  teacherId: string;
  groupId: string;
  classroomId: string | null;
  groupClassroomId: string | null;
  assignedHoursHundredths: number;
  slot: ScheduleSlot;
}>;

export type AssignmentSnapshot = AssignmentDraft & Readonly<{
  id: string;
  status: 'active' | 'cancelled';
  cycleId: string;
}>;

type Rejection = 'invalid-assigned-hours' | 'teacher-load-exceeded' |
  'teacher-overlap' | 'group-overlap' | 'classroom-overlap';

type Decision = { ok: true; effectiveClassroomId: string | null } | { ok: false; reason: Rejection };

function overlaps(a: ScheduleSlot, b: ScheduleSlot): boolean {
  if (a.day !== b.day || (a.module > 0 && b.module > 0 && a.module !== b.module)) {
    return false;
  }
  return a.startMinute < b.endMinute && b.startMinute < a.endMinute;
}

export function effectiveClassroom(assignment: AssignmentDraft): string | null {
  return assignment.classroomId ?? assignment.groupClassroomId;
}

// A storage adapter must provide a complete snapshot and enforce concurrency separately.
export function checkAssignment(
  draft: AssignmentDraft,
  assignments: readonly AssignmentSnapshot[],
  teacherMaxHoursHundredths: number,
  editingId?: string,
): Decision {
  const hours = draft.assignedHoursHundredths;
  if (!Number.isInteger(hours) || hours < 1 || hours > 9900) {
    return { ok: false, reason: 'invalid-assigned-hours' };
  }

  const active = assignments.filter((item) => item.status === 'active' && item.id !== editingId);
  const load = active.reduce((sum, item) => (
    item.teacherId === draft.teacherId ? sum + item.assignedHoursHundredths : sum
  ), hours);
  if (load > teacherMaxHoursHundredths) {
    return { ok: false, reason: 'teacher-load-exceeded' };
  }

  const overlapping = active.filter((item) => overlaps(draft.slot, item.slot));
  if (overlapping.some((item) => item.teacherId === draft.teacherId)) {
    return { ok: false, reason: 'teacher-overlap' };
  }
  if (overlapping.some((item) => item.groupId === draft.groupId)) {
    return { ok: false, reason: 'group-overlap' };
  }

  const room = effectiveClassroom(draft);
  if (room !== null && overlapping.some((item) => effectiveClassroom(item) === room)) {
    return { ok: false, reason: 'classroom-overlap' };
  }
  return { ok: true, effectiveClassroomId: room };
}
