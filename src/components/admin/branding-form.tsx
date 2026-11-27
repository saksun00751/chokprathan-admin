"use client";

import { ImageUp, RotateCcw } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { useConfirm } from "@/components/admin/confirm";
import { LangTabs } from "@/components/admin/lang-tabs";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Card } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { BRAND_LIMITS, BRAND_PAGES, BRAND_SLOTS, cleanBrandText, type BrandPage, type BrandSlot, type BrandText, type Branding, type Text5 } from "@/domain/branding";
import { useI18n } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import type { AnyActionResult } from "@/lib/action";
import { saveBrandingAction, setBrandImageAction } from "@/server/actions/admin";
import type { BrandDefaults } from "@/server/data/branding";

const MAX_BYTES = 2 * 1024 * 1024;

function useRun() {
  const toast = useToast();
  const done = useI18n().t.admin.content.done;
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

export function BrandingForm({ branding, defaults }: { branding: Branding; defaults: Record<Locale, BrandDefaults> }) {
  return (
    <div className="flex flex-col gap-6">
      <TextSection initial={branding} defaults={defaults} />
      <ImageSection branding={branding} />
    </div>
  );
}

function TextSection({ initial, defaults }: { initial: Branding; defaults: Record<Locale, BrandDefaults> }) {
  const { t } = useI18n();
  const bd = t.admin.content.branding;
  const ask = useConfirm();
  const toast = useToast();
  const { pending, run } = useRun();
  const [lang, setLang] = useState<Locale>("th");
  const [v, setV] = useState<BrandText>(() => cleanBrandText(initial));
  const [saved, setSaved] = useState<BrandText>(() => cleanBrandText(initial));
  const base = defaults[lang];

  /** What visitors would see if this field stayed empty. */
  const fallback = (text: Text5 | undefined, builtIn: string) => (lang !== "th" && text?.th?.trim()) || builtIn;
  const set = (key: "name" | "adminName" | "tagline" | "description", value: string) => setV({ ...v, [key]: { ...v[key], [lang]: value } });
  const setPage = (page: BrandPage, key: "title" | "description", value: string) =>
    setV({ ...v, pages: { ...v.pages, [page]: { ...v.pages[page], [key]: { ...v.pages[page]?.[key], [lang]: value } } } });
  const siteName = v.name[lang]?.trim() || fallback(v.name, base.name);

  /** Changed fields as label → "before → after", for the confirmation. */
  const changed = () => {
    const next = cleanBrandText(v);
    const rows: [string, string][] = [];
    const add = (label: string, a: Text5 | undefined, b: Text5 | undefined) => {
      for (const l of Object.keys({ ...a, ...b }) as Locale[]) {
        if ((a?.[l] ?? "") !== (b?.[l] ?? "")) rows.push([`${label} · ${l}`, `${a?.[l] || "-"} → ${b?.[l] || "-"}`]);
      }
    };
    add(bd.name, saved.name, next.name);
    add(bd.adminName, saved.adminName, next.adminName);
    add(bd.tagline, saved.tagline, next.tagline);
    add(bd.siteDescription, saved.description, next.description);
    for (const p of BRAND_PAGES) {
      add(`${bd.pageNames[p]} · ${bd.pageTitle}`, saved.pages[p]?.title, next.pages[p]?.title);
      add(`${bd.pageNames[p]} · ${bd.pageDescription}`, saved.pages[p]?.description, next.pages[p]?.description);
    }
    if (saved.hideName !== next.hideName) rows.push([bd.hideName, next.hideName ? t.common.on : t.common.off]);
    return { next, rows };
  };

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const { next, rows } = changed();
        if (rows.length === 0) return toast.info(t.admin.shell.confirm.noChanges);
        const answer = await ask({ title: bd.confirm, details: rows });
        if (!answer.ok) return;
        run(
          () => saveBrandingAction(next),
          () => {
            setSaved(next);
            setV(next);
          },
        );
      }}
    >
      <Card className="flex flex-col gap-4 p-5">
        <h2 className="font-semibold">{bd.texts}</h2>
        <LangTabs value={lang} onChange={setLang} label={t.admin.content.langTabs} />
        {lang !== "th" && <p className="text-xs text-ink-3">{bd.langHint}</p>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={bd.name} htmlFor="brand-name">
            <Input id="brand-name" maxLength={BRAND_LIMITS.name} value={v.name[lang] ?? ""} placeholder={fallback(v.name, base.name)} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label={bd.adminName} htmlFor="brand-admin-name">
            <Input
              id="brand-admin-name"
              maxLength={BRAND_LIMITS.adminName}
              value={v.adminName[lang] ?? ""}
              placeholder={(lang !== "th" && v.adminName.th?.trim()) || siteName}
              onChange={(e) => set("adminName", e.target.value)}
            />
          </Field>
        </div>
        <Field label={bd.tagline} htmlFor="brand-tagline">
          <Input id="brand-tagline" maxLength={BRAND_LIMITS.tagline} value={v.tagline[lang] ?? ""} placeholder={fallback(v.tagline, base.tagline)} onChange={(e) => set("tagline", e.target.value)} />
        </Field>
        <Field label={bd.siteDescription} htmlFor="brand-description">
          <Textarea
            id="brand-description"
            maxLength={BRAND_LIMITS.description}
            value={v.description[lang] ?? ""}
            placeholder={fallback(v.description, base.description)}
            onChange={(e) => set("description", e.target.value)}
          />
        </Field>

        <h3 className="mt-2 text-sm font-semibold">{bd.pages}</h3>
        {BRAND_PAGES.map((p) => (
          <details key={p} className="rounded-control border border-line px-3">
            <summary className="cursor-pointer py-2.5 text-sm font-medium">{bd.pageNames[p]}</summary>
            <div className="flex flex-col gap-3 pb-3">
              <Field label={bd.pageTitle} htmlFor={`brand-${p}-title`}>
                <Input
                  id={`brand-${p}-title`}
                  maxLength={BRAND_LIMITS.pageTitle}
                  value={v.pages[p]?.title?.[lang] ?? ""}
                  placeholder={fallback(v.pages[p]?.title, base.pages[p].title)}
                  onChange={(e) => setPage(p, "title", e.target.value)}
                />
              </Field>
              <Field label={bd.pageDescription} htmlFor={`brand-${p}-description`}>
                <Textarea
                  id={`brand-${p}-description`}
                  maxLength={BRAND_LIMITS.pageDescription}
                  value={v.pages[p]?.description?.[lang] ?? ""}
                  placeholder={fallback(v.pages[p]?.description, base.pages[p].description) || v.description[lang]?.trim() || fallback(v.description, base.description)}
                  onChange={(e) => setPage(p, "description", e.target.value)}
                />
              </Field>
            </div>
          </details>
        ))}

        <label className="inline-flex min-h-8 items-start gap-2 text-sm">
          <input type="checkbox" checked={v.hideName} onChange={(e) => setV({ ...v, hideName: e.target.checked })} className="mt-1 size-4 shrink-0 accent-[var(--color-brand)]" />
          <span>{bd.hideName}</span>
        </label>
        <Button type="submit" loading={pending} className="self-start">
          {bd.save}
        </Button>
      </Card>
    </form>
  );
}

