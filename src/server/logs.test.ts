import { describe, expect, test } from "vitest";
import { isStaffIdentifier, mergeCounts, mergeNewest } from "./logs";

describe("sign-in log helpers", () => {
  test("a member phone number is not a staff sign-in name", () => {
    expect(isStaffIdentifier("0812345678")).toBe(false);
    expect(isStaffIdentifier("owner")).toBe(true);
    expect(isStaffIdentifier("081234567")).toBe(true);
    expect(isStaffIdentifier(null)).toBe(false);
  });

  test("merging keeps the newest rows of both lists, newest first", () => {
    const a = [{ created_at: 50 }, { created_at: 10 }];
    const b = [{ created_at: 40 }, { created_at: 30 }, { created_at: 5 }];
    expect(mergeNewest(a, b, 3).map((x) => x.created_at)).toEqual([50, 40, 30]);
    expect(mergeNewest([], b, 10).map((x) => x.created_at)).toEqual([40, 30, 5]);
  });

  test("counts from both stores add up per person and event, keeping the latest time", () => {
    const mongo = [
      { user_id: 1, event: "login", n: 3, last: 900 },
      { user_id: 2, event: "login_failed", n: 1, last: 500 },
    ];
    const maria = [
      { user_id: 1, event: "login", n: 2, last: 950 },
      { user_id: 1, event: "logout", n: 1, last: 100 },
    ];
    expect(mergeCounts(mongo, maria)).toEqual([
      { user_id: 1, event: "login", n: 5, last: 950 },
      { user_id: 2, event: "login_failed", n: 1, last: 500 },
      { user_id: 1, event: "logout", n: 1, last: 100 },
    ]);
  });
});
