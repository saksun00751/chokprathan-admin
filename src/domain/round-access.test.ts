import { describe, expect, test } from "vitest";
import { roundPagePermission } from "./permissions";

describe("who may open a round's page", () => {
  test("anyone who views rounds", () => {
    expect(roundPagePermission(["rounds.view", "rounds.correct"])).toBe("rounds.view");
    expect(roundPagePermission(["*"])).toBe("rounds.view");
  });
  test("someone who only corrects results, since requests are approved on that page", () => {
    expect(roundPagePermission(["rounds.correct"])).toBe("rounds.correct");
  });
  test("nobody else", () => {
    expect(roundPagePermission(["rounds.result"])).toBe("rounds.view");
  });
});
