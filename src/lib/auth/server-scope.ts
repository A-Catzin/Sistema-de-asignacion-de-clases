import "server-only";

import {
  assertActiveActor,
  canManageUsersAndAdminCatalogs,
  type ActorScope,
  type AuthzRejection
} from "@/domain/auth/authorization-policy";
import { getAdminFirestore } from "@/infrastructure/firebase/admin";
import { getCurrentServerSession } from "@/lib/auth/server-session";
import type { SessionFailureReason } from "@/lib/auth/session-policy";

export type ActorScopeResult =
  | { ok: true; actor: NonNullable<ActorScope> }
  | { ok: false; status: 401; reason: SessionFailureReason }
  | { ok: false; status: 403; reason: AuthzRejection };

export async function loadActorScopeForUid(uid: string): Promise<ActorScope> {
  const db = getAdminFirestore();
  const profileSnap = await db.collection("userProfiles").doc(uid).get();
  if (!profileSnap.exists) {
    return null;
  }

  const profile = profileSnap.data() as {
    role?: unknown;
    active?: unknown;
    coordinatorActive?: unknown;
  };
  const active = profile.active === true;

  if (profile.role === "admin") {
    return {
      uid,
      active,
      role: "admin",
      coordinatorId: null,
      careerIds: [],
      teacherIds: []
    };
  }

  if (profile.role !== "coordinator") {
    return null;
  }

  const [coordSnap, careersSnap, coordTeachersSnap, responsibleTeachersSnap] = await Promise.all([
    db.collection("coordinators").doc(uid).get(),
    db.collection("coordinatorCareers").where("coordinatorId", "==", uid).get(),
    db.collection("coordinatorTeachers").where("coordinatorId", "==", uid).get(),
    db.collection("teachers").where("responsibleCoordinatorId", "==", uid).get()
  ]);

  const coordinatorActive = coordSnap.exists
    ? coordSnap.data()?.active === true
    : profile.coordinatorActive === true;

  const careerIds = careersSnap.docs
    .map((doc) => String(doc.data().careerId ?? ""))
    .filter(Boolean);

  const teacherIdSet = new Set<string>();
  for (const doc of coordTeachersSnap.docs) {
    const teacherId = doc.data().teacherId;
    if (typeof teacherId === "string" && teacherId) {
      teacherIdSet.add(teacherId);
    }
  }
  for (const doc of responsibleTeachersSnap.docs) {
    teacherIdSet.add(doc.id);
  }

  return {
    uid,
    active,
    role: "coordinator",
    coordinatorId: uid,
    coordinatorActive,
    careerIds: [...new Set(careerIds)],
    teacherIds: [...teacherIdSet]
  };
}

export async function getCurrentActorScope(): Promise<ActorScopeResult> {
  const session = await getCurrentServerSession();
  if (!session.ok) {
    return { ok: false, status: 401, reason: session.reason };
  }

  const actor = await loadActorScopeForUid(session.user.uid);
  const decision = assertActiveActor(actor);
  if (!decision.ok) {
    return { ok: false, status: 403, reason: decision.reason };
  }

  return { ok: true, actor: actor! };
}

export async function requireActiveAdmin(): Promise<ActorScopeResult> {
  const scope = await getCurrentActorScope();
  if (!scope.ok) return scope;

  const decision = canManageUsersAndAdminCatalogs(scope.actor);
  if (!decision.ok) {
    return { ok: false, status: 403, reason: decision.reason };
  }

  return scope;
}
