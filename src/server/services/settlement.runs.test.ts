import { beforeEach, describe, expect, test } from "vitest";
import { q, q1, run } from "@/server/db";
import { hasTestDb, resetDb } from "@/test/db";
import { resumeSettlements } from "./rounds";
import { settlePending } from "./settlement";

describe.skipIf(!hasTestDb)("settlement runs", () => {
  let user: number;
  let lotto: number;
  beforeEach(async () => {
    await resetDb();
    await run("DELETE FROM bills");
    await run("DELETE FROM rounds");
    await run("DELETE FROM lottos");
    lotto = (await run("INSERT INTO lottos (slug, name, short_name, grp, format, schedule, rates, limits, risk) VALUES ('r','r','r','foreign','standard','{}','{}','{}','{}')")).lastId;
    user = (await run("INSERT INTO users (password_hash, ref_code, created_at) VALUES ('x', 'RUNS0001', 1)")).lastId;
  });

  const round = async (status: "resulted" | "cancelled", numbers: string[]) => {
    const id = (
      await run(
        "INSERT INTO rounds (lotto_id, day_key, opens_at, closes_at, draw_at, status, result, resulted_at) VALUES (?, '1970-01-01', 1, 2, 3, ?, ?, 5)",
        lotto,
        status,
        status === "resulted" ? JSON.stringify({ top3: "925", bottom2: "49" }) : null,
      )
    ).lastId;
    for (const [i, number] of numbers.entries()) {
      const bill = (await run("INSERT INTO bills (code, user_id, round_id, total_stake, created_at) VALUES (?, ?, ?, 1000, 1)", `CPRUN${id}${i}`, user, id)).lastId;
      await run("INSERT INTO bill_items (bill_id, round_id, bet_type, number, stake, segments, rate100, potential) VALUES (?, ?, 'top2', ?, 10, '[]', 9500, 95000)", bill, id, number);
    }
    return id;
  };
  const runs = (id: number) => q<{ id: number; kind: string; status: string }>("SELECT id, kind, status FROM settlement_runs WHERE round_id = ? ORDER BY id", id);
  const settledAt = async (id: number) => (await q1<{ settled_at: number | null }>("SELECT settled_at FROM rounds WHERE id = ?", id))!.settled_at;

  test("tags every bill and payment with one run and marks it done", async () => {
    const id = await round("resulted", ["25", "11", "25", "25", "11"]);
    await settlePending(id, 10);
    await settlePending(id, 20);
    const [r, ...rest] = await runs(id);
    expect(rest).toEqual([]);
    expect(r).toMatchObject({ kind: "result", status: "done" });
    expect(await q1("SELECT COUNT(*) AS n FROM bills WHERE round_id = ? AND settlement_run_id = ?", id, r.id)).toEqual({ n: 5 });
    expect(await q1("SELECT COUNT(*) AS n FROM transactions WHERE run_id = ? AND type = 'win'", r.id)).toEqual({ n: 3 });
    expect(await settledAt(id)).toBe(10);
  });

  test("records a cancellation as its own kind of run", async () => {
    const id = await round("cancelled", ["25", "11"]);
    await settlePending(id, 10);
    expect(await runs(id)).toMatchObject([{ kind: "cancel", status: "done" }]);
    expect(await q1("SELECT balance FROM users WHERE id = ?", user)).toEqual({ balance: 2000 });
  });

  test("pays a reopened round under a new run at today's rates", async () => {
    const rewards = (cashbackBp: number) =>
      run("INSERT INTO settings (`key`, `value`, updated_at) VALUES ('rewards', ?, 1) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)", JSON.stringify({ cashbackBp, aff1Bp: 0, aff2Bp: 0 }));
    await rewards(1000);
    const id = await round("cancelled", []);
    await settlePending(id, 10);
    // A schedule change brought the cancelled round back; it then takes a bet and gets a result.
    await run("UPDATE rounds SET status = 'resulted', result = ?, settled_at = NULL WHERE id = ?", JSON.stringify({ top3: "925", bottom2: "49" }), id);
    const bill = (await run("INSERT INTO bills (code, user_id, round_id, total_stake, created_at) VALUES ('CPAGAIN', ?, ?, 1000, 1)", user, id)).lastId;
    await run("INSERT INTO bill_items (bill_id, round_id, bet_type, number, stake, segments, rate100, potential) VALUES (?, ?, 'top2', '11', 10, '[]', 9500, 95000)", bill, id);
    await rewards(2000);
    await settlePending(id, 20);
    expect(await runs(id)).toMatchObject([{ kind: "cancel", status: "done" }, { kind: "result", status: "done" }]);
    expect(await q1("SELECT cashback_balance FROM users WHERE id = ?", user)).toEqual({ cashback_balance: 200 });
    await settlePending(id, 30);
    expect(await runs(id)).toHaveLength(2);
    expect(await settledAt(id)).toBe(20);
  });

  test("leaves the round unsettled when bills and ledger disagree, and does not retry by itself", async () => {
    const id = await round("resulted", ["25"]);
    // A bill already marked as paid in this run, with no matching ledger row.
    const runId = (await run("INSERT INTO settlement_runs (round_id, kind, created_at) VALUES (?, 'result', 1)", id)).lastId;
    await run("INSERT INTO bills (code, user_id, round_id, total_stake, total_payout, status, settlement_run_id, created_at) VALUES ('CPGHOST', ?, ?, 100, 500, 'won', ?, 1)", user, id, runId);
    await settlePending(id, 10);
    expect(await runs(id)).toMatchObject([{ status: "mismatch" }]);
    expect(await settledAt(id)).toBeNull();
    const paid = await q1("SELECT COUNT(*) AS n FROM transactions");
    expect(await resumeSettlements(20)).toBe(0);
    expect(await q1("SELECT COUNT(*) AS n FROM transactions")).toEqual(paid);
  });
});
