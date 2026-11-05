"use client";

import { AlertTriangle, Power, RotateCcw, Trash2, UserX } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import {
  deleteEmployee,
  reactivateEmployee,
  setEmployeeStatus,
  terminateEmployee,
  type EmployeeActionState,
} from "@/actions/employees";
import { FormField } from "@/components/form-field";
import { SelectField } from "@/components/select-field";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

interface Props {
  employeeId: string;
  name: string;
  status: "active" | "disabled" | "terminated";
  trigger?: React.ReactNode;
}

export function EmployeeStatusDialog({ employeeId, name, status, trigger }: Props) {
  const t = useTranslations("employees.termination");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const locale = useLocale();

  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"terminate" | "status" | "delete">(
    status === "active" ? "terminate" : status === "terminated" ? "status" : "status",
  );

  const [termType, setTermType] = useState("resignation");
  const [termDate, setTermDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [termReason, setTermReason] = useState("");

  const [termState, termAction, termPending] = useActionState<EmployeeActionState, FormData>(
    terminateEmployee.bind(null, employeeId),
    undefined,
  );

  const [statusState, statusAction, statusPending] = useActionState<EmployeeActionState, FormData>(
    setEmployeeStatus.bind(null, employeeId, status === "active" ? "disabled" : "active"),
    undefined,
  );

  const [reactivateState, reactivateAction, reactivatePending] = useActionState<EmployeeActionState, FormData>(
    reactivateEmployee.bind(null, employeeId),
    undefined,
  );

  const [deleteState, deleteAction, deletePending] = useActionState<EmployeeActionState, FormData>(
    deleteEmployee.bind(null, employeeId),
    undefined,
  );

  const error = [termState, statusState, reactivateState, deleteState].find((s) => s && !s.ok);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm" className="text-secondary hover:text-ink">
            <UserX className="size-4" aria-hidden />
            {t("title")}
          </Button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <UserX className="size-5 text-brick" aria-hidden />
            <span>{t("title")}</span>
          </AlertDialogTitle>
          <AlertDialogDescription>
            {name} — {t("subtitle")}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {error && !error.ok && (
          <p role="alert" className="rounded-control border border-brick/30 bg-brick/5 px-3 py-2 text-label text-brick">
            {tErrors(error.error)}
          </p>
        )}

        {/* Tab Switcher */}
        <div className="flex border-b border-line gap-2 pb-1">
          {status === "active" && (
            <button
              type="button"
              onClick={() => setActiveTab("terminate")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-t-md transition-colors ${
                activeTab === "terminate"
                  ? "border-b-2 border-brick text-brick bg-brick/5"
                  : "text-secondary hover:text-ink"
              }`}
            >
              {t("terminateTab")}
            </button>
          )}

          <button
            type="button"
            onClick={() => setActiveTab("status")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-t-md transition-colors ${
              activeTab === "status"
                ? "border-b-2 border-indigo text-indigo bg-indigo/5"
                : "text-secondary hover:text-ink"
            }`}
          >
            {t("statusTab")}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("delete")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-t-md transition-colors ${
              activeTab === "delete"
                ? "border-b-2 border-brick text-brick bg-brick/5"
                : "text-secondary hover:text-ink"
            }`}
          >
            {t("deleteTab")}
          </button>
        </div>

        {/* 1. Tab: Terminate / Separation */}
        {activeTab === "terminate" && status === "active" && (
          <form action={termAction} onSubmit={() => setOpen(false)} className="flex flex-col gap-3 py-2">
            <input type="hidden" name="uiLocale" value={locale} />
            <input type="hidden" name="terminationType" value={termType} />

            <div className="rounded-control border border-brick/30 bg-brick/5 p-3 text-caption text-brick flex items-start gap-2">
              <AlertTriangle className="size-4 shrink-0 mt-0.5" aria-hidden />
              <span>{t("warning")}</span>
            </div>

            <SelectField
              name="_terminationType"
              label={t("type")}
              value={termType}
              onChange={(e) => setTermType(e.target.value)}
              options={[
                { value: "resignation", label: t("types.resignation") },
                { value: "contract_end", label: t("types.contract_end") },
                { value: "termination", label: t("types.termination") },
                { value: "absence", label: t("types.absence") },
                { value: "other", label: t("types.other") },
              ]}
            />

            <FormField
              name="terminationDate"
              label={t("date")}
              type="date"
              value={termDate}
              onChange={(e) => setTermDate(e.target.value)}
              required
              dir="ltr"
            />

            <div className="flex flex-col gap-1">
              <label htmlFor="terminationReason" className="text-label font-medium text-ink">
                {t("reason")}
              </label>
              <textarea
                id="terminationReason"
                name="terminationReason"
                rows={2}
                value={termReason}
                onChange={(e) => setTermReason(e.target.value)}
                placeholder={t("reasonPlaceholder")}
                className="w-full rounded-control border border-line bg-surface px-3 py-2 text-label focus:border-indigo focus:outline-none"
              />
            </div>

            <AlertDialogFooter className="mt-2">
              <AlertDialogCancel type="button">{tCommon("cancel")}</AlertDialogCancel>
              <Button type="submit" variant="destructive" disabled={termPending}>
                {termPending ? "…" : t("confirm")}
              </Button>
            </AlertDialogFooter>
          </form>
        )}

        {/* 2. Tab: Status (Reactivate / Suspend) */}
        {activeTab === "status" && (
          <div className="flex flex-col gap-4 py-2">
            {status === "terminated" ? (
              <form action={reactivateAction} onSubmit={() => setOpen(false)} className="flex flex-col gap-3">
                <input type="hidden" name="uiLocale" value={locale} />
                <p className="text-caption text-secondary">{t("reactivateBody")}</p>
                <AlertDialogFooter>
                  <AlertDialogCancel type="button">{tCommon("cancel")}</AlertDialogCancel>
                  <Button type="submit" disabled={reactivatePending}>
                    <RotateCcw className="size-4" aria-hidden />
                    {reactivatePending ? "…" : t("reactivateConfirm")}
                  </Button>
                </AlertDialogFooter>
              </form>
            ) : (
              <form action={statusAction} onSubmit={() => setOpen(false)} className="flex flex-col gap-3">
                <input type="hidden" name="uiLocale" value={locale} />
                <p className="text-caption text-secondary">
                  {status === "active"
                    ? "عند تعطيل الموظف مؤقتاً، يتم تجميد حسابه ولا يتم احتسابه في مسيرات الرواتب حتى إعادة التفعيل."
                    : "إعادة تفعيل الموظف لاستئناف تسجيل الحضور والرواتب والدخول للنظام."}
                </p>
                <AlertDialogFooter>
                  <AlertDialogCancel type="button">{tCommon("cancel")}</AlertDialogCancel>
                  <Button type="submit" variant={status === "active" ? "outline" : "default"} disabled={statusPending}>
                    <Power className="size-4" aria-hidden />
                    {statusPending ? "…" : status === "active" ? "تعطيل الموظف" : "تفعيل الموظف"}
                  </Button>
                </AlertDialogFooter>
              </form>
            )}
          </div>
        )}

        {/* 3. Tab: Permanent Delete */}
        {activeTab === "delete" && (
          <form action={deleteAction} onSubmit={() => setOpen(false)} className="flex flex-col gap-3 py-2">
            <input type="hidden" name="uiLocale" value={locale} />
            <div className="rounded-control border border-brick/30 bg-brick/5 p-3 text-caption text-brick flex items-start gap-2">
              <AlertTriangle className="size-4 shrink-0 mt-0.5" aria-hidden />
              <span>
                سيتم حذف الموظف نهائياً وإلغاء حسابه. تبقى سجلات المهام والتقارير التاريخية للتوثيق فقط.
              </span>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel type="button">{tCommon("cancel")}</AlertDialogCancel>
              <Button type="submit" variant="destructive" disabled={deletePending}>
                <Trash2 className="size-4" aria-hidden />
                {deletePending ? "…" : "حذف الموظف نهائياً"}
              </Button>
            </AlertDialogFooter>
          </form>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
