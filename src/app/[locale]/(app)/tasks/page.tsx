import { Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { TaskCard, type TaskRow } from "@/components/tasks/task-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireMember } from "@/lib/auth/account";
import { loadNames } from "@/lib/task-data";
import { dueGroup, type DueGroup, type Priority, type TaskStatus } from "@/lib/tasks";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

const FILTERS = ["open", "review", "mine", "all"] as const;
type Filter = (typeof FILTERS)[number];
const GROUP_ORDER: DueGroup[] = ["overdue", "today", "tomorrow", "later", "done"];
const cleanSearch = (q: string) => q.replace(/[,()*%\\:"'.]/g, " ").trim().slice(0, 60);

export default async function TasksPage({ params, searchParams }: PageProps<"/[locale]/tasks">) {
  const locale = (await params).locale as Locale;
  const member = await requireMember(locale);
  const t = await getTranslations({ locale, namespace: "tasks" });
  const sp = await searchParams;
  const manages = member.role === "owner" || member.role === "manager";
  const filters = manages ? FILTERS : (["open", "all"] as const);
  const filter: Filter = (filters as readonly string[]).includes(String(sp.status)) ? (sp.status as Filter) : "open";
  const q = cleanSearch(typeof sp.q === "string" ? sp.q : "");

  // RLS decides the rows: an employee's own tasks; an owner everything; a manager their team's.
  const supabase = await createClient();
  let query = supabase
    .from("tasks")
    .select("id, title, status, priority, due_date, due_time, assignee_id")
    .order("due_date", { ascending: true })
    .limit(300);
  if (filter === "open") query = query.neq("status", "approved");
  if (filter === "review") query = query.eq("status", "submitted");
  if (filter === "mine") query = query.eq("assignee_id", member.employee_id);
  if (q) query = query.ilike("title", `%${q}%`);
  const { data, error } = await query;
  if (error) throw new Error("tasks query failed");

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

  const groups = GROUP_ORDER.map((g) => ({ group: g, items: rows.filter((r) => dueGroup(r.status, r.dueDate) === g) })).filter((g) => g.items.length > 0);
  const title = manages ? t("title") : t("myTitle");
  const filterHref = (f: Filter) => ({ pathname: "/tasks", query: { ...(q ? { q } : {}), ...(f !== "open" ? { status: f } : {}) } });

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

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <form role="search" className="flex w-full max-w-xl gap-2">
          {filter !== "open" && <input type="hidden" name="status" value={filter} />}
          <Input name="q" type="search" defaultValue={q} placeholder={t("search")} aria-label={t("search")} />
          <Button type="submit" variant="outline">
            {t("searchSubmit")}
          </Button>
        </form>
        <nav aria-label={t("filter.label")} className="flex gap-1 overflow-x-auto rounded-control border border-line bg-surface p-1">
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

      {rows.length === 0 ? (
        <div className="flex flex-col items-start gap-4 rounded-card border border-dashed border-line bg-surface p-6">
          <p>{q || filter !== "open" ? t("noResults") : manages ? t("empty") : t("emptyMine")}</p>
          {manages && !q && filter === "open" && (
            <Button asChild variant="outline">
              <Link href="/tasks/new">{t("add")}</Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map(({ group, items }) => (
            <section key={group} aria-labelledby={`g-${group}`} className="flex flex-col gap-3">
              <h2 id={`g-${group}`} className={cn("text-label", group === "overdue" ? "text-brick" : "text-ink-soft")}>
                {t(`groups.${group}`)} <span className="tabular-nums">({items.length})</span>
              </h2>
              <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                {items.map((task) => (
                  <li key={task.id}>
                    <TaskCard task={task} locale={locale} showAssignee={manages} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
