import { describe, expect, test } from "vitest";
import { parseMarkets, planImport, type Market } from "./import-lottos-map";

const market = (over: Partial<Market> = {}): Market => ({
  id: "4",
  group_id: "2",
  code: "hanoi-special",
  name: "ฮานอยพิเศษ",
  name_en: "Hanoi Special",
  name_kh: "ហាណូយពិសេស",
  name_laos: "ຮານອຍພິເສດ",
  draw_schedule_type: "weekly",
  draw_days: "[1,2,3,4,5,6,7]",
  auto_open_time: "00:00:00",
  auto_close_time: "17:05:00",
  auto_result_time: "17:35:00",
  ...over,
});
const one = (over: Partial<Market> = {}) => planImport([market(over)]).lottos[0];

describe("reading the dump", () => {
  test("takes values by column, with NULL, numbers, escapes and punctuation inside text", () => {
    const sql = "CREATE TABLE x;\nINSERT INTO `lotto_markets` (`id`, `name`, `result_url`, `draw_days`) VALUES\n(1, 'ก (ข), ''ค'' \\'ง\\';', NULL, '[1,7]'),\n(2, '', 'u', '[]');\n";
    expect(parseMarkets(sql)).toEqual([
      { id: "1", name: "ก (ข), 'ค' 'ง';", result_url: null, draw_days: "[1,7]" },
      { id: "2", name: "", result_url: "u", draw_days: "[]" },
    ]);
  });

  test("reads every INSERT of a split dump", () => {
    const insert = (id: number) => `INSERT INTO \`lotto_markets\` (\`id\`) VALUES\n(${id});\n`;
    expect(parseMarkets(insert(1) + insert(2))).toEqual([{ id: "1" }, { id: "2" }]);
  });

  test("refuses a row that does not fit its columns", () => {
    expect(() => parseMarkets("INSERT INTO `lotto_markets` (`id`, `name`) VALUES (1);")).toThrow(/1 values for 2 columns/);
  });
});

describe("planning the import", () => {
  test("makes a lottery from a row", () => {
    expect(one()).toEqual({
      sourceId: 4,
      slug: "hanoi-special",
      name: "ฮานอยพิเศษ",
      i18n: {
        en: { name: "Hanoi Special", short: "Hanoi Special" },
        km: { name: "ហាណូយពិសេស", short: "ហាណូយពិសេស" },
        lo: { name: "ຮານອຍພິເສດ", short: "ຮານອຍພິເສດ" },
        my: { name: "ဟနွိုင်း အထူး", short: "ဟနွိုင်း အထူး" },
      },
      group: "foreign",
      format: "standard",
      schedule: { kind: "weekly", days: [0, 1, 2, 3, 4, 5, 6], close: "17:05", opens: "00:00" },
      resultDelayMin: 30,
      flag: "VN",
    });
  });

  test("counts a result after midnight into the next day", () => {
    expect(one({ auto_close_time: "23:59:00", auto_result_time: "00:35:00" }).resultDelayMin).toBe(36);
  });

  test("drops an opening time that is not before the close", () => {
    expect(one({ auto_open_time: "18:00:00" }).schedule).not.toHaveProperty("opens");
  });

  test("gives Lao lotteries four digits and the Lao flag", () => {
    expect(one({ code: "laos-vip", name: "ลาว VIP" })).toMatchObject({ format: "laos4", flag: "LA" });
    expect(one({ code: "salavan-visa", name: "สาละวัน VISA", group_id: "3" })).toMatchObject({ format: "standard", flag: "LA", group: "stock" });
  });

  test.each([["1", "thai"], ["2", "foreign"], ["3", "stock"], ["4", "daily"]])("puts the dump's group %s in %s", (group_id, group) => {
    expect(one({ group_id }).group).toBe(group);
  });

  test("corrects a wrong translation", () => {
    const l = one({ code: "laos-tv", name: "ลาว TV", name_kh: "កូរ៉េ VIP", name_laos: "ເກົາຫຼີ VIP" });
    expect([l.i18n.km?.name, l.i18n.lo?.name]).toEqual(["ឡាវ TV", "ລາວ TV"]);
  });

  test("skips the ABCD group", () => {
    const plan = planImport([market({ group_id: "6", code: "hanoi_vip" })]);
    expect(plan.lottos).toEqual([]);
    expect(plan.skipped.map((s) => s.slug)).toEqual(["hanoi_vip"]);
    expect(plan.problems).toEqual([]);
  });

  const untimed: Partial<Market> = { draw_schedule_type: "manual", draw_days: "[]", auto_open_time: null, auto_close_time: null, auto_result_time: null };

  test("gives the government draw its own days, time and result format", () => {
    const l = one({ ...untimed, group_id: "1", code: "glo-lotto", name: "หวยรัฐบาล" });
    expect(l).toMatchObject({ group: "thai", format: "thai_gov", flag: "TH", schedule: { kind: "monthly", days: [1, 16], close: "15:10" }, resultDelayMin: 50 });
  });

  test("runs the dump's yiki lotteries on this system's rounds", () => {
    const l = one({ ...untimed, group_id: "5", code: "yeekee-love", name: "ยี่กี่แสนรัก", name_en: "love yeekee" });
    expect(l).toMatchObject({ group: "yiki", format: "standard", flag: "YK", schedule: { kind: "interval", firstClose: "06:00", everyMin: 15, count: 88 }, resultDelayMin: 2 });
    expect(l.i18n.en?.name).toBe("Yeekee Love");
  });

  test("gives GSB and BAAC placeholder draw days, and says so", () => {
    const plan = planImport([market({ group_id: "1", code: "gsb-lotto", name: "หวยออมสิน", draw_schedule_type: "manual", draw_days: "[]", auto_result_time: null })]);
    expect(plan.lottos[0]).toMatchObject({ group: "thai", flag: "TH", schedule: { kind: "monthly", days: [1, 16], close: "16:00" }, resultDelayMin: 20 });
    expect(plan.warnings).toHaveLength(1);
  });

  test("keeps the order of the dump's ids", () => {
    const plan = planImport([market({ id: "9", code: "hanoi-vip" }), market({ id: "4" })]);
    expect(plan.lottos.map((l) => l.sourceId)).toEqual([4, 9]);
  });

  test.each([
    ["an unusable slug", { code: "hanoi_special" }, /unusable slug/],
    ["a lottery without a Burmese name", { code: "new-one" }, /no my name/],
    ["Thai letters inside another language's name", { name_kh: "ផ្សารហ៊ុន" }, /km name has Thai letters/],
    ["an unknown country", { name: "หวยดาวอังคาร" }, /no flag/],
    ["missing draw times", { auto_close_time: null }, /no draw days or times/],
    ["a name too long to be a short name", { name_en: "x".repeat(31) }, /en name is over 30/],
  ])("reports %s instead of importing it", (_, over, problem) => {
    const plan = planImport([market(over)]);
    expect(plan.lottos).toEqual([]);
    expect(plan.problems[0]).toMatch(problem);
  });
});
