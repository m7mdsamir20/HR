import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["ar", "en"],
  defaultLocale: "ar",
  // Arabic lives at "/", English at "/en".
  localePrefix: "as-needed",
  // Arabic is the default for everyone; the browser language doesn't redirect. The user's choice is
  // remembered in a cookie (later: the locale saved on their employee profile).
  localeDetection: false,
});

export type Locale = (typeof routing.locales)[number];

export const localeDir = (locale: Locale) => (locale === "ar" ? "rtl" : "ltr");
