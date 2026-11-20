import type { Locale } from "./config";
import type { Dict } from "./dictionaries";
import { fmt, formatDate } from "./format";

/** "รอบที่ 5" / "Round 5", or for dated draws "งวด 16 พ.ย. 69" / "Draw 16 Nov 26". */
export function roundName(r: { roundNo: number | null; closesAt: number }, lang: Locale, t: Pick<Dict, "lotto">): string {
  return r.roundNo != null ? fmt(t.lotto.round.numbered, { n: r.roundNo }) : fmt(t.lotto.round.dated, { date: formatDate(r.closesAt, lang) });
}

/** A lotto's name in this language; lottos the dictionary does not know keep their own name. */
export function lottoName(l: { slug: string; name: string }, t: Pick<Dict, "lotto">): string {
  return t.lotto.names[l.slug]?.name ?? l.name;
}

export function lottoShort(l: { slug: string; shortName: string }, t: Pick<Dict, "lotto">): string {
  return t.lotto.names[l.slug]?.short ?? l.shortName;
}

export const bankName = (code: string | null | undefined, t: Pick<Dict, "lotto">) => (code ? (t.lotto.banks[code]?.name ?? code) : "-");
export const bankShort = (code: string | null | undefined, t: Pick<Dict, "lotto">) => (code ? (t.lotto.banks[code]?.short ?? code) : "-");
