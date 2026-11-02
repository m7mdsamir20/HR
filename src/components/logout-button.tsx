import { LogOut } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { logout } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** `compact` hides the label on phones (kept for screen readers) so headers keep room for the company name. */
export function LogoutButton({ className, compact = false }: { className?: string; compact?: boolean }) {
  const t = useTranslations("common");
  const locale = useLocale();

  return (
    <form action={logout} className={className}>
      <input type="hidden" name="locale" value={locale} />
      <Button type="submit" variant="ghost" className={cn("w-full justify-start text-ink-soft", compact && "max-sm:px-3")}>
        <LogOut className="rtl:-scale-x-100" aria-hidden />
        <span className={cn(compact && "max-sm:sr-only")}>{t("logout")}</span>
      </Button>
    </form>
  );
}
