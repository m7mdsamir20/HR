"use client";

import { CalendarClock, Check, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useEffect, useState } from "react";
import { correctAttendance, type AttendanceState } from "@/actions/attendance";
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

export interface EmployeeOption {
  id: string;
  full_name_ar: string;
  full_name_en: string | null;
  employee_number: string | null;
}

interface ManualAttendanceDialogProps {
  employees: EmployeeOption[];
  today: string;
  defaultEmployeeId?: string;
}

export function ManualAttendanceDialog({ employees, today, defaultEmployeeId }: ManualAttendanceDialogProps) {
  const t = useTranslations("attendance.manualEntry");
  const tErrors = useTranslations("errors");
  const tAttendance = useTranslations("attendance.errors");
  const locale = useLocale() as Locale;

  const [open, setOpen] = useState(false);
  const [absent, setAbsent] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState(defaultEmployeeId || employees[0]?.id || "");

  const [state, action, pending] = useActionState<AttendanceState, FormData>(async (prev, fd) => {
    const res = await correctAttendance(prev, fd);
    return res;
  }, undefined);

  useEffect(() => {
    if (state?.ok) {
      const timer = setTimeout(() => {
        setOpen(false);
        setAbsent(false);
      }, 700);
      return () => clearTimeout(timer);
    }
  }, [state]);

  const employeeOptions = employees.map((e) => ({
    value: e.id,
    label: `${locale === "en" && e.full_name_en ? e.full_name_en : e.full_name_ar}${e.employee_number ? ` (${e.employee_number})` : ""}`,
  }));

  const invalid = (field: string) => (state && !state.ok && state.fields?.includes(field) ? tErrors("invalid") : undefined);
  const errorText =
    state && !state.ok && state.error !== "invalid"
      ? tAttendance.has(state.error)
        ? tAttendance(state.error)
        : tErrors(state.error as "unexpected")
      : undefined;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="default" className="gap-2">
          <CalendarClock className="size-4" />
          <span>{t("button")}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-primary font-bold">
            <CalendarClock className="size-5 text-indigo" />
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

          <FormField
            name="date"
            type="date"
            label={t("date")}
            defaultValue={today}
            max={today}
            required
            error={invalid("date")}
            dir="ltr"
          />

          <label className="flex items-center gap-2.5 p-3 rounded-card border border-line bg-paper/50 cursor-pointer select-none">
            <input
              type="checkbox"
              name="absent"
              checked={absent}
              onChange={(e) => setAbsent(e.target.checked)}
              className="size-5 accent-indigo rounded"
            />
            <div className="flex flex-col">
              <span className="text-label font-medium text-ink">{t("absent")}</span>
            </div>
          </label>

          {!absent && (
            <div className="grid grid-cols-2 gap-3">
              <FormField
                name="checkIn"
                type="time"
                label={t("checkIn")}
                defaultValue="08:00"
                required={!absent}
                error={invalid("checkIn")}
                dir="ltr"
              />
              <FormField
                name="checkOut"
                type="time"
                label={t("checkOut")}
                defaultValue="16:00"
                error={invalid("checkOut")}
                dir="ltr"
              />
            </div>
          )}

          <FormField
            name="note"
            label={t("note")}
            defaultValue={t("noteDefault")}
            required
            error={invalid("note")}
          />

          {errorText && (
            <p role="alert" className="text-caption font-medium text-brick bg-brick/10 p-2.5 rounded-card border border-brick/20">
              {errorText}
            </p>
          )}

          {state?.ok && (
            <p role="status" className="flex items-center gap-1.5 text-caption font-medium text-emerald-600 bg-emerald-500/10 p-2.5 rounded-card border border-emerald-500/20">
              <Check className="size-4" />
              {t("success")}
            </p>
          )}

          <DialogFooter className="mt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={pending} className="gap-2">
              {pending && <Loader2 className="size-4 animate-spin" />}
              {pending ? t("submitting") : t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
