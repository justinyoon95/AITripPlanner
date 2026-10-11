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
import { proposeItineraryEdit } from "@/lib/ai/edit-service";
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
  vi.unstubAllEnvs();
});
const message = () => screen.getByLabelText("What would you like to change?");
it("allows draft refinement, supersedes only the old draft, and requires explicit acceptance", async () => {
  const initial = await withProposal();
  const revised = await withProposal(initial);
  request.mockResolvedValue({
    kind: "proposal",
    message: "A revised flexible plan",
    proposal: revised.pendingProposal,
  });
  writeSession(initial);
  const view = render(<TripWorkspace initial={initial} mockMode={true} />);
  expect(message()).toBeEnabled();
  fireEvent.change(message(), { target: { value: "Make it flexible" } });
  await userEvent.click(screen.getByRole("button", { name: "Send" }));
  await screen.findByText("A revised flexible plan");
  let saved = readSession(initial.tripId)!;
  expect(request.mock.calls[0][0].pendingProposal.id).toBe(
    initial.pendingProposal!.id,
  );
  expect(saved.pendingProposal?.id).toBe(revised.pendingProposal!.id);
  expect(saved.messages[0].status).toBe("stale");
  expect(saved.versions).toEqual(initial.versions);
  expect(saved.revision).toBe(initial.revision);
  view.unmount();
  render(<TripWorkspace initial={saved} mockMode={true} />);
  await userEvent.click(screen.getByRole("button", { name: "Accept changes" }));
  await waitFor(() =>
    expect(readSession(initial.tripId)!.versions).toHaveLength(2),
  );
  saved = readSession(initial.tripId)!;
  expect(saved.activeVersionId).toBe(revised.pendingProposal!.id);
  await userEvent.click(screen.getByRole("button", { name: "Undo" }));
  await waitFor(() =>
    expect(readSession(initial.tripId)!.activeVersionId).toBe(
      initial.activeVersionId,
    ),
  );
});
it("keeps a pending draft when an informational reply arrives, without accepting on Yes", async () => {
  const initial = await withProposal();
  request.mockResolvedValue({
    kind: "answer",
    intent: "travel_question",
    evidence: "itinerary_data",
    message: "The proposed change has not been accepted.",
  });
  writeSession(initial);
  render(<TripWorkspace initial={initial} mockMode={true} />);
  for (const text of ["When does GU close?", "Yes"]) {
    fireEvent.change(message(), { target: { value: text } });
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(message()).toBeEnabled());
  }
  const saved = readSession(initial.tripId)!;
  expect(saved.pendingProposal).toEqual(initial.pendingProposal);
  expect(saved.versions).toEqual(initial.versions);
  expect(saved.revision).toBe(initial.revision);
  await userEvent.click(screen.getByRole("button", { name: "Reject" }));
  await waitFor(() =>
    expect(readSession(initial.tripId)!.pendingProposal).toBeNull(),
  );
});
it("preserves the draft and active version if refinement fails", async () => {
  const initial = await withProposal();
  request.mockRejectedValue(new Error("Request failed safely"));
  writeSession(initial);
  render(<TripWorkspace initial={initial} mockMode={true} />);
  fireEvent.change(message(), { target: { value: "Make it flexible" } });
  await userEvent.click(screen.getByRole("button", { name: "Send" }));
  await screen.findByText("Request failed safely");
  expect(readSession(initial.tripId)!.pendingProposal).toEqual(
    initial.pendingProposal,
  );
  expect(readSession(initial.tripId)!.versions).toEqual(initial.versions);
});
it("does not append a redundant notice to a persisted AI uncertainty answer", () => {
  const initial = editSession();
  initial.messages = [
    {
      id: crypto.randomUUID(),
      role: "assistant",
      createdAt: new Date().toISOString(),
      status: "answered",
      proposalId: null,
      intent: "travel_question",
      evidence: "unverified_suggestion",
      content:
        "I don't have specific information on GU's closing hours. Please check the official website.",
    },
  ];
  writeSession(initial);
  render(<TripWorkspace initial={initial} mockMode={false} />);
  expect(
    screen.getByText(/I don't have specific information/),
  ).toBeInTheDocument();
  expect(
    screen.queryByText(
      "Unverified suggestion; check details before traveling.",
    ),
  ).not.toBeInTheDocument();
});
it("sends three separate clarification turns through the mock service and never auto-accepts", async () => {
  vi.stubEnv("TRIP_GENERATION_MODE", "mock");
  request.mockImplementation(proposeItineraryEdit);
  const initial = editSession();
  writeSession(initial);
  render(<TripWorkspace initial={initial} mockMode={true} />);
  for (const [text, expected] of [
    ["Make my itinerary better.", /What would you like to improve:/],
    ["Day 1.", /What would you like to change about Day 1:/],
    ["Fewer activities.", /Sample proposal: remove one activity/],
  ] as const) {
    fireEvent.change(message(), { target: { value: text } });
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText(expected);
  }
  expect(request).toHaveBeenCalledTimes(3);
  expect(request.mock.calls.map((call) => call[0].message)).toEqual([
    "Make my itinerary better.",
    "Day 1.",
    "Fewer activities.",
  ]);
  const saved = readSession(initial.tripId)!;
  expect(saved.activeVersionId).toBe(initial.activeVersionId);
  expect(saved.versions).toHaveLength(1);
  expect(saved.pendingProposal?.candidate.days[0].activities).toHaveLength(
    initial.versions[0].itinerary.days[0].activities.length - 1,
  );
  expect(
    await screen.findByRole("button", { name: "Accept changes" }),
  ).toBeEnabled();
});
it("sends informational day/location follow-ups separately without changing versions and preserves them on refresh", async () => {
  vi.stubEnv("TRIP_GENERATION_MODE", "mock");
  request.mockImplementation(proposeItineraryEdit);
  const initial = editSession();
  writeSession(initial);
  const view = render(<TripWorkspace initial={initial} mockMode={true} />);
  for (const text of ["When does GU close?", "on day 1", "in Namba"]) {
    fireEvent.change(message(), { target: { value: text } });
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(message()).not.toBeDisabled());
  }
  const saved = readSession(initial.tripId)!;
  expect(saved.versions).toEqual(initial.versions);
  expect(saved.revision).toBe(initial.revision);
  expect(saved.pendingProposal).toBeNull();
  expect(saved.messages.at(-1)?.content).toContain("Day 1");
  view.unmount();
  render(<TripWorkspace initial={saved} mockMode={false} />);
  expect(
    screen.queryByText(
      "Unverified suggestion; check details before traveling.",
    ),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Accept changes" }),
  ).not.toBeInTheDocument();
});
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
it.each(["itinerary_data", "unverified_suggestion"] as const)(
  "shows only relevant uncertainty notices in AI mode: %s",
  async (evidence) => {
    const initial = editSession(),
      proposed = await withProposal(initial);
    request.mockResolvedValue({
      kind: "proposal",
      intent: "itinerary_edit",
      evidence,
      message: "Review this change",
      proposal: proposed.pendingProposal,
    });
    writeSession(initial);
    render(<TripWorkspace initial={initial} mockMode={false} />);
    await submit();
    await screen.findByRole("button", { name: "Accept changes" });
    expect(
      Boolean(
        screen.queryByText(
          "Unverified suggestion; check details before traveling.",
        ),
      ),
    ).toBe(evidence === "unverified_suggestion");
    expect(readSession(initial.tripId)!.activeVersionId).toBe(
      initial.activeVersionId,
    );
    expect(readSession(initial.tripId)!.versions).toHaveLength(1);
  },
);
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
    "Considering your request",
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

