import { describe, expect, it } from "vitest";
import { cleanFileName, sniffFile, sniffLogo } from "./files";

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? Array.from(p, (c) => c.charCodeAt(0)) : p)));

describe("sniffFile", () => {
  it("recognises the allowed types by content", () => {
    expect(sniffFile(bytes([0xff, 0xd8, 0xff, 0xe0]))?.ext).toBe("jpg");
    expect(sniffFile(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))?.ext).toBe("png");
    expect(sniffFile(bytes("RIFF", [0, 0, 0, 0], "WEBPVP8 "))?.ext).toBe("webp");
    expect(sniffFile(bytes([0, 0, 0, 0x18], "ftypheic"))?.ext).toBe("heic");
    expect(sniffFile(bytes("%PDF-1.7"))?.ext).toBe("pdf");
    expect(sniffFile(bytes([0x50, 0x4b, 0x03, 0x04], "....word/document.xml"))?.ext).toBe("docx");
    expect(sniffFile(bytes([0x50, 0x4b, 0x03, 0x04], "....xl/workbook.xml"))?.ext).toBe("xlsx");
  });

  it("refuses SVG, HTML, plain zips and anything unknown", () => {
    expect(sniffFile(bytes('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
    expect(sniffFile(bytes("<!DOCTYPE html><html>"))).toBeNull();
    expect(sniffFile(bytes([0x50, 0x4b, 0x03, 0x04], "evil.exe"))).toBeNull();
    expect(sniffFile(bytes("MZ\u0090\u0000"))).toBeNull();
    expect(sniffFile(new Uint8Array())).toBeNull();
  });

  it("ignores what the name claims", () => {
    // An HTML page renamed to .pdf is still HTML.
    expect(sniffFile(bytes("<html><script>alert(1)</script>"))).toBeNull();
  });
});

describe("sniffLogo", () => {
  it("accepts raster images only", () => {
    expect(sniffLogo(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))?.ext).toBe("png");
    expect(sniffLogo(bytes("%PDF-1.7"))).toBeNull();
  });
});

describe("cleanFileName", () => {
  it("drops paths and unsafe characters", () => {
    expect(cleanFileName("../../etc/passwd")).toBe("passwd");
    expect(cleanFileName("C:\\Users\\a\\إقامة.pdf")).toBe("إقامة.pdf");
    expect(cleanFileName('a<b>"c".pdf')).toBe("abc.pdf");
    expect(cleanFileName("")).toBe("file");
  });
});
