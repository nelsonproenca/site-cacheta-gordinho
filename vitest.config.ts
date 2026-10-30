import { defineConfig } from "vitest/config";

// These tests hit the real linked Supabase project (no local Postgres in
// this environment — see CLAUDE.md), so every assertion is a network
// round-trip. Generous timeouts avoid flaky failures under normal latency;
// a genuinely hanging request should still time out well before CI would.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "lib/**/*.test.ts"],
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
