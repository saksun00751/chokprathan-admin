import "server-only";
// Authorization lives here, next to the data, like the other admin readers.
import { io } from "next/cache";
import { BET_TYPE_ORDER } from "@/core/rules/betTypes";
import type { BetTypeCode } from "@/core/rules/types";
import { exposureWhere, parseExposureFilter } from "@/domain/list-filters";
import { groupName } from "@/domain/lotto-groups";
import { lottoShort, roundName } from "@/i18n/labels";
import { getI18n } from "@/i18n/rsc";
import { q } from "@/server/db";
import { listGroups } from "@/server/services/lotto-groups";
import { listLottos } from "@/server/services/lottos";
import { phaseOf } from "@/server/services/rounds";
import { requireEmployee } from "@/server/session";

export const EXPOSURE_TOP = 100;

/** The numbers that would pay the most, over every draw still waiting for its result. */
export async function getExposureOverview(params: Record<string, string | string[] | undefined>) {
  const { lang, t } = await getI18n();
  await requireEmployee("risk.manage");
  await io();
  const now = Date.now();
  const filter = parseExposureFilter(params);
  const [lottos, groups] = await Promise.all([listLottos({ includeDisabled: true }), listGroups()]);
  const ids = filter.group ? lottos.filter((l) => l.group === filter.group).map((l) => l.id) : null;
  const where = exposureWhere(filter, now);
  const rows =
    ids !== null && ids.length === 0
      ? []
      : await q<{ round_id: number; bet_type: BetTypeCode; number: string; total_stake: number; potential: number; lotto_id: number; round_no: number | null; opens_at: number; closes_at: number; planned_close: number | null }>(
          `SELECT e.round_id, e.bet_type, e.number, e.total_stake, e.potential, r.lotto_id, r.round_no, r.opens_at, r.closes_at, r.planned_close
           FROM exposures e JOIN rounds r ON r.id = e.round_id
           WHERE ${where.sql} ${ids ? "AND r.lotto_id IN (?)" : ""}
           ORDER BY e.potential DESC, e.round_id, e.bet_type, e.number LIMIT ?`,
          ...where.params,
          ...(ids ? [ids] : []),
          EXPOSURE_TOP,
        );
  const byId = new Map(lottos.map((l) => [l.id, l]));
  return {
    filter,
    groups: groups.map((g) => ({ code: g.code, label: groupName(g, lang, t.lotto.groups) })),
    betTypes: BET_TYPE_ORDER.map((code) => ({ code, label: t.lotto.betTypes[code].label })),
    rows: rows.map((r) => {
      const lotto = byId.get(r.lotto_id);
      return {
        key: `${r.round_id}:${r.bet_type}:${r.number}`,
        roundId: r.round_id,
        betType: r.bet_type,
        number: r.number,
        /** `stake` is whole baht; `potential`, what the house would pay, is satang. */
        stake: r.total_stake,
        potential: r.potential,
        lotto: lotto ? lottoShort(lotto, lang, t) : "-",
        flag: lotto?.flag ?? null,
        round: roundName({ roundNo: r.round_no, closesAt: r.closes_at, plannedClose: r.planned_close }, lang, t),
        phase: phaseOf({ opensAt: r.opens_at, closesAt: r.closes_at, status: "scheduled" }, now),
      };
    }),
  };
}
