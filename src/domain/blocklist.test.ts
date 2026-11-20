import { describe, expect, test } from "vitest";
import { blockKey, matchesBlock, normalizeName, normalizePhone } from "./blocklist";

describe("comparing identities the way people actually type them", () => {
  test("names ignore titles, spacing and letter case, but never cut into a real first name", () => {
    expect(normalizeName("  นาย สมชาย   ใจดี ")).toBe("สมชาย ใจดี");
    expect(normalizeName("น.ส.สมหญิง รักดี")).toBe("สมหญิง รักดี");
    expect(normalizeName("นางสาว สมหญิง รักดี")).toBe("สมหญิง รักดี");
    expect(normalizeName("Mr. John  SMITH")).toBe("john smith");
    expect(normalizeName("นางฟ้า ใจงาม")).toBe("นางฟ้า ใจงาม");
    expect(normalizeName("นายิกา สุขใจ")).toBe("นายิกา สุขใจ");
  });

  test("phone numbers become 10 local digits whatever the formatting", () => {
    expect(normalizePhone("081-234-5678")).toBe("0812345678");
    expect(normalizePhone("+66 81 234 5678")).toBe("0812345678");
    expect(normalizePhone("66812345678")).toBe("0812345678");
  });
});

describe("a new block entry", () => {
  test("a bank account needs its digits; the bank is optional and blank means any bank", () => {
    expect(blockKey({ kind: "bank", bankCode: "kbank", value: "123-4-56789-0" })).toEqual({
      ok: true,
      bankCode: "kbank",
      value: "1234567890",
      display: "1234567890",
    });
    expect(blockKey({ kind: "bank", bankCode: null, value: "1234567890" })).toMatchObject({ ok: true, bankCode: null });
    expect(blockKey({ kind: "bank", bankCode: "kbank", value: "12-34" })).toEqual({ ok: false, problem: "bank" });
  });

  test("a phone must be a Thai mobile or landline number", () => {
    expect(blockKey({ kind: "phone", value: "+66 81 234 5678" })).toEqual({ ok: true, bankCode: null, value: "0812345678", display: "0812345678" });
    expect(blockKey({ kind: "phone", value: "12345" })).toEqual({ ok: false, problem: "phone" });
  });

  test("a name needs both a first name and a surname", () => {
    expect(blockKey({ kind: "name", first: "นาย สมชาย", last: "ใจดี" })).toEqual({ ok: true, bankCode: null, value: "สมชาย ใจดี", display: "สมชาย ใจดี" });
    expect(blockKey({ kind: "name", first: "สมชาย", last: " " })).toEqual({ ok: false, problem: "name" });
  });
});

describe("who an entry blocks", () => {
  const member = { phone: "0812345678", bankCode: "kbank", bankAccount: "1234567890", name: "สมชาย ใจดี", bankName: "นาย สมชาย ใจดี" };

  test("an account blocked at one bank, or at any bank", () => {
    expect(matchesBlock({ kind: "bank", bankCode: "kbank", value: "1234567890" }, member)).toBe(true);
    expect(matchesBlock({ kind: "bank", bankCode: null, value: "1234567890" }, member)).toBe(true);
    expect(matchesBlock({ kind: "bank", bankCode: "scb", value: "1234567890" }, member)).toBe(false);
  });

  test("a phone, and a name on either the account or the bank book", () => {
    expect(matchesBlock({ kind: "phone", bankCode: null, value: "0812345678" }, member)).toBe(true);
    expect(matchesBlock({ kind: "name", bankCode: null, value: "สมชาย ใจดี" }, { ...member, name: "ชื่อเล่น" })).toBe(true);
    expect(matchesBlock({ kind: "name", bankCode: null, value: "สมศรี ใจดี" }, member)).toBe(false);
  });
});
