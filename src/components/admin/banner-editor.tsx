"use client";

import { ArrowDown, ArrowUp, ImagePlus, Pencil, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { ART_KEYS, BannerArt, type ArtKey } from "@/components/art/scenes";
import { LangTabs } from "@/components/admin/lang-tabs";
import { Badge } from "@/components/ui/primitives";
import { useConfirm } from "@/components/admin/confirm";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { parseHighlight } from "@/domain/banner";
import { useI18n } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { fmt } from "@/i18n/format";
import { cn } from "@/lib/cn";
import { deleteBannerAction, moveBannerAction, saveBannerAction } from "@/server/actions/admin";
import type { Banner, Tone } from "@/server/services/banners";

const TONE_BG: Record<Tone, string> = {
  violet: "radial-gradient(110% 120% at 88% 40%, var(--slide-glow) 0%, transparent 58%), linear-gradient(118deg, var(--slide-from), var(--slide-to))",
  gold: "radial-gradient(110% 120% at 88% 45%, oklch(0.74 0.15 76 / 0.6) 0%, transparent 56%), linear-gradient(118deg, var(--slide-alt-from), var(--slide-alt-to))",
  red: "radial-gradient(110% 120% at 88% 45%, oklch(0.6 0.21 26 / 0.7) 0%, transparent 56%), linear-gradient(118deg, var(--slide-alt-from), var(--slide-alt-to))",
  night:
    "radial-gradient(110% 120% at 88% 40%, oklch(0.55 0.15 250 / 0.65) 0%, transparent 58%), linear-gradient(118deg, oklch(0.27 0.1 280), oklch(0.15 0.06 280))",
};
const LINKS = [
  "/register",
  "/promotions",
  "/wallet/deposit",
  "/cashback",
  "/affiliate",
  "/lotto",
  "/lotto?group=thai",
  "/lotto?group=yiki",
  "/results",
  "/vouchers",
];

type Draft = Omit<Banner, "id" | "sort"> & { imagePreview: string | null };

export function BannerPreview({ draft, className }: { draft: Draft; className?: string }) {
  const { t } = useI18n();
  const bn = t.admin.content.banners;
  const showText = !draft.imagePreview || draft.showText;
  return (
    <div className={cn("relative aspect-[2.2/1] w-full overflow-hidden rounded-card text-white", className)} style={{ background: TONE_BG[draft.tone] }}>
      {draft.imagePreview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={draft.imagePreview} alt="" className="absolute inset-0 size-full object-cover" />
      ) : (
        <div className="absolute top-[6%] right-[2%] bottom-[10%] w-[42%]">
          <BannerArt art={draft.art} label={t.common.brand} />
        </div>
      )}
      {draft.imagePreview && showText && (
        <div className="absolute inset-0 bg-[linear-gradient(90deg,oklch(0.18_0.07_284/0.88)_0%,oklch(0.18_0.07_284/0.5)_50%,transparent_80%)]" />
      )}
      {showText && (
        <div className="relative flex h-full max-w-[60%] flex-col justify-center gap-1 p-4">
          {draft.tag && <span className="self-start rounded-full bg-gold px-2 py-0.5 text-[10px] font-semibold text-ink">{draft.tag}</span>}
          <p className="text-lg leading-tight font-semibold">
            {parseHighlight(draft.title || bn.placeholderTitle).map((s, i) => (
              <span key={i} className={s.hl ? "text-gold" : undefined}>
                {s.text}
              </span>
            ))}
          </p>
          {draft.subtitle && <p className="line-clamp-2 text-[11px] text-on-deep-2">{draft.subtitle}</p>}
          {draft.ctaLabel && <span className="mt-1 self-start rounded-[8px] bg-gold px-2.5 py-1 text-[11px] font-semibold text-ink">{draft.ctaLabel}</span>}
        </div>
      )}
    </div>
  );
}

