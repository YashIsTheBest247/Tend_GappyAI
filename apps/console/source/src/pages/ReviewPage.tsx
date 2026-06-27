import React, { useState } from "react";
import { useTickets, useAllQuality, useFunctionRunner, Ticket, Quality } from "../lib/podData";
import { Card, StatusPill, PriorityTag, Badge, Loading, Empty, Btn } from "../lib/ui";
import { go } from "../lib/router";
import { toast } from "../lib/toast";
import { timeAgo, slaState } from "../lib/format";

const VCLASS: Record<string, string> = { ship: "v-ship", revise: "v-revise", escalate: "v-escalate" };

function ReviewCard({ t, qa }: { t: Ticket; qa?: Quality }) {
  const sla = slaState(t.sla_due_at);
  return (
    <Card className="compact">
      <div className="between" style={{ alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div className="wrap" style={{ marginBottom: 8 }}>
            <span className="muted-text" style={{ fontSize: 12 }}>#{t.number ?? "—"}</span>
            <PriorityTag priority={t.priority} />
            {t.category && <Badge>{t.category}</Badge>}
            {qa && typeof qa.score === "number" && (
              <span className={`qa-verdict ${VCLASS[qa.verdict ?? "revise"] ?? "v-revise"}`}>
                QA {qa.score} · {qa.verdict}
              </span>
            )}
            {sla?.overdue && <Badge variant="ember">{sla.label}</Badge>}
          </div>
          <h3 style={{ fontSize: 18 }}>{t.subject}</h3>
          <p className="muted-text" style={{ margin: "6px 0 0" }}>
            {t.customer_name ? `${t.customer_name} · ` : ""}{t.summary}
          </p>
        </div>
        <div className="stack" style={{ alignItems: "flex-end", gap: 10, flex: "0 0 auto" }}>
          <StatusPill status={t.status} />
          <Btn size="sm" onClick={() => go(`#/ticket/${t.id}`)}>Review draft →</Btn>
          <span className="muted-text" style={{ fontSize: 12 }}>{timeAgo(t.created_at)}</span>
        </div>
      </div>
    </Card>
  );
}

export default function ReviewPage() {
  const { tickets, isLoading } = useTickets([{ field: "status", op: "eq", value: "awaiting_approval" }]);
  const { quality } = useAllQuality();
  const decide = useFunctionRunner("decide_reply");
  const [running, setRunning] = useState(false);
  const [doneCount, setDoneCount] = useState<number | null>(null);

  // best QA row per ticket
  const qaByTicket = new Map<string, Quality>();
  for (const q of quality) {
    const prev = qaByTicket.get(q.ticket_id);
    if (!prev || (q.score ?? 0) > (prev.score ?? 0)) qaByTicket.set(q.ticket_id, q);
  }

  const autoReady = tickets.filter((t) => {
    const q = qaByTicket.get(t.id);
    return q && q.verdict === "ship" && (q.score ?? 0) >= 90 && q.draft_id;
  });

  async function runAutopilot() {
    if (autoReady.length === 0) return;
    setRunning(true);
    let n = 0;
    for (const t of autoReady) {
      const q = qaByTicket.get(t.id)!;
      try {
        await decide.run({
          ticket_id: t.id, draft_id: q.draft_id, decision: "approve",
          notes: `Auto-approved by Autopilot — QA verdict ship (${q.score}/100).`,
        });
        n++;
      } catch { /* keep going */ }
    }
    setRunning(false);
    setDoneCount(n);
    toast(`Autopilot sent ${n} ${n === 1 ? "reply" : "replies"} ✓`, "ok");
  }

  return (
    <div>
      <div className="page-head between" style={{ flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 className="page-title">Review</h1>
          <p className="page-sub">Drafts the AI prepared — approve, edit, or send back in one click.</p>
        </div>
        <Btn variant="accent" onClick={runAutopilot} disabled={running || autoReady.length === 0}>
          ⚡ {running ? "Autopilot running…" : `Autopilot — auto-send ${autoReady.length} ship-rated`}
        </Btn>
      </div>

      {autoReady.length > 0 && doneCount === null && (
        <Card className="muted compact" style={{ marginBottom: 16 }}>
          <span className="muted-text" style={{ fontSize: 13.5 }}>
            <strong>{autoReady.length}</strong> draft{autoReady.length === 1 ? "" : "s"} scored ≥90 and “ship” by the reply-coach agent —
            Autopilot can send them without you. You only handle the rest.
          </span>
        </Card>
      )}

      {isLoading ? (
        <Loading label="Loading drafts" />
      ) : tickets.length === 0 ? (
        <Card><Empty>Nothing waiting on you. The AI will queue drafts here as tickets arrive.</Empty></Card>
      ) : (
        <div className="grid stagger-list" style={{ gap: 14 }}>
          {tickets.map((t) => <ReviewCard key={t.id} t={t} qa={qaByTicket.get(t.id)} />)}
        </div>
      )}
    </div>
  );
}
