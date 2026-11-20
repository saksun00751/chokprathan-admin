import { beforeEach, describe, expect, test } from "vitest";
import { q1, run } from "@/server/db";
import { hasTestDb, resetDb } from "@/test/db";
import { approveDeposit } from "./finance";
import { InsufficientPointsError, awardPoints, movePoints, pointsOf } from "./points";
import { setSetting } from "./settings";

const now = Date.UTC(2026, 10, 9, 5, 0);

async function member(phone: string) {
  return (await run("INSERT INTO users (phone, password_hash, name, ref_code, created_at) VALUES (?, 'x', 'ทดสอบ', ?, ?)", phone, `R${phone.slice(-6)}`, now))
    .lastId;
}

async function pendingDeposit(userId: number, amount: number) {
  return (
    await run("INSERT INTO deposits (user_id, amount, status, created_at, expires_at) VALUES (?, ?, 'pending', ?, ?)", userId, amount, now, now + 3_600_000)
  ).lastId;
}

describe.skipIf(!hasTestDb)("loyalty points on MariaDB", () => {
  beforeEach(resetDb);

  test("an approved deposit earns points under the default rule, counted on the deposit only", async () => {
    const id = await member("0811111111");
    expect((await approveDeposit(await pendingDeposit(id, 1_250_00), null, now)).ok).toBe(true);
    const { points, moves } = await pointsOf(id);
    expect(points).toBe(12);
    expect(moves[0]).toMatchObject({ amount: 12, balance_after: 12, kind: "deposit", ref: expect.stringMatching(/^DP/) });
  });

  test("the rule from the settings page applies, and off means nothing is earned", async () => {
    const id = await member("0811111111");
    await setSetting("points", { enabled: true, every: 50_00, points: 3 }, now);
    expect(await awardPoints(id, 175_00, "topup", { now })).toBe(9);
    await setSetting("points", { enabled: false, every: 50_00, points: 3 }, now);
    expect(await awardPoints(id, 175_00, "topup", { now })).toBe(0);
    expect((await pointsOf(id)).points).toBe(9);
  });

  test("staff can deduct points, but never below zero", async () => {
    const id = await member("0811111111");
    await movePoints(id, 10, "adjust", { note: "ชดเชย", now });
    expect(await movePoints(id, -4, "adjust", { note: "แก้ไข", now })).toBe(6);
    await expect(movePoints(id, -7, "adjust", { note: "เกิน", now })).rejects.toBeInstanceOf(InsufficientPointsError);
    expect((await q1<{ points: number }>("SELECT points FROM member_points WHERE user_id = ?", id))?.points).toBe(6);
  });
});
