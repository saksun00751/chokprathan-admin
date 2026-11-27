import { describe, expect, test } from "vitest";
import { adminBrandName, applyAdminBranding, applyBranding, cleanBrandText, cleanBranding, DEFAULT_BRANDING, pageOverride, pickText } from "./branding";

const dict = () => ({ common: { brand: "Old", ok: "OK" }, meta: { tagline: "Tag", description: "Desc", lotto: { title: "Bet" } } });
const logo = "brand-logo-0123456789abcdef.webp";

describe("cleaning", () => {
  test("returns the defaults for nothing or rubbish", () => {
    for (const bad of [undefined, null, 7, "x", []]) expect(cleanBranding(bad)).toEqual(DEFAULT_BRANDING);
  });

  test("trims, cuts to length, drops blanks, unknown languages and unknown pages", () => {
    const t = cleanBrandText({
      name: { th: `  ${"ก".repeat(50)}  `, en: "   ", fr: "Nom" },
      pages: { lotto: { title: { th: "แทง" }, description: { th: "" } }, wallet: { title: { th: "x" } }, rules: {} },
      hideName: 1,
    });
    expect(t.name).toEqual({ th: "ก".repeat(40) });
    expect(t.pages).toEqual({ lotto: { title: { th: "แทง" } } });
    expect(t.hideName).toBe(true);
  });

  test("text cleaning carries no image names", () => {
    expect(cleanBrandText({ logo })).not.toHaveProperty("logo");
  });

  test("keeps only brand image names", () => {
    const b = cleanBranding({ logo, adminLogo: "slip-1.webp", icon: "../brand-x.webp", share: "brand-share-ab.png" });
    expect([b.logo, b.adminLogo, b.icon, b.share]).toEqual([logo, null, null, "brand-share-ab.png"]);
  });
});

describe("fallback order", () => {
  const b = cleanBranding({
    name: { th: "ใหม่", en: "New" },
    description: { th: "คำอธิบาย" },
    adminName: { th: "ทีมงาน" },
    pages: { lotto: { title: { th: "แทงเลย" } } },
  });

  test("language, then Thai, then nothing", () => {
    expect(pickText(b.name, "en")).toBe("New");
    expect(pickText(b.name, "lo")).toBe("ใหม่");
    expect(pickText(b.tagline, "lo")).toBeUndefined();
  });

  test("lays name, tagline and description over the dictionary without touching it", () => {
    const original = dict();
    const t = applyBranding(original, b, "en");
    expect([t.common.brand, t.meta.tagline, t.meta.description]).toEqual(["New", "Tag", "คำอธิบาย"]);
    expect(t.meta.lotto.title).toBe("Bet");
    expect(original).toEqual(dict());
  });

  test("an empty configuration changes nothing", () => {
    expect(applyBranding(dict(), DEFAULT_BRANDING, "th")).toEqual(dict());
    expect(applyAdminBranding(dict(), DEFAULT_BRANDING, "th")).toEqual(dict());
  });

  test("the back office name wins over the site name, in any language", () => {
    expect(adminBrandName(b, "en")).toBe("ทีมงาน");
    expect(adminBrandName({ ...b, adminName: {} }, "en")).toBe("New");
    expect(applyAdminBranding(dict(), b, "en").common.brand).toBe("ทีมงาน");
  });

  test("page text only where it was written", () => {
    expect(pageOverride(b, "lotto", "my")).toEqual({ title: "แทงเลย" });
    expect(pageOverride(b, "rules", "th")).toEqual({});
  });
});
