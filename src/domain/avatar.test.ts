import { describe, expect, test } from "vitest";
import { AVATAR_GROUPS, avatarOf, isAvatar } from "./avatar";

const all = AVATAR_GROUPS.flatMap((g) => g.emojis);

describe("avatars", () => {
  test("offers distinct emoji that fit the column", () => {
    expect(new Set(all).size).toBe(all.length);
    expect(all.length).toBeGreaterThanOrEqual(36);
    for (const e of all) expect([...e].length, e).toBeLessThanOrEqual(16);
  });

  test("accepts only what is offered", () => {
    expect(isAvatar(all[0])).toBe(true);
    for (const bad of ["", "A", "💩", "<img>", `${all[0]}${all[1]}`, 7, null, undefined]) expect(isAvatar(bad)).toBe(false);
  });

  test("reads anything unknown as no avatar", () => {
    expect(avatarOf(all[3])).toBe(all[3]);
    expect(avatarOf("x")).toBeNull();
    expect(avatarOf(undefined)).toBeNull();
  });
});
