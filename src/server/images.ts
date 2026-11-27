import "server-only";
import sharp from "sharp";

type Size = readonly [number, number];
interface Profile {
  /** The stored image fits inside this box. */
  box: Size;
  format: "webp" | "png";
  quality: number;
  /** Smallest accepted original. */
  min?: Size;
  square?: boolean;
}

export const IMAGE_PROFILES = {
  banner: { box: [1600, 1600], format: "webp", quality: 82 },
  slip: { box: [1600, 1600], format: "webp", quality: 85 },
  logo: { box: [640, 128], format: "webp", quality: 90, min: [1, 64] },
  icon: { box: [512, 512], format: "webp", quality: 90, min: [512, 512], square: true },
  // PNG: some chat apps show no preview for a WebP share image.
  share: { box: [1200, 630], format: "png", quality: 90, min: [600, 315] },
} as const satisfies Record<string, Profile>;

export type ImageProfile = keyof typeof IMAGE_PROFILES;

export type Compressed =
  | { ok: true; bytes: Buffer; ext: "webp" | "png"; width: number; height: number }
  | { ok: false; reason: "corrupt" | "tooSmall" | "notSquare" };

/** More pixels than this is refused before decoding (a small file can hide a huge picture). */
const MAX_PIXELS = 40_000_000;

/** Resize and re-encode an uploaded image. Metadata is dropped; the first frame of an animation is kept. */
export async function compressImage(input: Uint8Array, profile: ImageProfile): Promise<Compressed> {
  const p: Profile = IMAGE_PROFILES[profile];
  try {
    const image = sharp(input, { limitInputPixels: MAX_PIXELS });
    const meta = await image.metadata();
    // EXIF orientations 5 to 8 swap the sides.
    const turned = (meta.orientation ?? 1) >= 5;
    const width = turned ? meta.height : meta.width;
    const height = turned ? meta.width : meta.height;
    if (!width || !height) return { ok: false, reason: "corrupt" };
    if (p.square && width !== height) return { ok: false, reason: "notSquare" };
    if (p.min && (width < p.min[0] || height < p.min[1])) return { ok: false, reason: "tooSmall" };
    const resized = image.autoOrient().resize({ width: p.box[0], height: p.box[1], fit: "inside", withoutEnlargement: true });
    const encoded =
      p.format === "png"
        ? resized.png({ palette: true, quality: p.quality, compressionLevel: 9 })
        : resized.webp({ quality: p.quality, alphaQuality: 100 });
    const { data, info } = await encoded.toBuffer({ resolveWithObject: true });
    return { ok: true, bytes: data, ext: p.format, width: info.width, height: info.height };
  } catch {
    return { ok: false, reason: "corrupt" };
  }
}
