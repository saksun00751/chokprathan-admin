import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static safety net for "pages and actions authorize themselves" (no database needed).
 *
 * The proxy only checks that *some* employee session is alive; permissions are checked by the
 * code that reads or writes. This test reads the source and enforces:
 *
 * 1. The panel layout calls requireEmployeeAllowingPasswordChange( (a signed-in employee, who may
 *    still have to fix their password / 2-step on /security) or requireEmployee(.
 * 2. Every page.tsx under app/[lang]/(panel) calls requireEmployee( itself, or calls a reader from
 *    src/server/data/* whose body calls requireEmployee( / requireEmployeeAllowingPasswordChange(.
 *    Only /security and /denied may rely on the weaker requireEmployeeAllowingPasswordChange:
 *    they are exactly the pages an employee who is not yet fully set up (or lacks a permission)
 *    must still reach.
 * 3. Every exported async function in server/actions/admin.ts awaits gate( first (gate calls
 *    employeeFor(, which checks the permission), and every exported function in
 *    server/actions/account.ts awaits getEmployee() before anything other than loading messages.
 *    (server/actions/auth.ts is sign-in/out and is public by design.)
 * 4. Route handlers under the panel (the CSV export) call employeeFor(.
 *
 * "Body" means the text from `export async function name(` to the first line that is just `}`,
 * i.e. the end of a top-level function in this codebase's formatting.
 */

const SRC = join(process.cwd(), "src");
const PANEL = join(SRC, "app", "[lang]", "(panel)");
const read = (p: string) => readFileSync(p, "utf8");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/** name -> body of each `export async function` in a source file. */
function exportedAsyncFunctions(source: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = /^export async function (\w+)\s*\(/gm;
  for (let m = re.exec(source); m; m = re.exec(source)) {
    const end = source.indexOf("\n}\n", m.index);
    out.set(m[1], source.slice(m.index, end === -1 ? undefined : end + 2));
  }
  return out;
}

const STRONG = /\brequireEmployee\(/;
const WEAK = /\brequireEmployeeAllowingPasswordChange\(/;
const WEAK_PAGES = new Set(["security", "denied"]);

const readers = new Map<string, { strong: boolean; weak: boolean }>();
for (const file of walk(join(SRC, "server", "data")).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))) {
  for (const [name, body] of exportedAsyncFunctions(read(file))) readers.set(name, { strong: STRONG.test(body), weak: WEAK.test(body) });
}

const pages = walk(PANEL).filter((f) => f.endsWith("page.tsx"));
const pageName = (f: string) => relative(PANEL, f).replace(/\/?page\.tsx$/, "") || "/";

function guardOf(file: string): "strong" | "weak" | null {
  const source = read(file);
  if (STRONG.test(source)) return "strong";
  let weak = WEAK.test(source);
  for (const [name, r] of readers) {
    if (!new RegExp(`\\b${name}\\(`).test(source)) continue;
    if (r.strong) return "strong";
    weak ||= r.weak;
  }
  return weak ? "weak" : null;
}

describe("back-office route guards (static)", () => {
  it("finds the panel pages", () => {
    expect(pages.length).toBeGreaterThanOrEqual(24);
  });

  it("the panel layout requires a signed-in employee", () => {
    const layout = read(join(PANEL, "layout.tsx"));
    expect(STRONG.test(layout) || WEAK.test(layout)).toBe(true);
  });

  it.each(pages.map((f) => [pageName(f), f]))("page %s authorizes itself", (name, file) => {
    const guard = guardOf(file);
    expect(guard, `${name} calls neither requireEmployee( nor a guarded data reader`).not.toBeNull();
    if (guard === "weak") expect(WEAK_PAGES.has(name), `${name} only checks for a session, not a permission`).toBe(true);
  });

  it("every admin action passes the permission gate before anything else", () => {
    const source = read(join(SRC, "server", "actions", "admin.ts"));
    const gate = source.slice(source.indexOf("async function gate("), source.indexOf("\n}\n", source.indexOf("async function gate(")));
    expect(gate).toMatch(/\bemployeeFor\(/);
    const actions = exportedAsyncFunctions(source);
    expect(actions.size).toBeGreaterThan(30);
    const ungated = [...actions].filter(([, body]) => body.match(/await (\w+)\(/)?.[1] !== "gate").map(([name]) => name);
    expect(ungated).toEqual([]);
  });

  it("own-account actions check the session before touching data", () => {
    const actions = exportedAsyncFunctions(read(join(SRC, "server", "actions", "account.ts")));
    expect(actions.size).toBeGreaterThan(0);
    const bad = [...actions]
      .filter(([, body]) => [...body.matchAll(/await (\w+)\(/g)].map((m) => m[1]).find((n) => n !== "errorsT") !== "getEmployee")
      .map(([name]) => name);
    expect(bad).toEqual([]);
  });

  it("panel route handlers check the permission", () => {
    const routes = walk(PANEL).filter((f) => f.endsWith("route.ts"));
    expect(routes.length).toBeGreaterThan(0);
    for (const f of routes) expect(read(f), relative(SRC, f)).toMatch(/\bemployeeFor\(/);
  });
});
