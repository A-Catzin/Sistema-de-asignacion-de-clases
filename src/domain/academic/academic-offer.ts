export type TeacherProfile = Readonly<{
  code: string;
  name: string;
  active: boolean;
  createdAtIso: string;
  updatedAtIso: string;
}>;

export type Career = Readonly<{
  id: string;
  code: string;
  name: string;
  normalizedName: string;
  active: boolean;
  createdAtIso: string;
  updatedAtIso: string;
}>;

export type SubjectWithRequirements = Readonly<{
  id: string;
  careerId: string;
  code: string;
  quarter: number;
  name: string;
  normalizedName: string;
  defaultHoursHundredths: number;
  active: boolean;
  requiredProfileCodes: readonly string[];
  createdAtIso: string;
  updatedAtIso: string;
}>;

const CAREER_CODE_PATTERN = /^[A-Z0-9_-]{2,24}$/;
const SUBJECT_CODE_PATTERN = /^[A-Z0-9_-]{2,24}$/;
const PROFILE_CODE_PATTERN = /^[A-Z0-9_]+$/;

export function normalizeTextKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

export function normalizeCareerCode(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .toUpperCase();
}

export function isValidCareerCode(value: string): boolean {
  return CAREER_CODE_PATTERN.test(normalizeCareerCode(value));
}

export function normalizeSubjectCode(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .toUpperCase();
}

export function isValidSubjectCode(value: string): boolean {
  return SUBJECT_CODE_PATTERN.test(normalizeSubjectCode(value));
}

export function normalizeProfileCode(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, "")
    .trim()
    .toUpperCase();
}

export function isValidProfileCode(value: string | null | undefined): boolean {
  const code = normalizeProfileCode(String(value ?? ""));
  if (!code) return false;
  if (code === "NAN" || code === "NULL" || code === "UNDEFINED") return false;
  if (code.includes("#REF") || code.includes("#ERROR")) return false;
  return PROFILE_CODE_PATTERN.test(code);
}

export function uniqueValidProfileCodes(values: readonly string[]): string[] {
  return Array.from(
    new Set(values.map((value) => normalizeProfileCode(value)).filter(isValidProfileCode))
  );
}

export function hoursToHundredths(hours: number): number {
  if (!Number.isFinite(hours) || hours <= 0 || hours > 99) {
    throw new Error("Default hours must be greater than 0 and at most 99.");
  }
  const hundredths = Math.round(hours * 100);
  if (!Number.isInteger(hundredths) || hundredths < 1 || hundredths > 9900) {
    throw new Error("Default hours must be between 0.01 and 99.");
  }
  return hundredths;
}

export function hundredthsToHours(hundredths: number): number {
  return hundredths / 100;
}

export function resolveEffectiveRequiredProfiles(input: Readonly<{
  groupSubjectRequiredProfileCode?: string | null;
  subjectRequiredProfileCodes: readonly string[];
}>): readonly string[] {
  const overrideRaw = input.groupSubjectRequiredProfileCode?.trim() ?? "";
  if (overrideRaw) {
    return isValidProfileCode(overrideRaw) ? [normalizeProfileCode(overrideRaw)] : [];
  }
  return uniqueValidProfileCodes(input.subjectRequiredProfileCodes);
}

export function isTeacherCompatibleWithRequirements(input: Readonly<{
  teacherProfileCodes: readonly string[];
  groupSubjectRequiredProfileCode?: string | null;
  subjectRequiredProfileCodes: readonly string[];
}>): boolean {
  const required = resolveEffectiveRequiredProfiles({
    groupSubjectRequiredProfileCode: input.groupSubjectRequiredProfileCode,
    subjectRequiredProfileCodes: input.subjectRequiredProfileCodes
  });
  if (required.length === 0) {
    return true;
  }

  const available = new Set(uniqueValidProfileCodes(input.teacherProfileCodes));
  return required.some((code) => available.has(code));
}
