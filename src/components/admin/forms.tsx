"use client";

import { BANKS } from "@/domain/banks";
import { bankName } from "@/i18n/labels";

import { useState, useTransition, type ReactNode } from "react";
import { formatBaht } from "chokprathan-core/rules/money";
import { useConfirm } from "@/components/admin/confirm";
import { LangTabs, type Translations } from "@/components/admin/lang-tabs";
import { changedRows, money, toSatang } from "@/domain/confirm";
import { pointsFor, type PointRule } from "@/domain/points";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/i18n/client";
import { LOCALE_META, LOCALES, type Locale } from "@/i18n/config";
import { fmt } from "@/i18n/format";
import type { AnyActionResult } from "@/lib/action";
import type { RewardSettings, SiteSettings, WalletSettings } from "@/server/catalog";
import {
  adjustBalanceAction,
  adjustPointsAction,
  createVoucherAction,
  deleteNewsAction,
  resetMemberPasswordAction,
  reviewDepositAction,
  reviewWithdrawalAction,
  updateMemberAction,
  closeMemberAction,
  reopenMemberAction,
  saveNewsAction,
  savePromotionAction,
  saveSettingsAction,
  setMemberStatusAction,
  toggleVoucherAction,
} from "@/server/actions/admin";

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

/* ---------- members ---------- */

export function MemberActions({
  userId,
  status,
  balance,
  pointRule,
  canAdjust = true,
  canManage = true,
}: {
  userId: number;
  status: string;
  /** current main balance in satang, to show before → after in the confirmation */
  balance?: number;
  /** the points rule, to show what a credit top-up earns */
  pointRule?: PointRule;
  canAdjust?: boolean;
  canManage?: boolean;
}) {
  const { t } = useI18n();
  const m = t.admin.content.member;
  const k = t.admin.shell.confirm;
  const ask = useConfirm();
  const { pending, run } = useRun();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [password, setPassword] = useState("");
  if (!canAdjust && !canManage) return <p className="text-sm text-ink-3">{m.readOnly}</p>;
  return (
    <div className="flex flex-col gap-5">
      {canAdjust && (
        <form
          className="flex flex-col gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const satang = toSatang(amount);
            // Invalid input goes straight to the server, which explains what is wrong.
            if (satang !== null && satang !== 0) {
              const answer = await ask({
                title: satang > 0 ? k.adjustAdd : k.adjustDeduct,
                tone: satang < 0 ? "danger" : "default",
                details: [
                  [k.amount, money(satang, true)],
                  ...(balance !== undefined ? ([[k.balance, `${money(balance)} → ${money(balance + satang)}`]] as [string, string][]) : []),
                  // Back-office top-ups earn points like a deposit.
                  ...(pointRule && pointsFor(satang, pointRule) > 0
                    ? ([[k.pointsEarn, `+${pointsFor(satang, pointRule).toLocaleString("en-US")}`]] as [string, string][])
                    : []),
                  [k.reason, note.trim() || "-"],
                ],
                note: k.adjustNote,
              });
              if (!answer.ok) return;
            }
            run(
              () => adjustBalanceAction(userId, Number(amount.replace(/,/g, "")), note),
              () => {
                setAmount("");
                setNote("");
              },
            );
          }}
        >
          <p className="text-sm font-semibold">{m.adjust}</p>
          <div className="flex gap-2">
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.-]/g, ""))}
              placeholder={m.amountPlaceholder}
              inputMode="decimal"
              className={`${box} tnum w-36 text-right`}
              aria-label={m.amount}
            />
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={m.reasonPlaceholder}
              className={`${box} min-w-0 flex-1`}
              aria-label={m.reason}
            />
          </div>
          <Button type="submit" size="sm" loading={pending} className="self-start">
            {m.saveAdjust}
          </Button>
        </form>
      )}
      {canManage && (
        <>
          <form
            className="flex flex-col gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!(await ask({ title: k.resetPassword, note: k.resetPasswordNote })).ok) return;
              run(
                () => resetMemberPasswordAction(userId, password),
                () => setPassword(""),
              );
            }}
          >
            <p className="text-sm font-semibold">{m.resetPassword}</p>
            <div className="flex gap-2">
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={m.passwordPlaceholder}
                className={`${box} min-w-0 flex-1`}
                aria-label={m.newPassword}
              />
              <Button type="submit" size="sm" variant="secondary" className="h-10" loading={pending}>
                {m.setPassword}
              </Button>
            </div>
          </form>
          <Button
            variant={status === "active" ? "dangerGhost" : "secondary"}
            className="self-start border border-line"
            loading={pending}
            onClick={async () => {
              const suspend = status === "active";
              if (!(await ask(suspend ? { title: k.suspend, note: k.suspendNote, tone: "danger" } : { title: k.activate })).ok) return;
              run(() => setMemberStatusAction(userId, suspend ? "suspended" : "active"));
            }}
          >
            {status === "active" ? m.suspend : m.activate}
          </Button>
        </>
      )}
    </div>
  );
}

