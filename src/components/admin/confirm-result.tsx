"use client";

import { useState, useTransition } from "react";
import { formatBaht } from "chokprathan-core/rules/money";
import type { ResultFormat } from "chokprathan-core/rules/types";
import { useConfirm } from "@/components/admin/confirm";
import { EMPTY_RESULT, resultComplete, resultInput, type ResultValues } from "@/components/admin/result-summary";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/i18n/client";
import { fmt, formatDateTime, formatNumber } from "@/i18n/format";
import { checkResultAction, confirmResultAction, rejectResultAction, withdrawResultAction, type ResultCheck } from "@/server/actions/admin";

const digitInput =
  "tnum h-11 w-full rounded-control border border-line-strong bg-surface px-3 text-center text-lg font-semibold tracking-[0.2em] focus-visible:border-brand";

const BOXES: Record<ResultFormat, [keyof ResultValues, number][]> = {
  standard: [["top3", 3], ["bottom2", 2]],
  laos4: [["top4", 4]],
  thai_gov: [["first6", 6], ["f1", 3], ["f2", 3], ["b1", 3], ["b2", 3], ["bottom2", 2]],
};

/**
 * The second person's side of a result: type it again (the first entry is never sent here), see what
 * it would pay, then confirm. Whoever typed it first can only take it back.
 */
export function ConfirmResult({
  roundId,
  format,
  round,
  enteredBy,
  enteredAt,
  mine,
  canConfirm,
  canEnter,
}: {
  roundId: number;
  format: ResultFormat;
  /** lottery and round, e.g. "Lao 16 Nov" */
  round: string;
  enteredBy: string;
  enteredAt: number;
  mine: boolean;
  canConfirm: boolean;
  canEnter: boolean;
}) {
  const { lang, t } = useI18n();
  const c = t.admin.ops.confirmResult;
  const rf = t.admin.ops.resultForm;
  const ask = useConfirm();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [v, setV] = useState<ResultValues>(EMPTY_RESULT);
  const [checked, setChecked] = useState<ResultCheck | null>(null);

  const labels: Record<keyof ResultValues, string> = {
    top3: rf.top3,
    bottom2: rf.bottom2,
    top4: rf.top4,
    first6: rf.first6,
    f1: rf.front1,
    f2: rf.front2,
    b1: rf.back1,
    b2: rf.back2,
  };
  const fieldNames = { top3: rf.top3, bottom2: rf.bottom2, top4: rf.top4, first6: rf.first6, front3: `${rf.front1}, ${rf.front2}`, back3: `${rf.back1}, ${rf.back2}` };

  const send = (action: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    start(async () => {
      const r = await action();
      if (r.ok) toast.success(r.message ?? "");
      else toast.error(r.error ?? "");
    });

  const who = <p className="text-xs text-ink-3">{fmt(c.enteredBy, { name: enteredBy, time: formatDateTime(enteredAt, lang) })}</p>;

  if (mine || !canConfirm) {
    return (
      <div className="flex flex-col gap-2">
        {who}
        <p className="text-sm text-ink-2">{mine ? c.mine : c.waiting}</p>
        {mine && canEnter && (
          <Button variant="dangerGhost" className="self-start border border-danger/30" loading={pending} onClick={() => send(() => withdrawResultAction(roundId))}>
            {c.withdraw}
          </Button>
        )}
      </div>
    );
  }

  const input = resultInput(format, v);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await checkResultAction(roundId, input);
          if (!r.ok) return toast.error(r.error);
          setChecked(r.data);
        });
      }}
    >
      {who}
      <p className="text-sm text-ink-2">{c.hint}</p>
      <div className="grid grid-cols-2 gap-2">
        {BOXES[format].map(([key, max]) => (
          <label key={key} className={max > 3 ? "col-span-2 flex flex-col gap-1 text-sm" : "flex flex-col gap-1 text-sm"}>
            <span className="text-xs text-ink-3">{labels[key]}</span>
            <input
              inputMode="numeric"
              autoComplete="off"
              value={v[key]}
              maxLength={max}
              aria-label={`${round} ${labels[key]}`}
              onChange={(e) => {
                setV({ ...v, [key]: e.target.value.replace(/\D/g, "").slice(0, max) });
                setChecked(null);
              }}
              className={digitInput}
            />
          </label>
        ))}
      </div>
      {checked && !checked.match && (
        <p role="alert" className="rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">
          {fmt(c.differs, { fields: checked.fields.map((f) => fieldNames[f]).join(" · ") })}
        </p>
      )}
      {checked?.match ? (
        <>
          <p role="status" className="rounded-control bg-success-soft px-3 py-2 text-sm text-success">
            {fmt(c.preview, { winners: formatNumber(checked.preview.winners), bills: formatNumber(checked.preview.bills), payout: formatBaht(checked.preview.payout, { decimals: "auto" }) })}
          </p>
          <Button
            type="button"
            loading={pending}
            onClick={async () => {
              const answer = await ask({
                title: c.confirmTitle,
                tone: "danger",
                details: [[t.admin.shell.confirm.round, round]],
                note: c.confirmNote,
                confirmLabel: c.submit,
              });
              if (answer.ok) send(() => confirmResultAction(roundId, input));
            }}
          >
            {c.submit}
          </Button>
        </>
      ) : (
        <Button type="submit" loading={pending} disabled={!resultComplete(format, v)}>
          {c.check}
        </Button>
      )}
      <Button
        type="button"
        variant="dangerGhost"
        className="self-start"
        disabled={pending}
        onClick={async () => {
          const answer = await ask({ title: c.rejectTitle, tone: "danger", details: [[t.admin.shell.confirm.round, round]], note: c.rejectNote, confirmLabel: c.reject });
          if (answer.ok) send(() => rejectResultAction(roundId));
        }}
      >
        {c.reject}
      </Button>
    </form>
  );
}
