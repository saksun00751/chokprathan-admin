import "server-only";
import type { ReportColumn, ReportCell } from "@/server/data/reports";

const pad = (n: number) => String(n).padStart(2, "0");
function bkk(ms: number, withTime: boolean) {
  const t = new Date(ms + 7 * 3_600_000);
  const date = `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
  return withTime ? `${date} ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}` : date;
}

/** One CSV cell. Text that a spreadsheet would run as a formula is neutralised with a leading quote. */
function cell(value: ReportCell, kind: ReportColumn["kind"]): string {
  if (value === null || value === undefined || value === "") return "";
  let out: string;
  switch (kind) {
    case "baht":
      out = (Number(value) / 100).toFixed(2);
      break;
    case "int":
      out = String(Math.trunc(Number(value)));
      break;
    case "pct":
      out = (Number(value) * 100).toFixed(2);
      break;
    case "date":
      out = bkk(Number(value), false);
      break;
    case "datetime":
      out = bkk(Number(value), true);
      break;
    default:
      out = String(value);
      if (/^[=+\-@\t\r]/.test(out)) out = `'${out}`;
  }
  return /[",\r\n]/.test(out) ? `"${out.replace(/"/g, '""')}"` : out;
}

/** UTF-8 with BOM so Excel opens every script (Thai, Lao, Burmese, Khmer) correctly. */
export function toCsv(columns: ReportColumn[], rows: Record<string, ReportCell>[], bahtUnit: string): string {
  const head = columns.map((c) => cell(c.kind === "pct" ? `${c.label} (%)` : c.kind === "baht" ? `${c.label} (${bahtUnit})` : c.label, "text")).join(",");
  const body = rows.map((r) => columns.map((c) => cell(r[c.key] ?? null, c.kind)).join(","));
  return `﻿${[head, ...body].join("\r\n")}\r\n`;
}
