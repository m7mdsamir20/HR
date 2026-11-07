// HTML building blocks for generated PDFs. Same look as the service report in field-service-saas
// (CLAUDE.md §6.1): A4, header with the company on the start side and the document on the end side
// under a thick accent rule, section bars, a 3-column key/value grid, light tables, status pills.
// Every value that comes from a user goes through esc(); numbers and codes through ltr().
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Locale } from "@/i18n/routing";

/** Escapes text for HTML content and attributes. */
export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** A number, code or date that must keep left-to-right order inside Arabic text. */
export function ltr(value: unknown): string {
  return `<bdi dir="ltr">${esc(value)}</bdi>`;
}

/** A formatted date or phrase that contains words (month names): the browser picks the direction, so Arabic reads right-to-left with its Latin digits intact. */
export function dt(value: unknown): string {
  return `<bdi dir="auto">${esc(value)}</bdi>`;
}

/** Free text: the browser picks the direction per run. */
export function txt(value: unknown): string {
  const v = String(value ?? "").trim();
  return v ? `<bdi dir="auto">${esc(v)}</bdi>` : "—";
}

const FONT_DIR = path.join(process.cwd(), "src/assets/fonts");
const fontCache = new Map<string, string>();

function fontFace(family: string, file: string, weight: number, unicodeRange: string): string {
  let data = fontCache.get(file);
  if (!data) {
    data = readFileSync(path.join(FONT_DIR, file)).toString("base64");
    fontCache.set(file, data);
  }
  return `@font-face{font-family:'${family}';font-weight:${weight};font-style:normal;src:url(data:font/woff2;base64,${data}) format('woff2');unicode-range:${unicodeRange}}`;
}

const ARABIC_RANGE = "U+0600-06FF,U+0750-077F,U+08A0-08FF,U+FB50-FDFF,U+FE70-FEFF,U+200C-200F,U+2010-2011,U+204F,U+2E41";
const LATIN_RANGE = "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";

/** The fonts as data: URIs, so the document needs no network (the renderer blocks every request). */
function fontCss(): string {
  return [400, 600]
    .flatMap((w) => [
      fontFace("Plex", `ibm-plex-sans-arabic-arabic-${w}-normal.woff2`, w, ARABIC_RANGE),
      fontFace("Plex", `ibm-plex-sans-arabic-latin-${w}-normal.woff2`, w, LATIN_RANGE),
      fontFace("InterEmbedded", `inter-latin-${w}-normal.woff2`, w, LATIN_RANGE),
    ])
    .join("");
}

// The same tokens as the app (globals.css), in print form.
const COLORS = { ink: "#18233d", soft: "#4a5875", line: "#dde2ea", paper: "#f6f7f9", indigo: "#2f4a9e", stamp: "#1f7a55", saffron: "#c98a1b", brick: "#b23a2b" };

