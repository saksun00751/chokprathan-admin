"use client";

import { useState, useTransition } from "react";
import { BET_TYPE_ORDER, betTypesFor } from "@/core/rules/betTypes";
import { formatRate } from "@/core/rules/money";
import type { BetTypeCode, ResultFormat } from "@/core/rules/types";
import { useConfirm } from "@/components/admin/confirm";
import { Button } from "@/components/ui/button";
import { Badge, Card, SectionTitle } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { netPayoutPerBaht } from "@/domain/packages";
import { useI18n } from "@/i18n/client";
import { fmt, formatNumber } from "@/i18n/format";
import { savePackageAction, setLottoPackageAction } from "@/server/actions/admin";
import type { Overrides, PricePackage } from "@/server/services/packages";

export type PackageLotto = { id: number; name: string; format: ResultFormat };

const box = "tnum h-10 w-full min-w-0 rounded-control border border-line-strong bg-surface px-2 text-right disabled:opacity-50";
const decimal = (v: string) => v.replace(/[^\d.]/g, "");
/** "750" → rate × 100, "15" (percent) → basis points. Empty stays empty. */
const hundredths = (v: string) => (v.trim() === "" ? null : Math.round(Number(v) * 100));
const text = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n / 100));

function useSend() {
  const toast = useToast();
  const [busy, start] = useTransition();
  const send = (action: () => Promise<{ ok: boolean; message?: string; error?: string }>, after?: () => void) =>
    start(async () => {
      const r = await action();
      if (r.ok) {
        toast.success(r.message ?? "");
        after?.();
      } else toast.error(r.error ?? "");
    });
  return { busy, send };
}

