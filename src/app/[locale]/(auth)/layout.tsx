import { getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "@/components/locale-switcher";
import type { Locale } from "@/i18n/routing";

// The task cycle is a real sequence, so it's shown as one. Same split layout as field-service-saas:
// the panel takes the start side (right in Arabic), the form the other half. Phones get the form only.
const CYCLE = ["assign", "execute", "report", "review", "approve"] as const;

export default async function AuthLayout({ children, params }: LayoutProps<"/[locale]">) {
  const locale = (await params).locale as Locale;
  const t = await getTranslations({ locale, namespace: "login" });

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
      <aside className="relative hidden overflow-hidden bg-night px-12 py-12 text-white lg:flex lg:flex-col lg:justify-between xl:px-16">
        <p className="text-label text-white/70">{t("tagline")}</p>

        <div className="relative z-10 max-w-md space-y-10">
          <h2 className="text-[2rem] leading-[1.3] font-semibold text-balance">{t("panelTitle")}</h2>
          <ol>
            {CYCLE.map((step, i) => {
              const last = i === CYCLE.length - 1;
              return (
                <li key={step} className="relative flex items-center gap-4 pb-5 last:pb-0">
                  {!last && <span aria-hidden className="absolute start-[0.9rem] top-8 h-[calc(100%-1.5rem)] w-px bg-white/20" />}
                  <span
                    className={
                      last
                        ? "relative grid size-7 shrink-0 place-items-center rounded-full bg-night-stamp text-caption font-semibold text-night-deep"
                        : "relative grid size-7 shrink-0 place-items-center rounded-full border border-white/30 text-caption font-semibold text-white/80"
                    }
                  >
                    {i + 1}
                  </span>
                  <span className={last ? "font-semibold text-white" : "text-white/80"}>{t(`cycle.${step}`)}</span>
                </li>
              );
            })}
          </ol>
        </div>

        {/* The approval stamp, the product's one signature mark (CLAUDE.md §6), as a quiet watermark. */}
        <div aria-hidden className="pointer-events-none absolute -end-20 -bottom-20 grid size-80 place-items-center rounded-full border-[3px] border-night-stamp/25">
          <div className="size-64 rounded-full border border-dashed border-night-stamp/25" />
        </div>

        <p className="relative z-10 text-caption text-white/50">{t("noSignup")}</p>
      </aside>

      <main className="flex flex-col px-4 pt-4 pb-8 sm:px-8">
        <div className="flex items-center justify-between gap-4">
          <p className="text-label text-ink-soft lg:invisible">{t("tagline")}</p>
          <LocaleSwitcher />
        </div>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-md">{children}</div>
        </div>
        <p className="text-center text-caption text-ink-soft lg:hidden">{t("noSignup")}</p>
      </main>
    </div>
  );
}