const CSS = `
@page{size:A4}
*{box-sizing:border-box}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;color:${COLORS.ink};font-size:9.5pt;line-height:1.55}
body.ar{font-family:'Plex','InterEmbedded',sans-serif}
body.en{font-family:'InterEmbedded','Plex',sans-serif}
.doc-head{display:flex;justify-content:space-between;align-items:center;gap:16px;padding-bottom:12px;border-bottom:2.5px solid ${COLORS.indigo};margin-bottom:16px}
.brand-info{flex:1.1;text-align:start;min-width:0}
.brand-info .company-name{font-size:12.5pt;font-weight:700;color:${COLORS.ink};margin-bottom:2px}
.brand-info .company-meta{color:${COLORS.soft};font-size:7.8pt;line-height:1.35}
.doc-meta-center{flex:1.1;text-align:center}
.doc-meta-center .doc-title{font-size:13.5pt;font-weight:700;color:${COLORS.indigo};margin-bottom:3px}
.doc-meta-center .doc-sub{color:${COLORS.soft};font-size:8pt;line-height:1.4}
.brand-logo{flex:1.1;display:flex;justify-content:flex-end;align-items:center;min-width:0}
.brand-logo img{max-width:180px;max-height:95px;width:auto;height:auto;object-fit:contain;border:none;border-radius:0;padding:0;background:transparent}
.emp-hero{display:flex;justify-content:space-between;align-items:center;background:${COLORS.paper};border:1px solid ${COLORS.line};border-radius:8px;padding:10px 14px;margin-bottom:12px;break-inside:avoid}
.emp-hero-main{display:flex;flex-direction:column;gap:3px}
.emp-hero .emp-name{font-size:14pt;font-weight:700;color:${COLORS.ink}}
.emp-hero .emp-subtitle{display:flex;align-items:center;gap:6px;font-size:8.8pt;color:${COLORS.soft}}
.emp-hero .emp-job{font-weight:600;color:${COLORS.indigo}}
.emp-hero .emp-dot{color:${COLORS.line}}
.emp-hero-badges{display:flex;align-items:center;gap:8px}
.emp-code{font-family:'InterEmbedded',monospace;font-size:8.8pt;font-weight:700;background:#fff;border:1px solid ${COLORS.line};border-radius:6px;padding:2px 8px;color:${COLORS.ink}}
h2{display:flex;align-items:center;gap:8px;font-size:10.5pt;font-weight:700;margin:14px 0 6px;color:${COLORS.indigo};break-after:avoid}
h2::before{content:"";width:4px;height:13px;background:${COLORS.indigo};border-radius:2px}
.grid3{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid ${COLORS.line};border-radius:8px;overflow:hidden;background:#fff}
.grid3 .cell{padding:6px 10px;border-bottom:1px solid ${COLORS.line};border-inline-end:1px solid ${COLORS.line}}
.grid3 .cell .k{color:${COLORS.soft};font-size:7.5pt;margin-bottom:1px}
.grid3 .cell .v{font-weight:600;font-size:8.8pt;color:${COLORS.ink}}
.grid3 .cell.wide{grid-column:span 3}
.card{border:1px solid ${COLORS.line};border-radius:8px;padding:10px 12px;break-inside:avoid;margin-bottom:10px}
.card .round{display:flex;justify-content:space-between;color:${COLORS.soft};font-size:8.5pt;margin-bottom:4px}
.card p{margin:3px 0;white-space:pre-line}
table{width:100%;border-collapse:collapse;border:1px solid ${COLORS.line};border-radius:8px;overflow:hidden;background:#fff;font-size:8.8pt}
th{background:${COLORS.paper};color:${COLORS.soft};font-weight:600;font-size:8pt;text-align:start;padding:6px 9px;border-bottom:1px solid ${COLORS.line}}
td{padding:6px 9px;border-bottom:1px solid ${COLORS.line};vertical-align:middle}
tr{break-inside:avoid}
tr.total-row td{background:#f0f4fc;font-weight:700;color:${COLORS.indigo}}
.pill{display:inline-flex;align-items:center;gap:5px;border-radius:999px;padding:1px 9px;font-size:8.5pt;font-weight:600;white-space:nowrap}
.pill::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor}
.pill.stamp{background:#1f7a5518;color:${COLORS.stamp}}
.pill.saffron{background:#c98a1b1f;color:${COLORS.saffron}}
.pill.brick{background:#b23a2b18;color:${COLORS.brick}}
.pill.indigo{background:#2f4a9e18;color:${COLORS.indigo}}
.pill.neutral{background:#4a587518;color:${COLORS.soft}}
.photos{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:6px}
.photos figure{margin:0;break-inside:avoid}
.photos img{width:100%;height:120px;object-fit:cover;border:1px solid ${COLORS.line};border-radius:6px}
.photos figcaption{font-size:8pt;color:${COLORS.soft};overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.stamp-block{display:flex;align-items:center;gap:14px;border:1px solid #1f7a5540;background:#1f7a550d;border-radius:8px;padding:10px 14px;break-inside:avoid;margin:12px 0}
.stamp-block svg{flex-shrink:0;transform:rotate(-6deg)}
.stamp-box{display:inline-block;padding:3px 4px;border:2.5px solid ${COLORS.stamp};border-radius:6px;transform:rotate(-3deg);background:${COLORS.stamp}0d;break-inside:avoid}
.stamp-box-inner{padding:6px 24px;border:1.5px dashed ${COLORS.stamp};border-radius:3px;color:${COLORS.stamp};font-size:15pt;font-weight:800;letter-spacing:2px;text-align:center;line-height:1.2}
.stamp-footer{display:flex;justify-content:flex-end;align-items:center;margin-top:28px;padding-top:12px;break-inside:avoid}
.note{border-radius:6px;padding:6px 10px;margin-top:6px;border:1px solid ${COLORS.line}}
.note.ok{border-color:#1f7a5540;background:#1f7a550d}
.note.bad{border-color:#b23a2b40;background:#b23a2b0d}
.muted{color:${COLORS.soft}}
a{color:${COLORS.indigo};text-decoration:none;word-break:break-all}
`;

