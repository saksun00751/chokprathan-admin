// src/server/services/scheduler.tick.test.ts
// One failing job must not stop the rest of a tick. Everything is stubbed.
import { describe, expect, it, vi } from "vitest";

const jobs = vi.hoisted(() => {
  const fail = () => vi.fn(async () => { throw new Error("boom"); });
  const ok = () => vi.fn(async () => {});
  return { ensureRounds: fail(), autoResults: fail(), resumeSettlements: fail(), expireDeposits: ok(), sealAudit: ok(), run: ok() };
});

vi.mock("@/server/db", () => ({ run: jobs.run, outsideTx: (f: () => void) => f(), withLock: async (_n: string, f: () => Promise<void>) => (await f(), { ran: true }) }));
vi.mock("./rounds", () => ({ ensureRounds: jobs.ensureRounds, autoResults: jobs.autoResults, resumeSettlements: jobs.resumeSettlements }));
vi.mock("./finance", () => ({ expireDeposits: jobs.expireDeposits }));
vi.mock("./employee-auth", () => ({ pruneEmployeeSessions: vi.fn(async () => {}) }));
vi.mock("./ratelimit", () => ({ pruneRateLimits: vi.fn(async () => {}) }));
vi.mock("./activities", () => ({ settlePendingGuesses: vi.fn(async () => {}) }));
vi.mock("@/server/stats/rollup", () => ({ rollupStats: vi.fn(async () => {}) }));
vi.mock("./audit", () => ({ sealAudit: jobs.sealAudit, verifyAudit: vi.fn(async () => {}) }));

import { tick } from "./scheduler";

describe("scheduler tick", () => {
  it("runs the later jobs and writes the heartbeat when round jobs fail", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(tick(Date.now())).resolves.toBeUndefined();
    expect(jobs.autoResults).toHaveBeenCalled();
    expect(jobs.resumeSettlements).toHaveBeenCalled();
    expect(jobs.expireDeposits).toHaveBeenCalled();
    expect(jobs.sealAudit).toHaveBeenCalled();
    expect(jobs.run).toHaveBeenCalled();
  });
});
