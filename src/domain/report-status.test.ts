import { describe, expect, test } from "vitest";
import th from "@/i18n/locales/th";
import { reportRoundStatus } from "./report-status";

describe("a round's status in reports", () => {
  test("has words for every stored status", () => {
    for (const status of ["scheduled", "pending_confirm", "resulted", "cancelled"]) expect(reportRoundStatus(status, th)).not.toBe(status);
  });
  test("reads a result left waiting by the old two-person check as closed: it can be typed again", () => {
    expect(reportRoundStatus("pending_confirm", th)).toBe(th.lotto.phase.closed);
  });
});
