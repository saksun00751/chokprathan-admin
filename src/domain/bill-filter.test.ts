import { describe, expect, test } from "vitest";
import { dayStartMs } from "@/core/rules/time";
import { billQuery, billWhere, parseBillFilter } from "./bill-filter";

const none = { day: "", lottoId: null, status: "all", search: "", page: 1 } as const;

describe("reading the bill filter from the address", () => {
  test("starts with every bill", () => {
    expect(parseBillFilter({})).toEqual(none);
  });

  test("takes what is well formed", () => {
    expect(parseBillFilter({ day: "2026-11-27", lotto: "12", status: "won", q: "  CP3V  ", page: "3" })).toEqual({ day: "2026-11-27", lottoId: 12, status: "won", search: "CP3V", page: 3 });
  });

  test("ignores what is not", () => {
    expect(parseBillFilter({ day: "yesterday", lotto: "1 OR 1", status: "paid", q: ["a", "b"], page: "-2" })).toEqual(none);
    expect(parseBillFilter({ day: "2026-13-45" }).day).toBe("");
  });

  test("keeps a search short", () => {
    expect(parseBillFilter({ q: "x".repeat(80) }).search).toHaveLength(40);
  });
});

describe("the bill query", () => {
  test("shows real members only", () => {
    expect(billWhere(none)).toEqual({ sql: "u.is_simulated = 0", params: [] });
  });

  test("takes the whole Bangkok day, the lottery and the status", () => {
    const from = dayStartMs("2026-11-27");
    expect(billWhere({ ...none, day: "2026-11-27", lottoId: 12, status: "pending" })).toEqual({
      sql: "u.is_simulated = 0 AND b.created_at >= ? AND b.created_at < ? AND r.lotto_id = ? AND b.status = ?",
      params: [from, from + 86_400_000, 12, "pending"],
    });
  });

  test("searches the bill code, phone and name, taking % and _ literally", () => {
    expect(billWhere({ ...none, search: "50%_" })).toEqual({
      sql: "u.is_simulated = 0 AND (b.code LIKE ? OR u.phone LIKE ? OR u.name LIKE ?)",
      params: ["%50\\%\\_%", "%50\\%\\_%", "%50\\%\\_%"],
    });
  });
});

describe("page links", () => {
  test("keep the filter and name only what is set", () => {
    expect(billQuery(none)).toBe("");
    expect(billQuery({ day: "2026-11-27", lottoId: 12, status: "won", search: "ก ข", page: 2 })).toBe("?day=2026-11-27&lotto=12&status=won&q=%E0%B8%81+%E0%B8%82&page=2");
  });
});
