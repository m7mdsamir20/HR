// Nationalities offered in the employee file: the workforce common in Saudi Arabia first, then the
// rest of the region and beyond. Names come from the browser/runtime (Intl.DisplayNames), so both
// languages are covered without a translation table.
export const NATIONALITY_CODES = [
  "SA", "EG", "IN", "PK", "BD", "PH", "YE", "SD", "JO", "SY", "LB", "PS", "IQ", "NP", "LK", "ID",
  "AF", "MM", "KE", "ET", "UG", "NG", "GH", "ER", "SO", "DJ", "TZ", "TN", "MA", "DZ", "LY", "MR",
  "AE", "KW", "QA", "BH", "OM", "TR", "IR", "MY", "TH", "VN", "CN", "US", "GB", "CA", "AU", "FR",
  "DE", "IT", "ES", "NL", "ZA",
] as const;

export function nationalityOptions(locale: string): { value: string; label: string }[] {
  const names = new Intl.DisplayNames([locale], { type: "region" });
  return NATIONALITY_CODES.map((code) => ({ value: code, label: names.of(code) ?? code })).sort((a, b) =>
    a.value === "SA" ? -1 : b.value === "SA" ? 1 : a.label.localeCompare(b.label, locale),
  );
}

export function nationalityName(locale: string, code: string | null | undefined): string | null {
  if (!code) return null;
  return new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? code;
}
