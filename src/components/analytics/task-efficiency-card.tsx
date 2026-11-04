import { Clock, ListChecks, Star } from "lucide-react";
import { StatusPill } from "@/components/status-pill";
import { taskCompletionTone, type TaskKpis } from "@/lib/analytics";

interface TaskEfficiencyCardProps {
  tasks: TaskKpis;
  t: (key: string, values?: Record<string, string | number>) => string;
}

export function TaskEfficiencyCard({ tasks, t }: TaskEfficiencyCardProps) {
  const tone = taskCompletionTone(tasks.completion_rate);
  const total = tasks.total || 1; // avoid / 0

  const pApproved = (tasks.approved / total) * 100;
  const pSubmitted = (tasks.submitted / total) * 100;
  const pInProgress = (tasks.in_progress / total) * 100;
  const pChanges = (tasks.changes_requested / total) * 100;

  return (
    <div className="flex flex-col gap-5 rounded-card border border-line bg-surface p-5 shadow-2xs">
      <div className="flex items-center justify-between gap-3 border-b border-line pb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-control bg-paper text-ink-soft">
            <ListChecks className="size-4.5" aria-hidden />
          </div>
          <div className="flex flex-col">
            <h3 className="font-semibold text-ink">{t("tasksTitle")}</h3>
            <span className="text-caption text-secondary">
              {t("totalTasks")}: <strong className="tabular-nums text-ink">{tasks.total}</strong>
            </span>
          </div>
        </div>

        <StatusPill tone={tone}>
          {tasks.completion_rate}% {t("completionRate")}
        </StatusPill>
      </div>

      {/* Multi-segment Progress Bar */}
      <div className="flex flex-col gap-2">
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-paper">
          <div
            className="h-full bg-stamp transition-all duration-500"
            style={{ width: `${pApproved}%` }}
            title={`${t("approvedTasks")}: ${tasks.approved}`}
          />
          <div
            className="h-full bg-saffron transition-all duration-500"
            style={{ width: `${pSubmitted}%` }}
            title={`${t("pendingReview")}: ${tasks.submitted}`}
          />
          <div
            className="h-full bg-indigo transition-all duration-500"
            style={{ width: `${pInProgress}%` }}
            title={`${t("inProgress")}: ${tasks.in_progress}`}
          />
          <div
            className="h-full bg-brick transition-all duration-500"
            style={{ width: `${pChanges}%` }}
            title={`${t("changesRequested")}: ${tasks.changes_requested}`}
          />
        </div>

        {/* Legend */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-caption text-secondary pt-1">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-stamp" aria-hidden />
            {t("approvedTasks")}: <strong className="tabular-nums text-ink">{tasks.approved}</strong>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-saffron" aria-hidden />
            {t("pendingReview")}: <strong className="tabular-nums text-ink">{tasks.submitted}</strong>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-indigo" aria-hidden />
            {t("inProgress")}: <strong className="tabular-nums text-ink">{tasks.in_progress}</strong>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-brick" aria-hidden />
            {t("overdueTasks")}: <strong className="tabular-nums text-brick">{tasks.overdue}</strong>
          </span>
        </div>
      </div>

      {/* Quality Rating & Hours Footer */}
      <div className="flex items-center justify-between border-t border-line/60 pt-3 text-caption">
        <div className="flex items-center gap-1.5 text-secondary">
          <Star className="size-4 text-saffron fill-saffron" aria-hidden />
          <span>{t("avgRating")}:</span>
          <strong className="text-ink tabular-nums text-sm">{tasks.avg_rating} / 5.0</strong>
        </div>

        <div className="flex items-center gap-1.5 text-secondary">
          <Clock className="size-4 text-ink-soft" aria-hidden />
          <span>{t("hoursLogged")}:</span>
          <strong className="text-ink tabular-nums text-sm">{tasks.hours_spent}</strong>
        </div>
      </div>
    </div>
  );
}

