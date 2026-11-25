// src/server/services/lottos.create.test.ts
// Adding a lottery, against a stubbed database (nothing real is touched).
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  q: vi.fn<(sql: string, ...p: unknown[]) => Promise<unknown[]>>(async () => []),
  q1: vi.fn<(sql: string, ...p: unknown[]) => Promise<unknown>>(async () => ({ n: 7 })),
  run: vi.fn<(sql: string, ...p: unknown[]) => Promise<{ changes: number; lastId: number }>>(async () => ({ changes: 1, lastId: 12 })),
}));
vi.mock("@/server/db", () => ({
  ...db,
  afterCommit: (fn: () => void) => fn(),
  json: { str: JSON.stringify, parse: <T>(s: string | null, d: T) => (s ? (JSON.parse(s) as T) : d) },
}));
vi.mock("./settings", () => ({ getSettings: vi.fn() }));

import { createLotto, type NewLotto } from "./lottos";

const input: NewLotto = {
  slug: "laos-star",
  name: "หวยลาวสตาร์",
  shortName: "ลาวสตาร์",
  group: "foreign",
  format: "laos4",
  flag: "LA",
  schedule: { kind: "weekly", days: [1], close: "15:35" },
  resultDelayMin: 25,
};

beforeEach(() => {
  vi.clearAllMocks();
  db.q1.mockResolvedValue({ n: 7 });
  db.run.mockResolvedValue({ changes: 1, lastId: 12 });
});

describe("createLotto", () => {
  it("adds it switched off, with manual results, after the last one", async () => {
    expect(await createLotto(input, 1000)).toBe(12);
    const [sql, ...params] = db.run.mock.calls[0];
    expect(sql).toMatch(/auto_result, enabled, sort/);
    expect(sql).toMatch(/\?, \?, \?, \?, \?, \?, \?, 0, 0, \?, \?, '\{\}', '\{\}', '\{\}', \?/);
    expect(params).toEqual(["laos-star", "หวยลาวสตาร์", "ลาวสตาร์", "foreign", "laos4", JSON.stringify(input.schedule), 25, 8, "LA", 1000]);
  });
  it("returns null when the slug is taken", async () => {
    db.run.mockResolvedValue({ changes: 0, lastId: 0 });
    expect(await createLotto(input, 1000)).toBeNull();
  });
});
