import { describe, expect, test } from "vitest";
import { staffDeleteProblem } from "./staff-delete";

describe("deleting a staff account", () => {
  test("an owner may delete someone else", () => {
    expect(staffDeleteProblem({ id: 1, isOwner: true }, 2)).toBeNull();
  });

  test("nobody but an owner may delete", () => {
    expect(staffDeleteProblem({ id: 1, isOwner: false }, 2)).toBe("ownerOnly");
  });

  test("an owner may not delete their own account", () => {
    expect(staffDeleteProblem({ id: 1, isOwner: true }, 1)).toBe("self");
  });
});