/** The standard package (read only) and the extra ones staff make, with the lotteries offering each. */
export function PackageManager({ packages, lottos }: { packages: PricePackage[]; lottos: PackageLotto[] }) {
  const p = useI18n().t.admin.ops.packages;
  const [open, setOpen] = useState<number | "new" | null>(null);
  const standard = packages.find((x) => x.standard);
  return (
    <div className="flex flex-col gap-4">
      {open === "new" ? (
        <Editor pack={null} standard={standard} onDone={() => setOpen(null)} />
      ) : (
        <Button className="self-start" onClick={() => setOpen("new")}>
          {p.create}
        </Button>
      )}
      <ul className="flex flex-col gap-3">
        {packages.map((pack) => (
          <li key={pack.id}>
            <Card className="flex flex-col gap-4 p-5">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="font-semibold">{pack.name}</h2>
                {pack.standard ? <Badge tone="brand">{p.standard}</Badge> : <Badge tone={pack.active ? "success" : "outline"}>{pack.active ? p.on : p.off}</Badge>}
                <span className="flex-1 text-sm text-ink-3">{pack.standard ? p.standardNote : fmt(p.offeredBy, { n: formatNumber(pack.lottos.length) })}</span>
                {!pack.standard && (
                  <Button variant="secondary" onClick={() => setOpen(open === pack.id ? null : pack.id)}>
                    {open === pack.id ? p.close : p.edit}
                  </Button>
                )}
              </div>
              {open === pack.id ? (
                <>
                  <Editor pack={pack} standard={standard} onDone={() => setOpen(null)} />
                  <Offers pack={pack} lottos={lottos} />
                </>
              ) : (
                <RateSummary pack={pack} />
              )}
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RateSummary({ pack }: { pack: PricePackage }) {
  const { t } = useI18n();
  const p = t.admin.ops.packages;
  return (
    <ul className="flex flex-wrap gap-2 text-sm">
      {BET_TYPE_ORDER.flatMap((code) => {
        const r = pack.rates[code];
        if (!r) return [];
        return [
          <li key={code} className="tnum rounded-control border border-line px-2.5 py-1">
            {t.lotto.betTypes[code].short} ×{formatRate(r.rate100)}
            {r.discountBp > 0 && <span className="ml-1 text-ink-3">{fmt(p.off_percent, { n: r.discountBp / 100 })}</span>}
          </li>,
        ];
      })}
    </ul>
  );
}

function Editor({ pack, standard, onDone }: { pack: PricePackage | null; standard: PricePackage | undefined; onDone: () => void }) {
  const { t } = useI18n();
  const p = t.admin.ops.packages;
  const ask = useConfirm();
  const { busy, send } = useSend();
  const [name, setName] = useState(pack?.name ?? "");
  const [sort, setSort] = useState(String(pack?.sort ?? 10));
  const [active, setActive] = useState(pack?.active ?? true);
  const [rows, setRows] = useState<Record<string, { rate: string; discount: string }>>(() =>
    Object.fromEntries(BET_TYPE_ORDER.map((code) => [code, { rate: text(pack?.rates[code]?.rate100), discount: text(pack?.rates[code]?.discountBp) }])),
  );
  const set = (code: BetTypeCode, key: "rate" | "discount", value: string) => setRows((all) => ({ ...all, [code]: { ...all[code], [key]: decimal(value) } }));
  // A bet type is in the package when it has a rate.
  const rates = Object.fromEntries(
    BET_TYPE_ORDER.flatMap((code) => {
      const rate100 = hundredths(rows[code].rate);
      return rate100 === null ? [] : [[code, { rate100, discountBp: hundredths(rows[code].discount) ?? 0 }]];
    }),
  );

  return (
    <form
      className="flex flex-col gap-4 rounded-card border border-line bg-panel p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const answer = await ask({ title: p.saveTitle, details: [[p.name, name]], note: p.saveNote, confirmLabel: p.save });
        if (!answer.ok) return;
        send(() => savePackageAction(pack?.id ?? null, { name, sort: Number(sort) || 0, active, rates }), onDone);
      }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-56 flex-1 flex-col gap-1 text-sm">
          <span className="text-xs text-ink-3">{p.name}</span>
          <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} className="h-10 rounded-control border border-line-strong bg-surface px-3" />
        </label>
        <label className="flex w-24 flex-col gap-1 text-sm">
          <span className="text-xs text-ink-3">{p.sort}</span>
          <input inputMode="numeric" value={sort} onChange={(e) => setSort(e.target.value.replace(/\D/g, ""))} className={box} />
        </label>
        <label className="inline-flex h-10 items-center gap-2 text-sm">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="size-4 accent-[var(--color-brand)]" />
          {p.active}
        </label>
      </div>
      <p className="text-xs text-ink-3">{p.hint}</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-3">
              <th className="pb-2 font-medium">{p.type}</th>
              <th className="w-28 pb-2 text-right font-medium">{p.rate}</th>
              <th className="w-28 pb-2 text-right font-medium">{p.discount}</th>
              <th className="pb-2 pl-3 text-right font-medium">{p.perBaht}</th>
            </tr>
          </thead>
          <tbody>
            {BET_TYPE_ORDER.map((code) => {
              const mine = rates[code];
              const base = standard?.rates[code];
              const perBaht = mine && mine.rate100 > 0 && mine.discountBp < 10_000 ? netPayoutPerBaht(mine.rate100, mine.discountBp) : null;
              const standardPerBaht = base ? netPayoutPerBaht(base.rate100, base.discountBp) : null;
              const higher = perBaht !== null && standardPerBaht !== null && perBaht > standardPerBaht;
              const label = t.lotto.betTypes[code].label;
              return (
                <tr key={code}>
                  <th scope="row" className="py-1 pr-3 text-left font-medium">
                    {label}
                  </th>
                  <td className="py-1">
                    <input inputMode="decimal" aria-label={`${label} ${p.rate}`} value={rows[code].rate} placeholder="-" onChange={(e) => set(code, "rate", e.target.value)} className={box} />
                  </td>
                  <td className="py-1 pl-2">
                    <input inputMode="decimal" aria-label={`${label} ${p.discount}`} value={rows[code].discount} placeholder="0" disabled={!mine} onChange={(e) => set(code, "discount", e.target.value)} className={box} />
                  </td>
                  <td className={higher ? "tnum py-1 pl-3 text-right font-semibold text-danger" : "tnum py-1 pl-3 text-right text-ink-2"}>
                    {perBaht === null ? "-" : `×${perBaht}`}
                    {standardPerBaht !== null && <span className="ml-1 text-xs font-normal text-ink-3">{fmt(p.versus, { n: standardPerBaht })}</span>}
                    {higher && <span className="block text-xs">{p.higher}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2">
        <Button type="submit" loading={busy} disabled={name.trim().length < 2 || Object.keys(rates).length === 0}>
          {p.save}
        </Button>
        <Button type="button" variant="secondary" onClick={onDone}>
          {p.close}
        </Button>
      </div>
    </form>
  );
}

function Offers({ pack, lottos }: { pack: PricePackage; lottos: PackageLotto[] }) {
  const p = useI18n().t.admin.ops.packages;
  return (
    <section aria-label={p.lottos}>
      <SectionTitle>{p.lottos}</SectionTitle>
      <ul className="divide-y divide-line rounded-control border border-line">
        {lottos.map((lotto) => {
          const offer = pack.lottos.find((o) => o.lottoId === lotto.id);
          // Remounts when what is stored changes, so the boxes show the saved values.
          return <Offer key={`${lotto.id}:${JSON.stringify(offer ?? null)}`} pack={pack} lotto={lotto} offer={offer} />;
        })}
      </ul>
    </section>
  );
}

function Offer({ pack, lotto, offer }: { pack: PricePackage; lotto: PackageLotto; offer: { overrides: Overrides } | undefined }) {
  const { t } = useI18n();
  const p = t.admin.ops.packages;
  const { busy, send } = useSend();
  const codes = betTypesFor(lotto.format).filter((code) => pack.rates[code]);
  const [custom, setCustom] = useState(false);
  const [rows, setRows] = useState<Record<string, { rate: string; discount: string }>>(() =>
    Object.fromEntries(codes.map((code) => [code, { rate: text(offer?.overrides[code]?.rate100), discount: text(offer?.overrides[code]?.discountBp) }])),
  );
  const overrides = (): Overrides =>
    Object.fromEntries(codes.map((code) => [code, { rate100: hundredths(rows[code].rate), discountBp: hundredths(rows[code].discount) }]));
  const own = offer ? Object.keys(offer.overrides).length : 0;

  return (
    <li className="flex flex-col gap-2 px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex min-h-9 flex-1 items-center gap-2">
          <input
            type="checkbox"
            checked={offer !== undefined}
            disabled={busy || codes.length === 0}
            onChange={(e) => send(() => setLottoPackageAction(lotto.id, pack.id, { offered: e.target.checked, overrides: offer?.overrides ?? {} }))}
            className="size-4 accent-[var(--color-brand)]"
          />
          {lotto.name}
        </label>
        {own > 0 && <span className="text-xs text-ink-3">{fmt(p.own, { n: own })}</span>}
        {offer && (
          <button type="button" className="text-sm font-semibold text-brand" onClick={() => setCustom(!custom)}>
            {custom ? p.close : p.custom}
          </button>
        )}
      </div>
      {offer && custom && (
        <form
          className="flex flex-col gap-2 pb-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(() => setLottoPackageAction(lotto.id, pack.id, { offered: true, overrides: overrides() }));
          }}
        >
          <p className="text-xs text-ink-3">{p.customHint}</p>
          {codes.map((code) => (
            <div key={code} className="grid grid-cols-[1fr_7rem_7rem] items-center gap-2">
              <span>{t.lotto.betTypes[code].label}</span>
              {(["rate", "discount"] as const).map((key) => (
                <input
                  key={key}
                  inputMode="decimal"
                  aria-label={`${lotto.name} ${t.lotto.betTypes[code].label} ${p[key]}`}
                  value={rows[code][key]}
                  placeholder={text(key === "rate" ? pack.rates[code]!.rate100 : pack.rates[code]!.discountBp)}
                  onChange={(e) => setRows({ ...rows, [code]: { ...rows[code], [key]: decimal(e.target.value) } })}
                  className={box}
                />
              ))}
            </div>
          ))}
          <Button type="submit" loading={busy} className="self-start">
            {p.save}
          </Button>
        </form>
      )}
    </li>
  );
}
