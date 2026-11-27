import "server-only";
// Authorization lives here, next to the data, like the other admin readers.
import { io } from "next/cache";
import { dayKey } from "@/core/rules/time";
import { groupName } from "@/domain/lotto-groups";
import { HISTORY_PER_PAGE, lottoIdsFor, parseHistoryFilter } from "@/domain/result-history";
import { lottoShort, roundName } from "@/i18n/labels";
import { getI18n } from "@/i18n/rsc";
import { q } from "@/server/db";
import { listGroups } from "@/server/services/lotto-groups";
import { listLottos } from "@/server/services/lottos";
import { toRound, type RoundRow } from "@/server/services/rounds";
import { requireEmployee } from "@/server/session";

type Row = RoundRow & { staff: string | null; corrected: number; bills: number; payout: number | null };

/** One page of resulted draws, newest first. */
export async function getResultHistory(params: Record<string, string | string[] | undefined>) {
  const { lang, t } = await getI18n();
  await requireEmployee("rounds.view");
  await io();
  const filter = parseHistoryFilter(params, dayKey(Date.now()));
  const [lottos, groups] = await Promise.all([listLottos({ includeDisabled: true }), listGroups()]);
  const named = lottos.map((l) => ({ ...l, shortName: lottoShort(l, lang, t) }));
  // The search takes the name in this language, the Thai one, or the link code.
  const here = lottoIdsFor(named, filter);
  const thai = lottoIdsFor(lottos, filter);
  const ids = here === null || thai === null ? null : [...new Set([...here, ...thai])];
  const rows =
    ids !== null && ids.length === 0
      ? []
      : await q<Row>(
          `SELECT r.*, e.name AS staff,
                  EXISTS (SELECT 1 FROM round_results x WHERE x.round_id = r.id AND x.kind = 'correction' AND x.status = 'confirmed') AS corrected,
                  (SELECT COUNT(*) FROM bills b WHERE b.round_id = r.id AND b.status IN ('pending','won','lost')) AS bills,
                  (SELECT SUM(total_payout) FROM bills b WHERE b.round_id = r.id AND b.status = 'won') AS payout
           FROM rounds r LEFT JOIN employees e ON e.id = r.resulted_by
           WHERE r.status = 'resulted' AND r.day_key BETWEEN ? AND ? ${ids ? "AND r.lotto_id IN (?)" : ""}
           ORDER BY r.closes_at DESC, r.id DESC LIMIT ? OFFSET ?`,
          filter.from,
          filter.to,
          ...(ids ? [ids] : []),
          // One more than a page, to know whether an older page exists.
          HISTORY_PER_PAGE + 1,
          (filter.page - 1) * HISTORY_PER_PAGE,
        );
  const byId = new Map(named.map((l) => [l.id, l]));
  return {
    filter,
    older: rows.length > HISTORY_PER_PAGE,
    groups: groups.map((g) => ({ code: g.code, label: groupName(g, lang, t.lotto.groups) })),
    rounds: rows.slice(0, HISTORY_PER_PAGE).flatMap((row) => {
      const r = toRound(row);
      const lotto = byId.get(r.lottoId);
      if (!lotto || !r.result) return [];
      return [
        {
          id: r.id,
          lotto: lotto.shortName,
          flag: lotto.flag,
          format: lotto.format,
          label: roundName(r, lang, t),
          result: r.result,
          resultedAt: r.resultedAt,
          /** null: drawn by the system. */
          staff: row.staff,
          corrected: !!row.corrected,
          bills: row.bills,
          payout: row.payout ?? 0,
        },
      ];
    }),
  };
}
