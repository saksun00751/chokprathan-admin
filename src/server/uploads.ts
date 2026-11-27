import "server-only";
import { errorsT } from "@/i18n/server";
import { randomBytes } from "node:crypto";
import { detectImageType, IMAGE_MIME } from "@/domain/banner";
import { q1, run } from "@/server/db";
import { compressImage, type ImageProfile } from "@/server/images";
import { getFirst, gridStore, putWithFallback, removeAll, type MediaFile, type MediaKind, type MediaStore } from "@/server/media-store";
import { MEDIA_BUCKET, mongoDb } from "@/server/mongo";

/**
 * Uploaded images live in MongoDB GridFS when it is configured, otherwise (or when it is down) in
 * the MariaDB table `media`, so every app instance can serve them. Banners are public; transfer
 * slips are served only to their owner and to staff with finance permission.
 */
export type { MediaKind };

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const NAME = /^[a-z0-9-]{1,40}\.(png|jpg|webp)$/;

/** The MariaDB table: fallback for new files, and home of files saved before MongoDB. */
export const mariaMediaStore: MediaStore = {
  async put(f) {
    await run(
      "INSERT INTO media (name, kind, mime, size, bytes, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      f.name,
      f.kind,
      f.mime,
      f.bytes.length,
      f.bytes,
      f.ownerId,
      f.createdAt,
    );
  },
  async get(name) {
    const row = await q1<{ bytes: Buffer; mime: string; kind: MediaKind; owner_id: number | null; created_at: number }>(
      "SELECT bytes, mime, kind, owner_id, created_at FROM media WHERE name = ?",
      name,
    );
    return row ? { name, bytes: row.bytes, mime: row.mime, kind: row.kind, ownerId: row.owner_id, createdAt: row.created_at } : null;
  },
  async remove(name) {
    await run("DELETE FROM media WHERE name = ?", name);
  },
};

async function stores(): Promise<MediaStore[]> {
  const db = await mongoDb();
  return db ? [await gridStore(db, MEDIA_BUCKET), mariaMediaStore] : [mariaMediaStore];
}

export async function saveImage(
  bytes: Uint8Array,
  prefix: string,
  { kind = "banner", ownerId = null, profile = kind }: { kind?: MediaKind; ownerId?: number | null; profile?: ImageProfile } = {},
): Promise<{ ok: true; name: string; width: number; height: number; size: number } | { ok: false; error: string }> {
  const e = (await errorsT()).upload;
  if (bytes.length === 0) return { ok: false, error: e.empty };
  if (bytes.length > MAX_UPLOAD_BYTES) return { ok: false, error: e.tooBig };
  if (!detectImageType(bytes)) return { ok: false, error: e.type };
  const image = await compressImage(bytes, profile);
  if (!image.ok) return { ok: false, error: { corrupt: e.type, tooSmall: e.tooSmall, notSquare: e.notSquare }[image.reason] };
  const name = `${prefix.replace(/[^a-z0-9-]/g, "").slice(0, 20)}-${randomBytes(8).toString("hex")}.${image.ext}`;
  await putWithFallback(await stores(), { name, bytes: image.bytes, mime: IMAGE_MIME[image.ext], kind, ownerId, createdAt: Date.now() });
  return { ok: true, name, width: image.width, height: image.height, size: image.bytes.length };
}

type Cached = { bytes: Buffer; type: string; kind: MediaKind; ownerId: number | null };
const hot = ((globalThis as unknown as { __chokprathanMedia?: Map<string, Cached> }).__chokprathanMedia ??= new Map());
let hotBytes = 0;
const HOT_LIMIT = 32 * 1024 * 1024;

export async function readImage(name: string): Promise<Cached | null> {
  if (!NAME.test(name)) return null;
  const cached = hot.get(name);
  if (cached) return cached;
  const found: MediaFile | null = await getFirst(await stores(), name);
  if (!found) return null;
  const file: Cached = { bytes: found.bytes, type: found.mime, kind: found.kind, ownerId: found.ownerId };
  // Banner images are shown to every visitor: keep a bounded copy in memory. Slips are private and rare.
  if (file.kind === "banner") {
    while (hotBytes + file.bytes.length > HOT_LIMIT && hot.size > 0) {
      const [oldest, value] = hot.entries().next().value!;
      hot.delete(oldest);
      hotBytes -= value.bytes.length;
    }
    hot.set(name, file);
    hotBytes += file.bytes.length;
  }
  return file;
}

export async function removeImage(name: string | null | undefined) {
  if (!name || !NAME.test(name)) return;
  const cached = hot.get(name);
  if (cached) {
    hot.delete(name);
    hotBytes -= cached.bytes.length;
  }
  await removeAll(await stores(), name);
}
