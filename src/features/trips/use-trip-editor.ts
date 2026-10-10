"use client";
import { useEffect, useRef, useState } from "react";
import {
  EditError,
  MAX_CONTEXT_MESSAGES,
  editRequestSchema,
  type EditScope,
} from "./edit-schema";
import { requestEdit } from "./edit-client";
import {
  MAX_CHAT_MESSAGES,
  MAX_VERSIONS,
  type ChatMessage,
  type TripSession,
} from "./session-schema";
import {
  activeVersion,
  acceptProposal,
  restoreVersion,
  undoVersion,
  validateProposal,
} from "./versioning";
import {
  readSession,
  recoverSession,
  sessionKey,
  updateStoredSession,
} from "./session-storage";

const errorMessage = (error: unknown) =>
  error instanceof Error && error.name !== "ZodError"
    ? error.message
    : "The stored changes are invalid. No changes were saved.";
export function useTripEditor(initial: TripSession, initialWarning?: string) {
  const [session, setSession] = useState(initial);
  const [error, setError] = useState<string | null>(initialWarning ?? null);
  const [busy, setBusy] = useState<"request" | "save" | null>(null);
  const [scope, setScope] = useState<EditScope | null>(null);
  const current = useRef(initial);
  const inFlight = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  function publish(next: TripSession) {
    current.current = next;
    if (mounted.current) setSession(next);
  }

  useEffect(() => {
    mounted.current = true;
    const changed = async (event: StorageEvent) => {
      if (event.key !== sessionKey(initial.tripId) && event.key !== null)
        return;
      abort.current?.abort();
      try {
        const latest = readSession(initial.tripId);
        if (!latest)
          throw new Error("This trip's local data was removed in another tab.");
        publish(await recoverSession(latest));
        setScope(null);
        setError(
          "This trip changed in another tab. Its latest saved version is now displayed.",
        );
      } catch (failure) {
        setError(errorMessage(failure));
      }
    };
    window.addEventListener("storage", changed);
    return () => {
      mounted.current = false;
      abort.current?.abort();
      window.removeEventListener("storage", changed);
    };
  }, [initial.tripId]);

  async function run(action: () => Promise<void>, kind: "request" | "save") {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(kind);
    setError(null);
    try {
      await action();
    } catch (failure) {
      if (mounted.current) setError(errorMessage(failure));
      if (failure instanceof EditError && failure.code === "SESSION_CONFLICT") {
        try {
          const latest = readSession(initial.tripId);
          if (latest) publish(await recoverSession(latest));
        } catch {
          /* Keep the last validated itinerary visible. */
        }
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(null);
    }
  }
  async function change(
    update: (value: TripSession) => TripSession | Promise<TripSession>,
  ) {
    const next = await updateStoredSession(current.current, update);
    publish(next);
  }
  async function send(text: string) {
    return run(async () => {
      const message = editRequestSchema.shape.message.safeParse(text);
      if (!message.success)
        throw new Error("Describe a change using 1 to 1,000 characters.");
      const base = current.current;
      if (base.pendingProposal)
        throw new Error(
          "Accept or reject the current proposal before requesting another change.",
        );
      if (base.messages.length + 2 > MAX_CHAT_MESSAGES)
        throw new Error(
          "This trip has reached its 100-message limit. Your history and itinerary are preserved.",
        );
      if (base.versions.length >= MAX_VERSIONS)
        throw new Error(
          "This trip has reached its 25-version limit. Your history and itinerary are preserved.",
        );
      const user: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: message.data,
        createdAt: new Date().toISOString(),
        status: "pending",
        proposalId: null,
      };
      const started = await updateStoredSession(base, (value) => ({
        ...value,
        messages: [...value.messages, user],
      }));
      publish(started);
      abort.current = new AbortController();
      try {
        const response = await requestEdit(
          {
            itinerary: activeVersion(started).itinerary,
            baseVersionId: started.activeVersionId,
            baseRevision: started.revision,
            message: message.data,
            scope,
            context: base.messages
              .filter(
                (item) =>
                  !["pending", "failed", "interrupted"].includes(item.status),
              )
              .slice(-MAX_CONTEXT_MESSAGES)
              .map((item) => ({
                role: item.role,
                content: `[${item.status}] ${item.content}`.slice(0, 1000),
              })),
          },
          abort.current.signal,
        );
        if (abort.current.signal.aborted || !mounted.current) return;
        if (response.kind === "proposal")
          await validateProposal(started, response.proposal);
        const assistant: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: response.message,
          createdAt: new Date().toISOString(),
          status: response.kind === "proposal" ? "proposed" : "clarification",
          proposalId:
            response.kind === "proposal" ? response.proposal.id : null,
        };
        publish(
          await updateStoredSession(started, (value) => ({
            ...value,
            messages: [
              ...value.messages.map((item) =>
                item.id === user.id
                  ? { ...item, status: "answered" as const }
                  : item,
              ),
              assistant,
            ],
            pendingProposal:
              response.kind === "proposal" ? response.proposal : null,
          })),
        );
      } catch (failure) {
        if (abort.current?.signal.aborted || !mounted.current) return;
        try {
          publish(
            await updateStoredSession(started, (value) => ({
              ...value,
              messages: value.messages.map((item) =>
                item.id === user.id
                  ? { ...item, status: "failed" as const }
                  : item,
              ),
            })),
          );
        } catch {
          /* A failed write must not replace the current saved itinerary. */
        }
        throw failure;
      }
    }, "request");
  }
  async function accept() {
    return run(
      () =>
        change(async (value) => {
          if (!value.pendingProposal)
            throw new Error("There is no proposal to accept.");
          return acceptProposal(value, value.pendingProposal.id);
        }),
      "save",
    );
  }
  async function reject() {
    return run(
      () =>
        change((value) => ({
          ...value,
          revision: value.revision + 1,
          pendingProposal: null,
          messages: value.messages.map((item) =>
            item.status === "proposed" ? { ...item, status: "rejected" } : item,
          ),
        })),
      "save",
    );
  }
  async function undo() {
    return run(() => change(undoVersion), "save");
  }
  async function restore(id: string) {
    return run(() => change((value) => restoreVersion(value, id)), "save");
  }
  async function reload() {
    return run(async () => {
      const latest = readSession(initial.tripId);
      if (!latest)
        throw new Error("This trip is no longer stored in this browser.");
      const recovered = await recoverSession(latest);
      publish(await updateStoredSession(latest, () => recovered));
      setScope(null);
    }, "save");
  }
  return {
    session,
    error,
    busy,
    scope,
    setScope,
    send,
    accept,
    reject,
    undo,
    restore,
    reload,
  };
}
