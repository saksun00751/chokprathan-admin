import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import mysql, { type Pool, type PoolConnection, type ResultSetHeader } from "mysql2/promise";

/**
 * MariaDB access. Every query goes through q / q1 / run, which use the current transaction's
 * connection when called inside tx() and the shared pool otherwise.
 *
 * Money is integer satang in BIGINT columns. mysql2 returns BIGINT and DECIMAL (SUM) as numbers
 * (decimalNumbers + supportBigNumbers), which is exact far beyond any balance this system holds.
 */

export type SqlValue = string | number | bigint | boolean | null | Date | Buffer | Uint8Array;
export type SqlParam = SqlValue | readonly SqlValue[];

type Store = { pool?: Pool; url?: string };
const store = ((globalThis as unknown as { __chokprathanDb?: Store }).__chokprathanDb ??= {});
/** The connection the current async call chain is pinned to, and whether a transaction is open on it. */
const context = new AsyncLocalStorage<{ conn: PoolConnection; inTx: boolean; hooks?: (() => void)[] }>();

/** Session settings applied to every new connection before it runs anything else. */
const SESSION_SQL = [
  "SET SESSION sql_mode = 'STRICT_ALL_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ZERO_DATE,NO_ZERO_IN_DATE,NO_ENGINE_SUBSTITUTION', SESSION innodb_lock_wait_timeout = 10, SESSION time_zone = '+07:00'",
  "SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED",
];

function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and fill in the MariaDB connection.");
  return url;
}

export function pool(): Pool {
  const url = databaseUrl();
  if (store.pool && store.url === url) return store.pool;
  const ssl = process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: process.env.DATABASE_SSL_INSECURE !== "true" } : undefined;
  const created = mysql.createPool({
    uri: url,
    charset: "UTF8MB4_UNICODE_CI",
    connectionLimit: Number(process.env.DATABASE_POOL_SIZE ?? 20),
    maxIdle: Number(process.env.DATABASE_POOL_SIZE ?? 20),
    idleTimeout: 60_000, // below the server's wait_timeout so the pool closes idle links first
    queueLimit: 0,
    waitForConnections: true,
    enableKeepAlive: true,
    connectTimeout: 10_000,
    decimalNumbers: true,
    supportBigNumbers: true,
    bigNumberStrings: false,
    stringifyObjects: true, // never expand an object into `key = value` SQL
    multipleStatements: false,
    flags: ["-LOCAL_FILES"],
    timezone: "+07:00",
    ssl,
  });
  created.on("connection", (conn) => {
    const core = conn as unknown as { query: (sql: string, cb: (err: Error | null) => void) => void };
    for (const sql of SESSION_SQL) {
      core.query(sql, (err) => {
        if (err) console.error("[db] session setup failed", err.message);
      });
    }
  });
  if (store.pool) void store.pool.end().catch(() => {});
  store.pool = created;
  store.url = url;
  return created;
}

export async function closePool() {
  const p = store.pool;
  store.pool = undefined;
  store.url = undefined;
  if (p) await p.end();
}

function checkParams(params: readonly unknown[]): SqlParam[] {
  for (const p of params) {
    if (p === undefined) throw new TypeError("SQL parameter is undefined");
    if (Array.isArray(p)) {
      if (p.length === 0) throw new TypeError("SQL list parameter is empty");
      for (const v of p) if (v === undefined || (typeof v === "object" && v !== null && !(v instanceof Date) && !(v instanceof Uint8Array))) throw new TypeError("SQL list parameter must hold scalars");
    } else if (typeof p === "object" && p !== null && !(p instanceof Date) && !(p instanceof Uint8Array)) {
      throw new TypeError("SQL parameter must be a scalar");
    }
  }
  return params as SqlParam[];
}

const LOST = new Set(["PROTOCOL_CONNECTION_LOST", "ECONNRESET", "EPIPE", "ETIMEDOUT"]);

async function exec(sql: string, params: readonly unknown[], { retryLost = false } = {}) {
  const values = checkParams(params);
  const tx = context.getStore();
  if (tx) return tx.conn.query(sql, values);
  try {
    return await pool().query(sql, values);
  } catch (error) {
    if (retryLost && LOST.has((error as { code?: string }).code ?? "")) return pool().query(sql, values);
    throw error;
  }
}

const plain = <T,>(row: unknown): T => ({ ...(row as object) }) as T;

/** All rows. */
export async function q<T>(sql: string, ...params: unknown[]): Promise<T[]> {
  const [rows] = await exec(sql, params, { retryLost: true });
  return (rows as unknown[]).map((r) => plain<T>(r));
}

