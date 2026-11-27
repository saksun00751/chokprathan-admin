import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { DEFAULT_BRANDING, type Branding } from "@/domain/branding";
import { readBranding } from "@/server/services/branding";

/**
 * Branding for rendering. Cached and tagged "branding": saving calls updateTag("branding"), so this
 * instance switches at once and others within a minute. Falls back to the built-in name and images
 * when the database cannot be reached (for example during a build without database access).
 *
 * `stale` must stay at least 5 minutes: every page reads this outside Suspense, and Next.js leaves
 * shorter-lived caches out of the App Shell. It only bounds how long an open tab may reuse what it has.
 */
export async function getBranding(): Promise<Branding> {
  "use cache";
  cacheTag("branding");
  cacheLife({ stale: 300, revalidate: 60, expire: 86_400 });
  try {
    return await readBranding();
  } catch {
    return DEFAULT_BRANDING;
  }
}
