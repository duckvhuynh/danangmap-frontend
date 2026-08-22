import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    exclude: ["e2e/**", "e2e-live/**", "e2e-real/**", "node_modules/**"],
    coverage: { reporter: ["text", "html"] },
  },
});
