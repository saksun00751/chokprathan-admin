import "server-only";
import { blockKey, matchesBlock, normalizeAccount, normalizeName, normalizePhone, type BlockInput, type BlockKind, type Identity } from "@/domain/blocklist";
import { q, q1, run, tolerateMissingTable, tx } from "@/server/db";
import { audit } from "./audit";
import { revokeAllMemberSessions } from "./member-sessions";

/**
 * The member blocklist (rules in src/domain/blocklist.ts). Whoever matches an active entry cannot
 * register, sign in, or withdraw, and is signed out the moment the entry is added. Until a server
 * restarts onto migration 6 nothing is blocked and nothing breaks.
 */

export interface BlockRow {
  id: number;
  kind: BlockKind;
  bank_code: string | null;
  value: string;
  display: string;
  reason: string;
  created_at: number;
  creator: string | null;
  removed_at: number | null;
  remove_reason: string | null;
  remover: string | null;
}

const SELECT = `SELECT b.id, b.kind, b.bank_code, b.value, b.display, b.reason, b.created_at, b.removed_at, b.remove_reason,
  COALESCE(c.username, c.name) AS creator, COALESCE(r.username, r.name) AS remover
  FROM blocklist b LEFT JOIN employees c ON c.id = b.created_by LEFT JOIN employees r ON r.id = b.removed_by`;

/** The lookups for one or more identities: every phone, account, and name they carry, normalized. */
function keysOf(people: Identity[]) {
  const phones = new Set<string>();
  const accounts = new Set<string>();
  const names = new Set<string>();
  for (const p of people) {
    if (p.phone) phones.add(normalizePhone(p.phone));
    if (p.bankAccount) accounts.add(normalizeAccount(p.bankAccount));
    for (const n of [p.name, p.bankName]) if (n && normalizeName(n)) names.add(normalizeName(n));
  }
  return { phones: [...phones], accounts: [...accounts], names: [...names] };
}

/** Active entries touching any of these identities (one query), still to be matched exactly. */
async function candidates(people: Identity[]): Promise<BlockRow[]> {
  const { phones, accounts, names } = keysOf(people);
  const parts: string[] = [];
  const args: string[] = [];
  const add = (kind: BlockKind, values: string[]) => {
    if (values.length === 0) return;
    parts.push(`(b.kind = '${kind}' AND b.value IN (${values.map(() => "?").join(", ")}))`);
    args.push(...values);
  };
  add("phone", phones);
  add("bank", accounts);
  add("name", names);
  if (parts.length === 0) return [];
  return tolerateMissingTable(() => q<BlockRow>(`${SELECT} WHERE b.removed_at IS NULL AND (${parts.join(" OR ")})`, ...args), []);
}

const asEntry = (b: BlockRow) => ({ kind: b.kind, bankCode: b.bank_code, value: b.value });

/** Active entries that block this person (registration, sign-in, withdrawal, the member page). */
export async function blocksFor(who: Identity): Promise<BlockRow[]> {
  return (await candidates([who])).filter((b) => matchesBlock(asEntry(b), who));
}

export const isBlocked = async (who: Identity) => (await blocksFor(who)).length > 0;

/** Of these people (id → identity), the ids that are blocked: one query for a whole queue. */
export async function blockedAmong(people: Map<number, Identity>): Promise<Set<number>> {
  const entries = await candidates([...people.values()]);
  const out = new Set<number>();
  if (entries.length === 0) return out;
  for (const [id, who] of people) if (entries.some((b) => matchesBlock(asEntry(b), who))) out.add(id);
  return out;
}

type MemberRow = { id: number; phone: string | null; bank_code: string | null; bank_account: string | null; name: string; bank_name: string | null };
const identityOf = (m: MemberRow): Identity => ({ phone: m.phone, bankCode: m.bank_code, bankAccount: m.bank_account, name: m.name, bankName: m.bank_name });
const MEMBER_COLS = "id, phone, bank_code, bank_account, name, bank_name";

/** The identity of a member account, for checks that start from a user id. */
export async function memberIdentity(userId: number): Promise<Identity | null> {
  const m = await q1<MemberRow>(`SELECT ${MEMBER_COLS} FROM users WHERE id = ? AND role = 'member'`, userId);
  return m ? identityOf(m) : null;
}