/** Add or deduct a member's points (members.points), with a reason and a confirmation. */
export function MemberPointsForm({ userId, points }: { userId: number; points: number }) {
  const { t } = useI18n();
  const m = t.admin.content.member;
  const k = t.admin.shell.confirm;
  const ask = useConfirm();
  const { pending, run } = useRun();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const n = (v: number) => v.toLocaleString("en-US");
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const delta = Number(amount);
        // Anything that is not a whole number goes straight to the server, which explains what is wrong.
        if (Number.isInteger(delta) && delta !== 0) {
          const answer = await ask({
            title: delta > 0 ? k.pointsAdd : k.pointsDeduct,
            tone: delta < 0 ? "danger" : "default",
            details: [
              [k.points, `${delta > 0 ? "+" : ""}${n(delta)}`],
              [k.pointsBalance, `${n(points)} → ${n(points + delta)}`],
              [k.reason, note.trim() || "-"],
            ],
            note: k.pointsNote,
          });
          if (!answer.ok) return;
        }
        run(
          () => adjustPointsAction(userId, delta, note),
          () => {
            setAmount("");
            setNote("");
          },
        );
      }}
    >
      <p className="text-sm font-semibold">{m.adjustPoints}</p>
      <div className="flex gap-2">
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d-]/g, ""))}
          placeholder={m.pointsPlaceholder}
          inputMode="numeric"
          className={`${box} tnum w-36 text-right`}
          aria-label={k.points}
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={m.reasonPlaceholder}
          className={`${box} min-w-0 flex-1`}
          aria-label={m.reason}
        />
      </div>
      <Button type="submit" size="sm" variant="secondary" loading={pending} className="self-start">
        {m.savePoints}
      </Button>
    </form>
  );
}

/** Edit name, phone, and payout account. Staff without members.contact get blank phone/account fields: blank keeps the current value. */
export function MemberEditForm({
  userId,
  current,
  showContact,
}: {
  userId: number;
  current: { name: string; phone: string | null; bankCode: string | null; bankAccount: string | null; bankName: string | null };
  showContact: boolean;
}) {
  const { t } = useI18n();
  const m = t.admin.content.member;
  const k = t.admin.shell.confirm;
  const ask = useConfirm();
  const { pending, run } = useRun();
  const [v, setV] = useState({
    name: current.name,
    phone: showContact ? (current.phone ?? "") : "",
    bankCode: current.bankCode ?? "",
    bankAccount: showContact ? (current.bankAccount ?? "") : "",
    bankName: current.bankName ?? "",
  });
  const [reason, setReason] = useState("");
  const field = (key: keyof typeof v, label: string, extra: { inputMode?: "numeric" | "tel"; placeholder?: string } = {}) => (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs text-ink-3">{label}</span>
      <input value={v[key]} onChange={(e) => setV({ ...v, [key]: e.target.value })} className={`${box} ${extra.inputMode ? "tnum" : ""}`} {...extra} />
    </label>
  );
  return (
    <form
      className="flex flex-col gap-2.5"
      onSubmit={async (e) => {
        e.preventDefault();
        const rows = changedRows([
          { label: m.name, before: current.name, after: v.name },
          ...(showContact || v.phone ? [{ label: m.phone, before: showContact ? (current.phone ?? "") : "", after: v.phone }] : []),
          { label: m.bank, before: current.bankCode ?? "", after: v.bankCode },
          ...(showContact || v.bankAccount ? [{ label: m.account, before: showContact ? (current.bankAccount ?? "") : "", after: v.bankAccount }] : []),
          { label: m.accountName, before: current.bankName ?? "", after: v.bankName },
        ]);
        const payoutChanged = rows.some((r) => r.label === m.bank || r.label === m.account || r.label === m.accountName);
        const show = (label: string, value: string) => (label === m.bank ? bankName(value, t) : value || "-");
        if (rows.length > 0) {
          const answer = await ask({
            title: k.editMember,
            tone: payoutChanged ? "danger" : "default",
            details: [
              ...rows.map((r): [string, string] => [r.label, `${show(r.label, r.before)} → ${show(r.label, r.after)}`]),
              [k.reason, reason.trim() || "-"],
            ],
            note: payoutChanged ? k.bankChangeNote : undefined,
          });
          if (!answer.ok) return;
        }
        run(
          () => updateMemberAction(userId, v, reason),
          () => setReason(""),
        );
      }}
    >
      <p className="text-sm font-semibold">{m.edit}</p>
      {field("name", m.name)}
      {field("phone", m.phone, { inputMode: "tel", placeholder: showContact ? undefined : m.keep })}
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs text-ink-3">{m.bank}</span>
        <select value={v.bankCode} onChange={(e) => setV({ ...v, bankCode: e.target.value })} className={box}>
          {BANKS.map((b) => (
            <option key={b.code} value={b.code}>
              {bankName(b.code, t)}
            </option>
          ))}
        </select>
      </label>
      {field("bankAccount", m.account, { inputMode: "numeric", placeholder: showContact ? undefined : m.keep })}
      {field("bankName", m.accountName)}
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={m.editReason} aria-label={m.editReason} className={box} />
      <Button type="submit" size="sm" variant="secondary" loading={pending} className="self-start">
        {m.saveEdit}
      </Button>
    </form>
  );
}

