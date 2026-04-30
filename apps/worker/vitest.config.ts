import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        miniflare: {
          compatibilityDate: "2026-03-17",
          compatibilityFlags: ["nodejs_compat"],
        },
      },
    },
  },
});
