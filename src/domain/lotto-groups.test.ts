import { describe, expect, it } from "vitest";
import { BUILTIN_GROUPS, byGroup, groupName, mayMoveGroup, withBuiltins, type LottoGroupInfo } from "./lotto-groups";

const l = (id: number, group: string) => ({ id, group });
const custom: LottoGroupInfo = { code: "g1", name: "หวยลาว", i18n: { en: { name: "Lao" } }, art: "coins", sort: 15 };
const labels = { thai: "Thai lotteries", foreign: "International", stock: "Stock", yiki: "Yiki" };

describe("withBuiltins", () => {
  it("gives the four built-ins when nothing is stored", () => {
    expect(withBuiltins([]).map((g) => g.code)).toEqual(["thai", "foreign", "stock", "yiki"]);
  });
  it("uses stored rows over built-ins and orders everything by sort", () => {
    const all = withBuiltins([custom, { ...BUILTIN_GROUPS[3], sort: 1 }]);
    expect(all.map((g) => g.code)).toEqual(["yiki", "thai", "g1", "foreign", "stock"]);
  });
});

describe("byGroup", () => {
  it("follows the group order, keeps list order inside and leaves out empty groups", () => {
    const sections = byGroup([l(1, "yiki"), l(2, "g1"), l(3, "thai"), l(4, "g1")], withBuiltins([custom]));
    expect(sections.map((s) => [s.group.code, s.lottos.map((x) => x.id)])).toEqual([
      ["thai", [3]],
      ["g1", [2, 4]],
      ["yiki", [1]],
    ]);
  });
  it("never drops a lottery whose group is unknown", () => {
    const sections = byGroup([l(1, "gone")], withBuiltins([]));
    expect(sections.map((s) => [s.group.code, s.lottos.length])).toEqual([["gone", 1]]);
  });
});

describe("groupName", () => {
  it("shows the dictionary label for a built-in that was not renamed", () => {
    expect(groupName(BUILTIN_GROUPS[0], "en", labels)).toBe("Thai lotteries");
  });
  it("shows the translation, else the Thai name", () => {
    expect(groupName(custom, "en", labels)).toBe("Lao");
    expect(groupName(custom, "my", labels)).toBe("หวยลาว");
    expect(groupName(custom, "th", labels)).toBe("หวยลาว");
  });
  it("falls back to the code for an unknown group", () => {
    expect(groupName({ code: "gone", name: "", i18n: {}, art: "ticket", sort: 0 }, "th", labels)).toBe("gone");
  });
});

describe("mayMoveGroup", () => {
  it("locks yiki both ways and allows everything else", () => {
    expect(mayMoveGroup("yiki", "yiki")).toBe(true);
    expect(mayMoveGroup("yiki", "thai")).toBe(false);
    expect(mayMoveGroup("thai", "yiki")).toBe(false);
    expect(mayMoveGroup("thai", "g1")).toBe(true);
  });
});
