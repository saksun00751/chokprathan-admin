import { describe, expect, test } from "vitest";
import { bkkMs } from "chokprathan-core/rules/time";
import { toRound, roundLabel, type RoundRow } from "@/server/services/rounds";
import { formatDate } from "./format";
import { roundName, scheduledClose } from "./labels";
import th from "./locales/th";

const planned = bkkMs(2026, 11, 27, 20, 15);
// Closed by staff the day before: betting stops then, the draw is still the 27th.
const early = bkkMs(2026, 11, 26, 12, 6);

const row: RoundRow = {
  id: 1,
  lotto_id: 1,
  round_no: null,
  day_key: "2026-11-27",
  opens_at: 1,
  closes_at: early,
  planned_close: planned,
  draw_at: planned,
  status: "scheduled",
  result: null,
  resulted_at: null,
  settled_at: null,
};

describe("a draw closed early keeps its own date", () => {
  test("in the member's language", () => {
    expect(scheduledClose(toRound(row))).toBe(planned);
    expect(roundName(toRound(row), "th", th)).toContain(formatDate(planned, "th"));
    expect(roundName(toRound(row), "th", th)).not.toContain(formatDate(early, "th"));
  });

  test("in the ledger note", () => {
    expect(roundLabel(toRound(row))).toBe(roundLabel(toRound({ ...row, closes_at: planned, planned_close: null })));
  });

  test("a draw that was not closed early is named from its closing time", () => {
    expect(scheduledClose(toRound({ ...row, planned_close: null }))).toBe(early);
  });
});
