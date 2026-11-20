import { describe, expect, test } from "vitest";
import { getFirst, putWithFallback, removeAll, type MediaFile, type MediaStore } from "./media-store";

const file: MediaFile = { name: "slip-ab12.png", bytes: Buffer.from([1, 2, 3]), mime: "image/png", kind: "slip", ownerId: 7, createdAt: 1 };

function memory(name: string, log: string[], { failPut = false, failGet = false } = {}): MediaStore & { files: Map<string, MediaFile> } {
  const files = new Map<string, MediaFile>();
  return {
    files,
    async put(f) {
      if (failPut) throw new Error(`${name} down`);
      files.set(f.name, f);
      log.push(`${name}:put`);
    },
    async get(n) {
      if (failGet) throw new Error(`${name} down`);
      return files.get(n) ?? null;
    },
    async remove(n) {
      files.delete(n);
      log.push(`${name}:remove`);
    },
  };
}

describe("media stores", () => {
  test("saves to the first store when it works", async () => {
    const log: string[] = [];
    const [mongo, maria] = [memory("mongo", log), memory("maria", log)];
    await putWithFallback([mongo, maria], file);
    expect(log).toEqual(["mongo:put"]);
    expect(maria.files.size).toBe(0);
  });

  test("falls back to the next store when the first one fails", async () => {
    const log: string[] = [];
    const [mongo, maria] = [memory("mongo", log, { failPut: true }), memory("maria", log)];
    await putWithFallback([mongo, maria], file);
    expect(log).toEqual(["maria:put"]);
  });

  test("throws when every store fails", async () => {
    await expect(putWithFallback([memory("a", [], { failPut: true })], file)).rejects.toThrow("a down");
  });

  test("reads from the first store that has the file and skips a broken one", async () => {
    const log: string[] = [];
    const [mongo, maria] = [memory("mongo", log, { failGet: true }), memory("maria", log)];
    maria.files.set(file.name, file);
    expect(await getFirst([mongo, maria], file.name)).toBe(file);
    expect(await getFirst([memory("x", log), memory("y", log)], "missing.png")).toBeNull();
  });

  test("removes the file from every store", async () => {
    const log: string[] = [];
    const [mongo, maria] = [memory("mongo", log), memory("maria", log)];
    await removeAll([mongo, maria], file.name);
    expect(log).toEqual(["mongo:remove", "maria:remove"]);
  });
});
