import { z } from "zod";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { pdfMember, pdfResponse } from "@/lib/pdf/data";
import { buildTaskReportPdf } from "@/lib/pdf/task-report";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

// Task completion report as a PDF. authenticate → authorize (record_export: same rules as reading
// the task, rate limited, audited) → build. Anything else is a plain 404, as for a missing task.
export async function GET(_request: Request, ctx: RouteContext<"/[locale]/tasks/[id]/pdf">) {
  const { locale, id: rawId } = await ctx.params;
  const id = z.uuid().safeParse(rawId);
  const member = await pdfMember();
  if (!hasLocale(routing.locales, locale) || !id.success || !member) return new Response(null, { status: 404 });

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_export", { p_kind: "task_report", p_target: id.data });
  if (error) return new Response(null, { status: error.message === "rate_limited" ? 429 : 404 });

  const built = await buildTaskReportPdf(locale, member, id.data);
  return built ? pdfResponse(built.pdf, built.filename) : new Response(null, { status: 404 });
}
