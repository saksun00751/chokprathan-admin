/**
 * Lottery groups. Staff create them in the back office; both apps read the `lotto_groups` table.
 * This file is the same in the admin and member repos: change both together.
 */
export interface LottoGroupInfo {
  code: string;
  /** Thai name. Empty on a built-in nobody renamed: the dictionary label is shown. */
  name: string;
  i18n: Partial<Record<string, { name?: string }>>;
  art: string;
  sort: number;
}

/** Illustrations the member site can draw next to a group's heading. */
export const GROUP_ARTS = ["ticket", "coins", "chart", "balls", "trophy", "gift", "envelope", "coupon"] as const;
export type GroupArt = (typeof GROUP_ARTS)[number];
export const isGroupArt = (v: unknown): v is GroupArt => GROUP_ARTS.includes(v as GroupArt);

const builtin = (code: string, art: GroupArt, sort: number): LottoGroupInfo => ({ code, name: "", i18n: {}, art, sort });

/** Always present and never deleted. `yiki` is the house game. */
export const BUILTIN_GROUPS: readonly LottoGroupInfo[] = [
  builtin("thai", "ticket", 10),
  builtin("foreign", "coins", 20),
  builtin("stock", "chart", 30),
  builtin("yiki", "balls", 40),
];
export const isBuiltinGroup = (code: string) => BUILTIN_GROUPS.some((g) => g.code === code);

/** Stored groups plus any built-in the table does not hold, in display order. */
export function withBuiltins(stored: readonly LottoGroupInfo[]): LottoGroupInfo[] {
  const missing = BUILTIN_GROUPS.filter((b) => !stored.some((s) => s.code === b.code));
  return [...stored, ...missing].sort((a, b) => a.sort - b.sort || a.code.localeCompare(b.code));
}

export function groupName(g: LottoGroupInfo, lang: string, builtinLabels: Readonly<Record<string, string>>): string {
  return (lang !== "th" && g.i18n[lang]?.name) || g.name || builtinLabels[g.code] || g.code;
}

/** Yiki draws itself and has its own member screens, so nothing moves into or out of it. */
export const mayMoveGroup = (from: string, to: string) => from === to || (from !== "yiki" && to !== "yiki");

/** Lotteries in sections, in group order; empty groups are left out and unknown codes come last. */
export function byGroup<T extends { group: string }>(lottos: readonly T[], groups: readonly LottoGroupInfo[]): { group: LottoGroupInfo; lottos: T[] }[] {
  const unknown = [...new Set(lottos.map((l) => l.group))]
    .filter((code) => !groups.some((g) => g.code === code))
    .map((code): LottoGroupInfo => ({ code, name: "", i18n: {}, art: "ticket", sort: 0 }));
  return [...groups, ...unknown]
    .map((group) => ({ group, lottos: lottos.filter((l) => l.group === group.code) }))
    .filter((s) => s.lottos.length > 0);
}