/** First row or undefined. */
export async function q1<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
  const [rows] = await exec(sql, params, { retryLost: true });
  const first = (rows as unknown[])[0];
  return first === undefined ? undefined : plain<T>(first);
}

/** Write; returns matched rows and the inserted id. */
export async function run(sql: string, ...params: unknown[]): Promise<{ changes: number; lastId: number }> {
  const [result] = await exec(sql, params);
  const r = result as ResultSetHeader;
  return { changes: r.affectedRows, lastId: Number(r.insertId) };
}

/** Insert many rows with one statement per `chunk` rows. */
export async function insertMany(table: string, columns: readonly string[], rows: readonly SqlValue[][], chunk = 500) {
  if (!/^[a-z_]+$/.test(table) || columns.some((c) => !/^[a-z_0-9]+$/.test(c))) throw new Error("bad identifier");
  const tuple = `(${columns.map(() => "?").join(", ")})`;
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    await run(`INSERT INTO ${table} (${columns.join(", ")}) VALUES ${part.map(() => tuple).join(", ")}`, ...part.flat());
  }
}

export const inTx = () => context.getStore()?.inTx === true;

/**
 * Run fn, answering `fallback` when the table it uses does not exist yet. For tables a newer
 * migration adds: a server keeps running the old schema until it restarts and migrates, and the
 * feature behind the table must not take the rest down with it until then.
 */
export async function tolerateMissingTable<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if ((error as { errno?: number }).errno === 1146) return fallback;
    throw error;
  }
}

const RETRYABLE = new Set([1213, 1205]); // deadlock, lock wait timeout
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function runTx<T>(conn: PoolConnection, fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: unknown; broken: boolean }> {
  try {
    await conn.query("START TRANSACTION");
    const hooks: (() => void)[] = [];
    const value = await context.run({ conn, inTx: true, hooks }, fn);
    await conn.query("COMMIT");
    for (const hook of hooks) {
      try {
        hook();
      } catch (error) {
        console.error("[db] after-commit hook failed", error);
      }
    }
    return { ok: true, value };
  } catch (error) {
    let broken = false;
    try {
      await conn.query("ROLLBACK");
    } catch {
      broken = true;
    }
    return { ok: false, error, broken };
  }
}

/**
 * Run fn inside one transaction (READ COMMITTED). Nested calls join the outer transaction.
 * Deadlocks and lock wait timeouts roll back and retry the whole function up to 3 more times,
 * so fn must not have side effects outside the database.
 */
export async function tx<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = context.getStore();
  if (ctx?.inTx) return fn();
  for (let attempt = 1; ; attempt++) {
    const conn = ctx?.conn ?? (await pool().getConnection());
    const r = await runTx(conn, fn);
    if (!ctx) {
      if (r.ok || !r.broken) conn.release();
      else conn.destroy();
    }
    if (r.ok) return r.value;
    const errno = (r.error as { errno?: number }).errno ?? 0;
    if (!RETRYABLE.has(errno) || attempt >= 4) throw r.error;
    await sleep(15 * attempt + Math.floor(Math.random() * 40));
  }
}

/** Run fn once the current transaction commits (immediately when there is none). */
export function afterCommit(fn: () => void) {
  const hooks = context.getStore()?.hooks;
  if (hooks) hooks.push(fn);
  else fn();
}

/** Run fn with every query on one connection (session settings such as FOREIGN_KEY_CHECKS stick). */
export async function pinned<T>(fn: () => Promise<T>): Promise<T> {
  if (context.getStore()) return fn();
  const conn = await pool().getConnection();
  try {
    return await context.run({ conn, inTx: false }, fn);
  } finally {
    conn.release();
  }
}

/** Run fn outside any transaction context (timers started from a request must not inherit it). */
export const outsideTx = <T,>(fn: () => T): T => context.exit(fn);

/** A named server-wide lock held on one dedicated connection for the duration of fn. */
export async function withLock<T>(name: string, fn: () => Promise<T>, waitSeconds = 0): Promise<{ ran: true; value: T } | { ran: false }> {
  const conn = await pool().getConnection();
  try {
    const [rows] = await conn.query("SELECT GET_LOCK(?, ?) AS got", [name, waitSeconds]);
    if ((rows as { got: number | null }[])[0]?.got !== 1) return { ran: false };
    try {
      return { ran: true, value: await context.exit(fn) };
    } finally {
      await conn.query("SELECT RELEASE_LOCK(?)", [name]).catch(() => {});
    }
  } finally {
    conn.release();
  }
}

export const json = {
  parse<T>(value: unknown, fallback: T): T {
    if (typeof value !== "string" || value === "") return fallback;
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  },
  str(value: unknown): string {
    return JSON.stringify(value);
  },
};
