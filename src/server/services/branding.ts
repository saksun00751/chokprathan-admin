import "server-only";
import { cleanBranding, type Branding } from "@/domain/branding";
import { json, q1, run, tx } from "@/server/db";

const SELECT = "SELECT `value` FROM settings WHERE `key` = 'branding'";
const parse = (row: { value: string } | undefined) => cleanBranding(json.parse<unknown>(row?.value, {}));

/** The stored branding, read now. Pages shown to visitors use the cached `getBranding()`. */
export async function readBranding(): Promise<Branding> {
  return parse(await q1<{ value: string }>(SELECT));
}

/** Change some fields. The row is locked, so saving text and saving an image never undo each other. */
export async function updateBranding(patch: Partial<Branding>, now = Date.now()): Promise<{ before: Branding; after: Branding }> {
  return tx(async () => {
    await run("INSERT IGNORE INTO settings (`key`, `value`, updated_at) VALUES ('branding', '{}', ?)", now);
    const before = parse(await q1<{ value: string }>(`${SELECT} FOR UPDATE`));
    const after = cleanBranding({ ...before, ...patch });
    await run("UPDATE settings SET `value` = ?, updated_at = ? WHERE `key` = 'branding'", json.str(after), now);
    return { before, after };
  });
}
