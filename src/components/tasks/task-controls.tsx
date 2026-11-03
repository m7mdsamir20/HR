"use client";

import { ExternalLink, Download, Play, Star, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useState, useTransition } from "react";
import { attachmentUrl, deleteTask, reviewTask, startTask, type ReportState, type TaskActionState } from "@/actions/tasks";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

function useActionError() {
  const t = useTranslations("tasks");
  const tErrors = useTranslations("errors");
  return (error: string) =>
    ["taskClosed", "taskStarted", "notSubmitted", "fileType", "fileSize", "tooManyFiles"].includes(error)
      ? t(`errors.${error as "taskClosed"}`)
      : tErrors(error as "unexpected");
}

/** Assignee: start work. */
export function StartButton({ taskId }: { taskId: string }) {
  const t = useTranslations("tasks.detail");
  const locale = useLocale();
  const actionError = useActionError();
  const [state, action, pending] = useActionState<TaskActionState, FormData>(startTask.bind(null, taskId), undefined);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="uiLocale" value={locale} />
      <Button type="submit" size="lg" disabled={pending} className="w-full sm:w-fit">
        <Play className="rtl:-scale-x-100" aria-hidden />
        {pending ? t("starting") : t("start")}
      </Button>
      {state && !state.ok && (
        <p role="alert" className="text-label text-brick">
          {actionError(state.error)}
        </p>
      )}
    </form>
  );
}

/** Reviewer: delete (only before work starts), confirmed inline. */
export function DeleteTaskButton({ taskId }: { taskId: string }) {
  const t = useTranslations("tasks.detail");
  const locale = useLocale();
  const actionError = useActionError();
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState<TaskActionState, FormData>(deleteTask.bind(null, taskId), undefined);
  return confirming ? (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="uiLocale" value={locale} />
      <span className="text-label">{t("deleteConfirm")}</span>
      <Button type="submit" variant="destructive" size="sm" disabled={pending}>
        {t("delete")}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
        {t("cancel")}
      </Button>
      {state && !state.ok && (
        <span role="alert" className="w-full text-label text-brick">
          {actionError(state.error)}
        </span>
      )}
    </form>
  ) : (
    <Button type="button" variant="ghost" className="w-fit text-brick" onClick={() => setConfirming(true)}>
      <Trash2 aria-hidden />
      {t("delete")}
    </Button>
  );
}

/** Reviewer: approve with a 1-5 rating, or send back with a note. */
export function ReviewForm({ taskId }: { taskId: string }) {
  const t = useTranslations("tasks");
  const locale = useLocale();
  const actionError = useActionError();
  const [decision, setDecision] = useState<"approve" | "changes">("approve");
  const [rating, setRating] = useState(0);
  const [state, action, pending] = useActionState<ReportState, FormData>(reviewTask.bind(null, taskId), undefined);
  const failed = state && !state.ok ? state : undefined;
  const bad = (f: string) => (failed?.fields?.includes(f) ? t(`fields.${f}` as "fields.rating") : undefined);

  return (
    <form action={action} className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 md:p-6" noValidate>
      <input type="hidden" name="uiLocale" value={locale} />
      <input type="hidden" name="decision" value={decision} />
      <h2 className="text-card">{t("review.title")}</h2>

      <div role="radiogroup" aria-label={t("review.title")} className="grid gap-2 sm:grid-cols-2">
        {(["approve", "changes"] as const).map((d) => (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={decision === d}
            onClick={() => setDecision(d)}
            className={cn(
              "min-h-11 rounded-control border px-4 text-label",
              decision === d
                ? d === "approve"
                  ? "border-stamp bg-stamp/10 font-semibold text-stamp"
                  : "border-brick bg-brick/10 font-semibold text-brick"
                : "border-line bg-surface text-ink-soft hover:bg-paper",
            )}
          >
            {t(`review.${d}`)}
          </button>
        ))}
      </div>

      {decision === "approve" && (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-label">{t("review.rating")}</legend>
          <div className="flex gap-1" dir="ltr">
            {[1, 2, 3, 4, 5].map((n) => (
              <label key={n} className="cursor-pointer rounded-control p-1 focus-within:outline-2 focus-within:outline-indigo">
                <input type="radio" name="rating" value={n} checked={rating === n} onChange={() => setRating(n)} className="sr-only" aria-label={t("review.ratingValue", { value: n })} />
                <Star className={cn("size-9", n <= rating ? "fill-saffron text-saffron" : "text-line")} aria-hidden />
              </label>
            ))}
          </div>
          {bad("rating") && <p className="text-caption text-brick">{bad("rating")}</p>}
        </fieldset>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="note">{decision === "changes" ? t("review.noteChanges") : t("review.note")}</Label>
        <textarea
          id="note"
          name="note"
          rows={3}
          maxLength={2000}
          required={decision === "changes"}
          aria-invalid={bad("note") ? true : undefined}
          className="w-full rounded-control border border-input bg-surface px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive"
        />
        {bad("note") && <p className="text-caption text-brick">{bad("note")}</p>}
      </div>

      {failed && !failed.fields && (
        <p role="alert" className="text-label text-brick">
          {actionError(failed.error)}
        </p>
      )}
      <div>
        <Button type="submit" size="lg" variant={decision === "approve" ? "default" : "destructive"} disabled={pending}>
          {pending ? t("review.submitting") : decision === "approve" ? t("review.submitApprove") : t("review.submitChanges")}
        </Button>
      </div>
    </form>
  );
}

/** A proof file: open it in a new tab or download it, through a fresh 5-minute link. */
export function AttachmentLinks({ attachmentId, name }: { attachmentId: string; name: string }) {
  const t = useTranslations("tasks.report");
  const locale = useLocale();
  const [pending, start] = useTransition();

  function go(download: boolean) {
    start(async () => {
      const url = await attachmentUrl(attachmentId, locale, download);
      if (!url) return;
      if (download) window.location.assign(url);
      else window.open(url, "_blank", "noopener,noreferrer");
    });
  }

  return (
    <li className="flex items-center justify-between gap-2 rounded-control border border-line bg-paper px-3 py-2">
      <span className="truncate text-label" dir="auto">
        {name}
      </span>
      <span className="flex shrink-0 gap-1">
        <Button type="button" variant="ghost" size="sm" onClick={() => go(false)} disabled={pending}>
          <ExternalLink aria-hidden />
          {t("open")}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => go(true)} disabled={pending}>
          <Download aria-hidden />
          {t("download")}
        </Button>
      </span>
    </li>
  );
}
