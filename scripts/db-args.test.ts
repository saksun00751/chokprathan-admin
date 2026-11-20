import { describe, expect, it } from "vitest";
import en from "@/i18n/locales/en";
import { employeePasswordProblem } from "@/server/services/employee-auth";
import { USERNAME } from "@/server/services/employees";
import { DEFAULT_OWNER_NAME, ownerInput, parseArgs } from "./db-args";

// No database: these only check the command-line parsing and create-owner's input rules.
const rules = { username: USERNAME, passwordProblem: (p: string) => employeePasswordProblem(p, en.errors) };

describe("parseArgs", () => {
  it("reads the command, options and flags", () => {
    const a = parseArgs(["create-owner", "--username", "boss", "--password", "abcdef1234", "--refresh"]);
    expect(a.cmd).toBe("create-owner");
    expect(a.opt("username")).toBe("boss");
    expect(a.opt("password")).toBe("abcdef1234");
    expect(a.opt("name")).toBeUndefined();
    expect(a.flag("refresh")).toBe(true);
    expect(a.flag("yes")).toBe(false);
  });

  it("does not take the next option as a missing value", () => {
    const a = parseArgs(["create-owner", "--username", "--password", "x"]);
    expect(a.opt("username")).toBeUndefined();
  });
});

describe("ownerInput", () => {
  it("accepts a valid owner and normalises the username", () => {
    expect(ownerInput({ username: " Boss ", password: "abcdef1234" }, rules)).toEqual({
      ok: true,
      value: { username: "boss", password: "abcdef1234", name: DEFAULT_OWNER_NAME },
    });
  });

  it("requires username and password", () => {
    expect(ownerInput({ password: "abcdef1234" }, rules)).toMatchObject({ ok: false, error: "--username is required" });
    expect(ownerInput({ username: "boss" }, rules)).toMatchObject({ ok: false, error: "--password is required" });
  });

  it("applies the employee username rule", () => {
    expect(ownerInput({ username: "1boss", password: "abcdef1234" }, rules).ok).toBe(false);
    expect(ownerInput({ username: "ab", password: "abcdef1234" }, rules).ok).toBe(false);
  });

  it("applies the employee password policy and the length cap", () => {
    expect(ownerInput({ username: "boss", password: "abc12" }, rules)).toEqual({ ok: false, error: `--password: ${en.errors.auth.staffShort}` });
    expect(ownerInput({ username: "boss", password: "abcdefghijkl" }, rules)).toEqual({ ok: false, error: `--password: ${en.errors.auth.staffMix}` });
    expect(ownerInput({ username: "boss", password: `a1${"x".repeat(63)}` }, rules).ok).toBe(false);
  });

  it("checks the display name length", () => {
    expect(ownerInput({ username: "boss", password: "abcdef1234", name: "x" }, rules).ok).toBe(false);
    expect(ownerInput({ username: "boss", password: "abcdef1234", name: "Owner" }, rules)).toMatchObject({ ok: true, value: { name: "Owner" } });
  });
});
