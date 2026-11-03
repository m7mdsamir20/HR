"use client";

import { Camera, Paperclip, Plus, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useRef, useState } from "react";
import { prepareReportUpload, submitReport, type ReportState } from "@/actions/tasks";
import { FormField } from "@/components/form-field";
import { FormSection } from "@/components/form-section";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { MAX_DOCUMENT_BYTES } from "@/lib/files";
import { compressImage } from "@/lib/image-compress";

const ACCEPT = ".jpg,.jpeg,.png,.webp,.heic,.pdf,.docx,.xlsx";
const MAX_FILES = 10;
const MAX_LINKS = 5;

/** The assignee's completion report: what was done, hours, obstacles, delivery links and proof files. */
export function ReportForm({ taskId, resubmit, expectedHours }: { taskId: string; resubmit: boolean; expectedHours: string | null }) {
  const t = useTranslations("tasks");
  const tErrors = useTranslations("errors");
  const locale = useLocale();
  const [files, setFiles] = useState<File[]>([]);
  const [links, setLinks] = useState<string[]>([""]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [uploadError, setUploadError] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [state, action, pending] = useActionState<ReportState, FormData>(async (prev: ReportState, fd: FormData) => {
    setUploadError(false);
    fd.delete("file");
    // Send each proof file straight to storage through its own signed URL, then let the server
    // verify what was stored and record the report.
    for (const [i, original] of files.entries()) {
      setProgress({ done: i, total: files.length });
      const file = await compressImage(original);
      const prepared = await prepareReportUpload(taskId, { name: file.name, size: file.size }, locale);
      if (!prepared.ok) return { ok: false, error: prepared.error };
      const body = new FormData();
      body.append("cacheControl", "3600");
      body.append("", file);
      const put = await fetch(prepared.url, { method: "PUT", body, headers: { "x-upsert": "false" } }).catch(() => null);
      if (!put?.ok) {
        setUploadError(true);
        setProgress(null);
        return undefined;
      }
      fd.append("path", prepared.path);
      fd.append("fileName", original.name);
    }
    setProgress(null);
    const result = await submitReport(taskId, prev, fd);
    if (result?.ok) {
      setFiles([]);
      setLinks([""]);
    }
    return result;
  }, undefined);

  function addFiles(list: FileList | null) {
    if (!list) return;
    // Copy now: the input is reset right after this call, which empties its live FileList before a
    // deferred state update would read it.
    const picked = Array.from(list);
    setFiles((current) => [...current, ...picked].filter((f) => f.size <= MAX_DOCUMENT_BYTES * 3).slice(0, MAX_FILES));
  }

  const failed = state && !state.ok ? state : undefined;
  const bad = (f: string) => (failed?.fields?.includes(f) ? t(`fields.${f}` as "fields.summary") : undefined);
  const message = uploadError
    ? t("errors.upload")
    : failed && !failed.fields
      ? failed.error === "fileType" || failed.error === "fileSize" || failed.error === "tooManyFiles" || failed.error === "taskClosed"
        ? t(`errors.${failed.error}`)
        : tErrors(failed.error === "invalid" ? "invalid" : (failed.error as "unexpected"))
      : null;

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="uiLocale" value={locale} />
      <FormSection title={resubmit ? t("report.resubmitTitle") : t("report.title")}>
        <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-3 2xl:col-span-4">
          <Label htmlFor="summary">{t("report.summary")}</Label>
          <textarea
            id="summary"
            name="summary"
            rows={5}
            required
            maxLength={4000}
            aria-invalid={bad("summary") ? true : undefined}
            aria-describedby="summary-hint"
            className="w-full rounded-control border border-input bg-surface px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive"
          />
          <p id="summary-hint" className={bad("summary") ? "text-caption text-brick" : "text-caption text-ink-soft"}>
            {bad("summary") ?? t("report.summaryHint")}
          </p>
        </div>
        <FormField
          name="hoursSpent"
          label={t("report.hoursSpent")}
          hint={expectedHours ? t("detail.hours", { count: expectedHours }) : undefined}
          error={bad("hoursSpent")}
          inputMode="decimal"
          dir="ltr"
          required
        />
        <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-2 2xl:col-span-3">
          <Label htmlFor="obstacles">{t("report.obstacles")}</Label>
          <textarea
            id="obstacles"
            name="obstacles"
            rows={2}
            maxLength={2000}
            className="w-full rounded-control border border-input bg-surface px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>
      </FormSection>

      <FormSection title={t("report.files")} description={t("report.filesHint")}>
        <div className="flex flex-col gap-3 sm:col-span-2 lg:col-span-3 2xl:col-span-4">
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-control border border-line bg-surface px-4 text-label hover:bg-paper focus-within:outline-2 focus-within:outline-indigo">
              <Paperclip className="size-4" aria-hidden />
              {t("report.files")}
              <input type="file" accept={ACCEPT} multiple className="sr-only" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
            </label>
            <Button type="button" variant="outline" onClick={() => cameraRef.current?.click()}>
              <Camera aria-hidden />
              {t("report.camera")}
            </Button>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
          </div>
          {files.length > 0 && (
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 rounded-control border border-line bg-paper px-3 py-2">
                  <span className="truncate text-label" dir="auto">
                    {f.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => setFiles((c) => c.filter((_, j) => j !== i))}
                    aria-label={`${t("detail.cancel")} ${f.name}`}
                    className="grid size-8 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-line"
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </FormSection>

      <FormSection title={t("report.links")} description={t("report.linksHint")}>
        <div className="flex flex-col gap-3 sm:col-span-2 lg:col-span-3 2xl:col-span-4">
          {links.map((link, i) => (
            <div key={i} className="flex gap-2">
              <input
                name="link"
                type="url"
                value={link}
                onChange={(e) => setLinks((c) => c.map((l, j) => (j === i ? e.target.value : l)))}
                dir="ltr"
                placeholder="https://"
                aria-label={`${t("report.links")} ${i + 1}`}
                className="h-11 w-full rounded-control border border-input bg-surface px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
              {links.length > 1 && (
                <Button type="button" variant="ghost" size="icon" onClick={() => setLinks((c) => c.filter((_, j) => j !== i))} aria-label={t("detail.cancel")}>
                  <X aria-hidden />
                </Button>
              )}
            </div>
          ))}
          {bad("links") && <p className="text-caption text-brick">{bad("links")}</p>}
          {links.length < MAX_LINKS && (
            <Button type="button" variant="ghost" className="w-fit" onClick={() => setLinks((c) => [...c, ""])}>
              <Plus aria-hidden />
              {t("report.addLink")}
            </Button>
          )}
        </div>
      </FormSection>

      {message && (
        <p role="alert" className="rounded-control border border-brick/30 bg-brick/5 px-3 py-2.5 text-label text-brick">
          {message}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? (progress ? t("report.uploading", { done: progress.done, total: progress.total }) : t("report.submitting")) : t("report.submit")}
        </Button>
      </div>
    </form>
  );
}
