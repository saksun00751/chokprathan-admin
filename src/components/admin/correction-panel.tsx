"use client";

import { useState, useTransition, type ReactNode } from "react";
import { formatBaht } from "chokprathan-core/rules/money";
import type { ResultFormat } from "chokprathan-core/rules/types";
import { useConfirm } from "@/components/admin/confirm";
import { ResultBoxes } from "@/components/admin/result-boxes";
import { Digits, EMPTY_RESULT, resultComplete, resultInput, resultPairs, type ResultValues } from "@/components/admin/result-summary";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/i18n/client";
import { fmt, formatDateTime, formatNumber } from "@/i18n/format";
import { checkCorrectionAction, confirmCorrectionAction, rejectCorrectionAction, requestCorrectionAction, type CorrectionCheck } from "@/server/actions/admin";

export interface PendingCorrection {
  kind: "correction" | "cancel";
  reason: string;
  requestedBy: string;
  requestedAt: number;
  mine: boolean;
}

/** A signed change, sign first: "-฿1,200". */
const money = (satang: number) => `${satang > 0 ? "+" : satang < 0 ? "-" : ""}฿${formatBaht(Math.abs(satang), { decimals: "auto" })}`;

/**
 * A paid draw can be corrected by two people: one asks (a new result, or voiding the draw) with a
 * reason; another sees what it does to members' money and approves, typing a new result again blind.
 */
export function CorrectionPanel({ roundId, format, round, pending }: { roundId: number; format: ResultFormat; round: string; pending: PendingCorrection | null }) {
  return pending ? (
    <Approve roundId={roundId} format={format} round={round} pending={pending} />
  ) : (
    <Request roundId={roundId} format={format} round={round} />
  );
}

