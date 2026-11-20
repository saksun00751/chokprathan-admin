import { describe, expect, test } from "vitest";
import { detectImageType, parseHighlight, safeHref } from "./banner";

describe("parseHighlight", () => {
  test("splits [bracketed] parts into highlighted spans", () => {
    expect(parseHighlight("ฝากแรกรับโบนัส [20%]")).toEqual([
      { text: "ฝากแรกรับโบนัส ", hl: false },
      { text: "20%", hl: true },
    ]);
  });
  test("supports several highlights and plain titles", () => {
    expect(parseHighlight("[A] and [B]")).toEqual([
      { text: "A", hl: true },
      { text: " and ", hl: false },
      { text: "B", hl: true },
    ]);
    expect(parseHighlight("plain")).toEqual([{ text: "plain", hl: false }]);
  });
});

describe("safeHref", () => {
  test("allows site paths and https links", () => {
    expect(safeHref("/lotto?group=yiki")).toBe("/lotto?group=yiki");
    expect(safeHref("https://line.me/R/ti/p/@chokprathan")).toBe("https://line.me/R/ti/p/@chokprathan");
  });
  test("rejects scripts, protocol-relative and other schemes", () => {
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("//evil.example")).toBeNull();
    expect(safeHref("http://insecure.example")).toBeNull();
    expect(safeHref("data:text/html,hi")).toBeNull();
    expect(safeHref("")).toBeNull();
  });
});

describe("detectImageType", () => {
  test("recognises png, jpeg and webp by their bytes, not their name", () => {
    expect(detectImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("png");
    expect(detectImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpg");
    const webp = new TextEncoder().encode("RIFF\u0000\u0000\u0000\u0000WEBPVP8 ");
    expect(detectImageType(webp)).toBe("webp");
  });
  test("rejects anything else, including svg and html", () => {
    expect(detectImageType(new TextEncoder().encode("<svg xmlns"))).toBeNull();
    expect(detectImageType(new TextEncoder().encode("<html>"))).toBeNull();
    expect(detectImageType(new Uint8Array([]))).toBeNull();
  });
});
