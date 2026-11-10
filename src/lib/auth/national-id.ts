// National ID / Iqama handling for login and account creation (CLAUDE.md §3).
// Format check only: 10 digits, starting with 1 (citizen) or 2 (resident). No identity verification.

export type IdType = "citizen" | "resident";

const ARABIC_INDIC_ZERO = 0x0660; // ٠
const EXTENDED_ARABIC_INDIC_ZERO = 0x06f0; // ۰ (Persian/Urdu keyboards)

/** Converts Arabic-Indic and Persian digits to 0-9 and drops spaces, dashes and bidi marks. */
export function normalizeNationalId(input: string): string {
  let out = "";
  for (const ch of input) {
    const code = ch.codePointAt(0)!;
    if (code >= ARABIC_INDIC_ZERO && code <= ARABIC_INDIC_ZERO + 9) out += String(code - ARABIC_INDIC_ZERO);
    else if (code >= EXTENDED_ARABIC_INDIC_ZERO && code <= EXTENDED_ARABIC_INDIC_ZERO + 9)
      out += String(code - EXTENDED_ARABIC_INDIC_ZERO);
    else if (/[\s\-‎‏؜]/u.test(ch)) continue;
    else out += ch;
  }
  return out;
}

export function isValidNationalId(id: string): boolean {
  return /^[127]\d{9}$/.test(id);
}

export function idTypeOf(id: string): IdType {
  return id.startsWith("2") ? "resident" : "citizen";
}

/**
 * Supabase Auth needs an email, so each account gets an internal one derived from the ID.
 * `.invalid` is reserved (RFC 2606): it can never receive mail. Users never see or type it.
 */
export function authEmailFor(id: string): string {
  if (!isValidNationalId(id)) throw new Error("Invalid national ID");
  return `${id}@users.invalid`;
}
