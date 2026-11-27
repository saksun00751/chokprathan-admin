"use client";

import { useI18n } from "@/i18n/client";
import { LOCALE_META, LOCALES, type Locale } from "@/i18n/config";
import { lottoName, type LottoI18n } from "@/i18n/labels";
import { LangTabs } from "@/components/admin/lang-tabs";
import { GroupSwitch } from "@/components/admin/group-switch";
import { fmt, formatNumber } from "@/i18n/format";
import { Search } from "lucide-react";
import { useState, useTransition } from "react";
import { mayAutoResult } from "@/domain/auto-result";
import { betTypesFor } from "@/core/rules/betTypes";
import { formatRate } from "@/core/rules/money";
import { byGroup, groupName, mayMoveGroup, type LottoGroupInfo } from "@/domain/lotto-groups";
import { matchesLotto } from "@/domain/new-lotto";
import type { BetTypeCode, RiskProfile, Schedule } from "@/core/rules/types";
import { Badge } from "@/components/ui/primitives";
import { Input } from "@/components/ui/field";
import { useConfirm } from "@/components/admin/confirm";
import { changedRows } from "@/domain/confirm";
import { Button } from "@/components/ui/button";
import { Flag } from "@/components/ui/flag";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { saveLottoAction } from "@/server/actions/admin";
import type { Lotto } from "@/server/services/lottos";
import { ScheduleFields, scheduleText, TextField } from "./schedule-fields";
import { TierEditor } from "./tier-editor";

const TABS = ["general", "schedule", "rates"] as const;
type Tab = (typeof TABS)[number];

type Shared = { groups: LottoGroupInfo[]; rates: Record<BetTypeCode, number>; risk: Record<BetTypeCode, RiskProfile> };

export function LottoList({ lottos, ...shared }: Shared & { lottos: Lotto[] }) {
  const { lang, t } = useI18n();
  const lo = t.admin.ops.lottos;
  const [picked, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const sections = byGroup(lottos, shared.groups);
  const labelOf = (g: LottoGroupInfo) => groupName(g, lang, t.lotto.groups);
  // The picked group can empty out (its last lottery moved away or it was deleted).
  const filter = sections.some((s) => s.group.code === picked) ? picked : "all";
  const chips = [
    { id: "all", label: t.common.all, count: lottos.length },
    ...sections.map((s) => ({ id: s.group.code, label: labelOf(s.group), count: s.lottos.length })),
  ];
  const shown = sections.filter((s) => filter === "all" || filter === s.group.code);
  const found = new Set(shown.flatMap((s) => s.lottos.filter((l) => matchesLotto(l, query))).map((l) => l.id));
  return (
    <div className="flex flex-col gap-5">
      <div className="relative sm:max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" aria-hidden="true" />
        <Input type="search" aria-label={lo.search} placeholder={lo.search} value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        {chips.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={filter === c.id}
            onClick={() => setFilter(c.id)}
            className={cn("h-9 rounded-full px-3.5 font-medium", filter === c.id ? "bg-ink text-white" : "bg-surface text-ink-2 shadow-card")}
          >
            {c.label} <span className="tnum">{c.count}</span>
          </button>
        ))}
      </div>
      {sections.map((s) => (
        // Hidden rather than removed, so a form keeps what was typed but not saved yet.
        <section key={s.group.code} hidden={!s.lottos.some((l) => found.has(l.id))} aria-labelledby={`lotto-group-${s.group.code}`}>
          <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2">
            <h2 id={`lotto-group-${s.group.code}`} className="text-sm font-semibold text-ink-2">
              {labelOf(s.group)} ({s.lottos.length})
            </h2>
            <GroupSwitch code={s.group.code} name={labelOf(s.group)} total={s.lottos.length} on={s.lottos.filter((l) => l.enabled).length} />
          </div>
          <ul className="flex flex-col gap-2">
            {s.lottos.map((l) => (
              <LottoItem key={l.id} lotto={l} hidden={!found.has(l.id)} {...shared} />
            ))}
          </ul>
        </section>
      ))}
      {found.size === 0 && <p className="py-6 text-center text-sm text-ink-3">{lo.noMatch}</p>}
    </div>
  );
}