it.each([
  {
    kind: "answer" as const,
    intent: "travel_question" as const,
    evidence: "itinerary_estimates" as const,
    message: "Recorded estimates total $320.00.",
  },
  {
    kind: "refusal" as const,
    intent: "out_of_scope" as const,
    evidence: "none" as const,
    message: "I specialize in travel planning.",
  },
  {
    kind: "clarification" as const,
    intent: "clarification_needed" as const,
    evidence: "none" as const,
    message: "Which day did you mean?",
  },
])(
  "persists $kind without creating versions or changing revision, even after refresh",
  async (response) => {
    const initial = editSession();
    writeSession(initial);
    request.mockResolvedValue(response);
    render(<TripWorkspace initial={initial} mockMode={true} />);
    await submit();
    expect(await screen.findByText(response.message)).toBeInTheDocument();
    const saved = readSession(initial.tripId)!;
    expect(saved.versions).toEqual(initial.versions);
    expect(saved.activeVersionId).toBe(initial.activeVersionId);
    expect(saved.revision).toBe(initial.revision);
    expect(saved.pendingProposal).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Accept changes" }),
    ).not.toBeInTheDocument();
    cleanup();
    render(
      <TripWorkspace initial={await recoverSession(saved)} mockMode={true} />,
    );
    expect(screen.getByText(response.message)).toBeInTheDocument();
  },
);

it("allows travel questions at the version cap while refusing further proposed versions", async () => {
  const initial = editSession();
  const original = initial.versions[0];
  initial.versions = Array.from({ length: 25 }, (_, index) =>
    index === 0
      ? original
      : {
          ...original,
          id: webcrypto.randomUUID(),
          parentVersionId: original.id,
        },
  );
  writeSession(initial);
  request.mockResolvedValue({
    kind: "answer",
    intent: "travel_question",
    evidence: "itinerary_estimates",
    message: "Your recorded estimates remain available.",
  });
  render(<TripWorkspace initial={initial} mockMode={true} />);
  expect(message()).toBeEnabled();
  await submit();
  expect(
    await screen.findByText("Your recorded estimates remain available."),
  ).toBeInTheDocument();
  expect(readSession(initial.tripId)!.versions).toHaveLength(25);
  const proposed = await withProposal(initial);
  request.mockResolvedValue({
    kind: "proposal",
    message: "New version",
    proposal: proposed.pendingProposal,
  });
  await submit();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "25-version limit",
  );
  expect(readSession(initial.tripId)!.versions).toHaveLength(25);
});
