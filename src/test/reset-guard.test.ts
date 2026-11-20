import { describe, expect, it } from "vitest";
import { canTruncateAll } from "./reset-guard";

const YES = { ALLOW_DB_RESET: "yes-destroy-data", TEST_TRUNCATE_ALL: "yes-wipe-every-table" };

describe("canTruncateAll", () => {
  it("allows a database whose name ends with _test when both flags are set", () => {
    expect(canTruncateAll("mysql://u:pw@db.example.com:3306/lotto_78_test", YES)).toEqual({ ok: true });
    expect(canTruncateAll("mysql://u:pw@127.0.0.1/lotto_test", YES)).toEqual({ ok: true });
  });

  it("refuses databases not named *_test", () => {
    for (const url of [
      "mysql://u:pw@127.0.0.1/lotto",
      "mysql://u:pw@127.0.0.1/lotto_testing",
      "mysql://u:pw@127.0.0.1/test",
      "mysql://u:pw@127.0.0.1/_test_lotto",
      "mysql://u:pw@127.0.0.1/",
      "mysql://u:pw@127.0.0.1",
      "mysql://u:pw@127.0.0.1/lotto_test/extra",
    ]) {
      expect(canTruncateAll(url, YES).ok, url).toBe(false);
    }
  });

  it("refuses when a flag is missing or wrong", () => {
    const url = "mysql://u:pw@127.0.0.1/lotto_test";
    expect(canTruncateAll(url, {}).ok).toBe(false);
    expect(canTruncateAll(url, { ALLOW_DB_RESET: "yes-destroy-data" }).ok).toBe(false);
    expect(canTruncateAll(url, { TEST_TRUNCATE_ALL: "yes-wipe-every-table" }).ok).toBe(false);
    expect(canTruncateAll(url, { ...YES, TEST_TRUNCATE_ALL: "1" }).ok).toBe(false);
    expect(canTruncateAll(url, { ...YES, ALLOW_DB_RESET: "yes" }).ok).toBe(false);
  });

  it("refuses malformed or missing URLs", () => {
    expect(canTruncateAll("not a url", YES).ok).toBe(false);
    expect(canTruncateAll("http://host/lotto_test", YES).ok).toBe(false);
    expect(canTruncateAll("", YES).ok).toBe(false);
    expect(canTruncateAll(undefined, YES).ok).toBe(false);
  });
});