/** Close ("delete") or reopen an account. Closing keeps every record and needs a reason. */
export function MemberCloseForm({ userId, closed }: { userId: number; closed: boolean }) {
  const { t } = useI18n();
  const m = t.admin.content.member;
  const k = t.admin.shell.confirm;
  const ask = useConfirm();
  const { pending, run } = useRun();
  const [reason, setReason] = useState("");
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const answer = await ask(
          closed
            ? { title: k.reopenMember, details: [[k.reason, reason.trim() || "-"]] }
            : { title: k.closeMember, tone: "danger", details: [[k.reason, reason.trim() || "-"]], note: m.closeConfirm },
        );
        if (!answer.ok) return;
        run(
          () => (closed ? reopenMemberAction(userId, reason) : closeMemberAction(userId, reason)),
          () => setReason(""),
        );
      }}
    >
      <p className="text-sm font-semibold">{closed ? m.reopen : m.close}</p>
      {!closed && <p className="text-xs text-ink-3">{m.closeHint}</p>}
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={closed ? m.reopenReason : m.closeReason}
        aria-label={closed ? m.reopenReason : m.closeReason}
        className={box}
      />
      <Button type="submit" size="sm" variant={closed ? "secondary" : "dangerGhost"} loading={pending} className="self-start border border-line">
        {closed ? m.reopen : m.close}
      </Button>
    </form>
  );
}

/* ---------- finance ---------- */

/**
 * Approve or reject a deposit or withdrawal. For withdrawals, `payFrom` lists the website's withdraw
 * accounts: staff pick the one the money left from, and its recorded balance goes down.
 */
