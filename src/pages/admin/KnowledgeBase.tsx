import { useState } from "react";
import { Link } from "react-router-dom";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";
import { Flame, ThumbsUp, ThumbsDown } from "lucide-react";
import { Badge, Button, Card, Empty, Field, Input, Modal, PageHeader, Select, Skeleton, Tabs, Textarea, statusTone } from "@/components/ui";
import { Md } from "@/components/Shared";
import { useAdmin, run, CHART } from "./common";
import { FaqManager } from "./Faqs";
import { CONTACT_CATEGORIES, fmtDateTime } from "@/lib/format";

export default function KnowledgeBase() {
  const [tab, setTab] = useState("unanswered");
  const { data: pol } = useAdmin<{ policies: any[] }>("list_policies");
  const policies = pol?.policies ?? [];
  return (
    <div>
      <PageHeader title="AI Knowledge Base" text="What the assistant knows, what it couldn't answer, and how employees rated its answers." />
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: "approved", label: "Approved knowledge" }, { id: "pending_docs", label: "Pending documents" }, { id: "pending_faqs", label: "Pending FAQs" },
        { id: "unanswered", label: "Unanswered questions" }, { id: "low", label: "Low confidence answers" }, { id: "faqs", label: "Frequently asked questions" },
        { id: "feedback", label: "Employee feedback" }, { id: "escalations", label: "Contact escalations" }]} />
      {tab === "approved" && <Approved policies={policies} loading={!pol} />}
      {tab === "pending_docs" && <PendingDocs />}
      {tab === "pending_faqs" && <FaqManager policies={policies} initialStatus="pending" />}
      {tab === "unanswered" && <Unanswered policies={policies} />}
      {tab === "low" && <LowConfidence />}
      {tab === "faqs" && <FaqManager policies={policies} initialStatus="approved" />}
      {tab === "feedback" && <Feedback />}
      {tab === "escalations" && <Escalations />}
    </div>
  );
}

function Approved({ policies, loading }: { policies: any[]; loading: boolean }) {
  const active = policies.filter((p) => p.status === "active");
  if (loading) return <Skeleton className="h-40" />;
  return (
    <Card className="divide-y divide-slate-100">
      {active.length === 0 ? <Empty title="No active knowledge yet" text="Publish policies to make them available to the assistant." />
        : active.map((p) => <div key={p.id} className="flex justify-between items-center px-5 py-3 text-sm"><span><span className="font-semibold">{p.name}</span><span className="text-navy-3"> · {p.current?.version_label ?? `v${p.current?.version_number}`}</span></span><span className="text-navy-3">{p.approved_faqs} approved FAQs</span></div>)}
    </Card>
  );
}

function PendingDocs() {
  const { data, loading } = useAdmin<{ documents: any[] }>("list_documents", { status: ["review", "uploaded", "extracting", "embedding", "generating_faqs", "error"] });
  if (loading && !data) return <Skeleton className="h-40" />;
  const d = data?.documents ?? [];
  return (
    <Card className="divide-y divide-slate-100">
      {d.length === 0 ? <Empty title="Nothing waiting for review" /> : d.map((x) => <div key={x.id} className="flex justify-between items-center px-5 py-3 text-sm"><span className="truncate">{x.file_name}</span><Badge tone={statusTone(x.status)}>{x.status.replace("_", " ")}</Badge></div>)}
      {d.length > 0 && <div className="px-5 py-3"><Link to="/admin/documents"><Button size="sm" variant="secondary">Open Document Management</Button></Link></div>}
    </Card>
  );
}

