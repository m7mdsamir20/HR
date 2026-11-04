"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState, useMemo, useState } from "react";
import { assignShift, type AttendanceState } from "@/actions/attendance";
import { SelectField } from "@/components/select-field";
import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";

type Person = { id: string; name: string; departmentId: string | null; branch: string | null; shift: string | null };
type Option = { value: string; label: string };

/** Assign a branch and shift to many employees at once; pick by department or tick people. */
export function AssignForm({ people, departments, branches, shifts }: { people: Person[]; departments: Option[]; branches: Option[]; shifts: Option[] }) {
  const t = useTranslations("attendance.assign");
  const tErrors = useTranslations("errors");
  const tAttendance = useTranslations("attendance.errors");
  const locale = useLocale();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [department, setDepartment] = useState("");
  const [state, action, pending] = useActionState<AttendanceState, FormData>(assignShift, undefined);
  const visible = useMemo(() => (department ? people.filter((p) => p.departmentId === department) : people), [people, department]);
  const none = { value: "", label: t("none") };

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const selectVisible = () => setSelected((prev) => new Set([...prev, ...visible.map((p) => p.id)]));
  const error =
    state && !state.ok ? (state.error === "invalid" ? t("invalid") : tAttendance.has(state.error) ? tAttendance(state.error) : tErrors(state.error as "unexpected")) : undefined;

  return (
    <section className="flex flex-col gap-4" aria-labelledby="assign-heading">
      <div className="flex flex-col gap-1">
        <h2 id="assign-heading" className="text-section">
          {t("title")}
        </h2>
        <p className="text-secondary">{t("intro")}</p>
      </div>
      <form action={action} className="flex flex-col gap-5 rounded-card border border-line bg-surface p-4 md:p-6" noValidate>
        <input type="hidden" name="uiLocale" value={locale} />
        {[...selected].map((id) => (
          <input key={id} type="hidden" name="employeeIds" value={id} />
        ))}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <SelectField name="branchId" label={t("branch")} options={[none, ...branches]} />
          <SelectField name="shiftId" label={t("shift")} options={[none, ...shifts]} />
          <SelectField label={t("department")} name="department" value={department} onChange={(e) => setDepartment(e.target.value)} options={[{ value: "", label: t("allDepartments") }, ...departments]} />
          <div className="flex flex-wrap items-end gap-2">
            <Button type="button" variant="secondary" onClick={selectVisible}>
              {t("selectAll")}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setSelected(new Set())}>
              {t("clear")}
            </Button>
          </div>
        </div>

        {visible.length === 0 ? (
          <p className="text-secondary">{t("noPeople")}</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {visible.map((p) => (
              <li key={p.id}>
                <label className="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-control border border-line px-3 py-2 has-[:checked]:border-indigo has-[:checked]:bg-indigo/10">
                  <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} className="mt-1 size-4 accent-indigo" />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-label">{p.name}</span>
                    <span className="text-caption text-ink-soft">{p.shift ? `${p.shift}${p.branch ? ` · ${p.branch}` : ""}` : t("unassigned")}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending || selected.size === 0}>
            {t("submit", { count: selected.size })}
          </Button>
          {state?.ok && <StatusPill tone="stamp">{t("saved")}</StatusPill>}
          {error && (
            <p role="alert" className="text-label text-brick">
              {error}
            </p>
          )}
        </div>
      </form>
    </section>
  );
}
