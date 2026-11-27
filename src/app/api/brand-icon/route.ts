import { connection } from "next/server";
import sharp from "sharp";
import { getBranding } from "@/server/branding";
import { readImage } from "@/server/uploads";

const SIZES = [180, 192, 512];

/** The uploaded icon as PNG, for browser tabs and home screens. Public. */
export async function GET(request: Request) {
  await connection();
  const asked = Number(new URL(request.url).searchParams.get("size"));
  const size = SIZES.includes(asked) ? asked : 192;
  const { icon } = await getBranding();
  const file = icon ? await readImage(icon) : null;
  if (!file) return new Response("Not found", { status: 404 });
  // Home screens paint transparent pixels black: give the large touch icon a white ground.
  const image = sharp(file.bytes).resize(size, size);
  const png = await (size === 180 ? image.flatten({ background: "#ffffff" }) : image).png().toBuffer();
  return new Response(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=300" },
  });
}
