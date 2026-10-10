// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { webcrypto } from "node:crypto";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TripWorkspace } from "@/components/trips/trip-workspace";
import { PreviewLoader } from "@/components/trips/preview-loader";
import {
  readSession,
  recoverSession,
  sessionKey,
  writeSession,
} from "@/features/trips/session-storage";
import { activeVersion } from "@/features/trips/versioning";
import { editSession, withProposal } from "./edit-fixtures";
import type { EditResponse } from "@/features/trips/edit-schema";
const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/features/trips/edit-client", () => ({ requestEdit: request }));
beforeEach(() => {
  request.mockReset();
  vi.stubGlobal("crypto", webcrypto);
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const message = () => screen.getByLabelText("What would you like to change?");
async function submit() {
  fireEvent.change(message(), { target: { value: "Make Day 2 less busy" } });
  await userEvent.click(screen.getByRole("button", { name: "Send" }));
}
async function setupResponse() {
  const initial = editSession();
  const proposed = await withProposal(initial);
  request.mockResolvedValue({
    kind: "proposal",
    message: "Review this change",
    proposal: proposed.pendingProposal,
  });
  writeSession(initial);
  render(<TripWorkspace initial={initial} mockMode={true} />);
  return initial;
}
it("shows loading and blocks duplicates, then previews without modifying the active trip", async () => {
  const initial = editSession();
  const proposed = await withProposal(initial);
  let resolve!: (value: EditResponse) => void;
  request.mockReturnValue(
    new Promise<EditResponse>((done) => {
      resolve = done;
    }),
  );
  writeSession(initial);
  render(<TripWorkspace initial={initial} mockMode={true} />);
  await submit();
  expect(await screen.findByRole("status")).toHaveTextContent(
    "Preparing a proposal",
  );
  expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  fireEvent.submit(message().closest("form")!);
  expect(request).toHaveBeenCalledTimes(1);
  await act(async () =>
    resolve({
      kind: "proposal",
      message: "Review",
      proposal: proposed.pendingProposal!,
    }),
  );
  expect(
    await screen.findByRole("button", { name: "Accept changes" }),
  ).toBeEnabled();
  expect(activeVersion(readSession(initial.tripId)!).itinerary).toEqual(
    initial.versions[0].itinerary,
  );
});
it("accepts, persists, undoes, restores and displays understandable history", async () => {
  const initial = await setupResponse();
  await submit();
  await userEvent.click(
    await screen.findByRole("button", { name: "Accept changes" }),
  );
  await waitFor(() =>
    expect(readSession(initial.tripId)!.versions).toHaveLength(2),
  );
  const accepted = readSession(initial.tripId)!;
  await userEvent.click(screen.getByRole("button", { name: "Undo" }));
  await waitFor(() =>
    expect(readSession(initial.tripId)!.activeVersionId).toBe(
      initial.activeVersionId,
    ),
  );
  await userEvent.click(screen.getByRole("tab", { name: /History/ }));
  expect(screen.getByText(/Day 2: removed/)).toBeInTheDocument();
  expect(screen.getAllByText("Active")).toHaveLength(1);
  await userEvent.click(
    screen.getByRole("button", { name: "Restore version 2" }),
  );
  await waitFor(() =>
    expect(readSession(initial.tripId)!.activeVersionId).toBe(
      accepted.activeVersionId,
    ),
  );
  cleanup();
  render(
    <TripWorkspace
      initial={await recoverSession(readSession(initial.tripId)!)}
      mockMode={true}
    />,
  );
  expect(
    screen.getByText(/Version 2/, { selector: ".workspace-toolbar span" }),
  ).toBeInTheDocument();
});
it("rejects a proposal without creating a version or changing itinerary values", async () => {
  const initial = await setupResponse();
  await submit();
  await userEvent.click(await screen.findByRole("button", { name: "Reject" }));
  await waitFor(() =>
    expect(readSession(initial.tripId)!.pendingProposal).toBeNull(),
  );
  const result = readSession(initial.tripId)!;
  expect(result.versions).toEqual(initial.versions);
  expect(result.messages.at(-1)!.status).toBe("rejected");
});
it("shows API failures while preserving the current itinerary", async () => {
  const initial = editSession();
  writeSession(initial);
  request.mockRejectedValue(new Error("AI editing unavailable"));
  render(<TripWorkspace initial={initial} mockMode={false} />);
  await submit();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "AI editing unavailable",
  );
  expect(readSession(initial.tripId)!.versions).toEqual(initial.versions);
  expect(message()).toBeEnabled();
});
it("does not publish an accepted version when browser storage fails", async () => {
  const initial = await setupResponse();
  await submit();
  const accept = await screen.findByRole("button", { name: "Accept changes" });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("quota");
  });
  await userEvent.click(accept);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "current itinerary is unchanged",
  );
  expect(readSession(initial.tripId)!.versions).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Accept changes" })).toBeEnabled();
});
it("rechecks stored state before acceptance and blocks stale cross-tab proposals", async () => {
  const initial = await setupResponse();
  await submit();
  const accept = await screen.findByRole("button", { name: "Accept changes" });
  const changed = readSession(initial.tripId)!;
  changed.revision++;
  writeSession(changed);
  await userEvent.click(accept);
  expect(await screen.findByRole("alert")).toHaveTextContent("another tab");
  expect(readSession(initial.tripId)!.versions).toHaveLength(1);
  expect(
    screen.queryByRole("button", { name: "Accept changes" }),
  ).not.toBeInTheDocument();
});
it("rejects hidden candidate changes before displaying a proposal", async () => {
  const initial = editSession();
  const proposed = await withProposal(initial);
  proposed.pendingProposal!.candidate.days[0].title = "Hidden unrelated change";
  request.mockResolvedValue({
    kind: "proposal",
    message: "Review",
    proposal: proposed.pendingProposal,
  });
  writeSession(initial);
  render(<TripWorkspace initial={initial} mockMode={true} />);
  await submit();
  expect(await screen.findByRole("alert")).toHaveTextContent("does not match");
  expect(readSession(initial.tripId)!.pendingProposal).toBeNull();
});
it("revalidates proposals arriving via storage events", async () => {
  const initial = editSession();
  writeSession(initial);
  render(<TripWorkspace initial={initial} mockMode={true} />);
  const changed = await withProposal(initial);
  changed.pendingProposal!.candidate.days[0].title = "Hidden change";
  writeSession(changed);
  await act(async () =>
    window.dispatchEvent(
      new StorageEvent("storage", { key: sessionKey(initial.tripId) }),
    ),
  );
  expect(
    screen.queryByRole("button", { name: "Accept changes" }),
  ).not.toBeInTheDocument();
  expect(await screen.findByRole("alert")).toHaveTextContent("another tab");
});
it("keeps Chat visible when clearing an activity focus selected from History", async () => {
  const initial = editSession();
  writeSession(initial);
  render(<TripWorkspace initial={initial} mockMode={true} />);
  await userEvent.click(screen.getByRole("tab", { name: /History/ }));
  Element.prototype.scrollIntoView = vi.fn();
  await userEvent.click(
    screen.getByRole("button", {
      name: "Edit A taste of the local market on Day 1",
    }),
  );
  expect(message()).toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "Clear activity focus" }),
  );
  expect(message()).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Chat" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});
it("still displays the saved itinerary if conversation recovery cannot be persisted", async () => {
  const session = await withProposal();
  session.messages[0].status = "pending";
  writeSession(session);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("quota");
  });
  render(<PreviewLoader id={session.tripId} mockMode={true} />);
  expect(
    await screen.findByRole("heading", { name: "Kyoto, Japan" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "could not save the recovered conversation",
  );
  expect(readSession(session.tripId)!.versions).toEqual(session.versions);
});
it("does not contact OpenAI when the initial message cannot be saved", async () => {
  const initial = editSession();
  writeSession(initial);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("quota");
  });
  render(<TripWorkspace initial={initial} mockMode={false} />);
  await submit();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "could not save this change",
  );
  expect(request).not.toHaveBeenCalled();
  expect(readSession(initial.tripId)!.messages).toHaveLength(0);
});