function ImageSection({ branding }: { branding: Branding }) {
  const bd = useI18n().t.admin.content.branding;
  return (
    <Card className="p-5">
      <h2 className="font-semibold">{bd.images}</h2>
      <p className="mt-1 text-xs text-ink-3">{bd.fileRule}</p>
      <ul className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {BRAND_SLOTS.map((slot) => (
          <ImageSlot key={slot} slot={slot} file={branding[slot]} />
        ))}
      </ul>
    </Card>
  );
}

function ImageSlot({ slot, file }: { slot: BrandSlot; file: string | null }) {
  const bd = useI18n().t.admin.content.branding;
  const ask = useConfirm();
  const toast = useToast();
  const { pending, run } = useRun();
  const input = useRef<HTMLInputElement>(null);
  return (
    <li className="flex flex-col gap-3 rounded-control border border-line p-4">
      <div>
        <p className="text-sm font-semibold">{bd.slots[slot]}</p>
        <p className="text-xs text-ink-3">{bd.hints[slot]}</p>
      </div>
      <div className={`grid h-28 place-items-center rounded-control p-3 ${slot === "adminLogo" ? "bg-ink text-on-deep-2" : "bg-panel text-ink-3"}`}>
        {file ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/media/${file}`} alt={bd.slots[slot]} className="max-h-full max-w-full object-contain" />
        ) : (
          <span className="text-xs">{slot === "share" ? bd.noImage : bd.builtIn}</span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" loading={pending} onClick={() => input.current?.click()}>
          <ImageUp className="size-4" aria-hidden="true" />
          {bd.upload}
        </Button>
        {file && (
          <Button
            variant="dangerGhost"
            size="sm"
            disabled={pending}
            onClick={async () => {
              const answer = await ask({ title: bd.resetConfirm, tone: "danger", confirmLabel: bd.reset });
              if (answer.ok) run(() => setBrandImageAction(slot, null));
            }}
          >
            <RotateCcw className="size-4" aria-hidden="true" />
            {bd.reset}
          </Button>
        )}
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          aria-label={bd.slots[slot]}
          onChange={(e) => {
            const picked = e.target.files?.[0];
            e.target.value = "";
            if (!picked) return;
            // Larger files would exceed the server action body limit and fail without a message.
            if (picked.size > MAX_BYTES) return toast.error(bd.tooBig);
            const form = new FormData();
            form.set("image", picked);
            run(() => setBrandImageAction(slot, form));
          }}
        />
      </div>
    </li>
  );
}
