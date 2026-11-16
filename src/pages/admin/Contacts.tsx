import { useState } from "react";
import { Plus, Pencil, Trash2, Star } from "lucide-react";
import { Badge, Button, Card, Confirm, Empty, Field, Input, Modal, PageHeader, Select, Skeleton, Notice } from "@/components/ui";
import { useAdmin, run } from "./common";
import { CONTACT_CATEGORIES } from "@/lib/format";

export default function Contacts() {
  const { data, loading, reload } = useAdmin<{ contacts: any[] }>("list_contacts");
  const [edit, setEdit] = useState<any>(null);
  const [del, setDel] = useState<any>(null);
  const list = data?.contacts ?? [];
  const missing = Object.keys(CONTACT_CATEGORIES).filter((c) => !list.some((x) => x.escalation_category === c && x.is_active));
  return (
    <div>
      <PageHeader title="Contact Directory" text="Who employees are directed to when the assistant can't answer reliably, or when a calculator isn't available. Never shown with invented numbers: leave a field blank until you have it."
        actions={<Button onClick={() => setEdit({ name: "", phone: "", email: "", department: "", escalation_category: "general_hr", availability: "", is_default: false, is_active: true })}><Plus className="h-4 w-4" />Add contact</Button>} />
      {missing.length > 0 && <div className="mb-4"><Notice>No dedicated contact for: {missing.map((m) => CONTACT_CATEGORIES[m]).join(", ")}. These fall back to the default contact.</Notice></div>}
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {loading && !data ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-40" />) : list.length === 0 ? <Card className="md:col-span-3"><Empty title="No contacts yet" /></Card>
          : list.map((c) => (
            <Card key={c.id} className="p-5">
              <div className="flex justify-between"><Badge tone="orange">{CONTACT_CATEGORIES[c.escalation_category]}</Badge><div className="flex gap-1">{c.is_default && <Badge tone="navy"><Star className="h-3 w-3" />Default</Badge>}{!c.is_active && <Badge>inactive</Badge>}</div></div>
              <p className="font-bold text-lg mt-2">{c.name}</p>
              <p className="text-sm text-navy-3">{c.department ?? "—"}{c.availability ? ` · ${c.availability}` : ""}</p>
              <p className="text-sm mt-2">{c.phone ?? <span className="text-amber-700">Phone not set</span>}</p><p className="text-sm">{c.email ?? <span className="text-navy-3">Email not set</span>}</p>
              <div className="flex gap-2 mt-3"><Button size="sm" variant="secondary" onClick={() => setEdit({ ...c })}><Pencil className="h-4 w-4" />Edit</Button><Button size="sm" variant="ghost" aria-label="Delete" onClick={() => setDel(c)}><Trash2 className="h-4 w-4" /></Button></div>
            </Card>))}
      </div>
      {edit && <Modal open onClose={() => setEdit(null)} title={edit.id ? "Edit contact" : "Add contact"} footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button onClick={async () => { if (await run("upsert_contact", edit, "Contact saved")) { setEdit(null); reload(); } }}>Save contact</Button></>}>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Contact name" className="sm:col-span-2"><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
          <Field label="Contact number"><Input value={edit.phone ?? ""} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></Field>
          <Field label="Email"><Input type="email" value={edit.email ?? ""} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></Field>
          <Field label="Department"><Input value={edit.department ?? ""} onChange={(e) => setEdit({ ...edit, department: e.target.value })} /></Field>
          <Field label="Escalation category"><Select value={edit.escalation_category} onChange={(e) => setEdit({ ...edit, escalation_category: e.target.value })}>{Object.entries(CONTACT_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          <Field label="Availability" className="sm:col-span-2"><Input placeholder="e.g. Mon–Sat, 10 am – 7 pm" value={edit.availability ?? ""} onChange={(e) => setEdit({ ...edit, availability: e.target.value })} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-brand h-4 w-4" checked={edit.is_default} onChange={(e) => setEdit({ ...edit, is_default: e.target.checked })} />Default fallback contact</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-brand h-4 w-4" checked={edit.is_active} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} />Active</label>
        </div>
      </Modal>}
      <Confirm open={!!del} onClose={() => setDel(null)} title="Delete contact?" message={`${del?.name} will no longer be shown to employees.`} confirmLabel="Delete" danger onConfirm={async () => { await run("delete_contact", { id: del.id }, "Contact deleted"); setDel(null); reload(); }} />
    </div>
  );
}
