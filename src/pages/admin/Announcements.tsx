import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Badge, Button, Card, Confirm, Empty, Field, Input, Modal, PageHeader, Select, Skeleton, Textarea } from "@/components/ui";
import { useAdmin, run } from "./common";
import { fmtDateTime } from "@/lib/format";

const toLocal = (d?: string | null) => (d ? new Date(d).toISOString().slice(0, 16) : "");
export default function Announcements() {
  const { data, loading, reload } = useAdmin<{ items: any[] }>("list_announcements");
  const [edit, setEdit] = useState<any>(null);
  const [del, setDel] = useState<any>(null);
  return (
    <div>
      <PageHeader title="Announcements" text="Shown on the employee dashboard while active and within their dates." actions={<Button onClick={() => setEdit({ title: "", body: "", priority: "normal", is_active: true, starts_at: "", ends_at: "" })}><Plus className="h-4 w-4" />New announcement</Button>} />
      <Card className="divide-y divide-slate-100">
        {loading && !data ? <Skeleton className="h-32" /> : !data?.items.length ? <Empty title="No announcements" /> : data.items.map((a) => (
          <div key={a.id} className="flex gap-3 px-5 py-4">
            <div className="flex-1 min-w-0"><p className="font-semibold">{a.title} {a.priority === "important" && <Badge tone="orange">Important</Badge>} {!a.is_active && <Badge>hidden</Badge>}</p><p className="text-sm text-navy-3 mt-1 line-clamp-2">{a.body}</p><p className="text-xs text-navy-3 mt-1">{fmtDateTime(a.starts_at)}{a.ends_at ? ` → ${fmtDateTime(a.ends_at)}` : ""}</p></div>
            <Button size="sm" variant="ghost" aria-label="Edit" onClick={() => setEdit({ ...a, starts_at: toLocal(a.starts_at), ends_at: toLocal(a.ends_at) })}><Pencil className="h-4 w-4" /></Button>
            <Button size="sm" variant="ghost" aria-label="Delete" onClick={() => setDel(a)}><Trash2 className="h-4 w-4" /></Button>
          </div>))}
      </Card>
      {edit && <Modal open onClose={() => setEdit(null)} title={edit.id ? "Edit announcement" : "New announcement"} footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button>
        <Button onClick={async () => { if (await run("upsert_announcement", { ...edit, starts_at: edit.starts_at ? new Date(edit.starts_at).toISOString() : null, ends_at: edit.ends_at ? new Date(edit.ends_at).toISOString() : null }, "Announcement saved")) { setEdit(null); reload(); } }}>Save announcement</Button></>}>
        <div className="space-y-3">
          <Field label="Title"><Input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></Field>
          <Field label="Message"><Textarea value={edit.body ?? ""} onChange={(e) => setEdit({ ...edit, body: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Starts"><Input type="datetime-local" value={edit.starts_at} onChange={(e) => setEdit({ ...edit, starts_at: e.target.value })} /></Field><Field label="Ends (optional)"><Input type="datetime-local" value={edit.ends_at} onChange={(e) => setEdit({ ...edit, ends_at: e.target.value })} /></Field></div>
          <div className="grid grid-cols-2 gap-3 items-end"><Field label="Priority"><Select value={edit.priority} onChange={(e) => setEdit({ ...edit, priority: e.target.value })}><option value="normal">Normal</option><option value="important">Important</option></Select></Field>
            <label className="flex items-center gap-2 text-sm h-10"><input type="checkbox" className="accent-brand h-4 w-4" checked={edit.is_active} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} />Visible to employees</label></div>
        </div>
      </Modal>}
      <Confirm open={!!del} onClose={() => setDel(null)} title="Delete announcement?" message={del?.title ?? ""} confirmLabel="Delete" danger onConfirm={async () => { await run("delete_announcement", { id: del.id }, "Deleted"); setDel(null); reload(); }} />
    </div>
  );
}
