"use client";

import { CheckCircle2, Sparkles } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import type { EmployeeFormState } from "@/actions/employees";
import { FormField } from "@/components/form-field";
import { SelectField } from "@/components/select-field";
import { Button } from "@/components/ui/button";
import type { Role } from "@/lib/auth/roles";
import { suggestPassword } from "@/lib/password";
import type { EmployeeField } from "@/lib/validation/employee";

export type Option = { value: string; label: string };

type Props = {
  mode: "create" | "edit";
  action: (prev: EmployeeFormState, formData: FormData) => Promise<EmployeeFormState>;
  roles: Role[];
  departments: Option[];
  managers: Option[];
  defaults?: Partial<Record<EmployeeField, string>>;
};

export function EmployeeForm({ mode, action, roles, departments, managers, defaults = {} }: Props) {
  const t = useTranslations("employees");
  const tRoles = useTranslations("roles");
  const tErrors = useTranslations("errors");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [state, formAction, pending] = useActionState<EmployeeFormState, FormData>(action, undefined);
  const [password, setPassword] = useState("");

  const failed = state && !state.saved ? state : undefined;
  const v = (f: EmployeeField) => failed?.values[f] ?? defaults[f] ?? "";
  const err = (f: EmployeeField) => {
    if (!failed?.fields?.[f]) return undefined;
    if (f === "nationalId" && failed.error === "nationalIdTaken") return t("fields.nationalIdTaken");
    return t(`fields.${f}`);
  };
  // Re-mount after a failed submit so the inputs show the values that were sent back.
  const formKey = failed ? JSON.stringify(failed.values) : "initial";

  return (
    <form key={formKey} action={formAction} className="flex flex-col gap-8" noValidate>
      <input type="hidden" name="uiLocale" value={locale} />

      {failed && (
        <p role="alert" className="max-w-3xl rounded-control border border-brick/30 bg-brick/5 px-3 py-2.5 text-label text-brick">
          {tErrors(failed.error)}
        </p>
      )}

      <fieldset className="grid max-w-3xl gap-5 md:grid-cols-2">
        <legend className="mb-4 text-section">{t("form.personal")}</legend>
        {mode === "create" && (
          <FormField
            name="nationalId"
            label={t("form.nationalId")}
            hint={t("form.nationalIdHint")}
            defaultValue={v("nationalId")}
            error={err("nationalId")}
            required
            inputMode="numeric"
            maxLength={14}
            dir="ltr"
            className="tabular-nums md:col-span-2 md:max-w-sm"
          />
        )}
        <FormField name="fullNameAr" label={t("form.fullNameAr")} defaultValue={v("fullNameAr")} error={err("fullNameAr")} required dir="rtl" />
        <FormField
          name="fullNameEn"
          label={t("form.fullNameEn")}
          defaultValue={v("fullNameEn")}
          error={err("fullNameEn")}
          optionalLabel={tCommon("optional")}
          dir="ltr"
        />
        <FormField
          name="phone"
          label={t("form.phone")}
          hint={t("form.phoneHint")}
          type="tel"
          inputMode="tel"
          defaultValue={v("phone")}
          error={err("phone")}
          optionalLabel={tCommon("optional")}
          dir="ltr"
        />
        <FormField
          name="jobTitle"
          label={t("form.jobTitle")}
          defaultValue={v("jobTitle")}
          error={err("jobTitle")}
          optionalLabel={tCommon("optional")}
        />
      </fieldset>

      <fieldset className="grid max-w-3xl gap-5 md:grid-cols-2">
        <legend className="mb-4 text-section">{t("form.work")}</legend>
        <SelectField
          name="role"
          label={t("form.role")}
          hint={t("form.roleHint")}
          defaultValue={v("role") || "employee"}
          error={err("role")}
          options={roles.map((r) => ({ value: r, label: tRoles(r) }))}
        />
        <SelectField
          name="departmentId"
          label={t("form.department")}
          defaultValue={v("departmentId")}
          error={err("departmentId")}
          options={[{ value: "", label: t("form.noDepartment") }, ...departments]}
        />
        <SelectField
          name="managerId"
          label={t("form.manager")}
          defaultValue={v("managerId")}
          error={err("managerId")}
          options={[{ value: "", label: t("form.noManager") }, ...managers]}
        />
        {mode === "create" && (
          <SelectField
            name="locale"
            label={t("form.locale")}
            defaultValue={v("locale") || "ar"}
            options={[
              { value: "ar", label: "العربية" },
              { value: "en", label: "English" },
            ]}
          />
        )}
      </fieldset>

      {mode === "create" && (
        <fieldset className="grid max-w-3xl gap-5">
          <legend className="mb-4 text-section">{t("form.account")}</legend>
          {/* Clear text on purpose: the manager reads it out. Never returned on errors. */}
          <FormField
            name="password"
            label={t("form.password")}
            hint={t("form.passwordHint")}
            error={err("password")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="off"
            spellCheck={false}
            maxLength={72}
            dir="ltr"
            className="md:max-w-lg"
          >
            <Button type="button" variant="outline" onClick={() => setPassword(suggestPassword())} className="shrink-0">
              <Sparkles aria-hidden />
              {t("form.generate")}
            </Button>
          </FormField>
        </fieldset>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={pending}>
          {mode === "create" ? (pending ? t("form.submitting") : t("form.submitCreate")) : pending ? tCommon("saving") : tCommon("save")}
        </Button>
        {state?.saved && (
          <p role="status" className="inline-flex items-center gap-1.5 text-label text-stamp">
            <CheckCircle2 className="size-4" aria-hidden />
            {t("form.saved")}
          </p>
        )}
      </div>
    </form>
  );
}
