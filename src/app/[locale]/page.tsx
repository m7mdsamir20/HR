import { useTranslations } from "next-intl";
import { LocaleSwitcher } from "@/components/locale-switcher";

export default function HomePage() {
  const t = useTranslations("home");

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-4 px-4 py-12">
      <h1 className="text-page">{t("title")}</h1>
      <p className="text-secondary">{t("description")}</p>
      <div>
        <LocaleSwitcher />
      </div>
    </main>
  );
}
