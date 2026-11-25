import { describe, expect, it } from "vitest";
import { mayAutoResult } from "./auto-result";

describe("mayAutoResult", () => {
  it("allows only house-run games", () => {
    expect(mayAutoResult("yiki")).toBe(true);
    for (const g of ["thai", "foreign", "stock"] as const) expect(mayAutoResult(g)).toBe(false);
  });
});