export type Brand = {
  name: string;
  legal?: string | null;
  commercialReg?: string | null;
  taxNumber?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  logoDataUri: string | null;
};

/** The page shell: fonts, styles, header. `body` is the document's own sections. */
export function documentHtml(opts: {
  locale: Locale;
  brand: Brand;
  title: string;
  numberLabel?: string;
  number?: string;
  issuedLabel: string;
  issued: string;
  body: string;
  hideNumber?: boolean;
}): string {
  const { locale, brand } = opts;
  return `<!doctype html>
<html lang="${locale}" dir="${locale === "ar" ? "rtl" : "ltr"}">
<head><meta charset="utf-8"><title>${esc(opts.title)}</title><style>${fontCss()}${CSS}</style></head>
<body class="${locale}">
  <header class="doc-head">
    <div class="brand-info">
      <div class="company-name">${txt(brand.name)}</div>
      ${brand.commercialReg ? `<div class="company-meta">${txt(brand.commercialReg)}</div>` : brand.legal ? `<div class="company-meta">${txt(brand.legal)}</div>` : ""}
      ${brand.taxNumber ? `<div class="company-meta">${txt(brand.taxNumber)}</div>` : ""}
      ${brand.phone ? `<div class="company-meta">${txt(brand.phone)}</div>` : ""}
      ${brand.email ? `<div class="company-meta">${txt(brand.email)}</div>` : ""}
      ${brand.address ? `<div class="company-meta">${txt(brand.address)}</div>` : ""}
    </div>
    <div class="doc-meta-center">
      <div class="doc-title">${esc(opts.title)}</div>
      ${!opts.hideNumber && opts.number && opts.numberLabel ? `<div class="doc-sub">${esc(opts.numberLabel)}: ${ltr(opts.number)}</div>` : ""}
      <div class="doc-sub">${esc(opts.issuedLabel)}: ${opts.issued}</div>
    </div>
    <div class="brand-logo">
      ${brand.logoDataUri ? `<img src="${esc(brand.logoDataUri)}" alt="">` : ""}
    </div>
  </header>
  ${opts.body}
</body></html>`;
}

export function pill(tone: "stamp" | "saffron" | "brick" | "indigo" | "neutral", label: string): string {
  return `<span class="pill ${tone}">${esc(label)}</span>`;
}

/** Key/value cells for the 3-column grid. Values are already-safe HTML. */
export function grid(cells: { label: string; value: string; wide?: boolean }[]): string {
  return `<div class="grid3">${cells
    .map((c) => `<div class="cell${c.wide ? " wide" : ""}"><div class="k">${esc(c.label)}</div><div class="v">${c.value || "—"}</div></div>`)
    .join("")}</div>`;
}

/** The approval stamp as inline SVG: ring, rating, label (print version of the app's stamp). */
export function stampSvg(label: string, rating: number): string {
  return `<svg width="92" height="92" viewBox="0 0 92 92" role="img" aria-label="${esc(label)} ${rating}/5">
    <circle cx="46" cy="46" r="43" fill="none" stroke="${COLORS.stamp}" stroke-width="3"/>
    <circle cx="46" cy="46" r="36" fill="none" stroke="${COLORS.stamp}" stroke-opacity=".6" stroke-width="1"/>
    <text x="46" y="40" text-anchor="middle" font-size="${label.length > 6 ? 10 : 13}" font-weight="600" fill="${COLORS.stamp}">${esc(label)}</text>
    <text x="46" y="62" text-anchor="middle" font-size="20" font-weight="600" fill="${COLORS.stamp}" direction="ltr">${rating}/5</text>
  </svg>`;
}

/** Rectangular approval stamp without rating or circular frame */
export function stampBoxHtml(label: string): string {
  return `<div class="stamp-footer"><div class="stamp-box"><div class="stamp-box-inner">${esc(label)}</div></div></div>`;
}
