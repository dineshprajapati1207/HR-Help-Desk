import { useState } from "react";
import { toast } from "sonner";
import { Plus, Copy, Upload } from "lucide-react";
import { Badge, Button, Card, Empty, Field, Input, Modal, Notice, PageHeader, Select, Skeleton, Tabs, Textarea, statusTone } from "@/components/ui";
import { useAdmin, run, DateFilter, rangeToPayload, type Range } from "./common";
import { fmtDate, fmtDateTime, inr } from "@/lib/format";

export default function Calculators() {
  const [tab, setTab] = useState("pl");
  const { data, loading, reload } = useAdmin<{ calculator: any[]; tax: any[]; pf: any[] }>("list_calc_rules");
  return (
    <div>
      <PageHeader title="Calculator Management" text="Every calculator uses the published rule version only. Changes are saved as drafts and need approval before employees see them." />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: "pl", label: "PL rules" }, { id: "gratuity", label: "Gratuity rules" }, { id: "tax", label: "Income tax rules" }, { id: "pf", label: "PF rules" }, { id: "disclaimers", label: "Disclaimers" }, { id: "history", label: "Calculation history" }]} />
      {loading && !data ? <Skeleton className="h-64" /> : data && <>
        {tab === "pl" && <ConfigRules calc="pl" rows={data.calculator} reload={reload} fields={[["max_pl_days", "Maximum PL days counted", "number"], ["divisor_options", "Divisor options (comma separated)", "list"], ["default_divisor", "Default divisor", "number"], ["rounding", "Rounding", "rounding"]]} />}
        {tab === "gratuity" && <ConfigRules calc="gratuity" rows={data.calculator} reload={reload} fields={[["multiplier", "Days of wages per year (multiplier)", "number"], ["divisor", "Divisor (working days)", "number"], ["cap", "Maximum gratuity (₹)", "number"], ["eligibility_years", "Eligibility: years", "number"], ["eligibility_extra_days", "Eligibility: additional days", "number"], ["partial_year_months_threshold", "Part-year counts as a full year when more than (months)", "number"], ["rounding", "Rounding", "rounding"]]} />}
        {tab === "tax" && <TaxRules rows={data.tax} reload={reload} />}
        {tab === "pf" && <PfRules rows={data.pf} reload={reload} />}
        {tab === "disclaimers" && <Disclaimers rows={data.calculator} reload={reload} />}
        {tab === "history" && <CalcHistory />}
      </>}
    </div>
  );
}

const RuleStatus = ({ r }: { r: any }) => <Badge tone={statusTone(r.status)}>{r.status}</Badge>;

function ConfigRules({ calc, rows, reload, fields }: { calc: string; rows: any[]; reload: () => void; fields: [string, string, string][] }) {
  const list = rows.filter((r) => r.calculator === calc);
  const pub = list.find((r) => r.status === "published");
  const [form, setForm] = useState<any>(null);
  const start = () => setForm({ config: { ...(pub?.config ?? {}) }, notes: "", effective_from: "" });
  const save = async () => {
    const cfg: any = {};
    for (const [k, , t] of fields) { const v = form.config[k]; cfg[k] = t === "number" ? Number(v) : t === "list" ? String(v).split(",").map((x: string) => Number(x.trim())).filter(Boolean) : v; if (t === "number" && !Number.isFinite(cfg[k])) return toast.error(`Enter a number for "${k}"`); }
    if (await run("save_calc_rule", { calculator: calc, config: cfg, notes: form.notes, effective_from: form.effective_from }, "Draft saved. Publish it to apply.")) { setForm(null); reload(); }
  };
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button onClick={start}><Plus className="h-4 w-4" />New rule version</Button></div>
      <VersionsTable list={list} render={(r) => fields.map(([k, l]) => <div key={k} className="text-xs"><span className="text-navy-3">{l}: </span><b>{Array.isArray(r.config[k]) ? r.config[k].join(", ") : String(r.config[k] ?? "—")}</b></div>)}
        onPublish={async (r) => { await run("publish_calc_rule", { id: r.id }, "Rule published"); reload(); }} onDeactivate={async (r) => { await run("deactivate_calc_rule", { id: r.id }, "Rule deactivated"); reload(); }} />
      {form && <Modal open onClose={() => setForm(null)} title="New rule version" footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button onClick={save}>Save draft</Button></>}>
        <div className="space-y-3">
          {fields.map(([k, l, t]) => <Field key={k} label={l}>{t === "rounding"
            ? <Select value={form.config[k] ?? "round"} onChange={(e) => setForm({ ...form, config: { ...form.config, [k]: e.target.value } })}><option value="round">Round to nearest rupee</option><option value="floor">Round down</option><option value="ceil">Round up</option><option value="none">No rounding</option></Select>
            : <Input value={Array.isArray(form.config[k]) ? form.config[k].join(", ") : form.config[k] ?? ""} onChange={(e) => setForm({ ...form, config: { ...form.config, [k]: e.target.value } })} />}</Field>)}
          <Field label="Effective from"><Input type="date" value={form.effective_from} onChange={(e) => setForm({ ...form, effective_from: e.target.value })} /></Field>
          <Field label="Change notes"><Textarea className="min-h-[60px]" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        </div>
      </Modal>}
    </div>
  );
}

