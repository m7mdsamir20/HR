import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { createEmployee } from "@/actions/employees";
import { EmployeeForm } from "@/components/employees/employee-form";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireMember } from "@/lib/auth/account";
import { assignableRoles } from "@/lib/auth/permissions";
import { employeeFormOptions } from "@/lib/employees";

export default async function NewEmployeePage({ params }: PageProps<"/[locale]/employees/new">) {
  const locale = (await params).locale as Locale;
  const member = await requireMember(locale, ["owner", "hr"]);
  const t = await getTranslations({ locale, namespace: "employees" });
  const { departments, managers } = await employeeFormOptions(locale);

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/employees" className="inline-flex min-h-11 w-fit items-center gap-2 text-label text-ink-soft hover:text-ink">
          <ArrowRight className="size-4 ltr:-scale-x-100" aria-hidden />
          {t("detail.back")}
        </Link>
        <h1 className="text-page">{t("add")}</h1>
      </div>
      <EmployeeForm
        mode="create"
        action={createEmployee}
        roles={assignableRoles(member.role)}
        departments={departments}
        managers={managers}
        defaults={{ locale }}
      />
    </main>
  );
}
