// src/server/services/rounds.guards.test.ts
// Auto-draw, resume and reopen rules, checked against a stubbed database (nothing real is touched).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bkkMs } from "@/core/rules/time";

const db = vi.hoisted(() => ({
  q: vi.fn<(sql: string, ...p: unknown[]) => Promise<unknown[]>>(async () => []),
  q1: vi.fn<(sql: string, ...p: unknown[]) => Promise<unknown>>(async () => undefined),
  run: vi.fn<(sql: string, ...p: unknown[]) => Promise<{ changes: number; lastId: number }>>(async () => ({ changes: 1, lastId: 1 })),
}));
const settlePending = vi.hoisted(() => vi.fn<(id: number, now?: number) => Promise<{ bills: number; items: number }>>(async () => ({ bills: 0, items: 0 })));
const audit = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<void>>(async () => {}));
const getLotto = vi.hoisted(() => vi.fn());
const listLottos = vi.hoisted(() => vi.fn(async () => [] as unknown[]));

vi.mock("@/server/db", () => ({
  ...db,
  tx: <T>(fn: () => Promise<T>) => fn(),
  afterCommit: (fn: () => void) => fn(),
  json: { str: JSON.stringify, parse: <T>(s: string | null, d: T) => (s ? (JSON.parse(s) as T) : d) },
}));
vi.mock("./settlement", () => ({ settlePending }));
vi.mock("./audit", () => ({ audit }));
vi.mock("./activities", () => ({ settleGuesses: vi.fn(async () => {}) }));
vi.mock("./lottos", () => ({ getLotto, listLottos }));
vi.mock("@/i18n/server", () => ({
  errorsT: async () => ({ rounds: {} }),
  serverI18n: async () => ({ t: { errors: { rounds: {}, result: undefined } } }),
}));

import { autoResults, reconcileRounds, resumeSettlements } from "./rounds";

const now = bkkMs(2026, 11, 4, 12, 0); // Wednesday
const lotto = { id: 1, autoRounds: true, format: "laos4", resultDelayMin: 10, schedule: { kind: "weekly", days: [3], close: "20:15" } };
const planned = bkkMs(2026, 11, 4, 20, 15);
const sqls = () => db.run.mock.calls.map((c) => c[0]);

beforeEach(() => {
  vi.clearAllMocks();
  db.q.mockResolvedValue([]);
  db.q1.mockResolvedValue(undefined);
  db.run.mockResolvedValue({ changes: 1, lastId: 1 });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("autoResults", () => {
  it("only picks rounds of house-run (yiki) lotteries", async () => {
    await autoResults(now);
    expect(db.q.mock.calls[0][0]).toMatch(/l\.auto_result = 1 AND l\.grp = 'yiki'/);
  });

  it("keeps drawing the other rounds when one fails", async () => {
    db.q.mockResolvedValueOnce([{ id: 1, format: "standard" }, { id: 2, format: "standard" }]);
    const seen: unknown[] = [];
    db.q1.mockImplementation(async (_sql, id) => {
      seen.push(id);
      if (id === 1) throw new Error("broken round");
      return undefined;
    });
    await expect(autoResults(now)).resolves.toBe(0);
    expect(seen).toContain(2);
    expect(console.error).toHaveBeenCalled();
  });
});

describe("resumeSettlements", () => {
  it("settles the remaining rounds when one fails, counting only the successes", async () => {
    db.q.mockResolvedValueOnce([{ id: 1 }, { id: 2 }]);
    settlePending.mockRejectedValueOnce(new Error("broken round"));
    await expect(resumeSettlements(now)).resolves.toBe(1);
    expect(settlePending).toHaveBeenCalledWith(2, now);
    expect(console.error).toHaveBeenCalled();
  });
});

describe("reconcileRounds", () => {
  const cancelled = (detail: string | null) => {
    getLotto.mockResolvedValue(lotto);
    db.q.mockImplementation(async (sql) => {
      if (/r\.status = 'cancelled'/.test(sql)) {
        return [{ id: 7, closes_at: planned, detail }];
      }
      return [];
    });
  };
  const reopening = () => sqls().filter((s) => /SET status = 'scheduled'/.test(s));

  it("reopens a planned round that a schedule change had cancelled", async () => {
    cancelled(JSON.stringify({ by: "schedule" }));
    const out = await reconcileRounds(1, 5, now);
    expect(out.reopened).toBe(1);
    expect(reopening()).toHaveLength(1);
    expect(reopening()[0]).toMatch(/NOT EXISTS \(SELECT 1 FROM bills/);
    expect(audit).toHaveBeenCalledWith(5, "round.reopen", "round:7", undefined, now);
  });

  it("leaves a round that staff cancelled", async () => {
    cancelled(null);
    const out = await reconcileRounds(1, 5, now);
    expect(out.reopened).toBe(0);
    expect(reopening()).toHaveLength(0);
  });

  it("marks the rounds it cancels itself as cancelled by the schedule", async () => {
    getLotto.mockResolvedValue(lotto);
    db.q.mockImplementation(async (sql) =>
      /r\.status = 'scheduled' AND r\.closes_at > \?/.test(sql) ? [{ id: 9, closes_at: planned + 60_000 }] : [],
    );
    db.q1.mockResolvedValue({ id: 9, status: "scheduled" });
    await reconcileRounds(1, 5, now);
    expect(audit).toHaveBeenCalledWith(5, "round.cancel", "round:9", { by: "schedule" }, now);
  });
});
