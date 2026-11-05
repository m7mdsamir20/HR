import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";

export default async function BranchesPage({ params }: PageProps<"/[locale]/branches">) {
  const locale = (await params).locale as Locale;
  redirect({ href: "/settings/branches", locale });
}
