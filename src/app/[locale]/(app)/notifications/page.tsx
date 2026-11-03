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
  const tDocs = await getTranslations({ locale, namespace: "documents" });

  // Only the caller's own notifications come back (RLS: recipient = me).
  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .select("id, type, task_id, actor_id, document_id, days_left, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  const items = data ?? [];
  const taskIds = [...new Set(items.map((n) => n.task_id).filter((i): i is string => !!i))];
  const documentIds = [...new Set(items.map((n) => n.document_id).filter((i): i is string => !!i))];
  const [{ data: tasks }, { data: docs }] = await Promise.all([
    taskIds.length ? supabase.from("tasks").select("id, title").in("id", taskIds) : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    documentIds.length
      ? supabase.from("employee_documents").select("id, doc_type, employee_id").in("id", documentIds)
      : Promise.resolve({ data: [] as { id: string; doc_type: string; employee_id: string }[] }),
  ]);
  const names = await loadNames(locale, [...items.map((n) => n.actor_id), ...(docs ?? []).map((d) => d.employee_id)]);
  const titles = new Map((tasks ?? []).map((x) => [x.id, x.title]));
  const documents = new Map((docs ?? []).map((d) => [d.id, d]));
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
            const doc = n.document_id ? documents.get(n.document_id) : undefined;
            let text: string = n.type;
            let href = n.task_id ? `/tasks/${n.task_id}` : "/";
            if (n.type === "document_expiring" && doc && n.days_left !== null) {
              const days = n.days_left;
              const key = days > 0 ? "documentExpiring" : days === 0 ? "documentToday" : "documentExpired";
              text = t(key, { document: tDocs(`types.${doc.doc_type as "iqama"}`), employee: names.get(doc.employee_id) ?? "—", days: Math.abs(days) });
              href = `/employees/${doc.employee_id}`;
            } else if ((TYPES as readonly string[]).includes(n.type)) {
              text = t(`types.${n.type as NotificationType}`, { actor: names.get(n.actor_id ?? "") ?? "—", title: titles.get(n.task_id ?? "") ?? "—" });
            }
            return (
              <li key={n.id}>
                <Link
                  href={href}
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
