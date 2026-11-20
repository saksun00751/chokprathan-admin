import type { Db } from "mongodb";

/**
 * Where uploaded images live, in order of preference: MongoDB GridFS first, then the MariaDB
 * `media` table (the fallback when MongoDB is down, and where images from before the switch stay
 * until `npm run db -- media-to-mongo` moves them).
 */
export type MediaKind = "banner" | "slip";

export interface MediaFile {
  name: string;
  bytes: Buffer;
  mime: string;
  kind: MediaKind;
  ownerId: number | null;
  createdAt: number;
}

export interface MediaStore {
  put(file: MediaFile): Promise<void>;
  get(name: string): Promise<MediaFile | null>;
  remove(name: string): Promise<void>;
}

/** Save to the first store that accepts the file; the last store's error surfaces if none does. */
export async function putWithFallback(stores: MediaStore[], file: MediaFile): Promise<void> {
  let last: unknown = new Error("no media store");
  for (const store of stores) {
    try {
      await store.put(file);
      return;
    } catch (error) {
      last = error;
    }
  }
  throw last;
}

/** The first store that has the file wins; a store that fails to answer is skipped. */
export async function getFirst(stores: MediaStore[], name: string): Promise<MediaFile | null> {
  for (const store of stores) {
    try {
      const file = await store.get(name);
      if (file) return file;
    } catch {
      // try the next store
    }
  }
  return null;
}

/** A file may exist in more than one store (fallback writes, half-finished moves): remove it everywhere. */
export async function removeAll(stores: MediaStore[], name: string): Promise<void> {
  for (const store of stores) await store.remove(name);
}

/** GridFS bucket in the app database. */
export async function gridStore(db: Db, bucketName: string): Promise<MediaStore> {
  const { GridFSBucket } = await import("mongodb");
  const bucket = new GridFSBucket(db, { bucketName });
  return {
    async put(f) {
      await new Promise<void>((resolve, reject) => {
        const upload = bucket.openUploadStream(f.name, { metadata: { kind: f.kind, ownerId: f.ownerId, mime: f.mime, createdAt: f.createdAt } });
        upload.once("finish", () => resolve());
        upload.once("error", reject);
        upload.end(f.bytes);
      });
    },
    async get(name) {
      const doc = await bucket.find({ filename: name }).sort({ uploadDate: -1 }).limit(1).next();
      if (!doc) return null;
      const chunks: Buffer[] = [];
      for await (const chunk of bucket.openDownloadStream(doc._id)) chunks.push(chunk as Buffer);
      const meta = (doc.metadata ?? {}) as { kind?: MediaKind; ownerId?: number | null; mime?: string; createdAt?: number };
      return {
        name,
        bytes: Buffer.concat(chunks),
        mime: meta.mime ?? "application/octet-stream",
        kind: meta.kind ?? "banner",
        ownerId: meta.ownerId ?? null,
        createdAt: meta.createdAt ?? doc.uploadDate.getTime(),
      };
    },
    async remove(name) {
      for await (const doc of bucket.find({ filename: name })) await bucket.delete(doc._id);
    },
  };
}
