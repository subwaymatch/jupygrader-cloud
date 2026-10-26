import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests for pure modules. Runs in Node without the Cloudflare runtime.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      "cloudflare:workers": fileURLToPath(new URL("./test/cloudflare-workers-stub.ts", import.meta.url)),
    },
  },
  test: { include: ["test/**/*.test.ts"], environment: "node" },
});