export function ReviewButtons({
  kind,
  id,
  summary,
  payFrom = [],
}: {
  kind: "deposit" | "withdraw";
  id: number;
  /** what the confirmation shows: who, how much, and the member's account */
  summary: { member: string; amount: number; account: string };
  payFrom?: { id: number; label: string }[];
}) {
  const { t } = useI18n();
  const rv = t.admin.content.review;
  const k = t.admin.shell.confirm;
  const ask = useConfirm();
  const { pending, run } = useRun();
  const [from, setFrom] = useState<number | null>(payFrom[0]?.id ?? null);
  const deposit = kind === "deposit";
  const base: [string, string][] = [
    [k.member, summary.member],
    [k.amount, money(summary.amount)],
    [deposit ? k.payFrom : k.payTo, summary.account],
  ];
  const fromLabel = payFrom.find((a) => a.id === from)?.label;
  return (
    <span className="flex flex-wrap items-center justify-end gap-1.5">
      {kind === "withdraw" && payFrom.length > 0 && (
        <select
          aria-label={rv.payFrom}
          value={from ?? ""}
          onChange={(e) => setFrom(Number(e.target.value))}
          className="h-8 max-w-48 rounded-control border border-line bg-surface px-2 text-xs"
        >
          {payFrom.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      )}
      <Button
        size="sm"
        loading={pending}
        onClick={async () => {
          const answer = await ask(
            deposit
              ? { title: k.approveDeposit, details: base, note: k.approveDepositNote, confirmLabel: rv.approve }
              : {
                  title: k.payWithdrawal,
                  tone: "danger",
                  details: fromLabel ? [...base, [rv.payFrom, fromLabel]] : base,
                  note: k.payWithdrawalNote,
                  confirmLabel: rv.paid,
                },
          );
          if (!answer.ok) return;
          run(() => (deposit ? reviewDepositAction(id, true) : reviewWithdrawalAction(id, true, "", payFrom.length ? from : null)));
        }}
      >
        {deposit ? rv.approve : rv.paid}
      </Button>
      <Button
        size="sm"
        variant="dangerGhost"
        disabled={pending}
        onClick={async () => {
          const answer = await ask({
            title: deposit ? k.rejectDeposit : k.rejectWithdrawal,
            tone: "danger",
            details: base,
            note: deposit ? undefined : k.rejectWithdrawalNote,
            input: { label: k.rejectReason, placeholder: rv.rejectPrompt },
            confirmLabel: rv.reject,
          });
          if (!answer.ok) return;
          run(() => (deposit ? reviewDepositAction(id, false, answer.text) : reviewWithdrawalAction(id, false, answer.text)));
        }}
      >
        {rv.reject}
      </Button>
    </span>
  );
}

/* ---------- promotions ---------- */

type Promo = {
  id: number;
  title: string;
  summary: string;
  details: string;
  bonus_percent: number;
  max_bonus: number;
  min_deposit: number;
  turnover_x: number;
  once_per_user: number;
  active: number;
  i18n?: Translations<"title" | "summary" | "details">;
};

export function PromoEditor({ promo }: { promo: Promo | null }) {
  const { t } = useI18n();
  const ct = t.admin.content;
  const pr = ct.promotions;
  const ask = useConfirm();
  const { pending, run } = useRun();
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState<Locale>("th");
  const [tr, setTr] = useState<Translations<"title" | "summary" | "details">>(() => structuredClone(promo?.i18n ?? {}));
  const [v, setV] = useState(() => ({
    title: promo?.title ?? "",
    summary: promo?.summary ?? "",
    details: promo?.details ?? "",
    bonusPercent: String(promo?.bonus_percent ?? 0),
    maxBonus: String((promo?.max_bonus ?? 0) / 100),
    minDeposit: String((promo?.min_deposit ?? 0) / 100),
    turnoverX: String(promo?.turnover_x ?? 0),
    oncePerUser: promo ? promo.once_per_user === 1 : true,
    active: promo ? promo.active === 1 : true,
  }));
  const value = (k: "title" | "summary" | "details") => (lang === "th" ? v[k] : (tr[lang]?.[k] ?? ""));
  const text = (k: "title" | "summary" | "details") => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    lang === "th" ? setV({ ...v, [k]: e.target.value }) : setTr({ ...tr, [lang]: { ...tr[lang], [k]: e.target.value } });
  const hint = (k: "title" | "summary" | "details") => (lang === "th" ? undefined : v[k]);
  const numField = (k: "bonusPercent" | "maxBonus" | "minDeposit" | "turnoverX", label: string) => (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs text-ink-3">{label}</span>
      <input
        inputMode="decimal"
        value={v[k]}
        onChange={(e) => setV({ ...v, [k]: e.target.value.replace(/[^\d.]/g, "") })}
        className={`${box} tnum text-right`}
      />
    </label>
  );
  return (
    <>
      <Button size="sm" variant={promo ? "secondary" : "primary"} onClick={() => setOpen(true)}>
        {promo ? pr.edit : pr.add}
      </Button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={promo ? pr.editTitle : pr.add}
        footer={
          <Button
            size="lg"
            className="w-full"
            loading={pending}
            onClick={async () => {
              const answer = await ask({
                title: t.admin.shell.confirm.savePromotion,
                details: [
                  [pr.name, v.title || "-"],
                  [pr.bonusPercent, `${Number(v.bonusPercent) || 0}%`],
                  [pr.maxBonus, money(toSatang(v.maxBonus) ?? 0)],
                  [pr.minDeposit, money(toSatang(v.minDeposit) ?? 0)],
                  [pr.turnover, String(Number(v.turnoverX) || 0)],
                  [pr.oncePerUser, v.oncePerUser ? t.common.yes : t.common.no],
                  [pr.active, v.active ? t.common.on : t.common.off],
                ],
              });
              if (!answer.ok) return;
              run(
                () =>
                  savePromotionAction(promo?.id ?? null, {
                    ...v,
                    bonusPercent: Number(v.bonusPercent),
                    maxBonus: Number(v.maxBonus),
                    minDeposit: Number(v.minDeposit),
                    turnoverX: Number(v.turnoverX),
                    i18n: tr,
                  }),
                () => setOpen(false),
              );
            }}
          >
            {pr.save}
          </Button>
        }
      >
        <div className="flex flex-col gap-3">
          <LangTabs value={lang} onChange={setLang} label={ct.langTabs} />
          {lang !== "th" && <p className="-mt-1 text-xs text-ink-3">{ct.langHint}</p>}
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-ink-3">{pr.name}</span>
            <input value={value("title")} onChange={text("title")} placeholder={hint("title")} className={box} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-ink-3">{pr.summary}</span>
            <input value={value("summary")} onChange={text("summary")} placeholder={hint("summary")} className={box} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-ink-3">{pr.details}</span>
            <textarea
              value={value("details")}
              onChange={text("details")}
              placeholder={hint("details")}
              rows={3}
              className="rounded-control border border-line-strong px-3 py-2"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            {numField("bonusPercent", pr.bonusPercent)}
            {numField("maxBonus", pr.maxBonus)}
            {numField("minDeposit", pr.minDeposit)}
            {numField("turnoverX", pr.turnover)}
          </div>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={v.oncePerUser}
              onChange={(e) => setV({ ...v, oncePerUser: e.target.checked })}
              className="size-4 accent-[var(--color-brand)]"
            />{" "}
            {pr.oncePerUser}
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={v.active}
              onChange={(e) => setV({ ...v, active: e.target.checked })}
              className="size-4 accent-[var(--color-brand)]"
            />{" "}
            {pr.active}
          </label>
        </div>
      </Sheet>
    </>
  );
}

export function VoucherCreate() {
  const { t } = useI18n();
  const pr = t.admin.content.promotions;
  const ask = useConfirm();
  const { pending, run } = useRun();
  const [v, setV] = useState({
    code: "",
    value: "50",
    maxUses: "100",
    days: "30",
    note: "",
  });
  return (
    <form
      className="flex flex-wrap items-end gap-2 rounded-card border border-line bg-surface p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const answer = await ask({
          title: t.admin.shell.confirm.createVoucher,
          details: [
            [pr.voucherCode, v.code || "-"],
            [pr.voucherValue, money(toSatang(v.value) ?? 0)],
            [pr.voucherUses, String(Number(v.maxUses) || 0)],
            [pr.voucherDays, String(Number(v.days) || 0)],
            [pr.voucherNote, v.note.trim() || "-"],
          ],
        });
        if (!answer.ok) return;
        run(
          () =>
            createVoucherAction({
              code: v.code,
              value: Number(v.value),
              maxUses: Number(v.maxUses),
              days: Number(v.days),
              note: v.note,
            }),
          () => setV({ ...v, code: "", note: "" }),
        );
      }}
    >
      {(
        [
          ["code", pr.voucherCode, "w-36 uppercase"],
          ["value", pr.voucherValue, "w-28 text-right"],
          ["maxUses", pr.voucherUses, "w-28 text-right"],
          ["days", pr.voucherDays, "w-24 text-right"],
          ["note", pr.voucherNote, "w-48"],
        ] as const
      ).map(([k, label, cls]) => (
        <label key={k} className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-ink-3">{label}</span>
          <input
            value={v[k]}
            onChange={(e) =>
              setV({
                ...v,
                [k]: k === "code" ? e.target.value.toUpperCase() : e.target.value,
              })
            }
            className={`${box} tnum ${cls}`}
          />
        </label>
      ))}
      <Button type="submit" size="sm" className="h-10" loading={pending}>
        {pr.createVoucher}
      </Button>
    </form>
  );
}

