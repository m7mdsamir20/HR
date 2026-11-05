"use client";

import { CheckCircle2, KeyRound, ShieldAlert, ShieldCheck, Sparkles, UserPlus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { createUserAccount, type UserAccountState } from "@/actions/employees";
import { FormField } from "@/components/form-field";
import { SelectField } from "@/components/select-field";
import { StatusPill, type Tone } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Role } from "@/lib/auth/roles";
import { suggestPassword } from "@/lib/password";

export interface EmployeeUserItem {
  id: string;
  nationalId: string;
  name: string;
  jobTitle: string | null;
  departmentName: string | null;
  role: Role;
  hasUserAccount: boolean;
  locale: string;
  employeeNumber?: string | null;
}

interface UsersManagerProps {
  employees: EmployeeUserItem[];
  canManage: boolean;
}

const roleTones: Record<Role, Tone> = {
  owner: "indigo",
  hr: "stamp",
  manager: "saffron",
  employee: "neutral",
};

export function UsersManager({ employees, canManage }: UsersManagerProps) {
  const tRoles = useTranslations("roles");
  const tCommon = useTranslations("common");
  const uiLocale = useLocale();

  const [state, action, pending] = useActionState<UserAccountState, FormData>(createUserAccount, undefined);
  const [selectedEmpId, setSelectedEmpId] = useState<string>("");
  const [password, setPassword] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const employeesWithoutAccount = employees.filter((e) => !e.hasUserAccount);
  const selectedEmp = employees.find((e) => e.id === selectedEmpId);

  const openForEmployee = (empId: string) => {
    setSelectedEmpId(empId);
    setPassword(suggestPassword());
    setIsOpen(true);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Top action header */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-line bg-surface p-4 md:p-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-card font-semibold text-ink">حسابات مستخدمي النظام</h2>
          <p className="text-caption text-secondary">
            إدارة حسابات الدخول للموظفين، تعيين الصلاحيات (موارد بشرية / مشرف / موظف)، وتعيين كلمات المرور ولغة الواجهة.
          </p>
        </div>

        {canManage && employeesWithoutAccount.length > 0 && (
          <Button
            type="button"
            onClick={() => {
              setSelectedEmpId(employeesWithoutAccount[0]?.id ?? "");
              setPassword(suggestPassword());
              setIsOpen(true);
            }}
            className="shrink-0"
          >
            <UserPlus className="size-4" aria-hidden />
            إنشاء حساب لموظف
          </Button>
        )}
      </div>

      {/* Account Creation / Edit Box */}
      {isOpen && (
        <section aria-labelledby="create-account-heading" className="rounded-card border-2 border-indigo/30 bg-surface p-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-line pb-3 mb-4">
            <div className="flex items-center gap-2">
              <KeyRound className="size-5 text-indigo" aria-hidden />
              <h3 id="create-account-heading" className="font-semibold text-ink">
                {selectedEmp?.hasUserAccount ? "تحديث حساب الدخول والصلاحية" : "إنشاء حساب دخول جديد"}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-caption text-secondary hover:text-ink"
            >
              إلغاء ✕
            </button>
          </div>

          <form action={action} className="grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="uiLocale" value={uiLocale} />

            <div className="sm:col-span-2">
              <SelectField
                name="employeeId"
                label="الموظف"
                value={selectedEmpId}
                onChange={(e) => setSelectedEmpId(e.target.value)}
                options={employees
                  .filter((e) => e.role !== "owner")
                  .map((e) => ({
                    value: e.id,
                    label: `${e.name} (${e.nationalId}) — ${e.hasUserAccount ? "لديه حساب (" + tRoles(e.role) + ")" : "بدون حساب"}`,
                  }))}
              />
            </div>

            <SelectField
              name="role"
              label="الصلاحية في النظام"
              defaultValue={selectedEmp?.role && selectedEmp.role !== "owner" ? selectedEmp.role : "employee"}
              options={[
                { value: "employee", label: tRoles("employee") },
                { value: "manager", label: tRoles("manager") },
                { value: "hr", label: tRoles("hr") },
              ]}
            />

            <SelectField
              name="locale"
              label="لغة الواجهة الافتراضية"
              defaultValue={selectedEmp?.locale || "ar"}
              options={[
                { value: "ar", label: "العربية" },
                { value: "en", label: "English" },
              ]}
            />

            <FormField
              name="password"
              label="كلمة المرور الجديدة"
              hint="8 خانات على الأقل. أبلغ الموظف بها بعد الحفظ."
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="off"
              dir="ltr"
              className="sm:col-span-2"
            >
              <Button type="button" variant="outline" onClick={() => setPassword(suggestPassword())} className="shrink-0">
                <Sparkles className="size-4" aria-hidden />
                توليد كلمة مرور
              </Button>
            </FormField>

            <div className="flex items-center gap-3 pt-2 sm:col-span-2">
              <Button type="submit" disabled={pending}>
                {pending ? tCommon("saving") : tCommon("save")}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setIsOpen(false)}>
                {tCommon("cancel")}
              </Button>

              {state?.ok && (
                <p role="status" className="inline-flex items-center gap-1.5 text-label text-stamp">
                  <CheckCircle2 className="size-4" aria-hidden />
                  تم حفظ بيانات الحساب بنجاح
                </p>
              )}
              {state && !state.ok && (
                <p role="alert" className="inline-flex items-center gap-1.5 text-label text-brick">
                  <ShieldAlert className="size-4" aria-hidden />
                  حدث خطأ أثناء حفظ الحساب، تأكد من صحة البيانات.
                </p>
              )}
            </div>
          </form>
        </section>
      )}

      {/* Employees Users Table */}
      <div className="overflow-hidden rounded-card border border-line bg-surface">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>الموظف</TableHead>
              <TableHead>رقم الهوية / الإقامة</TableHead>
              <TableHead>القسم / المسمى</TableHead>
              <TableHead>صلاحية النظام</TableHead>
              <TableHead>حساب الدخول</TableHead>
              <TableHead className="text-end">الإجراء</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {employees.map((emp) => (
              <TableRow key={emp.id}>
                <TableCell className="font-semibold text-ink">{emp.name}</TableCell>
                <TableCell className="tabular-nums font-mono text-xs text-secondary">{emp.nationalId}</TableCell>
                <TableCell className="text-caption text-secondary">
                  {emp.departmentName || emp.jobTitle ? (
                    <span>
                      {emp.departmentName}
                      {emp.departmentName && emp.jobTitle && " · "}
                      {emp.jobTitle}
                    </span>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell>
                  <StatusPill tone={roleTones[emp.role]}>{tRoles(emp.role)}</StatusPill>
                </TableCell>
                <TableCell>
                  {emp.hasUserAccount ? (
                    <span className="inline-flex items-center gap-1 text-caption text-stamp font-medium">
                      <ShieldCheck className="size-3.5" aria-hidden />
                      مفعل ({emp.locale === "en" ? "EN" : "عربي"})
                    </span>
                  ) : (
                    <span className="text-caption text-secondary">بدون حساب</span>
                  )}
                </TableCell>
                <TableCell className="text-end">
                  {canManage && emp.role !== "owner" && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => openForEmployee(emp.id)}
                      className={emp.hasUserAccount ? "text-ink-soft hover:text-ink" : "text-indigo font-semibold"}
                    >
                      {emp.hasUserAccount ? "تعديل الصلاحية" : "إنشاء حساب"}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
