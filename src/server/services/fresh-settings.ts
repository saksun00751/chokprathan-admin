import "server-only";
import { invalidate } from "@/server/cache";

/**
 * Drop this process's cached lotteries and settings before prices are written from them. Saves on
 * another process do not reach this cache, and a stale entry is answered once however old it is.
 */
export const freshSettings = () => invalidate("lottos", "settings");
