import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { diffLines } from "diff";
import { Upload, Eye, Trash2, RefreshCw, FileText, CheckCircle2, AlertCircle, Loader2, ExternalLink } from "lucide-react";
import { Badge, Button, Card, Confirm, Empty, Field, Input, Modal, PageHeader, Select, Skeleton, Tabs, Textarea, statusTone, Notice } from "@/components/ui";
import { Md } from "@/components/Shared";
import { useAdmin, run } from "./common";
import { ingestFile, indexVersion, processOne, type Step } from "./pipeline";
import { adminApi } from "@/lib/api";
import { CATEGORIES, fmtDateTime, cn } from "@/lib/format";
import { Link } from "react-router-dom";

const ACCEPT = ".pdf,.doc,.docx,.txt,.md,.xlsx,.xls,.csv,.json,.zip";
const KINDS: Record<string, string> = { policy: "Policy document", tax_rule: "Income Tax Rules", pf_rule: "PF Rules", other: "Other reference" };

export default function Documents() {
  const { data, loading, reload } = useAdmin<{ documents: any[] }>("list_documents");
  const { data: pols } = useAdmin<{ policies: any[] }>("list_policies");
  const [tab, setTab] = useState("all");
  const [upOpen, setUpOpen] = useState(false);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [del, setDel] = useState<any>(null);
  const docs = data?.documents ?? [];
  const filtered = useMemo(() => docs.filter((d) => tab === "all" ? true : tab === "review" ? d.status === "review" : tab === "processing" ? ["uploaded", "extracting", "embedding", "generating_faqs"].includes(d.status) : tab === "error" ? d.status === "error" : d.status === "published"), [docs, tab]);
  const count = (f: (d: any) => boolean) => docs.filter(f).length;

  const retry = async (d: any) => {
    const t = toast.loading(`Processing ${d.file_name}`);
    try { await processOne(d.id, d.file_name, (s) => toast.loading(`${d.file_name}: ${s.stage}`, { id: t }), d.policy_id); toast.success("Ready for review", { id: t }); }
    catch (e) { toast.error((e as Error).message, { id: t }); }
    reload();
  };
  return (
    <div>
      <PageHeader title="Document Management" text="Upload policies and rule files. Every document is extracted, indexed and turned into suggested FAQs, then waits for your review before employees can see it."
        actions={<><Button variant="secondary" onClick={reload}><RefreshCw className="h-4 w-4" />Refresh</Button><Button onClick={() => setUpOpen(true)}><Upload className="h-4 w-4" />Upload documents</Button></>} />
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: "all", label: "All", count: docs.length }, { id: "review", label: "Needs review", count: count((d) => d.status === "review") },
        { id: "processing", label: "Processing", count: count((d) => ["uploaded", "extracting", "embedding", "generating_faqs"].includes(d.status)) },
        { id: "published", label: "Published", count: count((d) => d.status === "published") }, { id: "error", label: "Errors", count: count((d) => d.status === "error") }]} />
      <Card className="overflow-x-auto">
        {loading && !data ? <div className="p-4 space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}</div>
          : filtered.length === 0 ? <Empty icon={FileText} title="No documents here" text="Upload Policy.zip and Income Tax calculator Rule.txt to get started." action={<Button onClick={() => setUpOpen(true)}>Upload documents</Button>} />
          : <table className="w-full text-sm min-w-[760px]">
            <thead><tr className="text-left text-xs text-navy-3 border-b border-slate-100"><th className="px-4 py-3">File</th><th>Type</th><th>Policy</th><th>Status</th><th>Uploaded</th><th className="text-right px-4">Actions</th></tr></thead>
            <tbody>{filtered.map((d) => (
              <tr key={d.id} className="border-b border-slate-50 align-top">
                <td className="px-4 py-3"><p className="font-semibold">{d.file_name}</p>{d.error && <p className={cn("text-xs mt-0.5", d.status === "error" ? "text-red-600" : "text-amber-700")}>{d.error}</p>}{d.parent_document_id && <p className="text-xs text-navy-3">From ZIP</p>}</td>
                <td className="py-3">{KINDS[d.kind]}</td>
                <td className="py-3">{d.policies?.name ?? "—"}</td>
                <td className="py-3"><Badge tone={statusTone(d.status)}>{d.file_name.toLowerCase().endsWith(".zip") && d.status === "published" ? "extracted" : d.status.replace("_", " ")}</Badge></td>
                <td className="py-3 text-navy-3">{fmtDateTime(d.created_at)}</td>
                <td className="py-3 px-4"><div className="flex justify-end gap-1">
                  {d.kind === "policy" && ["review", "published", "rejected"].includes(d.status) && <Button size="sm" variant="secondary" onClick={() => setReviewId(d.id)}><Eye className="h-4 w-4" />Review</Button>}
                  {d.kind !== "policy" && d.status === "review" && <Link to="/admin/calculators"><Button size="sm" variant="secondary">Review rules</Button></Link>}
                  {["error", "uploaded"].includes(d.status) && !d.file_name.toLowerCase().endsWith(".zip") && <Button size="sm" variant="secondary" onClick={() => retry(d)}><RefreshCw className="h-4 w-4" />Process</Button>}
                  <Button size="sm" variant="ghost" aria-label="Open file" onClick={async () => { const r = await run("document_url", { document_id: d.id }); if (r) window.open((r as any).url, "_blank"); }}><ExternalLink className="h-4 w-4" /></Button>
                  {d.status !== "published" && <Button size="sm" variant="ghost" aria-label="Delete" onClick={() => setDel(d)}><Trash2 className="h-4 w-4" /></Button>}
                </div></td>
              </tr>))}</tbody>
          </table>}
      </Card>
      <UploadDialog open={upOpen} onClose={() => { setUpOpen(false); reload(); }} policies={pols?.policies ?? []} />
      {reviewId && <ReviewDialog documentId={reviewId} onClose={() => { setReviewId(null); reload(); }} />}
      <Confirm open={!!del} onClose={() => setDel(null)} title="Delete document?" message={`"${del?.file_name}" and any unpublished version created from it will be removed.`} confirmLabel="Delete" danger
        onConfirm={async () => { await run("delete_document", { document_id: del.id }, "Document deleted"); setDel(null); reload(); }} />
    </div>
  );
}

