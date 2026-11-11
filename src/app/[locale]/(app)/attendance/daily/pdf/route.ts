import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { todayInRiyadh } from "@/lib/format";
import { buildDailyAttendancePdf } from "@/lib/pdf/attendance-daily";
import { pdfMember, pdfResponse } from "@/lib/pdf/data";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  request: Request,
  props: { params: Promise<{ locale: string }> }
) {
  try {
    const { locale } = await props.params;
    const member = await pdfMember();
    if (!hasLocale(routing.locales, locale) || !member || !(member.role === "owner" || member.role === "admin" || member.role === "hr" || member.role === "manager")) {
      return new Response(null, { status: 404 });
    }
    const requested = new URL(request.url).searchParams.get("date");
    const dateStr = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : todayInRiyadh();

    const supabase = await createClient();
    const { error } = await supabase.rpc("record_export", { p_kind: "attendance_sheet", p_target: member.company.id });
    if (error && error.message === "rate_limited") {
      return new Response(null, { status: 429 });
    }

    const built = await buildDailyAttendancePdf(locale, member, dateStr);
    return built ? pdfResponse(built.pdf, built.filename) : new Response(null, { status: 404 });
  } catch (err: unknown) {
    const message = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
    console.error("Daily Attendance PDF error:", message);
    return new Response(`PDF generation error: ${message}`, {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
