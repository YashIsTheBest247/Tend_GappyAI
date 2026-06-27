import React, { useMemo, useState } from "react";
import { useTickets, Ticket } from "../lib/podData";
import { Card, Stat, Badge, StatusPill, PriorityTag, Avatar, Loading, Empty } from "../lib/ui";
import { go } from "../lib/router";
import { timeAgo } from "../lib/format";

type Customer = {
  key: string; name: string; email?: string;
  tickets: Ticket[]; open: number; lastContact?: string;
  channels: Set<string>; negative: number; risk: boolean;
};

function build(tickets: Ticket[]): Customer[] {
  const map = new Map<string, Customer>();
  for (const t of tickets) {
    const key = (t.customer_email || t.customer_name || "Unknown").toLowerCase();
    let c = map.get(key);
    if (!c) {
      c = { key, name: t.customer_name || t.customer_email || "Unknown", email: t.customer_email,
        tickets: [], open: 0, lastContact: undefined, channels: new Set(), negative: 0, risk: false };
      map.set(key, c);
    }
    c.tickets.push(t);
    if (!["answered", "closed"].includes(t.status)) c.open++;
    if (t.sentiment === "negative") c.negative++;
    if (t.channel) c.channels.add(t.channel);
    if (!c.lastContact || (t.created_at ?? "") > c.lastContact) c.lastContact = t.created_at;
    if (!c.name || c.name === "Unknown") c.name = t.customer_name || c.name;
    if (!c.email) c.email = t.customer_email;
  }
  for (const c of map.values()) {
    c.risk = c.tickets.some((t) => t.sentiment === "negative" && (t.priority === "urgent" || t.status === "escalated"));
  }
  return [...map.values()].sort((a, b) => (b.lastContact ?? "").localeCompare(a.lastContact ?? ""));
}

function CustomerCard({ c }: { c: Customer }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="compact">
      <div className="between" style={{ alignItems: "flex-start", cursor: "pointer" }} onClick={() => setOpen((o) => !o)}>
        <div className="card-row" style={{ flexWrap: "nowrap", minWidth: 0 }}>
          <Avatar name={c.name} />
          <div style={{ minWidth: 0 }}>
            <div className="row-subject" style={{ fontSize: 15 }}>{c.name}</div>
            <div className="row-preview">{c.email || "no email on file"}</div>
          </div>
        </div>
        <div className="wrap" style={{ justifyContent: "flex-end" }}>
          {c.risk && <Badge variant="ember">at risk</Badge>}
          {c.tickets.length > 1 && <Badge>repeat · {c.tickets.length}</Badge>}
          {c.open > 0 && <Badge variant="outline">{c.open} open</Badge>}
          <span className="muted-text" style={{ fontSize: 12 }}>{timeAgo(c.lastContact)}</span>
        </div>
      </div>
      {open && (
        <div className="grid" style={{ gap: 8, marginTop: 14 }}>
          {c.tickets.map((t) => (
            <div key={t.id} className="row" style={{ padding: "12px 16px" }} onClick={() => go(`#/ticket/${t.id}`)}>
              <div className="row-num">#{t.number ?? "—"}</div>
              <div className="row-main"><div className="row-subject" style={{ fontSize: 14 }}>{t.subject}</div></div>
              <div className="row-meta">
                <PriorityTag priority={t.priority} />
                <StatusPill status={t.status} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export default function CustomersPage() {
  const { tickets, isLoading } = useTickets();
  const [q, setQ] = useState("");
  const customers = useMemo(() => build(tickets), [tickets]);

  if (isLoading) return <Loading label="Loading customers" />;

  const ql = q.trim().toLowerCase();
  const shown = customers.filter((c) => !ql || c.name.toLowerCase().includes(ql) || (c.email ?? "").includes(ql));
  const repeat = customers.filter((c) => c.tickets.length > 1).length;
  const atRisk = customers.filter((c) => c.risk).length;

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">Customers</h1>
        <p className="page-sub">Every person who's reached out — their history, sentiment, and risk in one place.</p>
      </div>

      <div className="stats" style={{ marginBottom: 22 }}>
        <Stat num={customers.length} label="Customers" tone="sky" />
        <Stat num={repeat} label="Repeat contacts" tone="violet" />
        <Stat num={atRisk} label="At-risk" tone="rose" />
      </div>

      <input className="input" style={{ marginBottom: 16 }} value={q}
        onChange={(e) => setQ(e.target.value)} placeholder="Search customers by name or email…" />

      {shown.length === 0 ? (
        <Card><Empty>No customers match.</Empty></Card>
      ) : (
        <div className="grid stagger-list" style={{ gap: 12 }}>
          {shown.map((c) => <CustomerCard key={c.key} c={c} />)}
        </div>
      )}
    </div>
  );
}
