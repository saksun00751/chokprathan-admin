"use client";

import { useState, useTransition } from "react";
import { useConfirm } from "@/components/admin/confirm";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { BKK_OFFSET_MS } from "@/domain/time";
import { useI18n } from "@/i18n/client";
import { createRoundAction } from "@/server/actions/admin";

const box = "h-10 rounded-control border border-line-strong bg-surface px-3";

/** Epoch ms → the Bangkok "YYYY-MM-DDTHH:MM" a datetime-local input holds. */
const toLocal = (ms: number) => new Date(ms + BKK_OFFSET_MS).toISOString().slice(0, 16);

/** Make one round by hand, outside (or instead of) the lottery's schedule. */
export function CreateRound({ lottos, serverNow }: { lottos: { id: number; name: string; delayMin: number }[]; serverNow: number }) {
  const { t } = useI18n();
  const cr = t.admin.ops.rounds.create;
  const ask = useConfirm();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [lottoId, setLottoId] = useState(lottos[0].id);
  const [opens, setOpens] = useState(() => toLocal(serverNow));
  const [closes, setCloses] = useState("");
  const [draw, setDraw] = useState("");
  const lotto = lottos.find((l) => l.id === lottoId) ?? lottos[0];
  const shown = (v: string) => v.replace("T", " ");

  return (
    <details className="mb-5 rounded-card border border-line bg-surface shadow-card">
      <summary className="cursor-pointer px-4 py-3 font-semibold">{cr.title}</summary>
      <form
        className="flex flex-col gap-3 border-t border-line p-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const answer = await ask({
            title: cr.confirm,
            details: [
              [t.admin.ops.rounds.lotto, lotto.name],
              [cr.opens, shown(opens)],
              [cr.closes, shown(closes)],
              [cr.draw, draw ? shown(draw) : `+${lotto.delayMin} ${cr.minutes}`],
            ],
          });
          if (!answer.ok) return;
          start(async () => {
            const r = await createRoundAction({ lottoId: lotto.id, opens, closes, draw });
            if (r.ok) {
              toast.success(r.message ?? cr.title);
              setCloses("");
              setDraw("");
            } else toast.error(r.error);
          });
        }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-ink-3">{t.admin.ops.rounds.lotto}</span>
            <select value={lotto.id} onChange={(e) => setLottoId(Number(e.target.value))} className={box}>
              {lottos.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-ink-3">{cr.opens}</span>
            <input type="datetime-local" required value={opens} onChange={(e) => setOpens(e.target.value)} className={box} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-ink-3">{cr.closes}</span>
            <input type="datetime-local" required value={closes} onChange={(e) => setCloses(e.target.value)} className={box} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-ink-3">{cr.draw}</span>
            <input type="datetime-local" value={draw} onChange={(e) => setDraw(e.target.value)} className={box} />
          </label>
        </div>
        <p className="text-xs text-ink-3">{cr.note}</p>
        <Button type="submit" loading={pending} className="self-end">
          {cr.title}
        </Button>
      </form>
    </details>
  );
}
