import { embedFaqsFor } from "./pipeline";
import { useState } from "react";
import { toast } from "sonner";
import { Upload, Sparkles, ListChecks, History, Archive, Power, Pencil, GitCompare, RotateCcw } from "lucide-react";
import { Badge, Button, Card, Confirm, Empty, Field, Input, Modal, PageHeader, Select, Skeleton, Textarea, statusTone } from "@/components/ui";
import { Md } from "@/components/Shared";
import { useAdmin, run } from "./common";
import { UploadDialog, DiffView } from "./Documents";
import { FaqManager } from "./Faqs";
import { adminApi } from "@/lib/api";
import { CATEGORIES, fmtDate, fmtDateTime } from "@/lib/format";

export default function Policies() {
  const { data, loading, reload } = useAdmin<{ policies: any[] }>("list_policies");
  const [filter, setFilter] = useState("all");
  const [confirm, setConfirm] = useState<{ p: any; status: string } | null>(null);
  const [qa, setQa] = useState<any>(null);
  const [versions, setVersions] = useState<any>(null);
  const [edit, setEdit] = useState<any>(null);
  const [gen, setGen] = useState<string | null>(null);
  const list = (data?.policies ?? []).filter((p) => filter === "all" ? p.status !== "archived" : p.status === filter);

  const generate = async (p: any) => {
    setGen(p.id);
    const r = await run("generate_faqs", { policy_id: p.id });
    if (r) {
      if ((r as any).version_id) await embedFaqsFor((r as any).version_id);
      toast.success(`${(r as any).created} FAQs generated. Review them in Edit Q&A.`);
    }
    setGen(null); reload();
  };
  return (
    <div>
      <PageHeader title="Policy Management" text="Control which policies employees and the assistant can use. Deactivated and archived policies never appear in new AI answers."
        actions={<Select className="w-44" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">All current</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="draft">Awaiting approval</option><option value="archived">Archived</option></Select>} />
      {loading && !data ? <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28" />)}</div>
        : list.length === 0 ? <Card><Empty title="No policies in this view" text="Upload documents in Document Management to create policies." /></Card>
        : <div className="space-y-3">{list.map((p) => (
          <Card key={p.id} className="p-5 flex flex-col lg:flex-row lg:items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap"><p className="font-bold text-lg">{p.name}</p><Badge tone="orange">{p.category}</Badge></div>
              <p className="text-sm text-navy-3 mt-1">Version: {p.current ? (p.current.version_label ?? `v${p.current.version_number}`) : "not published"} · Status: <Badge tone={statusTone(p.status)}>{p.status === "draft" ? "awaiting approval" : p.status}</Badge> · {p.approved_faqs} Q&As{p.pending_faqs ? ` (${p.pending_faqs} pending)` : ""}{p.pending_versions ? ` · ${p.pending_versions} version awaiting review` : ""}</p>
              {p.current?.published_at && <p className="text-xs text-navy-3 mt-0.5">Published {fmtDate(p.current.published_at)}{p.current.effective_date ? ` · Effective ${fmtDate(p.current.effective_date)}` : ""}</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              {p.status === "active" ? <Button size="sm" variant="secondary" onClick={() => setConfirm({ p, status: "inactive" })}><Power className="h-4 w-4" />Deactivate</Button>
                : p.status !== "draft" && <Button size="sm" variant="secondary" onClick={() => setConfirm({ p, status: "active" })}><Power className="h-4 w-4" />Activate</Button>}
              {p.status !== "archived" && p.status !== "draft" && <Button size="sm" variant="secondary" onClick={() => setConfirm({ p, status: "archived" })}><Archive className="h-4 w-4" />Archive</Button>}
              <Button size="sm" variant="secondary" loading={gen === p.id} disabled={!p.current_version_id} onClick={() => generate(p)}><Sparkles className="h-4 w-4" />Generate FAQs</Button>
              <Button size="sm" variant="secondary" onClick={() => setQa(p)}><ListChecks className="h-4 w-4" />Edit Q&A</Button>
              <Button size="sm" variant="secondary" onClick={() => setVersions(p)}><History className="h-4 w-4" />Versions</Button>
              <Button size="sm" variant="ghost" aria-label="Edit details" onClick={() => setEdit({ ...p })}><Pencil className="h-4 w-4" /></Button>
            </div>
          </Card>))}</div>}

      <Confirm open={!!confirm} onClose={() => setConfirm(null)}
        title={confirm?.status === "inactive" ? "Deactivate policy?" : confirm?.status === "archived" ? "Archive policy?" : "Activate policy?"}
        message={confirm?.status === "inactive" ? "The assistant stops using this policy for new answers, and it disappears from the employee library. You can activate it again later."
          : confirm?.status === "archived" ? "The policy is removed from the employee library and AI answers. Its versions and history are kept." : "Employees and the assistant will use the current approved version."}
        confirmLabel={confirm?.status === "inactive" ? "Deactivate" : confirm?.status === "archived" ? "Archive" : "Activate"} danger={confirm?.status !== "active"}
        onConfirm={async () => { await run("set_policy_status", { policy_id: confirm!.p.id, status: confirm!.status }, "Policy updated"); setConfirm(null); reload(); }} />
      {qa && <Modal open onClose={() => { setQa(null); reload(); }} title={`Q&A: ${qa.name}`} wide><FaqManager policyId={qa.id} policies={data?.policies ?? []} /></Modal>}
      {versions && <VersionsDialog policy={versions} onClose={() => { setVersions(null); reload(); }} policies={data?.policies ?? []} />}
      {edit && <Modal open onClose={() => setEdit(null)} title="Edit policy details"
        footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button onClick={async () => { await run("update_policy", { policy_id: edit.id, name: edit.name, category: edit.category, description: edit.description, downloadable: edit.downloadable }, "Policy saved"); setEdit(null); reload(); }}>Save changes</Button></>}>
        <div className="space-y-4">
          <Field label="Name"><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
          <Field label="Category"><Select value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
          <Field label="Short description"><Textarea value={edit.description ?? ""} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-brand h-4 w-4" checked={edit.downloadable} onChange={(e) => setEdit({ ...edit, downloadable: e.target.checked })} />Employees can download the original file</label>
        </div>
      </Modal>}
    </div>
  );
}

function VersionsDialog({ policy, onClose, policies }: { policy: any; onClose: () => void; policies: any[] }) {
  const { data, loading, reload } = useAdmin<{ versions: any[] }>("list_versions", { policy_id: policy.id });
  const [cmp, setCmp] = useState<{ a: any; b: any } | null>(null);
  const [up, setUp] = useState(false);
  const vs = data?.versions ?? [];
  const compare = async (v: any) => {
    const prev = vs.find((x) => x.version_number < v.version_number);
    if (!prev) return toast.info("This is the first version.");
    const r = await adminApi<{ versions: any[] }>("version_text", { version_ids: [v.id, prev.id] });
    setCmp({ a: r.versions.find((x) => x.id === prev.id), b: r.versions.find((x) => x.id === v.id) });
  };
  return (
    <Modal open onClose={onClose} title={`Versions: ${policy.name}`} wide footer={<Button onClick={() => setUp(true)}><Upload className="h-4 w-4" />Upload new version</Button>}>
      {loading && !data ? <Skeleton className="h-40" /> : cmp ? <>
        <Button size="sm" variant="ghost" className="mb-3" onClick={() => setCmp(null)}>Back to versions</Button>
        <p className="text-sm mb-2">Comparing v{cmp.a.version_number} → v{cmp.b.version_number}. Green lines were added, red lines removed.</p>
        <DiffView oldText={cmp.a.extracted_text} newText={cmp.b.extracted_text} />
      </> : <div className="overflow-x-auto"><table className="w-full text-sm min-w-[720px]">
        <thead><tr className="text-left text-xs text-navy-3 border-b"><th className="py-2">Version</th><th>Uploaded</th><th>Last modified</th><th>Updated by</th><th>Approval</th><th>Change summary</th><th /></tr></thead>
        <tbody>{vs.map((v) => (
          <tr key={v.id} className="border-b border-slate-50 align-top">
            <td className="py-3 font-semibold">{v.version_label ?? `v${v.version_number}`}{v.id === policy.current_version_id && <Badge tone="green" className="ml-1">current</Badge>}<p className="text-xs text-navy-3 font-normal">{v.documents?.file_name}</p></td>
            <td className="py-3">{fmtDateTime(v.created_at)}</td><td className="py-3">{fmtDateTime(v.updated_at)}</td><td className="py-3 text-xs">{v.updated_by}</td>
            <td className="py-3"><Badge tone={statusTone(v.approval_status)}>{v.approval_status}</Badge></td>
            <td className="py-3 max-w-xs text-xs">{v.change_summary ? <Md>{v.change_summary}</Md> : v.version_number === 1 ? "Initial version" : "—"}</td>
            <td className="py-3"><div className="flex gap-1 justify-end">
              {v.version_number > 1 && <Button size="sm" variant="ghost" onClick={() => compare(v)}><GitCompare className="h-4 w-4" />Compare</Button>}
              {v.approval_status === "superseded" && <Button size="sm" variant="ghost" onClick={async () => { await run("publish_version", { version_id: v.id, activate: false }, "Version restored"); reload(); }}><RotateCcw className="h-4 w-4" />Restore</Button>}
            </div></td>
          </tr>))}</tbody></table>
        {vs.some((v) => v.approval_status === "pending") && <p className="text-xs text-navy-3 mt-3">Pending versions are reviewed and published from Document Management.</p>}
      </div>}
      <UploadDialog open={up} presetPolicy={policy.id} policies={policies} onClose={() => { setUp(false); reload(); }} />
    </Modal>
  );
}