function VersionsTable({ list, render, onPublish, onDeactivate, extra }: { list: any[]; render: (r: any) => React.ReactNode; onPublish: (r: any) => void; onDeactivate: (r: any) => void; extra?: (r: any) => React.ReactNode }) {
  if (!list.length) return <Card><Empty title="No rule versions yet" /></Card>;
  return (
    <div className="space-y-3">{list.map((r) => (
      <Card key={r.id} className="p-4 flex flex-col md:flex-row gap-4">
        <div className="md:w-48 shrink-0"><p className="font-bold">Version {r.version} <RuleStatus r={r} /></p><p className="text-xs text-navy-3 mt-1">Created {fmtDateTime(r.created_at)}</p>{r.effective_from && <p className="text-xs text-navy-3">Effective {fmtDate(r.effective_from)}</p>}{r.approved_at && <p className="text-xs text-navy-3">Approved {fmtDate(r.approved_at)}</p>}{r.notes && <p className="text-xs mt-1">{r.notes}</p>}</div>
        <div className="flex-1 grid sm:grid-cols-2 gap-x-6 gap-y-1">{render(r)}</div>
        <div className="flex md:flex-col gap-2 shrink-0">{extra?.(r)}{r.status !== "published" && <Button size="sm" onClick={() => onPublish(r)}>Approve and publish</Button>}{r.status === "published" && <Button size="sm" variant="danger" onClick={() => onDeactivate(r)}>Deactivate</Button>}</div>
      </Card>))}</div>
  );
}

const TAX_TEMPLATE = { standard_deduction: 0, slabs: { below_60: [{ upto: null, rate: 0 }] }, rebate: { income_limit: 0, max_rebate: 0, marginal_relief: false }, surcharge: [], cess_rate: 0, deduction_limits: {}, allowed_deductions: [], employer_nps_limit_pct: 0, hra_exemption: false };

