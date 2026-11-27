import { describe, expect, test } from "vitest";
import { dayStartMs } from "@/core/rules/time";
import { exposureQuery, exposureWhere, ledgerQuery, ledgerWhere, parseExposureFilter, parseLedgerFilter, parseReferralFilter, referralQuery } from "./list-filters";

const today = "2026-11-27";
const ledger = { from: "2026-11-21", to: today, type: "", wallet: "", search: "", page: 1 } as const;

describe("the ledger filter", () => {
  test("starts with the last seven days", () => {
    expect(parseLedgerFilter({}, today)).toEqual(ledger);
  });

  test("takes known types and wallets only", () => {
    expect(parseLedgerFilter({ type: "adjust", wallet: "cashback", q: " CP1 ", page: "2" }, today)).toMatchObject({ type: "adjust", wallet: "cashback", search: "CP1", page: 2 });
    expect(parseLedgerFilter({ type: "drop", wallet: "x", page: "-1" }, today)).toEqual(ledger);
  });

  test("covers whole Bangkok days and real members", () => {
    expect(ledgerWhere(ledger)).toEqual({
      sql: "u.is_simulated = 0 AND t.created_at >= ? AND t.created_at < ?",
      params: [dayStartMs("2026-11-21"), dayStartMs(today) + 86_400_000],
    });
  });

  test("searches the reference, phone and name literally", () => {
    const w = ledgerWhere({ ...ledger, type: "bet", wallet: "balance", search: "a%" });
    expect(w.sql).toBe("u.is_simulated = 0 AND t.created_at >= ? AND t.created_at < ? AND t.type = ? AND t.wallet = ? AND (t.ref LIKE ? OR u.phone LIKE ? OR u.name LIKE ?)");
    expect(w.params.slice(2)).toEqual(["bet", "balance", "%a\\%%", "%a\\%%", "%a\\%%"]);
  });

  test("keeps itself in links", () => {
    expect(ledgerQuery({ ...ledger, type: "win", page: 2 })).toBe("?from=2026-11-21&to=2026-11-27&type=win&page=2");
  });
});

describe("the exposure filter", () => {
  const start = { state: "open", betType: "", group: "" } as const;

  test("starts with the draws open now", () => {
    expect(parseExposureFilter({})).toEqual(start);
    expect(exposureWhere(start, 1000)).toEqual({ sql: "r.status = 'scheduled' AND e.total_stake > 0 AND r.closes_at > ?", params: [1000] });
  });

  test("can show draws awaiting a result, or both", () => {
    expect(exposureWhere({ ...start, state: "waiting" }, 1000).sql).toContain("r.closes_at <= ?");
    expect(exposureWhere({ ...start, state: "all" }, 1000)).toEqual({ sql: "r.status = 'scheduled' AND e.total_stake > 0", params: [] });
  });

  test("narrows to a bet type", () => {
    expect(parseExposureFilter({ type: "top2", group: "stock", state: "nope" })).toEqual({ state: "open", betType: "top2", group: "stock" });
    expect(exposureWhere({ ...start, betType: "top2" }, 5).params).toEqual([5, "top2"]);
    expect(parseExposureFilter({ type: "constructor" }).betType).toBe("");
  });

  test("keeps itself in links", () => {
    expect(exposureQuery(start)).toBe("");
    expect(exposureQuery({ state: "all", betType: "top3", group: "daily" })).toBe("?state=all&type=top3&group=daily");
  });
});

describe("the referral filter", () => {
  test("is a search and a page", () => {
    expect(parseReferralFilter({ q: " ก ", page: "3" })).toEqual({ search: "ก", page: 3 });
    expect(referralQuery({ search: "", page: 1 })).toBe("");
    expect(referralQuery({ search: "ก", page: 2 })).toBe("?q=%E0%B8%81&page=2");
  });
});
