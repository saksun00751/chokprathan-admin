import "server-only";
import { MongoClient, type Db } from "mongodb";

/**
 * MongoDB holds what does not need MariaDB's transactions: uploaded images (GridFS), summary
 * statistics for the dashboard and reports, and sign-in / referral-click logs. Money never lives
 * here. Every caller treats `null` (not configured, or unreachable) as "use the MariaDB path".
 *
 * The production cluster is shared with other sites, so this module only ever opens the app's own
 * database (`MONGODB_DB`) and never runs commands above it.
 */
export const COLL = {
  statsDays: "stats_days",
  statsUserDays: "stats_user_days",
  statsRounds: "stats_rounds",
  statsMeta: "stats_meta",
  authLog: "auth_log",
  auditLog: "audit_log",
  refClicks: "ref_clicks",
} as const;

export const MEDIA_BUCKET = "media";

/** After a failed connection, requests use MariaDB for this long before trying again. */
const RETRY_AFTER_MS = 30_000;
const DAY_SECONDS = 86_400;

type State = { db?: Db; client?: MongoClient; connecting?: Promise<Db | null>; failedAt?: number; version?: string };
const state = ((globalThis as unknown as { __chokprathanMongo?: State }).__chokprathanMongo ??= {});

function settings(): { url: string; name: string } | null {
  // Under vitest only an explicit test URL counts, so a test can never reach the shared cluster.
  const url = process.env.VITEST ? process.env.TEST_MONGODB_URL : process.env.MONGODB_URL;
  if (!url) return null;
  const name = process.env.VITEST ? process.env.TEST_MONGODB_DB || "chokprathan_test" : process.env.MONGODB_DB || "chokprathan";
  return { url, name };
}

export const mongoConfigured = () => settings() !== null;

const redact = (message: string) => message.replace(/(mongodb(?:\+srv)?:\/\/)[^@\s]+@/g, "$1***@");

/** The app database, or null when MongoDB is not configured or not reachable right now. */
export async function mongoDb(): Promise<Db | null> {
  if (state.db) return state.db;
  const s = settings();
  if (!s) return null;
  if (state.failedAt && Date.now() - state.failedAt < RETRY_AFTER_MS) return null;
  state.connecting ??= (async () => {
    const client = new MongoClient(s.url, { appName: "chokprathan", serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000, maxPoolSize: 20 });
    try {
      await client.connect();
      state.client = client;
      state.db = client.db(s.name);
      state.failedAt = undefined;
      return state.db;
    } catch (error) {
      state.failedAt = Date.now();
      console.error("[mongo] connect failed:", redact(error instanceof Error ? error.message : String(error)));
      await client.close().catch(() => {});
      return null;
    } finally {
      state.connecting = undefined;
    }
  })();
  return state.connecting;
}

/** Idempotent; runs at server start next to the MariaDB migration. GridFS makes its own indexes. */
export async function ensureMongoIndexes(log: (line: string) => void = () => {}) {
  const db = await mongoDb();
  if (!db) return;
  await Promise.all([
    db.collection(COLL.statsUserDays).createIndexes([{ key: { d: 1 } }, { key: { u: 1, d: 1 } }]),
    db.collection(COLL.statsRounds).createIndex({ closesAt: 1 }),
    db.collection(COLL.authLog).createIndexes([
      { key: { at: -1 } },
      { key: { userId: 1, at: -1 } },
      { key: { atDate: 1 }, expireAfterSeconds: 400 * DAY_SECONDS },
    ]),
    db.collection(COLL.refClicks).createIndex({ userId: 1 }),
    db.collection(COLL.auditLog).createIndex({ seq: 1 }, { unique: true }),
  ]);
  log(`mongo: indexes ready in ${db.databaseName}`);
}

export type MongoHealth = { state: "off" } | { state: "down" } | { state: "up"; ms: number; version: string };

export async function mongoPing(): Promise<MongoHealth> {
  if (!mongoConfigured()) return { state: "off" };
  const db = await mongoDb();
  if (!db) return { state: "down" };
  try {
    const t0 = performance.now();
    await db.command({ ping: 1 });
    const ms = Math.round(performance.now() - t0);
    state.version ??= String((await db.command({ buildInfo: 1 })).version ?? "");
    return { state: "up", ms, version: state.version };
  } catch {
    return { state: "down" };
  }
}

/** For command-line scripts, so the process can exit. */
export async function closeMongo() {
  const client = state.client;
  state.client = undefined;
  state.db = undefined;
  await client?.close();
}
