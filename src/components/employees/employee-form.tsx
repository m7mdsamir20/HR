"use client";

import { CheckCircle2, Sparkles } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import type { EmployeeFormState } from "@/actions/employees";
import { FormField } from "@/components/form-field";
import { FormSection } from "@/components/form-section";
import { SelectField } from "@/components/select-field";
import { Button } from "@/components/ui/button";
import type { Role } from "@/lib/auth/roles";
import { formatAmount, normalizeAmount } from "@/lib/money";
import { suggestPassword } from "@/lib/password";
import { CONTRACT_TYPES, GENDERS, MARITAL_STATUSES, type EmployeeField } from "@/lib/validation/employee";

export type Option = { value: string; label: string };

type Props = {
  mode: "create" | "edit";
  action: (prev: EmployeeFormState, formData: FormData) => Promise<EmployeeFormState>;
  roles: Role[];
  departments: Option[];
  managers: Option[];
  nationalities: Option[];
  /** Edit mode: the stored ID type decides whether nationality is fixed to Saudi. */
  idType?: "citizen" | "resident";
  defaults?: Partial<Record<EmployeeField, string>>;
};

const PAY_FIELDS = ["basicSalary", "housingAllowance", "transportAllowance", "communicationAllowance", "otherAllowances"] as const;

