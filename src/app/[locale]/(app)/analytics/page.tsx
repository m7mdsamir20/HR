import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";

export default async function AnalyticsPage({ params }: PageProps<"/[locale]">) {
  const locale = (await params).locale as Locale;
  redirect({ href: "/", locale });
}