function LottoItem({ lotto: l, hidden, ...shared }: Shared & { lotto: Lotto; hidden: boolean }) {
  const { lang, t } = useI18n();
  const lo = t.admin.ops.lottos;
  return (
    <li hidden={hidden}>
      <details className="group rounded-card border border-line bg-surface shadow-card open:shadow-float">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3">
          <Flag code={l.flag} className="size-7" />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{lottoName(l, lang, t)}</span>
            <span className="block text-xs text-ink-3">
              {scheduleText(l.schedule, t)}
            </span>
          </span>
          {!l.enabled && <Badge tone="outline">{lo.off}</Badge>}
          {!l.autoRounds && <Badge tone="warning">{lo.manualRounds}</Badge>}
          {l.autoResult ? <Badge tone="brand">{lo.autoResult}</Badge> : <Badge>{lo.manualResult}</Badge>}
          {Object.keys(l.risk).length > 0 && <Badge tone="warning">{lo.customRisk}</Badge>}
          <span className="text-sm font-semibold text-brand group-open:hidden">{lo.edit}</span>
        </summary>
        <LottoForm lotto={l} {...shared} />
      </details>
    </li>
  );
}

function LottoForm({ lotto, groups, rates, risk }: Shared & { lotto: Lotto }) {
  const { lang, t } = useI18n();
  const lo = t.admin.ops.lottos;
  const k = t.admin.shell.confirm;
  const ask = useConfirm();
  const toast = useToast();
  const [pending, start] = useTransition();
  // What was last saved: the confirmation lists the differences from it.
  const [saved, setSaved] = useState({
    name: lotto.name,
    shortName: lotto.shortName,
    i18n: lotto.i18n,
    group: lotto.group,
    enabled: lotto.enabled,
    autoResult: lotto.autoResult,
    autoRounds: lotto.autoRounds,
    resultDelayMin: lotto.resultDelayMin,
    schedule: lotto.schedule,
    rates: lotto.rates as Partial<Record<BetTypeCode, number>>,
    risk: lotto.risk,
  });
  const [name, setName] = useState(lotto.name);
  const [shortName, setShortName] = useState(lotto.shortName);
  const [i18n, setI18n] = useState<LottoI18n>(lotto.i18n);
  const [nameLang, setNameLang] = useState<Locale>("th");
  const translate = (field: "name" | "short", value: string) => setI18n({ ...i18n, [nameLang]: { ...i18n[nameLang], [field]: value } });
  const [group, setGroup] = useState(lotto.group);
  const [enabled, setEnabled] = useState(lotto.enabled);
  // The group switch changes this from outside the form: follow it, so saving cannot switch it back.
  const [seenEnabled, setSeenEnabled] = useState(lotto.enabled);
  if (seenEnabled !== lotto.enabled) {
    setSeenEnabled(lotto.enabled);
    setEnabled(lotto.enabled);
    setSaved({ ...saved, enabled: lotto.enabled });
  }
  const [autoResult, setAutoResult] = useState(lotto.autoResult);
  const [autoRounds, setAutoRounds] = useState(lotto.autoRounds);
  const [delay, setDelay] = useState(lotto.resultDelayMin);
  const [schedule, setSchedule] = useState<Schedule>(lotto.schedule);
  const [rateText, setRateText] = useState<Partial<Record<BetTypeCode, string>>>(() =>
    Object.fromEntries(Object.entries(lotto.rates).map(([k, v]) => [k, formatRate(v as number)])),
  );
  const [customRisk, setCustomRisk] = useState<Partial<Record<BetTypeCode, RiskProfile>>>(lotto.risk);
  const codes = betTypesFor(lotto.format);
  const [tab, setTab] = useState<Tab>("general");

  return (
    <form
      className="flex flex-col gap-5 border-t border-line p-4 sm:p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        const overrideRates: Partial<Record<BetTypeCode, number>> = Object.fromEntries(
          Object.entries(rateText)
            .filter(([, v]) => v && parseFloat(v) > 0)
            .map(([code, v]) => [code, Math.round(parseFloat(v!) * 100)]),
        );
        const onOff = (b: boolean) => (b ? t.common.on : t.common.off);
        const tierLabel = (c: BetTypeCode) => `${t.lotto.betTypes[c].label} · ${lo.customTiers}`;
        const tierRows = new Set(codes.map(tierLabel));
        const labelOfCode = (code: string) => {
          const g = groups.find((x) => x.code === code);
          return g ? groupName(g, lang, t.lotto.groups) : code;
        };
        const rows = changedRows<string>([
          { label: lo.name, before: saved.name, after: name },
          { label: lo.shortName, before: saved.shortName, after: shortName },
          ...LOCALES.filter((l) => l !== "th").flatMap((l) => [
            { label: `${lo.name} (${LOCALE_META[l].native})`, before: saved.i18n[l]?.name ?? "", after: i18n[l]?.name?.trim() ?? "" },
            { label: `${lo.shortName} (${LOCALE_META[l].native})`, before: saved.i18n[l]?.short ?? "", after: i18n[l]?.short?.trim() ?? "" },
          ]),
          { label: lo.groups.field, before: labelOfCode(saved.group), after: labelOfCode(group) },
          { label: lo.enabled, before: onOff(saved.enabled), after: onOff(enabled) },
          { label: lo.autoResult, before: onOff(saved.autoResult), after: onOff(autoResult) },
          { label: lo.autoRounds, before: onOff(saved.autoRounds), after: onOff(autoRounds) },
          { label: lo.delay, before: String(saved.resultDelayMin), after: String(delay) },
          { label: lo.schedule, before: scheduleText(saved.schedule, t), after: scheduleText(schedule, t) },
          ...codes.flatMap((c) => [
            // The rate members actually get: this lotto's own rate, or the default when blank.
            {
              label: `${t.lotto.betTypes[c].label} · ${lo.pays}`,
              before: `×${formatRate(saved.rates[c] ?? rates[c])}`,
              after: `×${formatRate(overrideRates[c] ?? rates[c])}`,
            },
            { label: tierLabel(c), before: JSON.stringify(saved.risk[c] ?? null), after: JSON.stringify(customRisk[c] ?? null) },
          ]),
        ]);
        if (rows.length === 0) {
          toast.info(k.noChanges);
          return;
        }
        const answer = await ask({
          title: k.saveLotto,
          tone: saved.enabled && !enabled ? "danger" : "default",
          // Name the lotto first, unless its name is one of the changes listed anyway.
          details: [
            ...(rows.some((r) => r.label === lo.shortName) ? [] : ([[lo.shortName, shortName]] as [string, string][])),
            ...rows.map((r): [string, string] => [r.label, tierRows.has(r.label) ? k.changed : `${r.before} → ${r.after}`]),
          ],
          note: k.saveRiskNote,
        });
        if (!answer.ok) return;
        const next = { name, shortName, i18n, group, enabled, autoResult, autoRounds, resultDelayMin: delay, schedule, rates: overrideRates, risk: customRisk };
        start(async () => {
          const r = await saveLottoAction(lotto.id, next);
          if (r.ok) {
            toast.success(r.message ?? lo.saved);
            setSaved(next);
          } else toast.error(r.error);
        });
      }}
    >
      <div role="tablist" aria-label={shortName} className="no-scrollbar flex gap-1 self-start overflow-x-auto rounded-control bg-panel p-1 max-sm:self-stretch">
        {TABS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn("h-9 shrink-0 rounded-[8px] px-3 text-sm font-medium", tab === id ? "bg-surface text-ink shadow-card" : "text-ink-2 hover:text-ink")}
          >
            {lo.tabs[id]}
          </button>
        ))}
      </div>

      {/* Panels are hidden rather than removed: one save button covers all three. */}
      <div role="tabpanel" hidden={tab !== "general"}>
      <div className="mb-3 flex">
        <LangTabs value={nameLang} onChange={setNameLang} label={t.admin.content.langTabs} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {nameLang === "th" ? (
          <>
            <TextField label={lo.name} value={name} onChange={setName} />
            <TextField label={lo.shortName} value={shortName} onChange={setShortName} />
          </>
        ) : (
          <>
            <TranslationField label={lo.name} lang={nameLang} value={i18n[nameLang]?.name ?? ""} thai={name} maxLength={60} onChange={(v) => translate("name", v)} />
            <TranslationField label={lo.shortName} lang={nameLang} value={i18n[nameLang]?.short ?? ""} thai={shortName} maxLength={30} onChange={(v) => translate("short", v)} />
          </>
        )}
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-ink-3">{lo.groups.field}</span>
          <select
            value={group}
            // Yiki is locked: nothing moves in or out.
            disabled={!mayMoveGroup(lotto.group, "")}
            onChange={(e) => setGroup(e.target.value)}
            className="h-10 rounded-control border border-line-strong bg-surface px-3"
          >
            {groups
              .filter((g) => mayMoveGroup(lotto.group, g.code))
              .map((g) => (
                <option key={g.code} value={g.code}>
                  {groupName(g, lang, t.lotto.groups)}
                </option>
              ))}
          </select>
        </label>
        <div className="flex flex-col justify-end gap-2 text-sm">
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="size-4 accent-[var(--color-brand)]" />{" "}
            {lo.enabled}
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={autoResult}
              disabled={!mayAutoResult(lotto.group)}
              onChange={(e) => setAutoResult(e.target.checked)}
              className="size-4 accent-[var(--color-brand)]"
            />{" "}
            {lo.autoResult}
          </label>
          {!mayAutoResult(lotto.group) && <p className="text-xs text-ink-3">{lo.autoOnlyYiki}</p>}
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={autoRounds} onChange={(e) => setAutoRounds(e.target.checked)} className="size-4 accent-[var(--color-brand)]" />{" "}
            {lo.autoRounds}
          </label>
          {!autoRounds && <p className="text-xs text-ink-3">{lo.autoRoundsOffNote}</p>}
        </div>
      </div>

      </div>

      <div role="tabpanel" hidden={tab !== "schedule"} className={cn("flex-col gap-3", tab === "schedule" && "flex")}>
        <ScheduleFields schedule={schedule} onChange={setSchedule} note={lo.scheduleNote} />
        <label className="flex max-w-60 flex-col gap-1 text-sm">
          <span className="text-xs text-ink-3">{lo.delay}</span>
          <input
            inputMode="numeric"
            value={String(delay)}
            onChange={(e) => setDelay(Number(e.target.value.replace(/\D/g, "")) || 0)}
            className="tnum h-10 rounded-control border border-line-strong px-3 text-right"
          />
        </label>
      </div>

      <div role="tabpanel" hidden={tab !== "rates"}>
        <p className="mb-2 text-sm font-semibold">{lo.ratesTitle}</p>
        <ul className="flex flex-col gap-3">
          {codes.map((code) => {
            const base = rateText[code] && parseFloat(rateText[code]!) > 0 ? Math.round(parseFloat(rateText[code]!) * 100) : rates[code];
            const custom = customRisk[code];
            return (
              <li key={code} className="grid grid-cols-1 gap-3 rounded-control border border-line p-3 md:grid-cols-[200px_minmax(0,1fr)]">
                <div>
                  <p className="text-sm font-semibold">{t.lotto.betTypes[code].label}</p>
                  <label className="mt-1.5 flex items-center gap-2 text-sm">
                    <span className="text-xs text-ink-3">{lo.pays}</span>
                    <input
                      value={rateText[code] ?? ""}
                      placeholder={formatRate(rates[code])}
                      inputMode="decimal"
                      onChange={(e) => setRateText({ ...rateText, [code]: e.target.value.replace(/[^\d.]/g, "") })}
                      className="tnum h-9 w-24 rounded-[8px] border border-line-strong px-2 text-right placeholder:text-ink-3"
                    />
                  </label>
                  <p className="mt-1 text-xs text-ink-3">{fmt(lo.useDefault, { rate: formatRate(rates[code]) })}</p>
                </div>
                <div>
                  <label className="mb-2 inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={!!custom}
                      onChange={(e) => {
                        const next = { ...customRisk };
                        if (e.target.checked) next[code] = structuredClone(risk[code]);
                        else delete next[code];
                        setCustomRisk(next);
                      }}
                      className="size-4 accent-[var(--color-brand)]"
                    />
                    {lo.customTiers}
                  </label>
                  {custom ? (
                    <TierEditor profile={custom} baseRate100={base} onChange={(p) => setCustomRisk({ ...customRisk, [code]: p })} betType={code} />
                  ) : (
                    <p className="text-xs text-ink-3">
                      {lo.defaultTiers}{" "}
                      {risk[code].enabled
                        ? `${risk[code].tiers.map((x) => `฿${formatNumber(x.threshold)}→${x.percent}%`).join(", ")}${risk[code].cap !== null ? fmt(lo.capAt, { amount: formatNumber(risk[code].cap!) }) : ""}`
                        : lo.noCut}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex justify-end">
        <Button type="submit" loading={pending}>
          {fmt(lo.save, { name: shortName })}
        </Button>
      </div>
    </form>
  );
}

/** One name in another language. Left empty, members see the dictionary's name or the Thai one, shown as the placeholder. */
function TranslationField({ label, lang, value, thai, maxLength, onChange }: { label: string; lang: Locale; value: string; thai: string; maxLength: number; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs text-ink-3">{label}</span>
      <input
        lang={LOCALE_META[lang].htmlLang}
        value={value}
        placeholder={thai}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 rounded-control border border-line-strong bg-surface px-3"
      />
    </label>
  );
}
