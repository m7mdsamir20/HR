"use server";

// Attendance setup: branches, shifts, the holiday/Ramadan calendar and the deduction rules (owner / HR).
// Written under RLS with the user's own session; the table checks back up every rule here.
import { refresh } from "next/cache";
import { z } from "zod";
import { routing } from "@/i18n/routing";
import { requireMember } from "@/lib/auth/account";
import { attendanceError } from "@/lib/attendance";
import { createClient } from "@/lib/supabase/server";
import { branchSchema, calendarSchema, rulesSchema, shiftSchema } from "@/lib/validation/attendance";
import type { AttendanceState } from "./attendance";

const localeSchema = z.enum(routing.locales).catch(routing.defaultLocale);
const idSchema = z.uuid();
const fieldsOf = (error: z.ZodError) => [...new Set(error.issues.map((i) => String(i.path[0])))];

async function setup(formData: FormData) {
  return requireMember(localeSchema.parse(formData.get("uiLocale")), ["owner", "hr"]);
}

function readBranch(formData: FormData) {
  return branchSchema.safeParse({
    nameAr: formData.get("nameAr"),
    nameEn: formData.get("nameEn"),
    latitude: formData.get("latitude"),
    longitude: formData.get("longitude"),
    radius: formData.get("radius"),
  });
}

export async function saveBranch(branchId: string | null, _prev: AttendanceState, formData: FormData): Promise<AttendanceState> {
  const member = await setup(formData);
  const parsed = readBranch(formData);
  if (!parsed.success) return { ok: false, error: "invalid", fields: fieldsOf(parsed.error) };
  const d = parsed.data;
  const row = { name_ar: d.nameAr, name_en: d.nameEn ?? null, latitude: d.latitude, longitude: d.longitude, radius_m: d.radius };

  const supabase = await createClient();
  if (branchId === null) {
    const { error } = await supabase.from("branches").insert({ ...row, company_id: member.company.id });
    if (error) return { ok: false, error: attendanceError(error, "createBranch"), fields: error.code === "23505" ? ["nameAr"] : undefined };
  } else {
    const id = idSchema.safeParse(branchId);
    if (!id.success) return { ok: false, error: "notFound" };
    const { data, error } = await supabase.from("branches").update(row).eq("id", id.data).select("id");
    if (error) return { ok: false, error: attendanceError(error, "updateBranch"), fields: error.code === "23505" ? ["nameAr"] : undefined };
    if (data.length !== 1) return { ok: false, error: "notFound" };
  }
  refresh();
  return { ok: true };
}

