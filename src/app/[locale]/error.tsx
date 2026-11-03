"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

// Production hides the real error from the browser; this is all a visitor sees. CLAUDE.md §5.8.
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("errorPages");
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4 py-10">
      <h1 className="text-page">{t("errorTitle")}</h1>
      <p className="text-secondary">{t("errorBody")}</p>
      <div>
        <Button onClick={reset}>{t("retry")}</Button>
      </div>
    </main>
  );
}
