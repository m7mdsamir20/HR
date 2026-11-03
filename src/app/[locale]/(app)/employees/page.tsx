import { Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireMember } from "@/lib/auth/account";
import { normalizeNationalId } from "@/lib/auth/national-id";
import { managesPeople } from "@/lib/auth/permissions";
import { localName, one } from "@/lib/employees";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

const FILTERS = ["active", "disabled", "all"] as const;
type Filter = (typeof FILTERS)[number];
const cleanSearch = (q: string) => q.replace(/[,()*%\\:"'.]/g, " ").trim().slice(0, 60);

export default async function EmployeesPage({ params, searchParams }: PageProps<"/[locale]/employees">) {
  const locale = (await params).locale as Locale;
  const member = await requireMember(locale, ["owner", "hr", "manager"]);
  const t = await getTranslations({ locale, namespace: "employees" });
  const tRoles = await getTranslations({ locale, namespace: "roles" });
  const sp = await searchParams;
  const q = cleanSearch(typeof sp.q === "string" ? sp.q : "");
  const filter: Filter = FILTERS.includes(sp.status as Filter) ? (sp.status as Filter) : "active";
  const canAdd = managesPeople(member.role);

  // RLS decides the rows: the whole company for owner/HR, self + direct reports for a manager.
  const supabase = await createClient();
  let query = supabase
    .from("employees")
    .select(
      "id, full_name_ar, full_name_en, national_id, role, status, department:departments(name_ar, name_en), manager:manager_id(full_name_ar, full_name_en)",
    )
    .neq("status", "deleted")
    .neq("id", member.employee_id)
    .order("full_name_ar")
    .limit(500);
  if (filter !== "all") query = query.eq("status", filter);
  if (q) {
    const digits = normalizeNationalId(q);
    query = /^\d+$/.test(digits)
      ? query.like("national_id", `${digits}%`)
      : query.or(`full_name_ar.ilike.*${q}*,full_name_en.ilike.*${q}*`);
  }
  const { data, error } = await query;
  if (error) throw new Error("employees query failed");

  const rows = data.map((e) => {
    const manager = one(e.manager);
    return {
      id: e.id,
      name: localName(locale, e.full_name_ar, e.full_name_en),
      nationalId: e.national_id,
      role: tRoles(e.role),
      department: e.department ? localName(locale, e.department.name_ar, e.department.name_en) : "—",
      manager: manager ? localName(locale, manager.full_name_ar, manager.full_name_en) : "—",
      status: e.status as "active" | "disabled",
    };
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

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <form role="search" className="flex w-full max-w-xl gap-2">
          {filter !== "active" && <input type="hidden" name="status" value={filter} />}
          <Input name="q" type="search" defaultValue={q} placeholder={t("search")} aria-label={t("search")} />
          <Button type="submit" variant="outline">
            {t("searchSubmit")}
          </Button>
        </form>
        <nav aria-label={t("filter.label")} className="flex gap-1 rounded-control border border-line bg-surface p-1">
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
            {rows.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/employees/${r.id}`}
                  className="flex flex-col gap-1.5 rounded-card border border-line bg-surface p-4 focus-visible:outline-2 focus-visible:outline-indigo"
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="font-semibold">{r.name}</span>
                    {r.status === "disabled" && <StatusPill tone="brick">{t("status.disabled")}</StatusPill>}
                  </span>
                  <span className="text-secondary">
                    {r.role} · {r.department}
                  </span>
                  <bdi dir="ltr" className="text-secondary tabular-nums">
                    {r.nationalId}
                  </bdi>
                </Link>
              </li>
            ))}
          </ul>

          <div className="hidden overflow-hidden rounded-card border border-line bg-surface md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  {(["name", "nationalId", "role", "department", "manager", "status"] as const).map((c) => (
                    <TableHead key={c} className="text-start">
                      {t(`columns.${c}`)}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link href={`/employees/${r.id}`} className="font-semibold text-indigo hover:underline">
                        {r.name}
                      </Link>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      <bdi dir="ltr">{r.nationalId}</bdi>
                    </TableCell>
                    <TableCell>{r.role}</TableCell>
                    <TableCell>{r.department}</TableCell>
                    <TableCell>{r.manager}</TableCell>
                    <TableCell>
                      <StatusPill tone={r.status === "active" ? "stamp" : "brick"}>{t(`status.${r.status}`)}</StatusPill>
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
