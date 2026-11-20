import { describe, expect, test } from "vitest";
import { LOTTO_CATALOG } from "@/server/catalog";
import { BANNER_I18N, PROMO_I18N } from "@/server/db/content-i18n";
import { DEFAULT_BANNERS, DEFAULT_GAMES, DEFAULT_PROMOTIONS } from "@/server/db/defaults";
import { LOCALES } from "./config";
import en from "./locales/en";
import km from "./locales/km";
import lo from "./locales/lo";
import my from "./locales/my";
import th from "./locales/th";

/**
 * Thai is the source language. Every other dictionary must carry the same keys, no blank text, and
 * the same `{placeholders}` and `[highlight]` markers, or a page would show a raw key, a hole, or
 * an unfilled `{n}`.
 */
const others = { en, lo, my, km } as const;

/** Maps keyed by data (lotto slug, Thai game name). Thai shows the database text, so it leaves them empty. */
const DATA_MAPS = new Set(["lotto.names", "info.games.names", "info.games.providers", "info.games.tags"]);

type Leaves = Map<string, unknown>;

function leaves(node: unknown, path = "", out: Leaves = new Map()): Leaves {
  if (DATA_MAPS.has(path)) return out;
  if (node !== null && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) leaves(v, path ? `${path}.${k}` : k, out);
  } else {
    out.set(path, node);
  }
  return out;
}

/** The parts of a string a translation must keep: `{name}` placeholders and the number of `[...]` highlights. */
function markers(text: string): string {
  const vars = [...new Set(text.match(/\{\w+\}/g) ?? [])].sort();
  const highlights = (text.match(/\[[^\]]*\]/g) ?? []).length;
  return `${vars.join(",")}|${highlights}`;
}

/** Every way `other` differs from `source`, one line per key. */
function compare(source: unknown, other: unknown): string[] {
  const a = leaves(source);
  const b = leaves(other);
  const problems: string[] = [];
  for (const [key, value] of a) {
    if (!b.has(key)) problems.push(`missing ${key}`);
    else if (typeof b.get(key) !== "string") problems.push(`not text ${key}`);
    else if (!(b.get(key) as string).trim()) problems.push(`blank ${key}`);
    else if (typeof value === "string" && markers(value) !== markers(b.get(key) as string)) problems.push(`markers differ ${key}`);
  }
  for (const key of b.keys()) if (!a.has(key)) problems.push(`extra ${key}`);
  return problems;
}

const hasThai = (s: string) => /[฀-๿]/.test(s);

describe("the checker", () => {
  test("reports a missing key, a blank value, a dropped placeholder and an extra key", () => {
    const source = { a: { b: "{n} ใบ", c: "ตกลง" }, d: "ปิด" };
    const other = { a: { b: "bills", c: " " }, e: "closed" };
    expect(compare(source, other).sort()).toEqual(["blank a.c", "extra e", "markers differ a.b", "missing d"]);
  });

  test("reports a lost [highlight] and skips the data maps", () => {
    const source = { title: "ฝากแรก [20%]", lotto: { names: {} } };
    const other = { title: "First deposit 20%", lotto: { names: { x: { name: "X", short: "X" } } } };
    expect(compare(source, other)).toEqual(["markers differ title"]);
  });
});

describe("Thai source", () => {
  test("has no blank text", () => {
    const blank = [...leaves(th)].filter(([, v]) => typeof v !== "string" || !v.trim()).map(([k]) => k);
    expect(blank).toEqual([]);
  });

  test("every supported language has a dictionary", () => {
    expect(LOCALES.filter((l) => l !== "th").sort()).toEqual(Object.keys(others).sort());
  });
});

describe.each(Object.entries(others))("%s dictionary", (lang, dict) => {
  test("matches the Thai keys, placeholders and highlights", () => {
    expect(compare(th, dict)).toEqual([]);
  });

  test("names every lotto in the seed catalog", () => {
    const names = dict.lotto.names;
    const missing = LOTTO_CATALOG.filter((l) => !names[l.slug]?.name.trim() || !names[l.slug]?.short.trim()).map((l) => l.slug);
    expect(missing).toEqual([]);
    const stale = Object.keys(names).filter((slug) => !LOTTO_CATALOG.some((l) => l.slug === slug));
    expect(stale).toEqual([]);
  });

  test("names every seeded game, provider and tag", () => {
    const { names, providers, tags } = dict.info.games;
    const missing = [
      ...DEFAULT_GAMES.map(([, , name]) => name).filter((n) => !names[n]?.trim()),
      ...DEFAULT_GAMES.map(([, provider]) => provider).filter((p) => hasThai(p) && !providers[p]?.trim()),
      ...DEFAULT_GAMES.flatMap(([, , , tag]) => (tag ? [tag] : [])).filter((t) => !tags[t]?.trim()),
    ];
    expect([...new Set(missing)]).toEqual([]);
  });

  test("translates the seeded banners and promotions", () => {
    const problems: string[] = [];
    for (const [, title] of DEFAULT_BANNERS) {
      const tr = BANNER_I18N[title]?.[lang as keyof typeof others];
      if (!tr) problems.push(`banner ${title}`);
      else if (Object.values(tr).some((v) => !v.trim())) problems.push(`banner blank ${title}`);
      else if (markers(tr.title) !== markers(title)) problems.push(`banner highlight ${title}`);
    }
    for (const [title] of DEFAULT_PROMOTIONS) {
      const tr = PROMO_I18N[title]?.[lang as keyof typeof others];
      if (!tr) problems.push(`promotion ${title}`);
      else if (Object.values(tr).some((v) => !v.trim())) problems.push(`promotion blank ${title}`);
    }
    expect(problems).toEqual([]);
  });
});
