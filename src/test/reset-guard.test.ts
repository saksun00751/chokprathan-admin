import { describe, expect, it } from "vitest";
import { truncateAllAllowed } from "./reset-guard";

const YES = "yes-destroy-data";

describe("truncateAllAllowed", () => {
  it("allows a local database with the reset flag", () => {
    expect(truncateAllAllowed("mysql://root:pw@127.0.0.1:3307/lotto_full", YES)).toEqual({ ok: true });
    expect(truncateAllAllowed("mysql://root:pw@localhost/lotto", YES)).toEqual({ ok: true });
    expect(truncateAllAllowed("mysql://root:pw@LOCALHOST:3306/lotto", YES)).toEqual({ ok: true });
  });

  it("refuses any remote host", () => {
    for (const url of [
      "mysql://root:pw@139.59.96.78:3306/lotto",
      "mysql://root:pw@db.example.com/lotto",
      "mysql://root:pw@127.0.0.2/lotto",
      "mysql://root:pw@localhost.evil.com/lotto",
      "mysql://root:pw@[::1]/lotto",
    ]) {
      expect(truncateAllAllowed(url, YES).ok, url).toBe(false);
    }
  });

  it("refuses malformed or missing URLs", () => {
    expect(truncateAllAllowed("not a url", YES).ok).toBe(false);
    expect(truncateAllAllowed("", YES).ok).toBe(false);
    expect(truncateAllAllowed(undefined, YES).ok).toBe(false);
  });

  it("refuses without the reset flag", () => {
    expect(truncateAllAllowed("mysql://root:pw@127.0.0.1/lotto", undefined).ok).toBe(false);
    expect(truncateAllAllowed("mysql://root:pw@127.0.0.1/lotto", "yes").ok).toBe(false);
  });
});
