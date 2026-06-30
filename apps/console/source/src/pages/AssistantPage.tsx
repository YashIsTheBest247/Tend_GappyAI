import React, { useEffect, useRef, useState } from "react";
import { useConversationMessages } from "lemma-sdk/react";
import { conversationMessageText, normalizeAssistantDisplayText } from "lemma-sdk";
import { client, podId } from "../lib/lemmaClient";
import { Card } from "../lib/ui";

const SUGGESTIONS = [
  "What's urgent and still unanswered?",
  "How many tickets came in today?",
  "What does our refund policy say?",
  "Which drafts are waiting on me?",
];

type Row = { id: string; role: "user" | "assistant"; text: string };

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}

/**
 * Embedded read-only assistant backed by the `concierge` agent.
 *
 * We use the hook directly (not the AgentThread render-prop) so we can run a
 * polling fallback: the app is served behind a proxy that buffers SSE, so the
 * live token stream may never reach the browser. Polling `refresh()` pulls the
 * committed messages (and the final answer) regardless of streaming.
 */
export default function AssistantPage() {
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<string[]>([]);
  // Local "busy" flag — true from the moment we send until the assistant's reply lands.
  const [busy, setBusy] = useState(false);

  const t = useConversationMessages({ client, podId, agentName: "concierge", syncOnTurnEnd: true });
  const { messages, conversationId, error, refresh, sendMessage, createConversation } = t;

  // Assistant message ids present when the current turn was sent — so we can detect a NEW answer.
  const sentAssistantIds = useRef<Set<string>>(new Set());
  const busyTimer = useRef<number | null>(null);

  // Build display rows: user messages + assistant final TEXT answers (skip internal kinds).
  const serverRows: Row[] = (messages ?? [])
    .map((m: any): Row | null => {
      const role = String(m.role || "").toLowerCase();
      const kind = String(m.kind || "").toUpperCase();
      const isUser = role === "user";
      if (!isUser && kind !== "TEXT") return null;
      let text = (conversationMessageText(m) || "").trim();
      if (!isUser) text = normalizeAssistantDisplayText(text).trim();
      if (!text) return null;
      return { id: m.id, role: isUser ? "user" : "assistant", text };
    })
    .filter((r): r is Row => r !== null);

  const assistantIds = serverRows.filter((r) => r.role === "assistant").map((r) => r.id);
  // A new assistant answer landed (id not present when we sent) → the turn is done.
  const gotNewAnswer = busy && assistantIds.some((id) => !sentAssistantIds.current.has(id));
  useEffect(() => {
    if (gotNewAnswer) {
      setBusy(false);
      if (busyTimer.current != null) { window.clearTimeout(busyTimer.current); busyTimer.current = null; }
    }
  }, [gotNewAnswer]);

  // Poll committed messages while a turn is in flight (covers SSE buffered by the app proxy).
  const pollRef = useRef<number | null>(null);
  useEffect(() => {
    if (busy && conversationId && pollRef.current == null) {
      pollRef.current = window.setInterval(() => { refresh().catch(() => { /* ignore */ }); }, 2000);
    }
    if (!busy && pollRef.current != null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current != null) { window.clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [busy, conversationId, refresh]);

  const send = async (text: string) => {
    const v = text.trim();
    if (!v || busy) return;
    setPending((p) => [...p, v]);
    setInput("");
    sentAssistantIds.current = new Set(assistantIds);
    setBusy(true);
    // Safety: never leave the input locked if something stalls.
    if (busyTimer.current != null) window.clearTimeout(busyTimer.current);
    busyTimer.current = window.setTimeout(() => setBusy(false), 120000);
    try {
      let convId = conversationId;
      if (!convId) {
        const created = await createConversation();
        convId = created.id;
      }
      await sendMessage(v, { conversationId: convId });
      await refresh().catch(() => { /* ignore */ });
    } catch {
      setBusy(false); // error surfaced via `error`
      if (busyTimer.current != null) { window.clearTimeout(busyTimer.current); busyTimer.current = null; }
    }
  };

  // Drop optimistic messages once the server has echoed an identical user message.
  const serverUserTexts = new Set(serverRows.filter((r) => r.role === "user").map((r) => r.text));
  const pendingRows: Row[] = pending
    .filter((p) => !serverUserTexts.has(p))
    .map((p, i) => ({ id: `pending-${i}`, role: "user", text: p }));

  const rows = [...serverRows, ...pendingRows];
  // Show the thinking indicator while busy AND the assistant hasn't answered yet.
  const lastRow = rows[rows.length - 1];
  const waiting = busy && (!lastRow || lastRow.role === "user");
  const streaming = waiting ? (t.streamingText || "").trim() : "";
  const empty = rows.length === 0 && !waiting;

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">Assistant</h1>
        <p className="page-sub">Ask about the queue or the knowledge base. Read-only — it never changes tickets.</p>
      </div>

      <Card className="chat-card">
        <div className="chat">
          <div className="chat-head">
            <div className="chat-avatar">✦</div>
            <div className="stack">
              <div className="chat-name">Concierge</div>
              <div className="chat-status"><span className="live-dot" /> Reads your live queue &amp; docs · read-only</div>
            </div>
          </div>

          <div className="chat-body">
            {empty ? (
              <div className="chat-empty">
                <div className="chat-empty-icon">✦</div>
                <h3>Ask me anything about your desk</h3>
                <p className="muted-text">I answer from your live tickets and knowledge base — try one of these:</p>
                <div className="suggest-grid">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} className="suggest-card" type="button" onClick={() => send(s)}>
                      <span>{s}</span>
                      <span className="suggest-arrow">↗</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {rows.map((r) => (
                  <div key={r.id} className={`msg ${r.role === "user" ? "msg-me" : "msg-them"}`}>
                    <div className={`bubble ${r.role === "user" ? "me" : "them"}`}>{r.text}</div>
                  </div>
                ))}
                {waiting && (
                  streaming ? (
                    <div className="msg msg-them"><div className="bubble them">{streaming}</div></div>
                  ) : (
                    <div className="msg msg-them">
                      <div className="bubble them typing"><span /><span /><span /></div>
                    </div>
                  )
                )}
              </>
            )}
            {error && !waiting && (
              <div className="msg msg-them">
                <div className="bubble them" style={{ color: "#b4435f", whiteSpace: "pre-wrap" }}>
                  Sorry — I couldn't reach the assistant.{"\n"}
                  <span style={{ fontSize: 12, opacity: 0.85 }}>{String(error?.message || error)}</span>
                </div>
              </div>
            )}
          </div>

          <form className="chat-input-row" onSubmit={(e) => { e.preventDefault(); send(input); }}>
            <input
              className="chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask the assistant…"
            />
            <button className="chat-send" type="submit" disabled={busy || !input.trim()} aria-label="Send">
              <SendIcon />
            </button>
          </form>
        </div>
      </Card>
    </div>
  );
}
