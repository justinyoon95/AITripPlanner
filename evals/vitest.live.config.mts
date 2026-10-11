import { defineConfig } from "vitest/config";
import base from "../vitest.config.mts";
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ["evals/live.eval.ts"],
    testTimeout: 21_600_000,
    fileParallelism: false,
  },
});
