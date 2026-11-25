import { describe, expect, it } from "vitest";
import { parseBkkLocal, roundTimesProblem } from "./round-input";
import { bkkMs } from "chokprathan-core/rules/time";

describe("parseBkkLocal", () => {
  it("reads a datetime-local value as Bangkok time", () => {
    expect(parseBkkLocal("2026-11-04T20:15")).toBe(bkkMs(2026, 11, 4, 20, 15));
  });
  it("rejects anything else, including dates that do not exist", () => {
    for (const v of ["", "2026-11-04", "2026-02-30T10:00", "2026-11-04T24:00", "2026-11-04T10:60", "x"]) expect(parseBkkLocal(v)).toBeNull();
  });
});

describe("roundTimesProblem", () => {
  const now = bkkMs(2026, 11, 4, 12, 0);
  const t = { opensAt: now, closesAt: now + 3_600_000, drawAt: now + 3_600_000 };
  it("accepts a round that opens now and draws at its close", () => {
    expect(roundTimesProblem(t, now)).toBeNull();
  });
  it("names what is wrong", () => {
    expect(roundTimesProblem({ ...t, closesAt: now }, now)).toBe("closePast");
    expect(roundTimesProblem({ ...t, opensAt: t.closesAt }, now)).toBe("openAfterClose");
    expect(roundTimesProblem({ ...t, drawAt: t.closesAt - 1 }, now)).toBe("drawBeforeClose");
    expect(roundTimesProblem({ ...t, closesAt: now + 400 * 86_400_000, drawAt: now + 400 * 86_400_000 }, now)).toBe("tooFar");
  });
});