function TaxRules({ rows, reload }: { rows: any[]; reload: () => void }) {
  const [fy, setFy] = useState("");
  const [form, setForm] = useState<any>(null);
  const [pub, setPub] = useState<any>(null);
  const years = [...new Set(rows.map((r) => r.financial_year))];
  const list = rows.filter((r) => !fy || r.financial_year === fy);
  const open = (r?: any) => setForm({ financial_year: r?.financial_year ?? "", regime: r?.regime ?? "new", effective_from: r?.effective_from ?? "", effective_to: r?.effective_to ?? "", source: r?.source ?? "", notes: "", json: JSON.stringify(r?.rules ?? TAX_TEMPLATE, null, 2) });
  const save = async () => {
    let rules; try { rules = JSON.parse(form.json); } catch { return toast.error("The rules JSON is not valid."); }
    if (!/^\d{4}-\d{2}$/.test(form.financial_year)) return toast.error("Financial year must look like 2026-27.");
    if (!rules.slabs || !Object.values(rules.slabs).every((s: any) => Array.isArray(s) && s.length)) return toast.error("Add at least one slab list.");
    if (await run("save_tax_rule", { ...form, rules }, "Draft saved")) { setForm(null); reload(); }
  };
  return (
    <div className="space-y-4">
      <Notice tone="blue">Upload <b>Income Tax calculator Rule.txt</b> in Document Management with type “Income Tax Rules”. PeopleHub reads it into draft rule versions here for you to check, mark as verified and publish.</Notice>
      <div className="flex gap-2 justify-between"><Select className="w-44" value={fy} onChange={(e) => setFy(e.target.value)}><option value="">All years</option>{years.map((y) => <option key={y}>{y}</option>)}</Select><Button onClick={() => open()}><Plus className="h-4 w-4" />Add financial year / rules</Button></div>
      <VersionsTable list={list} onPublish={(r) => setPub(r)} onDeactivate={async (r) => { await run("deactivate_tax_rule", { id: r.id }, "Rules deactivated"); reload(); }}
        extra={(r) => <Button size="sm" variant="secondary" onClick={() => open(r)}><Copy className="h-4 w-4" />Clone and edit</Button>}
        render={(r) => <>
          <div className="text-xs sm:col-span-2 mb-1"><b>FY {r.financial_year}, {r.regime} regime</b> · {r.verified ? <Badge tone="green">verified {fmtDate(r.verified_at)}</Badge> : <Badge tone="amber">unverified</Badge>}{r.source && <span className="text-navy-3"> · source: {r.source}</span>}</div>
          <div className="text-xs"><span className="text-navy-3">Standard deduction: </span><b>{inr(r.rules.standard_deduction)}</b></div>
          <div className="text-xs"><span className="text-navy-3">Rebate: </span><b>{r.rules.rebate ? `${inr(r.rules.rebate.max_rebate)} up to ${inr(r.rules.rebate.income_limit)}` : "—"}</b></div>
          <div className="text-xs"><span className="text-navy-3">Cess: </span><b>{r.rules.cess_rate}%</b></div>
          <div className="text-xs sm:col-span-2"><span className="text-navy-3">Slabs: </span>{(Object.values(r.rules.slabs)[0] as any[]).map((s) => `${s.upto ? "≤" + inr(s.upto) : "above"} ${s.rate}%`).join(", ")}</div>
        </>} />
      {form && <Modal open wide onClose={() => setForm(null)} title="Tax rule draft" footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button onClick={save}>Save draft</Button></>}>
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="Financial year"><Input placeholder="2026-27" value={form.financial_year} onChange={(e) => setForm({ ...form, financial_year: e.target.value })} /></Field>
          <Field label="Regime"><Select value={form.regime} onChange={(e) => setForm({ ...form, regime: e.target.value })}><option value="new">New</option><option value="old">Old</option></Select></Field>
          <Field label="Source"><Input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} /></Field>
          <Field label="Effective from"><Input type="date" value={form.effective_from ?? ""} onChange={(e) => setForm({ ...form, effective_from: e.target.value })} /></Field>
          <Field label="Effective to"><Input type="date" value={form.effective_to ?? ""} onChange={(e) => setForm({ ...form, effective_to: e.target.value })} /></Field>
          <Field label="Notes"><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        </div>
        <Field className="mt-3" label="Rules" hint="Slab keys: below_60, 60_to_80, above_80. 'upto' is the slab's upper limit in rupees (null for the top slab). Deduction keys: 80c, 80d, nps_80ccd1b, home_loan_interest_24b, employer_nps_80ccd2, other.">
          <Textarea className="min-h-[340px] font-mono text-xs" value={form.json} onChange={(e) => setForm({ ...form, json: e.target.value })} /></Field>
      </Modal>}
      {pub && <Modal open onClose={() => setPub(null)} title="Publish tax rules" footer={<><Button variant="secondary" onClick={() => setPub(null)}>Cancel</Button>
        <Button variant="secondary" onClick={async () => { await run("publish_tax_rule", { id: pub.id, verified: false }, "Published as unverified"); setPub(null); reload(); }}>Publish unverified</Button>
        <Button onClick={async () => { await run("publish_tax_rule", { id: pub.id, verified: true }, "Published and verified"); setPub(null); reload(); }}>Verified, publish</Button></>}>
        <p className="text-sm">Publishing FY {pub.financial_year} ({pub.regime} regime) v{pub.version} replaces the current published version. Mark it verified only after checking every value against the official source. Unverified rules show a warning to employees.</p>
      </Modal>}
    </div>
  );
}