export function BannerRow({ banner, first, last }: { banner: Banner; first: boolean; last: boolean }) {
  const { t } = useI18n();
  const ct = t.admin.content;
  const bn = ct.banners;
  const ask = useConfirm();
  const toast = useToast();
  const [pending, start] = useTransition();
  const act = (fn: () => ReturnType<typeof moveBannerAction>) =>
    start(async () => {
      const r = await fn();
      if (r.ok) toast.success(r.message ?? ct.done);
      else toast.error(r.error);
    });
  return (
    <li className="flex flex-col gap-3 rounded-card border border-line bg-surface p-3 shadow-card sm:flex-row sm:items-center">
      <BannerPreview draft={{ ...banner, imagePreview: banner.image ? `/media/${banner.image}` : null }} className="sm:w-72" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{banner.title.replace(/[[\]]/g, "")}</p>
        <p className="truncate text-sm text-ink-3">
          {fmt(bn.link, { href: banner.ctaHref })} · {banner.image ? bn.uploaded : bn.art[banner.art]}
        </p>
        <div className="mt-1.5">{banner.active ? <Badge tone="success">{bn.shown}</Badge> : <Badge tone="outline">{bn.hidden}</Badge>}</div>
      </div>
      <div className="flex items-center gap-1">
        <Button size="iconSm" variant="ghost" disabled={first || pending} onClick={() => act(() => moveBannerAction(banner.id, -1))} aria-label={bn.up}>
          <ArrowUp className="size-4" aria-hidden="true" />
        </Button>
        <Button size="iconSm" variant="ghost" disabled={last || pending} onClick={() => act(() => moveBannerAction(banner.id, 1))} aria-label={bn.down}>
          <ArrowDown className="size-4" aria-hidden="true" />
        </Button>
        <BannerEditor banner={banner} />
        <Button
          size="iconSm"
          variant="dangerGhost"
          disabled={pending}
          onClick={async () => {
            const answer = await ask({
              title: t.admin.shell.confirm.deleteBanner,
              tone: "danger",
              details: [[bn.placeholderTitle, banner.title.replace(/[[\]]/g, "")]],
              confirmLabel: bn.delete,
            });
            if (answer.ok) act(() => deleteBannerAction(banner.id));
          }}
          aria-label={bn.delete}
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </li>
  );
}

type TextKey = "tag" | "title" | "subtitle" | "ctaLabel";

