"use client";

import { CalendarPlus, Check, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useEffect, useState } from "react";
import { createManualLeave, type LeaveState } from "@/actions/leave";
import { FormField } from "@/components/form-field";
import { SelectField } from "@/components/select-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { Locale } from "@/i18n/routing";
import { LEAVE_TYPES, type LeaveType } from "@/lib/leave";
import { useLeaveError } from "./use-leave-error";

export interface EmployeeOption {
  id: string;
  full_name_ar: string;
  full_name_en: string | null;
  employee_number: string | null;
}

interface ManualLeaveDialogProps {
  employees: EmployeeOption[];
  today: string;
}

export function ManualLeaveDialog({ employees, today }: ManualLeaveDialogProps) {
  const t = useTranslations("leave.manualLeave");
  const tCommon = useTranslations("common");
  const tTypes = useTranslations("leave.types");
  const tHints = useTranslations("leave.typeHints");
  const errorText = useLeaveError();
  const locale = useLocale() as Locale;

  const [open, setOpen] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState(employees[0]?.id || "");
  const [type, setType] = useState<LeaveType>("unpaid");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [autoApprove, setAutoApprove] = useState(true);

  const [state, action, pending] = useActionState<LeaveState, FormData>(async (prev, fd) => {
    const res = await createManualLeave(prev, fd);
    return res;
  }, undefined);

  useEffect(() => {
    if (state?.ok) {
      const timer = setTimeout(() => {
        setOpen(false);
      }, 700);
      return () => clearTimeout(timer);
    }
  }, [state]);

  const employeeOptions = employees.map((e) => ({
    value: e.id,
    label: `${locale === "en" && e.full_name_en ? e.full_name_en : e.full_name_ar}${e.employee_number ? ` (${e.employee_number})` : ""}`,
  }));

  const typeOptions = LEAVE_TYPES.map((lt) => ({
    value: lt,
    label: tTypes(lt),
  }));

  const invalid = (field: string) => (state && !state.ok && state.fields?.includes(field) ? t("invalidField") : undefined);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="default" className="gap-2">
          <CalendarPlus className="size-4" />
          <span>{t("button")}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-primary font-bold">
            <CalendarPlus className="size-5 text-indigo" />
            {t("title")}
          </DialogTitle>
          <DialogDescription>{t("intro")}</DialogDescription>
        </DialogHeader>

        <form action={action} className="flex flex-col gap-4 mt-2" noValidate>
          <input type="hidden" name="uiLocale" value={locale} />

          <SelectField
            name="employeeId"
            label={t("employee")}
            options={employeeOptions}
            value={selectedEmp}
            onChange={(e) => setSelectedEmp(e.target.value)}
            required
            error={invalid("employeeId")}
          />

          <SelectField
            name="type"
            label={t("type")}
            options={typeOptions}
            value={type}
            onChange={(e) => setType(e.target.value as LeaveType)}
            hint={tHints(type as "annual")}
            required
            error={invalid("type")}
          />

          <div className="grid grid-cols-2 gap-3">
            <FormField
              name="startDate"
              type="date"
              label={t("startDate")}
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                if (endDate < e.target.value) setEndDate(e.target.value);
              }}
              required
              dir="ltr"
              error={invalid("startDate")}
            />
            <FormField
              name="endDate"
              type="date"
              label={t("endDate")}
              value={endDate}
              min={startDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
              dir="ltr"
              error={invalid("endDate")}
            />
          </div>

          <FormField
            name="reason"
            label={t("reason")}
            placeholder={t("reasonPlaceholder")}
            optionalLabel={tCommon("optional")}
            error={invalid("reason")}
          />

          <div className="flex items-center gap-2.5 rounded-control border border-line bg-paper/60 p-3">
            <input
              type="checkbox"
              id="autoApprove"
              name="autoApprove"
              checked={autoApprove}
              onChange={(e) => setAutoApprove(e.target.checked)}
              className="size-4 rounded text-indigo focus:ring-indigo cursor-pointer"
            />
            <label htmlFor="autoApprove" className="text-caption font-medium text-ink cursor-pointer select-none">
              {t("autoApproveLabel")}
            </label>
          </div>

          {state && !state.ok && (
            <div className="rounded-control bg-brick/10 p-3 text-caption text-brick font-medium">
              {errorText(state)}
            </div>
          )}

          <DialogFooter className="mt-2 sm:justify-start gap-2">
            <Button type="submit" disabled={pending || state?.ok} className="gap-2">
              {pending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  <span>{t("submitting")}</span>
                </>
              ) : state?.ok ? (
                <>
                  <Check className="size-4 text-white" />
                  <span>{t("success")}</span>
                </>
              ) : (
                <span>{t("submit")}</span>
              )}
            </Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {tCommon("cancel")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
