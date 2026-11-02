import { getTranslations } from "next-intl/server";
import { LogoutButton } from "@/components/logout-button";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getAccount } from "@/lib/auth/account";
import { formatDate } from "@/lib/format";

// Shown only to a signed-in owner whose company is suspended or past its subscription. §5.6
export default async function SubscriptionEndedPage({ params }: PageProps<"/[locale]/subscription-ended">) {
  const locale = (await params).locale as Locale;
  const account = await getAccount();
  if (account?.kind !== "employee" || account.role !== "owner" || account.status !== "active") {
    redirect({ href: "/login", locale });
  }
  const owner = account as Extract<typeof account, { kind: "employee" }>;
  if (owner.company.is_active) redirect({ href: "/", locale });

  const t = await getTranslations({ locale, namespace: "subscriptionEnded" });
  const companyName = (locale === "en" && owner.company.name_en) || owner.company.name_ar;
  const reason =
    owner.company.status === "suspended"
      ? t("suspended")
      : t("expired", { date: formatDate(locale, owner.company.subscription_ends_at) });

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4 py-10">
      <p className="text-secondary">{companyName}</p>
      <h1 className="text-page">{t("title")}</h1>
      <p>{reason}</p>
      <p className="text-secondary">{t("note")}</p>
      <LogoutButton className="mt-4" />
    </main>
  );
}
