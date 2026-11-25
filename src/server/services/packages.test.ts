import { beforeEach, describe, expect, test } from "vitest";
import { netPayoutPerBaht } from "@/domain/packages";
import { invalidate } from "@/server/cache";
import { q, run } from "@/server/db";
import { hasTestDb, resetDb } from "@/test/db";
import { listPackages, savePackage, setLottoPackage } from "./packages";
import { getRoundConfig, refreshRoundConfigs } from "./round-configs";

describe("payout per baht paid", () => {
  test("lifts the rate by what the discount takes off the price", () => {
    expect(netPayoutPerBaht(75_000, 1500)).toBe(882.35);
    expect(netPayoutPerBaht(90_000, 0)).toBe(900);
    expect(netPayoutPerBaht(320, 1000)).toBe(3.56);
  });
});

const input = (over: Partial<Parameters<typeof savePackage>[1]> = {}) => ({
  name: "ลด 15%",
  sort: 10,
  active: true,
  rates: { top3: { rate100: 75_000, discountBp: 1500 }, top2: { rate100: 7_500, discountBp: 1500 } },
  ...over,
});

describe.skipIf(!hasTestDb)("price packages on MariaDB", () => {
  const now = 1_000_000;
  let offering: number;
  let other: number;
  let rounds: Record<number, number>;

  beforeEach(async () => {
    await resetDb();
    await run("DELETE FROM bills");
    await run("DELETE FROM rounds");
    await run("DELETE FROM lottos");
    rounds = {};
    const lotto = async (slug: string) => {
      const id = (
        await run(
          `INSERT INTO lottos (slug, name, short_name, grp, format, schedule, rates, limits, risk)
           VALUES (?, ?, ?, 'foreign', 'standard', '{"kind":"weekly","days":[1],"close":"20:00"}', '{}', '{}', '{}')`,
          slug,
          slug,
          slug,
        )
      ).lastId;
      rounds[id] = (await run("INSERT INTO rounds (lotto_id, day_key, opens_at, closes_at, draw_at) VALUES (?, '1970-01-01', 1, ?, ?)", id, now + 1000, now + 2000)).lastId;
      return id;
    };
    offering = await lotto("a");
    other = await lotto("b");
    invalidate("lottos");
    await refreshRoundConfigs(now);
  });

  const codes = async (lottoId: number) => (await getRoundConfig(rounds[lottoId]))!.config.packages.map((p) => p.name);
  const create = async () => {
    const r = await savePackage(null, input(), 1, now);
    if (!r.ok) throw new Error(r.error);
    return r.id;
  };
  const standardId = async () => (await listPackages()).find((p) => p.standard)!.id;

  test("refuses the standard package and bad values", async () => {
    const standard = await standardId();
    expect(await savePackage(standard, input(), 1, now)).toEqual({ ok: false, error: "standard" });
    expect(await setLottoPackage(offering, standard, { offered: false, overrides: {} }, 1, now)).toEqual({ ok: false, error: "standard" });
    expect(await savePackage(null, input({ name: " a " }), 1, now)).toEqual({ ok: false, error: "name" });
    expect(await savePackage(null, input({ rates: {} }), 1, now)).toEqual({ ok: false, error: "noRates" });
    expect(await savePackage(null, input({ rates: { top3: { rate100: 0, discountBp: 0 } } }), 1, now)).toEqual({ ok: false, error: "rate" });
    expect(await savePackage(null, input({ rates: { top3: { rate100: 1.5, discountBp: 0 } } }), 1, now)).toEqual({ ok: false, error: "rate" });
    expect(await savePackage(null, input({ rates: { top3: { rate100: 100, discountBp: 10_000 } } }), 1, now)).toEqual({ ok: false, error: "discount" });
    expect(await savePackage(999999, input(), 1, now)).toEqual({ ok: false, error: "notFound" });
    expect(await setLottoPackage(999999, await create(), { offered: true, overrides: {} }, 1, now)).toEqual({ ok: false, error: "notFound" });
  });

  test("a package reaches the unbet rounds of the lotteries that offer it, and no others", async () => {
    const id = await create();
    expect(await codes(offering)).toEqual(["มาตรฐาน"]);
    expect(await setLottoPackage(offering, id, { offered: true, overrides: {} }, 1, now)).toEqual({ ok: true });
    expect(await codes(offering)).toEqual(["มาตรฐาน", "ลด 15%"]);
    expect(await codes(other)).toEqual(["มาตรฐาน"]);
    const pack = (await getRoundConfig(rounds[offering]))!.config.packages[1];
    expect(pack.rates.top3).toEqual({ rate100: 75_000, discountBp: 1500 });
    expect(Object.keys(pack.rates)).toEqual(["top3", "top2"]);
  });

  test("a lottery's own values override one field and survive the mirror", async () => {
    const id = await create();
    await setLottoPackage(offering, id, { offered: true, overrides: { top3: { rate100: 70_000, discountBp: null } } }, 1, now);
    await refreshRoundConfigs(now);
    expect((await getRoundConfig(rounds[offering]))!.config.packages[1].rates.top3).toEqual({ rate100: 70_000, discountBp: 1500 });
    expect(await setLottoPackage(offering, id, { offered: true, overrides: { top3: { rate100: 0, discountBp: null } } }, 1, now)).toEqual({ ok: false, error: "rate" });
    expect((await listPackages()).find((p) => p.id === id)!.lottos).toEqual([{ lottoId: offering, overrides: { top3: { rate100: 70_000, discountBp: null } } }]);
  });

  test("leaves a round with a bill as it was", async () => {
    const id = await create();
    const user = (await run("INSERT INTO users (password_hash, ref_code, created_at) VALUES ('x', 'PACK0001', 1)")).lastId;
    await run("INSERT INTO bills (code, user_id, round_id, total_stake, created_at) VALUES ('CPPACK1', ?, ?, 100, 1)", user, rounds[offering]);
    await setLottoPackage(offering, id, { offered: true, overrides: {} }, 1, now);
    expect(await codes(offering)).toEqual(["มาตรฐาน"]);
  });

  test("switching a package or an offer off takes it out of unbet rounds, and everything is audited", async () => {
    const id = await create();
    await setLottoPackage(offering, id, { offered: true, overrides: {} }, 1, now);
    expect(await savePackage(id, input({ active: false }), 1, now)).toEqual({ ok: true, id });
    expect(await codes(offering)).toEqual(["มาตรฐาน"]);
    await savePackage(id, input(), 1, now);
    expect(await codes(offering)).toEqual(["มาตรฐาน", "ลด 15%"]);
    await setLottoPackage(offering, id, { offered: false, overrides: {} }, 1, now);
    expect(await codes(offering)).toEqual(["มาตรฐาน"]);
    const log = await q<{ action: string }>("SELECT DISTINCT action FROM audit_log WHERE action LIKE 'package.%' ORDER BY action");
    expect(log.map((l) => l.action)).toEqual(["package.create", "package.offer", "package.update"]);
  });
});
