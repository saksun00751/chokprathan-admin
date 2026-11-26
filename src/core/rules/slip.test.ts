import { describe, expect, it } from "vitest";
import { MAX_PASTE_LINES, MAX_STAKE, pairGroup, parseSlipText } from "./slip";

describe("pairGroup", () => {
  it("lists fifty two-digit numbers of each kind, ascending", () => {
    for (const kind of ["low", "high", "odd", "even"] as const) expect(pairGroup(kind)).toHaveLength(50);
    expect([pairGroup("low")[0], pairGroup("low").at(-1)]).toEqual(["00", "49"]);
    expect([pairGroup("high")[0], pairGroup("high").at(-1)]).toEqual(["50", "99"]);
    expect(pairGroup("odd").slice(0, 3)).toEqual(["01", "03", "05"]);
    expect(pairGroup("even").slice(0, 3)).toEqual(["00", "02", "04"]);
  });
});

const lines = (text: string) => parseSlipText(text).lines.map((l) => `${l.betType} ${l.number} ${l.stake}`);
const errors = (text: string) => parseSlipText(text).errors.map((e) => e.line);

describe("parseSlipText", () => {
  it("takes several numbers with a top and a bottom amount", () => {
    expect(lines("12 34, 56 = 50x20")).toEqual([
      "top2 12 50", "bottom2 12 20", "top2 34 50", "bottom2 34 20", "top2 56 50", "bottom2 56 20",
    ]);
  });
  it("reads each number length as its own bet types", () => {
    expect(lines("123=10")).toEqual(["top3 123 10"]);
    expect(lines("123=10x5")).toEqual(["top3 123 10", "tod3 123 5"]);
    expect(lines("7 = 100x50")).toEqual(["runTop 7 100", "runBottom 7 50"]);
    expect(lines("1234=1")).toEqual(["top4 1234 1"]);
  });
  it("skips the bet type whose amount is zero", () => {
    expect(lines("5 = 0x7")).toEqual(["runBottom 5 7"]);
    expect(lines("05=3x0")).toEqual(["top2 05 3"]);
  });
  it("accepts a capital or multiplication sign between the amounts, and stray spaces", () => {
    expect(lines("  12   =  5 X 6 ")).toEqual(["top2 12 5", "bottom2 12 6"]);
    expect(lines("12=5×6")).toEqual(["top2 12 5", "bottom2 12 6"]);
  });
  it("reports a bad line whole and takes nothing from it", () => {
    for (const bad of ["12 50", "=50", "12 123=5", "12345=5", "1a=5", "12=", "12=5.5", "12=-5", "12=0x0", "12=0", "1234=1x1", "12=5x6x7", "12=5=6"]) {
      expect(parseSlipText(bad), bad).toEqual({ lines: [], errors: [{ line: 1, text: bad, reason: "format" }] });
    }
  });
  it("numbers lines from one, counting blank ones, and keeps the good ones", () => {
    const text = "12=5\n\nnope\n34=6\r\n??";
    expect(lines(text)).toEqual(["top2 12 5", "top2 34 6"]);
    expect(errors(text)).toEqual([3, 5]);
  });
  it("stops at the limit, naming the line that would pass it", () => {
    const hundred = Array.from({ length: 100 }, (_, i) => String(i).padStart(2, "0")).join(" ");
    const text = `${hundred}=1x1\n${hundred}=1x1\n${hundred}=1x1\n12=1`;
    const parsed = parseSlipText(text);
    expect(MAX_PASTE_LINES).toBe(500);
    expect(parsed.lines).toHaveLength(401);
    expect(parsed.errors.map((e) => e.line)).toEqual([3]);
  });
});

describe("why a pasted line is refused", () => {
  const reasons = (text: string) => parseSlipText(text).errors.map((e) => e.reason);

  it("says a line cannot be read", () => {
    expect(reasons("abc")).toEqual(["format"]);
  });

  it("says an amount is over the largest stake, and takes nothing from that line", () => {
    expect(parseSlipText(`12 = ${MAX_STAKE}`).errors).toEqual([]);
    const r = parseSlipText(`12 = 5x${MAX_STAKE + 1}\n13 = 5`);
    expect(r.errors).toEqual([{ line: 1, text: `12 = 5x${MAX_STAKE + 1}`, reason: "amount" }]);
    expect(r.lines).toEqual([{ betType: "top2", number: "13", stake: 5 }]);
    expect(reasons("12 = 50000000")).toEqual(["amount"]);
  });

  it("says a readable line passes the limit", () => {
    const hundred = Array.from({ length: 100 }, (_, i) => String(i).padStart(2, "0")).join(" ");
    const block = `${hundred} = 1x1`;
    expect(reasons([block, block, block].join("\n"))).toEqual(["limit"]);
    expect(MAX_PASTE_LINES).toBe(500);
  });
});
