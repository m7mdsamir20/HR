"use client";

import { Check, Download, Printer, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState } from "react";
import { approvePayrollRun, deletePayrollRun, type PayrollState } from "@/actions/payroll";
import { Button } from "@/components/ui/button";

export function PayrollRunActions({
  runId,
  isOwner,
  isDraft,
}: {
  runId: string;
  isOwner: boolean;
  isDraft: boolean;
}) {
  const t = useTranslations("payroll");
  const tErrors = useTranslations("errors");
  const locale = useLocale();

  const [approveState, approveAction, approvePending] = useActionState<PayrollState, FormData>(
    approvePayrollRun,
    undefined
  );

  const [deleteState, deleteAction, deletePending] = useActionState<PayrollState, FormData>(
    deletePayrollRun,
    undefined
  );

  const approveError = approveState && !approveState.ok ? tErrors(approveState.error) : null;
  const deleteError = deleteState && !deleteState.ok ? tErrors(deleteState.error) : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={`${locale === "en" ? "/en" : ""}/payroll/runs/${runId}/pdf`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-control border border-line bg-surface px-3 text-label text-ink hover:bg-paper focus-visible:outline-2 focus-visible:outline-indigo"
        >
          <Printer className="size-4" aria-hidden />
          {isDraft ? t("printDraft") : t("printApproved")}
        </a>

        <a
          href={`/api/payroll/runs/${runId}/wps`}
          download
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-control border border-line bg-surface px-3 text-label text-ink hover:bg-paper focus-visible:outline-2 focus-visible:outline-indigo"
        >
          <Download className="size-4" aria-hidden />
          {t("wpsSif")}
        </a>

        {isDraft && isOwner && (
          <form action={approveAction}>
            <input type="hidden" name="uiLocale" value={locale} />
            <input type="hidden" name="runId" value={runId} />
            <Button
              type="submit"
              size="sm"
              disabled={approvePending}
              className="bg-stamp hover:bg-stamp/90 text-white"
            >
              <Check className="size-4" aria-hidden />
              {approvePending ? "..." : t("approveRun")}
            </Button>
          </form>
        )}

        {isDraft && (
          <form action={deleteAction}>
            <input type="hidden" name="uiLocale" value={locale} />
            <input type="hidden" name="runId" value={runId} />
            <Button type="submit" size="sm" variant="ghost" className="text-brick" disabled={deletePending}>
              <Trash2 className="size-4" aria-hidden />
              {deletePending ? "..." : t("deleteRun")}
            </Button>
          </form>
        )}
      </div>

      {approveError && <p className="text-caption text-brick">{approveError}</p>}
      {deleteError && <p className="text-caption text-brick">{deleteError}</p>}
    </div>
  );
}

