import { describe, expect, test } from "vitest";
import { NAV_GROUPS } from "@/components/admin/nav-items";
import th from "@/i18n/locales/th";
import { byAreaAndKind, RELEASES } from "./whats-new";

const items = RELEASES.flatMap((r) => r.items);
const words = th.admin.ops.whatsNew.items;

describe("what's new", () => {
  test("lists the newest release first, on real days", () => {
    const days = RELEASES.map((r) => r.day);
    expect(days).toEqual([...days].sort().reverse());
    for (const day of days) expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("has words for every item and no words left over", () => {
    expect(Object.keys(words).sort()).toEqual(items.map((i) => i.key).sort());
  });

  test("links only to menu pages, asking for the permission the menu asks for", () => {
    const menu = new Map(NAV_GROUPS.flatMap((g) => g.items).map((i) => [i.href, i.need]));
    for (const i of items) if (i.link) expect([i.link.href, i.link.need]).toEqual([i.link.href, menu.get(i.link.href)]);
  });

  test("splits by app, then by kind, leaving out what is empty", () => {
    expect(
      byAreaAndKind([
        { area: "admin", kind: "changed", n: 1 },
        { area: "member", kind: "removed", n: 2 },
        { area: "admin", kind: "added", n: 3 },
      ]),
    ).toEqual([
      { area: "member", kinds: [{ kind: "removed", items: [{ area: "member", kind: "removed", n: 2 }] }] },
      {
        area: "admin",
        kinds: [
          { kind: "added", items: [{ area: "admin", kind: "added", n: 3 }] },
          { kind: "changed", items: [{ area: "admin", kind: "changed", n: 1 }] },
        ],
      },
    ]);
  });
});
