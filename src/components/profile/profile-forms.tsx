"use client";

import { CheckCircle2, Eye, EyeOff } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { changePassword, setLanguage, type PasswordState } from "@/actions/profile";
import { FormSection } from "@/components/form-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function PasswordInput({ name, label, autoComplete }: { name: string; label: string; autoComplete: string }) {
  const t = useTranslations("login");
  const [show, setShow] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={name}>{label}</Label>
      {/* LTR wrapper: the eye and its reserved padding sit on the same side in both languages. */}
      <div className="relative" dir="ltr">
        <Input id={name} name={name} type={show ? "text" : "password"} autoComplete={autoComplete} required maxLength={128} className="pe-12" />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? t("hidePassword") : t("showPassword")}
          aria-pressed={show}
          className="absolute inset-y-0 end-0 flex w-12 items-center justify-center rounded-e-control text-ink-soft hover:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-indigo"
        >
          {show ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
        </button>
      </div>
    </div>
  );
}

export function ChangePasswordForm() {
  const t = useTranslations("profile.password");
  const tErrors = useTranslations("errors");
  const locale = useLocale();
  // Bumped after a successful change so the three fields re-mount empty.
  const [done, setDone] = useState(0);
  const [state, action, pending] = useActionState<PasswordState, FormData>(async (prev: PasswordState, fd: FormData) => {
    const result = await changePassword(prev, fd);
    if (result?.ok) setDone((n) => n + 1);
    return result;
  }, undefined);

  const own = ["wrongCurrent", "mismatch", "weak", "samePassword"] as const;
  const message =
    state && !state.ok
      ? (own as readonly string[]).includes(state.error)
        ? t(`errors.${state.error as (typeof own)[number]}`)
        : tErrors(state.error as "unexpected")
      : undefined;

  return (
    <form key={done} action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="uiLocale" value={locale} />
      <FormSection title={t("title")} description={t("hint")}>
        <PasswordInput name="current" label={t("current")} autoComplete="current-password" />
        <PasswordInput name="next" label={t("next")} autoComplete="new-password" />
        <PasswordInput name="confirm" label={t("confirm")} autoComplete="new-password" />
      </FormSection>
      {message && (
        <p role="alert" className="rounded-control border border-brick/30 bg-brick/5 px-3 py-2.5 text-label text-brick">
          {message}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? t("submitting") : t("submit")}
        </Button>
        {state?.ok && (
          <p role="status" className="inline-flex items-center gap-1.5 text-label text-stamp">
            <CheckCircle2 className="size-4" aria-hidden />
            {t("done")}
          </p>
        )}
      </div>
    </form>
  );
}

export function LanguageForm({ current }: { current: "ar" | "en" }) {
  const t = useTranslations("profile.language");
  const locale = useLocale();
  return (
    <form action={setLanguage} className="flex flex-col gap-4">
      <input type="hidden" name="uiLocale" value={locale} />
      <FormSection title={t("title")} description={t("intro")}>
        {(
          [
            { value: "ar", label: "العربية" },
            { value: "en", label: "English" },
          ] as const
        ).map((o) => (
          <label
            key={o.value}
            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-control border border-line bg-surface px-3 has-checked:border-indigo has-checked:bg-indigo/5"
          >
            <input type="radio" name="language" value={o.value} defaultChecked={current === o.value} className="size-4 accent-indigo" />
            <span lang={o.value}>{o.label}</span>
          </label>
        ))}
      </FormSection>
      <div>
        <Button type="submit" variant="outline">
          {t("submit")}
        </Button>
      </div>
    </form>
  );
}
