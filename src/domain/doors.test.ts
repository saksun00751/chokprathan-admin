import { expect, test } from "vitest";
import { doorAccepts, staffNext } from "./doors";

test("the customer page signs in members only and the console signs in staff only", () => {
  expect(doorAccepts("member", "member")).toBe(true);
  expect(doorAccepts("member", "staff")).toBe(false);
  expect(doorAccepts("staff", "staff")).toBe(true);
  expect(doorAccepts("staff", "member")).toBe(false);
});

test("after the console sign-in only back-office pages are allowed as the next page", () => {
  expect(staffNext("/admin/members/3")).toBe("/admin/members/3");
  expect(staffNext("/admin?period=7d")).toBe("/admin?period=7d");
  expect(staffNext("/admin")).toBe("/admin");
  for (const bad of ["/wallet", "//evil.example", "/administrator", "https://evil.example/admin", "/admin\\..\\x", "", undefined, 42, "/admin/login", "/admin/login?x=1", "/admin/login/"]) {
    expect(staffNext(bad)).toBe("/admin");
  }
});
