import "server-only";
import { existsSync } from "node:fs";
import path from "node:path";
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
    chromium.setGraphicsMode = false;
    const binPath = path.join(process.cwd(), "node_modules/@sparticuz/chromium/bin");
    const executablePath = existsSync(binPath)
      ? await chromium.executablePath(binPath)
      : await chromium.executablePath();
    return {
      executablePath,
      args: [...chromium.args, "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--single-process"],
      headless: "shell" as const,
    };
  }
  const executablePath = LOCAL_BROWSERS.find((p) => p && existsSync(p));
  if (!executablePath) throw new Error("No Chrome found for PDF rendering; set CHROME_PATH");
  return { executablePath, args: ["--no-sandbox"], headless: true as const };
}

const RENDER_TIMEOUT_MS = 30_000;

/**
 * Renders a self-contained HTML document to an A4 PDF with 14 mm margins and a footer carrying the
 * document number on one side and "page X of Y" on the other. Every network request from the page
 * is refused, so a value can't make the renderer fetch anything (no SSRF) and nothing depends on
 * fonts installed on the server.
 */
export async function renderPdf(
  html: string,
  opts: { locale: Locale; footerLabel: string; pageLabel: string; ofLabel: string; landscape?: boolean }
): Promise<Buffer> {
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

    const isLandscape = opts.landscape ?? false;
    const padding = isLandscape ? "10mm" : "14mm";
    const footerStyle = `font-family:Arial,sans-serif;font-size:8px;color:#4a5875;width:100%;padding:0 ${padding};display:flex;justify-content:space-between`;
    const pdf = await page.pdf({
      format: "A4",
      landscape: isLandscape,
      printBackground: true,
      margin: isLandscape
        ? { top: "10mm", bottom: "12mm", left: "10mm", right: "10mm" }
        : { top: "14mm", bottom: "16mm", left: "14mm", right: "14mm" },
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: `<div style="${footerStyle}" dir="${opts.locale === "ar" ? "rtl" : "ltr"}"><span>${esc(opts.footerLabel)}</span><span>${esc(opts.pageLabel)} <span class="pageNumber"></span> ${esc(opts.ofLabel)} <span class="totalPages"></span></span></div>`,
      timeout: RENDER_TIMEOUT_MS,
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
