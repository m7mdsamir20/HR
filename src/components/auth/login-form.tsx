"use client";

import { Eye, EyeOff } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { login, type LoginState } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { normalizeNationalId } from "@/lib/auth/national-id";
import { cn } from "@/lib/utils";

export function LoginForm() {
  const t = useTranslations("login");
  const locale = useLocale();
  const [state, action, pending] = useActionState<LoginState, FormData>(login, undefined);
  const [nationalId, setNationalId] = useState(state?.nationalId ?? "");
  const [showPassword, setShowPassword] = useState(false);

  // Shown as the user types: digit count and ID type from the first digit. Format only, so it
  // reveals nothing about whether an account exists.
  const digits = nationalId.replace(/\D/g, "").slice(0, 10);
  const idType = digits.startsWith("1") ? "citizen" : digits.startsWith("2") ? "resident" : null;

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="locale" value={locale} />

      {state?.error && (
        <p role="alert" className="rounded-control border border-brick/30 bg-brick/5 px-3 py-2.5 text-label text-brick">
          {t(`errors.${state.error}`)}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="nationalId">{t("nationalId")}</Label>
        <Input
          id="nationalId"
          name="nationalId"
          value={nationalId}
          // Arabic-Indic digits become 0-9 as they're typed (Latin digits everywhere, CLAUDE.md §6).
          onChange={(e) => setNationalId(normalizeNationalId(e.target.value).replace(/\D/g, "").slice(0, 10))}
          inputMode="numeric"
          autoComplete="username"
          dir="ltr"
          maxLength={10}
          required
          aria-describedby="nationalId-meta"
          aria-invalid={state?.error === "invalid" || undefined}
          className="h-12 text-center text-lg font-medium tracking-[0.3em] tabular-nums"
        />
        <p id="nationalId-meta" className="flex justify-between text-caption text-ink-soft" aria-live="polite">
          <span className="tabular-nums">{t("digits", { count: digits.length })}</span>
          {idType && <span>{t(idType)}</span>}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">{t("password")}</Label>
        {/* The value is LTR, so the wrapper is too: the eye and the reserved padding then sit on the
            same side in both languages and typed characters never run under the icon. */}
        <div className="relative" dir="ltr">
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            dir="ltr"
            required
            maxLength={128}
            aria-invalid={state?.error === "invalid" || undefined}
            className="h-12 pe-12"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? t("hidePassword") : t("showPassword")}
            aria-pressed={showPassword}
            className="absolute inset-y-0 end-0 flex w-12 items-center justify-center rounded-e-control text-ink-soft hover:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-indigo"
          >
            {showPassword ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
          </button>
        </div>
      </div>

      <Button type="submit" size="lg" disabled={pending} className={cn("mt-1 w-full text-base")}>
        {pending ? t("submitting") : t("submit")}
      </Button>

      <p className="text-secondary">{t("forgot")}</p>
    </form>
  );
}
