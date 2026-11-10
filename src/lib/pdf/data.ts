import "server-only";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { getAccount, type Member } from "@/lib/auth/account";
import { localName } from "@/lib/employees";
import { formatDateTime } from "@/lib/format";
import { BUCKET } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import { type Brand } from "./html";

const IMAGE_MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };

/** The signed-in, active member asking for a PDF, or null (the route answers 404 either way). */
export async function pdfMember(): Promise<Member | null> {
  const account = await getAccount();
  if (account?.kind !== "employee" || account.status !== "active" || !account.company.is_active) return null;
  return account;
}

/** Reads a stored file as a data: URI so it can be embedded (raster images only). */
export async function imageDataUri(path: string, maxBytes: number): Promise<string | null> {
  const mime = IMAGE_MIME[path.split(".").pop()?.toLowerCase() ?? ""];
  if (!mime) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data || data.size > maxBytes) return null;
  return `data:${mime};base64,${Buffer.from(await data.arrayBuffer()).toString("base64")}`;
}

/** Company name, commercial registration, tax number, contact info, and logo for the document header. */
export async function loadBrand(locale: Locale, member: Member): Promise<Brand> {
  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select("name_ar, name_en, commercial_reg, tax_number, phone, email, address, logo_path")
    .eq("id", member.company.id)
    .single();
  const t = await getTranslations({ locale, namespace: "settings.company" });
  return {
    name: company ? localName(locale, company.name_ar, company.name_en) : "",
    legal: company?.commercial_reg ? `${t("commercialReg")}: ${company.commercial_reg}` : null,
    commercialReg: company?.commercial_reg ? `${t("commercialReg")}: ${company.commercial_reg}` : null,
    taxNumber: company?.tax_number ? `${t("taxNumber")}: ${company.tax_number}` : null,
    phone: company?.phone ? `${t("phone")}: ${company.phone}` : null,
    email: company?.email ? `${t("email")}: ${company.email}` : null,
    address: company?.address ?? null,
    logoDataUri: company?.logo_path ? await imageDataUri(company.logo_path, 600 * 1024) : null,
  };
}

/** "3 نوفمبر 2026 في 3:04 م" in Riyadh time, as the document's issue stamp. */
export function issuedNow(locale: Locale): string {
  return formatDateTime(locale, new Date().toISOString());
}

/** Served inline: the browser's PDF viewer opens it, or styled printable HTML if chromium is unavailable. */
export function pdfResponse(pdf: Buffer, filename: string): Response {
  const isRealPdf = pdf.length >= 5 && pdf.subarray(0, 5).toString("ascii") === "%PDF-";
  if (isRealPdf) {
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  }
  return new Response(pdf.toString("utf-8"), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}
