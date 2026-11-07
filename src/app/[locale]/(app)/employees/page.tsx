import { Eye, Pencil, Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { EmployeeSearchInput } from "@/components/employees/employee-search-input";
import { StatusPill, type Tone } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireMember } from "@/lib/auth/account";
import { normalizeNationalId } from "@/lib/auth/national-id";
import { managesPeople } from "@/lib/auth/permissions";
import { localName } from "@/lib/employees";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

const FILTERS = ["active", "disabled", "terminated", "all"] as const;
type Filter = (typeof FILTERS)[number];
const cleanSearch = (q: string) => q.replace(/[,()*%\\:"'.]/g, " ").trim().slice(0, 60);

type IqamaInfo = {
  isCitizen: boolean;
  iqamaEnd: string | null;
  daysRemaining: number | null;
  badgeText: string;
  tone: "brick" | "stamp" | "neutral";
};

function getIqamaInfo(
  idType: string,
  iqamaEnd: string | null,
  locale: Locale,
): IqamaInfo {
  // If Saudi citizen
  if (idType === "citizen" && !iqamaEnd) {
    return {
      isCitizen: true,
      iqamaEnd: null,
      daysRemaining: null,
      badgeText: locale === "ar" ? "مواطن" : "Citizen",
      tone: "neutral",
    };
  }

  if (!iqamaEnd) {
    return {
      isCitizen: false,
      iqamaEnd: null,
      daysRemaining: null,
      badgeText: locale === "ar" ? "غير مسجل" : "Not set",
      tone: "neutral",
    };
  }

  // Calculate days remaining using UTC dates
  const parts = iqamaEnd.split("-").map((v) => parseInt(v, 10));
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  if (y === undefined || m === undefined || d === undefined || isNaN(y) || isNaN(m) || isNaN(d)) {
    return {
      isCitizen: false,
      iqamaEnd,
      daysRemaining: null,
      badgeText: locale === "ar" ? "غير مسجل" : "Not set",
      tone: "neutral",
    };
  }
  const expiryUtc = Date.UTC(y, m - 1, d);
  const now = new Date();
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((expiryUtc - todayUtc) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    const abs = Math.abs(diffDays);
    return {
      isCitizen: false,
      iqamaEnd,
      daysRemaining: diffDays,
      badgeText: locale === "ar" ? `منتهية (منذ ${abs} يوم)` : `Expired (${abs}d ago)`,
      tone: "brick",
    };
  }

  if (diffDays === 0) {
    return {
      isCitizen: false,
      iqamaEnd,
      daysRemaining: 0,
      badgeText: locale === "ar" ? "تنتهي اليوم" : "Expires today",
      tone: "brick",
    };
  }

  // Near expiry: within 60 days -> RED, showing remaining days
  if (diffDays <= 60) {
    return {
      isCitizen: false,
      iqamaEnd,
      daysRemaining: diffDays,
      badgeText: locale === "ar" ? `متبقي ${diffDays} يوم على انتهاء الإقامة` : `${diffDays} days left until expiry`,
      tone: "brick",
    };
  }

  // Valid (> 60 days)
  return {
    isCitizen: false,
    iqamaEnd,
    daysRemaining: diffDays,
    badgeText: locale === "ar" ? `سارية (متبقي ${diffDays} يوم)` : `Valid (${diffDays}d)`,
    tone: "stamp",
  };
}

export default async function EmployeesPage({ params, searchParams }: PageProps<"/[locale]/employees">) {
  const locale = (await params).locale as Locale;
  const member = await requireMember(locale, ["owner", "admin", "hr", "manager"]);
  const t = await getTranslations({ locale, namespace: "employees" });
  const sp = await searchParams;
  const q = cleanSearch(typeof sp.q === "string" ? sp.q : "");
  const filter: Filter = FILTERS.includes(sp.status as Filter) ? (sp.status as Filter) : "active";
  const canAdd = managesPeople(member.role);

  // RLS decides the rows: the whole company for owner/HR, self + direct reports for a manager.
  const supabase = await createClient();
  let query = supabase
    .from("employees")
    .select(
      "id, full_name_ar, full_name_en, national_id, employee_number, role, status, job_title, id_type, iqama_end, iqama_start",
    )
    .neq("status", "deleted")
    .not("role", "in", '("owner","admin")')
    .order("employee_number", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(500);
  if (filter !== "all") query = query.eq("status", filter);
  if (q) {
    const digits = normalizeNationalId(q);
    query = /^\d+$/.test(digits)
      ? query.or(`national_id.like.${digits}*,employee_number.ilike.*${q}*`)
      : query.or(`full_name_ar.ilike.*${q}*,full_name_en.ilike.*${q}*,employee_number.ilike.*${q}*,job_title.ilike.*${q}*`);
  }
  const { data, error } = await query;
  if (error) throw new Error("employees query failed");

  const rows = data.map((e) => {
    return {
      id: e.id,
      code: e.employee_number || "—",
      name: localName(locale, e.full_name_ar, e.full_name_en),
      nationalId: e.national_id,
      jobTitle: e.job_title || "—",
      idType: e.id_type,
      iqamaEnd: e.iqama_end,
      status: e.status as "active" | "disabled" | "terminated",
    };
  });

  // Sort employees by code from smallest to largest (numeric / natural sort)
  rows.sort((a, b) => {
    const aHas = a.code && a.code !== "—";
    const bHas = b.code && b.code !== "—";
    if (!aHas && !bHas) return 0;
    if (!aHas) return 1;
    if (!bHas) return -1;
    return a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: "base" });
  });
  const title = member.role === "manager" ? t("teamTitle") : t("title");
  const filterHref = (f: Filter) => ({ pathname: "/employees", query: { ...(q ? { q } : {}), ...(f !== "active" ? { status: f } : {}) } });

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-page">{title}</h1>
        {canAdd && (
          <Button asChild>
            <Link href="/employees/new">
              <Plus aria-hidden />
              {t("add")}
            </Link>
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex-1 min-w-0">
          <EmployeeSearchInput placeholder={t("search")} />
        </div>
        <nav aria-label={t("filter.label")} className="shrink-0 flex gap-1 rounded-control border border-line bg-surface p-1">
          {FILTERS.map((f) => (
            <Link
              key={f}
              href={filterHref(f)}
              aria-current={filter === f ? "page" : undefined}
              className={cn(
                "flex min-h-9 items-center rounded-[6px] px-3 text-label text-ink-soft hover:text-ink",
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
          <p>{q || filter !== "active" ? t("noResults") : member.role === "manager" ? t("emptyTeam") : t("empty")}</p>
          {canAdd && !q && filter === "active" && (
            <Button asChild variant="outline">
              <Link href="/employees/new">{t("add")}</Link>
            </Button>
          )}
        </div>
      ) : (
        <>
          <p className="text-secondary">{t("count", { count: rows.length })}</p>
          <ul className="flex flex-col gap-2 md:hidden">
            {rows.map((r) => {
              const tone: Tone = r.status === "active" ? "stamp" : r.status === "disabled" ? "brick" : "saffron";
              const iqama = getIqamaInfo(r.idType, r.iqamaEnd, locale);
              return (
                <li key={r.id}>
                  <div className="flex flex-col gap-2.5 rounded-card border border-line bg-surface p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-ink">{r.name}</span>
                        {r.code !== "—" && (
                          <span className="font-mono text-2xs font-semibold px-1.5 py-0.5 rounded-[4px] bg-paper text-ink border border-line">
                            {r.code}
                          </span>
                        )}
                      </div>
                      <StatusPill tone={tone}>{t(`status.${r.status}`)}</StatusPill>
                    </div>

                    <div className="flex items-center justify-between text-caption text-secondary">
                      <span className="font-medium text-ink">{r.jobTitle}</span>
                      <bdi dir="ltr" className="tabular-nums font-mono">{r.nationalId}</bdi>
                    </div>

                    <div className="flex items-center justify-between gap-2 border-t border-line/40 pt-2 text-caption">
                      <span className="text-secondary">{t("columns.iqama")}:</span>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold",
                            iqama.tone === "brick" &&
                              "bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-900",
                            iqama.tone === "stamp" &&
                              "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900",
                            iqama.tone === "neutral" && "bg-paper text-secondary border border-line",
                          )}
                        >
                          {iqama.tone === "brick" && (
                            <span className="size-1.5 rounded-full bg-rose-600 dark:bg-rose-400 animate-pulse" aria-hidden />
                          )}
                          {iqama.badgeText}
                        </span>
                        {iqama.iqamaEnd && (
                          <span className="text-2xs font-mono text-secondary tabular-nums" dir="ltr">
                            ({iqama.iqamaEnd})
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 border-t border-line/60 pt-2.5">
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/employees/${r.id}`}>
                          <Eye className="size-3.5" aria-hidden />
                          {t("actions.view")}
                        </Link>
                      </Button>
                      {canAdd && (
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/employees/${r.id}/edit`}>
                            <Pencil className="size-3.5" aria-hidden />
                            {t("actions.edit")}
                          </Link>
                        </Button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="hidden overflow-hidden rounded-card border border-line bg-surface md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  {(["code", "name", "nationalId", "jobTitle", "iqama", "status", "actions"] as const).map((c) => (
                    <TableHead key={c} className={c === "actions" ? "text-end" : "text-start"}>
                      {t(`columns.${c}`)}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const tone: Tone = r.status === "active" ? "stamp" : r.status === "disabled" ? "brick" : "saffron";
                  const iqama = getIqamaInfo(r.idType, r.iqamaEnd, locale);
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs font-semibold text-ink">
                        <span className="inline-block px-2 py-0.5 rounded-[6px] bg-paper border border-line">
                          {r.code}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="font-semibold text-ink">{r.name}</span>
                      </TableCell>
                      <TableCell className="tabular-nums font-mono">
                        <bdi dir="ltr">{r.nationalId}</bdi>
                      </TableCell>
                      <TableCell className="font-medium text-ink">
                        {r.jobTitle}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5 items-start">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap",
                              iqama.tone === "brick" &&
                                "bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-900",
                              iqama.tone === "stamp" &&
                                "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900",
                              iqama.tone === "neutral" && "bg-paper text-secondary border border-line",
                            )}
                          >
                            {iqama.tone === "brick" && (
                              <span className="size-1.5 rounded-full bg-rose-600 dark:bg-rose-400 animate-pulse" aria-hidden />
                            )}
                            {iqama.tone === "stamp" && (
                              <span className="size-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400" aria-hidden />
                            )}
                            {iqama.badgeText}
                          </span>
                          {iqama.iqamaEnd && (
                            <span className="text-2xs font-mono text-secondary tabular-nums" dir="ltr">
                              {iqama.iqamaEnd}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusPill tone={tone}>{t(`status.${r.status}`)}</StatusPill>
                      </TableCell>
                      <TableCell className="text-end">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button asChild variant="ghost" size="sm" className="text-secondary hover:text-ink">
                            <Link href={`/employees/${r.id}`}>
                              <Eye className="size-3.5" aria-hidden />
                              {t("actions.view")}
                            </Link>
                          </Button>
                          {canAdd && (
                            <Button asChild variant="outline" size="sm" className="text-indigo font-medium">
                              <Link href={`/employees/${r.id}/edit`}>
                                <Pencil className="size-3.5" aria-hidden />
                                {t("actions.edit")}
                              </Link>
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </main>
  );
}
