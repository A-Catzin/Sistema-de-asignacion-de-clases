import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  canSetTeacherMaxHours,
  computeTeacherLoadSummary,
  teacherMaxHoursToHundredths
} from "../../src/domain/teachers/teacher-catalog";

const rootDir = path.resolve(__dirname, "../..");

describe("T13 teachers domain, max-hours floor, and AC31 load breakdown", () => {
  it("converts and validates teacher max hours including zero up to 99", () => {
    expect(teacherMaxHoursToHundredths(0)).toBe(0);
    expect(teacherMaxHoursToHundredths(20)).toBe(2000);
    expect(teacherMaxHoursToHundredths(12.5)).toBe(1250);
    expect(() => teacherMaxHoursToHundredths(-1)).toThrow();
    expect(() => teacherMaxHoursToHundredths(100)).toThrow();

    expect(canSetTeacherMaxHours(1000, 1000)).toBe(true);
    expect(canSetTeacherMaxHours(1200, 1000)).toBe(true);
    expect(canSetTeacherMaxHours(950, 1000)).toBe(false);
  });

  it("AC18 + RN-04 + AC31: sums active hours across cycles, ignores cancelled, and breaks down load by coordinator without leaking group or assignment ids", () => {
    const groupCareerByGroupId = new Map<string, string>([
      ["secret-group-isc", "career-isc"],
      ["secret-group-der", "career-der"]
    ]);
    const careerCoordinatorByCareerId = new Map<string, string>([
      ["career-isc", "coord-isc"],
      ["career-der", "coord-der"]
    ]);
    const coordinatorNameById = new Map<string, string>([
      ["coord-isc", "Coord Sistemas"],
      ["coord-der", "Coord Derecho"]
    ]);

    const summary = computeTeacherLoadSummary({
      teacherId: "teacher-shared",
      assignments: [
        {
          teacherId: "teacher-shared",
          status: "active",
          assignedHoursHundredths: 600,
          groupId: "secret-group-isc",
          cycleId: "2026-1"
        },
        {
          teacherId: "teacher-shared",
          status: "active",
          assignedHoursHundredths: 400,
          groupId: "secret-group-der",
          cycleId: "2026-2"
        },
        {
          teacherId: "teacher-shared",
          status: "cancelled",
          assignedHoursHundredths: 300,
          groupId: "secret-group-isc",
          cycleId: "2026-1"
        },
        {
          teacherId: "other-teacher",
          status: "active",
          assignedHoursHundredths: 800,
          groupId: "secret-group-isc",
          cycleId: "2026-1"
        }
      ],
      groupCareerByGroupId,
      careerCoordinatorByCareerId,
      coordinatorNameById,
      viewerCoordinatorId: "coord-isc"
    });

    expect(summary.assignedHoursHundredths).toBe(1000);
    expect(summary.loadBreakdown).toEqual([
      {
        coordinatorId: "coord-isc",
        coordinatorName: "Coord Sistemas",
        assignedHoursHundredths: 600,
        isOwnScope: true
      },
      {
        coordinatorId: "coord-der",
        coordinatorName: "Coord Derecho",
        assignedHoursHundredths: 400,
        isOwnScope: false
      }
    ]);

    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain("secret-group-isc");
    expect(serialized).not.toContain("secret-group-der");
  });

  it("buckets unassigned-coordinator careers cleanly", () => {
    const summary = computeTeacherLoadSummary({
      teacherId: "teacher-1",
      assignments: [
        {
          teacherId: "teacher-1",
          status: "active",
          assignedHoursHundredths: 500,
          careerId: "career-orphan"
        }
      ],
      groupCareerByGroupId: new Map(),
      careerCoordinatorByCareerId: new Map(),
      coordinatorNameById: new Map(),
      viewerCoordinatorId: null
    });

    expect(summary.assignedHoursHundredths).toBe(500);
    expect(summary.loadBreakdown).toEqual([
      {
        coordinatorId: null,
        coordinatorName: "Sin coordinador asignado",
        assignedHoursHundredths: 500,
        isOwnScope: false
      }
    ]);
  });

  it("guards teacher-service.ts with server-only", () => {
    const source = readFileSync(
      path.join(rootDir, "src/application/teachers/teacher-service.ts"),
      "utf8"
    );
    expect(source.trimStart().startsWith('import "server-only";')).toBe(true);
  });
});
