import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  readSession,
  recoverSession,
  sessionKey,
  updateStoredSession,
  writeSession,
} from "@/features/trips/session-storage";
import { storePreview } from "@/features/trips/storage";
import { editSession, withProposal } from "./edit-fixtures";
let values: Map<string, string>;
beforeEach(() => {
  values = new Map();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
});
afterEach(() => vi.unstubAllGlobals());
it("migrates the legacy preview without deleting or replacing it", () => {
  const session = editSession();
  storePreview(session.versions[0].itinerary);
  expect(readSession(session.tripId)).toEqual(session);
  writeSession(session);
  expect(readSession(session.tripId)).toEqual(session);
  expect(values.has(`trip-planner:preview:v1:${session.tripId}`)).toBe(true);
});
it("round trips proposals and recovers only valid candidates", async () => {
  const session = await withProposal();
  writeSession(session);
  expect(await recoverSession(readSession(session.tripId)!)).toEqual(session);
  session.pendingProposal!.candidate.days[0].title = "Hidden edit";
  writeSession(session);
  const recovered = await recoverSession(readSession(session.tripId)!);
  expect(recovered.pendingProposal).toBeNull();
  expect(recovered.messages[0].status).toBe("stale");
  expect(recovered.versions).toEqual(session.versions);
});
it("drops malformed proposals without losing the itinerary", async () => {
  const session = await withProposal();
  values.set(
    sessionKey(session.tripId),
    JSON.stringify({ ...session, pendingProposal: { invalid: true } }),
  );
  const loaded = readSession(session.tripId)!;
  expect(loaded.pendingProposal).toBeNull();
  expect(loaded.versions).toEqual(session.versions);
  expect(loaded.messages[0].status).toBe("stale");
});
it("marks interrupted requests without replaying paid calls", async () => {
  const session = await withProposal();
  session.messages[0].status = "pending";
  expect((await recoverSession(session)).messages[0].status).toBe(
    "interrupted",
  );
});
it("leaves stored data unchanged if a write fails", async () => {
  const session = editSession();
  writeSession(session);
  const before = values.get(sessionKey(session.tripId));
  window.localStorage.setItem = () => {
    throw new Error("Quota exceeded");
  };
  await expect(
    updateStoredSession(session, (value) => ({ ...value, revision: 1 })),
  ).rejects.toThrow(/current itinerary is unchanged/);
  expect(values.get(sessionKey(session.tripId))).toBe(before);
});
it("checks current state before and after asynchronous validation", async () => {
  const session = editSession();
  writeSession(session);
  await expect(
    updateStoredSession({ ...session, revision: 1 }, (value) => value),
  ).rejects.toThrow(/another tab/);
  await expect(
    updateStoredSession(session, async (value) => {
      writeSession({ ...session, revision: 1 });
      return { ...value, revision: 2 };
    }),
  ).rejects.toThrow(/while saving/);
  expect(readSession(session.tripId)!.revision).toBe(1);
});
it("uses a cross-tab Web Lock when available", async () => {
  const request = vi.fn((_name: string, fn: () => Promise<unknown>) => fn());
  vi.stubGlobal("navigator", { locks: { request } });
  const session = editSession();
  writeSession(session);
  await updateStoredSession(session, (value) => ({ ...value, revision: 1 }));
  expect(request).toHaveBeenCalledWith(
    `trip-planner:${session.tripId}`,
    expect.any(Function),
  );
});
it("reports corrupt history without overwriting it", () => {
  const session = editSession();
  values.set(sessionKey(session.tripId), "{");
  expect(() => readSession(session.tripId)).toThrow(/No data was overwritten/);
  expect(values.get(sessionKey(session.tripId))).toBe("{");
});
