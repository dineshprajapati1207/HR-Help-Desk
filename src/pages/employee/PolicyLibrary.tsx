import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";
import { Card, Empty, Input, PageHeader, Select, Skeleton, NotConfigured } from "@/components/ui";
import { view } from "@/lib/api";
import { configured } from "@/lib/supabase";
import { policyColor, versionOf } from "@/lib/policyColors";
import { CATEGORIES } from "@/lib/format";

export default function PolicyLibrary() {
  const [params, setParams] = useSearchParams();
  const [policies, setPolicies] = useState<any[] | null>(null);
  const [q, setQ] = useState("");
  const cat = params.get("category") ?? "";
  useEffect(() => { if (!configured) { setPolicies([]); return; } view("public_policies", (x) => x.order("name")).then(setPolicies).catch(() => setPolicies([])); }, []);
  const list = useMemo(() => (policies ?? []).filter((p) => (!cat || p.category === cat) && (!q || `${p.name} ${p.description ?? ""} ${p.category}`.toLowerCase().includes(q.toLowerCase()))), [policies, cat, q]);
  if (params.get("open")) return <Navigate to={`/policy/${params.get("open")}`} replace />;
  return (
    <div>
      {!configured && <div className="mb-4"><NotConfigured /></div>}
      <PageHeader title="All policies" text="Open a policy to see its questions and answers, or type your own question." />
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1"><Search className="h-4 w-4 absolute left-3 top-3 text-slate-400" /><Input className="pl-9" placeholder="Search policies" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Select className="sm:w-64" value={cat} onChange={(e) => { if (e.target.value) params.set("category", e.target.value); else params.delete("category"); setParams(params); }}><option value="">All categories</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select>
      </div>
      {policies === null ? <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
        : list.length === 0 ? <Card><Empty title={policies.length ? "No policies match your search" : "No policies published yet"} text={policies.length ? "Try a different word or category." : "Policies appear here after HR uploads and approves them."} /></Card>
        : <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{list.map((p) => (
          <Link key={p.id} to={`/policy/${p.id}`} className="rounded-xl bg-white border border-slate-200 border-t-[3px] p-4 min-h-[92px] flex flex-col justify-between hover:shadow-md transition" style={{ borderTopColor: policyColor(p.name).main }}>
            <p className="font-bold text-[15px] leading-snug">{p.name}</p><p className="text-xs text-navy-3 mt-2">{p.faq_count} questions · {versionOf(p)}</p>
          </Link>))}</div>}
    </div>
  );
}
