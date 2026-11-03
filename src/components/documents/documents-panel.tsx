"use client";

import { Download, FileText, Paperclip, Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useState, useTransition } from "react";
import { deleteDocument, documentDownloadUrl, prepareDocumentUpload, saveDocument, type DocumentState } from "@/actions/documents";
import { FormField } from "@/components/form-field";
import { FormSection } from "@/components/form-section";
import { SelectField } from "@/components/select-field";
import { StatusPill, type Tone } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DOCUMENT_TYPES } from "@/lib/documents";
import { MAX_DOCUMENT_BYTES } from "@/lib/files";

export type DocumentRow = {
  id: string;
  docType: string;
  number: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  expiryHijri: string | null;
  status: "valid" | "expiring" | "expired" | "noExpiry";
  tone: Tone | null;
  hasFile: boolean;
  fileName: string | null;
};

const ACCEPT = ".jpg,.jpeg,.png,.webp,.heic,.pdf,.docx,.xlsx";

/** Documents of one employee: list for everyone allowed to see it, add/delete for whoever manages it. */
export function DocumentsPanel({ employeeId, documents, canManage }: { employeeId: string; documents: DocumentRow[]; canManage: boolean }) {
  const t = useTranslations("documents");
  return (
    <section aria-labelledby="documents-title" className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 md:p-6">
      <div className="flex flex-col gap-1">
        <h2 id="documents-title" className="text-card">
          {t("title")}
        </h2>
        <p className="text-secondary">{t("intro")}</p>
      </div>
      {documents.length === 0 ? (
        <p className="rounded-control border border-dashed border-line p-4 text-secondary">{canManage ? t("emptyManage") : t("empty")}</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {documents.map((d) => (
            <DocumentCard key={d.id} doc={d} canManage={canManage} />
          ))}
        </ul>
      )}
      {canManage && <AddDocumentForm employeeId={employeeId} />}
    </section>
  );
}

function DocumentCard({ doc, canManage }: { doc: DocumentRow; canManage: boolean }) {
  const t = useTranslations("documents");
  const tErrors = useTranslations("errors");
  const locale = useLocale();
  const [opening, startOpening] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [deleteState, remove, removing] = useActionState<DocumentState, FormData>(deleteDocument.bind(null, doc.id), undefined);

  function download() {
    startOpening(async () => {
      const url = await documentDownloadUrl(doc.id, locale);
      if (url) window.location.assign(url);
    });
  }

  return (
    <li className="flex flex-col gap-3 rounded-control border border-line p-4">
      <div className="flex items-start justify-between gap-3">
        <span className="flex items-center gap-2">
          <FileText className="size-5 shrink-0 text-ink-soft" aria-hidden />
          <span className="font-semibold">{t(`types.${doc.docType as "iqama"}`)}</span>
        </span>
        {doc.tone && <StatusPill tone={doc.tone}>{t(`status.${doc.status as "valid"}`)}</StatusPill>}
      </div>
      <dl className="grid grid-cols-2 gap-3 text-secondary">
        <div>
          <dt>{t("number")}</dt>
          <dd className="font-semibold text-ink tabular-nums">{doc.number ? <bdi dir="ltr">{doc.number}</bdi> : "—"}</dd>
        </div>
        <div>
          <dt>{t("issueDate")}</dt>
          <dd className="font-semibold text-ink">{doc.issueDate ?? "—"}</dd>
        </div>
        <div className="col-span-2">
          <dt>{t("expiryDate")}</dt>
          <dd className="font-semibold text-ink">
            {doc.expiryDate ?? "—"}
            {doc.expiryHijri && <span className="ms-2 text-secondary">({doc.expiryHijri})</span>}
          </dd>
        </div>
      </dl>
      <div className="flex flex-wrap gap-2">
        {doc.hasFile && (
          <Button type="button" variant="outline" size="sm" onClick={download} disabled={opening}>
            <Download aria-hidden />
            {t("download")}
          </Button>
        )}
        {canManage &&
          (confirming ? (
            <form action={remove} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="uiLocale" value={locale} />
              <span className="text-label">{t("deleteConfirm")}</span>
              <Button type="submit" variant="destructive" size="sm" disabled={removing}>
                {t("delete")}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                {t("cancel")}
              </Button>
            </form>
          ) : (
            <Button type="button" variant="ghost" size="sm" className="text-brick" onClick={() => setConfirming(true)}>
              <Trash2 aria-hidden />
              {t("delete")}
            </Button>
          ))}
      </div>
      {deleteState && !deleteState.ok && (
        <p role="alert" className="text-label text-brick">
          {tErrors(deleteState.error === "fileType" || deleteState.error === "fileSize" || deleteState.error === "invalid" ? "unexpected" : deleteState.error)}
        </p>
      )}
    </li>
  );
}

