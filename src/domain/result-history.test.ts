import { describe, expect, test } from "vitest";
import { historyQuery, lottoIdsFor, parseHistoryFilter } from "./result-history";

const today = "2026-11-27";
const start = { from: "2026-11-21", to: today, group: "", search: "", page: 1 };

describe("reading the history filter from the address", () => {
  test("starts with the last seven days", () => {
    expect(parseHistoryFilter({}, today)).toEqual(start);
  });

  test("takes what is well formed", () => {
    expect(parseHistoryFilter({ from: "2026-11-01", to: "2026-11-05", group: "stock", q: " นิเคอิ ", page: "2" }, today)).toEqual({ from: "2026-11-01", to: "2026-11-05", group: "stock", search: "นิเคอิ", page: 2 });
  });

  test("ignores what is not", () => {
    expect(parseHistoryFilter({ from: "2026-02-30", to: "x", group: ["a"], page: "0" }, today)).toEqual(start);
  });

  test("puts a reversed range the right way round", () => {
    expect(parseHistoryFilter({ from: "2026-11-10", to: "2026-11-02" }, today)).toMatchObject({ from: "2026-11-02", to: "2026-11-10" });
  });
});

describe("the lotteries a filter covers", () => {
  const lottos = [
    { id: 1, group: "stock", name: "นิเคอิ - เช้า", shortName: "Nikkei Morning", slug: "nikkei-stockm" },
    { id: 2, group: "stock", name: "หุ้นอินเดีย", shortName: "Indian Stock", slug: "india-stock" },
    { id: 3, group: "daily", name: "นิเคอิเช้า VIP", shortName: "Nikkei Morning VIP", slug: "nikkei-morning" },
  ];

  test("is every lottery when nothing narrows it", () => {
    expect(lottoIdsFor(lottos, start)).toBeNull();
  });

  test("takes the group and the search together", () => {
    expect(lottoIdsFor(lottos, { ...start, group: "stock" })).toEqual([1, 2]);
    expect(lottoIdsFor(lottos, { ...start, search: "นิเคอิ" })).toEqual([1, 3]);
    expect(lottoIdsFor(lottos, { ...start, group: "stock", search: "nikkei" })).toEqual([1]);
  });

  test("can be none", () => {
    expect(lottoIdsFor(lottos, { ...start, search: "zzz" })).toEqual([]);
  });
});

describe("page links", () => {
  test("keep the filter", () => {
    expect(historyQuery(start)).toBe("?from=2026-11-21&to=2026-11-27");
    expect(historyQuery({ ...start, group: "stock", search: "a b", page: 3 })).toBe("?from=2026-11-21&to=2026-11-27&group=stock&q=a+b&page=3");
  });
});
