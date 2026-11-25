import { describe, expect, test } from "vitest";
import { MINUTE } from "chokprathan-core/rules/time";
import { dayOf, dayStartOf, emptyDay } from "./derive";
import { loadDays, type LoadDeps } from "./load";
import type { BuiltSpan, DayStats } from "./types";

const NOW = Date.UTC(2026, 10, 16, 8, 30);
const today = dayOf(NOW);

function deps(stored: DayStats[], { failSave = false } = {}) {
  const builds: [number, number][] = [];
  const saves: number[][] = [];
  const d: LoadDeps = {
    now: NOW,
    load: async (ids) => stored.filter((x) => ids.includes(x._id)),
    build: async (from, to): Promise<BuiltSpan> => {
      builds.push([from, to]);
      const days: DayStats[] = [];
      for (let x = from; x <= to; x++) days.push({ ...emptyDay(x, NOW), members: 100 + x - today });
      return { days, users: [] };
    },
    save: async (span) => {
      if (failSave) throw new Error("mongo down");
      saves.push(span.days.map((x) => x._id));
    },
  };
  return { d, builds, saves };
}

const closedDoc = (id: number, builtAt: number) => ({ ...emptyDay(id, builtAt), members: 7 });

describe("loading summary days", () => {
  test("a missing day is built from MariaDB and saved", async () => {
    const { d, builds, saves } = deps([]);
    const days = await loadDays(d, [today - 3]);
    expect(builds).toEqual([[today - 3, today - 3]]);
    expect(saves).toEqual([[today - 3]]);
    expect(days[0]).toMatchObject({ _id: today - 3, members: 97 });
  });

  test("today older than 3 minutes is rebuilt; a fresher one is kept", async () => {
    const stale = deps([closedDoc(today, NOW - 4 * MINUTE)]);
    expect((await loadDays(stale.d, [today]))[0].members).toBe(100);
    const fresh = deps([closedDoc(today, NOW - 2 * MINUTE)]);
    expect((await loadDays(fresh.d, [today]))[0].members).toBe(7);
    expect(fresh.builds).toEqual([]);
  });

  test("a past day built before it ended is rebuilt; one built after is kept", async () => {
    const early = deps([closedDoc(today - 1, dayStartOf(today) - MINUTE)]);
    expect((await loadDays(early.d, [today - 1]))[0].members).toBe(99);
    const done = deps([closedDoc(today - 1, dayStartOf(today) + MINUTE)]);
    expect((await loadDays(done.d, [today - 1]))[0].members).toBe(7);
    expect(done.builds).toEqual([]);
  });

  test("neighbouring missing days are built together, in day order", async () => {
    const { d, builds } = deps([closedDoc(today - 2, NOW)]);
    const days = await loadDays(d, [today - 4, today - 3, today - 2, today - 1]);
    expect(builds).toEqual([
      [today - 4, today - 3],
      [today - 1, today - 1],
    ]);
    expect(days.map((x) => x._id)).toEqual([today - 4, today - 3, today - 2, today - 1]);
  });

  test("days after today come back empty without touching MariaDB", async () => {
    const { d, builds } = deps([]);
    const days = await loadDays(d, [today + 1]);
    expect(builds).toEqual([]);
    expect(days[0]).toMatchObject({ _id: today + 1, members: 0 });
  });

  test("a failed save is passed to the caller, which then falls back to MariaDB", async () => {
    const { d } = deps([], { failSave: true });
    await expect(loadDays(d, [today - 3])).rejects.toThrow("mongo down");
  });
});
