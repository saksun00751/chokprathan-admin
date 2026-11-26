import { describe, expect, test } from "vitest";
import { resolveRange } from "@/domain/periods";
import { DAY, MINUTE } from "@/core/rules/time";
import { dayOf, dayStartOf, daysIn, emptyDay, groupUsers, planRollup, seriesOf, sumBetTypes, sumLottos, sumMoney, sumPlaced, sumSettled, sumTx } from "./derive";
import type { DayStats } from "./types";

const NOW = Date.UTC(2026, 10, 16, 8, 30); // 16 Nov 2026, 15:30 in Bangkok
const today = dayOf(NOW);

function day(d: number, patch: Partial<DayStats> = {}): DayStats {
  return { ...emptyDay(d), ...patch };
}

describe("Bangkok days", () => {
  test("23:59:59.999 and 00:00:00.000 in Bangkok fall on consecutive days", () => {
    const lastMs = Date.UTC(2026, 10, 15, 16, 59, 59, 999);
    const firstMs = Date.UTC(2026, 10, 15, 17, 0, 0, 0);
    expect(dayOf(firstMs)).toBe(dayOf(lastMs) + 1);
    expect(dayStartOf(dayOf(firstMs))).toBe(firstMs);
  });

  test("a range lists each of its days once", () => {
    const r = resolveRange({ from: "2026-11-14", to: "2026-11-16" }, NOW)!;
    expect(daysIn(r)).toEqual([today - 2, today - 1, today]);
  });
});

describe("sums over days", () => {
  const a = day(today - 1, {
    lottos: { "3": { bills: 2, stake: 300, settled: 100, payout: 900, rounds: [5, 6] } },
    settledHours: emptyDay(0).settledHours.map((x, h) => (h === 20 ? { stake: 100, payout: 900 } : x)),
    tx: { "balance:bonus": 50, "cashback:cashback_earn": 7, "balance:cashback_claim": 7, "cashback:cashback_claim": -7 },
    deposits: { n: 1, sum: 1000, hours: emptyDay(0).deposits.hours.map((x, h) => (h === 9 ? 1000 : x)) },
    members: 2,
    referred: 1,
    ftd: { n: 1, sum: 1000 },
  });
  const b = day(today, {
    lottos: {
      "3": { bills: 1, stake: 100, settled: 0, payout: 0, rounds: [6, 7] },
      "4": { bills: 1, stake: 50, settled: 50, payout: 0, rounds: [9] },
    },
    tx: { "balance:bonus": 25, "balance:voucher": 10 },
    withdrawals: { n: 1, sum: 400, hours: emptyDay(0).withdrawals.hours },
    betTypes: { top2: { items: 3, won: 1, stake: 30, potential: 2700, payout: 900, settled: 30 } },
  });

  test("placed, settled, and money add up", () => {
    expect(sumPlaced([a, b])).toEqual({ bills: 4, stake: 450 });
    expect(sumSettled([a, b])).toEqual({ stake: 100, payout: 900 });
    expect(sumMoney([a, b])).toEqual({ deposits: { n: 1, sum: 1000 }, withdrawals: { n: 1, sum: 400 }, members: 2, referred: 1, ftd: { n: 1, sum: 1000 } });
  });

  test("a round that took bills on two days counts once for its lotto", () => {
    const lottos = sumLottos([a, b]);
    expect(lottos.get(3)).toEqual({ bills: 3, stake: 400, settled: 100, payout: 900, rounds: 3 });
    expect(lottos.get(4)).toEqual({ bills: 1, stake: 50, settled: 50, payout: 0, rounds: 1 });
  });

  test("transaction sums follow the type and optional wallet filters", () => {
    expect(sumTx([a, b], ["bonus", "voucher"])).toBe(85);
    expect(sumTx([a, b], ["cashback_claim"])).toBe(0);
    expect(sumTx([a, b], ["cashback_claim"], ["cashback", "affiliate"])).toBe(-7);
  });

  test("bet types add up", () => {
    expect(sumBetTypes([a, b])).toEqual({ top2: { items: 3, won: 1, stake: 30, potential: 2700, payout: 900, settled: 30, discount: 0, settledDiscount: 0 } });
  });

  test("one day gives 24 hourly buckets, longer ranges one bucket per day, all zero-filled", () => {
    const oneDay = resolveRange({ from: "2026-11-15", to: "2026-11-15" }, NOW)!;
    const hours = seriesOf(oneDay, [a], () => "");
    expect(hours).toHaveLength(24);
    expect(hours[20]).toMatchObject({ turnover: 0, ggr: -800, deposits: 0 });
    expect(hours[9]).toMatchObject({ deposits: 1000 });
    const twoDays = resolveRange({ from: "2026-11-15", to: "2026-11-16" }, NOW)!;
    const days = seriesOf(twoDays, [a], () => "");
    expect(days.map((x) => x.ggr)).toEqual([-800, 0]);
    expect(days.map((x) => x.deposits)).toEqual([1000, 0]);
  });
});

describe("players", () => {
  test("a player active on several days is one player with summed totals", () => {
    const users = groupUsers([
      { u: 1, bills: 2, stake: 200, settled: 100, payout: 0, dep: 500, wd: 0, affEarn: 0 },
      { u: 2, bills: 0, stake: 0, settled: 0, payout: 0, dep: 0, wd: 0, affEarn: 30 },
      { u: 1, bills: 1, stake: 50, settled: 50, payout: 450, dep: 0, wd: 100, affEarn: 0 },
    ]);
    expect(users).toEqual([
      { u: 1, bills: 3, stake: 250, settled: 150, payout: 450, dep: 500, wd: 100, affEarn: 0 },
      { u: 2, bills: 0, stake: 0, settled: 0, payout: 0, dep: 0, wd: 0, affEarn: 30 },
    ]);
    expect(users.filter((x) => x.bills > 0)).toHaveLength(1);
  });
});

describe("rollup plan", () => {
  test("today is always rebuilt", () => {
    expect(planRollup({ now: NOW, changed: [], missing: [], budget: 4 })).toEqual([today]);
  });

  test("yesterday is rebuilt again during the first 15 minutes after midnight", () => {
    const justAfter = dayStartOf(today) + 5 * MINUTE;
    expect(planRollup({ now: justAfter, changed: [], missing: [], budget: 4 })).toEqual([today, today - 1]);
    expect(planRollup({ now: dayStartOf(today) + 20 * MINUTE, changed: [], missing: [], budget: 4 })).toEqual([today]);
  });

  test("days whose bills settled late are rebuilt, like a government round 16 days after its first bills", () => {
    expect(planRollup({ now: NOW, changed: [today - 16, today - 3, today], missing: [], budget: 4 })).toEqual([today, today - 16, today - 3]);
  });

  test("work per run is capped; changed days go before backfill", () => {
    const plan = planRollup({ now: NOW, changed: [today - 2], missing: [today - 40, today - 39, today - 38], budget: 2 });
    expect(plan).toEqual([today, today - 2, today - 38]);
  });

  test("future and duplicate days are ignored", () => {
    expect(planRollup({ now: NOW, changed: [today + 1, today - 2, today - 2], missing: [today - 2], budget: 5 })).toEqual([today, today - 2]);
  });
});

test("a day's start and the next day's start are one DAY apart", () => {
  expect(dayStartOf(today + 1) - dayStartOf(today)).toBe(DAY);
});
