import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { POST } from "@/app/api/trips/edits/propose/route";
import { EditError } from "@/features/trips/edit-schema";
import { GenerationError } from "@/lib/ai/errors";
import { editRequest } from "./edit-fixtures";
const { propose } = vi.hoisted(() => ({ propose: vi.fn() }));
vi.mock("@/lib/ai/edit-service", () => ({ proposeItineraryEdit: propose }));
let time = Date.UTC(2026, 11, 1);
const request = (body: unknown = editRequest(), headers = {}) =>
  new Request("http://localhost:3000/api/trips/edits/propose", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.useFakeTimers();
  time += 1_000_000;
  vi.setSystemTime(time);
  propose.mockReset();
  propose.mockResolvedValue({
    kind: "clarification",
    message: "Which activity?",
  });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it("returns no-store responses and blocks duplicate paid work", async () => {
  const body = editRequest();
  const result = await POST(request(body));
  expect(result.status).toBe(200);
  expect(result.headers.get("cache-control")).toBe("no-store");
  const duplicate = await POST(request(body));
  expect(duplicate.status).toBe(429);
  expect(duplicate.headers.get("retry-after")).toBe("20");
  expect(propose).toHaveBeenCalledTimes(1);
});
it("validates input, origin, content type and body size before provider calls", async () => {
  expect(
    (await POST(request({ ...editRequest(), message: "x".repeat(1001) })))
      .status,
  ).toBe(400);
  expect(
    (await POST(request(editRequest(), { Origin: "https://other.example" })))
      .status,
  ).toBe(403);
  expect(
    (await POST(request(editRequest(), { "Content-Type": "text/plain" })))
      .status,
  ).toBe(415);
  expect((await POST(request("x".repeat(128 * 1024)))).status).toBe(413);
  expect(propose).not.toHaveBeenCalled();
});
it("returns clear edit validation failures without changing the itinerary", async () => {
  propose.mockRejectedValue(
    new EditError("EMPTY_DAY", "Day 2 must keep at least one activity."),
  );
  const result = await POST(request());
  expect(result.status).toBe(422);
  expect((await result.json()).error.message).toContain(
    "at least one activity",
  );
});
it("preserves safe timeouts and hides unexpected provider details", async () => {
  propose.mockRejectedValueOnce(
    new GenerationError("GENERATION_TIMEOUT", "Try a smaller change", 504),
  );
  expect((await POST(request())).status).toBe(504);
  propose.mockRejectedValueOnce(new Error("secret credentials"));
  const result = await POST(
    request({ ...editRequest(), message: "Another request" }),
  );
  expect(result.status).toBe(500);
  expect(JSON.stringify(await result.json())).not.toContain("credentials");
});
