import { describe, expect, test } from "vitest";
import th from "@/i18n/locales/th";
import { reportRoundStatus } from "./report-status";

describe("a round's status in reports", () => {
  test("has words for every stored status", () => {
    for (const status of ["scheduled", "pending_confirm", "resulted", "cancelled"]) expect(reportRoundStatus(status, th)).not.toBe(status);
  });
  test("says a typed result is waiting for the second person", () => {
    expect(reportRoundStatus("pending_confirm", th)).toBe(th.admin.shell.phase.confirming);
  });
});
