import { expect, test } from "vitest";
import { base32Decode, base32Encode, matchTotp, stepOf, totpAt } from "./totp";

// RFC 6238 appendix B, SHA-1, secret "12345678901234567890" (last 6 of the 8-digit values)
const SECRET = base32Encode(Buffer.from("12345678901234567890"));

test("base32 round-trips and matches the RFC secret", () => {
  expect(SECRET).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  expect(base32Decode(SECRET).toString()).toBe("12345678901234567890");
});

test.each([
  [59, "287082"],
  [1111111109, "081804"],
  [1234567890, "005924"],
  [2000000000, "279037"],
])("code at %is is %s", (seconds, code) => {
  expect(totpAt(SECRET, stepOf(seconds * 1000))).toBe(code);
});

test("accepts one step of drift and refuses replays and garbage", () => {
  const now = 1_234_567_890_000;
  const step = stepOf(now);
  expect(matchTotp(SECRET, totpAt(SECRET, step - 1), now)).toBe(step - 1);
  expect(matchTotp(SECRET, totpAt(SECRET, step + 1), now)).toBe(step + 1);
  expect(matchTotp(SECRET, totpAt(SECRET, step - 2), now)).toBeNull();
  expect(matchTotp(SECRET, totpAt(SECRET, step), now, step)).toBeNull();
  expect(matchTotp(SECRET, "12a456", now)).toBeNull();
});
