import { beforeEach, describe, expect, test } from "vitest";
import { invalidate, setCacheEnabled } from "@/server/cache";
import { json, q, run } from "@/server/db";
import { hasTestDb, resetDb } from "@/test/db";
import { roundBetConfigs } from "./risk";
import { applyConfigToRound, getRoundConfig, refreshRoundConfigs, roundHasBills } from "./round-configs";

const now = 1_000_000;

describe.skipIf(!hasTestDb)("round configs on MariaDB", () => {
  let lottoId: number;
  let roundId: number;

  beforeEach(async () => {
    await resetDb();
    await run("DELETE FROM bills");
    await run("DELETE FROM rounds");
    await run("DELETE FROM lottos");
    lottoId = (
      await run(
        `INSERT INTO lottos (slug, name, short_name, grp, format, schedule, rates, limits, risk)
         VALUES ('t', 't', 't', 'foreign', 'standard', '{"kind":"weekly","days":[1],"close":"20:00"}', ?, ?, '{}')`,
        json.str({ top3: 80000 }),
        json.str({ maxPerBill: 700, maxPerNumber: { top2: 55 } }),
      )
    ).lastId;
    roundId = (await run("INSERT INTO rounds (lotto_id, day_key, opens_at, closes_at, draw_at) VALUES (?, '1970-01-01', 1, ?, ?)", lottoId, now + 1000, now + 2000)).lastId;
    invalidate("lottos");
  });

  const setRate = async (rate: number) => {
    await run("UPDATE lottos SET rates = ? WHERE id = ?", json.str({ top3: rate }), lottoId);
    invalidate("lottos");
  };
  const top3 = async () => (await getRoundConfig(roundId))!.config.packages[0].rates.top3!.rate100;
  const addBill = async () => {
    const user = (await run("INSERT INTO users (password_hash, ref_code, created_at) VALUES ('x', 'RCFG0001', 1)")).lastId;
    await run("INSERT INTO bills (code, user_id, round_id, total_stake, created_at) VALUES ('CPTEST0001', ?, ?, 100, 1)", user, roundId);
  };

  test("copies the lottery's rates and limits into the round", async () => {
    await refreshRoundConfigs(now);
    const stored = (await getRoundConfig(roundId))!;
    expect(stored.version).toBe(1);
    expect(stored.config.maxPerBill).toBe(700);
    expect(stored.config.betTypes.top2!.maxPerNumber).toBe(55);
    expect(stored.config.packages.map((p) => p.code)).toEqual(["standard"]);
    expect(stored.config.packages[0].rates.top3).toEqual({ rate100: 80000, discountBp: 0 });
    expect(stored.config.packages[0].rates.top4).toBeUndefined();
  });

  test("follows a change while the round has no bill, without piling up versions", async () => {
    await refreshRoundConfigs(now);
    await setRate(70000);
    await refreshRoundConfigs(now);
    await refreshRoundConfigs(now);
    expect(await top3()).toBe(70000);
    expect(await q("SELECT version FROM round_configs WHERE round_id = ?", roundId)).toEqual([{ version: 1 }]);
  });

  test("stops following once the round has a bill", async () => {
    await refreshRoundConfigs(now);
    await addBill();
    await setRate(70000);
    await refreshRoundConfigs(now);
    expect(await top3()).toBe(80000);
  });

  test("builds from what is stored now, not from this process's cached copy", async () => {
    setCacheEnabled(true);
    try {
      await refreshRoundConfigs(now);
      // Another process saves a new rate: this one's cache is not told.
      await run("UPDATE lottos SET rates = ? WHERE id = ?", json.str({ top3: 60000 }), lottoId);
      await refreshRoundConfigs(now);
      expect(await top3()).toBe(60000);

      await addBill();
      await run("UPDATE lottos SET rates = ? WHERE id = ?", json.str({ top3: 50000 }), lottoId);
      expect(await applyConfigToRound(roundId, 1, now)).toEqual({ ok: true, version: 2 });
      expect(await top3()).toBe(50000);
    } finally {
      setCacheEnabled(false);
    }
  });

  test("counts a cancelled bill: the round stays locked, so staff must be offered the apply button", async () => {
    await refreshRoundConfigs(now);
    expect(await roundHasBills(roundId)).toBe(false);
    await addBill();
    await run("UPDATE bills SET status = 'cancelled' WHERE round_id = ?", roundId);
    expect(await roundHasBills(roundId)).toBe(true);
  });

  test("drops an override the lottery no longer has", async () => {
    await refreshRoundConfigs(now);
    await run("UPDATE lottos SET rates = '{}' WHERE id = ?", lottoId);
    invalidate("lottos");
    await refreshRoundConfigs(now);
    expect(await top3()).not.toBe(80000);
    expect(await q("SELECT bet_type FROM lotto_rate_overrides WHERE lotto_id = ?", lottoId)).toEqual([]);
  });

  test("shows staff the prices the round pays, not the lottery's current ones", async () => {
    const top3Rate = async () => (await roundBetConfigs(roundId)).find((c) => c.code === "top3")!.rate100;
    await setRate(60000);
    // No stored config yet: the lottery's own.
    expect(await top3Rate()).toBe(60000);
    await setRate(80000);
    await refreshRoundConfigs(now);
    await addBill();
    await setRate(70000);
    await refreshRoundConfigs(now);
    expect(await top3Rate()).toBe(80000);
  });

  test("staff can push new settings onto a round with bills: a new version, old bills unmoved", async () => {
    await refreshRoundConfigs(now);
    await addBill();
    await run("UPDATE bills SET config_version = 1");
    await setRate(70000);
    await refreshRoundConfigs(now);
    expect(await applyConfigToRound(roundId, 5, now)).toEqual({ ok: true, version: 2 });
    expect(await top3()).toBe(70000);
    expect(await q("SELECT config_version FROM bills")).toEqual([{ config_version: 1 }]);
    expect(await q("SELECT version, created_by FROM round_configs WHERE round_id = ? ORDER BY version", roundId)).toEqual([
      { version: 1, created_by: null },
      { version: 2, created_by: 5 },
    ]);
    expect(await q("SELECT actor_id FROM audit_log WHERE action = 'round.config'")).toEqual([{ actor_id: 5 }]);
    // The sync job leaves it alone.
    await setRate(60000);
    await refreshRoundConfigs(now);
    expect(await top3()).toBe(70000);
  });

  test("refuses when nothing changed, the round is not open for it, or has no config", async () => {
    expect(await applyConfigToRound(999999, 5, now)).toEqual({ ok: false, error: "notFound" });
    expect(await applyConfigToRound(roundId, 5, now)).toEqual({ ok: false, error: "noConfig" });
    await refreshRoundConfigs(now);
    expect(await applyConfigToRound(roundId, 5, now)).toEqual({ ok: false, error: "unchanged" });
    await setRate(70000);
    expect(await applyConfigToRound(roundId, 5, now + 1000)).toEqual({ ok: false, error: "notOpen" });
    await run("UPDATE rounds SET status = 'cancelled' WHERE id = ?", roundId);
    expect(await applyConfigToRound(roundId, 5, now)).toEqual({ ok: false, error: "notOpen" });
  });

  test("leaves closed rounds alone", async () => {
    await refreshRoundConfigs(now + 5000);
    expect(await getRoundConfig(roundId)).toBeUndefined();
  });
});
