import path from "node:path";
import { defineConfig } from "vitest/config";

// Unit tests do not open a database. The URL only lets server modules load.
const UNIT_DATABASE_URL = "postgres://unit:unit@127.0.0.1:9/unit";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    env: { DATABASE_URL: UNIT_DATABASE_URL },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "./test/stubs/server-only.ts"),
    },
  },
});
