import "server-only";
import type { DocumentRow } from "@/components/documents/documents-panel";
import type { Locale } from "@/i18n/routing";
import { documentStatus, documentStatusTone, formatHijri } from "@/lib/documents";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

/** One employee's documents as the panel shows them. RLS decides whether any come back. */
export async function loadDocuments(locale: Locale, employeeId: string): Promise<DocumentRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("employee_documents")
    .select("id, doc_type, number, issue_date, expiry_date, file_path, file_name")
    .eq("employee_id", employeeId)
    .order("expiry_date", { ascending: true, nullsFirst: false });

  return (data ?? []).map((d) => {
    const status = documentStatus(d.expiry_date);
    return {
      id: d.id,
      docType: d.doc_type,
      number: d.number,
      issueDate: d.issue_date ? formatDate(locale, d.issue_date) : null,
      expiryDate: d.expiry_date ? formatDate(locale, d.expiry_date) : null,
      expiryHijri: d.expiry_date ? formatHijri(locale, d.expiry_date) : null,
      status,
      tone: status === "noExpiry" ? null : documentStatusTone[status],
      hasFile: !!d.file_path,
      fileName: d.file_name,
    };
  });
}
