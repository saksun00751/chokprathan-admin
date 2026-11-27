import { describe, expect, test } from "vitest";
import { bkkMs } from "@/core/rules/time";
import { toRound, roundLabel, type RoundRow } from "@/server/services/rounds";
import { formatDate } from "./format";
import { lottoName, lottoShort, roundName, scheduledClose } from "./labels";
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

describe("a lotto's name", () => {
  const l = { slug: "x", name: "ลาวสตาร์", shortName: "สตาร์", i18n: { en: { name: "Lao Star", short: "Star" }, lo: { name: "ລາວສະຕາ" } } };
  const dict = { lotto: { ...th.lotto, names: { x: { name: "Dict", short: "D" } } } };

  test("is the Thai one in Thai", () => {
    expect(lottoName(l, "th", dict)).toBe("ลาวสตาร์");
    expect(lottoShort(l, "th", dict)).toBe("สตาร์");
  });

  test("comes from the database first", () => {
    expect(lottoName(l, "en", dict)).toBe("Lao Star");
    expect(lottoShort(l, "en", dict)).toBe("Star");
  });

  test("falls back to the dictionary, field by field", () => {
    expect(lottoShort(l, "lo", dict)).toBe("D");
    expect(lottoName(l, "km", dict)).toBe("Dict");
  });

  test("ends at the Thai name", () => {
    expect(lottoName(l, "km", th)).toBe("ลาวสตาร์");
    expect(lottoShort(l, "km", th)).toBe("สตาร์");
  });
});
