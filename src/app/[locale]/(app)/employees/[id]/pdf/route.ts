import { z } from "zod";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { buildEmployeeCardPdf } from "@/lib/pdf/employee-card";
import { pdfMember, pdfResponse } from "@/lib/pdf/data";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

// Employee data card (owner and HR within their reach). The export is authorized by the database
// (record_export → can_manage_employee), rate limited and audited before anything is built.
export async function GET(_request: Request, ctx: RouteContext<"/[locale]/employees/[id]/pdf">) {
  const { locale, id: rawId } = await ctx.params;
  const id = z.uuid().safeParse(rawId);
  const member = await pdfMember();
  if (!hasLocale(routing.locales, locale) || !id.success || !member || !(member.role === "owner" || member.role === "hr")) {
    return new Response(null, { status: 404 });
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_export", { p_kind: "employee_card", p_target: id.data });
  if (error) return new Response(null, { status: error.message === "rate_limited" ? 429 : 404 });

  const built = await buildEmployeeCardPdf(locale, member, id.data);
  return built ? pdfResponse(built.pdf, built.filename) : new Response(null, { status: 404 });
}