function Unanswered({ policies }: { policies: any[] }) {
  const [status, setStatus] = useState("needs_review");
  const { data, loading, reload } = useAdmin<{ items: any[] }>("list_unanswered", { status: status || undefined });
  const [act, setAct] = useState<any>(null);
  const items = data?.items ?? [];
  const act_ = async (mode: string, extra: Record<string, unknown> = {}) => { const r = await run("resolve_unanswered", { id: act.id, mode, ...extra }, mode === "answer" ? "Answer approved and added to the knowledge base" : "Updated"); if (r) { setAct(null); reload(); } };
  return (
    <div>
      <div className="flex justify-end mb-3"><Select className="w-48" value={status} onChange={(e) => setStatus(e.target.value)}><option value="needs_review">Needs review</option><option value="answered">Answered</option><option value="linked">Linked to policy</option><option value="unsupported">Unsupported</option><option value="">All</option></Select></div>
      <Card className="divide-y divide-slate-100">
        {loading && !data ? <div className="p-4"><Skeleton className="h-24" /></div> : items.length === 0 ? <Empty title="No questions in this list" text="Questions the assistant can't answer reliably will appear here." />
          : items.map((u) => (
            <button key={u.id} onClick={() => setAct({ ...u, answer: u.approved_answer ?? "", policy_id: u.linked_policy_id ?? "", q: u.question })} className="w-full text-left flex gap-3 px-5 py-3 hover:bg-slate-50">
              <div className="flex-1 min-w-0"><p className="font-semibold">{u.question}</p><p className="text-xs text-navy-3 mt-0.5">{u.topic || "No topic"} · Last asked {fmtDateTime(u.last_asked_at)}</p></div>
              <div className="flex items-start gap-2">{u.ask_count > 1 && <Badge tone="orange"><Flame className="h-3 w-3" />Asked {u.ask_count}×</Badge>}<Badge tone={statusTone(u.status)}>{u.status.replace("_", " ")}</Badge></div>
            </button>))}
      </Card>
      {act && <Modal open onClose={() => setAct(null)} title="Review unanswered question" wide>
        <p className="font-bold text-lg">{act.question}</p>
        <p className="text-sm text-navy-3 mt-1">Asked {act.ask_count} time(s){act.ask_count > 1 ? ", a frequently requested knowledge gap" : ""} · Confidence: {act.confidence}</p>
        <p className="font-semibold text-sm mt-5 mb-2">Closest matching content</p>
        {(act.closest_content ?? []).length === 0 ? <p className="text-sm text-navy-3">No related content was found.</p> :
          <div className="space-y-2">{act.closest_content.map((c: any, i: number) => <div key={i} className="rounded-lg bg-paper p-3 text-sm"><p className="text-xs font-semibold text-navy-3">{c.policy_name}{c.section ? `, ${c.section}` : ""} · score {c.score}</p><p className="mt-1 whitespace-pre-wrap">{c.excerpt}</p></div>)}</div>}
        <div className="grid sm:grid-cols-2 gap-3 mt-5">
          <Field label="Policy to link or file the answer under"><Select value={act.policy_id} onChange={(e) => setAct({ ...act, policy_id: e.target.value })}><option value="">Choose a policy</option>{policies.filter((p) => p.current_version_id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
          <Field label="FAQ question wording"><Input value={act.q} onChange={(e) => setAct({ ...act, q: e.target.value })} /></Field>
        </div>
        <Field label="Approved answer" hint="Saved as an approved FAQ so the assistant can use it immediately" className="mt-3"><Textarea value={act.answer} onChange={(e) => setAct({ ...act, answer: e.target.value })} /></Field>
        <div className="flex flex-wrap gap-2 mt-5 justify-end">
          <Button variant="danger" onClick={() => act_("unsupported")}>Mark as unsupported</Button>
          <Button variant="secondary" disabled={!act.policy_id} onClick={() => act_("link", { policy_id: act.policy_id })}>Link existing policy</Button>
          <Button disabled={!act.policy_id || !act.answer.trim()} onClick={() => act_("answer", { policy_id: act.policy_id, answer: act.answer, question: act.q, create_faq: true })}>Add approved answer and create FAQ</Button>
        </div>
      </Modal>}
    </div>
  );
}

function LowConfidence() {
  const [lv, setLv] = useState("low,medium");
  const { data, loading } = useAdmin<{ items: any[] }>("low_confidence", { levels: lv.split(",") });
  return (
    <div>
      <div className="flex justify-end mb-3"><Select className="w-48" value={lv} onChange={(e) => setLv(e.target.value)}><option value="low,medium">Low and medium</option><option value="low">Low only</option><option value="medium">Medium (closest match)</option></Select></div>
      <Card className="divide-y divide-slate-100">
        {loading && !data ? <div className="p-4"><Skeleton className="h-24" /></div> : !data?.items.length ? <Empty title="No low confidence answers" />
          : data.items.map((i) => (
            <details key={i.id} className="px-5 py-3">
              <summary className="cursor-pointer flex gap-2 items-start"><Badge tone={statusTone(i.confidence)}>{i.confidence}</Badge><span className="font-semibold">{i.question || "(question unavailable)"}</span><span className="ml-auto text-xs text-navy-3 whitespace-nowrap">{fmtDateTime(i.created_at)}</span></summary>
              <div className="mt-2 text-sm"><Md>{i.answer}</Md>{i.unanswered_parts && <p className="text-amber-800 mt-1">Not covered: {i.unanswered_parts}</p>}{i.sources.length > 0 && <p className="text-xs text-navy-3 mt-1">Sources: {i.sources.join(", ")}</p>}</div>
            </details>))}
      </Card>
    </div>
  );
}

function Feedback() {
  const { data, loading } = useAdmin<{ items: any[] }>("feedback_list");
  const items = data?.items ?? [];
  const pos = items.filter((x) => x.helpful).length;
  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <Card className="p-5"><p className="font-bold mb-2">Helpfulness</p>
        {items.length ? <div className="h-56"><ResponsiveContainer><PieChart><Pie data={[{ name: "Helpful", value: pos }, { name: "Not helpful", value: items.length - pos }]} dataKey="value" innerRadius={50} outerRadius={80}><Cell fill={CHART.green} /><Cell fill={CHART.orange} /></Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer></div> : <Empty title="No feedback yet" />}
      </Card>
      <Card className="lg:col-span-2 divide-y divide-slate-100">
        {loading && !data ? <div className="p-4"><Skeleton className="h-24" /></div> : items.length === 0 ? <Empty title="No feedback yet" />
          : items.map((f) => <div key={f.id} className="px-5 py-3 flex gap-3 text-sm">{f.helpful ? <ThumbsUp className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" /> : <ThumbsDown className="h-4 w-4 text-brand shrink-0 mt-0.5" />}
            <div className="min-w-0"><p className="line-clamp-2">{f.chat_messages?.content}</p><p className="text-xs text-navy-3 mt-0.5">{fmtDateTime(f.created_at)} · confidence {f.chat_messages?.confidence}{f.comment ? ` · “${f.comment}”` : ""}</p></div></div>)}
      </Card>
    </div>
  );
}

function Escalations() {
  const { data, loading } = useAdmin<{ by_category: any[]; recent: any[] }>("escalations");
  if (loading && !data) return <Skeleton className="h-40" />;
  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <Card className="p-5"><p className="font-bold mb-3">Escalations by category</p>
        {data?.by_category.length ? data.by_category.map((c) => <div key={c.name} className="flex justify-between text-sm py-1.5 border-t border-slate-100"><span>{CONTACT_CATEGORIES[c.name] ?? c.name}</span><b>{c.value}</b></div>) : <Empty title="No escalations yet" />}
      </Card>
      <Card className="lg:col-span-2 divide-y divide-slate-100">
        {data?.recent.map((m) => <div key={m.id} className="px-5 py-2.5 text-sm flex justify-between gap-3"><span>{m.topic || "General"} → <b>{m.contact?.name}</b></span><span className="text-xs text-navy-3">{fmtDateTime(m.created_at)}</span></div>)}
      </Card>
    </div>
  );
}
