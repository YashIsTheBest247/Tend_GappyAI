import React, { useState } from "react";
import { AgentThread } from "lemma-sdk/react";
import { conversationMessageText } from "lemma-sdk";
import { client, podId } from "../lib/lemmaClient";
import { Card } from "../lib/ui";

const SUGGESTIONS = [
  "What's urgent and still unanswered?",
  "How many tickets came in today?",
  "What does our refund policy say?",
  "Which drafts are waiting on me?",
];

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}

/** Embedded read-only assistant backed by the `concierge` agent (AgentThread render-prop). */
export default function AssistantPage() {
  const [input, setInput] = useState("");

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">Assistant</h1>
        <p className="page-sub">Ask about the queue or the knowledge base. Read-only — it never changes tickets.</p>
      </div>

      <Card className="chat-card">
        <AgentThread client={client} podId={podId} agentName="concierge">
          {(t) => {
            const send = (text: string) => { if (text.trim()) { t.sendMessage(text); setInput(""); } };
            const rows = (t.messages ?? [])
              .map((m) => ({ role: (m as any).role as string, text: conversationMessageText(m) }))
              .filter((r) => r.text && r.text.trim().length > 0);
            const empty = rows.length === 0;
            return (
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
                          <button key={s} className="suggest-card" onClick={() => send(s)}>
                            <span>{s}</span>
                            <span className="suggest-arrow">↗</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <>
                      {rows.map((r, i) => (
                        <div key={i} className={`msg ${r.role === "user" ? "msg-me" : "msg-them"}`}>
                          <div className={`bubble ${r.role === "user" ? "me" : "them"}`}>{r.text}</div>
                        </div>
                      ))}
                      {t.isRunning && (
                        <div className="msg msg-them">
                          <div className="bubble them typing"><span /><span /><span /></div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                <form className="chat-input-row" onSubmit={(e) => { e.preventDefault(); send(input); }}>
                  <input
                    className="chat-input"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask the assistant…"
                  />
                  <button className="chat-send" type="submit" disabled={t.isRunning || !input.trim()} aria-label="Send">
                    <SendIcon />
                  </button>
                </form>
              </div>
            );
          }}
        </AgentThread>
      </Card>
    </div>
  );
}
