"use client";

import { CheckCircle2, KeyRound, Power, Sparkles, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import {
  deleteEmployee,
  resetEmployeePassword,
  setEmployeeStatus,
  type EmployeeActionState,
} from "@/actions/employees";
import { FormField } from "@/components/form-field";
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
import { suggestPassword } from "@/lib/password";

type Props = { employeeId: string; name: string; status: "active" | "disabled" };

/** Account actions on an employee page. Each one confirms first and says exactly what happens. */
export function EmployeeActions({ employeeId, name, status }: Props) {
  const t = useTranslations("employees.detail");
  const tForm = useTranslations("employees.form");
  const tFields = useTranslations("employees.fields");
  const tErrors = useTranslations("errors");

  const [statusState, statusAction, statusPending] = useActionState<EmployeeActionState, FormData>(
    setEmployeeStatus.bind(null, employeeId, status === "active" ? "disabled" : "active"),
    undefined,
  );
  const [resetState, resetAction, resetPending] = useActionState<EmployeeActionState, FormData>(
    resetEmployeePassword.bind(null, employeeId),
    undefined,
  );
  const [deleteState, deleteAction, deletePending] = useActionState<EmployeeActionState, FormData>(
    deleteEmployee.bind(null, employeeId),
    undefined,
  );
  const [password, setPassword] = useState("");

  const error = [statusState, resetState, deleteState].find((s) => s && !s.ok);

  return (
    <div className="flex flex-col gap-4">
      {error && !error.ok && (
        <p role="alert" className="rounded-control border border-brick/30 bg-brick/5 px-3 py-2.5 text-label text-brick">
          {error.error === "invalid" ? tFields("password") : tErrors(error.error)}
        </p>
      )}
      {resetState?.ok && (
        <p role="status" className="inline-flex items-center gap-1.5 text-label text-stamp">
          <CheckCircle2 className="size-4" aria-hidden />
          {t("resetDone")}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <ConfirmDialog
          trigger={
            <Button variant="outline" disabled={statusPending}>
              <Power aria-hidden />
              {status === "active" ? t("disable") : t("enable")}
            </Button>
          }
          title={status === "active" ? t("disableTitle", { name }) : t("enableTitle", { name })}
          body={status === "active" ? t("disableBody") : t("enableBody")}
          action={statusAction}
          confirmLabel={status === "active" ? t("disable") : t("enable")}
          destructive={status === "active"}
        />

        {status === "active" && (
          <ConfirmDialog
            trigger={
              <Button variant="outline" onClick={() => setPassword(suggestPassword())}>
                <KeyRound aria-hidden />
                {t("resetPassword")}
              </Button>
            }
            title={t("resetTitle", { name })}
            body={t("resetBody")}
            action={resetAction}
            confirmLabel={resetPending ? "…" : t("resetSubmit")}
          >
            <FormField
              name="password"
              label={t("resetPassword")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              maxLength={72}
              minLength={8}
              required
              dir="ltr"
            >
              <Button type="button" variant="outline" size="icon" onClick={() => setPassword(suggestPassword())} aria-label={tForm("generate")}>
                <Sparkles aria-hidden />
              </Button>
            </FormField>
          </ConfirmDialog>
        )}

        <ConfirmDialog
          trigger={
            <Button variant="destructive" disabled={deletePending}>
              <Trash2 aria-hidden />
              {t("delete")}
            </Button>
          }
          title={t("deleteTitle", { name })}
          body={t("deleteBody")}
          action={deleteAction}
          confirmLabel={t("deleteConfirm")}
          destructive
        />
      </div>
    </div>
  );
}

function ConfirmDialog({
  trigger,
  title,
  body,
  action,
  confirmLabel,
  destructive = false,
  children,
}: {
  trigger: React.ReactNode;
  title: string;
  body: string;
  action: (formData: FormData) => void;
  confirmLabel: string;
  destructive?: boolean;
  children?: React.ReactNode;
}) {
  const locale = useLocale();
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        {/* Close on submit, not inside the action: form actions run in a transition, so a state
            update there would only land when the server action finishes. */}
        <form action={action} onSubmit={() => setOpen(false)} className="flex flex-col gap-4">
          <input type="hidden" name="uiLocale" value={locale} />
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{body}</AlertDialogDescription>
          </AlertDialogHeader>
          {children}
          <AlertDialogFooter>
            <AlertDialogCancel type="button">{tCommon("cancel")}</AlertDialogCancel>
            <Button type="submit" variant={destructive ? "destructive" : "default"}>
              {confirmLabel}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
