import { CheckCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { markNotificationsRead } from "@/actions/tasks";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireMember } from "@/lib/auth/account";
import { formatDateTime } from "@/lib/format";
import { loadNames } from "@/lib/task-data";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

const TYPES = ["task_assigned", "task_submitted", "task_approved", "task_changes_requested"] as const;
type NotificationType = (typeof TYPES)[number];

export default async function NotificationsPage({ params }: PageProps<"/[locale]/notifications">) {
  const locale = (await params).locale as Locale;
  await requireMember(locale);
  const t = await getTranslations({ locale, namespace: "notifications" });

  // Only the caller's own notifications come back (RLS: recipient = me).
  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .select("id, type, task_id, actor_id, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  const items = data ?? [];
  const taskIds = [...new Set(items.map((n) => n.task_id).filter((i): i is string => !!i))];
  const [names, { data: tasks }] = await Promise.all([
    loadNames(locale, items.map((n) => n.actor_id)),
    taskIds.length ? supabase.from("tasks").select("id, title").in("id", taskIds) : Promise.resolve({ data: [] as { id: string; title: string }[] }),
  ]);
  const titles = new Map((tasks ?? []).map((x) => [x.id, x.title]));
  const unread = items.filter((n) => !n.read_at).length;

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-page">{t("title")}</h1>
          {unread > 0 && <p className="text-secondary">{t("unread", { count: unread })}</p>}
        </div>
        {unread > 0 && (
          <form action={markNotificationsRead}>
            <input type="hidden" name="uiLocale" value={locale} />
            <Button type="submit" variant="outline">
              <CheckCheck aria-hidden />
              {t("markAll")}
            </Button>
          </form>
        )}
      </div>

      {items.length === 0 ? (
        <p className="rounded-card border border-dashed border-line bg-surface p-6 text-secondary">{t("empty")}</p>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {items.map((n) => {
            const known = (TYPES as readonly string[]).includes(n.type);
            const text = known
              ? t(`types.${n.type as NotificationType}`, { actor: names.get(n.actor_id ?? "") ?? "—", title: titles.get(n.task_id ?? "") ?? "—" })
              : n.type;
            return (
              <li key={n.id}>
                <Link
                  href={n.task_id ? `/tasks/${n.task_id}` : "/"}
                  className={cn(
                    "relative flex flex-col gap-1 rounded-card border bg-surface p-4 ps-5 hover:border-indigo focus-visible:outline-2 focus-visible:outline-indigo",
                    n.read_at ? "border-line" : "border-indigo/40",
                  )}
                >
                  {!n.read_at && <span aria-hidden className="absolute inset-y-0 start-0 w-1.5 bg-indigo" />}
                  <span className={cn(!n.read_at && "font-semibold")}>{text}</span>
                  <span className="text-secondary tabular-nums">{formatDateTime(locale, n.created_at)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
