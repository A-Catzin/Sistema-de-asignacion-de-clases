import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertActiveActor,
  canAccessCohort,
  canManageUsersAndAdminCatalogs,
  canMutateAssignment,
  canMutateGroup,
  canMutateGroupSubject,
  canReadCareer,
  canReadGroupSchedule,
  canReadTeacher,
  canUpdateTeacher,
  canUseScheduleBlock,
  validateModalityShift,
  type ActorScope
} from "../../src/domain/auth/authorization-policy";

const rootDir = path.resolve(__dirname, "../..");

const admin: ActorScope = {
  uid: "admin-1",
  active: true,
  role: "admin",
  coordinatorId: null,
  careerIds: [],
  teacherIds: []
};

const coordA: ActorScope = {
  uid: "coord-a",
  active: true,
  role: "coordinator",
  coordinatorId: "coord-a",
  coordinatorActive: true,
  careerIds: ["career-1"],
  teacherIds: ["teacher-1", "teacher-shared"]
};

describe("T10 role and scope authorization policy", () => {
  it("blocks null, inactive users, and inactive coordinator records", () => {
    expect(assertActiveActor(null)).toEqual({ ok: false, reason: "unauthenticated-or-inactive" });
    expect(assertActiveActor({ ...admin, active: false })).toEqual({
      ok: false,
      reason: "unauthenticated-or-inactive"
    });
    expect(assertActiveActor({ ...coordA, coordinatorActive: false })).toEqual({
      ok: false,
      reason: "unauthenticated-or-inactive"
    });
  });

  it("restricts user management and admin catalogs to active admins", () => {
    expect(canManageUsersAndAdminCatalogs(admin)).toEqual({ ok: true });
    expect(canManageUsersAndAdminCatalogs(coordA)).toEqual({ ok: false, reason: "forbidden-role" });
  });

  it("enforces career and teacher scope including restricted teacher edits", () => {
    expect(canReadCareer(coordA, "career-1")).toEqual({ ok: true });
    expect(canReadCareer(coordA, "career-2")).toEqual({ ok: false, reason: "forbidden-scope" });

    expect(canReadTeacher(coordA, "teacher-shared")).toEqual({ ok: true });
    expect(canReadTeacher(coordA, "teacher-other")).toEqual({
      ok: false,
      reason: "forbidden-scope"
    });

    expect(
      canUpdateTeacher(coordA, { teacherId: "teacher-1", changesGeneralFields: false })
    ).toEqual({ ok: true });
    expect(
      canUpdateTeacher(coordA, { teacherId: "teacher-1", changesGeneralFields: true })
    ).toEqual({ ok: false, reason: "forbidden-role" });
    expect(
      canUpdateTeacher(admin, { teacherId: "teacher-1", changesGeneralFields: true })
    ).toEqual({ ok: true });
  });

  it("enforces modality/shift combinations and custom schedule block ownership", () => {
    expect(validateModalityShift("virtual_modular", "matutino")).toBe(true);
    expect(validateModalityShift("virtual_modular", "vespertino")).toBe(false);
    expect(validateModalityShift("maestrias", "vespertino")).toBe(true);
    expect(validateModalityShift("maestrias", "matutino")).toBe(false);

    expect(
      canUseScheduleBlock(
        coordA,
        { isCustom: true, createdByUid: "coord-a", modality: "escolarizado", shift: "matutino" },
        { modality: "escolarizado", shift: "matutino" }
      )
    ).toEqual({ ok: true });

    expect(
      canUseScheduleBlock(
        coordA,
        { isCustom: true, createdByUid: "coord-b", modality: "escolarizado", shift: "matutino" },
        { modality: "escolarizado", shift: "matutino" }
      )
    ).toEqual({ ok: false, reason: "forbidden-scope" });

    expect(
      canUseScheduleBlock(
        admin,
        { isCustom: false, createdByUid: null, modality: "virtual_modular", shift: "vespertino" },
        { modality: "virtual_modular", shift: "vespertino" }
      )
    ).toEqual({ ok: false, reason: "invalid-modality-shift" });
  });

  it("keeps draft/review isolated by career while opening final/archived read-only across the university", () => {
    expect(canReadGroupSchedule(coordA, { careerId: "career-2", status: "draft" })).toEqual({
      ok: false,
      reason: "forbidden-scope"
    });
    expect(canReadGroupSchedule(coordA, { careerId: "career-2", status: "review" })).toEqual({
      ok: false,
      reason: "forbidden-scope"
    });
    expect(canReadGroupSchedule(coordA, { careerId: "career-2", status: "final" })).toEqual({
      ok: true
    });
    expect(canReadGroupSchedule(coordA, { careerId: "career-2", status: "archived" })).toEqual({
      ok: true
    });
    expect(canReadGroupSchedule(null, { careerId: "career-2", status: "final" })).toEqual({
      ok: false,
      reason: "unauthenticated-or-inactive"
    });
  });

  it("enforces AC22, AC23, AC24, AC26, and AC19 rules on groups, subjects, assignments, and cohorts", () => {
    expect(
      canMutateGroup(coordA, "transition-status", {
        careerId: "career-1",
        currentStatus: "draft",
        nextStatus: "review"
      })
    ).toEqual({ ok: true });
    expect(
      canMutateGroup(coordA, "finalize", { careerId: "career-1", currentStatus: "review" })
    ).toEqual({ ok: false, reason: "forbidden-role" });
    expect(
      canMutateGroup(coordA, "delete-physical", { careerId: "career-1", linkedToActiveCohort: false })
    ).toEqual({ ok: false, reason: "forbidden-role" });
    expect(
      canMutateGroup(admin, "delete-physical", { careerId: "career-1", linkedToActiveCohort: true })
    ).toEqual({ ok: false, reason: "forbidden-delete-linked-cohort" });
    expect(
      canMutateGroup(admin, "delete-physical", { careerId: "career-1", linkedToActiveCohort: false })
    ).toEqual({ ok: true });

    expect(
      canMutateGroupSubject(coordA, "adjust-hours", { careerId: "career-1", groupStatus: "draft" })
    ).toEqual({ ok: true });
    expect(
      canMutateGroupSubject(coordA, "delete", { careerId: "career-1", groupStatus: "draft" })
    ).toEqual({ ok: false, reason: "forbidden-role" });
    expect(
      canMutateGroupSubject(admin, "adjust-hours", { careerId: "career-1", groupStatus: "final" })
    ).toEqual({ ok: false, reason: "group-closed" });

    expect(
      canMutateAssignment(coordA, "edit", {
        careerId: "career-1",
        teacherId: "teacher-shared",
        groupStatus: "review"
      })
    ).toEqual({ ok: true });
    expect(
      canMutateAssignment(coordA, "add", {
        careerId: "career-1",
        teacherId: "teacher-unlinked",
        groupStatus: "draft"
      })
    ).toEqual({ ok: false, reason: "forbidden-scope" });
    expect(
      canMutateAssignment(admin, "cancel", { careerId: "career-1", groupStatus: "archived" })
    ).toEqual({ ok: false, reason: "group-closed" });

    expect(canAccessCohort(coordA, "create", "career-1")).toEqual({ ok: true });
    expect(canAccessCohort(coordA, "complete-or-archive", "career-1")).toEqual({
      ok: false,
      reason: "forbidden-role"
    });
    expect(canAccessCohort(admin, "complete-or-archive", "career-1")).toEqual({ ok: true });
  });

  it("protects server-scope.ts and provisioning.ts with server-only", () => {
    for (const relPath of [
      "src/lib/auth/server-scope.ts",
      "src/application/users/provisioning.ts"
    ]) {
      const source = readFileSync(path.join(rootDir, relPath), "utf8");
      expect(source.trimStart().startsWith('import "server-only";')).toBe(true);
    }
  });
});