export function UploadDialog({ open, onClose, policies, presetPolicy }: { open: boolean; onClose: () => void; policies: any[]; presetPolicy?: string }) {
  const [files, setFiles] = useState<File[]>([]);
  const [kind, setKind] = useState("policy");
  const [target, setTarget] = useState(presetPolicy ?? "");
  const [steps, setSteps] = useState<Record<string, Step>>({});
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const report = (s: Step) => setSteps((x) => ({ ...x, [s.file]: s }));
  const start = async () => {
    setBusy(true); setSteps({});
    for (const f of files) {
      try { await ingestFile(f, kind, report, target || null); }
      catch (e) { report({ file: f.name, stage: "Failed", pct: 100, error: (e as Error).message, done: true }); }
    }
    setBusy(false); toast.success("Processing finished. Review documents before publishing.");
  };
  const close = () => { if (busy) return; setFiles([]); setSteps({}); onClose(); };
  return (
    <Modal open={open} onClose={close} title={presetPolicy ? "Upload a new version" : "Upload documents"}
      footer={<><Button variant="secondary" onClick={close} disabled={busy}>Close</Button><Button onClick={start} loading={busy} disabled={!files.length || Object.keys(steps).length > 0}>Upload and process</Button></>}>
      <div className="space-y-4">
        <button onClick={() => input.current?.click()} className="w-full rounded-xl border-2 border-dashed border-slate-300 hover:border-brand p-6 text-center"
          onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); setFiles([...files, ...Array.from(e.dataTransfer.files)]); }}>
          <Upload className="h-6 w-6 mx-auto text-brand" /><p className="font-semibold mt-2">Drop files here or browse</p><p className="text-xs text-navy-3">PDF, DOC, DOCX, TXT, XLSX, CSV, JSON or ZIP, up to 50 MB each</p>
        </button>
        <input ref={input} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => setFiles([...files, ...Array.from(e.target.files ?? [])])} />
        {!presetPolicy && <div className="grid grid-cols-2 gap-3">
          <Field label="Document type" hint="Files named like “Income Tax … Rule” inside a ZIP are detected automatically"><Select value={kind} onChange={(e) => setKind(e.target.value)}>{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          {kind === "policy" && <Field label="Update existing policy" hint="Leave empty to match by title"><Select value={target} onChange={(e) => setTarget(e.target.value)}><option value="">Auto-detect</option>{policies.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>}
        </div>}
        {files.length > 0 && <div className="space-y-2">{files.map((f) => { const s = steps[f.name]; return (
          <div key={f.name} className="rounded-lg border border-slate-200 px-3 py-2">
            <div className="flex justify-between text-sm gap-2"><span className="font-semibold truncate">{f.name}</span>{s?.done ? (s.stage === "Failed" ? <AlertCircle className="h-4 w-4 text-red-600" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />) : s ? <Loader2 className="h-4 w-4 animate-spin text-brand" /> : null}</div>
            {s && <><div className="h-1.5 bg-slate-100 rounded-full mt-2"><div className="h-full bg-brand rounded-full transition-all" style={{ width: `${s.pct}%` }} /></div><p className={cn("text-xs mt-1", s.error ? "text-red-600" : "text-navy-3")}>{s.stage}{s.error ? `: ${s.error}` : ""}</p></>}
          </div>); })}
          {Object.values(steps).filter((s) => !files.find((f) => f.name === s.file)).map((s) => (
            <div key={s.file} className="rounded-lg border border-slate-200 px-3 py-2 ml-4">
              <div className="flex justify-between text-sm"><span className="truncate">{s.file}</span>{s.done ? (s.stage === "Failed" ? <AlertCircle className="h-4 w-4 text-red-600" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />) : <Loader2 className="h-4 w-4 animate-spin text-brand" />}</div>
              <div className="h-1.5 bg-slate-100 rounded-full mt-2"><div className="h-full bg-brand rounded-full" style={{ width: `${s.pct}%` }} /></div>
              <p className={cn("text-xs mt-1", s.error ? "text-red-600" : "text-navy-3")}>{s.stage}{s.error ? `: ${s.error}` : ""}</p>
            </div>))}
        </div>}
      </div>
    </Modal>
  );
}

