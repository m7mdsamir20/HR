"use client";

import { CheckCircle2, Eye, EyeOff, KeyRound, Loader2, ShieldAlert, ShieldCheck, Sparkles, UserPlus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { createUserAccount, type UserAccountState } from "@/actions/employees";
import { SelectField } from "@/components/select-field";
import { StatusPill, type Tone } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Role } from "@/lib/auth/roles";
import { suggestPassword } from "@/lib/password";
import { cn } from "@/lib/utils";

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
  admin: "indigo",
  hr: "stamp",
  manager: "saffron",
  employee: "neutral",
};

interface RoleDefinition {
  id: "admin" | "manager" | "hr" | "employee";
  title: string;
  badge: string;
  tone: Tone;
  summary: string;
  visibleScreens: string[];
  permissions: string[];
}

const ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    id: "admin",
    title: "مدير (صلاحيات كاملة)",
    badge: "إدارة شاملة للمنشأة",
    tone: "indigo",
    summary: "مخصص للمدير العام أو التنفيذي لإدارة كافة شؤون الشركة بصلاحيات مطابقة لمدير النظام.",
    visibleScreens: ["لوحة التحكم", "شؤون الموظفين", "المستخدمين", "الرواتب والسلف", "الحضور والإجازات", "المهام", "إعدادات الشركة"],
    permissions: [
      "التحكم الكامل في إضافة وتعديل الموظفين وإنهاء الخدمات",
      "إنشاء حسابات المستخدمين وتعيين الصلاحيات وكلمات المرور",
      "إعداد واعتماد مسيرات الرواتب الشهرية وصرف السلف",
      "إدارة الفروع، الورديات، إعدادات الحضور والربط الجغرافي",
      "إسناد ومتابعة كافة المهام واعتماد التقارير عبر كافة الأقسام",
    ],
  },
  {
    id: "manager",
    title: "مدير / مشرف (فرع أو قسم)",
    badge: "إدارة الفريق والعمليات",
    tone: "saffron",
    summary: "مخصص لمدراء الفروع، رؤساء الأقسام، ومشرفي المواقع والفرق الميدانية.",
    visibleScreens: ["لوحة التحكم", "المهام", "حضور فريقي", "إجازات فريقي"],
    permissions: [
      "متابعة وإسناد المهام لأعضاء فريقه واعتماد تقارير الإنجاز",
      "الموافقة على طلبات إجازات موظفي قسمه أو رفضها",
      "الاطلاع على بصمات الحضور والانصراف وسجلات فريقه فقط",
    ],
  },
  {
    id: "hr",
    title: "مسؤول الموارد البشرية (HR)",
    badge: "شؤون الموظفين والرواتب",
    tone: "stamp",
    summary: "مخصص لمسؤولي الموارد البشرية، الرواتب، والشؤون الإدارية بالمنشأة.",
    visibleScreens: ["شؤون الموظفين", "الحضور والانصراف", "الإجازات", "مسيرات الرواتب والسلف", "الأقسام والورديات"],
    permissions: [
      "إضافة وتعديل بيانات الموظفين وعقودهم",
      "ضبط الورديات، الفروع، وقواعد الحضور والانصراف للشركة بالكامل",
      "معالجة طلبات الإجازات والخصومات لجميع موظفي الشركة",
      "إعداد واعتماد مسيرات الرواتب الشهرية وطلبات السلف",
    ],
  },
  {
    id: "employee",
    title: "موظف (الخدمة الذاتية)",
    badge: "الخدمة الذاتية للموظف",
    tone: "neutral",
    summary: "مخصص للموظفين لمتابعة أعمالهم وخدماتهم الذاتية بدون صلاحيات إدارية.",
    visibleScreens: ["مهامي الشخصية", "تسجيل الحضور (بصمة)", "طلباتي (إجازات وسلف)", "قسائم رواتبي"],
    permissions: [
      "تسجيل بصمة الدخول والخروج الجغرافية (GPS) المعتمدة",
      "استعراض المهام المسندة ورفع تقارير الإنجاز والمرفقات",
      "تقديم طلبات الإجازات والسلف ومتابعة حالتها",
      "استعراض قسائم الراتب الشخصية فقط (دون رؤية بيانات زملائه)",
    ],
  },
];

