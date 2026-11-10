import { describe, expect, it } from "vitest";
import { documentHtml, dt, esc, grid, ltr, stampBoxHtml, stampSvg, txt } from "./html";

describe("esc", () => {
  it("neutralises markup and attribute breakouts", () => {
    expect(esc('<script>alert(1)</script>')).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(esc('" onerror="x')).toBe("&quot; onerror=&quot;x");
    expect(esc("it's & that")).toBe("it&#39;s &amp; that");
    expect(esc(null)).toBe("");
  });
});

describe("text helpers", () => {
  it("escape their input and pick directions", () => {
    expect(ltr("1023456789")).toBe('<bdi dir="ltr">1023456789</bdi>');
    expect(txt("  <b>x</b> ")).toBe('<bdi dir="auto">&lt;b&gt;x&lt;/b&gt;</bdi>');
    expect(txt("   ")).toBe("—");
    expect(dt("31 أكتوبر 2026")).toBe('<bdi dir="auto">31 أكتوبر 2026</bdi>');
  });
});

describe("grid", () => {
  it("escapes labels and falls back to a dash", () => {
    const html = grid([{ label: "<x>", value: "" }, { label: "k", value: "v", wide: true }]);
    expect(html).toContain("&lt;x&gt;");
    expect(html).toContain(">—<");
    expect(html).toContain("cell wide");
  });
});

describe("documentHtml", () => {
  const brand = { name: '<img src="http://evil.example/x.png">', legal: null, logoDataUri: null };
  const html = documentHtml({ locale: "ar", brand, title: "t", numberLabel: "n", number: "TSK-1", issuedLabel: "i", issued: "now", body: "<p>ok</p>" });

  it("sets language and direction", () => {
    expect(html).toContain('lang="ar" dir="rtl"');
  });

  it("never lets a company name become markup", () => {
    expect(html).not.toContain('<img src="http://evil');
    expect(html).toContain("&lt;img src=&quot;http://evil.example/x.png&quot;&gt;");
  });

  it("embeds fonts as data URIs and nothing from the network", () => {
    expect(html).toContain("url(data:font/woff2;base64,");
    expect(html).not.toMatch(/url\((?!data:)/);
    expect(html).not.toMatch(/<(link|script)\b/);
  });

  it("applies landscape page size when landscape is true", () => {
    const landscapeHtml = documentHtml({
      locale: "ar",
      brand,
      title: "t",
      issuedLabel: "i",
      issued: "now",
      body: "<p>ok</p>",
      landscape: true,
    });
    expect(landscapeHtml).toContain("@page{size:A4 landscape}");
  });
});

describe("stampSvg", () => {
  it("shrinks long labels to fit the ring", () => {
    expect(stampSvg("معتمد", 5)).toContain('font-size="13"');
    expect(stampSvg("Approved", 5)).toContain('font-size="10"');
  });
});

describe("stampBoxHtml", () => {
  it("renders a rectangular badge stamp without circular ring or rating", () => {
    const stamp = stampBoxHtml("معتمد");
    expect(stamp).toContain("stamp-box");
    expect(stamp).toContain("stamp-box-inner");
    expect(stamp).toContain("معتمد");
    expect(stamp).not.toContain("/5");
    expect(stamp).not.toContain("<circle");
  });
});
