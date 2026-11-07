import type { Locale } from "@/i18n/routing";

export type IqamaTone = "brick" | "saffron" | "stamp" | "neutral";

export type IqamaInfo = {
  isCitizen: boolean;
  iqamaEnd: string | null;
  daysRemaining: number | null;
  isExpired: boolean;
  isExpiringSoon: boolean;
  badgeText: string;
  subText: string | null;
  tone: IqamaTone;
  statusKey: "expired" | "today" | "expiring_soon" | "valid" | "not_set" | "citizen";
};

export function parseExpiryDays(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const parts = dateStr.split("-").map((v) => parseInt(v, 10));
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  if (y === undefined || m === undefined || d === undefined || isNaN(y) || isNaN(m) || isNaN(d)) {
    return null;
  }
  const expiryUtc = Date.UTC(y, m - 1, d);
  const now = new Date();
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((expiryUtc - todayUtc) / (1000 * 60 * 60 * 24));
}

export function getIqamaInfo(
  idType: string | null,
  iqamaEnd: string | null,
  locale: Locale,
): IqamaInfo {
  if (idType === "citizen" && !iqamaEnd) {
    return {
      isCitizen: true,
      iqamaEnd: null,
      daysRemaining: null,
      isExpired: false,
      isExpiringSoon: false,
      badgeText: locale === "ar" ? "مواطن" : "Citizen",
      subText: null,
      tone: "neutral",
      statusKey: "citizen",
    };
  }

  if (!iqamaEnd) {
    return {
      isCitizen: false,
      iqamaEnd: null,
      daysRemaining: null,
      isExpired: false,
      isExpiringSoon: false,
      badgeText: locale === "ar" ? "غير مسجل" : "Not set",
      subText: locale === "ar" ? "لم يُسجل تاريخ الانتهاء" : "No expiry date",
      tone: "neutral",
      statusKey: "not_set",
    };
  }

  const diffDays = parseExpiryDays(iqamaEnd);
  if (diffDays === null) {
    return {
      isCitizen: false,
      iqamaEnd,
      daysRemaining: null,
      isExpired: false,
      isExpiringSoon: false,
      badgeText: locale === "ar" ? "تاريخ غير صالح" : "Invalid date",
      subText: null,
      tone: "neutral",
      statusKey: "not_set",
    };
  }

  if (diffDays < 0) {
    const abs = Math.abs(diffDays);
    return {
      isCitizen: false,
      iqamaEnd,
      daysRemaining: diffDays,
      isExpired: true,
      isExpiringSoon: true,
      badgeText: locale === "ar" ? `منتهية (منذ ${abs} يوم)` : `Expired (${abs}d ago)`,
      subText: locale === "ar" ? `انتهت في ${iqamaEnd}` : `Expired on ${iqamaEnd}`,
      tone: "brick",
      statusKey: "expired",
    };
  }

  if (diffDays === 0) {
    return {
      isCitizen: false,
      iqamaEnd,
      daysRemaining: 0,
      isExpired: false,
      isExpiringSoon: true,
      badgeText: locale === "ar" ? "تنتهي اليوم" : "Expires today",
      subText: locale === "ar" ? "تنتهي اليوم" : "Expires today",
      tone: "brick",
      statusKey: "today",
    };
  }

  // Near expiry: within 60 days -> RED, showing remaining days
  if (diffDays <= 60) {
    return {
      isCitizen: false,
      iqamaEnd,
      daysRemaining: diffDays,
      isExpired: false,
      isExpiringSoon: true,
      badgeText: locale === "ar" ? `متبقي ${diffDays} يوم على انتهاء الإقامة` : `${diffDays} days left until expiry`,
      subText: locale === "ar" ? `تنتهي في ${iqamaEnd}` : `Expires on ${iqamaEnd}`,
      tone: "brick",
      statusKey: "expiring_soon",
    };
  }

  // Valid (> 60 days)
  return {
    isCitizen: false,
    iqamaEnd,
    daysRemaining: diffDays,
    isExpired: false,
    isExpiringSoon: false,
    badgeText: locale === "ar" ? `سارية (متبقي ${diffDays} يوم)` : `Valid (${diffDays}d)`,
    subText: locale === "ar" ? `تنتهي في ${iqamaEnd}` : `Expires on ${iqamaEnd}`,
    tone: "stamp",
    statusKey: "valid",
  };
}
