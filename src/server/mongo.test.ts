import { afterEach, expect, test } from "vitest";
import { mongoConfigured, mongoDb } from "./mongo";

const saved = process.env.MONGODB_URL;
afterEach(() => {
  if (saved === undefined) delete process.env.MONGODB_URL;
  else process.env.MONGODB_URL = saved;
});

// The real cluster is shared with other sites: tests must never reach it by accident.
test.skipIf(!!process.env.TEST_MONGODB_URL)("is off under vitest even when MONGODB_URL is set", async () => {
  process.env.MONGODB_URL = "mongodb://example.invalid:27017";
  expect(mongoConfigured()).toBe(false);
  expect(await mongoDb()).toBeNull();
});
