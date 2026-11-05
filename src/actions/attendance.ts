"use server";

// Attendance: check in/out (any member), assignments, corrections and deduction decisions (owner / HR).
// authenticate → authorize → zod → execute; the RPCs enforce the same rules (CLAUDE.md §5.7).
import { refresh } from "next/cache";
import { z } from "zod";
import { routing } from "@/i18n/routing";
import { requireMember } from "@/lib/auth/account";
import { attendanceError, type AttendanceError } from "@/lib/attendance";
import { createClient } from "@/lib/supabase/server";
import { assignSchema, correctionSchema, decisionSchema, locationSchema, type Location } from "@/lib/validation/attendance";

const localeSchema = z.enum(routing.locales).catch(routing.defaultLocale);

export type AttendanceState = { ok: true; outside?: boolean } | { ok: false; error: AttendanceError; fields?: string[] } | undefined;

const fieldsOf = (error: z.ZodError) => [...new Set(error.issues.map((i) => String(i.path[0])))];

async function clock(kind: "in" | "out", rawLocale: string, location: Location): Promise<AttendanceState> {
  await requireMember(localeSchema.parse(rawLocale));
  const parsed = locationSchema.safeParse(location);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const supabase = await createClient();
  const args = { p_lat: parsed.data.lat as number, p_lng: parsed.data.lng as number, p_accuracy: parsed.data.accuracy as number };
  const { data, error } =
    kind === "in" ? await supabase.rpc("attendance_check_in", args) : await supabase.rpc("attendance_check_out", args);
  if (error) return { ok: false, error: attendanceError(error, kind === "in" ? "checkIn" : "checkOut") };
  refresh();
  return { ok: true, outside: (data as { outside?: boolean } | null)?.outside === true };
}

export async function checkIn(locale: string, location: Location): Promise<AttendanceState> {
  return clock("in", locale, location);
}

export async function checkOut(locale: string, location: Location): Promise<AttendanceState> {
  return clock("out", locale, location);
}

export async function assignShift(_prev: AttendanceState, formData: FormData): Promise<AttendanceState> {
  await requireMember(localeSchema.parse(formData.get("uiLocale")), ["owner", "admin", "hr"]);
  const parsed = assignSchema.safeParse({
    employeeIds: formData.getAll("employeeIds"),
    branchId: formData.get("branchId"),
    shiftId: formData.get("shiftId"),
  });
  if (!parsed.success) return { ok: false, error: "invalid", fields: fieldsOf(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("attendance_assign", {
    p_employee_ids: parsed.data.employeeIds,
    p_branch_id: parsed.data.branchId as string,
    p_shift_id: parsed.data.shiftId as string,
  });
  if (error) return { ok: false, error: attendanceError(error, "assignShift") };
  refresh();
  return { ok: true };
}

export async function correctAttendance(_prev: AttendanceState, formData: FormData): Promise<AttendanceState> {
  await requireMember(localeSchema.parse(formData.get("uiLocale")), ["owner", "admin", "hr"]);
  const parsed = correctionSchema.safeParse({
    employeeId: formData.get("employeeId"),
    date: formData.get("date"),
    absent: formData.get("absent") === "on",
    checkIn: formData.get("checkIn"),
    checkOut: formData.get("checkOut"),
    note: formData.get("note"),
  });
  if (!parsed.success) return { ok: false, error: "invalid", fields: fieldsOf(parsed.error) };
  const d = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc("attendance_correct", {
    p_employee_id: d.employeeId,
    p_date: d.date,
    p_check_in: (d.absent ? null : d.checkIn) as string,
    p_check_out: (d.absent ? null : d.checkOut) as string,
    p_note: d.note,
  });
  if (error) return { ok: false, error: attendanceError(error, "correctAttendance") };
  refresh();
  return { ok: true };
}

export async function decideDeduction(_prev: AttendanceState, formData: FormData): Promise<AttendanceState> {
  await requireMember(localeSchema.parse(formData.get("uiLocale")), ["owner", "admin", "hr"]);
  const parsed = decisionSchema.safeParse({
    id: formData.get("id"),
    decision: formData.get("decision"),
    note: formData.get("note"),
  });
  if (!parsed.success) return { ok: false, error: "invalid", fields: fieldsOf(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("attendance_deduction_decide", {
    p_id: parsed.data.id,
    p_decision: parsed.data.decision,
    p_note: parsed.data.note as string,
  });
  if (error) return { ok: false, error: attendanceError(error, "decideDeduction") };
  refresh();
  return { ok: true };
}
