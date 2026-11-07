import { AlertCircle, AlertTriangle, CheckCircle2, Eye, FileText, Pencil } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { EmployeeSearchInput } from "@/components/employees/employee-search-input";
import { ReportsTabs } from "@/components/reports/reports-tabs";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireMember } from "@/lib/auth/account";
import { managesPeople } from "@/lib/auth/permissions";
import { localName } from "@/lib/employees";
import { parseExpiryDays } from "@/lib/iqama";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

const FILTERS = ["all", "expiring_soon", "expired", "valid"] as const;
type Filter = (typeof FILTERS)[number];
const cleanSearch = (q: string) => q.replace(/[,()*%\\:"'.]/g, " ").trim().slice(0, 60).toLowerCase();

export default async function ReportsContractsPage({ params, searchParams }: PageProps<"/[locale]/reports/contracts">) {
  const locale = (await params).locale as Locale;
  const member = await requireMember(locale, ["owner", "admin", "hr", "manager"]);
  const t = await getTranslations({ locale, namespace: "reports" });
  const sp = await searchParams;
  const q = cleanSearch(typeof sp.q === "string" ? sp.q : "");
  const filter: Filter = FILTERS.includes(sp.status as Filter) ? (sp.status as Filter) : "all";
  const canEdit = managesPeople(member.role);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employees")
    .select(
      "id, full_name_ar, full_name_en, national_id, employee_number, job_title, contract_type, contract_start, contract_end, status",
    )
    .neq("status", "deleted")
    .not("role", "in", '("owner","admin")');

  if (error) throw new Error("contracts report query failed");

  // Map and calculate contract expiry days
  const allContracts = (data ?? []).map((e) => {
    const days = parseExpiryDays(e.contract_end);
    const isExpired = days !== null && days < 0;
    const isExpiringSoon = days !== null && days >= 0 && days <= 60;
    const isValid = days !== null && days > 60;

    let badgeText = locale === "ar" ? "غير محدد" : "Not set";
    let tone: "brick" | "stamp" | "neutral" = "neutral";

    if (e.contract_end && days !== null) {
      if (days < 0) {
        badgeText = locale === "ar" ? `منتهي (منذ ${Math.abs(days)} يوم)` : `Expired (${Math.abs(days)}d ago)`;
        tone = "brick";
      } else if (days === 0) {
        badgeText = locale === "ar" ? "ينتهي اليوم" : "Expires today";
        tone = "brick";
      } else if (days <= 60) {
        badgeText = locale === "ar" ? `متبقي ${days} يوم على انتهاء العقد` : `${days} days left until contract ends`;
        tone = "brick";
      } else {
        badgeText = locale === "ar" ? `سارٍ (متبقي ${days} يوم)` : `Valid (${days}d left)`;
        tone = "stamp";
      }
    }

    return {
      id: e.id,
      code: e.employee_number || "—",
      name: localName(locale, e.full_name_ar, e.full_name_en),
      nationalId: e.national_id,
      jobTitle: e.job_title || "—",
      contractType: e.contract_type || "—",
      contractStart: e.contract_start,
      contractEnd: e.contract_end,
      daysRemaining: days,
      isExpired,
      isExpiringSoon,
      isValid,
      badgeText,
      tone,
    };
  });

  const kpi = {
    total: allContracts.length,
    expired: allContracts.filter((c) => c.isExpired).length,
    expiringSoon: allContracts.filter((c) => c.isExpiringSoon).length,
    valid: allContracts.filter((c) => c.isValid).length,
  };

  const filtered = allContracts.filter((c) => {
    if (filter === "expired" && !c.isExpired) return false;
    if (filter === "expiring_soon" && !c.isExpiringSoon) return false;
    if (filter === "valid" && !c.isValid) return false;

    if (q) {
      const matchName = c.name.toLowerCase().includes(q);
      const matchId = c.nationalId.toLowerCase().includes(q);
      const matchCode = c.code.toLowerCase().includes(q);
      const matchJob = c.jobTitle.toLowerCase().includes(q);
      if (!matchName && !matchId && !matchCode && !matchJob) return false;
    }

    return true;
  });

  // Sort: closest contract expiry first
  filtered.sort((a, b) => {
    if (a.daysRemaining !== null && b.daysRemaining !== null) {
      return a.daysRemaining - b.daysRemaining;
    }
    if (a.daysRemaining !== null && b.daysRemaining === null) return -1;
    if (a.daysRemaining === null && b.daysRemaining !== null) return 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });

  const filterHref = (f: Filter) => ({
    pathname: "/reports/contracts",
    query: { ...(q ? { q } : {}), ...(f !== "all" ? { status: f } : {}) },
  });

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-page">{t("title")}</h1>
        <p className="text-caption text-secondary">{t("subtitle")}</p>
      </div>

      <ReportsTabs />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="flex flex-col gap-1 rounded-card border border-line bg-surface p-4">
          <div className="flex items-center justify-between text-secondary">
            <span className="text-caption">{locale === "ar" ? "إجمالي العقود" : "Total Contracts"}</span>
            <FileText className="size-4" aria-hidden />
          </div>
          <span className="text-2xl font-bold text-ink">{kpi.total}</span>
        </div>

        <div className="flex flex-col gap-1 rounded-card border border-rose-200 bg-rose-50/50 p-4 dark:border-rose-900/40 dark:bg-rose-950/20">
          <div className="flex items-center justify-between text-rose-700 dark:text-rose-400">
            <span className="text-caption font-medium">{locale === "ar" ? "عقود منتهية" : "Expired Contracts"}</span>
            <AlertCircle className="size-4" aria-hidden />
          </div>
          <span className="text-2xl font-bold text-rose-700 dark:text-rose-400">{kpi.expired}</span>
        </div>

        <div className="flex flex-col gap-1 rounded-card border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
          <div className="flex items-center justify-between text-amber-700 dark:text-amber-400">
            <span className="text-caption font-medium">{locale === "ar" ? "تنتهي قريباً (خلال 60 يوماً)" : "Expiring Soon"}</span>
            <AlertTriangle className="size-4" aria-hidden />
          </div>
          <span className="text-2xl font-bold text-amber-700 dark:text-amber-400">{kpi.expiringSoon}</span>
        </div>

        <div className="flex flex-col gap-1 rounded-card border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20">
          <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-400">
            <span className="text-caption font-medium">{locale === "ar" ? "عقود سارية" : "Valid Contracts"}</span>
            <CheckCircle2 className="size-4" aria-hidden />
          </div>
          <span className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{kpi.valid}</span>
        </div>
      </div>

      {/* Search & Filter Nav */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex-1 min-w-0">
          <EmployeeSearchInput placeholder={locale === "ar" ? "بحث بالاسم أو رقم الهوية أو المسمى..." : "Search..."} />
        </div>
        <nav aria-label={t("filters.all")} className="shrink-0 flex gap-1 rounded-control border border-line bg-surface p-1">
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
              {f === "expiring_soon"
                ? `${t(`filters.${f}`)} (${kpi.expiringSoon})`
                : f === "expired"
                ? `${t(`filters.${f}`)} (${kpi.expired})`
                : t(`filters.${f}`)}
            </Link>
          ))}
        </nav>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-start gap-4 rounded-card border border-dashed border-line bg-surface p-6">
          <p className="text-secondary">{t("empty")}</p>
        </div>
      ) : (
        <>
          <p className="text-secondary">{locale === "ar" ? `${filtered.length} موظف` : `${filtered.length} employees`}</p>

          {/* Desktop Table */}
          <div className="hidden overflow-hidden rounded-card border border-line bg-surface md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("columns.code")}</TableHead>
                  <TableHead>{t("columns.name")}</TableHead>
                  <TableHead>{locale === "ar" ? "رقم الهوية / الإقامة" : "ID / Iqama"}</TableHead>
                  <TableHead>{t("columns.jobTitle")}</TableHead>
                  <TableHead>{locale === "ar" ? "تاريخ نهاية العقد" : "Contract End"}</TableHead>
                  <TableHead>{t("columns.daysLeft")}</TableHead>
                  <TableHead className="text-end">{t("columns.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
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
                    <TableCell className="font-mono text-xs tabular-nums text-ink">
                      {r.contractEnd ? <bdi dir="ltr">{r.contractEnd}</bdi> : "—"}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap",
                          r.tone === "brick" &&
                            "bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-900",
                          r.tone === "stamp" &&
                            "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900",
                          r.tone === "neutral" && "bg-paper text-secondary border border-line",
                        )}
                      >
                        {r.tone === "brick" && (
                          <span className="size-1.5 rounded-full bg-rose-600 dark:bg-rose-400 animate-pulse" aria-hidden />
                        )}
                        {r.tone === "stamp" && (
                          <span className="size-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400" aria-hidden />
                        )}
                        {r.badgeText}
                      </span>
                    </TableCell>
                    <TableCell className="text-end">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button asChild variant="ghost" size="sm" className="text-secondary hover:text-ink">
                          <Link href={`/employees/${r.id}`}>
                            <Eye className="size-3.5" aria-hidden />
                            {t("actions.view")}
                          </Link>
                        </Button>
                        {canEdit && (
                          <Button asChild variant="outline" size="sm" className="text-indigo font-medium">
                            <Link href={`/employees/${r.id}/edit`}>
                              <Pencil className="size-3.5" aria-hidden />
                              {t("actions.renew")}
                            </Link>
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </main>
  );
}
