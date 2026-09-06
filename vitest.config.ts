import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "src/**/__tests__/**/*.test.ts"],
    globals: false,
    environment: "node",
    // Fixture tests (tests/fixtures.test.ts) spawn child processes via execSync
    // which can be slow on CI. Give them a generous per-test timeout.
    testTimeout: 120_000,
  },
});
