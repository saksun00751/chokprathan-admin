import "server-only";
import { productName } from "@/domain/game-products";
import type { Locale } from "@/i18n/config";
import { json, q, tolerateMissingTable } from "@/server/db";

/** A member's game transactions for the back office. Read-only view of the member app's game tables. */

const localName = (names: string | null, fallback: string, lang: Locale) => {
  const n = json.parse<{ th?: string; en?: string; cn?: string }>(names, {});
  return (lang === "th" ? n.th || n.en : n.en || n.th) || fallback;
};

export interface GameHistoryRow {
  id: number;
  product: string;
  game: string;
  kind: string;
  status: string;
  bet: number;
  payout: number;
  net: number;
  at: number;
}

/** A member's latest game transactions with what each did to their balance. */
export async function gameHistory(userId: number, lang: Locale, limit = 100): Promise<GameHistoryRow[]> {
  const rows = await tolerateMissingTable(
    () =>
      q<{
        id: number;
        product_id: string;
        game_code: string | null;
        kind: string;
        status: string;
        debited: number;
        credited: number;
        created_at: number;
        game_name: string | null;
        names: string | null;
        product: string | null;
      }>(
        `SELECT t.id, t.product_id, t.game_code, t.kind, t.status, t.debited, t.credited, t.created_at, c.name AS game_name, c.names, p.name AS product
         FROM game_txns t
         LEFT JOIN game_catalog c ON c.product_id = t.product_id AND c.code = t.game_code
         LEFT JOIN game_products p ON p.product_id = t.product_id
         WHERE t.user_id = ? ORDER BY t.id DESC LIMIT ?`,
        userId,
        limit,
      ),
    [],
  );
  return rows.map((r) => {
    // Refunded and voided stakes went back: they cost nothing.
    const back = r.status === "REFUND" || r.status === "REJECT" || r.status === "VOID";
    const bet = back ? 0 : Number(r.debited);
    const payout = back ? 0 : Number(r.credited);
    return {
      id: r.id,
      product: r.product ?? productName(r.product_id),
      game: r.game_name ? localName(r.names, r.game_name, lang) : (r.game_code ?? "-"),
      kind: r.kind,
      status: r.status,
      bet,
      payout,
      net: payout - bet,
      at: r.created_at,
    };
  });
}
