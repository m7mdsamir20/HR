import { Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requirePlatformAdmin } from "@/lib/auth/account";
import { companyState, companyStateTone } from "@/lib/company-state";
import { formatDate, todayInRiyadh } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

// PostgREST filter syntax uses these characters; strip them from the free-text search.
const cleanSearch = (q: string) => q.replace(/[,()*%\\:"'.]/g, " ").trim().slice(0, 60);

export default async function CompaniesPage({ params, searchParams }: PageProps<"/[locale]/admin">) {
  const locale = (await params).locale as Locale;
  await requirePlatformAdmin(locale);
  const t = await getTranslations({ locale, namespace: "admin" });
  const rawQ = (await searchParams).q;
  const q = cleanSearch(typeof rawQ === "string" ? rawQ : "");

  const supabase = await createClient();
  let query = supabase
    .from("companies")
    .select(
      "id, name_ar, name_en, status, max_employees, subscription_ends_at, seats:employees(count), owners:employees(full_name_ar, full_name_en)",
    )
    .eq("seats.status", "active")
    .eq("owners.role", "owner")
    .eq("owners.status", "active")
    .order("created_at", { ascending: false })
    .limit(200);
  if (q) query = query.or(`name_ar.ilike.*${q}*,name_en.ilike.*${q}*`);
  const { data, error } = await query;
  if (error) throw new Error("companies query failed");

  const today = todayInRiyadh();
  const rows = data.map((c) => {
    const state = companyState(c, today);
    const owner = c.owners[0];
    return {
      id: c.id,
      name: (locale === "en" && c.name_en) || c.name_ar,
      owner: owner ? (locale === "en" && owner.full_name_en) || owner.full_name_ar : "—",
      seats: t("companies.seats", { used: c.seats[0]?.count ?? 0, max: c.max_employees }),
      endsAt: formatDate(locale, c.subscription_ends_at),
      state,
    };
  });

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-page">{t("companies.title")}</h1>
        <Button asChild>
          <Link href="/admin/companies/new">
            <Plus aria-hidden />
            {t("companies.add")}
          </Link>
        </Button>
      </div>

      <form role="search" className="flex max-w-xl gap-2">
        <Input name="q" type="search" defaultValue={q} placeholder={t("companies.search")} aria-label={t("companies.search")} />
        <Button type="submit" variant="outline">
          {t("companies.searchSubmit")}
        </Button>
      </form>

      {rows.length === 0 ? (
        <div className="flex flex-col items-start gap-4 rounded-card border border-dashed border-line bg-surface p-6">
          <p>{q ? t("companies.noResults") : t("companies.empty")}</p>
          {!q && (
            <Button asChild variant="outline">
              <Link href="/admin/companies/new">{t("companies.add")}</Link>
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* Phones: stacked list. From md: table. Same data, one source. */}
          <ul className="flex flex-col gap-2 md:hidden">
            {rows.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/admin/companies/${r.id}`}
                  className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4 focus-visible:outline-2 focus-visible:outline-indigo"
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="font-semibold">{r.name}</span>
                    <StatusPill tone={companyStateTone[r.state]}>{t(`status.${r.state}`)}</StatusPill>
                  </span>
                  <span className="text-secondary">{r.owner}</span>
                  <span className="flex justify-between text-secondary tabular-nums">
                    <span>{r.seats}</span>
                    <span>{r.endsAt}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <div className="hidden overflow-hidden rounded-card border border-line bg-surface md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-start">{t("companies.name")}</TableHead>
                  <TableHead className="text-start">{t("companies.owner")}</TableHead>
                  <TableHead className="text-start">{t("companies.employees")}</TableHead>
                  <TableHead className="text-start">{t("companies.endsAt")}</TableHead>
                  <TableHead className="text-start">{t("companies.status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link
                        href={`/admin/companies/${r.id}`}
                        className="font-semibold text-indigo hover:underline focus-visible:outline-2 focus-visible:outline-indigo"
                      >
                        {r.name}
                      </Link>
                    </TableCell>
                    <TableCell>{r.owner}</TableCell>
                    <TableCell className="tabular-nums">{r.seats}</TableCell>
                    <TableCell className="tabular-nums">{r.endsAt}</TableCell>
                    <TableCell>
                      <StatusPill tone={companyStateTone[r.state]}>{t(`status.${r.state}`)}</StatusPill>
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
