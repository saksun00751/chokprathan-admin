// src/server/services/scheduler.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { LOCK_NAME, schedulerEnabled } from "@/server/services/scheduler";

describe("scheduler config", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("uses a lock name different from the member app's", () => {
    expect(LOCK_NAME).toBe("chokprathan-admin:scheduler");
  });
  it("is off when SCHEDULER=off and on otherwise", () => {
    vi.stubEnv("SCHEDULER", "off");
    expect(schedulerEnabled()).toBe(false);
    vi.stubEnv("SCHEDULER", "on");
    expect(schedulerEnabled()).toBe(true);
    vi.stubEnv("SCHEDULER", "");
    expect(schedulerEnabled()).toBe(true);
  });
});
