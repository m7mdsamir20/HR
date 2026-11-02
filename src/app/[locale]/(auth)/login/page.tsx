import { getTranslations } from "next-intl/server";
import { LoginForm } from "@/components/auth/login-form";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { redirect } from "@/i18n/navigation";
import { canEnter, getAccount, homePathFor } from "@/lib/auth/account";

export default async function LoginPage({ params }: PageProps<"/[locale]/login">) {
  const { locale } = await params;
  const account = await getAccount();
  if (canEnter(account)) redirect({ href: homePathFor(account), locale });

  const t = await getTranslations({ locale, namespace: "login" });

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col px-4 py-6">
      <div className="flex justify-end">
        <LocaleSwitcher />
      </div>
      <div className="flex flex-1 flex-col justify-center gap-8 py-10">
        <header className="flex flex-col gap-2">
          <h1 className="text-page">{t("title")}</h1>
          <p className="text-secondary">{t("intro")}</p>
        </header>
        <LoginForm />
      </div>
    </main>
  );
}