const PF_TEMPLATE = { employee_rate: null, employer_rate: null, eps_rate: null, wage_ceiling: null, eps_wage_ceiling: null, apply_ceiling_to_employee: true, apply_ceiling_to_employer: true, include_da: true, voluntary_pf_allowed: true, rounding: "round" };

function PfRules({ rows, reload }: { rows: any[]; reload: () => void }) {
  const [form, setForm] = useState<any>(null);
  const [pub, setPub] = useState<any>(null);
  const save = async () => {
    let rules; try { rules = JSON.parse(form.json); } catch { return toast.error("The rules JSON is not valid."); }
    if (typeof rules.employee_rate !== "number" || typeof rules.employer_rate !== "number") return toast.error("employee_rate and employer_rate must be numbers.");
    if (await run("save_pf_rule", { rules, source: form.source, effective_from: form.effective_from, notes: form.notes }, "Draft saved")) { setForm(null); reload(); }
  };
  return (
    <div className="space-y-4">
      {!rows.some((r) => r.status === "published") && <Notice>No PF rules are published, so the employee PF calculator is switched off and shows the PF/Payroll contact instead.</Notice>}
      <div className="flex justify-end gap-2"><Button onClick={() => setForm({ json: JSON.stringify(rows[0]?.rules ?? PF_TEMPLATE, null, 2), source: "", effective_from: "", notes: "" })}><Plus className="h-4 w-4" />New PF rule version</Button></div>
      <p className="text-xs text-navy-3 flex items-center gap-1"><Upload className="h-3.5 w-3.5" />You can also upload a PF rule document in Document Management with type “PF Rules”.</p>
      <VersionsTable list={rows} onPublish={(r) => setPub(r)} onDeactivate={async (r) => { await run("deactivate_pf_rule", { id: r.id }, "Deactivated"); reload(); }}
        render={(r) => <>{Object.entries(r.rules).map(([k, v]) => <div key={k} className="text-xs"><span className="text-navy-3">{k}: </span><b>{String(v)}</b></div>)}<div className="text-xs">{r.verified ? <Badge tone="green">verified</Badge> : <Badge tone="amber">unverified</Badge>}</div></>} />
      {form && <Modal open wide onClose={() => setForm(null)} title="PF rule draft" footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button onClick={save}>Save draft</Button></>}>
        <div className="grid sm:grid-cols-3 gap-3"><Field label="Source"><Input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} /></Field><Field label="Effective from"><Input type="date" value={form.effective_from} onChange={(e) => setForm({ ...form, effective_from: e.target.value })} /></Field><Field label="Notes"><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field></div>
        <Field className="mt-3" label="Rules" hint="Rates are percentages; ceilings in rupees per month. Fill in the values from Petpooja's approved PF policy."><Textarea className="min-h-[260px] font-mono text-xs" value={form.json} onChange={(e) => setForm({ ...form, json: e.target.value })} /></Field>
      </Modal>}
      {pub && <Modal open onClose={() => setPub(null)} title="Publish PF rules" footer={<><Button variant="secondary" onClick={() => setPub(null)}>Cancel</Button><Button variant="secondary" onClick={async () => { await run("publish_pf_rule", { id: pub.id, verified: false }, "Published"); setPub(null); reload(); }}>Publish unverified</Button><Button onClick={async () => { await run("publish_pf_rule", { id: pub.id, verified: true }, "Published and verified"); setPub(null); reload(); }}>Verified, publish</Button></>}>
        <p className="text-sm">Publishing switches on the employee PF calculator with these rules.</p></Modal>}
    </div>
  );
}

