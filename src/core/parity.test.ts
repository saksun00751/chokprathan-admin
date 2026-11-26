import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, test } from "vitest";

/**
 * `src/core` holds the money and lottery rules, kept identical in the member app and the back office:
 * a bet is priced by one and paid by the other. Change both in the same piece of work. This compares
 * them when the other repository sits beside this one, and is skipped where it does not (a server).
 */
const here = realpathSync(process.cwd());
const other = ["../chokprathan", "../chokprathan-admin"]
  .map((p) => resolve(here, p))
  .find((p) => existsSync(join(p, "src/core")) && realpathSync(p) !== here);

const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]));
const snapshot = (repo: string) =>
  Object.fromEntries(files(join(repo, "src/core")).map((f) => [relative(join(repo, "src/core"), f), readFileSync(f, "utf8")]));

describe.skipIf(!other)("the shared rules", () => {
  test("have the same files in both apps", () => {
    expect(Object.keys(snapshot(here)).sort()).toEqual(Object.keys(snapshot(other!)).sort());
  });

  test("read the same in both apps", () => {
    const [mine, theirs] = [snapshot(here), snapshot(other!)];
    expect(Object.keys(mine).filter((f) => mine[f] !== theirs[f])).toEqual([]);
  });
});
