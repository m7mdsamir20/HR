import { Calendar, Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { StatusPill } from "@/components/status-pill";
import { TaskCard, type TaskRow } from "@/components/tasks/task-card";
import { TaskDateFilter } from "@/components/tasks/task-date-filter";
import { TaskEmployeeFilter, type EmployeeOption } from "@/components/tasks/task-employee-filter";
import { TaskSearchInput } from "@/components/tasks/task-search-input";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireMember } from "@/lib/auth/account";
import { addDays, daysBetween, formatDayFull, todayInRiyadh } from "@/lib/format";
import { loadNames } from "@/lib/task-data";
import { isOverdue, type Priority, type TaskStatus } from "@/lib/tasks";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

const FILTERS = ["all", "open", "review", "mine"] as const;
type Filter = (typeof FILTERS)[number];
const cleanSearch = (q: string) => q.replace(/[,()*%\\:"'.]/g, " ").trim().slice(0, 60);

export default async function TasksPage({ params, searchParams }: PageProps<"/[locale]/tasks">) {
  const locale = (await params).locale as Locale;
  const member = await requireMember(locale);
  const t = await getTranslations({ locale, namespace: "tasks" });
  const sp = await searchParams;
  const isLeader = member.role === "owner" || member.role === "admin";
  const manages = isLeader || member.role === "manager" || member.role === "hr";
  const filters = manages ? FILTERS : (["all", "open"] as const);
  const filter: Filter = (filters as readonly string[]).includes(String(sp.status)) ? (sp.status as Filter) : "all";
  const q = cleanSearch(typeof sp.q === "string" ? sp.q : "");
  const dateParam = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : "";
  const employeeParam = typeof sp.employee === "string" && sp.employee ? sp.employee : "";

  const today = todayInRiyadh();
  const tomorrow = addDays(today, 1);

  // RLS decides the rows: an employee's own tasks; an owner everything; a manager their team's.
  const supabase = await createClient();

  const [tasksRes, employeesRes] = await Promise.all([
    (() => {
      let query = supabase
        .from("tasks")
        .select("id, title, status, priority, due_date, due_time, assignee_id")
        .order("due_date", { ascending: true })
        .limit(300);
      if (filter === "open") query = query.neq("status", "approved");
      if (filter === "review") query = query.eq("status", "submitted");
      if (employeeParam) {
        query = query.eq("assignee_id", employeeParam);
      } else if (filter === "mine") {
        query = query.eq("assignee_id", member.employee_id);
      }
      if (q) query = query.ilike("title", `%${q}%`);
      if (dateParam) query = query.eq("due_date", dateParam);
      return query;
    })(),
    manages
      ? supabase
          .from("employees")
          .select("id, full_name_ar, full_name_en, job_title")
          .eq("status", "active")
          .order("full_name_ar")
      : Promise.resolve({ data: [] }),
  ]);

  const { data, error } = tasksRes;
  if (error) throw new Error("tasks query failed");

  const employeeOptions: EmployeeOption[] = (employeesRes.data ?? []).map((e) => ({
    id: e.id,
    name: (locale === "en" && e.full_name_en) || e.full_name_ar,
    jobTitle: e.job_title ?? null,
  }));

  const names = await loadNames(locale, data.map((r) => r.assignee_id));
  const rows: TaskRow[] = data.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status as TaskStatus,
    priority: r.priority as Priority,
    dueDate: r.due_date,
    dueTime: r.due_time,
    assignee: names.get(r.assignee_id) ?? null,
  }));

  // Group tasks by their actual due date
  const dateMap = new Map<string, TaskRow[]>();
  const noDueDateTasks: TaskRow[] = [];

  for (const r of rows) {
    if (r.dueDate) {
      const list = dateMap.get(r.dueDate) ?? [];
      list.push(r);
      dateMap.set(r.dueDate, list);
    } else {
      noDueDateTasks.push(r);
    }
  }

  const sortedDates = Array.from(dateMap.keys()).sort();
  const title = manages ? t("title") : t("myTitle");
  const filterHref = (f: Filter) => ({
    pathname: "/tasks",
    query: {
      ...(q ? { q } : {}),
      ...(dateParam ? { date: dateParam } : {}),
      ...(employeeParam ? { employee: employeeParam } : {}),
      ...(f !== "all" ? { status: f } : {}),
    },
  });

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-page">{title}</h1>
        {manages && (
          <Button asChild>
            <Link href="/tasks/new">
              <Plus aria-hidden />
              {t("add")}
            </Link>
          </Button>
        )}
      </div>

      {/* Top Search bar extending to the filter nav */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex-1 min-w-0">
          <TaskSearchInput placeholder={t("search")} />
        </div>
        <nav aria-label={t("filter.label")} className="shrink-0 flex gap-1 overflow-x-auto rounded-control border border-line bg-surface p-1">
          {filters.map((f) => (
            <Link
              key={f}
              href={filterHref(f)}
              aria-current={filter === f ? "page" : undefined}
              className={cn(
                "flex min-h-9 items-center rounded-[6px] px-3 text-label whitespace-nowrap text-ink-soft hover:text-ink",
                filter === f && "bg-indigo/10 font-semibold text-indigo",
              )}
            >
              {t(`filter.${f}`)}
            </Link>
          ))}
        </nav>
      </div>

      {/* Date & Employee Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <div className="flex flex-wrap items-center gap-3">
          <TaskDateFilter
            todayStr={today}
            tomorrowStr={tomorrow}
            labels={{
              all: t("dateFilter.all"),
              today: t("dateFilter.today"),
              tomorrow: t("dateFilter.tomorrow"),
              pickDate: t("dateFilter.pickDate"),
              clear: t("dateFilter.clear"),
            }}
          />

          {manages && employeeOptions.length > 0 && (
            <TaskEmployeeFilter
              employees={employeeOptions}
              labels={{
                all: t("employeeFilter.all"),
                label: t("employeeFilter.label"),
                clear: t("employeeFilter.clear"),
              }}
            />
          )}
        </div>

        {dateParam && (
          <div className="flex items-center gap-2 text-label text-indigo bg-indigo/10 px-3 py-1.5 rounded-[6px]">
            <Calendar className="size-4" aria-hidden />
            <span>{t("dateFilter.showingDate", { date: formatDayFull(locale, dateParam) })}</span>
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-start gap-4 rounded-card border border-dashed border-line bg-surface p-6">
          <p>{q || dateParam || employeeParam || filter !== "all" ? t("noResults") : manages ? t("empty") : t("emptyMine")}</p>
          {manages && !q && !dateParam && !employeeParam && filter === "all" && (
            <Button asChild variant="outline">
              <Link href="/tasks/new">{t("add")}</Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {sortedDates.map((dateStr) => {
            const items = dateMap.get(dateStr)!;
            const isDateToday = dateStr === today;
            const daysDiff = daysBetween(today, dateStr);
            const isDateTomorrow = daysDiff === 1;
            const hasOverdue = items.some((it) => isOverdue(it.status, it.dueDate, today));

            return (
              <section key={dateStr} aria-labelledby={`date-${dateStr}`} className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="flex size-7 items-center justify-center rounded-[6px] bg-paper text-ink-soft">
                    <Calendar className="size-4" aria-hidden />
                  </div>
                  <h2 id={`date-${dateStr}`} className="text-card font-semibold text-ink">
                    {formatDayFull(locale, dateStr)}
                  </h2>
                  {isDateToday && <StatusPill tone="stamp">{t("dateFilter.today")}</StatusPill>}
                  {isDateTomorrow && <StatusPill tone="indigo">{t("dateFilter.tomorrow")}</StatusPill>}
                  {hasOverdue && !isDateToday && <StatusPill tone="brick">{t("overdue")}</StatusPill>}
                  <span className="text-caption text-secondary">
                    ({t("tasksCount", { count: items.length })})
                  </span>
                </div>
                <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                  {items.map((task) => (
                    <li key={task.id}>
                      <TaskCard task={task} locale={locale} showAssignee={manages} />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}

          {noDueDateTasks.length > 0 && (
            <section aria-labelledby="date-none" className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <h2 id="date-none" className="text-card font-semibold text-secondary">
                  {t("noDueDate")}
                </h2>
                <span className="text-caption text-secondary">
                  ({t("tasksCount", { count: noDueDateTasks.length })})
                </span>
              </div>
              <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                {noDueDateTasks.map((task) => (
                  <li key={task.id}>
                    <TaskCard task={task} locale={locale} showAssignee={manages} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </main>
  );
}
