import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

describe("safeNext", () => {
  it("keeps back-office paths", () => {
    expect(safeNext("/members")).toBe("/members");
    expect(safeNext("/members/3?tab=wallet")).toBe("/members/3?tab=wallet");
    expect(safeNext("/")).toBe("/");
  });

  it("rejects other origins", () => {
    expect(safeNext("//evil.com")).toBe("/");
    expect(safeNext("/\\evil")).toBe("/");
    expect(safeNext("https://x")).toBe("/");
  });

  it("never returns to the sign-in page", () => {
    expect(safeNext("/login")).toBe("/");
    expect(safeNext("/login/x")).toBe("/");
    expect(safeNext("/login?next=/members")).toBe("/");
    expect(safeNext("/loginx")).toBe("/loginx");
  });

  it("defaults to the dashboard for anything that is not a string", () => {
    expect(safeNext(undefined)).toBe("/");
    expect(safeNext(null)).toBe("/");
    expect(safeNext(42)).toBe("/");
    expect(safeNext(["/members"])).toBe("/");
    expect(safeNext("")).toBe("/");
  });
});