function AddDocumentForm({ employeeId }: { employeeId: string }) {
  const t = useTranslations("documents");
  const tErrors = useTranslations("errors");
  const locale = useLocale();
  const [added, setAdded] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [state, action, pending] = useActionState<DocumentState, FormData>(async (prev: DocumentState, fd: FormData) => {
    setUploadError(null);
    // With a file: get a signed upload URL, send the file straight to storage, then let the server
    // verify the stored bytes inside saveDocument.
    const file = fd.get("file");
    fd.delete("file");
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_DOCUMENT_BYTES) return { ok: false, error: "fileSize" };
      const prepared = await prepareDocumentUpload(employeeId, { name: file.name, size: file.size }, locale);
      if (!prepared.ok) return { ok: false, error: prepared.error };
      const body = new FormData();
      body.append("cacheControl", "3600");
      body.append("", file);
      const put = await fetch(prepared.url, { method: "PUT", body, headers: { "x-upsert": "false" } });
      if (!put.ok) {
        setUploadError(t("errors.upload"));
        return undefined;
      }
      fd.set("path", prepared.path);
      fd.set("fileName", file.name);
    }
    const result = await saveDocument(employeeId, prev, fd);
    if (result?.ok) setAdded((n) => n + 1);
    return result;
  }, undefined);

  const message =
    uploadError ??
    (state && !state.ok
      ? state.error === "fileType" || state.error === "fileSize"
        ? t(`errors.${state.error}`)
        : state.error === "invalid"
          ? tErrors("invalid")
          : tErrors(state.error)
      : null);
  const bad = (f: string) => (state && !state.ok && state.fields?.includes(f) ? t(`fields.${f}` as "fields.expiryDate") : undefined);

  return (
    <form key={added} action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="uiLocale" value={locale} />
      <FormSection title={t("add")} description={t("addHint")} className="border-dashed bg-paper/40">
        <SelectField name="docType" label={t("type")} options={DOCUMENT_TYPES.map((d) => ({ value: d, label: t(`types.${d}`) }))} />
        <FormField name="number" label={t("number")} dir="ltr" maxLength={40} />
        <FormField name="issueDate" label={t("issueDate")} type="date" dir="ltr" />
        <FormField name="expiryDate" label={t("expiryDate")} type="date" dir="ltr" error={bad("expiryDate")} />
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="file">{t("file")}</Label>
          <div className="flex items-center gap-2">
            <Paperclip className="size-4 shrink-0 text-ink-soft" aria-hidden />
            <Input id="file" name="file" type="file" accept={ACCEPT} aria-describedby="file-hint" className="h-11 py-2" />
          </div>
          <p id="file-hint" className="text-caption text-ink-soft">
            {t("fileHint")}
          </p>
        </div>
      </FormSection>
      {message && (
        <p role="alert" className="rounded-control border border-brick/30 bg-brick/5 px-3 py-2.5 text-label text-brick">
          {message}
        </p>
      )}
      <div>
        <Button type="submit" disabled={pending}>
          <Plus aria-hidden />
          {pending ? t("saving") : t("save")}
        </Button>
      </div>
    </form>
  );
}
