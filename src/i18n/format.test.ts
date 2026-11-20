import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import type { Locale } from "./config";
import { formatDate, formatDateTime, formatDayMonth } from "./format";

/**
 * Browsers ship partial locale data: desktop Chrome formats Lao, Burmese, and Khmer dates in
 * English. A date rendered on the server and again in the browser must still come out identical,
 * or React throws a hydration error and the page shows English month names. So the formatter must
 * not depend on the runtime's locale data. Stub Intl.DateTimeFormat to always answer in English.
 */
const RealDTF = Intl.DateTimeFormat;
beforeAll(() => {
  // A plain function (not an arrow) so the code under test can still call it with `new`.
  vi.spyOn(Intl, "DateTimeFormat").mockImplementation(function (_locale?: unknown, options?: Intl.DateTimeFormatOptions) {
    return new RealDTF("en-US", options);
  } as unknown as typeof Intl.DateTimeFormat);
});
afterAll(() => vi.restoreAllMocks());

// 16 November 2026, 15:30 in Bangkok.
const nov16 = Date.UTC(2026, 10, 16, 8, 30);

const expected: Record<Locale, { short: string; long: string; dayMonth: string }> = {
  th: { short: "16 พ.ย. 69", long: "16 พฤศจิกายน 2569", dayMonth: "16 พ.ย." },
  en: { short: "16 Nov 26", long: "16 November 2026", dayMonth: "16 Nov" },
  lo: { short: "16 ພ.ຈ. 26", long: "16 ພະຈິກ 2026", dayMonth: "16 ພ.ຈ." },
  my: { short: "16 နို 26", long: "16 နိုဝင်ဘာ 2026", dayMonth: "16 နို" },
  km: { short: "16 វិច្ឆិកា 26", long: "16 វិច្ឆិកា 2026", dayMonth: "16 វិច្ឆិកា" },
};

describe.each(Object.entries(expected))("%s dates", (lang, want) => {
  test("read the same without the runtime's locale data", () => {
    expect(formatDate(nov16, lang as Locale)).toBe(want.short);
    expect(formatDate(nov16, lang as Locale, "long")).toBe(want.long);
    expect(formatDayMonth(nov16, lang as Locale)).toBe(want.dayMonth);
  });
});

test("dates and times are Bangkok time, whatever the machine's time zone", () => {
  // 00:30 on 1 January 2027 in Bangkok is still 31 December in UTC.
  const newYear = Date.UTC(2026, 11, 31, 17, 30);
  expect(formatDateTime(newYear, "en")).toBe("1 Jan 27 00:30");
  expect(formatDate(newYear, "th", "long")).toBe("1 มกราคม 2570");
});
