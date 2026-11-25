// src/server/services/lotto-groups.test.ts
// Group rules against a stubbed database (nothing real is touched).
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  q: vi.fn<(sql: string, ...p: unknown[]) => Promise<unknown[]>>(async () => []),
  q1: vi.fn<(sql: string, ...p: unknown[]) => Promise<unknown>>(async () => undefined),
  run: vi.fn<(sql: string, ...p: unknown[]) => Promise<{ changes: number }>>(async () => ({ changes: 1 })),
}));
vi.mock("@/server/db", () => ({
  ...db,
  tx: <T>(fn: () => Promise<T>) => fn(),
  afterCommit: (fn: () => void) => fn(),
  tolerateMissingTable: <T>(fn: () => Promise<T>) => fn(),
  json: { str: JSON.stringify, parse: <T>(s: string | null, d: T) => (s ? (JSON.parse(s) as T) : d) },
}));

import { createGroup, deleteGroup, moveGroup, updateGroup } from "./lotto-groups";

const input = { name: "หวยลาว", i18n: {}, art: "coins" };
const writes = () => db.run.mock.calls.map((c) => c[0]);

beforeEach(() => {
  vi.clearAllMocks();
  db.q.mockResolvedValue([]);
  db.q1.mockResolvedValue(undefined);
  db.run.mockResolvedValue({ changes: 1 });
});

describe("createGroup", () => {
  it("stores a new group after the last one", async () => {
    const code = await createGroup(input, 1000);
    expect(code).toMatch(/^g[0-9a-f]{8}$/);
    expect(db.run.mock.calls[0].slice(1)).toEqual([code, "หวยลาว", "{}", "coins", 50, 1000]);
  });
});

describe("updateGroup", () => {
  it("writes a built-in even when its row is missing", async () => {
    expect(await updateGroup("thai", input, 1000)).toBe(true);
    expect(writes()[0]).toMatch(/INSERT INTO lotto_groups .* ON DUPLICATE KEY UPDATE/);
  });
  it("refuses an unknown group", async () => {
    expect(await updateGroup("gone", input, 1000)).toBe(false);
    expect(writes()).toHaveLength(0);
  });
});

describe("deleteGroup", () => {
  it("never deletes a built-in", async () => {
    expect(await deleteGroup("thai")).toBe("builtin");
    expect(writes()).toHaveLength(0);
  });
  it("keeps a group that still has lotteries", async () => {
    db.q1.mockResolvedValueOnce({ code: "g1" }).mockResolvedValueOnce({ id: 3 });
    expect(await deleteGroup("g1")).toBe("used");
    expect(writes()).toHaveLength(0);
  });
  it("deletes an empty group", async () => {
    db.q1.mockResolvedValueOnce({ code: "g1" });
    expect(await deleteGroup("g1")).toBe("ok");
    expect(writes()[0]).toMatch(/DELETE FROM lotto_groups/);
  });
  it("reports a group that does not exist", async () => {
    expect(await deleteGroup("g1")).toBe("missing");
  });
});

describe("moveGroup", () => {
  it("swaps with the neighbour and renumbers every group", async () => {
    expect(await moveGroup("foreign", -1, 1000)).toBe(true);
    expect(db.run.mock.calls.map((c) => [c[1], c[5]])).toEqual([["foreign", 10], ["thai", 20], ["stock", 30], ["yiki", 40]]);
  });
  it("does nothing past either end", async () => {
    expect(await moveGroup("thai", -1, 1000)).toBe(false);
    expect(writes()).toHaveLength(0);
  });
});
