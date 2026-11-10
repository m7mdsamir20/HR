"use client";

import { CheckCircle2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import type { EmployeeFormState } from "@/actions/employees";
import { ComboboxField } from "@/components/combobox-field";
import { FormField } from "@/components/form-field";
import { FormSection } from "@/components/form-section";
import { SelectField } from "@/components/select-field";
import { Button } from "@/components/ui/button";
import { formatAmount, normalizeAmount } from "@/lib/money";
import { CONTRACT_RENEWAL_TYPES, CONTRACT_TYPES, EMPLOYMENT_TYPES, GENDERS, MARITAL_STATUSES, type EmployeeField } from "@/lib/validation/employee";

export type Option = { value: string; label: string };

type Props = {
  mode: "create" | "edit";
  action: (prev: EmployeeFormState, formData: FormData) => Promise<EmployeeFormState>;
  departments: Option[];
  managers: Option[];
  nationalities: Option[];
  idType?: "citizen" | "resident";
  defaults?: Partial<Record<EmployeeField, string>>;
};

const PAY_FIELDS = ["basicSalary", "housingAllowance", "transportAllowance", "communicationAllowance", "otherAllowances"] as const;

export function EmployeeForm({ mode, action, departments, managers, nationalities, idType: initialIdType, defaults = {} }: Props) {
  const t = useTranslations("employees");
  const tErrors = useTranslations("errors");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [state, formAction, pending] = useActionState<EmployeeFormState, FormData>(action, undefined);

  const failed = state && !state.saved ? state : undefined;
  const v = (f: EmployeeField) => failed?.values[f] ?? defaults[f] ?? "";
  const err = (f: EmployeeField) => {
    if (!failed?.fields?.[f]) return undefined;
    if (f === "nationalId" && failed.error === "nationalIdTaken") return t("fields.nationalIdTaken");
    return t(`fields.${f}`);
  };

  // Live state: idType (مواطن أو مقيم)
  const [idType, setIdType] = useState<"citizen" | "resident">(() => {
    const rawVal = v("idType");
    if (rawVal === "citizen" || rawVal === "resident") return rawVal;
    if (initialIdType) return initialIdType;
    const typed = v("nationalId");
    return typed.trim().startsWith("2") ? "resident" : "citizen";
  });

  const [nationality, setNationality] = useState(() => (idType === "citizen" ? "SA" : v("nationality")));
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

  const formKey = failed ? JSON.stringify(failed.values) : "initial";

  return (
    <form key={formKey} action={formAction} className="flex flex-col gap-6" noValidate>
      <input type="hidden" name="uiLocale" value={locale} />

      {failed && (
        <p role="alert" className="rounded-control border border-brick/30 bg-brick/5 px-3 py-2.5 text-label text-brick">
          {tErrors(failed.error)}
        </p>
      )}

      {/* 1. البيانات الأساسية - بالترتيب المطلوب بدقة */}
      <FormSection title={t("form.sections.identity")} description={t("form.sections.identityHint")}>
        {/* 1. الاسم بالعربية */}
        <FormField
          name="fullNameAr"
          label={t("form.fullNameAr")}
          defaultValue={v("fullNameAr")}
          error={err("fullNameAr")}
          required
          dir="rtl"
        />

        {/* 2. الاسم بالإنجليزية */}
        <FormField
          name="fullNameEn"
          label={t("form.fullNameEn")}
          defaultValue={v("fullNameEn")}
          error={err("fullNameEn")}
          optionalLabel={tCommon("optional")}
          dir="ltr"
        />

        {/* 3. رقم الهوية / الإقامة */}
        {mode === "create" ? (
          <FormField
            name="nationalId"
            label={idType === "citizen" ? t("form.citizenNationalId") : t("form.residentNationalId")}
            defaultValue={v("nationalId")}
            error={err("nationalId")}
            required
            inputMode="numeric"
            maxLength={10}
            dir="ltr"
            className="tabular-nums"
          />
        ) : (
          <FormField
            name="nationalId"
            label={idType === "citizen" ? t("form.citizenNationalId") : t("form.residentNationalId")}
            value={v("nationalId")}
            readOnly
            disabled
            dir="ltr"
            className="tabular-nums opacity-75"
          />
        )}

        {/* 4. نوع الإقامة (سيلكت ليست بنفس الحجم والشكل العادي) */}
        {mode === "create" ? (
          <SelectField
            name="idType"
            label={t("form.idType")}
            value={idType}
            onChange={(e) => {
              const val = e.target.value as "citizen" | "resident";
              setIdType(val);
              if (val === "citizen") {
                setNationality("SA");
              } else if (nationality === "SA") {
                setNationality("");
              }
            }}
            options={[
              { value: "citizen", label: t("form.idTypeCitizen") },
              { value: "resident", label: t("form.idTypeResident") },
            ]}
          />
        ) : (
          <SelectField
            name="idType"
            label={t("form.idType")}
            value={idType}
            disabled
            options={[
              { value: "citizen", label: t("form.idTypeCitizen") },
              { value: "resident", label: t("form.idTypeResident") },
            ]}
          />
        )}

        {/* 5. الجنسية: لو مواطن "المملكة العربية السعودية"، لو مقيم سيلكت قابل للبحث */}
        {idType === "citizen" ? (
          <div>
            <input type="hidden" name="nationality" value="SA" />
            <FormField
              name="_displayNationality"
              label={t("form.nationality")}
              value={t("form.saudiArabia")}
              readOnly
              disabled
            />
          </div>
        ) : (
          <ComboboxField
            name="nationality"
            label={t("form.nationality")}
            options={nationalities.filter((n) => n.value !== "SA")}
            defaultValue={v("nationality")}
            value={nationality}
            onChange={setNationality}
            error={err("nationality")}
            searchPlaceholder="ابحث عن جنسية..."
            placeholder="اختر الجنسية..."
          />
        )}

        {/* بيانات الإقامة للمقيم فقط: تاريخ البداية والنهاية */}
        {idType === "resident" && (
          <>
            <FormField
              name="iqamaStart"
              label={t("form.iqamaStart")}
              type="date"
              defaultValue={v("iqamaStart")}
              error={err("iqamaStart")}
              dir="ltr"
            />
            <FormField
              name="iqamaEnd"
              label={t("form.iqamaEnd")}
              hint={t("form.iqamaEndHint")}
              type="date"
              defaultValue={v("iqamaEnd")}
              error={err("iqamaEnd")}
              dir="ltr"
            />
          </>
        )}

        {/* 6. الجنس */}
        <SelectField
          name="gender"
          label={t("form.gender")}
          defaultValue={v("gender")}
          error={err("gender")}
          options={[choose, ...GENDERS.map((g) => ({ value: g, label: t(`options.gender.${g}`) }))]}
        />

        {/* 7. تاريخ الميلاد */}
        <FormField name="birthDate" label={t("form.birthDate")} type="date" defaultValue={v("birthDate")} error={err("birthDate")} dir="ltr" />

        {/* 8. الحالة الاجتماعية */}
        <SelectField
          name="maritalStatus"
          label={t("form.maritalStatus")}
          defaultValue={v("maritalStatus")}
          error={err("maritalStatus")}
          options={[choose, ...MARITAL_STATUSES.map((m) => ({ value: m, label: t(`options.maritalStatus.${m}`) }))]}
        />

        {/* 9. رقم الجوال */}
        <FormField name="phone" label={t("form.phone")} hint={t("form.phoneHint")} type="tel" inputMode="tel" defaultValue={v("phone")} error={err("phone")} optionalLabel={tCommon("optional")} dir="ltr" />

        {/* 10. البريد الإلكتروني */}
        <FormField name="email" label={t("form.email")} hint={t("form.emailHint")} type="email" defaultValue={v("email")} error={err("email")} optionalLabel={tCommon("optional")} dir="ltr" />
      </FormSection>

      {/* 2. بيانات العمل - مع تسمية "المدير المباشر" وبدون حقل الدور */}
      <FormSection title={t("form.sections.work")} description={t("form.sections.workHint")}>
        <SelectField name="departmentId" label={t("form.department")} defaultValue={v("departmentId")} error={err("departmentId")} options={[{ value: "", label: t("form.noDepartment") }, ...departments]} />
        <SelectField name="managerId" label={t("form.directManager")} defaultValue={v("managerId")} error={err("managerId")} options={[{ value: "", label: t("form.noDirectManager") }, ...managers]} />
        {mode === "edit" && v("employeeNumber") && (
          <FormField
            name="employeeNumber"
            label={t("form.employeeNumber")}
            defaultValue={v("employeeNumber")}
            readOnly
            className="opacity-75 cursor-not-allowed bg-paper"
            dir="ltr"
          />
        )}
        <FormField name="jobTitle" label={t("form.jobTitle")} defaultValue={v("jobTitle")} error={err("jobTitle")} optionalLabel={tCommon("optional")} />
        <FormField name="occupation" label={t("form.occupation")} hint={t("form.occupationHint")} defaultValue={v("occupation")} error={err("occupation")} optionalLabel={tCommon("optional")} />
        <FormField name="hireDate" label={t("form.hireDate")} type="date" defaultValue={v("hireDate")} error={err("hireDate")} dir="ltr" />
      </FormSection>

      {/* 3. بيانات العقد */}
      <FormSection title={t("form.sections.contract")} description={t("form.sections.contractHint")}>
        <SelectField
          name="employmentType"
          label={t("form.employmentType")}
          defaultValue={v("employmentType") || "full_time"}
          error={err("employmentType")}
          options={EMPLOYMENT_TYPES.map((e) => ({ value: e, label: t(`options.employmentType.${e}`) }))}
        />
        <SelectField
          name="contractType"
          label={t("form.contractType")}
          defaultValue={v("contractType")}
          error={err("contractType")}
          options={[choose, ...CONTRACT_TYPES.map((c) => ({ value: c, label: t(`options.contractType.${c}`) }))]}
        />
        <SelectField
          name="contractRenewal"
          label={t("form.contractRenewal")}
          defaultValue={v("contractRenewal") || "auto_renew"}
          error={err("contractRenewal")}
          options={CONTRACT_RENEWAL_TYPES.map((r) => ({
            value: r,
            label: t(`options.contractRenewal.${r}`),
          }))}
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

      {/* 4. الراتب والبدلات */}
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
