// Password suggestions for managers who set a password and read it out to the employee.
// No look-alike characters (0/O, 1/l/I).
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

export function suggestPassword(length = 12): string {
  const bytes = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}
