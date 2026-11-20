import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { DEFAULT_THEME, isThemeId, type ThemeId } from "@/domain/themes";
import { json, q1 } from "@/server/db";

/**
 * The site's colour theme. Cached and tagged "theme": saving a new theme calls updateTag("theme"),
 * so this instance switches at once and others within a minute. Falls back to the default theme
 * when the database cannot be reached (for example during a build without database access).
 */
export async function getThemeId(): Promise<ThemeId> {
  "use cache";
  cacheTag("theme");
  cacheLife({ stale: 60, revalidate: 60, expire: 86_400 });
  try {
    const row = await q1<{ value: string }>("SELECT `value` FROM settings WHERE `key` = 'theme'");
    const id = json.parse<{ id?: string }>(row?.value, {}).id;
    return isThemeId(id) ? id : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}
