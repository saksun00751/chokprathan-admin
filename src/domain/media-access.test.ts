import { describe, expect, test } from "vitest";
import { isBrandFile, mayViewMedia } from "./media-access";

const nobody = { signedIn: false, finance: false };
const staff = { signedIn: true, finance: false };
const finance = { signedIn: true, finance: true };

describe("uploaded files in the back office", () => {
  test("brand images open for anyone, so the sign-in page can show the logo", () => {
    expect(mayViewMedia("brand-logo-ab.webp", "banner", nobody)).toBe(true);
  });

  test("a slip never counts as a brand image", () => {
    expect(isBrandFile("brand-logo-ab.webp", "slip")).toBe(false);
    expect(mayViewMedia("brand-logo-ab.webp", "slip", staff)).toBe(false);
  });

  test("banners need a signed-in employee", () => {
    expect(mayViewMedia("banner-1-ab.webp", "banner", nobody)).toBe(false);
    expect(mayViewMedia("banner-1-ab.webp", "banner", staff)).toBe(true);
  });

  test("slips need finance permission", () => {
    expect(mayViewMedia("slip-1-ab.webp", "slip", staff)).toBe(false);
    expect(mayViewMedia("slip-1-ab.webp", "slip", finance)).toBe(true);
  });
});
