import { getTranslations } from "next-intl/server";
import { StatusPill } from "@/components/status-pill";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { formatDate } from "@/lib/format";
import { isOverdue, statusBar, statusTone, type Priority, type TaskStatus } from "@/lib/tasks";
import { cn } from "@/lib/utils";

export type TaskRow = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: Priority;
  dueDate: string;
  dueTime: string | null;
  assignee: string | null;
};

/** A task as a card: the side bar carries the status colour (CLAUDE.md §6 layout). */
export async function TaskCard({ task, locale, showAssignee }: { task: TaskRow; locale: Locale; showAssignee: boolean }) {
  const t = await getTranslations({ locale, namespace: "tasks" });
  const overdue = isOverdue(task.status, task.dueDate);

  return (
    <Link
      href={`/tasks/${task.id}`}
      className="relative flex flex-col gap-1.5 overflow-hidden rounded-card border border-line bg-surface p-4 ps-5 hover:border-indigo focus-visible:outline-2 focus-visible:outline-indigo"
    >
      <span aria-hidden className={cn("absolute inset-y-0 start-0 w-1.5", statusBar[task.status])} />
      <span className="flex items-start justify-between gap-3">
        <span className="font-semibold">{task.title}</span>
        <StatusPill tone={statusTone[task.status]}>{t(`status.${task.status}`)}</StatusPill>
      </span>
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-secondary">
        <span className={cn("tabular-nums", overdue && "font-semibold text-brick")}>
          {overdue && `${t("overdue")} · `}
          {formatDate(locale, task.dueDate)}
          {task.dueTime && ` · ${t("dueAt", { time: task.dueTime.slice(0, 5) })}`}
        </span>
        <span>{t(`priority.${task.priority}`)}</span>
        {showAssignee && task.assignee && <span>{task.assignee}</span>}
      </span>
    </Link>
  );
}
