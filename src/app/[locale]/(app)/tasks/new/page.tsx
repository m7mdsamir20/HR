import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { createTask } from "@/actions/tasks";
import { TaskForm } from "@/components/tasks/task-form";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireMember } from "@/lib/auth/account";
import { todayInRiyadh } from "@/lib/format";
import { assigneeOptions } from "@/lib/task-data";

export default async function NewTaskPage({ params }: PageProps<"/[locale]/tasks/new">) {
  const locale = (await params).locale as Locale;
  const member = await requireMember(locale, ["owner", "admin", "manager"]);
  const t = await getTranslations({ locale, namespace: "tasks" });
  const assignees = await assigneeOptions(locale, member.employee_id);

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/tasks" className="inline-flex min-h-11 w-fit items-center gap-2 text-label text-ink-soft hover:text-ink">
          <ArrowRight className="size-4 ltr:-scale-x-100" aria-hidden />
          {t("detail.back")}
        </Link>
        <h1 className="text-page">{t("add")}</h1>
      </div>
      <TaskForm mode="create" action={createTask} assignees={assignees} minDate={todayInRiyadh()} defaults={{ priority: "medium", dueDate: todayInRiyadh() }} />
    </main>
  );
}
