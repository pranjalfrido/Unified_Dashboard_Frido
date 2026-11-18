import { defineConfig } from "vitest/config";

// The CN tests start an in-memory Postgres (PGlite) per test and load every migration into
// it; with the test files running in parallel that can take well over the 5 s / 10 s defaults.
export default defineConfig({
  test: {
    include: ["src/**/*.test.js"],
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
