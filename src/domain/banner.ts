/** Banner helpers shared by the slider and the admin editor. */

export type Span = { text: string; hl: boolean };

/** "ฝากแรกรับโบนัส [20%]" → plain + highlighted spans. Brackets mark the gold part. */
export function parseHighlight(title: string): Span[] {
  const spans: Span[] = [];
  const re = /\[([^\]]+)\]/g;
  let last = 0;
  for (let m = re.exec(title); m; m = re.exec(title)) {
    if (m.index > last) spans.push({ text: title.slice(last, m.index), hl: false });
    spans.push({ text: m[1], hl: true });
    last = m.index + m[0].length;
  }
  if (last < title.length) spans.push({ text: title.slice(last), hl: false });
  return spans;
}

/** Only site paths and https links may be used as banner targets. */
export function safeHref(href: string): string | null {
  const h = href.trim();
  if (h.startsWith("/") && !h.startsWith("//")) return h;
  if (/^https:\/\/[^\s/$.?#][^\s]*$/i.test(h)) return h;
  return null;
}

/** Identify an uploaded image by its first bytes. SVG and anything else is refused. */
export function detectImageType(bytes: Uint8Array): "png" | "jpg" | "webp" | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (bytes.length >= 12) {
    const tag = (from: number) => String.fromCharCode(...bytes.slice(from, from + 4));
    if (tag(0) === "RIFF" && tag(8) === "WEBP") return "webp";
  }
  return null;
}

export const IMAGE_MIME = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" } as const;