export function UsersManager({ employees, canManage }: UsersManagerProps) {
  const tRoles = useTranslations("roles");
  const tCommon = useTranslations("common");
  const uiLocale = useLocale();
  const searchParams = useSearchParams();

  const [state, action, pending] = useActionState<UserAccountState, FormData>(createUserAccount, undefined);
  const [selectedEmpId, setSelectedEmpId] = useState<string>("");
  const [selectedRole, setSelectedRole] = useState<"admin" | "manager" | "hr" | "employee">("employee");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const employeesWithoutAccount = employees.filter((e) => !e.hasUserAccount);
  const selectedEmp = employees.find((e) => e.id === selectedEmpId);

  const openForEmployee = (empId: string) => {
    const target = employees.find((e) => e.id === empId);
    setSelectedEmpId(empId);
    if (target?.role && target.role !== "owner") {
      setSelectedRole(target.role);
    } else {
      setSelectedRole("employee");
    }
    setPassword(suggestPassword());
    setShowPassword(true);
    setIsOpen(true);
  };

  const handleSelectEmployee = (empId: string) => {
    setSelectedEmpId(empId);
    const target = employees.find((e) => e.id === empId);
    if (target?.role && target.role !== "owner") {
      setSelectedRole(target.role);
    }
  };

  // Automatically open dialog if employeeId is passed via URL query param
  useEffect(() => {
    const queryEmpId = searchParams.get("employeeId") || searchParams.get("createFor");
    if (queryEmpId && employees.some((e) => e.id === queryEmpId)) {
      openForEmployee(queryEmpId);
    }
  }, [searchParams, employees]);

  // Close dialog smoothly after successful save
  useEffect(() => {
    if (state?.ok) {
      const timer = setTimeout(() => {
        setIsOpen(false);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [state?.ok]);

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
              const firstId = employeesWithoutAccount[0]?.id ?? "";
              openForEmployee(firstId);
            }}
            className="shrink-0"
          >
            <UserPlus className="size-4" aria-hidden />
            إنشاء حساب لموظف
          </Button>
        )}
      </div>

      {/* Account Creation / Edit Modal Dialog */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-3xl max-h-[88vh] p-0 gap-0 overflow-hidden rounded-2xl flex flex-col shadow-2xl border border-line bg-surface">
          {/* Fixed Header */}
          <div className="shrink-0 px-6 py-5 border-b border-line bg-surface">
            <DialogHeader className="pe-8">
              <div className="flex items-center gap-2">
                <KeyRound className="size-5 text-indigo" aria-hidden />
                <DialogTitle className="text-lg font-bold text-ink">
                  {selectedEmp?.hasUserAccount ? "تحديث حساب الدخول والصلاحية" : "إنشاء حساب دخول جديد"}
                </DialogTitle>
              </div>
              <DialogDescription className="text-caption text-secondary mt-1">
                قم بتعيين الصلاحية وكلمة المرور للموظف لتفعيل إمكانية تسجيل دخوله للنظام.
              </DialogDescription>
            </DialogHeader>
          </div>

          {/* Form wrapping Scrollable Body and Fixed Footer */}
          <form action={action} className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <input type="hidden" name="uiLocale" value={uiLocale} />
            <input type="hidden" name="employeeId" value={selectedEmpId} />
            <input type="hidden" name="role" value={selectedRole} />

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              {/* Employee Summary Card */}
              {selectedEmp && (
                <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-card bg-paper border border-line">
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-ink">{selectedEmp.name}</span>
                      {selectedEmp.employeeNumber && (
                        <span className="font-mono text-2xs px-2 py-0.5 rounded bg-surface border border-line font-medium text-secondary">
                          {selectedEmp.employeeNumber}
                        </span>
                      )}
                    </div>
                    <span className="text-caption text-secondary">
                      هوية: {selectedEmp.nationalId} {selectedEmp.jobTitle && `· ${selectedEmp.jobTitle}`} {selectedEmp.departmentName && `(${selectedEmp.departmentName})`}
                    </span>
                  </div>
                  <StatusPill tone={selectedEmp.hasUserAccount ? "stamp" : "neutral"}>
                    {selectedEmp.hasUserAccount ? "حساب مفعل حالياً" : "بدون حساب دخول"}
                  </StatusPill>
                </div>
              )}

              {/* Target Employee selector */}
              <div>
                <SelectField
                  name="employeeSelect"
                  label="الموظف المستهدف"
                  value={selectedEmpId}
                  onChange={(e) => handleSelectEmployee(e.target.value)}
                  options={employees
                    .filter((e) => e.role !== "owner")
                    .map((e) => ({
                      value: e.id,
                      label: `${e.name} (${e.nationalId}) — ${e.hasUserAccount ? "لديه حساب (" + tRoles(e.role) + ")" : "بدون حساب"}`,
                    }))}
                />
              </div>

              {/* Categorized Role Selection */}
              <div className="flex flex-col gap-2.5">
                <span className="text-label font-medium text-ink">
                  الدور والصلاحية في النظام
                </span>

                <div className="grid gap-3 sm:grid-cols-2">
                  {ROLE_DEFINITIONS.map((r) => {
                    const isSelected = selectedRole === r.id;
                    return (
                      <div
                        key={r.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedRole(r.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedRole(r.id);
                          }
                        }}
                        className={cn(
                          "flex flex-col justify-between gap-3 p-4 rounded-card border-2 cursor-pointer transition-all select-none text-start",
                          isSelected
                            ? "border-indigo bg-indigo/5 shadow-sm ring-1 ring-indigo/30"
                            : "border-line bg-surface hover:border-line-hover hover:bg-paper/40",
                          "focus-visible:outline-2 focus-visible:outline-indigo"
                        )}
                      >
                        <div className="flex flex-col gap-2">
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-semibold text-sm text-ink leading-tight">
                              {r.title}
                            </span>
                            <div
                              className={cn(
                                "size-4 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5",
                                isSelected
                                  ? "border-indigo bg-indigo text-white"
                                  : "border-line bg-surface"
                              )}
                            >
                              {isSelected && <div className="size-1.5 rounded-full bg-white" />}
                            </div>
                          </div>

                          <StatusPill tone={r.tone}>{r.badge}</StatusPill>

                          <p className="text-caption text-secondary leading-normal">
                            {r.summary}
                          </p>
                        </div>

                        <div className="flex flex-col gap-2 border-t border-line/60 pt-2 text-caption">
                          <div>
                            <span className="font-semibold text-ink-soft text-2xs block mb-1">
                              ما سيظهر له في القائمة:
                            </span>
                            <div className="flex flex-wrap gap-1">
                              {r.visibleScreens.map((s) => (
                                <span
                                  key={s}
                                  className="inline-block px-1.5 py-0.5 rounded-[4px] bg-paper text-ink text-2xs border border-line"
                                >
                                  {s}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Language Selector */}
              <SelectField
                name="locale"
                label="لغة الواجهة الافتراضية"
                defaultValue={selectedEmp?.locale || "ar"}
                options={[
                  { value: "ar", label: "العربية" },
                  { value: "en", label: "English" },
                ]}
              />

              {/* Password Input with perfectly separated eye button and clear padding */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="user-password-input" className="text-label font-medium text-ink">
                  كلمة المرور الجديدة <span className="text-brick">*</span>
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      id="user-password-input"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="off"
                      className="flex h-11 w-full rounded-control border border-input bg-surface text-base text-ink outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 font-mono"
                      style={{
                        direction: "ltr",
                        textAlign: "left",
                        paddingLeft: "14px",
                        paddingRight: "44px",
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((p) => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary hover:text-ink flex items-center justify-center size-7 rounded-md hover:bg-paper transition-colors"
                      tabIndex={-1}
                      aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setPassword(suggestPassword());
                      setShowPassword(true);
                    }}
                    className="shrink-0"
                  >
                    <Sparkles className="size-4" aria-hidden />
                    توليد كلمة مرور
                  </Button>
                </div>
                <p className="text-caption text-secondary">
                  8 خانات على الأقل. أبلغ الموظف بها بعد الحفظ.
                </p>
              </div>
            </div>

            {/* Fixed Footer (always visible!) */}
            <div className="shrink-0 px-6 py-4 border-t border-line bg-paper/60 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Button type="submit" disabled={pending} className="min-w-36">
                  {pending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                      {tCommon("saving")}
                    </>
                  ) : selectedEmp?.hasUserAccount ? (
                    "تحديث الحساب"
                  ) : (
                    "حفظ وتفعيل الحساب"
                  )}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setIsOpen(false)}>
                  {tCommon("cancel")}
                </Button>
              </div>

              {state?.ok && (
                <p role="status" className="inline-flex items-center gap-1.5 text-label text-stamp font-medium">
                  <CheckCircle2 className="size-4" aria-hidden />
                  تم حفظ وتفعيل بيانات الحساب بنجاح!
                </p>
              )}
              {state && !state.ok && (
                <p role="alert" className="inline-flex items-center gap-1.5 text-label text-brick font-medium">
                  <ShieldAlert className="size-4" aria-hidden />
                  حدث خطأ أثناء حفظ الحساب، تأكد من صحة البيانات.
                </p>
              )}
            </div>
          </form>
        </DialogContent>
      </Dialog>

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
