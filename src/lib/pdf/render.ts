import "server-only";
import { existsSync } from "node:fs";
import type { Locale } from "@/i18n/routing";
import { esc } from "./html";

// HTML → PDF in Chromium, so Arabic, RTL and mixed text come out exactly as in a browser
// (CLAUDE.md §6.1). On Vercel the browser is @sparticuz/chromium; locally it's the Chrome or Edge
// already installed (or CHROME_PATH).

const LOCAL_BROWSERS = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
];

async function launchOptions() {
  if (process.env.VERCEL) {
    const { default: chromium } = await import("@sparticuz/chromium");
    return { executablePath: await chromium.executablePath(), args: chromium.args, headless: true as const };
  }
  const executablePath = LOCAL_BROWSERS.find((p) => p && existsSync(p));
  if (!executablePath) throw new Error("No Chrome found for PDF rendering; set CHROME_PATH");
  return { executablePath, args: ["--no-sandbox"], headless: true as const };
}

const RENDER_TIMEOUT_MS = 30_000;

function withPrintScript(html: string, locale: Locale): string {
  const isAr = locale === "ar";
  const printBar = `
<div class="print-toolbar no-print" style="position:sticky;top:0;left:0;right:0;background:#18233d;color:#ffffff;padding:12px 24px;display:flex;justify-content:space-between;align-items:center;box-shadow:0 4px 12px rgba(0,0,0,0.15);z-index:999999;font-family:system-ui,-apple-system,sans-serif;font-size:14px;">
  <div style="display:flex;align-items:center;gap:12px;">
    <span style="font-size:20px;">🖨️</span>
    <span style="font-weight:600;font-size:15px;">${isAr ? "جاهز للطباعة والحفظ" : "Ready to Print & Save"}</span>
    <span style="opacity:0.75;font-size:13px;">${isAr ? "(اضغط الزر أو استخدم Ctrl + P)" : "(Use button or Ctrl + P)"}</span>
  </div>
  <div style="display:flex;gap:10px;">
    <button onclick="window.print()" style="background:#2f4a9e;color:#fff;border:none;padding:8px 20px;border-radius:6px;cursor:pointer;font-weight:bold;font-size:14px;">
      ${isAr ? "طباعة المستند الآن" : "Print Document Now"}
    </button>
    <button onclick="window.close()" style="background:#4a5875;color:#fff;border:none;padding:8px 14px;border-radius:6px;cursor:pointer;font-size:13px;">
      ${isAr ? "إغلاق" : "Close"}
    </button>
  </div>
</div>
<style>
  @media print {
    .no-print { display: none !important; }
    body { margin: 0 !important; padding: 0 !important; }
  }
  @media screen {
    body { background: #eef2f6 !important; }
    body > *:not(.print-toolbar) {
      max-width: 210mm;
      margin: 24px auto !important;
      background: #ffffff !important;
      padding: 16mm 16mm 18mm 16mm !important;
      box-shadow: 0 4px 20px rgba(0,0,0,0.08) !important;
      border-radius: 8px !important;
    }
  }
</style>
<script>
  window.addEventListener('load', function() {
    setTimeout(function() {
      try { window.print(); } catch (e) {}
    }, 400);
  });
</script>
`;
  return html.replace(/<body([^>]*)>/i, `<body$1>${printBar}`);
}

/**
 * Renders a self-contained HTML document to an A4 PDF with 14 mm margins and a footer carrying the
 * document number on one side and "page X of Y" on the other. Every network request from the page
 * is refused, so a value can't make the renderer fetch anything (no SSRF) and nothing depends on
 * fonts installed on the server.
 * If Chromium / Puppeteer fails, falls back gracefully to a printable HTML view.
 */
export async function renderPdf(html: string, opts: { locale: Locale; footerLabel: string; pageLabel: string; ofLabel: string }): Promise<Buffer> {
  try {
    const { default: puppeteer } = await import("puppeteer-core");
    const browser = await puppeteer.launch(await launchOptions());
    try {
      const page = await browser.newPage();
      page.setDefaultTimeout(RENDER_TIMEOUT_MS);
      await page.setRequestInterception(true);
      page.on("request", (request) => {
        const url = request.url();
        if (url.startsWith("data:") || url === "about:blank") void request.continue();
        else void request.abort();
      });
      await page.setJavaScriptEnabled(false);
      await page.setContent(html, { waitUntil: "load" });
      await page.evaluateHandle("document.fonts.ready");

      const footerStyle = "font-family:Arial,sans-serif;font-size:8px;color:#4a5875;width:100%;padding:0 14mm;display:flex;justify-content:space-between";
      const pdf = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "14mm", bottom: "16mm", left: "14mm", right: "14mm" },
        displayHeaderFooter: true,
        headerTemplate: "<span></span>",
        footerTemplate: `<div style="${footerStyle}" dir="${opts.locale === "ar" ? "rtl" : "ltr"}"><span>${esc(opts.footerLabel)}</span><span>${esc(opts.pageLabel)} <span class="pageNumber"></span> ${esc(opts.ofLabel)} <span class="totalPages"></span></span></div>`,
        timeout: RENDER_TIMEOUT_MS,
      });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  } catch (err) {
    console.error("PDF generation via headless Chromium failed, using printable HTML fallback:", err);
    return Buffer.from(withPrintScript(html, opts.locale), "utf-8");
  }
}
