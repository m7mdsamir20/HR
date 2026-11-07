"use client";

import { useLocale, useTranslations } from "next-intl";
import { AdvanceCancel, AdvanceDecision, AdvanceRepayment } from "@/components/advances/advance-actions";
import { StatusPill } from "@/components/status-pill";
import type { Locale } from "@/i18n/routing";
import { advanceTone, type AdvanceStatus } from "@/lib/advances";
import { formatDate } from "@/lib/format";

export interface AdvanceRow {
  id: string;
  employeeId: string;
  employeeName?: string | null;
  amount: number;
  installmentsCount: number;
  monthlyInstallment: number;
  paidAmount: number;
  remainingAmount: number;
  reason: string;
  status: AdvanceStatus;
  decisionNote?: string | null;
  createdAt: string;
}

export function AdvanceCard({
  row,
  currentEmployeeId,
  canManage,
}: {
  row: AdvanceRow;
  currentEmployeeId: string;
  canManage: boolean;
}) {
  const t = useTranslations("advances");
  const locale = useLocale() as Locale;
  const isMine = row.employeeId === currentEmployeeId;

  return (
    <li className="flex flex-col justify-between rounded-card border border-line bg-surface p-4 md:p-5 shadow-xs transition-shadow">
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2 border-b border-line pb-3">
          <div className="flex flex-col gap-0.5">
            {row.employeeName && <p className="text-card font-medium">{row.employeeName}</p>}
            <p className="text-caption text-ink-soft">
              {t("createdAt")}: <span className="tabular-nums font-mono">{formatDate(locale, row.createdAt.slice(0, 10))}</span>
            </p>
          </div>
          <StatusPill tone={advanceTone[row.status]}>{t(`status.${row.status}`)}</StatusPill>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm py-1">
          <div className="flex flex-col">
            <span className="text-caption text-secondary">{t("amount")}</span>
            <span className="text-label font-semibold tabular-nums">
              {row.amount} <span className="text-xs font-normal text-secondary">{locale === "ar" ? "ر.س" : "SAR"}</span>
            </span>
          </div>

          <div className="flex flex-col">
            <span className="text-caption text-secondary">{t("monthlyInstallment")}</span>
            <span className="text-label font-semibold tabular-nums text-indigo">
              {row.monthlyInstallment} <span className="text-xs font-normal text-secondary">{locale === "ar" ? "ر.س" : "SAR"}</span>
            </span>
          </div>

          <div className="flex flex-col">
            <span className="text-caption text-secondary">{t("installmentsCount")}</span>
            <span className="text-label font-semibold tabular-nums">{row.installmentsCount}</span>
          </div>

          <div className="flex flex-col">
            <span className="text-caption text-secondary">{t("paid")}</span>
            <span className="text-label font-semibold tabular-nums text-stamp">
              {row.paidAmount} <span className="text-xs font-normal text-secondary">{locale === "ar" ? "ر.س" : "SAR"}</span>
            </span>
          </div>

          <div className="flex flex-col">
            <span className="text-caption text-secondary">{t("remaining")}</span>
            <span className="text-label font-semibold tabular-nums text-brick">
              {row.remainingAmount} <span className="text-xs font-normal text-secondary">{locale === "ar" ? "ر.س" : "SAR"}</span>
            </span>
          </div>
        </div>

        <div className="rounded-control bg-paper p-3 text-caption">
          <span className="font-semibold text-ink-soft block mb-1">{t("reason")}:</span>
          <p className="text-ink leading-relaxed">{row.reason}</p>
        </div>

        {row.decisionNote && (
          <div className="rounded-control border border-line bg-paper/50 p-3 text-caption">
            <span className="font-semibold text-ink-soft block mb-1">{t("decisionNote")}:</span>
            <p className="text-ink leading-relaxed">{row.decisionNote}</p>
          </div>
        )}
      </div>

      <div className="mt-4 pt-3 border-t border-line flex flex-wrap items-center justify-between gap-2">
        {row.status === "pending" && isMine && <AdvanceCancel id={row.id} />}

        {row.status === "pending" && canManage && !isMine && <AdvanceDecision id={row.id} />}

        {row.status === "approved" && row.remainingAmount > 0 && canManage && (
          <AdvanceRepayment advanceId={row.id} remainingAmount={row.remainingAmount} />
        )}
      </div>
    </li>
  );
}
