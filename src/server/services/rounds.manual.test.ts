// src/server/services/rounds.manual.test.ts
// Manual rounds and the per-lottery auto-create switch, against a stubbed database (nothing real is touched).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bkkMs } from "@/core/rules/time";

const db = vi.hoisted(() => ({
  q: vi.fn<(sql: string, ...p: unknown[]) => Promise<unknown[]>>(async () => []),
  q1: vi.fn<(sql: string, ...p: unknown[]) => Promise<unknown>>(async () => undefined),
  run: vi.fn<(sql: string, ...p: unknown[]) => Promise<{ changes: number; lastId: number }>>(async () => ({ changes: 1, lastId: 42 })),
}));
const audit = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<void>>(async () => {}));
const getLotto = vi.hoisted(() => vi.fn());
const listLottos = vi.hoisted(() => vi.fn<() => Promise<unknown[]>>(async () => []));

vi.mock("@/server/db", () => ({
  ...db,
  tx: <T>(fn: () => Promise<T>) => fn(),
  afterCommit: (fn: () => void) => fn(),
  json: { str: JSON.stringify, parse: <T>(s: string | null, d: T) => (s ? (JSON.parse(s) as T) : d) },
}));
vi.mock("./settlement", () => ({ settlePending: vi.fn(async () => ({ bills: 0, items: 0 })) }));
vi.mock("./audit", () => ({ audit }));
vi.mock("./activities", () => ({ settleGuesses: vi.fn(async () => {}) }));
vi.mock("./lottos", () => ({ getLotto, listLottos }));
vi.mock("@/i18n/server", () => ({ errorsT: async () => ({ rounds: {} }), serverI18n: async () => ({ t: { errors: { rounds: {} } } }) }));

import { createRound, ensureRounds, reconcileRounds } from "./rounds";

const now = bkkMs(2026, 11, 4, 12, 0); // Wednesday
const weekly = { id: 1, enabled: true, autoRounds: true, format: "standard", resultDelayMin: 10, schedule: { kind: "weekly", days: [3], close: "20:15" } };
const yiki = { ...weekly, id: 2, schedule: { kind: "interval", firstClose: "06:00", everyMin: 15, count: 88 } };
const times = { opensAt: now, closesAt: now + 3_600_000, drawAt: now + 4_000_000 };
const inserts = () => db.run.mock.calls.filter((c) => /INSERT/.test(c[0]));

beforeEach(() => {
  vi.clearAllMocks();
  db.q.mockResolvedValue([]);
  db.q1.mockResolvedValue(undefined);
  db.run.mockResolvedValue({ changes: 1, lastId: 42 });
});

describe("createRound", () => {
  it("stores the round and marks it as made by hand", async () => {
    getLotto.mockResolvedValue(weekly);
    expect(await createRound(1, times, 5, now)).toEqual({ ok: true, id: 42 });
    expect(inserts()[0].slice(1)).toEqual([1, null, "2026-11-04", times.opensAt, times.closesAt, times.drawAt]);
    expect(audit).toHaveBeenCalledWith(5, "round.create", "round:42", { lottoId: 1, ...times }, now);
  });
  it("numbers an interval round after the day's last one", async () => {
    getLotto.mockResolvedValue(yiki);
    db.q1.mockResolvedValue({ n: 88 });
    await createRound(2, times, 5, now);
    expect(inserts()[0][2]).toBe(89);
  });
  it("leaves room for the numbers the scheduler will give that day's own rounds", async () => {
    getLotto.mockResolvedValue(yiki);
    db.q1.mockResolvedValue({ n: null });
    await createRound(2, times, 5, now);
    expect(inserts()[0][2]).toBe(89);
  });
  it("keeps clear of the schedule's numbers while automatic creation is off, since it may be turned back on", async () => {
    getLotto.mockResolvedValue({ ...yiki, autoRounds: false });
    db.q1.mockResolvedValue({ n: null });
    await createRound(2, times, 5, now);
    expect(inserts()[0][2]).toBe(89);
  });
  it("refuses a close time the lottery already has", async () => {
    getLotto.mockResolvedValue(weekly);
    db.run.mockResolvedValue({ changes: 0, lastId: 0 });
    expect(await createRound(1, times, 5, now)).toEqual({ ok: false, error: "duplicate" });
    expect(audit).not.toHaveBeenCalled();
  });
  it("refuses a missing or switched-off lottery and bad times", async () => {
    getLotto.mockResolvedValue(undefined);
    expect(await createRound(1, times, 5, now)).toEqual({ ok: false, error: "lotto" });
    getLotto.mockResolvedValue({ ...weekly, enabled: false });
    expect(await createRound(1, times, 5, now)).toEqual({ ok: false, error: "lotto" });
    getLotto.mockResolvedValue(weekly);
    expect(await createRound(1, { ...times, closesAt: now }, 5, now)).toEqual({ ok: false, error: "closePast" });
    expect(inserts()).toHaveLength(0);
  });
});

describe("auto-create switch", () => {
  it("creates nothing for a lottery with it off", async () => {
    listLottos.mockResolvedValue([{ ...weekly, autoRounds: false }]);
    expect(await ensureRounds(now)).toBe(0);
    expect(inserts()).toHaveLength(0);
  });
  it("keeps creating for a lottery with it on", async () => {
    listLottos.mockResolvedValue([weekly]);
    await ensureRounds(now);
    expect(inserts()).toHaveLength(1);
  });
  it("makes a schedule change leave every round alone while it is off", async () => {
    getLotto.mockResolvedValue({ ...weekly, autoRounds: false });
    expect(await reconcileRounds(1, 5, now)).toEqual({ updated: 0, cancelled: 0, reopened: 0, created: 0 });
    expect(db.run).not.toHaveBeenCalled();
  });
});

describe("reconcileRounds and manual rounds", () => {
  it("neither cancels nor moves a round made by hand", async () => {
    getLotto.mockResolvedValue(weekly);
    db.q.mockImplementation(async (sql) => {
      if (/r\.status = 'scheduled' AND r\.closes_at > \?/.test(sql)) return [{ id: 9, closes_at: times.closesAt }];
      if (/action = 'round\.create'/.test(sql)) return [{ target: "round:9" }];
      return [];
    });
    const out = await reconcileRounds(1, 5, now);
    expect([out.cancelled, out.updated]).toEqual([0, 0]);
    expect(audit).not.toHaveBeenCalled();
  });
});
