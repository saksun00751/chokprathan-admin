import type { LottoGroup } from "./types";

/** Display text for groups, statuses, and ledger types lives in the dictionaries (t.lotto). */
export const GROUP_ORDER: LottoGroup[] = ["thai", "foreign", "stock", "yiki"];

export type BillStatus = "pending" | "won" | "lost" | "cancelled" | "refunded";

export const BILL_TONE: Record<BillStatus, "brand" | "gold" | "neutral" | "warning" | "outline"> = {
  pending: "brand",
  won: "gold",
  lost: "neutral",
  cancelled: "outline",
  refunded: "outline",
};
