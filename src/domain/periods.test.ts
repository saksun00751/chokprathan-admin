import { expect, test } from "vitest";
import { bkkMs } from "./time";
import { bucketsOf, previousRange, resolveRange } from "./periods";

const now = bkkMs(2026, 11, 4, 12, 30);

test("today covers the Bangkok calendar day in hourly buckets", () => {
  const r = resolveRange({ period: "today" }, now)!;
  expect(r).toMatchObject({ from: "2026-11-04", to: "2026-11-04", startMs: bkkMs(2026, 11, 4), endMs: bkkMs(2026, 11, 5), bucket: "hour", days: 1 });
});

test("presets count today as the last day", () => {
  expect(resolveRange({ period: "7d" }, now)).toMatchObject({ from: "2026-10-29", to: "2026-11-04", days: 7, bucket: "day" });
  expect(resolveRange({ period: "30d" }, now)).toMatchObject({ from: "2026-10-06", to: "2026-11-04", days: 30 });
  expect(resolveRange({ period: "yesterday" }, now)).toMatchObject({ from: "2026-11-03", to: "2026-11-03", bucket: "hour" });
  expect(resolveRange({ period: "month" }, now)).toMatchObject({ from: "2026-11-01", to: "2026-11-04", days: 4 });
  expect(resolveRange({ period: "lastmonth" }, now)).toMatchObject({ from: "2026-10-01", to: "2026-10-31", days: 31 });
});

test("a custom range is inclusive, validated, and capped at 366 days", () => {
  expect(resolveRange({ from: "2026-10-01", to: "2026-10-03" }, now)).toMatchObject({
    from: "2026-10-01",
    to: "2026-10-03",
    startMs: bkkMs(2026, 10, 1),
    endMs: bkkMs(2026, 10, 4),
    days: 3,
    bucket: "day",
  });
  expect(resolveRange({ from: "2026-10-03", to: "2026-10-01" }, now)).toBeNull();
  expect(resolveRange({ from: "2024-01-01", to: "2026-10-01" }, now)).toBeNull();
  expect(resolveRange({ from: "2026-13-01", to: "2026-10-01" }, now)).toBeNull();
  expect(resolveRange({ from: "x", to: "y" }, now)).toBeNull();
});

test("an unknown preset falls back to today", () => {
  expect(resolveRange({ period: "forever" }, now)).toMatchObject({ from: "2026-11-04", to: "2026-11-04" });
});

test("the previous range has the same length and ends where this one starts", () => {
  const p = previousRange(resolveRange({ period: "7d" }, now)!);
  expect(p).toMatchObject({ from: "2026-10-22", to: "2026-10-28", days: 7 });
});

test("buckets list every hour or day with its start time", () => {
  const hours = bucketsOf(resolveRange({ period: "today" }, now)!);
  expect(hours).toHaveLength(24);
  expect(hours[0]).toMatchObject({ key: Math.floor((bkkMs(2026, 11, 4) + 7 * 3_600_000) / 3_600_000), label: "00:00" });
  const days = bucketsOf(resolveRange({ period: "7d" }, now)!);
  expect(days).toHaveLength(7);
  expect(days[6].label).toBe("4 พ.ย.");
});
