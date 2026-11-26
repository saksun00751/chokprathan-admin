import { describe, expect, it } from "vitest";
import { collectDebt, outstandingDebt, type Db } from "./debt";

/** A member and their debts held in memory, answering exactly the statements `collectDebt` sends. */
function memory(wallets: Record<string, number>, debts: { id: number; outstanding: number }[]) {
  const ledger: { wallet: string; amount: number; after: number; ref: string }[] = [];
  const sql: string[] = [];
  const db: Db = {
    async q<T>(text: string) {
      sql.push(text);
      return debts.filter((d) => d.outstanding > 0).map((d) => ({ ...d })) as T[];
    },
    async q1<T>(text: string) {
      sql.push(text);
      if (text.includes("FROM member_debts")) {
        const n = debts.reduce((s, d) => s + d.outstanding, 0);
        // MariaDB answers SUM as a string, or null over no rows.
        return { n: n ? String(n) : null } as T;
      }
      const column = /SELECT (\w+) AS v/.exec(text)![1];
      return { v: wallets[column] } as T;
    },
    async run(text: string, ...p: unknown[]) {
      sql.push(text);
      if (text.startsWith("UPDATE member_debts")) debts.find((d) => d.id === p[1])!.outstanding -= p[0] as number;
      else if (text.startsWith("UPDATE users")) wallets[/SET (\w+) =/.exec(text)![1]] -= p[0] as number;
      else ledger.push({ wallet: p[1] as string, amount: p[2] as number, after: p[3] as number, ref: p[4] as string });
      return { changes: 1, lastId: 1 };
    },
  };
  return { db, ledger, sql, wallets, debts };
}

describe("collectDebt", () => {
  it("locks nothing for a member who owes nothing", async () => {
    const m = memory({ balance: 500 }, []);
    expect(await collectDebt(m.db, 1, "balance", 500, 9)).toBe(0);
    expect(m.sql).toHaveLength(1);
    expect(m.sql[0]).not.toMatch(/FOR UPDATE/);
  });

  it("pays the oldest debt first and writes a running ledger", async () => {
    const m = memory({ balance: 800 }, [{ id: 1, outstanding: 700 }, { id: 2, outstanding: 300 }]);
    expect(await collectDebt(m.db, 1, "balance", 800, 9)).toBe(800);
    expect(m.wallets.balance).toBe(0);
    expect(m.debts.map((d) => d.outstanding)).toEqual([0, 200]);
    expect(m.ledger).toEqual([
      { wallet: "balance", amount: -700, after: 100, ref: "DEBT1" },
      { wallet: "balance", amount: -100, after: 0, ref: "DEBT2" },
    ]);
    expect(await outstandingDebt(m.db, 1)).toBe(200);
  });

  it("leaves the rest of a larger wallet", async () => {
    const m = memory({ balance: 100_000 }, [{ id: 1, outstanding: 74_900 }]);
    expect(await collectDebt(m.db, 1, "balance", 100_000, 9)).toBe(74_900);
    expect(m.wallets.balance).toBe(25_100);
  });

  it("takes from the wallet named, and nothing from an empty one", async () => {
    const m = memory({ balance: 0, cashback_balance: 100, affiliate_balance: 0 }, [{ id: 1, outstanding: 75_000 }]);
    expect(await collectDebt(m.db, 1, "affiliate", 500, 9)).toBe(0);
    expect(await collectDebt(m.db, 1, "cashback", 100, 9)).toBe(100);
    expect(m.debts[0].outstanding).toBe(74_900);
    expect(m.ledger).toEqual([{ wallet: "cashback", amount: -100, after: 0, ref: "DEBT1" }]);
  });

  it("takes no more than the money that just came in", async () => {
    const m = memory({ balance: 90_000 }, [{ id: 1, outstanding: 2_000_000 }]);
    expect(await collectDebt(m.db, 1, "balance", 10_000, 9)).toBe(10_000);
    expect(m.wallets.balance).toBe(80_000);
    expect(m.ledger).toEqual([{ wallet: "balance", amount: -10_000, after: 80_000, ref: "DEBT1" }]);
  });

  it("splits one incoming amount over several debts without passing it", async () => {
    const m = memory({ balance: 5_000 }, [{ id: 1, outstanding: 700 }, { id: 2, outstanding: 900 }]);
    expect(await collectDebt(m.db, 1, "balance", 1_000, 9)).toBe(1_000);
    expect(m.debts.map((d) => d.outstanding)).toEqual([0, 600]);
    expect(m.wallets.balance).toBe(4_000);
  });
});
