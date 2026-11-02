import { getTranslations } from "next-intl/server";
import { StatusPill, type Tone } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requirePlatformAdmin } from "@/lib/auth/account";
import { isValidNationalId, normalizeNationalId } from "@/lib/auth/national-id";
import { createClient } from "@/lib/supabase/server";

const statusTone: Record<"active" | "disabled" | "deleted", Tone> = {
  active: "stamp",
  disabled: "saffron",
  deleted: "brick",
};

// Where is this national ID registered? System admins only (RLS lets them read every company).
export default async function LookupPage({ params, searchParams }: PageProps<"/[locale]/admin/lookup">) {
  const locale = (await params).locale as Locale;
  await requirePlatformAdmin(locale);
  const t = await getTranslations({ locale, namespace: "admin.lookup" });

  const raw = (await searchParams).id;
  const typed = typeof raw === "string" ? raw.slice(0, 20) : "";
  const nationalId = normalizeNationalId(typed);
  const searched = typed !== "";
  const valid = isValidNationalId(nationalId);

  let admin = false;
  let matches: { id: string; status: "active" | "disabled" | "deleted"; companyId: string; company: string }[] = [];
  if (valid) {
    const supabase = await createClient();
    const [{ data: admins }, { data: employees }] = await Promise.all([
      supabase.from("platform_admins").select("user_id").eq("national_id", nationalId),
      supabase
        .from("employees")
        .select("id, status, company:companies(id, name_ar, name_en)")
        .eq("national_id", nationalId)
        .order("created_at", { ascending: false }),
    ]);
    admin = (admins?.length ?? 0) > 0;
    matches = (employees ?? []).flatMap((e) =>
      e.company
        ? [{ id: e.id, status: e.status, companyId: e.company.id, company: (locale === "en" && e.company.name_en) || e.company.name_ar }]
        : [],
    );
  }

  return (
    <main className="flex flex-col gap-6">
      <div className="flex max-w-2xl flex-col gap-2">
        <h1 className="text-page">{t("title")}</h1>
        <p className="text-secondary">{t("intro")}</p>
      </div>

      <form role="search" className="flex max-w-xl flex-col gap-2">
        <Label htmlFor="id">{t("nationalId")}</Label>
        <div className="flex gap-2">
          <Input
            id="id"
            name="id"
            defaultValue={typed}
            inputMode="numeric"
            maxLength={14}
            dir="ltr"
            className="tabular-nums"
            aria-invalid={searched && !valid ? true : undefined}
            aria-describedby={searched && !valid ? "id-error" : undefined}
          />
          <Button type="submit">{t("submit")}</Button>
        </div>
        {searched && !valid && (
          <p id="id-error" className="text-caption text-brick">
            {t("invalid")}
          </p>
        )}
      </form>

      {valid && (
        <section aria-live="polite" className="flex max-w-2xl flex-col gap-2">
          {admin && <p className="rounded-card border border-line bg-surface p-4">{t("platformAdmin")}</p>}
          {matches.map((m) => (
            <Link
              key={m.id}
              href={`/admin/companies/${m.companyId}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-line bg-surface p-4 hover:border-indigo focus-visible:outline-2 focus-visible:outline-indigo"
            >
              <span className="font-semibold">{t("inCompany", { company: m.company })}</span>
              <StatusPill tone={statusTone[m.status]}>{t(`employeeStatus.${m.status}`)}</StatusPill>
            </Link>
          ))}
          {!admin && matches.every((m) => m.status === "deleted") && (
            <p className="rounded-card border border-dashed border-line bg-surface p-4">{t("notFound")}</p>
          )}
        </section>
      )}
    </main>
  );
}
