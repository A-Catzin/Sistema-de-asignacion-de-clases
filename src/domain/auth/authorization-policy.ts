import type { UserRole } from "@/lib/auth/session-policy";

export type GroupStatus = "draft" | "review" | "final" | "archived";
export type Modality =
  | "escolarizado"
  | "modular"
  | "virtual_modular"
  | "maestrias"
  | "sabatino";
export type Shift = "matutino" | "vespertino";

export type ActorScope = Readonly<{
  uid: string;
  active: boolean;
  role: UserRole;
  coordinatorId?: string | null;
  coordinatorActive?: boolean;
  careerIds: readonly string[];
  teacherIds: readonly string[];
}> | null;

export type AuthzRejection =
  | "unauthenticated-or-inactive"
  | "forbidden-role"
  | "forbidden-scope"
  | "group-closed"
  | "invalid-modality-shift"
  | "forbidden-delete-linked-cohort";

export type AuthzDecision = { ok: true } | { ok: false; reason: AuthzRejection };

const ALLOW: AuthzDecision = { ok: true };

function deny(reason: AuthzRejection): AuthzDecision {
  return { ok: false, reason };
}

export function assertActiveActor(actor: ActorScope): AuthzDecision {
  if (!actor || !actor.active) {
    return deny("unauthenticated-or-inactive");
  }
  if (actor.role === "coordinator" && actor.coordinatorActive !== true) {
    return deny("unauthenticated-or-inactive");
  }
  return ALLOW;
}

export function canManageUsersAndAdminCatalogs(actor: ActorScope): AuthzDecision {
  const active = assertActiveActor(actor);
  if (!active.ok) return active;
  return actor!.role === "admin" ? ALLOW : deny("forbidden-role");
}

export function canReadCareer(actor: ActorScope, careerId: string): AuthzDecision {
  const active = assertActiveActor(actor);
  if (!active.ok) return active;
  if (actor!.role === "admin" || actor!.careerIds.includes(careerId)) {
    return ALLOW;
  }
  return deny("forbidden-scope");
}

export function canReadTeacher(actor: ActorScope, teacherId: string): AuthzDecision {
  const active = assertActiveActor(actor);
  if (!active.ok) return active;
  if (actor!.role === "admin" || actor!.teacherIds.includes(teacherId)) {
    return ALLOW;
  }
  return deny("forbidden-scope");
}

export function canUpdateTeacher(
  actor: ActorScope,
  target: Readonly<{ teacherId: string; changesGeneralFields: boolean }>
): AuthzDecision {
  const active = assertActiveActor(actor);
  if (!active.ok) return active;
  if (actor!.role === "admin") return ALLOW;
  if (!actor!.teacherIds.includes(target.teacherId)) {
    return deny("forbidden-scope");
  }
  return target.changesGeneralFields ? deny("forbidden-role") : ALLOW;
}

export function validateModalityShift(modality: Modality, shift: Shift): boolean {
  if (modality === "virtual_modular") return shift === "matutino";
  if (modality === "maestrias") return shift === "vespertino";
  return true;
}

export function canUseScheduleBlock(
  actor: ActorScope,
  block: Readonly<{
    isCustom: boolean;
    createdByUid: string | null;
    modality: Modality;
    shift: Shift;
  }>,
  group: Readonly<{ modality: Modality; shift: Shift }>
): AuthzDecision {
  const active = assertActiveActor(actor);
  if (!active.ok) return active;

  if (
    !validateModalityShift(block.modality, block.shift) ||
    !validateModalityShift(group.modality, group.shift) ||
    block.modality !== group.modality ||
    block.shift !== group.shift
  ) {
    return deny("invalid-modality-shift");
  }

  if (block.isCustom && actor!.role !== "admin" && block.createdByUid !== actor!.uid) {
    return deny("forbidden-scope");
  }
  return ALLOW;
}

export function canReadGroupSchedule(
  actor: ActorScope,
  group: Readonly<{ careerId: string; status: GroupStatus }>
): AuthzDecision {
  const active = assertActiveActor(actor);
  if (!active.ok) return active;

  // Finalized and archived group schedules are read-only across the university for all active users.
  if (group.status === "final" || group.status === "archived") {
    return ALLOW;
  }
  return actor!.role === "admin" || actor!.careerIds.includes(group.careerId)
    ? ALLOW
    : deny("forbidden-scope");
}

export function canMutateGroup(
  actor: ActorScope,
  action:
    | "create"
    | "update-general"
    | "transition-status"
    | "finalize"
    | "archive"
    | "delete-physical",
  target: Readonly<{
    careerId: string;
    currentStatus?: GroupStatus;
    nextStatus?: GroupStatus;
    linkedToActiveCohort?: boolean;
  }>
): AuthzDecision {
  const active = assertActiveActor(actor);
  if (!active.ok) return active;

  if (action === "delete-physical") {
    if (actor!.role !== "admin") return deny("forbidden-role");
    return target.linkedToActiveCohort ? deny("forbidden-delete-linked-cohort") : ALLOW;
  }

  if (actor!.role === "admin") {
    return ALLOW;
  }

  if (!actor!.careerIds.includes(target.careerId)) {
    return deny("forbidden-scope");
  }

  if (action === "create") {
    return ALLOW;
  }

  if (action === "transition-status") {
    const validCoordinatorTransition =
      (target.currentStatus === "draft" && target.nextStatus === "review") ||
      (target.currentStatus === "review" && target.nextStatus === "draft");
    return validCoordinatorTransition ? ALLOW : deny("forbidden-role");
  }

  return deny("forbidden-role");
}

export function canMutateGroupSubject(
  actor: ActorScope,
  action: "adjust-hours" | "change-profile" | "delete",
  target: Readonly<{ careerId: string; groupStatus: GroupStatus }>
): AuthzDecision {
  const active = assertActiveActor(actor);
  if (!active.ok) return active;

  if (target.groupStatus === "final" || target.groupStatus === "archived") {
    return deny("group-closed");
  }
  if (actor!.role === "admin") return ALLOW;
  if (!actor!.careerIds.includes(target.careerId)) {
    return deny("forbidden-scope");
  }
  return action === "adjust-hours" ? ALLOW : deny("forbidden-role");
}

export function canMutateAssignment(
  actor: ActorScope,
  action: "add" | "edit" | "cancel",
  target: Readonly<{ careerId: string; teacherId?: string; groupStatus: GroupStatus }>
): AuthzDecision {
  const active = assertActiveActor(actor);
  if (!active.ok) return active;

  if (target.groupStatus === "final" || target.groupStatus === "archived") {
    return deny("group-closed");
  }
  if (actor!.role === "admin") return ALLOW;

  if (!actor!.careerIds.includes(target.careerId)) {
    return deny("forbidden-scope");
  }
  if ((action === "add" || action === "edit") && (!target.teacherId || !actor!.teacherIds.includes(target.teacherId))) {
    return deny("forbidden-scope");
  }
  return ALLOW;
}

export function canAccessCohort(
  actor: ActorScope,
  action: "read" | "create" | "complete-or-archive",
  careerId: string
): AuthzDecision {
  const active = assertActiveActor(actor);
  if (!active.ok) return active;

  if (actor!.role === "admin") return ALLOW;
  if (action === "complete-or-archive") return deny("forbidden-role");
  return actor!.careerIds.includes(careerId) ? ALLOW : deny("forbidden-scope");
}