function Disclaimers({ rows, reload }: { rows: any[]; reload: () => void }) {
  const kinds = [["disclaimer_pl_gratuity", "PL & Gratuity disclaimer"], ["disclaimer_tax", "Income Tax disclaimer"], ["disclaimer_pf", "PF disclaimer"]];
  const [text, setText] = useState<Record<string, string>>({});
  return (
    <div className="space-y-4">
      <Notice tone="blue">Disclaimers are shown to employees word for word once approved. PeopleHub never writes a disclaimer on its own.</Notice>
      {kinds.map(([k, label]) => {
        const list = rows.filter((r) => r.calculator === k); const pub = list.find((r) => r.status === "published"); const draft = list.find((r) => r.status === "draft");
        return (
          <Card key={k} className="p-5">
            <div className="flex justify-between items-center mb-2"><p className="font-bold">{label}</p>{pub ? <Badge tone="green">published v{pub.version}</Badge> : <Badge>not set</Badge>}</div>
            {pub && <p className="text-sm whitespace-pre-wrap bg-paper rounded-lg p-3 mb-3">{pub.config.text}</p>}
            <Textarea placeholder="Enter the approved disclaimer text" value={text[k] ?? draft?.config.text ?? ""} onChange={(e) => setText({ ...text, [k]: e.target.value })} />
            <div className="flex gap-2 mt-3">
              <Button variant="secondary" onClick={async () => { const t = (text[k] ?? draft?.config.text ?? "").trim(); if (!t) return toast.error("Enter the disclaimer text first."); await run("save_calc_rule", { calculator: k, config: { text: t } }, "Draft saved"); reload(); }}>Save draft</Button>
              {draft && <Button onClick={async () => { await run("publish_calc_rule", { id: draft.id }, "Disclaimer published"); reload(); }}>Approve and publish draft v{draft.version}</Button>}
              {pub && <Button variant="danger" onClick={async () => { await run("deactivate_calc_rule", { id: pub.id }, "Disclaimer removed"); reload(); }}>Remove</Button>}
            </div>
          </Card>);
      })}
    </div>
  );
}

function CalcHistory() {
  const [range, setRange] = useState<Range>({ preset: "30" });
  const { data, loading } = useAdmin<{ items: any[] }>("calc_history", rangeToPayload(range));
  return (
    <div>
      <div className="flex justify-end mb-3"><DateFilter value={range} onChange={setRange} /></div>
      <Card className="overflow-x-auto">
        {loading && !data ? <Skeleton className="h-32" /> : !data?.items.length ? <Empty title="No calculations in this period" /> :
          <table className="w-full text-sm min-w-[600px]"><thead><tr className="text-left text-xs text-navy-3 border-b"><th className="px-4 py-2">When</th><th>Calculator</th><th>Department</th><th>Rule version</th><th>Result</th></tr></thead>
            <tbody>{data.items.map((i) => <tr key={i.id} className="border-b border-slate-50"><td className="px-4 py-2">{fmtDateTime(i.created_at)}</td><td>{i.calculator.replace("_", " ")}</td><td>{i.department ?? "—"}</td><td className="text-xs">{i.rule_version_ref}</td><td className="text-xs">{Object.entries(i.outputs ?? {}).map(([k, v]) => `${k}: ${typeof v === "number" ? inr(v) : String(v)}`).join(", ")}</td></tr>)}</tbody></table>}
      </Card>
    </div>
  );
}
