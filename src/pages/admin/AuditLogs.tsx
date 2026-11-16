import { useState } from "react";
import { Button, Card, Empty, Input, PageHeader, Skeleton } from "@/components/ui";
import { useAdmin } from "./common";
import { fmtDateTime } from "@/lib/format";

export default function AuditLogs() {
  const [page, setPage] = useState(0);
  const [q, setQ] = useState("");
  const [applied, setApplied] = useState("");
  const { data, loading } = useAdmin<{ items: any[]; total: number }>("audit_logs", { page, action: applied || undefined });
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / 50));
  return (
    <div>
      <PageHeader title="Audit Logs" text="Every change made in the admin console, plus employee policy views and downloads." />
      <form onSubmit={(e) => { e.preventDefault(); setPage(0); setApplied(q); }} className="flex gap-2 mb-4 max-w-md"><Input placeholder="Filter by action, e.g. publish" value={q} onChange={(e) => setQ(e.target.value)} /><Button type="submit" variant="secondary">Filter</Button></form>
      <Card className="overflow-x-auto">
        {loading && !data ? <Skeleton className="h-64" /> : !data?.items.length ? <Empty title="No log entries" /> :
          <table className="w-full text-sm min-w-[720px]"><thead><tr className="text-left text-xs text-navy-3 border-b"><th className="px-4 py-2">When</th><th>Action</th><th>Entity</th><th>Actor</th><th>Details</th></tr></thead>
            <tbody>{data.items.map((l) => <tr key={l.id} className="border-b border-slate-50 align-top"><td className="px-4 py-2 whitespace-nowrap">{fmtDateTime(l.created_at)}</td><td className="font-semibold">{l.action.replace(/_/g, " ")}</td><td className="text-xs">{l.entity}{l.entity_id ? ` ${String(l.entity_id).slice(0, 8)}` : ""}</td><td className="text-xs">{l.actor}</td><td className="text-xs text-navy-3 max-w-sm truncate">{l.details ? JSON.stringify(l.details) : ""}</td></tr>)}</tbody></table>}
      </Card>
      <div className="flex justify-between items-center mt-3 text-sm"><span className="text-navy-3">Page {page + 1} of {pages}</span><div className="flex gap-2"><Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button><Button size="sm" variant="secondary" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next</Button></div></div>
    </div>
  );
}
