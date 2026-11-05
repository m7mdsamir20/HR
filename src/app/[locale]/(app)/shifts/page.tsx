import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";

export default async function ShiftsPage({ params }: PageProps<"/[locale]/shifts">) {
  const locale = (await params).locale as Locale;
  redirect({ href: "/settings/shifts", locale });
}