/** Members an entry blocks. Names are narrowed by surname in SQL, then compared exactly. */
async function membersMatching(entry: { kind: BlockKind; bankCode: string | null; value: string }): Promise<number[]> {
  let rows: MemberRow[];
  if (entry.kind === "phone") rows = await q<MemberRow>(`SELECT ${MEMBER_COLS} FROM users WHERE role = 'member' AND phone = ?`, entry.value);
  else if (entry.kind === "bank") rows = await q<MemberRow>(`SELECT ${MEMBER_COLS} FROM users WHERE role = 'member' AND bank_account = ?`, entry.value);
  else {
    const surname = `%${entry.value
      .split(" ")
      .at(-1)!
      .replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    rows = await q<MemberRow>(`SELECT ${MEMBER_COLS} FROM users WHERE role = 'member' AND (name LIKE ? OR bank_name LIKE ?)`, surname, surname);
  }
  return rows.filter((m) => matchesBlock(entry, identityOf(m))).map((m) => m.id);
}

export type BlockError = "bank" | "phone" | "name" | "reason" | "exists" | "notReady" | "notFound" | "nothing";
type Actor = { id: number; ip: string | null };

/**
 * Add one entry. Members it matches are signed out at once (their sessions end as "revoked").
 * Returns how many members it blocks.
 */
export async function addBlock(
  input: BlockInput,
  reason: string,
  actor: Actor,
  now = Date.now(),
): Promise<{ ok: true; id: number; members: number } | { ok: false; error: BlockError }> {
  const key = blockKey(input);
  if (!key.ok) return { ok: false, error: key.problem };
  const why = reason.trim().slice(0, 255);
  if (why.length < 3) return { ok: false, error: "reason" };
  const entry = { kind: input.kind, bankCode: key.bankCode, value: key.value };
  try {
    const id = await tx(async () => {
      const dup = await q1(
        "SELECT id FROM blocklist WHERE kind = ? AND value = ? AND bank_code <=> ? AND removed_at IS NULL FOR UPDATE",
        entry.kind,
        entry.value,
        entry.bankCode,
      );
      if (dup) return null;
      return (
        await run(
          "INSERT INTO blocklist (kind, bank_code, value, display, reason, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
          entry.kind,
          entry.bankCode,
          entry.value,
          key.display,
          why,
          actor.id,
          now,
        )
      ).lastId;
    });
    if (id === null) return { ok: false, error: "exists" };
    const members = await membersMatching(entry);
    for (const m of members) await revokeAllMemberSessions(m, "revoked", now);
    await audit(actor.id, "block.add", `block:${id}`, { kind: entry.kind, bank: entry.bankCode, value: key.display, reason: why, members }, now, actor.ip);
    return { ok: true, id, members: members.length };
  } catch (error) {
    if ((error as { errno?: number }).errno === 1146) return { ok: false, error: "notReady" };
    throw error;
  }
}

/** Lift a block; the row stays with who lifted it and why. */
export async function removeBlock(id: number, reason: string, actor: Actor, now = Date.now()): Promise<{ ok: true } | { ok: false; error: BlockError }> {
  const why = reason.trim().slice(0, 255);
  if (why.length < 3) return { ok: false, error: "reason" };
  const changed = await tolerateMissingTable(
    async () =>
      (await run("UPDATE blocklist SET removed_at = ?, removed_by = ?, remove_reason = ? WHERE id = ? AND removed_at IS NULL", now, actor.id, why, id)).changes,
    -1,
  );
  if (changed === -1) return { ok: false, error: "notReady" };
  if (changed === 0) return { ok: false, error: "notFound" };
  await audit(actor.id, "block.remove", `block:${id}`, { reason: why }, now, actor.ip);
  return { ok: true };
}

/** Block a member by their own details (from the member page): any of account, phone, and name. */
export async function blockMember(
  userId: number,
  parts: BlockKind[],
  reason: string,
  actor: Actor,
  now = Date.now(),
): Promise<{ ok: true; created: number; members: number } | { ok: false; error: BlockError }> {
  const m = await q1<MemberRow>(`SELECT ${MEMBER_COLS} FROM users WHERE id = ? AND role = 'member'`, userId);
  if (!m) return { ok: false, error: "notFound" };
  const wanted = [...new Set(parts)].filter((p): p is BlockKind => p === "bank" || p === "phone" || p === "name");
  if (wanted.length === 0) return { ok: false, error: "nothing" };
  if (reason.trim().length < 3) return { ok: false, error: "reason" };
  const name = normalizeName(m.name);
  const split = name.lastIndexOf(" ");
  let created = 0;
  let members = 0;
  for (const part of wanted) {
    const input: BlockInput =
      part === "bank"
        ? { kind: "bank", bankCode: m.bank_code, value: m.bank_account ?? "" }
        : part === "phone"
          ? { kind: "phone", value: m.phone ?? "" }
          : { kind: "name", first: split > 0 ? name.slice(0, split) : name, last: split > 0 ? name.slice(split + 1) : "" };
    const r = await addBlock(input, reason, actor, now);
    if (r.ok) {
      created++;
      members = Math.max(members, r.members);
    } else if (r.error !== "exists") return r;
  }
  return { ok: true, created, members };
}

/** The blocklist page: active entries (newest first, optionally one kind or matching a search) and recently lifted ones. */
export async function listBlocks({ kind, search }: { kind?: BlockKind; search?: string } = {}): Promise<{
  active: BlockRow[];
  removed: BlockRow[];
  ready: boolean;
}> {
  const where: string[] = [];
  const args: string[] = [];
  if (kind) {
    where.push("b.kind = ?");
    args.push(kind);
  }
  const s = (search ?? "").trim();
  if (s) {
    where.push("(b.display LIKE ? OR b.value LIKE ? OR b.reason LIKE ?)");
    const like = `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    args.push(like, like, like);
  }
  const filter = where.length ? ` AND ${where.join(" AND ")}` : "";
  try {
    const [active, removed] = await Promise.all([
      q<BlockRow>(`${SELECT} WHERE b.removed_at IS NULL${filter} ORDER BY b.id DESC LIMIT 500`, ...args),
      q<BlockRow>(`${SELECT} WHERE b.removed_at IS NOT NULL${filter} ORDER BY b.removed_at DESC LIMIT 50`, ...args),
    ]);
    return { active, removed, ready: true };
  } catch (error) {
    if ((error as { errno?: number }).errno === 1146) return { active: [], removed: [], ready: false };
    throw error;
  }
}