export function BannerEditor({ banner }: { banner: Banner | null }) {
  const ct = useI18n().t.admin.content;
  const bn = ct.banners;
  const toast = useToast();
  const [lang, setLang] = useState<Locale>("th");
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const fromProps = (): Draft => ({
    tag: banner?.tag ?? "",
    title: banner?.title ?? "",
    subtitle: banner?.subtitle ?? "",
    ctaLabel: banner?.ctaLabel ?? bn.defaultCta,
    ctaHref: banner?.ctaHref ?? "/promotions",
    art: banner?.art ?? "gift",
    tone: banner?.tone ?? "violet",
    image: banner?.image ?? null,
    showText: banner?.showText ?? true,
    active: banner?.active ?? true,
    imagePreview: banner?.image ? `/media/${banner.image}` : null,
    i18n: structuredClone(banner?.i18n ?? {}),
  });
  const initial = fromProps();
  const [d, setD] = useState<Draft>(initial);
  const [file, setFile] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const box = "h-10 w-full rounded-control border border-line-strong bg-surface px-3";
  /** Thai edits the main text; other languages edit their translation, shown over the Thai text in the preview. */
  const textOf = (k: TextKey) => (lang === "th" ? d[k] : (d.i18n[lang]?.[k] ?? ""));
  const setText = (k: TextKey, value: string) =>
    setD(lang === "th" ? { ...d, [k]: value } : { ...d, i18n: { ...d.i18n, [lang]: { ...d.i18n[lang], [k]: value } } });
  const shown: Draft =
    lang === "th"
      ? d
      : {
          ...d,
          tag: textOf("tag") || d.tag,
          title: textOf("title") || d.title,
          subtitle: textOf("subtitle") || d.subtitle,
          ctaLabel: textOf("ctaLabel") || d.ctaLabel,
        };
  const openEditor = () => {
    setLang("th");
    setD(fromProps());
    setFile(null);
    setRemoveImage(false);
    setError(null);
    setOpen(true);
  };

  return (
    <>
      {banner ? (
        <Button size="iconSm" variant="ghost" onClick={openEditor} aria-label={bn.edit}>
          <Pencil className="size-4" aria-hidden="true" />
        </Button>
      ) : (
        <Button onClick={openEditor}>
          <ImagePlus className="size-4" aria-hidden="true" />
          {bn.add}
        </Button>
      )}
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={banner ? bn.edit : bn.add}
        size="lg"
        footer={
          <div className="flex items-center gap-3">
            {error && <p className="min-w-0 flex-1 text-sm text-danger">{error}</p>}
            <Button
              size="lg"
              className="ml-auto"
              loading={pending}
              onClick={() =>
                start(async () => {
                  const fd = new FormData();
                  for (const k of ["tag", "title", "subtitle", "ctaLabel", "ctaHref", "art", "tone"] as const) fd.set(k, String(d[k]));
                  if (d.showText) fd.set("showText", "on");
                  if (d.active) fd.set("active", "on");
                  if (file) fd.set("image", file);
                  if (removeImage) fd.set("removeImage", "on");
                  fd.set("i18n", JSON.stringify(d.i18n));
                  const r = await saveBannerAction(banner?.id ?? null, fd);
                  if (!r.ok) return setError(r.error);
                  setError(null);
                  toast.success(r.message ?? bn.saved);
                  setOpen(false);
                })
              }
            >
              {bn.save}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <BannerPreview draft={shown} />
          <LangTabs value={lang} onChange={setLang} label={ct.langTabs} />
          {lang !== "th" && <p className="-mt-2 text-xs text-ink-3">{ct.langHint}</p>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_2fr]">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs text-ink-3">{bn.tag}</span>
              <input
                value={textOf("tag")}
                maxLength={24}
                onChange={(e) => setText("tag", e.target.value)}
                placeholder={lang === "th" ? bn.tagPlaceholder : d.tag}
                className={box}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs text-ink-3">{bn.headline}</span>
              <input
                value={textOf("title")}
                maxLength={80}
                onChange={(e) => setText("title", e.target.value)}
                placeholder={lang === "th" ? bn.headlinePlaceholder : d.title}
                className={box}
              />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-ink-3">{bn.subtitle}</span>
            <input
              value={textOf("subtitle")}
              maxLength={140}
              onChange={(e) => setText("subtitle", e.target.value)}
              placeholder={lang === "th" ? undefined : d.subtitle}
              className={box}
            />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs text-ink-3">{bn.cta}</span>
              <input
                value={textOf("ctaLabel")}
                maxLength={30}
                onChange={(e) => setText("ctaLabel", e.target.value)}
                placeholder={lang === "th" ? undefined : d.ctaLabel}
                className={box}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs text-ink-3">{bn.href}</span>
              <input value={d.ctaHref} list="banner-links" onChange={(e) => setD({ ...d, ctaHref: e.target.value })} className={box} />
              <datalist id="banner-links">
                {LINKS.map((l) => (
                  <option key={l} value={l} />
                ))}
              </datalist>
            </label>
          </div>

          <fieldset>
            <legend className="mb-1.5 text-xs text-ink-3">{bn.illustration}</legend>
            <div className="grid grid-cols-4 gap-2">
              {ART_KEYS.map((key: ArtKey) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={d.art === key}
                  onClick={() => setD({ ...d, art: key })}
                  className={cn("relative aspect-square overflow-hidden rounded-control border-2", d.art === key ? "border-brand" : "border-transparent")}
                  style={{ background: TONE_BG[d.tone] }}
                  title={bn.art[key]}
                >
                  <span className="absolute inset-[8%]">
                    <BannerArt art={key} />
                  </span>
                  <span className="sr-only">{bn.art[key]}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-1.5 text-xs text-ink-3">{bn.tone}</legend>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(TONE_BG) as Tone[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={d.tone === t}
                  onClick={() => setD({ ...d, tone: t })}
                  className={cn("flex h-9 items-center gap-2 rounded-full border-2 pr-3 pl-1 text-sm", d.tone === t ? "border-brand" : "border-line")}
                >
                  <span className="size-6 rounded-full" style={{ background: TONE_BG[t] }} />
                  {bn.tones[t]}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="rounded-control bg-panel p-3 text-sm">
            <p className="font-medium">{bn.ownImage}</p>
            <p className="text-xs text-ink-3">{bn.imageHint}</p>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="mt-2 block w-full text-sm file:mr-3 file:rounded-[8px] file:border-0 file:bg-surface file:px-3 file:py-2 file:font-semibold"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                setRemoveImage(false);
                setD({ ...d, imagePreview: f ? URL.createObjectURL(f) : initial.imagePreview });
              }}
            />
            {(d.imagePreview || file || removeImage) && (
              <div className="mt-2 flex flex-wrap gap-4">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={d.showText}
                    onChange={(e) => setD({ ...d, showText: e.target.checked })}
                    className="size-4 accent-[var(--color-brand)]"
                  />
                  {bn.showText}
                </label>
                {banner?.image && !file && (
                  <label className="inline-flex items-center gap-2 text-danger">
                    <input
                      type="checkbox"
                      checked={removeImage}
                      onChange={(e) => {
                        setRemoveImage(e.target.checked);
                        setD({ ...d, imagePreview: e.target.checked ? null : initial.imagePreview });
                      }}
                      className="size-4"
                    />
                    {bn.removeImage}
                  </label>
                )}
              </div>
            )}
          </div>

          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={d.active}
              onChange={(e) => setD({ ...d, active: e.target.checked })}
              className="size-4 accent-[var(--color-brand)]"
            />
            {bn.active}
          </label>
        </div>
      </Sheet>
    </>
  );
}