export function EmployeeForm({ mode, action, roles, departments, managers, nationalities, idType, defaults = {} }: Props) {
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

  // Live: citizen/resident from the typed ID (create) and the salary total.
  const [typedId, setTypedId] = useState(v("nationalId"));
  const citizen = mode === "create" ? typedId.trim().startsWith("1") : idType === "citizen";
  const [pay, setPay] = useState(() => Object.fromEntries(PAY_FIELDS.map((f) => [f, v(f)])));
  const total = PAY_FIELDS.reduce((sum, f) => sum + (Number(normalizeAmount(pay[f] ?? "")) || 0), 0);

  const choose = { value: "", label: t("form.choose") };
  const amountProps = (f: (typeof PAY_FIELDS)[number]) => ({
    name: f,
    label: t(`form.${f}`),
    defaultValue: v(f),
    error: err(f),
    inputMode: "decimal" as const,
    dir: "ltr" as const,
    className: "tabular-nums",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setPay((p) => ({ ...p, [f]: e.target.value })),
  });
  // Re-mount after a failed submit so the inputs show the values that were sent back.
  const formKey = failed ? JSON.stringify(failed.values) : "initial";

  return (
    <form key={formKey} action={formAction} className="flex flex-col gap-6" noValidate>
      <input type="hidden" name="uiLocale" value={locale} />

      {failed && (
        <p role="alert" className="rounded-control border border-brick/30 bg-brick/5 px-3 py-2.5 text-label text-brick">
          {tErrors(failed.error)}
        </p>
      )}

      <FormSection title={t("form.sections.identity")} description={t("form.sections.identityHint")}>
        {mode === "create" && (
          <FormField
            name="nationalId"
            label={t("form.nationalId")}
            hint={t("form.nationalIdHint")}
            defaultValue={v("nationalId")}
            onChange={(e) => setTypedId(e.target.value)}
            error={err("nationalId")}
            required
            inputMode="numeric"
            maxLength={14}
            dir="ltr"
            className="tabular-nums"
          />
        )}
        <FormField name="fullNameAr" label={t("form.fullNameAr")} defaultValue={v("fullNameAr")} error={err("fullNameAr")} required dir="rtl" />
        <FormField name="fullNameEn" label={t("form.fullNameEn")} defaultValue={v("fullNameEn")} error={err("fullNameEn")} optionalLabel={tCommon("optional")} dir="ltr" />
        {citizen ? (
          <FormField name="nationality" label={t("form.nationality")} value={t("form.nationalityCitizen")} readOnly disabled />
        ) : (
          <SelectField name="nationality" label={t("form.nationality")} defaultValue={v("nationality")} error={err("nationality")} options={[choose, ...nationalities.filter((n) => n.value !== "SA")]} />
        )}
        <SelectField
          name="gender"
          label={t("form.gender")}
          defaultValue={v("gender")}
          error={err("gender")}
          options={[choose, ...GENDERS.map((g) => ({ value: g, label: t(`options.gender.${g}`) }))]}
        />
        <FormField name="birthDate" label={t("form.birthDate")} type="date" defaultValue={v("birthDate")} error={err("birthDate")} dir="ltr" />
        <SelectField
          name="maritalStatus"
          label={t("form.maritalStatus")}
          defaultValue={v("maritalStatus")}
          error={err("maritalStatus")}
          options={[choose, ...MARITAL_STATUSES.map((m) => ({ value: m, label: t(`options.maritalStatus.${m}`) }))]}
        />
        <FormField name="phone" label={t("form.phone")} hint={t("form.phoneHint")} type="tel" inputMode="tel" defaultValue={v("phone")} error={err("phone")} optionalLabel={tCommon("optional")} dir="ltr" />
        <FormField name="email" label={t("form.email")} hint={t("form.emailHint")} type="email" defaultValue={v("email")} error={err("email")} optionalLabel={tCommon("optional")} dir="ltr" />
      </FormSection>

      <FormSection title={t("form.sections.work")} description={t("form.sections.workHint")}>
        <SelectField name="role" label={t("form.role")} defaultValue={v("role") || "employee"} error={err("role")} options={roles.map((r) => ({ value: r, label: tRoles(r) }))} />
        <SelectField name="departmentId" label={t("form.department")} defaultValue={v("departmentId")} error={err("departmentId")} options={[{ value: "", label: t("form.noDepartment") }, ...departments]} />
        <SelectField name="managerId" label={t("form.manager")} defaultValue={v("managerId")} error={err("managerId")} options={[{ value: "", label: t("form.noManager") }, ...managers]} />
        <FormField name="employeeNumber" label={t("form.employeeNumber")} defaultValue={v("employeeNumber")} error={err("employeeNumber")} optionalLabel={tCommon("optional")} dir="ltr" />
        <FormField name="jobTitle" label={t("form.jobTitle")} defaultValue={v("jobTitle")} error={err("jobTitle")} optionalLabel={tCommon("optional")} />
        <FormField name="occupation" label={t("form.occupation")} hint={t("form.occupationHint")} defaultValue={v("occupation")} error={err("occupation")} optionalLabel={tCommon("optional")} />
        <FormField name="hireDate" label={t("form.hireDate")} type="date" defaultValue={v("hireDate")} error={err("hireDate")} dir="ltr" />
      </FormSection>

      <FormSection title={t("form.sections.contract")} description={t("form.sections.contractHint")}>
        <SelectField
          name="contractType"
          label={t("form.contractType")}
          defaultValue={v("contractType")}
          error={err("contractType")}
          options={[choose, ...CONTRACT_TYPES.map((c) => ({ value: c, label: t(`options.contractType.${c}`) }))]}
        />
        <FormField name="contractStart" label={t("form.contractStart")} type="date" defaultValue={v("contractStart")} error={err("contractStart")} dir="ltr" />
        <FormField name="contractEnd" label={t("form.contractEnd")} hint={t("form.contractEndHint")} type="date" defaultValue={v("contractEnd")} error={err("contractEnd")} dir="ltr" />
        <FormField
          name="probationDays"
          label={t("form.probationDays")}
          hint={t("form.probationHint")}
          type="number"
          min={0}
          max={180}
          defaultValue={v("probationDays") || (mode === "create" ? "90" : "")}
          error={err("probationDays")}
          dir="ltr"
        />
      </FormSection>

      <FormSection title={t("form.sections.pay")} description={t("form.sections.payHint")}>
        {PAY_FIELDS.map((f) => (
          <FormField key={f} {...amountProps(f)} />
        ))}
        <div className="flex flex-col justify-center gap-0.5 rounded-control bg-paper px-4 py-3" aria-live="polite">
          <span className="text-secondary">{t("form.totalSalary")}</span>
          <span className="text-section tabular-nums">
            <bdi dir="ltr">{formatAmount(total)}</bdi> <span className="text-label text-ink-soft">{t("form.currency")}</span>
          </span>
        </div>
        <FormField name="bankName" label={t("form.bankName")} defaultValue={v("bankName")} error={err("bankName")} optionalLabel={tCommon("optional")} />
        <FormField name="iban" label={t("form.iban")} hint={t("form.ibanHint")} defaultValue={v("iban")} error={err("iban")} optionalLabel={tCommon("optional")} dir="ltr" maxLength={34} className="tabular-nums" />
        <FormField name="gosiNumber" label={t("form.gosiNumber")} defaultValue={v("gosiNumber")} error={err("gosiNumber")} optionalLabel={tCommon("optional")} inputMode="numeric" dir="ltr" />
      </FormSection>

      {mode === "create" && (
        <FormSection title={t("form.sections.account")}>
          <SelectField
            name="locale"
            label={t("form.locale")}
            defaultValue={v("locale") || "ar"}
            options={[
              { value: "ar", label: "العربية" },
              { value: "en", label: "English" },
            ]}
          />
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
            className="sm:col-span-2"
          >
            <Button type="button" variant="outline" onClick={() => setPassword(suggestPassword())} className="shrink-0">
              <Sparkles aria-hidden />
              {t("form.generate")}
            </Button>
          </FormField>
        </FormSection>
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