function useSend() {
  const toast = useToast();
  const [busy, start] = useTransition();
  const send = (action: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    start(async () => {
      const r = await action();
      if (r.ok) toast.success(r.message ?? "");
      else toast.error(r.error ?? "");
    });
  return { busy, start, send, toast };
}

function Request({ roundId, format, round }: { roundId: number; format: ResultFormat; round: string }) {
  const { t } = useI18n();
  const c = t.admin.ops.correction;
  const ask = useConfirm();
  const { busy, send } = useSend();
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
      onSubmit={async (e) => {
        e.preventDefault();
        const answer = await ask({
          title: c.requestTitle,
          tone: "danger",
          details: [
            [t.admin.shell.confirm.round, round],
            [c.kind, kind === "cancel" ? c.void : c.newResult],
            ...(kind === "correction"
              ? resultPairs(format, v, t.admin.ops.resultForm).map(([label, digits]): [string, ReactNode] => [label, <Digits key={label}>{digits}</Digits>])
              : []),
            [c.reason, reason],
          ],
          note: c.requestNote,
          confirmLabel: c.send,
        });
        if (!answer.ok) return;
        send(() => requestCorrectionAction(roundId, kind === "cancel" ? { kind } : { kind, input: resultInput(format, v) }, reason));
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
      <Button type="submit" loading={busy} disabled={!ready}>
        {c.send}
      </Button>
      <Button type="button" variant="dangerGhost" className="self-start" onClick={() => setOpen(false)}>
        {c.close}
      </Button>
    </form>
  );
}

function Approve({ roundId, format, round, pending }: { roundId: number; format: ResultFormat; round: string; pending: PendingCorrection }) {
  const { lang, t } = useI18n();
  const c = t.admin.ops.correction;
  const rf = t.admin.ops.resultForm;
  const ask = useConfirm();
  const { busy, start, send, toast } = useSend();
  const [v, setV] = useState<ResultValues>(EMPTY_RESULT);
  const [checked, setChecked] = useState<CorrectionCheck | null>(null);
  const input = pending.kind === "correction" ? resultInput(format, v) : null;
  const fieldNames = { top3: rf.top3, bottom2: rf.bottom2, top4: rf.top4, first6: rf.first6, front3: `${rf.front1}, ${rf.front2}`, back3: `${rf.back1}, ${rf.back2}` };

  const reject = (label: string) => (
    <Button
      type="button"
      variant="dangerGhost"
      className="self-start"
      disabled={busy}
      onClick={async () => {
        const answer = await ask({ title: c.rejectTitle, tone: "danger", details: [[t.admin.shell.confirm.round, round]], confirmLabel: label });
        if (answer.ok) send(() => rejectCorrectionAction(roundId));
      }}
    >
      {label}
    </Button>
  );

  const head = (
    <>
      <p className="text-sm font-semibold">{pending.kind === "cancel" ? c.pendingVoid : c.pendingResult}</p>
      <p className="text-xs text-ink-3">{fmt(c.requestedBy, { name: pending.requestedBy, time: formatDateTime(pending.requestedAt, lang) })}</p>
      <p className="text-sm text-ink-2">{pending.reason}</p>
    </>
  );

  if (pending.mine) {
    return (
      <div className="flex flex-col gap-2">
        {head}
        <p className="text-sm text-ink-2">{c.mine}</p>
        {reject(c.withdraw)}
      </div>
    );
  }

  const preview = checked?.match ? checked.preview : null;
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await checkCorrectionAction(roundId, input);
          if (!r.ok) return void toast.error(r.error);
          setChecked(r.data);
        });
      }}
    >
      {head}
      {pending.kind === "correction" && (
        <>
          <p className="text-sm text-ink-2">{t.admin.ops.confirmResult.hint}</p>
          <ResultBoxes
            format={format}
            values={v}
            onChange={(next) => {
              setV(next);
              setChecked(null);
            }}
            round={round}
          />
        </>
      )}
      <p className="rounded-control bg-warning-soft px-3 py-2 text-xs text-warning">{c.guesses}</p>
      {checked && !checked.match && (
        <p role="alert" className="rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">
          {fmt(t.admin.ops.confirmResult.differs, { fields: checked.fields.map((f) => fieldNames[f]).join(" · ") })}
        </p>
      )}
      {preview ? (
        <>
          <div role="status" className="flex flex-col gap-1 rounded-control border border-line p-3 text-sm">
            <p className="font-semibold">{fmt(c.totals, { n: formatNumber(preview.members.length), change: money(preview.change) })}</p>
            {preview.shortfall > 0 && <p className="text-danger">{fmt(c.shortfall, { amount: `฿${formatBaht(preview.shortfall)}` })}</p>}
            <ul className="max-h-64 divide-y divide-line overflow-y-auto">
              {preview.members.map((m) => (
                <li key={m.userId} className="flex flex-wrap justify-between gap-x-3 py-1.5">
                  <a href={`/members/${m.userId}`} target="_blank" rel="noreferrer" className="text-brand">
                    {m.name || `#${m.userId}`}
                  </a>
                  <span className="tnum">
                    {money(m.change)}
                    {m.shortfall > 0 && <span className="ml-2 text-danger">{fmt(c.owes, { amount: `฿${formatBaht(m.shortfall)}` })}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <Button
            type="button"
            loading={busy}
            onClick={async () => {
              const answer = await ask({
                title: c.confirmTitle,
                tone: "danger",
                details: [
                  [t.admin.shell.confirm.round, round],
                  [c.kind, pending.kind === "cancel" ? c.void : c.newResult],
                  ...(pending.kind === "correction"
                    ? resultPairs(format, v, rf).map(([label, digits]): [string, ReactNode] => [label, <Digits key={label}>{digits}</Digits>])
                    : []),
                ],
                note: `${fmt(c.totals, { n: formatNumber(preview.members.length), change: money(preview.change) })} · ${c.confirmNote}`,
                confirmLabel: c.confirm,
              });
              if (answer.ok) send(() => confirmCorrectionAction(roundId, input));
            }}
          >
            {c.confirm}
          </Button>
        </>
      ) : (
        <Button type="submit" loading={busy} disabled={pending.kind === "correction" && !resultComplete(format, v)}>
          {c.check}
        </Button>
      )}
      {reject(c.reject)}
    </form>
  );
}
