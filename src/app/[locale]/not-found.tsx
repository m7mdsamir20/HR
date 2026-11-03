import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

// Also what a task, employee or file the caller isn't allowed to see turns into: the same page as
// one that doesn't exist, so nothing reveals what is there.
export default async function NotFound() {
  const t = await getTranslations("errorPages");
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4 py-10">
      <h1 className="text-page">{t("notFoundTitle")}</h1>
      <p className="text-secondary">{t("notFoundBody")}</p>
      <div>
        <Button asChild>
          <Link href="/">{t("home")}</Link>
        </Button>
      </div>
    </main>
  );
}
