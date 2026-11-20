import { describe, expect, it } from "vitest";
import { isPublicPath } from "@/server/proxy-auth";

describe("isPublicPath", () => {
  it.each(["/login", "/login/", "/login/anything"])("%s is public", (p) => expect(isPublicPath(p)).toBe(true));
  it.each(["/", "/members", "/rounds/5", "/loginx", "/admin/login"])("%s needs a session", (p) => expect(isPublicPath(p)).toBe(false));
});
