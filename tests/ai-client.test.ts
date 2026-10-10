import { expect, it, vi } from "vitest";
import { createOpenAIClient } from "@/lib/ai/client";
const { Constructor } = vi.hoisted(() => ({
  Constructor: vi.fn(function () {}),
}));
vi.mock("openai", () => ({ default: Constructor }));
it("sets SDK timeout and disables automatic paid retries", () => {
  createOpenAIClient("not-a-real-key");
  expect(Constructor).toHaveBeenCalledWith({
    apiKey: "not-a-real-key",
    timeout: 90000,
    maxRetries: 0,
  });
});
