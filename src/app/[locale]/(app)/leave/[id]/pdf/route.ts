import { hasLocale } from "next-intl";
import { z } from "zod";
import { routing } from "@/i18n/routing";
import { pdfMember, pdfResponse } from "@/lib/pdf/data";
import { buildLeaveRequestPdf } from "@/lib/pdf/leave-request";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

// An approved leave request: for the employee, their manager, HR and the owner. Authorized by the
// database (record_export), rate limited and audited before anything is built; any refusal is a 404.
export async function GET(_request: Request, ctx: RouteContext<"/[locale]/leave/[id]/pdf">) {
  try {
    const { locale, id: rawId } = await ctx.params;
    const id = z.uuid().safeParse(rawId);
    const member = await pdfMember();
    if (!hasLocale(routing.locales, locale) || !id.success || !member) return new Response(null, { status: 404 });

    const supabase = await createClient();
    const { error } = await supabase.rpc("record_export", { p_kind: "leave_request", p_target: id.data });
    if (error) return new Response(null, { status: error.message === "rate_limited" ? 429 : 404 });

    const built = await buildLeaveRequestPdf(locale, member, id.data);
    return built ? pdfResponse(built.pdf, built.filename) : new Response(null, { status: 404 });
  } catch (err: unknown) {
    const message = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
    console.error("Leave PDF generation error:", message);
    return new Response(`PDF generation error: ${message}`, {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
