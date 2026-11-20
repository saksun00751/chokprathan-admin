import { describe, expect, test } from "vitest";
import { chainHash, GENESIS, verifyChain, type ChainRow, type SealedRow } from "./audit-chain";

const base: ChainRow = { seq: 1, id: 10, actor_id: 1, action: "member.adjust", target: "user:7", detail: '{"amount":5000}', ip: "1.2.3.4", ua: "Chrome", created_at: 1_000 };

function seal(rows: Omit<ChainRow, "seq">[]): SealedRow[] {
  let prev = GENESIS;
  return rows.map((r, i) => {
    const row = { ...r, seq: i + 1 };
    const hash = chainHash(prev, row);
    const sealed = { ...row, prev_hash: prev, hash };
    prev = hash;
    return sealed;
  });
}

const three = seal([
  { id: 10, actor_id: 1, action: "member.adjust", target: "user:7", detail: '{"amount":5000}', ip: "1.2.3.4", ua: "Chrome", created_at: 1_000 },
  { id: 11, actor_id: 2, action: "deposit.approve", target: "deposit:3", detail: null, ip: null, ua: null, created_at: 2_000 },
  { id: 12, actor_id: 1, action: "settings.update", target: null, detail: '{"before":{"x":1},"after":{"x":2}}', ip: "1.2.3.4", ua: "Chrome", created_at: 3_000 },
]);

describe("audit hash chain", () => {
  test("the same row hashes the same; changing any field changes the hash", () => {
    expect(chainHash(GENESIS, base)).toBe(chainHash(GENESIS, { ...base }));
    for (const change of [{ detail: '{"amount":50000}' }, { actor_id: 2 }, { created_at: 1_001 }, { ip: "5.6.7.8" }, { action: "member.note" }]) {
      expect(chainHash(GENESIS, { ...base, ...change })).not.toBe(chainHash(GENESIS, base));
    }
    expect(chainHash("a".repeat(64), base)).not.toBe(chainHash(GENESIS, base));
  });

  test("an untouched chain verifies", () => {
    expect(verifyChain(three, GENESIS, 1)).toEqual({ ok: true, last: { seq: 3, hash: three[2].hash } });
  });

  test("a row edited in the database breaks the chain at that row", () => {
    const edited = three.map((r) => (r.seq === 2 ? { ...r, detail: '{"note":"changed"}' } : r));
    expect(verifyChain(edited, GENESIS, 1)).toEqual({ ok: false, seq: 2, reason: "hash" });
  });

  test("a deleted row shows up as a gap", () => {
    expect(verifyChain([three[0], three[2]], GENESIS, 1)).toEqual({ ok: false, seq: 2, reason: "gap" });
  });

  test("a row whose hash was recomputed after an edit no longer links to the next row", () => {
    const tampered = { ...three[1], detail: '{"note":"changed"}' };
    tampered.hash = chainHash(tampered.prev_hash, tampered);
    expect(verifyChain([three[0], tampered, three[2]], GENESIS, 1)).toEqual({ ok: false, seq: 3, reason: "link" });
  });

  test("verification can continue from a checkpoint", () => {
    expect(verifyChain(three.slice(1), three[0].hash, 2)).toEqual({ ok: true, last: { seq: 3, hash: three[2].hash } });
    expect(verifyChain([], three[2].hash, 4)).toEqual({ ok: true, last: null });
  });
});
