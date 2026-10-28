import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Database integration tests. Requires a running local Supabase (`pnpm db:start`).
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    include: ["tests/db/**/*.test.ts"],
    environment: "node",
    globalSetup: ["tests/db/setup.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
