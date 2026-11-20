import { beforeEach, describe, expect, test } from "vitest";
import { q1, run } from "@/server/db";
import { hasTestDb, resetDb } from "@/test/db";
import { addBlock, blockMember, isBlocked, memberIdentity, removeBlock } from "./blocklist";

const now = Date.UTC(2026, 10, 9, 5, 0);
const staff = { id: 1, ip: null };
const client = { ip: "203.0.113.7", userAgent: "vitest" };

async function member(phone: string, account: string, name: string, bankName = name) {
  return (
    await run(
      "INSERT INTO users (phone, password_hash, name, bank_code, bank_account, bank_name, ref_code, created_at) VALUES (?, 'x', ?, 'kbank', ?, ?, ?, ?)",
      phone,
      name,
      account,
      bankName,
      `R${phone.slice(-6)}`,
      now,
    )
  ).lastId;
}

describe.skipIf(!hasTestDb)("member blocklist on MariaDB", () => {
  beforeEach(resetDb);

  test("blocking an account signs its member out at once and keeps them blocked until lifted", async () => {
    const id = await member("0811111111", "1234567890", "สมชาย ใจดี");
    await run("INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_seen_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)", "t".repeat(64), id, now, now + 86_400_000, now, client.ip, client.userAgent);
    const r = await addBlock({ kind: "bank", bankCode: null, value: "123-456-7890" }, "โกงโปรโมชั่น", staff, now);
    expect(r).toMatchObject({ ok: true, members: 1 });
    expect(await q1("SELECT 1 FROM sessions WHERE user_id = ?", id)).toBeUndefined();
    expect(await isBlocked((await memberIdentity(id))!)).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(await removeBlock(r.id, "ตรวจแล้วไม่ใช่", staff, now)).toEqual({ ok: true });
    expect(await isBlocked((await memberIdentity(id))!)).toBe(false);
  });

  test("a name matches the bank book name too, whatever the title", async () => {
    const id = await member("0822222222", "2222222222", "ชื่อเล่น", "นาย สมชาย ใจดี");
    await addBlock({ kind: "name", first: "สมชาย", last: "ใจดี" }, "ใช้หลายบัญชี", staff, now);
    expect(await isBlocked((await memberIdentity(id))!)).toBe(true);
  });

  test("the same detail cannot be blocked twice, and a member page blocks several details at once", async () => {
    const id = await member("0833333333", "3333333333", "สมศรี มีสุข");
    expect((await addBlock({ kind: "phone", value: "083-333-3333" }, "ทดสอบ", staff, now)).ok).toBe(true);
    expect(await addBlock({ kind: "phone", value: "0833333333" }, "ซ้ำ", staff, now)).toEqual({ ok: false, error: "exists" });
    expect(await blockMember(id, ["bank", "phone", "name"], "ทุจริต", staff, now)).toMatchObject({ ok: true, created: 2 });
  });
});
