"use client";

import { useState, useTransition } from "react";
import { formatBaht } from "chokprathan-core/rules/money";
import { useConfirm } from "@/components/admin/confirm";
import { Button } from "@/components/ui/button";
import { Card, Money } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/i18n/client";
import { formatDateTime } from "@/i18n/format";
import { writeOffDebtAction } from "@/server/actions/admin";
import type { MemberDebt } from "@/server/services/debts";

/** A member's debts; staff with the permission can forgive what is left, giving a reason. */
export function DebtList({ debts, canWriteOff }: { debts: MemberDebt[]; canWriteOff: boolean }) {
  const { lang, t } = useI18n();
  const d = t.admin.people.debts;
  const ask = useConfirm();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [reasons, setReasons] = useState<Record<number, string>>({});
  return (
    <Card>
      <ul className="divide-y divide-line">
        {debts.map((debt) => (
          <li key={debt.id} className="flex flex-col gap-2 p-4 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-ink-3">{formatDateTime(debt.createdAt, lang)}</span>
              <span>
                {d.original} <Money satang={debt.amount} />
              </span>
              {debt.writtenOff > 0 && (
                <span className="text-ink-3">
                  {d.written} <Money satang={debt.writtenOff} />
                </span>
              )}
              <span className={debt.outstanding > 0 ? "font-semibold text-danger" : "text-ink-3"}>
                {d.owed} <Money satang={debt.outstanding} />
              </span>
            </div>
            {debt.reason && <p className="text-xs text-ink-3">{debt.reason}</p>}
            {canWriteOff && debt.outstanding > 0 && (
              <div className="flex flex-wrap gap-2">
                <input
                  aria-label={d.reason}
                  placeholder={d.reason}
                  maxLength={255}
                  value={reasons[debt.id] ?? ""}
                  onChange={(e) => setReasons({ ...reasons, [debt.id]: e.target.value })}
                  className="h-10 min-w-0 flex-1 rounded-control border border-line-strong bg-surface px-3"
                />
                <Button
                  variant="dangerGhost"
                  className="border border-danger/30"
                  loading={pending}
                  disabled={(reasons[debt.id] ?? "").trim().length < 3}
                  onClick={async () => {
                    const answer = await ask({
                      title: d.confirm,
                      tone: "danger",
                      details: [
                        [d.owed, `฿${formatBaht(debt.outstanding)}`],
                        [d.reason, reasons[debt.id]],
                      ],
                      note: d.note,
                      confirmLabel: d.forgive,
                    });
                    if (!answer.ok) return;
                    start(async () => {
                      const r = await writeOffDebtAction(debt.id, reasons[debt.id] ?? "");
                      if (r.ok) toast.success(r.message ?? d.written);
                      else toast.error(r.error);
                    });
                  }}
                >
                  {d.forgive}
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
