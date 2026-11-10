import { hasLocale } from "next-intl";
import { z } from "zod";
import { routing } from "@/i18n/routing";
import { pdfMember, pdfResponse } from "@/lib/pdf/data";
import { buildPayrollRunPdf } from "@/lib/pdf/payroll-run";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

// Monthly Payroll Run PDF (Draft or Approved): authorized by record_export('payroll_run', id),
// rate limited, and audited.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ locale: string; id: string }> }
) {
  try {
    const { locale, id: rawId } = await params;
    const id = z.string().uuid().safeParse(rawId);
    const member = await pdfMember();
    if (!hasLocale(routing.locales, locale) || !id.success || !member) return new Response(null, { status: 404 });

    const supabase = await createClient();
    const { error } = await supabase.rpc("record_export", { p_kind: "payroll_run", p_target: id.data });
    if (error) return new Response(null, { status: error.message === "rate_limited" ? 429 : 404 });

    const built = await buildPayrollRunPdf(locale, member, id.data);
    return built ? pdfResponse(built.pdf, built.filename) : new Response(null, { status: 404 });
  } catch (err: unknown) {
    const message = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
    console.error("Payroll run PDF generation error:", message);
    return new Response(`PDF generation error: ${message}`, {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
