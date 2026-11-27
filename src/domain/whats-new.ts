/**
 * What staff see on the "what's new" page: one line per change. For each change people can notice,
 * add an item here and its line under `admin.ops.whatsNew.items` in every language. Technical notes
 * belong in CHANGELOG.md.
 */
import type { Permission } from "./permissions";

/** The member site, then the back office. */
export const AREAS = ["member", "admin"] as const;
export const KINDS = ["added", "changed", "removed"] as const;
export type Area = (typeof AREAS)[number];
export type Kind = (typeof KINDS)[number];

export type WhatsNewKey =
  | "memberLottos" | "memberNames" | "memberYiki" | "memberNoYiki"
  | "bills" | "resultHistory" | "exposure" | "transactions" | "referrals" | "whatsNew" | "groupSwitch" | "nameEditor"
  | "resultEntry" | "menu";

export interface WhatsNewItem {
  key: WhatsNewKey;
  area: Area;
  kind: Kind;
  /** The back-office page it is about, offered only to staff who may open it. */
  link?: { href: string; need: Permission };
}

export interface Release {
  /** "YYYY-MM-DD" */
  day: string;
  items: WhatsNewItem[];
}

/** Newest first. */
export const RELEASES: readonly Release[] = [
  {
    day: "2026-11-27",
    items: [
      { key: "memberLottos", area: "member", kind: "added" },
      { key: "memberNames", area: "member", kind: "changed" },
      { key: "memberYiki", area: "member", kind: "changed" },
      { key: "memberNoYiki", area: "member", kind: "removed" },
      { key: "bills", area: "admin", kind: "added", link: { href: "/bills", need: "members.view" } },
      { key: "resultHistory", area: "admin", kind: "added", link: { href: "/result-history", need: "rounds.view" } },
      { key: "exposure", area: "admin", kind: "added", link: { href: "/exposure", need: "risk.manage" } },
      { key: "transactions", area: "admin", kind: "added", link: { href: "/transactions", need: "finance.view" } },
      { key: "referrals", area: "admin", kind: "added", link: { href: "/referrals", need: "members.view" } },
      { key: "whatsNew", area: "admin", kind: "added" },
      { key: "groupSwitch", area: "admin", kind: "added", link: { href: "/lottos", need: "lottos.manage" } },
      { key: "nameEditor", area: "admin", kind: "added", link: { href: "/lottos", need: "lottos.manage" } },
      { key: "resultEntry", area: "admin", kind: "changed", link: { href: "/results", need: "rounds.result" } },
      { key: "menu", area: "admin", kind: "changed" },
    ],
  },
];

/** In the order of AREAS and KINDS, without empty parts. */
export function byAreaAndKind<T extends { area: Area; kind: Kind }>(items: readonly T[]) {
  return AREAS.map((area) => ({
    area,
    kinds: KINDS.map((kind) => ({ kind, items: items.filter((i) => i.area === area && i.kind === kind) })).filter((k) => k.items.length > 0),
  })).filter((a) => a.kinds.length > 0);
}
