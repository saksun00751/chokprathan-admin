import { describe, expect, test } from "vitest";
import { closesForDay, nextClose, previousClose } from "./schedule";
import { addDays, bkkMs, bkkParts, dayKey, formatClock, formatThaiDate, splitCountdown } from "./time";
import type { Schedule } from "./types";

const yiki: Schedule = { kind: "interval", firstClose: "06:00", everyMin: 15, count: 88 };
const laos: Schedule = { kind: "weekly", days: [1, 3, 5], close: "20:15" };
const gov: Schedule = { kind: "monthly", days: [1, 16], close: "15:10" };

describe("Bangkok time helpers", () => {
  test("bkkMs is UTC+7", () => {
    expect(bkkMs(2026, 11, 4, 6, 0)).toBe(Date.UTC(2026, 10, 3, 23, 0));
  });
  test("bkkParts reads the Bangkok wall clock and weekday", () => {
    expect(bkkParts(Date.UTC(2026, 10, 3, 23, 0))).toEqual({ y: 2026, m: 11, d: 4, hh: 6, mm: 0, ss: 0, dow: 3 });
  });
  test("dayKey and addDays", () => {
    expect(dayKey(Date.UTC(2026, 10, 3, 17, 0))).toBe("2026-11-04");
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });
  test("formatting in Thai with the Buddhist year", () => {
    expect(formatClock(bkkMs(2026, 11, 4, 9, 5))).toBe("09:05");
    expect(formatThaiDate(bkkMs(2026, 11, 16, 15, 10), "short")).toBe("16 พ.ย. 69");
    expect(formatThaiDate(bkkMs(2026, 11, 16, 15, 10), "long")).toBe("16 พฤศจิกายน 2569");
  });
  test("splitCountdown", () => {
    expect(splitCountdown(3_723_000)).toEqual({ d: 0, h: 1, m: 2, s: 3 });
    expect(splitCountdown(90_061_000)).toEqual({ d: 1, h: 1, m: 1, s: 1 });
    expect(splitCountdown(-5)).toEqual({ d: 0, h: 0, m: 0, s: 0 });
  });
});

describe("closesForDay", () => {
  test("Yiki has 88 rounds every 15 minutes from 06:00 to 03:45 the next day", () => {
    const list = closesForDay(yiki, "2026-11-04");
    expect(list).toHaveLength(88);
    expect(list[0]).toBe(bkkMs(2026, 11, 4, 6, 0));
    expect(list[1]).toBe(bkkMs(2026, 11, 4, 6, 15));
    expect(list[87]).toBe(bkkMs(2026, 11, 5, 3, 45));
  });
  test("weekly schedules only produce on their weekdays", () => {
    expect(closesForDay(laos, "2026-11-03")).toEqual([]); // Tuesday
    expect(closesForDay(laos, "2026-11-04")).toEqual([bkkMs(2026, 11, 4, 20, 15)]); // Wednesday
  });
  test("monthly schedules produce on their days of month", () => {
    expect(closesForDay(gov, "2026-11-16")).toEqual([bkkMs(2026, 11, 16, 15, 10)]);
    expect(closesForDay(gov, "2026-11-15")).toEqual([]);
  });
});

describe("nextClose", () => {
  test("finds the next monthly draw weeks ahead", () => {
    expect(nextClose(gov, bkkMs(2026, 11, 4, 9, 0))).toBe(bkkMs(2026, 11, 16, 15, 10));
  });
  test("a close exactly at the given time is not 'next'", () => {
    expect(nextClose(laos, bkkMs(2026, 11, 4, 20, 15))).toBe(bkkMs(2026, 11, 6, 20, 15));
  });
  test("works across a month boundary", () => {
    expect(nextClose(gov, bkkMs(2026, 11, 20, 9, 0))).toBe(bkkMs(2026, 12, 1, 15, 10));
  });
});

describe("previousClose", () => {
  test("finds the previous weekly draw", () => {
    expect(previousClose(laos, bkkMs(2026, 11, 4, 20, 15))).toBe(bkkMs(2026, 11, 2, 20, 15));
  });
  test("finds yesterday's last Yiki round, which closes after midnight", () => {
    expect(previousClose(yiki, bkkMs(2026, 11, 4, 6, 0))).toBe(bkkMs(2026, 11, 4, 3, 45));
  });
  test("finds the previous monthly draw", () => {
    expect(previousClose(gov, bkkMs(2026, 11, 16, 15, 10))).toBe(bkkMs(2026, 11, 1, 15, 10));
  });
});
