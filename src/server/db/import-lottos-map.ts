/**
 * Reads the old system's `lotto_markets` dump and turns it into rows for `lottos`. Pure: no database.
 * The rules are in docs/superpowers/specs/2026-11-27-lotto-import-design.md.
 */
import type { ResultFormat, Schedule } from "@/core/rules/types";
import { isLottoSlug } from "@/domain/new-lotto";
import type { LottoI18n } from "@/i18n/labels";
import { BURMESE, CORRECTIONS, FLAGS } from "./import-lottos-names";

/** One dump row, by column name. */
export type Market = Record<string, string | null>;

export interface PlannedLotto {
  sourceId: number;
  slug: string;
  name: string;
  i18n: LottoI18n;
  group: "thai" | "foreign" | "stock" | "daily" | "yiki";
  format: ResultFormat;
  schedule: Schedule;
  resultDelayMin: number;
  flag: string;
}

export interface ImportPlan {
  lottos: PlannedLotto[];
  skipped: { slug: string; reason: string }[];
  /** Worth checking before the lottery is switched on. */
  warnings: string[];
  /** Rows that cannot be imported as they are. */
  problems: string[];
}

/** A quoted string (with `\x` and `''` escapes), a bare value, or punctuation. */
const TOKEN = /\s*(?:'((?:[^'\\]|\\.|'')*)'|([^\s'(),;]+)|([(),;]))/y;
const ESCAPES: Record<string, string> = { n: "\n", r: "\r", t: "\t", "0": "\0" };
const unescape = (s: string) => s.replace(/\\(.)|''/g, (_, c: string | undefined) => (c === undefined ? "'" : (ESCAPES[c] ?? c)));

export function parseMarkets(sql: string): Market[] {
  const out: Market[] = [];
  for (const head of sql.matchAll(/INSERT INTO `lotto_markets` \(([^)]*)\) VALUES/g)) {
    const columns = [...head[1].matchAll(/`(\w+)`/g)].map((m) => m[1]);
    const token = new RegExp(TOKEN);
    token.lastIndex = head.index + head[0].length;
    let row: (string | null)[] | null = null;
    for (;;) {
      const m = token.exec(sql);
      if (!m) throw new Error("lotto_markets dump: unreadable values");
      const [, text, bare, mark] = m;
      if (mark === ";") break;
      if (mark === "(") row = [];
      else if (mark === ")") {
        if (row?.length !== columns.length) throw new Error(`lotto_markets dump: a row has ${row?.length ?? 0} values for ${columns.length} columns`);
        out.push(Object.fromEntries(columns.map((c, i) => [c, row![i]])));
        row = null;
      } else if (text !== undefined) row?.push(unescape(text));
      else if (bare !== undefined) row?.push(bare === "NULL" ? null : bare);
    }
  }
  return out;
}

const SKIP_GROUPS: Record<string, string> = { "6": "ABCD bet profile: not supported" };
const GROUPS: Record<string, PlannedLotto["group"]> = { "1": "thai", "2": "foreign", "3": "stock", "4": "daily", "5": "yiki" };

type Timing = { schedule: Schedule; resultDelayMin: number; placeholder?: true };

/** The dump gives these no draw days or times. */
const monthly = (days: number[], close: string, resultDelayMin: number): Timing => ({ schedule: { kind: "monthly", days, close }, resultDelayMin });
/** The house game as this system runs it. The dump's own result methods are not supported. */
const YIKI: Timing = { schedule: { kind: "interval", firstClose: "06:00", everyMin: 15, count: 88 }, resultDelayMin: 2 };
const TIMING: Record<string, Timing> = {
  "gsb-lotto": { ...monthly([1, 16], "16:00", 20), placeholder: true },
  "bacc-lotto": { ...monthly([16], "16:00", 20), placeholder: true },
  "glo-lotto": monthly([1, 16], "15:10", 50),
  "yeekee-love": YIKI,
  "yeekee-sum": YIKI,
};
/** The government draw has three front and three bottom digits; the dump calls it a normal one. */
const FORMATS: Record<string, ResultFormat> = { "glo-lotto": "thai_gov" };

const hhmm = (time: string | null | undefined) => time?.match(/^([01]\d|2[0-3]):[0-5]\d/)?.[0];
const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));

function timing(m: Market): Timing | null {
  if (TIMING[m.code!]) return TIMING[m.code!];
  const close = hhmm(m.auto_close_time);
  const result = hhmm(m.auto_result_time);
  const opens = hhmm(m.auto_open_time);
  // The dump counts Sunday as 7; here it is 0.
  const days = [...new Set((JSON.parse(m.draw_days || "[]") as number[]).map((d) => d % 7))].sort((a, b) => a - b);
  if (m.draw_schedule_type !== "weekly" || !close || !result || days.length === 0) return null;
  return {
    // An opening time is on the round's own day, so it only counts when it comes before the close.
    schedule: { kind: "weekly", days, close, ...(opens && opens < close ? { opens } : {}) },
    // A result after midnight is on the next day.
    resultDelayMin: (minutes(result) - minutes(close) + 1440) % 1440,
  };
}

function translations(m: Market): LottoI18n {
  const code = m.code!;
  const names = { en: m.name_en, km: m.name_kh, lo: m.name_laos, my: BURMESE[code], ...CORRECTIONS[code] };
  return Object.fromEntries(
    Object.entries(names).flatMap(([lang, value]) => {
      const name = value?.trim();
      return name ? [[lang, { name, short: name }]] : [];
    }),
  );
}

export function planImport(markets: readonly Market[]): ImportPlan {
  const plan: ImportPlan = { lottos: [], skipped: [], warnings: [], problems: [] };
  for (const m of markets) {
    const slug = m.code ?? "";
    const reason = SKIP_GROUPS[m.group_id ?? ""];
    if (reason) {
      plan.skipped.push({ slug, reason });
      continue;
    }
    const name = m.name?.trim() ?? "";
    const group = GROUPS[m.group_id ?? ""];
    const flag = FLAGS.find(([pattern]) => pattern.test(name))?.[1];
    const time = timing(m);
    const i18n = translations(m);
    const wrong = [
      !isLottoSlug(slug) && "unusable slug",
      // The short name holds at most 30 characters, and is the same text.
      (name.length < 2 || name.length > 30) && "Thai name must be 2 to 30 characters",
      ...["en", "km", "lo", "my"].map((lang) => {
        const text = i18n[lang]?.name;
        if (!text) return `no ${lang} name`;
        if (/[\u0E01-\u0E5B]/.test(text)) return `${lang} name has Thai letters`;
        return text.length > 30 && `${lang} name is over 30 characters`;
      }),
      !group && `unknown group ${m.group_id}`,
      !flag && "no flag",
      !time && "no draw days or times",
    ].filter(Boolean);
    if (wrong.length || !group || !flag || !time) {
      plan.problems.push(`${slug}: ${wrong.join(", ")}`);
      continue;
    }
    const { placeholder, ...when } = time;
    if (placeholder) plan.warnings.push(`${slug} (${name}): placeholder draw days and times, check before switching on`);
    const format = FORMATS[slug] ?? (name.includes("ลาว") ? "laos4" : "standard");
    plan.lottos.push({ sourceId: Number(m.id), slug, name, i18n, group, format, ...when, flag });
  }
  plan.lottos.sort((a, b) => a.sourceId - b.sourceId);
  return plan;
}