export function VoucherToggle({ id, code, active }: { id: number; code: string; active: boolean }) {
  const { t } = useI18n();
  const pr = t.admin.content.promotions;
  const ask = useConfirm();
  const { pending, run } = useRun();
  return (
    <Button
      size="sm"
      variant={active ? "dangerGhost" : "secondary"}
      loading={pending}
      onClick={async () => {
        const answer = await ask({
          title: t.admin.shell.confirm.toggleVoucher,
          tone: active ? "danger" : "default",
          details: [
            [pr.voucherCode, code],
            [pr.active, `${active ? t.common.on : t.common.off} → ${active ? t.common.off : t.common.on}`],
          ],
          confirmLabel: active ? pr.disable : pr.enable,
        });
        if (answer.ok) run(() => toggleVoucherAction(id, !active));
      }}
    >
      {active ? pr.disable : pr.enable}
    </Button>
  );
}

/* ---------- news ---------- */

type News = {
  id: number;
  title: string;
  body: string;
  pinned: number;
  published: number;
  i18n?: Translations<"title" | "body">;
};

export function NewsEditor({ item }: { item: News | null }) {
  const { t } = useI18n();
  const ct = t.admin.content;
  const nw = ct.news;
  const ask = useConfirm();
  const { pending, run } = useRun();
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState<Locale>("th");
  const [tr, setTr] = useState<Translations<"title" | "body">>(() => structuredClone(item?.i18n ?? {}));
  const [v, setV] = useState({
    title: item?.title ?? "",
    body: item?.body ?? "",
    pinned: item?.pinned === 1,
    published: item ? item.published === 1 : true,
  });
  return (
    <>
      <span className="flex gap-1.5">
        <Button size="sm" variant={item ? "secondary" : "primary"} onClick={() => setOpen(true)}>
          {item ? nw.edit : nw.write}
        </Button>
        {item && (
          <Button
            size="sm"
            variant="dangerGhost"
            loading={pending}
            onClick={async () => {
              const answer = await ask({
                title: t.admin.shell.confirm.deleteNews,
                tone: "danger",
                details: [[nw.headline, item.title]],
                confirmLabel: nw.delete,
              });
              if (answer.ok) run(() => deleteNewsAction(item.id));
            }}
          >
            {nw.delete}
          </Button>
        )}
      </span>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={item ? nw.editTitle : nw.write}
        footer={
          <Button
            size="lg"
            className="w-full"
            loading={pending}
            onClick={() =>
              run(
                () => saveNewsAction(item?.id ?? null, { ...v, i18n: tr }),
                () => setOpen(false),
              )
            }
          >
            {nw.save}
          </Button>
        }
      >
        <div className="flex flex-col gap-3">
          <LangTabs value={lang} onChange={setLang} label={ct.langTabs} />
          {lang !== "th" && <p className="-mt-1 text-xs text-ink-3">{ct.langHint}</p>}
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-ink-3">{nw.headline}</span>
            <input
              value={lang === "th" ? v.title : (tr[lang]?.title ?? "")}
              placeholder={lang === "th" ? undefined : v.title}
              onChange={(e) => (lang === "th" ? setV({ ...v, title: e.target.value }) : setTr({ ...tr, [lang]: { ...tr[lang], title: e.target.value } }))}
              className={box}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-ink-3">{nw.body}</span>
            <textarea
              value={lang === "th" ? v.body : (tr[lang]?.body ?? "")}
              placeholder={lang === "th" ? undefined : v.body}
              onChange={(e) => (lang === "th" ? setV({ ...v, body: e.target.value }) : setTr({ ...tr, [lang]: { ...tr[lang], body: e.target.value } }))}
              rows={5}
              className="rounded-control border border-line-strong px-3 py-2"
            />
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={v.pinned}
              onChange={(e) => setV({ ...v, pinned: e.target.checked })}
              className="size-4 accent-[var(--color-brand)]"
            />{" "}
            {nw.pin}
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={v.published}
              onChange={(e) => setV({ ...v, published: e.target.checked })}
              className="size-4 accent-[var(--color-brand)]"
            />{" "}
            {nw.publish}
          </label>
        </div>
      </Sheet>
    </>
  );
}

