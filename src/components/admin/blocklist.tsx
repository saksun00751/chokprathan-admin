"use client";

import { useState, useTransition } from "react";
import { BANKS } from "@/domain/banks";
import { normalizeAccount, normalizeName, normalizePhone, type BlockKind } from "@/domain/blocklist";
import { useConfirm } from "@/components/admin/confirm";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/i18n/client";
import { bankName } from "@/i18n/labels";
import type { AnyActionResult } from "@/lib/action";
import { addBlockAction, blockMemberAction, removeBlockAction } from "@/server/actions/admin";

const box = "h-10 rounded-control border border-line-strong bg-surface px-3";

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

/** Add an entry: a bank account (one bank or any), a phone, or a first name and surname, with a reason. */
export function BlockAddForm() {
  const { t } = useI18n();
  const bl = t.admin.people.blocklist;
  const k = t.admin.shell.confirm;
  const ask = useConfirm();
  const { pending, run } = useRun();
  const [kind, setKind] = useState<BlockKind>("bank");
  const [v, setV] = useState({ bankCode: "", value: "", first: "", last: "", reason: "" });
  // Shown exactly as it will be stored and compared (digits only, no title).
  const shown =
    kind === "bank"
      ? `${v.bankCode ? bankName(v.bankCode, t) : bl.anyBank} ${normalizeAccount(v.value)}`
      : kind === "phone"
        ? normalizePhone(v.value)
        : `${normalizeName(v.first)} ${normalizeName(v.last)}`;
  return (
    <form
      className="flex flex-col gap-3 rounded-card border border-line bg-surface p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        const answer = await ask({
          title: k.block,
          tone: "danger",
          details: [
            [bl.colKind, bl.kinds[kind]],
            [bl.colValue, shown.trim() || "-"],
            [bl.reason, v.reason.trim() || "-"],
          ],
          note: k.blockNote,
          confirmLabel: bl.submit,
        });
        if (!answer.ok) return;
        run(
          () => addBlockAction({ kind, bankCode: v.bankCode || null, value: v.value, first: v.first, last: v.last }, v.reason),
          () => setV({ ...v, value: "", first: "", last: "", reason: "" }),
        );
      }}
    >
      <p className="font-semibold">{bl.add}</p>
      <div role="radiogroup" aria-label={bl.colKind} className="flex flex-wrap gap-1.5">
        {(["bank", "phone", "name"] as const).map((x) => (
          <button
            key={x}
            type="button"
            role="radio"
            aria-checked={kind === x}
            onClick={() => setKind(x)}
            className={`h-9 rounded-full px-3.5 text-sm font-medium ${kind === x ? "bg-ink text-white" : "bg-panel text-ink-2 hover:bg-line"}`}
          >
            {bl.kinds[x]}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {kind === "bank" && (
          <>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs text-ink-3">{bl.bank}</span>
              <select value={v.bankCode} onChange={(e) => setV({ ...v, bankCode: e.target.value })} className={box}>
                <option value="">{bl.anyBank}</option>
                {BANKS.map((b) => (
                  <option key={b.code} value={b.code}>
                    {bankName(b.code, t)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs text-ink-3">{bl.account}</span>
              <input
                value={v.value}
                onChange={(e) => setV({ ...v, value: e.target.value.replace(/[^\d-\s]/g, "") })}
                inputMode="numeric"
                className={`${box} tnum`}
              />
            </label>
          </>
        )}
        {kind === "phone" && (
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-ink-3">{bl.phone}</span>
            <input
              value={v.value}
              onChange={(e) => setV({ ...v, value: e.target.value.replace(/[^\d+\-\s]/g, "") })}
              inputMode="tel"
              className={`${box} tnum`}
            />
          </label>
        )}
        {kind === "name" && (
          <>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs text-ink-3">{bl.first}</span>
              <input value={v.first} onChange={(e) => setV({ ...v, first: e.target.value })} className={box} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs text-ink-3">{bl.last}</span>
              <input value={v.last} onChange={(e) => setV({ ...v, last: e.target.value })} className={box} />
            </label>
          </>
        )}
      </div>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs text-ink-3">{bl.reason}</span>
        <input value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} placeholder={bl.reasonPlaceholder} maxLength={255} className={box} />
      </label>
      <Button type="submit" variant="danger" loading={pending} className="self-start">
        {bl.submit}
      </Button>
    </form>
  );
}

/** Lift one block: the reason is typed in the confirmation and kept with the entry. */
export function UnblockButton({ id, label }: { id: number; label: string }) {
  const { t } = useI18n();
  const bl = t.admin.people.blocklist;
  const k = t.admin.shell.confirm;
  const ask = useConfirm();
  const { pending, run } = useRun();
  return (
    <Button
      size="sm"
      variant="secondary"
      loading={pending}
      onClick={async () => {
        const answer = await ask({
          title: k.unblock,
          details: [[bl.colValue, label]],
          note: k.unblockNote,
          input: { label: k.unblockReason, required: true },
          confirmLabel: bl.unblock,
        });
        if (answer.ok) run(() => removeBlockAction(id, answer.text));
      }}
    >
      {bl.unblock}
    </Button>
  );
}

/** From the member page: block this member's own bank account, phone, and/or name. */
export function MemberBlockForm({ userId }: { userId: number }) {
  const { t } = useI18n();
  const m = t.admin.content.member;
  const bl = t.admin.people.blocklist;
  const k = t.admin.shell.confirm;
  const ask = useConfirm();
  const { pending, run } = useRun();
  const [parts, setParts] = useState<Set<BlockKind>>(new Set(["bank", "phone", "name"]));
  const [reason, setReason] = useState("");
  const toggle = (p: BlockKind) =>
    setParts((s) => {
      const next = new Set(s);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  return (
    <form
      className="flex flex-col gap-2.5"
      onSubmit={async (e) => {
        e.preventDefault();
        const answer = await ask({
          title: k.blockMember,
          tone: "danger",
          details: [
            [bl.colKind, [...parts].map((p) => bl.kinds[p]).join(", ") || "-"],
            [bl.reason, reason.trim() || "-"],
          ],
          note: k.blockNote,
          confirmLabel: m.blockSubmit,
        });
        if (answer.ok)
          run(
            () => blockMemberAction(userId, [...parts], reason),
            () => setReason(""),
          );
      }}
    >
      <p className="text-sm font-semibold">{m.blockTitle}</p>
      <p className="text-xs text-ink-3">{m.blockHint}</p>
      <div className="flex flex-col gap-1.5 text-sm">
        {(["bank", "phone", "name"] as const).map((p) => (
          <label key={p} className="inline-flex items-center gap-2">
            <input type="checkbox" checked={parts.has(p)} onChange={() => toggle(p)} className="size-4 accent-[var(--color-brand)]" />
            {bl.kinds[p]}
          </label>
        ))}
      </div>
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={bl.reasonPlaceholder}
        aria-label={bl.reason}
        maxLength={255}
        className={box}
      />
      <Button type="submit" size="sm" variant="dangerGhost" loading={pending} className="self-start border border-line">
        {m.blockSubmit}
      </Button>
    </form>
  );
}
