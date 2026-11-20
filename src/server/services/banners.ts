import "server-only";
import { errorsT } from "@/i18n/server";
import { ART_KEYS, type ArtKey } from "@/components/art/keys";
import { safeHref } from "@/domain/banner";
import { invalidate, memo } from "@/server/cache";
import { afterCommit, json, q, q1, run, tx } from "@/server/db";
import type { BannerText } from "@/server/db/content-i18n";
import { removeImage } from "@/server/uploads";
import { audit } from "./audit";

export const TONES = ["violet", "gold", "red", "night"] as const;
export type Tone = (typeof TONES)[number];

export interface Banner {
  id: number;
  tag: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  ctaHref: string;
  art: ArtKey;
  tone: Tone;
  image: string | null;
  showText: boolean;
  active: boolean;
  sort: number;
  /** Other languages; missing fields fall back to the Thai text. */
  i18n: Partial<Record<"en" | "lo" | "my" | "km", Partial<BannerText>>>;
}

interface Row {
  id: number;
  tag: string;
  title: string;
  subtitle: string;
  cta_label: string;
  cta_href: string;
  art: string;
  tone: Tone;
  image: string | null;
  show_text: number;
  active: number;
  sort: number;
  i18n: string | null;
}

const toBanner = (r: Row): Banner => ({
  id: r.id,
  tag: r.tag,
  title: r.title,
  subtitle: r.subtitle,
  ctaLabel: r.cta_label,
  ctaHref: r.cta_href,
  art: (ART_KEYS as readonly string[]).includes(r.art) ? (r.art as ArtKey) : "gift",
  tone: r.tone,
  image: r.image,
  showText: r.show_text === 1,
  active: r.active === 1,
  sort: r.sort,
  i18n: json.parse(r.i18n, {}),
});

const changed = () => {
  invalidate("banners");
  afterCommit(() => invalidate("banners"));
};

export async function listBanners({ activeOnly = false } = {}): Promise<Banner[]> {
  if (activeOnly) return memo("banners:active", 10_000, async () => (await q<Row>("SELECT * FROM banners WHERE active = 1 ORDER BY sort, id")).map(toBanner));
  return (await q<Row>("SELECT * FROM banners ORDER BY sort, id")).map(toBanner);
}

export interface BannerInput {
  tag: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  ctaHref: string;
  art: string;
  tone: string;
  showText: boolean;
  active: boolean;
  i18n?: Banner["i18n"];
}

const LANGS = ["en", "lo", "my", "km"] as const;
/** Keep only known languages and fields, trimmed to the same limits as the Thai text. */
export function cleanBannerI18n(input: unknown): Banner["i18n"] {
  const out: Banner["i18n"] = {};
  if (typeof input !== "object" || input === null) return out;
  for (const lang of LANGS) {
    const v = (input as Record<string, unknown>)[lang];
    if (typeof v !== "object" || v === null) continue;
    const f = v as Record<string, unknown>;
    const text = (k: string, max: number) => (typeof f[k] === "string" ? (f[k] as string).trim().slice(0, max) : "");
    const entry = { tag: text("tag", 24), title: text("title", 80), subtitle: text("subtitle", 140), ctaLabel: text("ctaLabel", 30) };
    if (Object.values(entry).some(Boolean)) out[lang] = entry;
  }
  return out;
}

export async function saveBanner(id: number | null, input: BannerInput, actorId: number): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  const e = (await errorsT()).banners;
  const title = input.title.trim();
  if (title.length < 2 || title.length > 80) return { ok: false, error: e.title };
  const href = safeHref(input.ctaHref || "/");
  if (!href) return { ok: false, error: e.href };
  if (!(ART_KEYS as readonly string[]).includes(input.art)) return { ok: false, error: e.art };
  if (!(TONES as readonly string[]).includes(input.tone)) return { ok: false, error: e.tone };
  const values = [
    input.tag.trim().slice(0, 24),
    title,
    input.subtitle.trim().slice(0, 140),
    input.ctaLabel.trim().slice(0, 30),
    href.slice(0, 255),
    input.art,
    input.tone,
    input.showText ? 1 : 0,
    input.active ? 1 : 0,
    json.str(cleanBannerI18n(input.i18n)),
  ] as const;
  let bannerId = id;
  if (id === null) {
    const max = (await q1<{ m: number | null }>("SELECT MAX(sort) AS m FROM banners"))!.m ?? 0;
    bannerId = (
      await run(
        `INSERT INTO banners (tag, title, subtitle, cta_label, cta_href, art, tone, show_text, active, i18n, sort, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ...values,
        max + 1,
        Date.now(),
      )
    ).lastId;
  } else if (
    !(await q1("SELECT 1 FROM banners WHERE id = ?", id))
  ) {
    return { ok: false, error: e.notFound };
  } else {
    await run(
      "UPDATE banners SET tag = ?, title = ?, subtitle = ?, cta_label = ?, cta_href = ?, art = ?, tone = ?, show_text = ?, active = ?, i18n = ? WHERE id = ?",
      ...values,
      id,
    );
  }
  await audit(actorId, id === null ? "banner.create" : "banner.update", `banner:${bannerId}`, { title });
  changed();
  return { ok: true, id: bannerId! };
}

export async function setBannerImage(id: number, image: string | null, actorId: number) {
  const old = await q1<{ image: string | null }>("SELECT image FROM banners WHERE id = ?", id);
  if (!old) return false;
  await run("UPDATE banners SET image = ? WHERE id = ?", image, id);
  if (old.image && old.image !== image) await removeImage(old.image);
  await audit(actorId, image ? "banner.image" : "banner.image.clear", `banner:${id}`);
  changed();
  return true;
}

export async function moveBanner(id: number, dir: -1 | 1, actorId: number) {
  await tx(async () => {
    const list = await listBanners();
    const i = list.findIndex((b) => b.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    for (const [k, b] of list.entries()) await run("UPDATE banners SET sort = ? WHERE id = ?", k + 1, b.id);
    await audit(actorId, "banner.move", `banner:${id}`, { dir });
  });
  changed();
}

export async function deleteBanner(id: number, actorId: number) {
  const old = await q1<{ image: string | null }>("SELECT image FROM banners WHERE id = ?", id);
  await run("DELETE FROM banners WHERE id = ?", id);
  await removeImage(old?.image);
  await audit(actorId, "banner.delete", `banner:${id}`);
  changed();
}
