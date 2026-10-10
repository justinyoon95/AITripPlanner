import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import {
  acceptProposal,
  activeVersion,
  restoreVersion,
  undoVersion,
  validateProposal,
} from "@/features/trips/versioning";
import { itineraryFingerprint } from "@/features/trips/fingerprint";
import { editSession, withProposal } from "./edit-fixtures";

it("accepts immutable snapshots with deterministic summaries and timestamps, then undoes and restores", async () => {
  const proposed = await withProposal();
  const original = structuredClone(proposed);
  proposed.pendingProposal!.summary = "Untrusted assistant summary";
  const accepted = await acceptProposal(
    proposed,
    proposed.pendingProposal!.id,
    new Date("2026-10-10T12:00:00Z"),
  );
  expect(accepted.versions).toHaveLength(2);
  expect(accepted.versions[0]).toEqual(original.versions[0]);
  expect(activeVersion(accepted).summary).toContain("Day 2: removed");
  expect(activeVersion(accepted).createdAt).toBe("2026-10-10T12:00:00.000Z");
  expect(accepted.messages[0].status).toBe("accepted");
  const undone = undoVersion(accepted);
  expect(activeVersion(undone).itinerary).toEqual(
    original.versions[0].itinerary,
  );
  expect(undone.versions).toEqual(accepted.versions);
  expect(restoreVersion(undone, accepted.activeVersionId).activeVersionId).toBe(
    accepted.activeVersionId,
  );
});
it("branches new edits from a restored version without losing existing history", async () => {
  const initial = await withProposal();
  const accepted = await acceptProposal(initial, initial.pendingProposal!.id);
  const undone = undoVersion(accepted);
  const next = await withProposal(undone);
  const result = await acceptProposal(next, next.pendingProposal!.id);
  expect(result.versions).toHaveLength(3);
  expect(result.versions[2].parentVersionId).toBe(undone.activeVersionId);
  expect(result.versions[1]).toEqual(accepted.versions[1]);
});
it.each(["revision", "version", "fingerprint", "candidate", "scope"])(
  "rejects stale or tampered %s",
  async (kind) => {
    const session = await withProposal();
    const proposal = structuredClone(session.pendingProposal!);
    if (kind === "revision") proposal.baseRevision++;
    if (kind === "version") proposal.baseVersionId = randomUUID();
    if (kind === "fingerprint") proposal.baseFingerprint = "0".repeat(64);
    if (kind === "candidate")
      proposal.candidate.days[0].title = "Hidden unrelated change";
    if (kind === "scope")
      proposal.scope = {
        dayId: session.versions[0].itinerary.days[0].id,
        activityId: null,
      };
    await expect(validateProposal(session, proposal)).rejects.toThrow();
  },
);
it("prevents ABA acceptance after undo and repeat acceptance", async () => {
  const initial = await withProposal();
  const accepted = await acceptProposal(initial, initial.pendingProposal!.id);
  await expect(
    acceptProposal(accepted, initial.pendingProposal!.id),
  ).rejects.toThrow(/no longer/);
  await expect(
    validateProposal(undoVersion(accepted), initial.pendingProposal),
  ).rejects.toThrow(/older itinerary/);
});
it("rejects invalid candidate schedules, missing versions and undo of the original", async () => {
  const initial = await withProposal();
  initial.pendingProposal!.candidate.days[1].activities = [];
  await expect(
    validateProposal(initial, initial.pendingProposal),
  ).rejects.toThrow(/invalid/);
  expect(() => restoreVersion(editSession(), randomUUID())).toThrow(
    /no longer/,
  );
  expect(() => undoVersion(editSession())).toThrow(/original/);
});
it("fingerprints are canonical but detect every itinerary field change", async () => {
  const itinerary = editSession().versions[0].itinerary;
  const reordered = Object.fromEntries(
    Object.entries(itinerary).reverse(),
  ) as typeof itinerary;
  expect(await itineraryFingerprint(reordered)).toBe(
    await itineraryFingerprint(itinerary),
  );
  const changed = structuredClone(itinerary);
  changed.days[0].title += " changed";
  expect(await itineraryFingerprint(changed)).not.toBe(
    await itineraryFingerprint(itinerary),
  );
});
it("preserves full history and rejects changes at the version cap", async () => {
  const session = editSession();
  for (let index = 1; index < 25; index++)
    session.versions.push({
      ...session.versions[0],
      id: randomUUID(),
      parentVersionId: session.versions.at(-1)!.id,
    });
  session.activeVersionId = session.versions.at(-1)!.id;
  const proposed = await withProposal(session);
  await expect(
    acceptProposal(proposed, proposed.pendingProposal!.id),
  ).rejects.toThrow(/25-version limit/);
  expect(proposed.versions).toEqual(session.versions);
});
