// File type detection from content (magic bytes), never from the name or the browser's claim.
// Allowed types: CLAUDE.md §5.14. SVG and HTML are never accepted.

export type FileKind = { mime: string; ext: "jpg" | "png" | "webp" | "heic" | "pdf" | "docx" | "xlsx" };

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const MAX_LOGO_BYTES = 512 * 1024;

const startsWith = (b: Uint8Array, sig: number[], offset = 0) => sig.every((v, i) => b[offset + i] === v);
const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.subarray(from, to));

const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"]);

/** Finds an ASCII marker anywhere in the bytes (used for the OOXML part names inside the zip). */
function contains(b: Uint8Array, marker: string): boolean {
  const codes = Array.from(marker, (c) => c.charCodeAt(0));
  outer: for (let i = 0; i <= b.length - codes.length; i++) {
    for (let j = 0; j < codes.length; j++) if (b[i + j] !== codes[j]) continue outer;
    return true;
  }
  return false;
}

export function sniffFile(bytes: Uint8Array): FileKind | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { mime: "image/jpeg", ext: "jpg" };
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: "image/png", ext: "png" };
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return { mime: "image/webp", ext: "webp" };
  if (ascii(bytes, 4, 8) === "ftyp" && HEIC_BRANDS.has(ascii(bytes, 8, 12))) return { mime: "image/heic", ext: "heic" };
  if (ascii(bytes, 0, 5) === "%PDF-") return { mime: "application/pdf", ext: "pdf" };
  // Word and Excel files are zip archives; tell them apart by their main part, so an arbitrary zip
  // (or any other container) is refused.
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    if (contains(bytes, "word/document.xml"))
      return { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ext: "docx" };
    if (contains(bytes, "xl/workbook.xml"))
      return { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ext: "xlsx" };
  }
  return null;
}

/** Logos: raster images only. */
export function sniffLogo(bytes: Uint8Array): FileKind | null {
  const kind = sniffFile(bytes);
  return kind && (kind.ext === "png" || kind.ext === "jpg" || kind.ext === "webp") ? kind : null;
}

/** A display name safe to store and show: no paths, no control characters, bounded length. */
export function cleanFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  return base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "").trim().slice(0, 200) || "file";
}