export async function deleteBranch(branchId: string, _prev: AttendanceState, formData: FormData): Promise<AttendanceState> {
  await setup(formData);
  const id = idSchema.safeParse(branchId);
  if (!id.success) return { ok: false, error: "notFound" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("branches").delete().eq("id", id.data).select("id");
  if (error) return { ok: false, error: attendanceError(error, "deleteBranch") };
  if (data.length !== 1) return { ok: false, error: "notFound" };
  refresh();
  return { ok: true };
}

function readShift(formData: FormData) {
  return shiftSchema.safeParse({
    nameAr: formData.get("nameAr"),
    nameEn: formData.get("nameEn"),
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime"),
    graceMinutes: formData.get("graceMinutes"),
    ramadanHours: formData.get("ramadanHours"),
    workDays: formData.getAll("workDays"),
  });
}

export async function saveShift(shiftId: string | null, _prev: AttendanceState, formData: FormData): Promise<AttendanceState> {
  const member = await setup(formData);
  const parsed = readShift(formData);
  if (!parsed.success) return { ok: false, error: "invalid", fields: fieldsOf(parsed.error) };
  const d = parsed.data;
  const row = {
    name_ar: d.nameAr,
    name_en: d.nameEn ?? null,
    start_time: d.startTime,
    end_time: d.endTime,
    grace_minutes: d.graceMinutes,
    ramadan_hours: d.ramadanHours,
    work_days: [...new Set(d.workDays)].sort(),
  };

  const supabase = await createClient();
  if (shiftId === null) {
    const { error } = await supabase.from("shifts").insert({ ...row, company_id: member.company.id });
    if (error) return { ok: false, error: attendanceError(error, "createShift"), fields: error.code === "23505" ? ["nameAr"] : undefined };
  } else {
    const id = idSchema.safeParse(shiftId);
    if (!id.success) return { ok: false, error: "notFound" };
    const { data, error } = await supabase.from("shifts").update(row).eq("id", id.data).select("id");
    if (error) return { ok: false, error: attendanceError(error, "updateShift"), fields: error.code === "23505" ? ["nameAr"] : undefined };
    if (data.length !== 1) return { ok: false, error: "notFound" };
  }
  refresh();
  return { ok: true };
}

export async function deleteShift(shiftId: string, _prev: AttendanceState, formData: FormData): Promise<AttendanceState> {
  await setup(formData);
  const id = idSchema.safeParse(shiftId);
  if (!id.success) return { ok: false, error: "notFound" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("shifts").delete().eq("id", id.data).select("id");
  if (error) return { ok: false, error: attendanceError(error, "deleteShift") };
  if (data.length !== 1) return { ok: false, error: "notFound" };
  refresh();
  return { ok: true };
}

export async function addCalendarEntry(_prev: AttendanceState, formData: FormData): Promise<AttendanceState> {
  const member = await setup(formData);
  const parsed = calendarSchema.safeParse({
    kind: formData.get("kind"),
    nameAr: formData.get("nameAr"),
    nameEn: formData.get("nameEn"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
  });
  if (!parsed.success) return { ok: false, error: "invalid", fields: fieldsOf(parsed.error) };
  const d = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.from("company_calendar").insert({
    company_id: member.company.id,
    kind: d.kind,
    name_ar: d.nameAr,
    name_en: d.nameEn ?? null,
    start_date: d.startDate,
    end_date: d.endDate,
  });
  if (error) return { ok: false, error: attendanceError(error, "addCalendarEntry") };
  refresh();
  return { ok: true };
}

export async function deleteCalendarEntry(entryId: string, _prev: AttendanceState, formData: FormData): Promise<AttendanceState> {
  await setup(formData);
  const id = idSchema.safeParse(entryId);
  if (!id.success) return { ok: false, error: "notFound" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("company_calendar").delete().eq("id", id.data).select("id");
  if (error) return { ok: false, error: attendanceError(error, "deleteCalendarEntry") };
  if (data.length !== 1) return { ok: false, error: "notFound" };
  refresh();
  return { ok: true };
}

// Owner only: the tiers decide how much pay is suggested (the RLS policy says the same).
export async function saveRules(_prev: AttendanceState, formData: FormData): Promise<AttendanceState> {
  const member = await requireMember(localeSchema.parse(formData.get("uiLocale")), ["owner"]);
  const parsed = rulesSchema.safeParse({
    tier1Minutes: formData.get("tier1Minutes"),
    tier2Minutes: formData.get("tier2Minutes"),
    tier3Minutes: formData.get("tier3Minutes"),
    tier1Percent: formData.get("tier1Percent"),
    tier2Percent: formData.get("tier2Percent"),
    tier3Percent: formData.get("tier3Percent"),
    tier4Percent: formData.get("tier4Percent"),
    earlyGraceMinutes: formData.get("earlyGraceMinutes"),
    absencePercent: formData.get("absencePercent"),
  });
  if (!parsed.success) return { ok: false, error: "invalid", fields: fieldsOf(parsed.error) };
  const d = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attendance_rules")
    .update({
      late_tier1_minutes: d.tier1Minutes,
      late_tier2_minutes: d.tier2Minutes,
      late_tier3_minutes: d.tier3Minutes,
      late_tier1_fraction: d.tier1Percent / 100,
      late_tier2_fraction: d.tier2Percent / 100,
      late_tier3_fraction: d.tier3Percent / 100,
      late_tier4_fraction: d.tier4Percent / 100,
      early_grace_minutes: d.earlyGraceMinutes,
      absence_fraction: d.absencePercent / 100,
    })
    .eq("company_id", member.company.id)
    .select("company_id");
  if (error) return { ok: false, error: attendanceError(error, "saveRules") };
  if (data.length !== 1) return { ok: false, error: "notFound" };
  refresh();
  return { ok: true };
}
