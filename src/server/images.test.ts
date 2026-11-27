import sharp from "sharp";
import { describe, expect, test } from "vitest";
import { compressImage } from "./images";

const blank = (width: number, height: number, format: "png" | "jpeg" = "png") =>
  sharp({ create: { width, height, channels: 4, background: { r: 200, g: 30, b: 30, alpha: 0.5 } } })
    .toFormat(format)
    .toBuffer();

async function ok(input: Buffer, profile: Parameters<typeof compressImage>[1]) {
  const r = await compressImage(input, profile);
  if (!r.ok) throw new Error(r.reason);
  return { ...r, meta: await sharp(r.bytes).metadata() };
}

describe("compressImage", () => {
  test("stores a slip as WebP inside 1600×1600", async () => {
    const r = await ok(await blank(3200, 2000, "jpeg"), "slip");
    expect([r.ext, r.meta.format, r.width, r.height]).toEqual(["webp", "webp", 1600, 1000]);
  });

  test("never enlarges", async () => {
    const r = await ok(await blank(200, 100), "banner");
    expect([r.width, r.height]).toEqual([200, 100]);
  });

  test("turns a photo the way its EXIF says", async () => {
    const input = await sharp(await blank(400, 200, "jpeg")).withMetadata({ orientation: 6 }).toBuffer();
    const r = await ok(input, "slip");
    expect([r.width, r.height]).toEqual([200, 400]);
  });

  test("fits a logo in 640×128 and keeps transparency", async () => {
    const r = await ok(await blank(1280, 256), "logo");
    expect([r.width, r.height, r.meta.hasAlpha]).toEqual([640, 128, true]);
  });

  test("makes an icon 512×512", async () => {
    const r = await ok(await blank(1024, 1024), "icon");
    expect([r.ext, r.width, r.height]).toEqual(["webp", 512, 512]);
  });

  test("stores the share image as PNG inside 1200×630", async () => {
    const r = await ok(await blank(2400, 1260), "share");
    expect([r.ext, r.meta.format, r.width, r.height]).toEqual(["png", "png", 1200, 630]);
  });

  test.each([
    ["logo", 300, 40, "tooSmall"],
    ["icon", 400, 400, "tooSmall"],
    ["icon", 600, 512, "notSquare"],
    ["share", 500, 300, "tooSmall"],
  ] as const)("refuses a %s of %i×%i", async (profile, w, h, reason) => {
    expect(await compressImage(await blank(w, h), profile)).toEqual({ ok: false, reason });
  });

  test("refuses a file that only looks like an image", async () => {
    const fake = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    expect(await compressImage(fake, "banner")).toEqual({ ok: false, reason: "corrupt" });
  });
});
