import "server-only";
import { DEFAULT_ACTIVITIES } from "@/domain/activities";
import { DEFAULT_POINT_RULE } from "@/domain/points";
import { DEFAULT_THEME, type ThemeId } from "@/domain/themes";
import { invalidate, memo } from "@/server/cache";
import { afterCommit, json, q, run } from "@/server/db";
import {
  DEFAULT_LIMITS,
  DEFAULT_RATES,
  DEFAULT_REWARDS,
  DEFAULT_RISK,
  DEFAULT_SITE,
  DEFAULT_WALLET,
} from "@/server/catalog";

const DEFAULTS = {
  rates: DEFAULT_RATES,
  risk: DEFAULT_RISK,
  limits: DEFAULT_LIMITS,
  wallet: DEFAULT_WALLET,
  rewards: DEFAULT_REWARDS,
  site: DEFAULT_SITE,
  points: DEFAULT_POINT_RULE,
  activities: DEFAULT_ACTIVITIES,
  theme: { id: DEFAULT_THEME as ThemeId },
  install: { mode: null as "production" | "staging" | null, at: 0 },
};

export type SettingKey = keyof typeof DEFAULTS;
export type SettingValue<K extends SettingKey> = (typeof DEFAULTS)[K];
export type AllSettings = { [K in SettingKey]: SettingValue<K> };

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function merge<T>(base: T, override: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(override)) return (override ?? base) as T;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(override)) {
    out[k] = k in base ? merge((base as Record<string, unknown>)[k], v) : v;
  }
  return out as T;
}

const TTL = 5_000;

/** Every setting, stored values merged over the defaults so new fields always have a value. */
export function getSettings(): Promise<AllSettings> {
  return memo("settings", TTL, async () => {
    const rows = await q<{ key: string; value: string }>("SELECT `key`, `value` FROM settings");
    const stored = new Map(rows.map((r) => [r.key, json.parse<unknown>(r.value, undefined)]));
    const out = {} as Record<string, unknown>;
    for (const key of Object.keys(DEFAULTS) as SettingKey[]) out[key] = merge(DEFAULTS[key], stored.get(key));
    return out as AllSettings;
  });
}

export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
  return (await getSettings())[key];
}

export async function setSetting<K extends SettingKey>(key: K, value: SettingValue<K>, now = Date.now()) {
  await run(
    "INSERT INTO settings (`key`, `value`, updated_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), updated_at = VALUES(updated_at)",
    key,
    json.str(value),
    now,
  );
  invalidate("settings", "lobby", "limits:");
  afterCommit(() => invalidate("settings", "lobby", "limits:"));
}
