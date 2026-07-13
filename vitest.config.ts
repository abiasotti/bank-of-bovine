import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setupEnv.ts"],
    // Integration tests share one real Postgres instance with no per-test
    // transaction rollback or schema isolation - running files in parallel
    // causes cross-file TRUNCATE deadlocks and row collisions.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
