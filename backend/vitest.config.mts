import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 15_000,
    hookTimeout: 20_000,
    // Tests share one Postgres database; avoid cross-file races.
    fileParallelism: false,
  },
});
