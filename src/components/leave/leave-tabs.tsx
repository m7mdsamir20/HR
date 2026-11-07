import { useTranslations } from "next-intl";
import { SectionTabs } from "@/components/section-tabs";
import type { Role } from "@/lib/auth/roles";

/** Leave sections: my leave for everyone, the request inbox for whoever decides, balances for owner / HR. */
export function LeaveTabs({ role }: { role: Role }) {
  const t = useTranslations("leave.tabs");
  const isLeader = role === "owner" || role === "admin";
  return (
    <SectionTabs
      label={t("label")}
      items={[
        ...(!isLeader ? [{ href: "/leave", label: t("mine") }] : []),
        ...(role !== "employee" ? [{ href: "/leave/requests", label: t("requests") }] : []),
        ...(isLeader || role === "hr" ? [{ href: "/leave/balances", label: t("balances") }] : []),
      ]}
    />
  );
}
