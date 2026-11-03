import "server-only";
import type { Locale } from "@/i18n/routing";
import { createClient } from "@/lib/supabase/server";

/**
 * A to-one embed. The generated types read the self-referencing manager FK (composite key) as
 * to-many, while PostgREST returns a single object; accept both.
 */
export function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

/** The name to show in this locale: English when present in the English UI, Arabic otherwise. */
export function localName(locale: Locale, ar: string, en: string | null | undefined): string {
  return (locale === "en" && en) || ar;
}

/** Department and supervisor choices for the employee form (RLS scopes both to the company). */
export async function employeeFormOptions(locale: Locale, excludeEmployeeId?: string) {
  const supabase = await createClient();
  const [{ data: departments }, { data: managers }] = await Promise.all([
    supabase.from("departments").select("id, name_ar, name_en").order("name_ar"),
    supabase
      .from("employees")
      .select("id, full_name_ar, full_name_en, role")
      .eq("status", "active")
      .in("role", ["owner", "hr", "manager"])
      .order("full_name_ar"),
  ]);

  return {
    departments: (departments ?? []).map((d) => ({ value: d.id, label: localName(locale, d.name_ar, d.name_en) })),
    managers: (managers ?? [])
      .filter((m) => m.id !== excludeEmployeeId)
      .map((m) => ({ value: m.id, label: localName(locale, m.full_name_ar, m.full_name_en) })),
  };
}
