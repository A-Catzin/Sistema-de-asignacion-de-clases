import {
  canUseScheduleBlock,
  type ActorScope,
  type AuthzRejection,
  type Modality,
  type Shift
} from "@/domain/auth/authorization-policy";

export type ScheduleModule = 0 | 1 | 2;
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6;

export const MODALITIES: ReadonlyArray<{ value: Modality; label: string }> = [
  { value: "escolarizado", label: "Escolarizado" },
  { value: "modular", label: "Modular" },
  { value: "sabatino", label: "Sabatino" },
  { value: "virtual_modular", label: "Virtual modular" },
  { value: "maestrias", label: "Maestrías" }
];

export const SHIFTS: ReadonlyArray<{ value: Shift; label: string }> = [
  { value: "matutino", label: "Matutino" },
  { value: "vespertino", label: "Vespertino" }
];

export const WEEKDAYS: ReadonlyArray<{ value: Weekday; short: string; label: string }> = [
  { value: 1, short: "LUN", label: "Lunes" },
  { value: 2, short: "MAR", label: "Martes" },
  { value: 3, short: "MIE", label: "Miércoles" },
  { value: 4, short: "JUE", label: "Jueves" },
  { value: 5, short: "VIE", label: "Viernes" },
  { value: 6, short: "SAB", label: "Sábado" }
];

export type Classroom = Readonly<{
  id: string;
  name: string;
  normalizedName: string;
  kind: string | null;
  capacity: number | null;
  active: boolean;
  createdAtIso: string;
  updatedAtIso: string;
}>;

export type ScheduleTemplate = Readonly<{
  id: string;
  code: string;
  label: string;
  modality: Modality;
  shift: Shift;
  startsAt: string;
  endsAt: string;
  startMinute: number;
  endMinute: number;
  active: boolean;
  createdAtIso: string;
  updatedAtIso: string;
}>;

export type ScheduleBlock = Readonly<{
  id: string;
  templateId: string;
  modality: Modality;
  shift: Shift;
  dayOfWeek: Weekday;
  startsAt: string;
  endsAt: string;
  startMinute: number;
  endMinute: number;
  module: ScheduleModule;
  label: string;
  position: number;
  active: boolean;
  isCustom: boolean;
  createdByUid: string | null;
  createdAtIso: string;
  updatedAtIso: string;
}>;

export type CycleModuleSchedule = Readonly<{
  module1Dates: readonly string[];
  module2Dates: readonly string[];
}>;

const HH_MM_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TEMPLATE_CODE_PATTERN = /^[a-z0-9_-]{2,48}$/;

export function parseHhMmToMinutes(value: string): number {
  const match = HH_MM_PATTERN.exec(value.trim());
  if (!match) {
    throw new Error("Time must use strict HH:MM 24-hour format.");
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours * 60 + minutes;
}

export function formatMinutesToHhMm(totalMinutes: number): string {
  if (!Number.isInteger(totalMinutes) || totalMinutes < 0 || totalMinutes >= 1440) {
    throw new Error("Minutes must be an integer between 0 and 1439.");
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function normalizeTemplateCode(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase();
}

export function isValidTemplateCode(value: string): boolean {
  return TEMPLATE_CODE_PATTERN.test(normalizeTemplateCode(value));
}

export function modalityUsesModules(modality: Modality): boolean {
  return modality === "sabatino" || modality === "virtual_modular";
}

export function isValidModuleForModality(
  modality: Modality,
  moduleValue: number
): moduleValue is ScheduleModule {
  if (modalityUsesModules(modality)) {
    return moduleValue === 1 || moduleValue === 2;
  }
  return moduleValue === 0;
}

export function blocksConflictInTemplate(
  a: Readonly<{
    dayOfWeek: number;
    startMinute: number;
    endMinute: number;
    module: ScheduleModule;
  }>,
  b: Readonly<{
    dayOfWeek: number;
    startMinute: number;
    endMinute: number;
    module: ScheduleModule;
  }>
): boolean {
  if (a.dayOfWeek !== b.dayOfWeek) {
    return false;
  }
  if (a.module > 0 && b.module > 0 && a.module !== b.module) {
    return false;
  }
  return a.startMinute < b.endMinute && b.startMinute < a.endMinute;
}

export function buildDefaultBlockLabel(input: Readonly<{
  dayOfWeek: Weekday;
  startsAt: string;
  endsAt: string;
  module: ScheduleModule;
  isCustom: boolean;
}>): string {
  const day = WEEKDAYS.find((item) => item.value === input.dayOfWeek)?.short ?? "DIA";
  const modulePart = input.module > 0 ? ` M${input.module}` : "";
  const customSuffix = input.isCustom ? " personalizado" : "";
  return `${day}${modulePart} ${input.startsAt}-${input.endsAt}${customSuffix}`;
}

export function isValidIsoCalendarDate(value: string): boolean {
  const match = ISO_DATE_PATTERN.exec(value.trim());
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;

  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

export function normalizeIsoDateList(dates: readonly string[]): string[] {
  const normalized = new Set<string>();
  for (const raw of dates) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (!isValidIsoCalendarDate(trimmed)) {
      throw new Error(`Invalid ISO calendar date: ${trimmed}`);
    }
    normalized.add(trimmed);
  }
  return [...normalized].sort();
}

export function validateCycleModuleSchedule(
  schedule: CycleModuleSchedule
): { ok: true } | { ok: false; reason: "invalid-date" | "module-dates-overlap" } {
  let module1: string[];
  let module2: string[];
  try {
    module1 = normalizeIsoDateList(schedule.module1Dates);
    module2 = normalizeIsoDateList(schedule.module2Dates);
  } catch {
    return { ok: false, reason: "invalid-date" };
  }

  const m1Set = new Set(module1);
  if (module2.some((date) => m1Set.has(date))) {
    return { ok: false, reason: "module-dates-overlap" };
  }

  return { ok: true };
}

export function resolveEffectiveModuleDates(input: Readonly<{
  module: ScheduleModule;
  cycleModuleDates?: CycleModuleSchedule | null;
  specialCaseDatesOverride?: readonly string[] | null;
}>): Readonly<{
  source: "none" | "cycle_default" | "special_case";
  dates: readonly string[];
}> {
  const overrideDates = normalizeIsoDateList(input.specialCaseDatesOverride ?? []);
  if (overrideDates.length > 0) {
    return {
      source: "special_case",
      dates: overrideDates
    };
  }

  if (input.module === 0) {
    return {
      source: "none",
      dates: []
    };
  }

  const rawCycleDates =
    input.module === 1
      ? (input.cycleModuleDates?.module1Dates ?? [])
      : (input.cycleModuleDates?.module2Dates ?? []);

  return {
    source: "cycle_default",
    dates: normalizeIsoDateList(rawCycleDates)
  };
}

export function validateBlockSelectionForGroup(input: Readonly<{
  actor: ActorScope;
  template: Readonly<{ active: boolean; modality: Modality; shift: Shift }>;
  block: Readonly<{
    active: boolean;
    isCustom: boolean;
    createdByUid: string | null;
    modality: Modality;
    shift: Shift;
  }>;
  group: Readonly<{ modality: Modality; shift: Shift }>;
}>):
  | { ok: true }
  | { ok: false; reason: "template-inactive" | "block-inactive" | AuthzRejection } {
  if (!input.template.active) {
    return { ok: false, reason: "template-inactive" };
  }
  if (!input.block.active) {
    return { ok: false, reason: "block-inactive" };
  }
  return canUseScheduleBlock(input.actor, input.block, input.group);
}
