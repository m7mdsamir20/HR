import { hasLocale } from "next-intl";
import { z } from "zod";
import { routing } from "@/i18n/routing";
import { pdfMember, pdfResponse } from "@/lib/pdf/data";
import { buildPayslipPdf } from "@/lib/pdf/payslip";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

// Payslip PDF: authorized by the database (record_export), rate limited (20 per 10 mins), and audited.
export async function GET(_request: Request, ctx: RouteContext<"/[locale]/payroll/slips/[id]/pdf">) {
  const { locale, id: rawId } = await ctx.params;
  const id = z.string().uuid().safeParse(rawId);
  const member = await pdfMember();
  if (!hasLocale(routing.locales, locale) || !id.success || !member) return new Response(null, { status: 404 });

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_export", { p_kind: "payslip", p_target: id.data });
  if (error) return new Response(null, { status: error.message === "rate_limited" ? 429 : 404 });

  const built = await buildPayslipPdf(locale, member, id.data);
  return built ? pdfResponse(built.pdf, built.filename) : new Response(null, { status: 404 });
}

