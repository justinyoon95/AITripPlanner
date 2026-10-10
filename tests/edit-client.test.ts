import { afterEach, expect, it, vi } from "vitest";
import { requestEdit } from "@/features/trips/edit-client";
import { editRequest, withProposal } from "./edit-fixtures";
afterEach(() => vi.unstubAllGlobals());
it("validates structured proposals received from the editing endpoint", async () => {
  const session = await withProposal();
  const response = {
    kind: "proposal",
    message: "Review",
    proposal: session.pendingProposal,
  };
  const fetch = vi.fn().mockResolvedValue(Response.json(response));
  vi.stubGlobal("fetch", fetch);
  expect(await requestEdit(editRequest(session))).toEqual(response);
  expect(fetch).toHaveBeenCalledWith(
    "/api/trips/edits/propose",
    expect.objectContaining({
      method: "POST",
      signal: expect.any(AbortSignal),
    }),
  );
});
it("rejects invalid input without a request", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await expect(
    requestEdit({ ...editRequest(), message: "" }),
  ).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
});
it.each(["network", "http", "invalid", "json"])(
  "reports %s errors without fallback",
  async (kind) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    if (kind === "network") fetch.mockRejectedValue(new Error("network"));
    if (kind === "http")
      fetch.mockResolvedValue(
        Response.json(
          { error: { code: "GENERATION_TIMEOUT", message: "Try again later" } },
          { status: 504 },
        ),
      );
    if (kind === "invalid")
      fetch.mockResolvedValue(Response.json({ kind: "proposal" }));
    if (kind === "json") fetch.mockResolvedValue(new Response("{"));
    await expect(requestEdit(editRequest())).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  },
);
