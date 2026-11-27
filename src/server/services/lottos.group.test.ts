// Switching a whole group on or off, against a stubbed database (nothing real is touched).
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  q: vi.fn<(sql: string, ...p: unknown[]) => Promise<unknown[]>>(async () => []),
  run: vi.fn<(sql: string, ...p: unknown[]) => Promise<{ changes: number; lastId: number }>>(async () => ({ changes: 2, lastId: 0 })),
  tx: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}));
vi.mock("@/server/db", () => ({ ...db, q1: vi.fn(), afterCommit: (fn: () => void) => fn(), json: { str: JSON.stringify, parse: <T>(_: string, d: T) => d } }));
vi.mock("./settings", () => ({ getSettings: vi.fn() }));

import { setGroupEnabled } from "./lottos";

beforeEach(() => vi.clearAllMocks());

describe("setGroupEnabled", () => {
  it("switches off the group's lotteries that are on, and names them", async () => {
    db.q.mockResolvedValue([{ slug: "a" }, { slug: "b" }]);
    expect(await setGroupEnabled("stock", false, 1000)).toEqual(["a", "b"]);
    expect(db.q.mock.calls[0]).toEqual([expect.stringMatching(/WHERE grp = \? AND enabled <> \? FOR UPDATE/), "stock", 0]);
    expect(db.run.mock.calls[0]).toEqual([expect.stringMatching(/^UPDATE lottos SET enabled = \?, updated_at = \? WHERE grp = \? AND enabled <> \?$/), 0, 1000, "stock", 0]);
  });

  it("switches them on", async () => {
    db.q.mockResolvedValue([{ slug: "a" }]);
    await setGroupEnabled("stock", true, 1000);
    expect(db.run.mock.calls[0].slice(1)).toEqual([1, 1000, "stock", 1]);
  });

  it("writes nothing when they are already there", async () => {
    db.q.mockResolvedValue([]);
    expect(await setGroupEnabled("stock", true)).toEqual([]);
    expect(db.run).not.toHaveBeenCalled();
  });
});
