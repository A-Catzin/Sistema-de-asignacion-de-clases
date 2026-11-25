import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  blocksConflictInTemplate,
  formatMinutesToHhMm,
  isValidModuleForModality,
  modalityUsesModules,
  normalizeIsoDateList,
  parseHhMmToMinutes,
  resolveEffectiveModuleDates,
  validateBlockSelectionForGroup,
  validateCycleModuleSchedule
} from "../../src/domain/schedules/schedule-catalog";
import type { ActorScope } from "../../src/domain/auth/authorization-policy";

const rootDir = path.resolve(__dirname, "../..");

const coordA: ActorScope = {
  uid: "coord-a",
  active: true,
  role: "coordinator",
  coordinatorId: "coord-a",
  coordinatorActive: true,
  careerIds: ["career-1"],
  teacherIds: []
};

describe("T14 classrooms, templates, schedule blocks, modules 0|1|2, and PD-06 dates", () => {
  it("parses HH:MM intervals strictly and enforces module 0|1|2 per modality (AC10)", () => {
    expect(parseHhMmToMinutes("08:00")).toBe(480);
    expect(parseHhMmToMinutes("13:30")).toBe(810);
    expect(formatMinutesToHhMm(810)).toBe("13:30");
    expect(() => parseHhMmToMinutes("24:00")).toThrow();
    expect(() => parseHhMmToMinutes("8:00")).toThrow();

    expect(modalityUsesModules("sabatino")).toBe(true);
    expect(modalityUsesModules("virtual_modular")).toBe(true);
    expect(modalityUsesModules("escolarizado")).toBe(false);
    expect(modalityUsesModules("modular")).toBe(false);
    expect(modalityUsesModules("maestrias")).toBe(false);

    expect(isValidModuleForModality("sabatino", 1)).toBe(true);
    expect(isValidModuleForModality("sabatino", 2)).toBe(true);
    expect(isValidModuleForModality("sabatino", 0)).toBe(false);
    expect(isValidModuleForModality("escolarizado", 0)).toBe(true);
    expect(isValidModuleForModality("escolarizado", 1)).toBe(false);
  });

  it("compares intervals and modules (RN-01, RN-02): adjacent or distinct modules 1 vs 2 coexist", () => {
    const sabM1Morning = { dayOfWeek: 6 as const, startMinute: 480, endMinute: 570, module: 1 as const };
    const sabM2Morning = { dayOfWeek: 6 as const, startMinute: 480, endMinute: 570, module: 2 as const };
    const sabM1Adjacent = { dayOfWeek: 6 as const, startMinute: 570, endMinute: 660, module: 1 as const };
    const sabM1Overlap = { dayOfWeek: 6 as const, startMinute: 540, endMinute: 630, module: 1 as const };
    const neutralOverlap = { dayOfWeek: 6 as const, startMinute: 540, endMinute: 630, module: 0 as const };

    expect(blocksConflictInTemplate(sabM1Morning, sabM2Morning)).toBe(false);
    expect(blocksConflictInTemplate(sabM1Morning, sabM1Adjacent)).toBe(false);
    expect(blocksConflictInTemplate(sabM1Morning, sabM1Overlap)).toBe(true);
    expect(blocksConflictInTemplate(sabM1Morning, neutralOverlap)).toBe(true);
  });

  it("PD-06: validates cycle-level module 1/2 dates and resolves special-case overrides", () => {
    expect(normalizeIsoDateList(["2026-09-19", "2026-09-05", "2026-09-19"])).toEqual([
      "2026-09-05",
      "2026-09-19"
    ]);
    expect(() => normalizeIsoDateList(["2026-02-30"])).toThrow();

    expect(
      validateCycleModuleSchedule({
        module1Dates: ["2026-09-05", "2026-09-12"],
        module2Dates: ["2026-10-17", "2026-10-24"]
      })
    ).toEqual({ ok: true });

    expect(
      validateCycleModuleSchedule({
        module1Dates: ["2026-09-12"],
        module2Dates: ["2026-09-12"]
      }).ok
    ).toBe(false);

    const cycleDates = {
      module1Dates: ["2026-09-05", "2026-09-12"],
      module2Dates: ["2026-10-17", "2026-10-24"]
    };

    expect(
      resolveEffectiveModuleDates({
        module: 1,
        cycleModuleDates: cycleDates
      })
    ).toEqual({
      source: "cycle_default",
      dates: ["2026-09-05", "2026-09-12"]
    });

    expect(
      resolveEffectiveModuleDates({
        module: 1,
        cycleModuleDates: cycleDates,
        specialCaseDatesOverride: ["2026-11-07"]
      })
    ).toEqual({
      source: "special_case",
      dates: ["2026-11-07"]
    });

    expect(
      resolveEffectiveModuleDates({
        module: 0,
        cycleModuleDates: cycleDates
      })
    ).toEqual({
      source: "none",
      dates: []
    });
  });

  it("AC09: rejects inactive template/block or foreign custom block for new selections", () => {
    expect(
      validateBlockSelectionForGroup({
        actor: coordA,
        template: { active: false, modality: "sabatino", shift: "matutino" },
        block: {
          active: true,
          isCustom: false,
          createdByUid: null,
          modality: "sabatino",
          shift: "matutino"
        },
        group: { modality: "sabatino", shift: "matutino" }
      })
    ).toEqual({ ok: false, reason: "template-inactive" });

    expect(
      validateBlockSelectionForGroup({
        actor: coordA,
        template: { active: true, modality: "sabatino", shift: "matutino" },
        block: {
          active: false,
          isCustom: false,
          createdByUid: null,
          modality: "sabatino",
          shift: "matutino"
        },
        group: { modality: "sabatino", shift: "matutino" }
      })
    ).toEqual({ ok: false, reason: "block-inactive" });

    expect(
      validateBlockSelectionForGroup({
        actor: coordA,
        template: { active: true, modality: "sabatino", shift: "matutino" },
        block: {
          active: true,
          isCustom: true,
          createdByUid: "coord-b",
          modality: "sabatino",
          shift: "matutino"
        },
        group: { modality: "sabatino", shift: "matutino" }
      })
    ).toEqual({ ok: false, reason: "forbidden-scope" });
  });

  it("guards schedule-service.ts with server-only", () => {
    const source = readFileSync(
      path.join(rootDir, "src/application/schedules/schedule-service.ts"),
      "utf8"
    );
    expect(source.trimStart().startsWith('import "server-only";')).toBe(true);
  });
});
