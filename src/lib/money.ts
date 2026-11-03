// Amounts and bank details typed on Arabic or Latin keyboards.

const ARABIC_INDIC_ZERO = 0x0660;
const EXTENDED_ARABIC_INDIC_ZERO = 0x06f0;

/** "١٢٬٥٠٠٫٧٥" or "12,500.75" → "12500.75". Returns "" for blank input. */
export function normalizeAmount(input: string): string {
  let out = "";
  for (const ch of input.trim()) {
    const code = ch.codePointAt(0)!;
    if (code >= ARABIC_INDIC_ZERO && code <= ARABIC_INDIC_ZERO + 9) out += String(code - ARABIC_INDIC_ZERO);
    else if (code >= EXTENDED_ARABIC_INDIC_ZERO && code <= EXTENDED_ARABIC_INDIC_ZERO + 9) out += String(code - EXTENDED_ARABIC_INDIC_ZERO);
    else if (ch === "٫") out += ".";
    else if (ch === "," || ch === "٬" || ch === " ") continue;
    else out += ch;
  }
  return out;
}

/** A Saudi IBAN without spaces, upper-cased. */
export function normalizeIban(input: string): string {
  return normalizeAmount(input).replace(/\s/g, "").toUpperCase();
}

/** SA + 22 digits, with a valid ISO 13616 check (mod 97). */
export function isValidSaudiIban(iban: string): boolean {
  if (!/^SA\d{22}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const digits = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let remainder = 0;
  for (const d of digits) remainder = (remainder * 10 + Number(d)) % 97;
  return remainder === 1;
}

/** "12500.5" → "12,500.50" (Latin digits in both languages, CLAUDE.md §6). */
export function formatAmount(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number.isFinite(n) ? n : 0);
}
