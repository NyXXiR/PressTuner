import assert from "node:assert/strict";
import test from "node:test";

import { configureControlledLiveDatabase } from "./runPressRagControlledLive";

test("controlled-live test mode requires an explicitly named test database", () => {
  assert.throws(
    () => configureControlledLiveDatabase({ useTestDatabase: true }),
    /TEST_DATABASE_URL_REQUIRED/,
  );
  assert.throws(
    () => configureControlledLiveDatabase({ useTestDatabase: true, testDatabaseUrl: "postgresql://db/presstuner" }),
    /TEST_DATABASE_NAME_REQUIRED/,
  );
  configureControlledLiveDatabase({
    useTestDatabase: true,
    testDatabaseUrl: "postgresql://db/presstuner_test",
  });
  assert.equal(process.env.DATABASE_URL, "postgresql://db/presstuner_test");
  configureControlledLiveDatabase({
    useTestDatabase: true,
    databaseUrl: "postgresql://db/presstuner",
  });
  assert.equal(process.env.DATABASE_URL, "postgresql://db/presstuner_test");
});
