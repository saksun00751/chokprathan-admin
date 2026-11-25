import "server-only";
import { randomBytes } from "node:crypto";
import { isBuiltinGroup, withBuiltins, type LottoGroupInfo } from "@/domain/lotto-groups";
import { invalidate, memo } from "@/server/cache";
import { afterCommit, json, q, q1, run, tolerateMissingTable, tx } from "@/server/db";

type Row = { code: string; name: string; i18n: string; art: string; sort: number };

export type GroupInput = Pick<LottoGroupInfo, "name" | "i18n" | "art">;

/** Straight from the database. The built-ins alone until member migration 10 has created the table. */
async function readGroups(): Promise<LottoGroupInfo[]> {
  const rows = await tolerateMissingTable(() => q<Row>("SELECT code, name, i18n, art, sort FROM lotto_groups"), []);
  return withBuiltins(rows.map((r) => ({ ...r, i18n: json.parse<LottoGroupInfo["i18n"]>(r.i18n, {}) })));
}

export const listGroups = () => memo("lotto-groups", 5_000, readGroups);

function changed() {
  invalidate("lotto-groups");
  afterCommit(() => invalidate("lotto-groups"));
}

const COLUMNS = "(code, name, i18n, art, sort, updated_at) VALUES (?, ?, ?, ?, ?, ?)";

const upsert = (g: LottoGroupInfo, now: number) =>
  run(
    `INSERT INTO lotto_groups ${COLUMNS} ON DUPLICATE KEY UPDATE name = VALUES(name), i18n = VALUES(i18n), art = VALUES(art), sort = VALUES(sort), updated_at = VALUES(updated_at)`,
    g.code,
    g.name,
    json.str(g.i18n),
    g.art,
    g.sort,
    now,
  );

export async function createGroup(input: GroupInput, now = Date.now()): Promise<string> {
  const code = `g${randomBytes(4).toString("hex")}`;
  const sort = Math.max(...(await readGroups()).map((g) => g.sort)) + 10;
  await run(`INSERT INTO lotto_groups ${COLUMNS}`, code, input.name, json.str(input.i18n), input.art, sort, now);
  changed();
  return code;
}

export async function updateGroup(code: string, input: GroupInput, now = Date.now()): Promise<boolean> {
  const current = (await readGroups()).find((g) => g.code === code);
  if (!current) return false;
  await upsert({ ...current, ...input }, now);
  changed();
  return true;
}

export async function deleteGroup(code: string): Promise<"ok" | "builtin" | "used" | "missing"> {
  if (isBuiltinGroup(code)) return "builtin";
  const result = await tx(async () => {
    if (!(await q1("SELECT code FROM lotto_groups WHERE code = ? FOR UPDATE", code))) return "missing" as const;
    if (await q1("SELECT id FROM lottos WHERE grp = ? LIMIT 1", code)) return "used" as const;
    await run("DELETE FROM lotto_groups WHERE code = ?", code);
    return "ok" as const;
  });
  if (result === "ok") changed();
  return result;
}

/** Swap a group with its neighbour (-1 up, 1 down) and renumber, so equal sort values cannot stick. */
export async function moveGroup(code: string, step: -1 | 1, now = Date.now()): Promise<boolean> {
  const moved = await tx(async () => {
    const groups = await readGroups();
    const from = groups.findIndex((g) => g.code === code);
    const to = from + step;
    if (from < 0 || to < 0 || to >= groups.length) return false;
    [groups[from], groups[to]] = [groups[to], groups[from]];
    for (const [i, g] of groups.entries()) await upsert({ ...g, sort: (i + 1) * 10 }, now);
    return true;
  });
  if (moved) changed();
  return moved;
}
