import { getTranslations } from "next-intl/server";
import { AttendanceTabs } from "@/components/attendance/attendance-tabs";
import { DeductionDecision } from "@/components/attendance/deduction-decision";
import { MonthNav } from "@/components/attendance/month-nav";
import { StatusPill } from "@/components/status-pill";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireMember } from "@/lib/auth/account";
import { DEDUCTION_STATUSES, deductionTone, monthRange, percent, type DeductionKind, type DeductionStatus } from "@/lib/attendance";
import { monthParam } from "@/lib/attendance-data";
import { formatDayShort, todayInRiyadh } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

const kindTone: Record<DeductionKind, "brick" | "saffron"> = { late: "brick", early_departure: "saffron", absence: "brick" };

export default async function DeductionsPage({ params, searchParams }: PageProps<"/[locale]/attendance/deductions">) {
  const locale = (await params).locale as Locale;
  const member = await requireMember(locale, ["owner", "admin", "hr"]);
  const t = await getTranslations({ locale, namespace: "attendance" });
  const query = await searchParams;
  const month = monthParam(query.month);
  const rawStatus = Array.isArray(query.status) ? query.status[0] : query.status;
  const filter: DeductionStatus | "all" = (DEDUCTION_STATUSES as readonly string[]).includes(rawStatus ?? "") ? (rawStatus as DeductionStatus) : rawStatus === "all" ? "all" : "pending";
  const today = todayInRiyadh();
  const { from, to } = monthRange(month);

  const supabase = await createClient();
  let request = supabase
    .from("attendance_deductions")
    .select("id, employee_id, work_date, kind, minutes, day_fraction, status, note")
    .gte("work_date", from)
    .lte("work_date", to)
    .order("work_date", { ascending: false });
  if (filter !== "all") request = request.eq("status", filter);
  const [{ data: deductions }, { data: employees }] = await Promise.all([
    request,
    supabase.from("employees").select("id, full_name_ar, full_name_en").neq("status", "deleted"),
  ]);
  const names = new Map((employees ?? []).map((e) => [e.id, (locale === "en" && e.full_name_en) || e.full_name_ar]));
  const pickKind = (k: string) => t(`deductions.kind.${k as DeductionKind}`);

  const filters: { key: DeductionStatus | "all"; label: string }[] = [
    { key: "pending", label: t("deductions.status.pending") },
    { key: "approved", label: t("deductions.status.approved") },
    { key: "waived", label: t("deductions.status.waived") },
    { key: "all", label: t("deductions.filterAll") },
  ];

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-page">{t("title")}</h1>
      <AttendanceTabs role={member.role} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-prose text-secondary">{t("deductions.intro")}</p>
        <MonthNav pathname="/attendance/deductions" month={month} query={{ status: filter }} latest={today.slice(0, 7)} />
      </div>

      <nav aria-label={t("deductions.filter")} className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <Link
            key={f.key}
            href={{ pathname: "/attendance/deductions", query: { month, status: f.key } }}
            aria-current={filter === f.key ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center rounded-full border border-line bg-surface px-4 text-label text-ink-soft hover:bg-paper focus-visible:outline-2 focus-visible:outline-indigo",
              filter === f.key && "border-indigo bg-indigo/10 font-semibold text-indigo hover:bg-indigo/10",
            )}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      {(deductions ?? []).length === 0 ? (
        <p className="rounded-card border border-dashed border-line bg-surface p-6 text-secondary">{t("deductions.empty")}</p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {(deductions ?? []).map((d) => (
            <li key={d.id} className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex flex-col">
                  <Link href={{ pathname: "/attendance/sheet", query: { month, employee: d.employee_id } }} className="text-card hover:underline">
                    {names.get(d.employee_id) ?? "—"}
                  </Link>
                  <span className="text-secondary">{formatDayShort(locale, d.work_date)}</span>
                </div>
                <StatusPill tone={deductionTone[d.status as DeductionStatus]}>{t(`deductions.status.${d.status as DeductionStatus}`)}</StatusPill>
              </div>
              <p className="flex flex-wrap items-center gap-2">
                <StatusPill tone={kindTone[d.kind as DeductionKind]}>{pickKind(d.kind)}</StatusPill>
                {d.minutes > 0 && <span className="text-secondary tabular-nums">{t("deductions.minutes", { minutes: d.minutes })}</span>}
              </p>
              <p className="text-secondary">
                {d.day_fraction === 0 ? t("deductions.warning") : t("deductions.amount", { share: percent(Number(d.day_fraction)) })}
              </p>
              {d.note && <p className="text-secondary">{d.note}</p>}
              {d.status === "pending" && <DeductionDecision id={d.id} />}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
