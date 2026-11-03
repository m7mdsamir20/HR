import { locale as rootLocale } from "next/root-params";
import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

// The locale is, in order: the one passed to getTranslations({ locale }) (Server Actions and Route
// Handlers can't read root params and always pass it), then the `[locale]` root segment
// (next/root-params, for pages and layouts), then the default.
export default getRequestConfig(async ({ locale: explicit }) => {
  let requested: string | undefined = explicit;
  if (!requested) {
    try {
      requested = await rootLocale();
    } catch {
      // Outside a page render (e.g. a Route Handler that passed no locale): fall back to the default.
    }
  }
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
