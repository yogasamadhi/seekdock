import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["e2e/runtime.integration.test.ts"],
    testTimeout: 90_000,
  },
});
