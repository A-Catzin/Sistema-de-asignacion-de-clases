import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  hoursToHundredths,
  hundredthsToHours,
  isTeacherCompatibleWithRequirements,
  isValidCareerCode,
  isValidProfileCode,
  isValidSubjectCode,
  normalizeCareerCode,
  normalizeProfileCode,
  normalizeSubjectCode,
  resolveEffectiveRequiredProfiles,
  uniqueValidProfileCodes
} from "../../src/domain/academic/academic-offer";

const rootDir = path.resolve(__dirname, "../..");

describe("T12 academic offer & requirement compatibility", () => {
  it("normalizes and validates career codes, subject codes (Clave), profile codes, and integer hundredths hours", () => {
    expect(normalizeCareerCode("  ing sis  ")).toBe("ING_SIS");
    expect(isValidCareerCode("ISC-2026")).toBe(true);
    expect(isValidCareerCode("A")).toBe(false);

    expect(normalizeSubjectCode("  isc 06  ")).toBe("ISC_06");
    expect(normalizeSubjectCode("isc06")).toBe("ISC06");
    expect(isValidSubjectCode("ISC06")).toBe(true);
    expect(isValidSubjectCode("MAT-101")).toBe(true);
    expect(isValidSubjectCode("X")).toBe(false);
    expect(isValidSubjectCode("ISC@06")).toBe(false);

    expect(normalizeProfileCode("  ing. sistemas ")).toBe("ING.SISTEMAS");
    expect(isValidProfileCode("ING_SIS")).toBe(true);
    expect(isValidProfileCode("NaN")).toBe(false);
    expect(isValidProfileCode("#REF!")).toBe(false);
    expect(uniqueValidProfileCodes([" ing_sis ", "MAT", "ING_SIS", "null"])).toEqual([
      "ING_SIS",
      "MAT"
    ]);

    expect(hoursToHundredths(4.5)).toBe(450);
    expect(hundredthsToHours(450)).toBe(4.5);
    expect(() => hoursToHundredths(0)).toThrow();
    expect(() => hoursToHundredths(100)).toThrow();
  });

  it("AC05: allows any matching required profile and skips check when no requirements exist", () => {
    expect(
      isTeacherCompatibleWithRequirements({
        teacherProfileCodes: ["MAT"],
        subjectRequiredProfileCodes: []
      })
    ).toBe(true);

    expect(
      isTeacherCompatibleWithRequirements({
        teacherProfileCodes: ["MAT"],
        subjectRequiredProfileCodes: ["ING_SIS", "MAT"]
      })
    ).toBe(true);

    expect(
      isTeacherCompatibleWithRequirements({
        teacherProfileCodes: ["DERECHO"],
        subjectRequiredProfileCodes: ["ING_SIS", "MAT"]
      })
    ).toBe(false);
  });

  it("AC06: group-subject required profile override replaces general subject requirements", () => {
    expect(
      resolveEffectiveRequiredProfiles({
        groupSubjectRequiredProfileCode: "red_seg",
        subjectRequiredProfileCodes: ["ING_SIS", "MAT"]
      })
    ).toEqual(["RED_SEG"]);

    expect(
      isTeacherCompatibleWithRequirements({
        teacherProfileCodes: ["ING_SIS"],
        groupSubjectRequiredProfileCode: "RED_SEG",
        subjectRequiredProfileCodes: ["ING_SIS", "MAT"]
      })
    ).toBe(false);

    expect(
      isTeacherCompatibleWithRequirements({
        teacherProfileCodes: ["RED_SEG"],
        groupSubjectRequiredProfileCode: "RED_SEG",
        subjectRequiredProfileCodes: ["ING_SIS", "MAT"]
      })
    ).toBe(true);
  });

  it("guards offer-service.ts with server-only", () => {
    const source = readFileSync(
      path.join(rootDir, "src/application/academic/offer-service.ts"),
      "utf8"
    );
    expect(source.trimStart().startsWith('import "server-only";')).toBe(true);
  });
});
