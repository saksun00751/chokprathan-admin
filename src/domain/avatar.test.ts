import { describe, expect, test } from "vitest";
import { avatarOf, isAvatar, PORTRAITS } from "./avatar";

describe("avatars", () => {
  test("offers twenty-five distinct portraits, whose names fit the column", () => {
    expect(new Set(PORTRAITS.map((p) => p.id)).size).toBe(25);
    expect(PORTRAITS.filter((p) => p.gender === "male")).toHaveLength(12);
    expect(PORTRAITS.filter((p) => p.gender === "female")).toHaveLength(13);
    for (const p of PORTRAITS) expect(p.id.length).toBeLessThanOrEqual(16);
  });

  test("accepts only what is offered", () => {
    for (const p of PORTRAITS) expect(isAvatar(p.id)).toBe(true);
    for (const bad of ["", "A", "staff-15", "face-12", "<img>", "😀", 7, null, undefined]) expect(isAvatar(bad)).toBe(false);
  });

  test("reads anything unknown, such as an emoji saved earlier, as no avatar", () => {
    expect(avatarOf("face-3")).toBe("face-3");
    expect(avatarOf("🐼")).toBeNull();
    expect(avatarOf(undefined)).toBeNull();
  });
});
