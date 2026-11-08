import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      /*
       * `server-only` is a marker package Next.js understands and a plain Node
       * test runner does not. Aliasing it to an empty module lets the server
       * modules (KYC vision, mailer, Firestore) be unit-tested in Node, which is
       * the only way the provider failover and parsing rules get exercised
       * without a deployment.
       */
      "server-only": fileURLToPath(new URL("./tests/support/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    reporters: "default",
  },
});
