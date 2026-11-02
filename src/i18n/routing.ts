import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["ar", "en"],
  defaultLocale: "ar",
  // Arabic lives at "/", English at "/en".
  localePrefix: "as-needed",
});

export type Locale = (typeof routing.locales)[number];

export const localeDir = (locale: Locale) => (locale === "ar" ? "rtl" : "ltr");
