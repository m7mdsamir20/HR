"use client";

import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { setCompanyStatus } from "@/actions/admin";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

/** Suspend or reactivate a company, always behind a confirmation that says what happens. */
export function CompanyStatusButton({
  companyId,
  companyName,
  suspended,
}: {
  companyId: string;
  companyName: string;
  suspended: boolean;
}) {
  const t = useTranslations("admin.company");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const next = suspended ? "active" : "suspended";

  function confirm() {
    const formData = new FormData();
    formData.set("locale", locale);
    startTransition(() => setCompanyStatus(companyId, next, formData));
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant={suspended ? "default" : "destructive"} disabled={pending}>
          {suspended ? t("activate") : t("suspend")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {suspended ? t("activateTitle", { name: companyName }) : t("suspendTitle", { name: companyName })}
          </AlertDialogTitle>
          <AlertDialogDescription>{suspended ? t("activateBody") : t("suspendBody")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={confirm} variant={suspended ? "default" : "destructive"}>
            {suspended ? t("activateConfirm") : t("suspendConfirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
