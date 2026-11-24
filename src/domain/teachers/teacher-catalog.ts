export type CoordinatorLoadBreakdownItem = Readonly<{
  coordinatorId: string | null;
  coordinatorName: string;
  assignedHoursHundredths: number;
  isOwnScope: boolean;
}>;

export type AssignedCoordinatorSummary = Readonly<{
  id: string;
  name: string;
  active: boolean;
  isResponsible: boolean;
}>;

export type TeacherSummary = Readonly<{
  id: string;
  name: string;
  normalizedName: string;
  email: string | null;
  notes: string | null;
  maxHoursHundredths: number;
  assignedHoursHundredths: number;
  availableHoursHundredths: number;
  active: boolean;
  responsibleCoordinatorId: string | null;
  availableProfileCodes: readonly string[];
  coordinators: readonly AssignedCoordinatorSummary[];
  loadBreakdown: readonly CoordinatorLoadBreakdownItem[];
  createdAtIso: string;
  updatedAtIso: string;
}>;

export type AssignmentLoadInput = Readonly<{
  teacherId: string;
  status: string;
  assignedHoursHundredths: number;
  careerId?: string | null;
  groupId?: string | null;
  cycleId?: string | null;
}>;

export const UNASSIGNED_COORDINATOR_LABEL = "Sin coordinador asignado";

export function teacherMaxHoursToHundredths(hours: number): number {
  if (!Number.isFinite(hours) || hours < 0 || hours > 99) {
    throw new Error("Teacher max hours must be between 0 and 99.");
  }
  const hundredths = Math.round(hours * 100);
  if (!Number.isInteger(hundredths) || hundredths < 0 || hundredths > 9900) {
    throw new Error("Teacher max hours hundredths must be an integer between 0 and 9900.");
  }
  return hundredths;
}

export function canSetTeacherMaxHours(
  nextMaxHoursHundredths: number,
  activeAssignedHoursHundredths: number
): boolean {
  if (
    !Number.isInteger(nextMaxHoursHundredths) ||
    nextMaxHoursHundredths < 0 ||
    nextMaxHoursHundredths > 9900
  ) {
    return false;
  }
  return nextMaxHoursHundredths >= activeAssignedHoursHundredths;
}

export function computeTeacherLoadSummary(input: Readonly<{
  teacherId: string;
  assignments: readonly AssignmentLoadInput[];
  groupCareerByGroupId: ReadonlyMap<string, string>;
  careerCoordinatorByCareerId: ReadonlyMap<string, string>;
  coordinatorNameById: ReadonlyMap<string, string>;
  viewerCoordinatorId: string | null;
}>): Readonly<{
  assignedHoursHundredths: number;
  loadBreakdown: readonly CoordinatorLoadBreakdownItem[];
}> {
  let totalHundredths = 0;
  const hoursByCoordinatorKey = new Map<string, number>();

  // AC18 + RN-04: sum active assignment hours across all cycles; ignore cancelled records.
  for (const assignment of input.assignments) {
    if (assignment.teacherId !== input.teacherId || assignment.status !== "active") {
      continue;
    }
    const hours = Number(assignment.assignedHoursHundredths ?? 0);
    if (!Number.isFinite(hours) || hours <= 0) {
      continue;
    }

    totalHundredths += hours;

    const resolvedCareerId =
      assignment.careerId?.trim() ||
      (assignment.groupId ? input.groupCareerByGroupId.get(assignment.groupId) : undefined) ||
      null;
    const coordinatorId =
      (resolvedCareerId ? input.careerCoordinatorByCareerId.get(resolvedCareerId) : undefined) ??
      null;

    const bucketKey = coordinatorId ?? "__unassigned__";
    hoursByCoordinatorKey.set(bucketKey, (hoursByCoordinatorKey.get(bucketKey) ?? 0) + hours);
  }

  // AC31: expose per-coordinator hour totals only, never foreign group or assignment identifiers.
  const loadBreakdown: CoordinatorLoadBreakdownItem[] = Array.from(hoursByCoordinatorKey.entries())
    .map(([bucketKey, assignedHoursHundredths]) => {
      const coordinatorId = bucketKey === "__unassigned__" ? null : bucketKey;
      const coordinatorName = coordinatorId
        ? (input.coordinatorNameById.get(coordinatorId) ?? coordinatorId)
        : UNASSIGNED_COORDINATOR_LABEL;
      const isOwnScope =
        input.viewerCoordinatorId !== null && coordinatorId === input.viewerCoordinatorId;

      return {
        coordinatorId,
        coordinatorName,
        assignedHoursHundredths,
        isOwnScope
      };
    })
    .sort((a, b) => {
      if (a.isOwnScope !== b.isOwnScope) {
        return a.isOwnScope ? -1 : 1;
      }
      if (b.assignedHoursHundredths !== a.assignedHoursHundredths) {
        return b.assignedHoursHundredths - a.assignedHoursHundredths;
      }
      return a.coordinatorName.localeCompare(b.coordinatorName);
    });

  return {
    assignedHoursHundredths: totalHundredths,
    loadBreakdown
  };
}
