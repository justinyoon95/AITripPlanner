"use client";
import { useEffect, useRef, useState } from "react";
import {
  History,
  MessageSquare,
  Send,
  LoaderCircle,
  X,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { activeVersion } from "@/features/trips/versioning";
import type { useTripEditor } from "@/features/trips/use-trip-editor";
import { EditPreview } from "./edit-preview";
import { VersionHistory } from "./version-history";
import {
  MAX_CHAT_MESSAGES,
  MAX_VERSIONS,
} from "@/features/trips/session-schema";
import { responseLabels } from "@/features/trips/chat-contract";
import { shouldShowUncertaintyNotice } from "@/features/trips/uncertainty-policy";

type Editor = ReturnType<typeof useTripEditor>;
export function TripChat({
  editor,
  mockMode,
}: {
  editor: Editor;
  mockMode: boolean;
}) {
  const [view, setView] = useState<"chat" | "history">("chat");
  const [text, setText] = useState("");
  const log = useRef<HTMLDivElement>(null);
  const trip = activeVersion(editor.session).itinerary;
  const day = trip.days.find((item) => item.id === editor.scope?.dayId);
  const activity = day?.activities.find(
    (item) => item.id === editor.scope?.activityId,
  );
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [editor.session.messages.length]);
  const visibleView = editor.scope ? "chat" : view;
  const blocked = Boolean(
    editor.busy || editor.session.messages.length + 2 > MAX_CHAT_MESSAGES,
  );
  return (
    <section
      className="trip-editor"
      aria-label="Itinerary editor"
      id="trip-editor"
    >
      <div
        className="editor-tabs"
        role="tablist"
        aria-label="Itinerary editor views"
        onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
            return;
          event.preventDefault();
          const next =
            event.key === "Home"
              ? "chat"
              : event.key === "End"
                ? "history"
                : visibleView === "chat"
                  ? "history"
                  : "chat";
          editor.setScope(null);
          setView(next);
          document
            .getElementById(next === "chat" ? "chat-tab" : "history-tab")
            ?.focus();
        }}
      >
        <button
          type="button"
          role="tab"
          aria-selected={visibleView === "chat"}
          tabIndex={visibleView === "chat" ? 0 : -1}
          aria-controls="trip-chat-panel"
          id="chat-tab"
          onClick={() => setView("chat")}
        >
          <MessageSquare size={16} />
          Chat
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={visibleView === "history"}
          tabIndex={visibleView === "history" ? 0 : -1}
          aria-controls="history-panel"
          id="history-tab"
          onClick={() => {
            editor.setScope(null);
            setView("history");
          }}
        >
          <History size={16} />
          History <span>{editor.session.versions.length}</span>
        </button>
      </div>
      {editor.error && (
        <div className="editor-error" role="alert">
          <p>{editor.error}</p>
          <Button
            variant="ghost"
            disabled={Boolean(editor.busy)}
            onClick={() => void editor.reload()}
          >
            <RefreshCw size={14} />
            Reload saved trip
          </Button>
        </div>
      )}
      {visibleView === "history" ? (
        <div role="tabpanel" id="history-panel" aria-labelledby="history-tab">
          <VersionHistory
            session={editor.session}
            busy={Boolean(editor.busy)}
            onRestore={(id) => void editor.restore(id)}
          />
        </div>
      ) : (
        <div role="tabpanel" id="trip-chat-panel" aria-labelledby="chat-tab">
          <div className="scope-control">
            <label htmlFor="edit-day">Edit focus</label>
            <select
              id="edit-day"
              disabled={Boolean(editor.busy || editor.session.pendingProposal)}
              value={editor.scope?.dayId ?? ""}
              onChange={(event) => {
                setView("chat");
                editor.setScope(
                  event.target.value
                    ? { dayId: event.target.value, activityId: null }
                    : null,
                );
              }}
            >
              <option value="">Whole itinerary</option>
              {trip.days.map((item) => (
                <option value={item.id} key={item.id}>
                  Day {item.number}
                </option>
              ))}
            </select>
          </div>
          {activity && (
            <div className="selected-activity">
              <span>
                Day {day?.number} · {activity.name}
              </span>
              <button
                type="button"
                className="icon-button"
                title="Clear activity focus"
                aria-label="Clear activity focus"
                disabled={Boolean(
                  editor.busy || editor.session.pendingProposal,
                )}
                onClick={() => {
                  setView("chat");
                  editor.setScope(null);
                }}
              >
                <X size={14} />
              </button>
            </div>
          )}
          <div
            ref={log}
            className="chat-log"
            role="log"
            aria-label="Conversation"
            aria-live="polite"
          >
            {editor.session.messages.length === 0 && (
              <p className="chat-empty">No messages yet.</p>
            )}
            {editor.session.messages.map((message) => (
              <article
                className={`chat-message chat-${message.role}`}
                key={message.id}
              >
                <header>
                  <strong>
                    {message.role === "user" ? "You" : "TripPlannerAI"}
                  </strong>
                  <span>
                    {message.intent && message.role === "assistant"
                      ? responseLabels[message.intent]
                      : message.status}
                    {message.intent === "itinerary_edit" &&
                      message.status !== "proposed" &&
                      ` · ${message.status}`}
                  </span>
                </header>
                <p>{message.content}</p>
                {!mockMode && shouldShowUncertaintyNotice(message) && (
                  <small className="chat-evidence">
                    Unverified suggestion; check details before traveling.
                  </small>
                )}
                <time dateTime={message.createdAt}>
                  {new Date(message.createdAt).toLocaleTimeString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              </article>
            ))}
          </div>
          {editor.busy === "request" && (
            <p className="edit-loading" role="status">
              <LoaderCircle size={15} className="spin" />
              Considering your request...
            </p>
          )}
          {editor.session.pendingProposal && (
            <EditPreview
              base={trip}
              proposal={editor.session.pendingProposal}
              busy={Boolean(editor.busy)}
              onAccept={() => void editor.accept()}
              onReject={() => void editor.reject()}
            />
          )}
          <form
            className="chat-compose"
            onSubmit={(event) => {
              event.preventDefault();
              if (!blocked && text.trim()) {
                void editor.send(text);
                setText("");
              }
            }}
          >
            <label htmlFor="edit-message">What would you like to change?</label>
            <textarea
              id="edit-message"
              rows={3}
              maxLength={1000}
              disabled={blocked}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Make Day 2 less busy, or ask about your trip..."
            />
            <div>
              <small>{text.length}/1,000</small>
              <Button type="submit" disabled={blocked || !text.trim()}>
                <Send size={15} />
                Send
              </Button>
            </div>
          </form>
          <p className="editor-disclaimer">
            {mockMode
              ? "Development sample editor. No OpenAI calls."
              : "Your current itinerary and recent messages are sent to OpenAI. Avoid sensitive details."}
          </p>
          {(editor.session.messages.length >= MAX_CHAT_MESSAGES ||
            editor.session.versions.length >= MAX_VERSIONS) && (
            <p className="editor-disclaimer">
              This trip has reached its local history limit. Existing history is
              preserved. At the version limit, questions remain available until
              the message limit.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
