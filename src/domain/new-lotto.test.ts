import { describe, expect, it } from "vitest";
import { copyFromLotto, detailProblems, isLottoSlug, matchesLotto, scheduleProblem, suggestSlug } from "./new-lotto";

describe("isLottoSlug", () => {
  it("accepts lower-case words joined by hyphens", () => {
    for (const v of ["laos-star", "hanoi2", "ab"]) expect(isLottoSlug(v)).toBe(true);
  });
  it("rejects anything that would break a link or a dictionary lookup", () => {
    for (const v of ["", "a", "Laos", "laos star", "-laos", "laos-", "a--b", "2d", "ลาว", "constructor", "x".repeat(41)]) expect(isLottoSlug(v)).toBe(false);
  });
});

describe("suggestSlug", () => {
  it("turns an English short name into a link code", () => {
    expect(suggestSlug("  Hanoi VIP ", [])).toBe("hanoi-vip");
    expect(suggestSlug("Laos (Star) #2", [])).toBe("laos-star-2");
  });
  it("numbers the code when it is taken", () => {
    expect(suggestSlug("Hanoi", ["hanoi", "hanoi-2"])).toBe("hanoi-3");
  });
  it("suggests nothing when the name cannot give a whole code", () => {
    for (const v of ["", "ฮานอย", "ฮานอย VIP", "4D", "A"]) expect(suggestSlug(v, [])).toBe("");
  });
  it("stays within the length limit, also when numbered", () => {
    const long = "a".repeat(60);
    expect(suggestSlug(long, [])).toBe("a".repeat(40));
    expect(isLottoSlug(suggestSlug(long, ["a".repeat(40)]))).toBe(true);
  });
});

describe("detailProblems", () => {
  const good = { name: "ฮานอย พิเศษ", shortName: "ฮานอย", slug: "hanoi", group: "foreign" };
  it("finds nothing wrong with a complete entry", () => {
    expect(detailProblems(good, [])).toEqual({});
  });
  it("applies the same length limits as the server, ignoring outer spaces", () => {
    expect(detailProblems({ ...good, name: " ก ", shortName: "  " }, [])).toEqual({ name: "name", shortName: "shortName" });
    expect(detailProblems({ ...good, name: "ก".repeat(61), shortName: "ก".repeat(31) }, [])).toEqual({ name: "name", shortName: "shortName" });
  });
  it("tells a badly formed link code from a taken one", () => {
    expect(detailProblems({ ...good, slug: "2d" }, [])).toEqual({ slug: "slugFormat" });
    expect(detailProblems(good, ["hanoi"])).toEqual({ slug: "slugTaken" });
  });
  it("requires a group", () => {
    expect(detailProblems({ ...good, group: "" }, [])).toEqual({ group: "group" });
  });
});

describe("scheduleProblem", () => {
  const weekly = { kind: "weekly", days: [1], close: "15:00" } as const;
  const interval = { kind: "interval", firstClose: "06:00", everyMin: 15, count: 88 } as const;
  it("accepts a complete schedule", () => {
    expect(scheduleProblem({ ...weekly, days: [1] }, 20)).toBeNull();
    expect(scheduleProblem({ kind: "monthly", days: [1, 16], close: "15:00", opens: "00:00" }, 0)).toBeNull();
    expect(scheduleProblem(interval, 1440)).toBeNull();
  });
  it("requires a draw day", () => {
    expect(scheduleProblem({ ...weekly, days: [] }, 20)).toBe("days");
    expect(scheduleProblem({ kind: "monthly", days: [], close: "15:00" }, 20)).toBe("days");
  });
  it("requires filled-in times", () => {
    expect(scheduleProblem({ ...weekly, days: [1], close: "" }, 20)).toBe("time");
    expect(scheduleProblem({ ...weekly, days: [1], opens: "" }, 20)).toBe("time");
    expect(scheduleProblem({ ...interval, firstClose: "" }, 20)).toBe("time");
  });
  it("requires the own opening time to come before the (first) close", () => {
    expect(scheduleProblem({ ...weekly, days: [1], opens: "15:00" }, 20)).toBe("opens");
    expect(scheduleProblem({ ...interval, opens: "07:00" }, 20)).toBe("opens");
  });
  it("limits the interval, round count and result delay as the server does", () => {
    expect(scheduleProblem({ ...interval, everyMin: 4 }, 20)).toBe("everyMin");
    expect(scheduleProblem({ ...interval, everyMin: 721 }, 20)).toBe("everyMin");
    expect(scheduleProblem({ ...interval, count: 0 }, 20)).toBe("count");
    expect(scheduleProblem({ ...interval, count: 289 }, 20)).toBe("count");
    expect(scheduleProblem(interval, 1441)).toBe("delay");
  });
});

describe("copyFromLotto", () => {
  const source = {
    name: "ฮานอย", slug: "hanoi", group: "foreign", format: "laos4", flag: "VN", resultDelayMin: 5,
    schedule: { kind: "weekly", days: [1, 2], close: "17:00" }, rates: { top2: 9000 },
  } as const;
  it("takes only the settings, never the names, link code or rates", () => {
    expect(copyFromLotto({ ...source, schedule: { ...source.schedule, days: [1, 2] } })).toEqual({
      group: "foreign", format: "laos4", flag: "VN", resultDelayMin: 5,
      schedule: { kind: "weekly", days: [1, 2], close: "17:00" },
    });
  });
  it("copies the schedule, so editing it leaves the source alone", () => {
    const original = { ...source, schedule: { kind: "weekly" as const, days: [1, 2], close: "17:00" } };
    const copy = copyFromLotto(original);
    (copy.schedule as { days: number[] }).days.push(3);
    expect(original.schedule.days).toEqual([1, 2]);
  });
});

describe("matchesLotto", () => {
  const l = { name: "หวยฮานอย พิเศษ", shortName: "ฮานอย", slug: "hanoi-vip" };
  it("matches the full name, short name or link code, ignoring case and outer spaces", () => {
    for (const q of ["", "  ", "พิเศษ", "ฮานอย", " HANOI "]) expect(matchesLotto(l, q)).toBe(true);
    expect(matchesLotto(l, "ลาว")).toBe(false);
  });
});
