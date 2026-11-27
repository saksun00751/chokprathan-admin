"use client";

import { useTransition } from "react";
import { useConfirm } from "@/components/admin/confirm";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import { setLottoGroupEnabledAction } from "@/server/actions/admin";

/** Beside a group's heading: how many of its lotteries are on, and switching them all at once. */
export function GroupSwitch({ code, name, total, on }: { code: string; name: string; total: number; on: number }) {
  const { t } = useI18n();
  const lo = t.admin.ops.lottos;
  const g = lo.groupSwitch;
  const ask = useConfirm();
  const toast = useToast();
  const [pending, start] = useTransition();

  const change = async (enabled: boolean) => {
    const answer = await ask({
      title: fmt(enabled ? g.enableTitle : g.disableTitle, { name }),
      tone: enabled ? "default" : "danger",
      details: [
        [lo.groups.field, name],
        [g.affected, String(enabled ? total - on : on)],
      ],
      note: enabled ? g.enableNote : g.disableNote,
      confirmLabel: enabled ? g.enable : g.disable,
    });
    if (!answer.ok) return;
    start(async () => {
      const r = await setLottoGroupEnabledAction(code, enabled);
      if (r.ok) toast.success(r.message ?? lo.saved);
      else toast.error(r.error);
    });
  };

  return (
    <>
      <span className="tnum text-xs text-ink-3">{fmt(g.count, { on, total })}</span>
      <span className="ml-auto flex gap-2">
        <Button size="sm" variant="secondary" aria-label={`${g.enable}: ${name}`} disabled={pending || on === total} onClick={() => change(true)}>
          {g.enable}
        </Button>
        <Button size="sm" variant="secondary" aria-label={`${g.disable}: ${name}`} disabled={pending || on === 0} onClick={() => change(false)}>
          {g.disable}
        </Button>
      </span>
    </>
  );
}
