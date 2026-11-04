import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { monthSchema } from "@/lib/validation/attendance";
import { buildAttendanceSheetPdf } from "@/lib/pdf/attendance-sheet";
import { pdfMember, pdfResponse } from "@/lib/pdf/data";
import { todayInRiyadh } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

// Monthly attendance sheet (owner and HR). Authorized by the database (record_export), rate limited
// and audited before anything is built; any refusal is a plain 404.
export async function GET(request: Request, ctx: RouteContext<"/[locale]/attendance/sheet/pdf">) {
  const { locale } = await ctx.params;
  const member = await pdfMember();
  if (!hasLocale(routing.locales, locale) || !member || !(member.role === "owner" || member.role === "hr")) {
    return new Response(null, { status: 404 });
  }
  const requested = new URL(request.url).searchParams.get("month");
  const month = requested === null ? todayInRiyadh().slice(0, 7) : monthSchema.safeParse(requested).data;
  if (!month) return new Response(null, { status: 404 });

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_export", { p_kind: "attendance_sheet", p_target: member.company.id });
  if (error) return new Response(null, { status: error.message === "rate_limited" ? 429 : 404 });

  const built = await buildAttendanceSheetPdf(locale, member, month);
  return built ? pdfResponse(built.pdf, built.filename) : new Response(null, { status: 404 });
}
