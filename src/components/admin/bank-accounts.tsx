"use client";

import { useState, useTransition } from "react";
import { BANKS } from "@/domain/banks";
import type { BankAccountKind } from "@/domain/bank-accounts";
import { useConfirm } from "@/components/admin/confirm";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/i18n/client";
import { bankName, bankShort } from "@/i18n/labels";
import { changedRows, money, toSatang } from "@/domain/confirm";
import type { AnyActionResult } from "@/lib/action";
import { adjustBankAccountAction, archiveBankAccountAction, saveBankAccountAction } from "@/server/actions/admin";

const box = "h-10 rounded-control border border-line-strong bg-surface px-3";

/** Same behaviour as the other back-office forms: a toast with the server's message, then `after`. */
function useRun() {
  const done = useI18n().t.admin.content.done;
  const toast = useToast();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<AnyActionResult>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(r.message ?? done);
        after?.();
      } else toast.error(r.error);
    });
  return { pending, run };
}

export interface BankAccountView {
  id: number;
  kind: BankAccountKind;
  bankCode: string;
  accountNo: string;
  accountName: string;
  active: boolean;
  sort: number;
  note: string | null;
  /** recorded balance in satang, shown before → after when adjusting */
  balance?: number;
}

/** Add (account null) or edit a website bank account. The balance is not editable here. */
export function BankAccountForm({ account, onDone }: { account: BankAccountView | null; onDone?: () => void }) {
  const { t } = useI18n();
  const b = t.admin.content.banks;
  const k = t.admin.shell.confirm;
  const ask = useConfirm();
  const toast = useToast();
  const { pending, run } = useRun();
  const [v, setV] = useState({
    kind: account?.kind ?? ("deposit" as BankAccountKind),
    bankCode: account?.bankCode ?? BANKS[0].code,
    accountNo: account?.accountNo ?? "",
    accountName: account?.accountName ?? "",
    active: account?.active ?? true,
    sort: account?.sort ?? 0,
    note: account?.note ?? "",
  });
  return (
    <form
      className="grid grid-cols-1 gap-3 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const kindText = (x: BankAccountKind) => (x === "deposit" ? b.deposit : b.withdraw);
        const onOff = (x: boolean) => (x ? t.common.on : t.common.off);
        const rows = changedRows<string>([
          { label: b.kind, before: account ? kindText(account.kind) : "", after: kindText(v.kind) },
          { label: b.bank, before: account ? bankName(account.bankCode, t) : "", after: bankName(v.bankCode, t) },
          { label: b.accountNo, before: account?.accountNo ?? "", after: v.accountNo },
          { label: b.accountName, before: account?.accountName ?? "", after: v.accountName },
          { label: k.inUse, before: account ? onOff(account.active) : "", after: onOff(v.active) },
          { label: b.sort, before: account ? String(account.sort) : "", after: String(v.sort) },
          { label: b.note, before: account?.note ?? "", after: v.note },
        ]);
        if (rows.length === 0) {
          toast.info(k.noChanges);
          return;
        }
        // A new account lists what will be created; an edit lists only what changes, before → after.
        const answer = await ask({
          title: k.saveBank,
          tone: account && rows.some((r) => r.label === b.accountNo || r.label === b.bank) ? "danger" : "default",
          details: rows.map((r): [string, string] => [r.label, account ? `${r.before || "-"} → ${r.after || "-"}` : r.after || "-"]),
          note: k.saveBankNote,
        });
        if (!answer.ok) return;
        run(() => saveBankAccountAction(account?.id ?? null, v), onDone);
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs text-ink-3">{b.kind}</span>
        <select value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value as BankAccountKind })} className={box}>
          <option value="deposit">{b.deposit}</option>
          <option value="withdraw">{b.withdraw}</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs text-ink-3">{b.bank}</span>
        <select value={v.bankCode} onChange={(e) => setV({ ...v, bankCode: e.target.value })} className={box}>
          {BANKS.map((x) => (
            <option key={x.code} value={x.code}>
              {bankName(x.code, t)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs text-ink-3">{b.accountNo}</span>
        <input
          value={v.accountNo}
          onChange={(e) => setV({ ...v, accountNo: e.target.value.replace(/\D/g, "") })}
          inputMode="numeric"
          className={`${box} tnum`}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs text-ink-3">{b.accountName}</span>
        <input value={v.accountName} onChange={(e) => setV({ ...v, accountName: e.target.value })} className={box} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs text-ink-3">{b.sort}</span>
        <input
          value={String(v.sort)}
          onChange={(e) => setV({ ...v, sort: Math.round(Number(e.target.value.replace(/\D/g, "")) || 0) })}
          inputMode="numeric"
          className={`${box} tnum`}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs text-ink-3">{b.note}</span>
        <input value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} className={box} />
      </label>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} className="size-4 accent-[var(--color-brand)]" />
        {b.active}
      </label>
      <Button type="submit" size="sm" loading={pending} className="self-start">
        {b.save}
      </Button>
    </form>
  );
}

