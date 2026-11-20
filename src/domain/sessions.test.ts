import { expect, test } from "vitest";
import { endedParam } from "./sessions";

test("a sign-in page explains only the session endings it knows", () => {
  expect(endedParam("replaced")).toBe("replaced");
  expect(endedParam("idle")).toBe("idle");
  expect(endedParam(["revoked", "idle"])).toBe("revoked");
  expect(endedParam("expired")).toBe("expired");
  expect(endedParam("<script>")).toBeNull();
  expect(endedParam(undefined)).toBeNull();
  expect(endedParam(3)).toBeNull();
});
