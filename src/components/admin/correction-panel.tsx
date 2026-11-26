"use client";

import { useState, useTransition, type ReactNode } from "react";
import { formatBaht } from "@/core/rules/money";
import type { ResultFormat } from "@/core/rules/types";
import { useConfirm } from "@/components/admin/confirm";
import { ResultBoxes } from "@/components/admin/result-boxes";
import { Digits, EMPTY_RESULT, resultComplete, resultInput, resultPairs, type ResultValues } from "@/components/admin/result-summary";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/i18n/client";
import { fmt, formatNumber } from "@/i18n/format";
import { correctResultAction, previewCorrectionAction } from "@/server/actions/admin";

/** A signed change, sign first: "-฿1,200". */
const money = (satang: number) => `${satang > 0 ? "+" : satang < 0 ? "-" : ""}฿${formatBaht(Math.abs(satang), { decimals: "auto" })}`;

/**
 * Correct a paid draw (a new result, or voiding it) with a reason. What it does to members' money is
 * shown before it is confirmed.
 */
export function CorrectionPanel({ roundId, format, round }: { roundId: number; format: ResultFormat; round: string }) {
  const { t } = useI18n();
  const c = t.admin.ops.correction;
  const ask = useConfirm();
  const toast = useToast();
  const [busy, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"correction" | "cancel">("correction");
  const [v, setV] = useState<ResultValues>(EMPTY_RESULT);
  const [reason, setReason] = useState("");

  if (!open) {
    return (
      <Button variant="dangerGhost" className="self-start border border-danger/30" onClick={() => setOpen(true)}>
        {c.open}
      </Button>
    );
  }
  const ready = reason.trim().length >= 3 && (kind === "cancel" || resultComplete(format, v));
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const change = kind === "cancel" ? { kind } : { kind, input: resultInput(format, v) };
        start(async () => {
          const checked = await previewCorrectionAction(roundId, change);
          if (!checked.ok) return void toast.error(checked.error);
          const preview = checked.data;
          const effect = (
            <span className="flex flex-col gap-1">
              <span>{fmt(c.totals, { n: formatNumber(preview.members.length), change: money(preview.change) })}</span>
              {preview.shortfall > 0 && <span className="text-danger">{fmt(c.shortfall, { amount: `฿${formatBaht(preview.shortfall)}` })}</span>}
              <span className="flex max-h-64 flex-col divide-y divide-line overflow-y-auto font-normal">
                {preview.members.map((m) => (
                  <span key={m.userId} className="flex flex-wrap justify-between gap-x-3 py-1.5">
                    <a href={`/members/${m.userId}`} target="_blank" rel="noreferrer" className="text-brand">
                      {m.name || `#${m.userId}`}
                    </a>
                    <span className="tnum">
                      {money(m.change)}
                      {m.shortfall > 0 && <span className="ml-2 text-danger">{fmt(c.owes, { amount: `฿${formatBaht(m.shortfall)}` })}</span>}
                    </span>
                  </span>
                ))}
              </span>
            </span>
          );
          const answer = await ask({
            title: c.confirmTitle,
            tone: "danger",
            details: [
              [t.admin.shell.confirm.round, round],
              [c.kind, kind === "cancel" ? c.void : c.newResult],
              ...(kind === "correction"
                ? resultPairs(format, v, t.admin.ops.resultForm).map(([label, digits]): [string, ReactNode] => [label, <Digits key={label}>{digits}</Digits>])
                : []),
              [c.reason, reason],
              [c.effect, effect],
            ],
            note: c.confirmNote,
            confirmLabel: c.confirm,
          });
          if (!answer.ok) return;
          // A new transition, so the button stays busy while the money moves.
          start(async () => {
            const r = await correctResultAction(roundId, change, reason, preview.basis);
            if (!r.ok) return void toast.error(r.error);
            toast.success(r.message ?? "");
            setOpen(false);
            setV(EMPTY_RESULT);
            setReason("");
          });
        });
      }}
    >
      <p className="text-sm font-semibold">{c.title}</p>
      <div className="flex flex-col gap-1.5 text-sm">
        {(["correction", "cancel"] as const).map((k) => (
          <label key={k} className="flex items-center gap-2">
            <input type="radio" name={`correction-${roundId}`} checked={kind === k} onChange={() => setKind(k)} className="size-4 accent-[var(--color-brand)]" />
            {k === "cancel" ? c.void : c.newResult}
          </label>
        ))}
      </div>
      {kind === "correction" && <ResultBoxes format={format} values={v} onChange={setV} round={round} />}
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs text-ink-3">{c.reason}</span>
        <input value={reason} maxLength={255} onChange={(e) => setReason(e.target.value)} className="h-11 rounded-control border border-line-strong bg-surface px-3" />
      </label>
      <p className="rounded-control bg-warning-soft px-3 py-2 text-xs text-warning">{c.guesses}</p>
      <Button type="submit" loading={busy} disabled={!ready}>
        {c.confirm}
      </Button>
      <Button type="button" variant="dangerGhost" className="self-start" onClick={() => setOpen(false)}>
        {c.close}
      </Button>
    </form>
  );
}
