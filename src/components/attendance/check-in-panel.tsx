"use client";

import { CircleCheck, LogIn, LogOut, MapPin } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { checkIn, checkOut } from "@/actions/attendance";
import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import type { Location } from "@/lib/validation/attendance";

export type PanelState = "noShift" | "dayOff" | "holiday" | "shiftOver" | "ready" | "in" | "done";

type Props = {
  state: PanelState;
  holidayName?: string;
  shiftName?: string;
  branchName?: string;
  windowText?: string;
  ramadanHours?: number;
  checkInTime?: string;
  checkOutTime?: string;
  lateMinutes?: number;
  outside?: boolean;
  noLocation?: boolean;
};

const NO_LOCATION: Location = { lat: null, lng: null, accuracy: null };

/** Asks the browser for the position once; a refusal or timeout isn't an error, it just records no position. */
function currentLocation(): Promise<Location> {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) return Promise.resolve(NO_LOCATION);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) }),
      () => resolve(NO_LOCATION),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
  });
}

/** The day's one action: record arrival or departure with the current position. */
export function CheckInPanel(props: Props) {
  const t = useTranslations("attendance.panel");
  const tErrors = useTranslations("errors");
  const tAttendance = useTranslations("attendance.errors");
  const locale = useLocale();
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<{ tone: "ok" | "warn" | "error"; text: string }>();

  function run(kind: "in" | "out") {
    setNotice(undefined);
    start(async () => {
      const location = await currentLocation();
      const result = await (kind === "in" ? checkIn : checkOut)(locale, location);
      if (!result?.ok) {
        const key = result?.error ?? "unexpected";
        setNotice({ tone: "error", text: tAttendance.has(key) ? tAttendance(key) : tErrors(key as "unexpected") });
      } else if (location.lat === null) {
        setNotice({ tone: "warn", text: t("noLocationNotice") });
      } else if (result.outside) {
        setNotice({ tone: "warn", text: t("outsideNotice") });
      } else {
        setNotice({ tone: "ok", text: kind === "in" ? t("checkedInDone") : t("checkedOutDone") });
      }
    });
  }

  const { state } = props;
  const message =
    state === "noShift"
      ? t("noShift")
      : state === "dayOff"
        ? t("dayOff")
        : state === "holiday"
          ? t("holiday", { name: props.holidayName ?? "" })
          : state === "shiftOver"
            ? t("shiftOver")
            : undefined;

  return (
    <section className="flex flex-col gap-5 rounded-card border border-line bg-surface p-4 md:p-6" aria-labelledby="today-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="today-heading" className="text-section">
            {t("today")}
          </h2>
          {props.shiftName && (
            <p className="text-secondary">
              {props.shiftName} · <bdi dir="ltr">{props.windowText}</bdi>
              {props.branchName ? ` · ${props.branchName}` : ""}
            </p>
          )}
          {props.ramadanHours !== undefined && <p className="text-secondary">{t("ramadan", { hours: props.ramadanHours })}</p>}
        </div>
        {state === "in" || state === "done" ? (
          <span className="flex flex-wrap gap-2">
            {props.lateMinutes ? <StatusPill tone="brick">{t("late", { minutes: props.lateMinutes })}</StatusPill> : <StatusPill tone="stamp">{t("onTime")}</StatusPill>}
            {props.outside && <StatusPill tone="saffron">{t("outside")}</StatusPill>}
            {props.noLocation && <StatusPill tone="saffron">{t("noLocation")}</StatusPill>}
          </span>
        ) : null}
      </div>

      {message && <p className="rounded-control bg-paper p-4">{message}</p>}

      {(state === "in" || state === "done") && (
        <dl className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-0.5">
            <dt className="text-secondary">{t("arrival")}</dt>
            <dd className="text-section tabular-nums">
              <bdi dir="ltr">{props.checkInTime}</bdi>
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-secondary">{t("departure")}</dt>
            <dd className="text-section tabular-nums">{props.checkOutTime ? <bdi dir="ltr">{props.checkOutTime}</bdi> : "—"}</dd>
          </div>
        </dl>
      )}

      {(state === "ready" || state === "in") && (
        <div className="flex flex-col gap-3">
          <Button type="button" size="lg" className="h-14 w-full text-card sm:w-fit sm:min-w-64" disabled={pending} onClick={() => run(state === "ready" ? "in" : "out")}>
            {state === "ready" ? <LogIn aria-hidden /> : <LogOut aria-hidden />}
            {pending ? t("locating") : state === "ready" ? t("checkIn") : t("checkOut")}
          </Button>
          <p className="flex items-center gap-1.5 text-secondary">
            <MapPin className="size-4 shrink-0" aria-hidden />
            {t("locationNote")}
          </p>
        </div>
      )}

      {state === "done" && (
        <p className="flex items-center gap-2 text-stamp">
          <CircleCheck className="size-5 shrink-0" aria-hidden />
          {t("doneForToday")}
        </p>
      )}

      {notice && (
        <p
          role={notice.tone === "error" ? "alert" : "status"}
          className={notice.tone === "error" ? "text-label text-brick" : notice.tone === "warn" ? "text-label text-saffron" : "text-label text-stamp"}
        >
          {notice.text}
        </p>
      )}
    </section>
  );
}
