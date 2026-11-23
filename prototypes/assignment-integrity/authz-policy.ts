export type ActorContext = Readonly<{
  uid: string;
  active: boolean;
  role: 'admin' | 'coordinator';
  coordinatorActive?: boolean;
  careerIds: readonly string[];
  teacherIds: readonly string[];
}> | null;

export type GroupStatus = 'draft' | 'review' | 'active' | 'final' | 'archived';

export type AuthzRejection =
  | 'unauthenticated-or-inactive'
  | 'forbidden-role'
  | 'forbidden-scope'
  | 'group-closed';

export type AuthzDecision = { ok: true } | { ok: false; reason: AuthzRejection };

export function authorizeCycleActivation(actor: ActorContext): AuthzDecision {
  if (!actor || !actor.active) {
    return { ok: false, reason: 'unauthenticated-or-inactive' };
  }
  if (actor.role !== 'admin') {
    return { ok: false, reason: 'forbidden-role' };
  }
  return { ok: true };
}

export function authorizeAssignmentMutation(
  actor: ActorContext,
  target: Readonly<{
    action: 'add' | 'edit' | 'cancel';
    careerId: string;
    teacherId?: string;
    groupStatus: GroupStatus;
  }>,
): AuthzDecision {
  if (!actor || !actor.active) {
    return { ok: false, reason: 'unauthenticated-or-inactive' };
  }
  if (target.groupStatus === 'final' || target.groupStatus === 'archived') {
    return { ok: false, reason: 'group-closed' };
  }
  if (actor.role === 'admin') {
    return { ok: true };
  }
  if (!actor.coordinatorActive) {
    return { ok: false, reason: 'forbidden-scope' };
  }
  if (!actor.careerIds.includes(target.careerId)) {
    return { ok: false, reason: 'forbidden-scope' };
  }
  if ((target.action === 'add' || target.action === 'edit') && (!target.teacherId || !actor.teacherIds.includes(target.teacherId))) {
    return { ok: false, reason: 'forbidden-scope' };
  }
  return { ok: true };
}
