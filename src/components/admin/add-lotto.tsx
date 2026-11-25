"use client";

import { Check, Plus } from "lucide-react";
import { useEffect, useId, useRef, useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Flag } from "@/components/ui/flag";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { groupName, mayMoveGroup, type LottoGroupInfo } from "@/domain/lotto-groups";
import { copyFromLotto, detailProblems, FLAG_CODES, scheduleProblem, suggestSlug, type DetailField } from "@/domain/new-lotto";
import type { ResultFormat, Schedule } from "chokprathan-core/rules/types";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/cn";
import { createLottoAction } from "@/server/actions/admin";
import type { Lotto } from "@/server/services/lottos";
import { ScheduleFields, scheduleText } from "./schedule-fields";

const FORMATS: ResultFormat[] = ["standard", "thai_gov", "laos4"];
const STEPS = ["info", "schedule", "review"] as const;
const EMPTY = {
  name: "",
  shortName: "",
  /** null while staff have not typed one: a code is then suggested from the short name. */
  slug: null as string | null,
  group: "",
  format: "standard" as ResultFormat,
  flag: null as string | null,
  resultDelayMin: 20,
  schedule: { kind: "weekly", days: [1, 2, 3, 4, 5], close: "15:00" } as Schedule,
};

/** The "add lottery" button and its three-step dialog. What was typed survives closing the dialog. */
export function AddLotto({ groups, lottos }: { groups: LottoGroupInfo[]; lottos: Lotto[] }) {
  const { lang, t } = useI18n();
  const lo = t.admin.ops.lottos;
  const al = lo.add;
  const toast = useToast();
  const formId = useId();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  /** Problems are named once staff try to move on, not while they are still typing. */
  const [checked, setChecked] = useState(false);
  const [source, setSource] = useState("");
  const [v, setV] = useState(EMPTY);
  const set = (patch: Partial<typeof EMPTY>) => setV((old) => ({ ...old, ...patch }));
  const top = useRef<HTMLDivElement>(null);

  const choices = groups.filter((g) => mayMoveGroup(g.code, ""));
  const sources = lottos.filter((l) => mayMoveGroup(l.group, ""));
  const taken = lottos.map((l) => l.slug);
  // The first group until one is picked, or when the picked one has since been deleted.
  const group = choices.find((g) => g.code === v.group) ?? choices[0];
  const slug = v.slug ?? suggestSlug(v.shortName, taken);
  const value = { ...v, slug, group: group?.code ?? "" };
  const details = detailProblems(value, taken);
  const timing = scheduleProblem(v.schedule, v.resultDelayMin);
  const errorOf = (field: DetailField) => (checked && details[field] ? al.errors[details[field]] : null);
  const labelOf = (g: LottoGroupInfo) => groupName(g, lang, t.lotto.groups);

  // Focus the top of each new step, so a held Enter key cannot run through to saving.
  useEffect(() => {
    if (!open) return;
    top.current?.focus({ preventScroll: true });
    top.current?.parentElement?.scrollTo({ top: 0 });
  }, [step, open]);

  const go = (to: number) => {
    setChecked(false);
    setStep(to);
  };
  const submit = () => {
    if (step === 0 && Object.keys(details).length > 0) return setChecked(true);
    if (step === 1 && timing) return setChecked(true);
    if (step < 2) return go(step + 1);
    // The list may have changed while the dialog was open.
    if (Object.keys(details).length > 0) {
      setStep(0);
      return setChecked(true);
    }
    start(async () => {
      const r = await createLottoAction(value);
      if (r.ok) {
        toast.success(r.message ?? al.title);
        setOpen(false);
        setV(EMPTY);
        setSource("");
        go(0);
      } else toast.error(r.error);
    });
  };

  const review: [string, ReactNode][] = [
    [lo.name, v.name.trim()],
    [lo.shortName, v.shortName.trim()],
    [al.slug, slug],
    [lo.groups.field, group ? labelOf(group) : "-"],
    [al.flag, v.flag ? <span className="inline-flex items-center gap-2"><Flag code={v.flag} className="size-5" />{v.flag}</span> : al.noFlag],
    [al.format, al.formats[v.format]],
    [lo.schedule, scheduleText(v.schedule, t)],
    [lo.delay, String(v.resultDelayMin)],
  ];

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden="true" />
        {al.title}
      </Button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={al.title}
        size="lg"
        footer={
          <div className="flex justify-between gap-2 pb-4">
            {step > 0 ? (
              <Button variant="secondary" disabled={pending} onClick={() => go(step - 1)}>
                {al.back}
              </Button>
            ) : (
              <span />
            )}
            <Button
              // A new element per step, and the second click of a double click is ignored.
              key={step}
              type="submit"
              form={formId}
              loading={pending}
              onClick={(e) => {
                if (e.detail > 1) e.preventDefault();
              }}
            >
              {step < 2 ? al.next : al.title}
            </Button>
          </div>
        }
      >
        <div ref={top} tabIndex={-1} className="flex flex-col gap-4 outline-none">
          <ol className="flex gap-2">
            {STEPS.map((id, i) => (
              <li key={id} aria-current={i === step ? "step" : undefined} className={cn("flex-1 border-t-4 pt-1.5 text-xs font-semibold", i <= step ? "border-brand text-ink" : "border-line text-ink-3")}>
                <span className="tnum inline-flex items-center gap-1">
                  {i < step ? <Check className="size-3.5 text-brand" aria-hidden="true" /> : `${i + 1}.`} {al.steps[id]}
                </span>
              </li>
            ))}
          </ol>
          <form
            id={formId}
            noValidate
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!pending) submit();
            }}
          >
            {step === 0 && (
              <>
                {sources.length > 0 && (
                  <Field label={al.copyFrom} htmlFor={`${formId}-copy`} hint={al.copyHint}>
                    <Select
                      id={`${formId}-copy`}
                      value={source}
                      onChange={(e) => {
                        setSource(e.target.value);
                        const from = sources.find((l) => String(l.id) === e.target.value);
                        set(copyFromLotto(from ?? EMPTY));
                      }}
                    >
                      <option value="">{al.copyNone}</option>
                      {sources.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
                <Field label={lo.name} htmlFor={`${formId}-name`} error={errorOf("name")}>
                  <Input id={`${formId}-name`} maxLength={60} aria-invalid={!!errorOf("name")} value={v.name} onChange={(e) => set({ name: e.target.value })} />
                </Field>
                <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
                  <Field label={lo.shortName} htmlFor={`${formId}-short`} error={errorOf("shortName")}>
                    <Input id={`${formId}-short`} maxLength={30} aria-invalid={!!errorOf("shortName")} value={v.shortName} onChange={(e) => set({ shortName: e.target.value })} />
                  </Field>
                  <Field label={al.slug} htmlFor={`${formId}-slug`} hint={al.slugHint} error={errorOf("slug")}>
                    <Input
                      id={`${formId}-slug`}
                      maxLength={40}
                      autoCapitalize="none"
                      spellCheck={false}
                      aria-invalid={!!errorOf("slug")}
                      value={slug}
                      // Emptying the box brings the suggestion back.
                      onChange={(e) => set({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") || null })}
                    />
                  </Field>
                </div>
                <Choices label={lo.groups.field} error={errorOf("group")}>
                  {choices.map((g) => (
                    <Choice key={g.code} name={`${formId}-group`} checked={g.code === group?.code} onChange={() => set({ group: g.code })}>
                      {labelOf(g)}
                    </Choice>
                  ))}
                </Choices>
                <Choices label={al.flag}>
                  {[null, ...FLAG_CODES].map((code) => (
                    <Choice key={code ?? ""} name={`${formId}-flag`} checked={v.flag === code} onChange={() => set({ flag: code })}>
                      {code ? (
                        <>
                          <Flag code={code} className="size-5" />
                          {code}
                        </>
                      ) : (
                        al.noFlag
                      )}
                    </Choice>
                  ))}
                </Choices>
                <Choices label={al.format} column>
                  {FORMATS.map((f) => (
                    <Choice key={f} name={`${formId}-format`} checked={v.format === f} onChange={() => set({ format: f })}>
                      <span className="flex flex-col py-1.5">
                        <span>{al.formats[f]}</span>
                        <span className="text-xs font-normal text-ink-3">{al.formatHints[f]}</span>
                      </span>
                    </Choice>
                  ))}
                </Choices>
              </>
            )}
            {step === 1 && (
              <>
                <ScheduleFields schedule={v.schedule} onChange={(schedule) => set({ schedule })} />
                <Field label={lo.delay} htmlFor={`${formId}-delay`}>
                  <Input
                    id={`${formId}-delay`}
                    inputMode="numeric"
                    value={String(v.resultDelayMin)}
                    onChange={(e) => set({ resultDelayMin: Number(e.target.value.replace(/\D/g, "")) || 0 })}
                    className="tnum max-w-40 text-right"
                  />
                </Field>
                {checked && timing && (
                  <p role="alert" className="rounded-control bg-danger-soft px-3 py-2.5 text-sm text-danger">
                    {al.errors[timing]}
                  </p>
                )}
              </>
            )}
            {step === 2 && (
              <>
                <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
                  {review.map(([label, text]) => (
                    <div key={label} className="contents">
                      <dt className="text-ink-3">{label}</dt>
                      <dd className="font-medium break-words text-ink">{text}</dd>
                    </div>
                  ))}
                </dl>
                <p className="rounded-control bg-warning-soft px-3 py-2.5 text-sm text-warning">{al.confirmNote}</p>
                <p className="text-sm text-ink-2">{al.note}</p>
              </>
            )}
          </form>
        </div>
      </Sheet>
    </>
  );
}

function Choices({ label, error, column, children }: { label: string; error?: string | null; column?: boolean; children: ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium text-ink">{label}</legend>
      <div className={cn("flex flex-wrap gap-2", column && "flex-col")}>{children}</div>
      {error && <p className="mt-1.5 text-sm text-danger">{error}</p>}
    </fieldset>
  );
}

/** A radio button drawn as a selectable chip. */
function Choice({ name, checked, onChange, children }: { name: string; checked: boolean; onChange: () => void; children: ReactNode }) {
  return (
    <label
      className={cn(
        "flex min-h-10 cursor-pointer items-center gap-2 rounded-control border px-3 text-sm font-medium",
        "has-focus-visible:outline-2 has-focus-visible:outline-brand",
        checked ? "border-brand bg-brand-soft text-brand-soft-ink" : "border-line-strong bg-surface text-ink-2 hover:border-ink-3",
      )}
    >
      <input type="radio" name={name} checked={checked} onChange={onChange} className="sr-only" />
      {children}
    </label>
  );
}
