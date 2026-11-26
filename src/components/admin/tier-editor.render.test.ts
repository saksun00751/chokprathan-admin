import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import type { RiskProfile } from "@/core/rules/types";
import { I18nProvider } from "@/i18n/client";
import th from "@/i18n/locales/th";
import { TierEditor } from "./tier-editor";

/** Server-render smoke test: the live summary shows up, in Thai, under the tier editor. */
const render = (profile: RiskProfile, baseRate100: number, betType?: "top2" | "runTop") =>
  renderToStaticMarkup(
    createElement(
      I18nProvider,
      // children goes as the third argument; the cast only satisfies the props type, which lists it.
      { lang: "th", t: th } as Parameters<typeof I18nProvider>[0],
      createElement(TierEditor, { profile, baseRate100, onChange: () => {}, betType }),
    ),
  );

describe("TierEditor", () => {
  test("2 top digits with the system defaults", () => {
    const html = render({ enabled: true, tiers: [{ threshold: 5000, percent: 75 }, { threshold: 15000, percent: 50 }], cap: 30000 }, 9500, "top2");
    expect(html).toContain("สรุปการทำงาน");
    expect(html).toContain("<li");
    expect(html).toContain("ยอดแทงรวมต่ำกว่า 5,000 บาท: จ่ายบาทละ 95");
    expect(html).toContain("ตั้งแต่ 5,000 บาท: จ่ายบาทละ 71.25 (75% ของอัตราปกติ)");
    expect(html).toContain("ตั้งแต่ 15,000 บาท: จ่ายบาทละ 47.5 (50% ของอัตราปกติ)");
    expect(html).toContain("ตั้งแต่ 30,000 บาท: หยุดรับเลขนี้");
    expect(html).toContain("ตัวอย่าง: ถ้าเลข 47 ถูกแทงรวมกันแล้ว 10,000 บาท คนที่แทงต่อจากนี้จะได้บาทละ 71.25");
    // The tier row reads as a sentence and its chip shows the computed rate.
    expect(html).toContain("% ของอัตราปกติ");
    expect(html).toContain("จ่ายบาทละ 71.25");
    expect(html).toContain('aria-label="ยอดสะสมขั้นที่ 1"');
  });

  test("disabled profile says it always pays the base rate", () => {
    const html = render({ enabled: false, tiers: [], cap: null }, 320, "runTop");
    expect(html).toContain("ปิดอยู่: จ่ายบาทละ 3.2 เสมอ");
    expect(html).not.toContain("ตัวอย่าง:");
  });
});
