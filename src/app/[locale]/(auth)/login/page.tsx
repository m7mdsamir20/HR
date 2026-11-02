import { getTranslations } from "next-intl/server";
import { LoginForm } from "@/components/auth/login-form";
import { redirect } from "@/i18n/navigation";
import { canEnter, getAccount, homePathFor } from "@/lib/auth/account";

export default async function LoginPage({ params }: PageProps<"/[locale]/login">) {
  const { locale } = await params;
  const account = await getAccount();
  if (canEnter(account)) redirect({ href: homePathFor(account), locale });

  const t = await getTranslations({ locale, namespace: "login" });

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-page">{t("title")}</h1>
        <p className="text-secondary">{t("intro")}</p>
      </header>
      <LoginForm />
    </div>
  );
}
