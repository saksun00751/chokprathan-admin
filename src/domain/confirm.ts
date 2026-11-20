import { formatBaht } from "./money";

/** Helpers for the back-office confirmation step: show exactly what will be saved. */

/** Baht typed in a form → satang, converted like the server does (Math.round(x * 100)); null when not a number. */
export function toSatang(input: string | number): number | null {
  const text = String(input).replace(/,/g, "").trim();
  if (text === "") return null;
  const n = Number(text);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

export interface ChangeRow<T = unknown> {
  label: string;
  before: T;
  after: T;
}

/** Only the rows whose value changed, in order. */
export function changedRows<T>(rows: ChangeRow<T>[]): ChangeRow<T>[] {
  return rows.filter((r) => JSON.stringify(r.before) !== JSON.stringify(r.after));
}

/** "฿500.00", or with `sign` "+฿500.00" / "-฿500.00": how amounts read in a confirmation. */
export function money(satang: number, sign = false): string {
  const prefix = satang < 0 ? "-" : sign && satang > 0 ? "+" : "";
  return `${prefix}฿${formatBaht(Math.abs(satang))}`;
}
