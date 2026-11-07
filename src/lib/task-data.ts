import "server-only";
import type { Locale } from "@/i18n/routing";
import { localName } from "@/lib/employees";
import { createClient } from "@/lib/supabase/server";

/** Display names for employee ids (people_names RPC: same company, names only). */
export async function loadNames(locale: Locale, ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((i): i is string => !!i))];
  if (unique.length === 0) return new Map();
  const supabase = await createClient();
  const { data } = await supabase.rpc("people_names", { p_ids: unique });
  return new Map((data ?? []).map((p) => [p.id, localName(locale, p.full_name_ar, p.full_name_en)]));
}

export async function unreadNotifications(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
  return count ?? 0;
}

/** People a member may assign work to: the owner anyone active, a manager their direct reports. */
export async function assigneeOptions(locale: Locale, selfId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("employees")
    .select("id, full_name_ar, full_name_en, job_title")
    .eq("status", "active")
    .not("role", "in", '("owner","admin")')
    .neq("id", selfId)
    .order("full_name_ar");
  return (data ?? []).map((e) => ({
    value: e.id,
    label: `${localName(locale, e.full_name_ar, e.full_name_en)}${e.job_title ? ` — ${e.job_title}` : ""}`,
  }));
}
