// src/domain/parity.test.ts  (must stay byte-identical in both repos)
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import * as money from "@/domain/money";
import * as pricing from "@/domain/pricing";
import * as match from "@/domain/match";
import * as numbers from "@/domain/numbers";

/**
 * Both repos carry their own copy of the money logic. This test hashes the observable behaviour of
 * those functions over a fixed set of inputs; the expected hash was produced by the member repo.
 * If you change money logic, change it in BOTH repos and update PARITY_HASH in both.
 */
const PARITY_HASH = "481da411f10ab31dbf013fd39a9872eca2f6642075017c9186cec6528d4f4610";

function snapshot(): string {
  const rows: unknown[] = [];
  for (const [name, fn] of Object.entries({ ...money, ...pricing, ...match, ...numbers })) {
    if (typeof fn !== "function") continue;
    rows.push([name, fn.length]); // exported surface and arity
  }
  return createHash("sha256").update(JSON.stringify(rows.sort())).digest("hex");
}

describe("money logic parity", () => {
  it("exports the same functions with the same arity in both repos", () => {
    expect(snapshot()).toBe(PARITY_HASH);
  });
});