export function AddBankAccount() {
  const b = useI18n().t.admin.content.banks;
  const [open, setOpen] = useState(false);
  return open ? (
    <div className="rounded-card border border-line bg-surface p-5">
      <p className="mb-3 text-sm font-semibold">{b.add}</p>
      <BankAccountForm account={null} onDone={() => setOpen(false)} />
    </div>
  ) : (
    <Button size="sm" onClick={() => setOpen(true)} className="self-start">
      {b.add}
    </Button>
  );
}

/** Edit, adjust, and delete buttons under one account, each shown only with its permission. */
export function BankAccountTools({ account, canManage, canAdjust }: { account: BankAccountView; canManage: boolean; canAdjust: boolean }) {
  const { t } = useI18n();
  const b = t.admin.content.banks;
  const k = t.admin.shell.confirm;
  const ask = useConfirm();
  const { pending, run } = useRun();
  const label = `${bankShort(account.bankCode, t)} ${account.accountNo} · ${account.accountName}`;
  const [mode, setMode] = useState<"none" | "edit" | "adjust">("none");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {canAdjust && (
          <Button size="sm" variant="secondary" onClick={() => setMode(mode === "adjust" ? "none" : "adjust")}>
            {b.adjust}
          </Button>
        )}
        {canManage && (
          <>
            <Button size="sm" variant="secondary" onClick={() => setMode(mode === "edit" ? "none" : "edit")}>
              {b.edit}
            </Button>
            <Button
              size="sm"
              variant="dangerGhost"
              loading={pending}
              onClick={async () => {
                const answer = await ask({
                  title: k.archiveBank,
                  tone: "danger",
                  details: [[k.account, label], ...(account.balance !== undefined ? ([[b.balance, money(account.balance)]] as [string, string][]) : [])],
                  note: k.archiveBankNote,
                  confirmLabel: b.archive,
                });
                if (answer.ok) run(() => archiveBankAccountAction(account.id));
              }}
            >
              {b.archive}
            </Button>
          </>
        )}
      </div>
      {mode === "edit" && <BankAccountForm account={account} onDone={() => setMode("none")} />}
      {mode === "adjust" && (
        <form
          className="flex flex-col gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const satang = toSatang(amount);
            // Invalid input goes straight to the server, which explains what is wrong.
            if (satang !== null && satang !== 0) {
              const answer = await ask({
                title: k.adjustBank,
                tone: satang < 0 ? "danger" : "default",
                details: [
                  [k.account, label],
                  [k.amount, money(satang, true)],
                  ...(account.balance !== undefined
                    ? ([[k.balance, `${money(account.balance)} → ${money(account.balance + satang)}`]] as [string, string][])
                    : []),
                  [k.reason, reason.trim() || "-"],
                ],
                note: k.adjustBankNote,
              });
              if (!answer.ok) return;
            }
            run(
              () => adjustBankAccountAction(account.id, Number(amount), reason),
              () => {
                setAmount("");
                setReason("");
                setMode("none");
              },
            );
          }}
        >
          <div className="flex flex-wrap gap-2">
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.-]/g, ""))}
              placeholder={b.adjustAmount}
              aria-label={b.adjustAmount}
              inputMode="decimal"
              className={`${box} tnum w-40 text-right`}
            />
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={b.adjustReason}
              aria-label={b.adjustReason}
              className={`${box} min-w-0 flex-1`}
            />
          </div>
          <Button type="submit" size="sm" loading={pending} className="self-start">
            {b.saveAdjust}
          </Button>
        </form>
      )}
    </div>
  );
}