export function DiffView({ oldText, newText }: { oldText: string; newText: string }) {
  const parts = useMemo(() => diffLines(oldText ?? "", newText ?? ""), [oldText, newText]);
  return (
    <div className="rounded-xl border border-slate-200 text-sm font-[inherit] max-h-[50vh] overflow-y-auto">
      {parts.map((p, i) => p.added || p.removed
        ? <div key={i} className={cn("px-3 py-1 whitespace-pre-wrap border-l-4", p.added ? "bg-emerald-50 border-emerald-500" : "bg-red-50 border-red-400 line-through decoration-red-300")}>{p.value}</div>
        : <details key={i} className="px-3 py-1 text-navy-3"><summary className="cursor-pointer text-xs">{p.count} unchanged lines</summary><div className="whitespace-pre-wrap">{p.value}</div></details>)}
    </div>
  );
}

function ReviewDialog({ documentId, onClose }: { documentId: string; onClose: () => void }) {
  const { data, loading, reload } = useAdmin<any>("review_document", { document_id: documentId });
  const [tab, setTab] = useState("details");
  const [meta, setMeta] = useState<any>(null);
  const [text, setText] = useState<string | null>(null);
  const [approveFaqs, setApproveFaqs] = useState(true);
  const [busy, setBusy] = useState(false);
  const v = data?.version;
  const m = meta ?? (v ? { title: v.title, category: v.category, version_label: v.version_label, effective_date: v.effective_date ?? "", description: data.policy?.description ?? "" } : null);
  const pending = v?.approval_status === "pending";
  const indexed = data && data.chunks > 0 && data.embedded >= data.chunks;

  const saveText = async () => { setBusy(true); const r = await run("update_extracted_text", { version_id: v.id, text }, "Text saved. Re-indexing…"); if (r) await indexVersion(v.id).catch((e) => toast.error(e.message)); setBusy(false); setText(null); reload(); };
  const publish = async () => { setBusy(true); const r = await run("publish_version", { version_id: v.id, metadata: m, approve_faqs: approveFaqs, activate: true }, "Published. Employees can now use this version."); setBusy(false); if (r) onClose(); };
  const reject = async () => { setBusy(true); await run("reject_version", { version_id: v.id }, "Version rejected"); setBusy(false); onClose(); };

  return (
    <Modal open onClose={onClose} title={v ? `Review: ${v.title}` : "Review document"} wide
      footer={pending ? <><Button variant="danger" onClick={reject} disabled={busy}>Reject</Button>
        {!indexed && <Button variant="secondary" loading={busy} onClick={async () => { setBusy(true); await indexVersion(v.id).catch((e) => toast.error(e.message)); setBusy(false); reload(); }}>Run indexing</Button>}
        <Button onClick={publish} loading={busy} disabled={!indexed}>Approve and publish</Button></> : <Button variant="secondary" onClick={onClose}>Close</Button>}>
      {loading && !data ? <Skeleton className="h-80" /> : !v ? <Empty title="No extracted version for this document" /> : <>
        <div className="flex flex-wrap gap-2 mb-4 text-xs">
          <Badge tone={statusTone(v.approval_status)}>{v.approval_status}</Badge><Badge>Version {v.version_number}</Badge>
          <Badge tone={indexed ? "green" : "amber"}>{data.embedded}/{data.chunks} sections indexed</Badge><Badge>{data.faqs.length} suggested FAQs</Badge>
          {data.previous && <Badge tone="blue">Updates v{data.previous.version_number}</Badge>}
        </div>
        {data.document?.error && <div className="mb-4"><Notice>{data.document.error}</Notice></div>}
        <Tabs value={tab} onChange={setTab} tabs={[{ id: "details", label: "Details" }, { id: "text", label: "Extracted text" }, ...(data.previous ? [{ id: "changes", label: "Changes" }] : []), { id: "faqs", label: "Suggested FAQs", count: data.faqs.length }]} />
        {tab === "details" && m && <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Policy title"><Input disabled={!pending} value={m.title ?? ""} onChange={(e) => setMeta({ ...m, title: e.target.value })} /></Field>
          <Field label="Category"><Select disabled={!pending} value={m.category ?? ""} onChange={(e) => setMeta({ ...m, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
          <Field label="Version label"><Input disabled={!pending} value={m.version_label ?? ""} onChange={(e) => setMeta({ ...m, version_label: e.target.value })} /></Field>
          <Field label="Effective date"><Input disabled={!pending} type="date" value={m.effective_date ?? ""} onChange={(e) => setMeta({ ...m, effective_date: e.target.value })} /></Field>
          <Field label="Short description" className="sm:col-span-2"><Textarea disabled={!pending} value={m.description ?? ""} onChange={(e) => setMeta({ ...m, description: e.target.value })} /></Field>
          {pending && <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" className="accent-brand h-4 w-4" checked={approveFaqs} onChange={(e) => setApproveFaqs(e.target.checked)} />Also approve all {data.faqs.filter((f: any) => f.status === "pending").length} suggested FAQs (you can edit them later in FAQ management)</label>}
        </div>}
        {tab === "text" && (text === null
          ? <><div className="rounded-xl bg-paper p-4 text-sm whitespace-pre-wrap max-h-[50vh] overflow-y-auto">{v.extracted_text}</div>{pending && <Button className="mt-3" variant="secondary" onClick={() => setText(v.extracted_text)}>Correct extracted text</Button>}</>
          : <><Textarea className="min-h-[50vh] text-sm" value={text} onChange={(e) => setText(e.target.value)} /><div className="flex gap-2 mt-3"><Button loading={busy} onClick={saveText}>Save and re-index</Button><Button variant="secondary" onClick={() => setText(null)}>Cancel</Button></div></>)}
        {tab === "changes" && data.previous && <>{v.change_summary && <div className="rounded-xl bg-brand-soft p-4 mb-4"><p className="font-semibold text-sm mb-1">Summary of changes</p><Md>{v.change_summary}</Md></div>}<DiffView oldText={data.previous.extracted_text} newText={v.extracted_text} /></>}
        {tab === "faqs" && (data.faqs.length === 0 ? <Empty title="No FAQs generated" text="Generate FAQs from Policy Management after publishing." /> :
          <div className="divide-y divide-slate-100">{data.faqs.map((f: any) => <div key={f.id} className="py-3"><p className="font-semibold">{f.question} <Badge tone={statusTone(f.status)}>{f.status}</Badge></p><p className="text-sm text-navy-3 mt-1">{f.short_answer}</p>{f.section && <p className="text-xs text-navy-3 mt-1">Section: {f.section}</p>}</div>)}</div>)}
      </>}
    </Modal>
  );
}