/* ---------- site settings ---------- */

export function SettingsForm({
  site,
  wallet,
  rewards,
  points,
  production,
  smsReady,
}: {
  site: SiteSettings;
  wallet: WalletSettings;
  rewards: RewardSettings;
  points: PointRule;
  production: boolean;
  smsReady: boolean;
}) {
  const { t } = useI18n();
  const ct = t.admin.content;
  const st = ct.settings;
  const [lang, setLang] = useState<Locale>("th");
  const ask = useConfirm();
  const toast = useToast();
  const { pending, run } = useRun();
  const [s, setS] = useState(site);
  const [w, setW] = useState(wallet);
  const [r, setR] = useState(rewards);
  const [pt, setPt] = useState(points);
  // What the page last saved: the confirmation compares against it, and it moves forward after each save.
  const [saved, setSaved] = useState({ site, wallet, rewards, points });
  const baht = (n: number) => String(n / 100);
  const satang = (v: string) => Math.round((Number(v.replace(/[^\d.]/g, "")) || 0) * 100);
  const pct = (bp: number) => String(bp / 100);
  const toBp = (v: string) => Math.round((Number(v.replace(/[^\d.]/g, "")) || 0) * 100);
  const onOff = (b: boolean) => (b ? t.common.on : t.common.off);
  const percent = (bp: number) => `${bp / 100}%`;

  const changes = () => {
    const a = saved;
    return changedRows<string>([
      { label: "LINE ID", before: a.site.lineId, after: s.lineId },
      { label: st.phone, before: a.site.phone, after: s.phone },
      { label: st.announcement, before: a.site.announcement, after: s.announcement },
      ...LOCALES.filter((l) => l !== "th").map((l) => ({
        label: `${st.announcement} · ${LOCALE_META[l].native}`,
        before: a.site.announcementI18n?.[l] ?? "",
        after: s.announcementI18n?.[l] ?? "",
      })),
      { label: st.cancelWindow, before: String(a.site.cancelWindowMin), after: String(s.cancelWindowMin) },
      { label: st.registration, before: onOff(a.site.registrationOpen), after: onOff(s.registrationOpen) },
      { label: st.otp, before: onOff(a.site.otpRequired), after: onOff(s.otpRequired) },
      { label: st.staffTotp, before: onOff(a.site.staffTotpRequired), after: onOff(s.staffTotpRequired) },
      { label: st.demo, before: onOff(a.site.demoMode), after: onOff(s.demoMode) },
      { label: st.crowd, before: onOff(a.site.simulateCrowd), after: onOff(s.simulateCrowd) },
      { label: st.depositMin, before: money(a.wallet.depositMin), after: money(w.depositMin) },
      { label: st.depositMax, before: money(a.wallet.depositMax), after: money(w.depositMax) },
      { label: st.depositWindow, before: String(a.wallet.depositWindowMin), after: String(w.depositWindowMin) },
      { label: st.withdrawMin, before: money(a.wallet.withdrawMin), after: money(w.withdrawMin) },
      { label: st.withdrawMax, before: money(a.wallet.withdrawMax), after: money(w.withdrawMax) },
      { label: st.withdrawPerDay, before: String(a.wallet.withdrawPerDay), after: String(w.withdrawPerDay) },
      { label: st.adjustMin, before: money(a.wallet.adjustMin), after: money(w.adjustMin) },
      { label: st.adjustMax, before: money(a.wallet.adjustMax), after: money(w.adjustMax) },
      { label: st.slipRequired, before: onOff(a.wallet.slipRequired), after: onOff(w.slipRequired) },
      { label: st.autoApprove, before: onOff(a.wallet.depositAutoApprove), after: onOff(w.depositAutoApprove) },
      { label: st.cashback, before: percent(a.rewards.cashbackBp), after: percent(r.cashbackBp) },
      { label: st.aff1, before: percent(a.rewards.aff1Bp), after: percent(r.aff1Bp) },
      { label: st.aff2, before: percent(a.rewards.aff2Bp), after: percent(r.aff2Bp) },
      { label: st.pointsOn, before: onOff(a.points.enabled), after: onOff(pt.enabled) },
      { label: st.pointsEvery, before: money(a.points.every), after: money(pt.every) },
      { label: st.pointsGive, before: String(a.points.points), after: String(pt.points) },
    ]);
  };

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={async (e) => {
        e.preventDefault();
        const rows = changes();
        if (rows.length === 0) {
          toast.info(t.admin.shell.confirm.noChanges);
          return;
        }
        const answer = await ask({
          title: t.admin.shell.confirm.saveSettings,
          details: rows.map((row): [string, string] => [row.label, `${row.before || "-"} → ${row.after || "-"}`]),
          note: t.admin.shell.confirm.saveSettingsNote,
        });
        if (!answer.ok) return;
        const next = { site: s, wallet: w, rewards: r, points: pt };
        run(
          () => saveSettingsAction(next),
          () => setSaved(next),
        );
      }}
    >
      <section className="rounded-card border border-line bg-surface p-5">
        <h2 className="mb-3 font-semibold">{st.general}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-ink-3">LINE ID</span>
            <input value={s.lineId} onChange={(e) => setS({ ...s, lineId: e.target.value })} className={box} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-ink-3">{st.phone}</span>
            <input value={s.phone} onChange={(e) => setS({ ...s, phone: e.target.value })} className={box} />
          </label>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <span className="text-xs text-ink-3">{st.announcement}</span>
            <LangTabs value={lang} onChange={setLang} label={ct.langTabs} />
            <input
              aria-label={st.announcement}
              value={lang === "th" ? s.announcement : (s.announcementI18n?.[lang] ?? "")}
              placeholder={lang === "th" ? undefined : s.announcement}
              onChange={(e) =>
                lang === "th"
                  ? setS({ ...s, announcement: e.target.value })
                  : setS({ ...s, announcementI18n: { ...s.announcementI18n, [lang]: e.target.value } })
              }
              maxLength={200}
              className={box}
            />
            {lang !== "th" && <p className="text-xs text-ink-3">{ct.langHint}</p>}
          </div>
          <Num label={st.cancelWindow} value={String(s.cancelWindowMin)} onChange={(v) => setS({ ...s, cancelWindowMin: Math.round(Number(v) || 0) })} />
        </div>
        <div className="mt-4 flex flex-col gap-2.5 text-sm">
          <Check checked={s.registrationOpen} onChange={(v) => setS({ ...s, registrationOpen: v })}>
            {st.registration}
          </Check>
          <Check checked={s.otpRequired} onChange={(v) => setS({ ...s, otpRequired: v })}>
            {st.otp} {smsReady ? "" : st.smsMissing}
          </Check>
          <Check checked={s.staffTotpRequired} onChange={(v) => setS({ ...s, staffTotpRequired: v })}>
            {st.staffTotp}
          </Check>
          {!production && (
            <>
              <Check checked={s.demoMode} onChange={(v) => setS({ ...s, demoMode: v })}>
                {st.demo}
              </Check>
              <Check checked={s.simulateCrowd} onChange={(v) => setS({ ...s, simulateCrowd: v })}>
                {st.crowd}
              </Check>
            </>
          )}
          {production && <p className="text-xs text-ink-3">{st.production}</p>}
        </div>
      </section>

      <section className="rounded-card border border-line bg-surface p-5">
        <h2 className="mb-3 font-semibold">{st.money}</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Num label={st.depositMin} value={baht(w.depositMin)} onChange={(v) => setW({ ...w, depositMin: satang(v) })} />
          <Num label={st.depositMax} value={baht(w.depositMax)} onChange={(v) => setW({ ...w, depositMax: satang(v) })} />
          <Num label={st.depositWindow} value={String(w.depositWindowMin)} onChange={(v) => setW({ ...w, depositWindowMin: Math.round(Number(v) || 0) })} />
          <Num label={st.withdrawMin} value={baht(w.withdrawMin)} onChange={(v) => setW({ ...w, withdrawMin: satang(v) })} />
          <Num label={st.withdrawMax} value={baht(w.withdrawMax)} onChange={(v) => setW({ ...w, withdrawMax: satang(v) })} />
          <Num label={st.withdrawPerDay} value={String(w.withdrawPerDay)} onChange={(v) => setW({ ...w, withdrawPerDay: Math.round(Number(v) || 0) })} />
          <Num label={st.adjustMin} value={baht(w.adjustMin)} onChange={(v) => setW({ ...w, adjustMin: satang(v) })} />
          <Num label={st.adjustMax} value={baht(w.adjustMax)} onChange={(v) => setW({ ...w, adjustMax: satang(v) })} />
        </div>
        <div className="mt-4 flex flex-col gap-2.5 text-sm">
          <Check checked={w.slipRequired} onChange={(v) => setW({ ...w, slipRequired: v })}>
            {st.slipRequired}
          </Check>
          {!production && (
            <Check checked={w.depositAutoApprove} onChange={(v) => setW({ ...w, depositAutoApprove: v })}>
              {st.autoApprove}
            </Check>
          )}
        </div>
        <p className="mt-4 text-xs text-ink-3">{st.accountsMoved}</p>
      </section>

      <section className="rounded-card border border-line bg-surface p-5">
        <h2 className="mb-3 font-semibold">{st.rewards}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Num label={st.cashback} value={pct(r.cashbackBp)} onChange={(v) => setR({ ...r, cashbackBp: toBp(v) })} />
          <Num label={st.aff1} value={pct(r.aff1Bp)} onChange={(v) => setR({ ...r, aff1Bp: toBp(v) })} />
          <Num label={st.aff2} value={pct(r.aff2Bp)} onChange={(v) => setR({ ...r, aff2Bp: toBp(v) })} />
        </div>
        <p className="mt-3 text-xs text-ink-3">{fmt(st.example, { amount: formatBaht(Math.floor((100_000 * r.cashbackBp) / 10_000)) })}</p>
      </section>

      <section className="rounded-card border border-line bg-surface p-5">
        <h2 className="mb-3 font-semibold">{st.points}</h2>
        <Check checked={pt.enabled} onChange={(v) => setPt({ ...pt, enabled: v })}>
          {st.pointsOn}
        </Check>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:max-w-md">
          <Num label={st.pointsEvery} value={baht(pt.every)} onChange={(v) => setPt({ ...pt, every: satang(v) })} />
          <Num label={st.pointsGive} value={String(pt.points)} onChange={(v) => setPt({ ...pt, points: Math.round(Number(v.replace(/[^\d]/g, "")) || 0) })} />
        </div>
        <p className="mt-3 text-xs text-ink-3">
          {fmt(st.pointsExample, {
            amount: formatBaht(1_000_00, { decimals: "auto" }),
            n: pointsFor(1_000_00, { ...pt, enabled: true }).toLocaleString("en-US"),
          })}
        </p>
      </section>

      <div className="flex justify-end">
        <Button type="submit" size="lg" loading={pending}>
          {st.save}
        </Button>
      </div>
    </form>
  );
}

/**
 * A number field that keeps what was typed ("1." while typing 1.5) and reports every keystroke, so
 * pressing Enter saves, and the confirmation shows, the value on screen rather than the last one blurred.
 */
function Num({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value);
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs text-ink-3">{label}</span>
      <input
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(e.target.value);
        }}
        className={`${box} tnum text-right`}
      />
    </label>
  );
}

function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="inline-flex min-h-8 items-start gap-2">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 size-4 shrink-0 accent-[var(--color-brand)]" />
      <span>{children}</span>
    </label>
  );
}
