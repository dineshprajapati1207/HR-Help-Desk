import { useState } from "react";
import { Plus, Check, X, Trash2, Pencil, History } from "lucide-react";
import { Badge, Button, Card, Confirm, Empty, Field, Input, Modal, PageHeader, Select, Skeleton, Textarea, statusTone } from "@/components/ui";
import { useAdmin, run } from "./common";
import { fmtDateTime } from "@/lib/format";

export default function Faqs() {
  const { data } = useAdmin<{ policies: any[] }>("list_policies");
  return (
    <div>
      <PageHeader title="FAQ & Q&A Management" text="Review AI-suggested FAQs, write your own and control what employees see. Only approved FAQs on active policies are shown." />
      <FaqManager policies={data?.policies ?? []} />
    </div>
  );
}

export function FaqManager({ policyId, policies, initialStatus }: { policyId?: string; policies: any[]; initialStatus?: string }) {
  const [status, setStatus] = useState(initialStatus ?? (policyId ? "" : "pending"));
  const [pol, setPol] = useState(policyId ?? "");
  const [q, setQ] = useState("");
  const { data, loading, reload } = useAdmin<{ faqs: any[] }>("list_faqs", { policy_id: pol || undefined, status: status || undefined });
  const [edit, setEdit] = useState<any>(null);
  const [del, setDel] = useState<any>(null);
  const [hist, setHist] = useState<any[] | null>(null);
  const [sel, setSel] = useState<string[]>([]);
  const faqs = (data?.faqs ?? []).filter((f) => !q || `${f.question} ${f.short_answer}`.toLowerCase().includes(q.toLowerCase()));
  const bulk = async (s: string) => { await run("set_faq_status", { ids: sel, status: s }, `${sel.length} FAQs ${s}`); setSel([]); reload(); };
  const save = async () => {
    const r = await run("upsert_faq", { ...edit, related_questions: String(edit.related ?? "").split("\n").map((s: string) => s.trim()).filter(Boolean) }, "FAQ saved");
    if (r) { setEdit(null); reload(); }
  };
  return (
    <div>
      <div className="flex flex-col md:flex-row gap-2 mb-4">
        <Input className="md:flex-1" placeholder="Search questions" value={q} onChange={(e) => setQ(e.target.value)} />
        {!policyId && <Select className="md:w-56" value={pol} onChange={(e) => setPol(e.target.value)}><option value="">All policies</option>{policies.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>}
        <Select className="md:w-44" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option><option value="pending">Pending review</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="superseded">Superseded</option></Select>
        <Button onClick={() => setEdit({ policy_id: pol || policies[0]?.id, question: "", short_answer: "", detailed_answer: "", section: "", related: "", status: "approved" })}><Plus className="h-4 w-4" />Add Q&A</Button>
      </div>
      {sel.length > 0 && <div className="flex items-center gap-2 mb-3 text-sm"><span className="font-semibold">{sel.length} selected</span><Button size="sm" onClick={() => bulk("approved")}><Check className="h-4 w-4" />Approve</Button><Button size="sm" variant="danger" onClick={() => bulk("rejected")}><X className="h-4 w-4" />Reject</Button></div>}
      <Card className="divide-y divide-slate-100">
        {loading && !data ? <div className="p-4 space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>
          : faqs.length === 0 ? <Empty title="No FAQs here" text="Generate FAQs from a policy or add one manually." />
          : <>
            <label className="flex items-center gap-2 px-4 py-2 text-xs text-navy-3"><input type="checkbox" className="accent-brand" checked={sel.length === faqs.length} onChange={(e) => setSel(e.target.checked ? faqs.map((f) => f.id) : [])} />Select all</label>
            {faqs.map((f) => (
              <div key={f.id} className="flex gap-3 px-4 py-3">
                <input type="checkbox" className="accent-brand mt-1.5" checked={sel.includes(f.id)} onChange={(e) => setSel(e.target.checked ? [...sel, f.id] : sel.filter((x) => x !== f.id))} aria-label="Select FAQ" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold">{f.question}</p>
                  <p className="text-sm text-navy-3 mt-0.5 line-clamp-2">{f.short_answer}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-navy-3"><Badge tone={statusTone(f.status)}>{f.status}</Badge><span>{f.policies?.name}</span>{f.section && <span>· {f.section}</span>}<span>· {f.source === "ai" ? "AI suggested" : f.source === "knowledge_gap" ? "From knowledge gap" : "Admin"}</span><span>· {f.view_count} views</span><span>· {fmtDateTime(f.updated_at)}</span></div>
                </div>
                <div className="flex gap-1 shrink-0">
                  {f.status === "pending" && <Button size="sm" variant="ghost" aria-label="Approve" onClick={async () => { await run("set_faq_status", { ids: [f.id], status: "approved" }, "Approved"); reload(); }}><Check className="h-4 w-4 text-emerald-600" /></Button>}
                  <Button size="sm" variant="ghost" aria-label="Edit" onClick={() => setEdit({ ...f, related: (f.related_questions ?? []).join("\n") })}><Pencil className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" aria-label="History" onClick={async () => { const r: any = await run("faq_history", { faq_id: f.id }); setHist(r?.history ?? []); }}><History className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" aria-label="Delete" onClick={() => setDel(f)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>))}
          </>}
      </Card>
      {edit && <Modal open onClose={() => setEdit(null)} title={edit.id ? "Edit Q&A" : "Add Q&A"} footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button onClick={save}>Save Q&A</Button></>}>
        <div className="space-y-3">
          <Field label="Policy"><Select value={edit.policy_id} onChange={(e) => setEdit({ ...edit, policy_id: e.target.value })}>{policies.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
          <Field label="Question"><Input value={edit.question} onChange={(e) => setEdit({ ...edit, question: e.target.value })} /></Field>
          <Field label="Short answer"><Textarea className="min-h-[60px]" value={edit.short_answer ?? ""} onChange={(e) => setEdit({ ...edit, short_answer: e.target.value })} /></Field>
          <Field label="Detailed answer" hint="Markdown supported"><Textarea value={edit.detailed_answer ?? ""} onChange={(e) => setEdit({ ...edit, detailed_answer: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Relevant section"><Input value={edit.section ?? ""} onChange={(e) => setEdit({ ...edit, section: e.target.value })} /></Field>
            <Field label="Status"><Select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}><option value="approved">Approved</option><option value="pending">Pending</option><option value="rejected">Rejected</option></Select></Field></div>
          <Field label="Related questions" hint="One per line"><Textarea className="min-h-[60px]" value={edit.related ?? ""} onChange={(e) => setEdit({ ...edit, related: e.target.value })} /></Field>
        </div>
      </Modal>}
      <Modal open={!!hist} onClose={() => setHist(null)} title="Edit history">
        {hist?.length ? hist.map((h) => <div key={h.id} className="border-b border-slate-100 py-2 text-sm"><p className="text-xs text-navy-3">{fmtDateTime(h.created_at)} · {h.changed_by}</p><p className="font-semibold">{h.snapshot?.question}</p><p className="text-navy-3">{h.snapshot?.short_answer}</p></div>) : <p className="text-sm text-navy-3">No earlier edits.</p>}
      </Modal>
      <Confirm open={!!del} onClose={() => setDel(null)} title="Delete this Q&A?" message={del?.question ?? ""} confirmLabel="Delete" danger onConfirm={async () => { await run("delete_faq", { id: del.id }, "Deleted"); setDel(null); reload(); }} />
    </div>
  );
}
