import { describe, expect, test } from "vitest";
import { ALL, canActOnRole, canGrant, mayEditRole } from "./permissions";

const owner = { isOwner: true, permissions: [ALL] };
const manager = { isOwner: false, permissions: ["dashboard.view", "members.view", "finance.view", "staff.manage"] };
const finance = { isOwner: false, permissions: ["dashboard.view", "finance.view"] };
const ownerRole = { isOwner: true, permissions: [ALL] };

describe("nobody hands out more than they hold", () => {
  test("a staff member can grant only permissions they have themselves", () => {
    expect(canGrant(manager.permissions, ["members.view", "finance.view"])).toBe(true);
    expect(canGrant(manager.permissions, [])).toBe(true);
    expect(canGrant(manager.permissions, ["members.view", "settings.manage"])).toBe(false);
  });

  test("only someone holding everything can grant everything", () => {
    expect(canGrant(manager.permissions, [ALL])).toBe(false);
    expect(canGrant(owner.permissions, [ALL])).toBe(true);
    expect(canGrant(owner.permissions, ["settings.manage", "finance.withdraw"])).toBe(true);
  });
});

describe("managing staff and roles", () => {
  test("the owner role and owner accounts are for owners only", () => {
    expect(canActOnRole(manager, ownerRole)).toBe(false);
    expect(canActOnRole(owner, ownerRole)).toBe(true);
  });

  test("a staff manager handles only people whose role they fully hold", () => {
    expect(canActOnRole(manager, finance)).toBe(true);
    expect(canActOnRole(finance, manager)).toBe(false);
    expect(canActOnRole(manager, { isOwner: false, permissions: [...manager.permissions, "settings.manage"] })).toBe(false);
  });

  test("a staff member without a role counts as holding nothing", () => {
    expect(canActOnRole(finance, { isOwner: false, permissions: [] })).toBe(true);
  });

  test("a role can be created or edited only within the editor's own permissions", () => {
    expect(mayEditRole(manager, null, ["members.view"])).toBe(true);
    expect(mayEditRole(manager, null, ["members.view", "settings.manage"])).toBe(false);
    // Raising a role, or trimming one that already outranks the editor, are both refused.
    expect(mayEditRole(manager, finance, ["finance.view", "finance.withdraw"])).toBe(false);
    expect(mayEditRole(manager, { isOwner: false, permissions: ["settings.manage"] }, ["dashboard.view"])).toBe(false);
    expect(mayEditRole(manager, finance, ["finance.view"])).toBe(true);
  });

  test("the owner role itself is never edited, even by an owner", () => {
    expect(mayEditRole(owner, ownerRole, ["dashboard.view"])).toBe(false);
    expect(mayEditRole(owner, null, ["settings.manage", "staff.manage"])).toBe(true);
  });
});

describe("a permission that no longer exists", () => {
  test("does not stop anyone managing the role that still stores it", () => {
    const actor = { isOwner: false, permissions: ["rounds.result"] };
    expect(canActOnRole(actor, { isOwner: false, permissions: ["rounds.result", "rounds.confirm"] })).toBe(true);
  });
});
